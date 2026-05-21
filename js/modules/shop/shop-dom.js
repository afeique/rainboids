// Shop DOM — Phase 7 skill-tree rewrite (2026-05-19).
//
// Renders a Diablo-style visual skill tree into the #shop-overlay
// instead of the previous tab + scrollable-list layout. Four clusters
// — PRIMARY / POWER / DEFENSE / PASSIVES — are displayed at once. For
// the first three, each weapon/skill is a parent node with its
// per-weapon upgrade nodes orbiting it on a ring at radius ~120px. The
// PASSIVES cluster uses a flat hex grid (no parent-child structure).
//
// Public surface (unchanged from the legacy list-based version, so
// shop-manager / game-engine bindings still work):
//   initShopDom(gameEngine)   — wire up event listeners once at boot
//   showShopDom()             — display the overlay, render initial state
//   hideShopDom()             — hide the overlay
//   renderShopDom()           — rebuild the tree (after purchase / open)
//   updateShopCurrencyDom()   — quick refresh of the gold + wave header
//
// The tree DOM is built into the cluster containers carved out by
// `static-dom.js::_buildShopOverlay()` — `#shop-tree-primary`,
// `#shop-tree-power`, `#shop-tree-defense`, `#shop-tree-passives`.
// Node click → buyShopItem via shop-manager. Node hover → floating
// tooltip positioned next to the cursor.

import { renderIconHTML } from '../ui/icons.js';
import {
    PRIMARY_WEAPONS,
    POWER_WEAPONS,
    DEFENSE_SKILLS,
    getPrimaryUpgrades,
    getPowerUpgrades,
    getSkillUpgrades,
    getPassiveUpgrades,
} from '../combat/weapon-data.js';

// ── Constants ──────────────────────────────────────────────────────

// Border/state colors — exposed via CSS classes too, kept here for any
// inline accent (parent node uses its weapon's canonical color).
const STATE_COLORS = {
    UNAFFORDABLE: '#555555',
    AFFORDABLE:   '#e0c060',
    OWNED:        '#5cc8ff',
    MAXED:        '#a060e0',
};

// Skill-upgrade SP-era costs ranged 2-3. SP was retired in 6.0.0; for
// the tree to show meaningful gold prices we multiply by SKILL_COST_MULT
// when materializing skill upgrades. Tuned so a baseline "+1 duration"
// skill upgrade costs ~1600g (matches the lowest weapon-upgrade tier).
const SKILL_COST_MULT = 800;

// Coin SVG path (copied from the HUD coin icon).
const COIN_SVG_PATH = "M59.989,21c-0.099-1.711-2.134-3.048-6.204-4.068c0.137-0.3,0.214-0.612,0.215-0.936V9h-0.017C53.625,3.172,29.743,3,27,3 S0.375,3.172,0.017,9H0v0.13v0v0l0,6.869c0.005,1.9,2.457,3.387,6.105,4.494c-0.05,0.166-0.08,0.335-0.09,0.507H6v0.13v0v0l0,6.857 C2.07,28.999,0.107,30.317,0.01,32H0v0.13v0v0l0,6.869c0.003,1.323,1.196,2.445,3.148,3.38C3.075,42.581,3.028,42.788,3.015,43H3 v0.13v0v0l0,6.869c0.008,3.326,7.497,5.391,15.818,6.355c0.061,0.012,0.117,0.037,0.182,0.037c0.019,0,0.035-0.01,0.054-0.011 c1.604,0.181,3.234,0.322,4.847,0.423c0.034,0.004,0.064,0.02,0.099,0.02c0.019,0,0.034-0.01,0.052-0.011 C26.1,56.937,28.115,57,30,57c1.885,0,3.9-0.063,5.948-0.188c0.018,0.001,0.034,0.011,0.052,0.011c0.035,0,0.065-0.017,0.099-0.02 c1.613-0.101,3.243-0.241,4.847-0.423C40.965,56.38,40.981,56.39,41,56.39c0.065,0,0.121-0.025,0.182-0.037 c8.321-0.964,15.809-3.03,15.818-6.357V43h-0.016c-0.07-1.226-1.115-2.249-3.179-3.104c0.126-0.289,0.195-0.589,0.195-0.9V32.46 c3.59-1.104,5.995-2.581,6-4.464V21H59.989z";

