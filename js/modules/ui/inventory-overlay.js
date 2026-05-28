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

    _affixLine(item) {
        const affixes = (item && Array.isArray(item.affixes)) ? item.affixes : [];
        return affixes.map((a) => a.label).join('  ·  ') || (item && item.bonusLabel) || '';
    }

    // ITEM-01 — a compact grouped readout of an item's elemental resists, so a
    // player can read defensive coverage at a glance instead of hunting the
    // raw affix list. Returns a DOM node (RESIST  PYRO+8%  CRYO+5%) with each
    // element tinted its taxonomy color, or null if the item carries no
    // resist affixes. Display-only; the raw labels still show in _affixLine.
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

        // ── WEAPONS ── (8.x — read-only; equipped pre-run, view-only mid-run)
        left.appendChild(this._buildWeaponSection(player));

        // ── EQUIPPED ──
        const eqTitle = document.createElement('div');
        eqTitle.className = 'inv-section-title';
        eqTitle.textContent = 'EQUIPPED';
        left.appendChild(eqTitle);

        const grid = document.createElement('div');
        grid.className = 'inv-equipped-grid';
        for (const slot of SLOT_ORDER) {
            const it = player.equippedItems ? player.equippedItems[slot] : null;
            // Empty slots: null item + emptySlot keeps the slot glyph/label and
            // renders an italic "Empty" (no more "— empty —" filler text).
            const cell = it
                ? createItemCard(it, { variant: 'standard', focusable: true })
                : createItemCard(null, { variant: 'standard', focusable: true, emptySlot: slot });
            grid.appendChild(cell);
        }
        left.appendChild(grid);

        right.appendChild(createStatPanel(player.equippedItems || {}));

        // ── RECENT DROPS ──
        // Phase R8.2/R8.3 — gear is locked during a run; drops just accrue
        // and bank to the persistent stash at run end. Equip from the ARMORY
        // before the next run. This list is informational only.
        const dropTitle = document.createElement('div');
        dropTitle.className = 'inv-section-title';
        dropTitle.textContent = 'RECENT DROPS — banked to stash at run end · equip in the Armory';
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
            const equipped = player.equippedItems ? player.equippedItems[it.slot] : null;
            const deltas = compareItemStats(it, equipped);
            const upgrade = deltas.some((d) => d.delta > 0) && !deltas.some((d) => d.delta < 0 && Math.abs(d.delta) > 8);
            const row = createItemCard(it, {
                variant: 'compact',
                focusable: true,
                compareWith: equipped,
                badge: upgrade ? 'UPGRADE' : `L${it.level || 1}`,
            });
            row.addEventListener('focus', () => {
                right.replaceChildren(createStatPanel(player.equippedItems || {}, it));
            });
            row.addEventListener('mouseenter', () => {
                right.replaceChildren(createStatPanel(player.equippedItems || {}, it));
            });
            row.addEventListener('mouseleave', () => {
                right.replaceChildren(createStatPanel(player.equippedItems || {}));
            });

            list.appendChild(row);
        }
        left.appendChild(list);
    }

    // 8.x — WEAPONS section: READ-ONLY view of the equipped primary + power
    // weapons (their ids/traits drive what you fire this run). Like gear, weapons
    // are equipped PRE-RUN in the GEAR tab and locked for the run — this screen
    // only shows what you're carrying. Reads the live player state.
    _buildWeaponSection(player) {
        const wrap = document.createElement('div');

        const title = document.createElement('div');
        title.className = 'inv-section-title';
        title.textContent = 'WEAPONS — equipped pre-run · view-only mid-run';
        wrap.appendChild(title);

        const primary = (player && player.equippedWeapon) || null;
        const power = (player && player.equippedPowerWeapon) || null;

        const rowFor = (label, item, fallback) => {
            const row = document.createElement('div');
            row.className = 'inv-weapon-equipped';
            row.style.margin = '2px 0';
            row.textContent = item
                ? `${label}: ${item.name || label} (L${item.level || 1})`
                : `${label}: ${fallback}`;
            if (item && item.rarityColor) row.style.color = item.rarityColor;
            return row;
        };

        wrap.appendChild(rowFor('PRIMARY', primary, 'default Pulse Cannon'));
        wrap.appendChild(rowFor('POWER', power, 'default Charge Shot'));
        return wrap;
    }
}
