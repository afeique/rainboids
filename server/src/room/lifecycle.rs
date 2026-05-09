//! Room state machine: created → playing → wave-transition → paused → closing.

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum RoomState {
    WaitingForPlayers,
    Playing,
    WaveTransition,
    Paused,
    Closing,
}

#[derive(Debug, Clone, Copy)]
pub struct GraceTimer {
    pub started_at_ms: u64,
    pub deadline_ms: u64,
}
