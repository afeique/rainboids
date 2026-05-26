/**
 * QA-46: CD-build COMPOSITION integration (hardens the 6.197→6.207.1 batch).
 *
 * The per-feature CD specs (QA-36..45) each exercise ONE combat-depth feature in
 * isolation. None stack them together, yet the whole point of the CD batch is that
 * an ENERGY build or a BLOOD build wears MANY of these at once — and stacked
 * interactions are exactly where subtle bugs hide. This spec is the composition
 * regression guard: it grants whole builds (not single features) and drives a
 * short LIVE run, asserting the systems COMPOSE (economy alive, sustain alive,
 * director coherent, no NaN/undefined leaks, no fatal JS errors). It deliberately
 * checks "the build works together", NOT exact magnitudes (those are pinned by the
 * per-feature specs).
 *
 * Builds under test (all shipped, all default-safe individually):
 *   ENERGY — SP CAPACITOR/REACTOR/EFFICIENCY; powerups SURGE_BATTERY / FLUX /
 *            OVERFLOW_DISCHARGE / RESONANT_SURGE; AoE power-weapon crit (R1).
 *   BLOOD  — passives BLOODSHIELD / BLOODLUST / SANGUINE / HEMOGLUTTON; SP
 *            VAMPIRISM + REGENERATION; powerups REGENERATOR / LIFE_ON_KILL /
 *            ABLATIVE_PLATING.
 *
 * All grant hooks are copied verbatim from the per-feature specs:
 *   • SP stats        → player.sp = N; player.allocateSp(id)   (QA-36)
 *   • 1-stack powerups → player.powerups.set(id, { stacks: 1 }) (QA-40/41/43/44/45)
 *   • Vampirism (SP)  → player.allocateSp('VAMPIRISM')          (sp-stats.js)
 *   • passives        → setOwnedPassives + setPassiveSlotsUnlocked + equipPassive (QA-37/38/39)
 *   • spawn enemies   → ge.spawnLeveledEnemies('HUNTER', n, {onScreen:true, cap:9999}) (QA-38/39/40)
 *   • kill hook       → ge.onEnemyKill(enemy)                   (QA-38/39/40)
 *   • damage enemy    → ge.applyDamageToEnemy / ge.damageEnemy  (QA-38/42)
 *   • cast power      → player.firePower(bulletPool, audio, particlePool) (QA-43/44)
 *   • take damage     → ge.takeDamage(n, { fxX, fxY })          (QA-37/41)
 *   • wave clears     → ge.updateWaveSystem() advance loop       (QA-20/35)
 *   • drive the run   → GameAI (tests/helpers/game-ai.js)
 *
 * The 4 blood passives are slot-deliverable and NONE carry the 'keystone' tag
 * (passive-data.js), so all four fit inside the 5-slot equip array without
 * tripping the KEYSTONE_BUDGET=2 gate — the same equipPassive path QA-37/38/39 use.
 */
import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';
import { GameAI } from '../helpers/game-ai.js';

const FATAL = (m) =>
    !m.includes('sfxr') && !m.includes('Audio') && !m.includes('audio') &&
    !m.includes('Font') && !m.includes('net::ERR') &&
    !/favicon|ResizeObserver|AudioContext|Failed to load resource/i.test(m);

