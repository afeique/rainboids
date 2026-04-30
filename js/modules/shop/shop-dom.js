// Shop DOM overlay — replaces canvas-rendered shop with HTML elements.
// All rendering, hit-testing, and scrolling is delegated to the browser.
//
// Public surface (called from game-engine / shop-manager):
//   initShopDom(gameEngine)   — wire up event listeners once at boot
//   showShopDom()             — display the overlay, render initial state
//   hideShopDom()             — hide the overlay
//   renderShopDom()           — rebuild the items list (after tab/state change)
//   updateShopCurrencyDom()   — quick refresh of the coins/SP header

// SVG for the coin-stack icon. This is the same path used by the HUD's
// drawCachedMoneyIcon() (see core/utils.js:421). Inlined as an SVG element
// so it can scale crisply at any DOM size without a canvas hop.
const COIN_SVG_PATH = "M59.989,21c-0.099-1.711-2.134-3.048-6.204-4.068c0.137-0.3,0.214-0.612,0.215-0.936V9h-0.017C53.625,3.172,29.743,3,27,3 S0.375,3.172,0.017,9H0v0.13v0v0l0,6.869c0.005,1.9,2.457,3.387,6.105,4.494c-0.05,0.166-0.08,0.335-0.09,0.507H6v0.13v0v0l0,6.857 C2.07,28.999,0.107,30.317,0.01,32H0v0.13v0v0l0,6.869c0.003,1.323,1.196,2.445,3.148,3.38C3.075,42.581,3.028,42.788,3.015,43H3 v0.13v0v0l0,6.869c0.008,3.326,7.497,5.391,15.818,6.355c0.061,0.012,0.117,0.037,0.182,0.037c0.019,0,0.035-0.01,0.054-0.011 c1.604,0.181,3.234,0.322,4.847,0.423c0.034,0.004,0.064,0.02,0.099,0.02c0.019,0,0.034-0.01,0.052-0.011 C26.1,56.937,28.115,57,30,57c1.885,0,3.9-0.063,5.948-0.188c0.018,0.001,0.034,0.011,0.052,0.011c0.035,0,0.065-0.017,0.099-0.02 c1.613-0.101,3.243-0.241,4.847-0.423C40.965,56.38,40.981,56.39,41,56.39c0.065,0,0.121-0.025,0.182-0.037 c8.321-0.964,15.809-3.03,15.818-6.357V43h-0.016c-0.07-1.226-1.115-2.249-3.179-3.104c0.126-0.289,0.195-0.589,0.195-0.9V32.46 c3.59-1.104,5.995-2.581,6-4.464V21H59.989z M7,18.674v-4.831c0.934,0.252,1.938,0.482,3,0.691v4.881 c-0.123-0.026-0.25-0.052-0.37-0.078c-0.532-0.117-1.051-0.239-1.547-0.368C7.705,18.872,7.346,18.773,7,18.674z M51.771,16.482 l-0.028-0.006l-0.364,0.283C50.851,17.17,50.04,17.586,49,17.988v-4.757c1.189-0.414,2.201-0.873,3-1.376v4.138 C52,16.145,51.92,16.309,51.771,16.482z M25.175,38.983c0.275,0.005,0.55,0.009,0.825,0.012v4.998 c-0.194-0.002-0.388-0.002-0.581-0.005c-0.088-0.001-0.173-0.004-0.26-0.005c-0.458-0.008-0.914-0.019-1.367-0.033 c-0.056-0.002-0.112-0.004-0.168-0.006c-0.545-0.018-1.086-0.041-1.623-0.067v-4.992c1.002,0.047,2.009,0.078,3.016,0.096 C25.069,38.981,25.122,38.982,25.175,38.983z M28.984,38.98c1.007-0.019,2.014-0.05,3.016-0.096v4.993 c-0.214,0.011-0.429,0.021-0.646,0.03c-0.6,0.025-1.209,0.046-1.828,0.061c-0.146,0.004-0.293,0.006-0.44,0.009 c-0.357,0.007-0.723,0.009-1.085,0.012v-4.995c0.275-0.003,0.55-0.007,0.825-0.012C28.878,38.982,28.931,38.981,28.984,38.98z M34.666,43.708c-0.22,0.017-0.442,0.034-0.666,0.05v-4.987c1.014-0.067,2.016-0.147,3-0.243v4.966 c-0.618,0.065-1.25,0.126-1.899,0.179C34.956,43.686,34.811,43.697,34.666,43.708z M39,38.312c1.031-0.124,2.032-0.265,3-0.422v4.91 c-0.942,0.166-1.943,0.319-3,0.458V38.312z M17.519,43.548c-0.102-0.01-0.203-0.021-0.304-0.031 c-0.072-0.007-0.143-0.016-0.215-0.023v-4.965c0.984,0.095,1.986,0.176,3,0.243v4.983C19.16,43.695,18.33,43.627,17.519,43.548z M15,38.312v4.946c-1.057-0.139-2.058-0.292-3-0.458v-4.91C12.968,38.047,13.969,38.189,15,38.312z M44,42.414v-4.881 c1.062-0.209,2.066-0.439,3-0.691v4.831C46.109,41.930,45.106,42.179,44,42.414z M25.175,15.983c0.275,0.005,0.55,0.009,0.825,0.012 v4.993c-1.346-0.013-2.684-0.048-4-0.114v-4.989c1.002,0.047,2.009,0.078,3.016,0.096C25.069,15.981,25.122,15.982,25.175,15.983z M28.984,15.98c1.007-0.019,2.014-0.05,3.016-0.096v4.989c-0.17,0.008-0.333,0.02-0.504,0.028c-0.014,0.001-0.028,0.001-0.043,0.002 c-0.671,0.03-1.355,0.052-2.048,0.068c-0.108,0.003-0.216,0.004-0.324,0.007c-0.356,0.007-0.72,0.008-1.081,0.012v-4.995 c0.275-0.003,0.55-0.007,0.825-0.012C28.878,15.982,28.931,15.981,28.984,15.98z M34.984,27.98c1.007-0.019,2.014-0.05,3.016-0.096 v4.988c-1.314,0.065-2.65,0.101-4,0.115v-4.992c0.275-0.003,0.55-0.007,0.825-0.012C34.878,27.982,34.931,27.981,34.984,27.98z M25.347,32.709c-0.64-0.05-1.265-0.105-1.875-0.166c-0.131-0.013-0.262-0.027-0.392-0.04C23.053,32.5,23.027,32.496,23,32.494 v-4.966c0.984,0.095,1.986,0.176,3,0.243v4.984c-0.081-0.006-0.167-0.01-0.248-0.016C25.616,32.729,25.481,32.719,25.347,32.709z M19.145,31.992c-0.396-0.063-0.768-0.131-1.145-0.197v-4.904c0.968,0.157,1.969,0.298,3,0.422v4.946 c-0.612-0.081-1.211-0.165-1.786-0.255C19.191,31.999,19.168,31.995,19.145,31.992z M31.175,27.983 c0.275,0.005,0.55,0.009,0.825,0.012v4.993c-0.487-0.005-0.978-0.007-1.453-0.018c-0.073-0.002-0.149-0.003-0.222-0.004 c-0.752-0.019-1.487-0.048-2.209-0.083c-0.039-0.002-0.078-0.004-0.116-0.005v-4.993c1.002,0.047,2.009,0.078,3.016,0.096 C31.069,27.981,31.122,27.982,31.175,27.983z M41.242,32.661c-0.036,0.003-0.071,0.006-0.107,0.009 c-0.373,0.031-0.758,0.051-1.136,0.078v-4.978c1.014-0.067,2.016-0.147,3-0.243v4.961C42.419,32.55,41.839,32.611,41.242,32.661z M17,20.49v-4.962c0.984,0.095,1.986,0.176,3,0.243v4.978C18.982,20.676,17.978,20.593,17,20.49z M37,20.488 c-0.966,0.102-1.966,0.191-3,0.265v-4.982c1.014-0.067,2.016-0.147,3-0.243V20.488z M39,15.312c1.031-0.124,2.032-0.265,3-0.422 v4.902c-0.948,0.167-1.946,0.321-3,0.46V15.312z M44,19.407v-4.873c1.062-0.209,2.066-0.439,3-0.691v4.82 C46.104,18.924,45.095,19.173,44,19.407z M15,15.312v4.941c-0.198-0.026-0.404-0.047-0.6-0.074c-0.128-0.018-0.25-0.037-0.376-0.055 c-0.578-0.083-1.143-0.172-1.697-0.265C12.216,19.84,12.109,19.82,12,19.801v-4.91C12.968,15.047,13.969,15.189,15,15.312z M16,26.533v4.873c-1.105-0.237-2.107-0.489-3-0.751v-4.813C13.934,26.094,14.938,26.325,16,26.533z M47.907,31.817 c-0.439,0.076-0.882,0.151-1.337,0.22c-0.261,0.04-0.528,0.078-0.796,0.116c-0.253,0.036-0.516,0.067-0.773,0.1v-4.941 c1.031-0.124,2.032-0.265,3-0.422v4.91C47.969,31.806,47.938,31.812,47.907,31.817z M11,25.231v4.751 c-1.572-0.607-2.586-1.227-2.916-1.779l-0.067-0.112C8.011,28.06,8.001,28.027,8,27.996l0-4.141 C8.799,24.358,9.811,24.817,11,25.231z M10,37.533v4.881c-0.918-0.195-1.765-0.4-2.536-0.61c-0.122-0.034-0.248-0.067-0.367-0.102 C7.064,41.692,7.033,41.683,7,41.674v-4.831C7.934,37.094,8.938,37.325,10,37.533z M13,48.533v4.881 c-1.106-0.235-2.109-0.484-3-0.741v-4.831C10.934,48.094,11.938,48.325,13,48.533z M15,48.891c0.968,0.157,1.969,0.298,3,0.422 v4.946c-1.057-0.139-2.058-0.292-3-0.458V48.891z M20,49.528c0.984,0.095,1.986,0.176,3,0.243v4.987 c-1.039-0.073-2.039-0.162-3-0.263V49.528z M25,49.884c1.002,0.047,2.009,0.078,3.016,0.096c0.053,0.001,0.106,0.002,0.158,0.003 c0.275,0.005,0.55,0.009,0.825,0.012v4.999c-1.382-0.013-2.716-0.053-4-0.116V49.884z M31,49.994 c0.275-0.003,0.55-0.007,0.825-0.012c0.053-0.001,0.106-0.002,0.159-0.003c1.007-0.019,2.014-0.05,3.016-0.096v4.993 c-1.284,0.063-2.618,0.103-4,0.116V49.994z M37,49.771c1.014-0.067,2.016-0.147,3-0.243v4.966c-0.961,0.101-1.961,0.19-3,0.263 V49.771z M42,49.312c1.031-0.124,2.032-0.265,3-0.422v4.91c-0.942,0.166-1.943,0.319-3,0.458V49.312z M47,48.533 c1.062-0.209,2.066-0.439,3-0.691v4.831c-0.891,0.257-1.894,0.506-3,0.741V48.533z M51.892,39.321l-0.341,0.299 C51.026,40.083,50.151,40.55,49,41v-4.768c1.189-0.414,2.201-0.873,3-1.376v4.138C52,39.097,51.962,39.207,51.892,39.321z M52.564,30.796c-0.498,0.139-1.025,0.269-1.563,0.396c-0.249,0.058-0.503,0.116-0.763,0.172c-0.077,0.017-0.159,0.032-0.237,0.049 v-4.879c1.062-0.209,2.066-0.439,3-0.691v4.831C52.857,30.714,52.712,30.755,52.564,30.796z M2,15.996l0-4.141 c0.799,0.503,1.811,0.962,3,1.376v4.788C3.055,17.29,2.002,16.559,2,15.996z M2,38.996l0-4.141c0.799,0.503,1.811,0.962,3,1.376 v4.769l-0.571-0.222L4.417,40.79C2.847,40.139,2.002,39.5,2,38.996z M5,49.996l0-4.141c0.799,0.503,1.811,0.962,3,1.376v4.788 C6.055,51.29,5.002,50.559,5,49.996z M52,52.019v-4.787c1.189-0.414,2.201-0.873,3-1.376v4.138 C54.999,50.557,53.945,51.289,52,52.019z M55,30.019v-4.787c1.189-0.414,2.201-0.873,3-1.376v4.138 C57.999,28.557,56.945,29.289,55,30.019z";

