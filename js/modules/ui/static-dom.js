// 5.100.2 — Centralized DOM builder for the previously-static markup
// in index.html. Owns the pause menu (actions + tabs + tab content),
// the wave-pick overlay, the shop overlay header, and the stats
// overlay panel.
//
// Why: the static markup in index.html and the dynamic re-renders in
// ui-manager / shop-dom / wave-manager could DRIFT — a label updated
// in JS but not in HTML produced a flash of stale text on first open.
// Centralizing every static-once block here means JS is the single
// source of truth for layout AND content.
//
// All builders run BEFORE the UIManager / StatsOverlay constructors
// look up DOM ids, so element bindings still resolve cleanly. The
// boot sequence (in main.js) is:
//
//   1. shouldBlockDesktopOnly() check
//   2. buildStaticDom()                  ← THIS FILE
//   3. setupCanvas / setupAudio / setupManagers
//
// Each builder uses createElement (no innerHTML) so XSS-style escapes
// aren't an issue and the structure is auditable.

import { isMobile } from '../platform/platform-detect.js';
import { buildFontControls } from './font-settings.js';
import { bindingGlyph } from './icons.js';

/**
 * Public entry point. Walks the document and populates every empty
 * stub. Safe to call multiple times — idempotent on each section
 * (we check for a child sentinel before rebuilding).
 */
export function buildStaticDom() {
    _buildLivesDisplay();
    _buildHudShopBtn();
    _buildHudPauseBtn();
    _buildPauseMenu();
    _buildWavePickOverlay();
    _buildShopSuggestOverlay();
    _buildShopOverlay();
    _buildStatsOverlay();
    _buildInventoryOverlay();
    _buildHintOverlay();
    _buildTutorialOverlay();
}

// ── Tutorial overlay (6.28.0) ──────────────────────────────────────
// Title-screen TUTORIAL button opens this. Scrollable sections explain
// controls, primary + power weapons, the defense ability, upgrades,
// and kill streaks / bonuses. In-game tooltips were removed; this is
// where the explanatory text now lives.
function _buildTutorialOverlay() {
    const overlay = document.getElementById('tutorial-overlay');
    if (!overlay || !markBuilt(overlay, 'tutorial-v1')) return;
    overlay.replaceChildren();
    overlay.className = 'ui-element';
    Object.assign(overlay.style, {
        display: 'none',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
    });

    const panel = el('div', { id: 'tutorial-panel', className: 'tutorial-panel' });
    overlay.appendChild(panel);

    const closeBtn = el('button', { id: 'tutorial-close-button', className: 'shop-close', text: '×' });
    closeBtn.setAttribute('aria-label', 'Close tutorial');
    closeBtn.addEventListener('click', () => { overlay.style.display = 'none'; });
    panel.appendChild(closeBtn);

    panel.appendChild(el('h2', { className: 'tutorial-title', text: 'HOW TO PLAY' }));

    const section = (title, lines) => {
        const sec = el('div', { className: 'tutorial-section' });
        sec.appendChild(el('h3', { className: 'tutorial-section-title', text: title }));
        for (const line of lines) {
            sec.appendChild(el('div', { className: 'tutorial-line', text: line }));
        }
        return sec;
    };

    const body = el('div', { className: 'tutorial-body' });
    body.appendChild(section('CONTROLS', [
        'Move — WASD / arrow keys (drag to move on mobile).',
        'Aim — mouse (Co-Pilot auto-aims on mobile).',
        'Primary weapon — hold LEFT CLICK to fire continuously.',
        'Power weapon — RIGHT CLICK / SPACE (costs energy — see below).',
        'Abilities — 1 / 2 / 3 / 4.   Dash — SHIFT.',
        'Pause — ESC.   Stats — backtick (`).',
    ]));
    // GAMEPAD section — built hidden; the engine reveals it whenever a pad
    // is connected (see game-engine._refreshGamepadTabVisibility →
    // ui-manager.setGamepadTutorialVisible). DualShock 4 / Xbox layout.
    const gamepadSection = section('GAMEPAD (DUALSHOCK 4 / XBOX)', [
        'Move — left stick.   Aim — right stick (twin-stick).',
        'Fire primary — R2.   Fire / charge power — L2.',
        'Dash — R1/RB.   Abilities — Cross/A, Circle/B, Square/X, Triangle/Y.',
        'Classic layout keeps dash on Cross/A and the old held radials.',
        'Pause — Options / Start.',
        'Choose Gamepad vs Mouse + Keyboard / Touch in pause → GAMEPAD tab.',
    ]);
    gamepadSection.id = 'tutorial-gamepad-section';
    gamepadSection.style.display = 'none';
    body.appendChild(gamepadSection);
    body.appendChild(section('PRIMARY WEAPONS', [
        'Five primaries: Pulse Cannon, Storm Needles, Scatter Shot,',
        'Rail Driver, Cluster Launcher. Swap them in the pause menu.',
        'Each has its own upgrade tree: Multishot, Rapid Fire, Piercing,',
        'Big Bullets, Explosive, Homing, Stun %, and Knockback %.',
    ]));
    body.appendChild(section('POWER WEAPONS', [
        'Right-click weapons (Charge Shot, Mine Layer, Nova Blast,',
        'Missile Salvo, Lance Beam, Lightning Arc).',
        'Each spends ENERGY, which recharges automatically over time.',
        'The ship charges up as the meter (next to health) fills;',
        'every power weapon costs a different amount to fire.',
    ]));
    body.appendChild(section('DEFENSE ABILITY', [
        'Your defensive move (e.g. Phase Dash) runs off a CHARGE meter.',
        'Land hits / survive to fill it; trigger it when fully charged',
        'for an i-frame dodge or burst.',
    ]));
    body.appendChild(section('UPGRADES', [
        'Spend gold in the UPGRADES panel (🛒). Four tabs:',
        'PRIMARY / POWER / DEFENSE / PASSIVE.',
        'Passives include Health, Toughness, Vampirism, Thorns,',
        'Crit Chance, Crit Damage, and Evasion (dodge).',
        'Hover any node to see its name, effect, and cost.',
    ]));
    body.appendChild(section('KILL STREAKS & BONUSES', [
        'Consecutive kills build a streak that ramps your damage AND',
        'gold-find (the HUD shows your current +% GOLD). Taking damage',
        'resets the streak. Clearing a stage grants a survivor-card pick;',
        'boss waves grant a bonus pick on top.',
    ]));
    panel.appendChild(body);
}

// ── HUD buttons + lives display ────────────────────────────────────
// 5.102.0 — Previously inline in index.html. Lives-display has
// triforce content driven from JS, and the two HUD buttons need
// their children + aria attrs built without flash.

