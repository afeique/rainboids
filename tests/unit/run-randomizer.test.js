/**
 * tests/unit/run-randomizer.test.js — unit tests for run-randomizer.js (T14).
 *
 * Validates the Looter-Economy Pivot run randomizer / draft builder (§4.2):
 *   • nextDraft returns 2–3 well-formed stage options.
 *   • threats are positive integers on the PWR scale and rise with depth.
 *   • no two PUNISHING modifiers ever stack in one option.
 *   • reward roughly scales with threat (the risk/reward spread).
 *   • no modifier duplicates runState.lastModifier.
 *   • bountyRelevant tags at most one matching option.
 *   • deterministic given a fixed (seeded) rng.
 *   • applyPick normalizes an option into a stage spec.
 */

import {
  nextDraft,
  applyPick,
  PUNISHING_MODIFIERS,
} from '../../js/modules/wave/run-randomizer.js';
import { difficultyBudget } from '../../js/modules/wave/run-templates.js';

// ---------------------------------------------------------------------------
// Deterministic seeded rng (mulberry32) — same seed ⇒ same stream.
// ---------------------------------------------------------------------------
function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// A simple incrementing stub rng (also deterministic; exercises edge picks).
function cyclingRng(values) {
  let i = 0;
  return () => values[i++ % values.length];
}

const SEEDS = [1, 2, 7, 42, 99, 123, 777, 2026, 31337, 654321];

// ---------------------------------------------------------------------------
// Shape + count
// ---------------------------------------------------------------------------

