// Server-event firehose: routes decoded GameEvents into the
// presentation layer (FxLayer, HUD, audio) without coupling the
// simulation to those subsystems.
//
// Solo play emits the same GameEvent shape via `simulateTick`; both
// paths ultimately funnel through this dispatcher, which is why
// presentation never has to know the difference.

import { EVT } from '../sim/protocol.js';

/**
 * @typedef {Object} FirehoseSinks
 * @property {Object} [fxLayer] - has `.ingestSimEvent(ev)` or similar
 * @property {Object} [hud]     - HUD updater
 * @property {Object} [audio]   - audio manager
 */

export class EventFirehose {
    /** @param {FirehoseSinks} sinks */
    constructor(sinks = {}) {
        this.sinks = sinks;
    }

    /**
     * Consume a single GameEvent. Dispatch is a flat switch; new
     * variants must be added here AND in `js/sim/protocol.js` AND in
     * `server/src/protocol/mod.rs`.
     */
    ingest(ev) {
        const { fxLayer, hud, audio } = this.sinks;
        switch (ev.type) {
            case EVT.BULLET_SPAWN:
                fxLayer?.spawnBulletFx?.(ev);
                audio?.playBulletSpawn?.(ev);
                break;
            case EVT.BULLET_DESPAWN:
                fxLayer?.despawnBulletFx?.(ev);
                break;
            case EVT.ENEMY_DESTROY:
                fxLayer?.enemyExplosion?.(ev);
                audio?.playEnemyExplosion?.(ev);
                break;
            case EVT.ASTEROID_DESTROY:
                fxLayer?.asteroidShatter?.(ev);
                audio?.playAsteroidShatter?.(ev);
                break;
            case EVT.ORB_COLLECT:
                fxLayer?.orbPickup?.(ev);
                audio?.playPickup?.(ev);
                hud?.onOrbCollect?.(ev);
                break;
            case EVT.PLAYER_DAMAGED:
                fxLayer?.playerHit?.(ev);
                hud?.onPlayerDamaged?.(ev);
                break;
            case EVT.PLAYER_DOWNED:
                fxLayer?.playerDowned?.(ev);
                hud?.onPlayerDowned?.(ev);
                break;
            case EVT.PLAYER_REVIVED:
                fxLayer?.playerRevived?.(ev);
                hud?.onPlayerRevived?.(ev);
                break;
            case EVT.WAVE_START:
                hud?.onWaveStart?.(ev);
                break;
            case EVT.WAVE_CLEAR:
                hud?.onWaveClear?.(ev);
                break;
            case EVT.POWERUP_OFFER:
                hud?.onPowerupOffer?.(ev);
                break;
            case EVT.POWERUP_CHOSEN:
                hud?.onPowerupChosen?.(ev);
                break;
            case EVT.HIT_FLASH:
                fxLayer?.hitFlash?.(ev);
                break;
            case EVT.DAMAGE_NUMBER:
                fxLayer?.damageNumber?.(ev);
                break;
            default:
                // Unknown variant: log once, drop. Can occur during version
                // skew if a server sends a new variant we don't understand.
                console.warn('event-firehose: unknown event type', ev.type);
                break;
        }
    }

    /** Bulk consume from an array. */
    ingestAll(events) {
        for (let i = 0; i < events.length; i++) this.ingest(events[i]);
    }
}
