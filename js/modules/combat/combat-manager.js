// Combat effects, debris, orb drops, powerup collection, damage numbers, kill streaks
import { GAME_CONFIG, GAME_STATES, getEnemyDropProfile, BLOODLUST_MAX_STACKS, RESONANT_SURGE_ENERGY } from '../core/constants.js';
import { random } from '../core/utils.js';
import { hsl } from '../core/color-cache.js';
import { PRIMARY_UPGRADES, POWER_UPGRADES, ABILITY_UPGRADES, STREAK_TIERS, STREAK_BUFF_DURATION, getStreakGoldMult, ABILITIES } from './weapon-data.js';
import { DEFENSE_CONFIGS } from './defense-data.js';
import { POWERUP_TYPES } from '../world/powerup.js';
import { createItem, createWeaponItem } from '../world/item-system.js';
import { rollRarity } from '../world/item-names.js';
// T29 — Rainshard income faucet (§2.4): per-kill R$ ramps with wave depth,
// the difficulty mode lens, the killstreak multiplier, and the gear/Matrix
// R$-find stat. Replaces the 6.x flat-gold model.
import { perKillRainshards, INCOME } from '../shop/income.js';
import { rewardMultiplier } from '../world/reward-dial.js';
import { isMobile } from '../platform/platform-detect.js';
import { frameClock } from '../core/frame-clock.js';
import { initBossDeath } from '../enemy/boss-intro.js';

// P6 — Killing Spree passive: doubles the kill-streak damage BONUS (the amount
// over 1.0), so a tier's +X% becomes +2X%. Pure; exported for unit tests.
export function killingSpreeMult(tierMult, hasKillingSpree) {
    const m = (typeof tierMult === 'number' && tierMult > 0) ? tierMult : 1;
    return hasKillingSpree ? 1 + (m - 1) * 2 : m;
}

// 6.26.1 — Explosion accent palettes. Each kill picks a palette at
// random and stamps it on the enemy via `_explosionPalette` so the
// frame-0 burst and the frame-6 debris burst share the same accent
// scheme. Per-palette slots:
//   [0] warm   — was `#ffd060` (gold) in the legacy single-palette
//   [1] hot    — was `#ffa044` / `#ff9966` (orange) in the legacy
//   [2] ember  — was `#ff8855` / `#ffcc66` (coral) in the legacy
// `enemy.color` is layered on top of these as the primary tint so
// each enemy type still reads with its own hue.
const EXPLOSION_PALETTES = [
    ['#ffd060', '#ffa044', '#ff8855'],  // classic gold / orange / coral (original)
    ['#88ddff', '#4488ff', '#aaccff'],  // ice plasma — cyan / cobalt / pale
    ['#bbff66', '#88dd44', '#ddff99'],  // toxic — lime / green / soft yellow
    ['#ff77cc', '#cc44ff', '#ffaaff'],  // magenta storm — pink / violet / blush
    ['#ffcc44', '#ff5566', '#ff8855'],  // hot — gold / red / coral
    ['#ddff66', '#ffee88', '#ffd060'],  // solar — chartreuse / cream / gold
    ['#88ffee', '#44ccaa', '#ccffff'],  // aqua — teal / jade / iceblue
    ['#aa88ff', '#5544cc', '#ccbbff'],  // royal — lavender / indigo / pale
];
function pickExplosionPalette() {
    return EXPLOSION_PALETTES[(Math.random() * EXPLOSION_PALETTES.length) | 0];
}

// ── Asteroid Debris ──

export function createDebris(ast) {
    // Derive explosion color from the asteroid's unique hue. Routed
    // through the cached hsl() helper — every asteroid death builds
    // 3 strings + reuses them across the 60+ shrapnel / ember spawns
    // below. Caching makes the asteroid-color strings shared across
    // bursts that hit the same baseHue bucket (integer-quantized).
    const hue = ast.baseHue || 0;
    const sat = ast.saturation || 90;
    const lit = ast.lightness || 70;
    const baseColor = hsl(hue, sat, lit);
    const brightColor = hsl(hue, sat, Math.min(95, lit + 20));
    const dimColor = hsl((hue + 20) % 360, sat, Math.max(40, lit - 15));
    const sizeScale = Math.min(1.5, ast.baseRadius / 25);
    const onScreen = this.isEntityOnScreen(ast);
    const isLarge = ast.baseRadius > (GAME_CONFIG.MIN_AST_RAD + 5);

    // ── Kill juice: hitstop + camera kick ──
    // No screen flash on asteroid destruction — flash is reserved for
    // enemy kills so the destruction-flash carries weight (rocks are
    // inert; ships are alive). Asteroid death still gets screen shake
    // (triggered in collision-system on the destroyAsteroid path) and
    // a camera kick away from the impact.
    if (onScreen) {
        this.triggerHitstop(isLarge ? 5 : 3);
        const kdx = this.player.x - ast.x;
        const kdy = this.player.y - ast.y;
        this.triggerCameraKick(kdx, kdy, isLarge ? 12 : 7);
    }

    // 1. Soft white core flash — visible during hitstop, refined radius.
    this.particlePool.get(ast.x, ast.y, 'explosionFlash', ast.baseRadius * 1.5 * sizeScale);

    // 2. Expanding colored rings — staggered wavefronts
    this.particlePool.get(ast.x, ast.y, 'explosionRingColored', ast.baseRadius * 2.5 * sizeScale, baseColor);
    setTimeout(() => {
        this.particlePool.get(ast.x, ast.y, 'explosionRingColored', ast.baseRadius * 3.2 * sizeScale, dimColor);
    }, 70);
    setTimeout(() => {
        this.particlePool.get(ast.x, ast.y, 'explosionRingColored', ast.baseRadius * 2.0 * sizeScale, brightColor);
    }, 150);

    // 3. Directional shrapnel streaks in asteroid color
    const shrapnelCount = Math.floor(14 + 10 * sizeScale);
    for (let i = 0; i < shrapnelCount; i++) {
        const angle = (i / shrapnelCount) * Math.PI * 2 + random(-0.3, 0.3);
        const speed = random(4, 14) * sizeScale;
        const color = i % 3 === 0 ? brightColor : i % 3 === 1 ? baseColor : dimColor;
        this.particlePool.get(ast.x, ast.y, 'explosionShrapnel', angle, speed, color);
    }

    // 4. Core glow — slow embers at center that linger
    for (let i = 0; i < 4; i++) {
        const p = this.particlePool.get(
            ast.x + random(-3, 3), ast.y + random(-3, 3),
            'explosionEmber', i < 1 ? '#ffffff' : brightColor
        );
        if (p) {
            p.vel.x *= 0.15;
            p.vel.y *= 0.15;
            p.life = random(1.3, 2.0);
            p.radius = random(2, 4.5);
        }
    }

    // 5. Lingering embers in asteroid's hue range
    const emberCount = Math.floor(10 + 7 * sizeScale);
    for (let i = 0; i < emberCount; i++) {
        const eHue = hue + random(-30, 30);
        const eColor = hsl((eHue + 360) % 360, sat, random(55, 80));
        this.particlePool.get(ast.x, ast.y, 'explosionEmber', eColor);
    }

    // 6. Classic small particles for density
    for (let i = 0; i < 20; i++) {
        const p = this.particlePool.get(ast.x, ast.y, 'explosion');
        if (p) {
            p.color = i < 6 ? '#ffffff' : i < 12 ? baseColor : brightColor;
            const a = random(0, Math.PI * 2);
            const s = random(2, 8);
            p.vel = { x: Math.cos(a) * s, y: Math.sin(a) * s };
            p.radius = random(1.5, 4.5);
        }
    }

    // 7. Line debris from wireframe edges
    ast.edges.forEach(edge => {
        const p1 = ast.vertices3D[edge[0]];
        const p2 = ast.vertices3D[edge[1]];
        this.lineDebrisPool.get(ast.x, ast.y, p1, p2, baseColor);
    });

    // 7b. Tumbling 3D wireframe-triangle shards — radial burst that
    //     flies across the map, spinning on all three axes, fading
    //     over ~2 seconds. Color palette derived from the asteroid's
    //     own hue (mixed with bright/dim/white highlights) so the
    //     burst reads as the rock itself shattering rather than a
    //     generic effect.
    if (this.asteroidShardPool) {
        // Scale count with asteroid size — 10 for small rocks, up to
        // 22 for the largest. The biggest rocks produce the biggest
        // bursts; the smallest don't waste a flood of shards.
        const shardCount = Math.floor(10 + 12 * sizeScale);
        for (let i = 0; i < shardCount; i++) {
            // Evenly-spaced angles with jitter so the burst reads as
            // an organic shatter, not a fixed pinwheel.
            const angle = (i / shardCount) * Math.PI * 2 + random(-0.35, 0.35);
            const speed = random(3.5, 9.0) * sizeScale;
            const size = random(4.0, 9.5);
            // Most shards take the asteroid's color (base/bright/dim
            // cycle), every 5th shard is white for the "spark" pop.
            const color = (i % 5 === 0) ? '#ffffff'
                        : (i % 3 === 0) ? brightColor
                        : (i % 3 === 1) ? baseColor
                        : dimColor;
            const shard = this.asteroidShardPool.get();
            if (shard) shard.reset(ast.x, ast.y, angle, speed, size, color);
        }
    }

    // 8. Delayed secondary burst — cascade
    setTimeout(() => {
        for (let i = 0; i < 6; i++) {
            const ox = ast.x + random(-18, 18);
            const oy = ast.y + random(-18, 18);
            this.particlePool.get(ox, oy, 'explosionEmber', baseColor);
        }
    }, 80);

    // 9. Second delayed burst — final pop
    setTimeout(() => {
        for (let i = 0; i < 4; i++) {
            const ox = ast.x + random(-25, 25);
            const oy = ast.y + random(-25, 25);
            this.particlePool.get(ox, oy, 'explosionEmber', brightColor);
        }
    }, 180);
}


// ── Enemy Death Sequence ──
//
// Two visual beats, temporally separated for clear delineation:
//
//   Frame 0 (createEnemyDebris → triggerEnemyFinalExplosion)
//     BIG RING + flash + main screen punch. Ship vanishes immediately.
//     This is the visual "BANG."
//
//   Frame 6 (triggerEnemyDebrisBurst, fired from enemy update loop)
//     Dense shrapnel streaks + classic dust + the ship's own outline
//     pieces ripping outward. Reads as wreckage flying through the
//     still-expanding ring (which has reached ~12% of its max radius
//     by this point — visibly defined as a wavefront edge).
//
//   Frame 24
//     Enemy deactivates.
//
// 6-frame gap (~100ms @ 60Hz) is enough to register as separate events
// without feeling sluggish. Sequence reads as a cinematic shockwave-
// then-debris cascade, exactly the pattern requested in 5.64.7.

export function createEnemyDebris(enemy) {
    if (!enemy) return;

    // Death window — 24 frames @ 60Hz ≈ 400ms.
    //   tick 0  : THIS function — sets flags + calls big-ring announce
    //   tick 6  : triggerEnemyDebrisBurst — debris flies
    //   tick 24 : enemy deactivates
    enemy._deathFlash = 24;
    enemy._deathFlashMax = 24;
    enemy._debrisBurstFired = false;
    enemy._explosionFired = false; // cleared so triggerEnemyFinalExplosion fires now
    // Ship vanishes immediately — the ring takes over as the visual.
    enemy._shipDestroyed = true;
    if (enemy.vel) {
        enemy.vel.x *= 0.55;
        enemy.vel.y *= 0.55;
    }

    // Fire the BIG ring announce in the same frame. All kill juice
    // (hitstop, screen flash, camera kick, screen shake) lives inside
    // that function so we don't double-punch the screen.
    this.triggerEnemyFinalExplosion(enemy);
}

// ── BEAT 2: BIG explosion announce ──
// Fires immediately on death (called by `createEnemyDebris`). THIS is the
// visual "BANG" — multi-layer plasma fireball + chromatic flashes +
// expanding rings + a fat shockwave + radial lightning bolts + a starburst
// of sparkles + dense embers + the full screen punch. Designed to be
// UNMISTAKABLE: even the smallest enemy produces a clearly defined burst.
//
// Position captured once at call time so pool recycling can't corrupt
// the spawn coords later.
//
// Two design rules carried over from 5.64.7+:
//   • Debris (shrapnel streaks + outline pieces + 3D shards) fires at
//     frame 6 via `triggerEnemyDebrisBurst` — sequenced AFTER the
//     wavefront so the player reads the BANG first, then wreckage
//     flying through it.
//   • A minimum size floor (`bigR ≥ 32px` even for tiny enemies) keeps
//     small-enemy bursts visually beefy — the previous version produced
//     30-px max rings for HUNTERs which read as "did nothing happen?"
export function triggerEnemyFinalExplosion(enemy) {
    if (!enemy || !this.particlePool) return;
    // Idempotency guard — repeat calls in the same frame (e.g. from a
    // hitting bullet + an AOE landing on the same tick) shouldn't stack
    // particles. The flag is reset by `createEnemyDebris` for re-use.
    if (enemy._explosionFired) return;
    enemy._explosionFired = true;

    const color = enemy.color || '#ff4444';
    // 6.26.1 — Randomized accent palette per kill. Stamped on the
    //   enemy so the frame-6 debris burst inherits the same scheme.
    const palette = enemy._explosionPalette || (enemy._explosionPalette = pickExplosionPalette());
    const accentWarm  = palette[0];
    const accentHot   = palette[1];
    const accentEmber = palette[2];
    const r = enemy.radius || 18;
    // Size floor — even tiny enemies produce a beefy 32-px-anchored burst.
    // Bosses scale up via sizeScale capped at 2.5×.
    const bigR = Math.max(32, r);
    const sizeScale = Math.min(2.5, bigR / 15);
    const onScreen = this.isEntityOnScreen(enemy);
    const ex = enemy.x;
    const ey = enemy.y;

    // ── Screen punch ──
    // Hitstop + flash + camera kick + shake. Tuned in 5.105.0; not amped
    // further here so wave-clears still read as distinct kills, not one
    // long shake.
    if (onScreen) {
        this.triggerHitstop(7);
        this.triggerScreenFlash(0.14, 7);
        if (this.player) {
            const kdx = this.player.x - ex;
            const kdy = this.player.y - ey;
            this.triggerCameraKick(kdx, kdy, 18);
        }
        this.triggerScreenShake(14, 8, bigR * 1.4);
    }

    // ── 1. Chromatic plasma core stack ──
    // Three layered fireballs of decreasing size: white (hottest) → warm
    // → enemy color. They overlap as one defined plasma blob that lingers
    // ~30 frames, sustaining the explosion's anchor point through the
    // entire 24-frame death window. Warm accent comes from the random
    // per-kill palette so cores read different per explosion.
    this.particlePool.get(ex, ey, 'enemyPlasmaCore', bigR * 1.6 * sizeScale, color);
    this.particlePool.get(ex, ey, 'enemyPlasmaCore', bigR * 1.2 * sizeScale, accentWarm);
    this.particlePool.get(ex, ey, 'enemyPlasmaCore', bigR * 0.85 * sizeScale, '#ffffff');

    // ── 2. Bright instantaneous flash ──
    // The "frame-0 punch" — engulfs the area for ~6 frames before the
    // plasma core takes over visually.
    this.particlePool.get(ex, ey, 'explosionFlash', bigR * 2.8 * sizeScale, '#ffffff');

    // ── 3. Four chromatic wavefront rings ──
    // White (sharp wavefront) → warm → enemy color → hot accent. Largest
    // is ≥80px so even small enemies get a defined shockwave. Per-kill
    // palette drives the warm + hot accents so rings recolor per kill.
    const ringBase = Math.max(80, bigR * 2.2 * sizeScale);
    this.particlePool.get(ex, ey, 'explosionRingColored', ringBase * 0.65, '#ffffff');
    this.particlePool.get(ex, ey, 'explosionRingColored', ringBase * 0.88, accentWarm);
    this.particlePool.get(ex, ey, 'explosionRingColored', ringBase * 1.1,  color);
    this.particlePool.get(ex, ey, 'explosionRingColored', ringBase * 1.32, accentHot);

    // ── 4. Mega shockwave ──
    // Thick + slow + wide. One pressure-front that outlasts the chromatic
    // rings and reads as the actual blast wave dissipating outward.
    this.particlePool.get(ex, ey, 'enemyShockwave', ringBase * 1.8, accentEmber);

    // 6.26.1 — Radial lightning crackle removed. The bolts read as
    //   a player-ability (EMP / electric chain) rather than a generic
    //   death effect, and they obscured the plasma core's chromatic
    //   layering. The rings + shockwave + sparkles + embers carry
    //   the "BANG" by themselves.

    // ── 6. Starburst sparkles ──
    // 14 bright cross-sparkles arranged in a tight ring just outside the
    // plasma core. Each sparkle is the WebGL atlas's 8-point star — they
    // collectively read as the explosion "throwing light."
    const sparkleCount = 14;
    for (let i = 0; i < sparkleCount; i++) {
        const angle = (i / sparkleCount) * Math.PI * 2;
        const d = bigR * (0.55 + Math.random() * 0.35) * sizeScale;
        const sx = ex + Math.cos(angle) * d;
        const sy = ey + Math.sin(angle) * d;
        const sp = this.particlePool.get(sx, sy, 'starSparkle', random(1.4, 2.4),
            i % 4 === 0 ? color : (i % 4 === 1 ? accentWarm : '#ffffff'));
        if (sp) {
            sp.life = random(0.5, 0.9);
            // Slow outward drift so the sparkle ring expands gently.
            sp.vel = {
                x: Math.cos(angle) * random(0.3, 0.9),
                y: Math.sin(angle) * random(0.3, 0.9),
            };
        }
    }

    // ── 7. Hot embers at frame 0 ──
    // Previously embers were ONLY in the debris burst (frame 6). Adding
    // them at frame 0 fills the gap between "ship vanishes" and "debris
    // emerges" with motion, so the explosion never has a dead frame.
    const emberCount = 16 + Math.floor(sizeScale * 6);
    for (let i = 0; i < emberCount; i++) {
        // Mostly hot palette (white/gold/orange/enemy-color) with a slight
        // outward bias so the ember cloud blooms instead of just
        // floating in place.
        const eColor = i % 5 === 0 ? '#ffffff'
                     : i % 5 === 1 ? accentWarm
                     : i % 5 === 2 ? color
                     : i % 5 === 3 ? accentEmber
                     :              accentHot;
        const p = this.particlePool.get(ex, ey, 'explosionEmber', eColor);
        if (p) {
            // Bias velocity outward so embers radiate from the core.
            const a = random(0, Math.PI * 2);
            const sp = random(1.2, 4.5) * sizeScale;
            p.vel = { x: Math.cos(a) * sp, y: Math.sin(a) * sp };
            p.radius = random(1.8, 4.0);
            p.life = random(0.7, 1.1);
        }
    }
}

