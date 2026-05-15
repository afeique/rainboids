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
    _buildCustomizationOverlay();
    _buildHintOverlay();
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

function _buildCustomizationOverlay() {
    const overlay = document.getElementById('customization-overlay');
    if (!overlay || !markBuilt(overlay, 'customization-v1')) return;
    overlay.replaceChildren();
    overlay.appendChild(el('h2', { text: 'Control Layout' }));
    overlay.appendChild(el('p', {
        text: 'Drag the controls to your desired positions, then press Save.',
    }));
    overlay.appendChild(el('button', {
        id: 'save-layout-button',
        text: 'Save & Close',
    }));
}

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
    const actions = el('div', { className: 'pause-menu-actions' });
    actions.appendChild(_pauseActionBtn('pause-shop-button', '🛒', 'SHOP'));
    actions.appendChild(_pauseActionBtn('pause-resume-button', '►', 'RESUME'));
    menu.appendChild(actions);

    // ── Tab strip ──
    const tabs = el('div', { className: 'pause-tabs' });
    const tabDefs = [
        { key: 'controls', label: 'CONTROLS', active: true },
        { key: 'primary',  label: 'PRIMARY' },
        { key: 'power',    label: 'POWER' },
        // 5.101.0 — SKILLS tab suspended. Defensive skill system retired
        // in favor of inventory + defensive powerups + survivor cards.
        // { key: 'skills',   label: 'SKILLS' },
        { key: 'powerups', label: 'POWERUPS' },
        { key: 'assists',  label: 'ASSISTS' },
        { key: 'timer',    label: 'TIMER' },
        { key: 'music',    label: 'MUSIC' },
        { key: 'sfx',      label: 'SFX' },
    ];
    for (const t of tabDefs) {
        const b = el('button', { className: 'pause-tab' + (t.active ? ' active' : ''), text: t.label });
        b.dataset.tab = t.key;
        tabs.appendChild(b);
    }
    menu.appendChild(tabs);

    // ── Tab content stubs ──
    // Controls / Primary / Power / Powerups / Skills / Timer are filled
    // by ui-manager render functions at boot. We leave their stubs
    // empty here. Assists / Music / SFX get their initial markup
    // populated below.
    menu.appendChild(el('div', { id: 'controls-tab', className: 'pause-tab-content active' }));
    menu.appendChild(el('div', { id: 'primary-tab',  className: 'pause-tab-content' }));
    menu.appendChild(el('div', { id: 'power-tab',    className: 'pause-tab-content' }));
    // 5.101.0 — Skills tab content suspended along with the tab strip
    // entry above. Re-enable by uncommenting both edits.
    // menu.appendChild(_buildSkillsTab());
    menu.appendChild(el('div', { id: 'powerups-tab', className: 'pause-tab-content' }));
    menu.appendChild(_buildAssistsTab());
    menu.appendChild(_buildTimerTab());
    menu.appendChild(_buildMusicTab());
    menu.appendChild(_buildSfxTab());
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

function _buildSkillsTab() {
    return el('div', {
        id: 'skills-tab',
        className: 'pause-tab-content',
        children: [
            el('h2', { text: 'DEFENSE SKILL' }),
            el('div', {
                style: { marginBottom: '15px', color: '#aaa', fontSize: '12px', textAlign: 'center' },
                text: 'Click a skill to equip it',
            }),
            el('div', {
                id: 'skill-list',
                style: { display: 'flex', flexDirection: 'column', gap: '10px', marginTop: '10px' },
            }),
        ],
    });
}

function _buildAssistsTab() {
    // 5.102.0 — Platform-specific assist set. On mobile the player
    // ship is stationary and Aim Assist / Auto Aim / Auto Fire are
    // BAKED INTO the press-and-hold tap-to-shoot input (the touch
    // handler routes the press to a snapped target and fires while
    // held). Exposing them as toggles is misleading because they're
    // not really opt-out on mobile. The only assist that's still
    // user-controllable on mobile is AUTO POWER (the power weapon
    // can be tap-fired manually OR auto-fired the moment it's ready).
    // Desktop keeps the full set since the player has fine-grained
    // mouse/keyboard input and benefits from per-feature toggles.
    const mobile = isMobile();
    const desktopRows = [
        { id: 'assist-aim-assist', title: 'Aim Assist',
          desc: 'When the reticle is near a target, it snaps onto the target.' },
        { id: 'assist-auto-aim', title: 'Auto Aim',
          desc: 'Automatically tracks the nearest target. Overrides mouse aim.' },
        { id: 'assist-auto-fire', title: 'Auto Fire',
          desc: 'Fires the primary weapon automatically.' },
        { id: 'assist-auto-power', title: 'Auto Power',
          desc: "Fire the power weapon automatically when it's fully charged." },
    ];
    const mobileRows = [
        { id: 'assist-auto-power', title: 'Auto Power',
          desc: "Fire the power weapon automatically when it's ready. Overrides tap-to-fire when on." },
    ];
    const rows = mobile ? mobileRows : desktopRows;

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
    const helperText = mobile
        ? 'Aim Assist, Auto Aim, and Auto Fire are built into tap-to-shoot on mobile and always on.'
        : 'Optional aim and fire helpers. Settings persist between runs.';
    return el('div', {
        id: 'assists-tab',
        className: 'pause-tab-content',
        children: [
            el('h2', { text: 'ASSISTS' }),
            el('div', {
                style: { marginBottom: '15px', color: '#aaa', fontSize: '12px', textAlign: 'center' },
                text: helperText,
            }),
            list,
        ],
    });
}