function _buildLivesDisplay() {
    const el0 = document.getElementById('lives-display');
    if (!el0 || !markBuilt(el0, 'lives-v1')) return;
    el0.replaceChildren();
    // Default triforce content — engine overwrites textContent at
    // runtime, but a sensible default keeps first-paint identical to
    // the legacy inline markup.
    el0.appendChild(document.createTextNode('▲'));
    el0.appendChild(el('br'));
    el0.appendChild(document.createTextNode('▲▲'));
}

function _buildHudShopBtn() {
    const btn = document.getElementById('hud-shop-btn');
    if (!btn || !markBuilt(btn, 'hud-shop-v1')) return;
    btn.replaceChildren();
    btn.textContent = '🛒';
}

function _buildHudPauseBtn() {
    const btn = document.getElementById('hud-pause-btn');
    if (!btn || !markBuilt(btn, 'hud-pause-v1')) return;
    btn.replaceChildren();
    btn.appendChild(el('span', { className: 'hud-pause-bar' }));
    btn.appendChild(el('span', { className: 'hud-pause-bar' }));
}

// ── Customization overlay ──────────────────────────────────────────
// 5.102.0 — Stub now empty in index.html; builder owns the markup.

// ── Hint overlay ───────────────────────────────────────────────────
// 5.102.0 — `.hint-text` child built here so hint-system can find it
// at module init without inline markup in index.html.

function _buildHintOverlay() {
    const overlay = document.getElementById('hint-overlay');
    if (!overlay || !markBuilt(overlay, 'hint-v1')) return;
    overlay.replaceChildren();
    overlay.appendChild(el('div', { className: 'hint-text' }));
}

// ── Helpers ────────────────────────────────────────────────────────

function el(tag, opts = {}) {
    const node = document.createElement(tag);
    if (opts.id) node.id = opts.id;
    if (opts.className) node.className = opts.className;
    if (opts.text) node.textContent = opts.text;
    if (opts.html) node.innerHTML = opts.html; // svg-only; never user text
    if (opts.style) Object.assign(node.style, opts.style);
    if (opts.attrs) for (const k of Object.keys(opts.attrs)) node.setAttribute(k, opts.attrs[k]);
    if (opts.children) for (const c of opts.children) if (c) node.appendChild(c);
    return node;
}

function svgNs(name) {
    const SVG_NS = 'http://www.w3.org/2000/svg';
    return document.createElementNS(SVG_NS, name);
}

// Idempotency guard — a sentinel attribute on the root so re-calling
// buildStaticDom() doesn't duplicate children.
function markBuilt(node, key) {
    if (!node) return false;
    if (node.dataset.builtDom === key) return false;
    node.dataset.builtDom = key;
    return true;
}

// ── Pause overlay ──────────────────────────────────────────────────

function _buildPauseMenu() {
    const overlay = document.getElementById('pause-overlay');
    if (!overlay || !markBuilt(overlay, 'pause-v1')) return;
    overlay.replaceChildren();
    overlay.className = 'ui-element';
    Object.assign(overlay.style, {
        display: 'none',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
    });

    const menu = el('div', { id: 'pause-menu' });
    overlay.appendChild(menu);

    // ── Action row: SHOP / RESUME ──
    // 6.1.0 — SHOP button gets a `--primary` modifier so styles.css can
    // give it a brighter gold tint vs the plain RESUME button. The
    // unified shop (POWERUPS / INVENTORY / weapon upgrades) is the main
    // spending surface; making it the visually-louder option steers
    // players into the new flow.
    const actions = el('div', { className: 'pause-menu-actions' });
    // Legacy gold UPGRADES shop button — commented out (retired in favor of the
    // per-run CARD draft + pre-run ARMORY). shop-dom.js is kept for reuse.
    // const shopBtn = _pauseActionBtn('pause-shop-button', '🛒', 'UPGRADES');
    // shopBtn.classList.add('pause-action-btn--primary');
    // actions.appendChild(shopBtn);
    actions.appendChild(_pauseActionBtn('pause-resume-button', '►', 'RESUME'));
    menu.appendChild(actions);

    // ── Tab strip ──
    // The ASSISTS tab is always built. It's shown on desktop, and on
    // mobile it's hidden until a gamepad is connected (touch-only mobile
    // bakes assists into the input model, so it has no toggles). The
    // engine toggles the button's visibility via
    // UIManager.setAssistsTabVisible() on gamepad connect/disconnect and
    // at boot — see game-engine._refreshAssistsTabVisibility().
    // The GAMEPAD tab is built on every platform but hidden by default; the
    // engine reveals it whenever a gamepad is connected (any platform) and
    // re-hides it on disconnect — see game-engine._refreshGamepadTabVisibility().
    const mobile = isMobile();
    const tabs = el('div', { className: 'pause-tabs' });
    const tabDefs = [
        { key: 'controls', label: 'CONTROLS', active: true },
        { key: 'gamepad',  label: 'GAMEPAD' },
        { key: 'stats',    label: 'STATS' },
        // 6.x — PRIMARY + POWER tabs replaced by a single compact LOADOUT tab
        // (weapon + attunement / power + attunement / abilities + attunements).
        { key: 'loadout',  label: 'LOADOUT' },
        { key: 'passives', label: 'PASSIVES' },
        { key: 'assists',  label: 'ASSISTS' },
        { key: 'display',  label: 'DISPLAY' },
        { key: 'music',    label: 'MUSIC' },
        { key: 'sfx',      label: 'SFX' },
    ];
    for (const t of tabDefs) {
        const b = el('button', { className: 'pause-tab' + (t.active ? ' active' : ''), text: t.label });
        b.dataset.tab = t.key;
        // Hide the ASSISTS button by default on mobile; the engine reveals
        // it when a gamepad connects (and re-hides on disconnect).
        if (t.key === 'assists' && mobile) b.style.display = 'none';
        // The GAMEPAD button is always hidden until a pad is detected.
        if (t.key === 'gamepad') b.style.display = 'none';
        tabs.appendChild(b);
    }
    menu.appendChild(tabs);

    // ── Tab content stubs ──
    menu.appendChild(el('div', { id: 'controls-tab', className: 'pause-tab-content active' }));
    // GAMEPAD tab — static control reference, shown only while a pad is
    // connected (button visibility gates access).
    menu.appendChild(_buildGamepadTab());
    // STATS tab — populated by ui-manager.updateStatsTab() with the
    // shared SP-allocation card (passive stat icons + [−]/[+] controls).
    menu.appendChild(el('div', { id: 'stats-tab',    className: 'pause-tab-content' }));
    // LOADOUT tab — populated by ui-manager.updateLoadoutTab(): compact active
    // weapon/power/abilities + their attunements, owned-only, switch in-flight.
    menu.appendChild(el('div', { id: 'loadout-tab',  className: 'pause-tab-content' }));
    // PASSIVES tab — populated by ui-manager.updatePassivesTab(): the in-run
    // swap panel (assign owned passives to unlocked slots; P5b).
    menu.appendChild(el('div', { id: 'passives-tab', className: 'pause-tab-content' }));
    // Assists tab content is always built (the toggles are needed for the
    // mobile-with-gamepad case); the tab button's visibility is what gates
    // access on mobile.
    menu.appendChild(_buildAssistsTab());
    menu.appendChild(_buildDisplayTab());
    menu.appendChild(_buildMusicTab());
    menu.appendChild(_buildSfxTab());
}

