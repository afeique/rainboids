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
use crate::mp1_connection;
use crate::mp1_room::Mp1RoomHandle;
use crate::server::session::SessionRegistry;

#[derive(Clone)]
pub struct AppState {
    pub mm: Matchmaker,
    pub sessions: Arc<SessionRegistry>,
    pub cfg: Arc<Config>,
    /// WASM-pivot Phase 2 room actor. Single global room serving
    /// `/mp/ws`. Parallel to the legacy `/ws` path which uses
    /// `mm` + `sessions` above.
    pub mp1: Mp1RoomHandle,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ws", get(ws_upgrade))
        .route("/mp/ws", get(mp1_ws_upgrade))
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

/// WASM-pivot Phase 2 — `/mp/ws` upgrade. Routes the WebSocket to the
/// fresh `mp1_connection::handle` which uses `rainboids_sim::mp1`
/// types throughout and the single global `Mp1RoomHandle`.
async fn mp1_ws_upgrade(
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| mp1_connection::handle(socket, state.mp1))
}
