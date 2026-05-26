// GamepadHandler — dual-analog (twin-stick) gamepad input for DualShock 4
// / Xbox controllers. Left stick moves, right stick aims; triggers fire,
// bumpers open the weapon radials, face buttons dash / activate the
// defense ability, Options/Start pauses.
//
// Activation is governed by the player's chosen control scheme (see
// game-engine.controlScheme): the pad only drives gameplay when the scheme
// is 'gamepad'. A pad can be connected while the player keeps playing with
// mouse + keyboard (or touch) — `isConnected()` is connection-state and
// gates the GAMEPAD pause-menu tab + tutorial section regardless of scheme,
// so the player can always switch over.
//
// Standard W3C "standard" mapping (DS4 / Xbox both report this in Chrome):
//   axes:    0/1 = left stick X/Y,  2/3 = right stick X/Y
//   buttons: 0 Cross/A, 1 Circle/B, 2 Square/X, 3 Triangle/Y,
//            4 L1/LB, 5 R1/RB, 6 L2/LT, 7 R2/RT,
//            8 Share/Back, 9 Options/Start, 12-15 D-pad U/D/L/R
//
// Action map:
//   Left stick / D-pad → move          Right stick → aim
//   R2 → fire primary                  L2 → fire / charge power
//   R1 (hold) → primary weapon radial  L1 (hold) → power weapon radial
//   Triangle (hold) → defense radial   Circle → activate defense ability
//   Cross → dash                       Options → pause / resume
// While a radial is held, the sticks pick the slice and releasing the
// button commits it (dead-zone release cancels).

import { GAME_STATES } from '../core/constants.js';
import { ACTIONS, GAMEPAD_BUTTON, GAMEPAD_LAYOUTS, createGamepadBindingState } from './bindings.js';
import { GamepadFocusController } from './gamepad-focus.js';

const MOVE_DEADZONE = 0.22;     // radial deadzone for the left (move) stick
const AIM_DEADZONE = 0.28;      // radial deadzone for the right (aim) stick
const TRIGGER_THRESHOLD = 0.4;  // analog trigger press point
const RADIAL_SELECT_DEADZONE = 0.35; // stick deflection needed to pick a slice

// Button indices (standard mapping).
const BTN_CROSS = GAMEPAD_BUTTON.A;
const BTN_CIRCLE = GAMEPAD_BUTTON.B;
const BTN_SQUARE = GAMEPAD_BUTTON.X;
const BTN_TRIANGLE = GAMEPAD_BUTTON.Y;
const BTN_L1 = GAMEPAD_BUTTON.LB;
const BTN_R1 = GAMEPAD_BUTTON.RB;
const BTN_L2 = GAMEPAD_BUTTON.LT;
const BTN_R2 = GAMEPAD_BUTTON.RT;
const BTN_OPTIONS = GAMEPAD_BUTTON.START;
const BTN_DPAD_UP = GAMEPAD_BUTTON.DPAD_UP, BTN_DPAD_DOWN = GAMEPAD_BUTTON.DPAD_DOWN,
    BTN_DPAD_LEFT = GAMEPAD_BUTTON.DPAD_LEFT, BTN_DPAD_RIGHT = GAMEPAD_BUTTON.DPAD_RIGHT;
const GAMEPAD_LAYOUT_STORAGE_KEY = 'rainboids:gamepad-layout';

// Radial deadzone with re-scaling: inside the deadzone returns a zero
// vector; outside, magnitude ramps 0→1 from the deadzone edge to full
// deflection so there's no velocity discontinuity at the threshold.
function applyDeadzone(x, y, dz) {
    const mag = Math.hypot(x, y);
    if (!(mag > dz)) return { x: 0, y: 0, magnitude: 0 };
    const scaled = Math.min((mag - dz) / (1 - dz), 1);
    return { x: (x / mag) * scaled, y: (y / mag) * scaled, magnitude: scaled };
}

