// Phase R2 — ARMORY screen: the pre-run meta store where account-gold buys
// permanent weapon/ability UNLOCKS. Shown between NEW GAME and the run
// (TITLE → ARMORY → run). CONTINUE skips it.
//
// Full-screen opaque DOM overlay (so the canvas behind it is irrelevant —
// no render-loop changes needed). Builds its own markup lazily on first
// open; reads/writes the rainboidsMeta unlock lists via core/storage.

import { GAME_STATES } from '../core/constants.js';
import { loadMeta, saveMeta } from '../core/storage.js';
import { PRIMARY_WEAPONS, POWER_WEAPONS, ABILITIES, PRIMARY_ARCHETYPES } from '../combat/weapon-data.js';
// T42 — Fabricate (the R$ sink): cost lookup for the craft UI. (crafting-costs
// keys rarities Capitalized; the gear/weapon vocab is lowercase — see _fabCost.)
import { fabricateCost } from '../shop/crafting-costs.js';
import {
    UNLOCK_CATEGORIES, unlockCost, getUnlockedSet, getLockedIds, applyUnlock,
} from '../shop/armory.js';
import {
    salvageValue, partitionBulkSalvage,
    rerollCost, tierUpCost, canAffordReroll, canAffordTierUp,
    resistTargetCost, canAffordResistTarget,
    passiveRerollCost, canAffordPassiveReroll,
} from '../world/cores.js';
import {
    scoreItem, rerollItemAffixes, tierUpItem,
    applyResistTarget, maxResistAffixes, isResistAffix,
    eligibleItemPassives, rerollItemPassive, createPowerWeaponItem,
} from '../world/item-system.js';
import { getEquipped, stashForSlot, equipFromStash, unequipSlot, equipDelta, getEquippedWeapon, getEquippedPowerWeapon, stashWeapons, equipWeaponFromStash, stashPowerWeapons, equipPowerWeaponFromStash } from '../world/inventory.js';
import { SLOT_ORDER, SLOT_LABEL, RARITY_ORDER } from '../world/item-names.js';
import { ELEMENTS } from '../combat/elements.js';
import { getPassive } from '../combat/passive-data.js';

// META-03 — the 6 targetable (non-Kinetic) elements, in taxonomy order.
const RESIST_TARGET_ELEMENTS = Object.keys(ELEMENTS).filter((id) => id !== 'KINETIC');

const CATEGORY_DEFS = {
    primaries: { label: 'Primary Weapons', defs: () => PRIMARY_WEAPONS },
    powers:    { label: 'Power Weapons',   defs: () => POWER_WEAPONS },
    abilities: { label: 'Abilities',       defs: () => ABILITIES },
};

