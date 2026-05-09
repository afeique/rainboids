// js/net/multiplayer-modal.js — title-screen DOM modal for the v1
// multiplayer Hello/Welcome handshake.
//
// SCOPE NOTES (Week 6):
//
//   The modal is a standalone DOM element appended to <body> on first
//   open. It pulls in only the Hello/Welcome handshake — no room join,
//   no gameplay. Clicking "Multiplayer" on the title screen calls
//   `openMultiplayerModal()` which:
//
//     1. Shows a "Connecting to server…" panel with a Cancel button.
//     2. Instantiates `ConnectionTask` and awaits `.connect()`.
//     3. On welcome, swaps to a "Connected · player #N · session …"
//        panel with a Disconnect button.
//     4. On error, shows the error message and a Retry button.
//     5. Cancel/Disconnect closes the socket and the modal.
//
// Visual language: matches the existing pause-menu / shop-tab look.
// Inline styles only — no CSS sheet edits — so this WIP feature stays
// out of the production stylesheet until the Multiplayer flow ships.

import { ConnectionTask, defaultWsUrl } from './ws-client.js';

let activeModal = null;

/**
 * Open the title-screen multiplayer modal. Idempotent — calling while
 * one is already open is a no-op so a double-click never spawns two.
 *
 * @param {object} opts
 * @param {string} opts.clientVersion        e.g. VERSION import
 * @param {string} [opts.displayName]        defaults to "Pilot"
 * @param {string|null} [opts.session]       persistent session, if any
 * @param {() => void} [opts.onClose]        called whenever the modal closes
 */
export function openMultiplayerModal(opts) {
    if (activeModal) return activeModal;
    activeModal = new MultiplayerModal(opts);
    activeModal.show();
    return activeModal;
}

export function closeMultiplayerModal() {
    if (activeModal) {
        activeModal.dismiss();
    }
}

class MultiplayerModal {
    constructor({ clientVersion, displayName = 'Pilot', session = null, onClose = null }) {
        this.clientVersion = clientVersion;
        this.displayName = displayName;
        this.session = session;
        this.onClose = onClose;
        this.connection = null;

        this._buildDom();
        this._bindEscape();
    }

    show() {
        document.body.appendChild(this.root);
        // Defer connect to next frame so the "Connecting…" panel paints first.
        requestAnimationFrame(() => this._connect());
    }

    dismiss() {
        this._unbindEscape();
        try { this.connection?.disconnect(); } catch {}
        this.root.remove();
        if (activeModal === this) activeModal = null;
        try { this.onClose?.(); } catch {}
    }

    // ── network ───────────────────────────────────────────────────────────

    async _connect() {
        this._renderConnecting();
        const conn = new ConnectionTask({
            clientVersion: this.clientVersion,
            displayName: this.displayName,
            session: this.session,
        });
        this.connection = conn;
        conn.on('disconnect', () => {
            // If we've already been welcomed and the user hits Disconnect
            // explicitly, the modal goes away. If the socket dropped on
            // its own after welcome, surface that to the user.
            if (this._closing) return;
            if (conn.state === 'closed' && conn.playerId !== null) {
                this._renderError({
                    msg: 'Connection lost.',
                    wasWelcomed: true,
                });
            }
        });
        try {
            const welcome = await conn.connect();
            this._renderConnected(conn, welcome);
        } catch (err) {
            // Surface the server error code if present (set by `_handleServerError`).
            const codeName = err?.codeName ?? null;
            this._renderError({
                msg: codeName ? `${codeName}: ${err.message}` : (err?.message ?? 'Connection failed.'),
                wasWelcomed: false,
            });
        }
    }

    // ── DOM construction ─────────────────────────────────────────────────