// DISPLAY tab — font (typography) settings. Reuses the shared font-picker
// controls (also used by the title-screen SETTINGS overlay). Built once;
// the controls read current settings and persist + apply on change.
function _buildDisplayTab() {
    const controls = el('div');
    buildFontControls(controls);
    return el('div', {
        id: 'display-tab',
        className: 'pause-tab-content',
        children: [
            el('h2', { text: 'DISPLAY' }),
            el('div', {
                style: { marginBottom: '15px', color: '#aaa', fontSize: 'calc(13px * var(--font-body-scale, 1))', textAlign: 'center' },
                text: 'Menu fonts. Headers + tabs use one font, body text another. Pixel by default; changes persist between runs.',
            }),
            controls,
        ],
    });
}

function _pauseActionBtn(id, icon, label) {
    return el('button', {
        id,
        className: 'pause-action-btn',
        children: [
            el('span', { className: 'pause-btn-icon', text: icon }),
            el('span', { className: 'pause-btn-label', text: label }),
        ],
    });
}

function _buildGamepadTab() {
    // Static DualShock 4 / Xbox control reference + control-scheme picker.
    // Built on every platform but only reachable while a gamepad is
    // connected — the tab button's visibility is toggled by the engine on
    // connect/disconnect. Reuses the assists-row styling (control name as
    // the title, action as the description) so it needs no bespoke CSS.
    // GP-3 — glyph rows carry their gamepad button labels in `buttons`; the
    // control column is rendered from the family glyph map (default Xbox at
    // build time, since no pad is connected yet) and re-rendered to the
    // connected pad's family when the tab opens (ui-manager.refreshGamepadGlyphs
    // reads the `data-gp-buttons` marker). Prose rows (sticks / D-pad) have no
    // family variants.
    const rows = [
        { control: 'Left Stick',  action: 'Move ship (analog — speed scales with deflection)' },
        { control: 'Right Stick', action: 'Aim (twin-stick — points the ship where you push)' },
        { control: 'D-Pad',       action: 'Move ship (digital fallback)' },
        { buttons: ['RT'],            action: 'Fire primary weapon' },
        { buttons: ['LT'],            action: 'Fire / charge power weapon' },
        { buttons: ['RB'],            action: 'Dash in steer direction; when still, dash away from nearest threat' },
        { buttons: ['A', 'B', 'X', 'Y'], action: 'Activate ability slots 1-4' },
        { control: 'Classic layout',  action: 'Keeps the dash on the bottom face button and the old held radials' },
        { buttons: ['Start'],         action: 'Pause / resume' },
    ];

    const glyphsFor = (labels, family = 'xbox') =>
        labels.map((l) => bindingGlyph({ kind: 'button', label: l }, { family })).join(' · ');

    const list = el('div', { className: 'assists-list' });
    for (const r of rows) {
        const title = el('div', {
            className: 'assist-row-title',
            text: r.buttons ? glyphsFor(r.buttons) : r.control,
        });
        if (r.buttons) title.dataset.gpButtons = r.buttons.join(',');
        list.appendChild(el('div', {
            className: 'assist-row',
            children: [
                el('div', {
                    className: 'assist-row-text',
                    children: [title, el('div', { className: 'assist-row-desc', text: r.action })],
                }),
            ],
        }));
    }

    // Control-scheme picker — lets the player keep mouse + keyboard / touch
    // even with a pad plugged in. The alternate option is platform-specific
    // (TOUCH on mobile, MOUSE + KB on desktop); its scheme value lives in a
    // data attribute so the wiring in ui-manager stays platform-agnostic.
    const mobile = isMobile();
    const altLabel = mobile ? 'TOUCH' : 'MOUSE + KB';
    const altScheme = mobile ? 'touch' : 'keyboard';
    const gpBtn = el('button', { id: 'control-scheme-gamepad', className: 'pause-tab', text: 'GAMEPAD' });
    gpBtn.dataset.scheme = 'gamepad';
    const altBtn = el('button', { id: 'control-scheme-alt', className: 'pause-tab', text: altLabel });
    altBtn.dataset.scheme = altScheme;
    const schemeRow = el('div', {
        className: 'pause-tabs',
        style: { marginBottom: '14px', justifyContent: 'center' },
        children: [gpBtn, altBtn],
    });
    const proBtn = el('button', { id: 'gamepad-layout-pro', className: 'pause-tab active', text: 'PRO' });
    proBtn.dataset.layout = 'pro';
    const classicBtn = el('button', { id: 'gamepad-layout-classic', className: 'pause-tab', text: 'CLASSIC' });
    classicBtn.dataset.layout = 'classic';
    const layoutRow = el('div', {
        className: 'pause-tabs',
        style: { marginBottom: '14px', justifyContent: 'center' },
        children: [proBtn, classicBtn],
    });

    return el('div', {
        id: 'gamepad-tab',
        className: 'pause-tab-content',
        children: [
            el('h2', { text: 'GAMEPAD' }),
            el('div', {
                style: { marginBottom: '10px', color: '#aaa', fontSize: 'calc(13px * var(--font-body-scale, 1))', textAlign: 'center' },
                text: 'Play with:',
            }),
            schemeRow,
            el('div', {
                style: { marginBottom: '10px', color: '#aaa', fontSize: 'calc(13px * var(--font-body-scale, 1))', textAlign: 'center' },
                text: 'Layout:',
            }),
            layoutRow,
            // GP-4 — rumble toggle (off by default; reuses the assists-row look).
            el('label', {
                className: 'assist-row',
                style: { marginBottom: '10px' },
                children: [
                    el('input', { id: 'gamepad-rumble-toggle', attrs: { type: 'checkbox' } }),
                    el('div', {
                        className: 'assist-row-text',
                        children: [
                            el('div', { className: 'assist-row-title', text: 'Rumble' }),
                            el('div', { className: 'assist-row-desc', text: 'Controller vibration on dashes. Off by default.' }),
                        ],
                    }),
                ],
            }),
            list,
        ],
    });
}

