// Inventory management overlay — the player's gear-equip surface ('I' key, the
// pause-menu / BUILD "INVENTORY" button). 8.13.0 — this is now a FULL equip
// manager: tap a stash item to equip it (primary weapon, power weapon, or one of
// the five gear slots), tap an equipped piece to unequip it. It works pre-run
// (meta only) AND mid-run (applied LIVE to the player — gear is no longer locked
// once a run starts). Opening mid-run first flushes this-run drops into the
// stash so freshly-found loot is equippable immediately.
//
// State of truth is the persistent meta ({ stash, equippedItems, equippedWeapon,
// equippedPowerWeapon }); the live player mirrors it. Pauses the game while open
// (when in a run), mirroring StatsOverlay's pause-capture/restore.

import { GAME_STATES } from '../core/constants.js';
import { SLOT_ORDER } from '../world/item-names.js';
import { ELEMENTS, isElement } from '../combat/elements.js';
import { createItemCard, createStatPanel, compareItemStats } from './item-card.js';
import { GamepadFocusController } from './gamepad-focus.js';
import { loadMeta, saveMeta } from '../core/storage.js';
import {
    getEquipped, getEquippedWeapon, getEquippedPowerWeapon,
    equipFromStash, equipWeaponFromStash, equipPowerWeaponFromStash,
    unequipSlot, unequipPowerWeapon,
} from '../world/inventory.js';

// ITEM-01 — map a `<element>Resist` affix type back to its ELEMENTS entry.
function _elementForResistType(type) {
    if (typeof type !== 'string' || !type.endsWith('Resist')) return null;
    const id = type.slice(0, -'Resist'.length).toUpperCase();
    return isElement(id) ? ELEMENTS[id] : null;
}

export class InventoryOverlay {
    constructor() {
        this.gameEngine = null;
        this.elements = {
            overlay: document.getElementById('inventory-overlay'),
            body:    document.getElementById('inventory-body'),
            close:   document.getElementById('inventory-close'),
        };
        this._isOpen = false;
        this._inRun = false;
        this._cameFromPauseMenu = false;
        this._wasPaused = false;

        if (this.elements.close) {
            this.elements.close.addEventListener('click', () => this.close());
        }
        if (this.elements.overlay) {
            this.elements.overlay.addEventListener('click', (e) => {
                if (e.target === this.elements.overlay) this.close();
            });
        }
        this.focus = new GamepadFocusController(this.elements.body, { onBack: () => (this.close(), true) });
    }

    setGameEngine(ge) { this.gameEngine = ge; }
    isOpen() { return this._isOpen; }

    open() {
        if (!this.elements.overlay || !this.gameEngine) return false;
        const ge = this.gameEngine;
        // Mid-run (a live player exists): flush this-run drops into the stash so
        // they're equippable now, and pause. Pre-run: meta-only, no pause.
        const inRun = !!ge.player;
        this._inRun = inRun;
        if (inRun) {
            try { ge.commitRunLootToStash?.(); } catch (_e) { /* never block open */ }
            const pauseDom = document.getElementById('pause-overlay');
            this._cameFromPauseMenu = !!(pauseDom && pauseDom.style.display === 'flex');
            this._wasPaused = !!(ge.game && ge.game.state === GAME_STATES.PAUSED);
            if (!this._wasPaused) ge.togglePause();
            if (pauseDom) pauseDom.style.display = 'none';
        } else {
            this._cameFromPauseMenu = false;
            this._wasPaused = false;
        }
        this._isOpen = true;
        this.elements.overlay.style.display = 'flex';
        this.render();
        this.focus.setRoot(this.elements.body);
        this.focus.focusFirst();
        return true;
    }

    close() {
        if (!this._isOpen) return;
        this._isOpen = false;
        if (this.elements.overlay) this.elements.overlay.style.display = 'none';
        const ge = this.gameEngine;
        const pauseDom = document.getElementById('pause-overlay');
        if (this._inRun && this._cameFromPauseMenu && pauseDom) {
            pauseDom.style.display = 'flex';
        } else if (this._inRun && !this._wasPaused && ge) {
            ge.togglePause();
        }
        this._cameFromPauseMenu = false;
        this._wasPaused = false;
    }

    toggle() { return this._isOpen ? (this.close(), false) : (this.open(), true); }

    // ── equip / unequip ─────────────────────────────────────────────────
    // All mutate the persistent meta (saveMeta) and, when a live player exists,
    // re-apply the equipped set to it immediately, then re-render.

