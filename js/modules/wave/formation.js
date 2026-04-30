// Formation slot grid for Galaga-mode sorties.
//
// A formation defines a layout of slots near the top of the playfield.
// Enemies spawned into a stage are assigned slots; while `inFormation`
// they hold the slot via `formationHoldMovement` (see movement.js).
// The sortie runner flips `inFormation = false` when an enemy's dive
// ticket comes up, returning it to its native movement pattern.

import { GameDimensions } from '../core/utils.js';

// Build a centered grid: `cols` × `rows`, top of screen.
// Returns absolute slot positions in canvas space.
export function buildGridFormation(cols, rows, opts = {}) {
    const w = GameDimensions.width;
    const h = GameDimensions.height;
    const slotW = opts.slotW ?? 70;
    const slotH = opts.slotH ?? 60;
    const topY = opts.topY ?? 90;
    const slots = [];
    const startX = (w - (cols - 1) * slotW) / 2;
    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            slots.push({
                col: c,
                row: r,
                x: startX + c * slotW,
                y: topY + r * slotH,
                phase: (c * 0.7 + r * 1.3),
                occupant: null,
            });
        }
    }
    return slots;
}

// Build a V-shaped formation (chevron) — fewer slots, dramatic look.
export function buildChevronFormation(count, opts = {}) {
    const w = GameDimensions.width;
    const slotW = opts.slotW ?? 75;
    const slotH = opts.slotH ?? 45;
    const topY = opts.topY ?? 110;
    const slots = [];
    const half = (count - 1) / 2;
    for (let i = 0; i < count; i++) {
        const offset = i - half;
        slots.push({
            col: i,
            row: Math.abs(offset),
            x: w / 2 + offset * slotW,
            y: topY + Math.abs(offset) * slotH,
            phase: i * 0.9,
            occupant: null,
        });
    }
    return slots;
}

// Assign an enemy to the next free slot. Returns the slot or null if full.
export function assignSlot(formation, enemy) {
    for (const slot of formation) {
        if (!slot.occupant) {
            slot.occupant = enemy;
            enemy.formationSlot = slot;
            enemy.inFormation = true;
            return slot;
        }
    }
    return null;
}

export function releaseSlot(enemy) {
    if (enemy.formationSlot) {
        enemy.formationSlot.occupant = null;
        enemy.formationSlot = null;
    }
    enemy.inFormation = false;
}