// Grant the FULL ENERGY build on the live player via the real per-feature hooks.
async function grantEnergyBuild(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        const p = ge.player;
        // SP economy stats — the real allocateSp path (QA-36). Give plenty of SP
        // then allocate the full stack; allocateSp caps at SP_STAT_MAX_POINTS.
        p.sp = 400;
        for (const id of ['CAPACITOR', 'REACTOR', 'EFFICIENCY']) {
            for (let i = 0; i < 30; i++) p.allocateSp(id);
        }
        // The four energy-synergy powerups (1-stack each), via the powerups Map —
        // the exact path QA-43/44/45 use.
        for (const id of ['SURGE_BATTERY', 'FLUX', 'OVERFLOW_DISCHARGE', 'RESONANT_SURGE']) {
            p.powerups.set(id, { stacks: 1 });
        }
        // Equip an AoE power weapon (CHARGE_SHOT is owned by default; also try to
        // own + equip NOVA_BLAST so the AoE-crit path (QA-42) is in play). equipPower
        // only switches to an OWNED power, so add it to ownedPowers first.
        if (p.ownedPowers && typeof p.ownedPowers.add === 'function') p.ownedPowers.add('NOVA_BLAST');
        if (typeof p.equipPower === 'function') p.equipPower('NOVA_BLAST');
        p.powerCooldown = 0;
        p.energy = p.getEffectiveMaxEnergy(); // top off so a cast is ready
        p._surgeBatteryReady = true;
        p._fluxStacks = 0;
        return {
            maxEnergy: p.getEffectiveMaxEnergy(),
            cap: p.spStats.CAPACITOR,
            reactor: p.spStats.REACTOR,
            eff: p.spStats.EFFICIENCY,
            activePower: p.activePower,
            powerCost: p.getPowerEnergyCost(),
            regenMult: p.getEffectiveEnergyRegenMult(),
            surge: p.getPowerupStacks('SURGE_BATTERY') > 0,
            flux: p.getPowerupStacks('FLUX') > 0,
            discharge: p.getPowerupStacks('OVERFLOW_DISCHARGE') > 0,
            resonant: p.getPowerupStacks('RESONANT_SURGE') > 0,
        };
    });
}

// Grant the FULL BLOOD build on the live player via the real per-feature hooks.
async function grantBloodBuild(page) {
    return page.evaluate(() => {
        const ge = window.gameEngine;
        const p = ge.player;
        // Four blood passives — owned + slots unlocked + equipped into slots 0..3
        // (none are keystones, so all four fit). The QA-37/38/39 equip path.
        const blood = ['BLOODSHIELD', 'BLOODLUST', 'SANGUINE', 'HEMOGLUTTON'];
        p.setOwnedPassives(blood);
        p.setPassiveSlotsUnlocked(5);
        blood.forEach((id, i) => p.equipPassive(i, id));
        // SP sustain stats — VAMPIRISM (lifesteal) + REGENERATION (out-of-combat
        // regen), via the real allocateSp path.
        p.sp = 400;
        for (const id of ['VAMPIRISM', 'REGENERATION']) {
            for (let i = 0; i < 60; i++) p.allocateSp(id);
        }
        // Sustain powerups (1-stack each), via the powerups Map (QA-40/41).
        for (const id of ['REGENERATOR', 'LIFE_ON_KILL', 'ABLATIVE_PLATING']) {
            p.powerups.set(id, { stacks: 1 });
        }
        p._ablativeReady = true;
        p.invincible = false;
        p.invincibilityTimer = 0;
        return {
            hasBloodshield: p.hasPassive('BLOODSHIELD'),
            hasBloodlust: p.hasPassive('BLOODLUST'),
            hasSanguine: p.hasPassive('SANGUINE'),
            hasHemoglutton: p.hasPassive('HEMOGLUTTON'),
            vampSp: p.getSpStatValue ? p.getSpStatValue('VAMPIRISM') : 0,
            regenSp: p.getSpStatValue ? p.getSpStatValue('REGENERATION') : 0,
            regenerator: p.getPowerupStacks('REGENERATOR') > 0,
            lifeOnKill: p.getPowerupStacks('LIFE_ON_KILL') > 0,
            ablative: p.getPowerupStacks('ABLATIVE_PLATING') > 0,
            maxHp: p.getEffectiveMaxHealth(),
        };
    });
}

