# Multiplayer Wire Format Reference

**Authoritative byte-level spec for the v1 wire protocol.** The Rust server
(`server/src/protocol/`) is the source of truth; this doc translates the
serde/bincode rules into a precise enough description that the JS client
codec can be hand-written or codegen'd against it.

Date: 2026-05-09. Bumped together with `WIRE_VERSION`.

> Empirically verified against `bincode 1.3` with `DefaultOptions ·
> with_fixint_encoding · with_little_endian`. Golden hex dumps live in
> `server/tests/wire_golden.rs`.

## Configuration

Both ends use **bincode 1.x** with these options:

```rust
bincode::DefaultOptions::new()
    .with_fixint_encoding()  // no varints
    .with_little_endian()    // multi-byte ints LE
```

Equivalent JS configuration:
- All multi-byte integers are little-endian.
- All length prefixes are `u64 LE` (8 bytes), even for short fields.
- All enum discriminants are `u32 LE` (4 bytes), zero-indexed by source-order.

## Frame format

Every WebSocket frame is a single **binary** frame containing one fully
encoded `ClientMsg` or `ServerMsg`. No length prefix, no envelope, no
fragmentation. The frame *is* the message.

The server writes binary frames; the client must too. Text frames are
rejected as a protocol error.

## Primitive encodings

| Type | Wire | Notes |
|------|------|-------|
| `bool` | `u8` | 0 = false, 1 = true |
| `u8` / `i8` | 1 byte | i8 is two's complement |
| `u16` / `i16` | 2 bytes LE | |
| `u32` / `i32` | 4 bytes LE | |
| `u64` / `i64` | 8 bytes LE | |
| `f32` | 4 bytes LE | IEEE-754 binary32 |
| `f64` | 8 bytes LE | IEEE-754 binary64 |
| `String` | `u64 len` + UTF-8 bytes | length is byte count, not chars |
| `Vec<T>` | `u64 len` + `len × T` | |
| `Option<T>` | `u8 tag` + payload if `Some` | tag 0 = None, 1 = Some |
| `enum` | `u32 tag` + variant payload | tag = 0-indexed declaration order |
| `struct { … }` | concat fields in declaration order | no padding |
| `Uuid` (binary) | `u64 len = 16` + 16 canonical bytes | 24 bytes total |

> ⚠️ **Bincode is NOT human-readable mode**, which matters for `Uuid`.
> The uuid crate's serde impl checks `serializer.is_human_readable()`; in
> binary mode it emits `serialize_bytes(&self.as_bytes())`. Bincode then
> writes a `u64 LE length (= 16)` followed by the 16 raw bytes in the
> canonical (big-endian) byte order — i.e. byte 0 is the most-significant
> byte of the underlying `u128`.
>
> JS implementations should not LE-swap the UUID body. Match the canonical
> string form `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx` byte-for-byte.

## Enum discriminant tables

Variants are zero-indexed by **declaration order in `server/src/protocol/mod.rs`**.

### `ClientMsg`
| Tag | Variant |
|-----|---------|
| `00` | `Hello { wire_version: u16, sim_version: u16, client_version: String, display_name: String, session: Option<Uuid> }` |
| `01` | `QuickMatch` |
| `02` | `BrowseRooms` |
| `03` | `CreateRoom { name: String, public: bool, max_players: u8 }` |
| `04` | `JoinRoom { room_id: u64 }` |
| `05` | `JoinRoomByCode { code: String }` |
| `06` | `LeaveRoom` |
| `07` | `Input { tick: u32, packed: PackedInput }` |
| `08` | `Ack { snapshot_tick: u32 }` |
| `09` | `Pong { client_t: u32, server_t: u32 }` |
| `0A` | `PowerupChoose { powerup: u16 }` |
| `0B` | `Revive { target: u64 }` |
| `0C` | `Chat { text: String }` |

