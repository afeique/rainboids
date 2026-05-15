/**
 * WaveManager — wave lifecycle, spawning, notifications, and level scaling.
 *
 * All methods expect `this` to be bound to the GameEngine instance
 * via `.call(gameEngine)`. This is Phase 3 strangler-fig extraction.
 */

import { GAME_CONFIG, GAME_STATES, MAX_WAVES, getEnemyFiringCooldown } from '../core/constants.js';
import { Asteroid } from '../world/asteroid.js';
import { Enemy } from '../enemy/enemy.js';
import { linkBosses } from '../enemy/boss-rage.js';
import { getWaveConfig, getEnemyLevel, getAsteroidLevel, getLevelScaledEnemyStats, getLevelScaledAsteroidStats, getEnemySpeedMultiplier, getEnemyBulletSpeedMultiplier, WAVE_SUBTITLES, WAVE_SUBTITLES_GENERIC, BOSS_TIER_STATS, isBossWave } from './wave-data.js';
import { random } from '../core/utils.js';
import { GameTimer } from '../core/game-timer.js';
import { ENEMY_TYPES } from '../enemy/enemy.js';
import { PRIMARY_WEAPONS } from '../combat/weapon-data.js';
import { updateWave } from '../../sim/wave.js';
import { freshWaveState } from '../../sim/state.js';
import { isMobile, isPortrait } from '../platform/platform-detect.js';
// 5.98.0 — Wave-clear pick screen on mobile reads the master powerup
// catalog so the 3 random offers are drawn from the same pool that
// the desktop POWERUPS tab uses.
import { POWERUP_TYPES } from '../world/powerup.js';
import { renderIconHTML } from '../ui/icons.js';

// 5.95.0 — Asteroid radius cap on mobile. The fruit-ninja redesign
//   shrinks the playfield's footprint per-rock so the screen doesn't
//   feel crowded on a phone-sized viewport. Cap chosen so the largest
//   mobile rock (~36 px) reads as a "tap me" target without dwarfing
//   the bottom-button bar. Desktop spawn keeps the original 30-60 px
//   range untouched (see initializeWaveAsteroid below).
//
// 5.95.1 — Phone-portrait gets a tighter cap (28 px) so the playfield
//   feels less crowded on narrow displays. Landscape mobile keeps the
//   original 36 px cap — wide viewports don't need the shrink. Desktop
//   is untouched.
export const MOBILE_ASTEROID_MAX_RADIUS = 36;
export const MOBILE_PORTRAIT_ASTEROID_MAX_RADIUS = 28;

// Local constant to avoid circular import with game-engine.js
const PLAYER_STATES = { NORMAL: 'normal' };

// Fixed wave system with object limits for performance
export function updateWaveSystem() {
    if (this.game.state !== GAME_STATES.PLAYING && this.game.state !== GAME_STATES.WAVE_TRANSITION) {
        return;
    }

    // Clean up dead entities first
    this.enemyPool.cleanupInactive();
    this.asteroidPool.cleanupInactive();

    // Wave-clear gate: every enemy must be FULLY dead — past the death
    // animation, not just mid-flash. cleanupInactive at the top of this
    // function releases enemies once `active` flips to false (which
    // happens at the end of the death sequence, see enemy.update). So
    // counting `activeObjects.length` directly is the correct test:
    // mid-death enemies still have `active=true` and stay in the pool;
    // only after the big-bang completes and the recycle frame fires do
    // they leave. This keeps the shop from popping over the explosion.
    const totalEnemies = this.enemyPool.activeObjects.length;

    // 5.74.14 — recovery for the wave-clear stuck state. The wave-clear
    // setTimeout(2700) below opens the powerups menu only if state is
    // still WAVE_TRANSITION when the timer fires. If the player paused
    // (or the tab was backgrounded — browser timer throttling) during
    // that 2.7s window, the gate fails and the menu never opens. After
    // resume, togglePause defaults to PLAYING (because
    // `_pausedFromWaveClear` is set inside openWaveClearPowerupsMenu,
    // which never ran), and the regular wave-clear branch below is gated
    // by `!waveComplete` — so the run is permanently stuck: empty pool,
    // waveComplete=true, state=PLAYING, no progression. Catch that here
    // and re-trigger the menu. openWaveClearPowerupsMenu flips state to
    // PAUSED, so this branch only fires once per stuck wave.
    if (totalEnemies === 0 && this.game.waveComplete && this.game.state === GAME_STATES.PLAYING) {
        this.openWaveClearPowerupsMenu();
        return;
    }

    // 5.75.0 — sub-wave pacing. Try to advance the wave to its next
    // sub-wave (fires when ≤2 enemies remain or after the 12s fallback).
    // The wave-complete check below now ALSO requires all sub-waves to
    // have been spawned — partial waves no longer end early.
    tryAdvanceSubWave.call(this);

    if (totalEnemies === 0
        && !this.game.waveComplete
        && this.game.state === GAME_STATES.PLAYING
        && allSubWavesSpawned.call(this)) {
        // Wave completed! If this is the final wave, the run is over —
        // route through GAME_COMPLETE instead of opening the shop.
        this.game.waveComplete = true;
        this.game.waveCountdownTime = Date.now() + this.game.waveCountdownDuration;
        this.game.state = GAME_STATES.WAVE_TRANSITION;
        // 5.74.14 — set the pause-from-wave-clear flag NOW (was: only set
        // inside openWaveClearPowerupsMenu when its 2.7s setTimeout fires).
        // If the player pauses during the 2.7s gap before the menu opens,
        // their resume needs to route through startNextWave instead of
        // straight to PLAYING — otherwise the run gets stuck.
        this._pausedFromWaveClear = true;

        // 5.75.0 — resolve the wave's mission (no_damage / asteroid clear).
        resolveMissionOnWaveClear.call(this);

        // 5.72.2 — wave-clear bonuses inlined here. The old
        // `completeWave()` export was never called from the live
        // gameplay loop (only by tests / dev scripts), so the +1
        // powerup pick + XP + coins bonus that 5.70.0 added there
        // never actually fired in-game. Now it always does, on every
        // wave clear, before the shop opens.
        const clearedWave = this.game.currentWave;
        // 5.79.16 — Wave-clear XP bonus scales harder with wave number
        //   so late waves keep up with the steeper enemy/asteroid
        //   counts. Was 20 + w×10 (~30 XP wave 1, 220 wave 20). Now
        //   40 + w×15 (~55 XP wave 1, 340 wave 20).
        const bonusXP = 40 + clearedWave * 15;
        const bonusCoins = 50 + clearedWave * 25;
        this.player.gainExperience(bonusXP);
        this.game.money += bonusCoins;
        // 5.98.0 — Mobile only earns SP via level-ups; wave-clear gives
        // a 3-card powerup pick instead (see openWavePickOverlay). Desktop
        // unchanged: still +1 SP per wave clear.
        const _mob = isMobile();
        if (!_mob) {
            this.player.skillPoints = (this.player.skillPoints || 0) + 1;
        }

        // 5.76.1 — recap stats stash for showWaveComplete. Caller passes
        // the bonus gold + pick info to the message renderer.
        this._waveClearRecap = {
            bonusCoins,
            picks: _mob ? 0 : 1,
            mission: this.game.mission ? {
                completed: !!this.game.mission.completed,
                failed: !!this.game.mission.failed,
                label: this.game.mission.label,
            } : null,
        };

        if (this.game.currentWave >= MAX_WAVES) {
            this.completeRun();
            return;
        }

        this.showWaveComplete();

        // 5.74.2 — wave clear no longer auto-opens the shop. Instead the
        // pause menu opens to its POWERUPS tab so the player can spend
        // the +1 pick they just earned. Resuming the game starts the
        // next wave (see GameEngine.togglePause WAVE_TRANSITION → PAUSED
        // bridging logic).
        setTimeout(() => {
            if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
                this.openWaveClearPowerupsMenu();
            }
        }, 2700);
    }

    // (Removed) Auto-advance countdown — the shop now gates the next
    // wave. closeShop() calls startNextWave() when the player is ready.
}

