//! Room lifecycle integration tests: create, join, peer events, leave,
//! quick-match reuse, capacity limits.

mod common;

use common::{hello, test_config, Client, TestServer};
use rainboids_server::protocol::{ClientMsg, ErrCode, LeaveReason, ServerMsg};

async fn connect_and_welcome(server: &TestServer, name: &str) -> Client {
    let mut c = Client::connect(&server.url).await;
    c.send(&hello(name, None)).await;
    match c.recv().await {
        ServerMsg::Welcome { .. } => c,
        other => panic!("expected Welcome, got {:?}", other),
    }
}

#[tokio::test]
async fn create_room_yields_room_joined() {
    let server = TestServer::start(test_config()).await;
    let mut a = connect_and_welcome(&server, "Alice").await;

    a.send(&ClientMsg::CreateRoom {
        name: "Test Lobby".into(),
        public: true,
        max_players: 4,
    })
    .await;

    let msg = a.recv().await;
    match msg {
        ServerMsg::RoomJoined {
            slot, peers, code, wave, ..
        } => {
            assert_eq!(slot, 0);
            assert!(peers.is_empty(), "first joiner has no peers");
            assert_eq!(code.len(), 6, "code is 6 chars");
            assert_eq!(wave, 0);
        }
        other => panic!("expected RoomJoined, got {:?}", other),
    }
    server.shutdown().await;
}

#[tokio::test]
async fn second_player_joins_by_code_and_first_sees_peer() {
    let server = TestServer::start(test_config()).await;
    let mut a = connect_and_welcome(&server, "Alice").await;
    let mut b = connect_and_welcome(&server, "Bob").await;

    a.send(&ClientMsg::CreateRoom {
        name: "Co-op".into(),
        public: false,
        max_players: 4,
    })
    .await;
    let code = match a.recv().await {
        ServerMsg::RoomJoined { code, .. } => code,
        other => panic!("expected RoomJoined, got {:?}", other),
    };

    b.send(&ClientMsg::JoinRoomByCode { code: code.clone() })
        .await;
    match b.recv().await {
        ServerMsg::RoomJoined {
            slot, peers, code: c, ..
        } => {
            assert_eq!(slot, 1);
            assert_eq!(peers.len(), 1, "Bob sees Alice");
            assert_eq!(peers[0].slot, 0);
            assert_eq!(peers[0].display_name, "Alice");
            assert_eq!(c, code);
        }
        other => panic!("expected RoomJoined for Bob, got {:?}", other),
    }

    // Alice now sees a PeerJoined event.
    let peer = a
        .recv_until(|m| matches!(m, ServerMsg::PeerJoined { .. }))
        .await;
    match peer {
        ServerMsg::PeerJoined { slot, peer } => {
            assert_eq!(slot, 1);
            assert_eq!(peer.display_name, "Bob");
        }
        _ => unreachable!(),
    }
    server.shutdown().await;
}

#[tokio::test]
async fn join_by_code_lowercase_is_normalized() {
    let server = TestServer::start(test_config()).await;
    let mut a = connect_and_welcome(&server, "Alice").await;
    let mut b = connect_and_welcome(&server, "Bob").await;

    a.send(&ClientMsg::CreateRoom {
        name: "case test".into(),
        public: false,
        max_players: 4,
    })
    .await;
    let code = match a.recv().await {
        ServerMsg::RoomJoined { code, .. } => code,
        other => panic!("expected RoomJoined, got {:?}", other),
    };
    let lowered = code.to_lowercase();

    b.send(&ClientMsg::JoinRoomByCode { code: lowered }).await;
    match b.recv().await {
        ServerMsg::RoomJoined { .. } => {}
        other => panic!("expected RoomJoined (lowercase normalized), got {:?}", other),
    }
    server.shutdown().await;
}

#[tokio::test]
async fn join_by_invalid_code_returns_not_found() {
    let server = TestServer::start(test_config()).await;
    let mut a = connect_and_welcome(&server, "Alice").await;

    a.send(&ClientMsg::JoinRoomByCode {
        code: "ZZZZZZ".into(),
    })
    .await;
    match a.recv().await {
        ServerMsg::Error { code, .. } => assert_eq!(code, ErrCode::NotFound),
        other => panic!("expected Error::NotFound, got {:?}", other),
    }
    server.shutdown().await;
}

