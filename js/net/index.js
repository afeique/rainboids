// js/net/ — online-only networking layer.
//
// v1 (Week 6) surface: just the Hello/Welcome handshake. The other helpers
// (predictor, interpolator, firehose, matchmaking) are scaffolds for later
// weeks and can be re-exported from here as they're wired into the engine.

export {
    ConnectionTask,
    SESSION_STORAGE_KEY,
    FEATURE_FLAG_KEY,
    FEATURE_FLAG_QUERY,
    multiplayerEnabled,
    defaultWsUrl,
} from './ws-client.js';

export {
    WIRE_VERSION,
    SIM_VERSION,
    isCompatible,
    C2S,
    S2C,
    ErrCode,
    ErrCodeName,
    LeaveReason,
    DespawnReason,
    DmgKind,
    WeaponId,
    EntityRefKind,
    encodeClientMsg,
    encodeHello,
    decodeServerMsg,
    NotImplementedError,
} from './protocol.js';

export {
    Reader,
    Writer,
    uuidBytesToString,
    uuidStringToBytes,
    bufToView,
} from './codec.js';

export { Matchmaking } from './matchmaking.js';
