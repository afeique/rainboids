// Shared input action registry for keyboard, gamepad, and touch hints.
// Runtime handlers can consume these bindings directly; UI surfaces use the
// glyph descriptors so controls read consistently across overlays.

export const ACTIONS = Object.freeze({
    MOVE: 'MOVE',
    AIM: 'AIM',
    FIRE_PRIMARY: 'FIRE_PRIMARY',
    FIRE_POWER: 'FIRE_POWER',
    DASH: 'DASH',
    ABILITY_1: 'ABILITY_1',
    ABILITY_2: 'ABILITY_2',
    ABILITY_3: 'ABILITY_3',
    ABILITY_4: 'ABILITY_4',
    PAUSE: 'PAUSE',
    OPEN_SHOP: 'OPEN_SHOP',
    MENU_CONFIRM: 'MENU_CONFIRM',
    MENU_BACK: 'MENU_BACK',
    MENU_PREV_TAB: 'MENU_PREV_TAB',
    MENU_NEXT_TAB: 'MENU_NEXT_TAB',
    TOGGLE_AUTO_AIM: 'TOGGLE_AUTO_AIM',
    LOCK_ON: 'LOCK_ON',
});

export const GAMEPAD_BUTTON = Object.freeze({
    A: 0,
    B: 1,
    X: 2,
    Y: 3,
    LB: 4,
    RB: 5,
    LT: 6,
    RT: 7,
    SELECT: 8,
    START: 9,
    L3: 10,
    R3: 11,
    DPAD_UP: 12,
    DPAD_DOWN: 13,
    DPAD_LEFT: 14,
    DPAD_RIGHT: 15,
});

export const DEFAULT_KEYBOARD_BINDINGS = Object.freeze({
    [ACTIONS.MOVE]: [{ kind: 'key', code: 'WASD', label: 'WASD' }],
    [ACTIONS.AIM]: [{ kind: 'mouse', code: 'MOUSE', label: 'Mouse' }],
    [ACTIONS.FIRE_PRIMARY]: [{ kind: 'mouse', code: 'MouseLeft', label: 'LMB' }, { kind: 'key', code: 'ArrowUp', label: 'Up' }],
    [ACTIONS.FIRE_POWER]: [{ kind: 'key', code: 'Space', label: 'Space' }, { kind: 'mouse', code: 'MouseRight', label: 'RMB' }],
    [ACTIONS.DASH]: [{ kind: 'key', code: 'ShiftLeft', label: 'Shift' }],
    [ACTIONS.ABILITY_1]: [{ kind: 'key', code: 'Digit1', label: '1' }],
    [ACTIONS.ABILITY_2]: [{ kind: 'key', code: 'Digit2', label: '2' }],
    [ACTIONS.ABILITY_3]: [{ kind: 'key', code: 'Digit3', label: '3' }],
    [ACTIONS.ABILITY_4]: [{ kind: 'key', code: 'Digit4', label: '4' }],
    [ACTIONS.PAUSE]: [{ kind: 'key', code: 'Escape', label: 'Esc' }],
});

