/**
 * QA-28: New-type WAVE ROSTER insertion (ENMY-03/04/05/07/09/10)
 *
 * The six new enemy types — PHANTOM (cloak), WRAITHWORM (blink-burrow),
 * NULL_DRONE (suppress-aura), PRISM_MIRROR (reflect), DEVOURER (absorb),
 * LEECH (buff-strip) — are now in the LIVE wave roster (WAVE_DATA), not just
 * the debug spawn hooks. QA-22..27 cover each ability's mechanic via the
 * `spawnX()` debug hooks; THIS spec proves the types reach the field through
 * the real wave path. It asserts:
 *   (a) WAVE_DATA references the new types only on NON-boss waves, and the
 *       documented placement waves still carry each type (a guard so a future
 *       edit can't silently drop a type back to debug-only).
 *   (b) Spawning a late wave's full roster through the LIVE spawn path
 *       (gameEngine.spawnLeveledEnemies — the same call spawnSubWave uses)
 *       lands a new-type enemy in enemyPool.activeObjects with its ability
 *       config wired (e.g. PHANTOM.cloak, LEECH.stripsBuff).
 *   (c) Boss waves (3,6,9,…,30) carry NONE of the new types — boss-wave
 *       composition is untouched.
 *   (d) NO fatal JS errors while several new-type waves run live frames (the
 *       abilities fire on spawn: cloak / blink / suppress / reflect / absorb /
 *       strip all tick without throwing).
 *
 * Reaching the roster: there is no clean engine "jump to wave N" debug path,
 * so (b)/(d) read WAVE_DATA in-page (dynamic import) and replay a wave's
 * groups through the LIVE spawnLeveledEnemies path — identical to how
 * wave-manager.spawnSubWave spawns each group. This is faithful to "the type
 * appears in play by being referenced in WAVE_DATA" without running a full
 * 30-wave survival.
 */

import { test, expect } from '@playwright/test';
import { loadGame, startGame } from '../helpers/game-helpers.js';

const NEW_TYPES = ['PHANTOM', 'WRAITHWORM', 'NULL_DRONE', 'PRISM_MIRROR', 'DEVOURER', 'LEECH'];
// Default 30-wave campaign: stage finals (every 3rd wave) are bosses.
const BOSS_WAVES = [3, 6, 9, 12, 15, 18, 21, 24, 27, 30];

// Collect any page errors so we can assert "no fatal JS errors" at the end.
function attachErrorCollector(page) {
    const errors = [];
    page.on('pageerror', (err) => errors.push(String(err)));
    page.on('console', (msg) => {
        if (msg.type() === 'error') errors.push(msg.text());
    });
    return errors;
}

// Read WAVE_DATA in-page and return, per wave number, the flat list of group
// types across all sub-waves (boss groups included).
async function readRoster(page) {
    return page.evaluate(async () => {
        const { WAVE_DATA } = await import('/js/modules/wave/wave-data.js');
        const out = {};
        for (const [w, cfg] of Object.entries(WAVE_DATA)) {
            const groups = (cfg.subWaves || []).flat();
            out[w] = {
                isBossWave: !!cfg.isBossWave,
                types: groups.map((g) => g.type),
            };
        }
        return out;
    });
}

// Replay a wave's full roster through the LIVE spawn path (the same call
// spawnSubWave uses per group). Skips boss groups (modular boss spawns via a
// separate hook and isn't relevant here). Returns the post-spawn pool types.
async function spawnWaveRoster(page, waveNumber) {
    return page.evaluate(async (w) => {
        const ge = window.gameEngine;
        const { WAVE_DATA } = await import('/js/modules/wave/wave-data.js');
        const cfg = WAVE_DATA[w];
        // Set the live wave so level scaling reads the right tier.
        ge.game.currentWave = w;
        for (const group of (cfg.subWaves || []).flat()) {
            if (group.isBoss) continue; // boss spawns via a separate hook
            ge.spawnLeveledEnemies(group.type, group.count, { onScreen: true, cap: 9999 });
        }
        return ge.enemyPool.activeObjects.map((e) => e.type);
    }, waveNumber);
}