const ZERO_VEC = { x: 0, y: 0, magnitude: 0 };

export class GamepadHandler {
    constructor(engine) {
        this.engine = engine;
        this._connected = false;
        this._index = null;
        // Rising-edge trackers for one-shot actions.
        this._prevDash = false;
        this._prevAbility = [false, false, false, false];
        this._prevPause = false;
        // GP-2 — L3 (TOGGLE_AUTO_AIM) is a rising-edge toggle; R3 (LOCK_ON) is
        // a held modifier read each frame (no edge state needed).
        this._prevToggleAutoAim = false;
        // GP-1 — pad-driven menu navigation. A lazily-created focus controller
        // points at whichever overlay is open (v1: the pause overlay); the
        // up/down/confirm/cancel intents are rising-edge.
        this._menuFocus = null;
        this._menuRoot = null;
        this._prevNavUp = false;
        this._prevNavDown = false;
        this._prevConfirm = false;
        this._prevCancel = false;
        // U3 — D-pad tab cycling while the BUILD/shop tree is open.
        this._prevTabPrev = false;
        this._prevTabNext = false;
        // Which radial type (if any) the gamepad currently has open.
        this._heldRadial = null;
        this.layout = this._loadLayout();
        this._onConnect = this._onConnect.bind(this);
        this._onDisconnect = this._onDisconnect.bind(this);
    }

    install() {
        if (typeof window === 'undefined') return;
        window.addEventListener('gamepadconnected', this._onConnect);
        window.addEventListener('gamepaddisconnected', this._onDisconnect);
        // A pad already present at page load (e.g. reload with the pad
        // connected) may not refire gamepadconnected until first input,
        // so scan once up front.
        this._scan();
    }

    isConnected() { return this._connected; }
    getLayout() { return GAMEPAD_LAYOUTS[this.layout] ? this.layout : 'pro'; }
    setLayout(layout) {
        this.layout = GAMEPAD_LAYOUTS[layout] ? layout : 'pro';
        try { localStorage.setItem(GAMEPAD_LAYOUT_STORAGE_KEY, this.layout); } catch (_) {}
    }

    _loadLayout() {
        try {
            const saved = localStorage.getItem(GAMEPAD_LAYOUT_STORAGE_KEY);
            return GAMEPAD_LAYOUTS[saved] ? saved : 'pro';
        } catch (_) {
            return 'pro';
        }
    }

    _schemeIsGamepad() {
        return !!(this.engine && this.engine.controlScheme === 'gamepad');
    }

    // ── Connection tracking ────────────────────────────────────────────

    _getPads() {
        if (typeof navigator === 'undefined' || !navigator.getGamepads) return [];
        try { return navigator.getGamepads() || []; } catch (_) { return []; }
    }

    _scan() {
        const pads = this._getPads();
        for (let i = 0; i < pads.length; i++) {
            if (pads[i] && pads[i].connected) {
                this._setConnected(true, pads[i].index);
                return;
            }
        }
    }

    _activePad() {
        const pads = this._getPads();
        if (this._index !== null && pads[this._index] && pads[this._index].connected) {
            return pads[this._index];
        }
        for (let i = 0; i < pads.length; i++) {
            if (pads[i] && pads[i].connected) {
                this._index = pads[i].index;
                return pads[i];
            }
        }
        return null;
    }

    _onConnect(e) {
        this._setConnected(true, e && e.gamepad ? e.gamepad.index : null);
    }

    _onDisconnect() {
        // Only drop connected state if no other pad remains.
        const pads = this._getPads();
        for (let i = 0; i < pads.length; i++) {
            if (pads[i] && pads[i].connected) { this._scan(); return; }
        }
        this._setConnected(false, null);
    }

    _setConnected(connected, index) {
        const changed = connected !== this._connected;
        this._connected = connected;
        this._index = connected ? index : null;
        if (changed && this.engine && typeof this.engine.onGamepadConnectionChange === 'function') {
            this.engine.onGamepadConnectionChange(connected);
        }
    }