export function getWaveSubtitle(waveNumber) {
    if (WAVE_SUBTITLES[waveNumber]) return WAVE_SUBTITLES[waveNumber];
    return WAVE_SUBTITLES_GENERIC[(waveNumber * 7 + 3) % WAVE_SUBTITLES_GENERIC.length];
}

// 5.75.0 — wave missions (C3). One random side-objective per wave.
// Reward: +1 powerup pick. Tracked entirely on `this.game.mission`.
const MISSION_TEMPLATES = [
    { id: 'no_damage',  label: 'TAKE NO DAMAGE',     desc: 'Clear the wave without taking a hit' },
    { id: 'fast_kill',  label: 'BLITZKRIEG',         desc: 'Destroy 5 enemies in 8 seconds' },
    { id: 'asteroid',   label: 'ROCK BREAKER',       desc: 'Destroy every asteroid spawned' },
    { id: 'streak',     label: 'KEEP THE FIRE',      desc: 'Reach a 12-kill streak this wave' },
    { id: 'precision',  label: 'PRECISION',          desc: 'Land 25 critical hits this wave' },
];

export function startWaveMission() {
    // Boss waves get a fixed mission flavor; non-boss roll random.
    const wave = this.game.currentWave;
    const isBoss = isBossWave(wave);
    const tpl = isBoss
        ? MISSION_TEMPLATES[0]    // boss waves: take no damage (hard, but iconic)
        : MISSION_TEMPLATES[(Math.random() * MISSION_TEMPLATES.length) | 0];
    this.game.mission = {
        id: tpl.id,
        label: tpl.label,
        desc: tpl.desc,
        progress: 0,
        target: tpl.id === 'fast_kill' ? 5 : tpl.id === 'streak' ? 12 : tpl.id === 'precision' ? 25 : 1,
        startTime: Date.now(),
        completed: false,
        failed: false,
        // For 'fast_kill' we track a sliding 8-second window of kill
        // timestamps; the mission completes the moment the rolling
        // count hits 5.
        killTimes: [],
        damaged: false,
    };
}

export function checkMissionOnKill() {
    const m = this.game.mission;
    if (!m || m.completed || m.failed) return;
    if (m.id === 'fast_kill') {
        const now = Date.now();
        m.killTimes.push(now);
        // Drop entries older than 8s.
        while (m.killTimes.length && now - m.killTimes[0] > 8000) m.killTimes.shift();
        if (m.killTimes.length >= 5) completeMission.call(this);
    } else if (m.id === 'streak') {
        if ((this.killStreakCount || 0) >= m.target) completeMission.call(this);
    }
}

export function checkMissionOnCrit() {
    const m = this.game.mission;
    if (!m || m.completed || m.failed) return;
    if (m.id === 'precision') {
        m.progress++;
        if (m.progress >= m.target) completeMission.call(this);
    }
}

export function checkMissionOnAsteroidDestroy() {
    const m = this.game.mission;
    if (!m || m.completed || m.failed) return;
    if (m.id === 'asteroid') {
        m.progress++;
        // Completes when no asteroids remain AND every spawned one is dead.
        if (this.asteroidPool && this.asteroidPool.activeObjects.length === 0) {
            completeMission.call(this);
        }
    }
}

export function checkMissionOnDamage() {
    const m = this.game.mission;
    if (!m || m.completed || m.failed) return;
    if (m.id === 'no_damage') {
        m.failed = true;
        if (this.events?.emit) {
            this.events.emit('ui:show-message', {
                title: 'MISSION FAILED', subtitle: m.label, duration: 1400,
            });
        }
    }
}

function completeMission() {
    const m = this.game.mission;
    if (!m || m.completed) return;
    m.completed = true;
    // 5.98.0 — Mobile SP only from level-ups. Mission still completes
    // (so the HUD reads MISSION COMPLETE for the player), but the +1 SP
    // reward is desktop-only. The mobile "win" for clearing the wave
    // is the 3-card powerup pick that fires from the wave-clear path.
    if (this.player && !isMobile()) {
        this.player.skillPoints = (this.player.skillPoints || 0) + 1;
    }
    if (this.events?.emit) {
        this.events.emit('ui:show-message', {
            title: 'MISSION COMPLETE',
            subtitle: `${m.label} — +1 SP`,
            duration: 2200,
            position: 'top',
        });
    }
}

// Called on wave clear: completes the no_damage / asteroid missions if
// the player kept their conditions.
export function resolveMissionOnWaveClear() {
    const m = this.game.mission;
    if (!m || m.completed || m.failed) return;
    if (m.id === 'no_damage' && !m.damaged) completeMission.call(this);
    else if (m.id === 'asteroid'
        && this.asteroidPool
        && this.asteroidPool.activeObjects.length === 0) {
        completeMission.call(this);
    }
}

export function showWaveComplete() {
    // 5.76.1 — wave-clear recap. The subtitle shows the gold earned,
    // pick count, and mission outcome on a single line so the player
    // sees their reward before the powerups menu pops. Pulls from
    // `_waveClearRecap` stash set by the wave-complete branch.
    // 5.98.0 — Mobile suppresses the SP line (mobile gets the 3-card
    // overlay instead of SP) and shows "POWERUP UP NEXT" instead.
    const nextWave = this.game.currentWave + 1;
    const r = this._waveClearRecap || { bonusCoins: 0, picks: 1, mission: null };
    const picks = r.picks + (r.mission && r.mission.completed ? 1 : 0);
    const missionTag = !r.mission
        ? ''
        : r.mission.completed
            ? ` · MISSION ✓`
            : r.mission.failed
                ? ` · MISSION ✗`
                : ` · MISSION —`;
    const subtitle = isMobile()
        ? `+${r.bonusCoins}G  ·  POWERUP UP NEXT${missionTag}`
        : `+${r.bonusCoins}G  ·  +${picks} SP${missionTag}`;
    this.waveMessage = {
        active: true,
        startTime: Date.now(),
        duration: 2400,
        title: 'WAVE COMPLETE!',
        subtitle,
    };
}