// ── BEAT 3: Debris flies through the still-expanding rings ──
// Called by the enemy update loop ~6 frames after the big-ring announce
// (death-window tick `midpoint + 6`). This is when the wreckage
// actually scatters — shrapnel streaks, classic dust, and the ship's
// own outline pieces ripping outward at high velocity. By this frame
// the rings have expanded ~12% of their max radius, so the debris is
// clearly emerging from a defined wavefront edge instead of being
// born inside the ring blob.
export function triggerEnemyDebrisBurst(enemy) {
    if (!enemy || !this.particlePool) return;
    const color = enemy.color || '#ff4444';
    // 6.26.1 — Inherit the palette stamped at death. Fall back to a
    //   fresh pick if the debris burst somehow fires before the
    //   frame-0 explosion (shouldn't happen — but defensive).
    const palette = enemy._explosionPalette || (enemy._explosionPalette = pickExplosionPalette());
    const accentWarm  = palette[0];
    const accentHot   = palette[1];
    const accentEmber = palette[2];
    const r = enemy.radius || 18;
    const bigR = Math.max(32, r);
    const sizeScale = Math.min(2.5, bigR / 15);
    const ex = enemy.x;
    const ey = enemy.y;

    // ── 0. Secondary fireball pop ──
    // A smaller, sharper flash + mini-shockwave timed to the debris
    // emerging. Reads as the chamber-rupture pulse that hurls the
    // wreckage outward — distinct from the frame-0 plasma core, which
    // is by now mid-dim. Palette accents recolor per kill.
    this.particlePool.get(ex, ey, 'explosionFlash', bigR * 1.6 * sizeScale, accentWarm);
    this.particlePool.get(ex, ey, 'enemyShockwave', bigR * 1.4 * sizeScale, accentHot);
    // Tight inner ring — fires as debris emerges, chasing the shrapnel out.
    this.particlePool.get(ex, ey, 'explosionRingColored', bigR * 1.0 * sizeScale, color);

    // 1. Dense directional shrapnel — fast streaks in all directions.
    const shrapnelCount = Math.floor(36 + 18 * sizeScale);
    for (let i = 0; i < shrapnelCount; i++) {
        const angle = (i / shrapnelCount) * Math.PI * 2 + random(-0.4, 0.4);
        const speed = random(6, 18) * sizeScale;
        const sColor = i % 4 === 0 ? '#ffffff'
                     : i % 4 === 1 ? accentHot
                     : i % 4 === 2 ? color
                     : accentEmber;
        this.particlePool.get(ex, ey, 'explosionShrapnel', angle, speed, sColor);
    }

    // 2. Classic small particles — outward-velocity dust filling in
    // between the shrapnel streaks.
    for (let i = 0; i < 24; i++) {
        const p = this.particlePool.get(ex, ey, 'explosion');
        if (p) {
            p.color = i < 8 ? '#ffffff' : i < 16 ? color : accentHot;
            const a = random(0, Math.PI * 2);
            const s = random(3, 12);
            p.vel = { x: Math.cos(a) * s, y: Math.sin(a) * s };
            p.radius = random(1.5, 5);
        }
    }

    // 3. Outline scatter — the actual ship pieces fly out (high
    // velocity + tangential spin per createShapeDebris).
    if (typeof this.createShapeDebris === 'function') {
        try { this.createShapeDebris(enemy); } catch (_) {}
    }

    // 3b. Tumbling 3D wireframe-triangle shards — same pool + same 3D
    //     rotation rig as asteroid death, but bigger / faster / denser
    //     to sell enemy kills as the "main event" vs an asteroid pop.
    //     Combined with the line-piece scatter above, the visual reads
    //     as the enemy's hull shattering AND spinning shrapnel flung
    //     through it — geometry tumbling away in three dimensions
    //     before fading. Color palette pulls the enemy's own tint
    //     plus white sparks so the burst feels OF the dying enemy,
    //     not a generic effect.
    if (this.asteroidShardPool) {
        const enemyShardCount = Math.floor(18 + 14 * sizeScale); // 18 baseline up to ~46 for TITAN
        for (let i = 0; i < enemyShardCount; i++) {
            const angle = (i / enemyShardCount) * Math.PI * 2 + random(-0.35, 0.35);
            const speed = random(5.0, 13.0) * sizeScale;     // faster than asteroid shards (3.5-9)
            const size  = random(7.0, 14.0);                  // bigger than asteroid shards (4-9.5)
            // Every 4th = white spark, otherwise alternate
            // enemy-color / warm highlight / cool highlight so the
            // burst reads as the enemy's palette flying apart.
            const sColor = (i % 4 === 0) ? '#ffffff'
                         : (i % 3 === 0) ? accentHot
                         : (i % 3 === 1) ? color
                         : accentEmber;
            const shard = this.asteroidShardPool.get();
            if (shard) shard.reset(ex, ey, angle, speed, size, sColor);
        }
    }

    // 4. Late ember puff — 8 hot embers spawn at random offsets within
    //    the debris cloud, simulating the after-glow of secondary ignitions.
    for (let i = 0; i < 8; i++) {
        const ox = ex + random(-bigR * 0.7, bigR * 0.7);
        const oy = ey + random(-bigR * 0.7, bigR * 0.7);
        const p = this.particlePool.get(ox, oy, 'explosionEmber',
            i < 2 ? '#ffffff' : i < 5 ? color : accentHot);
        if (p) {
            p.vel.x *= 0.4;
            p.vel.y *= 0.4;
            p.life = random(0.8, 1.3);
            p.radius = random(2, 4.5);
        }
    }
}

export function createShapeDebris(enemy) {
    // Tear-apart silhouette scatter. Builds the enemy's hull as a list
    // of outline edges + internal struts, then FRAGMENTS each edge into
    // 2 half-segments and gives every piece a high-velocity outward kick
    // with a tangential (perpendicular) spin component so the ship reads
    // as physically blowing apart, not just unraveling.
    //
    // Per-piece treatment after spawn:
    //   • velocity multiplied 2.5-4× (was unitless 2-5 in LineDebris.reset)
    //   • tangential perpendicular component added at ~25% of radial speed
    //     for chaotic outward spin
    //   • rotation rate doubled so pieces visibly tumble
    //
    // Net debris count per enemy roughly doubles vs the pre-5.64.5
    // version, which is why lineDebrisPool was bumped to 100 in the
    // engine constructor.
    const r = enemy.radius;
    const color = enemy.color;
    const verts = [];           // outline vertices (closed loop)
    const struts = [];          // extra internal segments [p1, p2]

    switch (enemy.type) {
        case 'HUNTER': { // Triangle ship — point forward
            const tip = r * 1.1;
            const back = r * 0.7;
            verts.push({ x: tip, y: 0 });
            verts.push({ x: -back, y: -back * 0.9 });
            verts.push({ x: -back * 0.45, y: 0 });
            verts.push({ x: -back, y: back * 0.9 });
            // internal hull bracing
            struts.push([{ x: tip * 0.5, y: 0 }, { x: -back * 0.45, y: 0 }]);
            struts.push([{ x: -back * 0.7, y: -back * 0.4 }, { x: -back * 0.7, y: back * 0.4 }]);
            // engine-block detail lines
            struts.push([{ x: -back * 0.85, y: -back * 0.2 }, { x: -back * 0.55, y: -back * 0.2 }]);
            struts.push([{ x: -back * 0.85, y:  back * 0.2 }, { x: -back * 0.55, y:  back * 0.2 }]);
            break;
        }
        case 'GUARDIAN': { // Square hull
            const s = r * 0.85;
            verts.push({ x: -s, y: -s }, { x: s, y: -s }, { x: s, y: s }, { x: -s, y: s });
            // diagonals
            struts.push([{ x: -s, y: -s }, { x: s, y: s }]);
            struts.push([{ x: s, y: -s }, { x: -s, y: s }]);
            // internal grid (4 quadrant ribs)
            struts.push([{ x: -s, y: 0 }, { x: s, y: 0 }]);
            struts.push([{ x: 0, y: -s }, { x: 0, y: s }]);
            struts.push([{ x: -s * 0.5, y: -s * 0.5 }, { x: s * 0.5, y: -s * 0.5 }]);
            struts.push([{ x: -s * 0.5, y:  s * 0.5 }, { x: s * 0.5, y:  s * 0.5 }]);
            break;
        }
        case 'WASP': { // Diamond
            const s = r * 1.0;
            verts.push({ x: 0, y: -s }, { x: s * 0.7, y: 0 }, { x: 0, y: s }, { x: -s * 0.7, y: 0 });
            // cross brace
            struts.push([{ x: -s * 0.4, y: -s * 0.4 }, { x: s * 0.4, y: s * 0.4 }]);
            struts.push([{ x: s * 0.4, y: -s * 0.4 }, { x: -s * 0.4, y: s * 0.4 }]);
            // wing detail
            struts.push([{ x: 0, y: -s * 0.5 }, { x: 0, y: s * 0.5 }]);
            struts.push([{ x: -s * 0.35, y: 0 }, { x: s * 0.35, y: 0 }]);
            break;
        }
        case 'TITAN':
        case 'TANGERINE': { // 8-sided big enemies
            const sides = 8;
            for (let i = 0; i < sides; i++) {
                const a = (i / sides) * Math.PI * 2;
                verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
            }
            // inner ring at 0.55r — second shell of wreckage
            const inner = r * 0.55;
            for (let i = 0; i < sides; i++) {
                const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
                const a2 = a + Math.PI * 2 / sides;
                struts.push([
                    { x: Math.cos(a) * inner, y: Math.sin(a) * inner },
                    { x: Math.cos(a2) * inner, y: Math.sin(a2) * inner },
                ]);
            }
            // even-deeper inner ring at 0.3r
            const deep = r * 0.3;
            for (let i = 0; i < sides; i++) {
                const a = (i / sides) * Math.PI * 2;
                const a2 = a + Math.PI * 2 / sides;
                struts.push([
                    { x: Math.cos(a) * deep, y: Math.sin(a) * deep },
                    { x: Math.cos(a2) * deep, y: Math.sin(a2) * deep },
                ]);
            }
            // 8 radial spokes (was 4)
            for (let i = 0; i < 8; i++) {
                const a = (i / 8) * Math.PI * 2;
                struts.push([
                    { x: 0, y: 0 },
                    { x: Math.cos(a) * r * 0.85, y: Math.sin(a) * r * 0.85 },
                ]);
            }
            break;
        }
        case 'STALKER': { // Cross/plus
            const armLen = r * 1.05;
            const armW = r * 0.3;
            // outline of a plus shape (12 verts)
            verts.push(
                { x: -armW, y: -armLen }, { x: armW, y: -armLen },
                { x: armW, y: -armW },    { x: armLen, y: -armW },
                { x: armLen, y: armW },   { x: armW, y: armW },
                { x: armW, y: armLen },   { x: -armW, y: armLen },
                { x: -armW, y: armW },    { x: -armLen, y: armW },
                { x: -armLen, y: -armW }, { x: -armW, y: -armW },
            );
            // cross-brace through center
            struts.push([{ x: -armLen, y: 0 }, { x: armLen, y: 0 }]);
            struts.push([{ x: 0, y: -armLen }, { x: 0, y: armLen }]);
            // arm-tip caps
            struts.push([{ x: -armW, y: -armLen * 0.7 }, { x: armW, y: -armLen * 0.7 }]);
            struts.push([{ x: -armW, y:  armLen * 0.7 }, { x: armW, y:  armLen * 0.7 }]);
            struts.push([{ x: -armLen * 0.7, y: -armW }, { x: -armLen * 0.7, y: armW }]);
            struts.push([{ x:  armLen * 0.7, y: -armW }, { x:  armLen * 0.7, y: armW }]);
            break;
        }
        default: { // Generic 6-sided hull
            const sides = 6;
            for (let i = 0; i < sides; i++) {
                const a = (i / sides) * Math.PI * 2;
                verts.push({ x: Math.cos(a) * r, y: Math.sin(a) * r });
            }
            const inner = r * 0.5;
            for (let i = 0; i < sides; i++) {
                const a = (i / sides) * Math.PI * 2 + Math.PI / sides;
                const a2 = a + Math.PI * 2 / sides;
                struts.push([
                    { x: Math.cos(a) * inner, y: Math.sin(a) * inner },
                    { x: Math.cos(a2) * inner, y: Math.sin(a2) * inner },
                ]);
            }
            // radial spokes
            for (let i = 0; i < sides; i++) {
                const a = (i / sides) * Math.PI * 2;
                struts.push([
                    { x: 0, y: 0 },
                    { x: Math.cos(a) * r * 0.7, y: Math.sin(a) * r * 0.7 },
                ]);
            }
            break;
        }
    }

    // Helper: emit one fragment with high outward velocity + tangential
    // spin. p1, p2 are local-space endpoints; cx/cy is the local-space
    // origin used to compute outward direction (typically the segment
    // midpoint). The piece's world-space spawn point is enemy.{x,y};
    // LineDebris stores p1/p2 in local space and renders rotated.
    const SPEED_MUL = 2.6;       // overall outward velocity boost
    const SPEED_JITTER = 1.5;    // per-piece random multiplier on top
    const TAN_RATIO = 0.35;      // tangential / radial speed ratio
    const ROT_MUL = 2.4;         // tumble-rate multiplier
    const emit = (p1, p2) => {
        const piece = this.lineDebrisPool.get(enemy.x, enemy.y, p1, p2, color);
        if (!piece) return;
        // Outward radial direction = midpoint normal.
        const mx = (p1.x + p2.x) * 0.5;
        const my = (p1.y + p2.y) * 0.5;
        const len = Math.hypot(mx, my) || 1;
        const ox = mx / len;
        const oy = my / len;
        const speed = SPEED_MUL * (1 + (Math.random() - 0.5) * SPEED_JITTER);
        // Tangential direction = perpendicular to radial (signed random).
        const tanSign = Math.random() < 0.5 ? -1 : 1;
        const tx = -oy * tanSign;
        const ty =  ox * tanSign;
        const tanSpeed = speed * TAN_RATIO * Math.random();
        piece.vel.x = ox * speed + tx * tanSpeed;
        piece.vel.y = oy * speed + ty * tanSpeed;
        piece.rotVel *= ROT_MUL;
    };

    // Helper: subdivide a segment and emit BOTH halves as separate
    // fragments. Doubles debris count without changing the hull layout.
    const fragmentEdge = (p1, p2) => {
        const mid = { x: (p1.x + p2.x) * 0.5, y: (p1.y + p2.y) * 0.5 };
        emit(p1, mid);
        emit(mid, p2);
    };

    // Outline edges — fragment all of them (the ship's HULL is what the
    // player sees ripping apart).
    for (let i = 0; i < verts.length; i++) {
        const p1 = verts[i];
        const p2 = verts[(i + 1) % verts.length];
        fragmentEdge(p1, p2);
    }
    // Internal struts — half fragmented (long ones) for visual variety.
    for (let i = 0; i < struts.length; i++) {
        const [p1, p2] = struts[i];
        const segLen = Math.hypot(p1.x - p2.x, p1.y - p2.y);
        if (segLen > r * 0.6) {
            fragmentEdge(p1, p2);
        } else {
            emit(p1, p2);
        }
    }
}

