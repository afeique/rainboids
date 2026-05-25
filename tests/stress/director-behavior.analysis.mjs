// director-behavior.analysis.mjs — ANALYSIS B + C.
//
// ANALYSIS ONLY (not a test — excluded from `npm run test:unit`). Prints rich
// tables; asserts nothing.
//
//   node tests/stress/director-behavior.analysis.mjs
//
// B — drives the REAL difficulty-director.js per archetype across a full run,
//     synthesizing a realistic per-wave `outcome` from each build's DPS vs the
//     wave's HP budget and EHP vs incoming damage, then tabulating the D_hp /
//     D_thr / threat-level trajectory + channel residency. Probes the
//     cross-term gate, cold-start, deadband, rate-limit, clamps, oscillation,
//     mercy, escalation, and the honest coverage limit.
//
// C — models the §14 TARGET director (PWR pre-load × absolute baseline) and
//     contrasts it with the shipped reactive-only director.

import {
    createDirector, tickWave, getDifficulty, getThreatLevel,
    DIRECTOR_DEFAULTS, THREAT_PIPS,
} from '../../js/modules/wave/difficulty-director.js';
import {
    ARCHETYPES, calibrateKpwr, pwr, offense, effectiveDPS, survivability,
    waveHpMult, baselineCurve,
} from './build-model.mjs';

const f = (n, d = 2) => (Number.isFinite(n) ? Number(n).toFixed(d) : '∞');
const pad = (s, w) => String(s).padEnd(w);
const padL = (s, w) => String(s).padStart(w);
function rule(ch = '─', w = 118) { console.log(ch.repeat(w)); }
function h(title) { console.log('\n' + '═'.repeat(118) + '\n' + title + '\n' + '═'.repeat(118)); }

const starter = ARCHETYPES.find((a) => a.key === 'starter');
const K_PWR = calibrateKpwr(starter, 100);
const PWR_REF = 100;

// Tuning §3 / Balance §8 targets the director steers toward.
const TARGET_CLEAR_S = 35;          // target_wave_time
const TARGET_HP_RETAINED = 0.60;    // target HP retained / wave
const EXPECTED_HITS = 8;            // expected threatening hits survived / wave (model)

// ── Synthesize a realistic per-wave outcome for a build at a given wave, given
//    the CURRENT difficulty (D_hp scales the HP budget, D_thr scales threat).
//    This closes the control loop: the director's own output feeds back into
//    next wave's outcome, so we observe a true settling trajectory.
//
//    Wave HP budget (Balance §1 curve) × D_hp = total enemy HP the build must
//    chew through. actualClearTime = budgetHP / effectiveDPS. hpRetainedFrac
//    from EHP vs incoming wave damage × D_thr. deaths if a single wave's damage
//    would exceed EHP.
function synthOutcome(b, wave, D) {
    const dps = effectiveDPS(b);
    // A wave's base HP budget (trash swarm): ~designed build clears in ~35s, so
    // budget ≈ designedDPS · 35. Designed-build DPS at wave is ~3·PPI(wave); we
    // approximate the designed reference as the "Balanced mid" build scaled by
    // the wave HP curve, which is the §5 "tuned for the designed build" intent.
    const designedDPS = 30 * (waveHpMult(wave) / waveHpMult(20)); // ~30 DPS @ W20 (Balance §5)
    const baseBudgetHP = designedDPS * TARGET_CLEAR_S;
    const budgetHP = baseBudgetHP * D.D_hp;
    const actualClearTime = budgetHP / Math.max(0.01, dps);

    // Threat: incoming wave damage scales with the wave + D_thr. A "designed"
    // build at D_thr=1 should retain ~60% HP. Model incoming wave damage as a
    // fraction of the designed build's EHP, scaled by D_thr.
    const designedEHP = survivability(ARCHETYPES.find((a) => a.key === 'balanced'));
    const baseWaveDamage = designedEHP * (1 - TARGET_HP_RETAINED); // dmg that chunks designed to 60%
    const waveDamage = baseWaveDamage * D.D_thr * (waveHpMult(wave) / waveHpMult(20));
    const myEHP = survivability(b);
    const hpRetainedFrac = Math.max(0, 1 - waveDamage / myEHP);
    const deaths = waveDamage > myEHP ? 1 : 0;
    // hits survived ∝ how much headroom EHP has vs the per-wave damage.
    const hitsSurvived = Math.min(40, EXPECTED_HITS * (myEHP / Math.max(1, waveDamage)) * (1 - TARGET_HP_RETAINED) / 0.4);
    const clearedFullHp = hpRetainedFrac > 0.97;

    return {
        dpsOnTarget: dps,
        expectedDps: designedDPS,
        actualClearTime,
        targetClearTime: TARGET_CLEAR_S,
        hpRetainedFrac,
        expectedHpRetainedFrac: TARGET_HP_RETAINED,
        hitsSurvived,
        expectedHits: EXPECTED_HITS,
        deaths,
        clearedFullHp,
    };
}

