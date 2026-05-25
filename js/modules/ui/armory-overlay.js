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
import {
    salvageValue, partitionBulkSalvage,
    rerollCost, tierUpCost, canAffordReroll, canAffordTierUp,
    resistTargetCost, canAffordResistTarget,
} from '../world/cores.js';
import {
    scoreItem, rerollItemAffixes, tierUpItem,
    applyResistTarget, maxResistAffixes, isResistAffix,
} from '../world/item-system.js';
import { getEquipped, stashForSlot, equipFromStash, unequipSlot, equipDelta } from '../world/inventory.js';
import { SLOT_ORDER, SLOT_LABEL } from '../world/item-names.js';
import { ELEMENTS } from '../combat/elements.js';

// META-03 — the 6 targetable (non-Kinetic) elements, in taxonomy order.
const RESIST_TARGET_ELEMENTS = Object.keys(ELEMENTS).filter((id) => id !== 'KINETIC');

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
        const cores = document.createElement('div');
        cores.className = 'armory-cores';
        header.append(title, cores, gold);
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
        this.elements = { overlay, gold, cores, body };
        this._built = true;
    }

    open() {
        this._build();
        this._gearContainer = null; // legacy full-overlay mode (not gear-tab)
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
        // Phase R5 — the ARMORY now leads to the LOADOUT screen, which picks
        // the chosen 4+4+4 and starts the run (and finalizes the title exit).
        this.close();
        const ge = this.gameEngine;
        if (!ge) return;
        if (typeof ge.openLoadout === 'function') {
            ge.openLoadout();
            return;
        }
        // Fallback: no loadout screen → start directly (finalize title here).
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

    _cores() {
        const ge = this.gameEngine;
        if (ge && ge.game && typeof ge.game.cores === 'number') return ge.game.cores | 0;
        const meta = loadMeta();
        return (meta && typeof meta.cores === 'number') ? meta.cores | 0 : 0;
    }

    _equippedBySlot() {
        const p = this.gameEngine && this.gameEngine.player;
        return (p && p.equippedItems) ? p.equippedItems : {};
    }

    // Phase R8.5 — salvage the stash item at `index` for Cores.
    salvage(index) {
        const meta = loadMeta() || {};
        const stash = Array.isArray(meta.stash) ? meta.stash.slice() : [];
        const item = stash[index];
        if (!item) return false;
        const gained = salvageValue(item);
        stash.splice(index, 1);
        const cores = this._cores() + gained;
        saveMeta({ stash, cores });
        if (this.gameEngine && this.gameEngine.game) this.gameEngine.game.cores = cores;
        this.render();
        return gained;
    }

    // Phase R8.6 — reroll a stash item's affixes (within its tier) for Cores.
    reroll(index) {
        const meta = loadMeta() || {};
        const stash = Array.isArray(meta.stash) ? meta.stash.slice() : [];
        const item = stash[index];
        if (!item) return false;
        const cost = rerollCost(item);
        const cores = this._cores();
        if (cores < cost) return false;
        stash[index] = rerollItemAffixes(item);
        const remaining = cores - cost;
        saveMeta({ stash, cores: remaining });
        if (this.gameEngine && this.gameEngine.game) this.gameEngine.game.cores = remaining;
        this.render();
        return true;
    }

    // Phase R8.8 — raise a stash item one rarity tier for Cores.
    tierUp(index) {
        const meta = loadMeta() || {};
        const stash = Array.isArray(meta.stash) ? meta.stash.slice() : [];
        const item = stash[index];
        if (!item) return false;
        if (!canAffordTierUp(item, this._cores())) return false;
        const cost = tierUpCost(item);
        stash[index] = tierUpItem(item);
        const remaining = this._cores() - cost;
        saveMeta({ stash, cores: remaining });
        if (this.gameEngine && this.gameEngine.game) this.gameEngine.game.cores = remaining;
        this.render();
        return true;
    }

    // META-03 — pay Cores to ADD or SWAP a targeted elemental resist on the
    // stash item at `index`. Mirrors reroll/tierUp: affordability + a clean
    // mutation rejection both leave Cores untouched.
    targetResist(index, element) {
        const meta = loadMeta() || {};
        const stash = Array.isArray(meta.stash) ? meta.stash.slice() : [];
        const item = stash[index];
        if (!item) return false;
        const cores = this._cores();
        const cost = resistTargetCost(item);
        if (cores < cost) return false;
        // Operate on a copy so a rejected mutation never half-edits the stash.
        const copy = { ...item, affixes: (item.affixes || []).map((a) => ({ ...a })) };
        const res = applyResistTarget(copy, element);
        if (!res || !res.ok) return false;
        stash[index] = copy;
        const remaining = cores - cost;
        saveMeta({ stash, cores: remaining });
        if (this.gameEngine && this.gameEngine.game) this.gameEngine.game.cores = remaining;
        this.render();
        return true;
    }

    // Phase R8.3 — equip stash[index] into its gear slot (swapping any
    // currently-equipped item back to the stash). Persists to meta; the
    // run picks it up at init via applyPersistentProfile.
    equip(index) {
        const meta = loadMeta() || {};
        const { ok, meta: next } = equipFromStash(meta, index);
        if (!ok) return false;
        saveMeta({ stash: next.stash, equippedItems: next.equippedItems });
        this.render();
        return true;
    }

    unequip(slot) {
        const meta = loadMeta() || {};
        const { ok, meta: next } = unequipSlot(meta, slot);
        if (!ok) return false;
        saveMeta({ stash: next.stash, equippedItems: next.equippedItems });
        this.render();
        return true;
    }

    // Phase R8.5 — bulk-salvage every stash item strictly worse than the
    // equipped item in its slot.
    salvageAllBelowEquipped() {
        const meta = loadMeta() || {};
        const stash = Array.isArray(meta.stash) ? meta.stash : [];
        const { keep, salvage } = partitionBulkSalvage(stash, this._equippedBySlot(), scoreItem);
        if (salvage.length === 0) return 0;
        const gained = salvage.reduce((s, it) => s + salvageValue(it), 0);
        const cores = this._cores() + gained;
        saveMeta({ stash: keep, cores });
        if (this.gameEngine && this.gameEngine.game) this.gameEngine.game.cores = cores;
        this.render();
        return gained;
    }

    // 2026-05-23 — Render ONLY the gear panels (equipment + stash) into an
    // arbitrary container, for the pre-run BUILD tree's GEAR tab. Binds
    // `_gearContainer` so the gear mutation methods' `this.render()` refresh
    // in place here instead of the (unbuilt) flat overlay body.
    renderGearInto(container) {
        if (!container) return;
        this._gearContainer = container;
        this.render();
    }

    render() {
        // GEAR-tab mode: render only the gear panels into the bound container.
        if (this._gearContainer) {
            const c = this._gearContainer;
            const meta = loadMeta() || {};
            c.replaceChildren();
            const head = document.createElement('div');
            head.className = 'armory-section-title';
            head.textContent = `CORES: ${this._cores()} ✦`;
            c.appendChild(head);
            this._renderEquipment(c, meta);
            this._renderStash(c, meta);
            return;
        }
        const { gold, cores, body } = this.elements;
        if (!body) return;
        const accountGold = this._accountGold();
        if (gold) gold.textContent = `${accountGold} ⬢`;
        if (cores) cores.textContent = `${this._cores()} ✦`;
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

        this._renderEquipment(body, meta);
        this._renderStash(body, meta);
    }

    // Phase R8.3 — the 5 gear slots: equipped item + the best stash
    // candidates to swap in, with score deltas. Editable only here (pre-run);
    // gear is locked once a run begins.
    _renderEquipment(body, meta) {
        const equipped = getEquipped(meta);
        const section = document.createElement('div');
        section.className = 'armory-section';
        const secTitle = document.createElement('div');
        secTitle.className = 'armory-section-title';
        secTitle.textContent = 'EQUIPMENT  ·  5 gear slots (locked once a run starts)';
        section.appendChild(secTitle);

        const list = document.createElement('div');
        list.className = 'armory-list';
        for (const slot of SLOT_ORDER) {
            const cur = equipped[slot];
            const row = document.createElement('div');
            row.className = 'armory-row';
            const name = document.createElement('span');
            name.className = 'armory-row-name';
            const label = SLOT_LABEL[slot] || slot.toUpperCase();
            if (cur) {
                name.textContent = `${label}: ${cur.name || slot} (L${cur.level || 1})`;
                if (cur.rarityColor) name.style.color = cur.rarityColor;
            } else {
                name.textContent = `${label}: — empty —`;
            }
            row.appendChild(name);
            if (cur) {
                const un = document.createElement('button');
                un.className = 'armory-buy';
                un.textContent = 'UNEQUIP';
                un.addEventListener('click', () => this.unequip(slot));
                row.appendChild(un);
            }
            list.appendChild(row);

            // Up to 4 best candidates from the stash for this slot.
            const candidates = stashForSlot(meta, slot)
                .map((c) => ({ ...c, delta: equipDelta(meta, c.item, scoreItem) }))
                .sort((a, b) => b.delta - a.delta)
                .slice(0, 4);
            for (const c of candidates) {
                const crow = document.createElement('div');
                crow.className = 'armory-row armory-row--candidate';
                const cn = document.createElement('span');
                cn.className = 'armory-row-name';
                const sign = c.delta >= 0 ? '+' : '';
                cn.textContent = `  ↳ ${c.item.name || slot} (L${c.item.level || 1})  ${sign}${c.delta}`;
                if (c.item.rarityColor) cn.style.color = c.item.rarityColor;
                const btn = document.createElement('button');
                btn.className = 'armory-buy';
                btn.textContent = 'EQUIP';
                btn.addEventListener('click', () => this.equip(c.index));
                crow.append(cn, btn);
                list.appendChild(crow);
            }
        }
        section.appendChild(list);
        body.appendChild(section);
    }

    // Phase R8.1/R8.5 — the persistent gear stash: collected loot, each
    // salvageable for Cores, plus a bulk "salvage all below equipped".
    _renderStash(body, meta) {
        const stash = Array.isArray(meta.stash) ? meta.stash : [];
        const section = document.createElement('div');
        section.className = 'armory-section';

        const secTitle = document.createElement('div');
        secTitle.className = 'armory-section-title';
        secTitle.textContent = `STASH  ·  ${stash.length} item${stash.length === 1 ? '' : 's'}`;
        section.appendChild(secTitle);

        if (stash.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'armory-sub';
            empty.textContent = 'Loot you collect on a run is committed here when the run ends. Salvage it for Cores (✦).';
            section.appendChild(empty);
            body.appendChild(section);
            return;
        }

        const bulk = document.createElement('button');
        bulk.className = 'armory-buy';
        bulk.textContent = 'SALVAGE ALL BELOW EQUIPPED';
        bulk.addEventListener('click', () => this.salvageAllBelowEquipped());
        section.appendChild(bulk);

        const list = document.createElement('div');
        list.className = 'armory-list';
        // Show the most recent first; cap the rendered rows for sanity.
        const view = stash.map((it, i) => ({ it, i })).reverse().slice(0, 60);
        const cores = this._cores();
        for (const { it, i } of view) {
            const row = document.createElement('div');
            row.className = 'armory-row';
            const name = document.createElement('span');
            name.className = 'armory-row-name';
            name.textContent = `${it.name || it.slot} · L${it.level || 1}`;
            if (it.rarityColor) name.style.color = it.rarityColor;

            const actions = document.createElement('span');
            actions.className = 'armory-row-actions';

            // Reroll affixes (R8.6).
            const reCost = rerollCost(it);
            const reBtn = document.createElement('button');
            reBtn.className = 'armory-buy';
            reBtn.disabled = !canAffordReroll(it, cores);
            reBtn.textContent = `REROLL · ${reCost} ✦`;
            reBtn.addEventListener('click', () => this.reroll(i));
            actions.appendChild(reBtn);

            // Tier-up (R8.8) — hidden at max tier.
            const tuCost = tierUpCost(it);
            if (tuCost !== Infinity) {
                const tuBtn = document.createElement('button');
                tuBtn.className = 'armory-buy';
                tuBtn.disabled = !canAffordTierUp(it, cores);
                tuBtn.textContent = `TIER-UP · ${tuCost} ✦`;
                tuBtn.addEventListener('click', () => this.tierUp(i));
                actions.appendChild(tuBtn);
            }

            // Salvage (R8.5).
            const btn = document.createElement('button');
            btn.className = 'armory-buy';
            btn.textContent = `SALVAGE · ${salvageValue(it)} ✦`;
            btn.addEventListener('click', () => this.salvage(i));
            actions.appendChild(btn);

            row.append(name, actions);
            list.appendChild(row);

            // META-03 — TARGET RESIST: a sub-row with the current resist count
            // vs the rarity cap + a tinted element picker that spends Cores.
            list.appendChild(this._buildResistTargetRow(it, i, cores));
        }
        section.appendChild(list);
        body.appendChild(section);
    }

    // META-03 — the TARGET RESIST control for one stash item: a small element
    // picker (6 tinted chips) + a cost-bearing label. Greyed out when the
    // item's rarity is tier-locked (cap 0) or Cores are short, mirroring how
    // reroll/tier-up disable.
    _buildResistTargetRow(item, index, cores) {
        const sub = document.createElement('div');
        sub.className = 'armory-row armory-row--candidate';

        const cap = maxResistAffixes(item.rarity);
        const current = Array.isArray(item.affixes)
            ? item.affixes.filter((a) => isResistAffix(a.type)).length : 0;
        const cost = resistTargetCost(item);
        const affordable = canAffordResistTarget(item, cores);
        const locked = cap === 0;

        const lbl = document.createElement('span');
        lbl.className = 'armory-row-name';
        lbl.textContent = locked
            ? `  ↳ TARGET RESIST — tier-locked (${item.rarityLabel || item.rarity})`
            : `  ↳ TARGET RESIST · ${cost} ✦  (RESIST ${current}/${cap})`;
        if (locked) lbl.style.opacity = '0.5';
        sub.appendChild(lbl);

        if (locked) return sub;

        const picker = document.createElement('span');
        picker.className = 'armory-row-actions';
        const have = new Set(
            (item.affixes || [])
                .filter((a) => isResistAffix(a.type))
                .map((a) => a.type),
        );
        for (const el of RESIST_TARGET_ELEMENTS) {
            const def = ELEMENTS[el];
            const resistType = `${el.toLowerCase()}Resist`;
            const owns = have.has(resistType);
            const chip = document.createElement('button');
            chip.className = 'armory-buy';
            chip.dataset.element = el;
            // First letter of the element name as a compact, color-tinted chip.
            chip.textContent = (def && def.name ? def.name[0] : el[0]).toUpperCase();
            chip.title = `${def ? def.name : el} resist`;
            chip.style.color = (def && def.color) || '#fff';
            // Already on the item (duplicate) or can't afford → disabled.
            chip.disabled = owns || !affordable;
            if (owns) chip.style.outline = `1px solid ${(def && def.color) || '#fff'}`;
            chip.addEventListener('click', () => this.targetResist(index, el));
            picker.appendChild(chip);
        }
        sub.appendChild(picker);
        return sub;
    }
}
