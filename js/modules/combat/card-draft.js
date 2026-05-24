// Phase R3 / W4 — the per-run CARD draft. A relevance-filtered powerup pick
// shown at 5 stage-clears per run (every 2nd of the 10 stages). Each draft
// offers 1 PRIMARY + 1 POWER + 2 ABILITY cards, filtered to the equipped
// loadout, so a card is never offered for a weapon/ability you aren't carrying.
//
// W4 — cards are EFFICACY-ONLY: mechanic mods (pierce/explode/home/stun/knock +
// capstones) are excluded here because they're upfront BUILD-tree picks (W3/W5).
// Cards just amplify what you already brought (more/faster/bigger/harder).
//
// Pure helpers (no DOM) so the pool-building + composition are unit-testable;
// wave-manager renders the chosen cards via the existing #wave-pick-overlay.

import { getStage, isStageClear } from '../core/constants.js';
import { isMechanicMod } from './weapon-data.js';

export const CARDS_PER_RUN = 5;
export const CARD_PRIMARY_COUNT = 1;
export const CARD_POWER_COUNT = 1;
export const CARD_ABILITY_COUNT = 2;
export const CARD_TARGET = CARD_PRIMARY_COUNT + CARD_POWER_COUNT + CARD_ABILITY_COUNT; // 4
// Back-compat alias (old name) — total weapon cards = primary + power.
export const CARD_WEAPON_COUNT = CARD_PRIMARY_COUNT + CARD_POWER_COUNT;

/** Card stages = every 2nd stage clear (2,4,6,8,10) → 5 drafts per run. */
export function isCardStage(wave) {
    return isStageClear(wave) && (getStage(wave) % 2 === 0);
}

function notMaxed(player, id, cfg) {
    const cap = cfg.maxStacks || 99;
    const stacks = player.getPowerupStacks ? (player.getPowerupStacks(id) || 0) : 0;
    return stacks < cap;
}

// Shared filter: an EFFICACY upgrade for an owned weapon that isn't maxed.
function _efficacyFor(player, pool, ownedSet) {
    const out = [];
    for (const [id, cfg] of Object.entries(pool || {})) {
        if (ownedSet.has(cfg.weapon) && !isMechanicMod(id) && notMaxed(player, id, cfg)) {
            out.push([id, cfg]);
        }
    }
    return out;
}

/** Efficacy primary-upgrade cards for the equipped primaries. */
export function primaryCards(player, PRIMARY_UPGRADES) {
    return _efficacyFor(player, PRIMARY_UPGRADES, new Set(player.ownedPrimaries || []));
}

/** Efficacy power-upgrade cards for the equipped powers. */
export function powerCards(player, POWER_UPGRADES) {
    return _efficacyFor(player, POWER_UPGRADES, new Set(player.ownedPowers || []));
}

/** Back-compat: all weapon (primary + power) efficacy cards. */
export function weaponCards(player, PRIMARY_UPGRADES, POWER_UPGRADES) {
    return [...primaryCards(player, PRIMARY_UPGRADES), ...powerCards(player, POWER_UPGRADES)];
}

/** Ability-upgrade cards relevant to the equipped abilities. */
export function abilityCards(player, ABILITY_UPGRADES) {
    const equipped = new Set((player.equippedAbilities || []).filter(Boolean));
    const out = [];
    for (const [id, cfg] of Object.entries(ABILITY_UPGRADES || {})) {
        if (equipped.has(cfg.ability) && notMaxed(player, id, cfg)) out.push([id, cfg]);
    }
    return out;
}

/**
 * Compose one draft: CARD_PRIMARY_COUNT primary + CARD_POWER_COUNT power +
 * CARD_ABILITY_COUNT ability cards, all distinct. If a pool is short, backfill
 * from the others so the player still gets up to CARD_TARGET choices. Returns
 * an array of [id, cfg] pairs.
 */
export function composeDraft(primaryPool, powerPool, abilityPool, rng = Math.random) {
    const shuffle = (arr) => {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = (rng() * (i + 1)) | 0;
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    };
    const p = shuffle(primaryPool || []);
    const w = shuffle(powerPool || []);
    const a = shuffle(abilityPool || []);
    const out = [];
    const chosen = new Set();
    const take = (pool, n) => {
        for (const c of pool) {
            if (out.length >= CARD_TARGET || n <= 0) break;
            if (!chosen.has(c[0])) { out.push(c); chosen.add(c[0]); n--; }
        }
    };
    take(p, CARD_PRIMARY_COUNT);
    take(w, CARD_POWER_COUNT);
    take(a, CARD_ABILITY_COUNT);
    // Backfill from any leftovers so a dry pool doesn't shrink the offer.
    if (out.length < CARD_TARGET) {
        for (const c of shuffle([...p, ...w, ...a])) {
            if (out.length >= CARD_TARGET) break;
            if (!chosen.has(c[0])) { out.push(c); chosen.add(c[0]); }
        }
    }
    return out;
}

/** Build + compose a draft from the player's loadout in one call. */
export function buildDraft(player, pools, rng = Math.random) {
    const p = primaryCards(player, pools.PRIMARY_UPGRADES);
    const w = powerCards(player, pools.POWER_UPGRADES);
    const a = abilityCards(player, pools.ABILITY_UPGRADES);
    return composeDraft(p, w, a, rng);
}