    _equipStash(stashIndex, item) {
        const meta = loadMeta() || {};
        let res;
        if (item && item.kind === 'weapon') res = equipWeaponFromStash(meta, stashIndex);
        else if (item && item.kind === 'powerweapon') res = equipPowerWeaponFromStash(meta, stashIndex);
        else res = equipFromStash(meta, stashIndex);
        if (!res || !res.ok) return;
        this._persist(res.meta);
    }

    _unequipGear(slot) {
        const res = unequipSlot(loadMeta() || {}, slot);
        if (res && res.ok) this._persist(res.meta);
    }

    _unequipPower() {
        const res = unequipPowerWeapon(loadMeta() || {});
        if (res && res.ok) this._persist(res.meta);
    }

    _persist(next) {
        saveMeta({
            stash: next.stash || [],
            equippedItems: next.equippedItems || {},
            equippedWeapon: next.equippedWeapon || null,
            equippedPowerWeapon: next.equippedPowerWeapon || null,
        });
        this._applyEquipLive(next);
        this.render();
        this.focus.setRoot(this.elements.body);
    }

    // Re-apply the equipped set from `meta` to the LIVE player (mid-run only).
    // Idempotent: sets each gear slot, the primary + power weapon, syncs max HP
    // (without a free heal), and refreshes PWR. Pre-run (no player) is a no-op.
    _applyEquipLive(meta) {
        const ge = this.gameEngine;
        const p = ge && ge.player;
        if (!p) return;
        // Gear slots.
        if (p.equippedItems) {
            const eq = (meta.equippedItems && typeof meta.equippedItems === 'object') ? meta.equippedItems : {};
            for (const slot of SLOT_ORDER) p.equippedItems[slot] = eq[slot] || null;
        }
        // Primary weapon (always present; equipWeaponItem resolves the pattern).
        if (meta.equippedWeapon && typeof p.equipWeaponItem === 'function') {
            p.equipWeaponItem(meta.equippedWeapon);
            if (p.activePrimary) p.ownedPrimaries = new Set([p.activePrimary]);
        }
        // Power weapon (may be cleared back to the default).
        if (meta.equippedPowerWeapon && typeof p.equipPowerWeaponItem === 'function') {
            p.equipPowerWeaponItem(meta.equippedPowerWeapon);
            if (p.activePower) p.ownedPowers = new Set([p.activePower]);
        } else if (!meta.equippedPowerWeapon) {
            p.equippedPowerWeapon = null;
            p.activePower = 'CHARGE_SHOT'; // base default when no power weapon equipped
            p.ownedPowers = new Set([p.activePower]);
        }
        if (typeof p._rebuildActivePassives === 'function') {
            try { p._rebuildActivePassives(); } catch (_e) { /* gear passives optional */ }
        }
        // Sync max HP to the new gear (no free heal — clamp current down only).
        if (typeof p.getEffectiveMaxHealth === 'function') {
            const mh = p.getEffectiveMaxHealth();
            if (mh > 0) { p.maxHealth = mh; if (p.health > mh) p.health = mh; }
        }
        ge.recomputePlayerPWR?.();
    }

    // ── resist readout (ITEM-01) ────────────────────────────────────────
    _resistReadout(item) {
        const affixes = (item && Array.isArray(item.affixes)) ? item.affixes : [];
        const resists = [];
        for (const a of affixes) {
            const el = _elementForResistType(a.type);
            if (el) resists.push({ el, value: a.value });
        }
        if (resists.length === 0) return null;
        const wrap = document.createElement('div');
        wrap.className = 'inv-item-resists';
        wrap.style.fontSize = 'calc(11px * var(--font-body-scale, 1))';
        wrap.style.lineHeight = '1.5';
        const tag = document.createElement('span');
        tag.className = 'inv-resist-tag';
        tag.textContent = 'RESIST';
        tag.style.color = '#8895ad';
        tag.style.marginRight = '6px';
        wrap.appendChild(tag);
        for (const { el, value } of resists) {
            const chip = document.createElement('span');
            chip.className = 'inv-resist-chip';
            chip.style.color = el.color;
            chip.style.marginRight = '6px';
            chip.textContent = `${el.name}+${value}%`;
            wrap.appendChild(chip);
        }
        return wrap;
    }

    // Append an action button (EQUIP / UNEQUIP) to a card. Stops propagation so a
    // click equips without also re-triggering the card's hover-preview handlers.
    _actionButton(card, label, onClick) {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'inv-act-btn';
        btn.textContent = label;
        btn.tabIndex = 0;
        btn.dataset.gamepadFocus = 'true';
        btn.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
        card.appendChild(btn);
        return btn;
    }

