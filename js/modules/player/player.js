// Player ship entity
import { GAME_CONFIG, BLOODSHIELD_CAP_FRAC, BLOODSHIELD_DECAY_PER_SEC, BLOODSHIELD_DECAY_DELAY_MS, BLOODLUST_DECAY_MS, FLUX_WINDOW_MS, CAPACITOR_BANK_DECAY_PER_SEC, HEAT_SINK_DECAY_PER_SEC, HEAT_SINK_MAX } from '../core/constants.js';
import { random, wrap } from '../core/utils.js';
import * as weapons from './weapons.js';
import * as abilities from './abilities.js';
import * as progression from './progression.js';
import * as passives from './passives.js';
import * as playerRenderer from './renderer.js';
import { loadSettings } from '../core/storage.js';
import { DEFAULT_SKIN_ID } from './skins/index.js';
import { scoreItem } from '../world/item-system.js';
import { debugState } from '../core/debug-config.js';
// Mobile auto-fire (5.92.0): when running in mobile mode the player
// has no spare hand to tap a power-weapon button — the spec auto-
// fires the equipped power weapon the moment it's ready (off
// cooldown, or fully charged for CHARGE_SHOT). The desktop path is
// unchanged; isMobile() returns false off touch devices unless the
// `?mobile=1` URL param is set.
import { isMobile } from '../platform/platform-detect.js';
import { rumble, RUMBLE } from '../platform/rumble.js';
import { initPlayerStatus } from './player-status.js';

// P6 — Kinetic Battery passive: a successful dash refunds this much power
// energy (gated by the dash cooldown, so it can't be spammed for free energy).
export const KINETIC_BATTERY_REFUND = 20;

// P6 — Siege passive: damage ramps while standing still and decays on the move.
// `_siegeRamp` ∈ [0,1] is advanced each frame in update() from player speed;
// the outgoing mult is applied in applyDamageToEnemy via getSiegeDamageMult().
// Pure helpers so the ramp curve + multiplier unit-test cleanly.
export const SIEGE_BUILD_MS = 2000;   // stationary → full ramp in ~2s
export const SIEGE_DECAY_MS = 600;    // moving → ramp gone in ~0.6s
export const SIEGE_MAX_BONUS = 0.6;   // +60% damage at a full ramp
export const SIEGE_MOVE_SPEED = 0.5;  // speed above which the player counts as moving
export function siegeRampStep(prevRamp, isMoving, dtMs) {
    const p = Math.max(0, Math.min(1, prevRamp || 0));
    const d = Math.max(0, dtMs || 0);
    const next = isMoving ? p - d / SIEGE_DECAY_MS : p + d / SIEGE_BUILD_MS;
    return Math.max(0, Math.min(1, next));
}
export function siegeMult(ramp) {
    return 1 + Math.max(0, Math.min(1, ramp || 0)) * SIEGE_MAX_BONUS;
}

export class Player {
    constructor() {
        // One-time setup properties
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.lastX = 0;
        this.lastY = 0;
        this.rotation = 0;
        this.radius = 12;
        // 5.88.5 — base max HP bumped 25 → 40 for the energy-tank hit
        // model. With no post-hit invuln window, low-base HP meant a
        // single sustained burst could clip through a tank in one go;
        // 40 gives the player ~2 hits of headroom per tank at typical
        // enemy damage values, so picked-up health actually has room
        // to land before the next consume-tank trigger.
        this.health = 40;
        this.maxHealth = 40;
        this.healthTanks = 0; // engine init overrides to 3 (5.88.3 spare-count semantics)
        this.shield = 15; // 15% damage reduction (start with basic armor for survivability)
        this.invulnerable = false;
        this.lastHitTime = 0;
        this.lastBlinkTime = 0;
        
        // Critical hit system
        this.baseCritChance = 8; // 8% base critical hit chance (visibly noticeable on Storm Needles spam)
        this.baseCritDamage = 200; // 200% base critical hit damage (2x)
        
        // WASD + Mouse controls
        this.thrustPower = 2.0 * GAME_CONFIG.TICK_SCALE; // Scaled for tick rate

        // ── Thrust juice state ──
        this.thrustLevel = 0;         // 0 = idle, ramps to 1 when thrusting
        this.lastThrustTime = 0;      // timestamp of last active thrust input
        this.engineStartup = 0;       // 0→1 ramp for startup shudder
        this.wasThrusting = false;    // edge detection for idle→thrust transition

        // ── Living-ship articulation state (visual only; read by the
        // renderer). The ship banks into turns like a bird, sweeps its
        // wings back under thrust like a diving fish, fans its S-foils,
        // and gently "breathes" while idle. None of this touches physics. ──
        this.bank = 0;                // -1..1 lateral lean / roll
        this.wingSweep = 0;           // 0 idle (spread) → 1 thrust (swept back)
        this.flapOpen = 0;            // 0 closed → 1 S-foils fanned open
        this.glidePhase = 0;          // ever-advancing idle "breathing" phase
        this._prevAimAngle = -Math.PI / 2;

        // 6.157.0 — Cosmetic ship skin (drawn by js/modules/player/skins/).
        // Loaded from settings so the chosen skin persists across runs.
        // PURELY visual: every skin shares the same fixed collision radius,
        // so the choice never affects gameplay.
        this.skinId = (() => {
            try { return loadSettings().selectedSkin || DEFAULT_SKIN_ID; }
            catch { return DEFAULT_SKIN_ID; }
        })();
        
        // Auto-firing system
        this.autoFireTimer = 0;
        this.baseFireRate = 400; // Base auto-fire rate in ms (halved frequency for more rapid fire upgrade value)
        
        // Audio sync - shoot sound matches fire rate exactly
        this.lastShootSound = 0;
        
        // Charging shot system
        this.isCharging = false;
        this.chargeStartTime = 0;
        this.chargeLevel = 0; // 0-1 charge level
        this.maxChargeTime = 5000; // 5 seconds for full charge
        this.minChargeTime = 3000; // 3 seconds for basic charge
        
        // Pause system for charge shot
        this.chargePaused = false;
        this.pausedChargeTime = 0; // Accumulated charge time when paused
        
        // Shot timing — Date.now() based (immune to frame rate variation)
        this.lastShotTime = 0;
        this.canShoot = true;
        
        // Hit streak combo system
        this.hitStreak = 0; // Current consecutive hit streak
        this.currentShotHits = 0; // Hits for the current shot
        this.shotFired = false; // Whether a shot is currently active
        this.activeShotBullets = 0; // Number of bullets from current shot still active
        
        // Powerup system
        this.powerups = new Map(); // Map of powerup type -> {stacks, timeRemaining}

        // 6.0.0 — Player leveling RETIRED. Wave is the new "level."
        // Fields kept (as inert constants) so legacy readers don't NPE,
        // but XP no longer accumulates and skillPoints never increases.
        // Powerups are bought with GOLD now (see ui-manager.purchasePowerup
        // + shop-manager). See progression.js for the no-op stubs.
        this.level = 1;
        this.experience = 0;
        this.experienceToNextLevel = Infinity;
        this.skillPoints = 0;

        // 6.35.0 — Load persistent meta progression (level / XP / SP /
        // per-stat allocations) from localStorage. Overwrites level=1
        // above with the saved value. NOT reset between runs.
        progression.initMeta.call(this);

        // 6.29.0 — Energy meter (replaces the vestigial XP bar). Energy
        // builds as the player lands hits and is spent to fire power
        // weapons; each power weapon costs a different amount
        // (POWER_ENERGY_COST in weapons.js).
        this.energy = 0;
        this.maxEnergy = 100;

        // Weapon system. All primaries / powers / abilities are FREE and
        // selectable from start (5.64.11). The owned-sets are still
        // tracked for legacy upgrade-tree compatibility but the pause
        // menu treats every weapon and ability as equippable.
        this.activePrimary = 'PULSE_CANNON';
        this.activePower = 'CHARGE_SHOT';
        // W1 (Attunements) — per-weapon active attunement ids: { weaponId: [id,…] }.
        // Empty = element-agnostic (KINETIC). Populated from the loadout (W5);
        // bullets read it in applyGlobalBulletUpgrades to stamp bullet.elements.
        this.activeAttunements = {};
        this.ownedPrimaries = new Set(['PULSE_CANNON']);
        this.ownedPowers = new Set(['CHARGE_SHOT']);
        // 6.x — Base kit is Pulse + Charge ONLY. Abilities are purchase-locked
        // (the first arrives via the Stage-1 milestone gift), so the player
        // owns no abilities by default; the run-start loadout fills these.
        this.ownedAbilities = new Set();

        // Phase B.S1 — 4-slot defense-ability loadout (NEW source of truth).
        //   equippedAbilities[i]   — ability id in slot i (0..3), or null.
        //   abilityCooldowns[i]   — ms remaining on slot i's cooldown.
        //   abilityCooldownsMax[i]— the cooldown the slot was last set to
        //                         (drives the charge-ring fill on the HUD).
        // Multiple slots can be active at once; per-ability active state lives
        // in `activeAbilityEffects` (a Map keyed by ability id — unchanged).
        //
        // Back-compat: the legacy `activeAbility` / `activeAbilityCooldown` /
        // `activeAbilityCooldownMax` properties are defined as getter/setter
        // accessors below that proxy slot 0, so HUD / input / shop / save
        // code that still reads or writes those names keeps working until the
        // S2/S3/S4 phases migrate them. 6.x — no ability is equipped by
        // default (abilities are now purchase-locked); the run-start loadout
        // populates these slots from the player's unlocked + chosen abilities.
        this.equippedAbilities = [null, null, null, null];
        this.abilityCooldowns = [0, 0, 0, 0];
        this.abilityCooldownsMax = [0, 0, 0, 0];
        this._defineAbilitySlotAccessors();

        // Phase P2 — rule-modifier PASSIVES (distinct from STATS). Up to FIVE
        // equip slots (round-3 §11.A: maxSlots = 3 + floor(stages/30), cap 5),
        // unlocked over a run (P3); swappable mid-run (P5). The array is always
        // the hard cap (5); `passiveSlotsUnlocked` gates how many are usable.
        // A KEYSTONE BUDGET caps build-defining keystones at 2 equipped slots.
        //   equippedPassives[i] — passive id in slot i (0..4), or null
        //   ownedPassives       — ids this run may equip (seeded from meta)
        //   activePassives      — equipped ∩ owned within unlocked slots,
        //                         rebuilt on any change (the queried source)
        //   passiveSlotsUnlocked— how many slots are currently usable (P3)
        this.equippedPassives = [null, null, null, null, null];
        this.ownedPassives = new Set();
        this.activePassives = new Set();
        this.passiveSlotsUnlocked = 1;
        this._passiveRampState = new Map(); // ramping-passive accrual (reset on swap, P5)

        // Streak buff — set by combat-manager.onEnemyKill when the kill
        // streak crosses a tier threshold. Drives damage multiplier and the
        // streak indicator HUD. 1.0 = no buff, 1.5 = EMPOWERED, 2.0 = UNSTOPPABLE.
        this.streakDamageMult = 1;
        this.streakBuffEndTime = 0;
        this.streakTierLabel = null;

        // Defense ability state. Cooldowns live in the per-slot arrays above
        // (slot 0 reachable via the `activeAbilityCooldown` back-compat
        // accessor). `activeAbilityEffects` is a Map keyed by ability id — with
        // the 4-slot model multiple abilities can be active at once, and since
        // it already keys by id it needs no change.
        this.activeAbilityEffects = new Map(); // ability id -> {timeRemaining, ...state}

        // Power weapon cooldown
        this.powerCooldown = 0;

        // Lance beam state (5.64.15 — continuous tether; beamTimer kept
        // for any legacy code paths but no longer drives the beam).
        this.beamActive = false;
        this.beamTimer = 0;
        this.beamAngle = 0;
        this.beamHitDist = 0;

        // Mine state
        this.activeMines = [];

        // Nova blast state
        this.novaRings = [];

        // Lightning arc state (5.64.15 — continuous tether replaces
        // the discrete-cast chain; lightningChains stays for any legacy
        // entry points but is unused by the live beam path).
        this.lightningChains = [];
        this.lightningArcActive = false;
        this.lightningArcTimer = 0;
        this.lightningArcTarget = null;

        // Missile state
        this.activeMissiles = [];

        // ── New power-weapon + ability state (brainstorm drop) ──
        this.singularities = [];      // SINGULARITY gravity wells
        this.orbitalStrikes = [];     // ORBITAL_STRIKE telegraph markers
        this.cryoRings = [];          // CRYO_BURST frost rings
        this.prismBeams = [];         // PRISM_BEAM ray fan {angle, color}
        this.prismActive = false;
        this.prismTimer = 0;
        this.prismAngle = 0;
        this.overdriveTimer = 0;      // OVERDRIVE primary buff (ms remaining)
        this.sentryDrones = [];       // SENTRY_DRONE defense ability

        // Rail driver state
        this.lastPrimaryFireTime = 0; // for Railgun Capacitor upgrade

        // Storm needles counter
        this.needleCount = 0;

        // Scatter gun shot counter
        this.scatterShotCount = 0;

        // HEAT_SINK keystone — sustained-fire heat accumulator (0..HEAT_SINK_MAX).
        // Climbs as primaries fire while HEAT_SINK is held, vents + resets at max,
        // and decays when not firing (see player.update). Inert without the passive.
        this.heat = 0;

        // Deflector orbs state
        this.deflectorOrbs = [];

        // EMP pulse visual state (set on EMP_PULSE activation).
        this.empPulseActive = false;
        this.empPulseStartTime = 0;

        // Dash state (5.93.0 — was PHASE_DASH defense ability, now a
        // SHIFT-key core movement primitive).
        //   isDashing      — true during the active dash burst; doubles as
        //                    the i-frame signal (see isDashIFrameActive()).
        //   dashTimer      — ms remaining in the current dash burst.
        //   dashVelX/VelY  — fixed-velocity vector for the dash (px/sec);
        //                    integrated each frame in abilities.updateActiveAbilities.
        //   dashCooldown   — ms until the next dash can be triggered; decays
        //                    each frame in updateAbilityCooldowns.
        this.isDashing = false;
        this.dashTimer = 0;
        this.dashVelX = 0;
        this.dashVelY = 0;
        this.dashCooldown = 0;
        // P6 Afterimage — fading "clone" left at the dash origin ({x,y,angle,t,t0}
        // or null). Ticked in abilities.updateActiveAbilities, drawn world-space.
        this._afterimageGhost = null;

        // Bulwark state
        this.bulwarkActive = false;

        // Repair nanites state
        this.regenActive = false;
        this.regenTimer = 0;

        // EMP state
        this.empActive = false;

        // Tractor shield state
        this.tractorShieldActive = false;
        this.tractorShieldAngle = 0;

        // 6.0.0 — equippedItems table extended to 5 slots. The new
        // `trinket` slot rolls a regen primary (HP/s) — see
        // item-system.js for the rolled-rarity primary-stat curve.
        // New pickups call `equipItem` below which replaces only when
        // the candidate's score (primary + 8× regen affix) beats the
        // currently-equipped item's score.
        this.equippedItems = {
            cockpit: null, hull: null, shielding: null, chassis: null, nanites: null,
        };
        // 6.x — Left-edge loot feed. Recent item drops (newest first),
        // capped; rendered as cards on the left HUD edge. Replaces the
        // world-space stat-pickup orbs — drops register directly here and
        // auto-equip if they beat the slot (see registerItemDrop).
        this.lootFeed = [];
        this._lootFeedSeq = 0;
        // Phase R8.1/R8.4 — every item collected THIS run (uncapped, unlike
        // the 7-entry lootFeed). Committed to the persistent meta stash at
        // run end (game-engine.commitRunLootToStash).
        this.runCollected = [];

        this.initializePlayer();
    }
    
