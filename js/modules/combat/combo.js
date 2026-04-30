// Combo meter — Galaga-mode kill chain.
//
// Each enemy kill bumps the combo if within `windowMs` of the last.
// At combo×10 the player gets a 5-second overdrive (1.5× damage,
// 2× fire rate). Drop-rate multiplier scales with combo.

export class Combo {
    constructor(events) {
        this.events = events;
        this.count = 0;
        this.lastKillAt = 0;
        this.windowMs = 1500;
        this.overdriveUntil = 0;
        this._highestThisRun = 0;
        this._milestoneShown = 0;
    }

    onKill() {
        const now = performance.now();
        if (now - this.lastKillAt < this.windowMs) {
            this.count++;
        } else {
            this.count = 1;
        }
        this.lastKillAt = now;
        if (this.count > this._highestThisRun) this._highestThisRun = this.count;
        // Trigger overdrive at every multiple of 10
        if (this.count > 0 && this.count % 10 === 0) {
            this.overdriveUntil = now + 5000;
            if (this.events) this.events.emit('combo:overdrive', { count: this.count });
        }
    }

    tick() {
        const now = performance.now();
        if (this.count > 0 && now - this.lastKillAt > this.windowMs) {
            this.count = 0;
        }
    }

    isOverdrive() {
        return performance.now() < this.overdriveUntil;
    }

    // Drop multiplier — feeds back into pickup drop rate.
    dropMultiplier() {
        if (this.count >= 20) return 2.5;
        if (this.count >= 10) return 2.0;
        if (this.count >= 5)  return 1.4;
        return 1.0;
    }

    scoreMultiplier() {
        if (this.count >= 20) return 3;
        if (this.count >= 10) return 2;
        if (this.count >= 5)  return 1.5;
        return 1;
    }

    reset() {
        this.count = 0;
        this.overdriveUntil = 0;
    }
}
