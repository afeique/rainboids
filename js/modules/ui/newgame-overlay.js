// ui/newgame-overlay.js
// ─────────────────────────────────────────────────────────────────────────────
// New-game pre-run picker (9.0.0 reboot). Replaces the inventory/gear BUILD
// tree with a tight "back to basics" two-section LIST picker:
//   • PRIMARY WEAPON — tap one of N options.
//   • POWER WEAPON   — tap one of N options.
// START begins an endless survival run with the chosen loadout; BACK returns
// to the title. Self-contained DOM overlay, mobile-friendly: large rows, full-
// width on narrow viewports.
// ─────────────────────────────────────────────────────────────────────────────

import { PRIMARY_WEAPONS, POWER_WEAPONS } from '../combat/weapon-data.js';

const STYLE_ID = 'newgame-overlay-style';

const CSS = `
#newgame-overlay { position: fixed; inset: 0; z-index: 9000; display: none;
  overflow-y: auto; background: rgba(2,4,10,0.96); color: #e8eefc;
  font-family: 'Press Start 2P', monospace; padding: 24px 16px;
  -webkit-overflow-scrolling: touch; }
#newgame-overlay .ng-wrap { width: min(720px, 96vw); margin: 0 auto; }
#newgame-overlay .ng-title { font-size: 20px; color: #5fd0ff; text-align: center;
  letter-spacing: 2px; margin-bottom: 6px; }
#newgame-overlay .ng-sub { font-size: 9px; color: #9fb0cc; text-align: center;
  margin-bottom: 24px; line-height: 1.6; }
#newgame-overlay .ng-sec-head { font-size: 12px; color: #ffcc44; letter-spacing: 1px;
  border-bottom: 1px solid #2c3a52; padding-bottom: 8px; margin: 22px 0 10px; }
#newgame-overlay .ng-list { display: flex; flex-direction: column; gap: 6px; }
#newgame-overlay .ng-row { display: flex; align-items: flex-start; gap: 12px;
  padding: 12px 14px; border: 2px solid #2c3a52; background: #0d1016;
  cursor: pointer; transition: border-color .12s, background .12s, transform .06s;
  text-align: left; -webkit-tap-highlight-color: transparent;
  font-family: inherit; color: inherit; width: 100%; }
#newgame-overlay .ng-row:hover, #newgame-overlay .ng-row:active { background: #141b27; transform: translateX(2px); }
#newgame-overlay .ng-row.sel { background: rgba(95,208,255,0.10); }
#newgame-overlay .ng-row-mark { font-size: 12px; min-width: 18px; color: #6b7a96; line-height: 1.4; padding-top: 1px; }
#newgame-overlay .ng-row.sel .ng-row-mark { color: #5fd0ff; }
#newgame-overlay .ng-row-body { flex: 1; min-width: 0; }
#newgame-overlay .ng-row-name { font-size: 12px; margin-bottom: 4px; line-height: 1.4; }
#newgame-overlay .ng-row-desc { font-size: 8px; color: #9fb0cc; line-height: 1.6; }
#newgame-overlay .ng-actions { display: flex; gap: 14px; justify-content: center;
  margin: 32px 0 8px; flex-wrap: wrap; }
#newgame-overlay .ng-btn { font-family: inherit; font-size: 12px; padding: 14px 28px;
  cursor: pointer; background: #1b2536; color: #e8eefc; border: 1px solid #3a4a66;
  transition: border-color .12s, background .12s; min-width: 140px;
  -webkit-tap-highlight-color: transparent; }
#newgame-overlay .ng-btn:hover, #newgame-overlay .ng-btn:active { border-color: #5fd0ff; background: #243349; }
#newgame-overlay .ng-btn-start { border-color: #3fd07a; color: #9dffc4; }
#newgame-overlay .ng-btn-start:hover, #newgame-overlay .ng-btn-start:active { background: #163a26; }
@media (max-width: 640px) {
  #newgame-overlay { padding: 18px 10px; }
  #newgame-overlay .ng-title { font-size: 17px; }
  #newgame-overlay .ng-sec-head { font-size: 11px; }
  #newgame-overlay .ng-row { padding: 14px 12px; }
  #newgame-overlay .ng-row-name { font-size: 11px; }
  #newgame-overlay .ng-actions { gap: 10px; margin-top: 24px; }
  #newgame-overlay .ng-btn { font-size: 11px; padding: 14px 22px; min-width: 0; flex: 1 1 140px; }
}
`;

