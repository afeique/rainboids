//! Config from env (via `dotenvy`) + CLI overrides.

use std::net::SocketAddr;

use clap::Parser;
use serde::Deserialize;

#[derive(Parser, Debug, Clone, Deserialize)]
#[command(version, about = "Rainboids authoritative multiplayer server")]
pub struct Config {
    #[arg(long, env = "RAINBOIDS_BIND_ADDR", default_value = "0.0.0.0:8443")]
    pub bind_addr: SocketAddr,

    #[arg(long, env = "RAINBOIDS_METRICS_BIND", default_value = "127.0.0.1:9090")]
    pub metrics_bind: SocketAddr,

    #[arg(long, env = "RAINBOIDS_LOG_LEVEL", default_value = "info")]
    pub log_level: String,

    #[arg(long, env = "RAINBOIDS_LOG_FORMAT", default_value = "json")]
    pub log_format: String,

    #[arg(long, env = "RAINBOIDS_MAX_ROOMS", default_value_t = 200)]
    pub max_rooms: usize,

    #[arg(long, env = "RAINBOIDS_MAX_PLAYERS_PER_ROOM", default_value_t = 4)]
    pub max_players_per_room: u8,

    #[arg(long, env = "RAINBOIDS_TICK_HZ", default_value_t = 60)]
    pub tick_hz: u32,

    #[arg(long, env = "RAINBOIDS_SNAPSHOT_HZ", default_value_t = 20)]
    pub snapshot_hz: u32,

    #[arg(long, env = "RAINBOIDS_GRACE_SECS", default_value_t = 30)]
    pub grace_secs: u64,

    #[arg(long, env = "RAINBOIDS_PAUSE_TIMEOUT_SECS", default_value_t = 300)]
    pub pause_timeout_secs: u64,
}

impl Config {
    pub fn load() -> anyhow::Result<Self> {
        let _ = dotenvy::dotenv();
        Ok(Self::parse())
    }
}
