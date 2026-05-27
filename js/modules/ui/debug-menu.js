// Developer debug overlay (6.x) — opened with `?` when debug mode is active
// (see core/debug-config.js). Pauses the game (mirroring InventoryOverlay's
// pause-capture/restore) and exposes the dev controls: unlock toggles, radial
// toggles, combat cheats, progression grants, and wave jumps.
//
// Self-contained: builds its own DOM + injects its own stylesheet, so it needs
// no index.html stub or static-dom markup (it only mounts when debug is on).

import { GAME_STATES } from '../core/constants.js';
import { debugState } from '../core/debug-config.js';
import {
    addGold, addXp, addLevel, addSp, jumpToWave, killAll,
    refillHealth, setHpToOne, resetCooldowns, setFlag,
} from './debug-actions.js';

const STYLE_ID = 'debug-menu-style';
const CSS = `
#debug-overlay { position: fixed; inset: 0; z-index: 99999; display: none;
  align-items: flex-start; justify-content: center; background: rgba(0,0,0,0.6);
  font-family: 'Press Start 2P', monospace; overflow-y: auto; padding: 24px 0; }
#debug-overlay .dbg-panel { background: #0d1016; border: 2px solid #4ad7ff;
  box-shadow: 0 0 24px rgba(74,215,255,0.35); width: min(680px, 94vw);
  margin: auto; color: #cfe4ff; }
#debug-overlay .dbg-head { display: flex; justify-content: space-between;
  align-items: center; padding: 12px 16px; border-bottom: 1px solid #243047;
  background: #11161f; }
#debug-overlay .dbg-title { font-size: 14px; color: #4ad7ff; letter-spacing: 1px; }
#debug-overlay .dbg-close { cursor: pointer; color: #ff6b8a; font-size: 14px;
  background: none; border: none; padding: 4px 8px; }
#debug-overlay .dbg-body { padding: 14px 16px 20px; }
#debug-overlay .dbg-sect { margin-bottom: 16px; }
#debug-overlay .dbg-sect-title { font-size: 10px; color: #7f9bbf;
  margin-bottom: 8px; letter-spacing: 1px; }
#debug-overlay .dbg-row { display: flex; flex-wrap: wrap; gap: 8px;
  align-items: center; margin-bottom: 8px; }
#debug-overlay label.dbg-check { display: flex; align-items: center; gap: 8px;
  font-size: 10px; cursor: pointer; min-width: 200px; }
#debug-overlay label.dbg-check input { width: 16px; height: 16px; accent-color: #4ad7ff; }
#debug-overlay .dbg-lbl { font-size: 10px; color: #9fb6d6; min-width: 64px; }
#debug-overlay button.dbg-btn { font-family: inherit; font-size: 10px;
  background: #1b2536; color: #cfe4ff; border: 1px solid #3a4f6e;
  padding: 7px 9px; cursor: pointer; }
#debug-overlay button.dbg-btn:hover { background: #26354c; border-color: #4ad7ff; }
#debug-overlay button.dbg-btn--go { border-color: #4ad7ff; color: #4ad7ff; }
#debug-overlay input.dbg-num { width: 70px; font-family: inherit; font-size: 10px;
  background: #11161f; color: #cfe4ff; border: 1px solid #3a4f6e; padding: 6px; }
#debug-overlay .dbg-hint { font-size: 8px; color: #5d7290; }
#debug-overlay .dbg-foot { font-size: 8px; color: #5a6f90; padding: 0 16px 12px; }
`;

export class DebugMenu {
    constructor() {
        this.gameEngine = null;
        this._isOpen = false;
        this._wasPaused = false;
        this._cameFromPauseMenu = false;
        this.overlay = null;
        this.body = null;
        this._build();
    }

    setGameEngine(ge) { this.gameEngine = ge; }
    isOpen() { return this._isOpen; }

