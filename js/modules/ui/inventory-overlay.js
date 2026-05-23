// Inventory management overlay — opened with the 'I' key (6.x).
//
// Shows the five equipped gear slots (with affixes) plus the recent
// loot feed (player.lootFeed). Clicking a recent drop force-equips it to
// its slot (manual override of the auto-equip-if-better rule). Pauses the
// game while open, mirroring StatsOverlay's pause-capture/restore so it
// composes correctly with the pause menu + backtick stats screen.

import { GAME_STATES } from '../core/constants.js';
import { SLOT_ORDER, SLOT_LABEL } from '../world/item-names.js';
import { drawItemGlyph } from '../hud/item-feed.js';

// Render a crystalline item glyph into a small standalone canvas so the
// DOM overlay can reuse the exact canvas geometry from the loot feed.
function glyphCanvas(slot, rarityColor, px = 30) {
    const c = document.createElement('canvas');
    c.width = px; c.height = px;
    c.className = 'inv-glyph';
    const g = c.getContext('2d');
    if (g) {
        g.translate(px / 2, px / 2);
        drawItemGlyph(g, slot, rarityColor, px / 2 - 3);
    }
    return c;
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

    render() {
        const ge = this.gameEngine;
        const body = this.elements.body;
        if (!ge?.player || !body) return;
        const player = ge.player;
        body.replaceChildren();

        // ── EQUIPPED ──
        const eqTitle = document.createElement('div');
        eqTitle.className = 'inv-section-title';
        eqTitle.textContent = 'EQUIPPED';
        body.appendChild(eqTitle);

        const grid = document.createElement('div');
        grid.className = 'inv-equipped-grid';
        for (const slot of SLOT_ORDER) {
            const it = player.equippedItems ? player.equippedItems[slot] : null;
            const cell = document.createElement('div');
            cell.className = 'inv-slot' + (it ? '' : ' inv-slot--empty');
            const rarity = it ? (it.rarityColor || '#cccccc') : '#3a4254';
            cell.style.setProperty('--inv-rarity', rarity);

            cell.appendChild(glyphCanvas(slot, rarity, 34));

            const info = document.createElement('div');
            info.className = 'inv-slot-info';
            const slotLbl = document.createElement('div');
            slotLbl.className = 'inv-slot-label';
            slotLbl.textContent = SLOT_LABEL[slot] || slot.toUpperCase();
            info.appendChild(slotLbl);
            const nameLbl = document.createElement('div');
            nameLbl.className = 'inv-item-name';
            if (it) {
                nameLbl.textContent = (it.rarityLabel ? it.rarityLabel + ' ' : '') + 'L' + (it.level || 1);
                nameLbl.style.color = rarity;
            } else {
                nameLbl.textContent = '— empty —';
            }
            info.appendChild(nameLbl);
            const affix = document.createElement('div');
            affix.className = 'inv-item-affix';
            affix.textContent = it ? this._affixLine(it) : '';
            info.appendChild(affix);
            cell.appendChild(info);
            grid.appendChild(cell);
        }
        body.appendChild(grid);

        // ── RECENT DROPS ──
        // Phase R8.2/R8.3 — gear is locked during a run; drops just accrue
        // and bank to the persistent stash at run end. Equip from the ARMORY
        // before the next run. This list is informational only.
        const dropTitle = document.createElement('div');
        dropTitle.className = 'inv-section-title';
        dropTitle.textContent = 'RECENT DROPS — banked to stash at run end · equip in the Armory';
        body.appendChild(dropTitle);

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
            const rarity = it.rarityColor || '#cccccc';
            // Informational only (R8.2 — no mid-run equipping).
            const row = document.createElement('div');
            row.className = 'inv-drop-row';
            row.style.setProperty('--inv-rarity', rarity);

            row.appendChild(glyphCanvas(it.slot, rarity, 30));

            const info = document.createElement('div');
            info.className = 'inv-drop-info';
            const name = document.createElement('div');
            name.className = 'inv-drop-name';
            name.textContent = (it.rarityLabel ? it.rarityLabel + ' ' : '') + (SLOT_LABEL[it.slot] || it.slot.toUpperCase());
            name.style.color = rarity;
            info.appendChild(name);
            const affix = document.createElement('div');
            affix.className = 'inv-drop-affix';
            affix.textContent = this._affixLine(it);
            info.appendChild(affix);
            row.appendChild(info);

            const tag = document.createElement('div');
            tag.className = 'inv-drop-tag';
            tag.textContent = `L${it.level || 1}`;
            row.appendChild(tag);

            list.appendChild(row);
        }
        body.appendChild(list);
    }
}