    // Helper method to initialize/reset player properties
    initializePlayer() {
        // Initialize at center of game field (will be updated by game engine)
        this.x = this.width / 2;
        this.y = this.height / 2;
        this.lastX = this.x;
        this.lastY = this.y;
        this.vel = { x: 0, y: 0 };
        this.angle = -Math.PI / 2;
        this.isThrusting = false;
        this.active = true;
        this.canShoot = true;
        this.thrustersDisabled = false;
        this.invincible = false;
        this.invincibilityTimer = 0;
        this.firingDisabled = false;
        // A.E9-S1 — player-side elemental status timers (chill/corrode).
        initPlayerStatus(this);
        // 5.88.0 — `justRespawned` retired with the respawn system; tank
        // consumption (lifecycle._consumeTank) refills HP in place with no
        // post-hit invuln window, so there's nothing to flag here.
        this.levelUpAnimation = { active: false };
        
        // Reset auto-fire timer
        this.autoFireTimer = 0;
        this.lastShotTime = 0; // Fire immediately on respawn
        
        // Wave bonus shield system removed
        
        // Reset powerups
        this.powerups.clear();

        // Reset weapon active states (keep owned weapons/abilities)
        this.energy = 0; // 6.29.0 — start each run with an empty energy meter
        this.powerCooldown = 0;
        this.beamActive = false;
        this.beamTimer = 0;
        this.beamHitDist = 0;
        // 6.55.0 — Cluster Launcher hold-to-charge state.
        this._clusterCharging = false;
        this.clusterChargeFrac = 0;
        this._clusterFireWasHeld = false;
        this._clusterChargeStart = 0;
        this.activeMines = [];
        this.novaRings = [];
        this.lightningChains = [];
        this.lightningArcActive = false;
        this.lightningArcTimer = 0;
        this.lightningArcTarget = null;
        this.activeMissiles = [];
        this.singularities = [];
        this.orbitalStrikes = [];
        this.cryoRings = [];
        this.prismBeams = [];
        this.prismActive = false;
        this.prismTimer = 0;
        this.prismAngle = 0;
        this.overdriveTimer = 0;
        this.sentryDrones = [];
        this.needleCount = 0;
        this.scatterShotCount = 0;
        this.heat = 0; // HEAT_SINK — reset sustained-fire heat per run
        this.lastPrimaryFireTime = 0;
        // Phase B.S1 — reset per-slot cooldowns (keep equipped abilities, like
        // owned weapons). Writing via the arrays keeps the legacy
        // activeAbilityCooldown / activeAbilityCooldownMax accessors in sync
        // (they proxy slot 0). Guard for the case initializePlayer runs
        // before the constructor has built the arrays.
        if (this.abilityCooldowns) this.abilityCooldowns.fill(0);
        if (this.abilityCooldownsMax) this.abilityCooldownsMax.fill(0);
        this.activeAbilityEffects = new Map();
        this.deflectorOrbs = [];
        this.isDashing = false;
        this.dashTimer = 0;
        this.dashCooldown = 0;
        this._afterimageGhost = null;
        this.bulwarkActive = false;
        this.regenActive = false;
        this.regenTimer = 0;
        this.empActive = false;
        this.tractorShieldActive = false;

        // CD-10 — Bloodshield buffer (temporary damage-soak fed by heal-overflow
        // when the BLOODSHIELD passive is equipped). Reset to empty on spawn /
        // run-start so a fresh run starts with no cushion. Default-safe: 0 buffer
        // means the soak in lifecycle.takeDamage is a no-op.
        this.bloodshield = 0;
        this._bloodshieldRefreshMs = 0;

        // CD-11 — Bloodlust stacks (on-kill outgoing-damage buff when the
        // BLOODLUST passive is equipped). Reset to 0 on spawn / run-start so a
        // fresh run starts with no buff. Default-safe: 0 stacks means the
        // bloodlustMult at the damage hook is a no-op (×1).
        this.bloodlustStacks = 0;
        this._bloodlustRefreshMs = 0;

        // CD-04 — Ablative Plating charge. While the ABLATIVE_PLATING powerup is
        // held, the first damaging hit each wave is fully blocked, then the plate
        // is spent until the next wave recharges it (wave-manager.spawnWaveEntities).
        // Default ready on spawn / run-start so the very first wave is covered.
        // Default-safe: the gate in lifecycle.takeDamage also requires the powerup
        // to be held, so this flag is inert without it.
        this._ablativeReady = true;

        // SURGE_BATTERY — while the powerup is held, the first power weapon each
        // wave costs 0 energy. Ready on spawn / run-start so the very first wave's
        // first cast is free; spent (flipped false) by weapons.firePower and
        // recharged at wave start (wave-manager.spawnWaveEntities). Default-safe:
        // the gate in firePower also requires the powerup, so this flag is inert
        // without it.
        this._surgeBatteryReady = true;

        // FLUX — while the powerup is held, each power cast adds a stacking
        // +energy-regen buff that fades when casting stops. _fluxStacks is the
        // current stack count (0..FLUX_MAX_STACKS); _fluxRefreshMs is the clock of
        // the last cast. Reset to 0 on spawn / run-start so a fresh run has no ramp.
        // Default-safe: 0 stacks → getEffectiveEnergyRegenMult adds +0.
        this._fluxStacks = 0;
        this._fluxRefreshMs = 0;

        // OVERCLOCK — while the keystone is held, power weapons ignore the energy
        // meter and fire on a flat internal cooldown instead. _overclockCdUntil is
        // the frameClock timestamp the next power cast is allowed at (the SOLE
        // gate under Overclock). Reset to 0 on spawn / run-start so the first cast
        // is immediately ready. Default-safe: 0 with no passive → never consulted.
        this._overclockCdUntil = 0;

        let scale = 1;
        this.radius = (GAME_CONFIG.SHIP_SIZE * scale) / 2;
        // Player mass (smaller than most asteroids)
        this.mass = Math.PI * Math.pow(this.radius, 2) * 0.5;
    }
    
