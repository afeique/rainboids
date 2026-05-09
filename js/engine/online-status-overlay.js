// OnlineStatusOverlay — small DOM strip in the top-right corner showing
// the multiplayer connection state.
//
// Pure DOM, no canvas integration: the goal is "single-player and
// multiplayer run identically", and the canvas/renderer is shared between
// both modes. The status badge lives outside that path so it can't
// accidentally affect frame timing or rendering.
//
// Visual states:
//   show({playerId, session})   →  🟢 ONLINE · player #N · ##########
//   showReconnecting()          →  🟡 RECONNECTING…
//   showDisconnected()          →  🔴 DISCONNECTED  (auto-hide after 4s)
//   hide()                      →  removed from DOM

const OVERLAY_ID = 'rainboids-online-status';
const AUTO_HIDE_MS = 4_000;

const COLORS = {
    online: { dot: '#3aff9c', text: '#cef9e0', border: 'rgba(58, 255, 156, 0.6)' },
    reconnecting: { dot: '#ffcb47', text: '#ffe9a8', border: 'rgba(255, 203, 71, 0.6)' },
    disconnected: { dot: '#ff5d63', text: '#ffd4d6', border: 'rgba(255, 93, 99, 0.6)' },
};

export class OnlineStatusOverlay {
    /** @param {{ document?: Document }} [deps] */
    constructor({ document: doc = (typeof document !== 'undefined' ? document : null) } = {}) {
        this.doc = doc;
        this.root = null;
        this._autoHideTimer = null;
    }

    /** Render the connected state. */
    show({ playerId, session } = {}) {
        if (!this.doc) return;
        this._clearTimer();
        const root = this._ensureRoot();
        root.innerHTML = '';
        root.appendChild(
            this._buildBadge({
                state: 'online',
                label: 'ONLINE',
                detail: `player #${formatPlayerId(playerId)} · ${shortSession(session)}`,
            }),
        );
        this._applyStyle(root, 'online');
    }

    /** Render the transient reconnecting state. */
    showReconnecting() {
        if (!this.doc) return;
        this._clearTimer();
        const root = this._ensureRoot();
        root.innerHTML = '';
        root.appendChild(
            this._buildBadge({
                state: 'reconnecting',
                label: 'RECONNECTING…',
                detail: '',
            }),
        );
        this._applyStyle(root, 'reconnecting');
    }

    /** Render the terminal disconnected state, auto-hide after AUTO_HIDE_MS. */
    showDisconnected() {
        if (!this.doc) return;
        this._clearTimer();
        const root = this._ensureRoot();
        root.innerHTML = '';
        root.appendChild(
            this._buildBadge({
                state: 'disconnected',
                label: 'DISCONNECTED',
                detail: 'connection lost',
            }),
        );
        this._applyStyle(root, 'disconnected');
        this._autoHideTimer = setTimeout(() => this.hide(), AUTO_HIDE_MS);
    }

    /** Remove the overlay. Idempotent. */
    hide() {
        this._clearTimer();
        if (this.root && this.root.parentNode) {
            this.root.parentNode.removeChild(this.root);
        }
        this.root = null;
    }

    /* ─── internals ──────────────────────────────────────────────────── */

    _ensureRoot() {
        if (this.root) return this.root;
        const existing = this.doc.getElementById(OVERLAY_ID);
        if (existing) {
            this.root = existing;
            return existing;
        }
        const el = this.doc.createElement('div');
        el.id = OVERLAY_ID;
        Object.assign(el.style, {
            position: 'fixed',
            top: '12px',
            right: '12px',
            zIndex: '9000',
            pointerEvents: 'none',
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '10px',
            letterSpacing: '0.5px',
        });
        this.doc.body.appendChild(el);
        this.root = el;
        return el;
    }

    _buildBadge({ state, label, detail }) {
        const wrap = this.doc.createElement('div');
        Object.assign(wrap.style, {
            display: 'inline-flex',
            alignItems: 'center',
            gap: '8px',
            padding: '6px 10px',
            background: 'rgba(8, 12, 22, 0.85)',
            border: `1px solid ${COLORS[state].border}`,
            borderRadius: '4px',
        });
        const dot = this.doc.createElement('span');
        Object.assign(dot.style, {
            display: 'inline-block',
            width: '8px',
            height: '8px',
            borderRadius: '50%',
            background: COLORS[state].dot,
            boxShadow: `0 0 6px ${COLORS[state].dot}`,
        });
        wrap.appendChild(dot);

        const text = this.doc.createElement('span');
        text.style.color = COLORS[state].text;
        text.textContent = detail ? `${label} · ${detail}` : label;
        wrap.appendChild(text);
        return wrap;
    }

    _applyStyle(/* root */ _r, /* state */ _s) {
        // Reserved for future per-state root-level styling (animations, etc.)
        // Current per-badge styling is enough for v1.
    }

    _clearTimer() {
        if (this._autoHideTimer) {
            clearTimeout(this._autoHideTimer);
            this._autoHideTimer = null;
        }
    }
}

function formatPlayerId(id) {
    if (id == null) return '?';
    return typeof id === 'bigint' ? id.toString() : String(id);
}

function shortSession(s) {
    if (!s || typeof s !== 'string') return '????????';
    // Show the first 8 hex chars of the canonical UUID.
    return s.replace(/-/g, '').slice(0, 8);
}
