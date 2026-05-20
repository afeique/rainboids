// MP input.
//
// Captures keyboard + mouse state for the Phase-1 single-ship local
// loop. Maintains a small internal struct (up/down/left/right/mouseX/
// mouseY/fire) that mp-engine.js reads every frame, projects into
// world coordinates, and forwards to the WASM sim's set_input().
//
// Phase-1 scope per docs/Multiplayer WASM Pivot - 2026-05-17.md:
// no PackedInput wire format yet (that's Phase 2 once the WebSocket
// turns on); for now this is just a local input snapshot.
//
// Mouse coordinates are tracked in CANVAS pixel space (relative to
// the canvas's bounding rect, accounting for any CSS scaling). The
// engine layer is responsible for the canvas-pixel -> world-coord
// projection because it owns the 1920x1080 logical-world scale.
//
// ── Keybinds ─────────────────────────────────────────────────────────
//   WASD / arrows  — thrust / strafe
//   Mouse-aim      — aim
//   LMB            — primary fire (`fire`)
//   RMB / Q        — power-weapon fire (`powerFire`)
//   1 / 2 / 3 / 4  — select primary weapon
//   Z              — cycle power weapon backward (`powerWeapon`)
//   X              — cycle power weapon forward (`powerWeapon`)
//
// Browser context-menu is suppressed on the canvas so RMB can be used
// as an action button.

const MOVEMENT_KEYS = new Set([
    "w", "a", "s", "d",
    "W", "A", "S", "D",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);

// Weapon kind discriminator (must match `mp1::weapon::KIND_*` in Rust).
export const WEAPON_PULSE_CANNON = 0;
export const WEAPON_STORM_NEEDLES = 1;
export const WEAPON_SCATTER_GUN = 2;
export const WEAPON_RAIL_DRIVER = 3;

// Power-weapon discriminator (must match `mp1::power_weapon::KIND_*` in
// Rust). HUD-facing display labels — index matches the u8 wire value.
export const POWER_WEAPON_NAMES = ['CHARGE', 'MINE', 'NOVA', 'MISSILE', 'LANCE', 'ARC'];
const POWER_WEAPON_COUNT = POWER_WEAPON_NAMES.length;

const state = {
    up: false,
    down: false,
    left: false,
    right: false,
    mouseX: 0,
    mouseY: 0,
    fire: false,
    // Phase 4 step 4 — currently-equipped weapon. Default PULSE_CANNON;
    // 1/2/3/4 keybinds cycle through the four base weapons.
    weapon: WEAPON_PULSE_CANNON,
    // Phase 4 step 6 — currently-equipped power weapon + held-fire bit.
    // powerWeapon defaults to 0 (CHARGE_SHOT); Z/X cycle through the six
    // entries of POWER_WEAPON_NAMES with wrap-around. powerFire is true
    // while RMB or Q is held.
    powerWeapon: 0,
    powerFire: false,
};

let installed = false;

function setDir(key, pressed) {
    switch (key) {
        case "w":
        case "W":
        case "ArrowUp":
            state.up = pressed;
            return true;
        case "s":
        case "S":
        case "ArrowDown":
            state.down = pressed;
            return true;
        case "a":
        case "A":
        case "ArrowLeft":
            state.left = pressed;
            return true;
        case "d":
        case "D":
        case "ArrowRight":
            state.right = pressed;
            return true;
        default:
            return false;
    }
}

export function init(canvas) {
    if (installed) return;
    installed = true;

    window.addEventListener("keydown", (event) => {
        if (event.repeat) {
            // Q held → power-fire stays asserted (no edge needed, but
            // we don't want repeat events to spam any per-edge logic
            // elsewhere either). Just early-out.
            return;
        }
        if (setDir(event.key, true)) {
            if (MOVEMENT_KEYS.has(event.key)) event.preventDefault();
            return;
        }
        // Weapon-cycle keybinds.
        switch (event.key) {
            case "1": state.weapon = WEAPON_PULSE_CANNON; break;
            case "2": state.weapon = WEAPON_STORM_NEEDLES; break;
            case "3": state.weapon = WEAPON_SCATTER_GUN; break;
            case "4": state.weapon = WEAPON_RAIL_DRIVER; break;
        }
        // Power-weapon controls (use event.code so layout-shifted keys
        // still match by physical position).
        switch (event.code) {
            case "KeyQ":
                state.powerFire = true;
                event.preventDefault();
                break;
            case "KeyZ":
                state.powerWeapon = (state.powerWeapon - 1 + POWER_WEAPON_COUNT) % POWER_WEAPON_COUNT;
                event.preventDefault();
                break;
            case "KeyX":
                state.powerWeapon = (state.powerWeapon + 1) % POWER_WEAPON_COUNT;
                event.preventDefault();
                break;
        }
    });

    window.addEventListener("keyup", (event) => {
        if (setDir(event.key, false)) {
            if (MOVEMENT_KEYS.has(event.key)) event.preventDefault();
        }
        if (event.code === "KeyQ") {
            state.powerFire = false;
            event.preventDefault();
        }
    });

    // Track mouse in canvas-pixel coordinates so the engine layer can
    // map them into world space using its own scale/translation. The
    // bounding rect handles CSS scaling (100vw/100vh on a HiDPI canvas
    // whose .width/.height are set to device pixels).
    canvas.addEventListener("mousemove", (event) => {
        const rect = canvas.getBoundingClientRect();
        const scaleX = rect.width > 0 ? canvas.width / rect.width : 1;
        const scaleY = rect.height > 0 ? canvas.height / rect.height : 1;
        state.mouseX = (event.clientX - rect.left) * scaleX;
        state.mouseY = (event.clientY - rect.top) * scaleY;
    });

    canvas.addEventListener("mousedown", (event) => {
        if (event.button === 0) {
            state.fire = true;
        } else if (event.button === 2) {
            // Right mouse button → power-fire. preventDefault() blocks
            // the browser context menu from popping over the canvas.
            state.powerFire = true;
            event.preventDefault();
        }
    });

    canvas.addEventListener("mouseup", (event) => {
        if (event.button === 0) {
            state.fire = false;
        } else if (event.button === 2) {
            state.powerFire = false;
            event.preventDefault();
        }
    });

    // Suppress the canvas context menu so RMB is usable as an action
    // button without the browser overlay stealing the click.
    canvas.addEventListener("contextmenu", (event) => {
        event.preventDefault();
    });

    // If the page loses focus mid-keypress, the keyup never fires; clear
    // everything so the ship doesn't drift forever.
    window.addEventListener("blur", () => {
        state.up = false;
        state.down = false;
        state.left = false;
        state.right = false;
        state.fire = false;
        state.powerFire = false;
    });
}

export function getState() {
    return state;
}
