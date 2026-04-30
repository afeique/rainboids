// Shop DOM overlay — replaces canvas-rendered shop with HTML elements.
// All rendering, hit-testing, and scrolling is delegated to the browser.
//
// Public surface (called from game-engine / shop-manager):
//   initShopDom(gameEngine)   — wire up event listeners once at boot
//   showShopDom()             — display the overlay, render initial state
//   hideShopDom()             — hide the overlay
//   renderShopDom()           — rebuild the items list (after tab/state change)
//   updateShopCurrencyDom()   — quick refresh of the coins/SP header

let _engine = null;
let _elements = null;

function $(id) { return document.getElementById(id); }

export function initShopDom(gameEngine) {
    _engine = gameEngine;
    _elements = {
        overlay:   $('shop-overlay'),
        menu:      $('shop-menu'),
        coinsAmt:  $('shop-coins-amount'),
        spAmt:     $('shop-sp-amount'),
        tabs:      document.querySelectorAll('.shop-tab'),
        list:      $('shop-items-list'),
        closeBtn:  $('shop-close-button'),
    };

    // Tab clicks — change category, rebuild items.
    _elements.tabs.forEach(btn => {
        btn.addEventListener('click', () => {
            const cat = btn.dataset.tab;
            if (!cat || _engine.shopCategory === cat) return;
            _engine.shopCategory = cat;
            _engine._rebuildShopCache();
            renderShopDom();
        });
    });

    // Close button — closeShopToPause routes back to pause menu.
    _elements.closeBtn.addEventListener('click', () => {
        _engine.closeShopToPause();
    });

    // Item / sell clicks via event delegation.
    _elements.list.addEventListener('click', (e) => {
        // Sell button takes priority (it sits inside the item button).
        const sellBtn = e.target.closest('.shop-item-sell');
        if (sellBtn) {
            e.stopPropagation();
            const itemId = sellBtn.dataset.id;
            if (itemId) {
                _engine.sellShopItem(itemId);
                renderShopDom();
            }
            return;
        }
        const itemBtn = e.target.closest('.shop-item');
        if (itemBtn) {
            const itemId = itemBtn.dataset.id;
            if (itemId) {
                _engine.buyShopItem(itemId);
                renderShopDom();
            }
        }
    });
}

export function showShopDom() {
    if (!_elements) return;
    _elements.overlay.style.display = 'flex';
    syncActiveTab();
    renderShopDom();
}

export function hideShopDom() {
    if (!_elements) return;
    _elements.overlay.style.display = 'none';
}

export function updateShopCurrencyDom() {
    if (!_elements || !_engine) return;
    _elements.coinsAmt.textContent = `${Math.floor(_engine.game.money)}`;
    _elements.spAmt.textContent = `${_engine.player.skillPoints}`;
}

function syncActiveTab() {
    if (!_elements) return;
    _elements.tabs.forEach(btn => {
        btn.classList.toggle('active', btn.dataset.tab === _engine.shopCategory);
    });
}

// ── Item rendering ─────────────────────────────────────────────────────────
// Returns the actual cost for an item given current stack count, mirroring
// the cost-override / per-stack logic from shop-manager.buyShopItem.
function actualCostFor(item, currentStacks) {
    if (item.costOverrides) {
        return item.costOverrides[Math.min(currentStacks, item.costOverrides.length - 1)] || item.cost;
    }
    if (item.id === 'CHARGE_SPEED') {
        if (currentStacks === 0) return 1500;
        if (currentStacks === 1) return 3000;
        return 5000;
    }
    return item.cost;
}

function sellRefundFor(item, currentStacks) {
    let baseCost = item.cost;
    if (item.costOverrides) {
        baseCost = item.costOverrides[Math.min(currentStacks - 1, item.costOverrides.length - 1)] || item.cost;
    } else if (item.id === 'CHARGE_SPEED') {
        if (currentStacks === 1) baseCost = 1500;
        else if (currentStacks === 2) baseCost = 3000;
        else baseCost = 5000;
    }
    return Math.floor(baseCost * 0.5);
}

export function renderShopDom() {
    if (!_elements || !_engine) return;
    syncActiveTab();
    updateShopCurrencyDom();

    const list = _elements.list;
    list.replaceChildren();
    const items = _engine.shopFilteredItems || [];

    if (items.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align: center; color: #888; padding: 40px; font-family: monospace;';
        empty.textContent = 'No items in this category.';
        list.appendChild(empty);
        return;
    }

    const player = _engine.player;
    const game = _engine.game;
    for (const item of items) {
        list.appendChild(buildItemRow(item, player, game));
    }
}

