//! `rainboids-server` entry point.

use std::sync::Arc;

use anyhow::Result;
use tokio::net::TcpListener;
use tracing::info;

use rainboids_server::{
    config::Config,
    matchmaking::Matchmaker,
    obs, protocol,
    server::{
        http::{router, AppState},
        session::{spawn_reaper, SessionRegistry},
    },
};

#[tokio::main]
async fn main() -> Result<()> {
    let cfg = Arc::new(Config::load()?);
    obs::tracing::init(&cfg.log_level, &cfg.log_format);
    if let Err(e) = obs::metrics::install(cfg.metrics_bind) {
        tracing::warn!(?e, "metrics exporter failed to install");
    }

    info!(
        version = env!("CARGO_PKG_VERSION"),
        wire = protocol::WIRE_VERSION,
        sim = protocol::SIM_VERSION,
        bind = %cfg.bind_addr,
        "rainboids-server starting"
    );

    let mm = Matchmaker::new(cfg.clone());
    let sessions = SessionRegistry::new();
    spawn_reaper(sessions.clone(), std::time::Duration::from_secs(30));
    let app = router(AppState {
        mm,
        sessions,
        cfg: cfg.clone(),
    });

    let listener = TcpListener::bind(cfg.bind_addr).await?;
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await?;

    info!("rainboids-server stopped");
    Ok(())
}

async fn shutdown_signal() {
    let ctrl_c = async {
        let _ = tokio::signal::ctrl_c().await;
    };
    #[cfg(unix)]
    let term = async {
        use tokio::signal::unix::{signal, SignalKind};
        if let Ok(mut s) = signal(SignalKind::terminate()) {
            s.recv().await;
        }
    };
    #[cfg(not(unix))]
    let term = std::future::pending::<()>();

    tokio::select! {
        _ = ctrl_c => {},
        _ = term => {},
    }
    info!("shutdown signal received");
}