    reset() {
        this.initializePlayer();
    }
    
    /**
     * 6.0.0 — Equip if the candidate's unified score beats the current
     * slot's score. Score normalizes HP / toughness / regen against
     * each other so e.g. an item with high regen affix can edge a
     * slightly-higher-HP item. See `scoreItem` in item-system.js.
     *
     * Returns:
     *   { equipped: true,  replaced: prevItemOrNull }  on successful equip
     *   { equipped: false, current: currentItem }      when not an upgrade
     *
     * Side effects on equip:
     *   - HP items grow getEffectiveMaxHealth → bump current health by
     *     the bonus delta so the wider bar isn't visibly empty.
     */
    // Phase R8.2 — drops NO LONGER auto-equip. Gear is chosen pre-run in the
    // ARMORY inventory screen and locked for the run; mid-run pickups just
    // accrue to the loot feed (display) + the run collection, which is
    // committed to the persistent stash at run end. Returns the feed entry.
    registerItemDrop(item) {
        if (!item || !item.slot) return null;
        if (!this.lootFeed) this.lootFeed = [];
        const entry = {
            id: ++this._lootFeedSeq,
            item,
            equipped: false, // never auto-equipped (R8.2)
            born: (typeof performance !== 'undefined' ? performance.now() : Date.now()),
        };
        this.lootFeed.unshift(entry);
        const MAX_FEED = 7;
        if (this.lootFeed.length > MAX_FEED) this.lootFeed.length = MAX_FEED;
        // Phase R8.1 — keep the full run collection for the run-end stash
        // commit (the lootFeed above is display-only and capped).
        if (!this.runCollected) this.runCollected = [];
        this.runCollected.push(item);
        // 6.226.0 — loot is yours the moment you grab it: mark the account
        // dirty so the coalesced flush commits it to the persistent stash
        // within ~1s, surviving a mid-run close even before run-end.
        this.gameEngine?.markMetaDirty?.();
        return entry;
    }

    equipItem(item, opts = {}) {
        if (!item || !item.slot) return { equipped: false, current: null };
        if (!this.equippedItems) {
            this.equippedItems = {
                cockpit: null, hull: null, shielding: null, chassis: null, nanites: null,
            };
        }
        const prev = this.equippedItems[item.slot] || null;
        // `force` (manual re-equip from the 'I' inventory) bypasses the
        // equip-if-better gate so the player can deliberately choose a
        // lower-scored item. Auto-equip from drops omits force.
        if (!opts.force && prev && scoreItem(item) <= scoreItem(prev)) {
            return { equipped: false, current: prev };
        }
        if (prev === item) return { equipped: false, current: prev };
        // 6.32.0 — items are multi-affix now. Bump current HP by the net
        // max-HP gain (new item's hp affixes minus the replaced item's)
        // so equipping an HP roll heals the delta, like before.
        const affixHp = (it) => (it && Array.isArray(it.affixes))
            ? it.affixes.filter((a) => a.type === 'hp').reduce((s, a) => s + a.value, 0)
            : 0;
        const hpGain = affixHp(item) - affixHp(prev);
        this.equippedItems[item.slot] = item;
        if (hpGain > 0) {
            const newMax = this.getEffectiveMaxHealth();
            this.health = Math.min(newMax, this.health + hpGain);
        }
        // 6.226.0 — persist the equip swap (equippedItems live in the profile).
        this.gameEngine?.markMetaDirty?.();
        return { equipped: true, replaced: prev };
    }

    gainExperience(amount) {
        return progression.gainExperience.call(this, amount);
    }

    levelUp() {
        return progression.levelUp.call(this);
    }

    grantLevelUpBonus() {
        return progression.grantLevelUpBonus.call(this);
    }

    updateTempBonuses() {
        return progression.updateTempBonuses.call(this);
    }

    triggerLevelUpEffects() {
        return progression.triggerLevelUpEffects.call(this);
    }

    createLevelUpParticles() {
        return progression.createLevelUpParticles.call(this);
    }

    getExperienceProgress() {
        return progression.getExperienceProgress.call(this);
    }
    
    updateChargingSystem(input, bulletPool, audioManager, particlePool) {
        return weapons.updateChargingSystem.call(this, input, bulletPool, audioManager, particlePool);
    }

    firePrimary(bulletPool, audioManager, particlePool) {
        return weapons.firePrimary.call(this, bulletPool, audioManager, particlePool);
    }

    firePulseCannon(bulletPool, audioManager, config) {
        return weapons.firePulseCannon.call(this, bulletPool, audioManager, config);
    }

    fireStormNeedles(bulletPool, audioManager, config) {
        return weapons.fireStormNeedles.call(this, bulletPool, audioManager, config);
    }

    fireScatterGun(bulletPool, audioManager, config) {
        return weapons.fireScatterGun.call(this, bulletPool, audioManager, config);
    }

    fireRailDriver(bulletPool, audioManager, config) {
        return weapons.fireRailDriver.call(this, bulletPool, audioManager, config);
    }

    fireCluster(bulletPool, audioManager, config, chargeFrac = 1) {
        return weapons.fireCluster.call(this, bulletPool, audioManager, config, chargeFrac);
    }

    fireSplitter(bulletPool, audioManager, config) {
        return weapons.fireSplitter.call(this, bulletPool, audioManager, config);
    }

    fireRicochet(bulletPool, audioManager, config) {
        return weapons.fireRicochet.call(this, bulletPool, audioManager, config);
    }

    fireBoomerang(bulletPool, audioManager, config) {
        return weapons.fireBoomerang.call(this, bulletPool, audioManager, config);
    }

    fireSpinCannon(bulletPool, audioManager, config) {
        return weapons.fireSpinCannon.call(this, bulletPool, audioManager, config);
    }

    fireFlak(bulletPool, audioManager, config) {
        return weapons.fireFlak.call(this, bulletPool, audioManager, config);
    }

    fireGravityLance(bulletPool, audioManager, config) {
        return weapons.fireGravityLance.call(this, bulletPool, audioManager, config);
    }

    startLanceBeam(audioManager, config) {
        return weapons.startLanceBeam.call(this, audioManager, config);
    }

    applyGlobalBulletUpgrades(bullet) {
        return weapons.applyGlobalBulletUpgrades.call(this, bullet);
    }

    // ── Weapon bindings ──
    getBulletVelocityDamageMult(id)     { return weapons.getBulletVelocityDamageMult.call(this, id); }

    firePower(bulletPool, audioManager, particlePool) {
        return weapons.firePower.call(this, bulletPool, audioManager, particlePool);
    }

    layMine(config) {
        return weapons.layMine.call(this, config);
    }

    fireNova(config) {
        return weapons.fireNova.call(this, config);
    }

    fireLightning(config) {
        return weapons.fireLightning.call(this, config);
    }

    fireMissiles(bulletPool, config) {
        return weapons.fireMissiles.call(this, bulletPool, config);
    }

    fireSingularity(config) {
        return weapons.fireSingularity.call(this, config);
    }

    fireCryoBurst(config) {
        return weapons.fireCryoBurst.call(this, config);
    }

    fireOrbitalStrike(config) {
        return weapons.fireOrbitalStrike.call(this, config);
    }

    firePrismBeam(audioManager, config) {
        return weapons.firePrismBeam.call(this, audioManager, config);
    }

    activateOverdrive(config) {
        return weapons.activateOverdrive.call(this, config);
    }

    pauseChargeShot() {
        return weapons.pauseChargeShot.call(this);
    }

