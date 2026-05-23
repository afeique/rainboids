// Phase R3 — the per-run CARD draft. A relevance-filtered powerup pick shown
// at 5 stage-clears per run (every 2nd of the 10 stages). Each draft offers
// 2 weapon cards + 1 ability card, filtered to the player's equipped loadout,
// so a card is never offered for a weapon/ability you aren't carrying.
//
// Pure helpers (no DOM) so the pool-building + composition are unit-testable;
// wave-manager renders the chosen cards via the existing #wave-pick-overlay.

import { getStage, isStageClear } from '../core/constants.js';

export const CARDS_PER_RUN = 5;
export const CARD_WEAPON_COUNT = 2;
export const CARD_ABILITY_COUNT = 1;

/** Card stages = every 2nd stage clear (2,4,6,8,10) → 5 drafts per run. */
export function isCardStage(wave) {
    return isStageClear(wave) && (getStage(wave) % 2 === 0);
}

function notMaxed(player, id, cfg) {
    const cap = cfg.maxStacks || 99;
    const stacks = player.getPowerupStacks ? (player.getPowerupStacks(id) || 0) : 0;
    return stacks < cap;
}

/** Weapon-upgrade cards relevant to the equipped primaries + powers. */
export function weaponCards(player, PRIMARY_UPGRADES, POWER_UPGRADES) {
    const owned = new Set([
        ...(player.ownedPrimaries || []),
        ...(player.ownedPowers || []),
    ]);
    const out = [];
    for (const pool of [PRIMARY_UPGRADES || {}, POWER_UPGRADES || {}]) {
        for (const [id, cfg] of Object.entries(pool)) {
            if (owned.has(cfg.weapon) && notMaxed(player, id, cfg)) out.push([id, cfg]);
        }
    }
    return out;
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
 * Compose one draft: CARD_WEAPON_COUNT weapon + CARD_ABILITY_COUNT ability
 * cards, all distinct. If a pool is short, backfill from the other so the
 * player still gets up to 3 choices. Returns an array of [id, cfg] pairs.
 */
export function composeDraft(weaponPool, abilityPool, rng = Math.random) {
    const shuffle = (arr) => {
        const a = arr.slice();
        for (let i = a.length - 1; i > 0; i--) {
            const j = (rng() * (i + 1)) | 0;
            [a[i], a[j]] = [a[j], a[i]];
        }
        return a;
    };
    const w = shuffle(weaponPool);
    const a = shuffle(abilityPool);
    const out = [];
    out.push(...w.slice(0, CARD_WEAPON_COUNT));
    out.push(...a.slice(0, CARD_ABILITY_COUNT));
    const target = CARD_WEAPON_COUNT + CARD_ABILITY_COUNT;
    if (out.length < target) {
        const chosen = new Set(out.map(([id]) => id));
        for (const c of shuffle([...w.slice(CARD_WEAPON_COUNT), ...a.slice(CARD_ABILITY_COUNT)])) {
            if (out.length >= target) break;
            if (!chosen.has(c[0])) { out.push(c); chosen.add(c[0]); }
        }
    }
    return out;
}

/** Build + compose a draft from the player's loadout in one call. */
export function buildDraft(player, pools, rng = Math.random) {
    const w = weaponCards(player, pools.PRIMARY_UPGRADES, pools.POWER_UPGRADES);
    const a = abilityCards(player, pools.ABILITY_UPGRADES);
    return composeDraft(w, a, rng);
}
