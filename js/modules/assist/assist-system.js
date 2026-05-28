import { ABILITIES, POWER_WEAPONS } from '../combat/weapon-data.js';
import { triggerHapticFeedback } from '../core/utils.js';
import { HAPTIC } from '../platform/haptic.js';

export const ASSIST_LEVELS = Object.freeze({
    MANUAL_TOUCH: 'manual-touch',
    CO_PILOT: 'co-pilot',
    AUTOPILOT: 'autopilot',
});

export const DEFAULT_ASSIST_CONFIG = Object.freeze({
    level: ASSIST_LEVELS.CO_PILOT,
    aggression: 0.55,
    autoDodge: 'conservative',
    autoCastAbilities: true,
    autoCastPower: true,
    autoAim: true,
});

const BIG_CAST_GAP_MS = 400;
const CAST_TICK_MS = 100;
const DODGE_PAD = 18;
const DANGER_R = 360;

export function senseThreats(snapshot) {
    const p = snapshot?.player || {};
    const px = p.x || 0, py = p.y || 0;
    const pvx = p.vel?.x || 0, pvy = p.vel?.y || 0;
    const pr = p.radius || 12;
    const incoming = [];
    for (const b of snapshot?.bullets || []) {
        if (!b || b.active === false) continue;
        const rvx = (b.vel?.x || 0) - pvx;
        const rvy = (b.vel?.y || 0) - pvy;
        const toX = px - b.x;
        const toY = py - b.y;
        const dist = Math.hypot(toX, toY);
        if (dist > DANGER_R) continue;
        const relSpeed = Math.hypot(rvx, rvy) || 0.001;
        const closing = (toX * rvx + toY * rvy) > 0;
        const miss = Math.abs(toX * rvy - toY * rvx) / relSpeed;
        const radius = pr + (b.radius || 8) + DODGE_PAD;
        const homing = b.homing || b.bossRageHoming || b.shape === 'homing_mine';
        if (homing || (closing && miss < radius)) {
            incoming.push({ bullet: b, dist, tti: dist / relSpeed, miss, homing: !!homing });
        }
    }
    incoming.sort((a, b) => a.tti - b.tti);
    return incoming;
}

export function senseSituation(snapshot) {
    const player = snapshot?.player || {};
    const enemies = (snapshot?.enemies || []).filter((e) => e && e.active !== false);
    const incoming = senseThreats(snapshot);
    const maxHp = typeof player.getCurrentMaxHp === 'function'
        ? player.getCurrentMaxHp()
        : (player.maxHealth || 1);
    let nearest = null;
    let boss = null;
    let cx = 0, cy = 0, crowding = 0;
    const px = player.x || 0, py = player.y || 0;
    const octants = new Set();
    for (const e of enemies) {
        const dx = e.x - px, dy = e.y - py;
        const dist = Math.hypot(dx, dy);
        if (!nearest || dist < nearest.dist) nearest = { target: e, dist };
        if (e.isBoss || e.bossId || e.type === 'boss') boss = e;
        if (dist < 330) {
            crowding++;
            cx += e.x;
            cy += e.y;
            const oct = Math.floor(((Math.atan2(dy, dx) + Math.PI) / (Math.PI * 2)) * 8);
            octants.add(oct);
        }
    }
    const clusterCentroid = crowding > 0 ? { x: cx / crowding, y: cy / crowding } : (nearest?.target || null);
    return {
        player,
        enemies,
        incoming,
        nearest: nearest?.target || null,
        boss,
        hpFrac: Math.max(0, Math.min(1, (player.health || 0) / maxHp)),
        energyFrac: Math.max(0, Math.min(1, (player.energy || 0) / (player.maxEnergy || 100))),
        minTTI: incoming.length ? incoming[0].tti : Infinity,
        incomingCount: incoming.length,
        crowding,
        surroundedness: octants.size,
        clusterCentroid,
        threatLevel: snapshot?.threatLevel || 1,
        now: snapshot?.now || Date.now(),
        gameField: snapshot?.gameField || null,
    };
}

function roleScore(role, situation, config) {
    const a = Math.max(0.1, Math.min(1, config?.aggression ?? 0.55));
    switch (role) {
        case 'heal':
            return situation.hpFrac < (0.34 + a * 0.12) ? 100 - situation.hpFrac * 100 : 0;
        case 'mitigate':
            return (situation.minTTI < 0.6 && situation.incomingCount >= 2) || (situation.hpFrac < 0.55 && situation.incomingCount)
                ? 88 - situation.minTTI * 20 : 0;
        case 'escape':
            return situation.surroundedness >= 5 || (situation.minTTI < 0.35 && situation.incomingCount >= 2) ? 82 : 0;
        case 'cc':
            return situation.crowding >= 3 || situation.surroundedness >= 4 ? 70 + situation.crowding : 0;
        case 'zone':
            return situation.crowding >= 3 ? 58 + situation.crowding * 4 : 0;
        case 'summon':
            return situation.enemies.length >= 2 ? 52 : 0;
        case 'buff':
            return situation.threatLevel >= 3 || situation.boss ? 55 : 0;
        case 'nuke':
            return situation.boss ? 78 : (situation.crowding >= 4 ? 62 + situation.crowding * 4 : 0);
        case 'snipe':
            return situation.boss || situation.nearest ? 48 + (situation.boss ? 20 : 0) : 0;
        default:
            return 0;
    }
}