// ── Orb Creation & Drops ──

// Spawn one health orb. If `healAmountOverride` is provided, that exact heal
// value is used (the splitter in dropOrbsFromEntity uses this to spread a heal
// budget across many small, capped orbs). Otherwise the historical random
// min..max formula applies. Size scales with heal-relative-to-cap so capped
// orbs always look modest, never enormous.
export function createHealthOrb(x, y, healAmountOverride = null) {
    const healthOrb = this.colorStarPool.get(x, y, 'health');
    if (!healthOrb) return;

    let healAmount;
    if (healAmountOverride !== null) {
        healAmount = Math.max(1, healAmountOverride);
    } else {
        // 6.0.0 — Player level retired; heal amount now scales with the
        // current WAVE. Same curve shape as the 5.78.2 player-level
        // version (W1 base, W30 = +17 min / +21 max).
        const wave = Math.max(1, (this.game?.currentWave | 0) || 1);
        const wBonus = Math.floor((wave - 1) * 0.6);
        const minHeal = GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MIN + wBonus;
        const maxHeal = Math.max(minHeal,
            GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MAX + wBonus + Math.floor((wave - 1) * 0.15));
        healAmount = Math.floor(Math.random() * (maxHeal - minHeal + 1)) + minHeal;
        // 6.0.1 — FIELD_RATIONS magnitude bonus, capped so the heal-
        // multiplier stack stays sane when combined with FIELD_SURGEON.
        // Multiplier band: +30% / stack (cap 3 → +90%). FIELD_SURGEON
        // adds another +50% additively (not multiplicatively) at
        // collection time. Hard cap across all sources = 2.0×.
        const rationStacks = this.player.getPowerupStacks
            ? this.player.getPowerupStacks('FIELD_RATIONS') : 0;
        if (rationStacks > 0) {
            const mult = Math.min(2.0, 1 + rationStacks * 0.30);
            healAmount = Math.max(1, Math.round(healAmount * mult));
        }
    }
    healthOrb.healAmount = healAmount;

    // 5.74.7 — orb radius is now derived directly from heal amount (linear
    // map 1..cap → SIZE_MIN..SIZE_MAX in pixels). Bypasses the random
    // parallax-z baseRadius randomization in ColorStar.reset so the SIZE
    // constants are the SOLE controls for orb sizing — bigger orb = more
    // heal, every time.
    const cap = GAME_CONFIG.HEALTH_ORB_MAX_HEAL_PER_ORB;
    const ratio = Math.min(1, Math.max(0, (healAmount - 1) / Math.max(1, cap - 1)));
    const minSize = GAME_CONFIG.HEALTH_ORB_SIZE_MIN;
    const maxSize = GAME_CONFIG.HEALTH_ORB_SIZE_MAX;
    healthOrb.radius = minSize + ratio * (maxSize - minSize);
    healthOrb.baseRadius = healthOrb.radius;
    healthOrb.sizeVariation = 1; // Render path multiplies by sizeVariation; pin to 1 so the SIZE constants govern alone.

    const angle = random(0, Math.PI * 2);
    const speed = random(1, 3);
    healthOrb.vel.x = Math.cos(angle) * speed;
    healthOrb.vel.y = Math.sin(angle) * speed;
}

// 5.79.27 — `isPixel` flag splits the gold-orb path into "shape orb"
//   (full visual treatment, value-scaled size) and "pixel particle"
//   (tiny dot, low value, many per drop). Both stay collectible — the
//   player scoops everything up — but visually a drop reads as a few
//   chunky orbs surrounded by a coin shower.
// 5.79.32 — Money orbs (gold) live in goldCoinPool / goldShapePool —
//   two independent classes, each with its own drift + lifetime + blink
//   logic. The old pool's orbs were homing collectibles; the new types
//   drift instead, blink-fade after 120s, and only respond to the
//   tractor beam when engaged. createMoneyOrb keeps the legacy
//   (x, y, amountOverride, isPixel) signature so existing callers
//   (dropStarsFromEntity, the splitter) keep working unchanged.
export function createMoneyOrb(x, y, moneyAmountOverride = null, isPixel = false) {
    let moneyAmount;
    if (moneyAmountOverride !== null) {
        moneyAmount = Math.max(1, moneyAmountOverride);
    } else {
        // 6.0.0 — wave-based money scaling (was player.level).
        const wave = Math.max(1, (this.game?.currentWave | 0) || 1);
        const minBonus = (wave - 1) * 3;
        const maxBonus = (wave - 1) * 5;
        const minMoney = GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MIN + minBonus;
        const maxMoney = Math.max(minMoney, GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MAX + maxBonus);
        moneyAmount = Math.floor(Math.random() * (maxMoney - minMoney + 1)) + minMoney;
    }

    if (isPixel) {
        const coin = this.goldCoinPool.get(x, y, moneyAmount);
        return coin;
    }
    const shape = this.goldShapePool.get(x, y, moneyAmount);
    return shape;
}

// P6 — Harvest passive: enemies killed by status DoT yield bonus power energy
// plus a gold orb. Called ONLY from the DoT-death finalize branch in
// Enemy.update(), which is the status-kill path (burn / bleed / poison ticks),
// so this is implicitly gated to status kills — no extra status check needed.
const HARVEST_ENERGY = 8;
const HARVEST_GOLD = 6;
export function harvestBonus(enemy) {
    const p = this.player;
    if (!p || typeof p.hasPassive !== 'function' || !p.hasPassive('HARVEST')) return;
    if (typeof p.addEnergy === 'function') p.addEnergy(HARVEST_ENERGY);
    if (typeof this.createMoneyOrb === 'function') {
        const x = enemy ? enemy.x : (p.x || 0);
        const y = enemy ? enemy.y : (p.y || 0);
        this.createMoneyOrb(x, y, HARVEST_GOLD, false);
    }
}

// 6.16.1 — Drop split rebalanced: fewer chunky shapes, more pixel
//   pieces, and pixels now CARRY VALUE instead of being pure cosmetic.
//   The prior 1-3 shapes layout meant late-game drops (where gold-find
//   + streak + enemy multipliers reliably push past the DROP_BUDGET_MAX
//   cap) almost always emitted 3 shapes on top of a small pixel
//   scatter — visually busy, and the shapes piled into a clump.
//
//   New rules:
//     ≤ SHAPE_VALUE_MAX (200) → 1 shape  (typical drop)  → 10 pixels
//     >  SHAPE_VALUE_MAX       → 2 shapes (big drops)    → 12 pixels
//   3-shape drops removed entirely. SHAPE_VALUE_MAX raised from 80 to
//   200 (constants.js) so a single shape can carry most of the budget.
//   Whatever budget the shapes can't absorb spills into the pixel
//   scatter, with per-pixel value distributed evenly. The pixel value
//   is what gives big drops their punch — the visual is a single
//   chunky jewel surrounded by a glittering coin shower.
function _splitMoneyDrop(total, profile = null) {
    if (total <= 0) return { shapes: [], pixels: [] };

    // 6.18.0 — Boss drops use the higher budget cap so platinum-tier
    //   shapes can actually fire.
    const isBoss = profile && profile.budgetMult >= 2.0;
    const dropMax = isBoss
        ? GAME_CONFIG.MONEY_ORB_DROP_BUDGET_MAX_BOSS
        : GAME_CONFIG.MONEY_ORB_DROP_BUDGET_MAX;
    total = Math.min(total, dropMax);

    const shapeCap = GAME_CONFIG.MONEY_ORB_SHAPE_VALUE_MAX;
    // 6.18.0 — Profile-driven minimum shape count. Bosses guarantee
    //   1 shape minimum; grunts (minShape=0) may emit pixel-only when
    //   the budget is tiny.
    const minShape = profile ? (profile.minShape | 0) : 1;
    let shapeN;
    if (minShape === 0 && total <= shapeCap * 0.4) shapeN = 0;
    else if (total <= shapeCap) shapeN = Math.max(1, minShape);
    else shapeN = 2;

    // Shapes absorb up to (shapeCap × shapeN). Anything beyond rolls
    //   into the pixel scatter as real value-bearing coins.
    const shapeBudget = Math.min(total, shapeCap * shapeN);
    const shapes = shapeN > 0 ? _evenSplitClamped(shapeBudget, shapeN, shapeCap) : [];

    const remainder = Math.max(0, total - shapeBudget);
    const profilePixelBonus = profile ? (profile.pixelBonus | 0) : 0;
    // Base 10-12 pieces from shape count; profile adds extras so
    //   bosses sparkle bigger and grunts scatter more confetti.
    const pixelCount = Math.min(
        GAME_CONFIG.MONEY_ORB_PIXEL_COUNT_MAX,
        Math.max(6, 8 + shapeN * 2 + profilePixelBonus)
    );
    let pixels;
    if (remainder > 0) {
        // Split remainder evenly across pixels, distributing the
        //   round-off so total pixel value === remainder exactly.
        const base = Math.floor(remainder / pixelCount);
        const leftover = remainder - base * pixelCount;
        pixels = new Array(pixelCount);
        for (let i = 0; i < pixelCount; i++) {
            pixels[i] = Math.max(1, base + (i < leftover ? 1 : 0));
        }
    } else {
        // No remainder — emit pixelCount cosmetic 1g sparkles so the
        //   coin shower reads consistently regardless of drop size.
        pixels = new Array(pixelCount).fill(1);
    }

    return { shapes, pixels };
}

// Like _evenSplit but each slot is hard-capped at `cap`. Any leftover
//   budget that exceeds cap × count is discarded — intentional so the
//   shape size never exceeds MONEY_ORB_SHAPE_SIZE_MAX.
function _evenSplitClamped(total, count, cap) {
    if (total <= 0 || count <= 0) return [];
    const capped = Math.min(total, cap * count);
    const base = Math.floor(capped / count);
    const remainder = capped - base * count;
    const out = new Array(count);
    for (let i = 0; i < count; i++) {
        out[i] = Math.min(cap, Math.max(1, base + (i < remainder ? 1 : 0)));
    }
    return out;
}

// 5.81.1 — Legacy splash-kill drop path (used by explosive bullet
//   AOE in player/bullet.js). Now spawns ONE chunky shape orb per
//   splash kill (was: 5 floating pixel coins, removed alongside the
//   pixel-coin swarm in the same version). The primary kill still
//   goes through dropOrbsFromEntity and gets its own 1-3 shapes; the
//   splash bonus adds one more distinct piece per AOE-killed target,
//   capped naturally by enemy count rather than by per-drop budget.
//   Health orb still spawned here as before — explosive splashes are
//   the legacy "guaranteed health on AOE" path.
export function dropStarsFromEntity(x, y) {
    this.createHealthOrb(x, y);

    // 6.0.0 — wave-based scaling (was player level).
    const wave = Math.max(1, (this.game?.currentWave | 0) || 1);
    const value = Math.max(1, GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MIN + (wave - 1) * 3);
    this.createMoneyOrb(x, y, value, false);
}