    _buildDom() {
        const overlay = document.createElement('div');
        overlay.id = 'multiplayer-overlay';
        Object.assign(overlay.style, {
            position: 'fixed',
            inset: '0',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            background: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(4px)',
            zIndex: '9500',
            fontFamily: "'Press Start 2P', monospace",
        });

        const panel = document.createElement('div');
        Object.assign(panel.style, {
            minWidth: '420px',
            maxWidth: '560px',
            padding: '32px 36px',
            background: 'rgba(8, 12, 22, 0.92)',
            border: '2px solid rgba(140, 220, 255, 0.85)',
            borderRadius: '12px',
            boxShadow: '0 0 30px rgba(0, 120, 200, 0.45)',
            color: 'rgba(230, 240, 250, 0.95)',
            textAlign: 'center',
        });

        // Gold-gradient header to match the existing pause-menu / shop chrome.
        const header = document.createElement('div');
        Object.assign(header.style, {
            fontSize: '20px',
            letterSpacing: '2px',
            marginBottom: '24px',
            background: 'linear-gradient(180deg, #FFE3A0 0%, #FFD24A 50%, #B07A1A 100%)',
            WebkitBackgroundClip: 'text',
            backgroundClip: 'text',
            color: 'transparent',
            textShadow: '0 0 6px rgba(255, 200, 64, 0.35)',
        });
        header.textContent = 'MULTIPLAYER';
        panel.appendChild(header);

        const body = document.createElement('div');
        body.className = 'multiplayer-body';
        Object.assign(body.style, {
            fontSize: '12px',
            lineHeight: '1.7',
            minHeight: '64px',
        });
        panel.appendChild(body);

        const actions = document.createElement('div');
        actions.className = 'multiplayer-actions';
        Object.assign(actions.style, {
            marginTop: '28px',
            display: 'flex',
            gap: '14px',
            justifyContent: 'center',
        });
        panel.appendChild(actions);

        overlay.appendChild(panel);

        // Click on the dimmed backdrop dismisses (matching the shop-overlay UX).
        overlay.addEventListener('click', (ev) => {
            if (ev.target === overlay) this.dismiss();
        });

        this.root = overlay;
        this.body = body;
        this.actions = actions;
    }

    _bindEscape() {
        this._escHandler = (e) => {
            if (e.key === 'Escape') {
                e.stopPropagation();
                this.dismiss();
            }
        };
        // Capture phase so the modal swallows ESC before the engine's pause
        // handler gets it (Escape on the title screen is otherwise a no-op,
        // but this future-proofs the integration).
        window.addEventListener('keydown', this._escHandler, true);
    }

    _unbindEscape() {
        if (this._escHandler) {
            window.removeEventListener('keydown', this._escHandler, true);
            this._escHandler = null;
        }
    }

    // ── rendering ────────────────────────────────────────────────────────

    _renderConnecting() {
        this.body.innerHTML = '';
        const line = document.createElement('div');
        line.textContent = 'Connecting to server…';
        Object.assign(line.style, { color: 'rgba(140, 220, 255, 0.95)' });
        this.body.appendChild(line);

        const url = document.createElement('div');
        url.textContent = defaultWsUrl();
        Object.assign(url.style, {
            marginTop: '12px',
            fontSize: '10px',
            color: 'rgba(170, 200, 230, 0.55)',
            wordBreak: 'break-all',
        });
        this.body.appendChild(url);

        this._renderActions([
            { label: 'CANCEL', kind: 'neutral', onClick: () => this.dismiss() },
        ]);
    }

