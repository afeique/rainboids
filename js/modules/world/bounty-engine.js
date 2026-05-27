// Looter-Economy Pivot — T15: Bounty engine.
//
// Pure logic over a passed-in `board` object (no DOM / globals; the rng is
// injected so tests are deterministic and storage wires in later). Consumes
// the T08 catalog (`world/bounty-data.js`) to roll a board (~3 dailies + 2
// persistent contracts), advance progress from gameplay events, grant rewards
// on claim, and reroll a single bounty.
//
// ─── Board shape ─────────────────────────────────────────────────────────────
//   {
//     dailies:   [ rolledBounty × 3 ],   // 24h-refresh, smaller payouts
//     contracts: [ rolledBounty × 2 ],   // persistent, larger goals
//     rolledAt:  <epoch ms>,             // when the board was rolled
//   }
// A rolledBounty is the T08 shape — { id, templateId, category, kind, text,
// progressType, target, reward, progress, fills } — plus engine bookkeeping
// the engine adds lazily: `completed` (bool) and `claimed` (bool).
//
// ─── Event shape ─────────────────────────────────────────────────────────────
//   { type, amount?, tags? }
// Examples:
//   { type: 'kill',        amount: 1, tags: ['PYRO', 'PULSE'] }
//   { type: 'elite-kill',  amount: 1 }
//   { type: 'craft',       tags: ['Legendary'] }
//   { type: 'stage-clear', tags: ['no-damage'] }
//
// `type` is a coarse event channel; `tags` carry the element/weapon/rarity/
// modifier qualifiers a bounty may require. `amount` defaults to 1.

import { rollBounty } from './bounty-data.js';

const DAILY_COUNT = 3;
const CONTRACT_COUNT = 2;

// ─── Event → progressType matching ───────────────────────────────────────────
//
// Bounties carry a `progressType` from the catalog; gameplay emits coarser
// event `type`s. This table maps each event type to the progressType(s) it can
// satisfy. A single kill event can advance several kill-flavored bounties at
// once (e.g. total kills + element kills + weapon kills), so each entry is a
// list of candidate progressTypes; per-candidate `tag` requirements are then
// checked against the bounty's filled tokens.
//
//   tagFrom — which filled-token key (if any) the matching tag must equal
//             (case-insensitive). `null` = no tag requirement.
const EVENT_MAP = {
    'kill': [
        { progressType: 'kill', tagFrom: null },
        { progressType: 'kill_element', tagFrom: 'element' },
        { progressType: 'kill_weapon', tagFrom: 'weapon' },
        { progressType: 'killstreak', tagFrom: null },
    ],
    'elite-kill': [
        { progressType: 'elite_kill', tagFrom: null },
        // an elite is still an enemy: also feeds plain kill goals.
        { progressType: 'kill', tagFrom: null },
    ],
    'boss-kill': [
        { progressType: 'boss_kill', tagFrom: null },
    ],
    'craft': [
        { progressType: 'fabricate_rarity', tagFrom: 'rarity' },
    ],
    'reroll': [
        { progressType: 'reroll', tagFrom: null },
    ],
    'salvage': [
        { progressType: 'salvage', tagFrom: null },
    ],
    'combine-matrix': [
        { progressType: 'combine_matrix', tagFrom: null },
    ],
    'status': [
        { progressType: 'apply_status', tagFrom: 'reaction' },
    ],
    'reaction': [
        { progressType: 'reaction', tagFrom: null },
    ],
    // Stage-clear is overloaded: a no-damage clear advances no_damage_stage,
    // a surge clear advances clear_surge, etc. The required modifier rides in
    // `tags` and is matched to the progressType directly.
    'stage-clear': [
        { progressType: 'no_damage_stage', tag: 'no-damage' },
        { progressType: 'clear_modifier', tag: 'sudden-death' },
        { progressType: 'clear_no_primary', tag: 'no-primary' },
        { progressType: 'clear_surge', tag: 'surge-counter' },
    ],
};

// Normalize a tag for comparison (string, lowercased, trimmed).
function _norm(v) {
    return String(v == null ? '' : v).trim().toLowerCase();
}

// True if `bounty` should advance for this event candidate.
function _matches(bounty, candidate, eventTags) {
    if (bounty.progressType !== candidate.progressType) return false;

    // Candidate requires a literal tag present in the event (e.g. 'no-damage').
    if (candidate.tag != null) {
        return eventTags.some((t) => _norm(t) === _norm(candidate.tag));
    }

    // Candidate requires the event to carry a tag equal to one of the bounty's
    // filled tokens (e.g. the bounty's {element} must appear in event.tags).
    if (candidate.tagFrom != null) {
        const want = bounty.fills ? bounty.fills[candidate.tagFrom] : undefined;
        if (want == null) return false; // bounty has no such token → no match
        return eventTags.some((t) => _norm(t) === _norm(want));
    }

    // No tag requirement: a plain channel match.
    return true;
}

// All non-claimed bounties on the board, in display order (dailies, contracts).
function _all(board) {
    return [...(board.dailies || []), ...(board.contracts || [])];
}