function _buildAssistsTab() {
    // 6.195.0 — Auto Fire drives primary fire. Smart power timing lives
    // in the Assist System so power energy is spent deliberately.
    // The same toggle set serves desktop AND mobile-with-gamepad (a
    // gamepad turns mobile into a twin-stick experience where the player
    // chooses their own assists). Touch-only mobile never sees this tab
    // (its assists are baked into tap-to-shoot), so a single row set is
    // correct everywhere the tab is actually reachable.
    const rows = [
        { id: 'assist-aim-assist', title: 'Aim Assist',
          desc: 'Reticle snaps onto nearby targets.' },
        { id: 'assist-auto-aim', title: 'Auto Aim',
          desc: 'Automatically aim at the nearest target.' },
        { id: 'assist-auto-fire', title: 'Auto Fire',
          desc: 'Fire primary automatically; power timing is handled by Smart Power.' },
        { id: 'assist-auto-cast-abilities', title: 'Auto-Cast Abilities',
          desc: 'Let the Co-Pilot trigger defensive and crowd-control abilities when danger spikes.' },
        // 6.2.3 — Laser Sight toggle. Renders the muzzle laser / cone-
        // of-fire wedge so the player can read aim + spread at a glance.
        { id: 'assist-laser-sight', title: 'Laser Sight',
          desc: 'Show the muzzle laser pointer and spread cone.' },
    ];

    const list = el('div', { className: 'assists-list' });
    for (const r of rows) {
        const checkbox = el('input', { id: r.id, attrs: { type: 'checkbox' } });
        const label = el('label', {
            className: 'assist-row',
            children: [
                checkbox,
                el('div', {
                    className: 'assist-row-text',
                    children: [
                        el('div', { className: 'assist-row-title', text: r.title }),
                        el('div', { className: 'assist-row-desc',  text: r.desc }),
                    ],
                }),
            ],
        });
        list.appendChild(label);
    }
    // AS-2/3/4 — Co-Pilot tuning. A segmented LEVEL preset, a segmented
    // auto-dodge INTENSITY, and an AGGRESSION slider, all driving the
    // AssistSystem config and persisting via setAssist (AS-1). Reuses the
    // pause-menu segmented-button idiom (`pause-tab` in a `pause-tabs` row,
    // `.active` toggled). Placed above the granular helper toggles because
    // the LEVEL preset bundles them.
    const segGroup = (titleText, descText, btns) => {
        const row = el('div', {
            className: 'pause-tabs',
            style: { marginBottom: '6px', justifyContent: 'center', flexWrap: 'wrap' },
        });
        for (const b of btns) {
            const btn = el('button', { id: b.id, className: 'pause-tab', text: b.label });
            btn.dataset[b.dataKey] = b.dataVal;
            row.appendChild(btn);
        }
        return el('div', {
            style: { marginBottom: '14px' },
            children: [
                el('div', { className: 'assist-row-title', style: { textAlign: 'center' }, text: titleText }),
                el('div', { className: 'assist-row-desc', style: { textAlign: 'center', marginBottom: '6px' }, text: descText }),
                row,
            ],
        });
    };

    const levelSection = segGroup(
        'Co-Pilot Level',
        'How much the AI Co-Pilot does for you.',
        [
            { id: 'assist-level-manual-touch', dataKey: 'level', dataVal: 'manual-touch', label: 'MANUAL' },
            { id: 'assist-level-co-pilot',     dataKey: 'level', dataVal: 'co-pilot',     label: 'CO-PILOT' },
            { id: 'assist-level-autopilot',    dataKey: 'level', dataVal: 'autopilot',    label: 'AUTOPILOT' },
        ],
    );

    const dodgeSection = segGroup(
        'Auto-Dodge',
        'Let the Co-Pilot dash you clear of danger. Your manual tap-dash always overrides.',
        [
            { id: 'assist-dodge-off',          dataKey: 'dodge', dataVal: 'off',          label: 'OFF' },
            { id: 'assist-dodge-conservative', dataKey: 'dodge', dataVal: 'conservative', label: 'NORMAL' },
            { id: 'assist-dodge-aggressive',   dataKey: 'dodge', dataVal: 'aggressive',   label: 'AGGRESSIVE' },
        ],
    );

    const aggroSlider = el('input', {
        id: 'assist-aggression-slider',
        attrs: { type: 'range', min: '10', max: '100', value: '55' },
        style: { flex: '1' },
    });
    const aggroValue = el('span', { id: 'assist-aggression-value', style: { minWidth: '45px', textAlign: 'right' }, text: '55%' });
    const aggroSection = el('div', {
        style: { marginBottom: '18px' },
        children: [
            el('div', { className: 'assist-row-title', style: { textAlign: 'center' }, text: 'Aggression' }),
            el('div', { className: 'assist-row-desc', style: { textAlign: 'center', marginBottom: '6px' }, text: 'How eagerly the Co-Pilot spends abilities and power weapons.' }),
            el('div', { style: { display: 'flex', alignItems: 'center', gap: '10px' }, children: [aggroSlider, aggroValue] }),
        ],
    });

    const helperText = 'Optional aim and fire helpers. Settings persist between runs.';
    return el('div', {
        id: 'assists-tab',
        className: 'pause-tab-content',
        children: [
            el('h2', { text: 'ASSISTS' }),
            el('div', {
                style: { marginBottom: '15px', color: '#aaa', fontSize: 'calc(13px * var(--font-body-scale, 1))', textAlign: 'center' },
                text: helperText,
            }),
            levelSection,
            dodgeSection,
            aggroSection,
            list,
        ],
    });
}

function _buildSfxTab() {
    return el('div', {
        id: 'sfx-tab',
        className: 'pause-tab-content',
        children: [
            el('h2', { text: 'SOUND EFFECTS' }),
            el('div', {
                id: 'sfx-volume-container',
                style: { marginTop: '30px' },
                children: [
                    el('div', { style: { marginBottom: '15px', fontSize: 'calc(14px * var(--font-body-scale, 1))' }, text: 'Master Volume' }),
                    el('div', {
                        style: { display: 'flex', alignItems: 'center', gap: '15px' },
                        children: [
                            el('input', { id: 'sfx-volume-slider', attrs: { type: 'range', min: '0', max: '100', value: '50' }, style: { flex: '1' } }),
                            el('span', { id: 'sfx-volume-value', style: { minWidth: '45px', textAlign: 'right' }, text: '50%' }),
                        ],
                    }),
                ],
            }),
            el('div', {
                id: 'sfx-toggles-container',
                style: { marginTop: '30px' },
                children: [
                    el('div', { style: { marginBottom: '15px', fontSize: 'calc(14px * var(--font-body-scale, 1))' }, text: 'Individual Sounds' }),
                    el('div', { id: 'sfx-toggles', style: { display: 'flex', flexDirection: 'column', gap: '10px' } }),
                ],
            }),
        ],
    });
}