export function dropOrbsFromEntity(x, y, entity = null) {
    // 6.0.0 — Player leveling retired. Drop scaling now keys off the
    // current WAVE, with three new modulators on the health-drop path:
    //
    //   (1) Desperation curve — drop chance scales up quadratically
    //       as player HP falls. Base k=1.5; TRIAGE_SURGE adds +1.0/stack.
    //       At full HP it's a no-op; at 25% HP it ~doubles the rate.
    //   (2) LUCKY_DROPS — flat +12% drop chance per stack (cap 3).
    //   (3) COMBAT_MEDIC — first kill within 8s of taking damage is a
    //       guaranteed health drop (bypasses cooldown + RNG).
    //
    // FIELD_RATIONS (heal magnitude) is applied inside createHealthOrb.
    // TRIAGE (HEALTH_DROP_FREQUENCY) still shortens the global cooldown.
    const wave = Math.max(1, (this.game?.currentWave | 0) || 1);
    const waveDropRateBonus = (wave - 1) * 0.015;

    // RUN-03 — Reward Dial. ×1.0 for the default 10×3 run; >1.0 for richer
    // runs. 6.x — GOLD no longer reads this (the gold economy is flat +
    // decoupled from level/gear/wave); it still scales the GEAR-drop chance +
    // rarity bias below.
    const runRewardMult = rewardMultiplier(this.game, wave);

    const isEnemy = entity && entity.type && typeof entity.type === 'string';
    const enemyDropRateBonus = isEnemy ? 0.15 : 0;

    const entityLevel = entity?.level || 1;
    const levelDropRateBonus = (entityLevel - 1) * 0.05;

    // ── Desperation curve (new in 6.0.0) ──
    // Quadratic ramp on (1 - hp%). At full HP, mult = 1. At 25% HP
    // and base k=1.5, mult ≈ 1.84. TRIAGE_SURGE adds +1.0 to k per
    // stack so a fully-invested player at 10% HP can see ~3-4× rates.
    const player = this.player;
    const maxHp = (typeof player.getEffectiveMaxHealth === 'function')
        ? player.getEffectiveMaxHealth() : (player.maxHealth || 1);
    const hpPct = Math.max(0, Math.min(1, (player.health || 0) / Math.max(1, maxHp)));
    const surgeStacks = player.getPowerupStacks
        ? player.getPowerupStacks('TRIAGE_SURGE') : 0;
    const desperationK = GAME_CONFIG.HEALTH_DROP_DESPERATION_K_BASE
        + surgeStacks * GAME_CONFIG.HEALTH_DROP_DESPERATION_K_PER_STACK;
    const desperationMult = 1 + desperationK * Math.pow(1 - hpPct, 2);

    // LUCKY_DROPS — flat chance booster (cap 3 stacks → +36%).
    const luckyStacks = player.getPowerupStacks
        ? player.getPowerupStacks('LUCKY_DROPS') : 0;
    const luckyAdd = luckyStacks * 0.12;

    const baseHealthDropRate = (GAME_CONFIG.HEALTH_ORB_BASE_DROP_RATE
        + waveDropRateBonus + levelDropRateBonus + enemyDropRateBonus
        + luckyAdd) * desperationMult;
    const healthDropRate = Math.min(1.0, baseHealthDropRate);

    // ── Health orbs ──
    // Global cooldown gate. Triage stacks shorten the cooldown; when
    // the player is below 25% HP, the cooldown floor drops further
    // (desperation also reaches into cadence, not just chance).
    const now = Date.now();
    const triageStacks = player.getPowerupStacks('HEALTH_DROP_FREQUENCY');
    let healthCooldown = Math.max(
        GAME_CONFIG.HEALTH_DROP_COOLDOWN_MIN,
        GAME_CONFIG.HEALTH_DROP_COOLDOWN_BASE
            - triageStacks * GAME_CONFIG.HEALTH_DROP_COOLDOWN_REDUCTION_PER_STACK
    );
    if (hpPct <= 0.25) healthCooldown = Math.floor(healthCooldown * 0.5);
    const healthCooldownReady = (now - (this.lastHealthOrbDropAt || 0)) >= healthCooldown;

    // COMBAT_MEDIC — first kill within 8s of taking damage drops a
    // guaranteed health orb (cooldown 8s after the trigger fires).
    let combatMedicForce = false;
    const medicStacks = player.getPowerupStacks
        ? player.getPowerupStacks('COMBAT_MEDIC') : 0;
    if (medicStacks > 0 && isEnemy) {
        const lastHit = player._lastDamageAt || 0;
        const sinceMedicTrigger = now - (this._lastCombatMedicAt || 0);
        if (lastHit > 0 && (now - lastHit) <= 8000 && sinceMedicTrigger >= 8000) {
            combatMedicForce = true;
            this._lastCombatMedicAt = now;
        }
    }

    if (combatMedicForce || (healthCooldownReady && Math.random() < healthDropRate)) {
        this.createHealthOrb(x, y);
        this.lastHealthOrbDropAt = now;
    }

    // ── Item drops (6.x — left-edge loot feed) ──
    // Five slots across HP (cockpit/hull), toughness (shielding/chassis),
    // and trinket (nanites). Three independent rolls per enemy kill. Boss
    // kills bias rarity toward rare+ and bump base rates. Drops no longer
    // spawn world-space pickup orbs — each roll is registered into the
    // player's left-edge loot feed (player.registerItemDrop), which
    // auto-equips it if it beats the slot. ALL drops are kept (not just
    // upgrades) so the 'I' inventory can re-equip a past one.
    if (isEnemy && player && typeof player.registerItemDrop === 'function') {
        const boss = !!(entity && entity.isBoss);
        // P6 — Scavenger passive: +50% item (gear) drop rate.
        const dropMult = (player.hasPassive && player.hasPassive('SCAVENGER')) ? 1.5 : 1;
        // RUN-03 — Reward Dial scales gear-drop CHANCE (each rate clamped
        // ≤ 1.0 in tryRoll) and nudges the RARITY BIAS upward. For the
        // default run runRewardMult === 1.0 → both are exact no-ops.
        const hpRate     = (boss ? 0.085 : 0.025) * dropMult * runRewardMult;
        const toughRate  = (boss ? 0.075 : 0.020) * dropMult * runRewardMult;
        const trinkRate  = (boss ? 0.060 : 0.015) * dropMult * runRewardMult;
        // Conservative rarity-bias nudge: half the dial's "extra" folds into
        // the rollRarity bossBias (0..1). +0 on default runs.
        const rewardRarityBias = Math.max(0, (runRewardMult - 1) * 0.5);
        const bonusRare  = (boss ? 0.10  : 0) + rewardRarityBias;
        const bonusEpic  = boss ? 0.08  : 0;

        const tryRoll = (slot, rate) => {
            if (Math.random() >= Math.min(1.0, rate)) return;
            const rarity = rollRarity(bonusRare, bonusEpic);
            const item = createItem(slot, wave, rarity);
            player.registerItemDrop(item);
        };

        tryRoll(Math.random() < 0.5 ? 'cockpit' : 'hull', hpRate);
        tryRoll(Math.random() < 0.5 ? 'shielding' : 'chassis', toughRate);
        tryRoll('nanites', trinkRate);

        // T31 — Weapon loot (jackpot). A RARE weapon-as-loot drop, rarer than
        // gear; boss/elite kills are much likelier and biased to higher rarity.
        // The rolled weapon ITEM rides the same loot feed / stash as gear via a
        // synthetic slot (item-system.createWeaponItem) and equips in the ARMORY.
        const weaponRate = (boss ? 0.05 : (entity && entity.isElite) ? 0.02 : 0.006) * dropMult * runRewardMult;
        if (Math.random() < Math.min(1.0, weaponRate)) {
            const rarity = rollRarity(bonusRare + (boss ? 0.12 : 0.03), bonusEpic);
            player.registerItemDrop(createWeaponItem(wave, rarity));
        }
    }

    // ── Rainshard income (T29 — wave/difficulty/streak/find faucet, §2.4) ──
    // per-kill R$ = BASE × waveScale(wave) × difficultyMult × killstreakMult ×
    // findMult. This REPLACES the 6.x flat model: late kills now pay MORE (so
    // deep runs fund crafting) and harder modes pay MORE, while the killstreak
    // multiplier keeps a skill axis and the gear/Matrix R$-find stat a build
    // axis. Boss/elite kills layer a milestone multiple ON TOP.
    const mode = (this.game.runConfig && this.game.runConfig.mode) || 'NORMAL';
    const difficultyMult = INCOME.difficultyMult[mode] || 1;
    const killstreakMult = getStreakGoldMult(this.killStreakCount || 0);
    const findMult = (player && typeof player.getGoldFindMultiplier === 'function')
        ? player.getGoldFindMultiplier() : 1;
    const perKill = perKillRainshards({ wave, difficultyMult, killstreakMult, findMult });
    // Small ±15% variance so drops aren't identical (loot texture, no creep).
    const vary = (v) => Math.max(1, Math.round(v * (0.85 + Math.random() * 0.30)));
    if (isEnemy) {
        if (entity.isBoss) {
            // Boss bounty = a milestone multiple of a normal kill (tiers 1-4),
            // so it scales with the same wave/difficulty curve instead of going
            // cheap late.
            const tier = Math.max(1, Math.min(4, (entity.bossTier | 0) || 1));
            const BOSS_MULT = { 1: 6, 2: 9, 3: 13, 4: 18 };
            this.createMoneyOrb(x, y, vary(perKill * BOSS_MULT[tier]), false);
        } else {
            // Elite kills (when an enemy is flagged isElite — wired in T32/T34)
            // pay a small multiple; ordinary kills pay 1×.
            const eliteMult = entity.isElite ? 3 : 1;
            this.createMoneyOrb(x, y, vary(perKill * eliteMult), false);
        }
    } else if (Math.random() < 0.55) {
        // Asteroids: a minor fraction of a kill (still scales with depth so it
        // never goes trivial late); ~10% pay a bigger chunk.
        const big = Math.random() < 0.10;
        this.createMoneyOrb(x, y, vary(perKill * (big ? 0.30 : 0.12)), false);
    }
}

// ── Powerups ──

export function dropPowerup(x, y, type = null) {
    const powerup = this.powerupPool.get(x, y, type);
    if (powerup) {
        const angle = random(0, Math.PI * 2);
        const speed = random(0.5, 1.5);
        powerup.vel.x = Math.cos(angle) * speed;
        powerup.vel.y = Math.sin(angle) * speed;
    }
    return powerup;
}

export function collectPowerup(powerup) {
    if (!this.player || !this.player.active) return;

    this.player.addPowerup(powerup.type, powerup.config);

    // Visual feedback
    this.particlePool.get(powerup.x, powerup.y, 'pickupPulse');
    for (let i = 0; i < 8; i++) {
        const particle = this.particlePool.get(powerup.x, powerup.y, 'starSparkle');
        if (particle) {
            particle.color = powerup.color;
            const angle = (i / 8) * Math.PI * 2;
            particle.vel.x = Math.cos(angle) * 2;
            particle.vel.y = Math.sin(angle) * 2;
        }
    }

    this.events.emit('audio:powerup');
    this.showPowerupDisplay(powerup.config.name, powerup.powerupColor, powerup.config.description);
}

export function showPowerupDisplay(name, color, description = '') {
    this.powerupDisplay.active = true;
    this.powerupDisplay.text = name.toUpperCase();
    this.powerupDisplay.description = description || '';
    this.powerupDisplay.color = color;
    this.powerupDisplay.opacity = 1.0;
    this.powerupDisplay.fadeTimer = this.powerupDisplay.maxFadeTime;
}

// 5.79.62 — Three-tier resolver. Each tier is a registry that owns
//   its data, so there's no parallel copy to keep in sync:
//     1. POWERUP_TYPES        — offensive powerups (world/powerup.js)
//     2. DEFENSE_CONFIGS      — defense items (combat/defense-data.js)
//     3. weapon-data fallback — every upgrade tree (PRIMARY/POWER/ABILITY)
//   Display name uses `displayName` (POWERUP_TYPES) so the toast keeps
//   reading "Rapid Fire" rather than the card-shorthand "Rapid".
//   The CHARGE_SPEED / CHARGE_POWER entries that used to live in a
//   local table here were dropped — every weapon-data icon is already
//   a slug (audited: 79/79), so the fallback returns them correctly
//   without the explicit override.
export function getPowerupConfig(type) {
    // 1) POWERUP_TYPES — offensive powerups.
    const cfg = POWERUP_TYPES[type];
    if (cfg) {
        return {
            name: cfg.displayName || cfg.name,
            description: cfg.description || '',
            duration: Infinity,
            icon: cfg.icon,
            gradientColors: cfg.gradientColors,
        };
    }
    // 2) DEFENSE_CONFIGS — defense items (HEALTH_BOOST, SHIELD_BOOST,
    //    SPEED_BOOST, HEALTH_DROP_FREQUENCY, REFLEXES, LAST_STAND,
    //    STATIC_FIELD, SPARE_SHIP). Same source the DEFENSE shop tab
    //    pulls from when active, so the pickup banner and the shop
    //    tile read the exact same metadata.
    const dcfg = DEFENSE_CONFIGS[type];
    if (dcfg) {
        return {
            name: dcfg.name,
            description: dcfg.description,
            duration: Infinity,
            icon: dcfg.icon,
            gradientColors: dcfg.gradientColors,
        };
    }
    // 3) Weapon / ability upgrades from weapon-data.js — pass through
    //    the upgrade's description so the pickup blurb shows the same
    //    one-liner used in the shop.
    const allUpgrades = { ...PRIMARY_UPGRADES, ...POWER_UPGRADES, ...ABILITY_UPGRADES };
    if (allUpgrades[type]) {
        const upg = allUpgrades[type];
        return {
            name: upg.name,
            description: upg.description || '',
            duration: Infinity,
            icon: upg.icon,
            gradientColors: ['#aaaaff', '#4444aa'],
        };
    }
    return null;
}

// ── Kill Streaks ──

// E8e — split-on-death helpers (HYDRA). Pure, so they unit-test cleanly.
/** True if `enemy` should split on death (has the config + under the gen cap). */
export function shouldSplit(enemy) {
    return !!(enemy && enemy.splitOnDeath && (enemy.splitGen || 0) < enemy.splitOnDeath.maxGen);
}
/** Child ling spec: next generation + scaled health/radius from the parent. */
export function splitChildSpec(splitOnDeath, parentMaxHealth, parentRadius, parentGen) {
    return {
        gen: (parentGen || 0) + 1,
        health: Math.max(1, Math.round((parentMaxHealth || 10) * splitOnDeath.healthMul)),
        radius: (parentRadius || 20) * splitOnDeath.sizeMul,
    };
}

// P6 — Flow State passive: each kill shaves a fraction off every ability's
// REMAINING cooldown (a fraction of that slot's max cooldown, so longer
// abilities recover more absolute time per kill). Pure + in-place so the math
// unit-tests cleanly; onEnemyKill owns the per-kill trigger.
export const FLOW_STATE_FRACTION = 0.03;

// T9 — Sanguine: fraction of effective max HP healed per enemy kill (4%). A pure
// constant + helper so the heal math unit-tests cleanly; onEnemyKill owns the
// per-kill trigger and gates it on the passive (default-safe).
export const SANGUINE_HEAL_FRAC = 0.04;
export function sanguineHealAmount(maxHp, frac = SANGUINE_HEAL_FRAC) {
    if (!(maxHp > 0)) return 0;
    return maxHp * frac;
}

// CD-04 (T2) — Life-on-Kill powerup: small FLAT heal per enemy kill while held.
// A powerup sibling of the Sanguine passive's % heal — kept flat (and small) so
// the two stack sanely. onEnemyKill owns the per-kill trigger, gated on the
// powerup being held (default-safe: no powerup → no heal).
export const LIFE_ON_KILL_HEAL = 3;
export function flowStateReduce(cooldowns, maxes, frac = FLOW_STATE_FRACTION) {
    if (!Array.isArray(cooldowns) || !Array.isArray(maxes)) return;
    for (let i = 0; i < cooldowns.length; i++) {
        if (cooldowns[i] > 0) {
            cooldowns[i] = Math.max(0, cooldowns[i] - (maxes[i] || 0) * frac);
        }
    }
}