/**
 * rollBoard(rng=Math.random) → a fresh board of 3 dailies + 2 contracts.
 * Avoids duplicate `templateId`s within the board (re-rolls a slot until it
 * draws an unused template, with a bounded number of attempts so an exhausted
 * pool can't loop forever).
 */
export function rollBoard(rng = Math.random) {
    const usedTemplates = new Set();

    const rollDistinct = (kind, count) => {
        const out = [];
        for (let i = 0; i < count; i++) {
            let b = null;
            // Try a bounded number of times to get a fresh template id.
            for (let attempt = 0; attempt < 40; attempt++) {
                const candidate = rollBounty(rng, kind);
                if (!usedTemplates.has(candidate.templateId)) {
                    b = candidate;
                    break;
                }
                b = candidate; // keep the last as a fallback if pool is small
            }
            usedTemplates.add(b.templateId);
            out.push(b);
        }
        return out;
    };

    return {
        dailies: rollDistinct('daily', DAILY_COUNT),
        contracts: rollDistinct('contract', CONTRACT_COUNT),
        rolledAt: Date.now(),
    };
}

/**
 * recordEvent(board, event) → mutates the board in place, advancing every
 * matching in-progress bounty's `progress` toward its `target`. Bounties that
 * reach their target are flagged `completed`.
 *
 * Returns `{ board, completed }` where `completed` is the list of bounty ids
 * that newly transitioned to complete on THIS call.
 */
export function recordEvent(board, event) {
    const newlyCompleted = [];
    if (!event || !event.type) return { board, completed: newlyCompleted };

    const candidates = EVENT_MAP[event.type] || [];
    if (candidates.length === 0) return { board, completed: newlyCompleted };

    const amount = (typeof event.amount === 'number' && event.amount > 0) ? event.amount : 1;
    const eventTags = Array.isArray(event.tags) ? event.tags : [];

    for (const bounty of _all(board)) {
        // Already done (or claimed) bounties never advance again.
        if (bounty.completed || bounty.claimed) continue;

        const hit = candidates.some((c) => _matches(bounty, c, eventTags));
        if (!hit) continue;

        bounty.progress = Math.min(bounty.target, (bounty.progress || 0) + amount);
        if (bounty.progress >= bounty.target) {
            bounty.completed = true;
            newlyCompleted.push(bounty.id);
        }
    }

    return { board, completed: newlyCompleted };
}

/**
 * claim(board, bountyId) → if the bounty is complete AND unclaimed, marks it
 * claimed and returns its `reward`. Otherwise returns null (already claimed,
 * not complete, or unknown id).
 */
export function claim(board, bountyId) {
    const bounty = _all(board).find((b) => b.id === bountyId);
    if (!bounty) return null;
    const complete = bounty.completed || (bounty.progress || 0) >= bounty.target;
    if (!complete || bounty.claimed) return null;
    bounty.claimed = true;
    return bounty.reward;
}

/**
 * rerollBounty(board, bountyId, rng=Math.random) → replaces a single UNCLAIMED
 * bounty with a fresh roll of the SAME kind, in place. Avoids re-drawing a
 * templateId already present elsewhere on the board (bounded attempts). Returns
 * the new rolled bounty, or null if the id is unknown or already claimed.
 */
export function rerollBounty(board, bountyId, rng = Math.random) {
    const lists = [
        { arr: board.dailies || [], kind: 'daily' },
        { arr: board.contracts || [], kind: 'contract' },
    ];

    for (const { arr, kind } of lists) {
        const idx = arr.findIndex((b) => b.id === bountyId);
        if (idx === -1) continue;
        if (arr[idx].claimed) return null;

        // Templates currently occupied by OTHER slots, to avoid a duplicate.
        const used = new Set(
            _all(board)
                .filter((b) => b.id !== bountyId)
                .map((b) => b.templateId),
        );

        let fresh = null;
        for (let attempt = 0; attempt < 40; attempt++) {
            const candidate = rollBounty(rng, kind);
            fresh = candidate;
            if (!used.has(candidate.templateId)) break;
        }

        arr[idx] = fresh;
        return fresh;
    }

    return null; // unknown id
}

/**
 * activeBountyTags(board) → the de-duplicated set of qualifier tags drawn from
 * IN-PROGRESS bounties (not completed, not claimed). These feed the §4 draft's
 * bounty-relevance bias (T14): an option that matches one of these tags is the
 * "bounty-aware" pick.
 *
 * Tags surfaced: each bounty's filled element/weapon/reaction/rarity/template/
 * mode token, plus its progressType + category as coarse channels.
 */
export function activeBountyTags(board) {
    const tags = new Set();
    const TOKEN_KEYS = ['element', 'weapon', 'reaction', 'rarity', 'template', 'mode'];

    for (const bounty of _all(board)) {
        if (bounty.completed || bounty.claimed) continue;
        if (bounty.progressType) tags.add(bounty.progressType);
        if (bounty.category) tags.add(bounty.category);
        if (bounty.fills) {
            for (const key of TOKEN_KEYS) {
                const v = bounty.fills[key];
                if (typeof v === 'string' && v) tags.add(v);
            }
        }
    }

    return [...tags];
}
