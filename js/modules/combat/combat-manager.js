// Combat effects, debris, orb drops, powerup collection, damage numbers, kill streaks
import { GAME_CONFIG, GAME_STATES } from '../core/constants.js';
import { random } from '../core/utils.js';
import { PRIMARY_UPGRADES, POWER_UPGRADES, SKILL_UPGRADES, STREAK_TIERS, STREAK_BUFF_DURATION } from './weapon-data.js';
import { DEFENSE_CONFIGS } from './defense-data.js';
import { POWERUP_TYPES } from '../world/powerup.js';
import { isMobile } from '../platform/platform-detect.js';

// ── Asteroid Debris ──

export function createDebris(ast) {
    // Derive explosion color from the asteroid's unique hue
    const hue = ast.baseHue || 0;
    const sat = ast.saturation || 90;
    const lit = ast.lightness || 70;
    const baseColor = `hsl(${hue}, ${sat}%, ${lit}%)`;
    const brightColor = `hsl(${hue}, ${sat}%, ${Math.min(95, lit + 20)}%)`;
    const dimColor = `hsl(${(hue + 20) % 360}, ${sat}%, ${Math.max(40, lit - 15)}%)`;
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
        const eColor = `hsl(${(eHue + 360) % 360}, ${sat}%, ${random(55, 80)}%)`;
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

// Big final-frame explosion. Fired by the enemy update loop right when
// _deathFlash counts down to 0 — last frame before the enemy is
// deactivated. Designed to be unmistakable: 4 expanding rings, a fat
// shrapnel fan, dense embers, sparkles, and a screen punch.
//
// Captures position once at call time so even if `enemy` gets recycled
// later (pool reuse), the spawn coords stay correct.
// ── BEAT 2: BIG ring announce ──
// Fired by the enemy update loop at the death-window midpoint (frame 12).
// THIS is the visual "BANG" — bright flash + 3 expanding wavefront rings
// + the full screen punch (hitstop, flash, kick, shake). NO debris yet —
// debris fires 6 frames later via triggerEnemyDebrisBurst, so the player
// sees the wavefront first and the wreckage flying through it second.
//
// Ring sizes bumped back up since they no longer compete with debris in
// the same frame: now `1.4/1.9/2.5` (was 0.55/0.75/0.9 in 5.64.6 when
// rings + debris fired together). Largest ring is now ~2.5× the enemy
// radius — clearly a wavefront, but bounded so simultaneous deaths
// don't paint over the whole screen.
export function triggerEnemyFinalExplosion(enemy) {
    if (!enemy || !this.particlePool) return;
    const color = enemy.color || '#ff4444';
    const sizeScale = Math.min(2, (enemy.radius || 18) / 15);
    const onScreen = this.isEntityOnScreen(enemy);
    const ex = enemy.x;
    const ey = enemy.y;
    const r  = enemy.radius || 18;

    // ── Main screen punch lands HERE, not on impact. ──
    if (onScreen) {
        this.triggerHitstop(7);
        this.triggerScreenFlash(0.12, 6);
        if (this.player) {
            const kdx = this.player.x - ex;
            const kdy = this.player.y - ey;
            this.triggerCameraKick(kdx, kdy, 18);
        }
        this.triggerScreenShake(38, 22, r * 3.0);
    }

    // 1. Bright core flash.
    this.particlePool.get(ex, ey, 'explosionFlash', r * 2.6 * sizeScale);

    // 2. Three expanding wavefront rings. Sizes bumped vs 5.64.6 since
    // they now occupy their own beat — debris is delayed and won't
    // wash them out.
    this.particlePool.get(ex, ey, 'explosionRingColored', r * 1.4 * sizeScale, '#ffffff');
    this.particlePool.get(ex, ey, 'explosionRingColored', r * 1.9 * sizeScale, color);
    this.particlePool.get(ex, ey, 'explosionRingColored', r * 2.5 * sizeScale, '#ffcc66');
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
    const sizeScale = Math.min(2, (enemy.radius || 18) / 15);
    const ex = enemy.x;
    const ey = enemy.y;

    // 1. Dense directional shrapnel — fast streaks in all directions.
    const shrapnelCount = Math.floor(36 + 18 * sizeScale);
    for (let i = 0; i < shrapnelCount; i++) {
        const angle = (i / shrapnelCount) * Math.PI * 2 + random(-0.4, 0.4);
        const speed = random(6, 18) * sizeScale;
        const sColor = i % 4 === 0 ? '#ffffff'
                     : i % 4 === 1 ? '#ffcc66'
                     : i % 4 === 2 ? color
                     : '#ff8855';
        this.particlePool.get(ex, ey, 'explosionShrapnel', angle, speed, sColor);
    }

    // 2. Classic small particles — outward-velocity dust filling in
    // between the shrapnel streaks.
    for (let i = 0; i < 24; i++) {
        const p = this.particlePool.get(ex, ey, 'explosion');
        if (p) {
            p.color = i < 8 ? '#ffffff' : i < 16 ? color : '#ffcc66';
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

    // 4. Tight inner secondary ring — fires as the debris emerges, so
    // there's a final wavefront chasing the shrapnel out. Kept small
    // (0.6×) so it reads as an "exhale" pulse, not another big ring.
    this.particlePool.get(ex, ey, 'explosionRingColored', (enemy.radius || 18) * 0.6 * sizeScale, color);
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
        // 5.78.2 — heal amount scales with player level. The
        // MEDPACK / DOCTOR powerups were removed; this curve replaces
        // their stacks (level 1 = base amount, level 20 = +12 min /
        // +14 max heal). Steeper than the old per-stack rate but
        // monotonic with level so the player can rely on the curve.
        const lvl = Math.max(1, (this.player.level | 0));
        const lvlBonus = Math.floor((lvl - 1) * 0.6);          // L20 = +11
        const minHeal = GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MIN + lvlBonus;
        const maxHeal = Math.max(minHeal, GAME_CONFIG.HEALTH_ORB_HEAL_AMOUNT_MAX + lvlBonus + Math.floor((lvl - 1) * 0.15));
        healAmount = Math.floor(Math.random() * (maxHeal - minHeal + 1)) + minHeal;
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
        const lvl = Math.max(1, (this.player.level | 0));
        const minBonus = (lvl - 1) * 3;
        const maxBonus = (lvl - 1) * 5;
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

// 5.81.1 — Money drops are now a HARD CAP of 3 chunky shape orbs per
//   drop event, with no pixel-coin swarm. The previous "1 shape + up
//   to 30 pixel coins" layout (5.79.31) was too visually noisy across
//   stacked kills — pixel coins read as ambient sparkle and the
//   distinct geometric shape was lost in the pile. Now each drop is
//   1-3 distinct geometric pieces that scatter outward (see
//   gold-shape.js reset() — initial velocity bumped so they fan out
//   visibly instead of clustering). Shape count is value-driven:
//     ≤ SHAPE_VALUE_MAX            → 1 shape  (small kill)
//     ≤ 2 × SHAPE_VALUE_MAX        → 2 shapes (mid kill / boss part)
//     >  2 × SHAPE_VALUE_MAX       → 3 shapes (big kill / streak)
//   Total is capped by MONEY_ORB_DROP_BUDGET_MAX. Splitter returns
//   { shapes, pixels: [] } — pixels stays empty so existing call sites
//   keep working (the for-of over pixels just no-ops).
function _splitMoneyDrop(total) {
    if (total <= 0) return { shapes: [], pixels: [] };

    const dropMax = GAME_CONFIG.MONEY_ORB_DROP_BUDGET_MAX;
    total = Math.min(total, dropMax);

    const shapeCap = GAME_CONFIG.MONEY_ORB_SHAPE_VALUE_MAX;
    // Decide shape count from total budget so small kills stay
    //   quiet (1 piece) and big multi-kills produce up to 3.
    let shapeN;
    if (total <= shapeCap)            shapeN = 1;
    else if (total <= shapeCap * 2)   shapeN = 2;
    else                              shapeN = 3;

    // Distribute the full budget across the chosen shapes; per-shape
    //   value is clamped to SHAPE_VALUE_MAX inside _evenSplitClamped
    //   so a 250g drop spreads as 80+80+80+leftover (leftover is just
    //   dropped — the cap is intentional so no single piece grows
    //   grotesquely large).
    const shapes = _evenSplitClamped(total, shapeN, shapeCap);

    return { shapes, pixels: [] };
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

    const lvl = Math.max(1, (this.player?.level | 0) || 1);
    const value = Math.max(1, GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MIN + (lvl - 1) * 3);
    this.createMoneyOrb(x, y, value, false);
}

export function dropOrbsFromEntity(x, y, entity = null) {
    // 5.78.2 — DROPS-category powerup stacks were removed; drop rate
    // and quantity now scale with PLAYER level (instead of being
    // bought as discrete picks). The rate gets +1.5%/level past 1
    // (level 20 → +28.5% on top of the base + entity bonuses), and
    // the quantity ceiling adds +1 max orb every 5 levels.
    const playerLvl = Math.max(1, (this.player.level | 0));
    const playerLvlDropRateBonus = (playerLvl - 1) * 0.015;
    const playerLvlQuantityBonus = Math.floor((playerLvl - 1) / 5);   // L5 +1, L10 +2, L15 +3, L20 +4

    const hitStreakMultiplier = this.player.getHitStreakMultiplier();

    const isEnemy = entity && entity.type && typeof entity.type === 'string';
    const enemyDropRateBonus = isEnemy ? 0.15 : 0;
    const enemyQuantityMultiplier = isEnemy ? 1.3 : 1;

    const entityLevel = entity?.level || 1;
    const levelDropRateBonus = (entityLevel - 1) * 0.05;
    const levelQuantityMultiplier = 1 + (entityLevel - 1) * 0.1;

    const baseHealthDropRate = GAME_CONFIG.HEALTH_ORB_BASE_DROP_RATE + playerLvlDropRateBonus + levelDropRateBonus + enemyDropRateBonus;
    const baseMoneyDropRate = GAME_CONFIG.MONEY_ORB_BASE_DROP_RATE + playerLvlDropRateBonus + levelDropRateBonus + enemyDropRateBonus;

    // 5.74.9 — Gold Find scales the money drop RATE in addition to the
    //   amount.
    // 5.74.10 — money rate clamped to 0.95 (was 1.0).
    // 5.74.34 — kill-streak now ALSO scales drop rate (was: amount only).
    //   Same +6%/streak / 2.5× cap as the budget multiplier — high
    //   streaks earn both more frequent AND larger drops, so the
    //   reward curve compounds in both axes.
    const goldFindMult = this.player.getGoldFindMultiplier?.() || 1;
    const streakCount = this.killStreakCount || 0;
    // 5.79.19 — Slope 0.06/kill → 0.025/kill, cap 2.5× → 1.4×. The
    //   old curve hit cap at 25 kills; combined with hitStreakMultiplier
    //   (also cut to 2× ceiling) and enemy-level scaling, drop yield
    //   at 70+ streak was 30× baseline. Now caps at ~16 kills with a
    //   1.4× max so the streak still feels rewarding without
    //   creating the runaway "invincible + rich" feedback loop.
    const streakGoldMult = Math.min(1.4, 1 + streakCount * 0.025);
    const healthDropRate = Math.min(1.0, baseHealthDropRate);
    const moneyDropRate = Math.min(0.95, baseMoneyDropRate * goldFindMult * streakGoldMult);

    // ── Health orbs ──
    // Gated by a global cooldown. Default is once every 60s; the Triage
    // upgrade reduces this by 5s per stack down to a 30s floor. Without this
    // throttle the player gets healed back up almost continuously and the
    // game becomes trivial.
    const now = Date.now();
    const triageStacks = this.player.getPowerupStacks('HEALTH_DROP_FREQUENCY');
    const healthCooldown = Math.max(
        GAME_CONFIG.HEALTH_DROP_COOLDOWN_MIN,
        GAME_CONFIG.HEALTH_DROP_COOLDOWN_BASE - triageStacks * GAME_CONFIG.HEALTH_DROP_COOLDOWN_REDUCTION_PER_STACK
    );
    const healthCooldownReady = (now - (this.lastHealthOrbDropAt || 0)) >= healthCooldown;

    if (healthCooldownReady && Math.random() < healthDropRate) {
        // 5.79.27 — One health orb per drop event (was: budget split
        //   across up to MAX_DROP_COUNT orbs). The per-orb heal amount
        //   is just the level-scaled formula in createHealthOrb — no
        //   compound multipliers, no swarm. Health is rare and
        //   important; one chunky blue orb communicates "grab this"
        //   better than a cluster.
        this.createHealthOrb(x, y);
        this.lastHealthOrbDropAt = now;
    }

    // ── Stat pickups (5.98.0 → 5.99.4 → 5.101.0) ──
    // Diablo-style defensive item drops. Four slots:
    //   HP:        helm,  armor    (each roll picks one of these)
    //   Toughness: shield, plating (each roll picks one of these)
    //
    // Two independent rolls per kill — one for HP, one for toughness.
    // Boss enemies roll at much higher rates so milestones feel
    // rewarding. Asteroids do NOT drop these (only enemy kills) so the
    // player has to engage the threat pool to grow.
    //
    // 5.99.4 — Each pickup carries its slot id AND the current wave
    // as the item LEVEL. Higher-level items have proportionally bigger
    // bonuses (see item-system.js). The pickup collision in
    // collision-system.js calls `createItem` with these values, then
    // `player.equipItem(item)` for the replace-if-better logic. The
    // player builds up a "best so far" set of 4 items.
    //
    // 5.101.0 — Drops are now BOTH mobile AND desktop. Defensive
    // skills retired; inventory is the primary survival lever
    // alongside the new defensive powerups + survivor cards.
    if (isEnemy && this.statPickupPool) {
        const boss = !!(entity && entity.isBoss);
        const hpRate = boss ? 0.060 : 0.025;
        const toughRate = boss ? 0.050 : 0.020;
        const wave = Math.max(1, this.game?.currentWave | 0);
        if (Math.random() < hpRate) {
            const slot = Math.random() < 0.5 ? 'helm' : 'armor';
            this.statPickupPool.get(x, y, slot, wave);
        }
        if (Math.random() < toughRate) {
            const slot = Math.random() < 0.5 ? 'shield' : 'plating';
            this.statPickupPool.get(x, y, slot, wave);
        }
    }

    // ── Money orbs ── no cooldown; "few shape orbs + many pixel
    //   particles" split (5.79.27).
    if (Math.random() < moneyDropRate) {
        const maxMoneyOrbs = GAME_CONFIG.MONEY_ORB_BASE_DROP_COUNT_MAX + playerLvlQuantityBonus;
        const baseCount = Math.floor(Math.random() * maxMoneyOrbs) + 1;
        const totalLegacyCount = Math.max(1, Math.floor(baseCount * levelQuantityMultiplier * enemyQuantityMultiplier * hitStreakMultiplier));

        const lvl = playerLvl;
        const minMoney = GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MIN + (lvl - 1) * 3;
        const maxMoney = Math.max(minMoney, GAME_CONFIG.MONEY_ORB_MONEY_AMOUNT_MAX + (lvl - 1) * 5);
        const avgMoney = (minMoney + maxMoney) / 2;
        const goldFind = this.player.getGoldFindMultiplier?.() || 1;
        const moneyBudget = Math.max(1, Math.round(totalLegacyCount * avgMoney * goldFind * streakGoldMult));

        // 5.79.27 — Splitter returns { shapes, pixels }. Shapes get
        //   the chunky-orb visual treatment; pixels render as tiny
        //   gold dots in the same drop. Total budget is hard-capped
        //   inside _splitMoneyDrop (defense against the runaway
        //   compound multipliers documented in 5.79.26).
        const { shapes, pixels } = _splitMoneyDrop(moneyBudget);
        for (const v of shapes) this.createMoneyOrb(x, y, v, false);
        for (const v of pixels) this.createMoneyOrb(x, y, v, true);
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
//     3. weapon-data fallback — every upgrade tree (PRIMARY/POWER/SKILL)
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
    // 3) Weapon / skill upgrades from weapon-data.js — pass through
    //    the upgrade's description so the pickup blurb shows the same
    //    one-liner used in the shop.
    const allUpgrades = { ...PRIMARY_UPGRADES, ...POWER_UPGRADES, ...SKILL_UPGRADES };
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

export function onEnemyKill(enemy) {
    if (!this.killCount) this.killCount = 0;
    if (!this.killStreakTimer) this.killStreakTimer = 0;
    if (!this.killStreakCount) this.killStreakCount = 0;

    this.killCount++;
    this.killStreakCount++;
    this.killStreakTimer = Date.now();

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
            this.player.streakDamageMult = tier.mult;
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
// Loud, unmistakable feedback when the player takes damage: red-tinted
// flash + radial shrapnel + embers + screen shake + camera kick + screen
// flash. Caller passes the impact point (where the damage came from) so
// the camera kick and shrapnel angle correctly. Scaled by `damage` so a
// big hit feels appropriately bigger than a graze.
export function triggerPlayerHitFX(impactX, impactY, damage = 1) {
    if (!this.player || !this.player.active) return;
    const px = this.player.x;
    const py = this.player.y;

    // Severity 0..1 — caps so a one-shot kill doesn't render off-screen.
    const sev = Math.min(1, Math.max(0.4, damage / 25));

    // ── Screen + camera punch ──
    if (typeof this.triggerScreenFlash === 'function') {
        this.triggerScreenFlash(0.18 + sev * 0.18, 6 + Math.floor(sev * 6));
    }
    if (typeof this.triggerScreenShake === 'function') {
        this.triggerScreenShake(16 + Math.floor(sev * 14), 6 + sev * 9);
    }
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
    // opts: { isCrit?: bool, isEmpowered?: bool, isPlayerHit?: bool, target? }
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
    const isCrit = !!opts.isCrit;
    const isPlayerHit = !!opts.isPlayerHit;
    const target = opts.target || null;
    const now = Date.now();

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
        vel: {
            x: (Math.random() - 0.5) * 2,
            y: -2 - Math.random() * 2
        },
        gravity: 0.1,
        creationTime: now,
    };

    this.damageNumbers.push(damageNumber);

    if (target && !isPlayerHit) {
        this._enemyDmgAggs.set(target, {
            dmgRef: damageNumber,
            startTime: now,
        });
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