export function startNextWave() {
    // Clean up inactive objects in all pools before starting the next wave
    this.bulletPool.cleanupInactive();
    this.particlePool.cleanupInactive();
    this.lineDebrisPool.cleanupInactive();
    this.asteroidPool.cleanupInactive();
    this.enemyPool.cleanupInactive();
    this.enemyBulletPool.cleanupInactive();
    this.colorStarPool.cleanupInactive();
    this.backgroundStarPool.cleanupInactive();

    this.game.currentWave++;
    this.game.waveComplete = false;
    this.game.state = GAME_STATES.WAVE_TRANSITION;

    // 5.79.0 — Persist a wave-start snapshot so the player can quit and
    //   resume from this wave via the title screen's Continue button.
    //   Failures (private mode, full quota) are swallowed.
    if (typeof this.persistWaveStartSave === 'function') {
        this.persistWaveStartSave();
    }

    // Reset player state at wave start
    this.playerState = PLAYER_STATES.NORMAL;

    // Player keeps whatever health they finished the wave with — no
    // free top-up between waves. Health-orb pickups (now level-scaled
    // per 5.78.2 — MEDPACK powerup removed) or the shop's repair option
    // are the legitimate ways to heal. Cap to current max in case
    // Health Boost upgrades changed it post-clear so we never report > max.
    const cap = this.player.getEffectiveMaxHealth();
    if (this.player.health > cap) this.player.health = cap;

    // Wave intro: full-screen dark overlay with "WAVE N" — entities warp
    // in during the dark hold, settling into place as the overlay fades.
    this.waveMessage = {
        active: true,
        startTime: Date.now(),
        duration: 2800,
        title: `WAVE ${this.game.currentWave}`,
        subtitle: this.getWaveSubtitle(this.game.currentWave),
        phase: 'intro',
    };

    // Spawn entities ~700ms in (overlay is fully dark by then) so the
    // ~700-1500ms warp-in animation finishes during the fade-out window.
    // Order matters: spawn FIRST, then flip to PLAYING — otherwise
    // checkWaveComplete can briefly see "0 enemies + PLAYING +
    // !waveComplete" and instantly jump to the next wave.
    this._gameTimers.push(new GameTimer(700, () => {
        if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
            this.spawnWaveEntities();
            // Brief grace window so the player isn't ganked by enemies as
            // they finish warping in. ~3s covers the ~700-1500ms warp-in
            // plus a beat to orient before the field is "live" again.
            // 5.88.0 — `justRespawned` retired with the respawn HUD ring.
            if (this.player && this.player.active) {
                this.player.makeInvincible(3000);
            }
        }
    }));
    this._gameTimers.push(new GameTimer(2800, () => {
        if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
            this.game.state = GAME_STATES.PLAYING;
        }
    }));
}

// 5.75.0 — sub-wave system. Waves are now sequences of enemy groups,
// spawned one at a time. spawnWaveEntities only fires sub-wave 0;
// updateWaveSystem promotes to the next sub-wave when ≤ 2 enemies
// remain (or after a 12s fallback timer). Wave only ends when all
// sub-waves have been spawned AND the pool is empty.
export function spawnWaveEntities() {
    const waveConfig = getWaveConfig(this.game.currentWave);

    this.game.enemyLevel = getEnemyLevel(this.game.currentWave);
    this.game.asteroidLevel = getAsteroidLevel(this.game.currentWave);

    // Reset sub-wave bookkeeping each wave start.
    this.game.subWaveIndex = 0;
    this.game.lastSubWaveSpawnAt = Date.now();

    // 5.75.0 — assign this wave's mission and announce it.
    startWaveMission.call(this);
    if (this.events?.emit && this.game.mission) {
        this.events.emit('ui:show-message', {
            title: this.game.mission.label,
            subtitle: this.game.mission.desc + ' — +1 SP',
            duration: 3500,
            position: 'top',
        });
    }

    // Asteroids spawn ONCE at wave start (legacy behavior).
    this.spawnLeveledAsteroids(waveConfig.asteroids, { onScreen: true });

    // First sub-wave (immediate). Subsequent sub-waves come via
    // updateWaveSystem's pacing logic.
    spawnSubWave.call(this, 0);
}

// Spawn the Nth sub-wave's enemy groups. Bumps `subWaveIndex` so the
// pacing check in updateWaveSystem advances correctly.
function spawnSubWave(idx) {
    const waveConfig = getWaveConfig(this.game.currentWave);
    const subWaves = waveConfig.subWaves
        || (waveConfig.enemies ? [waveConfig.enemies] : []); // back-compat
    const groups = subWaves[idx];
    if (!groups || groups.length === 0) return false;

    for (const enemyGroup of groups) {
        const opts = { onScreen: true };
        if (enemyGroup.isBoss && enemyGroup.bossTier) opts.bossTier = enemyGroup.bossTier;
        this.spawnLeveledEnemies(enemyGroup.type, enemyGroup.count, opts);
    }
    this.game.subWaveIndex = idx + 1;
    this.game.lastSubWaveSpawnAt = Date.now();

    // 5.76.1 — phase toast for sub-waves > 0. Sub-wave 0 already
    // gets the WAVE INTRO splash; the later phases are silent today
    // and easy to miss. Brief, non-blocking.
    if (idx > 0 && this.events?.emit) {
        const total = subWaves.length;
        this.events.emit('ui:show-message', {
            title: `WAVE ${this.game.currentWave} · PHASE ${idx + 1} of ${total}`,
            subtitle: '',
            duration: 1600,
            position: 'top',
        });
    }
    return true;
}

