// ── HANGAR overlay ─────────────────────────────────────────────────
// Cosmetic ship-skin selector. A full-screen DOM overlay (mirrors the
// ARMORY overlay's structure) reachable from the title screen. Shows a
// live animated preview of the highlighted skin plus a grid of thumbnail
// cards. Selecting a skin persists it to settings (rainboidsSettings.
// selectedSkin) and updates the live player if one exists.
//
// Skins are PURELY cosmetic — every skin shares the same fixed collision
// radius, so this screen never touches gameplay.

import { GAME_STATES } from '../core/constants.js';
import { loadSettings, saveSettings } from '../core/storage.js';
import { SKINS, getSkin, DEFAULT_SKIN_ID } from '../player/skins/index.js';

const DPR = Math.min(2, (typeof window !== 'undefined' && window.devicePixelRatio) || 1);

// Build a fresh per-context preview state stub. `skin.paint` reads ship
// articulation state off `this`; a stub supplies animated values so the
// moving elements (sweeping wings, pulsing cores, blinking lights) show.
function previewStub(R, t, animated) {
    const a = animated ? 1 : 0;
    return {
        radius: R,
        thrustLevel: Math.max(0, Math.min(1, 0.5 + Math.sin(t * 1.3) * 0.35 * a)),
        flapOpen: Math.max(0, Math.min(1, 0.5 + Math.sin(t * 0.9) * 0.5 * a)),
        wingSweep: Math.max(0, Math.min(1, 0.45 + Math.sin(t * 0.7) * 0.4 * a)),
        bank: Math.sin(t * 0.8) * 0.35 * a,
        glidePhase: t * 2,
        engine_startup: 0,
        energy: 55 + Math.sin(t * 0.5) * 40 * a,
        maxEnergy: 100,
    };
}

// Paint one skin's hull into a 2D context sized (wCss × hCss) css px.
function paintSkinInto(ctx, skin, wCss, hCss, R, t, stub) {
    ctx.setTransform(DPR, 0, 0, DPR, 0, 0);
    ctx.clearRect(0, 0, wCss, hCss);
    // Dark vignette backdrop so additive glows read.
    const bg = ctx.createRadialGradient(wCss / 2, hCss / 2, 0, wCss / 2, hCss / 2, Math.max(wCss, hCss) * 0.6);
    bg.addColorStop(0, 'rgba(20, 26, 44, 0.9)');
    bg.addColorStop(1, 'rgba(6, 8, 16, 0.95)');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, wCss, hCss);

    ctx.save();
    ctx.translate(wCss / 2, hCss / 2);
    // Gentle yaw sway (nose stays "up"); the renderer normally rotates by
    // angle + PI/2 — here angle ≈ -PI/2 so the art points up at the viewer.
    ctx.rotate(Math.sin(t * 0.8) * 0.22);
    try { skin.paint.call(stub, ctx, R, t); } catch { /* keep the loop alive */ }
    ctx.restore();
}

export class HangarOverlay {
    constructor() {
        this.gameEngine = null;
        this._isOpen = false;
        this._built = false;
        this.elements = {};
        this._cards = new Map();      // skinId → { card, label }
        this._raf = 0;
        this._selectedId = DEFAULT_SKIN_ID;
        this._previewStub = null;
    }

    setGameEngine(ge) { this.gameEngine = ge; }
    isOpen() { return this._isOpen; }

