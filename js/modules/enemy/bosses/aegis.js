// THE AEGIS — stage 2 boss (9.1.0 "massive maneuver-around" redesign).
//
// A screen-filling rotating BASTION. A deep reactor core is sealed behind a dome
// of beveled armor petals on its FRONT arc — the side it keeps turned toward the
// player. The shield-face is impenetrable; the reactor is only vulnerable from
// BEHIND. Because the dome TRACKS the player (at a capped turn rate), the safe
// angle is always moving: you must out-maneuver its rotation and strike the
// exposed rear. No element gating whatsoever — this is a pure POSITIONING fight.
//
// Mechanic, implemented entirely over the shipped chassis (boss-phases /
// boss-parts / boss-intro) with ZERO collision-system changes:
//   • Petals are `shieldsCore` parts on the front arc (offset + rotateWithBoss,
//     where boss.angle = the dome facing). enemy.takeDamage already no-ops core
//     damage while any shielding part lives (boss-parts.coreBlocksDamage).
//   • Each frame we test whether the player sits in the REAR arc relative to the
//     facing. If so → flip every living petal to `shieldsCore:false` (reactor
//     OPEN, core takes damage) + raise `boss._reactorOpen` for the renderer.
//     Otherwise the petals shield the core. Grinding the petals down individually
//     is a valid alternate opening (livingParts → 0 also opens the core).
//   • PHASES shed-and-harden: P0 full dome → P1 fewer/faster → P2 sheds the
//     shield ENTIRELY and the exposed reactor becomes a fast CHARGING brawler
//     (enrage). A telegraphed SHIELD-BASH shockwave punctuates P0/P1.
//
// Pure-ish: the descriptor + helpers are deterministic given an explicit `now`
// and a ctx carrying `player`. Safe to drive headless (the chassis helpers are).

import {
    initBossPhases,
    updateBossPhases,
    currentPhase,
    currentPhaseIndex,
    isFinalPhase,
} from '../boss-phases.js';
import {
    initBossParts,
    updateBossParts,
    coreBlocksDamage,
    livingParts,
    livingPartCount,
} from '../boss-parts.js';
import {
    initBossIntro,
    updateBossIntro,
    initBossDeath,
    updateBossDeath,
} from '../boss-intro.js';
import { drawAegis } from './render/aegis-render.js';

// HP cut ~35% (2600 → 1700) for shorter, snappier boss fights. The Aegis stays
// the second-toughest boss in the roster (below the Prismarch finale) — the cut
// keeps the relative ordering while trimming a fight that dragged.
export const AEGIS_MAX_HEALTH = 1700;
export const AEGIS_SIZE = 340; // radius 170 — fills a large slice of the screen

// Per-phase config. `count` petals span the FRONT arc (facing ± frontHalf where
// frontHalf = PI - rearHalfArc, so the petals visually fill everything EXCEPT
// the rear opening). `turnRate` = how fast the dome re-aims at the player
// (rad/s) — low enough that a committed orbit can flank it. `rearHalfArc` = half
// the rear opening (bigger = easier to keep the reactor exposed).
const PHASE_CFG = [
    { count: 7, hp: 80, ringR: 150, partRadius: 34, turnRate: 0.85, rearHalfArc: 0.85 },
    { count: 5, hp: 110, ringR: 145, partRadius: 36, turnRate: 1.30, rearHalfArc: 0.72 },
    { count: 0, hp: 0,   ringR: 0,   partRadius: 0,  turnRate: 1.70, rearHalfArc: Math.PI }, // shield shed → core open everywhere
];
const PHASE_GATES = [1.0, 0.6, 0.3];

// Shield-bash shockwave tuning.
const SHOCK_FIRST = 3000;     // ms after spawn before the first bash
const SHOCK_INTERVAL = 4500;  // ms between bashes
const SHOCK_TELEGRAPH = 0.8;  // s wind-up
const SHOCK_EXPAND = 0.45;    // s for the ring to reach maxR
const SHOCK_DMG = 8;

// Charge tuning (P2 exposed brawler).
const CHARGE_SPEED = 130;     // px/s toward the player

// ── angle helpers ────────────────────────────────────────────────────────────
function angleDelta(a, b) {
    let d = (a - b) % (Math.PI * 2);
    if (d > Math.PI) d -= Math.PI * 2;
    if (d < -Math.PI) d += Math.PI * 2;
    return d;
}
function easeAngleToward(cur, target, maxStep) {
    const d = angleDelta(target, cur);
    if (Math.abs(d) <= maxStep) return target;
    return cur + Math.sign(d) * maxStep;
}

