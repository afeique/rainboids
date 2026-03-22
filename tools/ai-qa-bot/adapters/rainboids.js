/**
 * AI QA Bot — Rainboids Game Adapter
 *
 * Full API-direct adapter for the Rainboids game.
 * Uses window.gameEngine for state extraction and input injection.
 */

export const rainboidsAdapter = {
    name: 'Rainboids',
    url: 'http://localhost:8090',
    viewport: { width: 1280, height: 720 },
    driverType: 'api-direct',

    controls: {
        up: 'w', down: 's', left: 'a', right: 'd',
        fire: 'mouse_left',
        secondary: 'mouse_right',
        skills: ['1', '2', '3', '4'],
        pause: 'Escape',
    },

    async startSequence(page) {
        await page.waitForFunction(
            () => window.gameEngine?.game?.state === 'TITLE_SCREEN',
            { timeout: 15_000 }
        );
        await page.evaluate(() => {
            const ge = window.gameEngine;
            try { ge.audioManager?.initializeAudio?.(); } catch (_) {}
            ge.init();
            ge.game.state = 'PLAYING';
        });
        await page.waitForFunction(
            () => window.gameEngine?.game?.state === 'PLAYING',
            { timeout: 10_000 }
        );
    },

    async stateExtractor(page) {
        // Delegates to StateReader — this is just the raw extraction
        return page.evaluate(() => {
            const ge = window.gameEngine;
            if (!ge) return null;
            return { state: ge.game?.state, wave: ge.game?.currentWave };
        });
    },

    isGameOver(state) {
        return state?.gameState === 'GAME_OVER';
    },

    isPlaying(state) {
        return state?.gameState === 'PLAYING';
    },

    stateSignals: {
        playing: 'Game field with player ship, asteroids, enemies, HUD showing health/money/wave',
        paused: 'Pause menu overlay with tabs (STATS, CONTROLS, SKILLS)',
        gameOver: 'GAME OVER text with final score',
        shop: 'Shop interface with item grid and category tabs',
    },

    balance: {
        weapons: ['PULSE_CANNON', 'STORM_NEEDLES', 'SCATTER_GUN', 'RAIL_DRIVER', 'LANCE_BEAM'],
        powerWeapons: ['CHARGE_SHOT', 'MINE_LAYER', 'NOVA_BLAST', 'LIGHTNING_ARC', 'MISSILE_SALVO'],
        skills: ['BULWARK', 'REPAIR_NANITES', 'PHASE_DASH', 'DEFLECTOR_ORBS', 'EMP_PULSE', 'TRACTOR_SHIELD'],
        upgrades: [
            'RAPID_FIRE', 'MULTI_SHOT', 'HOMING', 'PIERCING', 'EXPLOSIVE',
            'CRIT_CHANCE', 'CRIT_DAMAGE', 'LONG_RANGE',
            'HEALTH_BOOST', 'SHIELD_BOOST', 'SPEED_BOOST', 'SPARE_SHIP',
        ],
        enemies: [
            'HUNTER', 'GUARDIAN', 'WASP', 'STALKER', 'DRIFTER',
            'PROWLER', 'WEAVER', 'SENTINEL', 'TANGERINE', 'TITAN',
        ],
    },
};