    resumeChargeShot() {
        return weapons.resumeChargeShot.call(this);
    }

    createChargingParticleEffects(particlePool, currentChargeTime, maxChargeTime) {
        return weapons.createChargingParticleEffects.call(this, particlePool, currentChargeTime, maxChargeTime);
    }

    startNewShot(bulletCount = 1) {
        return weapons.startNewShot.call(this, bulletCount);
    }

    registerHit() {
        return weapons.registerHit.call(this);
    }

    onBulletDestroyed() {
        return weapons.onBulletDestroyed.call(this);
    }

    finalizeShotResult() {
        return weapons.finalizeShotResult.call(this);
    }

    getHitStreakMultiplier() {
        return weapons.getHitStreakMultiplier.call(this);
    }

    fireChargedShot(bulletPool, audioManager) {
        return weapons.fireChargedShot.call(this, bulletPool, audioManager);
    }

    disableThrusters(duration) {
        this.thrustersDisabled = true;
        setTimeout(() => {
            this.thrustersDisabled = false;
        }, duration);
    }
    
    makeInvincible(duration) {
        this.invincible = true;
        this.invincibilityTimer = duration;
    }
    
    update(input, particlePool, bulletPool, audioManager, starPool, tractorEngaged, gameField = null) {
        if (!this.active) return;

        // Store previous position to track movement
        const prevX = this.x;
        const prevY = this.y;

        // Update invincibility timer (still used by deliberate-save abilities:
        // REFLEXES, LAST_STAND, plus the wave-start grace window). The
        // SHIFT-key dash i-frames live on `isDashing` / `dashTimer` and
        // are checked via `isDashIFrameActive()` at the collision sites
        // — they don't go through invincibilityTimer.
        if (this.invincibilityTimer > 0) {
            this.invincibilityTimer -= GAME_CONFIG.LOGIC_TICK_MS;
            if (this.invincibilityTimer <= 0) {
                this.invincible = false;
                this.invincibilityTimer = 0;
                this.firingDisabled = false;
            }
        }

        // 6.0.1 — updateTempBonuses() + levelUpAnimation tick removed.
        // Both were no-op since 6.0.0 (the temp-bonus list never gets
        // populated and the animation flag never gets set).

        // Update powerups
        this.updatePowerups();

        // ── Aim resolution (5.74) ──
        // Priority: Auto Aim > Arrow-key rotation > Aim Assist (cursor snap) > Mouse.
        const ge = window.gameEngine;
        // 6.195.0 — Auto Fire owns primary fire only. Smart power timing
        // is supplied by the Assist System so energy is not spent bluntly.
        // The TOUCH control scheme FORCES autoAim+autoFire (no toggle) so
        // the player only has to dodge; auto-aim picks targets, auto-fire
        // hammers them, and tapping the canvas triggers a DASH (see
        // mobile-touch.js). The GAMEPAD and KEYBOARD schemes instead let
        // the player choose their own assists (default off) via the ASSISTS
        // tab, so twin-stick / mouse aiming stays manual. controlScheme
        // resolves to 'touch' only on mobile without (or opting out of) a
        // connected gamepad.
        let assists;
        const scheme = (ge && ge.controlScheme) ? ge.controlScheme : (isMobile() ? 'touch' : 'keyboard');
        if (scheme === 'touch') {
            assists = { autoAim: true, autoFire: true, autoPower: false, aimAssist: false };
        } else {
            assists = (ge && ge.assists) ? ge.assists : null;
        }

        // Auto Aim — lock onto nearest threat. Overrides everything below.
        // GP-2: R3 soft-lock (input.lockOn, held) snaps aim to the nearest
        // threat too, even when the Auto Aim toggle is off — movement stays
        // independent so the player keeps steering while locked.
        let autoAimed = false;
        if (((assists && assists.autoAim) || input.lockOn) && ge && ge.findNearestTarget) {
            const target = ge.findNearestTarget(this.x, this.y);
            if (target) {
                input.aimX = target.x;
                input.aimY = target.y;
                autoAimed = true;
            }
        }

        // Gamepad right-stick aim (twin-stick). The stick's direction IS
        // the facing; when held, aim points exactly where the stick points.
        // Highest manual priority (below auto-aim). On mobile, where there's
        // no mouse, the facing is HELD when the stick is released so the
        // ship doesn't snap back to a stale world point.
        const aimStick = input.aimStick;
        const gpAiming = !!(input.gamepadActive && aimStick && aimStick.magnitude > 0.02);
        if (!autoAimed && gpAiming) {
            this._aimAngle = Math.atan2(aimStick.y, aimStick.x);
            const range = 1000;
            input.aimX = this.x + Math.cos(this._aimAngle) * range;
            input.aimY = this.y + Math.sin(this._aimAngle) * range;
        } else if (!autoAimed && input.gamepadActive && isMobile()) {
            if (typeof this._aimAngle !== 'number') this._aimAngle = this.angle;
            const range = 1000;
            input.aimX = this.x + Math.cos(this._aimAngle) * range;
            input.aimY = this.y + Math.sin(this._aimAngle) * range;
        }
        // Arrow-key rotation — hold ←/→ to spin the aim. Constant rate
        // independent of mouse position. Skipped when auto-aim is active.
        else if (!autoAimed && (input.rotateLeft || input.rotateRight)) {
            const rotSpeed = 0.06; // ~3.5°/tick @ 60Hz → 210°/s
            if (typeof this._aimAngle !== 'number') this._aimAngle = this.angle;
            if (input.rotateLeft) this._aimAngle -= rotSpeed;
            if (input.rotateRight) this._aimAngle += rotSpeed;
            const range = 1000;
            input.aimX = this.x + Math.cos(this._aimAngle) * range;
            input.aimY = this.y + Math.sin(this._aimAngle) * range;
        } else if (!autoAimed && assists && assists.aimAssist && ge && ge.findNearestTarget) {
            // Aim Assist — when the cursor is close to a threat, snap to it.
            // Snap radius is generous (90px) so light corrections feel sticky.
            const snap = ge.findNearestTarget(input.aimX, input.aimY, 90);
            if (snap) {
                input.aimX = snap.x;
                input.aimY = snap.y;
            }
            // Keep _aimAngle in sync with mouse so a later arrow-press resumes smoothly.
            this._aimAngle = Math.atan2(input.aimY - this.y, input.aimX - this.x);
        } else if (!autoAimed) {
            this._aimAngle = Math.atan2(input.aimY - this.y, input.aimX - this.x);
        }

        // ── Aim angle (computed by the ship physics step below) ──
        // The original code set `this.angle = atan2(aimY - x, aimX - x)`
        // here, *before* the auto-fire check that reads `this.angle`.
        // We compute the same value early so auto-fire still sees the
        // correct angle, then the physics call below sets it again
        // (idempotently, since position hasn't changed yet).
        this.angle = Math.atan2(input.aimY - this.y, input.aimX - this.x);

        // Auto Fire — only triggers when there's actually a destructible
        // target within weapon range AND roughly in line with the current
        // aim. Holding fire when nothing's hittable wastes ammo (visually,
        // and for charged weapons it interrupts charging) and feels noisy.
        //
        // 6.195.0 — Auto Fire drives primary fire. Mobile forces this true so the
        // player only has to dodge; auto-aim picks targets, auto-fire
        // hammers them, smart power comes from AssistSystem, and tapping
        // the canvas triggers a dash.
        if (assists && assists.autoFire) {
            const primaryCfg = this.getActivePrimaryConfig && this.getActivePrimaryConfig();
            const baseRange = primaryCfg ? (primaryCfg.range || 1) * 2000 : 2000;
            const rangeMult = this.getRangeMultiplier ? this.getRangeMultiplier() : 1;
            const maxRange = baseRange * rangeMult;
            const cone = 25 * Math.PI / 180;
            let canHit = false;
            if (ge && ge.findNearestTarget) {
                const t = ge.findNearestTarget(this.x, this.y, maxRange);
                if (t) {
                    const aimDx = Math.cos(this.angle);
                    const aimDy = Math.sin(this.angle);
                    const tDx = t.x - this.x;
                    const tDy = t.y - this.y;
                    const tLen = Math.hypot(tDx, tDy) || 1;
                    const dot = (aimDx * tDx + aimDy * tDy) / tLen; // cosθ
                    if (dot >= Math.cos(cone)) canHit = true;
                }
            }
            if (canHit) {
                input.fire = true;
                // 6.1.1 — Power weapon auto-fire is now part of the same
                // autoFire toggle. Charge-based powers fire on full
                // charge; cooldown-based powers fire as soon as they're
                // ready and a valid target is acquired.
                // Unified energy-gated model (incl. CHARGE_SHOT): auto-fire
                // the power weapon as soon as enough energy is banked.
                const pcfg = this.getActivePowerConfig && this.getActivePowerConfig();
                if (assists.autoPower === true && pcfg && this.isPowerReady && this.isPowerReady()) {
                    input.fireSecondary = true;
                }
            }
        }

        // Debug player aiming occasionally
        if (Math.random() < 0.01) { // 1% chance
        }

        this.isMoving = input.up || input.down || input.left || input.right;

        // ── Thrust juice: ramp thrustLevel and detect startup ──
        // FX-side state, not physics. Stays on Player.
        const now = Date.now();
        if (this.isMoving && !this.thrustersDisabled) {
            // Detect idle→thrust transition (startup shudder)
            if (!this.wasThrusting && (now - this.lastThrustTime > 1200)) {
                this.engineStartup = 1.0; // trigger startup shudder
            }
            this.lastThrustTime = now;
            this.thrustLevel = Math.min(1, this.thrustLevel + 0.08); // ramp up over ~12 frames
        } else {
            this.thrustLevel = Math.max(0, this.thrustLevel - 0.03); // slow decay over ~33 frames
        }
        this.wasThrusting = this.isMoving && !this.thrustersDisabled;

        // Decay startup shudder — fast punch, not a slow wobble
        if (this.engineStartup > 0) {
            this.engineStartup = Math.max(0, this.engineStartup - 0.06); // ~17 frames ≈ 0.28s
        }

        // ── FX particle effects (must run BEFORE physics) ──
        // These read this.x / this.y, which the physics step below
        // mutates. The original update() emitted these particles between
        // the velocity-integration step and the friction step, so
        // this.x / this.y are the pre-position-update values at this point.

        // Spawn particles during invulnerability (renamed from tractor beam)
        if (this.invincible && Math.random() < 0.3) {
            // Spawn fewer particles less frequently
            const angle = Math.random() * Math.PI * 2;
            const dist = 60 + Math.random() * 40;
            const px = this.x + Math.cos(angle) * dist;
            const py = this.y + Math.sin(angle) * dist;
            particlePool.get(px, py, 'spawnParticle', this.x, this.y, this);
        }

        // Shield boost visual effect - green shimmer around player
        const shieldBoostStacks = this.getPowerupStacks('SHIELD_BOOST');
        if (shieldBoostStacks > 0 && Math.random() < 0.3) {
            const particle = particlePool.get(this.x, this.y, 'starSparkle');
            if (particle) {
                particle.color = '#00ff88'; // Green color matching shield boost
                const angle = random(0, Math.PI * 2);
                const distance = random(20, 35);
                particle.x = this.x + Math.cos(angle) * distance;
                particle.y = this.y + Math.sin(angle) * distance;
                particle.vel.x = Math.cos(angle) * 0.3;
                particle.vel.y = Math.sin(angle) * 0.3;
                particle.life = 30; // Short lived for subtle effect
            }
        }

        // ── Physics step ──
        // Velocity integration → friction → snap-to-zero → max-speed clamp
        // → position update → boundary bounce. Aim angle is set above
        // (line ~535) before the auto-fire check, so we don't re-set it
        // here. Mobile stick overrides velocity + position in the next
        // block.
        const _mobile = isMobile();
        // Analog velocity model gate. Mobile always uses it (touch stick);
        // desktop uses it only while a gamepad's left stick is actually
        // deflected, so keyboard thrust still works the rest of the time.
        const gpMoveActive = !!(input.gamepadActive && input.stickInput && input.stickInput.magnitude > 0);
        const useStickVel = _mobile || gpMoveActive;
        if (this.active) {
            const speedMult = this.getMovementSpeedMultiplier();

            // Velocity integration — WASD direction → moveAngle → per-tick
            // velocity delta scaled by thrustPower * speedMult. Stick-driven
            // movement (mobile touch / gamepad) comes from the analog block
            // below instead, so we zero out the keyboard contribution there.
            const isMoving = !useStickVel && (input.up || input.down || input.left || input.right);
            if (isMoving && !this.thrustersDisabled) {
                let moveX = 0;
                let moveY = 0;
                if (input.left)  moveX -= 1;
                if (input.right) moveX += 1;
                if (input.up)    moveY -= 1;
                if (input.down)  moveY += 1;
                const moveAngle = Math.atan2(moveY, moveX);
                const thrustForce = this.thrustPower * speedMult;
                this.vel.x += Math.cos(moveAngle) * thrustForce;
                this.vel.y += Math.sin(moveAngle) * thrustForce;
            }

            // Friction — Math.pow(0.50, TICK_SCALE) per tick.
            const friction = Math.pow(0.50, GAME_CONFIG.TICK_SCALE);
            this.vel.x *= friction;
            this.vel.y *= friction;

            // Snap to zero (prevents subpixel drift after key release).
            if (Math.abs(this.vel.x) < 0.05) this.vel.x = 0;
            if (Math.abs(this.vel.y) < 0.05) this.vel.y = 0;

            // Max-speed clamp — speed boost only contributes 70% of its
            // multiplier to the cap, so upgrades feel powerful without
            // trivializing positioning.
            const effectiveMaxV = GAME_CONFIG.MAX_V * (1 + (speedMult - 1) * 0.7);
            const mag = Math.hypot(this.vel.x, this.vel.y);
            if (mag > effectiveMaxV) {
                this.vel.x = (this.vel.x / mag) * effectiveMaxV;
                this.vel.y = (this.vel.y / mag) * effectiveMaxV;
            }

            // Position update.
            this.x += this.vel.x;
            this.y += this.vel.y;

            // Boundary bounce (damped 0.8 to avoid perpetual edge-rebound).
            if (gameField) {
                const r = this.radius;
                if (this.x - r < 0) {
                    this.x = r;
                    this.vel.x = Math.abs(this.vel.x) * 0.8;
                } else if (this.x + r > gameField.width) {
                    this.x = gameField.width - r;
                    this.vel.x = -Math.abs(this.vel.x) * 0.8;
                }
                if (this.y - r < 0) {
                    this.y = r;
                    this.vel.y = Math.abs(this.vel.y) * 0.8;
                } else if (this.y + r > gameField.height) {
                    this.y = gameField.height - r;
                    this.vel.y = -Math.abs(this.vel.y) * 0.8;
                }
            }
        }

        // 5.100.0 — Mobile drag-to-move (Sky-force-style). Reverses
        // the 5.94 stationary-ship pivot. Reads the virtual analog
        // stick's normalized vector from `input.stickInput` (set each
        // frame by mobile-touch.js) and overrides the physics step's
        // velocity with a lerp toward (stick × MAX_V × mult).
        //
        // Override happens AFTER the physics step so friction snap-to-zero
        // still runs. Position is reset to prevX + new vel so the player's
        // actual movement comes from the stick alone.
        if (useStickVel) {
            const stickIn = (input && input.stickInput) || { x: 0, y: 0, magnitude: 0 };
            const speedMult = this.getMovementSpeedMultiplier();
            // Mobile gets a 1.5× cap boost to compensate for touch-stick
            // imprecision; gamepad-on-desktop matches the keyboard cap (1×).
            const MAX_V_MOBILE = GAME_CONFIG.MAX_V * (_mobile ? 1.5 : 1.0) * speedMult;
            const targetVx = stickIn.x * MAX_V_MOBILE;
            const targetVy = stickIn.y * MAX_V_MOBILE;
            // Smooth lerp — 0.22 / frame ≈ 70% in 90 ms (responsive
            // without feeling snappy/twitchy).
            const LERP = 0.22;
            this.vel.x += (targetVx - this.vel.x) * LERP;
            this.vel.y += (targetVy - this.vel.y) * LERP;
            // Decay residue when stick is released (helps the ship
            // come to rest crisply instead of drifting).
            if (stickIn.magnitude < 0.05) {
                this.vel.x *= 0.82;
                this.vel.y *= 0.82;
                if (Math.abs(this.vel.x) < 0.05) this.vel.x = 0;
                if (Math.abs(this.vel.y) < 0.05) this.vel.y = 0;
            }
            // Apply movement from prevX/Y so the physics step's
            // position update doesn't double up.
            this.x = prevX + this.vel.x;
            this.y = prevY + this.vel.y;
            // Clamp to the game field bounds so the ship can't escape.
            if (gameField) {
                const padX = this.radius || 12;
                const padY = this.radius || 12;
                const minX = (gameField.x || 0) + padX;
                const maxX = (gameField.x || 0) + gameField.width - padX;
                const minY = (gameField.y || 0) + padY;
                const maxY = (gameField.y || 0) + gameField.height - padY;
                if (this.x < minX) { this.x = minX; this.vel.x = 0; }
                if (this.x > maxX) { this.x = maxX; this.vel.x = 0; }
                if (this.y < minY) { this.y = minY; this.vel.y = 0; }
                if (this.y > maxY) { this.y = maxY; this.vel.y = 0; }
            }
        }

        // Legacy fallback: if no gameField was provided, apply torus
        // wraparound. Both live call sites in game-engine.js pass
        // gameField, so this branch is effectively dead — kept for
        // robustness against off-engine call sites.
        if (!gameField) {
            wrap(this, this.width, this.height);
        }

        // Calculate movement delta and update aim coordinates if player moved.
        const deltaX = this.x - prevX;
        const deltaY = this.y - prevY;
        if ((deltaX !== 0 || deltaY !== 0) && input.updateAimForPlayerMovement) {
            input.updateAimForPlayerMovement(deltaX, deltaY);
        }

        // ── Living-ship articulation (visual only; read by renderer.draw) ──
        // Bank into lateral motion + aim swings like a bird leaning through a
        // turn; sweep the wings back as speed/thrust rises like a fish
        // streamlining; fan the S-foils with thrust; and keep a slow idle
        // "breathing" phase so the ship is never visually dead at rest.
        {
            const maxV = GAME_CONFIG.MAX_V || 3.5;
            const fx = Math.cos(this.angle), fy = Math.sin(this.angle);
            // Lateral (right-perpendicular) velocity component, normalized.
            const lateral = (this.vel.x * -fy + this.vel.y * fx) / maxV;
            // Aim swing this frame, wrapped to [-PI, PI].
            let dAim = this.angle - this._prevAimAngle;
            if (dAim > Math.PI) dAim -= Math.PI * 2;
            else if (dAim < -Math.PI) dAim += Math.PI * 2;
            this._prevAimAngle = this.angle;
            const bankTarget = Math.max(-1, Math.min(1, lateral * 0.9 + dAim * 2.2));
            this.bank += (bankTarget - this.bank) * 0.18;

            const speed = Math.hypot(this.vel.x, this.vel.y) / maxV;
            const sweepTarget = Math.min(1, speed * 0.7 + this.thrustLevel * 0.55);
            this.wingSweep += (sweepTarget - this.wingSweep) * 0.12;
            this.flapOpen += (this.thrustLevel - this.flapOpen) * 0.1;
            this.glidePhase += 0.045;
        }

        // ── Power energy: passive regen over time (empty → full in ~12s) ──
        // Replaces the old per-hit energy gain: energy is now a continuously
        // recharging resource. As it fills, the ship visibly "charges up"
        // (body glow + nose ring), and power weapons fire by spending it.
        {
            const eNow = Date.now();
            const dtMs = Math.min(250, eNow - (this._lastEnergyTime || eNow)); // clamp pause/tab gaps
            this._lastEnergyTime = eNow;
            if (!this.chargePaused && dtMs > 0) {
                const ENERGY_FILL_MS = 12000;  // empty → full in 12 seconds
                // CD: CAPACITOR raises the cap, REACTOR scales the fill rate.
                // Default-safe: 0 SP → maxE = this.maxEnergy, regenMult = 1.
                const maxE = this.getEffectiveMaxEnergy();
                const regenMult = this.getEffectiveEnergyRegenMult();
                // CAPACITOR_BANK — clamp to the OVERCHARGE cap (×1.5 with the
                // passive, == maxE without it) so the meter can climb past the
                // normal cap ONLY while held. The regen rate itself is computed
                // off maxE (unchanged); only the ceiling moves. Default-safe:
                // no passive → cap == maxE → byte-for-byte the old clamp.
                const energyCap = this.getEnergyOverchargeCap();
                this.energy = Math.min(energyCap, (this.energy || 0) + maxE * regenMult * dtMs / ENERGY_FILL_MS);
            }
            // 6.x — Debug: infinite energy keeps the power meter topped off.
            if (debugState.infiniteEnergy) this.energy = this.getEnergyOverchargeCap();

            // P6 — Siege passive: ramp damage while ~stationary, decay it while
            // moving. Reuses the energy block's clamped real-time delta (dtMs).
            // Only ticks when equipped so non-Siege players keep _siegeRamp = 0.
            if (typeof this.hasPassive === 'function' && this.hasPassive('SIEGE')) {
                const _spd = Math.hypot(this.vel?.x || 0, this.vel?.y || 0);
                this._siegeRamp = siegeRampStep(this._siegeRamp, _spd > SIEGE_MOVE_SPEED, dtMs);
            } else if (this._siegeRamp) {
                this._siegeRamp = 0;
            }

            // CD-10 — Bloodshield buffer decay. The banked shield fades when it
            // hasn't been topped up recently (BLOODSHIELD_DECAY_DELAY_MS grace),
            // floored at 0. Gated on a non-empty buffer so a player with 0
            // bloodshield (or no passive) does zero extra work — default-safe.
            if (this.bloodshield > 0) {
                const sinceRefresh = eNow - (this._bloodshieldRefreshMs || 0);
                if (sinceRefresh >= BLOODSHIELD_DECAY_DELAY_MS && dtMs > 0) {
                    this.bloodshield = Math.max(0, this.bloodshield - BLOODSHIELD_DECAY_PER_SEC * dtMs / 1000);
                }
            }

            // CD-11 — Bloodlust stack decay. Lose one stack per BLOODLUST_DECAY_MS
            // elapsed since the last kill, draining toward 0; each shed advances
            // the timestamp by one interval so a long frame gap can shed more than
            // one but never over-drains. Gated on a non-zero stack count so a
            // player with 0 stacks (or no passive) does zero work — default-safe.
            if (this.bloodlustStacks > 0 && dtMs > 0) {
                let last = this._bloodlustRefreshMs || 0;
                while (this.bloodlustStacks > 0 && eNow - last >= BLOODLUST_DECAY_MS) {
                    this.bloodlustStacks--;
                    last += BLOODLUST_DECAY_MS;
                }
                this._bloodlustRefreshMs = last;
            }

            // FLUX — energy-regen ramp decay. Each power cast (weapons.firePower)
            // adds a stack + stamps _fluxRefreshMs; if the whole FLUX_WINDOW_MS
            // elapses with no fresh cast, the ramp fades to 0 (all-or-nothing per
            // window, matching the "fades in 4s" spec). Gated on a non-zero stack
            // count so a player with 0 stacks (or no powerup) does zero work —
            // default-safe.
            if (this._fluxStacks > 0 && eNow - (this._fluxRefreshMs || 0) > FLUX_WINDOW_MS) {
                this._fluxStacks = 0;
            }

            // CAPACITOR_BANK — overcharge decay. While held, the portion of the
            // meter ABOVE the normal effective cap bleeds off at
            // CAPACITOR_BANK_DECAY_PER_SEC energy/s, floored at the normal cap
            // (never below — normal regen owns the 0..100% zone). Gated on the
            // passive AND an actual overcharge (energy > normal cap) so a player
            // without the passive (or not overcharged) does zero work —
            // default-safe. Reuses the energy block's clamped real-time dtMs.
            if (dtMs > 0 && typeof this.hasPassive === 'function' && this.hasPassive('CAPACITOR_BANK')) {
                const normalMax = this.getEffectiveMaxEnergy();
                if ((this.energy || 0) > normalMax) {
                    this.energy = progression.capacitorBankDecayStep(this.energy || 0, normalMax, dtMs);
                }
            }

            // HEAT_SINK — heat bleeds off when NOT actively holding fire, so the
            // ramp/vent rewards SUSTAINED fire rather than being permanent. While
            // fire is held (_fireHoldTime > 0, updated in updateChargingSystem) the
            // heat is left alone to keep climbing. Gated on the passive AND a
            // non-zero heat so non-holders (heat stays 0) do zero work — default-safe.
            if (dtMs > 0 && (this.heat || 0) > 0
                && typeof this.hasPassive === 'function' && this.hasPassive('HEAT_SINK')) {
                if (!(this._fireHoldTime > 0)) {
                    this.heat = Math.max(0, Math.min(HEAT_SINK_MAX, this.heat) - HEAT_SINK_DECAY_PER_SEC * dtMs / 1000);
                }
            }
        }

        // Charging shot system - charge when holding left-click, fire on release
        this.updateChargingSystem(input, bulletPool, audioManager, particlePool);

        // Charge beam particle effects — always show while charging (independent of primary cooldown)
        if (this.tractorBeamActive && Math.random() < 0.3) {
            this.spawnChargeBeamParticles(particlePool);
        }

        // Defense abilities — B.S2 number keys 1–4 activate the four
        // equipped ability slots. Each input.activateAbilitySlot[i] is a
        // one-shot rising-edge pulse from input-handler.js; consume each
        // true pulse and clear it (the per-slot cooldown / empty-slot
        // guard lives in Player.activateAbility(slot)).
        const abilitySlots = input.activateAbilitySlot;
        if (abilitySlots) {
            for (let slot = 0; slot < abilitySlots.length; slot++) {
                if (abilitySlots[slot]) {
                    this.activateAbility(slot);
                    abilitySlots[slot] = false; // consume one-shot pulse
                }
            }
        }
        // Back-compat slot-0 pulse: the gamepad path (gamepad-handler.js,
        // BTN_CIRCLE) still raises the legacy input.activateAbility flag.
        // Map it to slot 0 until the gamepad gains a 4-slot mapping.
        if (input.activateAbility) {
            this.activateAbility(0);
            input.activateAbility = false; // consume one-shot pulse
        }

        // 5.93.0 — SHIFT-key dash. One-shot pulse from input-handler.js
        // fires the dash through _triggerDash, which honors the cooldown
        // / already-dashing guards itself. Pulse is consumed regardless
        // so a press during cooldown doesn't queue up a later dash.
        if (input.dashPulse) {
            // 6.1.3 — Mobile tap-to-dash passes a screen-space target
            // (input.dashTargetScreenX/Y). Convert to world coords via
            // the engine helper and hand off to _triggerDash so the
            // dash heads toward where the player tapped. Desktop SHIFT
            // sets no target, so the fallback aim/velocity logic runs.
            let dashWorldX = null, dashWorldY = null;
            const sx = input.dashTargetScreenX;
            const sy = input.dashTargetScreenY;
            if (typeof sx === 'number' && typeof sy === 'number'
                    && ge && typeof ge.screenToWorldCoordinates === 'function') {
                const w = ge.screenToWorldCoordinates(sx, sy);
                if (w && typeof w.x === 'number') {
                    dashWorldX = w.x;
                    dashWorldY = w.y;
                }
            }
            if (input.gamepadActive && input.stickInput && input.stickInput.magnitude > 0.05) {
                this._dashInputAngle = Math.atan2(input.stickInput.y, input.stickInput.x);
            } else {
                this._dashInputAngle = null;
            }
            this._triggerDash(audioManager, dashWorldX, dashWorldY);
            this._assistDashAngle = null;
            this._dashInputAngle = null;
            input.dashPulse = false; // consume one-shot pulse
            input.dashTargetScreenX = null;
            input.dashTargetScreenY = null;
        }

        // 5.64.15 — beamTimer-based deactivation removed. Lance Beam is
        // now a continuous tether driven by `input.fire` directly in
        // the weapons.js update loop. The legacy timer is preserved but
        // no longer drives state.

        // Update active ability effects (regen, dash, etc.)
        this.updateActiveAbilities(1000 / GAME_CONFIG.LOGIC_HZ);

    }