// ── B1: per-build run trajectory ────────────────────────────────────────────
const N_WAVES = 20;
h(`ANALYSIS B — REAL director driven per build over a ${N_WAVES}-wave run (closed loop)`);
console.log(`  Director defaults: D_hp∈[${DIRECTOR_DEFAULTS.hpMin},${DIRECTOR_DEFAULTS.hpMax}] · D_thr∈[${DIRECTOR_DEFAULTS.thrMin},${DIRECTOR_DEFAULTS.thrMax}] · α=${DIRECTOR_DEFAULTS.alpha} · deadband ±${DIRECTOR_DEFAULTS.deadband} · maxStep ±${DIRECTOR_DEFAULTS.maxStep} · cross-term Po,Pd>${DIRECTOR_DEFAULTS.crossTerm} · thrSoftCap ${DIRECTOR_DEFAULTS.thrSoftCap} · cold-start ${DIRECTOR_DEFAULTS.coldStartWaves}w`);
console.log(`  Channel = "challenged but winning": ~${TARGET_HP_RETAINED * 100}% HP retained & ~${TARGET_CLEAR_S}s clears.`);

const trace = {};
for (const b of ARCHETYPES) {
    const dir = createDirector();
    const hist = [];
    for (let w = 1; w <= N_WAVES; w++) {
        const D = getDifficulty(dir);              // difficulty entering this wave
        const outcome = synthOutcome(b, w, D);
        const next = tickWave(dir, outcome);       // record + update
        hist.push({
            w, D_hp: next.D_hp, D_thr: next.D_thr,
            Po: dir.Po, Pd: dir.Pd, pip: getThreatLevel(dir),
            clearT: outcome.actualClearTime, hpRet: outcome.hpRetainedFrac, deaths: outcome.deaths,
        });
    }
    trace[b.key] = hist;
}

// Print a compact end-state + key trajectory points for each build.
h('B1 — End-state difficulty + trajectory (waves 3 / 10 / 20 shown; cold-start 1–2 held @ 1.0)');
rule();
console.log([
    pad('Build', 22), padL('Po', 6), padL('Pd', 6),
    padL('D_hp@3', 8), padL('D_thr@3', 9),
    padL('D_hp@10', 9), padL('D_thr@10', 10),
    padL('D_hp@20', 9), padL('D_thr@20', 10), padL('pip', 5),
].join(' '));
rule();
for (const b of ARCHETYPES) {
    const hh = trace[b.key];
    const at = (w) => hh[w - 1];
    const end = hh[hh.length - 1];
    console.log([
        pad(b.name, 22), padL(f(end.Po), 6), padL(f(end.Pd), 6),
        padL(f(at(3).D_hp), 8), padL(f(at(3).D_thr), 9),
        padL(f(at(10).D_hp), 9), padL(f(at(10).D_thr), 10),
        padL(f(end.D_hp), 9), padL(f(end.D_thr), 10), padL(end.pip, 5),
    ].join(' '));
}
rule();

