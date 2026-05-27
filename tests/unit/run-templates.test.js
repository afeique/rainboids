/**
 * tests/unit/run-templates.test.js — unit tests for run-templates.js (T09).
 *
 * Validates the Looter-Economy Pivot run-template data (§4.3–4.4):
 * stage themes/modifiers, challenge presets, role profiles, elite affixes +
 * combos, boss patterns + phase frame, and the difficulty-budget / elite-affix
 * depth curves. Pure-data integrity + lookup-fn contracts.
 */

import {
  STAGE_THEMES,
  STAGE_MODIFIERS,
  CHALLENGE_PRESETS,
  ROLE_PROFILES,
  ELITE_AFFIXES,
  ELITE_COMBOS,
  BOSS_PATTERNS,
  BOSS_PHASE_FRAME,
  BOSS_ELITE_AFFIX_RANGE,
  difficultyBudget,
  eliteAffixCountForDepth,
  DIFFICULTY_BUDGET_BASE,
} from '../../js/modules/wave/run-templates.js';

// ---------------------------------------------------------------------------
// Collections non-empty + well-formed
// ---------------------------------------------------------------------------

describe('collections are non-empty', () => {
  test('every exported collection has entries', () => {
    expect(STAGE_THEMES.length).toBeGreaterThan(0);
    expect(STAGE_MODIFIERS.length).toBeGreaterThan(0);
    expect(CHALLENGE_PRESETS.length).toBeGreaterThan(0);
    expect(Object.keys(ROLE_PROFILES).length).toBeGreaterThan(0);
    expect(ELITE_AFFIXES.length).toBeGreaterThan(0);
    expect(ELITE_COMBOS.length).toBeGreaterThan(0);
    expect(BOSS_PATTERNS.length).toBeGreaterThan(0);
    expect(BOSS_PHASE_FRAME.length).toBeGreaterThan(0);
  });
});

// ---------------------------------------------------------------------------
// STAGE_THEMES
// ---------------------------------------------------------------------------