// Try to advance the active wave to the next sub-wave. Called from
// updateWaveSystem. Returns true if a new sub-wave was spawned.
//
// 5.88.x — wired to the pure step in `js/sim/wave.js`. The trigger
// logic (≤2-enemy advance, 12 s stale-fallback) and event emission
// live there; this wrapper drives the pure step with a per-tick
// `WaveUpdateContext`, drains the emitted `enemy_spawn` events into
// the existing `spawnLeveledEnemies` helper, and replays the phase
// toast that the legacy `spawnSubWave` used to emit. Behavioral
// parity is pinned by tests/unit/sim/wave.test.js's `replay parity`
// suite. The `wave_clear` event is intentionally ignored — the
// wave-clear branch in `updateWaveSystem` (totalEnemies===0 +
// allSubWavesSpawned()) owns that flow (XP/coins/powerups menu).
export function tryAdvanceSubWave() {
    if (this.game.state !== GAME_STATES.PLAYING) return false;
    if (this.game.waveComplete) return false;

    // Lazy-initialize the WaveState the first tick after each
    // wave start. spawnWaveEntities sets this.game.subWaveIndex=1
    // (after spawning sub-wave 0 directly), so we mirror that.
    if (!this._waveState || this._waveState.number !== this.game.currentWave) {
        this._waveState = freshWaveState(this.game.currentWave, {
            phase: 'spawning',
            subWaveIndex: this.game.subWaveIndex | 0,
            spawnTimer: 0,
        });
    }

    // Reuse one ctx + one events array per WaveManager instance.
    const ctx = this._waveCtx || (this._waveCtx = {});
    ctx.enemyCount = this.enemyPool.activeObjects.length;
    ctx.dt = 1 / 60;
    ctx.ships = this.player ? [this.player] : [];
    ctx.rng = null;

    const events = this._waveEvents || (this._waveEvents = []);
    events.length = 0;

    updateWave(this._waveState, ctx, events);

    // Drain enemy_spawn events into the existing spawn helper. One
    // phase-toast emission per sub-wave (sub-wave 0 toast is owned by
    // spawnWaveEntities + WAVE INTRO splash, not us).
    let spawnedThisTick = false;
    let lastToastedSubWave = -1;
    const cfg = getWaveConfig(this.game.currentWave);
    const totalSubWaves = (cfg.subWaves
        || (cfg.enemies ? [cfg.enemies] : [])).length;

    for (let i = 0; i < events.length; i++) {
        const ev = events[i];
        if (ev.type !== 'enemy_spawn') continue;

        const opts = { onScreen: true };
        if (ev.bossTier) opts.bossTier = ev.bossTier | 0;
        this.spawnLeveledEnemies(ev.enemyType, ev.count | 0, opts);
        spawnedThisTick = true;

        if (ev.subWaveIndex > 0
            && ev.subWaveIndex !== lastToastedSubWave
            && this.events?.emit) {
            lastToastedSubWave = ev.subWaveIndex;
            this.events.emit('ui:show-message', {
                title: `WAVE ${this.game.currentWave} · PHASE ${ev.subWaveIndex + 1} of ${totalSubWaves}`,
                subtitle: '',
                duration: 1600,
                position: 'top',
            });
        }
    }

    // Mirror to legacy bookkeeping fields so allSubWavesSpawned() and
    // any persisted save-state reader stay consistent with the pure
    // state.
    this.game.subWaveIndex = this._waveState.subWaveIndex;
    if (spawnedThisTick) {
        this.game.lastSubWaveSpawnAt = Date.now();
    }

    return spawnedThisTick;
}

// Returns true once every sub-wave for the current wave has been spawned.
export function allSubWavesSpawned() {
    const waveConfig = getWaveConfig(this.game.currentWave);
    const subWaves = waveConfig.subWaves
        || (waveConfig.enemies ? [waveConfig.enemies] : []);
    return (this.game.subWaveIndex || 0) >= subWaves.length;
}

export function spawnAsteroids(count) {
    for (let i = 0; i < count; i++) {
        const asteroid = this.asteroidPool.get();
        if (asteroid) {
            this.initializeWaveAsteroid(asteroid);
        }
    }
}

export function spawnEnemies(count) {
    for (let i = 0; i < count; i++) {
        const enemy = this.enemyPool.get();
        if (enemy) {
            const enemyType = this.getRandomEnemyType();
            const sp = this.getRandomSpawnPosition();
            enemy.reset(sp.x, sp.y, enemyType, this.game.enemyLevel, this);
            enemy.startWarpIn(sp.targetX, sp.targetY);
        }
    }
}

export function spawnLeveledAsteroids(count, opts = {}) {
    // Respect MAX_ASTEROIDS limit for performance
    const activeAsteroids = this.asteroidPool.activeObjects.length;
    const maxToSpawn = Math.min(count, GAME_CONFIG.MAX_ASTEROIDS - activeAsteroids);

    for (let i = 0; i < maxToSpawn; i++) {
        const asteroid = this.asteroidPool.get(undefined, undefined, undefined, 1, this);
        if (asteroid) {
            this.initializeLeveledAsteroid(asteroid, opts);
        }
    }
}

export function spawnLeveledEnemies(enemyType, count, opts = {}) {
    // 5.75.0 — mid-wave mini-boss promotion. On non-boss spawns from
    // wave 4 onward, one enemy in the group has a wave-scaled chance of
    // becoming a "mini-boss": 1.7× HP, 1.25× size, distinct visual tag,
    // and triple gold drops on death. Adds an interesting threat spike
    // to the long stretches of regular waves between scripted bosses.
    let miniBossIdx = -1;
    if (!opts.bossTier && enemyType !== 'TITAN' && this.game.currentWave >= 4) {
        const wave = this.game.currentWave;
        const chance = Math.min(0.45, 0.06 + (wave - 4) * 0.025);
        // Per group, but only one mini per group (so the player still
        // sees a manageable mix on dense waves).
        if (count >= 1 && Math.random() < chance) {
            miniBossIdx = (Math.random() * count) | 0;
        }
    }

    // 5.77.0 — collect bosses spawned in this group so we can link
    // their `_bossPair` (tier 2) and shared `_formationCenter`
    // (tier 3+). Linking happens after the spawn loop so every
    // boss exists before back-references are written.
    const spawnedBosses = [];
    for (let i = 0; i < count; i++) {
        const enemy = this.enemyPool.get();
        if (enemy) {
            const sp = this.getRandomSpawnPosition(opts);
            enemy.reset(sp.x, sp.y, enemyType, this.game.enemyLevel, this);
            this.applyEnemyLevelScaling(enemy, opts);
            if (i === miniBossIdx) {
                enemy.isMiniBoss = true;
                enemy.health *= 1.7;
                enemy.maxHealth *= 1.7;
                if (typeof enemy.radius === 'number') enemy.radius *= 1.25;
                if (enemy.config) enemy.config.points = (enemy.config.points || 100) * 2;
            }
            enemy.startWarpIn(sp.targetX, sp.targetY);
            if (enemy.isBoss) spawnedBosses.push(enemy);
        }
    }
    // Link bosses spawned together (tier 2 pair, tier 3 formation,
    // tier 4 both). Only fires when the group spawned ≥ 2 bosses; a
    // solo tier-4 still gets formation seeding but skips pair link.
    if (spawnedBosses.length >= 2 || (spawnedBosses[0] && spawnedBosses[0].bossTier === 4)) {
        linkBosses(spawnedBosses, this.gameField);
    }
}

export function initializeLeveledAsteroid(asteroid, opts = {}) {
    // Use existing initialization but with level scaling
    this.initializeWaveAsteroid(asteroid, opts);

    // Apply level scaling to health
    const baseHealth = asteroid.health;
    asteroid.health = getLevelScaledAsteroidStats(baseHealth, this.game.asteroidLevel);
    asteroid.maxHealth = asteroid.health;
}