// ── B2: cross-term gate — who reaches the D_thr ceiling? ────────────────────
h('B2 — CROSS-TERM GATE: only a build high on BOTH Po & Pd may push D_thr past the soft-cap (1.4) toward 1.8');
rule();
console.log([
    pad('Build', 22), padL('Po>1.3?', 8), padL('Pd>1.3?', 8), padL('mastery?', 9),
    padL('D_thr end', 10), padL('hit softcap?', 13), padL('reached ceiling?', 17),
].join(' '));
rule();
for (const b of ARCHETYPES) {
    const end = trace[b.key][trace[b.key].length - 1];
    const mastery = end.Po > 1.3 && end.Pd > 1.3;
    const cappedAt14 = Math.abs(end.D_thr - 1.4) < 0.06 || (end.D_thr <= 1.41 && end.D_thr >= 1.35);
    const ceiling = end.D_thr >= 1.7;
    console.log([
        pad(b.name, 22), padL(end.Po > 1.3 ? 'YES' : 'no', 8), padL(end.Pd > 1.3 ? 'YES' : 'no', 8),
        padL(mastery ? 'YES' : 'no', 9), padL(f(end.D_thr), 10),
        padL(cappedAt14 ? '~soft-capped' : (end.D_thr > 1.41 ? 'climbed past' : 'below'), 13),
        padL(ceiling ? 'YES (god)' : 'no', 17),
    ].join(' '));
}
rule();

// ── B3: decoupling — glass nuke gets D_hp↑ not D_thr; tank gets D_thr↑ not D_hp
h('B3 — DECOUPLING check: Glass Nuke (D_hp↑, D_thr held) vs Pure Tank (D_thr↑, D_hp ~held)');
for (const key of ['glass_nuke', 'pure_tank', 'synergy_god']) {
    const b = ARCHETYPES.find((a) => a.key === key);
    const end = trace[key][trace[key].length - 1];
    console.log(`  ${pad(b.name, 18)} → D_hp ${f(end.D_hp)} / D_thr ${f(end.D_thr)}  (Po ${f(end.Po)}, Pd ${f(end.Pd)}, deaths-last ${end.deaths})`);
}

// ── B4: cold-start / deadband / rate-limit verification ─────────────────────
h('B4 — COLD-START, DEADBAND & RATE-LIMIT (Synergy God — the build that most stresses the limiter)');
rule();
console.log([padL('wave', 5), padL('Po', 7), padL('Pd', 7), padL('D_hp', 7), padL('Δhp%', 7), padL('D_thr', 7), padL('Δthr%', 7), padL('pip', 5), padL('note', 22)].join(' '));
rule();
{
    const hh = trace['synergy_god'];
    let prevHp = 1, prevThr = 1;
    for (const r of hh) {
        const dHp = ((r.D_hp - prevHp) / prevHp) * 100;
        const dThr = ((r.D_thr - prevThr) / prevThr) * 100;
        let note = '';
        if (r.w <= DIRECTOR_DEFAULTS.coldStartWaves) note = 'cold-start (held 1.0)';
        else if (Math.abs(dHp) > 12.01 || Math.abs(dThr) > 12.01) note = '!! RATE-LIMIT BREACH';
        else if (Math.abs(dHp) < 0.01 && Math.abs(dThr) < 0.01 && r.w > DIRECTOR_DEFAULTS.coldStartWaves) note = 'deadband / clamp hold';
        console.log([
            padL(r.w, 5), padL(f(r.Po), 7), padL(f(r.Pd), 7), padL(f(r.D_hp), 7), padL(f(dHp, 1), 7),
            padL(f(r.D_thr), 7), padL(f(dThr, 1), 7), padL(r.pip, 5), padL(note, 22),
        ].join(' '));
        prevHp = r.D_hp; prevThr = r.D_thr;
    }
}
rule();

