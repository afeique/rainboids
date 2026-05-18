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

const MOVEMENT_KEYS = new Set([
    "w", "a", "s", "d",
    "W", "A", "S", "D",
    "ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight",
]);

const state = {
    up: false,
    down: false,
    left: false,
    right: false,
    mouseX: 0,
    mouseY: 0,
    fire: false,
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
        if (event.repeat) return;
        if (setDir(event.key, true)) {
            if (MOVEMENT_KEYS.has(event.key)) event.preventDefault();
        }
    });

    window.addEventListener("keyup", (event) => {
        if (setDir(event.key, false)) {
            if (MOVEMENT_KEYS.has(event.key)) event.preventDefault();
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
        if (event.button === 0) state.fire = true;
    });

    canvas.addEventListener("mouseup", (event) => {
        if (event.button === 0) state.fire = false;
    });

    // If the page loses focus mid-keypress, the keyup never fires; clear
    // everything so the ship doesn't drift forever.
    window.addEventListener("blur", () => {
        state.up = false;
        state.down = false;
        state.left = false;
        state.right = false;
        state.fire = false;
    });
}

export function getState() {
    return state;
}
