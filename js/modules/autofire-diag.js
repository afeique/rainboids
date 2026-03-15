/**
 * Auto-fire diagnostic logger.
 *
 * Lightweight ring-buffer that records the last N auto-fire events.
 * When a stall is detected (no real bullet created for STALL_THRESHOLD ms),
 * the buffer is dumped to the console automatically.
 *
 * Manual dump:  window.__autofireDiag.dump()
 * Live status:  window.__autofireDiag.status()
 * Remove later: delete the import in player.js and this file.
 */

const BUFFER_SIZE = 120;       // ~2 seconds at 60 Hz
const STALL_THRESHOLD = 1500;  // ms without a real bullet → auto-dump
const DUMP_COOLDOWN = 5000;    // don't spam dumps more than once per 5 s

class AutofireDiag {
    constructor() {
        this.buf = new Array(BUFFER_SIZE);
        this.head = 0;
        this.count = 0;
        this.lastRealFireTime = 0;   // last time a bullet was actually created
        this.lastDumpTime = 0;
        this.totalCalls = 0;         // how many times record() was called
        this.totalFires = 0;         // how many times a bullet was really created
        this.stalls = 0;             // number of auto-dumps triggered
        this.enabled = true;

        // Expose on window for console access
        if (typeof window !== 'undefined') {
            window.__autofireDiag = this;
        }
    }

    /**
     * Called every tick from updateChargingSystem.
     * @param {object} snap  — a plain object with diagnostic fields
     */
    record(snap) {
        if (!this.enabled) return;
        this.totalCalls++;
        this.buf[this.head] = snap;
        this.head = (this.head + 1) % BUFFER_SIZE;
        if (this.count < BUFFER_SIZE) this.count++;

        if (snap.bulletCreated) {
            this.totalFires++;
            this.lastRealFireTime = snap.now;
        }

        // Auto-dump on stall
        if (this.lastRealFireTime > 0 &&
            snap.now - this.lastRealFireTime > STALL_THRESHOLD &&
            snap.now - this.lastDumpTime > DUMP_COOLDOWN) {
            this.stalls++;
            this._autoDump(snap.now);
        }
    }

    /** Dump the ring buffer to the console. */
    dump() {
        const entries = this._drain();
        console.group(`[AUTO-FIRE DIAG] ${entries.length} entries (${this.stalls} stalls detected)`);
        console.table(entries);
        console.groupEnd();
        return entries;
    }

    /** Print a one-liner status. */
    status() {
        const now = Date.now();
        const gap = this.lastRealFireTime ? now - this.lastRealFireTime : '(never)';
        console.log(`[AUTO-FIRE DIAG] calls=${this.totalCalls} fires=${this.totalFires} ` +
            `stalls=${this.stalls} lastFireGap=${gap}ms`);
    }

    // ── internal ──

    _autoDump(now) {
        this.lastDumpTime = now;
        const gap = now - this.lastRealFireTime;
        console.warn(`[AUTO-FIRE DIAG] ⚠ Stall detected — no bullet created for ${(gap / 1000).toFixed(1)}s. Dumping buffer:`);
        this.dump();
    }

    _drain() {
        const out = [];
        for (let i = 0; i < this.count; i++) {
            const idx = (this.head - this.count + i + BUFFER_SIZE) % BUFFER_SIZE;
            out.push(this.buf[idx]);
        }
        return out;
    }
}

export const autofireDiag = new AutofireDiag();