export function onEnemyKill(enemy) {
    if (!this.killCount) this.killCount = 0;
    if (!this.killStreakTimer) this.killStreakTimer = 0;
    if (!this.killStreakCount) this.killStreakCount = 0;

    this.killCount++;
    this.killStreakCount++;
    this.killStreakTimer = Date.now();

    // P6 — Flow State: each kill cuts every ability's remaining cooldown.
    if (this.player && this.player.hasPassive && this.player.hasPassive('FLOW_STATE')) {
        flowStateReduce(this.player.abilityCooldowns, this.player.abilityCooldownsMax);
    }

    // CD-11 — Bloodlust: each kill grants a stack (clamped to the cap) and
    // re-stamps the decay timer; the +damage is read at the damage hook, the
    // decay ticks in player.update. Gated on the passive so a non-Bloodlust
    // player does zero extra work here — default-safe.
    if (this.player && this.player.hasPassive && this.player.hasPassive('BLOODLUST')) {
        this.player.bloodlustStacks = Math.min(
            BLOODLUST_MAX_STACKS, (this.player.bloodlustStacks || 0) + 1);
        this.player._bloodlustRefreshMs = frameClock.now;
    }

    // T9 — Sanguine: each enemy kill heals 4% of effective max HP. Routed
    // through gainHealth so over-heal banks toward a spare tank (Bloodshield).
    // Gated on the passive so a non-Sanguine player does zero extra work here —
    // default-safe. (overkill×2 is SKIPPED: onEnemyKill fires after the enemy is
    // already dead and threads no dealt-damage context, so the overkill amount
    // isn't cleanly available at this hook — ship the flat 4% per the spec.)
    if (this.player && this.player.hasPassive && this.player.hasPassive('SANGUINE')
        && typeof this.player.gainHealth === 'function') {
        const maxHp = (typeof this.player.getEffectiveMaxHealth === 'function')
            ? this.player.getEffectiveMaxHealth() : this.player.maxHealth;
        this.player.gainHealth(sanguineHealAmount(maxHp));
    }

    // CD-04 (T2) — Life-on-Kill powerup: each enemy kill restores a small flat
    // amount of HP. Routed through gainHealth so over-heal banks toward a spare
    // tank (Bloodshield), just like Sanguine. Gated on the powerup being held so
    // a non-holder does zero extra work here — default-safe.
    if (this.player?.getPowerupStacks?.('LIFE_ON_KILL') > 0
        && typeof this.player.gainHealth === 'function') {
        this.player.gainHealth(LIFE_ON_KILL_HEAL);
    }

    // E8b — death flare (ASHEN_DETONATOR and any `deathFlare` enemy): bursts
    // into a Pyro AoE on death, damaging the player if within radius (routed
    // through the standard damage path, so the player's Pyro resistance + the
    // i-frame/dodge checks all apply) + a ring FX. Fires from every kill path
    // since this is the central kill hook. Counterplay: kill it at range.
    if (enemy && enemy.deathFlare && this.player && typeof this.takeDamage === 'function') {
        const fl = enemy.deathFlare;
        const ddx = this.player.x - enemy.x, ddy = this.player.y - enemy.y;
        if (ddx * ddx + ddy * ddy <= fl.radius * fl.radius) {
            this.takeDamage(fl.damage, { source: enemy, fxX: enemy.x, fxY: enemy.y, element: 'PYRO' });
        }
        if (this.particlePool) {
            this.particlePool.get(enemy.x, enemy.y, 'explosionRingColored', fl.radius, '#ff7722');
        }
    }

    // E8e — split-on-death (HYDRA): spawn `count` smaller/weaker lings via the
    // S3 spawn system. `splitGen` caps re-splitting (onSpawn bumps the child's
    // gen + shrinks it). Capped by requestEnemySpawn's concurrent cap.
    if (shouldSplit(enemy) && typeof this.requestEnemySpawn === 'function') {
        const sd = enemy.splitOnDeath;
        const spec = splitChildSpec(sd, enemy.maxHealth || 10, enemy.radius || 20, enemy.splitGen || 0);
        for (let i = 0; i < sd.count; i++) {
            const ang = (i / sd.count) * Math.PI * 2 + Math.random() * 0.5;
            const ox = enemy.x + Math.cos(ang) * 22, oy = enemy.y + Math.sin(ang) * 22;
            this.requestEnemySpawn(enemy.type, ox, oy, { onSpawn: (e) => {
                e.splitGen = spec.gen;
                e.health = spec.health;
                e.maxHealth = spec.health;
                if (typeof e.radius === 'number') e.radius = spec.radius;
            }});
        }
    }

    // 6.35.0 — XP toward the persistent meta level. Bosses are worth a
    // big chunk; regular kills a flat trickle. Tuned slow so a full run
    // is ~3-4 levels early on and reaching 100 is a long cross-run grind.
    if (this.player && typeof this.player.addXp === 'function') {
        const isBoss = !!(enemy && enemy.isBoss);
        this.player.addXp(isBoss ? 120 : 12);
    }

    // 5.74.3 — kill-streak coin bonuses removed. Gold is pickup-only;
    // the streak still grants its damage-tier buff below.

    // Streak damage buff — pick the highest tier the player has reached and
    // (re)apply its multiplier + duration. Each new kill while a buff is
    // active refreshes the timer so sustained streaks stay buffed.
    if (this.player) {
        let tier = null;
        for (const t of STREAK_TIERS) {
            if (this.killStreakCount >= t.kills) tier = t;
        }
        if (tier) {
            const wasNewTier = this.player.streakTierLabel !== tier.label;
            // P6 — Killing Spree passive: doubles the streak damage BONUS (the
            // "+×%" over 1.0). The "no reset on hit" half is already the game's
            // behavior (the streak decays on a timer, not on hit).
            const _ks = !!(this.player.hasPassive && this.player.hasPassive('KILLING_SPREE'));
            this.player.streakDamageMult = killingSpreeMult(tier.mult, _ks);
            this.player.streakBuffEndTime = Date.now() + STREAK_BUFF_DURATION;
            this.player.streakTierLabel = tier.label;
            // Notification fires only when crossing INTO a higher tier so
            // we don't spam every kill.
            if (wasNewTier) {
                this.queueNotification(tier.label,
                    `+${Math.round((tier.mult - 1) * 100)}% damage`, 1800);
            }
        }
    }

    const milestones = { 1: 'FIRST BLOOD', 25: '25 KILLS', 50: 'HALF CENTURY',
        100: 'CENTURION', 200: 'DESTROYER', 500: 'ANNIHILATOR' };
    if (milestones[this.killCount]) {
        this.queueNotification(milestones[this.killCount],
            `${this.killCount} targets destroyed`, 2500);
    }

    // CASCADE — killing a STUNNED enemy stuns nearby enemies, chaining
    // the EMP lockdown. Only fires if the slain enemy was still stunned.
    if (enemy && enemy.stunUntil && enemy.stunUntil > frameClock.now
        && this.player && this.player.getPowerupStacks
        && this.player.getPowerupStacks('CASCADE') > 0
        && this.enemyPool && typeof this.applyStun === 'function') {
        const CASCADE_RADIUS = 160;
        const dur = (ABILITIES.EMP_PULSE && ABILITIES.EMP_PULSE.duration) || 2000;
        for (const e of this.enemyPool.activeObjects) {
            if (!e.active || e === enemy) continue;
            const dist = Math.hypot(e.x - enemy.x, e.y - enemy.y);
            if (dist <= CASCADE_RADIUS) this.applyStun(e, dur);
        }
    }

    // BOSS-04 — modular boss death. A boss spawned from a `bosses/*` descriptor
    // carries `bossId` + a cached death-script builder. On its kill:
    //   • arm the chassis DEATH sequence (boss-fx.js reads it → detonation FX +
    //     camera shake play over the next ~3-4s).
    //   • if it's THE final boss (Prismarch), route the run to GAME_COMPLETE via
    //     the existing completeRun path. Guarded so it fires once.
    if (enemy && enemy.bossId && enemy.isBoss && !enemy._bossDeathArmed) {
        enemy._bossDeathArmed = true;
        if (typeof enemy._buildBossDeathScript === 'function') {
            try { initBossDeath(enemy, enemy._buildBossDeathScript(), this, Date.now()); }
            catch (err) { console.error('boss death sequence failed', err); }
        }
        if (this.game && this.game.stats) this.game.stats.bossesKilled = (this.game.stats.bossesKilled | 0) + 1;
        if (enemy.isFinalBoss && !this._finalBossDefeated) {
            this._finalBossDefeated = true;
            // Mirror the wave-clear→run-complete flow so the GAME_COMPLETE
            // state + gold banking fire even though the boss died mid-wave
            // rather than on the wave-clear gate.
            this.game.waveComplete = true;
            this.game.state = GAME_STATES.WAVE_TRANSITION;
            if (typeof this.completeRun === 'function') this.completeRun();
        }
    }

    // 5.75.0 — mission progress hooks.
    if (typeof this.checkMissionOnKill === 'function') this.checkMissionOnKill();
}

// 5.74.18 — kill-streak now decays on inactivity rather than on damage.
// If no kill / asteroid destruction lands within STREAK_IDLE_TIMEOUT_MS
// the count resets to zero and the buff clears. Damage paths still call
// `_breakKillStreak()` for back-compat but the engine implementation is
// now a no-op.
const STREAK_IDLE_TIMEOUT_MS = 10000;

export function updateKillStreak() {
    const now = Date.now();
    // Streak buff (the damage multiplier) decays after STREAK_BUFF_DURATION
    // ms with no fresh kill — independent shorter window for the *buff*
    // versus the *count*. Count survives until the 30s idle timeout below.
    if (this.player && this.player.streakDamageMult > 1 &&
        now > this.player.streakBuffEndTime) {
        this.player.streakDamageMult = 1;
        this.player.streakTierLabel = null;
    }

    // Idle reset: 30s with no kill / asteroid destroy zeroes the count.
    if (this.killStreakCount > 0 && this.killStreakTimer &&
        now - this.killStreakTimer > STREAK_IDLE_TIMEOUT_MS) {
        this.killStreakCount = 0;
        if (this.player) {
            this.player.streakDamageMult = 1;
            this.player.streakTierLabel = null;
            this.player.streakBuffEndTime = 0;
        }
    }
}

// ── Player-hit visual FX ──
// Per-hit feedback when the player takes damage: radial shrapnel +
// embers + hitstop + camera kick. Caller passes the impact point so
// the kick and shrapnel angle correctly. Scaled by `damage` so a big
// hit feels appropriately bigger than a graze.
//
// 6.17.1 — Screen flash + screen shake removed from this path. The
// per-hit flash made every chip of damage feel like a near-death; the
// shake fired for every bullet ping too. Both are now reserved:
// - Flash: explosion/save ceremonies only (death sequence, Guardian
//   is kept silent on flash too — see tryConsumeGuardian, LAST_STAND).
// - Shake: physical collisions only (player ↔ enemy, player ↔ asteroid),
//   scaled by `finalDamage` at the collision sites themselves.
export function triggerPlayerHitFX(impactX, impactY, damage = 1) {
    if (!this.player || !this.player.active) return;
    const px = this.player.x;
    const py = this.player.y;

    // Severity 0..1 — caps so a one-shot kill doesn't render off-screen.
    const sev = Math.min(1, Math.max(0.4, damage / 25));

    // ── Camera punch (kick + hitstop only — flash/shake removed 6.17.1) ──
    if (typeof this.triggerHitstop === 'function') {
        this.triggerHitstop(3 + Math.floor(sev * 4));
    }
    if (typeof this.triggerCameraKick === 'function') {
        // Kick the camera away from the impact (so it feels like the
        // hit shoved the world). Angle from impact → player.
        const dx = px - impactX;
        const dy = py - impactY;
        const len = Math.hypot(dx, dy) || 1;
        this.triggerCameraKick(dx / len, dy / len, 14 + sev * 14);
    }

    if (!this.particlePool) return;

    // ── Bright impact flash at the player ──
    this.particlePool.get(px, py, 'explosionFlash', 60 + sev * 60);
    this.particlePool.get(px, py, 'explosionRingColored', 90 + sev * 60, '#ff5566');

    // ── Radial shrapnel — red/white/orange mix, scaled count ──
    const shrapCount = 12 + Math.floor(sev * 16);
    for (let i = 0; i < shrapCount; i++) {
        const a = (i / shrapCount) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
        const sp = 3 + Math.random() * (4 + sev * 4);
        const c = i % 4 === 0 ? '#ffffff'
                : i % 4 === 1 ? '#ff5566'
                : i % 4 === 2 ? '#ff9966'
                : '#cc2244';
        this.particlePool.get(px, py, 'explosionShrapnel', a, sp, c);
    }

    // ── Embers — slower lingering motes for the afterglow ──
    const emberCount = 6 + Math.floor(sev * 8);
    for (let i = 0; i < emberCount; i++) {
        const c = i % 2 === 0 ? '#ff6677' : '#ffaa55';
        this.particlePool.get(px, py, 'explosionEmber', c);
    }

    // ── Sparkle dust — tiny twinkling specks scattered around ──
    const sparkCount = 8 + Math.floor(sev * 8);
    for (let i = 0; i < sparkCount; i++) {
        const a = Math.random() * Math.PI * 2;
        const r = Math.random() * 50;
        this.particlePool.get(px + Math.cos(a) * r, py + Math.sin(a) * r, 'starSparkle');
    }
}

// ── Damage Numbers ──

export function createDamageNumber(x, y, damage, opts = {}) {
    // opts: { isCrit?, isEmpowered?, isPlayerHit?, isHeal?, target? }
    //
    // 5.76.0 — damage numbers are AGGREGATED per-target on a 1s window
    //   so 30 hits in a second show as ONE growing number instead of
    //   30 overlapping floaters.
    //
    // 5.79.18 — Crits now also aggregate (was: crits bypassed and
    //   spawned individual floaters). With Scatter Gun firing 5-7
    //   pellets per shot — each independently rolling crit — the
    //   bypass produced 3-5 simultaneous crit numbers per shot. They
    //   pile on top of each other and become unreadable. Now crits
    //   roll into the same per-target accumulator; the merged
    //   floater is marked crit if ANY hit in the window was a crit
    //   (crits are visually distinct via styling in
    //   hud/combat.drawDamageNumbers).
    //   Player-hit floaters still bypass — those are explicit
    //   "you got hit" feedback the player wants discrete.
    //
    // 5.106.0 — `isHeal` floaters render as a green "+N" so the
    //   player can SEE the heal land. REGEN powerup ticks reuse this
    //   path with damage=1, aggregating per-player so a continuous
    //   regen reads as a single growing number, not a +1 spam.
    const isCrit = !!opts.isCrit;
    const isPlayerHit = !!opts.isPlayerHit;
    const isHeal = !!opts.isHeal;
    const target = opts.target || null;
    const now = Date.now();

    // Heal aggregation — passive REGEN fires once per tick and would
    // spam a +1 floater every ~33ms. Aggregate per-player into a
    // single floater that grows while regen is active.
    if (isHeal) {
        if (this._healAggRef && this._healAggRef.life > 0
                && (now - this._healAggStart) < 800) {
            this._healAggRef.damage += Math.round(damage);
            this._healAggRef.x = x;
            this._healAggRef.y = y;
            this._healAggRef.life = Math.max(this._healAggRef.life, 0.7);
            return;
        }
    }

    if (target && !isPlayerHit) {
        if (!this._enemyDmgAggs) this._enemyDmgAggs = new Map();
        const existing = this._enemyDmgAggs.get(target);
        if (existing && existing.dmgRef && existing.dmgRef.life > 0
                && (now - existing.startTime) < 1000) {
            existing.dmgRef.damage += Math.round(damage);
            existing.dmgRef.x = x;
            existing.dmgRef.y = y;
            // If any hit in the window crit, mark the merged floater
            // as a crit so the player still sees the visual upgrade.
            if (isCrit) existing.dmgRef.isCrit = true;
            if (opts.isEmpowered) existing.dmgRef.isEmpowered = true;
            // Refresh life slightly so the floater sticks around for
            // a beat after the last hit lands.
            existing.dmgRef.life = Math.max(existing.dmgRef.life, 0.6);
            return;
        }
    }

    const damageNumber = {
        x: x,
        y: y,
        damage: Math.round(damage),
        life: 1.0,
        maxLife: 1.5,
        isCrit,
        isEmpowered: !!opts.isEmpowered,
        isPlayerHit,
        isHeal,
        // W7 — elemental effectiveness cue: >1 = weakness (bright/bigger,
        // element-tinted), <1 = resisted (small/grey). `elementColor` tints
        // the weakness pop toward the element that worked.
        effectiveness: (opts.effectiveness != null) ? opts.effectiveness : 1,
        elementColor: opts.elementColor || null,
        vel: {
            x: (Math.random() - 0.5) * 2,
            y: -2 - Math.random() * 2
        },
        gravity: 0.1,
        creationTime: now,
    };

    this.damageNumbers.push(damageNumber);

    if (isHeal) {
        this._healAggRef = damageNumber;
        this._healAggStart = now;
    } else if (target && !isPlayerHit) {
        this._enemyDmgAggs.set(target, {
            dmgRef: damageNumber,
            startTime: now,
        });
    }
}

// 5.107.0 — Vampirism: lifesteal a fraction of damage dealt.
//   Called by every site that successfully damages an enemy or
//   asteroid with a player bullet. Pulls the stack count off the
//   player's VAMPIRISM powerup; no-op if zero stacks. The healed
//   amount is clamped to the player's effective max HP, so overflow
//   (e.g. hitting boss enemies for 50 damage while near full HP) is
//   silently discarded — vampirism is a sustain tool, not a tank-
//   progress shortcut. Fires a green "+N" floater via createDamageNumber
//   so the player sees the heal land.
export function applyVampirism(damageDealt) {
    if (!this.player || !(damageDealt > 0)) return 0;
    const stacks = this.player.getPowerupStacks
        ? this.player.getPowerupStacks('VAMPIRISM')
        : 0;
    // 6.32.0 — item vampirism affixes; 6.35.0 — SP VAMPIRISM allocation.
    const itemVamp = this.player.getItemAffixTotal ? this.player.getItemAffixTotal('vampirism') : 0;
    const spVamp = this.player.getSpStatValue ? this.player.getSpStatValue('VAMPIRISM') : 0;
    const lifestealFrac = stacks * 0.05 + (itemVamp + spVamp) / 100; // 5% per stack
    if (lifestealFrac <= 0) return 0;
    const wouldHeal = damageDealt * lifestealFrac;
    if (!(wouldHeal > 0)) return 0;
    // 6.149.0 — route through gainHealth so lifesteal overflow at full HP banks
    // toward a spare tank instead of being clamped away.
    const actualHeal = this.player.gainHealth(wouldHeal).healed;
    if (actualHeal > 0 && typeof this.createDamageNumber === 'function') {
        this.createDamageNumber(
            this.player.x,
            this.player.y - (this.player.radius || 14) - 4,
            actualHeal,
            { isHeal: true },
        );
    }
    return actualHeal;
}