// ── Module state ───────────────────────────────────────────────────

let _engine = null;
let _elements = null;
// 6.27.0 — Active category tab. Drives which cluster is visible. CSS
// gates visibility off `#shop-tree[data-active-tab]`.
let _activeTab = 'primary';
// 6.x — debounce buy clicks so an accidental double-fire / double-click
// doesn't purchase two stacks for one intent.
let _lastBuyAt = 0;

function $(id) { return document.getElementById(id); }

// ── Lifecycle ──────────────────────────────────────────────────────

export function initShopDom(gameEngine) {
    _engine = gameEngine;
    _elements = {
        overlay:        $('shop-overlay'),
        menu:           $('shop-menu'),
        coinsAmt:       $('shop-coins-amount'),
        tree:           $('shop-tree'),
        tabs:           $('shop-tree-tabs'),
        clusterPrimary: $('shop-tree-primary'),
        clusterPower:   $('shop-tree-power'),
        clusterDefense: $('shop-tree-defense'),
        clusterPassive: $('shop-tree-passives'),
        tooltip:        $('shop-tree-tooltip'),
        closeBtn:       $('shop-close-button'),
    };

    // Close button.
    if (_elements.closeBtn) {
        _elements.closeBtn.addEventListener('click', () => {
            _engine.closeShopAndReturn();
        });
    }

    // 6.27.0 — Tab strip. Clicking a tab swaps the active category;
    // the tree's `data-active-tab` attr drives which cluster shows
    // (CSS), and we toggle the `.active` class on the buttons.
    if (_elements.tabs) {
        _elements.tabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.shop-tree-tab');
            if (!btn) return;
            const tab = btn.dataset.tab;
            if (!tab || tab === _activeTab) return;
            _activeTab = tab;
            _syncActiveTab();
            _hideTooltip();
        });
    }

    // Replace the header coin glyph with the same SVG used by the HUD.
    const headerIcon = _elements.menu?.querySelector('.shop-tree-currency-icon');
    if (headerIcon) {
        headerIcon.replaceChildren(makeCoinIconSvg(22));
    }

    // Click handler — buy on left-click of any node button.
    if (_elements.tree) {
        _elements.tree.addEventListener('click', (e) => {
            const node = e.target.closest('.shop-node');
            if (!node) return;
            const id = node.dataset.id;
            if (!id) return;
            // Parent nodes (weapon/skill themselves) are not buyable;
            // only upgrade nodes carry a non-empty `data-buyable`.
            if (node.dataset.buyable !== '1') return;
            // Ignore a second buy within 200ms (double-click / double-fire)
            // so a single intent can't buy two stacks before the re-render.
            const nowT = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            if (_lastBuyAt && nowT - _lastBuyAt < 200) return;
            _lastBuyAt = nowT;
            const ok = _engine.buyShopItem(id);
            if (ok) {
                node.classList.remove('shop-node--flash');
                // Force a reflow so the animation restarts.
                void node.offsetWidth;
                node.classList.add('shop-node--flash');
            }
            renderShopDom();
        });

        // Right-click any owned node to sell one stack back at-cost. The
        // refund equals what was paid for the last stack (sellShopItem reads
        // the same ramped costOverrides), so selling a trait to buy another
        // nets zero gold — free respec.
        _elements.tree.addEventListener('contextmenu', (e) => {
            const node = e.target.closest('.shop-node');
            if (!node || node.dataset.sellable !== '1') return;
            e.preventDefault();
            const id = node.dataset.id;
            if (!id || !_engine.sellShopItem) return;
            if (_engine.sellShopItem(id)) {
                node.classList.remove('shop-node--flash');
                void node.offsetWidth;
                node.classList.add('shop-node--flash');
                _hideTooltip();
            }
            renderShopDom();
        });

        // Tooltip — show on pointerover, hide on pointerout, follow cursor.
        _elements.tree.addEventListener('pointerover', (e) => {
            const node = e.target.closest('.shop-node');
            if (!node) return;
            _showTooltip(node, e);
        });
        _elements.tree.addEventListener('pointermove', (e) => {
            if (_elements.tooltip && _elements.tooltip.style.display !== 'none') {
                _positionTooltip(e);
            }
        });
        _elements.tree.addEventListener('pointerout', (e) => {
            const node = e.target.closest('.shop-node');
            if (!node) return;
            // Only hide if leaving the entire node (not just hopping
            // between the node's icon/label children).
            if (node.contains(e.relatedTarget)) return;
            _hideTooltip();
        });
    }
}