export function decideCast(situation, equipped, cooldowns = [], config = DEFAULT_ASSIST_CONFIG, lastCast = {}) {
    if (!config.autoCastAbilities) return null;
    let best = null;
    const now = situation.now || Date.now();
    for (let slot = 0; slot < (equipped || []).length; slot++) {
        const id = equipped[slot];
        const cfg = ABILITIES[id];
        if (!cfg || cooldowns[slot] > 0) continue;
        const meta = cfg.autoCast || {};
        if ((meta.minThreatLevel || 0) > situation.threatLevel) continue;
        if (situation.player?.activeAbilityEffects?.has?.(id)) continue;
        let score = roleScore(meta.role, situation, config);
        if (situation.minTTI < 0.3 && ['heal', 'mitigate', 'escape', 'cc'].includes(meta.role)) score += 35;
        if (score <= 0) continue;
        if ((now - (lastCast.bigCastAt || 0)) < BIG_CAST_GAP_MS && !['heal', 'mitigate', 'escape'].includes(meta.role)) continue;
        if (!best || score > best.score) {
            best = { type: 'ability', slot, id, score, target: meta.targeting === 'cluster' ? situation.clusterCentroid : null };
        }
    }
    return best;
}

export function decidePower(situation, powerId, ready, config = DEFAULT_ASSIST_CONFIG, lastCast = {}) {
    if (!config.autoCastPower || !ready) return null;
    const cfg = POWER_WEAPONS[powerId];
    if (!cfg) return null;
    const meta = cfg.autoCast || {};
    if ((meta.minThreatLevel || 0) > situation.threatLevel) return null;
    const now = situation.now || Date.now();
    if ((now - (lastCast.powerAt || 0)) < BIG_CAST_GAP_MS) return null;
    const score = roleScore(meta.role || 'snipe', situation, config);
    if (score < 45) return null;
    return {
        type: 'power',
        id: powerId,
        score,
        target: meta.targeting === 'cluster' ? situation.clusterCentroid : (situation.boss || situation.nearest),
    };
}

// AS-6 — Smart-Cast: pick the single best thing to cast RIGHT NOW (the higher-
// scored of the best ready ability vs. the power weapon) for an on-demand
// manual trigger. Unlike the autonomous act() loop, this evaluates both
// pipelines with auto-cast FORCED ON (the player explicitly asked), so it works
// even when the Co-Pilot's automatic casting is off (e.g. MANUAL level). Pure:
// returns the decideCast/decidePower pick object ({type:'ability'|'power',...})
// or null when nothing is worth casting. No side effects.
export function pickSmartCast(situation, player, config = DEFAULT_ASSIST_CONFIG, lastCast = {}) {
    if (!situation || !player) return null;
    const evalCfg = { ...config, autoCastAbilities: true, autoCastPower: true };
    const ability = decideCast(situation, player.equippedAbilities, player.abilityCooldowns, evalCfg, lastCast);
    const ready = typeof player.isPowerReady === 'function' && player.isPowerReady();
    const power = decidePower(situation, player.activePower, ready, evalCfg, lastCast);
    if (ability && power) return ability.score >= power.score ? ability : power;
    return ability || power || null;
}

export function scoreDodgeDestinations(situation) {
    const player = situation.player || {};
    const px = player.x || 0, py = player.y || 0;
    const dist = 135;
    const candidates = [];
    const steer = player._lastAssistSteer;
    if (steer && Math.hypot(steer.x || 0, steer.y || 0) > 0.1) candidates.push(Math.atan2(steer.y, steer.x));
    for (let i = 0; i < 8; i++) candidates.push(i * Math.PI / 4);
    const enemies = situation.enemies || [];
    const field = situation.gameField;
    return candidates.map((angle) => {
        const x = px + Math.cos(angle) * dist;
        const y = py + Math.sin(angle) * dist;
        let nearest = Infinity;
        for (const e of enemies) nearest = Math.min(nearest, Math.hypot((e.x || 0) - x, (e.y || 0) - y));
        let score = Math.min(nearest, 500);
        if (situation.clusterCentroid) score += Math.hypot(x - situation.clusterCentroid.x, y - situation.clusterCentroid.y) * 0.2;
        if (field) {
            const r = player.radius || 12;
            if (x < r || y < r || x > field.width - r || y > field.height - r) score -= 1000;
        }
        return { angle, x, y, score };
    }).sort((a, b) => b.score - a.score);
}

