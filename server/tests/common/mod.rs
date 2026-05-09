//! Shared test harness: spin up the axum server on an ephemeral port and
//! drive it through real WebSocket frames via tokio-tungstenite.
//!
//! Tests instantiate `TestServer::start(...)` to get a `ws://127.0.0.1:N/ws`
//! URL plus a `cancel` handle. The harness shuts down on drop.

#![allow(dead_code)] // shared across multiple integration tests; not all use every helper

use std::net::SocketAddr;
use std::sync::Arc;
use std::time::Duration;

use bincode::Options;
use futures_util::{SinkExt, StreamExt};
use tokio::net::TcpListener;
use tokio::sync::oneshot;
use tokio::task::JoinHandle;
use tokio_tungstenite::{
    connect_async,
    tungstenite::{client::IntoClientRequest, Message as WsMessage},
    MaybeTlsStream, WebSocketStream,
};

use rainboids_server::{
    config::Config,
    matchmaking::Matchmaker,
    protocol::{ClientMsg, ServerMsg},
    server::{
        http::{router, AppState},
        session::SessionRegistry,
    },
};

pub struct TestServer {
    pub url: String,
    pub addr: SocketAddr,
    pub sessions: Arc<SessionRegistry>,
    cancel: Option<oneshot::Sender<()>>,
    handle: Option<JoinHandle<()>>,
}

impl TestServer {
    pub async fn start(cfg: Config) -> Self {
        let cfg = Arc::new(cfg);
        let mm = Matchmaker::new(cfg.clone());
        let sessions = SessionRegistry::new();
        let app = router(AppState {
            mm,
            sessions: sessions.clone(),
            cfg: cfg.clone(),
        });

        let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
        let addr = listener.local_addr().unwrap();
        let (cancel_tx, cancel_rx) = oneshot::channel::<()>();

        let handle = tokio::spawn(async move {
            let _ = axum::serve(listener, app)
                .with_graceful_shutdown(async move {
                    let _ = cancel_rx.await;
                })
                .await;
        });

        Self {
            url: format!("ws://{}/ws", addr),
            addr,
            sessions,
            cancel: Some(cancel_tx),
            handle: Some(handle),
        }
    }

    pub async fn shutdown(mut self) {
        if let Some(c) = self.cancel.take() {
            let _ = c.send(());
        }
        if let Some(h) = self.handle.take() {
            let _ = tokio::time::timeout(Duration::from_secs(2), h).await;
        }
    }
}

impl Drop for TestServer {
    fn drop(&mut self) {
        if let Some(c) = self.cancel.take() {
            let _ = c.send(());
        }
    }
}

/// Build a `Config` suitable for fast-running tests.
pub fn test_config() -> Config {
    use clap::Parser as _;
    // Skip env-vars / .env; parse from a fixed argv.
    Config::try_parse_from([
        "rainboids-server",
        "--bind-addr=127.0.0.1:0",
        "--metrics-bind=127.0.0.1:0",
        "--log-level=warn",
        "--log-format=pretty",
        "--max-rooms=8",
        "--max-players-per-room=4",
        "--tick-hz=60",
        "--snapshot-hz=20",
        "--grace-secs=1",
        "--pause-timeout-secs=300",
    ])
    .unwrap()
}

/// Wraps a connected WebSocket and exposes typed send/recv with the
/// project's bincode codec.
pub struct Client {
    pub ws: WebSocketStream<MaybeTlsStream<tokio::net::TcpStream>>,
}

impl Client {
    pub async fn connect(url: &str) -> Self {
        let req = url.into_client_request().unwrap();
        let (ws, _) = connect_async(req).await.expect("ws connect");
        Self { ws }
    }

    pub async fn send(&mut self, msg: &ClientMsg) {
        let bytes = encode_client(msg);
        self.ws.send(WsMessage::Binary(bytes)).await.expect("ws send");
    }

    /// Receive the next non-control binary frame and decode it as a
    /// `ServerMsg`. Times out after 2 seconds.
    pub async fn recv(&mut self) -> ServerMsg {
        loop {
            let next = tokio::time::timeout(Duration::from_secs(2), self.ws.next())
                .await
                .expect("ws recv timeout");
            match next {
                Some(Ok(WsMessage::Binary(buf))) => return decode_server(&buf),
                Some(Ok(WsMessage::Ping(_) | WsMessage::Pong(_))) => continue,
                Some(Ok(WsMessage::Close(_))) | None => panic!("ws closed before message"),
                Some(Ok(other)) => panic!("unexpected frame: {:?}", other),
                Some(Err(e)) => panic!("ws error: {:?}", e),
            }
        }
    }

    /// Receive frames until one matches the predicate (or 2s elapses).
    /// Useful when we want to skip Ping noise.
    pub async fn recv_until<F>(&mut self, mut pred: F) -> ServerMsg
    where
        F: FnMut(&ServerMsg) -> bool,
    {
        let deadline = tokio::time::Instant::now() + Duration::from_secs(2);
        loop {
            let now = tokio::time::Instant::now();
            if now >= deadline {
                panic!("recv_until: predicate not satisfied within 2s");
            }
            let remaining = deadline - now;
            let next = tokio::time::timeout(remaining, self.ws.next())
                .await
                .expect("recv_until timeout");
            match next {
                Some(Ok(WsMessage::Binary(buf))) => {
                    let msg = decode_server(&buf);
                    if pred(&msg) {
                        return msg;
                    }
                }
                Some(Ok(WsMessage::Ping(_) | WsMessage::Pong(_))) => continue,
                Some(Ok(WsMessage::Close(_))) | None => panic!("ws closed in recv_until"),
                Some(Ok(_)) => continue,
                Some(Err(e)) => panic!("ws error: {:?}", e),
            }
        }
    }

    pub async fn close(mut self) {
        let _ = self.ws.close(None).await;
    }
}

fn opts() -> impl bincode::Options {
    bincode::DefaultOptions::new()
        .with_fixint_encoding()
        .with_little_endian()
}

pub fn encode_client(msg: &ClientMsg) -> Vec<u8> {
    opts().serialize(msg).unwrap()
}

pub fn decode_server(bytes: &[u8]) -> ServerMsg {
    opts().deserialize(bytes).expect("decode server msg")
}

/// Convenience: build a Hello with current versions.
pub fn hello(name: &str, session: Option<uuid::Uuid>) -> ClientMsg {
    ClientMsg::Hello {
        wire_version: rainboids_server::protocol::WIRE_VERSION,
        sim_version: rainboids_server::protocol::SIM_VERSION,
        client_version: env!("CARGO_PKG_VERSION").to_string(),
        display_name: name.to_string(),
        session,
    }
}
