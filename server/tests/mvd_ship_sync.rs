//! MVD ship-sync integration test.
//!
//! Validates the end-to-end MVD plumbing for two-player ship sync:
//!
//!   client WS  ─→  ClientMsg::Input(PackedInput)
//!                ─→  connection::session  ─→  RoomInbound::Input
//!                  ─→  room actor `inputs: HashMap<PlayerId, InputBuffer>`
//!                    ─→  simulate_tick → ship.rs::update_all → ShipState.x += vx
//!                      ─→  room::snapshot::build → ServerMsg::Snapshot
//!                        ─→  client WS
//!
//! Scope: a single client joins via QuickMatch, holds rightward thrust for ~30
//! ticks, and verifies that (a) snapshots arrive, (b) the ship's `x` advances
//! past the spawn (`field.width/2`), and (c) snapshots arrive at roughly 20Hz
//! (≥ 1 per 100 ms over the burst window).
//!
//! Why a single client (not two): per the MVD plan, the failure modes we care
//! about for v1 are the *per-room* plumbing, not multi-player fan-out. The
//! latter is exercised by `room_lifecycle::second_player_joins_by_code_and_first_sees_peer`
//! at the matchmaking layer; this test focuses on the simulate_tick →
//! broadcast path that wasn't covered before.

mod common;

use std::time::{Duration, Instant};

use common::{hello, test_config, Client, TestServer};
use rainboids_server::{
    protocol::{ClientMsg, PackedInput, ServerMsg, SnapshotPayload},
    util::id::PlayerId,
};

/// Spawn position for a fresh room (matches `Room::handle_join` non-Playing
/// branch: center of the 1920×1080 field).
const SPAWN_X: f32 = 1920.0 * 0.5;
const SPAWN_Y: f32 = 1080.0 * 0.5;

/// Hold rightward thrust (max value on the i8 move axis) for `INPUT_BURST`
/// ticks. The ship's max velocity is 3.5 px/tick with friction ≈ 0.707, so
/// terminal speed is reached within ~10 ticks; 30 gives comfortable headroom.
const INPUT_BURST: u32 = 30;

#[tokio::test]
async fn single_client_input_advances_ship_in_snapshots() {
    let server = TestServer::start(test_config()).await;

    let mut c = Client::connect(&server.url).await;
    c.send(&hello("Pilot", None)).await;

    let player_id = match c.recv().await {
        ServerMsg::Welcome { player_id, .. } => player_id,
        other => panic!("expected Welcome, got {:?}", other),
    };

    c.send(&ClientMsg::QuickMatch).await;
    match c
        .recv_until(|m| matches!(m, ServerMsg::RoomJoined { .. }))
        .await
    {
        ServerMsg::RoomJoined { slot, seed: _, .. } => {
            assert_eq!(slot, 0, "first player should land in slot 0");
        }
        _ => unreachable!(),
    }

    // Hold rightward thrust. The wire format is i8 in [-127, 127] for move,
    // i16 in [-32767, 32767] for aim. We pump inputs into the connection
    // task as fast as the room actor can consume them — the actor's
    // InputBuffer keeps only the latest per player per tick (latest-wins).
    //
    // We pace these slightly faster than the 50 ms tick to ensure the room
    // actor always sees a fresh PackedInput in each tick — anything dropped
    // by latest-wins is harmless.
    let send_start = Instant::now();
    for tick in 0..INPUT_BURST {
        c.send(&ClientMsg::Input {
            tick,
            packed: PackedInput {
                move_x: 127,
                move_y: 0,
                aim_x: 32767,
                aim_y: 0,
                buttons: 0,
            },
        })
        .await;
        tokio::time::sleep(Duration::from_millis(20)).await;
    }
    let send_elapsed = send_start.elapsed();

    // Collect snapshots over a 1-second window. We expect 20Hz snapshots so
    // ~20 frames; allow generous slack for CI scheduling.
    let snapshots = collect_snapshots(&mut c, player_id, Duration::from_millis(1000)).await;
    assert!(
        snapshots.len() >= 5,
        "expected ≥5 snapshots over 1s window, got {} (input burst ran for {:?})",
        snapshots.len(),
        send_elapsed,
    );

    // The final snapshot's ship.x should be well past the spawn — the ship
    // accelerates to MAX_V = 3.5 px/tick over ~10 ticks, so after 30+ ticks
    // we expect roughly (30 - 5) * 3.5 ≈ 87 px of displacement, easily
    // measurable. We assert a conservative > 5 px lower bound to allow for
    // scheduling jitter eating into the burst window.
    let (last_x, last_y, last_vx) = snapshots
        .last()
        .map(|s| (s.x, s.y, s.vx))
        .expect("at least one snapshot collected");
    assert!(
        last_x > SPAWN_X + 5.0,
        "ship.x ({}) should advance past spawn ({}); last_vx={}, snapshots={}",
        last_x,
        SPAWN_X,
        last_vx,
        snapshots.len(),
    );
    assert!(
        (last_y - SPAWN_Y).abs() < 1.0,
        "ship.y ({}) should stay near spawn_y ({}) with no vertical input",
        last_y,
        SPAWN_Y,
    );
    // Velocity should be positive (still pushed rightward) or zero if input
    // dropped before the snapshot — but we should never observe a strongly
    // negative vx without a corresponding input.
    assert!(
        last_vx > -0.1,
        "ship should not be moving leftward; got vx={}",
        last_vx,
    );

    // Validate snapshot cadence: at least 1 snapshot per 100 ms within the
    // collection window. Compute per-snapshot interarrival from monotonic
    // receive times and assert the *median* gap is ≤ 100 ms (more robust to
    // a single CI hiccup than max).
    let inter_arrival = inter_arrival_ms(&snapshots);
    if inter_arrival.len() >= 3 {
        let mut sorted = inter_arrival.clone();
        sorted.sort_unstable();
        let median = sorted[sorted.len() / 2];
        assert!(
            median <= 100,
            "median snapshot gap should be ≤100ms; got {}ms (samples: {:?})",
            median,
            inter_arrival,
        );
    }

    server.shutdown().await;
}