// ── B5: OSCILLATION / STABILITY — feed deliberately wobbling outcomes ───────
h('B5 — OSCILLATION test: alternate over-perform / under-perform each wave; does D thrash or settle?');
{
    const dir = createDirector();
    const log = [];
    for (let w = 1; w <= 16; w++) {
        // odd waves: stomp (fast clear, full HP); even waves: struggle (slow, low HP)
        const stomp = w % 2 === 1;
        const outcome = stomp
            ? { dpsOnTarget: 60, expectedDps: 30, actualClearTime: 15, targetClearTime: 35, hpRetainedFrac: 1.0, expectedHpRetainedFrac: 0.6, hitsSurvived: 20, expectedHits: 8, deaths: 0, clearedFullHp: true }
            : { dpsOnTarget: 15, expectedDps: 30, actualClearTime: 55, targetClearTime: 35, hpRetainedFrac: 0.25, expectedHpRetainedFrac: 0.6, hitsSurvived: 3, expectedHits: 8, deaths: 0, clearedFullHp: false };
        const next = tickWave(dir, outcome);
        log.push({ w, kind: stomp ? 'STOMP' : 'struggle', D_hp: next.D_hp, D_thr: next.D_thr, Po: dir.Po, Pd: dir.Pd });
    }
    rule();
    console.log([padL('wave', 5), padL('input', 10), padL('Po(EMA)', 9), padL('Pd(EMA)', 9), padL('D_hp', 7), padL('D_thr', 7)].join(' '));
    rule();
    for (const r of log) {
        console.log([padL(r.w, 5), padL(r.kind, 10), padL(f(r.Po), 9), padL(f(r.Pd), 9), padL(f(r.D_hp), 7), padL(f(r.D_thr), 7)].join(' '));
    }
    rule();
    const hps = log.slice(4).map((r) => r.D_hp);
    const swing = Math.max(...hps) - Math.min(...hps);
    console.log(`  D_hp peak-to-peak swing (waves 5–16) = ${f(swing, 3)}  → ${swing < 0.25 ? 'SETTLED (EMA+deadband+rate-limit damp the wobble)' : 'THRASHING'}`);
}

// ── B6: MERCY & ESCALATION ──────────────────────────────────────────────────
h('B6 — MERCY (repeated deaths ease D_thr) & ESCALATION (full-HP fast clears bump D_hp)');
{
    // Mercy: build threat up, then start dying — watch D_thr ease.
    const dir = createDirector();
    const merc = [];
    for (let w = 1; w <= 12; w++) {
        const dying = w >= 7;
        const outcome = dying
            ? { dpsOnTarget: 35, expectedDps: 30, actualClearTime: 30, targetClearTime: 35, hpRetainedFrac: 0.05, expectedHpRetainedFrac: 0.6, hitsSurvived: 2, expectedHits: 8, deaths: 1, clearedFullHp: false }
            : { dpsOnTarget: 50, expectedDps: 30, actualClearTime: 22, targetClearTime: 35, hpRetainedFrac: 0.65, expectedHpRetainedFrac: 0.6, hitsSurvived: 9, expectedHits: 8, deaths: 0, clearedFullHp: false };
        const next = tickWave(dir, outcome);
        merc.push({ w, dying, D_thr: next.D_thr });
    }
    console.log('  MERCY trace (deaths start wave 7):');
    console.log('   ' + merc.map((r) => `W${r.w}${r.dying ? '†' : ''}:${f(r.D_thr)}`).join('  '));
    const before = merc[5].D_thr, after = merc[merc.length - 1].D_thr;
    console.log(`   D_thr ${f(before)} (W6, pre-death) → ${f(after)} (W12, dying) ⇒ ${after < before ? 'EASED ✓' : 'NOT eased ✗'}`);

    // Escalation: clear at full HP in <60% time repeatedly — watch D_hp bump.
    const dir2 = createDirector();
    const esc = [];
    for (let w = 1; w <= 10; w++) {
        const outcome = { dpsOnTarget: 90, expectedDps: 30, actualClearTime: 18, targetClearTime: 35, hpRetainedFrac: 1.0, expectedHpRetainedFrac: 0.6, hitsSurvived: 30, expectedHits: 8, deaths: 0, clearedFullHp: true };
        const next = tickWave(dir2, outcome);
        esc.push({ w, D_hp: next.D_hp });
    }
    console.log('  ESCALATION trace (full-HP, 18s<21s=60%·35s clears every wave):');
    console.log('   ' + esc.map((r) => `W${r.w}:${f(r.D_hp)}`).join('  '));
    console.log(`   D_hp ${f(esc[2].D_hp)} (W3) → ${f(esc[esc.length - 1].D_hp)} (W10) ⇒ ${esc[esc.length - 1].D_hp > esc[2].D_hp ? 'ESCALATED ✓' : 'flat ✗'}`);
}

