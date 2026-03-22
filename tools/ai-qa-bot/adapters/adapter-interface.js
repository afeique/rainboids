/**
 * AI QA Bot — Game Adapter Interface
 *
 * Defines the contract that game adapters must implement.
 * Each adapter provides game-specific configuration and hooks.
 *
 * To add support for a new game:
 * 1. Create a new file in adapters/ (e.g., asteroids.js)
 * 2. Export an object implementing this interface
 * 3. Register it in adapters/index.js
 */

/**
 * @typedef {object} GameAdapter
 * @property {string} name - Human-readable game name
 * @property {string} url - URL to load the game
 * @property {{ width: number, height: number }} viewport - Browser viewport size
 *
 * @property {object} controls - Key/mouse mapping
 * @property {string} controls.up - Up movement key (e.g., 'w')
 * @property {string} controls.down - Down movement key
 * @property {string} controls.left - Left movement key
 * @property {string} controls.right - Right movement key
 * @property {string} controls.fire - Fire input ('mouse_left' or key)
 * @property {string} [controls.secondary] - Secondary fire
 * @property {string[]} [controls.skills] - Skill activation keys
 * @property {string} [controls.pause] - Pause key
 *
 * @property {function} [stateExtractor] - (page) => state snapshot (API-direct mode)
 * @property {function} startSequence - (page) => Promise<void> — get from menu to gameplay
 * @property {function} [isGameOver] - (state) => boolean
 * @property {function} [isPlaying] - (state) => boolean
 *
 * @property {string} driverType - 'api-direct' | 'generic'
 *
 * @property {object} [stateSignals] - Vision-mode state detection hints
 * @property {string} stateSignals.playing - Description of playing state visuals
 * @property {string} stateSignals.paused - Description of paused state visuals
 * @property {string} stateSignals.gameOver - Description of game over visuals
 *
 * @property {object} [balance] - Game-specific balance analysis hints
 * @property {string[]} balance.weapons - List of weapon names
 * @property {string[]} balance.upgrades - List of upgrade names
 * @property {string[]} balance.enemies - List of enemy types
 */

/**
 * Validate that an adapter has required fields.
 * @param {object} adapter
 * @returns {string[]} List of validation errors (empty = valid)
 */
export function validateAdapter(adapter) {
    const errors = [];
    if (!adapter.name) errors.push('Missing: name');
    if (!adapter.url) errors.push('Missing: url');
    if (!adapter.viewport) errors.push('Missing: viewport');
    if (!adapter.controls) errors.push('Missing: controls');
    if (!adapter.startSequence) errors.push('Missing: startSequence');
    if (!adapter.driverType) errors.push('Missing: driverType');
    return errors;
}