    updateActiveAbilities(dt) {
        return abilities.updateActiveAbilities.call(this, dt);
    }
    
    draw(ctx) {
        return playerRenderer.draw.call(this, ctx);
    }

    drawChargingEffects(ctx) {
        return playerRenderer.drawChargingEffects.call(this, ctx);
    }

    drawCooldownChargingEffects(ctx) {
        return playerRenderer.drawCooldownChargingEffects.call(this, ctx);
    }

    drawLevelUpEffects(ctx) {
        return playerRenderer.drawLevelUpEffects.call(this, ctx);
    }

    drawCooldownTimer(ctx) {
        return playerRenderer.drawCooldownTimer.call(this, ctx);
    }

    spawnChargeBeamParticles(particlePool) {
        return playerRenderer.spawnChargeBeamParticles.call(this, particlePool);
    }
    
    // Powerup management methods
    addPowerup(type, config, isShopItem = false) {
        return progression.addPowerup.call(this, type, config, isShopItem);
    }

    updatePowerups() {
        return progression.updatePowerups.call(this);
    }

    getPowerupStacks(type) {
        return progression.getPowerupStacks.call(this, type);
    }

    // Phase P2 — rule-modifier passives (see player/passives.js).
    _rebuildActivePassives() { return passives._rebuildActivePassives.call(this); }
    hasPassive(id) { return passives.hasPassive.call(this, id); }
    getPassiveMod(key) { return passives.getPassiveMod.call(this, key); }
    getPassiveMult(field) { return passives.getPassiveMult.call(this, field); }
    getPassiveDamageMult() { return passives.getPassiveDamageMult.call(this); }
    getPassiveMaxHpMult() { return passives.getPassiveMaxHpMult.call(this); }
    equipPassive(slot, id) { return passives.equipPassive.call(this, slot, id); }
    setOwnedPassives(ids) { return passives.setOwnedPassives.call(this, ids); }
    setPassiveSlotsUnlocked(n) { return passives.setPassiveSlotsUnlocked.call(this, n); }

