// Weak-point sub-entity layer (Phase D.B0).
//
// A boss can own a handful of destructible child parts — turrets, plates,
// egg-sacs, bolt-heads, a rotating elemental facet — each with its own HP,
// collider, and position. The headline mechanic is "core invulnerable while
// parts live": as long as any shielding part survives, the boss core takes no
// damage, so the player must clear the parts first. Parts that don't shield the
// core (decorative / bonus weak points) are supported too.
//
// Pure, engine-agnostic — like boss-phases.js, the boss object + an optional
// `ctx` (gameEngine) are passed in, and `now` is explicit so the orbit math is
// deterministic in tests. The module owns part HP, world positions (static
// offset, rotate-with-boss, or orbit), hit-testing, and the core-gating
// predicate. It does NOT resolve element/resist — the caller's damage pipeline
// does that (as in collision-system.applyDamageToEnemy); `element`/`resist` ride
// along as metadata for the renderer + the caller. Parts are few (≤6) and live
// as plain objects on `boss._partsState.parts`.
//
// Part def shape (only `id` is required; give it `maxHealth` to take more than
// one hit):
//   {
//     id,                            // stable string id
//     name,                          // display label (healthbar / target panel)
//     maxHealth,                     // part HP (default 1)
//     radius,                        // collider radius (default DEFAULT_PART_RADIUS)
//     shieldsCore?,                  // default true — gates core damage while alive
//     element?, resist?,             // metadata only (caller resolves multipliers)
//     // positioning — pick one (else the part sits at the boss centre):
//     offset?: { x, y },             // boss-local offset
//     rotateWithBoss?,               // default false — rotate `offset` by boss.angle
//     orbit?: { radius, speed, phase }, // speed rad/s; angle = phase + speed*elapsedSec
//     onDestroy?(boss, part, ctx),   // fired once, when the part is destroyed
//   }

export const DEFAULT_PART_RADIUS = 18;

// World position (+ facing angle) of a part for the given elapsed seconds.
// Orbit beats offset beats "sits at the boss centre".
function _partWorldPos(boss, part, elapsedSec) {
    const bx = boss.x || 0, by = boss.y || 0;
    const o = part.def.orbit;
    if (o) {
        const ang = (o.phase || 0) + (o.speed || 0) * elapsedSec;
        const r = o.radius || 0;
        return { x: bx + r * Math.cos(ang), y: by + r * Math.sin(ang), angle: ang };
    }
    const off = part.def.offset;
    if (off) {
        let ox = off.x || 0, oy = off.y || 0;
        if (part.def.rotateWithBoss) {
            const a = boss.angle || 0;
            const c = Math.cos(a), s = Math.sin(a);
            const rx = ox * c - oy * s, ry = ox * s + oy * c;
            ox = rx; oy = ry;
        }
        return { x: bx + ox, y: by + oy, angle: boss.angle || 0 };
    }
    return { x: bx, y: by, angle: boss.angle || 0 };
}

// Recompute every living part's world position. Internal.
function _refreshPositions(boss, now) {
    const st = boss._partsState;
    const elapsedSec = (now - st.t0) / 1000;
    for (const part of st.parts) {
        if (!part.alive) continue;
        const p = _partWorldPos(boss, part, elapsedSec);
        part.x = p.x; part.y = p.y; part.angle = p.angle;
    }
}

// Attach a parts script + state and seed initial positions. Safe to call once
// at spawn. Returns false for a missing/empty script.
export function initBossParts(boss, script, ctx = null, now = Date.now()) {
    if (!boss || !Array.isArray(script) || script.length === 0) return false;
    const parts = script.map((def) => {
        const maxHealth = def.maxHealth > 0 ? def.maxHealth : 1;
        return {
            def,
            id: def.id,
            name: def.name || def.id,
            maxHealth,
            health: maxHealth,
            radius: def.radius > 0 ? def.radius : DEFAULT_PART_RADIUS,
            shieldsCore: def.shieldsCore !== false,
            element: def.element || null,
            resist: def.resist || null,
            alive: true,
            x: boss.x || 0,
            y: boss.y || 0,
            angle: boss.angle || 0,
        };
    });
    boss._partsState = { parts, t0: now };
    _refreshPositions(boss, now);
    return true;
}

// Per-frame position update (call from enemy.update). No-op unless the boss has
// a parts state; gated on active/!dying/!warping like boss-rage / boss-phases.
export function updateBossParts(boss, ctx = null, now = Date.now()) {
    if (!boss || !boss._partsState) return;
    if (!boss.active || boss._deathFlash > 0 || boss.warping) return;
    _refreshPositions(boss, now);
}

// True while at least one *shielding* part survives — the core invuln gate.
// Mirrors phaseBlocksDamage so the damage paths can OR it into their checks.
export function coreBlocksDamage(boss) {
    if (!boss || !boss._partsState) return false;
    for (const part of boss._partsState.parts) {
        if (part.alive && part.shieldsCore) return true;
    }
    return false;
}

// Living part instances (for the renderer / AI / hit-testing).
export function livingParts(boss) {
    if (!boss || !boss._partsState) return [];
    return boss._partsState.parts.filter((p) => p.alive);
}

export function livingPartCount(boss) {
    return livingParts(boss).length;
}

// A part instance by id (alive or dead), or null.
export function getBossPart(boss, id) {
    if (!boss || !boss._partsState) return null;
    return boss._partsState.parts.find((p) => p.id === id) || null;
}

// First LIVING part whose collider circle contains (x, y), or null. Lets the
// bullet path route a hit to a weak point instead of the shielded core.
export function bossPartAt(boss, x, y) {
    if (!boss || !boss._partsState) return null;
    for (const part of boss._partsState.parts) {
        if (!part.alive) continue;
        const dx = x - part.x, dy = y - part.y;
        if (dx * dx + dy * dy <= part.radius * part.radius) return part;
    }
    return null;
}

// Apply `amount` damage to a part (by instance or id). Caller has already
// resolved any element/resist multipliers. Destroys the part at 0 HP, firing
// its `onDestroy` exactly once. Returns { destroyed, part } (or null if the
// boss has no parts). A no-op on an already-dead / unknown part.
export function damageBossPart(boss, partOrId, amount, ctx = null) {
    if (!boss || !boss._partsState) return null;
    const part = (typeof partOrId === 'string')
        ? boss._partsState.parts.find((p) => p.id === partOrId)
        : partOrId;
    if (!part || !part.alive) return { destroyed: false, part: part || null };
    part.health = Math.max(0, part.health - (amount > 0 ? amount : 0));
    if (part.health <= 0.001) {
        part.health = 0;
        part.alive = false;
        if (typeof part.def.onDestroy === 'function') part.def.onDestroy(boss, part, ctx);
        return { destroyed: true, part };
    }
    return { destroyed: false, part };
}