// Slot ids ship as ALL-CAPS labels (shared with the inventory paper-doll).
// The armory wants a softer, sentence-cased heading — title-case for display
// here only, leaving SLOT_LABEL untouched for the other UIs.
function titleCase(s) {
    return String(s || '').toLowerCase().replace(/\b\w/g, (c) => c.toUpperCase());
}

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
        // 8.x (T23) — Cores retired; the header keeps a single Rainshard (R$)
        // readout (`gold`). `cores` stays in this.elements for back-compat but
        // is no longer mounted.
        header.append(title, gold);
        panel.appendChild(header);

        const sub = document.createElement('div');
        sub.className = 'armory-sub';
        sub.textContent = 'Spend account Rainshards (R$) on permanent unlocks. Run-Rainshards you earn each run bank here on death or victory.';
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

    // 8.x looter pivot (T23) — Cores RETIRED. GEAR salvage/reroll/tier-up/
    // resist-target/passive-reroll now spend the persistent Rainshard wallet
    // (accountGold). Method name kept internal; it returns the R$ balance.
    _cores() {
        const ge = this.gameEngine;
        if (ge && ge.game && typeof ge.game.accountGold === 'number') return ge.game.accountGold | 0;
        const meta = loadMeta();
        return (meta && typeof meta.accountGold === 'number') ? meta.accountGold | 0 : 0;
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
        saveMeta({ stash, accountGold: cores });
        if (this.gameEngine && this.gameEngine.game) this.gameEngine.game.accountGold = cores;
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
        saveMeta({ stash, accountGold: remaining });
        if (this.gameEngine && this.gameEngine.game) this.gameEngine.game.accountGold = remaining;
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
        saveMeta({ stash, accountGold: remaining });
        if (this.gameEngine && this.gameEngine.game) this.gameEngine.game.accountGold = remaining;
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
        saveMeta({ stash, accountGold: remaining });
        if (this.gameEngine && this.gameEngine.game) this.gameEngine.game.accountGold = remaining;
        this.render();
        return true;
    }

    // META-04 — pay Cores to REROLL the gear passive on the stash item at
    // `index`. Mirrors targetResist: affordability + a clean mutation rejection
    // (tier-locked / no-alternatives) both leave Cores untouched.
    rerollPassive(index) {
        const meta = loadMeta() || {};
        const stash = Array.isArray(meta.stash) ? meta.stash.slice() : [];
        const item = stash[index];
        if (!item) return false;
        const cores = this._cores();
        const cost = passiveRerollCost(item);
        if (cores < cost) return false;
        // Operate on a copy so a rejected mutation never half-edits the stash.
        const copy = { ...item, affixes: (item.affixes || []).map((a) => ({ ...a })) };
        const res = rerollItemPassive(copy);
        if (!res || !res.ok) return false;
        stash[index] = copy;
        const remaining = cores - cost;
        saveMeta({ stash, accountGold: remaining });
        if (this.gameEngine && this.gameEngine.game) this.gameEngine.game.accountGold = remaining;
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

    // 8.x — weapons-as-gear: equip stash[index] (a weapon item) into the single
    // weapon slot, returning any equipped weapon to the stash. Persists to meta;
    // the run reads it at init (applyPersistentProfile). If a player is live, it
    // also takes effect immediately (the equipped weapon drives activePrimary).
    equipWeapon(index) {
        const meta = loadMeta() || {};
        const { ok, meta: next } = equipWeaponFromStash(meta, index);
        if (!ok) return false;
        saveMeta({ stash: next.stash, equippedWeapon: next.equippedWeapon });
        const p = this.gameEngine && this.gameEngine.player;
        if (p && typeof p.equipWeaponItem === 'function') {
            p.equipWeaponItem(next.equippedWeapon);
            if (p.activePrimary) p.ownedPrimaries = new Set([p.activePrimary]);
        }
        this.render();
        return true;
    }

    // 8.x — equip a POWER weapon you FOUND (a power-weapon loot item in the
    // stash), mirroring equipWeapon. Persisted as meta.equippedPowerWeapon and
    // read at run init; a live player picks it up immediately (drives activePower).
    equipPowerWeapon(index) {
        const meta = loadMeta() || {};
        const { ok, meta: next } = equipPowerWeaponFromStash(meta, index);
        if (!ok) return false;
        saveMeta({ stash: next.stash, equippedPowerWeapon: next.equippedPowerWeapon });
        const p = this.gameEngine && this.gameEngine.player;
        if (p && typeof p.equipPowerWeaponItem === 'function') {
            p.equipPowerWeaponItem(next.equippedPowerWeapon);
            if (p.activePower) p.ownedPowers = new Set([p.activePower]);
        }
        this.render();
        return true;
    }

    // Phase R8.5 — bulk-salvage every stash item strictly worse than the
    // equipped item in its slot.
    salvageAllBelowEquipped() {
        const meta = loadMeta() || {};
        const stash = Array.isArray(meta.stash) ? meta.stash : [];
        // T31 — weapons aren't gear: never bulk-salvage them here. Partition only
        // the gear items and preserve the weapons in `keep`.
        const weapons = stash.filter((it) => it && it.kind === 'weapon');
        const gear = stash.filter((it) => !it || it.kind !== 'weapon');
        const { keep, salvage } = partitionBulkSalvage(gear, this._equippedBySlot(), scoreItem);
        if (salvage.length === 0) return 0;
        const gained = salvage.reduce((s, it) => s + salvageValue(it), 0);
        const cores = this._cores() + gained;
        saveMeta({ stash: [...keep, ...weapons], accountGold: cores });
        if (this.gameEngine && this.gameEngine.game) this.gameEngine.game.accountGold = cores;
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
            const wallet = document.createElement('div');
            wallet.className = 'armory-wallet';
            const wLabel = document.createElement('span');
            wLabel.className = 'armory-wallet-label';
            wLabel.textContent = 'Rainshards';
            const wValue = document.createElement('span');
            wValue.className = 'armory-wallet-value';
            wValue.textContent = `R$ ${this._cores()}`;
            wallet.append(wLabel, wValue);
            c.appendChild(wallet);
            // 8.13.0 — equipping moved to the standalone INVENTORY overlay (open
            // any time, mid-run too). The GEAR tab just launches it + the
            // fabricator, and keeps the salvage/craft stash list.
            this._renderInventoryButton(c);
            this._renderFabricateButton(c);
            this._renderStash(c, meta);
            return;
        }
        const { gold, cores, body } = this.elements;
        if (!body) return;
        const accountGold = this._accountGold();
        if (gold) gold.textContent = `R$ ${accountGold}`;
        // 8.x (T23) — Cores retired; the second header readout is now blank.
        if (cores) cores.textContent = '';
        body.replaceChildren();

        const meta = loadMeta() || {};
        for (const category of Object.keys(CATEGORY_DEFS)) {
            const cat = CATEGORY_DEFS[category];
            const defs = cat.defs();
            const section = document.createElement('div');
            section.className = 'armory-section';

            const cost = unlockCost(category);
            this._sectionHead(section, cat.label, `R$ ${cost} each`);

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
                tag.textContent = UNLOCK_CATEGORIES[category].base.includes(id) ? 'Base' : 'Owned';
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
                btn.textContent = `Unlock · R$ ${cost}`;
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

    // Build a section heading: a Title-Case title with an optional muted
    // subtitle beneath it. The CSS gives the heading→body breathing room, so
    // callers no longer pad headings with " · descriptor" suffixes.
    _sectionHead(section, title, subtitle) {
        const head = document.createElement('div');
        head.className = 'armory-section-head';
        const t = document.createElement('div');
        t.className = 'armory-section-title';
        t.textContent = title;
        head.appendChild(t);
        if (subtitle) {
            const s = document.createElement('div');
            s.className = 'armory-section-sub';
            s.textContent = subtitle;
            head.appendChild(s);
        }
        section.appendChild(head);
        return head;
    }

    // Phase R8.3 — the 5 gear slots: equipped item + the best stash
    // candidates to swap in, with score deltas. Editable only here (pre-run);
    // gear is locked once a run begins.
    // 8.x — WEAPON panel: your equipped weapon (drives the run's primary firing
    // pattern + carries its rolled traits/level) and the stash weapons you can
    // swap to. Weapons are loot now — equipped here or on the 'I' inventory
    // screen, not picked in a pre-run weapon menu.
    _renderWeapon(body, meta) {
        const section = document.createElement('div');
        section.className = 'armory-section';
        this._sectionHead(section, 'Primary Weapon');

        const list = document.createElement('div');
        list.className = 'armory-list';

        const equipped = getEquippedWeapon(meta);
        const eqRow = document.createElement('div');
        eqRow.className = 'armory-row armory-row--equipped';
        const eqName = document.createElement('span');
        eqName.className = 'armory-row-name';
        const eqTag = document.createElement('span');
        eqTag.className = 'armory-row-tag';
        eqTag.textContent = 'Equipped';
        if (equipped) {
            eqName.textContent = `${equipped.name || 'Weapon'} · L${equipped.level || 1}`;
            if (equipped.rarityColor) eqName.style.color = equipped.rarityColor;
        } else {
            const em = document.createElement('em');
            em.className = 'slot-empty';
            em.textContent = 'Empty';
            eqName.appendChild(em);
        }
        eqRow.append(eqName, eqTag);
        list.appendChild(eqRow);

        const weapons = stashWeapons(meta);
        if (weapons.length === 0) {
            const hint = document.createElement('div');
            hint.className = 'armory-row armory-row--candidate armory-row--hint';
            const hn = document.createElement('span');
            hn.className = 'armory-row-name';
            hn.textContent = 'No spare weapons — find loot or fabricate one';
            hint.appendChild(hn);
            list.appendChild(hint);
        } else {
            for (const { item, index } of weapons) {
                const crow = document.createElement('div');
                crow.className = 'armory-row armory-row--candidate';
                const cn = document.createElement('span');
                cn.className = 'armory-row-name';
                const tn = (Array.isArray(item.traits) && item.traits.length)
                    ? `  ·  ${item.traits.length} trait${item.traits.length === 1 ? '' : 's'}` : '';
                cn.textContent = `${item.name || 'Weapon'} · L${item.level || 1}${tn}`;
                if (item.rarityColor) cn.style.color = item.rarityColor;
                const btn = document.createElement('button');
                btn.className = 'armory-buy';
                btn.textContent = 'Equip';
                btn.addEventListener('click', () => this.equipWeapon(index));
                crow.append(cn, btn);
                list.appendChild(crow);
            }
        }
        section.appendChild(list);
        body.appendChild(section);
    }

    // 8.x — POWER weapon is found-as-gear (a second loot category): equip a
    // power-weapon item from your stash (drives activePower). Mirrors _renderWeapon;
    // equipped is persisted as meta.equippedPowerWeapon and read at run init.
    _renderPower(body, meta) {
        const section = document.createElement('div');
        section.className = 'armory-section';
        this._sectionHead(section, 'Power Weapon');

        const list = document.createElement('div');
        list.className = 'armory-list';

        const equipped = getEquippedPowerWeapon(meta);
        const eqRow = document.createElement('div');
        eqRow.className = 'armory-row armory-row--equipped';
        const eqName = document.createElement('span');
        eqName.className = 'armory-row-name';
        const eqTag = document.createElement('span');
        eqTag.className = 'armory-row-tag';
        eqTag.textContent = 'Equipped';
        if (equipped) {
            eqName.textContent = `${equipped.name || 'Power'} · L${equipped.level || 1}`;
            if (equipped.rarityColor) eqName.style.color = equipped.rarityColor;
        } else {
            const em = document.createElement('em');
            em.className = 'slot-empty';
            em.textContent = 'Empty';
            eqName.appendChild(em);
        }
        eqRow.append(eqName, eqTag);
        list.appendChild(eqRow);

        const powers = stashPowerWeapons(meta);
        if (powers.length === 0) {
            const hint = document.createElement('div');
            hint.className = 'armory-row armory-row--candidate armory-row--hint';
            const hn = document.createElement('span');
            hn.className = 'armory-row-name';
            hn.textContent = 'No power weapons — find loot or fabricate one';
            hint.appendChild(hn);
            list.appendChild(hint);
        } else {
            for (const { item, index } of powers) {
                const crow = document.createElement('div');
                crow.className = 'armory-row armory-row--candidate';
                const cn = document.createElement('span');
                cn.className = 'armory-row-name';
                cn.textContent = `${item.name || 'Power'} · L${item.level || 1}`;
                if (item.rarityColor) cn.style.color = item.rarityColor;
                const btn = document.createElement('button');
                btn.className = 'armory-buy';
                btn.textContent = 'Equip';
                btn.addEventListener('click', () => this.equipPowerWeapon(index));
                crow.append(cn, btn);
                list.appendChild(crow);
            }
        }
        section.appendChild(list);
        body.appendChild(section);
    }

    _renderEquipment(body, meta) {
        const equipped = getEquipped(meta);
        const section = document.createElement('div');
        section.className = 'armory-section';
        this._sectionHead(section, 'Equipment', '5 gear slots · locked once a run starts');

        const list = document.createElement('div');
        list.className = 'armory-list';
        for (const slot of SLOT_ORDER) {
            const cur = equipped[slot];
            const row = document.createElement('div');
            row.className = 'armory-row';
            const name = document.createElement('span');
            name.className = 'armory-row-name';
            const slotTag = document.createElement('span');
            slotTag.className = 'armory-row-slot';
            slotTag.textContent = titleCase(SLOT_LABEL[slot] || slot);
            if (cur) {
                name.textContent = `${cur.name || slot} · L${cur.level || 1}`;
                if (cur.rarityColor) name.style.color = cur.rarityColor;
            } else {
                const em = document.createElement('em');
                em.className = 'slot-empty';
                em.textContent = 'Empty';
                name.appendChild(em);
            }
            const left = document.createElement('span');
            left.className = 'armory-row-lead';
            left.append(slotTag, name);
            row.appendChild(left);
            if (cur) {
                const un = document.createElement('button');
                un.className = 'armory-buy';
                un.textContent = 'Unequip';
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
                cn.textContent = `${c.item.name || slot} · L${c.item.level || 1}`;
                if (c.item.rarityColor) cn.style.color = c.item.rarityColor;
                const delta = document.createElement('span');
                delta.className = c.delta >= 0 ? 'armory-delta armory-delta--up' : 'armory-delta armory-delta--down';
                delta.textContent = `${c.delta >= 0 ? '+' : ''}${c.delta}`;
                const lead = document.createElement('span');
                lead.className = 'armory-row-lead';
                lead.append(cn, delta);
                const btn = document.createElement('button');
                btn.className = 'armory-buy';
                btn.textContent = 'Equip';
                btn.addEventListener('click', () => this.equip(c.index));
                crow.append(lead, btn);
                list.appendChild(crow);
            }
        }
        section.appendChild(list);
        body.appendChild(section);
    }

    // crafting-costs keys rarities Capitalized; the gear/weapon vocab is
    // lowercase ('common'…). Capitalize-first matches the cost table.
    _fabCost(rarity) {
        const cap = rarity.charAt(0).toUpperCase() + rarity.slice(1);
        return fabricateCost(cap, {});
    }

    // The GEAR tab shows a button that opens the standalone FABRICATE overlay
    // (the controls live there now, not embedded in the gear panel).
    _renderFabricateButton(c) {
        const section = document.createElement('div');
        section.className = 'armory-section';
        this._sectionHead(section, 'Fabricate', 'Spend Rainshards to craft fresh loot');
        const btn = document.createElement('button');
        btn.className = 'armory-buy armory-fab-open';
        btn.textContent = '⚒  Open Fabricator';
        btn.addEventListener('click', () => this.openFabricate());
        section.appendChild(btn);
        c.appendChild(section);
    }

    // 8.13.0 — launch the standalone INVENTORY overlay (the equip surface for the
    // primary weapon, power weapon, and the 5 gear slots). Opens any time, mid-run
    // too; replaces the old inline pre-run equip lists.
    _renderInventoryButton(c) {
        const section = document.createElement('div');
        section.className = 'armory-section';
        this._sectionHead(section, 'Loadout', 'Equip your primary, power & gear');
        const btn = document.createElement('button');
        btn.className = 'armory-buy armory-inv-open';
        btn.textContent = '⚙  Open Inventory';
        btn.addEventListener('click', () => {
            const ge = this.gameEngine || (typeof window !== 'undefined' ? window.gameEngine : null);
            if (ge && typeof ge.toggleInventoryScreen === 'function') ge.toggleInventoryScreen();
        });
        section.appendChild(btn);
        c.appendChild(section);
    }

    /** Open the standalone FABRICATE overlay (renders the controls into it). */
    openFabricate() {
        const overlay = document.getElementById('fabricate-overlay');
        if (!overlay) return;
        this._rerenderFabricate();
        const close = document.getElementById('fabricate-close');
        if (close && !close._fabWired) {
            close._fabWired = true;
            close.addEventListener('click', () => this.closeFabricate());
        }
        if (!overlay._fabWired) {
            overlay._fabWired = true;
            overlay.addEventListener('click', (e) => { if (e.target === overlay) this.closeFabricate(); });
        }
        if (!this._fabKeyHandler) {
            this._fabKeyHandler = (e) => { if (e.key === 'Escape') { e.stopPropagation(); this.closeFabricate(); } };
        }
        document.addEventListener('keydown', this._fabKeyHandler, true);
        overlay.style.display = 'flex';
    }

    /** Close the FABRICATE overlay. */
    closeFabricate() {
        const overlay = document.getElementById('fabricate-overlay');
        if (overlay) overlay.style.display = 'none';
        if (this._fabKeyHandler) document.removeEventListener('keydown', this._fabKeyHandler, true);
    }

    /** Re-render the fabricate controls into the overlay + refresh the GEAR tab. */
    _rerenderFabricate() {
        const body = document.getElementById('fabricate-body');
        if (body) { body.replaceChildren(); this._renderFabricate(body, loadMeta() || {}); }
        if (this._gearContainer) this.render(); // refresh wallet/stash underneath
    }

    // T42 — FABRICATE: spend Rainshards to roll a fresh gear/weapon ITEM into
    // the stash (the R$ sink). A shared rarity picker drives the cost; gear
    // picks a slot, weapon picks an archetype. A successful craft re-renders.
    _renderFabricate(body, meta) {
        const ge = this.gameEngine;
        if (!ge || typeof ge.fabricateGear !== 'function') return;
        const wallet = this._cores();
        const rarity = RARITY_ORDER.includes(this._fabRarity) ? this._fabRarity : 'common';
        const cost = this._fabCost(rarity);

        const section = document.createElement('div');
        section.className = 'armory-section';
        this._sectionHead(section, 'Fabricate', 'Craft new loot for Rainshards');

        const mkSelect = (options, value, onChange, fmt) => {
            const sel = document.createElement('select');
            sel.className = 'armory-buy armory-fab-select';
            for (const o of options) {
                const opt = document.createElement('option');
                opt.value = o;
                opt.textContent = fmt ? fmt(o) : o;
                sel.appendChild(opt);
            }
            sel.value = value;
            sel.addEventListener('change', () => onChange(sel.value));
            return sel;
        };

        // Shared rarity picker.
        const rarityRow = document.createElement('div');
        rarityRow.className = 'armory-row';
        const rLabel = document.createElement('span');
        rLabel.className = 'armory-row-name';
        rLabel.textContent = `Rarity (R$ ${cost})`;
        rarityRow.append(rLabel, mkSelect(RARITY_ORDER, rarity,
            (v) => { this._fabRarity = v; this._rerenderFabricate(); }, (r) => r.toUpperCase()));
        section.appendChild(rarityRow);

        // Gear fabricate row.
        const slot = SLOT_ORDER.includes(this._fabSlot) ? this._fabSlot : SLOT_ORDER[0];
        const gearRow = document.createElement('div');
        gearRow.className = 'armory-row';
        gearRow.appendChild(mkSelect(SLOT_ORDER, slot,
            (v) => { this._fabSlot = v; this._rerenderFabricate(); }, (s) => (SLOT_LABEL[s] || s).toUpperCase()));
        const gearBtn = document.createElement('button');
        gearBtn.className = 'armory-buy';
        gearBtn.textContent = `Fabricate Gear · R$ ${cost}`;
        gearBtn.disabled = wallet < cost;
        gearBtn.addEventListener('click', () => {
            const r = ge.fabricateGear({ slot, rarity });
            if (r && r.ok) this._rerenderFabricate();
        });
        gearRow.appendChild(gearBtn);
        section.appendChild(gearRow);

        // Weapon fabricate row.
        const arch = PRIMARY_ARCHETYPES.includes(this._fabArchetype) ? this._fabArchetype : PRIMARY_ARCHETYPES[0];
        const wepRow = document.createElement('div');
        wepRow.className = 'armory-row';
        wepRow.appendChild(mkSelect(PRIMARY_ARCHETYPES, arch,
            (v) => { this._fabArchetype = v; this._rerenderFabricate(); }));
        const wepBtn = document.createElement('button');
        wepBtn.className = 'armory-buy';
        wepBtn.textContent = `Fabricate Weapon · R$ ${cost}`;
        wepBtn.disabled = wallet < cost;
        wepBtn.addEventListener('click', () => {
            const r = ge.fabricateWeapon({ archetype: arch, rarity });
            if (r && r.ok) this._rerenderFabricate();
        });
        wepRow.appendChild(wepBtn);
        section.appendChild(wepRow);

        body.appendChild(section);
    }

    // Phase R8.1/R8.5 — the persistent gear stash: collected loot, each
    // salvageable for Cores, plus a bulk "salvage all below equipped".
    _renderStash(body, meta) {
        const stash = Array.isArray(meta.stash) ? meta.stash : [];
        // T31 — this is the GEAR stash panel; weapon-loot items (kind:'weapon')
        // live in the same stash but are equipped in the weapon inventory (T42/
        // T43), so they're excluded from the gear rows + bulk-salvage here.
        const gearCount = stash.filter((it) => it && it.kind !== 'weapon').length;
        const section = document.createElement('div');
        section.className = 'armory-section';

        this._sectionHead(section, 'Stash', `${gearCount} item${gearCount === 1 ? '' : 's'}`);

        if (gearCount === 0) {
            const empty = document.createElement('div');
            empty.className = 'armory-sub';
            empty.textContent = 'Loot you collect on a run is committed here when the run ends. Salvage it for Rainshards.';
            section.appendChild(empty);
            body.appendChild(section);
            return;
        }

        const bulk = document.createElement('button');
        bulk.className = 'armory-buy armory-buy--wide';
        bulk.textContent = 'Salvage all below equipped';
        bulk.addEventListener('click', () => this.salvageAllBelowEquipped());
        section.appendChild(bulk);

        const list = document.createElement('div');
        list.className = 'armory-list';
        // Show the most recent first; cap the rendered rows for sanity. Filter
        // AFTER mapping so each row keeps its full-stash index for salvage(index).
        const view = stash.map((it, i) => ({ it, i }))
            .filter(({ it }) => it && it.kind !== 'weapon')
            .reverse().slice(0, 60);
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
            reBtn.textContent = `Reroll · R$ ${reCost}`;
            reBtn.addEventListener('click', () => this.reroll(i));
            actions.appendChild(reBtn);

            // Tier-up (R8.8) — hidden at max tier.
            const tuCost = tierUpCost(it);
            if (tuCost !== Infinity) {
                const tuBtn = document.createElement('button');
                tuBtn.className = 'armory-buy';
                tuBtn.disabled = !canAffordTierUp(it, cores);
                tuBtn.textContent = `Tier up · R$ ${tuCost}`;
                tuBtn.addEventListener('click', () => this.tierUp(i));
                actions.appendChild(tuBtn);
            }

            // Salvage (R8.5).
            const btn = document.createElement('button');
            btn.className = 'armory-buy';
            btn.textContent = `Salvage · R$ ${salvageValue(it)}`;
            btn.addEventListener('click', () => this.salvage(i));
            actions.appendChild(btn);

            row.append(name, actions);
            list.appendChild(row);

            // META-03 — TARGET RESIST: a sub-row with the current resist count
            // vs the rarity cap + a tinted element picker that spends Cores.
            list.appendChild(this._buildResistTargetRow(it, i, cores));

            // META-04 — REROLL PASSIVE: a sub-row showing the item's current
            // gear passive (or "no passive") + a Cores-bearing reroll button.
            list.appendChild(this._buildPassiveRerollRow(it, i, cores));
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
            ? `Target resist — tier-locked (${titleCase(item.rarityLabel || item.rarity)})`
            : `Target resist · R$ ${cost}  ·  ${current}/${cap} resists`;
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

    // META-04 — the REROLL PASSIVE control for one stash item: shows the
    // current gear passive's name (or "no passive yet") + a cost-bearing
    // button. Greyed/disabled when the item's rarity is tier-locked (no
    // eligible passive pool — below Exceptional) or Cores are short, mirroring
    // how reroll/tier-up/target-resist disable. Reads "ROLL PASSIVE" when the
    // eligible item carries none yet, "REROLL PASSIVE" otherwise.
    _buildPassiveRerollRow(item, index, cores) {
        const sub = document.createElement('div');
        sub.className = 'armory-row armory-row--candidate';

        const pool = eligibleItemPassives(item.rarity);
        const locked = pool.length === 0;
        const cost = passiveRerollCost(item);
        const affordable = canAffordPassiveReroll(item, cores);
        const current = item.passive ? getPassive(item.passive) : null;
        const currentName = current ? (current.name || item.passive) : (item.passive || null);

        const lbl = document.createElement('span');
        lbl.className = 'armory-row-name';
        if (locked) {
            lbl.textContent = `Passive — tier-locked (${titleCase(item.rarityLabel || item.rarity)})`;
            lbl.style.opacity = '0.5';
            sub.appendChild(lbl);
            return sub;
        }
        lbl.textContent = currentName
            ? `Passive: ${currentName} · R$ ${cost}`
            : `Passive: none · R$ ${cost}`;
        sub.appendChild(lbl);

        const actions = document.createElement('span');
        actions.className = 'armory-row-actions';
        const btn = document.createElement('button');
        btn.className = 'armory-buy';
        // No passive yet → "ROLL"; otherwise → "REROLL". Disabled when broke or
        // when the lone eligible passive is already on the item (no-alternatives).
        const onlyOption = pool.length === 1 && item.passive === pool[0].id;
        btn.disabled = !affordable || onlyOption;
        btn.textContent = currentName ? `Reroll passive · R$ ${cost}` : `Roll passive · R$ ${cost}`;
        btn.addEventListener('click', () => this.rerollPassive(index));
        actions.appendChild(btn);
        sub.appendChild(actions);
        return sub;
    }
}