export function showShopDom() {
    if (!_elements) return;
    if (_elements.overlay) _elements.overlay.style.display = 'flex';
    renderShopDom();
}

export function hideShopDom() {
    if (!_elements) return;
    if (_elements.overlay) _elements.overlay.style.display = 'none';
    _hideTooltip();
}

export function updateShopCurrencyDom() {
    if (!_elements || !_engine) return;
    if (_elements.coinsAmt) {
        _elements.coinsAmt.textContent = `${Math.floor(_engine.game.money)}`;
    }
}

// 6.27.0 — Reflect `_activeTab` into the DOM: set the tree's
// data-active-tab (CSS shows the matching cluster) and toggle the
// `.active` class on the tab buttons.
function _syncActiveTab() {
    if (_elements.tree) _elements.tree.dataset.activeTab = _activeTab;
    if (_elements.tabs) {
        for (const btn of _elements.tabs.querySelectorAll('.shop-tree-tab')) {
            btn.classList.toggle('active', btn.dataset.tab === _activeTab);
        }
    }
}

// ── Main render ────────────────────────────────────────────────────

export function renderShopDom() {
    if (!_elements || !_engine) return;
    updateShopCurrencyDom();
    _syncActiveTab();

    const player = _engine.player;
    if (!player) return;

    // 6.30.0 — Weapon/skill clusters are buyable; the PASSIVE cluster is
    // READ-ONLY (passives come from wave-clear cards, not the shop) — it
    // just visualizes what the player has collected.
    _renderWeaponCluster(_elements.clusterPrimary, _collectPrimaryGroups(), player);
    _renderWeaponCluster(_elements.clusterPower,   _collectPowerGroups(),   player);
    _renderWeaponCluster(_elements.clusterDefense, _collectDefenseGroups(), player);
    _renderPassiveCluster(_elements.clusterPassive, player);
}

// ── Cluster builders ───────────────────────────────────────────────

// Each "group" describes one weapon/skill node + its orbiting upgrade
// nodes. Shape:
//   { parent: { id, name, icon, color },
//     upgrades: [{ id, name, icon, description, cost, maxStacks }, ...] }
function _collectPrimaryGroups() {
    const groups = [];
    for (const w of Object.values(PRIMARY_WEAPONS)) {
        groups.push({
            parent: { id: w.id, name: w.name, icon: w.icon, color: w.color, description: w.description },
            upgrades: getPrimaryUpgrades(w.id).map(u => ({
                id: u.id,
                name: u.name,
                icon: u.icon,
                description: u.description || '',
                cost: u.cost,
                costOverrides: u.costOverrides || null,
                maxStacks: u.maxStacks || 1,
                color: w.color,
                weaponId: w.id,
                tier: u.tier || 1,
                requires: u.requires || null,
            })),
        });
    }
    return groups;
}

function _collectPowerGroups() {
    const groups = [];
    for (const w of Object.values(POWER_WEAPONS)) {
        groups.push({
            parent: { id: w.id, name: w.name, icon: w.icon, color: w.color, description: w.description },
            upgrades: getPowerUpgrades(w.id).map(u => ({
                id: u.id,
                name: u.name,
                icon: u.icon,
                description: u.description || '',
                cost: u.costOverrides ? u.costOverrides[0] : u.cost,
                costOverrides: u.costOverrides || null,
                maxStacks: u.maxStacks || 1,
                color: w.color,
                weaponId: w.id,
                tier: u.tier || 1,
                requires: u.requires || null,
            })),
        });
    }
    return groups;
}

function _collectDefenseGroups() {
    const groups = [];
    for (const s of Object.values(DEFENSE_SKILLS)) {
        groups.push({
            parent: { id: s.id, name: s.name, icon: s.icon, color: s.color, description: s.description },
            upgrades: getSkillUpgrades(s.id).map(u => ({
                id: u.id,
                name: u.name,
                icon: u.icon,
                description: u.description || '',
                // SP-era costs scaled into gold so the tree displays a
                // meaningful number. See SKILL_COST_MULT note up top.
                cost: (u.cost || 0) * SKILL_COST_MULT,
                costOverrides: null,
                maxStacks: u.maxStacks || 1,
                color: s.color,
                skillId: s.id,
                tier: u.tier || 1,
                requires: u.requires || null,
            })),
        });
    }
    return groups;
}

