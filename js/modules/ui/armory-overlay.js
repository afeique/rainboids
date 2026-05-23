// Phase R2 — ARMORY screen: the pre-run meta store where account-gold buys
// permanent weapon/ability UNLOCKS. Shown between NEW GAME and the run
// (TITLE → ARMORY → run). CONTINUE skips it.
//
// Full-screen opaque DOM overlay (so the canvas behind it is irrelevant —
// no render-loop changes needed). Builds its own markup lazily on first
// open; reads/writes the rainboidsMeta unlock lists via core/storage.

import { GAME_STATES } from '../core/constants.js';
import { loadMeta, saveMeta } from '../core/storage.js';
import { PRIMARY_WEAPONS, POWER_WEAPONS, ABILITIES } from '../combat/weapon-data.js';
import {
    UNLOCK_CATEGORIES, unlockCost, getUnlockedSet, getLockedIds, applyUnlock,
} from '../shop/armory.js';

const CATEGORY_DEFS = {
    primaries: { label: 'PRIMARY WEAPONS', defs: () => PRIMARY_WEAPONS },
    powers:    { label: 'POWER WEAPONS',   defs: () => POWER_WEAPONS },
    abilities: { label: 'ABILITIES',       defs: () => ABILITIES },
};

export class ArmoryOverlay {
    constructor() {
        this.gameEngine = null;
        this._isOpen = false;
        this._built = false;
        this.elements = {};
    }

    setGameEngine(ge) { this.gameEngine = ge; }
    isOpen() { return this._isOpen; }

    _build() {
        if (this._built) return;
        let overlay = document.getElementById('armory-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'armory-overlay';
            document.body.appendChild(overlay);
        }
        overlay.className = 'armory-overlay';
        overlay.replaceChildren();

        const panel = document.createElement('div');
        panel.className = 'armory-panel';

        const header = document.createElement('div');
        header.className = 'armory-header';
        const title = document.createElement('div');
        title.className = 'armory-title';
        title.textContent = 'ARMORY';
        const gold = document.createElement('div');
        gold.className = 'armory-gold';
        header.append(title, gold);
        panel.appendChild(header);

        const sub = document.createElement('div');
        sub.className = 'armory-sub';
        sub.textContent = 'Spend account-gold on permanent unlocks. Run-gold you earn each run banks here on death or victory.';
        panel.appendChild(sub);

        const body = document.createElement('div');
        body.className = 'armory-body';
        panel.appendChild(body);

        const footer = document.createElement('div');
        footer.className = 'armory-footer';
        const back = document.createElement('button');
        back.className = 'armory-btn armory-btn--back';
        back.textContent = '← BACK';
        back.addEventListener('click', () => this.back());
        const start = document.createElement('button');
        start.className = 'armory-btn armory-btn--start';
        start.textContent = 'START RUN →';
        start.addEventListener('click', () => this.startRun());
        footer.append(back, start);
        panel.appendChild(footer);

        overlay.appendChild(panel);
        this.elements = { overlay, gold, body };
        this._built = true;
    }

    open() {
        this._build();
        this._isOpen = true;
        this.elements.overlay.style.display = 'flex';
        this.render();
        return true;
    }

    close() {
        this._isOpen = false;
        if (this.elements.overlay) this.elements.overlay.style.display = 'none';
    }

    back() {
        this.close();
        const ge = this.gameEngine;
        if (ge && ge.game) ge.game.state = GAME_STATES.TITLE_SCREEN;
    }

    startRun() {
        this.close();
        const ge = this.gameEngine;
        if (!ge) return;
        // Finalize the title-screen exit (audio/music/listener teardown) the
        // first time we commit to a run from the title. No-op when entered
        // from GAME_OVER (listeners already gone).
        if (typeof ge._finalizeTitleExit === 'function') {
            try { ge._finalizeTitleExit(); } catch {}
        }
        if (typeof ge.startNewRun === 'function') ge.startNewRun();
    }

    _accountGold() {
        const ge = this.gameEngine;
        if (ge && ge.game && typeof ge.game.accountGold === 'number') return ge.game.accountGold | 0;
        const meta = loadMeta();
        return (meta && typeof meta.accountGold === 'number') ? meta.accountGold | 0 : 0;
    }

    buy(category, id) {
        const meta = loadMeta() || {};
        const out = applyUnlock(category, id, meta, this._accountGold());
        if (!out.ok) return false;
        saveMeta({ ...out.meta, accountGold: out.accountGold });
        const ge = this.gameEngine;
        if (ge && ge.game) ge.game.accountGold = out.accountGold;
        this.render();
        return true;
    }

    render() {
        const { gold, body } = this.elements;
        if (!body) return;
        const accountGold = this._accountGold();
        if (gold) gold.textContent = `${accountGold} ⬢`;
        body.replaceChildren();

        const meta = loadMeta() || {};
        for (const category of Object.keys(CATEGORY_DEFS)) {
            const cat = CATEGORY_DEFS[category];
            const defs = cat.defs();
            const section = document.createElement('div');
            section.className = 'armory-section';

            const secTitle = document.createElement('div');
            secTitle.className = 'armory-section-title';
            const cost = unlockCost(category);
            secTitle.textContent = `${cat.label}  ·  ${cost} ⬢ each`;
            section.appendChild(secTitle);

            const owned = getUnlockedSet(category, meta);
            const locked = getLockedIds(category, Object.keys(defs), meta);

            const list = document.createElement('div');
            list.className = 'armory-list';

            // Owned (base + purchased) shown as already-acquired chips.
            for (const id of owned) {
                const def = defs[id];
                if (!def) continue;
                const row = document.createElement('div');
                row.className = 'armory-row armory-row--owned';
                const name = document.createElement('span');
                name.className = 'armory-row-name';
                name.textContent = def.name || id;
                const tag = document.createElement('span');
                tag.className = 'armory-row-tag';
                tag.textContent = UNLOCK_CATEGORIES[category].base.includes(id) ? 'BASE' : 'OWNED';
                row.append(name, tag);
                list.appendChild(row);
            }

            // Locked → buy buttons.
            for (const id of locked) {
                const def = defs[id];
                if (!def) continue;
                const row = document.createElement('div');
                row.className = 'armory-row';
                const name = document.createElement('span');
                name.className = 'armory-row-name';
                name.textContent = def.name || id;
                const btn = document.createElement('button');
                btn.className = 'armory-buy';
                const affordable = accountGold >= cost;
                btn.disabled = !affordable;
                btn.textContent = `UNLOCK · ${cost} ⬢`;
                btn.addEventListener('click', () => this.buy(category, id));
                row.append(name, btn);
                list.appendChild(row);
            }

            section.appendChild(list);
            body.appendChild(section);
        }
    }
}