/// What we record per snapshot frame for assertions.
struct OurShip {
    x: f32,
    y: f32,
    vx: f32,
    at: Instant,
}

/// Drain server messages for `window`, keeping a record of every snapshot
/// frame's `ShipState` for our `player_id`. Other server messages
/// (PeerJoined/Ping/etc.) are ignored.
async fn collect_snapshots(
    c: &mut Client,
    player_id: PlayerId,
    window: Duration,
) -> Vec<OurShip> {
    let deadline = Instant::now() + window;
    let mut out: Vec<OurShip> = Vec::new();
    loop {
        let now = Instant::now();
        if now >= deadline {
            break;
        }
        let remaining = deadline - now;
        let frame = tokio::time::timeout(remaining, c.ws_next()).await;
        let Ok(Some(msg)) = frame else { break };
        if let ServerMsg::Snapshot { payload, .. } = msg {
            if let Some(s) = ship_for(&payload, player_id) {
                out.push(OurShip {
                    x: s.x,
                    y: s.y,
                    vx: s.vx,
                    at: Instant::now(),
                });
            }
        }
    }
    out
}

fn ship_for<'a>(
    p: &'a SnapshotPayload,
    pid: PlayerId,
) -> Option<&'a rainboids_server::protocol::ShipState> {
    p.ships.iter().find(|s| s.player == pid)
}

fn inter_arrival_ms(snaps: &[OurShip]) -> Vec<u128> {
    snaps
        .windows(2)
        .map(|w| (w[1].at - w[0].at).as_millis())
        .collect()
}

/// Small extension trait so we can pull one message from the underlying WS
/// without timing out on a 2s `Client::recv` default. We let the caller
/// own the deadline.
trait ClientExt {
    async fn ws_next(&mut self) -> Option<ServerMsg>;
}

impl ClientExt for Client {
    async fn ws_next(&mut self) -> Option<ServerMsg> {
        use futures_util::StreamExt;
        use tokio_tungstenite::tungstenite::Message as WsMessage;
        loop {
            match self.ws.next().await? {
                Ok(WsMessage::Binary(buf)) => return Some(common::decode_server(&buf)),
                Ok(WsMessage::Ping(_) | WsMessage::Pong(_)) => continue,
                Ok(WsMessage::Close(_)) | Err(_) => return None,
                Ok(_) => continue,
            }
        }
    }
}
