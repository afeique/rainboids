// js/engine/ — top-level driver for the Rainboids client.
//
// The driver layer sits between `js/main.js` (browser glue) and
// `js/modules/game-engine.js` (the existing simulation + renderer).
//
// Its job is to make the solo and online code paths converge: both
// modes go through the same driver, the same GameEngine, the same
// renderer. The driver only differs in whether it holds a live
// `ConnectionTask` open in the background.
//
// As Phase 1 of the multiplayer plan lands (extracting `simulateTick`
// out of game-engine.js into js/sim/), the driver will compose
// Predictor + Interpolator + EventFirehose for the online path.
// Until then, online == solo + a live socket — verified by the
// "solo and multiplayer run identically" property of v5.85.0.

export {
    EngineDriver,
    ENGINE_MODE_SOLO,
    ENGINE_MODE_ONLINE,
} from './engine-driver.js';
export { OnlineStatusOverlay } from './online-status-overlay.js';