// 5.107.0 — Thorns: reflect a fraction of damage taken back to the
//   source. `source` is the entity that dealt the damage:
//     - enemy ship   → has .takeDamage(amount, opts) + .health
//     - asteroid     → has .health (no takeDamage method)
//     - mine bullet  → enemy-bullet with .health (shape === 'mine')
//     - enemy bullet → no direct shooter, no health. We damage the
//                      nearest active enemy as a proxy "source" so
//                      thorns still has SOMETHING to act on.
//   No-op when stacks=0 or damageTaken<=0. Fires a small reflective
//   sparkle at the source for visual confirmation.
export function applyThorns(damageTaken, source) {
    if (!this.player || !(damageTaken > 0)) return 0;
    const stacks = this.player.getPowerupStacks
        ? this.player.getPowerupStacks('THORNS')
        : 0;
    // 6.32.0 — item thorns affixes; 6.35.0 — SP THORNS allocation.
    const itemThorns = this.player.getItemAffixTotal ? this.player.getItemAffixTotal('thorns') : 0;
    const spThorns = this.player.getSpStatValue ? this.player.getSpStatValue('THORNS') : 0;
    const reflectFrac = stacks * 0.25 + (itemThorns + spThorns) / 100; // 25% per stack
    if (reflectFrac <= 0) return 0;
    const reflected = damageTaken * reflectFrac;
    if (!(reflected > 0)) return 0;

    // Resolve a target object that has health/takeDamage. If `source`
    // is an enemy bullet (no health, no shooter), fall back to the
    // nearest enemy so thorns still does something visible.
    let target = source;
    if (target && target.shape === 'bullet' && target.health === undefined) {
        // Enemy bullet — find nearest enemy as proxy source.
        let best = null;
        let bestD = Infinity;
        if (this.enemyPool) {
            for (const e of this.enemyPool.activeObjects) {
                if (!e.active || e.warping) continue;
                const dx = e.x - this.player.x;
                const dy = e.y - this.player.y;
                const d = dx * dx + dy * dy;
                if (d < bestD) { bestD = d; best = e; }
            }
        }
        target = best;
    }
    if (!target) return 0;

    // Apply damage. enemy.takeDamage owns the death pipeline (flash,
    // streak, etc.) so we prefer it; asteroid + mine just decrement
    // their `health` field and let the next collision tick clean up.
    let didDamage = false;
    if (typeof target.takeDamage === 'function') {
        const destroyed = target.takeDamage(reflected, { isThorns: true });
        didDamage = true;
        if (destroyed && typeof this.onEnemyKill === 'function') {
            this.onEnemyKill(target);
        }
    } else if (target.health !== undefined) {
        target.health = Math.max(0, target.health - reflected);
        didDamage = true;
    }
    if (!didDamage) return 0;

    // Sparkle at the source so the reflection reads visually.
    if (this.particlePool) {
        const sx = target.x ?? this.player.x;
        const sy = target.y ?? this.player.y;
        for (let p = 0; p < 5; p++) {
            const sparkle = this.particlePool.get(sx, sy, 'starSparkle');
            if (sparkle) {
                sparkle.color = '#ff8844';
                sparkle.life = 0.5;
            }
        }
    }
    if (typeof this.createDamageNumber === 'function' && target.x !== undefined) {
        this.createDamageNumber(
            target.x,
            target.y - ((target.radius || target.baseRadius || 14) + 4),
            reflected,
            { target },
        );
    }
    return reflected;
}

// 5.108.0 — Guardian save. Called from each lethal-damage branch in
// collision-system BEFORE the tank/death fallback. If the player owns
// GUARDIAN stacks AND hasn't burned the save this wave, clamp health
// to 1 and grant 2s + stacks×0.5s of invuln. Returns true if the save
// fired so the caller skips the tank-consume / death branch.
export function tryConsumeGuardian() {
    if (!this.player) return false;
    const stacks = this.player.getPowerupStacks
        ? this.player.getPowerupStacks('GUARDIAN')
        : 0;
    if (stacks <= 0) return false;
    if (this.player._guardianUsedWave === this.game.currentWave) return false;
    this.player._guardianUsedWave = this.game.currentWave;
    this.player.health = 1;
    const invulnMs = 2000 + stacks * 500;
    if (typeof this.player.makeInvincible === 'function') {
        this.player.makeInvincible(invulnMs);
    } else {
        this.player.invincible = true;
        this.player.invincibleTimer = invulnMs;
    }
    if (this.events?.emit) {
        this.events.emit('audio:shield');
        this.events.emit('ui:show-message', {
            title: 'GUARDIAN',
            subtitle: `Saved at 1 HP · ${(invulnMs / 1000).toFixed(1)}s invuln`,
            duration: 1500,
        });
    }
    // 6.17.1 — Guardian flash removed alongside the broader "no flash
    // on damage" rule. The audio cue + UI banner + sparkles already
    // make the save unmistakable; the white flash was redundant with
    // the LAST_STAND save and added to the per-hit visual noise.
    if (this.particlePool) {
        for (let i = 0; i < 24; i++) {
            const a = (i / 24) * Math.PI * 2;
            const p = this.particlePool.get(this.player.x, this.player.y, 'starSparkle');
            if (p) {
                p.color = '#ffeb44';
                p.vel.x = Math.cos(a) * 5;
                p.vel.y = Math.sin(a) * 5;
                p.life = 0.8;
            }
        }
    }
    if (typeof this.createDamageNumber === 'function') {
        this.createDamageNumber(
            this.player.x,
            this.player.y - (this.player.radius || 14) - 4,
            1,
            { isHeal: true },
        );
    }
    return true;
}

// 5.108.0 — Static Discharge tick. Called every frame from the engine
// update loop. Tracks `_dischargeNextAt` per-player; on cooldown
// expire, damages every enemy/asteroid/mine within a stack-scaled
// radius and spawns a NOVA-blast style expanding ring.
//   Stacks → cooldown(ms) / radius(px) / damage:
//     1 → 4500ms /  90 / 1
//     2 → 3500ms / 120 / 1.5
//     3 → 2500ms / 150 / 2
//     4 → 1800ms / 180 / 2.5
//     5 → 1200ms / 220 / 3
export function tickStaticDischarge() {
    if (!this.player || !this.player.active) return;
    const stacks = this.player.getPowerupStacks
        ? this.player.getPowerupStacks('STATIC_DISCHARGE')
        : 0;
    if (stacks <= 0) return;
    if (this.game.state !== 'playing') return;
    const cdTable    = [4500, 3500, 2500, 1800, 1200];
    const radiusTable = [  90,  120,  150,  180,  220];
    const dmgTable    = [   1,  1.5,    2,  2.5,    3];
    const idx = Math.min(stacks - 1, cdTable.length - 1);
    const cooldown = cdTable[idx];
    const radius   = radiusTable[idx];
    const damage   = dmgTable[idx];

    const now = Date.now();
    if (!this._dischargeNextAt) this._dischargeNextAt = now + cooldown;
    if (now < this._dischargeNextAt) return;
    this._dischargeNextAt = now + cooldown;

    const px = this.player.x;
    const py = this.player.y;
    const r2 = radius * radius;

    // Damage enemies in radius.
    if (this.enemyPool) {
        for (const e of this.enemyPool.activeObjects) {
            if (!e.active || e.warping) continue;
            const dx = e.x - px;
            const dy = e.y - py;
            if (dx * dx + dy * dy > r2) continue;
            const destroyed = e.takeDamage(damage);
            if (destroyed && typeof this.onEnemyKill === 'function') {
                this.onEnemyKill(e);
            }
        }
    }
    // Damage asteroids in radius.
    if (this.asteroidPool) {
        for (const a of this.asteroidPool.activeObjects) {
            if (!a.active) continue;
            const dx = a.x - px;
            const dy = a.y - py;
            if (dx * dx + dy * dy > r2) continue;
            a.health = Math.max(0, (a.health || 0) - damage);
        }
    }
    // Damage mines.
    if (this.enemyBulletPool) {
        for (const m of this.enemyBulletPool.activeObjects) {
            if (!m.active || m.shape !== 'mine' || m.health === undefined) continue;
            const dx = m.x - px;
            const dy = m.y - py;
            if (dx * dx + dy * dy > r2) continue;
            m.health = Math.max(0, m.health - damage);
            if (m.health <= 0) m.active = false;
        }
    }

    // Visual: expanding electric ring at the player position.
    if (this.particlePool) {
        this.particlePool.get(px, py, 'explosionRingColored', radius, '#88aaff');
        for (let i = 0; i < 12; i++) {
            const a = (i / 12) * Math.PI * 2;
            const p = this.particlePool.get(px, py, 'starSparkle');
            if (p) {
                p.color = '#aaccff';
                p.vel.x = Math.cos(a) * 4;
                p.vel.y = Math.sin(a) * 4;
                p.life = 0.6;
            }
        }
    }
    if (this.events?.emit) this.events.emit('audio:explosion');
}

// 5.108.0 — Whirlwind tick. Six particles orbit the player at a
// stack-scaled radius; every WW_DAMAGE_TICK_MS the powerup damages
// every enemy/asteroid/mine inside the orbit radius. Visuals are
// spawned every frame so the orbit reads continuously; damage only
// applies on the discrete tick.
//   Stacks → radius / damage-per-tick (3 ticks/sec):
//     1 →  80 / 1.0
//     2 → 110 / 1.5
//     3 → 140 / 2.0
//     4 → 170 / 2.5
export function tickWhirlwind() {
    if (!this.player || !this.player.active) return;
    const stacks = this.player.getPowerupStacks
        ? this.player.getPowerupStacks('WHIRLWIND')
        : 0;
    if (stacks <= 0) return;
    if (this.game.state !== 'playing') return;
    const idx = Math.min(stacks - 1, 3);
    const radius = [80, 110, 140, 170][idx];
    const damage = [1.0, 1.5, 2.0, 2.5][idx];

    const px = this.player.x;
    const py = this.player.y;
    const t  = Date.now();

    // Visual orbit — six twinkle motes rotating at ~0.6 rev/s. Spawned
    // every frame as short-lived particles so they paint a continuous
    // ring without a dedicated entity class.
    if (this.particlePool) {
        const moteCount = 6;
        const spinHz = 0.6;
        const baseAngle = (t / 1000) * Math.PI * 2 * spinHz;
        for (let i = 0; i < moteCount; i++) {
            const a = baseAngle + (i * Math.PI * 2 / moteCount);
            const sx = px + Math.cos(a) * radius;
            const sy = py + Math.sin(a) * radius;
            const p = this.particlePool.get(sx, sy, 'starSparkle');
            if (p) {
                p.color = '#aaffe0';
                p.life = 0.18;          // brief — overlap next frame's motes
                p.vel.x = 0; p.vel.y = 0;
            }
        }
    }

    // Damage tick — every WW_DAMAGE_TICK_MS (333 ms).
    if (!this._whirlwindNextDmgAt) this._whirlwindNextDmgAt = t + 333;
    if (t < this._whirlwindNextDmgAt) return;
    this._whirlwindNextDmgAt = t + 333;

    const r2 = radius * radius;
    if (this.enemyPool) {
        for (const e of this.enemyPool.activeObjects) {
            if (!e.active || e.warping) continue;
            const dx = e.x - px;
            const dy = e.y - py;
            if (dx * dx + dy * dy > r2) continue;
            const destroyed = e.takeDamage(damage);
            if (destroyed && typeof this.onEnemyKill === 'function') {
                this.onEnemyKill(e);
            }
        }
    }
    if (this.asteroidPool) {
        for (const a of this.asteroidPool.activeObjects) {
            if (!a.active) continue;
            const dx = a.x - px;
            const dy = a.y - py;
            if (dx * dx + dy * dy > r2) continue;
            a.health = Math.max(0, (a.health || 0) - damage);
        }
    }
    if (this.enemyBulletPool) {
        for (const m of this.enemyBulletPool.activeObjects) {
            if (!m.active || m.shape !== 'mine' || m.health === undefined) continue;
            const dx = m.x - px;
            const dy = m.y - py;
            if (dx * dx + dy * dy > r2) continue;
            m.health = Math.max(0, m.health - damage);
            if (m.health <= 0) m.active = false;
        }
    }
}

export function updateDamageNumbers(deltaTime) {
    for (let i = this.damageNumbers.length - 1; i >= 0; i--) {
        const dmgNum = this.damageNumbers[i];

        dmgNum.x += dmgNum.vel.x;
        dmgNum.y += dmgNum.vel.y;
        dmgNum.vel.y += dmgNum.gravity;

        dmgNum.life -= deltaTime / 1000;

        // Remove expired (swap-and-pop to avoid O(n) splice)
        if (dmgNum.life <= 0) {
            this.damageNumbers[i] = this.damageNumbers[this.damageNumbers.length - 1];
            this.damageNumbers.pop();
        }
    }
}

// ── Money Pickup Display ──

export function addMoneyPickup(amount) {
    this.moneyPickupDisplay.amount += amount;
    this.moneyPickupDisplay.displayTime = 0;
}

export function updateMoneyPickupDisplay(deltaTime) {
    if (this.moneyPickupDisplay.amount > 0) {
        this.moneyPickupDisplay.displayTime += deltaTime;

        if (this.moneyPickupDisplay.displayTime >= this.moneyPickupDisplay.maxDisplayTime) {
            this.moneyPickupDisplay.amount = 0;
            this.moneyPickupDisplay.displayTime = 0;
        }
    }
}

// ── Entity Targeting ──

export function setTargetInfo(target) {
    this.targetInfo.active = true;
    this.targetInfo.target = target;
    this.targetInfo.displayTime = 0;
}

export function updateTargetInfo(deltaTime) {
    if (this.targetInfo.active) {
        this.targetInfo.displayTime += deltaTime;
        if (this.targetInfo.displayTime >= this.targetInfo.maxDisplayTime ||
            (this.targetInfo.target && this.targetInfo.target.health <= 0)) {
            this.targetInfo.active = false;
            this.targetInfo.target = null;
        }
    }
}

export function handleEntityTargeting(worldX, worldY) {
    let clickedEntity = null;

    // Check enemies first (higher priority)
    for (const enemy of this.enemyPool.activeObjects) {
        if (!enemy.active) continue;

        const dx = worldX - enemy.x;
        const dy = worldY - enemy.y;
        const distance = Math.hypot(dx, dy);

        if (distance <= enemy.radius + 15) {
            clickedEntity = enemy;
            break;
        }
    }

    // Check asteroids if no enemy clicked
    if (!clickedEntity) {
        for (const asteroid of this.asteroidPool.activeObjects) {
            if (!asteroid.active) continue;

            const dx = worldX - asteroid.x;
            const dy = worldY - asteroid.y;
            const distance = Math.hypot(dx, dy);

            if (distance <= asteroid.radius + 15) {
                clickedEntity = asteroid;
                break;
            }
        }
    }

    if (clickedEntity) {
        this.targetedEntity = clickedEntity;
        this.setTargetInfo(clickedEntity);
    }
}

export function updateHoverDetection() {
    if (this.game.state !== GAME_STATES.PLAYING) {
        this.cursor.hoveredEntity = null;
        return;
    }

    const worldX = this.cursor.x + this.camera.x;
    const worldY = this.cursor.y + this.camera.y;

    let hoveredEntity = null;

    for (const enemy of this.enemyPool.activeObjects) {
        if (!enemy.active) continue;

        const dx = worldX - enemy.x;
        const dy = worldY - enemy.y;
        const distance = Math.hypot(dx, dy);

        if (distance <= enemy.radius + 10) {
            hoveredEntity = enemy;
            break;
        }
    }

    if (!hoveredEntity) {
        for (const asteroid of this.asteroidPool.activeObjects) {
            if (!asteroid.active) continue;

            const dx = worldX - asteroid.x;
            const dy = worldY - asteroid.y;
            const distance = Math.hypot(dx, dy);

            if (distance <= asteroid.radius + 10) {
                hoveredEntity = asteroid;
                break;
            }
        }
    }

    this.cursor.hoveredEntity = hoveredEntity;
    this.cursor.isOverTarget = hoveredEntity !== null;
}

