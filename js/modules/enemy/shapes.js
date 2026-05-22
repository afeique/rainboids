// ── Enemy shape rendering functions ──────────────────────────────────────────
// Extracted from entities/enemy.js using the .call(this) delegation pattern.
// Each function expects `this` to be an Enemy instance (bound via .call()).
// The Enemy class methods become one-liner delegators:
//   drawTriangle(ctx) { return shapes.drawTriangle.call(this, ctx); }
// ─────────────────────────────────────────────────────────────────────────────

import { frameClock } from '../core/frame-clock.js';
import { rgba } from '../core/color-cache.js';
import {
    drawEnemyHunterShape,
    drawEnemyGuardianShape,
    drawEnemyWaspShape,
    drawEnemyTitanShape,
    drawEnemyStalkerShape,
    drawEnemyTangerineShape,
    drawEnemyDrifterShape,
    drawEnemyProwlerShape,
    drawEnemyWeaverShape,
    drawEnemySentinelShape,
} from '../render/shapes.js';

// Feature toggle (mirrors enemy.js)
const showEnemyNames = () => window.SHOW_ENEMY_NAMES !== false;

export function drawWarpEffect(ctx) {
    if (!this.warping || this.warpTrail.length < 2) return;

    const now = frameClock.now;
    const elapsed = now - this.warpStartTime;
    const t = Math.min(1, elapsed / this.warpDuration);

    ctx.save();

    const dx = Math.cos(this.warpAngle);
    const dy = Math.sin(this.warpAngle);

    // Stretch peaks at smoothstep's max velocity (t≈0.5) and tapers toward
    // both ends — streak corresponds to actual motion, not a hard snap.
    const stretchIntensity = Math.sin(t * Math.PI);
    const baseR = (this.radius || 15) * (this.warpScale != null ? this.warpScale : 1);
    const streakLength = baseR * (2 + stretchIntensity * 11);

    const gradient = ctx.createLinearGradient(
        this.x - dx * streakLength, this.y - dy * streakLength,
        this.x + dx * baseR,        this.y + dy * baseR
    );
    const c = this.color;
    gradient.addColorStop(0,    'rgba(255,255,255,0)');
    gradient.addColorStop(0.3,  c + '33');
    gradient.addColorStop(0.7,  c + '99');
    gradient.addColorStop(0.9,  '#ffffffcc');
    gradient.addColorStop(1,    '#ffffffff');

    const perpX = -dy;
    const perpY = dx;
    const headWidth = baseR * (0.8 + stretchIntensity * 0.5);
    const tailWidth = baseR * 0.15;

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.moveTo(this.x + perpX * headWidth, this.y + perpY * headWidth);
    ctx.lineTo(this.x - perpX * headWidth, this.y - perpY * headWidth);
    ctx.lineTo(this.x - dx * streakLength - perpX * tailWidth,
               this.y - dy * streakLength - perpY * tailWidth);
    ctx.lineTo(this.x - dx * streakLength + perpX * tailWidth,
               this.y - dy * streakLength + perpY * tailWidth);
    ctx.closePath();
    ctx.fill();

    // Soft halo glow at the entity — emphasizes "materializing" feel rather
    // than a pop-in flash. Fades with the stretch curve so it's strongest
    // mid-warp and gentlest at arrival.
    const haloAlpha = 0.4 * stretchIntensity;
    if (haloAlpha > 0.01) {
        const haloR = baseR * (2.6 + (1 - t) * 0.8);
        const halo = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, haloR);
        halo.addColorStop(0, `rgba(255,255,255,${haloAlpha * 0.7})`);
        halo.addColorStop(0.5, c + Math.round(haloAlpha * 99).toString(16).padStart(2, '0'));
        halo.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = halo;
        ctx.beginPath();
        ctx.arc(this.x, this.y, haloR, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

export function drawLightningBolt(ctx) {
    if (!this.lightningBolt) return;
    const now = frameClock.now;
    const age = now - this.lightningBolt.startTime;
    if (age >= this.lightningBolt.lifetime) {
        this.lightningBolt = null;
        return;
    }

    const t = age / this.lightningBolt.lifetime;
    // Brightest at start, fast fade
    const baseAlpha = Math.pow(1 - t, 1.2);
    // Intense white flash during the first 80 ms
    const flash = age < 80 ? (1 - age / 80) * 0.9 : 0;
    const alpha = Math.min(1, baseAlpha + flash);

    ctx.save();
    ctx.lineCap  = 'round';
    ctx.lineJoin = 'round';

    const drawStroke = (pts, widthMult, alphaMult) => {
        if (pts.length < 2) return;
        const a = alpha * alphaMult;

        // Wide outer glow
        // OPT-2: live GPU blur removed — multi-pass stroke provides glow
        ctx.shadowBlur   = 0;
        ctx.shadowColor  = '#00e8ff';
        ctx.strokeStyle  = rgba(0, 200, 255, 0.28 * a);
        ctx.lineWidth    = 14 * widthMult;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();

        // Mid glow
        ctx.shadowBlur   = 0;
        ctx.strokeStyle  = rgba(80, 230, 255, 0.60 * a);
        ctx.lineWidth    = 5 * widthMult;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();

        // Bright white core
        ctx.shadowBlur   = 0;
        ctx.shadowColor  = '#ffffff';
        ctx.strokeStyle  = rgba(220, 255, 255, 0.95 * a);
        ctx.lineWidth    = 1.8 * widthMult;
        ctx.beginPath();
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
        ctx.stroke();
    };

    // Main bolt (full thickness)
    drawStroke(this.lightningBolt.mainPath, 1.0, 1.0);

    // Branches (thinner / more transparent by depth)
    for (const branch of this.lightningBolt.branches) {
        const wm = branch.depth === 1 ? 0.55 : 0.28;
        const am = branch.depth === 1 ? 0.75 : 0.50;
        drawStroke(branch.path, wm, am);
    }

    ctx.shadowBlur = 0;
    ctx.restore();
}

export function drawLaserTargetingLine(ctx) {
    // Draw targeting line showing where the charged attack will fire
    if (!this.laserTargetAngle) return;

    ctx.save();

    if (!this.gameEngine) return;

    const screenDiagonal = Math.hypot(this.gameEngine.canvas.width, this.gameEngine.canvas.height);
    const lineLength = screenDiagonal * 1.2;

    const endX = this.x + Math.cos(this.laserTargetAngle) * lineLength;
    const endY = this.y + Math.sin(this.laserTargetAngle) * lineLength;

    const basePulse = Math.sin(frameClock.now * 0.08) * 0.3 + 0.7;
    const chargeAlpha = this.laserCharge * 0.6 + 0.2;
    const finalAlpha = basePulse * chargeAlpha;

    // Cyan for Drifter arc lightning, red for other lasers
    const lineColor = this.type === 'DRIFTER'
        ? rgba(0, 220, 255, finalAlpha)
        : rgba(255, 0, 0, finalAlpha);

    ctx.strokeStyle = lineColor;
    ctx.lineWidth = 3 + this.laserCharge * 2;
    ctx.setLineDash([10, 5]);

    ctx.beginPath();
    ctx.moveTo(this.x, this.y);
    ctx.lineTo(endX, endY);
    ctx.stroke();

    ctx.setLineDash([]);
    ctx.restore();
}

export function drawLaserChargingBall(ctx) {
    // Draw growing energy ball in front of the enemy while charging
    if (!this.laserTargetAngle || this.laserCharge <= 0) return;

    ctx.save();

    const ballDistance = this.radius + 15;
    const ballX = this.x + Math.cos(this.laserTargetAngle) * ballDistance;
    const ballY = this.y + Math.sin(this.laserTargetAngle) * ballDistance;

    const maxBallRadius = 40;
    const ballRadius = this.laserCharge * maxBallRadius;
    const pulseIntensity = Math.sin(frameClock.now * 0.02) * 0.3 + 0.7;

    // Drifter uses cyan lightning ball; others use red
    const isDrifter = this.type === 'DRIFTER';
    const c1 = isDrifter ? rgba(0, 220, 255, 0.8 * pulseIntensity) : rgba(255, 0, 0, 0.8 * pulseIntensity);
    const c2 = isDrifter ? rgba(0, 160, 255, 0.4 * pulseIntensity) : rgba(255, 100, 0, 0.4 * pulseIntensity);
    const c3 = isDrifter ? 'rgba(0, 220, 255, 0)'                        : 'rgba(255, 0, 0, 0)';
    const c4 = isDrifter ? rgba(0, 200, 255, 0.9 * pulseIntensity)  : rgba(255, 50, 0, 0.9 * pulseIntensity);
    const cSpark = isDrifter ? rgba(100, 255, 255, 0.6 * pulseIntensity) : rgba(255, 255, 0, 0.6 * pulseIntensity);

    // Outer glow
    const gradient = ctx.createRadialGradient(ballX, ballY, 0, ballX, ballY, ballRadius * 2);
    gradient.addColorStop(0,   c1);
    gradient.addColorStop(0.5, c2);
    gradient.addColorStop(1,   c3);

    ctx.fillStyle = gradient;
    ctx.beginPath();
    ctx.arc(ballX, ballY, ballRadius * 2, 0, Math.PI * 2);
    ctx.fill();

    // Main energy ball
    ctx.fillStyle = c4;
    ctx.beginPath();
    ctx.arc(ballX, ballY, ballRadius, 0, Math.PI * 2);
    ctx.fill();

    // Bright core
    ctx.fillStyle = rgba(255, 255, 255, 0.7 * pulseIntensity);
    ctx.beginPath();
    ctx.arc(ballX, ballY, ballRadius * 0.4, 0, Math.PI * 2);
    ctx.fill();

    // Orbiting sparks
    if (this.laserCharge > 0.3) {
        for (let i = 0; i < 6; i++) {
            const sparkAngle = (i / 6) * Math.PI * 2 + frameClock.now * 0.005;
            const sparkDist = ballRadius + 10 + Math.sin(frameClock.now * 0.01 + i) * 5;
            const sparkX = ballX + Math.cos(sparkAngle) * sparkDist;
            const sparkY = ballY + Math.sin(sparkAngle) * sparkDist;

            ctx.fillStyle = cSpark;
            ctx.beginPath();
            ctx.arc(sparkX, sparkY, 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    ctx.restore();
}

export function drawTargetingEffect(ctx) {
    ctx.save();

    // Pulsing glow effect
    const time = frameClock.now * 0.003;
    const pulseIntensity = 0.5 + Math.sin(time) * 0.3;

    // 5.74.36 — targeting circles are now drawn directly on the enemy's
    // collision center (this.x, this.y) for every type. The old Guardian
    // forward-offset (radius * 0.3 along faceAngle) made the highlight
    // ring drift off the actual enemy and read as misaligned; centering
    // on the canonical position is consistent with how every other enemy
    // is drawn and how collision is computed.
    const centerX = this.x;
    const centerY = this.y;

    // Fake glow without shadowBlur: wide faint ring + sharp ring on top.
    // Stroked-ring shadowBlur is one of the slowest canvas patterns.
    const r = this.radius + 8;
    ctx.strokeStyle = this.color;
    ctx.globalAlpha = 0.18 * pulseIntensity;
    ctx.lineWidth = 8;
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.4 * pulseIntensity;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, r, 0, Math.PI * 2);
    ctx.stroke();

    // Inner highlight ring
    const r2 = this.radius + 5;
    ctx.strokeStyle = '#FFFFFF';
    ctx.globalAlpha = 0.25 * pulseIntensity;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.arc(centerX, centerY, r2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.globalAlpha = 0.6 * pulseIntensity;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, r2, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

// Lightweight proxy that forces all fill/stroke colors to white.
// Avoids modifying 10 shape functions (126 color assignments).
let _whiteProxy = null;
function getWhiteProxy(ctx) {
    if (_whiteProxy && _whiteProxy._target === ctx) return _whiteProxy;
    _whiteProxy = new Proxy(ctx, {
        set(target, prop, value) {
            if (prop === 'fillStyle') { target.fillStyle = 'rgba(255, 255, 255, 0.8)'; return true; }
            if (prop === 'strokeStyle') { target.strokeStyle = '#ffffff'; return true; }
            target[prop] = value;
            return true;
        },
        get(target, prop) {
            const val = target[prop];
            return typeof val === 'function' ? val.bind(target) : val;
        }
    });
    _whiteProxy._target = ctx;
    return _whiteProxy;
}

export function drawEnemyShape(ctx) {
    // When flash-rendering, use a proxy that intercepts all color assignments → white
    const drawCtx = this._deathFlashRendering ? getWhiteProxy(ctx) : ctx;

    if (!this._deathFlashRendering) {
        ctx.strokeStyle = this.color;
        ctx.fillStyle = this.color + '40'; // Semi-transparent fill
    }
    drawCtx.lineWidth = 2;

    // 5.79.5 — Removed the `radius × 1.08` black silhouette circle
    //   that was drawn under each enemy. For non-circular enemies
    //   (HUNTER triangle, WASP fighter, STALKER blade, etc.) the
    //   circle extended past the colored body and read as a visible
    //   dark halo around the ship — exactly the artifact the user
    //   reported. The colored hull strokes already provide enough
    //   silhouette definition; if a stronger outline is needed in the
    //   future, it should be drawn per-shape inside each drawer's
    //   actual path, not as a generic radial circle.

    switch (this.type) {
        case 'HUNTER':
            this.drawTriangle(drawCtx);
            break;
        case 'GUARDIAN':
            this.drawEmeraldGuardian(drawCtx);
            break;
        case 'WASP':
            this.drawWaspShip(drawCtx);
            break;
        case 'TITAN':
            this.drawTitanTank(drawCtx);
            break;
        case 'STALKER':
            this.drawStalkerSword(drawCtx);
            break;
        case 'TANGERINE':
            this.drawSpikedCircle(drawCtx);
            break;
        case 'DRIFTER':
            this.drawLaserTurret(drawCtx);
            break;
        case 'PROWLER':
            this.drawMissileTurret(drawCtx);
            break;
        case 'WEAVER':
            this.drawPulseTurret(drawCtx);
            break;
        case 'SENTINEL':
            this.drawShieldTurret(drawCtx);
            break;
        // A.E10-U1 — the 7 new elemental types get their own silhouettes.
        // Called via the module-local functions (.call(this, …)) so they need no
        // Enemy-class delegator wired up in enemy.js.
        case 'CINDER':
            drawCinderEmber.call(this, drawCtx);
            break;
        case 'GLACIER':
            drawIceCrystal.call(this, drawCtx);
            break;
        case 'FROST_LANCE':
            drawIcicleLance.call(this, drawCtx);
            break;
        case 'ASHEN_DETONATOR':
            drawCrackedBomb.call(this, drawCtx);
            break;
        case 'TESLA_WRAITH':
            drawArcNode.call(this, drawCtx);
            break;
        case 'PLAGUEBEARER':
            drawPlagueSac.call(this, drawCtx);
            break;
        case 'WARDEN':
            drawPrismFacet.call(this, drawCtx);
            break;
        case 'HYDRA':
            // E8e bruiser — reuses the blob silhouette (it splits into blobs).
            drawPlagueSac.call(this, drawCtx);
            break;
        case 'SPORE_CARRIER':
            // E8c spawner — reuses the sac silhouette (it births drones).
            drawPlagueSac.call(this, drawCtx);
            break;
        default:
            this.drawTriangle(drawCtx);
    }
    // No shadow state to reset — the silhouette is a plain fill now.
}

export function drawTriangle(ctx) {
    drawEnemyHunterShape(ctx, {
        radius: this.radius,
        now: frameClock.now,
    });
}

export function drawSquare(ctx) {
    // Defensive square
    const size = this.radius * 0.7;
    ctx.beginPath();
    ctx.rect(-size, -size, size * 2, size * 2);
    ctx.fill();
    ctx.stroke();
}

export function drawDiamond(ctx) {
    // Fast, agile diamond with directional tip
    const size = this.radius * 0.6;
    ctx.beginPath();
    ctx.moveTo(size * 1.2, 0); // Extended tip pointing forward
    ctx.lineTo(0, -size);
    ctx.lineTo(-size * 0.6, 0); // Flattened back
    ctx.lineTo(0, size);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

export function drawHexagon(ctx) {
    // Heavy, imposing hexagon with directional point
    const size = this.radius * 0.8;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const angle = (i / 6) * Math.PI * 2;
        // Stretch the first point forward to create directionality
        const stretch = i === 0 ? 1.3 : 1;
        const x = Math.cos(angle) * size * stretch;
        const y = Math.sin(angle) * size * stretch;
        if (i === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
}

export function drawCross(ctx) {
    // Stealth cross shape with directional emphasis
    const size = this.radius * 0.7;
    const thickness = size * 0.3;

    ctx.beginPath();
    // Vertical bar
    ctx.rect(-thickness/2, -size, thickness, size * 2);
    // Horizontal bar (extended forward)
    ctx.rect(-size * 0.6, -thickness/2, size * 2.4, thickness);
    ctx.fill();
    ctx.stroke();
}

export function drawSpikedCircle(ctx) {
    drawEnemyTangerineShape(ctx, {
        radius: this.radius,
    });
}

export function drawLaserTurret(ctx) {
    drawEnemyDrifterShape(ctx, {
        radius: this.radius,
        now: frameClock.now,
        laserCharging: this.laserCharging,
    });
}

export function drawMissileTurret(ctx) {
    drawEnemyProwlerShape(ctx, {
        radius: this.radius,
        now: frameClock.now,
    });
}

export function drawPulseTurret(ctx) {
    drawEnemyWeaverShape(ctx, {
        radius: this.radius,
        color: this.color,
        now: frameClock.now,
        weaverState: this.weaverState,
        weaverStateStart: this.weaverStateStart,
        weaverSpinUpDuration: this.weaverSpinUpDuration,
        weaverCooldownDuration: this.weaverCooldownDuration,
    });
}

export function drawShieldTurret(ctx) {
    drawEnemySentinelShape(ctx, {
        radius: this.radius,
        now: frameClock.now,
    });
}

export function drawWaspShip(ctx) {
    drawEnemyWaspShape(ctx, {
        radius: this.radius,
        now: frameClock.now,
    });
}

export function drawEmeraldGuardian(ctx) {
    drawEnemyGuardianShape(ctx, {
        radius: this.radius,
        now: frameClock.now,
    });
}

export function drawTitanTank(ctx) {
    drawEnemyTitanShape(ctx, {
        radius: this.radius,
        now: frameClock.now,
        tankTurretAngle: this.tankTurretAngle,
        faceAngle: this.faceAngle,
    });
}

export function drawStalkerSword(ctx) {
    drawEnemyStalkerShape(ctx, {
        radius: this.radius,
        now: frameClock.now,
    });
}

// ── A.E10-U1 — distinct silhouettes for the 7 new elemental enemy types ──────
// Each follows the same convention as drawSquare/drawDiamond/drawHexagon above:
//   export function drawX(ctx) — `this` is the Enemy instance, drawn centered at
//   the origin (the caller already translated/rotated to the enemy + set the
//   base strokeStyle = this.color and fillStyle = this.color + '40'). They lean
//   on those inherited styles and add a glow accent so the shape reads cleanly,
//   and never assume a non-origin center. Kept to ~a dozen path ops each.

/** CINDER — a small jagged ember / flame mote. */
export function drawCinderEmber(ctx) {
    const size = this.radius * 0.75;
    // Flame mote: an upward teardrop body with a flickering jagged crown.
    ctx.beginPath();
    ctx.moveTo(0, -size);                       // flame tip (forward)
    ctx.quadraticCurveTo(size * 0.7, -size * 0.1, size * 0.45, size * 0.45);
    ctx.quadraticCurveTo(0, size * 0.9, -size * 0.45, size * 0.45);
    ctx.quadraticCurveTo(-size * 0.7, -size * 0.1, 0, -size);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Inner ember spikes — a few jagged sparks for the "cinder" read.
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const a = -Math.PI / 2 + (i / 5) * Math.PI * 2;
        const r = (i % 2 === 0) ? size * 0.5 : size * 0.22;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r * 0.9 + size * 0.05;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();
}

/** GLACIER — a chunky angular ice block / crystal. */
export function drawIceCrystal(ctx) {
    const s = this.radius * 0.8;
    // Chunky hexagonal ice block with a beveled top edge.
    ctx.beginPath();
    ctx.moveTo(0, -s);                  // top point
    ctx.lineTo(s * 0.85, -s * 0.45);
    ctx.lineTo(s * 0.85, s * 0.5);
    ctx.lineTo(0, s);                   // bottom point
    ctx.lineTo(-s * 0.85, s * 0.5);
    ctx.lineTo(-s * 0.85, -s * 0.45);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Internal facet lines (the crystalline "chunk" read).
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(0, s);
    ctx.moveTo(-s * 0.85, -s * 0.45);
    ctx.lineTo(s * 0.4, s * 0.25);
    ctx.moveTo(s * 0.85, -s * 0.45);
    ctx.lineTo(-s * 0.4, s * 0.25);
    ctx.stroke();
}

/** FROST_LANCE — a sharp elongated icicle / lance. */
export function drawIcicleLance(ctx) {
    const len = this.radius * 1.25;
    const w = this.radius * 0.3;
    // Long forward-pointing icicle: a narrow diamond stretched along +X.
    ctx.beginPath();
    ctx.moveTo(len, 0);                 // sharp tip (forward)
    ctx.lineTo(-len * 0.15, -w);
    ctx.lineTo(-len * 0.55, 0);         // notched tail
    ctx.lineTo(-len * 0.15, w);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Frost segment ridges along the spine.
    ctx.beginPath();
    for (let i = 1; i <= 3; i++) {
        const x = len * (0.5 - i * 0.28);
        const h = w * (1 - i * 0.18);
        ctx.moveTo(x, -h);
        ctx.lineTo(x, h);
    }
    ctx.stroke();
}

/** ASHEN_DETONATOR — a round bomb with fracture lines (it bursts on death). */
export function drawCrackedBomb(ctx) {
    const r = this.radius * 0.7;
    // Round bomb body.
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Fuse stub at the top.
    ctx.beginPath();
    ctx.moveTo(0, -r);
    ctx.lineTo(r * 0.25, -r * 1.4);
    ctx.stroke();

    // Fracture lines radiating from the core (the "about to burst" read).
    ctx.beginPath();
    for (let i = 0; i < 5; i++) {
        const a = (i / 5) * Math.PI * 2 + 0.4;
        const midR = r * 0.35;
        ctx.moveTo(Math.cos(a) * midR, Math.sin(a) * midR);
        const a2 = a + 0.25;
        ctx.lineTo(Math.cos(a2) * r * 0.95, Math.sin(a2) * r * 0.95);
    }
    ctx.stroke();
}

/** TESLA_WRAITH — a node with radiating electric arcs / spokes. */
export function drawArcNode(ctx) {
    const r = this.radius * 0.45;
    // Central node.
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Radiating jagged arcs (electric spokes).
    const reach = this.radius * 0.95;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const midX = Math.cos(a) * reach * 0.55 + Math.cos(a + 1.2) * reach * 0.18;
        const midY = Math.sin(a) * reach * 0.55 + Math.sin(a + 1.2) * reach * 0.18;
        ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        ctx.lineTo(midX, midY);
        ctx.lineTo(Math.cos(a) * reach, Math.sin(a) * reach);
    }
    ctx.stroke();
}

/** PLAGUEBEARER — a bloated, lumpy sac. */
export function drawPlagueSac(ctx) {
    const base = this.radius * 0.7;
    // Bloated lumpy blob: a closed loop whose radius bulges in/out per vertex.
    const lumps = [1.0, 0.78, 1.12, 0.7, 1.05, 0.82, 1.15, 0.74];
    ctx.beginPath();
    for (let i = 0; i < lumps.length; i++) {
        const a = (i / lumps.length) * Math.PI * 2;
        const r = base * lumps[i];
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r * 1.1;        // slightly squashed → "bloated"
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // A couple of inner pustule rings for the toxic-sac read.
    ctx.beginPath();
    ctx.arc(base * 0.25, -base * 0.2, base * 0.22, 0, Math.PI * 2);
    ctx.moveTo(-base * 0.3 + base * 0.18, base * 0.25);
    ctx.arc(-base * 0.3, base * 0.25, base * 0.18, 0, Math.PI * 2);
    ctx.stroke();
}

/** WARDEN — a faceted prism / gem (signals its adaptive resist). */
export function drawPrismFacet(ctx) {
    const s = this.radius * 0.8;
    // Gem outline: a kite / faceted diamond with a flat crown.
    ctx.beginPath();
    ctx.moveTo(0, -s);                  // crown apex (forward)
    ctx.lineTo(s * 0.65, -s * 0.3);
    ctx.lineTo(s * 0.4, s);
    ctx.lineTo(-s * 0.4, s);
    ctx.lineTo(-s * 0.65, -s * 0.3);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // Internal facet lines from the apex → the adaptive-prism look.
    ctx.beginPath();
    ctx.moveTo(0, -s);
    ctx.lineTo(s * 0.4, s);
    ctx.moveTo(0, -s);
    ctx.lineTo(-s * 0.4, s);
    ctx.moveTo(-s * 0.65, -s * 0.3);
    ctx.lineTo(s * 0.65, -s * 0.3);     // crown girdle
    ctx.stroke();
}

export function drawPulsatingCircle(ctx) {
    ctx.save();

    // Use music-synchronized intensity
    const pulseIntensity = this.shield.currentIntensity || 0.5;

    // Simplified shield pattern for performance
    const time = frameClock.now * 0.001;
    const waveFrequency = 4; // Reduced from 8 for better performance
    const waveAmplitude = 2; // Reduced from 4 for better performance

    // Base radius with music-driven pulsing
    const baseRadius = this.shield.radius + (pulseIntensity - 0.5) * 6;

    // Draw shield ring with sine wave pattern
    ctx.translate(this.x, this.y);
    ctx.rotate(this.shield.rotation);

    // Draw outer glow with variable radius
    const maxGlowRadius = baseRadius + waveAmplitude + 8;
    const outerGlow = ctx.createRadialGradient(0, 0, baseRadius - 8, 0, 0, maxGlowRadius);
    outerGlow.addColorStop(0, this.color + '00');
    outerGlow.addColorStop(0.3, this.color + Math.floor(pulseIntensity * 0.6 * 255).toString(16).padStart(2, '0'));
    outerGlow.addColorStop(0.7, this.color + Math.floor(pulseIntensity * 0.4 * 255).toString(16).padStart(2, '0'));
    outerGlow.addColorStop(1, this.color + '00');

    ctx.fillStyle = outerGlow;
    ctx.beginPath();
    ctx.arc(0, 0, maxGlowRadius, 0, Math.PI * 2);
    ctx.fill();

    // Draw main shield as a continuous sine wave path
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.globalAlpha = pulseIntensity;

    ctx.beginPath();
    const angleStep = 0.3; // Increased from 0.1 for better performance
    for (let angle = 0; angle <= Math.PI * 2; angle += angleStep) {
        // Calculate sine wave modulation
        const wavePhase = angle * waveFrequency + this.shield.waveOffset + time * 2;
        const radiusVariation = Math.sin(wavePhase) * waveAmplitude * pulseIntensity;
        const currentRadius = baseRadius + radiusVariation;

        const x = Math.cos(angle) * currentRadius;
        const y = Math.sin(angle) * currentRadius;

        if (angle === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.closePath();
    ctx.stroke();

    // Draw secondary inner wave with different frequency
    ctx.lineWidth = 1;
    ctx.globalAlpha = pulseIntensity * 0.6;
    ctx.strokeStyle = '#ffffff';

    ctx.beginPath();
    for (let angle = 0; angle <= Math.PI * 2; angle += angleStep) {
        const wavePhase = angle * (waveFrequency * 1.5) + this.shield.waveOffset + time * 3;
        const radiusVariation = Math.sin(wavePhase) * (waveAmplitude * 0.5) * pulseIntensity;
        const currentRadius = baseRadius - 4 + radiusVariation;

        const x = Math.cos(angle) * currentRadius;
        const y = Math.sin(angle) * currentRadius;

        if (angle === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }
    ctx.closePath();
    ctx.stroke();

    // Draw energy particles following the sine wave pattern
    const particleCount = 8;
    for (let i = 0; i < particleCount; i++) {
        const particleAngle = (this.shield.rotation * 3 + (i / particleCount) * Math.PI * 2) % (Math.PI * 2);

        // Calculate particle position on the sine wave
        const wavePhase = particleAngle * waveFrequency + this.shield.waveOffset + time * 2;
        const radiusVariation = Math.sin(wavePhase) * waveAmplitude * pulseIntensity;
        const particleRadius = baseRadius + radiusVariation;

        const particleX = Math.cos(particleAngle) * particleRadius;
        const particleY = Math.sin(particleAngle) * particleRadius;

        // Particle intensity varies with wave position
        const particleIntensity = pulseIntensity * (0.6 + 0.4 * Math.sin(wavePhase));

        ctx.globalAlpha = particleIntensity;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(particleX, particleY, 2 + Math.sin(wavePhase) * 0.5, 0, Math.PI * 2);
        ctx.fill();

        // Bright center
        ctx.globalAlpha = particleIntensity * 0.8;
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(particleX, particleY, 1, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

export function drawLightTrail(ctx) {
    if (this.trail.positions.length < 2) return;

    ctx.save();

    const now = frameClock.now;

    // Draw trail as connected line segments with fading opacity
    for (let i = 1; i < this.trail.positions.length; i++) {
        const prevPoint = this.trail.positions[i - 1];
        const currentPoint = this.trail.positions[i];

        // Calculate fade based on age
        const age = now - currentPoint.age;
        const fadeRatio = 1 - (age / this.trail.fadeTime);
        const opacity = Math.max(0, fadeRatio * 0.8); // Max 80% opacity

        if (opacity <= 0) continue;

        // OPT: use simple rgba color instead of per-segment gradient
        ctx.strokeStyle = rgba(255, 255, 255, opacity);
        ctx.lineWidth = 3 * fadeRatio; // Thinner as it fades
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        ctx.beginPath();
        ctx.moveTo(prevPoint.x, prevPoint.y);
        ctx.lineTo(currentPoint.x, currentPoint.y);
        ctx.stroke();

        // OPT-2: live GPU blur removed — trail already visible from stroke
        ctx.shadowBlur = 0;
    }

    ctx.restore();
}

export function drawHealthBar(ctx) {
    if (this.health >= this.maxHealth) return;

    ctx.save();

    // Make bar longer to accommodate level display
    const barWidth = this.radius * 2.2; // Increased from 1.8 to 2.2
    const barHeight = 3;
    const barY = this.y - this.radius - 8; // Moved closer since no name above

    // Enemy names removed for better performance and cleaner UI

    // Health number and level text setup - COMMENTED OUT (now shown in target display)
    /*
    ctx.font = "10px 'Press Start 2P', monospace";
    ctx.fillStyle = '#FFD700'; // Bright gold for health number
    ctx.strokeStyle = 'rgba(0, 0, 0, 0.8)';
    ctx.lineWidth = 2;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'top';
    // Round up health display when between 0-1 to show 1 HP
    const displayHealth = this.health > 0 && this.health < 1 ? 1 : Math.round(this.health);
    const healthNumber = `${displayHealth}/${Math.round(this.maxHealth)}`;
    const numberY = barY + barHeight + 6; // Position below the health bar

    // Measure text widths for proper centering
    const healthWidth = ctx.measureText(healthNumber).width;
    const levelText = `LV${this.level || 1}`;
    const levelWidth = ctx.measureText(levelText).width;
    const spacing = 8; // Space between level and health

    // Calculate total width of combined LV + HP text
    const totalTextWidth = levelWidth + spacing + healthWidth;

    // Center the health bar under the combined text
    const barX = this.x - barWidth / 2;
    const textCenterX = this.x; // Center the combined text over the enemy

    // Calculate positions for level and health text
    const levelX = textCenterX - (totalTextWidth / 2);
    const numberX = levelX + levelWidth + spacing + (healthWidth / 2);

    // Draw level text in light blue
    ctx.fillStyle = '#88ccff'; // Light blue color
    ctx.textAlign = 'left';
    ctx.strokeText(levelText, levelX, numberY);
    ctx.fillText(levelText, levelX, numberY);

    // Draw health number outline first, then fill
    ctx.fillStyle = '#FFD700';
    ctx.textAlign = 'center';
    ctx.strokeText(healthNumber, numberX, numberY);
    ctx.fillText(healthNumber, numberX, numberY);
    */

    // Center the raw health bar under the enemy. HP numbers / name / level
    // are now shown only at the top-center of the screen for the most
    // recently hit enemy (see hud/combat.js drawTargetInfo).
    const barX = this.x - barWidth / 2;

    // Health calculation
    const healthPercentage = this.health / this.maxHealth;

    // OPT: cache the gradient per tier so createLinearGradient() is only called
    // when the tier boundary (>50% / >25% / <=25%) changes, not every frame.
    const tier = healthPercentage > 0.5 ? 'green' : healthPercentage > 0.25 ? 'yellow' : 'red';
    if (tier !== this._healthBarTier || !this._healthBarGradient) {
        this._healthBarTier = tier;
        let healthGradient = ctx.createLinearGradient(barX, barY, barX, barY + barHeight);
        let backgroundColor;
        if (tier === 'green') {
            healthGradient.addColorStop(0, '#66ff66');
            healthGradient.addColorStop(1, '#00cc00');
            backgroundColor = 'rgba(0, 102, 0, 0.6)';
        } else if (tier === 'yellow') {
            healthGradient.addColorStop(0, '#ffff99');
            healthGradient.addColorStop(1, '#cccc00');
            backgroundColor = 'rgba(102, 102, 0, 0.6)';
        } else {
            healthGradient.addColorStop(0, '#ff6666');
            healthGradient.addColorStop(1, '#cc0000');
            backgroundColor = 'rgba(102, 0, 0, 0.6)';
        }
        this._healthBarGradient   = healthGradient;
        this._healthBarBackground = backgroundColor;
    }
    let healthGradient = this._healthBarGradient;
    let backgroundColor = this._healthBarBackground;

    const cornerRadius = 1;

    // Colored background matching health state with full width
    ctx.fillStyle = backgroundColor;
    ctx.beginPath();
    ctx.roundRect(barX, barY, barWidth, barHeight, cornerRadius);
    ctx.fill();

    // Health bar with gradient and rounded corners
    const filledWidth = barWidth * healthPercentage;
    if (filledWidth > 0) {
        ctx.fillStyle = healthGradient;
        ctx.beginPath();
        ctx.roundRect(barX, barY, filledWidth, barHeight, cornerRadius);
        ctx.fill();
    }



    ctx.restore();
}

export function drawLaserChargingEffect(ctx) {
    if (!this.laserChargeProgress || this.laserChargeProgress <= 0) return;

    ctx.save();

    // Position at enemy center
    ctx.translate(this.x, this.y);
    ctx.rotate(this.faceAngle);

    const progress = this.laserChargeProgress;
    const intensity = 0.3 + progress * 0.7; // Increase intensity as charging

    // Charging energy buildup at the front of the ship
    const chargeX = this.radius * 0.8; // In front of the ship
    const chargeRadius = 5 + progress * 15; // Growing charge effect

    // Pulsing energy core
    const pulseIntensity = 0.8 + Math.sin(frameClock.now * 0.02) * 0.2;

    // Outer energy ring
    const outerGradient = ctx.createRadialGradient(chargeX, 0, 0, chargeX, 0, chargeRadius);
    outerGradient.addColorStop(0, rgba(68, 255, 255, intensity * pulseIntensity));
    outerGradient.addColorStop(0.5, rgba(68, 255, 255, intensity * 0.6));
    outerGradient.addColorStop(1, 'rgba(68, 255, 255, 0)');

    ctx.fillStyle = outerGradient;
    ctx.beginPath();
    ctx.arc(chargeX, 0, chargeRadius, 0, Math.PI * 2);
    ctx.fill();

    // Inner energy core
    const coreRadius = chargeRadius * 0.4;
    const coreGradient = ctx.createRadialGradient(chargeX, 0, 0, chargeX, 0, coreRadius);
    coreGradient.addColorStop(0, rgba(255, 255, 255, intensity * pulseIntensity));
    coreGradient.addColorStop(0.7, rgba(68, 255, 255, intensity * 0.8));
    coreGradient.addColorStop(1, 'rgba(68, 255, 255, 0)');

    ctx.fillStyle = coreGradient;
    ctx.beginPath();
    ctx.arc(chargeX, 0, coreRadius, 0, Math.PI * 2);
    ctx.fill();

    // Energy sparks around the charge point
    if (progress > 0.3) {
        const sparkCount = Math.floor(progress * 8);
        for (let i = 0; i < sparkCount; i++) {
            const angle = (i / sparkCount) * Math.PI * 2 + frameClock.now * 0.01;
            const distance = chargeRadius * 0.8 + Math.sin(frameClock.now * 0.03 + i) * 5;
            const sparkX = chargeX + Math.cos(angle) * distance;
            const sparkY = Math.sin(angle) * distance;

            ctx.fillStyle = rgba(255, 255, 255, intensity * 0.8);
            ctx.beginPath();
            ctx.arc(sparkX, sparkY, 1 + Math.random() * 2, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // Charging beam preview (thin line showing where laser will fire)
    if (progress > 0.5) {
        const beamLength = 100 + progress * 200;
        const beamAlpha = (progress - 0.5) * 2 * intensity;

        ctx.strokeStyle = rgba(68, 255, 255, beamAlpha);
        ctx.lineWidth = 2 + progress * 3;
        ctx.beginPath();
        ctx.moveTo(chargeX, 0);
        ctx.lineTo(chargeX + beamLength, 0);
        ctx.stroke();

        // Beam glow
        ctx.strokeStyle = rgba(255, 255, 255, beamAlpha * 0.5);
        ctx.lineWidth = 1;
        ctx.stroke();
    }

    ctx.restore();
}

export function drawSweepLaser(ctx) {
    if (!this.sweepState || this.sweepState === 'idle' || this.sweepState === 'cooldown') return;

    // Muzzle world position — barrel tip of the turret
    const size = this.radius * 0.9;
    const muzzleOffset = size * 0.28 + size * 1.5; // barrel start + barrel length
    const turretAngle = this.tankTurretAngle || 0;
    const muzzleX = this.x + Math.cos(turretAngle) * muzzleOffset;
    const muzzleY = this.y + Math.sin(turretAngle) * muzzleOffset;

    const beamLength = Math.min(window.innerWidth, window.innerHeight) * 0.65;
    ctx.save();

    if (this.sweepState === 'warning') {
        const pulse = Math.sin(frameClock.now * 0.015) * 0.35 + 0.65;
        const progress = (frameClock.now - this.sweepWarningStart) / this.sweepWarningDuration;

        // Warning arc showing sweep range (from muzzle)
        ctx.strokeStyle = rgba(180, 60, 255, 0.25 * pulse);
        ctx.lineWidth = 2;
        ctx.setLineDash([10, 6]);
        ctx.beginPath();
        ctx.arc(muzzleX, muzzleY, 100, this.sweepStartAngle, this.sweepEndAngle);
        ctx.stroke();
        ctx.setLineDash([]);

        // Dashed warning line from muzzle
        const warningAngle = this.sweepStartAngle + (this.sweepEndAngle - this.sweepStartAngle) * progress;
        const wEndX = muzzleX + Math.cos(warningAngle) * beamLength;
        const wEndY = muzzleY + Math.sin(warningAngle) * beamLength;
        ctx.strokeStyle = rgba(200, 80, 255, 0.45 * pulse);
        ctx.lineWidth = 4;
        ctx.setLineDash([16, 8]);
        ctx.beginPath();
        ctx.moveTo(muzzleX, muzzleY);
        ctx.lineTo(wEndX, wEndY);
        ctx.stroke();
        ctx.setLineDash([]);

    } else if (this.sweepState === 'sweeping') {
        // Fade in at start, fade out at end using sin curve
        const sweepElapsed = frameClock.now - this.sweepStartTime;
        const sweepProg = Math.min(1, sweepElapsed / this.sweepDuration);
        const fadeAlpha = Math.sin(sweepProg * Math.PI); // 0 → 1 → 0

        const endX = muzzleX + Math.cos(this.sweepAngle) * beamLength;
        const endY = muzzleY + Math.sin(this.sweepAngle) * beamLength;

        ctx.lineCap = 'round';

        // Outer wide glow
        // OPT-2: live GPU blur removed — multi-pass stroke provides glow
        ctx.shadowBlur = 0;
        ctx.shadowColor = '#aa44ff';
        ctx.strokeStyle = rgba(170, 68, 255, 0.25 * fadeAlpha);
        ctx.lineWidth = 50;
        ctx.beginPath();
        ctx.moveTo(muzzleX, muzzleY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Middle glow
        ctx.shadowBlur = 0;
        ctx.strokeStyle = rgba(200, 100, 255, 0.55 * fadeAlpha);
        ctx.lineWidth = 22;
        ctx.beginPath();
        ctx.moveTo(muzzleX, muzzleY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Inner bright core
        ctx.shadowBlur = 0;
        ctx.shadowColor = '#ffffff';
        ctx.strokeStyle = rgba(240, 200, 255, 0.95 * fadeAlpha);
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(muzzleX, muzzleY);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.shadowBlur = 0;
    }

    ctx.restore();
}
