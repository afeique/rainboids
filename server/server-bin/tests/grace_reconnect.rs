//! Grace timer + reconnect-by-session integration tests.
//!
//! Validates that a player who drops within grace can reattach with the
//! UUID issued in their original Welcome, and that grace expiry deletes
//! the slot so a stale session has to mint a fresh player_id.

mod common;

use std::time::Duration;

use common::{hello, test_config, Client, TestServer};
use rainboids_server::protocol::{ClientMsg, ServerMsg};

async fn welcome(c: &mut Client) -> (uuid::Uuid, rainboids_server::util::id::PlayerId) {
    match c.recv().await {
        ServerMsg::Welcome {
            player_id, session, ..
        } => (session, player_id),
        other => panic!("expected Welcome, got {:?}", other),
    }
}

#[tokio::test]
async fn reconnect_within_grace_reattaches_to_same_room() {
    let server = TestServer::start(test_config()).await;

    // Initial connect.
    let mut alice = Client::connect(&server.url).await;
    alice.send(&hello("Alice", None)).await;
    let (session1, player_id1) = welcome(&mut alice).await;

    alice
        .send(&ClientMsg::CreateRoom {
            name: "reconnect-test".into(),
            public: true,
            max_players: 4,
        })
        .await;
    let (room_id, code) = match alice.recv().await {
        ServerMsg::RoomJoined { room_id, code, .. } => (room_id, code),
        other => panic!("expected RoomJoined, got {:?}", other),
    };

    // Drop the connection. The connection task should register the session.
    alice.close().await;

    // Wait for the disconnect to be observed by the server (the grace timer
    // is keyed off it). Allow a brief window for the session to be registered.
    let mut waited = 0;
    while server.sessions.len() == 0 && waited < 20 {
        tokio::time::sleep(Duration::from_millis(50)).await;
        waited += 1;
    }
    assert_eq!(server.sessions.len(), 1, "session must be registered on drop");

    // Reconnect with the original session UUID.
    let mut alice2 = Client::connect(&server.url).await;
    alice2.send(&hello("Alice", Some(session1))).await;
    let (session2, player_id2) = welcome(&mut alice2).await;

    // player_id is preserved across reattach; session is rotated for the
    // *next* potential disconnect cycle.
    assert_eq!(
        player_id1, player_id2,
        "reattach must reuse the original player_id"
    );
    assert_ne!(
        session1, session2,
        "Welcome should issue a fresh session uuid after reattach"
    );

    // The next message should be a RoomJoined echoing the original room.
    match alice2
        .recv_until(|m| matches!(m, ServerMsg::RoomJoined { .. }))
        .await
    {
        ServerMsg::RoomJoined {
            room_id: r,
            code: c,
            slot,
            ..
        } => {
            assert_eq!(r, room_id, "reattach must land in the same room");
            assert_eq!(c, code);
            assert_eq!(slot, 0);
        }
        _ => unreachable!(),
    }

    // The session registry should now be empty — entry was consumed.
    assert_eq!(server.sessions.len(), 0);
    server.shutdown().await;
}

#[tokio::test]
async fn reconnect_after_grace_expiry_mints_fresh_player() {
    let mut cfg = test_config();
    cfg.grace_secs = 1; // already 1 in test_config but be explicit
    let server = TestServer::start(cfg).await;

    let mut alice = Client::connect(&server.url).await;
    alice.send(&hello("Alice", None)).await;
    let (session1, player_id1) = welcome(&mut alice).await;
    alice
        .send(&ClientMsg::CreateRoom {
            name: "expire-test".into(),
            public: true,
            max_players: 4,
        })
        .await;
    let _ = alice
        .recv_until(|m| matches!(m, ServerMsg::RoomJoined { .. }))
        .await;
    alice.close().await;

    // Wait past the grace deadline (1 s + buffer) so the room actor reaps
    // the slot and the registry's expires_at_ms passes.
    tokio::time::sleep(Duration::from_secs(2)).await;

    let mut alice2 = Client::connect(&server.url).await;
    alice2.send(&hello("Alice", Some(session1))).await;
    let (_, player_id2) = welcome(&mut alice2).await;

    assert_ne!(
        player_id1, player_id2,
        "post-grace reconnect must mint a fresh player_id"
    );

    // No RoomJoined should follow because there's no slot to reattach to.
    let next = tokio::time::timeout(
        Duration::from_millis(300),
        alice2.recv_until(|m| matches!(m, ServerMsg::RoomJoined { .. })),
    )
    .await;
    assert!(
        next.is_err(),
        "no RoomJoined expected after grace expiry; the player must rejoin via matchmaking"
    );
    server.shutdown().await;
}

#[tokio::test]
async fn unknown_session_uuid_is_treated_as_fresh() {
    let server = TestServer::start(test_config()).await;
    let bogus = uuid::Uuid::new_v4();

    let mut c = Client::connect(&server.url).await;
    c.send(&hello("Alice", Some(bogus))).await;
    match c.recv().await {
        ServerMsg::Welcome { session, .. } => {
            assert_ne!(session, bogus, "server must issue its own UUID");
        }
        other => panic!("expected Welcome, got {:?}", other),
    }
    server.shutdown().await;
}

#[tokio::test]
async fn second_disconnect_re_registers_with_fresh_session() {
    // Verifies the session-rotation invariant: after reattach, a *second*
    // disconnect re-registers under the new UUID issued on the prior
    // Welcome — not the one originally presented.
    let server = TestServer::start(test_config()).await;

    let mut alice = Client::connect(&server.url).await;
    alice.send(&hello("Alice", None)).await;
    let (s1, _) = welcome(&mut alice).await;
    alice
        .send(&ClientMsg::CreateRoom {
            name: "rotate".into(),
            public: true,
            max_players: 4,
        })
        .await;
    let _ = alice
        .recv_until(|m| matches!(m, ServerMsg::RoomJoined { .. }))
        .await;
    alice.close().await;

    let mut waited = 0;
    while server.sessions.len() == 0 && waited < 20 {
        tokio::time::sleep(Duration::from_millis(50)).await;
        waited += 1;
    }

    // First reconnect: present s1.
    let mut alice2 = Client::connect(&server.url).await;
    alice2.send(&hello("Alice", Some(s1))).await;
    let (s2, _) = welcome(&mut alice2).await;
    let _ = alice2
        .recv_until(|m| matches!(m, ServerMsg::RoomJoined { .. }))
        .await;
    alice2.close().await;

    // Second drop registers a new entry keyed by s2 (not s1).
    waited = 0;
    while server.sessions.len() == 0 && waited < 20 {
        tokio::time::sleep(Duration::from_millis(50)).await;
        waited += 1;
    }

    // Presenting s1 must NOT re-attach (s1 was consumed by the first reconnect).
    let mut imposter = Client::connect(&server.url).await;
    imposter.send(&hello("Alice", Some(s1))).await;
    let _ = welcome(&mut imposter).await;
    let next = tokio::time::timeout(
        Duration::from_millis(200),
        imposter.recv_until(|m| matches!(m, ServerMsg::RoomJoined { .. })),
    )
    .await;
    assert!(
        next.is_err(),
        "stale session UUID must not reattach"
    );

    // s2 still works.
    let mut alice3 = Client::connect(&server.url).await;
    alice3.send(&hello("Alice", Some(s2))).await;
    let _ = welcome(&mut alice3).await;
    match alice3
        .recv_until(|m| matches!(m, ServerMsg::RoomJoined { .. }))
        .await
    {
        ServerMsg::RoomJoined { .. } => {}
        _ => unreachable!(),
    }
    server.shutdown().await;
}