    render() {
        const body = this.elements.body;
        if (!body) return;
        const meta = loadMeta() || {};
        // Equipped display reads the LIVE player mid-run (the source of truth the
        // game runs on; equips keep it + meta in sync), and falls back to meta
        // pre-run (no player). The stash is always the persistent meta.stash.
        const p = this.gameEngine && this.gameEngine.player;
        const equipped = (p && p.equippedItems) ? p.equippedItems : getEquipped(meta);
        const eqWeapon = p ? (p.equippedWeapon || null) : getEquippedWeapon(meta);
        const eqPower = p ? (p.equippedPowerWeapon || null) : getEquippedPowerWeapon(meta);
        const stash = Array.isArray(meta.stash) ? meta.stash : [];
        body.replaceChildren();

        const shell = document.createElement('div');
        shell.className = 'inv-armory-shell';
        body.appendChild(shell);
        const left = document.createElement('div');
        left.className = 'inv-armory-main';
        shell.appendChild(left);
        const right = document.createElement('div');
        right.className = 'inv-armory-side';
        shell.appendChild(right);

        const showStats = (preview) => right.replaceChildren(createStatPanel(equipped, preview || null));
        showStats(null);

        // ── EQUIPPED (paper doll) ──
        const eqTitle = document.createElement('div');
        eqTitle.className = 'inv-section-title';
        eqTitle.textContent = this._inRun
            ? 'EQUIPPED — change gear any time; applies instantly'
            : 'EQUIPPED — tap stash items below to equip';
        left.appendChild(eqTitle);

        const grid = document.createElement('div');
        grid.className = 'inv-equipped-grid';
        // [slot-id for the empty glyph, live item, unequip-handler|null]
        const cells = [
            ['weapon', eqWeapon, null], // primary always present — swap via stash
            ['power', eqPower, eqPower ? () => this._unequipPower() : null],
            ...SLOT_ORDER.map((slot) => [slot, equipped[slot] || null, equipped[slot] ? () => this._unequipGear(slot) : null]),
        ];
        for (const [slot, it, onUnequip] of cells) {
            const cell = it
                ? createItemCard(it, { variant: 'standard', focusable: true })
                : createItemCard(null, { variant: 'standard', focusable: true, emptySlot: slot });
            if (it) {
                const ro = this._resistReadout(it);
                if (ro) (cell.querySelector('.item-card__body') || cell).appendChild(ro);
                cell.addEventListener('mouseenter', () => showStats(it));
                cell.addEventListener('mouseleave', () => showStats(null));
                if (onUnequip) this._actionButton(cell, 'UNEQUIP', onUnequip);
            }
            grid.appendChild(cell);
        }
        left.appendChild(grid);

        // ── STASH (rarity-colored grid, each item equippable) ──
        const stashTitle = document.createElement('div');
        stashTitle.className = 'inv-section-title';
        stashTitle.textContent = `STASH (${stash.length}) — tap EQUIP to swap a piece in`;
        left.appendChild(stashTitle);

        const stashGrid = document.createElement('div');
        stashGrid.className = 'inv-stash-grid';
        if (stash.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'inv-drop-empty';
            empty.textContent = 'Stash is empty — find loot to fill it.';
            stashGrid.appendChild(empty);
        }
        stash.forEach((it, i) => {
            if (!it) return;
            stashGrid.appendChild(this._stashCard(it, i, equipped, showStats));
        });
        left.appendChild(stashGrid);
    }

    // A rarity-colored stash card with a compare tooltip + an EQUIP button.
    _stashCard(it, stashIndex, equipped, showStats) {
        // Weapons/powers compare against their own equipped slot; gear vs its slot.
        const slotEquipped = (it.kind === 'weapon' || it.kind === 'powerweapon')
            ? null
            : (equipped[it.slot] || null);
        const deltas = compareItemStats(it, slotEquipped);
        const upgrade = deltas.some((d) => d.delta > 0) && !deltas.some((d) => d.delta < 0 && Math.abs(d.delta) > 8);
        const card = createItemCard(it, {
            variant: 'compact',
            focusable: true,
            compareWith: slotEquipped,
            badge: upgrade ? 'UPGRADE' : (it.rarityLabel || `L${it.level || 1}`),
        });
        card.addEventListener('focus', () => showStats(it));
        card.addEventListener('mouseenter', () => showStats(it));
        card.addEventListener('mouseleave', () => showStats(null));
        this._actionButton(card, 'EQUIP', () => this._equipStash(stashIndex, it));
        return card;
    }
}
