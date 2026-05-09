//! Hello/Welcome handshake integration tests.
//!
//! Drives the real axum server over a real WebSocket and validates the
//! observable protocol: version checks, BadHello, Welcome shape, session
//! UUIDs, server timestamp.

mod common;

use std::time::Duration;

use bincode::Options;
use common::{decode_server, encode_client, hello, test_config, Client, TestServer};
use futures_util::SinkExt;
use rainboids_server::protocol::{ClientMsg, ErrCode, ServerMsg, SIM_VERSION, WIRE_VERSION};
use tokio_tungstenite::tungstenite::Message as WsMessage;

#[tokio::test]
async fn welcome_after_valid_hello() {
    let server = TestServer::start(test_config()).await;
    let mut c = Client::connect(&server.url).await;
    c.send(&hello("Pilot", None)).await;

    match c.recv().await {
        ServerMsg::Welcome {
            player_id,
            session,
            server_t_ms,
        } => {
            assert!(player_id.0 > 0, "player_id must be non-zero");
            assert!(!session.is_nil(), "session must be a real UUID");
            assert!(server_t_ms > 0, "server_t_ms must be populated");
        }
        other => panic!("expected Welcome, got {:?}", other),
    }
    server.shutdown().await;
}

#[tokio::test]
async fn version_mismatch_rejects() {
    let server = TestServer::start(test_config()).await;
    let mut c = Client::connect(&server.url).await;
    c.send(&ClientMsg::Hello {
        wire_version: 99, // wrong
        sim_version: SIM_VERSION,
        client_version: "future".into(),
        display_name: "Pilot".into(),
        session: None,
    })
    .await;

    match c.recv().await {
        ServerMsg::Error { code, msg } => {
            assert_eq!(code, ErrCode::Version);
            assert!(msg.contains(&format!("v{}/{}", WIRE_VERSION, SIM_VERSION)));
        }
        other => panic!("expected Error::Version, got {:?}", other),
    }
    server.shutdown().await;
}

#[tokio::test]
async fn non_hello_first_message_is_bad_hello() {
    let server = TestServer::start(test_config()).await;
    let mut c = Client::connect(&server.url).await;
    // Skip the Hello — go straight to QuickMatch.
    c.send(&ClientMsg::QuickMatch).await;

    match c.recv().await {
        ServerMsg::Error { code, .. } => assert_eq!(code, ErrCode::BadHello),
        other => panic!("expected Error::BadHello, got {:?}", other),
    }
    server.shutdown().await;
}

#[tokio::test]
async fn hello_timeout_closes_socket() {
    let server = TestServer::start(test_config()).await;
    let mut c = Client::connect(&server.url).await;
    // Don't send anything. Server's HELLO_TIMEOUT is 3s; give it 4s and
    // confirm the socket closes.
    let result = tokio::time::timeout(Duration::from_secs(5), async {
        loop {
            match futures_util::StreamExt::next(&mut c.ws).await {
                Some(Ok(WsMessage::Close(_))) | None => return Ok::<(), ()>(()),
                Some(Ok(_)) => continue,
                Some(Err(_)) => return Ok(()),
            }
        }
    })
    .await;
    assert!(result.is_ok(), "server did not close after Hello timeout");
    server.shutdown().await;
}

#[tokio::test]
async fn malformed_first_frame_treated_as_eof() {
    let server = TestServer::start(test_config()).await;
    let mut c = Client::connect(&server.url).await;
    // Send a non-decodeable binary frame as the "Hello".
    c.ws
        .send(WsMessage::Binary(vec![0xff, 0xff, 0xff, 0xff, 0xff]))
        .await
        .unwrap();
    // Server should close the socket without a Welcome.
    let res = tokio::time::timeout(Duration::from_secs(3), async {
        loop {
            match futures_util::StreamExt::next(&mut c.ws).await {
                Some(Ok(WsMessage::Binary(_))) => return false, // unexpected msg
                Some(Ok(WsMessage::Close(_))) | None => return true,
                Some(Ok(_)) => continue,
                Some(Err(_)) => return true,
            }
        }
    })
    .await;
    assert!(res.unwrap_or(false), "expected socket close on bad hello");
    server.shutdown().await;
}

#[tokio::test]
async fn welcome_bytes_match_round_trip() {
    // Sanity check that the Welcome the server emits over the wire round-
    // trips back through the JS-bound codec. Catches accidental layout
    // drift between the encoder used in connection.rs and the spec.
    let server = TestServer::start(test_config()).await;
    let mut c = Client::connect(&server.url).await;
    c.send(&hello("Pilot", None)).await;
    let frame = futures_util::StreamExt::next(&mut c.ws)
        .await
        .expect("frame")
        .expect("ok");
    let buf = match frame {
        WsMessage::Binary(b) => b,
        other => panic!("expected binary, got {:?}", other),
    };
    // Decode via the canonical codec.
    let msg = decode_server(&buf);
    assert!(matches!(msg, ServerMsg::Welcome { .. }));
    // Re-encode and confirm bit-exact equality.
    let opts = bincode::DefaultOptions::new()
        .with_fixint_encoding()
        .with_little_endian();
    let re = opts.serialize(&msg).unwrap();
    assert_eq!(re, buf, "Welcome wire bytes did not round-trip");
    let _ = encode_client; // keep helper exported / silence dead-code
    server.shutdown().await;
}