#[tokio::test]
async fn leave_room_yields_room_left_and_peer_left() {
    let server = TestServer::start(test_config()).await;
    let mut a = connect_and_welcome(&server, "Alice").await;
    let mut b = connect_and_welcome(&server, "Bob").await;

    a.send(&ClientMsg::CreateRoom {
        name: "leave test".into(),
        public: true,
        max_players: 4,
    })
    .await;
    let code = match a.recv().await {
        ServerMsg::RoomJoined { code, .. } => code,
        other => panic!("expected RoomJoined, got {:?}", other),
    };

    b.send(&ClientMsg::JoinRoomByCode { code }).await;
    let _ = b.recv().await; // RoomJoined

    // Alice's queue may now have a PeerJoined; drain to it.
    a.recv_until(|m| matches!(m, ServerMsg::PeerJoined { .. }))
        .await;

    b.send(&ClientMsg::LeaveRoom).await;
    match b
        .recv_until(|m| matches!(m, ServerMsg::RoomLeft { .. }))
        .await
    {
        ServerMsg::RoomLeft { reason } => assert_eq!(reason, LeaveReason::Voluntary),
        _ => unreachable!(),
    }

    match a.recv_until(|m| matches!(m, ServerMsg::PeerLeft { .. })).await {
        ServerMsg::PeerLeft { slot, reason } => {
            assert_eq!(slot, 1);
            assert_eq!(reason, LeaveReason::Voluntary);
        }
        _ => unreachable!(),
    }
    server.shutdown().await;
}

#[tokio::test]
async fn full_room_rejects_extra_join_with_error() {
    let mut cfg = test_config();
    cfg.max_players_per_room = 2;
    let server = TestServer::start(cfg).await;

    let mut a = connect_and_welcome(&server, "Alice").await;
    a.send(&ClientMsg::CreateRoom {
        name: "small".into(),
        public: false,
        max_players: 2, // ignored — server uses cfg.max_players_per_room
    })
    .await;
    let code = match a.recv().await {
        ServerMsg::RoomJoined { code, .. } => code,
        other => panic!("expected RoomJoined, got {:?}", other),
    };

    let mut b = connect_and_welcome(&server, "Bob").await;
    b.send(&ClientMsg::JoinRoomByCode { code: code.clone() })
        .await;
    let _ = b.recv().await; // RoomJoined

    let mut c = connect_and_welcome(&server, "Carol").await;
    c.send(&ClientMsg::JoinRoomByCode { code }).await;
    match c.recv_until(|m| matches!(m, ServerMsg::Error { .. })).await {
        ServerMsg::Error { code, .. } => assert_eq!(code, ErrCode::Full),
        _ => unreachable!(),
    }
    server.shutdown().await;
}

#[tokio::test]
async fn quick_match_reuses_existing_public_room() {
    let server = TestServer::start(test_config()).await;
    let mut a = connect_and_welcome(&server, "Alice").await;
    let mut b = connect_and_welcome(&server, "Bob").await;

    a.send(&ClientMsg::QuickMatch).await;
    let room_a = match a.recv().await {
        ServerMsg::RoomJoined { room_id, .. } => room_id,
        other => panic!("expected RoomJoined, got {:?}", other),
    };

    b.send(&ClientMsg::QuickMatch).await;
    let room_b = match b.recv().await {
        ServerMsg::RoomJoined { room_id, .. } => room_id,
        other => panic!("expected RoomJoined, got {:?}", other),
    };

    assert_eq!(room_a, room_b, "quick match should reuse the same public room");
    server.shutdown().await;
}

#[tokio::test]
async fn browse_lists_public_rooms_with_real_player_counts() {
    let server = TestServer::start(test_config()).await;
    let mut a = connect_and_welcome(&server, "Alice").await;

    a.send(&ClientMsg::CreateRoom {
        name: "browse-me".into(),
        public: true,
        max_players: 4,
    })
    .await;
    let _ = a.recv().await; // RoomJoined

    let mut spectator = connect_and_welcome(&server, "Spec").await;
    spectator.send(&ClientMsg::BrowseRooms).await;
    match spectator.recv().await {
        ServerMsg::RoomList { rooms } => {
            assert_eq!(rooms.len(), 1);
            assert_eq!(rooms[0].name, "browse-me");
            assert_eq!(rooms[0].players, 1, "Alice is in the room");
            assert_eq!(rooms[0].max_players, 4);
        }
        other => panic!("expected RoomList, got {:?}", other),
    }
    server.shutdown().await;
}

#[tokio::test]
async fn private_rooms_do_not_show_in_browse() {
    let server = TestServer::start(test_config()).await;
    let mut a = connect_and_welcome(&server, "Alice").await;

    a.send(&ClientMsg::CreateRoom {
        name: "secret".into(),
        public: false,
        max_players: 4,
    })
    .await;
    let _ = a.recv().await;

    let mut spectator = connect_and_welcome(&server, "Spec").await;
    spectator.send(&ClientMsg::BrowseRooms).await;
    match spectator.recv().await {
        ServerMsg::RoomList { rooms } => {
            assert!(rooms.is_empty(), "private rooms must not appear in browse");
        }
        other => panic!("expected RoomList, got {:?}", other),
    }
    server.shutdown().await;
}