### `ServerMsg`
| Tag | Variant |
|-----|---------|
| `00` | `Welcome { player_id: u64, session: Uuid, server_t_ms: u64 }` |
| `01` | `Error { code: ErrCode, msg: String }` |
| `02` | `RoomList { rooms: Vec<RoomSummary> }` |
| `03` | `RoomJoined { room_id: u64, code: String, slot: u8, peers: Vec<PeerInfo>, wave: u32, seed: u64 }` |
| `04` | `RoomLeft { reason: LeaveReason }` |
| `05` | `PeerJoined { peer: PeerInfo, slot: u8 }` |
| `06` | `PeerLeft { slot: u8, reason: LeaveReason }` |
| `07` | `Snapshot { tick: u32, base_tick: Option<u32>, payload: SnapshotPayload }` |
| `08` | `Event { tick: u32, event: GameEvent }` |
| `09` | `Ping { client_t: u32, server_t: u32 }` |

### `ErrCode` (1 byte? no — `u32 LE`!)
| Tag | Code |
|-----|------|
| `00` | `Version` |
| `01` | `BadHello` |
| `02` | `NotFound` |
| `03` | `Full` |
| `04` | `Banned` |
| `05` | `RateLimited` |
| `06` | `Internal` |

> Even unit-only enums like `ErrCode` get a **u32 LE** discriminant under bincode-fixint. There is no payload — just the 4-byte tag.

### `LeaveReason`
| Tag | Reason |
|-----|--------|
| `00` | `Voluntary` |
| `01` | `Disconnect` |
| `02` | `GraceExpired` |
| `03` | `Kicked` |
| `04` | `RoomClosed` |

### `WeaponId`
| Tag | Weapon |
|-----|--------|
| `00` | `PulseCannon` |
| `01` | `StormNeedles` |
| `02` | `ScatterGun` |
| `03` | `RailDriver` |
| `04` | `LanceBeam` |
| `05` | `ChargeShot` |
| `06` | `MineLayer` |
| `07` | `NovaBlast` |
| `08` | `LightningArc` |
| `09` | `MissileSalvo` |

### `DespawnReason`
| Tag | Reason |
|-----|--------|
| `00` | `Lifetime` |
| `01` | `OutOfBounds` |
| `02` | `Hit` |
| `03` | `Killed` |

### `DmgKind`
| Tag | Kind |
|-----|------|
| `00` | `Normal` |
| `01` | `Crit` |
| `02` | `Heal` |

### `EntityRef`
| Tag | Variant payload |
|-----|-----------------|
| `00` | `Ship(PlayerId = u64)` |
| `01` | `Enemy(EnemyId = u64)` |
| `02` | `Asteroid(AsteroidId = u64)` |
| `03` | `Bullet(BulletId = u64)` |

## Struct layouts

### `PackedInput` (~7 bytes)

| Offset | Bytes | Field | Type |
|--------|-------|-------|------|
| 0 | 1 | `move_x` | `i8` |
| 1 | 1 | `move_y` | `i8` |
| 2 | 2 | `aim_x` | `i16 LE` |
| 4 | 2 | `aim_y` | `i16 LE` |
| 6 | 1 | `buttons` | `u8` (bit 0 shoot, bit 1 dash, bit 2 ability1, bit 3 ability2) |

Move axes are normalized `[-127, 127]`. Aim axes are `[-32767, 32767]`
(divide by 32767 → unit-vector approx).

### `PeerInfo`
| Offset | Field | Type |
|--------|-------|------|
| 0 | `player_id` | `PlayerId = u64 LE` |
| 8 | `display_name` | `String` |
| ?? | `slot` | `u8` |

### `RoomSummary`
| Field | Type |
|-------|------|
| `room_id` | `RoomId = u64 LE` |
| `name` | `String` |
| `players` | `u8` |
| `max_players` | `u8` |
| `wave` | `u32 LE` |

### `ShipState` / `EnemyState` / `AsteroidState` / `DropState`

All `Copy` structs with `f32` coordinates. See
`server/src/protocol/mod.rs:128-163` — fields concatenate in declaration
order, no padding.

`ShipState`: `player(u64) + x(f32) + y(f32) + vx(f32) + vy(f32) + angle(f32) + hp(f32) + shield(f32)` — **36 bytes**

