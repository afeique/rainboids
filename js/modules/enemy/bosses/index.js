// BOSS-04 — Boss registry.
//
// The 10 modular boss descriptors (each a self-contained data + thin-driver
// module over the shipped boss chassis cores) collected into one place so the
// spawner + debug hook can look a boss up by id or by stage. The registry adds
// NO engine deps and never touches the chassis or the descriptors — it only
// re-exports them and maps stage → boss.
//
// Stage → boss mapping (matches each module's own `stage` field):
//   1 → Harbinger   2 → Aegis      3 → Lumen        4 → Gemini    5 → Maelstrom
//   6 → Hivemother  7 → Iron Throne 8 → Warden Prime 9 → Nullmaw   10 → Prismarch
//
// THE PRISMARCH (stage 10) carries `isFinalBoss: true`; BOSS-04 keys the
// run-complete transition off that flag when the boss core dies.

import HARBINGER from './harbinger.js';
import AEGIS from './aegis.js';
import LUMEN from './lumen.js';
import GEMINI from './gemini.js';
import MAELSTROM from './maelstrom.js';
import HIVEMOTHER from './hivemother.js';
import IRON_THRONE from './iron-throne.js';
import WARDEN_PRIME from './warden-prime.js';
import NULLMAW from './nullmaw.js';
import PRISMARCH from './prismarch.js';

// Ordered list of all 10 boss descriptors (stage 1 → 10).
export const BOSS_DESCRIPTORS = [
    HARBINGER,
    AEGIS,
    LUMEN,
    GEMINI,
    MAELSTROM,
    HIVEMOTHER,
    IRON_THRONE,
    WARDEN_PRIME,
    NULLMAW,
    PRISMARCH,
];

// id (e.g. 'HARBINGER', 'IRON_THRONE') → descriptor.
export const BOSS_BY_ID = BOSS_DESCRIPTORS.reduce((acc, d) => {
    acc[d.id] = d;
    return acc;
}, {});

// stage (1..10) → descriptor, built from each descriptor's own `stage`.
const BOSS_BY_STAGE = BOSS_DESCRIPTORS.reduce((acc, d) => {
    if (typeof d.stage === 'number') acc[d.stage] = d;
    return acc;
}, {});

/**
 * Boss descriptor for a given run STAGE (1-based), or null if the stage has no
 * boss. Stages beyond the table clamp to the final boss so a longer-than-10
 * run still gets a finale.
 */
export function getBossForStage(stage) {
    const s = stage | 0;
    if (s < 1) return null;
    if (BOSS_BY_STAGE[s]) return BOSS_BY_STAGE[s];
    // 9.0.0 (endless) — CYCLE the roster past the last defined stage (stage 11 →
    // boss 1, …, stage 20 → boss 10, stage 21 → boss 1, …) so an endless run
    // keeps rotating all ten bosses instead of repeating only the finale.
    const lastStage = BOSS_DESCRIPTORS.length;
    if (lastStage < 1) return null;
    const cycled = ((s - 1) % lastStage) + 1;
    return BOSS_BY_STAGE[cycled] || BOSS_BY_STAGE[lastStage] || null;
}

/** Boss descriptor by id ('HARBINGER', 'PRISMARCH', …), or null. */
export function getBossById(id) {
    return (id && BOSS_BY_ID[id]) || null;
}

export {
    HARBINGER, AEGIS, LUMEN, GEMINI, MAELSTROM,
    HIVEMOTHER, IRON_THRONE, WARDEN_PRIME, NULLMAW, PRISMARCH,
};
