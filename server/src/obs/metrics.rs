//! Prometheus exporter setup + per-room metric handles.

use std::net::SocketAddr;

use anyhow::Result;
use metrics_exporter_prometheus::PrometheusBuilder;

pub fn install(bind: SocketAddr) -> Result<()> {
    PrometheusBuilder::new()
        .with_http_listener(bind)
        .install()?;

    metrics::describe_counter!(
        "rainboids_rooms_created_total",
        "Rooms created since start."
    );
    metrics::describe_counter!(
        "rainboids_rooms_destroyed_total",
        "Rooms destroyed since start."
    );
    metrics::describe_counter!(
        "rainboids_players_joined_total",
        "Players joined a room since start."
    );
    metrics::describe_gauge!("rainboids_rooms_active", "Active rooms.");
    metrics::describe_gauge!("rainboids_players_online", "Connected players.");
    metrics::describe_histogram!("rainboids_tick_duration_seconds", "Sim tick wall time.");
    metrics::describe_histogram!("rainboids_snapshot_size_bytes", "Encoded snapshot size.");

    Ok(())
}
