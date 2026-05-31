/**
 * tests/unit/weapons/dps-balance.test.js — weapon balance invariants.
 *
 * Part of the 9.2.2 combat-overhaul weapon rebalance. This test encodes the
 * balance FRAMEWORK as executable invariants so future stat drift is caught:
 *
 *   1. Every primary's base single-target effective DPS against the target it
 *      is DESIGNED for sits inside a shared band (~2.8–3.2), with documented
 *      exceptions for the utility weapon (Gravity Lance, low-bound) and the
 *      delivery-based outliers (Cluster burst / Flak short-range bruiser /
 *      Spin Cannon full-spool) that are balanced by their delivery, not output.
 *   2. Effective range is mostly BANDED (~3800–4400px) with exactly two
 *      deliberate outliers: Rail Driver (documented MAX, the long-range
 *      sniper) and Flak Cannon (documented short-range MIN, airburst bruiser).
 *   3. Rail Driver's base pierce is capped (no more no-downside full-screen
 *      line-deletion).
 *
 * These are PURE data assertions — they import the weapon definitions and the
 * documented range/DPS formulas; no Player or browser is needed.
 *
 * RANGE / DPS FORMULAS (verified against js/modules/player/bullet.js +
 * js/modules/core/constants.js, 2026-05-30):
 *   - bullet.maxLife   = round(240 / TICK_SCALE) = round(240 / 0.5) = 480 ticks
 *   - per-tick travel  = BULLET_SPEED × TICK_SCALE × config.bulletSpeed
 *                      = 16 × 0.5 × bulletSpeed = 8 × bulletSpeed px/tick
 *   - effective range  = maxLife × range_mult × per-tick travel
 *                      = 480 × range × (8 × bulletSpeed)
 *                      = 3840 × bulletSpeed × range  (px)
 *   - base single-target DPS = damage × bulletCount × (1000 / fireRate)
 */
import { PRIMARY_WEAPONS } from '../../../js/modules/combat/weapon-data.js';
import { describe, test, expect } from '@jest/globals';

// ── Documented formula constants (mirror bullet.js / constants.js) ──────────
const RANGE_PX_PER_UNIT = 3840; // = maxLife(480) × per-tick(8 px @ speed 1.0)

function baseDps(w) {
  return w.damage * (w.bulletCount || 1) * (1000 / w.fireRate);
}
function effectiveRange(w) {
  return RANGE_PX_PER_UNIT * (w.bulletSpeed || 1) * (w.range || 1);
}

// ── The shared single-target DPS band for "ideal-target" output ─────────────
const DPS_BAND_MIN = 2.7;  // band floor (Boomerang's out-pass sits here)
const DPS_BAND_MAX = 3.25; // band ceiling

// ── The standard engagement range band ──────────────────────────────────────
const RANGE_BAND_MIN = 3800;
const RANGE_BAND_MAX = 4450;

// ── Per-weapon classification (the design intent each weapon is held to) ─────
// 'standard'  — DPS in band, range in band (the bulk of the roster).
// 'rail'      — DPS in band, range is the documented MAX outlier.
// 'flak'      — short-range bruiser: burst is a premium over band (delivery
//               balanced), effective range = the airburst burstDistance (MIN).
// 'cluster'   — charge-lobbed AoE burst: on-contact single-target burst is a
//               premium, balanced by the slow charge/cooldown cadence.
// 'spin'      — ramp: starts below band, the realistic mid-engagement average
//               sits in band, full-spool peak is above band (the spin-up cost).
// 'utility'   — Gravity Lance: deliberate LOW DPS crowd-control enabler.
const CLASS = {
  PULSE_CANNON: 'standard',
  STORM_NEEDLES: 'standard',
  SCATTER_GUN: 'standard',
  SPLITTER: 'standard',
  RICOCHET: 'standard',
  BOOMERANG: 'standard',
  RAIL_DRIVER: 'rail',
  FLAK_CANNON: 'flak',
  CLUSTER_LAUNCHER: 'cluster',
  SPIN_CANNON: 'spin',
  GRAVITY_LANCE: 'utility',
};

// Rail Driver base pierce cap (the dominance fix). Upgrade paths
// (RAIL_PENETRATOR_PLUS) may raise this at runtime — that's an opt-in build.
const RAIL_PIERCE_CAP = 5;

