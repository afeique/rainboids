/**
 * @jest-environment jsdom
 */
// T61 — one-time account migration (game-engine._migrateBankedProgression):
// banked account level (T24) + banked Cores (T23 deferral) fold into the
// Rainshard wallet once, the retired meta keys are cleared, and `levelMigrated`
// makes it inert thereafter. Old {type,value} gear is left dormant (not broken).

import { describe, expect, test, beforeEach } from '@jest/globals';
import { GameEngine } from '../../js/modules/game-engine.js';
import { loadMeta, saveMeta } from '../../js/modules/core/storage.js';

beforeEach(() => { localStorage.clear(); });

describe('T61 — banked level + cores → Rainshards', () => {
    test('folds level (×1500/lvl over L1) + cores (1:1) into accountGold, clears keys', () => {
        saveMeta({ accountGold: 1000, level: 11, xp: 200, sp: 5, spStats: { HEALTH: 3 }, cores: 500 });
        const eng = Object.create(GameEngine.prototype);
        const out = eng._migrateBankedProgression(loadMeta());
        // (11-1)*1500 = 15000 + 500 cores + 1000 base = 16500
        expect(out.accountGold).toBe(16500);
        expect(out.levelMigrated).toBe(true);
        expect(out.level).toBeUndefined();
        expect(out.xp).toBeUndefined();
        expect(out.sp).toBeUndefined();
        expect(out.spStats).toBeUndefined();
        expect(out.cores).toBeUndefined();
    });

    test('idempotent — re-running does not double-grant', () => {
        saveMeta({ accountGold: 0, level: 6, cores: 100 });
        const eng = Object.create(GameEngine.prototype);
        const first = eng._migrateBankedProgression(loadMeta());
        const expected = (6 - 1) * 1500 + 100;
        expect(first.accountGold).toBe(expected);
        const again = eng._migrateBankedProgression(loadMeta());
        expect(again.accountGold).toBe(expected); // unchanged
    });

    test('fresh account (no level/cores) → 0 grant but stamped migrated', () => {
        saveMeta({ accountGold: 0 });
        const eng = Object.create(GameEngine.prototype);
        const out = eng._migrateBankedProgression(loadMeta());
        expect(out.accountGold).toBe(0);
        expect(out.levelMigrated).toBe(true);
    });

    test('null meta → null (nothing to migrate)', () => {
        const eng = Object.create(GameEngine.prototype);
        expect(eng._migrateBankedProgression(null)).toBeNull();
    });

    test('cores-only account (no level) still folds cores', () => {
        saveMeta({ accountGold: 250, cores: 750 });
        const eng = Object.create(GameEngine.prototype);
        const out = eng._migrateBankedProgression(loadMeta());
        expect(out.accountGold).toBe(1000); // 250 + 750
        expect(out.cores).toBeUndefined();
    });
});
