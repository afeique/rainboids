// ── Ship-skin registry ─────────────────────────────────────────────
// Cosmetic-only ship skins. Every skin shares the SAME collision radius
// (Player.radius, fixed for all) — skins change ONLY how the hull is
// drawn, never gameplay. Each skin module exports a `skin` object:
//
//   { id, name, desc, noseY, bankShear?, paint(ctx, r, t) }
//
// `paint` is called with `this` = the Player (or a preview stub), so it
// reads live articulation state (thrustLevel, bank, wingSweep, flapOpen,
// glidePhase). It draws ONLY the hull; the shared feedback FX (muzzle
// flash, hit flash, charge glow, level-up, cooldown orb) are layered on
// by renderer.js for every skin. `noseY` (× r) anchors the muzzle flash.

import { skin as aurora } from './aurora.js';
import { skin as vanguard } from './vanguard.js';
import { skin as apex } from './apex.js';
import { skin as smuggler } from './smuggler.js';
import { skin as skylark } from './skylark.js';
import { skin as valkyrie } from './valkyrie.js';
import { skin as wraith } from './wraith.js';
import { skin as battlecruiser } from './battlecruiser.js';
import { skin as interceptor } from './interceptor.js';
import { skin as arwing } from './arwing.js';
import { skin as viper } from './viper.js';
import { skin as aeon } from './aeon.js';

// Ordered for the Hangar grid. Aurora (current) first, Vanguard (classic)
// second, then the new designs.
export const SKINS = [
    aurora, vanguard, apex, smuggler, skylark, valkyrie,
    wraith, battlecruiser, interceptor, arwing, viper, aeon,
];

export const DEFAULT_SKIN_ID = 'aurora';

const BY_ID = Object.create(null);
for (const s of SKINS) BY_ID[s.id] = s;

export const SKIN_IDS = SKINS.map((s) => s.id);

/** Resolve a skin by id, falling back to the default for unknown ids. */
export function getSkin(id) {
    return BY_ID[id] || BY_ID[DEFAULT_SKIN_ID];
}
