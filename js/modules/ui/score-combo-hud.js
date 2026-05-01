// Score + Combo HUD — Galaga-mode top-right overlay.
//
// Lightweight DOM panel updated from a rAF loop. Only renders while
// gameEngine.galagaMode is true. Shows score, combo count, and a flash
// when overdrive triggers.

import { GAME_STATES } from '../core/constants.js';

let host = null;
let scoreEl = null;
let comboEl = null;
let overdriveEl = null;
let lastShown = 0;

function build() {
    host = document.createElement('div');
    host.id = 'score-combo-hud';
    Object.assign(host.style, {
        // Top-center keeps the HUD clear of the pause button (top-right)
        // and the HP/lives stack (top-left).
        position: 'fixed', top: '12px', left: '50%',
        transform: 'translateX(-50%)',
        zIndex: '40', pointerEvents: 'none',
        fontFamily: "'Press Start 2P', monospace",
        textAlign: 'center',
        textShadow: '0 0 6px #000, 0 0 2px #000',
        display: 'none',
    });
    host.innerHTML = `
        <div id="sch-score" style="font-size:18px; color:#ffe066;">0</div>
        <div id="sch-combo" style="font-size:11px; color:#9bd; margin-top:4px; min-height:14px;"></div>
        <div id="sch-overdrive" style="font-size:13px; color:#f6f; margin-top:4px; opacity:0; transition:opacity 0.3s;">OVERDRIVE!</div>
    `;
    document.body.appendChild(host);
    scoreEl = host.querySelector('#sch-score');
    comboEl = host.querySelector('#sch-combo');
    overdriveEl = host.querySelector('#sch-overdrive');
}

export function initScoreComboHud(gameEngine) {
    if (!host) build();
    let overdriveTimer = 0;
    gameEngine.events.on('combo:overdrive', () => {
        overdriveEl.style.opacity = '1';
        overdriveTimer = performance.now() + 5000;
    });
    const tick = () => {
        const visible = gameEngine.galagaMode &&
            gameEngine.game.state !== GAME_STATES.TITLE_SCREEN &&
            gameEngine.game.state !== GAME_STATES.SHOP;
        host.style.display = visible ? 'block' : 'none';
        if (visible) {
            const score = gameEngine.game.score | 0;
            if (score !== lastShown) {
                scoreEl.textContent = score.toLocaleString();
                lastShown = score;
            }
            const c = gameEngine.combo ? gameEngine.combo.count : 0;
            comboEl.textContent = c >= 2 ? `×${c} COMBO` : '';
            if (performance.now() > overdriveTimer && overdriveEl.style.opacity === '1') {
                overdriveEl.style.opacity = '0';
            }
        }
        requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
}