function _buildMusicTab() {
    const tab = el('div', { id: 'music-tab', className: 'pause-tab-content' });
    tab.appendChild(el('h2', { text: 'MUSIC' }));

    const player = el('div', { id: 'music-player' });

    player.appendChild(el('div', { id: 'current-track-name' }));

    // Progress row.
    const progressContainer = el('div', {
        id: 'music-progress-container',
        children: [
            el('span', { id: 'music-current-time', text: '0:00' }),
            el('div', {
                id: 'music-player-progress-bar',
                children: [
                    el('div', { id: 'music-player-buffered' }),
                    el('div', { id: 'music-player-progress' }),
                ],
            }),
            el('span', { id: 'music-duration', text: '0:00' }),
        ],
    });
    player.appendChild(progressContainer);

    // Music controls row — side / main / side.
    const controls = el('div', { id: 'music-controls' });

    // Left side: shuffle + random.
    const leftSide = el('div', { className: 'music-side-controls music-side-left' });
    leftSide.appendChild(_musicSvgBtn('music-shuffle', 'Shuffle playlist & play first track', _shuffleSvg()));
    leftSide.appendChild(_musicSvgBtn('music-random',  'Jump to a random track', _randomSvg()));
    controls.appendChild(leftSide);

    // Main: prev / play-pause / next.
    const main = el('div', { className: 'music-main-controls' });
    main.appendChild(_musicBtn('music-prev',       'Previous track', '⏮'));
    main.appendChild(_musicBtn('music-play-pause', 'Play / Pause',   '▶', 'large'));
    main.appendChild(_musicBtn('music-next',       'Next track',     '⏭'));
    controls.appendChild(main);

    // Right side: repeat.
    const rightSide = el('div', { className: 'music-side-controls music-side-right' });
    rightSide.appendChild(_musicSvgBtn('music-repeat', 'Repeat current track', _repeatSvg()));
    controls.appendChild(rightSide);

    player.appendChild(controls);

    // Volume row.
    const volContainer = el('div', {
        id: 'music-volume-container',
        style: { margin: '20px 0', display: 'flex', alignItems: 'center', gap: '15px' },
    });
    volContainer.appendChild(_speakerSvg());
    volContainer.appendChild(el('input', {
        id: 'music-volume-slider',
        attrs: { type: 'range', min: '0', max: '100', value: '50' },
        style: { flex: '1' },
    }));
    volContainer.appendChild(el('span', {
        id: 'music-volume-value',
        style: { minWidth: '45px', textAlign: 'right' },
        text: '50%',
    }));
    player.appendChild(volContainer);

    // Playlist.
    const playlistContainer = el('div', {
        id: 'playlist-container',
        children: [el('div', { id: 'playlist-tracks' })],
    });
    player.appendChild(playlistContainer);

    tab.appendChild(player);
    return tab;
}

function _musicBtn(id, tip, text, extra = '') {
    const b = el('button', {
        id,
        className: 'music-control-btn' + (extra ? ' ' + extra : ''),
        text,
    });
    if (tip) b.setAttribute('data-tooltip', tip);
    return b;
}

function _musicSvgBtn(id, tip, svgNode) {
    const b = el('button', { id, className: 'music-control-btn' });
    if (tip) b.setAttribute('data-tooltip', tip);
    b.appendChild(svgNode);
    return b;
}

function _shuffleSvg() {
    const svg = svgNs('svg');
    svg.setAttribute('width', '28');
    svg.setAttribute('height', '28');
    svg.setAttribute('viewBox', '0 -2 27 27');
    const g = svgNs('g');
    g.setAttribute('fill', '#00ccff');
    const path = svgNs('path');
    path.setAttribute('d', 'M22.528,15.166 C22.23,14.871 21.299,14.948 21,15.244 L21,17 L18,17 L14.71,12.887 L12.1,16.124 L16,21 L21,21 L21,22.781 C21.299,23.076 22.23,22.945 22.528,22.649 L26.771,19.442 C27.069,19.147 27.069,18.669 26.771,18.373 L22.528,15.166 Z M21,6 L21,7.688 C21.299,7.982 22.23,8.105 22.528,7.811 L26.771,4.604 C27.069,4.308 27.069,3.829 26.771,3.534 L22.528,0.326 C22.23,0.031 21.299,-0.139 21,0.156 L21,2 L16,2 L4,17 L2,17 C0.896,17 0,17.896 0,19 C0,20.104 0.896,21 2,21 L6,21 L18,6 L21,6 Z M2,6 L4,6 L7.29,10.113 L9.9,6.876 L6,2 L2,2 C0.896,2 0,2.896 0,4 C0,5.104 0.896,6 2,6 Z');
    g.appendChild(path);
    svg.appendChild(g);
    return svg;
}

function _randomSvg() {
    const svg = svgNs('svg');
    svg.setAttribute('width', '26');
    svg.setAttribute('height', '26');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', '#00ccff');
    const path = svgNs('path');
    path.setAttribute('d', 'M19.071 4.929a10 10 0 1 0 0 14.142 10 10 0 0 0 0-14.142zM7.5 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0 9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm4.5-4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm4.5 4.5a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3zm0-9a1.5 1.5 0 1 1 0-3 1.5 1.5 0 0 1 0 3z');
    svg.appendChild(path);
    return svg;
}

function _repeatSvg() {
    const svg = svgNs('svg');
    svg.setAttribute('width', '28');
    svg.setAttribute('height', '28');
    svg.setAttribute('viewBox', '-5.5 0 32 32');
    const path = svgNs('path');
    path.setAttribute('fill', '#00ccff');
    path.setAttribute('d', 'M14.156 5.406v2.969h-12.75c-0.5 0-0.938 0.438-0.938 0.969v8.25l3.344-2.969c0.156-0.188 0.313-0.25 0.469-0.344v-2.094h9.875v2.969c0 0.875 0.531 1.125 1.25 0.5l5.031-4.625c0.219-0.188 0.375-0.438 0.375-0.75 0-0.281-0.156-0.563-0.375-0.75l-5.031-4.625c-0.719-0.625-1.25-0.375-1.25 0.5zM20.313 14.406l-3.313 3c-0.156 0.125-0.375 0.219-0.5 0.313v2.094h-9.844v-3c0-0.875-0.531-1.094-1.25-0.469l-5.063 4.625c-0.219 0.188-0.344 0.438-0.344 0.75 0 0.281 0.125 0.563 0.344 0.75l5.063 4.594c0.719 0.625 1.25 0.406 1.25-0.469v-2.969h12.719c0.531 0 0.938-0.438 0.938-0.969v-8.25z');
    svg.appendChild(path);
    return svg;
}

function _speakerSvg() {
    const svg = svgNs('svg');
    svg.setAttribute('width', '24');
    svg.setAttribute('height', '24');
    svg.setAttribute('viewBox', '0 0 16 16');
    const paths = [
        'M6 1H8V15H6L2 11H0V5H2L6 1Z',
        'M14 8C14 5.79086 12.2091 4 10 4V2C13.3137 2 16 4.68629 16 8C16 11.3137 13.3137 14 10 14V12C12.2091 12 14 10.2091 14 8Z',
        'M12 8C12 9.10457 11.1046 10 10 10V6C11.1046 6 12 6.89543 12 8Z',
    ];
    for (const d of paths) {
        const p = svgNs('path');
        p.setAttribute('d', d);
        p.setAttribute('fill', '#0088ff');
        svg.appendChild(p);
    }
    return svg;
}