// Build the front-arc petal parts-script for a phase. Petals use offset +
// rotateWithBoss so they ride the dome facing (boss.angle).
function plateScriptForPhase(phaseIdx) {
    const cfg = PHASE_CFG[phaseIdx] || PHASE_CFG[PHASE_CFG.length - 1];
    const n = cfg.count;
    if (n <= 0) return [];
    const frontHalf = Math.PI - cfg.rearHalfArc;
    const plates = [];
    for (let i = 0; i < n; i++) {
        const tloc = (n === 1) ? 0 : (i / (n - 1)) * 2 * frontHalf - frontHalf;
        plates.push({
            id: `p${phaseIdx}-plate-${i}`,
            name: `Armor Plate ${i + 1}`,
            maxHealth: cfg.hp,
            radius: cfg.partRadius,
            shieldsCore: true,
            offset: { x: Math.cos(tloc) * cfg.ringR, y: Math.sin(tloc) * cfg.ringR },
            rotateWithBoss: true,
        });
    }
    return plates;
}

function armPhasePlates(boss, phaseIdx, ctx, now) {
    const script = plateScriptForPhase(phaseIdx);
    if (script.length === 0) {
        // P2 — shed the shield entirely: drop any existing parts so the core is
        // open from every angle (coreBlocksDamage → false).
        if (boss._partsState) for (const p of boss._partsState.parts) p.alive = false;
        boss._petalsInitial = 0;
        return;
    }
    initBossParts(boss, script, ctx, now);
    boss._petalsInitial = script.length;
}

// ── Phase script ─────────────────────────────────────────────────────────────
export function buildPhaseScript() {
    return [
        { id: 'aegis-p0', name: 'Bulwark', onEnter: () => {} },
        {
            id: 'aegis-p1', name: 'Reinforce',
            enterAtHpFraction: PHASE_GATES[1],
            onEnter: (boss, ctx) => armPhasePlates(boss, 1, ctx, boss._now || Date.now()),
        },
        {
            id: 'aegis-p2', name: 'Exposed Core',
            enterAtHpFraction: PHASE_GATES[2],
            onEnter: (boss, ctx) => {
                armPhasePlates(boss, 2, ctx, boss._now || Date.now());
                triggerEnrage(boss, ctx);
            },
        },
    ];
}

export function triggerEnrage(boss) {
    if (!boss || boss._enraged) return false;
    boss._enraged = true;
    boss._enragedAt = boss._now || Date.now();
    boss.firingCooldownMul = 0.5;
    return true;
}
export function isEnraged(boss) { return !!(boss && boss._enraged); }

// ── Intro / death sequences ──────────────────────────────────────────────────
export function buildIntroScript() {
    return [
        { id: 'warp-in', name: 'Warp-In', durationMs: 1400 },
        { id: 'name-card', name: 'THE AEGIS', durationMs: 2000 },
        { id: 'fight-start', name: 'Engage', durationMs: 0 },
    ];
}
export function buildDeathScript() {
    return [
        { id: 'shield-fail', name: 'Shield Failure', durationMs: 900 },
        { id: 'core-breach', name: 'Core Breach', durationMs: 1100 },
        { id: 'supernova', name: 'Supernova', durationMs: 1200 },
        { id: 'victory', name: 'Victory', durationMs: 0 },
    ];
}

// ── Driver ───────────────────────────────────────────────────────────────────
export function initAegis(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss.isBoss = true;
    boss.bossId = AEGIS.id;
    boss.name = AEGIS.name;
    boss.element = AEGIS.element;
    boss.maxHealth = AEGIS.maxHealth;
    boss.health = AEGIS.maxHealth;
    boss.size = boss.size || AEGIS.size;
    boss._enraged = false;
    boss._now = now;
    boss._aegisPrevNow = now;
    boss._reactorOpen = false;
    boss._shockwave = { active: false, telegraph: 0, radius: 0, maxR: 0, hitPlayer: false, nextAt: now + SHOCK_FIRST };
    if (boss.active === undefined) boss.active = true;
    if (boss._deathFlash === undefined) boss._deathFlash = 0;
    if (boss.warping === undefined) boss.warping = false;
    if (boss.x === undefined) boss.x = 0;
    if (boss.y === undefined) boss.y = 0;
    boss._anchorX = boss.x;
    boss._anchorY = boss.y;
    if (boss.angle === undefined) boss.angle = 0;

    initBossPhases(boss, buildPhaseScript(), ctx, now);
    armPhasePlates(boss, 0, ctx, now);
    initBossIntro(boss, buildIntroScript(), ctx, now);
    return true;
}

