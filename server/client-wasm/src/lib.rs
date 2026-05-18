//! # rainboids-client-wasm
//!
//! WebAssembly bindings exposing the shared `rainboids_sim` crate's
//! `mp1` sim to the Rainboids multiplayer browser client at `/mp` (see
//! `js/mp/mp-main.js`). wasm-pack builds this crate to `js/mp/wasm/`
//! and the browser drives the simulation tick from JS.
//!
//! ## Phase 1 surface (2026-05-17)
//!
//! - `smoke_test() -> 42` and `build_info()` for the boot smoke check.
//! - `World` — opaque handle wrapping a `Box<GameState>`. Methods:
//!   `new`, `set_input`, `tick`, `ship_x`, `ship_y`, `ship_angle`,
//!   `ship_vx`, `ship_vy`, `field_width`, `field_height`.
//!
//! The JS client constructs one `World`, pushes input every frame,
//! calls `tick(dt)`, then reads ship state for rendering. No server,
//! no networking — Phase 1 is single-client local prediction only.

use rainboids_sim::mp1::{tick_phase1, GameState, PlayerInput};
use wasm_bindgen::prelude::*;

/// Smoke test: returns `42` so the browser can confirm the WASM module
/// loaded and a call round-tripped through wasm-bindgen successfully.
#[wasm_bindgen]
pub fn smoke_test() -> u32 {
    42
}

/// Static build identifier surfaced to the browser console for
/// debugging which `rainboids-client-wasm` build is loaded.
#[wasm_bindgen]
pub fn build_info() -> String {
    String::from(concat!(
        "rainboids-client-wasm ",
        env!("CARGO_PKG_VERSION"),
        " (Phase 1 — mp1::tick_phase1)"
    ))
}

/// Opaque handle to a Phase-1 `GameState`. The JS client constructs
/// one of these on `/mp` boot, pushes input each frame via
/// `set_input`, advances physics with `tick`, then reads ship state.
#[wasm_bindgen]
pub struct World {
    state: GameState,
    input: PlayerInput,
}

#[wasm_bindgen]
impl World {
    /// Construct a new world with the default Phase-1 game state
    /// (one ship centered on the 1920×1080 field, facing up).
    #[wasm_bindgen(constructor)]
    pub fn new() -> World {
        World {
            state: GameState::new(),
            input: PlayerInput::neutral(),
        }
    }

    /// Update the input for the next tick. Booleans are the WASD /
    /// arrow keys; `aim_x` / `aim_y` are the mouse position projected
    /// into world coords (0..1920, 0..1080).
    pub fn set_input(
        &mut self,
        up: bool,
        down: bool,
        left: bool,
        right: bool,
        aim_x: f32,
        aim_y: f32,
    ) {
        self.input.up = up;
        self.input.down = down;
        self.input.left = left;
        self.input.right = right;
        self.input.aim_x = aim_x;
        self.input.aim_y = aim_y;
    }

    /// Advance simulation by one tick. `dt` is seconds (unused by
    /// Phase-1 ship physics, which works in per-tick deltas; accepted
    /// for forward compatibility with future delta-time integration).
    pub fn tick(&mut self, dt: f32) {
        tick_phase1(&mut self.state, &self.input, dt);
    }

    // ── Read-only accessors ──

    pub fn ship_x(&self) -> f32 {
        self.state.ship.x
    }

    pub fn ship_y(&self) -> f32 {
        self.state.ship.y
    }

    pub fn ship_vx(&self) -> f32 {
        self.state.ship.vx
    }

    pub fn ship_vy(&self) -> f32 {
        self.state.ship.vy
    }

    pub fn ship_angle(&self) -> f32 {
        self.state.ship.angle
    }

    pub fn ship_radius(&self) -> f32 {
        self.state.ship.radius
    }

    pub fn field_width(&self) -> f32 {
        self.state.field_w
    }

    pub fn field_height(&self) -> f32 {
        self.state.field_h
    }

    pub fn tick_count(&self) -> u32 {
        self.state.tick
    }
}

impl Default for World {
    fn default() -> Self {
        Self::new()
    }
}