describe('STAGE_THEMES', () => {
  test('each theme has a unique id, name, and element', () => {
    const ids = new Set();
    for (const t of STAGE_THEMES) {
      expect(typeof t.id).toBe('string');
      expect(typeof t.name).toBe('string');
      expect(typeof t.element).toBe('string');
      expect(ids.has(t.id)).toBe(false);
      ids.add(t.id);
    }
  });

  test('includes the §4.3 named themes', () => {
    const names = new Set(STAGE_THEMES.map((t) => t.name));
    for (const n of ['Wildfire', 'Deep Freeze', 'Overload', 'Outbreak',
      'Hall of Mirrors', 'Iron Wall', 'Crossfire', 'First Contact',
      'Apocalypse', 'The Void']) {
      expect(names.has(n)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// STAGE_MODIFIERS
// ---------------------------------------------------------------------------

describe('STAGE_MODIFIERS', () => {
  test('each modifier has id/name/desc + numeric threatWeight + rewardMult', () => {
    const ids = new Set();
    for (const m of STAGE_MODIFIERS) {
      expect(typeof m.id).toBe('string');
      expect(typeof m.name).toBe('string');
      expect(typeof m.desc).toBe('string');
      expect(typeof m.threatWeight).toBe('number');
      expect(m.threatWeight).toBeGreaterThan(0);
      expect(typeof m.rewardMult).toBe('number');
      expect(m.rewardMult).toBeGreaterThan(0);
      expect(ids.has(m.id)).toBe(false);
      ids.add(m.id);
    }
  });

  test('includes the §4.3 named modifiers', () => {
    const names = new Set(STAGE_MODIFIERS.map((m) => m.name));
    for (const n of ['Swarm', 'Juggernaut', 'Elite Pack', 'Glass',
      'Meteor Storm', 'Fog', 'Elemental Surge', 'Toxic Atmosphere',
      'Low Gravity', 'Sudden Death', 'Treasure', 'Conduit Field', 'Mirror']) {
      expect(names.has(n)).toBe(true);
    }
  });

  test('Treasure spends LESS budget than the punishing modifiers', () => {
    const byId = Object.fromEntries(STAGE_MODIFIERS.map((m) => [m.id, m]));
    expect(byId.TREASURE.threatWeight).toBeLessThan(byId.SUDDEN_DEATH.threatWeight);
    expect(byId.TREASURE.rewardMult).toBeGreaterThan(byId.SWARM.rewardMult);
  });
});

// ---------------------------------------------------------------------------
// CHALLENGE_PRESETS
// ---------------------------------------------------------------------------

describe('CHALLENGE_PRESETS', () => {
  const modIds = new Set(STAGE_MODIFIERS.map((m) => m.id));
  const themeIds = new Set(STAGE_THEMES.map((t) => t.id));

  test('shape: id/name/modifiers[]/rewardMult/desc, optional theme', () => {
    for (const p of CHALLENGE_PRESETS) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(Array.isArray(p.modifiers)).toBe(true);
      expect(p.modifiers.length).toBeGreaterThan(0);
      expect(typeof p.rewardMult).toBe('number');
      expect(p.rewardMult).toBeGreaterThan(0);
      expect(typeof p.desc).toBe('string');
    }
  });

  test('referenced modifier ids exist in STAGE_MODIFIERS', () => {
    for (const p of CHALLENGE_PRESETS) {
      for (const mid of p.modifiers) expect(modIds.has(mid)).toBe(true);
    }
  });

  test('referenced theme ids (when present) exist in STAGE_THEMES', () => {
    for (const p of CHALLENGE_PRESETS) {
      if (p.theme != null) expect(themeIds.has(p.theme)).toBe(true);
    }
  });

  test('includes the §4.3 named presets', () => {
    const names = new Set(CHALLENGE_PRESETS.map((p) => p.name));
    for (const n of ['The Gauntlet', 'Glass Storm', 'The Hunt', 'Blackout',
      'Conduit Nightmare', 'Elemental Trial', 'Last Breath',
      'Swarm Apocalypse', 'Mirror Match', 'Treasure Vault']) {
      expect(names.has(n)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// ROLE_PROFILES
// ---------------------------------------------------------------------------

describe('ROLE_PROFILES', () => {
  const EXPECTED_ROLES = ['SWARMER', 'SKIRMISHER', 'SNIPER', 'TANK', 'BOMBER',
    'SUPPORT', 'DISRUPTOR', 'TRICKSTER', 'BRUISER', 'SPLITTER'];

  test('has all 10 roles', () => {
    for (const r of EXPECTED_ROLES) expect(ROLE_PROFILES[r]).toBeDefined();
    expect(Object.keys(ROLE_PROFILES).length).toBe(10);
  });

  test('each role has numeric hp/speed/damage/countBias multipliers', () => {
    for (const r of EXPECTED_ROLES) {
      const p = ROLE_PROFILES[r];
      for (const k of ['hp', 'speed', 'damage', 'countBias']) {
        expect(typeof p[k]).toBe('number');
        expect(Number.isFinite(p[k])).toBe(true);
        expect(p[k]).toBeGreaterThan(0);
      }
    }
  });

  test('matches the §4.4 table for sample roles', () => {
    expect(ROLE_PROFILES.SWARMER.hp).toBeCloseTo(0.5);
    expect(ROLE_PROFILES.SWARMER.speed).toBeCloseTo(1.3);
    expect(ROLE_PROFILES.TANK.hp).toBeCloseTo(2.5);
    expect(ROLE_PROFILES.SNIPER.damage).toBeCloseTo(1.6);
    expect(ROLE_PROFILES.BRUISER.damage).toBeCloseTo(1.5);
  });
});

// ---------------------------------------------------------------------------
// ELITE_AFFIXES + ELITE_COMBOS
// ---------------------------------------------------------------------------

describe('ELITE_AFFIXES', () => {
  test('each affix has a unique id/name/desc', () => {
    const ids = new Set();
    for (const a of ELITE_AFFIXES) {
      expect(typeof a.id).toBe('string');
      expect(typeof a.name).toBe('string');
      expect(typeof a.desc).toBe('string');
      expect(ids.has(a.id)).toBe(false);
      ids.add(a.id);
    }
  });
});

describe('ELITE_COMBOS', () => {
  const affixIds = new Set(ELITE_AFFIXES.map((a) => a.id));

  test('shape: id/name/affixes[]/desc', () => {
    for (const c of ELITE_COMBOS) {
      expect(typeof c.id).toBe('string');
      expect(typeof c.name).toBe('string');
      expect(Array.isArray(c.affixes)).toBe(true);
      expect(c.affixes.length).toBeGreaterThan(0);
      expect(typeof c.desc).toBe('string');
    }
  });

  test('every referenced affix id is present in ELITE_AFFIXES', () => {
    for (const c of ELITE_COMBOS) {
      for (const aid of c.affixes) expect(affixIds.has(aid)).toBe(true);
    }
  });

  test('includes the §4.4 named combos', () => {
    const names = new Set(ELITE_COMBOS.map((c) => c.name));
    for (const n of ['Warden', 'Reaver', 'Sapper', 'Hexweaver',
      'Bulwark Lord', 'Phase Reaper', 'Conduit Tyrant']) {
      expect(names.has(n)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// BOSS_PATTERNS + BOSS_PHASE_FRAME
// ---------------------------------------------------------------------------

describe('BOSS_PATTERNS', () => {
  test('each pattern has a unique id/name/desc', () => {
    const ids = new Set();
    for (const p of BOSS_PATTERNS) {
      expect(typeof p.id).toBe('string');
      expect(typeof p.name).toBe('string');
      expect(typeof p.desc).toBe('string');
      expect(ids.has(p.id)).toBe(false);
      ids.add(p.id);
    }
  });
});

describe('BOSS_PHASE_FRAME', () => {
  test('three phases P1 100-66 / P2 66-33 / P3 33-0, P3 is enrage', () => {
    expect(BOSS_PHASE_FRAME.length).toBe(3);
    const [p1, p2, p3] = BOSS_PHASE_FRAME;
    expect(p1.hpFrom).toBeCloseTo(1.0);
    expect(p1.hpTo).toBeCloseTo(0.66);
    expect(p2.hpFrom).toBeCloseTo(0.66);
    expect(p2.hpTo).toBeCloseTo(0.33);
    expect(p3.hpFrom).toBeCloseTo(0.33);
    expect(p3.hpTo).toBeCloseTo(0.0);
    expect(p3.enrage).toBe(true);
    expect(p1.enrage).toBe(false);
  });

  test('phases descend monotonically in HP', () => {
    for (let i = 1; i < BOSS_PHASE_FRAME.length; i++) {
      expect(BOSS_PHASE_FRAME[i].hpFrom).toBeLessThanOrEqual(BOSS_PHASE_FRAME[i - 1].hpFrom);
      expect(BOSS_PHASE_FRAME[i].hpTo).toBeLessThan(BOSS_PHASE_FRAME[i - 1].hpTo);
    }
  });

  test('boss elite affix range is 1..2', () => {
    expect(BOSS_ELITE_AFFIX_RANGE.min).toBe(1);
    expect(BOSS_ELITE_AFFIX_RANGE.max).toBe(2);
  });
});

// ---------------------------------------------------------------------------
// difficultyBudget()
// ---------------------------------------------------------------------------

describe('difficultyBudget()', () => {
  test('strictly increases with depth', () => {
    let prev = -Infinity;
    for (let d = 1; d <= 40; d++) {
      const b = difficultyBudget(d);
      expect(b).toBeGreaterThan(prev);
      prev = b;
    }
  });

  test('anchored at the base for depth 1; clamps depth below 1', () => {
    expect(difficultyBudget(1)).toBe(DIFFICULTY_BUDGET_BASE);
    expect(difficultyBudget(0)).toBe(difficultyBudget(1));
    expect(difficultyBudget(-5)).toBe(difficultyBudget(1));
  });

  test('returns finite integers', () => {
    for (const d of [1, 2, 5, 10, 25]) {
      const b = difficultyBudget(d);
      expect(Number.isInteger(b)).toBe(true);
      expect(Number.isFinite(b)).toBe(true);
    }
  });
});

// ---------------------------------------------------------------------------
// eliteAffixCountForDepth()
// ---------------------------------------------------------------------------

describe('eliteAffixCountForDepth()', () => {
  test('returns 1 early, 2 mid, 3 late', () => {
    expect(eliteAffixCountForDepth(1)).toBe(1);
    expect(eliteAffixCountForDepth(3)).toBe(1);
    expect(eliteAffixCountForDepth(5)).toBe(2);
    expect(eliteAffixCountForDepth(10)).toBe(3);
  });

  test('always within 1..3 and non-decreasing with depth', () => {
    let prev = 0;
    for (let d = 1; d <= 30; d++) {
      const n = eliteAffixCountForDepth(d);
      expect(n).toBeGreaterThanOrEqual(1);
      expect(n).toBeLessThanOrEqual(3);
      expect(n).toBeGreaterThanOrEqual(prev);
      prev = n;
    }
  });
});