export class NewGameOverlay {
    constructor() {
        this.overlay = null;
        this.sel = { primary: null, power: null };
        this._cbs = {};
        this._primaryRows = new Map();
        this._powerRows = new Map();
        this._build();
    }

    _build() {
        if (typeof document === 'undefined') return;
        if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = CSS;
            document.head.appendChild(style);
        }
        const overlay = document.createElement('div');
        overlay.id = 'newgame-overlay';
        const wrap = document.createElement('div');
        wrap.className = 'ng-wrap';

        const title = document.createElement('div');
        title.className = 'ng-title';
        title.textContent = 'NEW GAME';
        const sub = document.createElement('div');
        sub.className = 'ng-sub';
        sub.textContent = 'Pick your weapons, then survive endless waves — drafting boons between each.';

        const priHead = document.createElement('div');
        priHead.className = 'ng-sec-head';
        priHead.textContent = 'PRIMARY WEAPON';
        const priList = document.createElement('div');
        priList.className = 'ng-list';

        const powHead = document.createElement('div');
        powHead.className = 'ng-sec-head';
        powHead.textContent = 'POWER WEAPON';
        const powList = document.createElement('div');
        powList.className = 'ng-list';

        const actions = document.createElement('div');
        actions.className = 'ng-actions';
        const backBtn = document.createElement('button');
        backBtn.className = 'ng-btn';
        backBtn.type = 'button';
        backBtn.textContent = 'BACK';
        backBtn.addEventListener('click', () => { const cb = this._cbs.onBack; this.close(); if (cb) cb(); });
        const startBtn = document.createElement('button');
        startBtn.className = 'ng-btn ng-btn-start';
        startBtn.type = 'button';
        startBtn.textContent = 'START RUN';
        startBtn.addEventListener('click', () => {
            const cb = this._cbs.onStart;
            this.close();
            if (cb) cb({ ...this.sel });
        });
        actions.append(backBtn, startBtn);

        wrap.append(title, sub, priHead, priList, powHead, powList, actions);
        overlay.appendChild(wrap);
        document.body.appendChild(overlay);

        this.overlay = overlay;
        this._buildList(priList, PRIMARY_WEAPONS, this._primaryRows, (id) => this._select('primary', id));
        this._buildList(powList, POWER_WEAPONS, this._powerRows, (id) => this._select('power', id));
    }

    _buildList(container, defs, map, onPick) {
        for (const w of Object.values(defs)) {
            if (!w || w.hidden) continue;
            const row = document.createElement('button');
            row.className = 'ng-row';
            row.type = 'button';

            const mark = document.createElement('div');
            mark.className = 'ng-row-mark';
            mark.textContent = '○';

            const body = document.createElement('div');
            body.className = 'ng-row-body';
            const name = document.createElement('div');
            name.className = 'ng-row-name';
            name.style.color = w.color || '#e8eefc';
            name.textContent = w.name || w.id;
            const desc = document.createElement('div');
            desc.className = 'ng-row-desc';
            desc.textContent = w.description || '';
            body.append(name, desc);

            row.append(mark, body);
            row.addEventListener('click', () => onPick(w.id));
            map.set(w.id, { row, mark });
            container.appendChild(row);
        }
    }

    _select(slot, id) {
        this.sel[slot] = id;
        const map = (slot === 'primary') ? this._primaryRows : this._powerRows;
        for (const [wid, ref] of map) {
            const on = wid === id;
            ref.row.classList.toggle('sel', on);
            ref.mark.textContent = on ? '●' : '○';
        }
    }

    isOpen() { return !!(this.overlay && this.overlay.style.display === 'block'); }

    // open({ onStart({primary,power}), onBack }) — defaults to first non-hidden of each.
    open(callbacks = {}) {
        if (!this.overlay) return false;
        this._cbs = callbacks || {};
        const firstPrimary = Object.values(PRIMARY_WEAPONS).find((w) => w && !w.hidden);
        const firstPower = Object.values(POWER_WEAPONS).find((w) => w && !w.hidden);
        if (firstPrimary) this._select('primary', firstPrimary.id);
        if (firstPower) this._select('power', firstPower.id);
        this.overlay.style.display = 'block';
        this.overlay.scrollTop = 0;
        return true;
    }

    close() {
        if (this.overlay) this.overlay.style.display = 'none';
    }
}