// ── B7: HONEST COVERAGE LIMIT (Tuning §6.5 / Balance §9) ────────────────────
h('B7 — HONEST COVERAGE LIMIT: does the middle ~90% equalize into the channel; god feels god; sub-0.6 cushioned?');
console.log(`  Per Tuning §6.5: Director fully equalizes builds within ~0.6–3.5× designed throughput; above 3.5× = god reward (not walled); below 0.6× = mercy-cushioned, not rescued.`);
rule();
console.log([pad('Build', 22), padL('clearT@20', 11), padL('hpRet@20', 10), padL('in-channel?', 13), padL('classification', 26)].join(' '));
rule();
for (const b of ARCHETYPES) {
    const hh = trace[b.key];
    const end = hh[hh.length - 1];
    const inClear = end.clearT >= 20 && end.clearT <= 55;          // ~35s ±
    const inHp = end.hpRet >= 0.40 && end.hpRet <= 0.80;           // ~60% ±
    const inChannel = inClear && inHp;
    let cls;
    if (end.clearT < 15) cls = 'GOD reward (faceroll clears)';
    else if (end.clearT > 60 && end.hpRet > 0.9) cls = 'sub-floor: trickle, unthreatened';
    else if (end.deaths > 0 || end.hpRet < 0.1) cls = 'sub-floor: mercy-cushioned';
    else if (inChannel) cls = 'IN-CHANNEL (equalized)';
    else cls = 'partial (one axis off)';
    console.log([
        pad(b.name, 22), padL(f(end.clearT, 1) + 's', 11), padL(f(end.hpRet * 100, 0) + '%', 10),
        padL(inChannel ? 'YES' : 'no', 13), padL(cls, 26),
    ].join(' '));
}
rule();

// ════════════════════════════════════════════════════════════════════════════
// ANALYSIS C — current reactive director vs §14 TARGET (PWR pre-load + baseline)
// ════════════════════════════════════════════════════════════════════════════
h('ANALYSIS C — Current (reactive-only) vs §14 TARGET model (PWR pre-load × absolute baseline)');
console.log(`  §14.2 target: enemyPower(w) = baseline(w)·MODE_BASE·directorMult·pwrPreload(PWR)`);
console.log(`  pwrPreload(PWR) = clamp((PWR/PWR_REF)^0.5, 0.8, 3.0)   ·   baseline(w) = 1 + 0.15·w + 0.06·w^1.5  (§14.5)`);
console.log(`  Current shipped director has NO pre-load, NO absolute baseline, NO mode — purely reactive Po/Pd.`);

// pwrPreload for each build (the prior the current director LACKS).
h('C1 — PWR pre-load each build SHOULD get (§14.2) vs what the current director applies at spawn (=1.0, reactive)');
rule();
console.log([pad('Build', 22), padL('PWR', 7), padL('PWR/REF', 9), padL('pwrPreload', 11), padL('current@spawn', 14), padL('lag cost (waves)', 17)].join(' '));
rule();
for (const b of ARCHETYPES) {
    const p = pwr(b, K_PWR);
    const preload = Math.min(3.0, Math.max(0.8, Math.sqrt(p / PWR_REF)));
    // Current director starts at D=1.0 and ramps ≤12%/wave. Waves to reach the
    // preload target from 1.0 via the offense outlet: log(preload)/log(1.12).
    const lagWaves = preload > 1 ? Math.log(preload) / Math.log(1.12) : 0;
    console.log([
        pad(b.name, 22), padL(p, 7), padL(f(p / PWR_REF) + '×', 9), padL(f(preload) + '×', 11),
        padL('1.00× (no prior)', 14), padL(f(lagWaves, 1) + ' to catch up', 17),
    ].join(' '));
}
rule();