export function decideDodge(situation, config = DEFAULT_ASSIST_CONFIG) {
    if (config.autoDodge === 'off') return null;
    const player = situation.player || {};
    if (player.isDashing || player.dashCooldown > 0) return null;
    const threshold = config.autoDodge === 'aggressive' || config.level === ASSIST_LEVELS.AUTOPILOT ? 0.75 : 0.34;
    if (!(situation.minTTI < threshold && situation.incomingCount > 0)) return null;
    const best = scoreDodgeDestinations(situation)[0];
    return best ? { type: 'dash', target: best } : null;
}

export class AssistSystem {
    constructor(engine, config = {}) {
        this.engine = engine;
        this.config = { ...DEFAULT_ASSIST_CONFIG, ...config };
        this.lastCast = { bigCastAt: 0, powerAt: 0 };
        this._lastCastSense = 0;
        this.lastSituation = null;
    }

    snapshot() {
        const ge = this.engine;
        const player = ge?.player;
        if (!player) return null;
        // On-screen gate — the Co-Pilot only TARGETS enemies the player can
        // actually see. We filter the enemy list to those overlapping the
        // viewport (zoom-aware; buffer 0 = any visible part counts) so every
        // downstream offensive decision — nearest / boss / cluster centroid,
        // and therefore snipe / nuke / cluster-aimed powers + abilities — can
        // never aim or fire at a threat that hasn't entered the frame yet.
        // Bullets are left UNFILTERED so dodge/mitigate still react to
        // incoming fire (defensive sensing, not aiming).
        const allEnemies = ge.enemyPool?.activeObjects || [];
        const onScreen = typeof ge.isEntityOnScreen === 'function'
            ? allEnemies.filter((e) => ge.isEntityOnScreen(e, 0))
            : allEnemies;
        return {
            player,
            enemies: onScreen,
            bullets: ge.enemyBulletPool?.activeObjects || [],
            threatLevel: ge.game?.difficultyDirector?.getThreatLevel?.() || ge.game?.threatLevel || 1,
            gameField: ge.gameField,
            now: Date.now(),
        };
    }

    tick(input) {
        const snap = this.snapshot();
        if (!snap || !input) return null;
        const situation = senseSituation(snap);
        this.lastSituation = situation;
        const player = snap.player;
        const stick = input.stickInput;
        if (stick && stick.magnitude > 0.05) player._lastAssistSteer = { x: stick.x, y: stick.y };

        const dodge = decideDodge(situation, this.config);
        if (dodge && !input.dashPulse) {
            input.dashPulse = true;
            input.dashTargetScreenX = null;
            input.dashTargetScreenY = null;
            player._assistDashAngle = dodge.target.angle;
            triggerHapticFeedback(HAPTIC.MEDIUM);
        }

        const now = situation.now;
        if (now - this._lastCastSense < CAST_TICK_MS) return dodge;
        this._lastCastSense = now;

        const power = decidePower(
            situation,
            player.activePower,
            typeof player.isPowerReady === 'function' && player.isPowerReady(),
            this.config,
            this.lastCast,
        );
        if (power) {
            if (power.target && typeof power.target.x === 'number') {
                input.aimX = power.target.x;
                input.aimY = power.target.y;
            }
            input.fireSecondary = true;
            this.lastCast.powerAt = now;
        }

        const cast = decideCast(situation, player.equippedAbilities, player.abilityCooldowns, this.config, this.lastCast);
        if (cast) {
            input.activateAbilitySlot = input.activateAbilitySlot || [false, false, false, false];
            input.activateAbilitySlot[cast.slot] = true;
            player._lastAssistCast = { id: cast.id, slot: cast.slot, t: now };
            triggerHapticFeedback(HAPTIC.LIGHT);
            this.lastCast.bigCastAt = now;
            return cast;
        }
        return power || dodge;
    }

    // AS-6 — apply an on-demand Smart-Cast to the shared input. Evaluates
    // pickSmartCast against the most-recent sensed situation (act() refreshes
    // this.lastSituation every frame) and the live player, then writes the
    // chosen ability/power into `input` exactly as act() does. Returns the pick
    // (or null). A future Smart-Cast HUD button (default hidden) calls this on
    // press; it works regardless of the Co-Pilot's auto-cast toggles.
    smartCast(input) {
        const situation = this.lastSituation;
        const player = this.engine && this.engine.player;
        if (!situation || !input || !player) return null;
        const pick = pickSmartCast(situation, player, this.config, this.lastCast);
        if (!pick) return null;
        const now = situation.now || Date.now();
        if (pick.type === 'power') {
            if (pick.target && typeof pick.target.x === 'number') {
                input.aimX = pick.target.x;
                input.aimY = pick.target.y;
            }
            input.fireSecondary = true;
            this.lastCast.powerAt = now;
        } else if (pick.type === 'ability') {
            input.activateAbilitySlot = input.activateAbilitySlot || [false, false, false, false];
            input.activateAbilitySlot[pick.slot] = true;
            player._lastAssistCast = { id: pick.id, slot: pick.slot, t: now };
            this.lastCast.bigCastAt = now;
        }
        return pick;
    }
}