export const GAMEPAD_LAYOUTS = Object.freeze({
    pro: Object.freeze({
        [ACTIONS.MOVE]: [{ kind: 'axis', code: 'LS', label: 'LS' }],
        [ACTIONS.AIM]: [{ kind: 'axis', code: 'RS', label: 'RS' }],
        [ACTIONS.FIRE_PRIMARY]: [{ kind: 'button', code: GAMEPAD_BUTTON.RT, label: 'RT' }],
        [ACTIONS.FIRE_POWER]: [{ kind: 'button', code: GAMEPAD_BUTTON.LT, label: 'LT' }],
        [ACTIONS.DASH]: [{ kind: 'button', code: GAMEPAD_BUTTON.RB, label: 'RB' }],
        [ACTIONS.ABILITY_1]: [{ kind: 'button', code: GAMEPAD_BUTTON.A, label: 'A' }],
        [ACTIONS.ABILITY_2]: [{ kind: 'button', code: GAMEPAD_BUTTON.B, label: 'B' }],
        [ACTIONS.ABILITY_3]: [{ kind: 'button', code: GAMEPAD_BUTTON.X, label: 'X' }],
        [ACTIONS.ABILITY_4]: [{ kind: 'button', code: GAMEPAD_BUTTON.Y, label: 'Y' }],
        [ACTIONS.PAUSE]: [{ kind: 'button', code: GAMEPAD_BUTTON.START, label: 'Start' }],
        [ACTIONS.OPEN_SHOP]: [{ kind: 'button', code: GAMEPAD_BUTTON.SELECT, label: 'Select' }],
        [ACTIONS.MENU_CONFIRM]: [{ kind: 'button', code: GAMEPAD_BUTTON.A, label: 'A' }],
        [ACTIONS.MENU_BACK]: [{ kind: 'button', code: GAMEPAD_BUTTON.B, label: 'B' }],
        [ACTIONS.MENU_PREV_TAB]: [{ kind: 'button', code: GAMEPAD_BUTTON.LB, label: 'LB' }],
        [ACTIONS.MENU_NEXT_TAB]: [{ kind: 'button', code: GAMEPAD_BUTTON.RB, label: 'RB' }],
        [ACTIONS.TOGGLE_AUTO_AIM]: [{ kind: 'button', code: GAMEPAD_BUTTON.L3, label: 'L3' }],
        [ACTIONS.LOCK_ON]: [{ kind: 'button', code: GAMEPAD_BUTTON.R3, label: 'R3' }],
    }),
    classic: Object.freeze({
        [ACTIONS.MOVE]: [{ kind: 'axis', code: 'LS', label: 'LS' }],
        [ACTIONS.AIM]: [{ kind: 'axis', code: 'RS', label: 'RS' }],
        [ACTIONS.FIRE_PRIMARY]: [{ kind: 'button', code: GAMEPAD_BUTTON.RT, label: 'RT' }],
        [ACTIONS.FIRE_POWER]: [{ kind: 'button', code: GAMEPAD_BUTTON.LT, label: 'LT' }],
        [ACTIONS.DASH]: [{ kind: 'button', code: GAMEPAD_BUTTON.A, label: 'A' }],
        [ACTIONS.ABILITY_1]: [{ kind: 'button', code: GAMEPAD_BUTTON.B, label: 'B' }],
        [ACTIONS.PAUSE]: [{ kind: 'button', code: GAMEPAD_BUTTON.START, label: 'Start' }],
        [ACTIONS.MENU_CONFIRM]: [{ kind: 'button', code: GAMEPAD_BUTTON.A, label: 'A' }],
        [ACTIONS.MENU_BACK]: [{ kind: 'button', code: GAMEPAD_BUTTON.B, label: 'B' }],
        [ACTIONS.MENU_PREV_TAB]: [{ kind: 'button', code: GAMEPAD_BUTTON.LB, label: 'LB' }],
        [ACTIONS.MENU_NEXT_TAB]: [{ kind: 'button', code: GAMEPAD_BUTTON.RB, label: 'RB' }],
    }),
});

export const DEFAULT_TOUCH_BINDINGS = Object.freeze({
    [ACTIONS.MOVE]: [{ kind: 'touch', code: 'STICK', label: 'Stick' }],
    [ACTIONS.DASH]: [{ kind: 'touch', code: 'TAP', label: 'Tap' }],
    [ACTIONS.FIRE_PRIMARY]: [{ kind: 'assist', code: 'AUTO', label: 'AUTO' }],
    [ACTIONS.FIRE_POWER]: [{ kind: 'assist', code: 'AUTO', label: 'AUTO' }],
    [ACTIONS.ABILITY_1]: [{ kind: 'assist', code: 'AUTO', label: 'AUTO' }],
    [ACTIONS.ABILITY_2]: [{ kind: 'assist', code: 'AUTO', label: 'AUTO' }],
    [ACTIONS.ABILITY_3]: [{ kind: 'assist', code: 'AUTO', label: 'AUTO' }],
    [ACTIONS.ABILITY_4]: [{ kind: 'assist', code: 'AUTO', label: 'AUTO' }],
});

export function abilityAction(slot) {
    return [ACTIONS.ABILITY_1, ACTIONS.ABILITY_2, ACTIONS.ABILITY_3, ACTIONS.ABILITY_4][slot] || ACTIONS.ABILITY_1;
}

export function getBindingsForDevice(device = 'keyboard', opts = {}) {
    if (device === 'gamepad') return GAMEPAD_LAYOUTS[opts.layout || 'pro'] || GAMEPAD_LAYOUTS.pro;
    if (device === 'touch') return DEFAULT_TOUCH_BINDINGS;
    return DEFAULT_KEYBOARD_BINDINGS;
}

export function getBinding(device, action, opts = {}) {
    const bindings = getBindingsForDevice(device, opts);
    const list = bindings[action];
    return Array.isArray(list) ? list[0] : null;
}

export function getBindingLabel(device, action, opts = {}) {
    const b = getBinding(device, action, opts);
    return b ? b.label : '';
}

export function createGamepadBindingState(raw, layout = 'pro') {
    const bindings = getBindingsForDevice('gamepad', { layout });
    const byButton = new Map();
    for (const [action, entries] of Object.entries(bindings)) {
        for (const entry of entries || []) {
            if (entry.kind === 'button' && !byButton.has(entry.code)) byButton.set(entry.code, action);
        }
    }
    const buttons = raw?.buttons || [];
    const pressed = {};
    for (const [button, action] of byButton) {
        const b = buttons[button];
        const down = typeof b === 'object' ? !!b.pressed || (b.value || 0) > 0.4 : (b || 0) > 0.4;
        pressed[action] = down;
    }
    return pressed;
}
