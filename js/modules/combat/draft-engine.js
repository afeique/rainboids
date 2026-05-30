// combat/draft-engine.js
// ─────────────────────────────────────────────────────────────────────────────
// Pure logic for the between-wave draft (9.0.0 reboot): which cards are eligible
// for a player, rolling a random offer, applying a chosen card. No DOM, no
// engine refs — operates only on the player's powerup-stack Map + activePrimary
// + draftElements, so it's unit-testable against a minimal mock. The UI
// (draft-overlay) + the wave-clear hook drive these.
// ─────────────────────────────────────────────────────────────────────────────

import {
    OFFENSE_POWERUPS, ELEMENT_ATTUNEMENTS, DEFENSE_CARDS,
    DRAFT_OFFER_COUNT, MAX_ATTUNEMENTS_PER_WEAPON,
    DRAFT_CATEGORIES, upgradesForElement,
} from './draft-data.js';
import { perWeaponUpgradeId } from '../player/weapons.js';

function _stacks(player, key) {
    return (player && typeof player.getPowerupStacks === 'function') ? player.getPowerupStacks(key) : 0;
}

// Elements the player's ACTIVE primary is currently attuned to (the boons
// they've opened). Stored on player as draftElements[weaponId] = [elementId].
export function attunedElements(player) {
    const wid = player && player.activePrimary;
    if (!wid || !player.draftElements) return [];
    return player.draftElements[wid] || [];
}

// Is a single offense powerup / attunement / upgrade card takeable right now?
export function isOffenseCardEligible(player, card) {
    if (!card) return false;
    if (card.kind === 'perWeapon') {
        const id = perWeaponUpgradeId(player && player.activePrimary, card.trait);
        if (!id) return false;                       // weapon doesn't support the trait
        return _stacks(player, id) < card.maxStacks;
    }
    if (card.kind === 'global') {
        return _stacks(player, card.key) < card.maxStacks;
    }
    if (card.kind === 'attunement') {
        const els = attunedElements(player);
        return els.length < MAX_ATTUNEMENTS_PER_WEAPON && !els.includes(card.element);
    }
    if (card.kind === 'attUpgrade') {
        // Only offered once that element is attuned and the upgrade isn't maxed.
        return attunedElements(player).includes(card.element) && _stacks(player, card.id) < card.maxStacks;
    }
    return false;
}

// Full eligible OFFENSE pool: stackable powerups + open attunements + the
// upgrade lines of whatever elements are already attuned.
export function eligibleOffenseCards(player) {
    const out = [];
    for (const c of OFFENSE_POWERUPS) if (isOffenseCardEligible(player, c)) out.push(c);
    for (const a of ELEMENT_ATTUNEMENTS) if (isOffenseCardEligible(player, a)) out.push(a);
    for (const el of attunedElements(player)) {
        for (const up of upgradesForElement(el)) if (isOffenseCardEligible(player, up)) out.push(up);
    }
    return out;
}

export function eligibleDefenseCards(player) {
    return DEFENSE_CARDS.filter((c) => _stacks(player, c.key) < c.maxStacks);
}

// Partial Fisher-Yates: pick up to n distinct cards from the pool.
export function rollCards(pool, n = DRAFT_OFFER_COUNT, rng = Math.random) {
    const arr = pool.slice();
    for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(rng() * (i + 1));
        const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
    }
    return arr.slice(0, Math.min(n, arr.length));
}

export function rollDraft(player, category, n = DRAFT_OFFER_COUNT, rng = Math.random) {
    const pool = (category === DRAFT_CATEGORIES.DEFENSE)
        ? eligibleDefenseCards(player)
        : eligibleOffenseCards(player);
    return rollCards(pool, n, rng);
}

// Current stack count a card represents (for the overlay's "x3 / NEW" badge).
export function cardStacks(player, card) {
    if (!player || !card) return 0;
    if (card.kind === 'perWeapon') {
        const id = perWeaponUpgradeId(player.activePrimary, card.trait);
        return id ? _stacks(player, id) : 0;
    }
    if (card.kind === 'global' || card.kind === 'defense') return _stacks(player, card.key);
    if (card.kind === 'attUpgrade') return _stacks(player, card.id);
    if (card.kind === 'attunement') return attunedElements(player).includes(card.element) ? 1 : 0;
    return 0;
}

// Apply a chosen card to the player. All boons land in the powerup-stack Map
// except attunement openers, which also record the element on draftElements
// so firing (player/weapons.js) and upgrade eligibility can see it.
export function applyDraftCard(player, card) {
    if (!player || !card || typeof player.addPowerup !== 'function') return false;
    switch (card.kind) {
        case 'perWeapon': {
            const id = perWeaponUpgradeId(player.activePrimary, card.trait);
            if (!id) return false;
            return player.addPowerup(id, { maxStacks: card.maxStacks });
        }
        case 'global':
        case 'defense':
            return player.addPowerup(card.key, { maxStacks: card.maxStacks });
        case 'attunement': {
            const wid = player.activePrimary;
            if (!player.draftElements) player.draftElements = {};
            if (!player.draftElements[wid]) player.draftElements[wid] = [];
            if (!player.draftElements[wid].includes(card.element)) player.draftElements[wid].push(card.element);
            return true;
        }
        case 'attUpgrade':
            return player.addPowerup(card.id, { maxStacks: card.maxStacks });
        default:
            return false;
    }
}