function makeCoinIconSvg(size) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 60 60');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('class', 'shop-coin-icon');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', COIN_SVG_PATH);
    path.setAttribute('fill', '#FFD700');
    path.setAttribute('stroke', '#B8860B');
    path.setAttribute('stroke-width', '1.5');
    svg.appendChild(path);
    return svg;
}

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

    // Replace the header 💰 emoji placeholder with the same coin-stack
    // SVG used in the HUD, so the shop and HUD share one icon.
    const headerIcon = _elements.menu.querySelector('.shop-currency--coins .shop-currency-icon');
    if (headerIcon) {
        headerIcon.replaceChildren(makeCoinIconSvg(20));
    }

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

    // HELP tab — instructional panel, not a buyable list.
    if (_engine.shopCategory === 'HELP') {
        list.appendChild(buildHelpPanel());
        return;
    }

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

// HELP panel — explains the three resources (Gold / SP / XP) and the
// general flow of upgrading between waves. Pure DOM, styled by
// `.shop-help-*` rules in styles.css.
function buildHelpPanel() {
    const wrap = document.createElement('div');
    wrap.className = 'shop-help';

    const intro = document.createElement('p');
    intro.className = 'shop-help-intro';
    intro.textContent = 'Earn resources during waves, then spend them between waves on permanent upgrades. The shop opens automatically after each wave clears — or hit the SHOP button at any time.';
    wrap.appendChild(intro);

    wrap.appendChild(buildHelpEntry({
        iconNode: makeCoinIconSvg(28),
        title: 'GOLD',
        titleClass: 'shop-help-title--gold',
        body: 'Dropped by destroyed enemies and asteroids. Picks up automatically when you fly near. Spend on the OFFENSE / PRIMARY / POWER tabs (gold-priced).',
    }));

    wrap.appendChild(buildHelpEntry({
        iconText: 'SP',
        iconClass: 'shop-help-icon--sp',
        title: 'SKILL POINTS',
        titleClass: 'shop-help-title--sp',
        body: 'Awarded each time you level up. Level by gaining XP. Spend on the DEFENSE / DROPS / SKILLS tabs (SP-priced) — these give you survivability, drop bonuses, and active defensive skills.',
    }));

    wrap.appendChild(buildHelpEntry({
        iconText: 'XP',
        iconClass: 'shop-help-icon--xp',
        title: 'EXPERIENCE',
        titleClass: 'shop-help-title--xp',
        body: 'Awarded for every hit you land — keep firing. Tracked by the red bar under your health. Filling the bar levels you up and grants a Skill Point.',
    }));

    const footer = document.createElement('p');
    footer.className = 'shop-help-footer';
    footer.textContent = 'Tip: defense skills (1–4 keys) and survivability are SP-priced — invest there early. Weapon damage and per-weapon upgrades are gold-priced. Visit each tab to see what is available.';
    wrap.appendChild(footer);

    return wrap;
}

