// Weapon effects rendering: beams, mines, nova rings, lightning, missiles, skill effects
import { PRIMARY_WEAPONS, POWER_WEAPONS, DEFENSE_SKILLS } from './weapon-data.js';

// 5.79.4 — Module-level scratch buffers for jagged-arc paths. Replace
//   the per-call `path = [].push([x,y])` allocations that the perf
//   bottleneck report flagged as the targeted-arc's main GC source
//   (~420 alloc/sec at heavy density).
//   Capacity: 16 points × 2 floats = 32 entries per buffer. The
//   render loop above clamps to (MAX_ARC_SEGS - 1) interior points.
const _arcScratch = {
    mid:  new Float32Array(32),
    core: new Float32Array(32),
    // 5.79.4 — Previous-frame path for the targeted arc, used to
    //   temporally blend jitter so the lightning reads as a wandering
    //   live wire instead of a frame-by-frame strobe. Updated by the
    //   targeted-arc render path (one call per frame); the chain /
    //   frayed-static paths don't read it.
    prevMid:  new Float32Array(32),
    prevCore: new Float32Array(32),
    hasPrev: false,
};

// Per-call scratch for the Lance Beam jagged path. Same idea — single
// reusable Float32Array instead of allocating new tuple arrays each
// frame.
const _beamScratch = {
    path: new Float32Array(64),  // 32 points × 2 floats
};

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
        const config = POWER_WEAPONS.LANCE_BEAM;
        const targetW = (config.beamWidth || 6) * (1 + this.player.getPowerupStacks('BEAM_WIDTH') * 0.3);
        const targetRange = config.range * 400;
        const hitDist = (typeof p.beamHitDist === 'number' && p.beamHitDist > 0) ? p.beamHitDist : targetRange;
        // 6.55.0 — the blade swings across the swept arc (beamSweepAngle);
        // the damage cone (collision-system) is centered on the live aim.
        const sweepAng = (typeof p.beamSweepAngle === 'number') ? p.beamSweepAngle : p.angle;
        const arcHalf = (config.arcHalfAngle != null) ? config.arcHalfAngle : 0.7;
        const dx = Math.cos(sweepAng);
        const dy = Math.sin(sweepAng);

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

        // Faint swept-cone fill so the damage area (±arcHalf around the
        // aim) reads at a glance behind the swinging blade.
        ctx.globalAlpha = 0.12 * (0.5 + 0.5 * growEase);
        ctx.fillStyle = config.color;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.arc(p.x, p.y, targetRange * growEase, p.angle - arcHalf, p.angle + arcHalf);
        ctx.closePath();
        ctx.fill();

        // Lightning-style zig-zag — break the line into N segments and
        // add small perpendicular jitter to each interior vertex.
        const segs = Math.max(6, Math.floor(range / 28));
        const perpX = -dy;
        const perpY = dx;
        const jitterMag = beamW * 0.7;

        // 5.79.0 — Black underline stroke for definition. Drawn first
        //   along the same path with a slightly wider line so the
        //   colored beam reads with a hard outline against bright
        //   backgrounds.
        // 5.79.4 — Path written into the module-level Float32Array
        //   scratch instead of `beamPath = [...]; push([cx, cy])` —
        //   removes ~120 small-array allocs/sec while the beam fires.
        const beamPath = _beamScratch.path;
        const beamN = Math.min(segs - 1, 31);
        for (let i = 1; i <= beamN; i++) {
            const t = i / segs;
            const cx = p.x + (endX - p.x) * t;
            const cy = p.y + (endY - p.y) * t;
            const j = (Math.random() - 0.5) * jitterMag;
            const idx = (i - 1) * 2;
            beamPath[idx]     = cx + perpX * j;
            beamPath[idx + 1] = cy + perpY * j;
        }
        ctx.globalAlpha = 0.9 * (0.5 + 0.5 * growEase);
        ctx.strokeStyle = '#000';
        ctx.lineWidth = beamW + 3;
        ctx.shadowBlur = 0;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        for (let i = 0; i < beamN; i++) ctx.lineTo(beamPath[i * 2], beamPath[i * 2 + 1]);
        ctx.lineTo(endX, endY);
        ctx.stroke();

        // 5.79.4 — Outer glow: was a per-stroke `shadowBlur = beamW*2`
        //   Gaussian (~30 µs/frame at beamW=8). Now: a wider faint
        //   colored stroke drawn FIRST, then the sharp colored stroke
        //   on top — same fake-glow technique used elsewhere. Reads
        //   nearly identical without the Gaussian cost.
        ctx.globalAlpha = 0.45 * (0.5 + 0.5 * growEase);
        ctx.strokeStyle = config.color;
        ctx.lineWidth = beamW * 2.5;
        ctx.shadowBlur = 0;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        for (let i = 0; i < beamN; i++) ctx.lineTo(beamPath[i * 2], beamPath[i * 2 + 1]);
        ctx.lineTo(endX, endY);
        ctx.stroke();
        // Sharp main stroke
        ctx.globalAlpha = 0.95 * (0.5 + 0.5 * growEase);
        ctx.lineWidth = beamW;
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        for (let i = 0; i < beamN; i++) ctx.lineTo(beamPath[i * 2], beamPath[i * 2 + 1]);
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

            // 5.79.3 — Black silhouette outline pass restored (was
            //   removed in 5.79.2 with the shadowBlur halo). Now drawn
            //   as a single wider black stroke under each major piece
            //   — much cheaper than shadowBlur (no Gaussian blur), but
            //   still gives mines a hard edge against bright nebulae.
            //   See docs/STROKE_PERF_ANALYSIS_5.79.md item #3.
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 5;
            ctx.lineCap = 'round';
            ctx.lineJoin = 'round';
            // Spike silhouettes
            for (let i = 0; i < 4; i++) {
                const a = (i / 4) * Math.PI * 2 + Math.PI / 4;
                const x1 = Math.cos(a) * (radius - 1);
                const y1 = Math.sin(a) * (radius - 1);
                const x2 = Math.cos(a) * (radius + 5);
                const y2 = Math.sin(a) * (radius + 5);
                ctx.beginPath();
                ctx.moveTo(x1, y1);
                ctx.lineTo(x2, y2);
                ctx.stroke();
            }
            // Body silhouette
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.stroke();

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

                // 6.23.0 (2026-05-19) — Plasma shield perimeter outline.
                //   Only rendered when the mine actually has a shield
                //   (player owns the MINE_SHIELD_RADIUS upgrade).
                //   Very faint single-pixel stroke so the zone is
                //   readable without competing with the trigger / pull
                //   rings. The Star-Wars-style flash on hit (drawn by
                //   the `mineShieldFlash` particle) is the primary
                //   shield visual; this outline just hints at the zone.
                if (mine.shieldRadius && mine.shieldRadius > 0) {
                    ctx.save();
                    ctx.strokeStyle = 'rgba(92, 200, 255, 0.10)';
                    ctx.lineWidth = 1;
                    ctx.beginPath();
                    ctx.arc(0, 0, mine.shieldRadius, 0, Math.PI * 2);
                    ctx.stroke();
                    ctx.restore();
                }
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
            // 5.79.0 — black under-stroke for definition.
            ctx.strokeStyle = '#000';
            ctx.lineWidth = (4 * (1 - progress)) + 3;
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(ring.x, ring.y, ring.currentRadius, 0, Math.PI * 2);
            ctx.stroke();

            // 5.79.4 — Replaced shadowBlur=10 glow with a fake-glow
            //   pass: a wider faint ring drawn first, then the bright
            //   sharp ring on top. Reads identical to the shadowBlur
            //   look without the per-frame Gaussian cost (Nova ring
            //   fires every frame the ring is active, ~0.5s × 60 fps).
            const novaCol = POWER_WEAPONS.NOVA_BLAST.color;
            ctx.strokeStyle = novaCol;
            ctx.globalAlpha = (1 - progress) * 0.35;
            ctx.lineWidth = (4 * (1 - progress)) + 6;
            ctx.shadowBlur = 0;
            ctx.beginPath();
            ctx.arc(ring.x, ring.y, ring.currentRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.globalAlpha = 1 - progress;
            ctx.lineWidth = 4 * (1 - progress);
            ctx.beginPath();
            ctx.arc(ring.x, ring.y, ring.currentRadius, 0, Math.PI * 2);
            ctx.stroke();
            ctx.restore();
        }
    }

    // ─── Arc Lightning — unified strand renderer (5.79.5 rewrite) ─────
    //
    // Single render path drives both visual modes (frayed vs focused)
    // with continuous time-based animation and a smooth crossfade.
    //
    //   • Always renders N strands (default 3). Each strand owns a
    //     phase offset so they wander on different sine cycles.
    //   • Each strand has TWO target poses:
    //       - frayedEnd: a slowly-drifting point in front of the ship,
    //         driven by sin(time * speed + phase) — continuous, smooth.
    //       - focusedEnd: the lerped target position with a small
    //         per-strand cluster jitter so multi-strand focused arcs
    //         don't visually overlap into one fat line.
    //     The actual rendered endpoint = lerp(frayedEnd, focusedEnd,
    //     lockBlend). lockBlend smoothly approaches 1 when a target is
    //     locked, 0 when none — gives a continuous crossfade between
    //     the two looks instead of an abrupt mode flip.
    //   • Path jitter is sampled fresh each frame but TEMPORALLY
    //     BLENDED (65% prior + 35% new) per-strand so the lightning
    //     reads as a wandering live wire instead of a strobe.
    //
    // Range is decided by the collision system (chainRange in
    // weapon-data); we reach into config.chainRange here to size the
    // frayed-fan distance so it visually previews the actual reach.
    const arcCfg = POWER_WEAPONS.LIGHTNING_ARC;
    const arcColor = arcCfg ? arcCfg.color : '#aaeeff';

    // 5.79.4 — Reused scratch buffers for jagged-arc paths. Was
    //   per-call `path = []` + `path.push([mx, my])` → ~420 array
    //   allocs/sec at heavy density. Now: single Float32Array per
    //   buffer, written + read each call without allocation.
    const arcMidPath  = _arcScratch.mid;
    const arcCorePath = _arcScratch.core;

    const drawJaggedArcPair = (fromX, fromY, toX, toY, segs, jitter, coreSegs, coreJitter, smooth = false) => {
        // Sample one shared random path so the black + colored strokes
        // trace the same zigzag. (segs - 1) interior points; each is
        // 2 floats. Up to MAX_ARC_SEGS = 16 points fit in our scratch.
        //
        // 5.79.4 — `smooth` toggles temporal blending with the previous
        //   frame's path (only used by the targeted-arc call which
        //   fires exactly once per frame). Blends 65% prior + 35% new
        //   to suppress the per-frame strobe while still letting the
        //   lightning visibly wander.
        const midN = Math.min(segs - 1, 15);
        const PREV_MIX = 0.65;
        const NEW_MIX = 0.35;
        const useSmooth = smooth && _arcScratch.hasPrev;
        for (let s = 1; s <= midN; s++) {
            const t = s / segs;
            const idx = (s - 1) * 2;
            const newX = fromX + (toX - fromX) * t + (Math.random() - 0.5) * jitter;
            const newY = fromY + (toY - fromY) * t + (Math.random() - 0.5) * jitter;
            if (useSmooth) {
                arcMidPath[idx]     = _arcScratch.prevMid[idx]     * PREV_MIX + newX * NEW_MIX;
                arcMidPath[idx + 1] = _arcScratch.prevMid[idx + 1] * PREV_MIX + newY * NEW_MIX;
            } else {
                arcMidPath[idx]     = newX;
                arcMidPath[idx + 1] = newY;
            }
        }
        // Black under-stroke
        ctx.save();
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 6;
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        for (let s = 0; s < midN; s++) ctx.lineTo(arcMidPath[s * 2], arcMidPath[s * 2 + 1]);
        ctx.lineTo(toX, toY);
        ctx.stroke();
        ctx.restore();
        // 5.79.4 — Fake-glow under the colored stroke. Was a per-call
        //   shadowBlur=8 Gaussian; now a wider faint stroke at 35%
        //   alpha. Same look, no Gaussian per stroke.
        ctx.globalAlpha = 0.35;
        ctx.strokeStyle = arcColor;
        ctx.lineWidth = 7;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        for (let s = 0; s < midN; s++) ctx.lineTo(arcMidPath[s * 2], arcMidPath[s * 2 + 1]);
        ctx.lineTo(toX, toY);
        ctx.stroke();
        // Sharp colored stroke
        ctx.globalAlpha = 1;
        ctx.lineWidth = 3;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        for (let s = 0; s < midN; s++) ctx.lineTo(arcMidPath[s * 2], arcMidPath[s * 2 + 1]);
        ctx.lineTo(toX, toY);
        ctx.stroke();
        // Inner bright core — separate jitter-rolled path. Smoothed
        // the same way as the mid path when `smooth` is requested.
        const coreN = Math.min(coreSegs - 1, 15);
        for (let s = 1; s <= coreN; s++) {
            const t = s / coreSegs;
            const idx = (s - 1) * 2;
            const newX = fromX + (toX - fromX) * t + (Math.random() - 0.5) * coreJitter;
            const newY = fromY + (toY - fromY) * t + (Math.random() - 0.5) * coreJitter;
            if (useSmooth) {
                arcCorePath[idx]     = _arcScratch.prevCore[idx]     * PREV_MIX + newX * NEW_MIX;
                arcCorePath[idx + 1] = _arcScratch.prevCore[idx + 1] * PREV_MIX + newY * NEW_MIX;
            } else {
                arcCorePath[idx]     = newX;
                arcCorePath[idx + 1] = newY;
            }
        }
        // Stash the just-rendered path for next frame's blend.
        if (smooth) {
            _arcScratch.prevMid.set(arcMidPath);
            _arcScratch.prevCore.set(arcCorePath);
            _arcScratch.hasPrev = true;
        }
        ctx.save();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 1.2;
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        for (let s = 0; s < coreN; s++) ctx.lineTo(arcCorePath[s * 2], arcCorePath[s * 2 + 1]);
        ctx.lineTo(toX, toY);
        ctx.stroke();
        ctx.restore();
    };

    if (p.lightningArcActive || (p.lightningChains && p.lightningChains.length > 0)) {
        // ── Unified strand state ──────────────────────────────────
        const STRANDS = 3;
        const ARC_PTS_PER_STRAND = 8;
        // Lazy-init the per-player render state.
        if (!p._arcRenderState) {
            p._arcRenderState = {
                lockBlend: 0,                              // 0 = frayed, 1 = focused
                strandPath: new Float32Array(STRANDS * ARC_PTS_PER_STRAND * 2),
                prevPath:   new Float32Array(STRANDS * ARC_PTS_PER_STRAND * 2),
                hasPrev: false,
                lastTargetX: 0,
                lastTargetY: 0,
                hasLastTarget: false,
            };
        }
        const arcRS = p._arcRenderState;

        // Lock-blend update: smoothly lerp toward 1 when target locked,
        // toward 0 when no target. ~250 ms to traverse most of the way.
        const hasTarget = !!(p.lightningArcActive && p.lightningArcTarget && p.lightningArcTarget.active);
        const targetBlend = hasTarget ? 1 : 0;
        // Per-frame approach rate: 0.12 → ~6 frames to half = 100 ms half-life.
        arcRS.lockBlend += (targetBlend - arcRS.lockBlend) * 0.12;

        // Track the lerped "focused endpoint" so it doesn't snap when
        // the target enemy is destroyed mid-fire — we keep heading
        // toward the last known position while the lockBlend decays.
        if (hasTarget) {
            arcRS.lastTargetX = p.lightningArcTarget.x;
            arcRS.lastTargetY = p.lightningArcTarget.y;
            arcRS.hasLastTarget = true;
        }
        // Smooth toward the live target (or the last known one) at
        // 25%/frame so even if the target is moving fast, the visible
        // endpoint trails it slightly instead of snapping.
        if (arcRS.hasLastTarget) {
            if (p._arcVisX === undefined) {
                p._arcVisX = arcRS.lastTargetX;
                p._arcVisY = arcRS.lastTargetY;
            }
            p._arcVisX += (arcRS.lastTargetX - p._arcVisX) * 0.25;
            p._arcVisY += (arcRS.lastTargetY - p._arcVisY) * 0.25;
        }

        // Origin: a hair forward of the ship's nose.
        const cx = p.x + Math.cos(p.angle) * (p.radius || 12) * 0.6;
        const cy = p.y + Math.sin(p.angle) * (p.radius || 12) * 0.6;

        // Frayed-fan params (used when lockBlend < 1).
        const baseRange = (arcCfg && arcCfg.chainRange) || 360;
        const fanLen = Math.min(450, baseRange * 0.85);
        // 5.79.7 — tighter fan: ~43° → ~18°. Strands cluster much
        //   closer together so the frayed mode reads as a chaotic
        //   forward bolt instead of a wide fan.
        const SPREAD = Math.PI * 0.10;

        // Time bases for continuous wandering. Two harmonics blended
        // so motion never lands on a perfectly periodic pattern.
        const time = Date.now() * 0.001;

        // Per-strand path generation. We compose the endpoint as the
        // lerp of two pre-baked positions, then sample interior path
        // points with jitter + temporal blending.
        const strandPath = arcRS.strandPath;
        const prevPath   = arcRS.prevPath;
        const lockBlend  = arcRS.lockBlend;
        // 5.79.7 — More randomness frame-to-frame. Was 70/30 (very
        //   smooth, almost too smooth — looked sluggish). Now 45/55
        //   so each frame's new jitter dominates while previous frames
        //   still pull the path back toward continuity. Reads as a
        //   much more chaotic, lively arc.
        const PREV_MIX = 0.45;
        const NEW_MIX  = 0.55;

        for (let i = 0; i < STRANDS; i++) {
            // ── Frayed pose ──
            // Each strand has a slot in the fan. The slot ANGLE itself
            // wanders sinusoidally over time so the fan undulates
            // continuously instead of holding a static spread.
            const slot = STRANDS === 1 ? 0 : (i / (STRANDS - 1)) - 0.5;
            // 5.79.7 — Larger angle wobble per strand (was 0.06 + 0.03
            //   ≈ 5°). Now 0.14 + 0.08 ≈ 12° peak wobble so strands
            //   visibly weave in and out of each other within the
            //   tighter fan.
            const slotWobble =
                Math.sin(time * 2.4 + i * 2.3) * 0.14 +
                Math.sin(time * 4.7 + i * 1.1) * 0.08;
            const fanAngle = p.angle + slot * SPREAD + slotWobble;
            const lenWobble = 0.78 + Math.sin(time * 2.4 + i * 0.9) * 0.18;
            const fanLenStrand = fanLen * lenWobble;
            const frayedEx = cx + Math.cos(fanAngle) * fanLenStrand;
            const frayedEy = cy + Math.sin(fanAngle) * fanLenStrand;

            // ── Focused pose ──
            // Cluster strands tightly around the target so they don't
            // visually overlap into one fat line. Slot offset is
            // perpendicular to the player→target axis, scaled with a
            // bit of time wobble.
            let focusedEx = frayedEx, focusedEy = frayedEy;
            if (arcRS.hasLastTarget) {
                const tx = (p._arcVisX !== undefined) ? p._arcVisX : arcRS.lastTargetX;
                const ty = (p._arcVisY !== undefined) ? p._arcVisY : arcRS.lastTargetY;
                const dx = tx - cx, dy = ty - cy;
                const d = Math.hypot(dx, dy) || 1;
                const perpX = -dy / d, perpY = dx / d;
                const focusJitter = slot * 14 + Math.sin(time * 4.3 + i * 1.7) * 4;
                focusedEx = tx + perpX * focusJitter;
                focusedEy = ty + perpY * focusJitter;
            }

            // ── Blended endpoint ──
            const ex = frayedEx + (focusedEx - frayedEx) * lockBlend;
            const ey = frayedEy + (focusedEy - frayedEy) * lockBlend;

            // ── Interior path ──
            // Jitter shrinks toward the endpoint so the lightning
            // reads as "anchored at the target" when focused.
            // 5.79.7 — bigger base jitter (18 → 32) AND a per-segment
            //   high-frequency noise component on top of the random
            //   sample, for that classic "sparking electric arc"
            //   chaos. Falloff stays bell-shaped so endpoints anchor.
            const baseJitter = 32;
            const jitterFalloff = (s, totalS) => {
                const t = s / totalS;
                return Math.sin(Math.PI * t);
            };
            const baseIdx = i * ARC_PTS_PER_STRAND * 2;
            for (let s = 1; s <= ARC_PTS_PER_STRAND; s++) {
                const t = s / (ARC_PTS_PER_STRAND + 1);
                const mxBase = cx + (ex - cx) * t;
                const myBase = cy + (ey - cy) * t;
                const fall = jitterFalloff(s, ARC_PTS_PER_STRAND + 1);
                const jitter = baseJitter * fall;
                // Two independent random samples summed so the noise
                // distribution has fatter tails (more big spikes) than
                // a single uniform sample.
                const noiseX = (Math.random() - 0.5 + Math.random() - 0.5) * jitter;
                const noiseY = (Math.random() - 0.5 + Math.random() - 0.5) * jitter;
                // High-frequency time-driven shimmer — small per-frame
                // perpendicular kick. Adds a baseline crackle even
                // when temporal blending is heavy.
                const shimmer = Math.sin(time * 60 + i * 3.7 + s * 1.9) * 4 * fall;
                const newX = mxBase + noiseX + shimmer;
                const newY = myBase + noiseY - shimmer;
                const idx = baseIdx + (s - 1) * 2;
                if (arcRS.hasPrev) {
                    strandPath[idx]     = prevPath[idx]     * PREV_MIX + newX * NEW_MIX;
                    strandPath[idx + 1] = prevPath[idx + 1] * PREV_MIX + newY * NEW_MIX;
                } else {
                    strandPath[idx]     = newX;
                    strandPath[idx + 1] = newY;
                }
            }
            // Last point of each strand = its endpoint (stored at the
            // tail of the same buffer for a single-pass draw loop).
            // We'll stop the lineTo loop one short and lineTo(ex, ey)
            // separately, so we don't actually need to write the
            // endpoint into the buffer — leaving it as is.

            // Stash endpoint in prev's last-2 slots for the renderer.
            // (We use a dedicated metadata slot since prevPath shape
            //  matches strandPath; endpoints are passed via locals.)
            arcRS._endX = arcRS._endX || new Float32Array(STRANDS);
            arcRS._endY = arcRS._endY || new Float32Array(STRANDS);
            arcRS._endX[i] = ex;
            arcRS._endY[i] = ey;
        }

        // Snapshot the just-written paths for next frame's blend.
        prevPath.set(strandPath);
        arcRS.hasPrev = true;

        // ── Render: 3-pass strokes per strand ──
        ctx.save();
        ctx.lineJoin = 'round';
        ctx.lineCap = 'round';
        ctx.shadowBlur = 0;
        // Slight overall alpha so the strands compose against the
        // bright fake-glow without overpowering it.
        const overallAlpha = 0.6 + 0.4 * lockBlend; // brighter when focused
        for (let i = 0; i < STRANDS; i++) {
            const ex = arcRS._endX[i];
            const ey = arcRS._endY[i];
            const baseIdx = i * ARC_PTS_PER_STRAND * 2;
            // Black under-stroke
            ctx.globalAlpha = overallAlpha;
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 6;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            for (let s = 0; s < ARC_PTS_PER_STRAND; s++) {
                ctx.lineTo(strandPath[baseIdx + s * 2], strandPath[baseIdx + s * 2 + 1]);
            }
            ctx.lineTo(ex, ey);
            ctx.stroke();
            // Fake-glow (faint wide colored)
            ctx.globalAlpha = 0.30 * overallAlpha;
            ctx.strokeStyle = arcColor;
            ctx.lineWidth = 7;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            for (let s = 0; s < ARC_PTS_PER_STRAND; s++) {
                ctx.lineTo(strandPath[baseIdx + s * 2], strandPath[baseIdx + s * 2 + 1]);
            }
            ctx.lineTo(ex, ey);
            ctx.stroke();
            // Sharp colored
            ctx.globalAlpha = overallAlpha;
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            for (let s = 0; s < ARC_PTS_PER_STRAND; s++) {
                ctx.lineTo(strandPath[baseIdx + s * 2], strandPath[baseIdx + s * 2 + 1]);
            }
            ctx.lineTo(ex, ey);
            ctx.stroke();
            // Bright white core
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1.2;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            for (let s = 0; s < ARC_PTS_PER_STRAND; s++) {
                ctx.lineTo(strandPath[baseIdx + s * 2], strandPath[baseIdx + s * 2 + 1]);
            }
            ctx.lineTo(ex, ey);
            ctx.stroke();
        }
        ctx.restore();

        // ── Legacy chain path (unchanged for back-compat) ──
        if (p.lightningChains && p.lightningChains.length > 0) {
            ctx.save();
            for (const chain of p.lightningChains) {
                if (!chain.active) continue;
                for (let j = 0; j < chain.targets.length - 1; j++) {
                    const from = chain.targets[j];
                    const to = chain.targets[j + 1];
                    drawJaggedArcPair(from.x, from.y, to.x, to.y, 5, 20, 6, 8);
                }
            }
            ctx.restore();
        }
    }

    // 5.79.4 — Smooth target-position lerp (kept here in case the new
    //   render path falls back to the legacy chain code above).
    if (!p.lightningArcActive || !p.lightningArcTarget) {
        if (p._arcVisX !== undefined) {
            // Decay toward the player when nothing is locked.
            p._arcVisX += (p.x - p._arcVisX) * 0.18;
            p._arcVisY += (p.y - p._arcVisY) * 0.18;
        }
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

            // 5.79.3 — Black silhouette outline pass under the rocket
            //   body + fins (replaces the 5.79.2 absence of any
            //   outline). Drawn FIRST as a single wider black stroke
            //   on the same paths used for the colored fills below.
            //   Cheaper than shadowBlur, no Gaussian, restores the
            //   rocket's edge against bright backgrounds.
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 4;
            ctx.lineJoin = 'round';
            // Body silhouette
            ctx.beginPath();
            ctx.moveTo(13, 0);
            ctx.lineTo(7, -2.6);
            ctx.lineTo(-5, -2.6);
            ctx.lineTo(-8, -1.4);
            ctx.lineTo(-8, 1.4);
            ctx.lineTo(-5, 2.6);
            ctx.lineTo(7, 2.6);
            ctx.closePath();
            ctx.stroke();
            // Top fin silhouette
            ctx.lineWidth = 3.5;
            ctx.beginPath();
            ctx.moveTo(-2, -2.6); ctx.lineTo(-1, -7);
            ctx.lineTo(-7, -7);   ctx.lineTo(-7, -2.6);
            ctx.closePath();
            ctx.stroke();
            // Bottom fin silhouette
            ctx.beginPath();
            ctx.moveTo(-2, 2.6); ctx.lineTo(-1, 7);
            ctx.lineTo(-7, 7);   ctx.lineTo(-7, 2.6);
            ctx.closePath();
            ctx.stroke();
            // Tail fin silhouette
            ctx.beginPath();
            ctx.moveTo(-5, 0);
            ctx.lineTo(-9, -2.5);
            ctx.lineTo(-10, 0);
            ctx.lineTo(-9, 2.5);
            ctx.closePath();
            ctx.stroke();

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

    // ─── Dash Trail (5.93.0) ────────────────────────────────────────
    // Dash promoted from a defense skill (PHASE_DASH) to a core SHIFT-key
    // movement primitive. The afterimage ghost is still rendered during
    // the active dash burst; color is hardcoded to the old PHASE_DASH
    // tint since DEFENSE_SKILLS no longer carries the entry.
    if (p.isDashIFrameActive && p.isDashIFrameActive()) {
        ctx.save();
        ctx.globalAlpha = 0.4;
        ctx.fillStyle = '#aa88ff';
        ctx.beginPath();
        ctx.arc(p.x, p.y, 15, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}
