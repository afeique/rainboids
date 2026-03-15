/**
 * AI QA Bot — Adapter Registry
 *
 * Register all game adapters here. To add a new game:
 * 1. Create adapters/your-game.js implementing the adapter interface
 * 2. Import and register it below
 */

import { rainboidsAdapter } from './rainboids.js';

export const ADAPTERS = {
    rainboids: rainboidsAdapter,
    // Future adapters:
    // asteroids: asteroidsAdapter,
    // spacewar: spacewarAdapter,
};

export function getAdapter(name) {
    const adapter = ADAPTERS[name];
    if (!adapter) {
        throw new Error(`Unknown game adapter: "${name}". Available: ${Object.keys(ADAPTERS).join(', ')}`);
    }
    return adapter;
}
