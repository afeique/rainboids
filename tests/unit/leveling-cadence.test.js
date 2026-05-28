// 8.12.0 — leveling cadence: the player should level up roughly once every
// 2–3 waves. Each wave clear grants WAVE_CLEAR_LEVEL_FRAC × xpForLevel(level)
// (wave-manager), so the cadence self-scales and holds at every level. This
// pins that wave-clear XP alone lands a level in 2–3 clears across the curve.

import { describe, expect, test } from '@jest/globals';
import { addXp } from '../../js/modules/player/progression.js';
import { xpForLevel } from '../../js/modules/core/sp-stats.js';

// Must match wave-manager's WAVE_CLEAR_LEVEL_FRAC.
const WAVE_CLEAR_LEVEL_FRAC = 0.35;

// Count wave clears (wave-clear XP only, no kill bonus) to go up one level
// starting from `startLevel`, carrying XP rollover like the live player does.
function wavesPerLevelFrom(startLevel) {
    const p = { level: startLevel, xp: 0, sp: 0, saveMetaState() {} };
    const target = startLevel + 1;
    let waves = 0;
    while (p.level < target && waves < 50) {
        addXp.call(p, Math.round(xpForLevel(p.level) * WAVE_CLEAR_LEVEL_FRAC));
        waves++;
    }
    return waves;
}

describe('leveling cadence (~1 level / 2–3 waves)', () => {
    test('wave-clear XP alone lands a level in 2–3 clears at every level', () => {
        for (const lvl of [1, 5, 10, 25, 50, 90]) {
            const w = wavesPerLevelFrom(lvl);
            expect(w).toBeGreaterThanOrEqual(2);
            expect(w).toBeLessThanOrEqual(3);
        }
    });

    test('a 10-wave run yields a few levels; a long run yields many (gates the unlock pacing)', () => {
        const levelsAfter = (waves) => {
            const p = { level: 1, xp: 0, sp: 0, saveMetaState() {} };
            for (let i = 0; i < waves; i++) addXp.call(p, Math.round(xpForLevel(p.level) * WAVE_CLEAR_LEVEL_FRAC));
            return p.level;
        };
        const short = levelsAfter(10);   // ~10/2.8 ≈ 3-4 levels
        const long = levelsAfter(60);    // ~60/2.8 ≈ 20+ levels
        expect(short).toBeGreaterThanOrEqual(3);
        expect(short).toBeLessThanOrEqual(6);
        expect(long).toBeGreaterThan(short + 10);
    });
});