    _pressed(gp, i) {
        const b = gp.buttons && gp.buttons[i];
        if (b == null) return false;
        if (typeof b === 'object') return !!b.pressed || (b.value || 0) > TRIGGER_THRESHOLD;
        return b > TRIGGER_THRESHOLD;
    }

    // ── Frame poll (any state) ──────────────────────────────────────────
    // Handles the pause edge and the weapon-radial lifecycle. Runs every
    // render frame because the radial menu freezes the gameplay update loop
    // (so the gameplay `poll` below stops being called while it's open).
    pollFrame() {
        const input = this.engine && this.engine.inputHandler && this.engine.inputHandler.input;
        if (!this._schemeIsGamepad()) { this._resetFrameState(); return; }
        const gp = this._activePad();
        if (!gp || !input) { this._resetFrameState(); return; }

        // Pause / resume — Options/Start, rising edge.
        const pause = this._pressed(gp, BTN_OPTIONS);
        if (pause && !this._prevPause && this.engine && typeof this.engine.togglePause === 'function') {
            this.engine.togglePause();
        }
        this._prevPause = pause;

        // U3 — D-pad ◂ ▸ cycles the BUILD/shop tabs (rising edge). cycleShopTab
        // is a no-op unless the tree overlay is visible, so this never clashes
        // with D-pad movement (that's read in the gameplay `poll`, when the
        // overlay is closed).
        if (typeof this.engine.cycleShopTab === 'function') {
            const tPrev = this._pressed(gp, BTN_DPAD_LEFT);
            const tNext = this._pressed(gp, BTN_DPAD_RIGHT);
            if (tPrev && !this._prevTabPrev) this.engine.cycleShopTab(-1);
            if (tNext && !this._prevTabNext) this.engine.cycleShopTab(1);
            this._prevTabPrev = tPrev;
            this._prevTabNext = tNext;
        }

        // GP-1 — pad-navigate an open menu (v1: the pause overlay). When a
        // navigable overlay is up, the left stick / D-pad up-down move a focus
        // marker through its controls (auto-discovered by the focus
        // controller), A activates the focused control, B backs out (resume).
        // This owns the frame while a menu is open, so radials don't co-fire.
        const menuRoot = this._activeMenuRoot();
        if (menuRoot) {
            if (!this._menuFocus) this._menuFocus = new GamepadFocusController(null, { wrap: true });
            if (this._menuRoot !== menuRoot) {
                this._menuFocus.setRoot(menuRoot);
                this._menuRoot = menuRoot;
                this._menuFocus.focusFirst();
            }
            const axes = gp.axes || [];
            const ly = axes.length > 1 ? axes[1] : 0;
            const navUp = ly < -0.5 || this._pressed(gp, BTN_DPAD_UP);
            const navDown = ly > 0.5 || this._pressed(gp, BTN_DPAD_DOWN);
            if (navUp && !this._prevNavUp) this._menuFocus.handleAction('up');
            if (navDown && !this._prevNavDown) this._menuFocus.handleAction('down');
            this._prevNavUp = navUp;
            this._prevNavDown = navDown;
            const confirm = this._pressed(gp, BTN_CROSS);
            if (confirm && !this._prevConfirm) this._menuFocus.handleAction('confirm');
            this._prevConfirm = confirm;
            const cancel = this._pressed(gp, BTN_CIRCLE);
            if (cancel && !this._prevCancel && typeof this.engine.togglePause === 'function') {
                this.engine.togglePause(); // B = back = resume
            }
            this._prevCancel = cancel;
            return; // menu nav owns the frame
        } else if (this._menuRoot) {
            // Overlay closed — drop the focus marker + edge state.
            if (this._menuFocus) this._menuFocus.clear();
            this._menuRoot = null;
            this._prevNavUp = this._prevNavDown = this._prevConfirm = this._prevCancel = false;
        }

        // Weapon radials — hold a bumper / Triangle to open, sticks pick the
        // slice, release commits (or cancels in the dead zone).
        const radial = this.engine.radialMenu;
        if (!radial) return;
        const classic = this.getLayout() === 'classic';
        const want = classic
            ? (this._pressed(gp, BTN_R1) ? 'primary'
                : this._pressed(gp, BTN_L1) ? 'power'
                : this._pressed(gp, BTN_TRIANGLE) ? 'ability'
                : null)
            : null;
        const state = this.engine.game && this.engine.game.state;
        const playable = state === GAME_STATES.PLAYING || state === GAME_STATES.WAVE_TRANSITION;

        if (this._heldRadial) {
            if (want === this._heldRadial && radial.isOpen()) {
                this._driveRadialSelection(gp, input);
            } else {
                // Released or switched buttons → commit the highlighted slice
                // (handleClick cancels itself if the stick is in the dead zone).
                if (radial.isOpen()) radial.handleClick();
                this._heldRadial = null;
            }
        }
        if (!this._heldRadial && want && playable && !radial.isOpen()) {
            radial.openFor(want);
            if (radial.isOpen()) {
                this._heldRadial = want;
                this._driveRadialSelection(gp, input);
            }
        }
    }