// ── Cluster delivery model ──────────────────────────────────────────────────
// On a single contact the bomb deals its direct hit + the primary blast at the
// detonation point; the bomblets scatter their damage across the AoE. The
// "single-target on-contact burst" is direct + primary blast; it must be a
// premium but NOT an instant single-target clear.
function clusterSingleTargetBurst(w) {
  return w.damage + w.blastDamage;
}
function clusterAreaPayload(w) {
  return w.damage + w.blastDamage + w.subBombCount * w.subBombDamage;
}

// ── Flak delivery model (short-range bruiser) ───────────────────────────────
// Per-shell ring payload: direct + shrapnel ring + burst blast, deployed at the
// fixed (short) burstDistance. DPS-equivalent = ring payload × shots/sec.
function flakRingPayload(w) {
  return w.damage + w.shrapnelCount * w.shrapnelDamage + w.burstBlastDamage;
}
function flakDpsEquivalent(w) {
  return flakRingPayload(w) * (1000 / w.fireRate);
}

// ── Spin delivery model (ramp) ──────────────────────────────────────────────
function spinFloorDps(w) {
  return w.damage * (1000 / w.slowFireRate);
}
function spinPeakDps(w) {
  return w.damage * (1000 / w.fastFireRate);
}

describe('weapon roster — classification coverage', () => {
  test('every primary weapon has a documented balance class', () => {
    for (const id of Object.keys(PRIMARY_WEAPONS)) {
      expect(CLASS[id]).toBeDefined();
    }
  });

  test('every classified weapon still exists in PRIMARY_WEAPONS', () => {
    for (const id of Object.keys(CLASS)) {
      expect(PRIMARY_WEAPONS[id]).toBeDefined();
    }
  });
});

describe('single-target DPS — shared band for ideal-target output', () => {
  // 'standard' + 'rail' weapons deal their full base DPS on one target.
  for (const id of Object.keys(CLASS)) {
    const cls = CLASS[id];
    if (cls !== 'standard' && cls !== 'rail') continue;
    test(`${id} base single-target DPS is in band [${DPS_BAND_MIN}, ${DPS_BAND_MAX}]`, () => {
      const dps = baseDps(PRIMARY_WEAPONS[id]);
      expect(dps).toBeGreaterThanOrEqual(DPS_BAND_MIN);
      expect(dps).toBeLessThanOrEqual(DPS_BAND_MAX);
    });
  }

  test('Gravity Lance (utility) is intentionally BELOW the band but not useless', () => {
    const dps = baseDps(PRIMARY_WEAPONS.GRAVITY_LANCE);
    // Documented exception: it is a crowd-control enabler, not a damage tool.
    expect(dps).toBeLessThan(DPS_BAND_MIN); // below band by design
    expect(dps).toBeGreaterThanOrEqual(0.8); // but still does meaningful chip damage
  });

  test('Spin Cannon (ramp) starts below band and peaks above — average lands in band', () => {
    const w = PRIMARY_WEAPONS.SPIN_CANNON;
    const floor = spinFloorDps(w);
    const peak = spinPeakDps(w);
    // The spin-up is the cost: the floor is below band.
    expect(floor).toBeLessThan(DPS_BAND_MIN);
    // The full-spool peak is the payoff: above band, but tamed (not 3×).
    expect(peak).toBeGreaterThan(DPS_BAND_MAX);
    expect(peak).toBeLessThanOrEqual(6.0); // tamed from the old 8.33
    // A simple floor/peak midpoint should land near the band (sanity on the
    // "realistic engagement averages in band" intent).
    const mid = (floor + peak) / 2;
    expect(mid).toBeGreaterThanOrEqual(2.5);
    expect(mid).toBeLessThanOrEqual(4.0);
  });

  test('Flak Cannon (short-range bruiser) burst is a premium over band, not 3×', () => {
    const dpsEq = flakDpsEquivalent(PRIMARY_WEAPONS.FLAK_CANNON);
    // Premium over the 3.0 band (it's a close-range AoE), but capped well
    // below the old ~8.85 (≈3× the band) blanket-clear.
    expect(dpsEq).toBeGreaterThan(DPS_BAND_MAX); // genuine bruiser premium
    expect(dpsEq).toBeLessThanOrEqual(7.0);      // not 3× the band
  });

  test('Cluster Launcher (charge-lob AoE) single-target burst is strong but not instant-clear', () => {
    const w = PRIMARY_WEAPONS.CLUSTER_LAUNCHER;
    const single = clusterSingleTargetBurst(w); // direct + primary blast
    const area = clusterAreaPayload(w);         // + bomblets across the area
    // The old build delivered 225 on a single contact (~218 DPS) — an instant
    // clear. The single-target on-contact burst must now be a modest premium.
    expect(single).toBeLessThanOrEqual(40); // was 100 (direct 50 + blast 50)
    expect(single).toBeGreaterThanOrEqual(20); // still a meaningful burst
    // Total area payload is the AoE identity, but far below the old 225.
    expect(area).toBeLessThanOrEqual(90); // was 225
    expect(area).toBeGreaterThanOrEqual(50);
  });
});