// ── Wave-pick overlay ──────────────────────────────────────────────

function _buildWavePickOverlay() {
    const overlay = document.getElementById('wave-pick-overlay');
    if (!overlay || !markBuilt(overlay, 'wave-pick-v1')) return;
    overlay.replaceChildren();
    overlay.className = 'ui-element';
    overlay.style.display = 'none';

    const panel = el('div', {
        id: 'wave-pick-panel',
        children: [
            el('h2',  { className: 'wave-pick-title',    text: 'CARD DRAFT' }),
            el('p',   { className: 'wave-pick-subtitle', text: 'PICK ONE' }),
            el('div', { id: 'wave-pick-cards' }),
            // R4 — in-run gold sinks (reroll / repair) rendered here.
            el('div', { id: 'wave-pick-actions' }),
        ],
    });
    overlay.appendChild(panel);
}

// ── Shop-suggest overlay (5.101.0) ─────────────────────────────────
// Fires after the survivor-card pick. Three weapon-relevant upgrades
// the player can buy with gold; CONTINUE button skips into the next
// wave. Re-renders in place after each purchase so the player can
// chain multiple buys without re-opening anything.
function _buildShopSuggestOverlay() {
    const overlay = document.getElementById('shop-suggest-overlay');
    if (!overlay || !markBuilt(overlay, 'shop-suggest-v1')) return;
    overlay.replaceChildren();
    overlay.className = 'ui-element';
    overlay.style.display = 'none';

    const panel = el('div', {
        id: 'shop-suggest-panel',
        children: [
            el('h2', { className: 'wave-pick-title', text: 'QUICK BUY' }),
            el('p',  { className: 'wave-pick-subtitle', text: 'WEAPON UPGRADES FOR YOUR LOADOUT' }),
            el('div', { id: 'shop-suggest-gold-row', children: [
                el('span', { id: 'shop-suggest-gold', text: '0 G' }),
            ]}),
            el('div', { id: 'shop-suggest-cards' }),
            el('button', {
                id: 'shop-suggest-skip',
                className: 'shop-suggest-skip',
                text: 'CONTINUE',
                attrs: { type: 'button' },
            }),
        ],
    });
    overlay.appendChild(panel);

    // Hook up the continue/skip button to close the overlay and start
    // the next wave. We resolve the engine via window.gameEngine so
    // the listener doesn't capture a stale reference at build time.
    const skipBtn = panel.querySelector('#shop-suggest-skip');
    if (skipBtn) {
        skipBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            const ge = window.gameEngine;
            if (ge && typeof ge.closeWavePickOverlay === 'function') {
                ge.closeWavePickOverlay();
            } else {
                overlay.style.display = 'none';
            }
        });
    }
}

// ── Shop overlay ───────────────────────────────────────────────────
// Phase 7 (2026-05-19) — Ability-tree rewrite. Replaces the list-based
// shop with a Diablo-style visual: 4 cluster regions (PRIMARY / POWER /
// DEFENSE / PASSIVES), each laying out weapon/ability parent nodes with
// per-weapon upgrade nodes orbiting them. No tab strip — every category
// is visible at once. The shop-tree CSS lives in css/styles.css under
// the SHOP ABILITY TREE section.
//
// Hidden compatibility shims kept for legacy test selectors:
//   - `#shop-items-list` + `.shop-tab` nodes are kept (visually hidden)
//     so the existing QA selectors still resolve. The tree itself lives
//     in `#shop-tree`. The legacy nodes are emptied of meaningful
//     content and have no event listeners.

