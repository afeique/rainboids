import { SLOT_LABEL } from '../world/item-names.js';
import { drawItemGlyph } from '../hud/item-feed.js';
import { renderIconHTML, renderBindingChipHTML } from './icons.js';

const STAT_LABELS = {
    hp: 'HP',
    toughness: 'Tough',
    regen: 'Regen',
    vampirism: 'Life',
    thorns: 'Thorns',
    critChance: 'Crit',
    critDamage: 'Crit Dmg',
    dodge: 'Dodge',
    speed: 'Speed',
    pyroResist: 'Pyro',
    cryoResist: 'Cryo',
    voltResist: 'Volt',
    toxicResist: 'Toxic',
    voidResist: 'Void',
    radiantResist: 'Radiant',
};

const STAT_ORDER = [
    'hp', 'toughness', 'regen', 'vampirism', 'thorns',
    'critChance', 'critDamage', 'dodge', 'speed',
    'pyroResist', 'cryoResist', 'voltResist', 'toxicResist', 'voidResist', 'radiantResist',
];

export function itemStatTotals(item) {
    const out = {};
    for (const a of item?.affixes || []) {
        if (!a || !a.type) continue;
        out[a.type] = (out[a.type] || 0) + Number(a.value || 0);
    }
    return out;
}

export function compareItemStats(candidate, equipped) {
    const a = itemStatTotals(candidate);
    const b = itemStatTotals(equipped);
    const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
    return STAT_ORDER.filter((k) => keys.has(k)).map((key) => ({
        key,
        label: STAT_LABELS[key] || key,
        delta: +(Number(a[key] || 0) - Number(b[key] || 0)).toFixed(1),
        next: a[key] || 0,
        current: b[key] || 0,
    })).filter((row) => row.delta !== 0);
}

export function equippedStatTotals(equippedItems = {}) {
    const out = {};
    for (const item of Object.values(equippedItems || {})) {
        for (const [key, value] of Object.entries(itemStatTotals(item))) {
            out[key] = +(Number(out[key] || 0) + Number(value || 0)).toFixed(1);
        }
    }
    return out;
}

function gearGlyph(slot, rarity, px = 56) {
    if (typeof document === 'undefined') return null;
    const c = document.createElement('canvas');
    c.width = px;
    c.height = px;
    c.className = 'item-card__glyph-canvas';
    const ctx = c.getContext('2d');
    if (ctx) {
        ctx.translate(px / 2, px / 2);
        drawItemGlyph(ctx, slot, rarity, px / 2 - 5);
    }
    return c;
}

function itemName(item) {
    if (!item) return 'Empty';
    if (item.name) return item.name;
    const slot = SLOT_LABEL[item.slot] || String(item.slot || 'GEAR').toUpperCase();
    const rarity = item.rarityLabel || '';
    return `${rarity ? rarity + ' ' : ''}${slot}`;
}

function addText(parent, className, text) {
    const el = document.createElement('div');
    el.className = className;
    el.textContent = text || '';
    parent.appendChild(el);
    return el;
}

export function createItemCard(item, opts = {}) {
    const card = document.createElement('div');
    const variant = opts.variant || 'standard';
    const rarity = item?.rarityColor || item?.color || '#6d7a91';
    card.className = `item-card item-card--${variant}` + (item ? '' : ' item-card--empty');
    card.style.setProperty('--item-rarity', rarity);
    if (opts.focusable) {
        card.tabIndex = 0;
        card.dataset.gamepadFocus = 'true';
    }

    const icon = document.createElement('div');
    icon.className = 'item-card__icon';
    if (item?.slot) {
        const glyph = gearGlyph(item.slot, rarity, variant === 'compact' ? 34 : 58);
        if (glyph) icon.appendChild(glyph);
    } else if (item?.icon) {
        icon.innerHTML = renderIconHTML(item.icon, { size: variant === 'compact' ? 28 : 42, color: rarity, title: item.name });
    }
    card.appendChild(icon);

    const body = document.createElement('div');
    body.className = 'item-card__body';
    card.appendChild(body);

    const top = document.createElement('div');
    top.className = 'item-card__topline';
    body.appendChild(top);
    addText(top, 'item-card__name', itemName(item));
    if (opts.binding) {
        const chip = document.createElement('span');
        chip.innerHTML = renderBindingChipHTML(opts.binding, { family: opts.controllerFamily, title: opts.bindingTitle });
        top.appendChild(chip.firstElementChild || chip);
    }

    const meta = item?.slot ? `${SLOT_LABEL[item.slot] || item.slot.toUpperCase()} · L${item.level || 1}` : (item?.type || item?.id || '');
    addText(body, 'item-card__meta', meta);

    const affixes = item?.affixes || [];
    if (variant !== 'compact' && affixes.length) {
        const list = document.createElement('div');
        list.className = 'item-card__affixes';
        for (const affix of affixes.slice(0, opts.maxAffixes || 4)) {
            addText(list, 'item-card__affix', affix.label || `${STAT_LABELS[affix.type] || affix.type} +${affix.value}`);
        }
        body.appendChild(list);
    } else if (item?.description && variant !== 'compact') {
        addText(body, 'item-card__desc', item.description);
    } else if (item?.bonusLabel) {
        addText(body, 'item-card__desc', item.bonusLabel);
    }

    const deltas = opts.compareWith ? compareItemStats(item, opts.compareWith) : [];
    if (deltas.length) {
        const strip = document.createElement('div');
        strip.className = 'item-card__deltas';
        for (const d of deltas.slice(0, 5)) {
            const row = addText(strip, `item-card__delta ${d.delta > 0 ? 'is-up' : 'is-down'}`, `${d.delta > 0 ? '+' : ''}${d.delta} ${d.label}`);
            row.title = `${d.label}: ${d.current} -> ${d.next}`;
        }
        body.appendChild(strip);
    }

    if (opts.badge) addText(card, 'item-card__badge', opts.badge);
    return card;
}

export function createStatPanel(equippedItems = {}, previewItem = null) {
    const base = equippedStatTotals(equippedItems);
    let next = base;
    if (previewItem) {
        const slot = previewItem.slot;
        const without = { ...equippedItems, [slot]: null };
        next = equippedStatTotals({ ...without, [slot]: previewItem });
    }

    const panel = document.createElement('div');
    panel.className = 'item-stats-panel';
    addText(panel, 'item-stats-panel__title', 'STAT SHEET');
    for (const key of STAT_ORDER.slice(0, 9)) {
        const value = Number(next[key] || 0);
        const row = document.createElement('div');
        row.className = 'item-stat-row';
        addText(row, 'item-stat-row__label', STAT_LABELS[key] || key);
        const bar = document.createElement('div');
        bar.className = 'item-stat-row__bar';
        const fill = document.createElement('span');
        fill.style.width = `${Math.max(4, Math.min(100, Math.abs(value) * (key === 'hp' ? 1.5 : 4)))}%`;
        bar.appendChild(fill);
        row.appendChild(bar);
        addText(row, 'item-stat-row__value', value ? String(value) : '0');
        panel.appendChild(row);
    }

    const wheel = document.createElement('div');
    wheel.className = 'item-resist-wheel';
    for (const key of ['pyroResist', 'cryoResist', 'voltResist', 'toxicResist', 'voidResist', 'radiantResist']) {
        const spoke = addText(wheel, 'item-resist-wheel__spoke', `${STAT_LABELS[key]} ${Number(next[key] || 0)}`);
        spoke.style.setProperty('--resist-fill', `${Math.min(100, Math.max(5, Number(next[key] || 0) * 4))}%`);
    }
    panel.appendChild(wheel);
    return panel;
}