    // Point the radial's hover cursor (input.screenAimX/Y, read by
    // RadialMenu.getHoverIndex) along the active stick. Dead-zone → center,
    // which reads as "no selection" so a release there cancels.
    _driveRadialSelection(gp, input) {
        const eng = this.engine;
        const axes = gp.axes || [];
        let sx = axes.length > 2 ? axes[2] : 0;
        let sy = axes.length > 3 ? axes[3] : 0;
        if (Math.hypot(sx, sy) < RADIAL_SELECT_DEADZONE) {
            sx = axes.length > 0 ? axes[0] : 0; // fall back to the left stick
            sy = axes.length > 1 ? axes[1] : 0;
        }
        const mag = Math.hypot(sx, sy);
        const cx = eng.width / 2, cy = eng.height / 2;
        if (mag > RADIAL_SELECT_DEADZONE) {
            const R = Math.min(eng.width, eng.height) * 0.20;
            input.screenAimX = cx + (sx / mag) * R;
            input.screenAimY = cy + (sy / mag) * R;
        } else {
            input.screenAimX = cx;
            input.screenAimY = cy;
        }
    }

    // GP-1 — the DOM root of the currently-open, pad-navigable overlay, or
    // null. v1 covers the pause overlay; later increments extend this to the
    // shop / armory / settings / wave-pick / inventory overlays.
    _activeMenuRoot() {
        const eng = this.engine;
        if (!eng || !eng.game || eng.game.state !== GAME_STATES.PAUSED) return null;
        const el = eng.uiManager && eng.uiManager.elements && eng.uiManager.elements.pauseOverlay;
        return (el && el.style && el.style.display === 'flex') ? el : null;
    }

    _resetFrameState() {
        this._prevPause = false;
        this._prevTabPrev = false;
        this._prevTabNext = false;
        // GP-1 — drop any menu focus marker + nav edge state on scheme/pad loss.
        if (this._menuFocus) this._menuFocus.clear();
        this._menuRoot = null;
        this._prevNavUp = false;
        this._prevNavDown = false;
        this._prevConfirm = false;
        this._prevCancel = false;
        // If a gamepad-opened radial is still up when we lose the scheme/pad,
        // close it cleanly so it doesn't strand the frozen gameplay loop.
        if (this._heldRadial && this.engine && this.engine.radialMenu && this.engine.radialMenu.isOpen()) {
            this.engine.radialMenu.cancel();
        }
        this._heldRadial = null;
    }