    getItemAffixTotal(type) {
        return progression.getItemAffixTotal.call(this, type);
    }

    // E1 (Element & Resistance) — the player's resistance to an incoming
    // element, as a fraction (0 = neutral, 0.5 = −50% damage, 1 = immune,
    // negative = weakness). Base 0; E7 adds per-element resist affixes on
    // items (keyed `<element>Resist`, e.g. 'pyroResist'). Returns 0 today
    // since no such affixes exist yet — read by the enemy→player damage
    // path in E5.
    getElementResist(element) {
        if (!element) return 0;
        const affix = this.getItemAffixTotal(element.toLowerCase() + 'Resist');
        return (affix || 0) / 100;
    }

    // 6.35.0 — Meta progression (level / XP / SP).
    addXp(amount) { return progression.addXp.call(this, amount); }
    allocateSp(statId) { return progression.allocateSp.call(this, statId); }
    deallocateSp(statId) { return progression.deallocateSp.call(this, statId); }
    getSpStatValue(statId) { return progression.spStatTotal.call(this, statId); }
    saveMetaState() { return progression.saveMetaState.call(this); }

    fireWeapons(bulletPool, audioManager) {
        return weapons.fireWeapons.call(this, bulletPool, audioManager);
    }

    createBullets(bulletPool) {
        return weapons.createBullets.call(this, bulletPool);
    }