export function applyEnemyLevelScaling(enemy, opts = {}) {
    // Get base stats from enemy type
    const baseStats = ENEMY_TYPES[enemy.type];

    // Apply level scaling
    const scaledStats = getLevelScaledEnemyStats(baseStats, this.game.enemyLevel);

    // Campaign-wide speed ramps. Enemy MOVEMENT stays gentle on wave 1
    // (helps the player learn); enemy BULLET speed is decoupled and
    // starts at 1.15× — considerably faster than the old shared 0.55×
    // floor.
    const campaignSpeedMul = getEnemySpeedMultiplier(this.game.currentWave);
    const bulletSpeedMul = getEnemyBulletSpeedMultiplier(this.game.currentWave);

    enemy.health = scaledStats.health;
    enemy.maxHealth = scaledStats.health;
    enemy.config.speed = scaledStats.speed * campaignSpeedMul;
    enemy.bulletSpeedMul = bulletSpeedMul;

    // Set level-based firing cooldown
    enemy.firingCooldown = getEnemyFiringCooldown(enemy.type, this.game.enemyLevel);

    // Update points value for higher level enemies
    enemy.config.points = scaledStats.points;

    // Boss-tier overlays: HP × hpMul, points override, larger size, faster
    // speed multiplier on top of campaign scaling. Bosses also get a
    // visible bossTier marker for the renderer.
    if (opts.bossTier) {
        const tier = BOSS_TIER_STATS[opts.bossTier] || BOSS_TIER_STATS[1];
        enemy.isBoss = true;
        enemy.bossTier = opts.bossTier;
        enemy.health *= tier.hpMul;
        enemy.maxHealth *= tier.hpMul;
        enemy.config.speed *= tier.speedMul;
        enemy.config.points = tier.points;
        // Inflate radius/size for visual bossiness. The renderer reads
        // either `radius` or whatever the type uses; we set both for safety.
        if (typeof enemy.radius === 'number') enemy.radius *= tier.sizeMul;
        if (typeof enemy.bossSizeMul === 'undefined') enemy.bossSizeMul = tier.sizeMul;
    }
}

// Final-wave-cleared handler — finalize stats and transition to the
// Game Complete screen. Called from updateWaveSystem when the player
// clears the last wave of the campaign.
export function completeRun() {
    this.game.waveComplete = true;
    if (this.game.stats) {
        this.game.stats.finalTimeMs = Date.now() - (this.game.stats.gameStartTime || Date.now());
        this.game.stats.completed = true;
    }
    // Brief toast for the moment of victory, then transition.
    this.events.emit('ui:show-message', {
        title: 'CAMPAIGN COMPLETE',
        subtitle: 'The void is silent.',
        duration: 1800,
        position: 'top',
    });
    setTimeout(() => {
        if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
            this.game.state = GAME_STATES.GAME_COMPLETE;
        }
    }, 1200);
}

export function completeWave() {
    const clearedWave = this.game.currentWave;
    this.waveInProgress = false;
    this.game.currentWave++;
    this.waveTimer = Date.now() + GAME_CONFIG.WAVE_BREAK_TIME;
    this.wavePhase = 'waiting';

    // Use canonical level formulas from wave-data.js
    this.game.enemyLevel = getEnemyLevel(this.game.currentWave);
    this.game.asteroidLevel = getAsteroidLevel(this.game.currentWave);

    // Wave clear bonus: XP + coins scale with wave number, plus a
    // free powerup pick (5.70.0) the player redeems in the shop.
    // Picks accumulate, so skipping the shop one wave doesn't waste them.
    const bonusXP = 20 + clearedWave * 10;
    const bonusCoins = 50 + clearedWave * 25;
    this.player.gainExperience(bonusXP);
    this.game.money += bonusCoins;
    this.player.skillPoints += 1;
    this.queueNotification(`WAVE ${clearedWave} CLEARED`,
        `+${bonusXP} XP  +${bonusCoins} coins  +1 powerup pick`, 2500);

    // Auto-unlock primary weapons at wave milestones
    for (const [id, weapon] of Object.entries(PRIMARY_WEAPONS)) {
        if (weapon.unlockWave > 0 &&
            this.game.currentWave >= weapon.unlockWave &&
            !this.player.ownedPrimaries.has(id)) {
            this.player.ownedPrimaries.add(id);
            this.queueNotification(`NEW WEAPON UNLOCKED`,
                `${weapon.name} — ${weapon.description}`, 4000);
        }
    }
}

export function queueNotification(title, subtitle, duration) {
    if (!this.notificationQueue) this.notificationQueue = [];
    this.notificationQueue.push({ title, subtitle, duration, queued: Date.now() });

    // Start processing if not already
    if (!this.notificationActive) {
        this.processNotificationQueue();
    }
}

export function processNotificationQueue() {
    if (!this.notificationQueue || this.notificationQueue.length === 0) {
        this.notificationActive = false;
        return;
    }

    this.notificationActive = true;
    const notif = this.notificationQueue.shift();

    this.events.emit('ui:show-message', { title: notif.title, subtitle: notif.subtitle, duration: notif.duration, position: 'top' });

    // Process next notification after this one finishes (with small gap)
    setTimeout(() => this.processNotificationQueue(), notif.duration + 300);
}

export function startNewWave() {
    try {

        if (!this.game) {
            console.error('❌ Game object is undefined in startNewWave!');
            return;
        }

    this.waveInProgress = true;
    this.wavePhase = 'asteroids';
    this.wavePhaseTimer = Date.now();
    this.currentSubWave = 0;
    this.enemiesRemainingInSubWave = 0;


    // Spawn asteroids first
    this.spawnWaveAsteroids();

    // Show wave notification
        this.events.emit('ui:show-message', { title: `WAVE ${this.game.currentWave}`, subtitle: '', duration: 7000, position: 'top' });


    } catch (error) {
        console.error('❌ Error in startNewWave:', error);
        console.error('❌ Stack trace:', error.stack);
    }
}

export function initializeWaveAsteroid(asteroid, opts = {}) {
    // All asteroids now warp in — wave-start spawns warp into the visible
    // viewport so the field is "ready" the instant the intro overlay lifts;
    // continuous spawns warp in from outside the gameField edge to a point
    // inside the play area.
    //
    // 5.95.0 → 5.95.1 — On mobile, cap the spawn radius. Phone-portrait
    // uses MOBILE_PORTRAIT_ASTEROID_MAX_RADIUS (28 px) for a tighter feel
    // on narrow displays; landscape mobile uses MOBILE_ASTEROID_MAX_RADIUS
    // (36 px). Desktop keeps the original 30-60 px range.
    const r = isMobile()
        ? (isPortrait()
            ? random(16, MOBILE_PORTRAIT_ASTEROID_MAX_RADIUS)
            : random(20, MOBILE_ASTEROID_MAX_RADIUS))
        : random(30, 60);
    const spawnBuffer = r * 4;

    let targetX, targetY, srcX, srcY;

    if (opts.onScreen) {
        // Target inside the current viewport. Source is just outside the
        // closest viewport edge so the streak enters from the screen border.
        const target = this.getOnScreenSpawnPosition({
            minDistFromPlayer: r + 220,
            edgePad: r + 12,
        });
        targetX = target.x;
        targetY = target.y;
        const camX = this.camera.x, camY = this.camera.y;
        const camR = camX + this.width, camB = camY + this.height;
        const dL = targetX - camX, dR = camR - targetX;
        const dT = targetY - camY, dB = camB - targetY;
        const minDist = Math.min(dL, dR, dT, dB);
        const sourceMargin = 220 + Math.random() * 160;
        if (minDist === dT) { srcX = targetX + random(-120, 120); srcY = camY - sourceMargin; }
        else if (minDist === dB) { srcX = targetX + random(-120, 120); srcY = camB + sourceMargin; }
        else if (minDist === dL) { srcX = camX - sourceMargin; srcY = targetY + random(-120, 120); }
        else { srcX = camR + sourceMargin; srcY = targetY + random(-120, 120); }
    } else {
        // Continuous / cheat / wave-asteroid path: source on the gameField
        // edge, target somewhere in the middle 60% of the field.
        let attempts = 0;
        do {
            const edge = Math.floor(random(0, 4));
            switch (edge) {
                case 0: srcX = random(0, this.gameField.width); srcY = -spawnBuffer; break;
                case 1: srcX = this.gameField.width + spawnBuffer; srcY = random(0, this.gameField.height); break;
                case 2: srcX = random(0, this.gameField.width); srcY = this.gameField.height + spawnBuffer; break;
                case 3: srcX = -spawnBuffer; srcY = random(0, this.gameField.height); break;
            }
            attempts++;
        } while (this.isInMinimapArea(srcX, srcY) && attempts < 10);
        targetX = random(this.gameField.width * 0.2, this.gameField.width * 0.8);
        targetY = random(this.gameField.height * 0.2, this.gameField.height * 0.8);
    }

    const spd = Math.min(5.0, GAME_CONFIG.AST_SPEED + (this.game.currentWave - 1) * 0.15);
    const vel = {
        x: random(-spd, spd) || 0.2,
        y: random(-spd, spd) || 0.2
    };

    // Place asteroid at warp source so it streaks in toward the target.
    asteroid.initializeAsteroid(srcX, srcY, r, this.game.asteroidLevel, this);
    asteroid.vel = vel;
    asteroid.startWarpIn(targetX, targetY);
}

