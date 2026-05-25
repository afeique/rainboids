// Phase R5 — LOADOUT screen: pick the run's loadout (≤4 primary + ≤4 power +
// ≤4 ability) from the UNLOCKED pool. Shown between the ARMORY and the run
// (TITLE → ARMORY → LOADOUT → run). The choice is locked once the run starts;
// in-run you switch among the chosen ≤4 (radial for weapons, Digit 1-4 for
// abilities). Persists to rainboidsMeta.loadout so it pre-fills next time.

import { GAME_STATES } from '../core/constants.js';
import { loadMeta, saveMeta } from '../core/storage.js';
import { PRIMARY_WEAPONS, POWER_WEAPONS, ABILITIES } from '../combat/weapon-data.js';
import { getUnlockedSet, toggleSelection, normalizeLoadout, LOADOUT_SLOTS } from '../shop/armory.js';
import { createItemCard } from './item-card.js';
import { ACTIONS, abilityAction, getBinding } from './bindings.js';

const CATS = {
    primaries: { label: 'PRIMARY', defs: () => PRIMARY_WEAPONS },
    powers:    { label: 'POWER',   defs: () => POWER_WEAPONS },
    abilities: { label: 'ABILITY', defs: () => ABILITIES },
};

export class LoadoutOverlay {
    constructor() {
        this.gameEngine = null;
        this._isOpen = false;
        this._built = false;
        this.elements = {};
        this.chosen = { primaries: [], powers: [], abilities: [] };
    }

    setGameEngine(ge) { this.gameEngine = ge; }
    isOpen() { return this._isOpen; }

    _build() {
        if (this._built) return;
        let overlay = document.getElementById('loadout-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'loadout-overlay';
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
        title.textContent = 'LOADOUT';
        header.appendChild(title);
        panel.appendChild(header);

        const sub = document.createElement('div');
        sub.className = 'armory-sub';
        sub.textContent = `Pick up to ${LOADOUT_SLOTS} of each from your unlocked pool. Locked for the run — switch among them in-flight (weapons: radial / [ ], abilities: 1-4).`;
        panel.appendChild(sub);

        const body = document.createElement('div');
        body.className = 'armory-body';
        panel.appendChild(body);

        const footer = document.createElement('div');
        footer.className = 'armory-footer';
        const back = document.createElement('button');
        back.className = 'armory-btn armory-btn--back';
        back.textContent = '← ARMORY';
        back.addEventListener('click', () => this.back());
        const begin = document.createElement('button');
        begin.className = 'armory-btn armory-btn--start';
        begin.textContent = 'BEGIN RUN →';
        begin.addEventListener('click', () => this.begin());
        footer.append(back, begin);
        panel.appendChild(footer);

        overlay.appendChild(panel);
        this.elements = { overlay, body };
        this._built = true;
    }

    open() {
        this._build();
        this._isOpen = true;
        // Pre-fill from the saved loadout, normalized against the current
        // unlocked pool (so newly-locked ids drop and a fresh account
        // defaults to its base kit).
        const meta = loadMeta() || {};
        this.chosen = normalizeLoadout(meta.loadout || {}, meta);
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
        if (ge && typeof ge.openArmory === 'function') ge.openArmory();
    }

    toggle(category, id) {
        this.chosen[category] = toggleSelection(this.chosen[category], id, LOADOUT_SLOTS);
        this.render();
    }

    begin() {
        const ge = this.gameEngine;
        const meta = loadMeta() || {};
        const loadout = normalizeLoadout(this.chosen, meta);
        saveMeta({ loadout });
        this.close();
        if (!ge) return;
        if (typeof ge._finalizeTitleExit === 'function') {
            try { ge._finalizeTitleExit(); } catch {}
        }
        if (typeof ge.startNewRun === 'function') ge.startNewRun(loadout);
    }

    render() {
        const body = this.elements.body;
        if (!body) return;
        body.replaceChildren();
        const meta = loadMeta() || {};

        for (const category of Object.keys(CATS)) {
            const cat = CATS[category];
            const defs = cat.defs();
            const unlocked = [...getUnlockedSet(category, meta)];
            const picked = this.chosen[category] || [];

            const section = document.createElement('div');
            section.className = 'armory-section';
            const secTitle = document.createElement('div');
            secTitle.className = 'armory-section-title';
            secTitle.textContent = `${cat.label}  ·  ${picked.length}/${LOADOUT_SLOTS}`;
            section.appendChild(secTitle);

            const list = document.createElement('div');
            list.className = 'armory-list';
            for (const id of unlocked) {
                const def = defs[id];
                if (!def) continue;
                const isPicked = picked.includes(id);
                const pickedIndex = picked.indexOf(id);
                const action = category === 'primaries' ? ACTIONS.FIRE_PRIMARY
                    : category === 'powers' ? ACTIONS.FIRE_POWER
                    : (pickedIndex >= 0 ? abilityAction(pickedIndex) : null);
                const device = this.gameEngine?.controlScheme === 'touch'
                    ? 'touch' : (this.gameEngine?.controlScheme === 'gamepad' ? 'gamepad' : 'keyboard');
                const binding = action ? getBinding(device, action, { layout: this.gameEngine?.gamepad?.getLayout?.() || 'pro' }) : null;
                const row = createItemCard({ ...def, type: cat.label }, {
                    variant: 'compact',
                    binding: isPicked ? binding : null,
                    focusable: true,
                    badge: isPicked ? `SLOT ${pickedIndex + 1}` : null,
                });
                row.classList.add('armory-row');
                if (isPicked) row.classList.add('armory-row--owned');
                const btn = document.createElement('button');
                btn.className = 'armory-buy loadout-pick' + (isPicked ? ' loadout-pick--on' : '');
                // Disable selecting more once at the cap (but allow deselect).
                btn.disabled = !isPicked && picked.length >= LOADOUT_SLOTS;
                btn.textContent = isPicked ? '✓ EQUIPPED' : 'EQUIP';
                btn.addEventListener('click', () => this.toggle(category, id));
                row.appendChild(btn);
                list.appendChild(row);
            }
            section.appendChild(list);
            body.appendChild(section);
        }
    }
}