export function updateAegis(boss, ctx = null, now = Date.now()) {
    if (!boss) return false;
    boss._now = now;
    const prevNow = (boss._aegisPrevNow != null) ? boss._aegisPrevNow : now;
    let dt = (now - prevNow) / 1000;
    boss._aegisPrevNow = now;
    if (!(dt > 0)) dt = 0;
    if (dt > 0.1) dt = 0.1; // clamp tab-out / first-frame spikes

    updateBossIntro(boss, ctx, now);

    const player = ctx && ctx.player;
    const phaseIdx = currentPhaseIndex(boss);
    const cfg = PHASE_CFG[phaseIdx] || PHASE_CFG[0];

    // Hold position (don't let the base enemy AI drift the boss); charge in P2.
    boss.vx = 0; boss.vy = 0;
    if (boss.velocity) { boss.velocity.x = 0; boss.velocity.y = 0; }
    if (boss.vel) { boss.vel.x = 0; boss.vel.y = 0; }

    if (player && player.active) {
        // Dome tracks the player at a capped turn rate; rate drops as petals are
        // chipped (so grinding the shield also helps you flank) and rises on enrage.
        const destroyed = Math.max(0, (boss._petalsInitial || 0) - livingPartCount(boss));
        let turn = cfg.turnRate - 0.06 * destroyed;
        if (boss._enraged) turn *= 1.5;
        turn = Math.max(0.2, turn);
        const toPlayer = Math.atan2(player.y - boss.y, player.x - boss.x);
        boss.angle = easeAngleToward(boss.angle || 0, toPlayer, turn * dt);

        // Reactor-open test: is the player in the rear arc (behind the facing)?
        const rear = (boss.angle || 0) + Math.PI;
        const behind = Math.abs(angleDelta(toPlayer, rear)) < cfg.rearHalfArc;
        boss._reactorOpen = behind;
        // Flip the petal shield: open → none shield (core takes damage); else all shield.
        for (const p of livingParts(boss)) p.shieldsCore = !behind;

        if (phaseIdx >= 2) {
            // Exposed brawler — charge the player. Contact uses the enemy collider.
            const a = toPlayer;
            boss.x += Math.cos(a) * CHARGE_SPEED * dt;
            boss.y += Math.sin(a) * CHARGE_SPEED * dt;
        } else {
            // Hold near the spawn anchor.
            boss.x += ((boss._anchorX ?? boss.x) - boss.x) * 0.05;
            boss.y += ((boss._anchorY ?? boss.y) - boss.y) * 0.05;
            updateShockwave(boss, player, dt, now);
        }
    } else {
        boss._reactorOpen = livingPartCount(boss) === 0;
    }

    updateBossParts(boss, ctx, now);
    updateBossPhases(boss, ctx, now);
    return !coreBlocksDamage(boss);
}

// Telegraphed shield-bash: a wind-up, then an expanding ring that damages the
// player as it passes them. Self-contained (no enemy-bullet pool dependency).
function updateShockwave(boss, player, dt, now) {
    const sw = boss._shockwave;
    if (!sw) return;
    const R = boss.radius || (boss.size ? boss.size / 2 : 170);
    if (!sw.active) {
        if (now >= sw.nextAt) {
            sw.active = true;
            sw.telegraph = SHOCK_TELEGRAPH;
            sw.radius = 0;
            sw.maxR = R * 3.2;
            sw.hitPlayer = false;
        }
        return;
    }
    if (sw.telegraph > 0) {
        sw.telegraph = Math.max(0, sw.telegraph - dt);
        return;
    }
    sw.radius += (sw.maxR / SHOCK_EXPAND) * dt;
    // Damage when the ring band passes the player (once per bash).
    if (!sw.hitPlayer && player && player.active && typeof player.takeDamage === 'function') {
        const pd = Math.hypot(player.x - boss.x, player.y - boss.y);
        const band = R * 0.35;
        if (Math.abs(pd - sw.radius) < band) {
            try { player.takeDamage(SHOCK_DMG, { source: 'boss', bossId: AEGIS.id }); } catch (e) { /* defensive */ }
            sw.hitPlayer = true;
        }
    }
    if (sw.radius >= sw.maxR) {
        sw.active = false;
        sw.nextAt = now + SHOCK_INTERVAL;
    }
}

export function coreVulnerable(boss) { return !coreBlocksDamage(boss); }

// Chassis read-throughs (HUD / spawner).
export function aegisCurrentPhase(boss) { return currentPhase(boss); }
export function aegisLivingPlates(boss) { return livingPartCount(boss); }
export function aegisPlateList(boss) { return livingParts(boss); }
export function aegisIsFinalPhase(boss) { return isFinalPhase(boss); }

// Death sequence (engine arms this when the core hits 0).
export function armAegisDeath(boss, ctx = null, now = Date.now(), onComplete = null) {
    if (!boss) return false;
    return initBossDeath(boss, buildDeathScript(), ctx, now, onComplete);
}
export function tickAegisDeath(boss, ctx = null, now = Date.now()) {
    return updateBossDeath(boss, ctx, now);
}

// ── Descriptor ───────────────────────────────────────────────────────────────
export const AEGIS = {
    id: 'AEGIS',
    name: 'THE AEGIS',
    stage: 2,
    tierBand: [2, 6],
    element: 'KINETIC',      // tint label only — NO element gating (9.1.0)
    maxHealth: AEGIS_MAX_HEALTH,
    size: AEGIS_SIZE,
    color: '#cfe0f5',
    glowColor: '#7fb0ff',
    isBoss: true,
    isFinalBoss: false,
    phaseCount: PHASE_GATES.length,
    buildPhaseScript,
    buildIntroScript,
    buildDeathScript,
    plateScriptForPhase,
    initBoss: initAegis,
    updateBoss: updateAegis,
    draw: drawAegis,         // 9.1.0 per-boss custom renderer
};

export default AEGIS;