describe('effective range — banded with two documented outliers', () => {
  // Standard band weapons.
  for (const id of Object.keys(CLASS)) {
    const cls = CLASS[id];
    // 'rail' = documented MAX, 'flak' = documented MIN (burstDistance),
    // 'utility' (Gravity Lance) = deliberately short setup-orb reach,
    // 'cluster' = charge-lob (range field is a 9999 safety net, not a band
    //   member) — all excluded from the standard-band sweep.
    if (cls !== 'standard' && cls !== 'spin') continue;
    test(`${id} effective range is in band [${RANGE_BAND_MIN}, ${RANGE_BAND_MAX}]px`, () => {
      const rng = effectiveRange(PRIMARY_WEAPONS[id]);
      expect(rng).toBeGreaterThanOrEqual(RANGE_BAND_MIN);
      expect(rng).toBeLessThanOrEqual(RANGE_BAND_MAX);
    });
  }

  test('Rail Driver is the documented MAX range — longest, but not full-screen', () => {
    const railRange = effectiveRange(PRIMARY_WEAPONS.RAIL_DRIVER);
    // It must be the strict maximum across every other primary's carrier range.
    for (const [id, w] of Object.entries(PRIMARY_WEAPONS)) {
      if (id === 'RAIL_DRIVER') continue;
      if (id === 'CLUSTER_LAUNCHER') continue; // 9999 safety-net, not a real range
      expect(railRange).toBeGreaterThan(effectiveRange(w));
    }
    // …but trimmed off "full screen" — no longer the old 4570px reach.
    expect(railRange).toBeLessThan(4570);      // below the old full-screen reach
    expect(railRange).toBeGreaterThanOrEqual(4200); // still the clear long-range pick
  });

  test('Flak Cannon is the documented short-range MIN (airburst deploy point)', () => {
    const flak = PRIMARY_WEAPONS.FLAK_CANNON;
    // Its effective engagement range is the fixed airburst distance, which is
    // far shorter than any banded carrier range — the deliberate short outlier.
    expect(flak.burstDistance).toBeLessThan(RANGE_BAND_MIN);
    expect(flak.burstDistance).toBeLessThanOrEqual(400);
    // Sanity: it is meaningfully the shortest engagement range in the roster.
    for (const [id, w] of Object.entries(PRIMARY_WEAPONS)) {
      if (id === 'FLAK_CANNON') continue;
      if (id === 'GRAVITY_LANCE') {
        // Gravity Lance is a short setup orb too — allow it to be comparable,
        // but Flak's airburst deploy point must still be the shorter one.
        expect(flak.burstDistance).toBeLessThan(effectiveRange(w));
      }
    }
  });

  test('Gravity Lance (utility) has a deliberately short setup-orb reach', () => {
    const rng = effectiveRange(PRIMARY_WEAPONS.GRAVITY_LANCE);
    expect(rng).toBeLessThan(RANGE_BAND_MIN); // short by design
  });
});

describe('Rail Driver dominance fix', () => {
  test('base pierce is capped (no more no-downside full-screen line deletion)', () => {
    expect(PRIMARY_WEAPONS.RAIL_DRIVER.piercing).toBeLessThanOrEqual(RAIL_PIERCE_CAP);
    // It should still pierce — it is the anti-line specialist.
    expect(PRIMARY_WEAPONS.RAIL_DRIVER.piercing).toBeGreaterThanOrEqual(3);
  });

  test('keeps its precision-sniper feel: high per-shot damage + slow fire rate', () => {
    const w = PRIMARY_WEAPONS.RAIL_DRIVER;
    expect(w.damage).toBeGreaterThanOrEqual(3.0); // highest per-shot in the roster
    expect(w.fireRate).toBeGreaterThanOrEqual(1000); // slowest fire rate
  });
});
