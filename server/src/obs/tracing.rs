//! `tracing-subscriber` setup. JSON in prod, pretty in dev.

use tracing_subscriber::{fmt, prelude::*, EnvFilter};

pub fn init(level: &str, format: &str) {
    let filter = EnvFilter::try_new(level).unwrap_or_else(|_| EnvFilter::new("info"));
    let registry = tracing_subscriber::registry().with(filter);
    if format == "json" {
        registry.with(fmt::layer().json()).init();
    } else {
        registry.with(fmt::layer().compact()).init();
    }
}