export function getRandomSpawnPosition(opts = {}) {
    // Default behavior: spawn enemies well beyond the gameField edge so the
    // warp-in animation streaks them in visibly. With opts.onScreen, anchor
    // the warp TARGET inside the visible viewport (at safe distance from
    // the player) and place the warp source just outside the corresponding
    // viewport edge — the warp animation stays brief and the enemy is
    // visible immediately when the wave starts.
    let x, y, targetX, targetY;

    if (opts.onScreen) {
        const target = this.getOnScreenSpawnPosition({
            minDistFromPlayer: 260,
            edgePad: 90,
        });
        targetX = target.x;
        targetY = target.y;

        // Pick the closest viewport edge to start the warp from, so the
        // streak enters from the side it would appear on visually.
        const camX = this.camera.x, camY = this.camera.y;
        const camR = camX + this.width, camB = camY + this.height;
        const dL = targetX - camX, dR = camR - targetX;
        const dT = targetY - camY, dB = camB - targetY;
        const minDist = Math.min(dL, dR, dT, dB);
        const sourceMargin = 220 + Math.random() * 160; // 220-380 px outside viewport edge

        if (minDist === dT) {
            x = targetX + random(-120, 120);
            y = camY - sourceMargin;
        } else if (minDist === dB) {
            x = targetX + random(-120, 120);
            y = camB + sourceMargin;
        } else if (minDist === dL) {
            x = camX - sourceMargin;
            y = targetY + random(-120, 120);
        } else {
            x = camR + sourceMargin;
            y = targetY + random(-120, 120);
        }
    } else {
        // Original off-gameField behavior for continuous / cheat spawns.
        const margin = 200 + Math.random() * 200; // 200-400px offscreen
        const edge = Math.floor(Math.random() * 4);
        switch (edge) {
            case 0:
                x = Math.random() * this.gameField.width;
                y = -margin;
                targetX = x + random(-100, 100);
                targetY = 80 + Math.random() * (this.gameField.height * 0.3);
                break;
            case 1:
                x = this.gameField.width + margin;
                y = Math.random() * this.gameField.height;
                targetX = this.gameField.width - 80 - Math.random() * (this.gameField.width * 0.3);
                targetY = y + random(-100, 100);
                break;
            case 2:
                x = Math.random() * this.gameField.width;
                y = this.gameField.height + margin;
                targetX = x + random(-100, 100);
                targetY = this.gameField.height - 80 - Math.random() * (this.gameField.height * 0.3);
                break;
            case 3:
                x = -margin;
                y = Math.random() * this.gameField.height;
                targetX = 80 + Math.random() * (this.gameField.width * 0.3);
                targetY = y + random(-100, 100);
                break;
            default: x = 0; y = 0; targetX = 200; targetY = 200; break;
        }
    }

    // Clamp target inside field
    targetX = Math.max(60, Math.min(this.gameField.width - 60, targetX));
    targetY = Math.max(60, Math.min(this.gameField.height - 60, targetY));

    return { x, y, targetX, targetY };
}

/**
 * Pick a world-space position inside the visible viewport, at least
 * `minDistFromPlayer` away from the player ship, avoiding the minimap
 * overlay region. Used for wave-start spawning so the player can see the
 * entities that just appeared.
 */
export function getOnScreenSpawnPosition({ minDistFromPlayer = 240, edgePad = 80 } = {}) {
    const camX = this.camera.x;
    const camY = this.camera.y;
    const fieldW = this.gameField.width;
    const fieldH = this.gameField.height;
    // Viewport bounds clamped within the gameField, with an inner edge pad
    // so entities don't spawn flush against the screen edge.
    const left   = Math.max(edgePad, camX + edgePad);
    const right  = Math.min(fieldW - edgePad, camX + this.width - edgePad);
    const top    = Math.max(edgePad, camY + edgePad);
    const bottom = Math.min(fieldH - edgePad, camY + this.height - edgePad);

    // Degenerate viewport (very small / mis-clamped): fall back to gameField
    // center within bounds.
    const safeLeft   = Math.min(left, right);
    const safeRight  = Math.max(left, right);
    const safeTop    = Math.min(top, bottom);
    const safeBottom = Math.max(top, bottom);

    const px = (this.player && this.player.active) ? this.player.x : (camX + this.width / 2);
    const py = (this.player && this.player.active) ? this.player.y : (camY + this.height / 2);

    let x = px, y = py;
    for (let attempt = 0; attempt < 24; attempt++) {
        x = random(safeLeft, safeRight);
        y = random(safeTop, safeBottom);
        if (this.isInMinimapArea(x, y)) continue;
        const dx = x - px, dy = y - py;
        if (dx * dx + dy * dy >= minDistFromPlayer * minDistFromPlayer) {
            return { x, y };
        }
    }

    // Fallback: project the last candidate outward from the player to satisfy
    // the minimum-distance constraint, clamped to the safe viewport rect.
    const dx = x - px, dy = y - py;
    const len = Math.hypot(dx, dy) || 1;
    const ox = (dx / len) * minDistFromPlayer;
    const oy = (dy / len) * minDistFromPlayer;
    return {
        x: Math.max(safeLeft, Math.min(safeRight, px + ox)),
        y: Math.max(safeTop, Math.min(safeBottom, py + oy)),
    };
}

export function getRandomEnemyType() {
    let availableTypes = ['HUNTER', 'WASP'];
    if (this.game.currentWave >= 2) availableTypes.push('GUARDIAN', 'STALKER');
    if (this.game.currentWave >= 4) availableTypes.push('TANGERINE');
    if (this.game.currentWave >= 6) availableTypes.push('TITAN');
    return availableTypes[Math.floor(Math.random() * availableTypes.length)];
}

// ── Spawning Methods (Phase 3.8) ──

