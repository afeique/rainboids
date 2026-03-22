// ── Enemy shape rendering functions ──────────────────────────────────────────
// Extracted from entities/enemy.js using the .call(this) delegation pattern.
// Each function expects `this` to be an Enemy instance (bound via .call()).
// The Enemy class methods become one-liner delegators:
//   drawTriangle(ctx) { return shapes.drawTriangle.call(this, ctx); }
// ─────────────────────────────────────────────────────────────────────────────

import { frameClock } from '../frame-clock.js';
import { rgba } from '../color-cache.js';

// Feature toggle (mirrors enemy.js)
const showEnemyNames = () => window.SHOW_ENEMY_NAMES !== false;

export function drawWarpEffect(ctx) {
    if (!this.warping || this.warpTrail.length < 2) return;

    const now = frameClock.now;
    const elapsed = now - this.warpStartTime;
    const t = Math.min(1, elapsed / this.warpDuration);

    ctx.save();

    // Star Trek warp streak: elongated light trail behind the ship
    // The trail stretches in the direction of travel
    const dx = Math.cos(this.warpAngle);
    const dy = Math.sin(this.warpAngle);

    // Stretch factor: peaks during acceleration phase (t ~0.4-0.7)
    const stretchIntensity = t < 0.3 ? t / 0.3
        : t < 0.7 ? 1.0
        : 1.0 - (t - 0.7) / 0.3;
    const streakLength = this.radius * (3 + stretchIntensity * 12); // Up to 15x radius

    // Draw the warp streak — bright core fading to transparent tail
    const gradient = ctx.createLinearGradient(
        this.x - dx * streakLength, this.y - dy * streakLength,
        this.x + dx * this.radius, this.y + dy * this.radius
    );

    const c = this.color;
    gradient.addColorStop(0, 'rgba(255,255,255,0)');
    gradient.addColorStop(0.3, c + '33');
    gradient.addColorStop(0.7, c + '99');
    gradient.addColorStop(0.9, '#ffffffcc');
    gradient.addColorStop(1, '#ffffffff');

    // Draw tapered streak shape
    const perpX = -dy;
    const perpY = dx;
    const headWidth = this.radius * (0.8 + stretchIntensity * 0.5);
    const tailWidth = this.radius * 0.15;

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

    // Bright flash at arrival point when snapping in (final 20%)
    if (t > 0.8) {
        const flashAlpha = (1 - (t - 0.8) / 0.2) * 0.6;
        const flashRadius = this.radius * (2 + (1 - flashAlpha) * 3);
        const flash = ctx.createRadialGradient(this.x, this.y, 0, this.x, this.y, flashRadius);
        flash.addColorStop(0, `rgba(255,255,255,${flashAlpha})`);
        flash.addColorStop(0.4, c + Math.round(flashAlpha * 99).toString(16).padStart(2, '0'));
        flash.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = flash;
        ctx.beginPath();
        ctx.arc(this.x, this.y, flashRadius, 0, Math.PI * 2);
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

    // Calculate center position (adjust for Guardian visual offset)
    let centerX = this.x;
    let centerY = this.y;

    // Guardian-specific adjustment to center the targeting circle better
    if (this.type === 'GUARDIAN') {
        // Adjust forward to account for Guardian's visual center offset
        centerX += Math.cos(this.faceAngle) * (this.radius * 0.3);
        centerY += Math.sin(this.faceAngle) * (this.radius * 0.3);
    }

    // Outer glow — shadowBlur on stroked arcs (ring outline, not fillable)
    ctx.shadowColor = this.color;
    ctx.shadowBlur = 15 * pulseIntensity;
    ctx.globalAlpha = 0.4 * pulseIntensity;

    // Draw subtle ring around entity
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(centerX, centerY, this.radius + 8, 0, Math.PI * 2);
    ctx.stroke();

    // Inner highlight ring
    ctx.shadowBlur = 8 * pulseIntensity;
    ctx.globalAlpha = 0.6 * pulseIntensity;
    ctx.strokeStyle = '#FFFFFF';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(centerX, centerY, this.radius + 5, 0, Math.PI * 2);
    ctx.stroke();

    ctx.restore();
}

export function drawEnemyShape(ctx) {
    ctx.strokeStyle = this.color;
    ctx.fillStyle = this.color + '40'; // Semi-transparent fill
    ctx.lineWidth = 2;

    switch (this.type) {
        case 'HUNTER':
            this.drawTriangle(ctx);
            break;
        case 'GUARDIAN':
            this.drawEmeraldGuardian(ctx);
            break;
        case 'WASP':
            this.drawWaspShip(ctx);
            break;
        case 'TITAN':
            this.drawTitanTank(ctx);
            break;
        case 'STALKER':
            this.drawStalkerSword(ctx);
            break;
        case 'TANGERINE':
            this.drawSpikedCircle(ctx);
            break;
        case 'DRIFTER':
            this.drawLaserTurret(ctx);
            break;
        case 'PROWLER':
            this.drawMissileTurret(ctx);
            break;
        case 'WEAVER':
            this.drawPulseTurret(ctx);
            break;
        case 'SENTINEL':
            this.drawShieldTurret(ctx);
            break;
        default:
            this.drawTriangle(ctx);
    }

    // Aiming triangles removed - not working as intended
}

export function drawTriangle(ctx) {
    // Predatory hunter fighter — swept wings, engine glow, cockpit
    const size = this.radius * 0.9;
    const t = frameClock.now * 0.001;
    const pulse = 0.82 + Math.sin(t * 3.8) * 0.18;

    ctx.save();

    // ── Main elongated body ───────────────────────────────────────────────
    ctx.fillStyle = '#1a0000';
    ctx.strokeStyle = '#ff4444';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size * 1.15, 0);            // sharp nose
    ctx.lineTo(size * 0.18, -size * 0.3);  // upper shoulder
    ctx.lineTo(-size * 0.52, -size * 0.2); // upper rear
    ctx.lineTo(-size * 0.72, 0);           // tail center
    ctx.lineTo(-size * 0.52, size * 0.2);  // lower rear
    ctx.lineTo(size * 0.18, size * 0.3);   // lower shoulder
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Swept wings ───────────────────────────────────────────────────────
    ctx.fillStyle = 'rgba(255, 40, 40, 0.15)';
    ctx.strokeStyle = '#ff6666';
    ctx.lineWidth = 1.5;
    // Upper wing
    ctx.beginPath();
    ctx.moveTo(size * 0.18, -size * 0.3);
    ctx.lineTo(-size * 0.08, -size * 1.05);
    ctx.lineTo(-size * 0.62, -size * 0.38);
    ctx.lineTo(-size * 0.52, -size * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();
    // Lower wing (mirror)
    ctx.beginPath();
    ctx.moveTo(size * 0.18, size * 0.3);
    ctx.lineTo(-size * 0.08, size * 1.05);
    ctx.lineTo(-size * 0.62, size * 0.38);
    ctx.lineTo(-size * 0.52, size * 0.2);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Hull spine line ────────────────────────────────────────────────────
    ctx.strokeStyle = 'rgba(255, 110, 110, 0.65)';
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.moveTo(size * 0.85, 0);
    ctx.lineTo(-size * 0.45, 0);
    ctx.stroke();

    // ── Engine exhaust glow ────────────────────────────────────────────────
    const engGrad = ctx.createRadialGradient(-size * 0.72, 0, 0, -size * 0.72, 0, size * 0.38);
    engGrad.addColorStop(0,   rgba(255, 220, 120, pulse));
    engGrad.addColorStop(0.35, rgba(255, 80, 0, 0.75 * pulse));
    engGrad.addColorStop(1,   'rgba(255, 0, 0, 0)');
    ctx.fillStyle = engGrad;
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(-size * 0.72, 0, size * 0.38, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // ── Cockpit glow ──────────────────────────────────────────────────────
    ctx.shadowBlur = 0;
    ctx.fillStyle = rgba(255, 150, 150, 0.7 * pulse);
    ctx.beginPath();
    ctx.ellipse(size * 0.32, 0, size * 0.14, size * 0.09, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
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
    // Explosive circle with directional spikes
    const innerSize = this.radius * 0.5;
    const outerSize = this.radius * 0.8;

    // Inner circle
    ctx.beginPath();
    ctx.arc(0, 0, innerSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Spikes with forward emphasis
    ctx.beginPath();
    for (let i = 0; i < 8; i++) {
        const angle = (i / 8) * Math.PI * 2;
        // Make forward spikes longer
        const lengthMultiplier = (i === 0) ? 1.5 : 1;
        const innerX = Math.cos(angle) * innerSize;
        const innerY = Math.sin(angle) * innerSize;
        const outerX = Math.cos(angle) * outerSize * lengthMultiplier;
        const outerY = Math.sin(angle) * outerSize * lengthMultiplier;

        ctx.moveTo(innerX, innerY);
        ctx.lineTo(outerX, outerY);
    }
    ctx.stroke();
}

export function drawLaserTurret(ctx) {
    // Lightning Entity — a living being of pure electricity
    const size = this.radius * 0.85;
    const t = frameClock.now * 0.001;
    const pulse = 0.7 + Math.sin(t * 5.5) * 0.3;
    const charging = this.laserCharging;
    const chargeBoost = charging ? 1.5 : 1.0;

    ctx.save();

    // ── Outer arc-discharge ring ──────────────────────────────────────────
    const outerPts = 18;
    ctx.strokeStyle = rgba(0, 220, 255, 0.4 * pulse);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    for (let i = 0; i <= outerPts; i++) {
        const angle = (i / outerPts) * Math.PI * 2;
        const jitter = Math.sin(t * 11 + i * 2.3) * size * 0.14;
        const r = size * 1.5 + jitter;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // ── Six radial lightning bolts ─────────────────────────────────────
    for (let i = 0; i < 6; i++) {
        const baseAngle = (i / 6) * Math.PI * 2 + t * 1.2;
        const opacity = 0.45 + Math.sin(t * 9 + i * 1.5) * 0.35;
        ctx.strokeStyle = rgba(120, 250, 255, opacity);
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const numSteps = 5;
        for (let s = 1; s <= numSteps; s++) {
            const prog = s / numSteps;
            const boltX = Math.cos(baseAngle) * size * prog;
            const boltY = Math.sin(baseAngle) * size * prog;
            const perpX = -Math.sin(baseAngle);
            const perpY =  Math.cos(baseAngle);
            const jag = Math.sin(t * 15 + i * 3.1 + s * 7.3) * size * 0.2 * prog;
            ctx.lineTo(boltX + perpX * jag, boltY + perpY * jag);
        }
        ctx.stroke();
    }

    // ── Body: jagged electric star ────────────────────────────────────────
    const bodyPts = 10;
    ctx.fillStyle = '#000a10';
    ctx.strokeStyle = rgba(0, 255, 255, 0.85 + pulse * 0.15);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < bodyPts; i++) {
        const angle = (i / bodyPts) * Math.PI * 2;
        const jitter = Math.sin(t * 7 + i * 1.9) * size * 0.07;
        const r = (i % 2 === 0) ? size * 0.88 + jitter : size * 0.48 + jitter;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Inner sheen ────────────────────────────────────────────────────────
    ctx.strokeStyle = `rgba(0, 180, 255, 0.4)`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    for (let i = 0; i < bodyPts; i++) {
        const angle = (i / bodyPts) * Math.PI * 2;
        const r = (i % 2 === 0) ? size * 0.52 : size * 0.28;
        const x = Math.cos(angle) * r;
        const y = Math.sin(angle) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
    ctx.stroke();

    // ── Core glow ─────────────────────────────────────────────────────────
    const coreSize = size * (0.3 + pulse * 0.08) * chargeBoost;
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, coreSize);
    coreGrad.addColorStop(0,    '#ffffff');
    coreGrad.addColorStop(0.25, '#88ffff');
    coreGrad.addColorStop(0.6,  '#0055ff');
    coreGrad.addColorStop(1,    'transparent');
    ctx.fillStyle = coreGrad;
    ctx.globalAlpha = (0.8 + pulse * 0.2) * Math.min(chargeBoost, 1.2);
    ctx.beginPath();
    ctx.arc(0, 0, coreSize, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
}

export function drawMissileTurret(ctx) {
    // Armored missile fortress — angular hull, visible warheads, targeting sensor array
    const size = this.radius * 0.8;
    const t = frameClock.now * 0.001;
    const pulse = 0.75 + Math.sin(t * 2.5) * 0.25;

    ctx.save();

    // ── Main armored hull (angular hexagon) ──────────────────────────────
    ctx.fillStyle = '#1a0028';
    ctx.strokeStyle = '#cc44ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    // Asymmetric angular hull — wider at rear
    ctx.moveTo( size * 1.1,  0);           // nose
    ctx.lineTo( size * 0.6,  size * 0.7);  // front flare r
    ctx.lineTo(-size * 0.5,  size * 0.9);  // rear r
    ctx.lineTo(-size * 1.1,  size * 0.4);  // rear spur r
    ctx.lineTo(-size * 1.1, -size * 0.4);  // rear spur l
    ctx.lineTo(-size * 0.5, -size * 0.9);  // rear l
    ctx.lineTo( size * 0.6, -size * 0.7);  // front flare l
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Armor plate seams ────────────────────────────────────────────────
    ctx.strokeStyle = '#8822cc';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size * 0.4, 0);  ctx.lineTo(-size * 0.6, 0);
    ctx.moveTo(size * 0.0, size * 0.55);  ctx.lineTo(-size * 0.8, size * 0.35);
    ctx.moveTo(size * 0.0, -size * 0.55); ctx.lineTo(-size * 0.8, -size * 0.35);
    ctx.stroke();

    // ── Missile pods (3 tubes visible per side) ───────────────────────────
    for (const side of [-1, 1]) {
        const podY = side * size * 0.55;
        // Pod housing
        ctx.fillStyle = '#220033';
        ctx.strokeStyle = '#aa33ee';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.rect(size * 0.1, podY - size * 0.22, size * 0.7, size * 0.44);
        ctx.fill();
        ctx.stroke();
        // Individual missile tubes
        for (let tube = 0; tube < 3; tube++) {
            const tubeX = size * (0.18 + tube * 0.2);
            const tubeY = podY;
            // Tube bore
            ctx.fillStyle = '#110022';
            ctx.beginPath();
            ctx.ellipse(tubeX, tubeY, size * 0.07, size * 0.13, 0, 0, Math.PI * 2);
            ctx.fill();
            // Warhead tip (purple glow if loaded)
            const tipGrad = ctx.createRadialGradient(tubeX, tubeY, 0, tubeX, tubeY, size * 0.08);
            tipGrad.addColorStop(0, rgba(220, 100, 255, 0.8 * pulse));
            tipGrad.addColorStop(1, 'rgba(100,0,180,0)');
            ctx.fillStyle = tipGrad;
            ctx.beginPath();
            ctx.ellipse(tubeX, tubeY, size * 0.08, size * 0.14, 0, 0, Math.PI * 2);
            ctx.fill();
        }
    }

    // ── Targeting sensor array (rotating dish at nose) ───────────────────
    ctx.save();
    ctx.translate(size * 0.85, 0);
    ctx.rotate(t * 2.2); // spin
    ctx.strokeStyle = rgba(255, 100, 255, 0.7 * pulse);
    ctx.lineWidth = 1.2;
    for (let i = 0; i < 4; i++) {
        const a = (i / 4) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * size * 0.22, Math.sin(a) * size * 0.22);
        ctx.stroke();
    }
    ctx.restore();
    // Sensor center dot
    const sensorGrad = ctx.createRadialGradient(size * 0.85, 0, 0, size * 0.85, 0, size * 0.14 * pulse);
    sensorGrad.addColorStop(0, '#ffffff');
    sensorGrad.addColorStop(0.4, '#ff44ff');
    sensorGrad.addColorStop(1, 'rgba(180,0,200,0)');
    ctx.fillStyle = sensorGrad;
    ctx.beginPath();
    ctx.arc(size * 0.85, 0, size * 0.14 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // ── Rear engine glows ─────────────────────────────────────────────────
    for (const side of [-1, 1]) {
        const engGrad = ctx.createRadialGradient(-size * 0.95, side * size * 0.2, 0,
                                                  -size * 0.95, side * size * 0.2, size * 0.22);
        engGrad.addColorStop(0,   rgba(220, 100, 255, 0.9 * pulse));
        engGrad.addColorStop(0.5, 'rgba(100,0,180,0.4)');
        engGrad.addColorStop(1,   'rgba(60,0,120,0)');
        ctx.fillStyle = engGrad;
        ctx.beginPath();
        ctx.ellipse(-size * 0.95, side * size * 0.2, size * 0.22, size * 0.13, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.restore();
}

export function drawPulseTurret(ctx) {
    // Spinning wheel laser turret — shape and glow react to weaverState
    const size = this.radius * 0.8;

    // Determine charge level: 0 during cooldown, 0→1 during spin_up, 1 during arc
    let charge = 0;
    const now = frameClock.now;
    if (this.weaverState === 'spinning_up') {
        charge = Math.min(1, (now - (this.weaverStateStart || now)) / (this.weaverSpinUpDuration || 2400));
        charge = charge * charge; // ease-in
    } else if (this.weaverState === 'arcing') {
        charge = 1;
    } else if (this.weaverState === 'cooldown') {
        const p = Math.min(1, (now - (this.weaverStateStart || now)) / (this.weaverCooldownDuration || 2600));
        charge = 1 - p;
    }

    // Outer glow ring scales with charge
    if (charge > 0.05) {
        ctx.shadowBlur = 0;
        ctx.shadowColor = '#ffff00';
        ctx.strokeStyle = '#ffff44';
        ctx.lineWidth = 3 + charge * 4;
        ctx.beginPath();
        ctx.arc(0, 0, size * 1.25, 0, Math.PI * 2);
        ctx.stroke();
        ctx.shadowBlur = 0;
    }

    ctx.globalAlpha = 1;

    // Outer body ring
    ctx.strokeStyle = this.color;
    ctx.fillStyle = this.color + '40';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, 0, size, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // 3 spoke arms (like a wheel / turbine)
    const spokeColor = charge > 0 ? `rgba(255, 255, ${Math.floor(200 * (1 - charge))}, 1)` : this.color;
    for (let i = 0; i < 3; i++) {
        const angle = (i / 3) * Math.PI * 2;
        ctx.strokeStyle = spokeColor;
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(angle) * size * 0.85, Math.sin(angle) * size * 0.85);
        ctx.stroke();

        // Tip nozzle
        const tx = Math.cos(angle) * size;
        const ty = Math.sin(angle) * size;
        ctx.fillStyle = charge > 0 ? '#ffffff' : this.color;
        ctx.globalAlpha = 0.6 + charge * 0.4;
        ctx.beginPath();
        ctx.arc(tx, ty, size * 0.18, 0, Math.PI * 2);
        ctx.fill();
    }

    ctx.globalAlpha = 1;

    // Central core — white-hot when fully charged
    const coreColor = charge > 0.8 ? '#ffffff' : this.color;
    ctx.fillStyle = coreColor;
    ctx.shadowColor = '#ffff00';
    ctx.beginPath();
    ctx.arc(0, 0, size * (0.28 + charge * 0.12), 0, Math.PI * 2);
    ctx.fill();
    ctx.shadowBlur = 0;
}

export function drawShieldTurret(ctx) {
    // Orbital sentinel — nested spinning hex rings, rotating emitter arms
    const size = this.radius * 0.8;
    const t = frameClock.now * 0.001;
    const pulse = 0.8 + Math.sin(t * 3.2) * 0.2;
    const spinAngle = t * 0.8; // independent slow spin for decoration

    ctx.save();

    // ── Outer rotating hex ring ──────────────────────────────────────────
    ctx.save();
    ctx.rotate(spinAngle);
    ctx.strokeStyle = rgba(0, 255, 100, 0.5 * pulse);
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * size * 1.2, Math.sin(a) * size * 1.2);
        else         ctx.lineTo(Math.cos(a) * size * 1.2, Math.sin(a) * size * 1.2);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // ── Inner counter-rotating hex ring ──────────────────────────────────
    ctx.save();
    ctx.rotate(-spinAngle * 1.4);
    ctx.strokeStyle = rgba(100, 255, 160, 0.6 * pulse);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2 + Math.PI / 6;
        if (i === 0) ctx.moveTo(Math.cos(a) * size * 0.88, Math.sin(a) * size * 0.88);
        else         ctx.lineTo(Math.cos(a) * size * 0.88, Math.sin(a) * size * 0.88);
    }
    ctx.closePath();
    ctx.stroke();
    ctx.restore();

    // ── Emitter arms (6, rotating with faceAngle) ────────────────────────
    ctx.strokeStyle = '#00cc55';
    ctx.lineWidth = 2;
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const innerR = size * 0.28;
        const outerR = size * 0.75;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * innerR, Math.sin(a) * innerR);
        ctx.lineTo(Math.cos(a) * outerR, Math.sin(a) * outerR);
        ctx.stroke();
        // Emitter node at tip
        const glow = ctx.createRadialGradient(
            Math.cos(a) * outerR, Math.sin(a) * outerR, 0,
            Math.cos(a) * outerR, Math.sin(a) * outerR, size * 0.16 * pulse
        );
        glow.addColorStop(0,   '#ffffff');
        glow.addColorStop(0.4, '#00ff88');
        glow.addColorStop(1,   'rgba(0,200,80,0)');
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(Math.cos(a) * outerR, Math.sin(a) * outerR, size * 0.16 * pulse, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Solid inner hex hull ─────────────────────────────────────────────
    ctx.fillStyle = '#001a0a';
    ctx.strokeStyle = '#00ff55';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * size * 0.4, Math.sin(a) * size * 0.4);
        else         ctx.lineTo(Math.cos(a) * size * 0.4, Math.sin(a) * size * 0.4);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Pulsing core ─────────────────────────────────────────────────────
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.22 * pulse);
    coreGrad.addColorStop(0,   '#ffffff');
    coreGrad.addColorStop(0.3, '#88ffcc');
    coreGrad.addColorStop(1,   'rgba(0,200,100,0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.22 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

export function drawWaspShip(ctx) {
    // Sleek aggressive interceptor with glowing engine trails and blade wings
    const size = this.radius * 0.8;
    const t = frameClock.now * 0.001;
    const pulse = 0.85 + Math.sin(t * 6) * 0.15; // fast flicker like an insect

    ctx.save();

    // ── Engine exhaust glow (behind body) ────────────────────────────────
    for (const side of [-1, 1]) {
        const exhaustGrad = ctx.createRadialGradient(-size * 0.95, side * size * 0.18, 0,
                                                      -size * 0.95, side * size * 0.18, size * 0.35);
        exhaustGrad.addColorStop(0,   rgba(255, 220, 0, 0.9 * pulse));
        exhaustGrad.addColorStop(0.4, 'rgba(255,120,0,0.5)');
        exhaustGrad.addColorStop(1,   'rgba(200,80,0,0)');
        ctx.fillStyle = exhaustGrad;
        ctx.beginPath();
        ctx.ellipse(-size * 0.95, side * size * 0.18, size * 0.35, size * 0.18, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Razor blade wings ─────────────────────────────────────────────────
    for (const side of [-1, 1]) {
        // Outer swept blade
        ctx.fillStyle = 'rgba(200,200,0,0.35)';
        ctx.strokeStyle = '#cccc00';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.moveTo(size * 0.15, 0);
        ctx.lineTo(size * 0.8,  side * size * 0.22);
        ctx.lineTo(-size * 0.05, side * size * 1.05);
        ctx.lineTo(-size * 0.65, side * size * 0.9);
        ctx.lineTo(-size * 0.75, side * size * 0.28);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Inner secondary blade
        ctx.fillStyle = 'rgba(255,255,0,0.25)';
        ctx.strokeStyle = '#ffff44';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(-size * 0.1, 0);
        ctx.lineTo(-size * 0.3, side * size * 0.55);
        ctx.lineTo(-size * 0.65, side * size * 0.45);
        ctx.lineTo(-size * 0.5, 0);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Glowing wing edge stripe
        ctx.strokeStyle = rgba(255, 255, 100, 0.7 * pulse);
        ctx.lineWidth = 1.2;
        ctx.beginPath();
        ctx.moveTo(size * 0.7, side * size * 0.18);
        ctx.lineTo(-size * 0.05, side * size * 0.95);
        ctx.stroke();
    }

    // ── Abdomen (rear tapered segment) ────────────────────────────────────
    ctx.fillStyle = '#1a1a00';
    ctx.strokeStyle = '#aaaa00';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(-size * 0.45, 0, size * 0.55, size * 0.28, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Abdomen stripes
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 1;
    for (let i = 0; i < 3; i++) {
        const x = -size * 0.25 - i * size * 0.2;
        ctx.beginPath();
        ctx.moveTo(x, -size * 0.24);
        ctx.lineTo(x, size * 0.24);
        ctx.stroke();
    }

    // ── Thorax (center body) ──────────────────────────────────────────────
    const thoraxGrad = ctx.createRadialGradient(-size * 0.05, 0, 0, -size * 0.05, 0, size * 0.42);
    thoraxGrad.addColorStop(0,   '#ffff66');
    thoraxGrad.addColorStop(0.5, '#aaaa00');
    thoraxGrad.addColorStop(1,   '#333300');
    ctx.fillStyle = thoraxGrad;
    ctx.strokeStyle = '#ffff44';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(-size * 0.05, 0, size * 0.42, size * 0.3, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // ── Head + stinger ────────────────────────────────────────────────────
    ctx.fillStyle = '#222200';
    ctx.strokeStyle = '#ffff00';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.ellipse(size * 0.38, 0, size * 0.3, size * 0.22, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();
    // Eyes (two bright dots)
    for (const ey of [-1, 1]) {
        ctx.fillStyle = rgba(255, 255, 0, pulse);
        ctx.beginPath();
        ctx.arc(size * 0.44, ey * size * 0.1, size * 0.06, 0, Math.PI * 2);
        ctx.fill();
    }
    // Stinger tip
    ctx.fillStyle = '#ffff88';
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size * 0.75, 0);
    ctx.lineTo(size * 0.58, -size * 0.1);
    ctx.lineTo(size * 0.58,  size * 0.1);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.restore();
}

export function drawEmeraldGuardian(ctx) {
    // Armored emerald fortress — glowing energy core, swept shield wings, battle scarred
    const size = this.radius * 0.8;
    const pulse = 0.8 + Math.sin(frameClock.now * 0.004) * 0.2;

    ctx.save();

    // ── Outer shield ring ────────────────────────────────────────────────
    ctx.strokeStyle = rgba(0, 255, 80, 0.35 * pulse);
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 4]);
    ctx.beginPath();
    ctx.arc(0, 0, size * 1.28, 0, Math.PI * 2);
    ctx.stroke();
    ctx.setLineDash([]);

    // ── Swept battle wings (large, aggressive) ───────────────────────────
    const wingColor = '#00bb44';
    const wingFill  = 'rgba(0,180,60,0.45)';
    ctx.lineWidth = 1.8;

    for (const side of [-1, 1]) {
        // Primary swept wing
        ctx.fillStyle = wingFill;
        ctx.strokeStyle = wingColor;
        ctx.beginPath();
        ctx.moveTo(size * 0.25, 0);            // root
        ctx.lineTo(size * 1.5,  side * size * 0.3);  // swept forward tip
        ctx.lineTo(size * 1.25, side * size * 0.9);  // outer tip
        ctx.lineTo(-size * 0.5, side * size * 1.1);  // rear outer
        ctx.lineTo(-size * 0.7, side * size * 0.35); // rear root
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Secondary rear blade
        ctx.fillStyle = 'rgba(0,200,70,0.3)';
        ctx.strokeStyle = '#00dd55';
        ctx.beginPath();
        ctx.moveTo(-size * 0.4, side * size * 0.2);
        ctx.lineTo(-size * 1.2, side * size * 0.85);
        ctx.lineTo(-size * 0.95, side * size * 0.38);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();

        // Wing energy veins
        ctx.strokeStyle = rgba(120, 255, 160, 0.6 * pulse);
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(size * 0.1, side * size * 0.05);
        ctx.lineTo(size * 1.1, side * size * 0.55);
        ctx.moveTo(size * 0.0, side * size * 0.12);
        ctx.lineTo(size * 0.6, side * size * 0.75);
        ctx.stroke();
    }

    // ── Central hexagonal hull ───────────────────────────────────────────
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = '#00ff66';
    ctx.fillStyle = '#001a08';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const r = size * (i % 2 === 0 ? 0.68 : 0.58); // alternating for interest
        if (i === 0) ctx.moveTo(Math.cos(a) * r, Math.sin(a) * r);
        else         ctx.lineTo(Math.cos(a) * r, Math.sin(a) * r);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Faceted armor panels ─────────────────────────────────────────────
    for (let i = 0; i < 6; i++) {
        const a1 = (i / 6) * Math.PI * 2;
        const a2 = ((i + 1) / 6) * Math.PI * 2;
        const brightness = i % 2 === 0 ? '88' : '44';
        ctx.fillStyle = '#00ff44' + brightness;
        ctx.strokeStyle = '#00cc33';
        ctx.lineWidth = 1;
        const r1 = size * (i % 2 === 0 ? 0.68 : 0.58);
        const r2 = size * ((i+1) % 2 === 0 ? 0.68 : 0.58);
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a1) * r1, Math.sin(a1) * r1);
        ctx.lineTo(Math.cos(a2) * r2, Math.sin(a2) * r2);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // ── Glowing energy core ──────────────────────────────────────────────
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.32 * pulse);
    coreGrad.addColorStop(0,   '#ffffff');
    coreGrad.addColorStop(0.25,'#aaffcc');
    coreGrad.addColorStop(0.6, '#00ff66');
    coreGrad.addColorStop(1,   'rgba(0,200,80,0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.32 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // ── Forward cannon barrel ────────────────────────────────────────────
    ctx.fillStyle = '#005522';
    ctx.strokeStyle = '#00ff44';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.rect(size * 0.55, -size * 0.1, size * 0.7, size * 0.2);
    ctx.fill();
    ctx.stroke();
    // Muzzle glow
    const muzzleGrad = ctx.createRadialGradient(size * 1.25, 0, 0, size * 1.25, 0, size * 0.18 * pulse);
    muzzleGrad.addColorStop(0, '#ffffff');
    muzzleGrad.addColorStop(0.4,'#00ff88');
    muzzleGrad.addColorStop(1, 'rgba(0,200,80,0)');
    ctx.fillStyle = muzzleGrad;
    ctx.beginPath();
    ctx.arc(size * 1.25, 0, size * 0.18 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
}

export function drawTitanTank(ctx) {
    // Imposing hexagonal juggernaut with glowing energy core and armored plating
    const size = this.radius * 0.9;
    const pulse = 0.85 + Math.sin(frameClock.now * 0.003) * 0.15; // 0.7–1.0 pulse

    ctx.save();

    // ── Outer armor ring (thick hex outline) ─────────────────────────────
    ctx.lineWidth = 4;
    ctx.strokeStyle = '#ff44ff';
    ctx.fillStyle = '#1a0020';
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const s = i === 0 ? 1.35 : 1.0; // forward stretch
        if (i === 0) ctx.moveTo(Math.cos(a) * size * s, Math.sin(a) * size * s);
        else         ctx.lineTo(Math.cos(a) * size * s, Math.sin(a) * size * s);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Corner spikes on each hex vertex ─────────────────────────────────
    ctx.fillStyle = '#ff00ff';
    ctx.strokeStyle = '#ff88ff';
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        const s = i === 0 ? 1.35 : 1.0;
        const vx = Math.cos(a) * size * s;
        const vy = Math.sin(a) * size * s;
        const tipLen = size * 0.22;
        ctx.beginPath();
        ctx.moveTo(vx + Math.cos(a) * tipLen, vy + Math.sin(a) * tipLen);
        ctx.lineTo(vx + Math.cos(a + 0.35) * size * 0.15, vy + Math.sin(a + 0.35) * size * 0.15);
        ctx.lineTo(vx + Math.cos(a - 0.35) * size * 0.15, vy + Math.sin(a - 0.35) * size * 0.15);
        ctx.closePath();
        ctx.fill();
        ctx.stroke();
    }

    // ── Inner hex with energy gradient ───────────────────────────────────
    const innerGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.72);
    innerGrad.addColorStop(0,   'rgba(255, 80, 255, 0.9)');
    innerGrad.addColorStop(0.5, 'rgba(120, 0, 180, 0.7)');
    innerGrad.addColorStop(1,   'rgba(30, 0, 50, 0.5)');
    ctx.fillStyle = innerGrad;
    ctx.strokeStyle = '#cc00cc';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i = 0; i < 6; i++) {
        const a = (i / 6) * Math.PI * 2;
        if (i === 0) ctx.moveTo(Math.cos(a) * size * 0.72, Math.sin(a) * size * 0.72);
        else         ctx.lineTo(Math.cos(a) * size * 0.72, Math.sin(a) * size * 0.72);
    }
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Energy lines from center to hex midpoints ─────────────────────────
    ctx.strokeStyle = rgba(255, 180, 255, 0.4 * pulse);
    ctx.lineWidth = 1.5;
    for (let i = 0; i < 6; i++) {
        const a = (i / 6 + 1 / 12) * Math.PI * 2; // midpoints between vertices
        ctx.beginPath();
        ctx.moveTo(0, 0);
        ctx.lineTo(Math.cos(a) * size * 0.72, Math.sin(a) * size * 0.72);
        ctx.stroke();
    }

    // ── Pulsing energy core ──────────────────────────────────────────────
    const coreGrad = ctx.createRadialGradient(0, 0, 0, 0, 0, size * 0.28 * pulse);
    coreGrad.addColorStop(0,   '#ffffff');
    coreGrad.addColorStop(0.3, '#ff88ff');
    coreGrad.addColorStop(1,   'rgba(200, 0, 200, 0)');
    ctx.fillStyle = coreGrad;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.28 * pulse, 0, Math.PI * 2);
    ctx.fill();

    // ── Rear exhaust pods ────────────────────────────────────────────────
    for (const side of [-1, 1]) {
        const podX = -size * 0.55;
        const podY = side * size * 0.38;
        const podGrad = ctx.createRadialGradient(podX, podY, 0, podX, podY, size * 0.22);
        podGrad.addColorStop(0,   rgba(255, 120, 255, 0.9 * pulse));
        podGrad.addColorStop(0.5, 'rgba(120, 0, 160, 0.6)');
        podGrad.addColorStop(1,   'rgba(60, 0, 80, 0)');
        ctx.fillStyle = podGrad;
        ctx.beginPath();
        ctx.ellipse(podX, podY, size * 0.22, size * 0.14, 0, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Turret (independently rotated) ───────────────────────────────────
    ctx.save();
    const turretAngle = this.tankTurretAngle || 0;
    const relativeAngle = turretAngle - (this.faceAngle || 0);
    ctx.rotate(relativeAngle);

    // Turret base ring
    ctx.fillStyle = '#2a0035';
    ctx.strokeStyle = '#ff44ff';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, 0, size * 0.32, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // Barrel body
    const barrelLen = size * 1.5;
    const barrelW   = size * 0.13;
    ctx.fillStyle = '#aa00cc';
    ctx.strokeStyle = '#ff66ff';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.rect(size * 0.28, -barrelW * 0.5, barrelLen, barrelW);
    ctx.fill();
    ctx.stroke();

    // Barrel highlight stripe
    ctx.strokeStyle = 'rgba(255,180,255,0.5)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(size * 0.28, -barrelW * 0.12);
    ctx.lineTo(size * 0.28 + barrelLen * 0.9, -barrelW * 0.12);
    ctx.stroke();

    // Glowing muzzle tip
    const muzzleX = size * 0.28 + barrelLen;
    const muzzleGrad = ctx.createRadialGradient(muzzleX, 0, 0, muzzleX, 0, barrelW * 1.4 * pulse);
    muzzleGrad.addColorStop(0,   '#ffffff');
    muzzleGrad.addColorStop(0.4, '#ff88ff');
    muzzleGrad.addColorStop(1,   'rgba(200,0,200,0)');
    ctx.fillStyle = muzzleGrad;
    ctx.beginPath();
    ctx.arc(muzzleX, 0, barrelW * 1.4 * pulse, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore(); // end turret

    ctx.restore(); // end main transform
}

export function drawStalkerSword(ctx) {
    // Cloaked stealth interceptor — mantis-like blade wings, plasma edges, shimmer
    const size = this.radius * 0.92;
    const t = frameClock.now * 0.001;
    const pulse = 0.75 + Math.sin(t * 4.2) * 0.25;
    const shimmer = Math.sin(t * 11.3) * 0.15; // fast flicker for cloak shimmer

    ctx.save();

    // ── Main hull — narrow swept fuselage ─────────────────────────────────
    ctx.fillStyle = '#000d10';
    ctx.strokeStyle = rgba(0, 220, 255, 0.75 + shimmer);
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.moveTo( size * 1.3,  0);            // sharp nose tip
    ctx.lineTo( size * 0.4, -size * 0.22);  // upper shoulder
    ctx.lineTo(-size * 0.5, -size * 0.18);  // upper rear
    ctx.lineTo(-size * 0.75, 0);            // tail
    ctx.lineTo(-size * 0.5,  size * 0.18);  // lower rear
    ctx.lineTo( size * 0.4,  size * 0.22);  // lower shoulder
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Upper mantis blade arm ────────────────────────────────────────────
    ctx.fillStyle = `rgba(0, 30, 40, 0.85)`;
    ctx.strokeStyle = rgba(0, 255, 220, 0.65 + shimmer);
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    ctx.moveTo( size * 0.55, -size * 0.2);   // root at hull
    ctx.lineTo( size * 1.05, -size * 0.85);  // blade tip (forward-angled)
    ctx.lineTo( size * 0.05, -size * 1.1);   // swept back wingtip
    ctx.lineTo(-size * 0.45, -size * 0.55);  // rear root
    ctx.lineTo(-size * 0.35, -size * 0.18);  // hull attach
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Lower mantis blade arm (mirror) ───────────────────────────────────
    ctx.beginPath();
    ctx.moveTo( size * 0.55,  size * 0.2);
    ctx.lineTo( size * 1.05,  size * 0.85);
    ctx.lineTo( size * 0.05,  size * 1.1);
    ctx.lineTo(-size * 0.45,  size * 0.55);
    ctx.lineTo(-size * 0.35,  size * 0.18);
    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    // ── Cloaking interference grid ────────────────────────────────────────
    ctx.save();
    ctx.globalAlpha = 0.10 + Math.abs(shimmer) * 0.5;
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 0.8;
    for (let i = -3; i <= 3; i++) {
        const xOff = i * size * 0.22 + Math.sin(t * 8 + i * 1.7) * size * 0.04;
        ctx.beginPath();
        ctx.moveTo(xOff, -size * 0.2);
        ctx.lineTo(xOff,  size * 0.2);
        ctx.stroke();
    }
    ctx.restore();

    // ── Plasma edge glow (additive blend) ─────────────────────────────────
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = 0.35 * pulse;
    ctx.strokeStyle = '#00ffff';
    ctx.lineWidth = 3;
    // Hull edge glow
    ctx.beginPath();
    ctx.moveTo( size * 1.3,  0);
    ctx.lineTo( size * 0.4, -size * 0.22);
    ctx.lineTo(-size * 0.5, -size * 0.18);
    ctx.lineTo(-size * 0.75, 0);
    ctx.lineTo(-size * 0.5,  size * 0.18);
    ctx.lineTo( size * 0.4,  size * 0.22);
    ctx.closePath();
    ctx.stroke();
    // Blade tip plasma accents
    ctx.globalAlpha = 0.55 * pulse;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(size * 1.05, -size * 0.85);
    ctx.lineTo(size * 0.05, -size * 1.1);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(size * 1.05,  size * 0.85);
    ctx.lineTo(size * 0.05,  size * 1.1);
    ctx.stroke();
    ctx.restore();

    // ── Rear engine exhaust pods ───────────────────────────────────────────
    const engGrad = ctx.createRadialGradient(-size * 0.75, 0, 0, -size * 0.75, 0, size * 0.3);
    engGrad.addColorStop(0,   rgba(200, 255, 255, pulse));
    engGrad.addColorStop(0.4, rgba(0, 180, 220, 0.6 * pulse));
    engGrad.addColorStop(1,   'rgba(0, 50, 80, 0)');
    ctx.fillStyle = engGrad;
    ctx.globalAlpha = pulse;
    ctx.beginPath();
    ctx.arc(-size * 0.75, 0, size * 0.3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    // ── Core sensor orb ────────────────────────────────────────────────────
    const coreGrad = ctx.createRadialGradient(size * 0.15, 0, 0, size * 0.15, 0, size * 0.18);
    coreGrad.addColorStop(0,   '#ffffff');
    coreGrad.addColorStop(0.3, '#88ffff');
    coreGrad.addColorStop(1,   'rgba(0, 200, 255, 0)');
    ctx.fillStyle = coreGrad;
    ctx.globalAlpha = 0.9 * pulse;
    ctx.beginPath();
    ctx.arc(size * 0.15, 0, size * 0.18, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;

    ctx.restore();
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

    // Center the health bar under the ship name
    const barX = this.x - barWidth / 2;

    // Health text above the bar: "6/9"
    const displayHealth = this.health > 0 && this.health < 1 ? 1 : Math.round(this.health);
    const healthText = `${displayHealth}/${Math.round(this.maxHealth)}`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'bottom';

    // OPT: double-draw glow instead of shadowBlur
    // First pass: slightly larger font at low alpha for glow
    ctx.globalAlpha = 0.4;
    ctx.font = '9px "Press Start 2P", monospace';
    ctx.fillStyle = 'goldenrod';
    ctx.fillText(healthText, this.x, barY - 6);

    // Second pass: crisp text on top at full alpha
    ctx.globalAlpha = 1.0;
    ctx.font = '8px "Press Start 2P", monospace';
    ctx.fillStyle = 'goldenrod';
    ctx.fillText(healthText, this.x, barY - 6);

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