    _renderConnected(conn, welcome) {
        this.body.innerHTML = '';

        const ok = document.createElement('div');
        ok.textContent = `✓ Connected`;
        Object.assign(ok.style, {
            color: '#a3f7a3',
            fontSize: '14px',
            marginBottom: '14px',
        });
        this.body.appendChild(ok);

        const playerIdShort = String(welcome.playerId).slice(0, 8);
        const sessionShort = welcome.session.slice(0, 8);
        const detail = document.createElement('div');
        detail.textContent = `player #${playerIdShort} · session ${sessionShort}…`;
        Object.assign(detail.style, { color: 'rgba(230, 240, 250, 0.9)' });
        this.body.appendChild(detail);

        const tStr = new Date(Number(welcome.serverTimeMs)).toISOString().replace('T', ' ').replace(/\..*/, ' UTC');
        const tLine = document.createElement('div');
        tLine.textContent = `server time · ${tStr}`;
        Object.assign(tLine.style, {
            marginTop: '10px',
            fontSize: '10px',
            color: 'rgba(170, 200, 230, 0.55)',
        });
        this.body.appendChild(tLine);

        this._renderActions([
            { label: 'DISCONNECT', kind: 'danger', onClick: () => { this._closing = true; this.dismiss(); } },
        ]);
    }

    _renderError({ msg, wasWelcomed }) {
        this.body.innerHTML = '';
        const line = document.createElement('div');
        line.textContent = wasWelcomed ? 'Connection lost' : 'Failed to connect';
        Object.assign(line.style, { color: '#ff9a9a', marginBottom: '12px', fontSize: '14px' });
        this.body.appendChild(line);

        const detail = document.createElement('div');
        detail.textContent = msg;
        Object.assign(detail.style, {
            color: 'rgba(230, 230, 230, 0.85)',
            fontFamily: "'Fira Code', monospace",
            fontSize: '11px',
            wordBreak: 'break-word',
        });
        this.body.appendChild(detail);

        this._renderActions([
            {
                label: 'RETRY',
                kind: 'primary',
                onClick: () => {
                    try { this.connection?.disconnect(); } catch {}
                    this.connection = null;
                    this._closing = false;
                    this._connect();
                },
            },
            { label: 'CLOSE', kind: 'neutral', onClick: () => this.dismiss() },
        ]);
    }

    _renderActions(specs) {
        this.actions.innerHTML = '';
        for (const { label, kind, onClick } of specs) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.textContent = label;
            Object.assign(btn.style, {
                padding: '10px 18px',
                fontFamily: "'Press Start 2P', monospace",
                fontSize: '11px',
                letterSpacing: '1px',
                cursor: 'pointer',
                border: '2px solid rgba(255, 255, 255, 0.85)',
                borderRadius: '6px',
                background: 'rgba(0, 0, 0, 0.55)',
                color: 'rgba(230, 240, 250, 0.95)',
                transition: 'background 80ms ease, color 80ms ease, border-color 80ms ease',
            });
            if (kind === 'primary') {
                btn.style.borderColor = 'rgba(140, 220, 255, 1)';
                btn.style.background = 'rgba(0, 80, 130, 0.55)';
            } else if (kind === 'danger') {
                btn.style.borderColor = 'rgba(255, 160, 160, 0.95)';
                btn.style.background = 'rgba(120, 30, 30, 0.5)';
            }
            btn.addEventListener('mouseenter', () => {
                btn.style.background = 'rgba(255, 200, 64, 0.55)';
                btn.style.borderColor = '#ffe5a0';
                btn.style.color = '#fffadf';
            });
            btn.addEventListener('mouseleave', () => {
                if (kind === 'primary') {
                    btn.style.background = 'rgba(0, 80, 130, 0.55)';
                    btn.style.borderColor = 'rgba(140, 220, 255, 1)';
                } else if (kind === 'danger') {
                    btn.style.background = 'rgba(120, 30, 30, 0.5)';
                    btn.style.borderColor = 'rgba(255, 160, 160, 0.95)';
                } else {
                    btn.style.background = 'rgba(0, 0, 0, 0.55)';
                    btn.style.borderColor = 'rgba(255, 255, 255, 0.85)';
                }
                btn.style.color = 'rgba(230, 240, 250, 0.95)';
            });
            btn.addEventListener('click', onClick);
            this.actions.appendChild(btn);
        }
    }
}