describe('nextDraft — option count & shape', () => {
  test('returns 2–3 options across many seeds and depths', () => {
    for (const seed of SEEDS) {
      for (let depth = 1; depth <= 20; depth++) {
        const opts = nextDraft(depth, {}, mulberry32(seed + depth));
        expect(opts.length).toBeGreaterThanOrEqual(2);
        expect(opts.length).toBeLessThanOrEqual(3);
      }
    }
  });

  test('each option has the documented shape', () => {
    const opts = nextDraft(5, {}, mulberry32(42));
    for (const o of opts) {
      expect(o.theme).toBeDefined();
      expect(typeof o.theme.id).toBe('string');
      expect(Array.isArray(o.modifiers)).toBe(true);
      expect(typeof o.threat).toBe('number');
      expect(o.reward).toBeDefined();
      expect(typeof o.reward.rainshardMult).toBe('number');
      expect(typeof o.reward.dropBias).toBe('number');
      expect(Array.isArray(o.elites)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// Threat: positive + monotonic with depth
// ---------------------------------------------------------------------------

describe('nextDraft — threat is positive & scales with depth', () => {
  test('every option threat is a positive integer', () => {
    for (const seed of SEEDS) {
      for (let depth = 1; depth <= 15; depth++) {
        const opts = nextDraft(depth, {}, mulberry32(seed * 13 + depth));
        for (const o of opts) {
          expect(Number.isInteger(o.threat)).toBe(true);
          expect(o.threat).toBeGreaterThan(0);
        }
      }
    }
  });

  test('average threat rises with depth (matches the budget curve)', () => {
    const avgThreatAtDepth = (depth) => {
      let sum = 0;
      let n = 0;
      for (const seed of SEEDS) {
        const opts = nextDraft(depth, {}, mulberry32(seed + depth * 1000));
        for (const o of opts) {
          sum += o.threat;
          n += 1;
        }
      }
      return sum / n;
    };
    const a1 = avgThreatAtDepth(1);
    const a5 = avgThreatAtDepth(5);
    const a10 = avgThreatAtDepth(10);
    const a20 = avgThreatAtDepth(20);
    expect(a5).toBeGreaterThan(a1);
    expect(a10).toBeGreaterThan(a5);
    expect(a20).toBeGreaterThan(a10);
    // The unmodified floor equals the budget; the average sits above it.
    expect(a1).toBeGreaterThanOrEqual(difficultyBudget(1) * 0.7);
  });

  test('a clean (no-modifier) stage sits exactly at the depth budget', () => {
    // Force rollModifiers("safe") down its "clean stage" branch: first rng()
    // call in nextDraft is the optionCount gate, but at depth 1 it short-
    // circuits to 2 cards without consuming an extra roll for count<3.
    // Use cyclingRng tuned so card 1 returns no modifiers.
    const opts = nextDraft(3, {}, cyclingRng([0.0]));
    const cleanFloor = difficultyBudget(3);
    // At least one option should land at/near the unmodified floor.
    const hasFloor = opts.some((o) => o.modifiers.length === 0 && o.threat === cleanFloor);
    expect(hasFloor).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §4.2 rule 4 — no two punishing modifiers stacked
// ---------------------------------------------------------------------------

describe('nextDraft — modifier-compat rules', () => {
  test('no option ever stacks two punishing modifiers', () => {
    for (const seed of SEEDS) {
      for (let depth = 1; depth <= 25; depth++) {
        const opts = nextDraft(depth, {}, mulberry32(seed * 7 + depth * 3));
        for (const o of opts) {
          const punishing = o.modifiers.filter((m) => PUNISHING_MODIFIERS.has(m.id));
          expect(punishing.length).toBeLessThanOrEqual(1);
        }
      }
    }
  });

  test('no modifier in any option duplicates runState.lastModifier', () => {
    for (const seed of SEEDS) {
      const last = 'SUDDEN_DEATH';
      const opts = nextDraft(8, { lastModifier: last }, mulberry32(seed));
      for (const o of opts) {
        for (const m of o.modifiers) {
          expect(m.id).not.toBe(last);
        }
      }
    }
  });

  test('a single punishing modifier on its own is allowed', () => {
    // Statistical: across enough seeds some option should carry exactly one
    // punishing modifier (proves we don't ban them outright).
    let sawSinglePunishing = false;
    for (const seed of SEEDS) {
      for (let depth = 3; depth <= 12; depth++) {
        const opts = nextDraft(depth, {}, mulberry32(seed * 17 + depth));
        for (const o of opts) {
          const punishing = o.modifiers.filter((m) => PUNISHING_MODIFIERS.has(m.id));
          if (punishing.length === 1) sawSinglePunishing = true;
        }
      }
    }
    expect(sawSinglePunishing).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// §4.2 rules 2 & 3 — risk/reward spread; reward scales with threat
// ---------------------------------------------------------------------------

describe('nextDraft — risk/reward spread', () => {
  test('options are returned ordered safe → risky by threat', () => {
    for (const seed of SEEDS) {
      const opts = nextDraft(10, {}, mulberry32(seed + 5));
      for (let i = 1; i < opts.length; i++) {
        expect(opts[i].threat).toBeGreaterThanOrEqual(opts[i - 1].threat);
      }
    }
  });

  test('reward roughly scales with threat (higher-threat picks pay more on avg)', () => {
    // Compare the safest vs. the riskiest card's reward across seeds; the
    // riskier card should, on average, pay a higher rainshard multiplier.
    let safeRewardSum = 0;
    let riskyRewardSum = 0;
    let n = 0;
    for (const seed of SEEDS) {
      for (let depth = 2; depth <= 12; depth++) {
        const opts = nextDraft(depth, {}, mulberry32(seed * 31 + depth));
        const safe = opts[0];
        const risky = opts[opts.length - 1];
        safeRewardSum += safe.reward.rainshardMult;
        riskyRewardSum += risky.reward.rainshardMult;
        n += 1;
        // dropBias never below the rainshard floor of 1.
        for (const o of opts) {
          expect(o.reward.rainshardMult).toBeGreaterThanOrEqual(1);
          expect(o.reward.dropBias).toBeGreaterThanOrEqual(1);
        }
      }
    }
    expect(riskyRewardSum / n).toBeGreaterThan(safeRewardSum / n);
  });

  test('reward.dropBias is clamped to the income find-mult ceiling', () => {
    for (const seed of SEEDS) {
      const opts = nextDraft(15, {}, mulberry32(seed));
      for (const o of opts) {
        expect(o.reward.dropBias).toBeLessThanOrEqual(3);
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Elites — count tracks the depth budget
// ---------------------------------------------------------------------------

describe('nextDraft — elites', () => {
  test('elite entries are well-formed and depth-scaled', () => {
    const earlyMax = (() => {
      let m = 0;
      for (const seed of SEEDS) {
        const opts = nextDraft(1, {}, mulberry32(seed));
        for (const o of opts) m = Math.max(m, o.elites.length);
      }
      return m;
    })();
    const lateMax = (() => {
      let m = 0;
      for (const seed of SEEDS) {
        const opts = nextDraft(12, {}, mulberry32(seed));
        for (const o of opts) m = Math.max(m, o.elites.length);
      }
      return m;
    })();
    // Late stages can carry more elite affixes than early ones.
    expect(lateMax).toBeGreaterThanOrEqual(earlyMax);
    // Each elite entry has an id (affix or named combo).
    for (const seed of SEEDS) {
      const opts = nextDraft(10, {}, mulberry32(seed));
      for (const o of opts) {
        for (const e of o.elites) expect(typeof e.id).toBe('string');
      }
    }
  });
});

// ---------------------------------------------------------------------------
// Bounty relevance
// ---------------------------------------------------------------------------

describe('nextDraft — bountyRelevant', () => {
  test('tags at most one option, and only when a tag matches', () => {
    // Use a guaranteed-present element tag so a match is plausible.
    for (const seed of SEEDS) {
      const opts = nextDraft(6, { activeBountyTags: ['PYRO', 'SWARM', 'SUMMONER'] }, mulberry32(seed));
      const tagged = opts.filter((o) => o.bountyRelevant === true);
      expect(tagged.length).toBeLessThanOrEqual(1);
    }
  });

  test('no option is tagged when there are no active bounty tags', () => {
    const opts = nextDraft(6, {}, mulberry32(42));
    expect(opts.every((o) => !o.bountyRelevant)).toBe(true);
  });

  test('a matching theme element gets tagged', () => {
    // Sweep seeds until a PYRO-themed option appears, then assert it is tagged.
    let found = false;
    for (const seed of SEEDS) {
      const opts = nextDraft(6, { activeBountyTags: ['PYRO'] }, mulberry32(seed));
      const pyro = opts.find((o) => o.theme.element === 'PYRO');
      if (pyro) {
        // Some option matching PYRO must be tagged (the first match found).
        const anyTagged = opts.some((o) => o.bountyRelevant);
        expect(anyTagged).toBe(true);
        found = true;
        break;
      }
    }
    expect(found).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// Determinism
// ---------------------------------------------------------------------------

describe('nextDraft — deterministic given a fixed rng', () => {
  test('same seed ⇒ identical draft', () => {
    const a = nextDraft(7, { lastModifier: 'GLASS' }, mulberry32(12345));
    const b = nextDraft(7, { lastModifier: 'GLASS' }, mulberry32(12345));
    expect(JSON.stringify(a)).toBe(JSON.stringify(b));
  });

  test('different seeds generally differ', () => {
    const a = nextDraft(7, {}, mulberry32(1));
    const b = nextDraft(7, {}, mulberry32(2));
    // Not a hard guarantee, but these two seeds must diverge.
    expect(JSON.stringify(a)).not.toBe(JSON.stringify(b));
  });
});

// ---------------------------------------------------------------------------
// applyPick — normalization
// ---------------------------------------------------------------------------

describe('applyPick — normalizes a chosen option into a stage spec', () => {
  test('produces the documented stage-spec shape', () => {
    const opts = nextDraft(9, {}, mulberry32(2026));
    const spec = applyPick(opts[opts.length - 1]);
    expect(typeof spec.themeId).toBe('string');
    expect(Array.isArray(spec.modifierIds)).toBe(true);
    expect(typeof spec.threat).toBe('number');
    expect(spec.reward).toBeDefined();
    expect(typeof spec.reward.rainshardMult).toBe('number');
    expect(typeof spec.reward.dropBias).toBe('number');
    expect(Array.isArray(spec.eliteIds)).toBe(true);
    expect(typeof spec.compositionSeed).toBe('string');
    expect(spec.compositionSeed.length).toBeGreaterThan(0);
    expect(typeof spec.bountyRelevant).toBe('boolean');
  });

  test('compositionSeed is deterministic for the same option', () => {
    const opts = nextDraft(9, {}, mulberry32(2026));
    const a = applyPick(opts[0]);
    const b = applyPick(opts[0]);
    expect(a.compositionSeed).toBe(b.compositionSeed);
  });

  test('threat & reward survive the round-trip unchanged', () => {
    const opts = nextDraft(11, {}, mulberry32(99));
    const o = opts[opts.length - 1];
    const spec = applyPick(o);
    expect(spec.threat).toBe(o.threat);
    expect(spec.reward.rainshardMult).toBe(o.reward.rainshardMult);
    expect(spec.reward.dropBias).toBe(o.reward.dropBias);
  });

  test('throws on an invalid option', () => {
    expect(() => applyPick(null)).toThrow();
    expect(() => applyPick({})).toThrow();
  });
});