    _build() {
        if (this._built) return;
        let overlay = document.getElementById('hangar-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'hangar-overlay';
            document.body.appendChild(overlay);
        }
        overlay.className = 'hangar-overlay';
        overlay.replaceChildren();

        const panel = document.createElement('div');
        panel.className = 'hangar-panel';

        const header = document.createElement('div');
        header.className = 'hangar-header';
        const title = document.createElement('div');
        title.className = 'hangar-title';
        title.textContent = 'HANGAR';
        const name = document.createElement('div');
        name.className = 'hangar-skin-name';
        header.append(title, name);
        panel.appendChild(header);

        const sub = document.createElement('div');
        sub.className = 'hangar-sub';
        sub.textContent = 'Choose your ship. Skins are cosmetic only — every hull shares the same collision size.';
        panel.appendChild(sub);

        const body = document.createElement('div');
        body.className = 'hangar-body';

        // Live animated preview.
        const previewWrap = document.createElement('div');
        previewWrap.className = 'hangar-preview';
        const preview = document.createElement('canvas');
        preview.className = 'hangar-preview-canvas';
        const PW = 300, PH = 260;
        preview.width = PW * DPR; preview.height = PH * DPR;
        preview.style.width = PW + 'px'; preview.style.height = PH + 'px';
        const desc = document.createElement('div');
        desc.className = 'hangar-desc';
        previewWrap.append(preview, desc);
        body.appendChild(previewWrap);

        // Skin grid.
        const grid = document.createElement('div');
        grid.className = 'hangar-grid';
        for (const skin of SKINS) {
            const card = document.createElement('button');
            card.className = 'hangar-card';
            card.dataset.skin = skin.id;
            const thumb = document.createElement('canvas');
            thumb.className = 'hangar-thumb';
            const TS = 84;
            thumb.width = TS * DPR; thumb.height = TS * DPR;
            thumb.style.width = TS + 'px'; thumb.style.height = TS + 'px';
            // Static thumbnail (drawn once).
            const tctx = thumb.getContext('2d');
            paintSkinInto(tctx, skin, TS, TS, 20, 1.2, previewStub(20, 1.2, false));
            const label = document.createElement('span');
            label.className = 'hangar-card-name';
            label.textContent = skin.name;
            card.append(thumb, label);
            card.addEventListener('click', () => this.select(skin.id));
            grid.appendChild(card);
            this._cards.set(skin.id, { card, label });
        }
        body.appendChild(grid);
        panel.appendChild(body);

        const footer = document.createElement('div');
        footer.className = 'hangar-footer';
        const back = document.createElement('button');
        back.className = 'hangar-btn hangar-btn--back';
        back.textContent = '← BACK';
        back.addEventListener('click', () => this.back());
        footer.appendChild(back);
        panel.appendChild(footer);

        overlay.appendChild(panel);
        this.elements = { overlay, name, desc, preview, pctx: preview.getContext('2d'), PW, PH };
        this._built = true;
    }

    open() {
        this._build();
        this._isOpen = true;
        this.elements.overlay.style.display = 'flex';
        const cur = (() => { try { return loadSettings().selectedSkin; } catch { return null; } })();
        this._selectedId = getSkin(cur).id;   // resolve+validate (falls back to default)
        this._previewStub = null;
        this._highlight();
        this._startLoop();
        return true;
    }

    close() {
        this._isOpen = false;
        this._stopLoop();
        if (this.elements.overlay) this.elements.overlay.style.display = 'none';
    }

    back() {
        this.close();
        const ge = this.gameEngine;
        if (ge && ge.game) ge.game.state = GAME_STATES.TITLE_SCREEN;
    }

    select(id) {
        const skin = getSkin(id);
        this._selectedId = skin.id;
        this._previewStub = null;               // rebuild gradients for the new hull
        try { saveSettings({ selectedSkin: skin.id }); } catch {}
        // Reflect immediately on a live player, if any.
        const ge = this.gameEngine;
        if (ge && ge.player) ge.player.skinId = skin.id;
        this._highlight();
    }

    _highlight() {
        const skin = getSkin(this._selectedId);
        if (this.elements.name) this.elements.name.textContent = skin.name;
        if (this.elements.desc) this.elements.desc.textContent = skin.desc || '';
        for (const [id, { card, label }] of this._cards) {
            const on = id === this._selectedId;
            card.classList.toggle('hangar-card--selected', on);
            label.textContent = on ? `✓ ${getSkin(id).name}` : getSkin(id).name;
        }
    }

    _startLoop() {
        this._stopLoop();
        const tick = () => {
            if (!this._isOpen) return;
            const { pctx, PW, PH } = this.elements;
            if (pctx) {
                const t = performance.now() * 0.001;
                const R = 58;
                if (!this._previewStub) this._previewStub = previewStub(R, t, true);
                const stub = this._previewStub;
                const live = previewStub(R, t, true);
                // copy animated fields onto the persistent (gradient-caching) stub
                stub.thrustLevel = live.thrustLevel; stub.flapOpen = live.flapOpen;
                stub.wingSweep = live.wingSweep; stub.bank = live.bank;
                stub.glidePhase = live.glidePhase; stub.energy = live.energy;
                stub.radius = R; stub.maxEnergy = 100;
                paintSkinInto(pctx, getSkin(this._selectedId), PW, PH, R, t, stub);
            }
            this._raf = requestAnimationFrame(tick);
        };
        this._raf = requestAnimationFrame(tick);
    }

    _stopLoop() {
        if (this._raf) { cancelAnimationFrame(this._raf); this._raf = 0; }
    }
}