    createChargedBullets(bulletPool, sizeMultiplier = 1, speedMultiplier = 1, totalDamage = 20, critChanceBonus = 0, baseHomingStrength = 0) {
        return weapons.createChargedBullets.call(this, bulletPool, sizeMultiplier, speedMultiplier, totalDamage, critChanceBonus, baseHomingStrength);
    }
    
    getMovementSpeedMultiplier() {
        return progression.getMovementSpeedMultiplier.call(this);
    }

    getRangeMultiplier() {
        return progression.getRangeMultiplier.call(this);
    }

    getGoldFindMultiplier() {
        return progression.getGoldFindMultiplier.call(this);
    }

    // 5.114.0 — effective regen HP/sec (powerup stacks + inventory).
    getEffectiveRegen() {
        return progression.getEffectiveRegen.call(this);
    }

    getEffectiveShield() {
        return progression.getEffectiveShield.call(this);
    }

    getEffectiveMaxHealth() {
        return progression.getEffectiveMaxHealth.call(this);
    }

    // CD-10 — current Bloodshield buffer cap (35% of effective max HP).
    getBloodshieldCap() {
        const maxHp = (typeof this.getEffectiveMaxHealth === 'function')
            ? this.getEffectiveMaxHealth() : this.maxHealth;
        return Math.max(0, maxHp * BLOODSHIELD_CAP_FRAC);
    }

    // CD-10 — bank `amount` shield points into the Bloodshield buffer, clamped to
    // the 35%-of-max-HP cap, and stamp the refresh time (so decay's grace window
    // restarts). Returns the amount actually banked (≥ 0). Caller gates on the
    // BLOODSHIELD passive; this is pure clamp math so 0/negative input is inert.
    addBloodshield(amount) {
        if (!(amount > 0)) return 0;
        const cap = this.getBloodshieldCap();
        const before = this.bloodshield || 0;
        const next = Math.min(cap, before + amount);
        const added = Math.max(0, next - before);
        if (added > 0) {
            this.bloodshield = next;
            this._bloodshieldRefreshMs = Date.now();
        }
        return added;
    }

    getEffectiveCritChance() {
        return progression.getEffectiveCritChance.call(this);
    }

    getEffectiveCritDamage() {
        return progression.getEffectiveCritDamage.call(this);
    }

    getKnockbackMultiplier() {
        return progression.getKnockbackMultiplier.call(this);
    }

    getPostDashIframeMs() {
        return progression.getPostDashIframeMs.call(this);
    }

    getEffectiveHealthOrbHealing(baseHealing = 1) {
        return progression.getEffectiveHealthOrbHealing.call(this, baseHealing);
    }

    getEffectiveHealthStarHealing() {
        return progression.getEffectiveHealthStarHealing.call(this);
    }

    getEffectiveBurstStarHealing() {
        return progression.getEffectiveBurstStarHealing.call(this);
    }

    // CD energy-economy getters (CD-06). Default-safe: 0 SP → base values.
    getEffectiveMaxEnergy() {
        return progression.getEffectiveMaxEnergy.call(this);
    }

    // CAPACITOR_BANK — the energy clamp ceiling (overcharge cap). Default-safe:
    // without the passive this equals getEffectiveMaxEnergy().
    getEnergyOverchargeCap() {
        return progression.getEnergyOverchargeCap.call(this);
    }

    getEffectiveEnergyRegenMult() {
        return progression.getEffectiveEnergyRegenMult.call(this);
    }

    getEffectivePowerCost(baseCost) {
        return progression.getEffectivePowerCost.call(this, baseCost);
    }

    // ── Weapon System Methods ──────────────────────────────────────────────

    // Phase B.S1 — back-compat accessors for the legacy single-ability API.
    // The 4-slot arrays (equippedAbilities / abilityCooldowns / abilityCooldownsMax)
    // are the source of truth; these three properties proxy SLOT 0 so all
    // existing readers/writers (HUD status.js, renderer.js, radial-menu.js,
    // save/load in game-engine.js, input-handler) keep working unchanged.
    // Defined per-instance (not on the prototype) because they shadow what
    // were plain data properties; `Object.defineProperty` makes them
    // non-enumerable accessors that read/write the underlying arrays.
    _defineAbilitySlotAccessors() {
        Object.defineProperty(this, 'activeAbility', {
            configurable: true,
            enumerable: true,
            get() { return this.equippedAbilities[0]; },
            set(v) { this.equippedAbilities[0] = v; },
        });
        Object.defineProperty(this, 'activeAbilityCooldown', {
            configurable: true,
            enumerable: true,
            get() { return this.abilityCooldowns[0]; },
            set(v) { this.abilityCooldowns[0] = v; },
        });
        Object.defineProperty(this, 'activeAbilityCooldownMax', {
            configurable: true,
            enumerable: true,
            get() { return this.abilityCooldownsMax[0]; },
            set(v) { this.abilityCooldownsMax[0] = v; },
        });
    }

    getActivePrimaryConfig() {
        return weapons.getActivePrimaryConfig.call(this);
    }

    getActivePowerConfig() {
        return weapons.getActivePowerConfig.call(this);
    }

    equipPrimary(weaponId) {
        return weapons.equipPrimary.call(this, weaponId);
    }

    equipPower(weaponId) {
        return weapons.equipPower.call(this, weaponId);
    }

    buyPrimary(weaponId) {
        return weapons.buyPrimary.call(this, weaponId);
    }

    buyPower(weaponId) {
        return weapons.buyPower.call(this, weaponId);
    }

    equipAbility(abilityId, slot = 0) {
        return abilities.equipAbility.call(this, abilityId, slot);
    }

    cycleAbility(slot = 0) {
        return abilities.cycleAbility.call(this, slot);
    }

    activateAbility(slot = 0) {
        return abilities.activateAbility.call(this, slot);
    }

    // ── SHIFT-key dash (5.93.0) ─────────────────────────────────────────
    // Core movement primitive — no longer a defense ability. Pure player
    // input + position kinematics, so it's MP-safe with no server-side
    // mirror needed (position updates flow through the existing predicted-
    // ship pipeline).
    //
    // Constants exposed as static so unit tests can read them without
    // poking at hand-tuned magic numbers.
    static DASH_DURATION_MS  = 250;
    static DASH_COOLDOWN_MS  = 1500;
    static DASH_DISTANCE_PX  = 135;  // matches the old PHASE_DASH 150px feel after duration tuning
    static AFTERIMAGE_GHOST_MS = 360; // fade life of the Afterimage clone (outlasts the burst)

