// build-math.analysis.mjs — ANALYSIS A: DPS / Power / Defense across archetypes.
//
// ANALYSIS ONLY (not a test — excluded from `npm run test:unit`, which matches
// only tests/unit/**/*.test.js). Prints rich tables; asserts nothing.
//
//   node tests/stress/build-math.analysis.mjs
//
// Computes, per build archetype: effective DPS, EHP+sustain, PWR (§14.1
// geometric blend, K_PWR calibrated so Starter≈100), and TTK/TTD on reference
// enemies. Surfaces the build-power SPREAD (the doc claims ~20× TTK).

import {
    ARCHETYPES, BASE, STD_PRIMARY_DPS,
    offense, effectiveDPS, survivability, ehp, maxHealth, sustainPerSec,
    utility, calibrateKpwr, pwr, ttk, ttd,
    refEnemies, incomingDPS, waveHpMult, primaryBaseDPS,
} from './build-model.mjs';
import { PRIMARY_WEAPONS } from '../../js/modules/combat/weapon-data.js';

const f = (n, d = 1) => Number(n).toFixed(d);
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);

function rule(ch = '─', w = 110) { console.log(ch.repeat(w)); }
function h(title) { console.log('\n' + '═'.repeat(110) + '\n' + title + '\n' + '═'.repeat(110)); }

// ── Calibrate K_PWR so the Starter build ≈ 100 (§14.1) ──────────────────────
const starter = ARCHETYPES.find((a) => a.key === 'starter');
const K_PWR = calibrateKpwr(starter, 100);

h('ANALYSIS A — BUILD MATH (DPS / Power / Defense / PWR / TTK / TTD)');
console.log(`\nCalibration & reference constants:`);
console.log(`  K_PWR              = ${f(K_PWR, 4)}   (set so Starter PWR ≈ 100; §14.1)`);
console.log(`  PWR_REF            = 100              (= Starter PWR; pre-load reference, §14.2)`);
console.log(`  STD_PRIMARY_DPS    = ${f(STD_PRIMARY_DPS, 2)}             (Pulse Cannon base 1.2·2.5·1; Balance §1 "≈3.0")`);
console.log(`  Base HP / cap      = ${BASE.HP} / ${BASE.HP_CAP}`);
console.log(`  Base crit          = ${BASE.CRIT_CHANCE * 100}% @ ×${BASE.CRIT_MULT}`);
console.log(`  SUSTAIN_WINDOW     = 4s   (§14.6)`);
console.log(`  Reference wave     = 20  (Prowler elite = base 14 × ×7.5 ≈ ${f(refEnemies(20).elite, 0)} HP; Balance §3)`);

// Sanity: print the 5 primary base DPS values so "≈3.0" is auditable.
console.log(`\nPrimary base DPS (imported from weapon-data.js — Balance §1 "Standard ≈3.0"):`);
for (const id of ['PULSE_CANNON', 'STORM_NEEDLES', 'SCATTER_GUN', 'RAIL_DRIVER']) {
    const w = PRIMARY_WEAPONS[id];
    console.log(`  ${pad(id, 15)} dmg ${f(w.damage, 2)} × ${f(1000 / w.fireRate, 2)} sps × ${w.bulletCount} = ${f(primaryBaseDPS(id), 2)} DPS`);
}

// ── Table A1: offense / defense / PWR ───────────────────────────────────────
h('A1 — Offense, Defense & PWR per archetype');
rule();
console.log([
    pad('Build', 22), padL('DPS', 8), padL('off()', 9), padL('maxHP', 7),
    padL('EHP', 9), padL('sus/s', 7), padL('util', 6), padL('PWR', 7), padL('PWR/REF', 8),
].join(' '));
rule();
const rows = ARCHETYPES.map((b) => {
    const p = pwr(b, K_PWR);
    return {
        b, dps: effectiveDPS(b), off: offense(b), hp: maxHealth(b),
        e: ehp(b), sus: sustainPerSec(b), u: utility(b), p,
    };
});
for (const r of rows) {
    console.log([
        pad(r.b.name, 22), padL(f(r.dps, 1), 8), padL(f(r.off, 1), 9), padL(f(r.hp, 0), 7),
        padL(f(r.e, 0), 9), padL(f(r.sus, 2), 7), padL(f(r.u, 0), 6),
        padL(r.p, 7), padL(f(r.p / 100, 2) + '×', 8),
    ].join(' '));
}
rule();