function _buildTimerTab() {
    return el('div', {
        id: 'timer-tab',
        className: 'pause-tab-content',
        children: [
            el('h2', { text: 'RUN TIMER' }),
            el('div', { id: 'timer-panel-mount' }),
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
                    el('div', { style: { marginBottom: '15px', fontSize: '14px' }, text: 'Master Volume' }),
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
                    el('div', { style: { marginBottom: '15px', fontSize: '14px' }, text: 'Individual Sounds' }),
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
            el('h2',  { className: 'wave-pick-title',    text: 'WAVE CLEAR' }),
            el('p',   { className: 'wave-pick-subtitle', text: 'PICK YOUR REWARD' }),
            el('div', { id: 'wave-pick-cards' }),
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

function _buildShopOverlay() {
    const overlay = document.getElementById('shop-overlay');
    if (!overlay || !markBuilt(overlay, 'shop-v1')) return;
    overlay.replaceChildren();
    overlay.className = 'ui-element';
    Object.assign(overlay.style, {
        display: 'none',
        justifyContent: 'center',
        alignItems: 'center',
        width: '100%',
        height: '100%',
    });

    const menu = el('div', { id: 'shop-menu' });
    overlay.appendChild(menu);

    // Close + title.
    const closeBtn = el('button', { id: 'shop-close-button', className: 'shop-close', text: '×' });
    closeBtn.setAttribute('aria-label', 'Close shop');
    menu.appendChild(closeBtn);
    menu.appendChild(el('h2', { className: 'shop-title', text: 'SHOP' }));

    // Currency row. 5.99.0 — only Gold visible; SP/picks hidden.
    const currencyRow = el('div', { className: 'shop-currency-row' });
    currencyRow.appendChild(el('span', {
        className: 'shop-currency shop-currency--coins',
        children: [
            el('span', { className: 'shop-currency-icon', text: '💰' }),
            el('span', { id: 'shop-coins-amount', text: '0' }),
        ],
    }));
    currencyRow.appendChild(el('span', {
        className: 'shop-currency shop-currency--sp',
        style: { display: 'none' },
        children: [
            el('span', { id: 'shop-sp-amount', text: '0' }),
            el('span', { className: 'shop-currency-label', text: 'SP' }),
        ],
    }));
    currencyRow.appendChild(el('span', {
        className: 'shop-currency shop-currency--picks',
        style: { display: 'none' },
        children: [
            el('span', { className: 'shop-currency-icon shop-picks-icon', text: '+' }),
            el('span', { id: 'shop-picks-amount', text: '0' }),
            el('span', { className: 'shop-currency-label', text: 'SP' }),
        ],
    }));
    menu.appendChild(currencyRow);

    // Tab strip.
    const tabs = el('div', { className: 'shop-tabs' });
    const tabDefs = [
        { key: 'HELP',          label: 'HELP', active: true },
        { key: 'PULSE_CANNON',  label: 'PULSE' },
        { key: 'STORM_NEEDLES', label: 'NEEDLES' },
        { key: 'SCATTER_GUN',   label: 'SCATTER' },
        { key: 'RAIL_DRIVER',   label: 'RAIL' },
        { key: 'CHARGE_SHOT',   label: 'CHARGE' },
        { key: 'MINE_LAYER',    label: 'MINES' },
        { key: 'NOVA_BLAST',    label: 'NOVA' },
        { key: 'MISSILE_SALVO', label: 'MISSILES' },
        { key: 'LANCE_BEAM',    label: 'LANCE' },
        { key: 'LIGHTNING_ARC', label: 'ARC' },
    ];
    for (const t of tabDefs) {
        const b = el('button', { className: 'shop-tab' + (t.active ? ' active' : ''), text: t.label });
        b.dataset.tab = t.key;
        tabs.appendChild(b);
    }
    menu.appendChild(tabs);

    // Items list — filled by shop-dom.renderShopDom() on open.
    menu.appendChild(el('div', { id: 'shop-items-list', className: 'shop-content' }));
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
