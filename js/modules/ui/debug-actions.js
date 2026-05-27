// Debug action helpers (6.x). Pure functions over the live GameEngine, shared
// by the `?`-key debug overlay (debug-menu.js) and the `window.dbg` console
// API. Every mutation here is dev-only and gated by isDebugMode() at the call
// sites that expose these. Each is defensive (optional-chaining + fallbacks)
// so a missing field never throws mid-run.

import { GAME_STATES } from '../core/constants.js';
import { MAX_LEVEL } from '../core/sp-stats.js';
import { MAX_HEALTH_TANKS } from '../player/lifecycle.js';
import { debugState } from '../core/debug-config.js';

/** Add gold to BOTH the persistent wallet (account-gold, for the Armory) and
 *  the live run wallet (game.money, for the in-run shop). */
export function addGold(ge, n) {
    if (!ge || !ge.game || !(n > 0)) return;
    ge.game.accountGold = Math.max(0, (ge.game.accountGold | 0) + n);
    ge.game.money = Math.max(0, (ge.game.money | 0) + n);
    try { ge.savePersistentProfile?.(); } catch (_) { /* ignore */ }
    ge.events?.emit?.('ui:show-message', { title: 'DEBUG', subtitle: `+${n.toLocaleString()} Gold`, duration: 1000 });
}

/** Grant XP (runs the normal level-up rollover + SP grant). */
export function addXp(ge, n) {
    if (!ge?.player || !(n > 0)) return;
    ge.player.addXp?.(n);
    ge.events?.emit?.('ui:show-message', { title: 'DEBUG', subtitle: `+${n.toLocaleString()} XP`, duration: 1000 });
}

/** Add N levels directly (each grants +1 SP, like a normal level-up). */
export function addLevel(ge, n) {
    if (!ge?.player || !(n > 0)) return;
    const before = ge.player.level | 0 || 1;
    const after = Math.min(MAX_LEVEL, before + n);
    const gained = after - before;
    ge.player.level = after;
    ge.player.sp = Math.max(0, (ge.player.sp | 0) + gained);
    if (after >= MAX_LEVEL) ge.player.xp = 0;
    ge.player.saveMetaState?.();
    ge.events?.emit?.('ui:show-message', { title: 'DEBUG', subtitle: `+${gained} Level (now ${after})`, duration: 1000 });
}

/** Add skill points directly. */
export function addSp(ge, n) {
    if (!ge?.player || !(n > 0)) return;
    ge.player.sp = Math.max(0, (ge.player.sp | 0) + n);
    ge.player.saveMetaState?.();
    ge.events?.emit?.('ui:show-message', { title: 'DEBUG', subtitle: `+${n} SP`, duration: 1000 });
}

/** Jump to a specific wave: clear the field, then advance into wave N. */
export function jumpToWave(ge, n) {
    if (!ge?.game || !(n >= 1)) return;
    const inRun = ge.game.state === GAME_STATES.PLAYING || ge.game.state === GAME_STATES.WAVE_TRANSITION;
    if (!inRun) return;
    // Drain whatever's on the field so the next-wave spawn is clean.
    try { ge.enemyPool?.drainActive?.(); } catch (_) { /* ignore */ }
    try { ge.asteroidPool?.drainActive?.(); } catch (_) { /* ignore */ }
    // startNextWave() does `currentWave++`, so set to N-1 to land on N.
    ge.game.currentWave = Math.max(0, (n | 0) - 1);
    ge.game.waveComplete = false;
    try { ge.startNextWave?.(); } catch (_) { /* ignore */ }
}

/** Lethally damage every active enemy + clear asteroids (exercises the
 *  death → drop → wave-complete path). */
export function killAll(ge) {
    if (!ge) return;
    const enemies = (ge.enemyPool && Array.isArray(ge.enemyPool.activeObjects))
        ? ge.enemyPool.activeObjects.slice() : [];
    for (const e of enemies) {
        try { ge.applyDamageToEnemy?.(e, 1e9, { debugKill: true }); } catch (_) { /* ignore */ }
    }
    try { ge.asteroidPool?.drainActive?.(); } catch (_) { /* ignore */ }
}

/** Full heal: top HP, restore all spare tanks, fill energy. */
export function refillHealth(ge) {
    if (!ge?.player) return;
    const maxHp = ge.player.getEffectiveMaxHealth?.() ?? ge.player.maxHealth ?? 100;
    ge.player.health = maxHp;
    ge.player._tankProgress = 0;
    ge.healthTanks = MAX_HEALTH_TANKS;
    const maxE = ge.player.getEnergyOverchargeCap?.() ?? ge.player.maxEnergy ?? 100;
    ge.player.energy = maxE;
    ge.events?.emit?.('ui:update-tanks', { tanks: ge.healthTanks });
}

/** Drop HP to 1 (for testing low-HP passives / death-saves). */
export function setHpToOne(ge) {
    if (!ge?.player) return;
    ge.player.health = 1;
}

/** Clear all ability + power-weapon cooldowns. */
export function resetCooldowns(ge) {
    if (!ge?.player) return;
    if (Array.isArray(ge.player.abilityCooldowns)) ge.player.abilityCooldowns.fill(0);
    ge.player.powerCooldown = 0;
}

/** Toggle one of the simple boolean debug flags; instakill mirrors the
 *  engine's onePunchMan cheat so collision code keeps reading one source. */
export function setFlag(ge, key, on) {
    if (!(key in debugState)) return;
    debugState[key] = !!on;
    if (key === 'instakill' && ge && ge.cheats) ge.cheats.onePunchMan = !!on;
}