export function spawnAsteroidOffscreen() {
    let x, y;
    let attempts = 0;
    const r = random(30, 60);
    const spawnBuffer = r * 4;

    do {
        const edge = Math.floor(random(0, 4));
        switch (edge) {
            case 0: x = random(0, this.width); y = -spawnBuffer; break;
            case 1: x = this.width + spawnBuffer; y = random(0, this.height); break;
            case 2: x = random(0, this.width); y = this.height + spawnBuffer; break;
            default: x = -spawnBuffer; y = random(0, this.height); break;
        }
        attempts++;
    } while (this.isInMinimapArea(x, y) && attempts < 10);

    const newAst = this.asteroidPool.get(x, y, r, this.game.asteroidLevel);
    const tx = random(this.width * 0.3, this.width * 0.7);
    const ty = random(this.height * 0.3, this.height * 0.7);
    const ang = Math.atan2(ty - y, tx - x);
    const spd = Math.min(5.0, GAME_CONFIG.AST_SPEED + (this.game.currentWave - 1) * 0.15);
    newAst.vel = { x: Math.cos(ang) * spd, y: Math.sin(ang) * spd };
    newAst.startWarpIn(tx, ty);
}

export function spawnWaveAsteroids() {
    const desiredAsteroids = GAME_CONFIG.INITIAL_AST_COUNT;
    const currentAsteroids = this.asteroidPool.activeObjects.length;
    const asteroidsToSpawn = Math.max(0, desiredAsteroids - currentAsteroids);

    for (let i = 0; i < asteroidsToSpawn; i++) {
        setTimeout(() => {
            const asteroid = this.asteroidPool.get();
            if (asteroid) {
                this.initializeWaveAsteroid(asteroid);
            }
        }, i * 200);
    }
}

export function startEnemySubWave() {
    this.enemiesRemainingInSubWave = GAME_CONFIG.ENEMIES_PER_SUB_WAVE;
    this.subWaveStartTime = Date.now();
    this.subWaveTimer = Date.now();
    this.lastEnemySpawn = 0;
}

export function forceSpawnEntity() {
    const activeEnemies = this.enemyPool.activeObjects.length;
    const activeAsteroids = this.asteroidPool.activeObjects.length;
    const totalEntities = activeEnemies + activeAsteroids;

    if (totalEntities === 0) {
        if (this.forceSpawnEnemy()) return true;
        if (this.forceSpawnAsteroid()) return true;
    }

    let spawnEnemy = Math.random() < 0.5;
    if (activeAsteroids >= GAME_CONFIG.MAX_ASTEROIDS) {
        spawnEnemy = true;
    }

    if (spawnEnemy) {
        if (this.forceSpawnEnemy()) return true;
    } else {
        if (this.forceSpawnAsteroid()) return true;
    }

    if (spawnEnemy) {
        if (this.forceSpawnAsteroid()) return true;
    } else {
        if (this.forceSpawnEnemy()) return true;
    }

    if (this.forceSpawnEnemy()) return true;
    if (this.forceSpawnAsteroid()) return true;

    console.error('❌ ALL SPAWN METHODS EXHAUSTED!');
    return false;
}

export function forceSpawnEnemy() {
    const enemy = this.enemyPool.get();
    if (enemy) {
        const sp = this.getRandomSpawnPosition();
        const enemyType = this.getRandomEnemyType();
        enemy.reset(sp.x, sp.y, enemyType, this.game.enemyLevel, this);
        enemy.startWarpIn(sp.targetX, sp.targetY);
        return true;
    }

    try {
        const newEnemy = new Enemy();
        const sp = this.getRandomSpawnPosition();
        const enemyType = this.getRandomEnemyType();
        newEnemy.reset(sp.x, sp.y, enemyType, this.game.enemyLevel, this);
        newEnemy.startWarpIn(sp.targetX, sp.targetY);
        this.enemyPool.activeObjects.push(newEnemy);
        return true;
    } catch (error) {
        console.error('❌ Failed to create new enemy:', error);
        return false;
    }
}

export function forceSpawnAsteroid() {
    if (this.asteroidPool.activeObjects.length >= GAME_CONFIG.MAX_ASTEROIDS) {
        return false;
    }

    const asteroid = this.asteroidPool.get();
    if (asteroid) {
        this.initializeWaveAsteroid(asteroid);
        return true;
    }

    try {
        const newAsteroid = new Asteroid();
        this.initializeWaveAsteroid(newAsteroid);
        this.asteroidPool.activeObjects.push(newAsteroid);
        return true;
    } catch (error) {
        console.error('❌ Failed to create new asteroid:', error);
        return false;
    }
}

export function isInMinimapArea(worldX, worldY) {
    const screenX = worldX - this.camera.x;
    const screenY = worldY - this.camera.y;

    // 5.72.0 — minimap moved to TOP-LEFT (see hud/navigation.js).
    const minDim = Math.min(this.width, this.height);
    const mmSize = minDim < 500 ? Math.max(80, Math.floor(minDim * 0.22)) : 150;
    const mmMargin = mmSize < 120 ? 10 : 20;
    const minimapLeft = mmMargin;
    const minimapTop = mmMargin;
    const minimapRight = mmMargin + mmSize;
    const minimapBottom = mmMargin + mmSize;

    return screenX >= minimapLeft && screenX <= minimapRight &&
           screenY >= minimapTop && screenY <= minimapBottom;
}

export function spawnContinuousAsteroid() {
    const asteroid = this.asteroidPool.get();
    if (asteroid) {
        this.initializeWaveAsteroid(asteroid);
    } else {
        console.warn('⚠️ Failed to get asteroid from pool!');
        const newAsteroid = new Asteroid();
        this.initializeWaveAsteroid(newAsteroid);
        this.asteroidPool.activeObjects.push(newAsteroid);
    }
}

export function spawnRandomEnemy() {
    const enemyType = this.getRandomEnemyType();
    const sp = this.getRandomSpawnPosition();

    const enemy = this.enemyPool.get();
    if (enemy) {
        enemy.reset(sp.x, sp.y, enemyType, this.game.enemyLevel, this);
        enemy.startWarpIn(sp.targetX, sp.targetY);
    } else {
        const newEnemy = new Enemy();
        newEnemy.reset(sp.x, sp.y, enemyType, this.game.enemyLevel, this);
        newEnemy.startWarpIn(sp.targetX, sp.targetY);
        this.enemyPool.activeObjects.push(newEnemy);
    }
}

