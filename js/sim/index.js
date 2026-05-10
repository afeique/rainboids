// js/sim/ — pure simulation layer.
//
// This module is the public surface of the simulation. The engine
// driver and the network layer import from here. Nothing inside
// js/sim/ may import from js/render/, js/audio/, js/ui/, or anything
// DOM-touching.
//
// Modules under this directory mirror `server/src/sim/` 1:1. When you
// add a file here, add the Rust counterpart in the same PR; the parity
// harness (CI) cross-checks every prediction-relevant rule.

export { WIRE_VERSION, SIM_VERSION, isCompatible } from './version.js';
export {
    Fxp,
    FXP_FRACT_BITS,
    FXP_ONE_RAW,
    FXP_ZERO,
    FXP_ONE,
    FXP_HALF,
    FXP_NEG_ONE,
    FXP_PI,
    FXP_PI_RAW,
    FXP_TWO_PI,
    FXP_TWO_PI_RAW,
    FXP_HALF_PI,
    FXP_HALF_PI_RAW,
    FXP_DT,
    FXP_DT_RAW,
    fxpMulRaw,
} from './fxp.js';
export { fxpSin, fxpCos, fxpAtan2, reduceModTwoPiRaw } from './trig.js';
export { Pcg64 } from './rng.js';
export { Reader, Writer } from './codec.js';
export {
    C2S,
    S2C,
    EVT,
    ENTITY_REF,
    ErrCode,
    LeaveReason,
    DespawnReason,
    DmgKind,
    WeaponId,
    encodeClientMsg,
    decodeClientMsg,
    encodeServerMsg,
    decodeServerMsg,
    writeClientMsg,
    readClientMsg,
    writeServerMsg,
    readServerMsg,
    writeGameEvent,
    readGameEvent,
    writePackedInput,
    readPackedInput,
    writePeerInfo,
    readPeerInfo,
    writeSnapshotPayload,
    readSnapshotPayload,
    writeShipState,
    readShipState,
} from './protocol.js';
export {
    pack,
    unpack,
    emptyPacked,
    emptyPlayerInput,
    BTN_SHOOT,
    BTN_DASH,
    BTN_AB1,
    BTN_AB2,
} from './input.js';
export { freshGameState, freshShipState, freshWaveState, freshDropState } from './state.js';
export { updateShip, updateShips } from './ship.js';
export { updateWave, getWaveConfig, getEnemyLevel, getAsteroidLevel, isBossWave } from './wave.js';
export { updateDrop, updateDrops } from './drops.js';
