// Shared SP (stat-point) allocation card with [−] points/cap [+] controls.
//
// Used by BOTH the backtick STATS overlay (stats-overlay.js) and the
// pause-menu STATS tab (ui-manager.js) so the passive-stat allocation UI
// + icons live in one place. Points are freely refundable.

import { SP_STATS, SP_STAT_MAX_POINTS, spStatValue } from '../core/sp-stats.js';
import { renderIconHTML } from './icons.js';

// Apply a +1/−1 SP change; keep current HP within the (possibly changed)
// max. Returns true on a successful change.
export function adjustSp(player, statId, delta) {
    if (!player) return false;
    const ok = delta > 0
        ? (player.allocateSp && player.allocateSp(statId))
        : (player.deallocateSp && player.deallocateSp(statId));
    if (!ok) return false;
    if (typeof player.getEffectiveMaxHealth === 'function') {
        const maxHp = player.getEffectiveMaxHealth();
        if (player.health > maxHp) player.health = maxHp;
    }
    return true;
}

// Build the SP allocation card into `container`. `opts`:
//   onChange(): called after a successful +/- (re-render the host).
//   onHover(row) / onMove(e) / onLeave(): optional tooltip hooks.
export function renderSpAllocation(container, player, opts = {}) {
    if (!container || !player || !player.spStats) return;
    const sp = player.sp | 0;

    const card = document.createElement('div');
    card.className = 'stats-section stats-section--sp';

    const title = document.createElement('div');
    title.className = 'stats-section-title';
    title.textContent = sp > 0 ? `STAT POINTS — ${sp} TO SPEND` : 'STAT POINTS';
    if (sp > 0) title.classList.add('stats-section-title--hot');
    card.appendChild(title);

    for (const def of SP_STATS) {
        const pts = player.spStats[def.id] | 0;
        const val = spStatValue(def.id, pts);
        const atCap = pts >= SP_STAT_MAX_POINTS;
        const canAdd = sp > 0 && !atCap;
        const canRemove = pts > 0;

        const row = document.createElement('div');
        row.className = 'sp-alloc-row';
        row.dataset.tip = def.label(val);

        const icon = document.createElement('span');
        icon.className = 'sp-alloc-icon';
        icon.innerHTML = renderIconHTML(def.icon, { size: 22, fallback: '?' });
        row.appendChild(icon);

        const info = document.createElement('div');
        info.className = 'sp-alloc-info';
        const name = document.createElement('span');
        name.className = 'sp-alloc-name';
        name.textContent = def.name;
        const eff = document.createElement('span');
        eff.className = 'sp-alloc-value';
        eff.textContent = pts > 0 ? def.label(val) : '—';
        info.appendChild(name);
        info.appendChild(eff);
        row.appendChild(info);

        const minus = document.createElement('button');
        minus.type = 'button';
        minus.className = 'sp-alloc-btn sp-alloc-minus';
        minus.textContent = '−';
        minus.disabled = !canRemove;
        minus.addEventListener('click', (e) => {
            e.stopPropagation();
            if (adjustSp(player, def.id, -1) && opts.onChange) opts.onChange();
        });
        row.appendChild(minus);

        const dots = document.createElement('span');
        dots.className = 'sp-alloc-points';
        if (atCap) dots.classList.add('sp-alloc-points--max');
        dots.textContent = atCap ? `${pts}/${SP_STAT_MAX_POINTS} MAX` : `${pts}/${SP_STAT_MAX_POINTS}`;
        row.appendChild(dots);

        const plus = document.createElement('button');
        plus.type = 'button';
        plus.className = 'sp-alloc-btn sp-alloc-plus';
        plus.textContent = '+';
        plus.disabled = !canAdd;
        plus.addEventListener('click', (e) => {
            e.stopPropagation();
            if (adjustSp(player, def.id, +1) && opts.onChange) opts.onChange();
        });
        row.appendChild(plus);

        if (opts.onHover) row.addEventListener('mouseenter', () => opts.onHover(row));
        if (opts.onMove)  row.addEventListener('mousemove',  (e) => opts.onMove(e));
        if (opts.onLeave) row.addEventListener('mouseleave', () => opts.onLeave());

        card.appendChild(row);
    }

    container.appendChild(card);
}