// ─── Phase 3 — BRN (burn) + STUN status effect helpers ─────────────────
//
// `applyBurn(enemy, sourceDmg, durationMs?)`
//   Increment stack count (cap 3). Refresh duration. Track the strongest
//   source-damage seen across applies so the per-tick payload reflects
//   the most powerful proc. Schedule the first tick 500 ms out so the
//   enemy gets a brief "lit on fire" beat before the first damage lands.
//   Per-tick damage = `brnSourceDmg * 0.1 * brnStacks` — applied by
//   `Enemy._processStatusEffects()` every 500 ms while `brnUntil > now`.
//   Stacks at cap simply refresh duration without inflating damage past
//   the 3× ceiling.
//
// `applyStun(enemy, durationMs?)`
//   Refresh-style: each new application extends `stunUntil` to whichever
//   is later — current value or `now + durationMs`. Per Afeique's call,
//   there is NO immunity window. A re-stun mid-stun just pushes the
//   timer out further; gameplay reads that as "tap a stun proc to keep
//   the enemy locked indefinitely if you can keep rolling the proc."
//
// Both helpers are no-ops on dead/inactive/warping/death-flashing
// enemies — applying status to something that's already dying would
// just queue empty ticks against a recycled pool slot.

// P6 — Kindling: a player burn/corrode also catches one nearby enemy. Pure
// target picker — the NEAREST active enemy within radius that isn't the source
// and isn't already carrying this status (skip via its `untilKey` timer) — so
// the spread choice unit-tests cleanly. applyBurn/applyCorrode own the actual
// re-apply (with a re-entry flag so the spread never chains indefinitely).
// P6 — Conduit passive: your statuses tick 25% faster but expire 25% sooner.
// Both the status DURATION and the burn/bleed tick INTERVAL scale by this same
// factor, so the tick COUNT is preserved (same total DoT, delivered faster in a
// shorter window) — Conduit is a tempo trade, not a damage up/down. conduitFactor
// reads the live passive off the engine `this`; it's undefined for bare unit-test
// calls, so it guards and returns 1 (no-op). The matching tick-INTERVAL scaling
// lives in Enemy._processStatusEffects (burn/bleed reschedules).
export const CONDUIT_SCALE = 0.75;
export function conduitFactor(ctx) {
    return (ctx && ctx.player && typeof ctx.player.hasPassive === 'function'
        && ctx.player.hasPassive('CONDUIT')) ? CONDUIT_SCALE : 1;
}

export const KINDLING_RADIUS = 120;
export function kindlingTarget(enemies, source, untilKey, now, radius = KINDLING_RADIUS) {
    if (!Array.isArray(enemies) || !source) return null;
    let best = null, bestD2 = radius * radius;
    for (const e of enemies) {
        if (!e || e === source || !e.active) continue;
        if (e.warping || e._deathFlash > 0) continue;
        if ((e[untilKey] || 0) > now) continue; // already afflicted — pick a fresh victim
        const dx = e.x - source.x, dy = e.y - source.y;
        const d2 = dx * dx + dy * dy;
        if (d2 < bestD2) { bestD2 = d2; best = e; }
    }
    return best;
}

// RESONANT_SURGE — when an elemental status is applied to an enemy that did NOT
// already have it active, grant the holder +RESONANT_SURGE_ENERGY power energy.
// `ctx` is the engine/combat `this`. DEFAULT-SAFE + no-spam: only fires when the
// powerup is held AND the status is newly applied (caller computes `newlyApplied`).
function _resonantSurgeGrant(ctx, newlyApplied) {
    if (!newlyApplied) return;
    const p = ctx && ctx.player;
    if (!p || typeof p.getPowerupStacks !== 'function' || typeof p.addEnergy !== 'function') return;
    if (p.getPowerupStacks('RESONANT_SURGE') > 0) p.addEnergy(RESONANT_SURGE_ENERGY);
}

export function applyBurn(enemy, sourceDmg, durationMs = 3000, _spread = true) {
    if (!enemy || !enemy.active) return;
    if (enemy.warping || enemy._deathFlash > 0) return;
    if (!(sourceDmg > 0)) return;

    const now = frameClock.now;
    const wasInactive = !(enemy.brnStacks > 0) || enemy.brnUntil <= now;
    // P6 — Conduit: shorter window + faster ticks (same tick count).
    const _cf = conduitFactor(this);

    // Increment stack, cap at 3.
    enemy.brnStacks = Math.min(3, (enemy.brnStacks || 0) + 1);
    // Refresh duration.
    enemy.brnUntil = now + durationMs * _cf;
    // Track peak source damage seen across all applies for this active
    // burn window. Higher-damage procs upgrade the tick payload mid-burn.
    enemy.brnSourceDmg = Math.max(enemy.brnSourceDmg || 0, sourceDmg);
    // First-tick scheduling — 500 ms out from now if the burn was
    // previously inactive. If a stack is added to an already-burning
    // enemy, leave the existing tick schedule alone so we don't reset
    // the per-tick cadence mid-burn (otherwise rapid Lance Beam procs
    // would prevent any tick from ever landing).
    if (wasInactive) {
        enemy.brnTickAt = now + 500 * _cf;
    }

    // RESONANT_SURGE — burn newly applied (wasInactive) grants the holder energy.
    _resonantSurgeGrant(this, wasInactive);

    // P6 — Kindling: spread the burn to one nearby fresh enemy (no re-spread).
    // `this` is undefined for bare unit-test calls — guard before touching it.
    if (_spread && this && this.player && this.player.hasPassive && this.player.hasPassive('KINDLING')) {
        const pool = (this.enemyPool && this.enemyPool.activeObjects) || null;
        if (pool) {
            const other = kindlingTarget(pool, enemy, 'brnUntil', now);
            if (other) applyBurn.call(this, other, sourceDmg, durationMs, false);
        }
    }
}

export function applyStun(enemy, durationMs = 1500) {
    if (!enemy || !enemy.active) return;
    if (enemy.warping || enemy._deathFlash > 0) return;

    const now = frameClock.now;
    const proposed = now + durationMs;
    // Refresh-style: extend the timer to whichever is later. Repeat
    // applications while already stunned push the end-time out further
    // — no immunity gap by design.
    enemy.stunUntil = Math.max(enemy.stunUntil || 0, proposed);
}

// `applySlow(enemy, durationMs, factor)` — Nova AFTERSHOCK. Scales the
// enemy's movement by `factor` (e.g. 0.7 = 30% slower) until the timer
// expires; firing is unaffected. Refresh-style like applyStun. Takes the
// STRONGER (lower) factor if re-applied while already slowed.
export function applySlow(enemy, durationMs = 2000, factor = 0.7) {
    if (!enemy || !enemy.active) return;
    if (enemy.warping || enemy._deathFlash > 0) return;
    const now = frameClock.now;
    enemy.slowUntil = Math.max(enemy.slowUntil || 0, now + durationMs);
    // Keep the strongest slow currently in effect.
    const cur = (enemy.slowUntil > now) ? (enemy.slowFactor || 1) : 1;
    enemy.slowFactor = Math.min(cur, factor);
}

// ─── E3 — Extended elemental status applicators ─────────────────────────────
// Same guard contract as applyBurn/applyStun/applySlow (no-op on dead /
// inactive / warping / death-flashing enemies). All refresh-style. The
// damage MULTIPLIERS for CORRODE / CONDUCT live in `applyDamageToEnemy`
// (collision-system); the movement/firing gates for CHILL / FREEZE live in
// `Enemy.update`; the BLEED tick lives in `Enemy._processStatusEffects`.
// OIL / MARK are pure tags consumed by the E4 reactions. These helpers just
// own the timers/stacks. Each is wired onto the engine in game-engine.js.

function _statusGuard(enemy) {
    return enemy && enemy.active && !enemy.warping && !(enemy._deathFlash > 0);
}

// CORRODE — +15% incoming damage per stack from ALL sources. Cap 3, refresh.
export function applyCorrode(enemy, durationMs = 4000, maxStacks = 3, _spread = true) {
    if (!_statusGuard(enemy)) return;
    // Capture pre-state BEFORE the refresh: corrode is active iff it has stacks
    // AND its window hasn't expired. wasInactive = a NEW application.
    const wasInactive = !(enemy.corrodeStacks > 0) || (enemy.corrodeUntil || 0) <= frameClock.now;
    enemy.corrodeStacks = Math.min(maxStacks, (enemy.corrodeStacks || 0) + 1);
    enemy.corrodeUntil = frameClock.now + durationMs * conduitFactor(this);

    // RESONANT_SURGE — corrode newly applied grants the holder energy.
    _resonantSurgeGrant(this, wasInactive);

    // P6 — Kindling: spread the corrode to one nearby fresh enemy (no re-spread).
    // `this` is undefined for bare unit-test calls — guard before touching it.
    if (_spread && this && this.player && this.player.hasPassive && this.player.hasPassive('KINDLING')) {
        const pool = (this.enemyPool && this.enemyPool.activeObjects) || null;
        if (pool) {
            const other = kindlingTarget(pool, enemy, 'corrodeUntil', frameClock.now);
            if (other) applyCorrode.call(this, other, durationMs, maxStacks, false);
        }
    }
}

// CHILL — lighter movement slow (×0.6, applied in Enemy.update). Refresh.
export function applyChill(enemy, durationMs = 2000) {
    if (!_statusGuard(enemy)) return;
    // Capture pre-state BEFORE the refresh: chill is active iff its window
    // hasn't expired. wasInactive = a NEW application.
    const wasInactive = (enemy.chillUntil || 0) <= frameClock.now;
    // 6.207.1 — CONDUIT (faster DoT ticks / shorter DoT window) must NOT scale
    // CHILL: it's a slow/CC with no ticks, so conduitFactor (<1) would only
    // SHORTEN it — a pure downside. Conduit scales DoTs only (burn/corrode/bleed).
    enemy.chillUntil = Math.max(enemy.chillUntil || 0, frameClock.now + durationMs);
    // RESONANT_SURGE — chill newly applied grants the holder energy.
    _resonantSurgeGrant(this, wasInactive);
    // ENMY-07 — blink-burrow's isFrozen reads `_frozenUntil`; mirror the live
    // CHILL window into it so a chilled Wraithworm can't blink/burrow away
    // (design: the slow holds it in place). Tiny, side-effect-free.
    enemy._frozenUntil = Math.max(enemy._frozenUntil || 0, enemy.chillUntil);
}

// FREEZE — full halt + no firing (OR'd into the stun gate) + brittle. Refresh.
export function applyFreeze(enemy, durationMs = 1500) {
    if (!_statusGuard(enemy)) return;
    // 6.207.1 — CONDUIT must NOT scale FREEZE (hard CC, no ticks) — same reason
    // as chill: conduitFactor would only shorten it (a downside). DoTs only.
    enemy.freezeUntil = Math.max(enemy.freezeUntil || 0, frameClock.now + durationMs);
    // ENMY-07 — same mirror as applyChill: a hard FREEZE also blocks blink.
    enemy._frozenUntil = Math.max(enemy._frozenUntil || 0, enemy.freezeUntil);
}

// CONDUCT — +50% VOLT damage taken (applied in applyDamageToEnemy). Refresh.
export function applyConduct(enemy, durationMs = 3000) {
    if (!_statusGuard(enemy)) return;
    // Capture pre-state BEFORE the refresh: conduct is active iff its window
    // hasn't expired. wasInactive = a NEW application.
    const wasInactive = (enemy.conductUntil || 0) <= frameClock.now;
    // 6.207.1 — CONDUIT must NOT scale CONDUCT (a +50%-VOLT-vuln debuff, no
    // ticks) — conduitFactor would only shorten this player-beneficial window.
    enemy.conductUntil = Math.max(enemy.conductUntil || 0, frameClock.now + durationMs);
    // RESONANT_SURGE — conduct newly applied grants the holder energy.
    _resonantSurgeGrant(this, wasInactive);
}

// OIL — primes the enemy; the next Pyro hit flares (E4). Refresh.
export function applyOil(enemy, durationMs = 5000) {
    if (!_statusGuard(enemy)) return;
    enemy.oilUntil = Math.max(enemy.oilUntil || 0, frameClock.now + durationMs);
}

// MARK — homing-priority + crit + bonus loot (consumed in E4). Refresh.
export function applyMark(enemy, durationMs = 6000) {
    if (!_statusGuard(enemy)) return;
    // Capture pre-state BEFORE the refresh: mark is active iff its window
    // hasn't expired. wasInactive = a NEW application.
    const wasInactive = (enemy.markUntil || 0) <= frameClock.now;
    enemy.markUntil = Math.max(enemy.markUntil || 0, frameClock.now + durationMs);
    // RESONANT_SURGE — mark newly applied grants the holder energy.
    _resonantSurgeGrant(this, wasInactive);
    // ENMY-03 — cloak's isTargetable reads `_markUntil`; mirror the live mark
    // window into it so MARKing a cloaked PHANTOM reveals it (keeps it on the
    // homing/auto-aim target list). Tiny, side-effect-free normalization.
    enemy._markUntil = enemy.markUntil;
}

// BLEED — DoT, 300 ms ticks, NO refresh (duration fixed at first apply),
// stacks to 6. Per-tick = bleedSourceDmg × 0.08 × stacks (Enemy._processStatusEffects).
export function applyBleed(enemy, sourceDmg, durationMs = 4000, maxStacks = 6) {
    if (!_statusGuard(enemy)) return;
    if (!(sourceDmg > 0)) return;
    const now = frameClock.now;
    const wasInactive = !(enemy.bleedStacks > 0) || enemy.bleedUntil <= now;
    // P6 — Conduit: shorter window + faster ticks (same tick count).
    const _cf = conduitFactor(this);
    enemy.bleedStacks = Math.min(maxStacks, (enemy.bleedStacks || 0) + 1);
    enemy.bleedSourceDmg = Math.max(enemy.bleedSourceDmg || 0, sourceDmg);
    if (wasInactive) {
        // First application of a fresh bleed sets the (non-refreshing) window
        // and schedules the first tick. Re-procs while bleeding only add
        // stacks — they do NOT extend the window.
        enemy.bleedUntil = now + durationMs * _cf;
        enemy.bleedTickAt = now + 300 * _cf;
    }
}

// ─── Mine Defensive Plasma Shield Zone ───────────────────────────────────────
//
// 6.23.0 (2026-05-19) — refactored from Phase 5. Originally each ENEMY mine
// emitted a defensive shield; the mechanic has moved to PLAYER mines
// (MINE_LAYER + the new MINE_SHIELD_RADIUS upgrade). While the player stands
// inside any of their OWN armed mine's shield zone, incoming damage is
// reduced by 40% (multiplier 0.6). Stacking is intentionally disabled —
// overlapping zones still give 0.6 (not 0.36).
//
// The shield is "on" for a player mine when ALL of the following hold:
//   • mine.active === true
//   • mine.armed === true (post arm-timer)
//   • mine.shieldRadius > 0 (which `abilities.js` sets only when the player
//     has at least 1 stack of MINE_SHIELD_RADIUS)
//
// Function signatures kept identical to the Phase 5 helpers so the existing
// engine-side wrappers (`_applyMineShieldRefund`, crossing detection) stay
// drop-in compatible — `enemyBulletPool` is now ignored. New call sites
// should pass `null`/`undefined` to make the rename obvious.

export function getMineShieldMultiplier(player, /* legacy: enemyBulletPool */ _) {
    if (!player) return 1.0;
    const mines = player.activeMines;
    if (!mines || mines.length === 0) return 1.0;
    for (let i = 0; i < mines.length; i++) {
        const m = mines[i];
        if (!m || !m.active) continue;
        if (!m.armed) continue;
        const r = m.shieldRadius || 0;
        if (r <= 0) continue;
        const dx = player.x - m.x;
        const dy = player.y - m.y;
        // Radius-squared compare avoids the sqrt in Math.hypot; mines can
        // be common with EXTRA_PAYLOAD and this is called per damage event.
        if ((dx * dx + dy * dy) <= r * r) {
            return 0.6;
        }
    }
    return 1.0;
}

