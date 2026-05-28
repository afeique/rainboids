// Inventory management overlay — opened with the 'I' key (6.x).
//
// Shows the five equipped gear slots (with affixes) plus the recent
// loot feed (player.lootFeed). Clicking a recent drop force-equips it to
// its slot (manual override of the auto-equip-if-better rule). Pauses the
// game while open, mirroring StatsOverlay's pause-capture/restore so it
// composes correctly with the pause menu + backtick stats screen.

import { GAME_STATES } from '../core/constants.js';
import { SLOT_ORDER, SLOT_LABEL } from '../world/item-names.js';
import { ELEMENTS, isElement } from '../combat/elements.js';
import { createItemCard, createStatPanel, compareItemStats } from './item-card.js';
import { GamepadFocusController } from './gamepad-focus.js';
import { loadMeta } from '../core/storage.js';

// ITEM-01 — map a `<element>Resist` affix type back to its ELEMENTS entry, so a
// resist readout can show the element's themed name + color. e.g.
// 'pyroResist' → ELEMENTS.PYRO. Returns null for non-resist / unknown types.
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
        if (!this.elements.overlay) return false;
        const ge = this.gameEngine;
        if (!ge?.player) return false;
        const pauseDom = document.getElementById('pause-overlay');
        this._cameFromPauseMenu = !!(pauseDom && pauseDom.style.display === 'flex');
        this._wasPaused = !!(ge.game && ge.game.state === GAME_STATES.PAUSED);
        if (!this._wasPaused) ge.togglePause();
        this._isOpen = true;
        this.elements.overlay.style.display = 'flex';
        if (pauseDom) pauseDom.style.display = 'none';
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
        if (this._cameFromPauseMenu && pauseDom) {
            pauseDom.style.display = 'flex';
        } else if (!this._wasPaused && ge) {
            ge.togglePause();
        }
        this._cameFromPauseMenu = false;
        this._wasPaused = false;
    }

    toggle() { return this._isOpen ? (this.close(), false) : (this.open(), true); }

    // ITEM-01 — a compact grouped readout of an item's elemental resists, so a
    // player can read defensive coverage at a glance instead of hunting the
    // raw affix list. Returns a DOM node (RESIST  PYRO+8%  CRYO+5%) with each
    // element tinted its taxonomy color, or null if the item carries no
    // resist affixes. Display-only; the raw affix labels still show on the card.
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
        // Inline styling keeps the readout consistent with the affix line
        // without requiring a new CSS rule (matches .inv-item-affix sizing).
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

    render() {
        const ge = this.gameEngine;
        const body = this.elements.body;
        if (!ge?.player || !body) return;
        const player = ge.player;
        const equipped = player.equippedItems || {};
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

        // Right-hand "paper doll" stat sheet. Hovering/focusing any card on the
        // left previews that item swapped into its slot (the compare tooltip).
        const showStats = (previewItem) =>
            right.replaceChildren(createStatPanel(equipped, previewItem || null));
        showStats(null);

        // ── EQUIPPED (paper doll) ──
        // Weapons are gear now (8.x), so the equipped grid leads with the
        // primary + power weapon cards, then the five gear slots. All read-only:
        // gear/weapons are equipped PRE-RUN in the Armory and locked for the run.
        const eqTitle = document.createElement('div');
        eqTitle.className = 'inv-section-title';
        eqTitle.textContent = 'EQUIPPED — set in the Armory · locked for the run';
        left.appendChild(eqTitle);

        const grid = document.createElement('div');
        grid.className = 'inv-equipped-grid';
        // [slot id used for the empty-glyph, live item] in display order.
        const equippedCells = [
            ['weapon', player.equippedWeapon || null],
            ['power', player.equippedPowerWeapon || null],
            ...SLOT_ORDER.map((slot) => [slot, equipped[slot] || null]),
        ];
        for (const [slot, it] of equippedCells) {
            // Empty slots: null item + emptySlot keeps the slot glyph/label and
            // renders an italic "Empty" (no more "— empty —" filler text).
            const cell = it
                ? createItemCard(it, { variant: 'standard', focusable: true })
                : createItemCard(null, { variant: 'standard', focusable: true, emptySlot: slot });
            // ITEM-01 — append the grouped elemental-resist readout to equipped
            // items so defensive coverage reads at a glance (RESIST Pyro+8% …).
            if (it) {
                const ro = this._resistReadout(it);
                if (ro) (cell.querySelector('.item-card__body') || cell).appendChild(ro);
            }
            grid.appendChild(cell);
        }
        left.appendChild(grid);

        // ── STASH (Diablo-style rarity-colored grid) ──
        // The persistent banked items between runs (meta.stash). Read-only here —
        // equip from the Armory before the next run. Each card is rarity-colored
        // and previews its compare delta against what's equipped on hover/focus.
        const meta = loadMeta() || {};
        const stash = Array.isArray(meta.stash) ? meta.stash : [];
        const stashTitle = document.createElement('div');
        stashTitle.className = 'inv-section-title';
        stashTitle.textContent = `STASH (${stash.length}) — banked between runs · equip in the Armory`;
        left.appendChild(stashTitle);

        const stashGrid = document.createElement('div');
        stashGrid.className = 'inv-stash-grid';
        if (stash.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'inv-drop-empty';
            empty.textContent = 'Stash is empty — clear runs to bank loot.';
            stashGrid.appendChild(empty);
        }
        for (const it of stash) {
            if (!it) continue;
            stashGrid.appendChild(this._stashCard(it, equipped, showStats));
        }
        left.appendChild(stashGrid);

        // ── RECENT DROPS (this run) ──
        // Phase R8.2/R8.3 — gear is locked during a run; drops just accrue and
        // bank to the persistent stash at run end. Informational only.
        const dropTitle = document.createElement('div');
        dropTitle.className = 'inv-section-title';
        dropTitle.textContent = 'RECENT DROPS — banked to stash at run end';
        left.appendChild(dropTitle);

        const list = document.createElement('div');
        list.className = 'inv-drop-list';
        const feed = Array.isArray(player.lootFeed) ? player.lootFeed : [];
        if (feed.length === 0) {
            const empty = document.createElement('div');
            empty.className = 'inv-drop-empty';
            empty.textContent = 'No recent drops.';
            list.appendChild(empty);
        }
        for (const entry of feed) {
            const it = entry.item;
            if (!it) continue;
            const slotEquipped = equipped[it.slot] || null;
            const deltas = compareItemStats(it, slotEquipped);
            const upgrade = deltas.some((d) => d.delta > 0) && !deltas.some((d) => d.delta < 0 && Math.abs(d.delta) > 8);
            const row = createItemCard(it, {
                variant: 'compact',
                focusable: true,
                compareWith: slotEquipped,
                badge: upgrade ? 'UPGRADE' : `L${it.level || 1}`,
            });
            row.addEventListener('focus', () => showStats(it));
            row.addEventListener('mouseenter', () => showStats(it));
            row.addEventListener('mouseleave', () => showStats(null));
            list.appendChild(row);
        }
        left.appendChild(list);
    }

    // A single rarity-colored stash card with a compare tooltip: hovering or
    // focusing it shows an "UPGRADE" badge when it beats the equipped piece in
    // its slot and drives the right-hand stat sheet to preview the swap.
    _stashCard(it, equipped, showStats) {
        const slotEquipped = equipped[it.slot] || null;
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
        return card;
    }
}
