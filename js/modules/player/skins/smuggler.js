// ── SMUGGLER skin ──────────────────────────────────────────────────
// A circular split-hull freighter (Corellian-saucer homage): round dish
// hull with a forked mandible prow, an offset side cockpit pod, a
// spinning sensor dish, a rear engine glow-band, and blinking running
// lights around the rim.

import { rgba } from '../../core/color-cache.js';
import { glowSpriteCache } from '../../core/utils.js';

function paint(ctx, r, t) {
    const thr = this.thrustLevel || 0;
    const R = r * 0.9;

    // ── Rear engine glow-band (behind hull) ──
    ctx.globalCompositeOperation = 'lighter';
    const bandPulse = 0.6 + Math.sin(t * 6) * 0.25 + thr * 0.4;
    const bg = ctx.createLinearGradient(0, R * 0.5, 0, R * 1.4 + thr * r * 0.8);
    bg.addColorStop(0, rgba(255, 240, 200, 0.9 * bandPulse));
    bg.addColorStop(0.5, rgba(120, 200, 255, 0.5 * bandPulse));
    bg.addColorStop(1, 'transparent');
    ctx.fillStyle = bg;
    ctx.beginPath();
    ctx.ellipse(0, R * 0.85 + thr * r * 0.3, R * 0.72, R * 0.5 + thr * r * 0.4, 0, 0, Math.PI * 2);
    ctx.fill();

    // ── Forked mandible prow (the "split") ──
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = 'rgba(60, 64, 72, 0.97)';
    ctx.strokeStyle = '#0a0c10';
    ctx.lineWidth = 2.5;
    for (const s of [1, -1]) {
        ctx.beginPath();
        ctx.moveTo(s * R * 0.12, -R * 0.7);
        ctx.lineTo(s * R * 0.16, -r * 1.18);
        ctx.lineTo(s * R * 0.46, -r * 1.1);
        ctx.lineTo(s * R * 0.5, -R * 0.55);
        ctx.closePath();
        ctx.fill(); ctx.stroke();
    }

    // ── Round dish hull ──
    ctx.fillStyle = 'rgba(74, 80, 90, 0.98)';
    ctx.strokeStyle = '#15171c';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI * 2);
    ctx.fill(); ctx.stroke();

    // hull plating rings + radial seams
    ctx.strokeStyle = 'rgba(150, 160, 175, 0.45)';
    ctx.lineWidth = 1;
    for (const rr of [0.78, 0.5, 0.26]) {
        ctx.beginPath(); ctx.arc(0, 0, R * rr, 0, Math.PI * 2); ctx.stroke();
    }
    for (let i = 0; i < 8; i++) {
        const a = (i / 8) * Math.PI * 2;
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * R * 0.26, Math.sin(a) * R * 0.26);
        ctx.lineTo(Math.cos(a) * R * 0.78, Math.sin(a) * R * 0.78);
        ctx.stroke();
    }

    // ── Spinning sensor dish (top, offset aft-left) ──
    ctx.save();
    ctx.translate(-R * 0.34, R * 0.18);
    ctx.fillStyle = 'rgba(30, 33, 40, 0.95)';
    ctx.beginPath();
    ctx.arc(0, 0, R * 0.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.rotate(t * 2.4);
    ctx.strokeStyle = rgba(120, 220, 255, 0.8);
    ctx.lineWidth = 1.3;
    ctx.beginPath();
    ctx.ellipse(0, 0, R * 0.17, R * 0.07, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(-R * 0.17, 0); ctx.lineTo(R * 0.17, 0); ctx.stroke();
    ctx.restore();

    // ── Offset side cockpit pod (front-right) ──
    ctx.strokeStyle = '#0a0c10';
    ctx.lineWidth = 2;
    ctx.fillStyle = 'rgba(60, 64, 72, 0.97)';
    ctx.beginPath();
    ctx.moveTo(R * 0.4, -R * 0.36);
    ctx.lineTo(R * 0.78, -R * 0.66);
    ctx.lineTo(R * 0.92, -R * 0.5);
    ctx.lineTo(R * 0.6, -R * 0.16);
    ctx.closePath();
    ctx.fill(); ctx.stroke();
    // cockpit dome
    const cg = ctx.createRadialGradient(R * 0.82, -R * 0.56, 0, R * 0.82, -R * 0.56, R * 0.16);
    cg.addColorStop(0, 'rgba(255,255,255,0.95)');
    cg.addColorStop(0.5, 'rgba(120,220,255,0.85)');
    cg.addColorStop(1, 'rgba(40,80,120,0.3)');
    ctx.fillStyle = cg;
    ctx.beginPath();
    ctx.arc(R * 0.82, -R * 0.56, R * 0.13, 0, Math.PI * 2);
    ctx.fill();

    // ── Blinking rim running-lights ──
    ctx.globalCompositeOperation = 'lighter';
    for (let i = 0; i < 10; i++) {
        const a = (i / 10) * Math.PI * 2;
        const on = (Math.sin(t * 5 + i * 1.3) > 0.4) ? 1 : 0.2;
        ctx.fillStyle = rgba(255, 210, 120, on);
        ctx.beginPath();
        ctx.arc(Math.cos(a) * R * 0.92, Math.sin(a) * R * 0.92, r * 0.05, 0, Math.PI * 2);
        ctx.fill();
    }

    // ── Engine band core glow ──
    glowSpriteCache.draw(ctx, 0, R * 0.78, '#ffd9a0', r * 0.3, 6, 0.5 + thr * 0.5);
}

export const skin = {
    id: 'smuggler',
    name: 'SMUGGLER',
    desc: 'Forked-prow saucer freighter — spinning dish, rim lights, engine band.',
    noseY: -1.12,
    bankShear: 0.07,
    paint,
};
