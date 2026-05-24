// Declarative multi-phase boss runner (Phase D.B0).
//
// A boss carries an ordered `phaseScript`; this runner advances through it as
// each phase's gate trips, fires every phase's `onEnter` exactly once and in
// order (even if a single burst of damage drops HP past several thresholds in
// one frame), and opens a short invuln window on each transition so a phase
// shift can't be skipped by overkill. Phase 0 is the spawn phase (active from
// init, no transition invuln).
//
// Pure, engine-agnostic logic — the boss object + an optional `ctx`
// (gameEngine) are passed in, mirroring boss-rage.js conventions. The runner
// never announces (the dead `ui:show-message` path is avoided); a phase's
// `onEnter` is where a concrete boss wires canvas FX / attack changes.
//
// Phase shape (only `id` is required):
//   {
//     id,                       // stable string id
//     name,                     // display label (healthbar/phase pip)
//     enterAtHpFraction?,       // 0..1 — enter once health <= maxHealth * f
//     gate?(boss, ctx),         // custom predicate; overrides enterAtHpFraction
//     onEnter?(boss, ctx),      // fired once on entering this phase
//     invulnMs?,                // transition invuln (default below); phase 0 gets none
//   }
// Phases 1..N normally gate on DESCENDING `enterAtHpFraction` (e.g. 1.0 → 0.66
// → 0.33). A `gate` predicate enables non-HP triggers (timer, parts cleared).

export const DEFAULT_TRANSITION_INVULN_MS = 1000;

// True if `boss` is mid phase-transition invuln (mirrors bossRageBlocksDamage).
export function phaseBlocksDamage(boss, now = Date.now()) {
    if (!boss || !boss._phaseState) return false;
    return now < (boss._phaseState.invulnUntil || 0);
}

// The boss's active phase object (for healthbar / AI / firing to read), or null.
export function currentPhase(boss) {
    if (!boss || !boss._phaseState || !Array.isArray(boss.phaseScript)) return null;
    return boss.phaseScript[boss._phaseState.index] || null;
}

// The active phase index (0-based), or 0 if uninitialized.
export function currentPhaseIndex(boss) {
    return (boss && boss._phaseState) ? boss._phaseState.index : 0;
}

// True once the boss has entered the final scripted phase.
export function isFinalPhase(boss) {
    if (!boss || !boss._phaseState || !Array.isArray(boss.phaseScript)) return false;
    return boss._phaseState.index >= boss.phaseScript.length - 1;
}

function _gateMet(boss, phase, ctx) {
    if (!phase) return false;
    if (typeof phase.gate === 'function') return !!phase.gate(boss, ctx);
    if (typeof phase.enterAtHpFraction === 'number') {
        const maxH = boss.maxHealth || 1;
        return (boss.health || 0) <= maxH * phase.enterAtHpFraction;
    }
    return false; // no gate → never auto-advances (manual-only phase)
}

function _enterPhase(boss, idx, ctx, now) {
    const st = boss._phaseState;
    const phase = boss.phaseScript[idx];
    st.index = idx;
    if (st.entered[idx]) return;
    st.entered[idx] = true;
    // Phase 0 is the spawn phase and gets no transition invuln.
    if (idx > 0) {
        const ms = (phase && typeof phase.invulnMs === 'number') ? phase.invulnMs : DEFAULT_TRANSITION_INVULN_MS;
        st.invulnUntil = now + ms;
    }
    if (phase && typeof phase.onEnter === 'function') phase.onEnter(boss, ctx);
}

// Attach a phase script + state and enter phase 0. Safe to call once at spawn.
export function initBossPhases(boss, script, ctx = null, now = Date.now()) {
    if (!boss || !Array.isArray(script) || script.length === 0) return false;
    boss.phaseScript = script;
    boss._phaseState = {
        index: 0,
        invulnUntil: 0,
        entered: new Array(script.length).fill(false),
    };
    _enterPhase(boss, 0, ctx, now);
    return true;
}

// Per-frame advance (call from enemy.update). No-op unless the boss has a
// phase script. Advances ONE phase at a time, firing each onEnter in order,
// while the next phase's gate is satisfied — so several thresholds crossed in
// a single frame still resolve cleanly, once each, in order.
export function updateBossPhases(boss, ctx = null, now = Date.now()) {
    if (!boss || !boss._phaseState || !Array.isArray(boss.phaseScript)) return;
    if (!boss.active || boss._deathFlash > 0 || boss.warping) return;
    const st = boss._phaseState;
    const n = boss.phaseScript.length;
    let guard = 0;
    while (st.index + 1 < n && guard++ < n) {
        const next = boss.phaseScript[st.index + 1];
        if (_gateMet(boss, next, ctx)) _enterPhase(boss, st.index + 1, ctx, now);
        else break;
    }
}