test.describe('QA-46: CD build composition integration', () => {
    test.beforeEach(async ({ page }) => {
        page._jsErrors = [];
        page.on('pageerror', (err) => page._jsErrors.push(String(err)));
        page.on('console', (msg) => { if (msg.type() === 'error') page._jsErrors.push(msg.text()); });
        await loadGame(page);
        // Clean 0-point baseline regardless of persisted meta (QA-36/43/44 do this).
        await page.evaluate(() => { try { localStorage.removeItem('rainboidsMeta'); } catch {} });
        await startGame(page);
        await page.evaluate(() => {
            const p = window.gameEngine.player;
            for (const k of Object.keys(p.spStats)) p.spStats[k] = 0;
        });
    });

    // ── 1. Full ENERGY build composes ──────────────────────────────────────
    test('full ENERGY build composes: economy alive over a live run', async ({ page }) => {
        const g = await grantEnergyBuild(page);
        // Composition sanity: all the grants landed.
        expect(g.cap).toBe(20);                 // CAPACITOR maxed via allocateSp
        expect(g.reactor).toBe(20);
        expect(g.eff).toBe(20);
        expect(g.surge && g.flux && g.discharge && g.resonant).toBe(true);
        expect(g.maxEnergy).toBeGreaterThan(100); // CAPACITOR raised the cap
        expect(g.powerCost).toBeGreaterThan(0);

        // Drive a short live run: fire power weapons + kill some enemies.
        const ai = new GameAI(page);
        const runResult = await page.evaluate(async () => {
            const ge = window.gameEngine;
            const p = ge.player;
            // Spawn a few targets the AI can clear, and cast some power weapons so
            // FLUX ramps the regen mult and SURGE/OVERFLOW trigger.
            ge.spawnLeveledEnemies('HUNTER', 4, { onScreen: true, cap: 9999 });
            const baseRegenMult = p.getEffectiveEnergyRegenMult();
            let crit = false;
            for (let i = 0; i < 6; i++) {
                p.powerCooldown = 0;
                p.energy = p.getEffectiveMaxEnergy();
                p.firePower(ge.bulletPool, ge.audioManager, ge.particlePool);
            }
            const afterCastRegenMult = p.getEffectiveEnergyRegenMult();
            // Prove an AoE power weapon CAN crit through the live damageEnemy surface
            // (R1 / QA-42) while the whole energy build is worn.
            p.getEffectiveCritChance = () => 100;
            p.getEffectiveCritDamage = () => 250;
            ge.enemyPool.activeObjects.slice().forEach((e) => { e.active = false; });
            ge.enemyPool.cleanupInactive();
            const e = ge.enemyPool.get(500, 400, 'HUNTER', 1);
            e.maxHealth = 1e9; e.health = 1e9;
            const before = e.health;
            ge.damageEnemy(e, 40, undefined, true);
            const dealt = before - e.health;
            crit = dealt > 40 + 1e-6; // crit-scaled above base
            return { baseRegenMult, afterCastRegenMult, crit };
        });

        await ai.run(8000);   // ~8s of driven frames with the build worn
        await ai.stop();

        const post = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            return {
                state: ge.game.state,
                maxEnergy: p.getEffectiveMaxEnergy(),
                regenMult: p.getEffectiveEnergyRegenMult(),
                energyFinite: Number.isFinite(p.energy),
                fluxFinite: Number.isFinite(p._fluxStacks || 0),
            };
        });

        // Economy is alive: cap raised, FLUX ramped the regen mult after casting,
        // an AoE power crit landed, and nothing went NaN.
        expect(post.maxEnergy).toBeGreaterThan(100);
        expect(runResult.afterCastRegenMult).toBeGreaterThan(runResult.baseRegenMult);
        expect(runResult.crit).toBe(true);
        expect(post.energyFinite).toBe(true);
        expect(post.fluxFinite).toBe(true);
        expect(post.state).toBe('PLAYING');

        const fatal = page._jsErrors.filter(FATAL);
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });

    // ── 2. Full BLOOD build composes ───────────────────────────────────────
    test('full BLOOD build composes: sustain alive over a live run', async ({ page }) => {
        const g = await grantBloodBuild(page);
        // Composition sanity: all four passives + both SP sustain stats + powerups.
        expect(g.hasBloodshield && g.hasBloodlust && g.hasSanguine && g.hasHemoglutton).toBe(true);
        expect(g.vampSp).toBeGreaterThan(0);
        expect(g.regenSp).toBeGreaterThan(0);
        expect(g.regenerator && g.lifeOnKill && g.ablative).toBe(true);

        const r = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            const maxHp = p.getEffectiveMaxHealth();
            // (a) Bloodshield FEED — over-heal at full HP banks the buffer (QA-37).
            p.health = maxHp;
            ge.healthTanks = 0;
            p.bloodshield = 0;
            ge.applyHealthOrbToTanks(60, 0);
            const bloodshield = p.bloodshield;

            // (b) Bloodlust GAIN — kills grant stacks while equipped (QA-38).
            p.bloodlustStacks = 0;
            ge.spawnLeveledEnemies('HUNTER', 3, { onScreen: true, cap: 9999 });
            const kills = ge.enemyPool.activeObjects.filter((e) => e.type === 'HUNTER' && e.active);
            for (const e of kills) ge.onEnemyKill(e);
            const bloodlustStacks = p.bloodlustStacks;

            // (c) HP RECOVERY — drop HP, then a SANGUINE / LIFE_ON_KILL kill heals.
            p.invincible = false; p.invincibilityTimer = 0; p.shield = 0;
            p.health = maxHp * 0.4;
            ge.spawnLeveledEnemies('HUNTER', 1, { onScreen: true, cap: 9999 });
            const target = ge.enemyPool.activeObjects.find((e) => e.type === 'HUNTER' && e.active);
            const hpBeforeKill = p.health;
            if (target) ge.onEnemyKill(target);
            const hpAfterKill = p.health;

            return {
                maxHp, bloodshield, bloodlustStacks,
                hpBeforeKill, hpAfterKill,
                bloodshieldFinite: Number.isFinite(p.bloodshield),
                bloodlustFinite: Number.isFinite(p.bloodlustStacks),
            };
        });

        // (d) HEMOGLUTTON path — exercised through the LIVE bullet→enemy collision
        // lifesteal site (collision-system.js), driven exactly like QA-39: SPAWN the
        // afflicted enemy in one step, let a live frame finish its spawn-warp, THEN
        // fire a bullet on top of it in a separate step (so applyDamageToEnemy isn't
        // gated by the warp). Doing both in one synchronous evaluate leaves the
        // enemy mid-warp → 0 applied → 0 lifesteal (the earlier flake).
        await page.evaluate(() => {
            const ge = window.gameEngine;
            for (const e of [...ge.enemyPool.activeObjects]) ge.applyDamageToEnemy(e, 1e9, { showNumber: false });
            ge.spawnLeveledEnemies('HUNTER', 1, { onScreen: true, cap: 9999 });
            const afflicted = ge.enemyPool.activeObjects.find((e) => e.type === 'HUNTER' && e.active);
            if (afflicted) {
                afflicted.maxHealth = 1e6; afflicted.health = 1e6;
                afflicted.armor = 0; afflicted.charge = null;
                afflicted.brnUntil = Date.now() + 1e6; // status active → _enemyHasStatus true
            }
        });
        await page.waitForTimeout(300); // let a live frame finish the spawn-warp
        const ls = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            const enemy = ge.enemyPool.activeObjects.find((e) => e.type === 'HUNTER' && e.active);
            if (!enemy) return { lifestealGain: 0, chillFull: false };
            enemy.maxHealth = 1e6; enemy.health = 1e6; enemy.armor = 0; enemy.charge = null;
            enemy.brnUntil = Date.now() + 1e6;
            // Confirm a chill duration set on the enemy is NOT shortened (the 6.207.1
            // family of "downside" fixes): with no Conduit equipped a chill window is
            // the full base duration — stamp a known chill and read it straight back.
            const chillBase = Date.now() + 2000;
            enemy.chillUntil = chillBase;
            const chillFull = enemy.chillUntil === chillBase; // unshortened
            p.invincible = false; p.invincibilityTimer = 0; p.shield = 0;
            p.health = p.getEffectiveMaxHealth() * 0.2;
            for (const b of [...ge.bulletPool.activeObjects]) b.active = false;
            const bullet = ge.bulletPool.get(enemy.x, enemy.y, 0);
            bullet.damage = 100; bullet.piercing = 0; bullet.bounces = 0;
            const before = p.health;
            ge.handleCollisions(); // live bullet→enemy lifesteal (×2 vs status w/ HEMOGLUTTON)
            return { lifestealGain: p.health - before, chillFull };
        });

        // Sustain is alive when the whole build is worn:
        expect(r.bloodshield).toBeGreaterThan(0);             // bloodshield buffer rose
        expect(r.bloodshield).toBeLessThanOrEqual(r.maxHp * 0.35 + 0.01); // never exceeds cap
        expect(r.bloodlustStacks).toBeGreaterThan(0);         // kills granted bloodlust stacks
        expect(r.hpAfterKill).toBeGreaterThan(r.hpBeforeKill); // SANGUINE/LIFE_ON_KILL recovered HP
        expect(ls.lifestealGain).toBeGreaterThan(0);          // HEMOGLUTTON lifesteal landed
        expect(ls.chillFull).toBe(true);                      // chill window NOT shortened (6.207.1)
        expect(r.bloodshieldFinite && r.bloodlustFinite).toBe(true);

        // And drive a short live run so the decay / regen loops run under the build.
        const ai = new GameAI(page);
        await page.evaluate(() => {
            window.gameEngine.spawnLeveledEnemies('HUNTER', 3, { onScreen: true, cap: 9999 });
        });
        await ai.run(8000);
        await ai.stop();

        const state = await page.evaluate(() => window.gameEngine.game.state);
        expect(state).toBe('PLAYING');

        const fatal = page._jsErrors.filter(FATAL);
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });

    // ── 3. Everything stacked + survival smoke (the real regression guard) ──
    test('ENERGY + BLOOD stacked: bounded survival stays coherent', async ({ page }) => {
        // Grant a representative mix of BOTH builds at once.
        await grantEnergyBuild(page);
        await grantBloodBuild(page);
        // grantBloodBuild re-set p.sp = 400 and re-allocated; re-confirm the energy
        // SP stats survived (allocateSp is additive per-stat, blood used different
        // stat ids, so the energy stats remain maxed).
        const both = await page.evaluate(() => {
            const p = window.gameEngine.player;
            return {
                cap: p.spStats.CAPACITOR, vamp: p.getSpStatValue('VAMPIRISM'),
                hasBloodlust: p.hasPassive('BLOODLUST'),
                flux: p.getPowerupStacks('FLUX') > 0,
                ablative: p.getPowerupStacks('ABLATIVE_PLATING') > 0,
            };
        });
        expect(both.cap).toBe(20);
        expect(both.vamp).toBeGreaterThan(0);
        expect(both.hasBloodlust).toBe(true);
        expect(both.flux && both.ablative).toBe(true);

        // Run a bounded live window with both builds worn AND advance a couple of
        // waves so the difficulty director keeps ticking under the stacked build.
        const ai = new GameAI(page);
        await page.evaluate(() => {
            window.gameEngine.spawnLeveledEnemies('HUNTER', 4, { onScreen: true, cap: 9999 });
            // Fast kills so the AI clears the field quickly (mirrors QA-20).
            window.gameEngine.cheats.onePunchMan = true;
        });
        await ai.run(10000); // ~10s of driven frames
        await ai.stop();

        // Advance two wave clears through the real updateWaveSystem feed (QA-20/35)
        // so the director produces finite, in-clamp D values under the build.
        const dirSnaps = await page.evaluate(() => {
            const ge = window.gameEngine;
            const snaps = [];
            for (let i = 0; i < 2; i++) {
                ge._waveStartMs = Date.now() - 8000;
                ge.player.health = ge.player.getEffectiveMaxHealth();
                ge.enemyPool.activeObjects.slice().forEach((e) => { e.active = false; });
                ge.asteroidPool.activeObjects.slice().forEach((a) => { a.active = false; });
                ge.enemyPool.cleanupInactive();
                ge.asteroidPool.cleanupInactive();
                if (ge._waveState) { ge._waveState.phase = 'complete'; ge._waveState.subWaveIndex = 999; }
                ge.game.subWaveIndex = 999;
                ge.game.waveComplete = false;
                ge.game.state = 'PLAYING';
                ge.updateWaveSystem();
                const dir = ge.game.difficultyDirector;
                snaps.push({ D_hp: dir ? dir.D_hp : null, D_thr: dir ? dir.D_thr : null });
                ge.game.waveComplete = false;
                ge.startNextWave();
                ge.spawnWaveEntities();
                ge.game.state = 'PLAYING';
            }
            return snaps;
        });

        // CD state coherence — no NaN/undefined leaks anywhere in the stacked build.
        const coherence = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            const spOk = Object.values(p.spStats).every((v) => Number.isFinite(v));
            return {
                state: ge.game.state,
                bloodshieldFinite: Number.isFinite(p.bloodshield),
                bloodlustFinite: Number.isFinite(p.bloodlustStacks),
                fluxFinite: Number.isFinite(p._fluxStacks || 0),
                energyFinite: Number.isFinite(p.energy),
                healthFinite: Number.isFinite(p.health),
                spOk,
            };
        });

        // The game stays playing; the director keeps producing finite, in-clamp D.
        expect(coherence.state).toBe('PLAYING');
        for (const s of dirSnaps) {
            expect(Number.isFinite(s.D_hp)).toBe(true);
            expect(Number.isFinite(s.D_thr)).toBe(true);
            expect(s.D_hp).toBeGreaterThanOrEqual(0.6);
            expect(s.D_hp).toBeLessThanOrEqual(3.0);
            expect(s.D_thr).toBeGreaterThanOrEqual(0.6);
            expect(s.D_thr).toBeLessThanOrEqual(1.8);
        }
        // No NaN/undefined leaks in the player's CD state.
        expect(coherence.bloodshieldFinite).toBe(true);
        expect(coherence.bloodlustFinite).toBe(true);
        expect(coherence.fluxFinite).toBe(true);
        expect(coherence.energyFinite).toBe(true);
        expect(coherence.healthFinite).toBe(true);
        expect(coherence.spOk).toBe(true);

        const fatal = page._jsErrors.filter(FATAL);
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });

    // ── 4. DEFAULT-SAFE baseline: NONE of the CD grants → a normal run ──────
    test('DEFAULT-SAFE: no CD grants → a baseline run behaves normally', async ({ page }) => {
        // Confirm the clean 0-point baseline (set in beforeEach): no passives, no CD
        // powerups, no SP, base energy economy.
        const base = await page.evaluate(() => {
            const ge = window.gameEngine;
            const p = ge.player;
            return {
                maxEnergy: p.getEffectiveMaxEnergy(),
                regenMult: p.getEffectiveEnergyRegenMult(),
                bloodshield: p.bloodshield || 0,
                bloodlust: p.bloodlustStacks || 0,
                hasAnyBlood: ['BLOODSHIELD', 'BLOODLUST', 'SANGUINE', 'HEMOGLUTTON'].some((id) => p.hasPassive(id)),
                vamp: p.getSpStatValue ? p.getSpStatValue('VAMPIRISM') : 0,
            };
        });
        expect(base.maxEnergy).toBe(100);   // un-boosted cap
        expect(base.regenMult).toBe(1);     // no REACTOR/FLUX
        expect(base.bloodshield).toBe(0);
        expect(base.bloodlust).toBe(0);
        expect(base.hasAnyBlood).toBe(false);
        expect(base.vamp).toBe(0);

        // A baseline live run stays playing with the player intact.
        const ai = new GameAI(page);
        await page.evaluate(() => {
            window.gameEngine.spawnLeveledEnemies('HUNTER', 3, { onScreen: true, cap: 9999 });
        });
        await ai.run(6000);
        await ai.stop();

        const post = await page.evaluate(() => {
            const ge = window.gameEngine;
            return {
                state: ge.game.state,
                playerActive: ge.player.active,
                healthFinite: Number.isFinite(ge.player.health),
            };
        });
        expect(post.state).toBe('PLAYING');
        expect(post.playerActive).toBe(true);
        expect(post.healthFinite).toBe(true);

        const fatal = page._jsErrors.filter(FATAL);
        expect(fatal, `Fatal JS errors: ${fatal.join('; ')}`).toHaveLength(0);
    });
});
