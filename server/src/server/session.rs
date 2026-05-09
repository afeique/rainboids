//! Session registry: maps `Hello.session: Uuid` → the room/player slot to
//! reattach to within the grace window.
//!
//! When a connection drops while the player is in a room, the connection
//! task registers the session here keyed by the UUID it issued in `Welcome`.
//! A subsequent `Hello { session: Some(uuid) }` looks the entry up and, if
//! still inside the grace window, sends `RoomInbound::Reattach` to the
//! room actor instead of going through matchmaking again.
//!
//! Per the plan (`Multiplayer Rust Server – 2026-05-07.md` §"Reconnect"):
//! sessions are single-use. On a successful reattach the entry is taken
//! and a fresh `session` UUID is issued in the new `Welcome` for the next
//! disconnect cycle.

use std::sync::Arc;
use std::time::Duration;

use dashmap::DashMap;
use tokio::time::interval;
use tracing::debug;
use uuid::Uuid;

use crate::room::RoomHandle;
use crate::util::id::PlayerId;
use crate::util::time::now_ms;

#[derive(Clone)]
pub struct SessionEntry {
    pub player_id: PlayerId,
    pub room: RoomHandle,
    pub expires_at_ms: u64,
}

#[derive(Default)]
pub struct SessionRegistry {
    entries: DashMap<Uuid, SessionEntry>,
}

impl SessionRegistry {
    pub fn new() -> Arc<Self> {
        Arc::new(Self::default())
    }

    /// Register (or refresh) an entry. Called when a connection drops.
    pub fn register(&self, session: Uuid, entry: SessionEntry) {
        self.entries.insert(session, entry);
        metrics::gauge!("rainboids_sessions_pending").set(self.entries.len() as f64);
    }

    /// Atomically look up + remove an entry if it's still within the grace
    /// window. Returns `None` if missing or expired.
    pub fn take_alive(&self, session: &Uuid) -> Option<SessionEntry> {
        let now = now_ms();
        let (_, entry) = self.entries.remove(session)?;
        metrics::gauge!("rainboids_sessions_pending").set(self.entries.len() as f64);
        if entry.expires_at_ms > now {
            Some(entry)
        } else {
            metrics::counter!("rainboids_sessions_expired_total").increment(1);
            None
        }
    }

    /// Drop any entries whose grace timer has elapsed. Called on a timer.
    pub fn reap_expired(&self) {
        let now = now_ms();
        let mut removed = 0u64;
        self.entries.retain(|_, e| {
            if e.expires_at_ms > now {
                true
            } else {
                removed += 1;
                false
            }
        });
        if removed > 0 {
            metrics::counter!("rainboids_sessions_expired_total").increment(removed);
            metrics::gauge!("rainboids_sessions_pending").set(self.entries.len() as f64);
            debug!(removed, "session reaper dropped expired entries");
        }
    }

    pub fn len(&self) -> usize {
        self.entries.len()
    }
}

/// Spawns a background task that calls [`SessionRegistry::reap_expired`]
/// at the given interval. Shutdown is implicit when the registry is dropped
/// (the task is detached by design — sessions outlive any single request).
pub fn spawn_reaper(registry: Arc<SessionRegistry>, every: Duration) {
    tokio::spawn(async move {
        let mut tick = interval(every);
        loop {
            tick.tick().await;
            registry.reap_expired();
        }
    });
}