    // ── Gameplay poll (PLAYING / WAVE_TRANSITION) ───────────────────────
    // Writes movement / aim / fire / dash / ability. Not called while a radial
    // is open (the update loop is frozen then) — radial input lives in
    // pollFrame above.
    poll(input) {
        if (!input) return;
        if (!this._schemeIsGamepad()) {
            this._release(input);
            return;
        }
        const gp = this._activePad();
        if (!gp) { this._release(input); return; }

        const axes = gp.axes || [];
        let lx = axes.length > 0 ? axes[0] : 0;
        let ly = axes.length > 1 ? axes[1] : 0;
        // D-pad fallback → full-deflection digital movement.
        if (this._pressed(gp, BTN_DPAD_LEFT)) lx = -1; else if (this._pressed(gp, BTN_DPAD_RIGHT)) lx = 1;
        if (this._pressed(gp, BTN_DPAD_UP)) ly = -1; else if (this._pressed(gp, BTN_DPAD_DOWN)) ly = 1;
        const move = applyDeadzone(lx, ly, MOVE_DEADZONE);

        const rx = axes.length > 2 ? axes[2] : 0;
        const ry = axes.length > 3 ? axes[3] : 0;
        const aim = applyDeadzone(rx, ry, AIM_DEADZONE);

        input.gamepadActive = true;
        input.stickInput = move;
        input.aimStick = aim;
        input.fire = this._pressed(gp, BTN_R2);          // R2 → primary
        input.fireSecondary = this._pressed(gp, BTN_L2); // L2 → power

        const actions = createGamepadBindingState(gp, this.getLayout());
        const dash = !!actions[ACTIONS.DASH];
        if (dash && !this._prevDash) {
            input.dashPulse = true;
            input.dashTargetScreenX = null; // pad dash uses steer/assist direction
            input.dashTargetScreenY = null;
        }
        this._prevDash = dash;

        const abilityButtons = this.getLayout() === 'classic'
            ? [this._pressed(gp, BTN_CIRCLE), false, false, false]
            : [
                !!actions[ACTIONS.ABILITY_1],
                !!actions[ACTIONS.ABILITY_2],
                !!actions[ACTIONS.ABILITY_3],
                !!actions[ACTIONS.ABILITY_4],
            ];
        input.activateAbilitySlot = input.activateAbilitySlot || [false, false, false, false];
        for (let i = 0; i < abilityButtons.length; i++) {
            if (abilityButtons[i] && !this._prevAbility[i]) {
                if (this.getLayout() === 'classic' && i === 0) input.activateAbility = true;
                else input.activateAbilitySlot[i] = true;
            }
        }
        this._prevAbility = abilityButtons;

        // GP-2 — the two stick-click bindings that were declared in bindings.js
        // but never read. L3 rising-edge toggles Auto Aim (persisted via
        // setAssist so the HUD + ASSISTS tab reflect it); R3 held soft-locks aim
        // to the nearest threat (player.js's aim block consumes input.lockOn,
        // snapping aim while keeping movement steerable).
        const toggleAutoAim = !!actions[ACTIONS.TOGGLE_AUTO_AIM];
        if (toggleAutoAim && !this._prevToggleAutoAim && this.engine && typeof this.engine.setAssist === 'function') {
            const cur = !!(this.engine.assists && this.engine.assists.autoAim);
            this.engine.setAssist('autoAim', !cur);
        }
        this._prevToggleAutoAim = toggleAutoAim;
        input.lockOn = !!actions[ACTIONS.LOCK_ON];
    }

    // Release any input the pad was driving (scheme switched away or pad
    // unplugged) so fire/movement don't stick on.
    _release(input) {
        if (input.gamepadActive) {
            input.gamepadActive = false;
            input.fire = false;
            input.fireSecondary = false;
            input.stickInput = ZERO_VEC;
            input.aimStick = ZERO_VEC;
            input.lockOn = false; // GP-2 — don't leave a stale soft-lock on scheme switch
        }
        this._prevDash = false;
        this._prevAbility = [false, false, false, false];
        this._prevToggleAutoAim = false;
    }
}