// Returns the FIRST armed-and-shielded player mine the player is currently
// inside, or null. Used by the engine's collision wrappers to know which
// mine to spawn the `mineShieldFlash` particle at, AND to feed the
// crossing-detection block. Single pass keeps the cost identical to the
// boolean check.
export function getActivePlayerMineShield(player) {
    if (!player) return null;
    const mines = player.activeMines;
    if (!mines || mines.length === 0) return null;
    for (let i = 0; i < mines.length; i++) {
        const m = mines[i];
        if (!m || !m.active) continue;
        if (!m.armed) continue;
        const r = m.shieldRadius || 0;
        if (r <= 0) continue;
        const dx = player.x - m.x;
        const dy = player.y - m.y;
        if ((dx * dx + dy * dy) <= r * r) {
            return m;
        }
    }
    return null;
}

// Per-frame check used by the game engine. Returns true if the player is
// currently inside ANY armed mine's shield zone.
export function isPlayerInMineShield(player, /* legacy: enemyBulletPool */ _) {
    return getMineShieldMultiplier(player) < 1.0;
}

// ─── Phase 6 (2026-05-19) — Cluster Launcher detonation helpers ──────────────
//
// `detonateCluster` is invoked from `Bullet._detonate` when a primary cluster
// bomb's armed timer expires or an enemy enters its proximity radius. The
// helper damages all enemies within `baseRadius`, triggers an explosion
// VFX cascade, then spawns N sub-bomblets at random angles via
// `spawnSubBomblet`.
//
// `detonateSubBomblet` is the smaller-radius counterpart for sub-bomblets;
// it shares damage application and VFX but does not spawn further bombs.
//
// Cluster bombs are intentionally KINETIC AoE — no elemental BRN/STUN
// procs. Vampirism/Thorns still apply through `applyVampirism` like any
// other damage source, but the cluster path doesn't itself stamp BRN or
// STUN onto hit enemies.
//
// `this` is the game engine, bound via the thin wrappers in
// `js/modules/game-engine.js`.

export function detonateCluster(x, y, baseDamage, baseRadius, subBombCount, opts = {}) {
    // 1. Primary blast — radial damage to all enemies inside baseRadius.
    _applyClusterBlast.call(this, x, y, baseDamage, baseRadius);

    // 2. VFX cascade. 6.26.0 — Reads as a "nucleus splitting": a bright
    //    central flash + chromatic rings, then a fan of radial sphere-
    //    tracer embers that visually echo the sub-bomblets flying off
    //    along their actual ejection vectors.
    if (this.particlePool) {
        const pp = this.particlePool;
        pp.get(x, y, 'explosionFlash', baseRadius * 1.1, '#ffffff');
        pp.get(x, y, 'explosionRingColored', baseRadius * 1.1, '#ff4422');
        pp.get(x, y, 'explosionRingColored', baseRadius * 1.4, '#ffaa44');
        pp.get(x, y, 'enemyShockwave', baseRadius * 1.6, '#ff8844');
        // Ember + shrapnel fan.
        for (let i = 0; i < 18; i++) {
            const a = (i / 18) * Math.PI * 2 + random(-0.2, 0.2);
            pp.get(x, y, 'explosionShrapnel', a, 4 + Math.random() * 5,
                i % 3 === 0 ? '#ffffff' : (i % 3 === 1 ? '#ffaa44' : '#ff4422'));
        }
        for (let i = 0; i < 12; i++) {
            pp.get(x, y, 'explosionEmber', i % 2 ? '#ff8844' : '#ffe080');
        }
        // Extra "sphere flying off" tracers along the sub-bomb ejection
        // angles. Each sub-bomb gets one bright trail particle so the
        // viewer's eye reads "the cluster split into glowing spheres"
        // even before the spawned sub-bomblets render their first frame.
        if (subBombCount > 0) {
            for (let i = 0; i < subBombCount; i++) {
                const a = (i / subBombCount) * Math.PI * 2;
                pp.get(x, y, 'explosionShrapnel', a, 6 + Math.random() * 3, '#ffcc44');
                pp.get(x, y, 'explosionShrapnel', a, 7 + Math.random() * 3, '#ff8833');
            }
        }
    }
    // Light screen punch on detonation — matches the nova-cast feel but
    // smaller (clusters detonate frequently in a heavy-fire build).
    if (typeof this.triggerHitstop === 'function') this.triggerHitstop(3);
    if (typeof this.triggerScreenShake === 'function') this.triggerScreenShake(8, 5, baseRadius);

    // 3. Scatter sub-bomblets in RANDOM directions at varied speeds. Each
    //    flies off, glides on its own friction, and detonates on contact
    //    with anything (or after its fixed flight window) — spreading the
    //    blast damage across an area rather than one concentrated burst.
    if (subBombCount > 0 && this.bulletPool) {
        const subSpeed = opts.subBombSpeed || 4;
        for (let i = 0; i < subBombCount; i++) {
            const angle = random(0, Math.PI * 2);
            // Per-bomb speed jitter so they spread to different ranges and
            // the scatter pattern reads as organic, not a uniform ring.
            const speed = subSpeed * random(0.7, 1.3);
            spawnSubBomblet.call(this, x, y, angle, speed, opts);
        }
    }
}

export function spawnSubBomblet(x, y, angle, speed, opts = {}) {
    if (!this.bulletPool) return null;
    const bullet = this.bulletPool.get(x, y, angle);
    if (!bullet) return null;
    bullet.weaponId = 'CLUSTER_LAUNCHER';
    // The bullet's reset() places it at (x + offset, y + offset) so the
    // bullet emerges from the muzzle. For sub-bomblets we want them to
    // spawn AT the detonation site, so snap the position back here.
    bullet.x = x;
    bullet.y = y;
    bullet.setupSubBomblet({
        subBombFriction: opts.subBombFriction || 0.94,
        subBombLifeFrames: opts.subBombLifeFrames || 20,
        subBombBlastRadius: opts.subBombBlastRadius || 50,
        subBombDamage: opts.subBombDamage || 25,
    }, angle, speed);
    return bullet;
}

// Flak Cannon airburst — a small central AoE plus a radial ring of short-
// lived shrapnel bullets. Called from Bullet.update when a flak shell reaches
// its fuse distance. Shrapnel are ordinary player bullets (no shooter tag)
// so they collide with enemies/asteroids through the normal pipeline.
export function spawnFlakBurst(x, y, opts = {}) {
    const count = opts.shrapnelCount || 8;
    const dmg = opts.shrapnelDamage || 0.6;
    const speed = opts.shrapnelSpeed || 5;
    const life = opts.shrapnelLifeFrames || 14;
    const blastR = opts.burstBlastRadius || 0;
    const blastDmg = opts.burstBlastDamage || 0;
    const color = opts.color || '#ffbb55';

    if (blastR > 0 && blastDmg > 0) _applyClusterBlast.call(this, x, y, blastDmg, blastR);

    if (this.bulletPool) {
        for (let i = 0; i < count; i++) {
            const a = (i / count) * Math.PI * 2 + random(-0.15, 0.15);
            const b = this.bulletPool.get(x, y, a);
            if (!b) continue;
            b.x = x; b.y = y;
            b.weaponId = 'FLAK_CANNON';
            b.damage = dmg;
            b.piercing = 0;
            b.homing = false;
            b.explosive = false;
            b.color = color;
            b.baseRadius = 3; b.radius = 3;
            b.rangeMultiplier = 1;
            b.maxLife = life;
            b.vel.x = Math.cos(a) * speed;
            b.vel.y = Math.sin(a) * speed;
        }
    }

    if (this.particlePool) {
        const pp = this.particlePool;
        pp.get(x, y, 'explosionFlash', (blastR || 40) * 0.8, '#ffffff');
        pp.get(x, y, 'explosionRingColored', (blastR || 40), color);
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2;
            pp.get(x, y, 'explosionShrapnel', a, 3 + Math.random() * 3, color);
        }
    }
    if (typeof this.triggerScreenShake === 'function') this.triggerScreenShake(4, 3, blastR || 50);
}

// Mitosis Rounds — bright shard color so fragments read as a distinct event.
// (The primary fires a deeper green, #66ff99; shards glow paler/hotter.)
const SPLITTER_SHARD_COLOR = '#aaffcc';

// Fire one Mitosis split burst from `bullet` at (x, y). Centralizes the shard
// parameters so every trigger site (primary impact, shard kill, on both the
// enemy and asteroid paths) stays consistent. No-op when the bullet has no
// generations or shard budget left.
export function mitosisSplit(bullet, x, y) {
    if (!bullet || bullet.splitGenerations <= 0 || bullet.splitCount <= 0) return;
    if (typeof this.spawnSplitShards !== 'function') return;
    this.spawnSplitShards(x, y, {
        count: bullet.splitCount,
        damage: (bullet.damage || 1) * (bullet.splitDamageFactor || 0.5),
        generations: bullet.splitGenerations - 1,
        angle: Math.atan2(bullet.vel.y, bullet.vel.x),
        splitDamageFactor: bullet.splitDamageFactor,
        splitSpeed: bullet.splitSpeed,
        // Shards inherit a light seek; Seeking Cells (homingStrength on the
        // parent) makes the whole cascade hunt harder.
        homingStrength: bullet.homingStrength || 0,
    });
}

// Spawn a fan of shard bullets at a split site. Shards are bright, seek nearby
// targets (so the cascade actually connects), travel at a fixed fraction of a
// fresh bullet's speed, and — while `generations` remain — re-split when THEY
// land a kill. A small flash + shrapnel + pop sell the split as its own event.
export function spawnSplitShards(x, y, opts = {}) {
    if (!this.bulletPool) return;
    const count = opts.count || 2;
    const dmg = opts.damage || 1;
    const gens = opts.generations || 0;
    const baseAngle = opts.angle || 0;
    const color = opts.color || SPLITTER_SHARD_COLOR;
    const splitSpeed = opts.splitSpeed || 0.85;
    // Speed relative to a real bullet — was hardcoded to 6, which made shards
    // ~64% of a fresh bullet despite the 0.85 factor claiming 85%. Now honors
    // BULLET_SPEED so shards keep pace and actually reach a second target.
    const speed = GAME_CONFIG.BULLET_SPEED * splitSpeed;
    // Light baseline seek; stronger if the parent carried Seeking Cells.
    const homingStrength = Math.min(0.4, Math.max(0.12, opts.homingStrength || 0));

    for (let i = 0; i < count; i++) {
        const a = baseAngle + (i - (count - 1) / 2) * 0.6 + random(-0.12, 0.12);
        const b = this.bulletPool.get(x, y, a);
        if (!b) continue;
        b.x = x; b.y = y;
        b.weaponId = 'SPLITTER';
        b.damage = dmg;
        b.piercing = 0;
        b.explosive = false;
        b.color = color;
        b.baseRadius = 3.4; b.radius = 3.4;
        b.rangeMultiplier = 0.85;
        b.vel.x = Math.cos(a) * speed;
        b.vel.y = Math.sin(a) * speed;
        // Shards hunt so fragments curve into nearby targets instead of
        // sailing into empty space — the fix that makes the weapon "connect".
        b.homing = true;
        b.homingStrength = homingStrength;
        if (gens > 0) {
            // Shards chain only when THEY land a kill (keeps the cascade
            // bounded — primaries split on any impact, shards on kills).
            b.splitOnKill = true;
            b.splitCount = count;
            b.splitDamageFactor = opts.splitDamageFactor || 0.5;
            b.splitSpeed = splitSpeed;
            b.splitGenerations = gens;
        }
    }

    // Split cue — a small bright pop + shrapnel so the player sees it happen.
    if (this.particlePool) {
        const pp = this.particlePool;
        pp.get(x, y, 'explosionFlash', 7, color);
        for (let i = 0; i < 5; i++) {
            const sa = (i / 5) * Math.PI * 2 + random(-0.3, 0.3);
            pp.get(x, y, 'explosionShrapnel', sa, 2 + Math.random() * 2.5, color);
        }
    }
    if (this.audioManager) this.audioManager.playSound('hit');
}

export function detonateSubBomblet(x, y, baseDamage, baseRadius) {
    // Smaller blast, lighter VFX. Same damage application path.
    _applyClusterBlast.call(this, x, y, baseDamage, baseRadius);
    if (this.particlePool) {
        const pp = this.particlePool;
        pp.get(x, y, 'explosionFlash', baseRadius * 0.6, '#ffffff');
        pp.get(x, y, 'explosionRingColored', baseRadius * 0.9, '#ffaa44');
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * Math.PI * 2 + random(-0.2, 0.2);
            pp.get(x, y, 'explosionShrapnel', a, 3 + Math.random() * 4, '#ffaa44');
        }
        for (let i = 0; i < 4; i++) {
            pp.get(x, y, 'explosionEmber', '#ff8844');
        }
    }
    if (typeof this.triggerScreenShake === 'function') {
        this.triggerScreenShake(3, 3, baseRadius);
    }
}

// Internal — apply AoE damage from a cluster blast. Damages all enemies
// (and asteroids, if reachable) within `radius` of (x, y). Damage falls
// off linearly with distance so direct hits hit hardest.
function _applyClusterBlast(x, y, baseDamage, radius) {
    if (!radius || radius <= 0) return;
    const r2 = radius * radius;

    // Enemies — full damage pipeline (registers stats, hit FX, kills).
    if (this.enemyPool && this.enemyPool.activeObjects) {
        const list = this.enemyPool.activeObjects;
        for (let i = list.length - 1; i >= 0; i--) {
            const e = list[i];
            if (!e || !e.active) continue;
            if (e.warping || e._deathFlash > 0) continue;
            const dx = e.x - x;
            const dy = e.y - y;
            const d2 = dx * dx + dy * dy;
            if (d2 > r2) continue;
            // Linear falloff: hits at the center receive full damage,
            // hits at the edge receive ~30% damage.
            const dist = Math.sqrt(d2);
            const falloff = 1 - 0.7 * (dist / radius);
            const dmg = Math.max(1, baseDamage * falloff);
            const hpBefore = e.health;
            const destroyed = e.takeDamage(dmg, { isExplosion: true });
            const applied = Math.max(0, hpBefore - e.health);
            if (typeof this.applyVampirism === 'function') this.applyVampirism(applied);
            if (this.game && this.game.stats) {
                this.game.stats.totalDamageDealt = (this.game.stats.totalDamageDealt || 0) + applied;
            }
            if (destroyed) {
                if (typeof this.onEnemyKill === 'function') this.onEnemyKill(e);
                e._deathFlash = 8;
                e._deathFlashMax = 8;
                if (typeof this.createEnemyDebris === 'function') this.createEnemyDebris(e);
                if (typeof this.dropOrbsFromEntity === 'function') this.dropOrbsFromEntity(e.x, e.y, e);
            }
        }
    }

    // Asteroids — straight HP application with vampirism + destruction.
    if (this.asteroidPool && this.asteroidPool.activeObjects) {
        const list = this.asteroidPool.activeObjects;
        for (let i = list.length - 1; i >= 0; i--) {
            const ast = list[i];
            if (!ast || !ast.active) continue;
            if (ast.warping || ast._deathFlash > 0) continue;
            const dx = ast.x - x;
            const dy = ast.y - y;
            const d2 = dx * dx + dy * dy;
            if (d2 > r2) continue;
            const dist = Math.sqrt(d2);
            const falloff = 1 - 0.7 * (dist / radius);
            const dmg = Math.max(1, baseDamage * falloff);
            const hpBefore = ast.health;
            ast.health = Math.max(0, ast.health - dmg);
            const applied = hpBefore - ast.health;
            if (typeof this.applyVampirism === 'function') this.applyVampirism(applied);
            if (ast.health <= 0.001 && typeof this.destroyAsteroid === 'function') {
                this.destroyAsteroid(ast);
            }
        }
    }
}
