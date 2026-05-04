// Weapon effects rendering: beams, mines, nova rings, lightning, missiles, skill effects
import { PRIMARY_WEAPONS, POWER_WEAPONS, DEFENSE_SKILLS } from './weapon-data.js';

export function drawWeaponEffects() {
    if (!this.player || !this.player.active) return;
    const ctx = this.ctx;
    const p = this.player;

    // ─── Lance Beam ──────────────────────────────────────────────────
    // 5.64.15 — Lance Beam is a continuous tether: ON while LMB is held,
    // terminates at the first object the ray hits (`p.beamHitDist` is
    // set by `collision-system.checkLanceBeamCollisions`). The previous
    // timer-driven 2-second beam window is gone. We keep a short
    // grow-in animation against a per-beam-session timer so the visual
    // doesn't snap to full-width on key down.
    if (p.beamActive) {
        const config = PRIMARY_WEAPONS.LANCE_BEAM;
        const targetW = (config.beamWidth || 6) * (1 + this.player.getPowerupStacks('BEAM_WIDTH') * 0.3);
        const targetRange = config.range * 400;
        const hitDist = (typeof p.beamHitDist === 'number' && p.beamHitDist > 0) ? p.beamHitDist : targetRange;
        const dx = Math.cos(p.angle);
        const dy = Math.sin(p.angle);

        // Grow-in factor — captures a per-beam-session start time so
        // the beam ramps from 0 → 1 over the first GROW_MS, even when
        // hitDist changes between frames as targets move.
        if (!p._beamRenderStart || !p._beamRenderActive) {
            p._beamRenderStart = Date.now();
            p._beamRenderActive = true;
        }
        const GROW_MS = 150;
        const elapsed = Date.now() - p._beamRenderStart;
        const growT = Math.min(1, elapsed / GROW_MS);
        const growEase = 1 - (1 - growT) * (1 - growT) * (1 - growT);
        const beamW = Math.max(0.5, targetW * growEase);
        const range = hitDist * growEase + (1 - growEase) * Math.min(hitDist, 30);
        const endX = p.x + dx * range;
        const endY = p.y + dy * range;

        ctx.save();

        // Lightning-style zig-zag — break the line into N segments and
        // add small perpendicular jitter to each interior vertex.
        const segs = Math.max(6, Math.floor(range / 28));
        const perpX = -dy;
        const perpY = dx;
        const jitterMag = beamW * 0.7;

        // Outer glow stroke
        ctx.globalAlpha = 0.85 * (0.5 + 0.5 * growEase);
        ctx.strokeStyle = config.color;
        ctx.lineWidth = beamW;
        ctx.shadowColor = config.color;
        ctx.shadowBlur = beamW * 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        for (let i = 1; i < segs; i++) {
            const t = i / segs;
            const cx = p.x + (endX - p.x) * t;
            const cy = p.y + (endY - p.y) * t;
            const j = (Math.random() - 0.5) * jitterMag;
            ctx.lineTo(cx + perpX * j, cy + perpY * j);
        }
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // Inner bright core — straight line, no jitter, brighter.
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = Math.max(1, beamW * 0.3);
        ctx.shadowBlur = 0;
        ctx.globalAlpha = growEase;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        ctx.restore();
    } else if (p._beamRenderActive) {
        p._beamRenderActive = false;
    }

    // ─── Mines ──────────────────────────────────────────────────────
    // Drawn as a chunky physical object: dark casing with 4 protruding
    // spikes, an inner core, a rotating LED ring when armed, and a
    // blinking red status light. Disarmed (still arming) mines are
    // dimmer and don't blink — once `armTimer <= 0` flips `armed` true,
    // the LEDs come on and the trigger-radius ring flashes.
    if (p.activeMines) {
        const now = Date.now();
        for (const mine of p.activeMines) {
            if (!mine.active) continue;
            ctx.save();
            ctx.translate(mine.x, mine.y);

            const radius = 12;
            const armed = !!mine.armed;
            // Three blink phases:
            //   • Pre-arm: medium-fast telegraph while fuse is running.
            //   • Armed (calm):     slow steady pulse.
            //   • Armed (urgent):   last 2s of lifeTimer — fast strobe to
            //                       warn the player the mine is about to
            //                       self-detonate.
            const lifeRemaining = (mine.lifeTimer ?? Infinity);
            const URGENT_MS = 2000;
            const isUrgent = armed && lifeRemaining < URGENT_MS;
            let blinkRate;
            if (!armed)         blinkRate = 0.018;        // pre-arm
            else if (isUrgent) {
                // Frequency ramps up as lifeTimer drops to 0.
                const t = Math.max(0, lifeRemaining / URGENT_MS); // 1 → 0
                blinkRate = 0.012 + (1 - t) * 0.04;       // 0.012 → 0.052
            } else              blinkRate = 0.008;        // armed calm
            const blinkPhase = Math.sin(now * blinkRate);
            const blinkOn = blinkPhase > 0;

            // ── Spikes (4 cardinal protrusions) ──
            ctx.strokeStyle = armed ? '#552200' : '#3a1a00';
            ctx.lineWidth = 3;
            ctx.lineCap = 'round';
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2 + Math.PI / 4; // diagonals
                const x1 = Math.cos(a) * (radius - 1);
                const y1 = Math.sin(a) * (radius - 1);
                const x2 = Math.cos(a) * (radius + 5);
                const y2 = Math.sin(a) * (radius + 5);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }

            // ── Casing (filled body with outline) ──
            // Urgent state shifts colors toward red so the player reads
            // "this thing is about to blow" at a glance.
            ctx.fillStyle = isUrgent ? '#3a0000' : '#2a1100';
            ctx.strokeStyle = isUrgent
                ? (blinkOn ? '#ff2200' : '#aa1100')
                : (armed ? '#ff6600' : '#884400');
            ctx.lineWidth = isUrgent ? 2.5 : 2;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            ctx.stroke();

            // ── Inner core (pulses) ──
            const corePulse = 0.7 + 0.3 * Math.sin(now * 0.005);
            ctx.fillStyle = isUrgent
                ? (blinkOn ? '#ff5500' : '#660000')
                : armed
                    ? (blinkOn ? '#ffdd44' : '#aa4400')
                    : '#552200';
            ctx.globalAlpha = corePulse;
            ctx.beginPath();
            ctx.arc(0, 0, radius * 0.42, 0, Math.PI * 2);
            ctx.fill();
            ctx.globalAlpha = 1;

            // ── LED ring (rotating dots — only when armed) ──
            if (armed) {
                const ledCount = 6;
                const rotate = now * 0.0015;
                for (let i = 0; i < ledCount; i++) {
                    const a = (i / ledCount) * Math.PI * 2 + rotate;
                    const lx = Math.cos(a) * (radius * 0.72);
                    const ly = Math.sin(a) * (radius * 0.72);
                    // Each LED individually phases so the ring "chases"
                    const ledOn = Math.sin(now * 0.012 + i * 0.9) > 0;
                    ctx.fillStyle = ledOn ? '#ff2200' : '#440000';
                    ctx.beginPath();
                    ctx.arc(lx, ly, 1.6, 0, Math.PI * 2);
                    ctx.fill();
                }
            }

            // ── Status blinker on top ──
            if (armed) {
                ctx.fillStyle = blinkOn ? '#ff0000' : '#330000';
                ctx.beginPath();
                ctx.arc(0, -radius - 2, 2, 0, Math.PI * 2);
                ctx.fill();
            }

            // ── Trigger-radius ring (faint, brighter when blink-on) ──
            if (armed) {
                ctx.strokeStyle = blinkOn ? 'rgba(255, 80, 0, 0.45)' : 'rgba(255, 100, 0, 0.18)';
                ctx.lineWidth = blinkOn ? 1.5 : 1;
                ctx.beginPath();
                ctx.arc(0, 0, mine.triggerRadius || 60, 0, Math.PI * 2);
                ctx.stroke();

                // ── Magnetic field ring (outer, dashed, slowly rotating) ──
                // Visualizes the pull radius (1.8 × trigger). Shifting the
                // dash offset gives a "field rotating" feel without
                // expensive transforms.
                const pullR = (mine.triggerRadius || 60) * 1.8;
                ctx.save();
                ctx.strokeStyle = 'rgba(120, 180, 255, 0.28)';
                ctx.lineWidth = 1;
                ctx.setLineDash([6, 8]);
                ctx.lineDashOffset = -now * 0.04;
                ctx.beginPath();
                ctx.arc(0, 0, pullR, 0, Math.PI * 2);
                ctx.stroke();
                ctx.restore();
            }

            ctx.restore();
        }
    }

    // ─── Nova Ring ──────────────────────────────────────────────────
    if (p.novaActive && p.novaRings) {
        for (const ring of p.novaRings) {
            if (!ring.active) continue;
            const progress = ring.elapsed / ring.duration;
            ctx.save();
            ctx.globalAlpha = 1 - progress;
            ctx.strokeStyle = POWER_WEAPONS.NOVA_BLAST.color;
            ctx.lineWidth = 4 * (1 - progress);
            ctx.shadowColor = POWER_WEAPONS.NOVA_BLAST.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(ring.x, ring.y, ring.currentRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    // ─── Lightning Arc — continuous tether (5.64.15) ─────────────────
    // Two render paths, both draw the same jagged arc style:
    //   1. p.lightningArcActive + p.lightningArcTarget: draw player → target.
    //   2. p.lightningChains (legacy): draw all chain segments.
    if ((p.lightningArcActive && p.lightningArcTarget) || (p.lightningChains && p.lightningChains.length > 0)) {
        ctx.save();
        ctx.strokeStyle = PRIMARY_WEAPONS.LIGHTNING_ARC.color;
        ctx.lineWidth = 3;
        ctx.shadowColor = '#aaaaff';
        ctx.shadowBlur = 8;
        const drawJaggedArc = (fromX, fromY, toX, toY, segs = 6, jitter = 18) => {
            ctx.beginPath();
            ctx.moveTo(fromX, fromY);
            for (let s = 1; s < segs; s++) {
                const t = s / segs;
                const mx = fromX + (toX - fromX) * t + (Math.random() - 0.5) * jitter;
                const my = fromY + (toY - fromY) * t + (Math.random() - 0.5) * jitter;
                ctx.lineTo(mx, my);
            }
            ctx.lineTo(toX, toY);
            ctx.stroke();
        };
        // Continuous tether path.
        if (p.lightningArcActive && p.lightningArcTarget) {
            const t = p.lightningArcTarget;
            if (t.active) {
                drawJaggedArc(p.x, p.y, t.x, t.y);
                // Bright inner core for the visible "live wire" feel.
                ctx.save();
                ctx.strokeStyle = '#ffffff';
                ctx.lineWidth = 1.2;
                ctx.shadowBlur = 0;
                drawJaggedArc(p.x, p.y, t.x, t.y, 8, 8);
                ctx.restore();
            }
        }
        // Legacy chain path.
        if (p.lightningChains && p.lightningChains.length > 0) {
            for (const chain of p.lightningChains) {
                if (!chain.active) continue;
                for (let j = 0; j < chain.targets.length - 1; j++) {
                    const from = chain.targets[j];
                    const to = chain.targets[j + 1];
                    drawJaggedArc(from.x, from.y, to.x, to.y, 5, 20);
                }
            }
        }
        ctx.restore();
    }

    // ─── Missiles — vector-style rocket with fins + thruster + lights ──
    if (p.activeMissiles) {
        const now = Date.now();
        const BLINK_MS = 800; // last 800ms of life: blink-out telegraph
        for (const missile of p.activeMissiles) {
            if (!missile.active) continue;

            // Blink-out near end of range — same pattern as the
            // powerup-expiry blink. Frequency ramps up as life shrinks.
            if (missile.life < BLINK_MS) {
                const t = Math.max(0, missile.life / BLINK_MS); // 1 → 0
                const hz = 2 + (1 - t) * 12; // ~2Hz at start of blink → ~14Hz at end
                const phase = (now / 1000) * hz * Math.PI * 2;
                if (Math.sin(phase) < 0) continue; // skip draw on "off" frames
            }

            const angle = missile.angle ?? Math.atan2(missile.vel?.y || 0, missile.vel?.x || 0);
            ctx.save();
            ctx.translate(missile.x, missile.y);
            ctx.rotate(angle);

            // Thruster flame trail — gradient fading orange→transparent.
            const thrusterLen = 16 + Math.random() * 6;
            const thrusterGrad = ctx.createLinearGradient(-8, 0, -8 - thrusterLen, 0);
            thrusterGrad.addColorStop(0, 'rgba(255, 220, 80, 0.95)');
            thrusterGrad.addColorStop(0.45, 'rgba(255, 120, 40, 0.7)');
            thrusterGrad.addColorStop(1, 'rgba(80, 0, 0, 0)');
            ctx.fillStyle = thrusterGrad;
            ctx.beginPath();
            ctx.moveTo(-8, -3);
            ctx.lineTo(-8 - thrusterLen, 0);
            ctx.lineTo(-8, 3);
            ctx.closePath();
            ctx.fill();

            // ── Body — proper rocket silhouette ──
            // Nose cone (sharper, longer) + cylindrical body + tapered tail.
            ctx.fillStyle = '#cc2222';
            ctx.strokeStyle = '#ff8866';
            ctx.lineWidth = 1.5;
            ctx.lineJoin = 'round';
            ctx.beginPath();
            ctx.moveTo(13, 0);       // sharp nose
            ctx.lineTo(7, -2.6);     // shoulder
            ctx.lineTo(-5, -2.6);    // body
            ctx.lineTo(-8, -1.4);    // tail taper
            ctx.lineTo(-8, 1.4);
            ctx.lineTo(-5, 2.6);
            ctx.lineTo(7, 2.6);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Body banding — single dark line across the cylindrical
            // section sells the rocket look without much cost.
            ctx.strokeStyle = 'rgba(60, 0, 0, 0.6)';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(2, -2.6);
            ctx.lineTo(2, 2.6);
            ctx.stroke();

            // ── Aft fins (wide swept-back wings) ──
            ctx.fillStyle = '#aa3333';
            ctx.strokeStyle = '#ff7755';
            ctx.lineWidth = 1.2;
            // Top fin
            ctx.beginPath();
            ctx.moveTo(-2, -2.6);
            ctx.lineTo(-1, -7);     // tip
            ctx.lineTo(-7, -7);
            ctx.lineTo(-7, -2.6);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
            // Bottom fin
            ctx.beginPath();
            ctx.moveTo(-2, 2.6);
            ctx.lineTo(-1, 7);
            ctx.lineTo(-7, 7);
            ctx.lineTo(-7, 2.6);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // ── Tail vertical fin (small, centered) ──
            ctx.beginPath();
            ctx.moveTo(-5, 0);
            ctx.lineTo(-9, -2.5);
            ctx.lineTo(-10, 0);
            ctx.lineTo(-9, 2.5);
            ctx.closePath();
            ctx.fill();
            ctx.stroke();

            // Pulsing nose-cone light
            const pulse = 0.55 + Math.sin(now * 0.022) * 0.45;
            ctx.fillStyle = `rgba(255, 255, 200, ${pulse})`;
            ctx.beginPath();
            ctx.arc(11, 0, 1.6, 0, Math.PI * 2);
            ctx.fill();

            // Side LEDs (steady amber)
            ctx.fillStyle = '#ffaa00';
            ctx.beginPath();
            ctx.arc(0, -1.6, 0.8, 0, Math.PI * 2);
            ctx.arc(0, 1.6, 0.8, 0, Math.PI * 2);
            ctx.fill();

            ctx.restore();
        }
    }

    // ─── Deflector Orbs ─────────────────────────────────────────────
    if (p.deflectorOrbs && p.deflectorOrbs.length > 0) {
        for (const orb of p.deflectorOrbs) {
            if (!orb.active || orb.hits <= 0) continue;
            ctx.save();
            ctx.fillStyle = DEFENSE_SKILLS.DEFLECTOR_ORBS.color;
            ctx.globalAlpha = 0.7 + 0.3 * Math.sin(Date.now() * 0.006);
            ctx.shadowColor = DEFENSE_SKILLS.DEFLECTOR_ORBS.color;
            ctx.shadowBlur = 8;
            ctx.beginPath();
            ctx.arc(orb.x, orb.y, 6, 0, Math.PI * 2);
            ctx.fill();
            ctx.restore();
        }
    }

    // ─── Bulwark Aura ───────────────────────────────────────────────
    if (p.activeSkillEffects && p.activeSkillEffects.has('BULWARK')) {
        ctx.save();
        const pulse = 0.3 + 0.15 * Math.sin(Date.now() * 0.004);
        ctx.globalAlpha = pulse;
        ctx.fillStyle = DEFENSE_SKILLS.BULWARK.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 35, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }

    // ─── Tractor Shield ────────────────────────────────────────────
    if (p.activeSkillEffects && p.activeSkillEffects.has('TRACTOR_SHIELD')) {
        const skill = DEFENSE_SKILLS.TRACTOR_SHIELD;
        const arc = skill.shieldArc + this.player.getPowerupStacks('WIDE_ANGLE') * (Math.PI / 6);
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = skill.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, 50, p.angle - arc / 2, p.angle + arc / 2);
        ctx.closePath();
        ctx.fill();
        ctx.restore();
    }

    // ─── EMP Pulse ─────────────────────────────────────────────────
    if (p.empPulseActive) {
        const skill = DEFENSE_SKILLS.EMP_PULSE;
        const radius = skill.radius + this.player.getPowerupStacks('WIDE_BAND') * 60;
        const elapsed = Date.now() - (p.empPulseStartTime || 0);
        const progress = Math.min(1, elapsed / 500);
        ctx.save();
        ctx.globalAlpha = 0.6 * (1 - progress);
        ctx.strokeStyle = skill.color;
        ctx.lineWidth = 3;
        ctx.shadowColor = skill.color;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(p.x, p.y, radius * progress, 0, Math.PI * 2);
        ctx.stroke();
        ctx.restore();
    }

    // ─── Phase Dash Trail ───────────────────────────────────────────
    if (p.activeSkillEffects && p.activeSkillEffects.has('PHASE_DASH')) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = DEFENSE_SKILLS.PHASE_DASH.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