function _buildShopOverlay() {
    const overlay = document.getElementById('shop-overlay');
    if (!overlay || !markBuilt(overlay, 'shop-tree-v2')) return;
    overlay.replaceChildren();
    overlay.className = 'ui-element';
    Object.assign(overlay.style, {
        display: 'none',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
    });

    const menu = el('div', { id: 'shop-menu', className: 'shop-menu--tree' });
    overlay.appendChild(menu);

    // Close button — kept in the top-left corner for muscle-memory.
    const closeBtn = el('button', { id: 'shop-close-button', className: 'shop-close', text: '×' });
    closeBtn.setAttribute('aria-label', 'Close shop');
    menu.appendChild(closeBtn);

    // ── Header ────────────────────────────────────────────────────
    // 6.27.0 — Gold balance on the left, title centered. Wave indicator
    // removed (the upgrades panel no longer surfaces wave). An empty
    // spacer holds the 3rd grid column so the title stays centered.
    const header = el('div', { className: 'shop-tree-header' });
    header.appendChild(el('div', {
        className: 'shop-tree-currency',
        children: [
            el('span', { className: 'shop-tree-currency-icon shop-currency-icon' }),
            el('span', { id: 'shop-coins-amount', className: 'shop-tree-currency-amount', text: '0' }),
        ],
    }));
    header.appendChild(el('h2', { className: 'shop-tree-title', text: 'UPGRADES' }));
    // Right column: Cores (✦) readout. BUILD-only — shop-dom shows it in
    // pre-run (Cores fund GEAR salvage/reroll/tier-up) and hides it in-run, so
    // it otherwise just balances the grid against the gold column.
    header.appendChild(el('div', {
        id: 'shop-tree-cores',
        className: 'shop-tree-cores',
        children: [
            el('span', { className: 'shop-tree-cores-icon', text: '✦' }),
            el('span', { id: 'shop-cores-amount', className: 'shop-tree-cores-amount', text: '0' }),
        ],
    }));
    menu.appendChild(header);

    // ── Legend ────────────────────────────────────────────────────
    // 6.27.0 — Moved to the TOP (was a center-overlaid footer). Reads
    // as a key for the tab content below it.
    const legend = el('div', { className: 'shop-tree-legend' });
    const legendEntries = [
        { cls: 'shop-tree-legend-swatch--unaffordable', label: 'Too expensive' },
        { cls: 'shop-tree-legend-swatch--affordable',   label: 'Affordable' },
        { cls: 'shop-tree-legend-swatch--owned',        label: 'Owned' },
        { cls: 'shop-tree-legend-swatch--maxed',        label: 'Maxed' },
    ];
    for (const entry of legendEntries) {
        legend.appendChild(el('div', {
            className: 'shop-tree-legend-entry',
            children: [
                el('span', { className: `shop-tree-legend-swatch ${entry.cls}` }),
                el('span', { className: 'shop-tree-legend-label', text: entry.label }),
            ],
        }));
    }
    menu.appendChild(legend);

    // ── Tab strip ─────────────────────────────────────────────────
    // 6.27.0 — One tab per category. Clicking a tab swaps which cluster
    // is visible (handled in shop-dom.initShopDom). Primary is the
    // default active tab.
    // 6.30.0 — Passives are obtainable ONLY from wave-clear survivor
    // cards (not buyable). The PASSIVE tab is kept as a READ-ONLY
    // display so the player can see which passives they've collected.
    const tabs = el('div', { id: 'shop-tree-tabs', className: 'shop-tree-tabs' });
    const tabDefs = [
        // GEAR + PASSIVES are shown only in pre-run BUILD mode (shop-dom toggles).
        { tab: 'gear',          label: 'GEAR' },
        { tab: 'primary',       label: 'PRIMARY' },
        { tab: 'power',         label: 'POWER' },
        { tab: 'defense',       label: 'DEFENSE' },
        // Phase P — the rule-modifier PASSIVES (equippable). Distinct from the
        // STATS tab below (the numeric wave-clear stat boons; §2 naming).
        { tab: 'passiveskills', label: 'PASSIVES' },
        { tab: 'passive',       label: 'STATS' },
    ];
    for (const t of tabDefs) {
        const btn = el('button', { className: 'shop-tree-tab', text: t.label });
        btn.type = 'button';
        btn.dataset.tab = t.tab;
        if (t.tab === 'primary') btn.classList.add('active');
        tabs.appendChild(btn);
    }
    menu.appendChild(tabs);

    // ── Pre-run instructions hint (BUILD-only) ────────────────────
    // A one-line "how to review your build" hint, shown only in pre-run mode
    // (shop-dom toggles + fills it in _applyPreRunChrome). Hidden in-run.
    const prerunHint = el('div', { id: 'shop-prerun-hint', className: 'shop-prerun-hint' });
    prerunHint.style.display = 'none';
    menu.appendChild(prerunHint);

    // ── Tree body ─────────────────────────────────────────────────
    // 4 cluster regions; only the active tab's cluster is shown (CSS
    // gates visibility off `#shop-tree[data-active-tab]`). shop-dom
    // renders into the cluster bodies — the containers are stable.
    const tree = el('div', { id: 'shop-tree', className: 'shop-tree' });
    tree.dataset.activeTab = 'primary';
    const clusters = [
        { id: 'shop-tree-gear',          tab: 'gear' },
        { id: 'shop-tree-primary',       tab: 'primary' },
        { id: 'shop-tree-power',         tab: 'power' },
        { id: 'shop-tree-defense',       tab: 'defense' },
        { id: 'shop-tree-passiveskills', tab: 'passiveskills' }, // rule-modifier passives
        { id: 'shop-tree-passives',      tab: 'passive' },       // STATS (stat boons)
    ];
    for (const c of clusters) {
        const cluster = el('section', { className: 'shop-tree-cluster' });
        cluster.dataset.cluster = c.id;
        cluster.dataset.tab = c.tab;
        cluster.appendChild(el('div', { id: c.id, className: 'shop-tree-cluster-body' }));
        tree.appendChild(cluster);
    }
    menu.appendChild(tree);

    // ── Pre-run BUILD footer (start-of-run mode only) ─────────────
    // 2026-05-23 — When the tree is opened as the start-of-run BUILD
    // screen (game-engine.openArmory → shopDom.showShopDom(true)), this
    // footer surfaces RUN SETUP + BACK / loadout status / START RUN. It
    // stays hidden for the in-run shop. shop-dom toggles its visibility +
    // wires the buttons in initShopDom / _applyPreRunChrome.
    // 6.225.5 — restructured into two tiers: a centered RUN SETUP card on
    // top, then a BACK · status · START action bar below. The control
    // groups are vertical (label over control) so labels stay legible and
    // the row no longer crams every button onto one line. The element IDs
    // are unchanged so shop-dom's wiring + gamepad focus keep working.
    const preFooter = el('div', { id: 'shop-prerun-footer', className: 'shop-prerun-footer' });
    preFooter.style.display = 'none'; // flipped to flex (column) by _applyPreRunChrome

    // Small helper: one labeled control group (label stacked over its row of
    // controls). `controls` are appended into the inner row so shop-dom's
    // `#shop-runsetup-*` querySelectorAll('.shop-runsetup-btn') still resolves.
    const _runSetupGroup = (id, labelText, controls) => {
        const group = el('div', { id, className: 'shop-runsetup-group' });
        group.appendChild(el('span', { className: 'shop-runsetup-label', text: labelText }));
        const row = el('div', { className: 'shop-runsetup-controls' });
        for (const c of controls) row.appendChild(c);
        group.appendChild(row);
        return group;
    };

    // ── RUN SETUP control card (RUN-06) ───────────────────────────
    // Lets the player pick the run shape — waves-per-stage (3/6/9) +
    // stage count (10-100, step 10) + difficulty MODE. A live readout
    // shows total waves + the reward multiplier. shop-dom wires the
    // controls + the readout and threads the choice into game.runConfig
    // on START RUN. Lives inside the BUILD-only footer, so it inherits
    // its visibility gate.
    const runSetup = el('div', { id: 'shop-runsetup', className: 'shop-runsetup' });
    runSetup.appendChild(el('span', { className: 'shop-runsetup-title', text: 'RUN SETUP' }));

    const groupsRow = el('div', { className: 'shop-runsetup-groups' });

    // Waves-per-stage segmented selector (3 / 6 / 9).
    const wpsButtons = [3, 6, 9].map((v) => {
        const b = el('button', { id: `shop-runsetup-wps-${v}`, className: 'shop-runsetup-btn', text: `${v}` });
        b.type = 'button';
        b.dataset.wps = `${v}`;
        return b;
    });
    groupsRow.appendChild(_runSetupGroup('shop-runsetup-wps', 'WAVES PER STAGE', wpsButtons));

    groupsRow.appendChild(el('span', { className: 'shop-runsetup-divider' }));

    // Stages stepper (− value + ), step 10, clamped [10,100].
    const decBtn = el('button', { id: 'shop-runsetup-stages-dec', className: 'shop-runsetup-step', text: '−' });
    decBtn.type = 'button';
    decBtn.setAttribute('aria-label', 'fewer stages');
    const stagesVal = el('span', { id: 'shop-runsetup-stages-value', className: 'shop-runsetup-value', text: '10' });
    const incBtn = el('button', { id: 'shop-runsetup-stages-inc', className: 'shop-runsetup-step', text: '+' });
    incBtn.type = 'button';
    incBtn.setAttribute('aria-label', 'more stages');
    groupsRow.appendChild(_runSetupGroup('shop-runsetup-stages', 'STAGES', [decBtn, stagesVal, incBtn]));

    groupsRow.appendChild(el('span', { className: 'shop-runsetup-divider' }));

    // ── Difficulty MODE selector (DIR-09) ─────────────────────────
    // Five segmented buttons Easy→Legendary that bias the adaptive
    // Director (§14). shop-dom wires the clicks (sets _preRunRunConfig.mode),
    // greys out gated EPIC/LEGENDARY (§14.7), and refreshes the readout.
    // Default selection is NORMAL; the choice rides into game.runConfig on
    // START RUN.
    const MODE_BTNS = [
        { id: 'easy', mode: 'EASY', label: 'EASY' },
        { id: 'normal', mode: 'NORMAL', label: 'NORMAL' },
        { id: 'hard', mode: 'HARD', label: 'HARD' },
        { id: 'epic', mode: 'EPIC', label: 'EPIC' },
        { id: 'legendary', mode: 'LEGENDARY', label: 'LEGENDARY' },
    ];
    const modeButtons = MODE_BTNS.map((m) => {
        const b = el('button', { id: `shop-runsetup-mode-${m.id}`, className: 'shop-runsetup-btn', text: m.label });
        b.type = 'button';
        b.dataset.mode = m.mode;
        return b;
    });
    groupsRow.appendChild(_runSetupGroup('shop-runsetup-mode', 'DIFFICULTY', modeButtons));

    runSetup.appendChild(groupsRow);

    // Live readout: "N waves · MODE · rewards ×W ×M" (DIR-09 adds the mode +
    // its per-mode reward multiplier; shop-dom keeps it in sync on every edit).
    runSetup.appendChild(el('div', { id: 'shop-runsetup-readout', className: 'shop-runsetup-readout', text: '30 waves · NORMAL · rewards ×1.0 ×1.0' }));

    // ── Action bar (BACK · status · START) ────────────────────────
    const actionBar = el('div', { className: 'shop-prerun-actions' });
    actionBar.append(
        el('button', { id: 'shop-prerun-back', className: 'armory-btn armory-btn--back', text: '← BACK' }),
        el('div', { id: 'shop-prerun-status', className: 'shop-prerun-status', text: '' }),
        el('button', { id: 'shop-prerun-start', className: 'armory-btn armory-btn--start', text: 'START RUN →' }),
    );

    preFooter.append(runSetup, actionBar);
    menu.appendChild(preFooter);

    // ── Floating tooltip ─────────────────────────────────────────
    // Hidden until a node is hovered; shop-dom positions it next to
    // the cursor and fills in name + description + stack + cost.
    const tip = el('div', { id: 'shop-tree-tooltip', className: 'shop-tree-tooltip' });
    tip.style.display = 'none';
    overlay.appendChild(tip);

    // ── Hidden legacy stubs (test back-compat) ────────────────────
    // `#shop-items-list` and the `.shop-tab` nodes are kept so the
    // existing QA test selectors still resolve. They have no visual
    // presence and no event listeners.
    const legacy = el('div', { className: 'shop-tree-legacy-hidden' });
    legacy.appendChild(el('div', { id: 'shop-items-list' }));
    const tabKeys = [
        'POWERUPS', 'INVENTORY', 'PULSE_CANNON', 'STORM_NEEDLES',
        'SCATTER_GUN', 'RAIL_DRIVER', 'CLUSTER_LAUNCHER', 'CHARGE_SHOT',
        'MINE_LAYER', 'NOVA_BLAST', 'MISSILE_SALVO', 'LANCE_BEAM',
        'LIGHTNING_ARC', 'PASSIVE', 'HELP',
    ];
    for (const key of tabKeys) {
        const stub = el('button', { className: 'shop-tab' });
        stub.dataset.tab = key;
        stub.setAttribute('aria-hidden', 'true');
        stub.tabIndex = -1;
        legacy.appendChild(stub);
    }
    menu.appendChild(legacy);
}

