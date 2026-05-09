//! Wire protocol: message enums + codec.
//!
//! Mirror of `js/net/protocol-generated.js` (hand-mirrored for v1; codegen
//! later — see `Multiplayer Rust Client Engine` doc). Any change to a
//! variant here must be matched on the JS side; the parity harness in CI
//! enforces this.

use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub mod codec;
pub mod version;

pub use codec::{decode, decode_client, encode, encode_into, encode_server};
pub use version::{is_compatible, SIM_VERSION, WIRE_VERSION};

use crate::util::id::{AsteroidId, BulletId, DropId, EnemyId, PlayerId, RoomId};

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum ErrCode {
    Version,
    BadHello,
    NotFound,
    Full,
    Banned,
    RateLimited,
    Internal,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum LeaveReason {
    Voluntary,
    Disconnect,
    GraceExpired,
    Kicked,
    RoomClosed,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum DespawnReason {
    Lifetime,
    OutOfBounds,
    Hit,
    Killed,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum DmgKind {
    Normal,
    Crit,
    Heal,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum WeaponId {
    PulseCannon,
    StormNeedles,
    ScatterGun,
    RailDriver,
    LanceBeam,
    ChargeShot,
    MineLayer,
    NovaBlast,
    LightningArc,
    MissileSalvo,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct PowerupId(pub u16);

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntityRef {
    Ship(PlayerId),
    Enemy(EnemyId),
    Asteroid(AsteroidId),
    Bullet(BulletId),
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub struct PackedInput {
    /// Normalized -127..127.
    pub move_x: i8,
    pub move_y: i8,
    /// Aim direction. Half-precision in the design doc; encoded as i16 here
    /// (16-bit fixed at 1/32767 scale) to avoid pulling in `half`.
    pub aim_x: i16,
    pub aim_y: i16,
    /// Bitfield: shoot, dash, ability1, ability2, ...
    pub buttons: u8,
}

impl Default for PackedInput {
    fn default() -> Self {
        Self {
            move_x: 0,
            move_y: 0,
            aim_x: 0,
            aim_y: 0,
            buttons: 0,
        }
    }
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct PeerInfo {
    pub player_id: PlayerId,
    pub display_name: String,
    pub slot: u8,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct RoomSummary {
    pub room_id: RoomId,
    pub name: String,
    pub players: u8,
    pub max_players: u8,
    pub wave: u32,
}

#[derive(Serialize, Deserialize, Debug, Clone, Default)]
pub struct SnapshotPayload {
    pub ships: Vec<ShipState>,
    pub enemies: Vec<EnemyState>,
    pub asteroids: Vec<AsteroidState>,
    pub drops: Vec<DropState>,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub struct ShipState {
    pub player: PlayerId,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub angle: f32,
    pub hp: f32,
    pub shield: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub struct EnemyState {
    pub id: EnemyId,
    pub kind: u8,
    pub x: f32,
    pub y: f32,
    pub hp: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub struct AsteroidState {
    pub id: AsteroidId,
    pub size: u8,
    pub x: f32,
    pub y: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub struct DropState {
    pub id: DropId,
    pub kind: u8,
    pub x: f32,
    pub y: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum GameEvent {
    BulletSpawn {
        id: BulletId,
        owner: PlayerId,
        weapon: WeaponId,
        x: f32,
        y: f32,
        vx: f32,
        vy: f32,
    },
    BulletDespawn {
        id: BulletId,
        reason: DespawnReason,
    },
    EnemyDestroy {
        id: EnemyId,
        by: Option<PlayerId>,
        drops: Vec<DropId>,
    },
    AsteroidDestroy {
        id: AsteroidId,
        by: Option<PlayerId>,
        fragments: Vec<AsteroidId>,
    },
    OrbCollect {
        id: DropId,
        by: PlayerId,
        value: u32,
    },
    PlayerDamaged {
        player: PlayerId,
        hp: f32,
    },
    PlayerDowned {
        player: PlayerId,
    },
    PlayerRevived {
        player: PlayerId,
        by: PlayerId,
    },
    WaveStart {
        wave: u32,
        enemy_count: u32,
    },
    WaveClear {
        wave: u32,
        time_ms: u32,
    },
    PowerupOffer {
        player: PlayerId,
        picks: u8,
    },
    PowerupChosen {
        player: PlayerId,
        powerup: PowerupId,
    },
    HitFlash {
        entity: EntityRef,
        intensity: f32,
    },
    DamageNumber {
        x: f32,
        y: f32,
        value: i32,
        kind: DmgKind,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum ClientMsg {
    Hello {
        wire_version: u16,
        sim_version: u16,
        client_version: String,
        display_name: String,
        session: Option<Uuid>,
    },
    QuickMatch,
    BrowseRooms,
    CreateRoom {
        name: String,
        public: bool,
        max_players: u8,
    },
    JoinRoom {
        room_id: RoomId,
    },
    JoinRoomByCode {
        code: String,
    },
    LeaveRoom,
    Input {
        tick: u32,
        packed: PackedInput,
    },
    Ack {
        snapshot_tick: u32,
    },
    Pong {
        client_t: u32,
        server_t: u32,
    },
    PowerupChoose {
        powerup: PowerupId,
    },
    Revive {
        target: PlayerId,
    },
    Chat {
        text: String,
    },
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub enum ServerMsg {
    Welcome {
        player_id: PlayerId,
        session: Uuid,
        server_t_ms: u64,
    },
    Error {
        code: ErrCode,
        msg: String,
    },
    RoomList {
        rooms: Vec<RoomSummary>,
    },
    RoomJoined {
        room_id: RoomId,
        code: String,
        slot: u8,
        peers: Vec<PeerInfo>,
        wave: u32,
        seed: u64,
    },
    RoomLeft {
        reason: LeaveReason,
    },
    PeerJoined {
        peer: PeerInfo,
        slot: u8,
    },
    PeerLeft {
        slot: u8,
        reason: LeaveReason,
    },
    Snapshot {
        tick: u32,
        base_tick: Option<u32>,
        payload: SnapshotPayload,
    },
    Event {
        tick: u32,
        event: GameEvent,
    },
    Ping {
        client_t: u32,
        server_t: u32,
    },
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn hello_round_trips() {
        let msg = ClientMsg::Hello {
            wire_version: WIRE_VERSION,
            sim_version: SIM_VERSION,
            client_version: "5.79.62".into(),
            display_name: "Pilot".into(),
            session: None,
        };
        let bytes = encode(&msg).unwrap();
        let back: ClientMsg = decode(&bytes).unwrap();
        match back {
            ClientMsg::Hello { wire_version, .. } => assert_eq!(wire_version, WIRE_VERSION),
            _ => panic!("wrong variant"),
        }
    }
}
