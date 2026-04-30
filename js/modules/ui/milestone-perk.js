// Milestone perk overlay — Galaga-mode build progression.
//
// Every 10k score, present 3 random perks. Player picks 1/2/3 (or click).
// The game keeps running underneath — overlay is non-blocking. If the
// player ignores it for ~6s, the first option is auto-selected.

import { POWERUP_TYPES } from '../world/powerup.js';

const PERK_POOL = [
    { id: 'RAPID_FIRE',  name: 'Rapid Fire',  desc: '+25% fire rate (stacks)',     duration: 60000 },
    { id: 'MULTI_SHOT',  name: 'Multi Shot',  desc: '+1 bullet in spread (stacks)',duration: 60000 },
    { id: 'HOMING',      name: 'Homing',      desc: 'Bullets track enemies',        duration: 60000 },
    { id: 'BIG_BULLETS', name: 'Big Bullets', desc: '+30% bullet size (stacks)',   duration: 60000 },
];

let overlayEl = null;
let activePerks = null;
let onPickCb = null;
let autoTimer = null;

function buildOverlay() {
    const el = document.createElement('div');
    el.id = 'milestone-perk-overlay';
    Object.assign(el.style, {
        position: 'fixed', top: '14%', left: '50%',
        transform: 'translateX(-50%)',
        display: 'none', zIndex: '60',
        pointerEvents: 'none',
        fontFamily: 'monospace',
        textAlign: 'center',
    });
    el.innerHTML = `
        <div style="color:#ffe066; font-size:14px; letter-spacing:3px; margin-bottom:8px; text-shadow:0 0 8px #000;">
            MILESTONE — PICK A PERK [1] [2] [3]
        </div>
        <div id="mp-cards" style="display:flex; gap:12px; justify-content:center; pointer-events:auto;"></div>
    `;
    document.body.appendChild(el);
    return el;
}

function cardHtml(perk, idx) {
    return `
        <div class="mp-card" data-idx="${idx}" style="
            background: rgba(8,12,24,0.92);
            border: 2px solid #4af; border-radius:6px;
            padding: 10px 14px; min-width:160px; max-width:180px;
            color:#dff; cursor:pointer;
            box-shadow: 0 0 14px rgba(80,140,255,0.5);
            transition: transform 0.1s;">
            <div style="font-size:18px; color:#ffe066;">[${idx + 1}]</div>
            <div style="font-size:14px; font-weight:bold; margin:4px 0;">${perk.name}</div>
            <div style="font-size:11px; color:#9bd; line-height:1.3;">${perk.desc}</div>
        </div>
    `;
}

function pickRandomPerks(n = 3) {
    const pool = [...PERK_POOL];
    const out = [];
    for (let i = 0; i < n && pool.length; i++) {
        const idx = Math.floor(Math.random() * pool.length);
        out.push(pool.splice(idx, 1)[0]);
    }
    return out;
}

export function initMilestonePerk(gameEngine) {
    if (!overlayEl) overlayEl = buildOverlay();
    const cardsHost = overlayEl.querySelector('#mp-cards');

    const close = () => {
        overlayEl.style.display = 'none';
        activePerks = null;
        onPickCb = null;
        if (autoTimer) { clearTimeout(autoTimer); autoTimer = null; }
    };

    const apply = (perk) => {
        if (!gameEngine.player) return;
        const config = POWERUP_TYPES[perk.id];
        if (config) {
            gameEngine.player.addPowerup(perk.id, { ...config, duration: perk.duration }, false);
        }
        close();
    };

    cardsHost.addEventListener('click', (ev) => {
        const card = ev.target.closest('.mp-card');
        if (!card || !activePerks) return;
        const idx = parseInt(card.dataset.idx, 10);
        if (activePerks[idx]) apply(activePerks[idx]);
    });

    document.addEventListener('keydown', (ev) => {
        if (!activePerks) return;
        const idx = ['1', '2', '3'].indexOf(ev.key);
        if (idx >= 0 && activePerks[idx]) apply(activePerks[idx]);
    });

    gameEngine.events.on('milestone:perk', () => {
        activePerks = pickRandomPerks(3);
        cardsHost.innerHTML = activePerks.map(cardHtml).join('');
        overlayEl.style.display = 'block';
        if (autoTimer) clearTimeout(autoTimer);
        autoTimer = setTimeout(() => {
            if (activePerks) apply(activePerks[0]);
        }, 6000);
    });
}