// 5.74.2 — opens the pause menu on the POWERUPS tab as the wave-clear
// reward window. Sets `_pausedFromWaveClear` so togglePause's resume
// branch routes back into startNextWave instead of straight to PLAYING,
// preserving the wave-gating behavior the shop used to provide.
//
// 5.98.0 — On mobile this routes to `openWavePickOverlay` instead, which
// shows a 3-card random-powerup pick screen. The mobile model doesn't
// award SP on wave clear (see completeWave above), so the pause-menu
// POWERUPS tab would be empty of currency to spend.
export function openWaveClearPowerupsMenu() {
    if (!this.uiManager) return;
    if (isMobile()) {
        openWavePickOverlay.call(this);
        return;
    }
    this.events.emit('ui:hide-message');
    this._pausedFromWaveClear = true;
    this.game.state = GAME_STATES.PAUSED;
    if (this.player) this.player.pauseChargeShot();
    // Show the pause overlay and switch to the POWERUPS tab.
    const overlay = document.getElementById('pause-overlay');
    if (overlay) overlay.style.display = 'flex';
    this.uiManager.updatePowerupsList && this.uiManager.updatePowerupsList();
    this.uiManager.switchTab && this.uiManager.switchTab('powerups');
    // 5.74.11 — auto-scroll the pause-menu so the POWERUPS list is the
    // first thing the player sees instead of the tab strip / CONTROLS
    // text. requestAnimationFrame defers one frame so the freshly-
    // activated tab content has been laid out before we scroll into it.
    requestAnimationFrame(() => {
        const tab = document.getElementById('powerups-tab');
        const menu = document.getElementById('pause-menu');
        if (tab && menu) {
            const offset = tab.offsetTop - 12; // small breathing-room margin
            menu.scrollTo({ top: Math.max(0, offset), behavior: 'smooth' });
        }
    });
}

// 5.98.0 — Mobile wave-clear powerup pick. Pauses gameplay, picks 3
// random non-maxed POWERUP_TYPES entries, and shows the
// #wave-pick-overlay DOM modal. Tapping a card adds a stack of that
// powerup (free — no SP cost) and resumes into the next wave via the
// same togglePause path the pause-menu uses.
export function openWavePickOverlay() {
    if (!this.player) return;
    const player = this.player;

    // ── Pick 3 random non-maxed powerups ──
    // 5.100.3 — Also skip `hidden` powerups (LONG_RANGE retired).
    const entries = Object.entries(POWERUP_TYPES).filter(([type, cfg]) => {
        if (cfg.hidden) return false;
        const cap = cfg.maxStacks || 99;
        const stacks = player.getPowerupStacks ? player.getPowerupStacks(type) : 0;
        return stacks < cap;
    });
    // Fisher-Yates shuffle (in place on a copy).
    const pool = entries.slice();
    for (let i = pool.length - 1; i > 0; i--) {
        const j = (Math.random() * (i + 1)) | 0;
        [pool[i], pool[j]] = [pool[j], pool[i]];
    }
    const picks = pool.slice(0, Math.min(3, pool.length));

    // If the player has maxed EVERY powerup, fall through to the
    // pre-5.98 pause-menu path so they at least see the wave-clear
    // chrome and can resume into the next wave.
    if (picks.length === 0) {
        this.events.emit('ui:hide-message');
        this._pausedFromWaveClear = true;
        this.game.state = GAME_STATES.PAUSED;
        if (this.player) this.player.pauseChargeShot();
        // Resume directly via togglePause so the next-wave start fires.
        if (typeof this.togglePause === 'function') this.togglePause();
        return;
    }

    // ── State setup ──
    this.events.emit('ui:hide-message');
    this._pausedFromWaveClear = true;
    this.game.state = GAME_STATES.PAUSED;
    if (this.player) this.player.pauseChargeShot();

    // ── Build the DOM ──
    const overlay = document.getElementById('wave-pick-overlay');
    const cardsContainer = document.getElementById('wave-pick-cards');
    if (!overlay || !cardsContainer) {
        // DOM missing — defensive fall-through. Resume immediately.
        if (typeof this.togglePause === 'function') this.togglePause();
        return;
    }
    overlay.style.display = 'flex';
    cardsContainer.replaceChildren();

    for (const [type, cfg] of picks) {
        const card = document.createElement('button');
        card.type = 'button';
        card.className = 'wave-pick-card';
        card.style.setProperty('--wp-color', cfg.color || '#cccccc');

        const iconWrap = document.createElement('div');
        iconWrap.className = 'wave-pick-card-icon';
        iconWrap.innerHTML = renderIconHTML(cfg.icon, { size: 36, fallback: '★' });
        card.appendChild(iconWrap);

        const body = document.createElement('div');
        body.className = 'wave-pick-card-body';

        const name = document.createElement('div');
        name.className = 'wave-pick-card-name';
        name.textContent = cfg.displayName || cfg.name || type;
        body.appendChild(name);

        const desc = document.createElement('div');
        desc.className = 'wave-pick-card-desc';
        desc.textContent = cfg.description || '';
        body.appendChild(desc);

        card.appendChild(body);

        const stacksLbl = document.createElement('div');
        stacksLbl.className = 'wave-pick-card-stacks';
        const haveStacks = player.getPowerupStacks ? player.getPowerupStacks(type) : 0;
        const cap = cfg.maxStacks || 99;
        stacksLbl.textContent = `${haveStacks} / ${cap}`;
        card.appendChild(stacksLbl);

        card.addEventListener('click', (e) => {
            e.stopPropagation();
            e.preventDefault();
            // Apply the pick — free (no SP cost on mobile wave-clear).
            player.addPowerup(type, { ...cfg, duration: Infinity }, true);
            if (this.events?.emit) {
                this.events.emit('audio:powerup');
                this.events.emit('ui:show-message', {
                    title: cfg.displayName || cfg.name || type,
                    subtitle: `+1 STACK (${(player.getPowerupStacks(type) || 1)} / ${cap})`,
                    duration: 1400,
                    position: 'top',
                });
            }
            closeWavePickOverlay.call(this);
        });

        cardsContainer.appendChild(card);
    }
}

// 5.98.0 — Tear down the wave-pick overlay and route into the next
// wave. We can't call togglePause directly because pause-overlay is
// not open on this code path (we opened wave-pick-overlay instead) —
// togglePause would flash the pause menu visible for a frame. Instead
// we manually pop the resume frame and start the next wave, mirroring
// the togglePause PAUSED-branch logic without touching the DOM.
export function closeWavePickOverlay() {
    const overlay = document.getElementById('wave-pick-overlay');
    if (overlay) overlay.style.display = 'none';
    // 5.99.0 — Defensively hide the pause-overlay too. If the player
    // had paused mid-wave-clear (during the 2.7s gap before wave-pick
    // fires), the pause overlay is also showing UNDERNEATH the wave-
    // pick modal. Without this clear, picking a card hid wave-pick but
    // left pause-overlay 'flex', and the game's first Resume tap would
    // re-pause instead of resuming (the togglePause state machine
    // assumed PLAYING when called).
    const pauseOverlay = document.getElementById('pause-overlay');
    if (pauseOverlay) pauseOverlay.style.display = 'none';
    if (this.player && typeof this.player.resumeChargeShot === 'function') {
        this.player.resumeChargeShot();
    }
    const frame = this._popResumeFrame ? this._popResumeFrame() : null;
    if (frame && frame.fromWaveClear) {
        this.game.state = GAME_STATES.WAVE_TRANSITION;
        if (typeof this.startNextWave === 'function') this.startNextWave();
    } else {
        // Defensive fallback — should not happen since openWavePickOverlay
        // pushes the wave-clear frame. Restore to PLAYING.
        this.game.state = GAME_STATES.PLAYING;
    }
}
