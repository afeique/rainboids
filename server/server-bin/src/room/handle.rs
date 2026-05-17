//! Cheap clonable handle to a room actor. Wraps an mpsc sender.

use tokio::sync::mpsc;

use super::RoomInbound;

#[derive(Clone)]
pub struct RoomHandle {
    pub(super) tx: mpsc::Sender<RoomInbound>,
    pub(super) id: crate::util::id::RoomId,
}

impl RoomHandle {
    pub fn id(&self) -> crate::util::id::RoomId {
        self.id
    }

    pub async fn send(&self, msg: RoomInbound) -> Result<(), mpsc::error::SendError<RoomInbound>> {
        self.tx.send(msg).await
    }

    pub fn try_send(&self, msg: RoomInbound) -> Result<(), mpsc::error::TrySendError<RoomInbound>> {
        self.tx.try_send(msg)
    }
}
