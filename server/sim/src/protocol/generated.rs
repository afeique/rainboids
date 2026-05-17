//! Auto-generated wire protocol — DO NOT EDIT.
//!
//! Source: `schema/protocol.toml`. To regenerate, run
//! `node tools/codegen-protocol.mjs` from the project root.
//! `node tools/codegen-protocol.mjs --check` is the CI gate.
//!
//! Schema: wire_version=1, sim_version=1
//! Codec:  bincode-1.x-default-with-fixint-le

#![allow(clippy::enum_variant_names)]

use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub use crate::util::id::{AsteroidId, BulletId, DropId, EnemyId, PlayerId, RoomId};

pub const WIRE_VERSION: u16 = 1;
pub const SIM_VERSION: u16 = 1;

pub fn is_compatible(wire: u16, sim: u16) -> bool {
    wire == WIRE_VERSION && sim == SIM_VERSION
}

// ─── Newtypes ───────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub struct PowerupId(pub u16);

// ─── Enums ──────────────────────────────────────────────────────

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

#[derive(Serialize, Deserialize, Debug, Clone, Copy, PartialEq, Eq)]
pub enum EntityRef {
    Ship(PlayerId),
    Enemy(EnemyId),
    Asteroid(AsteroidId),
    Bullet(BulletId),
}

// ─── Structs ────────────────────────────────────────────────────

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub struct PackedInput {
    pub move_x: i8,
    pub move_y: i8,
    pub aim_x: i16,
    pub aim_y: i16,
    pub buttons: u8,
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

#[derive(Serialize, Deserialize, Debug, Clone, Copy)]
pub struct BulletState {
    pub id: u32,
    pub x: f32,
    pub y: f32,
    pub vx: f32,
    pub vy: f32,
    pub angle: f32,
    pub radius: f32,
}

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct SnapshotPayload {
    pub ships: Vec<ShipState>,
    pub enemies: Vec<EnemyState>,
    pub asteroids: Vec<AsteroidState>,
    pub drops: Vec<DropState>,
    pub bullets: Vec<BulletState>,
}

// ─── Tagged-union messages ──────────────────────────────────────

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