test.describe('QA-28: New-type wave roster', () => {

    test.beforeEach(async ({ page }) => {
        await loadGame(page);
        await startGame(page);
    });

    // ------------------------------------------------------------------
    // (a) Each new type is referenced in WAVE_DATA, on non-boss waves only.
    // ------------------------------------------------------------------

    test('each new type is in the live roster on NON-boss waves', async ({ page }) => {
        const roster = await readRoster(page);

        // Every new type appears somewhere in the campaign roster.
        for (const type of NEW_TYPES) {
            const waves = Object.entries(roster)
                .filter(([, info]) => info.types.includes(type))
                .map(([w]) => Number(w));
            expect(waves.length, `${type} should appear in at least one wave`).toBeGreaterThan(0);
            // None of those waves may be a boss wave.
            for (const w of waves) {
                expect(BOSS_WAVES, `${type} must not appear on boss wave ${w}`).not.toContain(w);
                expect(roster[w].isBossWave, `${type}'s wave ${w} must not be a boss wave`).toBe(false);
            }
        }
    });

    // ------------------------------------------------------------------
    // (b) The documented intro waves still carry their headline new type.
    //     A guard against a future edit silently regressing a type to
    //     debug-spawn-only.
    // ------------------------------------------------------------------

    test('documented intro waves still carry their new type', async ({ page }) => {
        const roster = await readRoster(page);
        // (wave, expected new type) — the first-appearance / showcase waves.
        // 6.x mid-game-identity pass relocated the themed gauntlets; the
        // showcase/first-appearance waves moved (always LATER, never earlier).
        const expectations = [
            [16, 'WRAITHWORM'],   // Overload (Volt) — was 14
            [17, 'NULL_DRONE'],   // Overload (Volt) — unchanged
            [19, 'LEECH'],        // Outbreak (Toxic) — was 11
            [22, 'PHANTOM'],      // Hall of Mirrors (Void) — was 19
            [22, 'DEVOURER'],     // Hall of Mirrors (Void) — unchanged
            [23, 'PRISM_MIRROR'], // Hall of Mirrors (Radiant) — unchanged
        ];
        for (const [w, type] of expectations) {
            expect(roster[w], `wave ${w} should exist`).toBeDefined();
            expect(roster[w].types, `wave ${w} should carry ${type}`).toContain(type);
        }
    });

    // ------------------------------------------------------------------
    // (b cont.) Spawning a late wave's roster lands a new-type enemy in the
    // pool with its ability wired (LIVE spawn path, not the debug hook).
    // ------------------------------------------------------------------

    test('wave 22 roster spawns a live DEVOURER + PHANTOM with abilities wired', async ({ page }) => {
        const types = await spawnWaveRoster(page, 22);
        // Wave 22 (Hall of Mirrors) carries both DEVOURER (absorb) and PHANTOM (cloak).
        expect(types).toContain('DEVOURER');
        expect(types).toContain('PHANTOM');

        const wired = await page.evaluate(() => {
            const ge = window.gameEngine;
            const dev = ge.enemyPool.activeObjects.find((e) => e.type === 'DEVOURER' && e.active);
            const ph = ge.enemyPool.activeObjects.find((e) => e.type === 'PHANTOM' && e.active);
            return {
                devActive: !!dev,
                devEats: !!(dev && dev.eatsProjectiles && dev.maw),
                devElement: dev ? dev.element : null,
                phantomActive: !!ph,
                phantomCloak: !!(ph && ph.cloak),
                phantomElement: ph ? ph.element : null,
            };
        });
        expect(wired.devActive).toBe(true);
        expect(wired.devEats).toBe(true);
        expect(wired.devElement).toBe('VOID');
        expect(wired.phantomActive).toBe(true);
        expect(wired.phantomCloak).toBe(true);
        expect(wired.phantomElement).toBe('VOID');
    });

    test('wave 16 spawns a live WRAITHWORM (blink) and wave 19 a live LEECH (strip)', async ({ page }) => {
        // Overload (Volt) — WRAITHWORM's blink-burrow is wired on spawn.
        const w16 = await spawnWaveRoster(page, 16);
        expect(w16).toContain('WRAITHWORM');
        const ww = await page.evaluate(() => {
            const ge = window.gameEngine;
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'WRAITHWORM' && x.active);
            return { blink: !!(e && e.blink), element: e ? e.element : null };
        });
        expect(ww.blink).toBe(true);
        expect(ww.element).toBe('VOLT');

        // Outbreak (Toxic) — LEECH's buff-strip is wired on spawn.
        const w19 = await spawnWaveRoster(page, 19);
        expect(w19).toContain('LEECH');
        const leech = await page.evaluate(() => {
            const ge = window.gameEngine;
            const e = ge.enemyPool.activeObjects.find((x) => x.type === 'LEECH' && x.active);
            return { strips: !!(e && e.stripsBuff), element: e ? e.element : null };
        });
        expect(leech.strips).toBe(true);
        expect(leech.element).toBe('TOXIC');
    });

    // ------------------------------------------------------------------
    // (c) Boss waves carry none of the new types.
    // ------------------------------------------------------------------

    test('boss waves carry none of the new types', async ({ page }) => {
        const roster = await readRoster(page);
        for (const w of BOSS_WAVES) {
            expect(roster[w], `boss wave ${w} should exist`).toBeDefined();
            expect(roster[w].isBossWave).toBe(true);
            for (const type of NEW_TYPES) {
                expect(roster[w].types, `boss wave ${w} must not contain ${type}`).not.toContain(type);
            }
        }
    });

    // ------------------------------------------------------------------
    // (d) Several new-type waves run live frames with no fatal JS errors.
    //     The abilities fire on spawn (cloak / blink / suppress / reflect /
    //     absorb / strip) — this exercises them all live in one pass.
    // ------------------------------------------------------------------

    test('no fatal JS errors progressing through new-type waves', async ({ page }) => {
        const errors = attachErrorCollector(page);

        // Spawn a spread of late-wave rosters that between them cover all six
        // new types (17 → NULL_DRONE+WRAITHWORM, 19 → LEECH, 22 → PHANTOM+
        // DEVOURER, 23 → PRISM_MIRROR+PHANTOM), running real frames between each
        // so update()/draw() tick every ability.
        for (const w of [17, 19, 22, 23]) {
            await spawnWaveRoster(page, w);
            await page.waitForTimeout(500);
            // Clear the field through the real damage path before the next wave
            // so the pool doesn't pile up unboundedly.
            await page.evaluate(() => {
                const ge = window.gameEngine;
                for (const e of [...ge.enemyPool.activeObjects]) {
                    ge.applyDamageToEnemy(e, 1e6, { showNumber: false });
                    if (e.health <= 0) {
                        e._deathFlash = 8;
                        e._deathFlashMax = 8;
                        ge.onEnemyKill(e);
                    }
                }
            });
            await page.waitForTimeout(200);
        }

        // The per-wave specs above assert presence; here we only care about
        // error-freedom while every ability ticks live.
        const fatal = errors.filter((e) =>
            !/favicon|ResizeObserver|AudioContext|sfxr|Failed to load resource/i.test(e));
        expect(fatal).toEqual([]);
    });
});