    /**
     * Trigger a dash burst if available. Returns true on success.
     * 6.1.3 — Optional `targetWorldX/Y` arguments steer the dash
     * toward a world-space point (used by the mobile tap-to-dash
     * input). When omitted (desktop SHIFT), falls back to the
     * pre-6.1.3 aim/velocity-direction logic.
     */
    _triggerDash(audioManager = null, targetWorldX = null, targetWorldY = null) {
        if (this.isDashing) return false;
        if (this.dashCooldown > 0) return false;

        let angle;
        // FB-2 — flag whether THIS dash was driven by the AI Co-Pilot's
        // auto-dodge (the _assistDashAngle branch) rather than a manual tap /
        // key / gamepad dash, so the ship can render a subtle cue for the
        // duration of the burst. Reset each dash; set only on the assist path.
        // (Mobile already gets a haptic pulse via MB-2; this serves desktop /
        // gamepad Co-Pilot users who have no haptic feedback.)
        this._coPilotDashActive = false;
        if (typeof targetWorldX === 'number' && typeof targetWorldY === 'number') {
            // Tap-directed dash: aim straight at the tap position.
            // Guard against a tap landing exactly on the ship (dist=0
            // would yield NaN). Fall back to current aim angle.
            const dx = targetWorldX - this.x;
            const dy = targetWorldY - this.y;
            if (Math.hypot(dx, dy) < 1) {
                angle = this.angle;
            } else {
                angle = Math.atan2(dy, dx);
            }
        } else if (typeof this._assistDashAngle === 'number') {
            angle = this._assistDashAngle;
            this._assistDashAngle = null;
            this._coPilotDashActive = true;
        } else if (typeof this._dashInputAngle === 'number') {
            angle = this._dashInputAngle;
            this._dashInputAngle = null;
        } else if (this.gameEngine && this.gameEngine.controlScheme === 'gamepad') {
            const target = typeof this.gameEngine.findNearestTarget === 'function'
                ? this.gameEngine.findNearestTarget(this.x, this.y) : null;
            if (target) angle = Math.atan2(this.y - target.y, this.x - target.x);
            else angle = this.angle + Math.PI;
        } else {
            // Desktop SHIFT path: prefer aim angle, fall back to
            // velocity direction when actively moving so a mid-strafe
            // dash stays in the strafe direction.
            const speed = Math.hypot(this.vel.x, this.vel.y);
            angle = this.angle;
            if (speed > 0.5) {
                angle = Math.atan2(this.vel.y, this.vel.x);
            }
        }

        // px/sec speed needed to traverse DASH_DISTANCE_PX in DASH_DURATION_MS.
        const dashSpeed = (Player.DASH_DISTANCE_PX * 1000) / Player.DASH_DURATION_MS;
        this.isDashing    = true;
        this.dashTimer    = Player.DASH_DURATION_MS;
        this.dashVelX     = Math.cos(angle) * dashSpeed;
        this.dashVelY     = Math.sin(angle) * dashSpeed;
        // GP-4 — gamepad rumble on dash (every dash source; self-gates on an
        // enabled + connected actuator pad, so keyboard/touch/no-pad = no-op).
        rumble(RUMBLE.MEDIUM);
        this.dashCooldown = Player.DASH_COOLDOWN_MS;

        // Post-dash i-frame window. Spans the burst itself (already
        // i-frame'd via isDashIFrameActive) plus a configurable tail
        // routed through `invincible`/`invincibilityTimer` so every
        // collision site that already gates on `!player.invincible`
        // honors it for free. Base 1s tail, +2s per PHASE_ECHO stack,
        // capped at 5s (2 stacks). Don't shorten an existing longer
        // window — if BULWARK / LAST_STAND / GUARDIAN granted a bigger
        // invuln just before the dash, keep it.
        const dashInvulnMs = Player.DASH_DURATION_MS + this.getPostDashIframeMs();
        if (this.invincibilityTimer < dashInvulnMs) {
            this.makeInvincible(dashInvulnMs);
        }

        // Audio — keep the existing phaseDash.wav (defense-ability removal
        // doesn't kill the sound). audioManager may be null in test paths;
        // also fall back to the live gameEngine reference if available.
        const audio = audioManager || (this.gameEngine && this.gameEngine.audioManager) || null;
        if (audio && typeof audio.playSound === 'function') {
            audio.playSound('phaseDash');
        }

        // P6 — Kinetic Battery: a successful dash refunds power energy.
        if (typeof this.hasPassive === 'function' && this.hasPassive('KINETIC_BATTERY')
            && typeof this.addEnergy === 'function') {
            this.addEnergy(KINETIC_BATTERY_REFUND);
        }

        // P6 — Afterimage: the dash leaves a "clone" at the origin that fires
        // your primary once. At trigger time this.x/this.y is still the dash
        // ORIGIN (the burst velocity integrates in updateActiveAbilities AFTER
        // this returns), and firePrimary aims along this.angle — so firing now
        // spawns the volley from where you dashed FROM as the ship streaks away.
        // Free bonus shot (rate-limited by the dash cooldown); bypasses the
        // primary cooldown by calling firePrimary directly. Never breaks the dash.
        if (typeof this.hasPassive === 'function' && this.hasPassive('AFTERIMAGE')
            && typeof this.firePrimary === 'function') {
            const ge = this.gameEngine;
            if (ge && ge.bulletPool) {
                try { this.firePrimary(ge.bulletPool, ge.audioManager || audio, ge.particlePool); }
                catch (_) { /* afterimage is a bonus — never break the dash */ }
                // Leave a fading violet "clone" at the dash origin so the bonus
                // volley has a visible source. this.x/this.y/angle are still the
                // origin here (the burst integrates next frame). t0 lets the
                // renderer compute the fade without importing Player.
                this._afterimageGhost = {
                    x: this.x, y: this.y, angle: this.angle,
                    t: Player.AFTERIMAGE_GHOST_MS, t0: Player.AFTERIMAGE_GHOST_MS,
                };
            }
        }
        return true;
    }

    /** I-frame helper — true while a dash burst is active. */
    isDashIFrameActive() {
        return !!this.isDashing && this.dashTimer > 0;
    }

    getActiveAbilityConfig(slot = 0) {
        return abilities.getActiveAbilityConfig.call(this, slot);
    }

    // Phase B.S1 — alias matching the refactor's intended name. Returns the
    // ABILITIES config for the ability in `slot` (default 0).
    getEquippedAbility(slot = 0) {
        return abilities.getActiveAbilityConfig.call(this, slot);
    }

    getEffectivePrimaryFireRate() {
        return weapons.getEffectivePrimaryFireRate.call(this);
    }

    getEffectivePrimaryDamage() {
        return weapons.getEffectivePrimaryDamage.call(this);
    }

    // 5.78.2 — exposed for external callers (combat manager, debug
    // overlays, tests). Mirrors the helper on the weapons module.
    getPlayerLevelDamageMultiplier() {
        return weapons.getPlayerLevelDamageMultiplier.call(this);
    }

    getPowerCooldownRemaining() {
        return weapons.getPowerCooldownRemaining.call(this);
    }

    isPowerReady() {
        return weapons.isPowerReady.call(this);
    }

    // 6.29.0 — Energy meter helpers.
    getPowerEnergyCost() {
        return weapons.getPowerEnergyCost.call(this);
    }
    addEnergy(amount) {
        // CD: clamp to the CAPACITOR-boosted cap so the meter can bank past
        // the base 100. CAPACITOR_BANK raises this ceiling to the overcharge cap
        // (×1.5) so energy granted from any source can climb into the overcharge
        // zone while held. Default-safe: no passive → getEnergyOverchargeCap()
        // == getEffectiveMaxEnergy() == maxEnergy → byte-for-byte the old clamp.
        this.energy = Math.max(0, Math.min(this.getEnergyOverchargeCap(), (this.energy || 0) + amount));
    }

    // P6 — Siege passive: outgoing damage multiplier from the current standing-
    // still ramp (1 when not equipped or the ramp is empty). applyDamageToEnemy
    // reads this alongside getPassiveDamageMult.
    getSiegeDamageMult() {
        if (typeof this.hasPassive !== 'function' || !this.hasPassive('SIEGE')) return 1;
        return siegeMult(this._siegeRamp);
    }

    // 6.149.0 — canonical heal entry point. Adds `amount` HP, clamps to the
    // effective max, and credits ANY surplus (overflow past max) to the
    // spare-tank accumulator. Previously only the health-orb + regen paths
    // credited overflow, so heals from Field Medic / vampirism / Vampiric
    // Rounds at full HP were silently discarded and never rebuilt a lost tank.
    // Routing every heal through here makes "overflow → regain a tank" hold for
    // ALL sources. Returns { healed, overflow }.
    gainHealth(amount) {
        if (!(amount > 0)) return { healed: 0, overflow: 0 };
        const cap = (typeof this.getEffectiveMaxHealth === 'function')
            ? this.getEffectiveMaxHealth() : this.maxHealth;
        const before = this.health;
        this.health = Math.min(cap, before + amount);
        const healed = this.health - before;
        const overflow = amount - healed;
        if (overflow > 0 && this.gameEngine
            && typeof this.gameEngine.accumulateOverflowToTank === 'function') {
            this.gameEngine.accumulateOverflowToTank(overflow);
        }
        return { healed, overflow };
    }

    updateAbilityCooldowns(dt) {
        return abilities.updateAbilityCooldowns.call(this, dt);
    }

    // Wave bonus shield system removed - replaced with shop system

    die(particlePool, audioManager, uiManager, game, triggerScreenShake) {
        this.active = false;
        game.state = 'GAME_OVER';
        
        audioManager.playPlayerExplosion();
        particlePool.get(this.x, this.y, 'playerExplosion');
        
        // Dramatic screen shake for player death
        if (triggerScreenShake) {
            triggerScreenShake(25, 15, 50); // Much more intense than asteroid destruction
        }
        
        // Show game over message
        const roundedScore = Math.round(game.score);
        const roundedHighScore = Math.round(game.highScore);
        const subtitle = `YOUR SCORE: ${roundedScore}\nHIGH SCORE: ${roundedHighScore}\n\nPress Enter to Restart`;
        uiManager.showMessage('GAME OVER', subtitle);
    }
}