    _build() {
        if (typeof document === 'undefined') return;
        if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = CSS;
            document.head.appendChild(style);
        }
        const overlay = document.createElement('div');
        overlay.id = 'debug-overlay';
        const panel = document.createElement('div');
        panel.className = 'dbg-panel';
        const head = document.createElement('div');
        head.className = 'dbg-head';
        const title = document.createElement('div');
        title.className = 'dbg-title';
        title.textContent = 'DEBUG MENU';
        const close = document.createElement('button');
        close.className = 'dbg-close';
        close.textContent = '✕ CLOSE (?)';
        close.addEventListener('click', () => this.close());
        head.append(title, close);
        const body = document.createElement('div');
        body.className = 'dbg-body';
        const foot = document.createElement('div');
        foot.className = 'dbg-foot';
        foot.textContent = 'Console: window.dbg.help()  ·  Toggle this menu with ?';
        panel.append(head, body, foot);
        overlay.appendChild(panel);
        overlay.addEventListener('click', (e) => { if (e.target === overlay) this.close(); });
        document.body.appendChild(overlay);
        this.overlay = overlay;
        this.body = body;
    }

    open() {
        if (!this.overlay) return false;
        const ge = this.gameEngine;
        if (!ge?.game) return false;
        // Only meaningful in-run; ignore on menus.
        const inRun = ge.game.state === GAME_STATES.PLAYING
            || ge.game.state === GAME_STATES.WAVE_TRANSITION
            || ge.game.state === GAME_STATES.PAUSED;
        if (!inRun) return false;
        const pauseDom = document.getElementById('pause-overlay');
        this._cameFromPauseMenu = !!(pauseDom && pauseDom.style.display === 'flex');
        this._wasPaused = ge.game.state === GAME_STATES.PAUSED;
        if (!this._wasPaused) ge.togglePause();
        if (pauseDom) pauseDom.style.display = 'none';
        this._isOpen = true;
        this.overlay.style.display = 'flex';
        this.render();
        return true;
    }

    close() {
        if (!this._isOpen) return;
        this._isOpen = false;
        if (this.overlay) this.overlay.style.display = 'none';
        const ge = this.gameEngine;
        const pauseDom = document.getElementById('pause-overlay');
        if (this._cameFromPauseMenu && pauseDom) {
            pauseDom.style.display = 'flex';
        } else if (!this._wasPaused && ge) {
            ge.togglePause();
        }
        this._cameFromPauseMenu = false;
        this._wasPaused = false;
    }

    toggle() { return this._isOpen ? (this.close(), false) : (this.open(), true); }

    // ── render helpers ──
    _section(parent, titleText) {
        const sect = document.createElement('div');
        sect.className = 'dbg-sect';
        const t = document.createElement('div');
        t.className = 'dbg-sect-title';
        t.textContent = titleText;
        sect.appendChild(t);
        parent.appendChild(sect);
        return sect;
    }

    _checkbox(parent, label, key, onChange) {
        const row = document.createElement('label');
        row.className = 'dbg-check';
        const cb = document.createElement('input');
        cb.type = 'checkbox';
        cb.checked = !!debugState[key];
        cb.addEventListener('change', () => {
            setFlag(this.gameEngine, key, cb.checked);
            if (onChange) onChange(cb.checked);
        });
        const span = document.createElement('span');
        span.textContent = label;
        row.append(cb, span);
        parent.appendChild(row);
        return row;
    }

    _btnRow(parent, labelText, buttons) {
        const row = document.createElement('div');
        row.className = 'dbg-row';
        if (labelText) {
            const lbl = document.createElement('span');
            lbl.className = 'dbg-lbl';
            lbl.textContent = labelText;
            row.appendChild(lbl);
        }
        for (const b of buttons) {
            const btn = document.createElement('button');
            btn.className = 'dbg-btn' + (b.go ? ' dbg-btn--go' : '');
            btn.textContent = b.label;
            btn.addEventListener('click', () => { b.onClick(); });
            row.appendChild(btn);
        }
        parent.appendChild(row);
        return row;
    }

    // Re-equip-aware refresh: unlock toggles change which weapons the loadout
    // UIs show, so nudge an open shop/pause to rebuild.
    _refreshLoadoutUIs() {
        const ge = this.gameEngine;
        try { ge?.shopDom?.renderShopDom?.(); } catch (_) { /* ignore */ }
        try { ge?.uiManager?.refreshLoadoutTab?.(); } catch (_) { /* ignore */ }
    }

    render() {
        const ge = this.gameEngine;
        const body = this.body;
        if (!body) return;
        body.replaceChildren();

        // ── Unlocks ──
        const unlock = this._section(body, 'UNLOCKS (non-destructive — reverts when off)');
        this._checkbox(unlock, 'Unlock all weapons', 'unlockAllWeapons', () => this._refreshLoadoutUIs());
        this._checkbox(unlock, 'Unlock all abilities', 'unlockAllAbilities', () => this._refreshLoadoutUIs());
        this._checkbox(unlock, 'Unlock all passives', 'unlockAllPassives', () => this._refreshLoadoutUIs());

        // ── Radials ──
        const radial = this._section(body, 'WEAPON RADIALS (off by default)');
        this._checkbox(radial, 'Enable Primary Radial (F)', 'primaryRadial');
        this._checkbox(radial, 'Enable Power Radial (E)', 'powerRadial');

        // ── Combat ──
        const combat = this._section(body, 'COMBAT');
        this._checkbox(combat, 'God mode (no damage)', 'godMode');
        this._checkbox(combat, 'Instakill (one-punch)', 'instakill');
        this._checkbox(combat, 'Infinite energy', 'infiniteEnergy');
        this._btnRow(combat, '', [
            { label: 'Refill HP + tanks', onClick: () => refillHealth(ge) },
            { label: 'Set HP = 1', onClick: () => setHpToOne(ge) },
            { label: 'Reset cooldowns', onClick: () => resetCooldowns(ge) },
            { label: 'Kill all', go: true, onClick: () => killAll(ge) },
        ]);

        // ── Progression ──
        const prog = this._section(body, 'PROGRESSION');
        this._btnRow(prog, 'Gold', [
            { label: '+1k', onClick: () => addGold(ge, 1000) },
            { label: '+10k', onClick: () => addGold(ge, 10000) },
            { label: '+100k', onClick: () => addGold(ge, 100000) },
        ]);
        this._btnRow(prog, 'XP', [
            { label: '+1k', onClick: () => addXp(ge, 1000) },
            { label: '+10k', onClick: () => addXp(ge, 10000) },
        ]);
        this._btnRow(prog, 'Level', [
            { label: '+1', onClick: () => addLevel(ge, 1) },
            { label: '+5', onClick: () => addLevel(ge, 5) },
            { label: '+10', onClick: () => addLevel(ge, 10) },
        ]);
        this._btnRow(prog, 'SP', [
            { label: '+5', onClick: () => addSp(ge, 5) },
            { label: '+10', onClick: () => addSp(ge, 10) },
            { label: '+100', onClick: () => addSp(ge, 100) },
        ]);

        // ── Waves ──
        const waves = this._section(body, 'WAVES');
        const row = document.createElement('div');
        row.className = 'dbg-row';
        const lbl = document.createElement('span');
        lbl.className = 'dbg-lbl';
        lbl.textContent = 'Jump to';
        const num = document.createElement('input');
        num.className = 'dbg-num';
        num.type = 'number';
        num.min = '1';
        num.value = String((ge?.game?.currentWave | 0) || 1);
        const go = document.createElement('button');
        go.className = 'dbg-btn dbg-btn--go';
        go.textContent = 'GO';
        go.addEventListener('click', () => {
            const n = Math.max(1, parseInt(num.value, 10) || 1);
            jumpToWave(ge, n);
            this.close();
        });
        row.append(lbl, num, go);
        waves.appendChild(row);

        // ── UI ──
        const ui = this._section(body, 'UI');
        this._checkbox(ui, 'Show bubble tree (pre-run preview)', 'showBubbleTree', () => this._refreshLoadoutUIs());
    }
}

