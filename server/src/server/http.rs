//! axum HTTP router: WS upgrade + health.
//!
//! Metrics live on a separate listener installed by `obs::metrics::install`
//! so the public surface and the scrape surface have different ACLs.

use std::sync::Arc;

use axum::{
    extract::{
        ws::{WebSocket, WebSocketUpgrade},
        State,
    },
    response::IntoResponse,
    routing::get,
    Router,
};

use crate::config::Config;
use crate::matchmaking::Matchmaker;
use crate::server::session::SessionRegistry;

#[derive(Clone)]
pub struct AppState {
    pub mm: Matchmaker,
    pub sessions: Arc<SessionRegistry>,
    pub cfg: Arc<Config>,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ws", get(ws_upgrade))
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}

async fn ws_upgrade(
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| handle_socket(socket, state))
}

async fn handle_socket(socket: WebSocket, state: AppState) {
    super::connection::run(socket, state.mm, state.sessions, state.cfg).await;
}