### `SnapshotPayload`
```
ships:    Vec<ShipState>      (u64 len + N × 36 bytes)
enemies:  Vec<EnemyState>     (u64 len + N × 21 bytes)
asteroids:Vec<AsteroidState>  (u64 len + N × 21 bytes)
drops:    Vec<DropState>      (u64 len + N × 21 bytes)
```

### Newtype IDs (`PlayerId`, `RoomId`, `EnemyId`, `AsteroidId`, `BulletId`, `DropId`)

Each is `pub struct Foo(pub u64)` — wire is just the `u64 LE`. Tuple-struct
serialization writes the inner field with no extra wrapper.

`PowerupId` is `pub struct PowerupId(pub u16)` → 2 bytes LE.

## Worked examples

### Hello round-trip

```text
ClientMsg::Hello {
    wire_version: 1,
    sim_version:  1,
    client_version: "5.81.1",
    display_name: "Pilot",
    session: None,
}
```

Wire bytes (decoded field-by-field):
```
00 00 00 00                       // tag = 0 (Hello)
01 00                             // wire_version = 1 (u16 LE)
01 00                             // sim_version  = 1 (u16 LE)
06 00 00 00 00 00 00 00           // client_version length = 6
35 2e 38 31 2e 31                 // "5.81.1"
05 00 00 00 00 00 00 00           // display_name length = 5
50 69 6c 6f 74                    // "Pilot"
00                                // session = None
```
Total: 4 + 2 + 2 + 8+6 + 8+5 + 1 = **36 bytes**.

### Welcome response

```text
ServerMsg::Welcome {
    player_id: 42,
    session: 0102030405060708090a0b0c0d0e0f10,
    server_t_ms: 0x0102030405060708,  // 72,623,859,790,382,856
}
```
```
00 00 00 00                       // tag = 0 (Welcome)
2a 00 00 00 00 00 00 00           // player_id = 42 (u64 LE)
10 00 00 00 00 00 00 00           // uuid byte-length = 16
01 02 03 04 05 06 07 08
09 0a 0b 0c 0d 0e 0f 10           // canonical uuid bytes (NOT LE-swapped)
08 07 06 05 04 03 02 01           // server_t_ms = 0x0102030405060708 (u64 LE)
```
Total: 4 + 8 + 8+16 + 8 = **44 bytes**.

The exact byte layout is regression-tested in
`server/tests/wire_golden.rs`. JS implementations should round-trip those
golden vectors.

### Hello with version mismatch (Error response)

```text
ServerMsg::Error { code: Version, msg: "server v1/1" }
```
```
01 00 00 00                       // tag = 1 (Error)
00 00 00 00                       // ErrCode = Version (u32 LE)
0b 00 00 00 00 00 00 00           // msg length = 11
73 65 72 76 65 72 20 76 31 2f 31  // "server v1/1"
```

## Implementation notes for the JS codec

- Use `DataView` for read/write of multi-byte ints; pass `littleEndian = true`.
- For UUIDs, treat the bytes as a fixed 16-byte buffer; the canonical
  string form is just the hex of those bytes with the `8-4-4-4-12` dashes.
- For `Option<T>`: read `u8`, branch.
- For length prefixes: read `BigInt` via `getBigUint64`, but the values
  always fit in JS `Number` for our message sizes (<2³² is safe to cast).
- For enum discriminants: read `u32`, switch on the tag.
- Reject text frames; the protocol is binary-only.
- Strings: use `TextEncoder` / `TextDecoder` with UTF-8.

## Versioning

- `WIRE_VERSION` (`server/src/protocol/version.rs:3`): bumped on **layout** changes (new variant, reordered fields).
- `SIM_VERSION`: bumped on **simulation** changes (different physics output for same inputs).

The Hello handshake closes the socket with `ErrCode::Version` if either
side disagrees. Both versions are at `1` for the v1 scaffold.

## Future: codegen

The `Multiplayer Rust Client Engine – 2026-05-07.md` plan (§"Wire codegen")
calls for emitting `js/net/protocol-generated.js` from a Rust build script
so the JS layout is mechanically derived. The hand-mirror in `js/net/`
exists today only as a v1 bridge. When codegen lands, the discriminant
tables and worked examples here become regression fixtures.