/**
 * Install the `window.dbg` console API. Mirrors the overlay's actions so a
 * developer can script setup from the console. No-op outside debug mode.
 */
export function installDebugConsoleApi(getEngine) {
    if (typeof window === 'undefined') return;
    const ge = () => (typeof getEngine === 'function' ? getEngine() : window.gameEngine);
    window.dbg = {
        gold: (n = 10000) => addGold(ge(), n),
        xp: (n = 1000) => addXp(ge(), n),
        level: (n = 1) => addLevel(ge(), n),
        sp: (n = 5) => addSp(ge(), n),
        wave: (n) => jumpToWave(ge(), n),
        killAll: () => killAll(ge()),
        heal: () => refillHealth(ge()),
        hurt: () => setHpToOne(ge()),
        cooldowns: () => resetCooldowns(ge()),
        god: (on = true) => setFlag(ge(), 'godMode', on),
        instakill: (on = true) => setFlag(ge(), 'instakill', on),
        energy: (on = true) => setFlag(ge(), 'infiniteEnergy', on),
        unlockWeapons: (on = true) => setFlag(ge(), 'unlockAllWeapons', on),
        unlockAbilities: (on = true) => setFlag(ge(), 'unlockAllAbilities', on),
        unlockPassives: (on = true) => setFlag(ge(), 'unlockAllPassives', on),
        radials: (on = true) => { setFlag(ge(), 'primaryRadial', on); setFlag(ge(), 'powerRadial', on); },
        menu: () => ge()?._debugMenu?.toggle(),
        help: () => console.log([
            'window.dbg — Rainboids debug API',
            '  gold(n) xp(n) level(n) sp(n)        — grants',
            '  wave(n)                             — jump to wave',
            '  killAll() heal() hurt() cooldowns() — combat',
            '  god(b) instakill(b) energy(b)       — toggles',
            '  unlockWeapons/Abilities/Passives(b) — unlock-all',
            '  radials(b)  menu()                  — radials / open overlay',
        ].join('\n')),
    };
}