// C2 — combined enemyPower trajectory: TARGET (preload×baseline×directorMult)
// vs CURRENT (reactive directorMult only, no baseline/preload) for two builds.
h('C2 — enemyPower trajectory: §14 TARGET vs CURRENT shipped (Synergy God & Starter, Normal mode)');
console.log(`  TARGET multiplies the player-power prior + the absolute baseline curve; CURRENT only reacts. baseline(w) shown so the GAP is explicit.`);
function targetEnemyPower(b, wave, directorMult, mode = 1.0) {
    const p = pwr(b, K_PWR);
    const preload = Math.min(3.0, Math.max(0.8, Math.sqrt(p / PWR_REF)));
    return baselineCurve(wave) * mode * directorMult * preload;
}
for (const key of ['synergy_god', 'starter']) {
    const b = ARCHETYPES.find((a) => a.key === key);
    console.log(`\n  ${b.name}:`);
    rule();
    console.log([padL('wave', 5), padL('baseline(w)', 12), padL('preload', 9), padL('TARGET enemyPwr', 16), padL('CURRENT D_hp', 13), padL('CURRENT-as-mult', 16), padL('gap (T/C)', 11)].join(' '));
    rule();
    const hh = trace[key];
    for (const w of [3, 5, 10, 15, 20]) {
        const r = hh[w - 1];
        const p = pwr(b, K_PWR);
        const preload = Math.min(3.0, Math.max(0.8, Math.sqrt(p / PWR_REF)));
        // Use the build's CURRENT-director D_hp as the reactive directorMult proxy.
        const target = targetEnemyPower(b, w, 1.0); // directorMult≈1 (target leans on preload+baseline)
        const current = r.D_hp;                      // current model's combined HP pressure
        // express current as an enemyPower-equivalent: current model has NO baseline,
        // so its effective enemyPower is just D_hp (baseline≡1, preload≡1).
        const gap = target / Math.max(0.01, current);
        console.log([
            padL(w, 5), padL(f(baselineCurve(w)), 12), padL(f(preload) + '×', 9),
            padL(f(target), 16), padL(f(current), 13), padL(f(current) + '× (flat)', 16), padL(f(gap) + '×', 11),
        ].join(' '));
    }
    rule();
}

h('C3 — QUANTIFIED GAP: how differently are Synergy God vs Starter treated, WITH vs WITHOUT pre-load?');
{
    const god = ARCHETYPES.find((a) => a.key === 'synergy_god');
    const st = ARCHETYPES.find((a) => a.key === 'starter');
    const pGod = pwr(god, K_PWR), pSt = pwr(st, K_PWR);
    const plGod = Math.min(3.0, Math.max(0.8, Math.sqrt(pGod / PWR_REF)));
    const plSt = Math.min(3.0, Math.max(0.8, Math.sqrt(pSt / PWR_REF)));
    console.log(`  WITH §14 pre-load (at wave 3, before any reaction):`);
    console.log(`    Synergy God faces ×${f(plGod)} enemyPower from wave 1; Starter faces ×${f(plSt)}. Ratio = ${f(plGod / plSt)}× harder for the god, INSTANTLY.`);
    console.log(`  WITHOUT pre-load (current): both start identical at D=1.0; the god build only diverges by reacting,`);
    const godEnd = trace['synergy_god'][2].D_hp; // D_hp at wave 3 (first adaptive wave)
    const stEnd = trace['starter'][2].D_hp;
    console.log(`    capped at ±12%/wave. At wave 3 the current director has god D_hp=${f(godEnd)} vs starter D_hp=${f(stEnd)} — ratio only ${f(godEnd / stEnd)}×.`);
    console.log(`  ⇒ The missing pre-load costs the god build a ~${f(Math.log(plGod) / Math.log(1.12), 1)}-wave "free stomp" runway before the reactive director catches up (Balance §9 calls this lag a feature,`);
    console.log(`    but the §14 target would START the god build near its ceiling rather than climbing to it). Conversely the Starter's preload floors at 0.8× — the current director instead`);
    console.log(`    floors at D=0.6 only AFTER observing a wall, so a fresh/weak build eats 1–2 over-tuned waves before relief.`);

    console.log(`\n  DEEP-RUN escalation gap (§14.5 absolute baseline vs current's reactive ceiling):`);
    for (const w of [20, 30, 50, 90]) {
        console.log(`    baseline(${w}) = ×${f(baselineCurve(w), 1)}  — the §14 target keeps climbing; current director's D_hp hard-clamps at ${DIRECTOR_DEFAULTS.hpMax} regardless of wave ⇒ a 99-card late game saturates.`);
    }
}
