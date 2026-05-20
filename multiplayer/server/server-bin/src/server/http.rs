//! axum HTTP router: WS upgrade + health.
//!
//! Metrics live on a separate listener installed by `obs::metrics::install`
//! so the public surface and the scrape surface have different ACLs.

use std::sync::Arc;

use axum::{
    extract::{ws::WebSocketUpgrade, State},
    response::IntoResponse,
    routing::get,
    Router,
};

use crate::config::Config;
use crate::connection;
use crate::room::SimRoomHandle;

#[derive(Clone)]
pub struct AppState {
    pub cfg: Arc<Config>,
    /// Global multiplayer room actor serving `/mp/ws`.
    pub room: SimRoomHandle,
}

pub fn router(state: AppState) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/mp/ws", get(ws_upgrade))
        .with_state(state)
}

async fn health() -> &'static str {
    "ok"
}

/// `/mp/ws` upgrade — hands the WebSocket to `connection::handle`
/// which talks to the single global `SimRoomHandle`.
async fn ws_upgrade(
    State(state): State<AppState>,
    ws: WebSocketUpgrade,
) -> impl IntoResponse {
    ws.on_upgrade(move |socket| connection::handle(socket, state.room))
}