function buildHelpEntry({ iconNode, iconText, iconClass, title, titleClass, body }) {
    const entry = document.createElement('div');
    entry.className = 'shop-help-entry';

    const icon = document.createElement('div');
    icon.className = 'shop-help-icon' + (iconClass ? ' ' + iconClass : '');
    if (iconNode) icon.appendChild(iconNode);
    else if (iconText) icon.textContent = iconText;
    entry.appendChild(icon);

    const text = document.createElement('div');
    text.className = 'shop-help-text';
    const h = document.createElement('div');
    h.className = 'shop-help-title' + (titleClass ? ' ' + titleClass : '');
    h.textContent = title;
    text.appendChild(h);
    const p = document.createElement('div');
    p.className = 'shop-help-body';
    p.textContent = body;
    text.appendChild(p);
    entry.appendChild(text);

    return entry;
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
        costCol.appendChild(makeCoinPrice(actualCost, coinCls));
        const spCls = (player.skillPoints >= item.spCost) ? 'shop-item-price--sp' : 'shop-item-price--cant';
        costCol.appendChild(makePrice(`${item.spCost} SP`, spCls));
    } else {
        const cls = canAfford ? '' : 'shop-item-price--cant';
        costCol.appendChild(makeCoinPrice(actualCost, cls));
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

// Coin-priced row: SVG coin icon (HUD-matching) + numeric cost. Use this
// instead of `makePrice('💰 ${cost}')` so the shop icon matches the HUD.
function makeCoinPrice(amount, extraClass = '') {
    const el = document.createElement('span');
    el.className = 'shop-item-price shop-item-price--coin' + (extraClass ? ' ' + extraClass : '');
    el.appendChild(makeCoinIconSvg(16));
    const num = document.createTextNode(`${amount}`);
    el.appendChild(num);
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