// ── Stats overlay ──────────────────────────────────────────────────

function _buildStatsOverlay() {
    const overlay = document.getElementById('stats-overlay');
    if (!overlay || !markBuilt(overlay, 'stats-v1')) return;
    overlay.replaceChildren();
    overlay.className = 'ui-element';
    Object.assign(overlay.style, {
        display: 'none',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        position: 'fixed',
        top: '0',
        left: '0',
        zIndex: '9000',
        pointerEvents: 'auto',
    });

    const panel = el('div', { id: 'stats-panel' });
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Player Stats');

    // Header
    const header = el('div', { id: 'stats-panel-header' });
    header.appendChild(el('h2', { id: 'stats-panel-title', text: 'CHARACTER' }));
    const close = el('button', { id: 'stats-panel-close', text: '×' });
    close.setAttribute('aria-label', 'Close stats');
    header.appendChild(close);
    panel.appendChild(header);

    // Body
    panel.appendChild(el('div', {
        id: 'stats-panel-body',
        children: [
            el('div', { id: 'stats-summary' }),
            el('div', { id: 'stats-columns' }),
        ],
    }));

    // Tooltip
    const tip = el('div', { id: 'stats-tooltip' });
    tip.setAttribute('role', 'tooltip');
    panel.appendChild(tip);

    // Footer
    const footer = el('div', { id: 'stats-panel-footer' });
    const hint = el('span', { className: 'stats-hint' });
    hint.appendChild(document.createTextNode('Hover stats for details · Press '));
    hint.appendChild(el('kbd', { text: '`' }));
    hint.appendChild(document.createTextNode(' or '));
    hint.appendChild(el('kbd', { text: 'Esc' }));
    hint.appendChild(document.createTextNode(' to close'));
    footer.appendChild(hint);
    panel.appendChild(footer);

    overlay.appendChild(panel);
}

// ── Inventory overlay (6.x — 'I' key) ──────────────────────────────
function _buildInventoryOverlay() {
    const overlay = document.getElementById('inventory-overlay');
    if (!overlay || !markBuilt(overlay, 'inventory-v1')) return;
    overlay.replaceChildren();
    overlay.className = 'ui-element';
    Object.assign(overlay.style, {
        display: 'none',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
        position: 'fixed',
        top: '0',
        left: '0',
        zIndex: '9000',
        pointerEvents: 'auto',
    });

    const panel = el('div', { id: 'inventory-panel' });
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'Inventory');

    const header = el('div', { id: 'inventory-header' });
    header.appendChild(el('h2', { id: 'inventory-title', text: 'INVENTORY' }));
    const close = el('button', { id: 'inventory-close', text: '×' });
    close.setAttribute('aria-label', 'Close inventory');
    header.appendChild(close);
    panel.appendChild(header);

    panel.appendChild(el('div', { id: 'inventory-body' }));

    const footer = el('div', { id: 'inventory-footer' });
    const hint = el('span', { className: 'stats-hint' });
    hint.appendChild(document.createTextNode('Press '));
    hint.appendChild(el('kbd', { text: 'I' }));
    hint.appendChild(document.createTextNode(' or '));
    hint.appendChild(el('kbd', { text: 'Esc' }));
    hint.appendChild(document.createTextNode(' to close'));
    footer.appendChild(hint);
    panel.appendChild(footer);

    overlay.appendChild(panel);
}