function buildItemRow(item, player, game) {
    const currentStacks = player.getPowerupStacks(item.id);
    const isWeaponOrSkill = item.isWeapon || item.isSkill;
    const isOwned = item.owned || (isWeaponOrSkill && currentStacks > 0);
    const isEquipped = item.equipped;
    const isFree = item.currency === 'FREE';
    const actualCost = actualCostFor(item, currentStacks);

    let canAfford, maxedOut;
    if (isWeaponOrSkill) {
        maxedOut = isOwned && isEquipped;
        if (isOwned) canAfford = true;
        else if (isFree) canAfford = true;
        else if (item.spCost && item.spCost > 0) {
            canAfford = game.money >= actualCost && player.skillPoints >= item.spCost;
        } else {
            canAfford = item.currency === 'SP'
                ? player.skillPoints >= actualCost
                : game.money >= actualCost;
        }
    } else {
        canAfford = item.currency === 'SP'
            ? player.skillPoints >= actualCost
            : game.money >= actualCost;
        maxedOut = currentStacks >= item.maxStacks;
    }

    const row = document.createElement('button');
    row.type = 'button';
    row.className = 'shop-item';
    row.dataset.id = item.id;
    if (isEquipped)        row.classList.add('shop-item--equipped');
    else if (isOwned)      row.classList.add('shop-item--owned');
    else if (maxedOut)     row.classList.add('shop-item--maxed');
    else if (!canAfford)   row.classList.add('shop-item--cant-afford');

    if (maxedOut) row.disabled = true;

    // Icon
    const icon = document.createElement('span');
    icon.className = 'shop-item-icon';
    icon.textContent = item.icon || '';
    row.appendChild(icon);

    // Body: name + description
    const body = document.createElement('span');
    body.className = 'shop-item-body';
    const name = document.createElement('span');
    name.className = 'shop-item-name';
    name.textContent = item.name;
    body.appendChild(name);
    const desc = document.createElement('span');
    desc.className = 'shop-item-desc';
    desc.textContent = item.description;
    body.appendChild(desc);
    row.appendChild(body);

    // Cost / status column
    const costCol = document.createElement('span');
    costCol.className = 'shop-item-cost';

    if (isWeaponOrSkill && isEquipped) {
        costCol.appendChild(makePrice('EQUIPPED', 'shop-item-price--equipped'));
    } else if (isWeaponOrSkill && isOwned) {
        costCol.appendChild(makePrice('EQUIP', 'shop-item-price--owned'));
        costCol.appendChild(makeStatus('OWNED', 'shop-item-status--owned'));
    } else if (isWeaponOrSkill && isFree) {
        costCol.appendChild(makePrice('FREE'));
    } else if (item.currency === 'SP') {
        const cls = canAfford ? 'shop-item-price--sp' : 'shop-item-price--cant';
        costCol.appendChild(makePrice(`${actualCost} SP`, cls));
        if (!isWeaponOrSkill) costCol.appendChild(stackStatus(currentStacks, item.maxStacks, maxedOut));
    } else if (isWeaponOrSkill && item.spCost && item.spCost > 0) {
        // Dual-cost weapon
        const coinCls = (game.money >= actualCost) ? '' : 'shop-item-price--cant';
        costCol.appendChild(makePrice(`💰 ${actualCost}`, coinCls));
        const spCls = (player.skillPoints >= item.spCost) ? 'shop-item-price--sp' : 'shop-item-price--cant';
        costCol.appendChild(makePrice(`${item.spCost} SP`, spCls));
    } else {
        const cls = canAfford ? '' : 'shop-item-price--cant';
        costCol.appendChild(makePrice(`💰 ${actualCost}`, cls));
        if (!isWeaponOrSkill) costCol.appendChild(stackStatus(currentStacks, item.maxStacks, maxedOut));
    }

    row.appendChild(costCol);

    // Sell button — regular items with stacks (not weapons/skills).
    if (!isWeaponOrSkill && currentStacks > 0) {
        const refund = sellRefundFor(item, currentStacks);
        const sellLabel = item.currency === 'SP' ? `SELL +${refund}SP` : `SELL +${refund}`;
        const sellBtn = document.createElement('button');
        sellBtn.type = 'button';
        sellBtn.className = 'shop-item-sell';
        sellBtn.dataset.id = item.id;
        sellBtn.textContent = sellLabel;
        row.appendChild(sellBtn);
    }

    return row;
}

function makePrice(text, extraClass = '') {
    const el = document.createElement('span');
    el.className = 'shop-item-price' + (extraClass ? ' ' + extraClass : '');
    el.textContent = text;
    return el;
}

function makeStatus(text, extraClass = '') {
    const el = document.createElement('span');
    el.className = 'shop-item-status' + (extraClass ? ' ' + extraClass : '');
    el.textContent = text;
    return el;
}

function stackStatus(currentStacks, maxStacks, maxedOut) {
    return makeStatus(maxedOut ? `MAX (${maxStacks})` : `Level ${currentStacks}`, maxedOut ? 'shop-item-status--maxed' : '');
}