// Weapon-style cluster: parent + orbiting upgrades. One subgroup per
// weapon, separated by a thin divider.
function _renderWeaponCluster(container, groups, player) {
    if (!container) return;
    container.replaceChildren();

    for (const group of groups) {
        const sub = document.createElement('div');
        sub.className = 'shop-tree-subgroup';
        sub.style.setProperty('--node-accent', group.parent.color);

        // Inner ring: parent node centered, upgrades orbit it.
        const ring = document.createElement('div');
        ring.className = 'shop-tree-ring';

        // Parent node (centered, not buyable).
        ring.appendChild(_buildParentNode(group.parent));

        // Orbit upgrade nodes around the parent.
        const N = group.upgrades.length;
        const RADIUS = N <= 4 ? 110 : (N <= 6 ? 130 : 150);
        for (let i = 0; i < N; i++) {
            const upg = group.upgrades[i];
            // Distribute around the circle starting at the top (-90°).
            const angleDeg = -90 + (360 * i) / N;
            const angleRad = (angleDeg * Math.PI) / 180;
            const tx = Math.cos(angleRad) * RADIUS;
            const ty = Math.sin(angleRad) * RADIUS;
            const node = _buildUpgradeNode(upg, player);
            node.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px)`;
            ring.appendChild(node);
        }
        sub.appendChild(ring);
        container.appendChild(sub);
    }
}

// 6.30.0 — READ-ONLY passive cluster. Passives are gained only from
// wave-clear cards, so these nodes are not buyable — they just show
// the player's collected passives (lit + stack badge) vs the ones
// they haven't picked yet (dimmed). Hover shows name + effect + stacks.
function _renderPassiveCluster(container, player) {
    if (!container) return;
    container.replaceChildren();

    const grid = document.createElement('div');
    grid.className = 'shop-tree-passive-grid';

    for (const upg of getPassiveUpgrades({ includeHidden: false })) {
        grid.appendChild(_buildPassiveDisplayNode(upg, player));
    }
    container.appendChild(grid);
}

function _buildPassiveDisplayNode(upg, player) {
    const stacks = (player.getPowerupStacks && typeof player.getPowerupStacks === 'function')
        ? player.getPowerupStacks(upg.id) : 0;
    const maxStacks = upg.maxStacks || 1;
    const owned = stacks > 0;
    const maxed = stacks >= maxStacks;

    // Non-button div so it reads as a display, not a buy target.
    const node = document.createElement('div');
    node.className = 'shop-node shop-node--upgrade shop-node--passive';
    node.dataset.id = upg.id;
    node.dataset.buyable = '0'; // never purchasable — reward-only
    const state = maxed ? 'maxed' : (owned ? 'owned' : 'unaffordable');
    node.dataset.state = state;
    node.classList.add(`shop-node--${state}`);
    if (upg.color) node.style.setProperty('--node-color', upg.color);

    node.dataset.tooltipKind = 'upgrade';
    node.dataset.tooltipName = upg.name;
    node.dataset.tooltipDesc = upg.description || '';
    node.dataset.tooltipStacks = `${stacks}/${maxStacks}`;
    node.dataset.tooltipState = owned ? 'owned' : 'reward';
    // No cost — passives aren't bought. Mark so the tooltip can show
    // "WAVE REWARD" instead of a price.
    node.dataset.tooltipReward = '1';

    const icon = document.createElement('span');
    icon.className = 'shop-node-icon';
    icon.innerHTML = renderIconHTML(upg.icon, { size: 26, fallback: '?' });
    node.appendChild(icon);

    if (owned) {
        const badge = document.createElement('span');
        badge.className = 'shop-node-badge';
        badge.textContent = `${stacks}/${maxStacks}`;
        node.appendChild(badge);
    }

    return node;
}

// ── Node builders ──────────────────────────────────────────────────

function _buildParentNode(parent) {
    const node = document.createElement('div');
    node.className = 'shop-node shop-node--parent';
    node.dataset.id = parent.id;
    node.dataset.buyable = '0';
    node.style.setProperty('--node-color', parent.color);
    node.dataset.tooltipKind = 'parent';
    node.dataset.tooltipName = parent.name;
    node.dataset.tooltipDesc = parent.description || '';

    const icon = document.createElement('div');
    icon.className = 'shop-node-icon';
    icon.innerHTML = renderIconHTML(parent.icon, { size: 30, fallback: '?' });
    node.appendChild(icon);

    // 6.28.0 — Weapon name removed (many didn't fit under the node).
    // Name + description show in the hover tooltip (dataset above).
    return node;
}

function _buildUpgradeNode(upg, player) {
    const currentStacks = (player.getPowerupStacks && typeof player.getPowerupStacks === 'function')
        ? player.getPowerupStacks(upg.id) : 0;
    const maxStacks = upg.maxStacks || 1;
    const isMaxed = currentStacks >= maxStacks;
    const isOwned = currentStacks > 0;

    // Stack-aware cost (mirrors actualCostFor in the old shop).
    let cost = upg.cost;
    if (upg.costOverrides) {
        cost = upg.costOverrides[Math.min(currentStacks, upg.costOverrides.length - 1)] || cost;
    }

    // At-cost sell refund — the price of the LAST stack owned. Mirrors
    // sellShopItem in shop-manager.js (both read costOverrides) so the
    // displayed refund matches the gold actually returned; selling one
    // trait to buy another nets zero.
    let refund = 0;
    if (isOwned) {
        refund = upg.costOverrides
            ? (upg.costOverrides[Math.min(currentStacks - 1, upg.costOverrides.length - 1)] || upg.cost)
            : upg.cost;
    }

    const money = (_engine && _engine.game && _engine.game.money) || 0;
    const canAfford = !isMaxed && money >= cost;

    // Gate check — capstones require a prerequisite stack count. Until
    // satisfied we render the node but treat it as locked (state == locked).
    let locked = false;
    if (upg.requires) {
        const reqStacks = (player.getPowerupStacks && typeof player.getPowerupStacks === 'function')
            ? player.getPowerupStacks(upg.requires.id) : 0;
        if (reqStacks < (upg.requires.stacks || 1)) locked = true;
    }

    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'shop-node shop-node--upgrade';
    node.dataset.id = upg.id;
    node.dataset.buyable = (isMaxed || locked) ? '0' : '1';

    // State class — drives border color, dim, badge tone.
    let state;
    if (locked)          state = 'locked';
    else if (isMaxed)    state = 'maxed';
    else if (isOwned)    state = 'owned';
    else if (canAfford)  state = 'affordable';
    else                 state = 'unaffordable';
    node.dataset.state = state;
    node.classList.add(`shop-node--${state}`);

    if (upg.color) node.style.setProperty('--node-color', upg.color);
    if (isMaxed || locked) node.disabled = true;

    // Tooltip payload — stashed on dataset so pointerover can read it
    // without rebuilding lookups.
    node.dataset.tooltipKind = 'upgrade';
    node.dataset.tooltipName = upg.name;
    node.dataset.tooltipDesc = upg.description || '';
    node.dataset.tooltipCost = String(cost);
    node.dataset.tooltipStacks = `${currentStacks}/${maxStacks}`;
    node.dataset.tooltipState = state;
    // Owned nodes can be sold back at-cost via right-click (see the
    // contextmenu handler in initShopDom). Stash the refund for the tooltip.
    if (isOwned) {
        node.dataset.sellable = '1';
        node.dataset.tooltipRefund = String(refund);
    }
    if (locked && upg.requires) {
        node.dataset.tooltipLock = `Locked — needs ${upg.requires.id} ×${upg.requires.stacks || 1}`;
    }

    // Capstone (tier 2) rosette ring.
    if (upg.tier === 2) node.classList.add('shop-node--capstone');

    // Inner content — icon only, centered in the circle. 6.27.0 — the
    // per-node cost label was removed; cost is now hover-only (tooltip).
    // Affordability/maxed/locked state is conveyed by the border color
    // (see .shop-node--<state>) and the stack badge.
    const icon = document.createElement('span');
    icon.className = 'shop-node-icon';
    icon.innerHTML = renderIconHTML(upg.icon, { size: 26, fallback: '?' });
    node.appendChild(icon);

    // Stack badge (only if owned or maxed).
    if (isOwned) {
        const badge = document.createElement('span');
        badge.className = 'shop-node-badge';
        badge.textContent = `${currentStacks}/${maxStacks}`;
        node.appendChild(badge);
    }

    // 6.28.0 — Upgrade name removed from under the node; it's hover-only
    // now (tooltip carries name + description + cost + stacks).
    return node;
}

// ── Tooltip ────────────────────────────────────────────────────────

function _showTooltip(node, e) {
    if (!_elements.tooltip) return;
    const tip = _elements.tooltip;
    tip.replaceChildren();

    const kind = node.dataset.tooltipKind;
    const name = node.dataset.tooltipName || '';
    const desc = node.dataset.tooltipDesc || '';

    const nameEl = document.createElement('div');
    nameEl.className = 'shop-tree-tooltip-name';
    nameEl.textContent = name;
    tip.appendChild(nameEl);

    if (desc) {
        const descEl = document.createElement('div');
        descEl.className = 'shop-tree-tooltip-desc';
        descEl.textContent = desc;
        tip.appendChild(descEl);
    }

    if (kind === 'upgrade') {
        const stacks = node.dataset.tooltipStacks || '';
        const cost = node.dataset.tooltipCost || '';
        const state = node.dataset.tooltipState || '';
        const lock = node.dataset.tooltipLock || '';

        if (lock) {
            const lockEl = document.createElement('div');
            lockEl.className = 'shop-tree-tooltip-lock';
            lockEl.textContent = lock;
            tip.appendChild(lockEl);
        }

        const metaEl = document.createElement('div');
        metaEl.className = 'shop-tree-tooltip-meta';
        metaEl.appendChild(_makeMeta('STACK', stacks));
        // 6.30.0 — Passive display nodes aren't bought; show how they're
        // acquired instead of a price.
        if (node.dataset.tooltipReward === '1') {
            metaEl.appendChild(_makeMeta('FROM', 'WAVE REWARD'));
        } else if (state === 'maxed') {
            metaEl.appendChild(_makeMeta('COST', 'MAX'));
        } else {
            metaEl.appendChild(_makeMeta('COST', cost));
        }
        // Owned upgrades can be sold back at-cost via right-click.
        if (node.dataset.sellable === '1') {
            metaEl.appendChild(_makeMeta('SELL', node.dataset.tooltipRefund || ''));
        }
        tip.appendChild(metaEl);

        if (node.dataset.sellable === '1') {
            const sellHint = document.createElement('div');
            sellHint.className = 'shop-tree-tooltip-sellhint';
            sellHint.textContent = 'Right-click to sell (at-cost)';
            tip.appendChild(sellHint);
        }
    }

    tip.style.display = 'block';
    _positionTooltip(e);
}

function _makeMeta(label, value) {
    const wrap = document.createElement('span');
    wrap.className = 'shop-tree-tooltip-meta-cell';
    const lbl = document.createElement('span');
    lbl.className = 'shop-tree-tooltip-meta-label';
    lbl.textContent = label;
    wrap.appendChild(lbl);
    const val = document.createElement('span');
    val.className = 'shop-tree-tooltip-meta-value';
    val.textContent = value;
    wrap.appendChild(val);
    return wrap;
}

function _positionTooltip(e) {
    if (!_elements.tooltip) return;
    const tip = _elements.tooltip;
    const pad = 14;
    // Place to the right of the cursor by default; flip left if it
    // would overflow the viewport.
    const tipW = tip.offsetWidth || 260;
    const tipH = tip.offsetHeight || 100;
    let x = e.clientX + pad;
    let y = e.clientY + pad;
    if (x + tipW + pad > window.innerWidth)  x = e.clientX - tipW - pad;
    if (y + tipH + pad > window.innerHeight) y = window.innerHeight - tipH - pad;
    if (x < pad) x = pad;
    if (y < pad) y = pad;
    tip.style.left = `${x}px`;
    tip.style.top  = `${y}px`;
}

function _hideTooltip() {
    if (_elements?.tooltip) _elements.tooltip.style.display = 'none';
}

// ── Coin SVG helper ────────────────────────────────────────────────

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
