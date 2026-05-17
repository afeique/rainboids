//! Session token issuance + reconnect lookups.
//!
//! v1: every fresh Hello gets a brand-new uuid; a recently-disconnected
//! player presenting their old session is reattached to their grace slot.
//! For now we just mint a uuid and stash nothing — the room-side grace
//! tracking is the source of truth.

use uuid::Uuid;

pub fn new_session() -> Uuid {
    Uuid::new_v4()
}