// ── Table A2: TTK / TTD at the W20 reference ────────────────────────────────
const W = 20;
const en = refEnemies(W);
const inDps = incomingDPS(W);
h(`A2 — TTK / TTD @ Wave ${W}  (trash ${f(en.trash, 0)} HP · elite ${f(en.elite, 0)} HP · boss ${f(en.boss, 0)} HP · incoming ≈ ${f(inDps, 0)} DPS)`);
console.log(`  Target bands (Balance §3 / Tuning §2): trash TTK 0.4–1.5s (ideal ~0.7s) · elite 3–5s · boss 30–60s · TTD ≥ several s`);
rule();
console.log([
    pad('Build', 22), padL('trash TTK', 11), padL('elite TTK', 11), padL('boss TTK', 11), padL('TTD', 10), padL('verdict', 22),
].join(' '));
rule();
for (const b of ARCHETYPES) {
    const tT = ttk(b, en.trash), tE = ttk(b, en.elite), tB = ttk(b, en.boss), tD = ttd(b, inDps);
    let verdict = 'in-band';
    if (tT < 0.3) verdict = 'trash melts (faceroll)';
    else if (tT > 1.5) verdict = 'BULLET-SPONGE trash';
    if (tD > 30) verdict = (verdict === 'in-band' ? '' : verdict + '; ') + 'near-unkillable';
    else if (tD < 3) verdict = (verdict === 'in-band' ? '' : verdict + '; ') + 'fragile';
    console.log([
        pad(b.name, 22), padL(f(tT, 2) + 's', 11), padL(f(tE, 2) + 's', 11),
        padL(f(tB, 1) + 's', 11), padL(f(tD, 1) + 's', 10), padL(verdict || 'in-band', 22),
    ].join(' '));
}
rule();

// ── Table A3: TTK across waves (does the curve hold for the designed build?) ─
h('A3 — Elite TTK across waves (Prowler-class, base 14 HP × waveHpMult)');
const waves = [1, 5, 10, 15, 20, 25, 30];
rule();
console.log([pad('Build', 22), ...waves.map((w) => padL('W' + w, 8))].join(' '));
console.log([pad('', 22), ...waves.map((w) => padL('×' + f(waveHpMult(w), 1), 8))].join(' '));
rule();
for (const b of ARCHETYPES) {
    console.log([
        pad(b.name, 22),
        ...waves.map((w) => padL(f(ttk(b, 14 * waveHpMult(w)), 2) + 's', 8)),
    ].join(' '));
}
rule();

// ── Spread analysis ─────────────────────────────────────────────────────────
h('A4 — BUILD-POWER SPREAD (the doc claims ~20× TTK spread; verify)');
const dpsArr = rows.map((r) => r.dps);
const ehpArr = rows.map((r) => r.e);
const pwrArr = rows.map((r) => r.p);
const ttkArr = ARCHETYPES.map((b) => ttk(b, en.elite));
const ttdArr = ARCHETYPES.map((b) => ttd(b, inDps));
const minmax = (arr) => [Math.min(...arr), Math.max(...arr)];
const [dMin, dMax] = minmax(dpsArr);
const [eMin, eMax] = minmax(ehpArr.filter((x) => Number.isFinite(x)));
const [pMin, pMax] = minmax(pwrArr);
const [kMin, kMax] = minmax(ttkArr.filter((x) => Number.isFinite(x)));
const [tdMin, tdMax] = minmax(ttdArr.filter((x) => Number.isFinite(x)));
const lo = (arr, sel) => rows[arr.indexOf(Math.min(...arr))]?.b.name;
console.log(`  Effective DPS   : ${f(dMin, 1)} → ${f(dMax, 1)}   spread ≈ ${f(dMax / dMin, 1)}×`);
console.log(`  EHP             : ${f(eMin, 0)} → ${f(eMax, 0)}   spread ≈ ${f(eMax / eMin, 1)}×`);
console.log(`  PWR             : ${pMin} → ${pMax}   spread ≈ ${f(pMax / pMin, 1)}×   (geometric blend COMPRESSES this vs DPS)`);
console.log(`  Elite TTK @ W20 : ${f(kMin, 2)}s → ${f(kMax, 2)}s   spread ≈ ${f(kMax / kMin, 1)}×   ← Balance §3 claims ~20×`);
console.log(`  TTD @ W20       : ${f(tdMin, 1)}s → ${f(tdMax, 1)}s   spread ≈ ${f(tdMax / tdMin, 1)}×   ← Balance §3 claims ~10×`);
console.log(`\n  Note: PWR spread (~${f(pMax / pMin, 1)}×) is far tighter than DPS spread (~${f(dMax / dMin, 1)}×) — the O^0.45·S^0.35·U^0.20`);
console.log(`  geometric blend is designed to refuse to over-rate one-dimensional builds (Tuning §4 worked example:`);
console.log(`  Glass Nuke ≈ Designed PWR despite ~4× the offense).`);
