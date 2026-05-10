// js/net/multiplayer-modal.js — title-screen DOM modal for the v1
// multiplayer flow (Hello/Welcome + matchmaking).
//
// SCOPE NOTES (Weeks 6-9):
//
//   The modal is a standalone DOM element appended to <body> on first
//   open. Clicking "Multiplayer" on the title screen calls
//   `openMultiplayerModal()` which:
//
//     1. Shows a "Connecting to server…" panel with a Cancel button.
//     2. Instantiates `ConnectionTask` and awaits `.connect()`.
//     3. On welcome, swaps to a matchmaking menu with three options:
//          • QUICK MATCH    — fire-and-await `QuickMatch`
//          • CREATE ROOM    — name + public/private + max-players form
//          • JOIN BY CODE   — 6-char alphanumeric code form
//     4. After RoomJoined, shows a "✓ Created room {CODE} · waiting"
//        panel with the "▶ START MULTIPLAYER GAME" handoff button.
//     5. On error, shows the error message inline (Create/Join keep the
//        user's typed input) with a Retry / Back path.
//     6. Cancel/Disconnect closes the socket and the modal.
//
// Visual language: matches the existing pause-menu / shop-tab look.
// Inline styles only — no CSS sheet edits — so this WIP feature stays
// out of the production stylesheet until the Multiplayer flow ships.

import { Matchmaking } from './matchmaking.js';
import { ConnectionTask, defaultWsUrl } from './ws-client.js';

let activeModal = null;

/**
 * Open the title-screen multiplayer modal. Idempotent — calling while
 * one is already open is a no-op so a double-click never spawns two.
 *
 * @param {object} opts
 * @param {string} opts.clientVersion          e.g. VERSION import
 * @param {string} [opts.displayName]          defaults to "Pilot"
 * @param {string|null} [opts.session]         persistent session, if any
 * @param {() => void} [opts.onClose]          called whenever the modal closes
 * @param {(connection: object, welcome: object) => void} [opts.onStartGame]
 *        called when the player clicks "▶ START MULTIPLAYER GAME". The caller
 *        takes ownership of the live ConnectionTask. If omitted, only the
 *        Disconnect action is shown (modal is then a v1 connectivity probe).
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
    constructor({
        clientVersion,
        displayName = 'Pilot',
        session = null,
        onClose = null,
        onStartGame = null,
    }) {
        this.clientVersion = clientVersion;
        this.displayName = displayName;
        this.session = session;
        this.onClose = onClose;
        // onStartGame(connection, welcome): caller takes ownership of the
        // ConnectionTask and continues using it for the in-game session.
        // The modal closes itself but leaves the socket open.
        this.onStartGame = onStartGame;
        this.connection = null;
        this.welcome = null;

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
        // If the connection was handed off via _handoffToGame, the
        // caller owns it now — don't disconnect the socket out from
        // under them.
        if (this.connection && this.connection !== this._releasedConnection) {
            try { this.connection.disconnect(); } catch {}
        }
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
        this.welcome = welcome;
        // Cache the Matchmaking helper across panel transitions — one per
        // ConnectionTask. Re-attaching listeners every panel switch is fine,
        // but the helper is cheap enough to share.
        if (!this.matchmaking || this.matchmaking.conn !== conn) {
            this.matchmaking = new Matchmaking(conn);
        }

        const ok = document.createElement('div');
        ok.textContent = `✓ Connected`;
        Object.assign(ok.style, {
            color: '#a3f7a3',
            fontSize: '14px',
            marginBottom: '10px',
        });
        this.body.appendChild(ok);

        const playerIdShort = String(welcome.playerId).slice(0, 8);
        const sessionShort = welcome.session.slice(0, 8);
        const detail = document.createElement('div');
        detail.textContent = `player #${playerIdShort} · session ${sessionShort}…`;
        Object.assign(detail.style, { color: 'rgba(230, 240, 250, 0.9)', fontSize: '11px' });
        this.body.appendChild(detail);

        // Three matchmaking entry points. Each is a labeled button that
        // swaps the panel into a sub-flow. The "(coming soon)" line for
        // QuickMatch keeps the v1 connectivity-probe shape available
        // when callers don't wire `onStartGame`.
        const menu = document.createElement('div');
        Object.assign(menu.style, {
            marginTop: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
            alignItems: 'stretch',
        });
        const mkBtn = (label, onClick) => {
            const b = document.createElement('button');
            b.type = 'button';
            b.textContent = label;
            this._styleMenuButton(b);
            b.addEventListener('click', onClick);
            return b;
        };
        menu.appendChild(mkBtn('QUICK MATCH', () => this._renderQuickMatch(conn, welcome)));
        menu.appendChild(mkBtn('CREATE ROOM', () => this._renderCreateRoom(conn, welcome)));
        menu.appendChild(mkBtn('JOIN BY CODE', () => this._renderJoinByCode(conn, welcome)));
        this.body.appendChild(menu);

        this._renderActions([
            { label: 'DISCONNECT', kind: 'danger', onClick: () => { this._closing = true; this.dismiss(); } },
        ]);
    }

    _styleMenuButton(btn) {
        Object.assign(btn.style, {
            padding: '12px 16px',
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '11px',
            letterSpacing: '1px',
            cursor: 'pointer',
            border: '2px solid rgba(140, 220, 255, 0.85)',
            borderRadius: '6px',
            background: 'rgba(0, 60, 100, 0.45)',
            color: 'rgba(230, 240, 250, 0.95)',
            transition: 'background 80ms ease, color 80ms ease, border-color 80ms ease',
        });
        btn.addEventListener('mouseenter', () => {
            btn.style.background = 'rgba(255, 200, 64, 0.45)';
            btn.style.borderColor = '#ffe5a0';
            btn.style.color = '#fffadf';
        });
        btn.addEventListener('mouseleave', () => {
            btn.style.background = 'rgba(0, 60, 100, 0.45)';
            btn.style.borderColor = 'rgba(140, 220, 255, 0.85)';
            btn.style.color = 'rgba(230, 240, 250, 0.95)';
        });
    }

    /* ─── matchmaking sub-flows ─────────────────────────────────────── */

    /**
     * Quick Match flow. Sends `QuickMatch`, awaits `RoomJoined`, then shows
     * the post-join confirmation. On error, surfaces a retry path.
     */
    async _renderQuickMatch(conn, welcome) {
        this._renderInFlight('Searching for a match…');
        try {
            const room = await this.matchmaking.quickMatch();
            this._renderRoomJoined(conn, welcome, room);
        } catch (err) {
            this._renderMmError(conn, welcome, err, 'Quick match failed');
        }
    }

    /**
     * Create Room flow. Renders the form (name + public/private + max
     * players), then on submit fires `CreateRoom` and routes the response.
     */
    _renderCreateRoom(conn, welcome) {
        this.body.innerHTML = '';

        const heading = document.createElement('div');
        heading.textContent = 'CREATE ROOM';
        Object.assign(heading.style, {
            fontSize: '12px',
            color: 'rgba(140, 220, 255, 0.95)',
            letterSpacing: '1.5px',
            marginBottom: '14px',
        });
        this.body.appendChild(heading);

        const form = document.createElement('form');
        Object.assign(form.style, { display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' });
        this.body.appendChild(form);

        const nameInput = this._mkTextInput('Room name', 'Pilot\'s lobby', { maxLength: 32 });
        form.appendChild(nameInput.row);

        const playersInput = this._mkSelect('Max players', [
            { value: '2', label: '2' },
            { value: '3', label: '3' },
            { value: '4', label: '4' },
        ], '4');
        form.appendChild(playersInput.row);

        const publicLabel = document.createElement('label');
        Object.assign(publicLabel.style, {
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            color: 'rgba(230, 240, 250, 0.85)',
            fontSize: '11px',
            cursor: 'pointer',
        });
        const publicCb = document.createElement('input');
        publicCb.type = 'checkbox';
        publicCb.checked = true;
        publicCb.style.cursor = 'pointer';
        const publicTxt = document.createElement('span');
        publicTxt.textContent = 'Public (visible in browse list)';
        publicLabel.appendChild(publicCb);
        publicLabel.appendChild(publicTxt);
        form.appendChild(publicLabel);

        const errLine = document.createElement('div');
        Object.assign(errLine.style, {
            display: 'none',
            color: '#ff9a9a',
            fontSize: '11px',
            marginTop: '4px',
            fontFamily: "'Fira Code', monospace",
            wordBreak: 'break-word',
        });
        form.appendChild(errLine);

        const submit = async (e) => {
            e?.preventDefault?.();
            const name = nameInput.input.value.trim() || 'Untitled Room';
            const isPublic = publicCb.checked;
            const maxPlayers = parseInt(playersInput.select.value, 10) || 4;

            errLine.style.display = 'none';
            this._renderInFlight(`Creating room "${name}"…`);

            try {
                const room = await this.matchmaking.createRoom(name, isPublic, maxPlayers);
                this._renderRoomJoined(conn, welcome, room);
            } catch (err) {
                // Re-render the form so the user can fix the input and retry,
                // with the inline error message attached.
                this._renderCreateRoom(conn, welcome);
                // The freshly rendered form has its own errLine — find and show.
                const fresh = this.body.querySelector('form > div[style*="color: rgb(255, 154, 154)"]')
                    || this.body.querySelector('form > div:last-child');
                this._showInlineError(fresh, err);
            }
        };
        form.addEventListener('submit', submit);

        this._renderActions([
            { label: 'CREATE', kind: 'primary', onClick: submit },
            { label: 'BACK', kind: 'neutral', onClick: () => this._renderConnected(conn, welcome) },
        ]);
    }

    /**
     * Join-by-Code flow. Renders the code input, then on submit fires
     * `JoinRoomByCode` and routes the response. Common errors:
     *   - NotFound → "Room not found — check the code."
     *   - Full     → "Room is full."
     */
    _renderJoinByCode(conn, welcome) {
        this.body.innerHTML = '';

        const heading = document.createElement('div');
        heading.textContent = 'JOIN BY CODE';
        Object.assign(heading.style, {
            fontSize: '12px',
            color: 'rgba(140, 220, 255, 0.95)',
            letterSpacing: '1.5px',
            marginBottom: '14px',
        });
        this.body.appendChild(heading);

        const form = document.createElement('form');
        Object.assign(form.style, { display: 'flex', flexDirection: 'column', gap: '12px', textAlign: 'left' });
        this.body.appendChild(form);

        const codeInput = this._mkTextInput('Room code', 'ABC123', {
            maxLength: 6,
            uppercase: true,
            mono: true,
        });
        form.appendChild(codeInput.row);

        const errLine = document.createElement('div');
        Object.assign(errLine.style, {
            display: 'none',
            color: '#ff9a9a',
            fontSize: '11px',
            fontFamily: "'Fira Code', monospace",
            wordBreak: 'break-word',
        });
        form.appendChild(errLine);

        const submit = async (e) => {
            e?.preventDefault?.();
            const code = codeInput.input.value.trim().toUpperCase();
            if (code.length !== 6) {
                this._showInlineError(errLine, { msg: 'Code must be 6 characters.' });
                return;
            }
            errLine.style.display = 'none';
            this._renderInFlight(`Joining room ${code}…`);
            try {
                const room = await this.matchmaking.joinByCode(code);
                this._renderRoomJoined(conn, welcome, room);
            } catch (err) {
                // Re-render the form preserving the user's typed code, then
                // surface the error inline so they can correct it.
                this._renderJoinByCode(conn, welcome);
                const codeBox = this.body.querySelector('input[type="text"]');
                if (codeBox) codeBox.value = code;
                const fresh = this.body.querySelector('form > div:last-child');
                this._showInlineError(fresh, err);
            }
        };
        form.addEventListener('submit', submit);

        this._renderActions([
            { label: 'JOIN', kind: 'primary', onClick: submit },
            { label: 'BACK', kind: 'neutral', onClick: () => this._renderConnected(conn, welcome) },
        ]);
    }

    /**
     * Generic in-flight panel ("Searching for a match…" etc.). Shown while
     * the matchmaking promise is still pending; replaced by either
     * `_renderRoomJoined` (success) or `_renderMmError` (failure).
     */
    _renderInFlight(text) {
        this.body.innerHTML = '';
        const line = document.createElement('div');
        line.textContent = text;
        Object.assign(line.style, {
            color: 'rgba(140, 220, 255, 0.95)',
            fontSize: '12px',
            marginTop: '8px',
        });
        this.body.appendChild(line);
        this._renderActions([]);
    }

    /**
     * Confirmation panel after RoomJoined. Shows the code, slot, peer count,
     * and the "Start Multiplayer Game" handoff button when one is wired.
     * Without `onStartGame`, this is the v1 connectivity-probe terminal:
     * the user sees their room and can disconnect.
     */
    _renderRoomJoined(conn, welcome, room) {
        this.body.innerHTML = '';
        this.room = room;

        const ok = document.createElement('div');
        ok.textContent = `✓ Created room ${room.code}`;
        Object.assign(ok.style, {
            color: '#a3f7a3',
            fontSize: '14px',
            marginBottom: '10px',
        });
        this.body.appendChild(ok);

        const peerCount = (room.peers?.length ?? 0) + 1; // +1 for self
        const detail = document.createElement('div');
        detail.textContent = `slot ${room.slot} · ${peerCount} player${peerCount === 1 ? '' : 's'} · waiting`;
        Object.assign(detail.style, { color: 'rgba(230, 240, 250, 0.9)', fontSize: '11px' });
        this.body.appendChild(detail);

        const codeLine = document.createElement('div');
        codeLine.textContent = `share code · ${room.code}`;
        Object.assign(codeLine.style, {
            marginTop: '14px',
            fontSize: '14px',
            color: '#ffd24a',
            letterSpacing: '3px',
            fontFamily: "'Fira Code', monospace",
        });
        this.body.appendChild(codeLine);

        const actions = [];
        if (typeof this.onStartGame === 'function') {
            actions.push({
                label: '▶ START MULTIPLAYER GAME',
                kind: 'primary',
                onClick: () => this._handoffToGame(conn, welcome),
            });
        }
        actions.push({
            label: 'LEAVE ROOM',
            kind: 'neutral',
            onClick: async () => {
                this._renderInFlight('Leaving room…');
                try { await this.matchmaking.leave(); } catch {}
                this._renderConnected(conn, welcome);
            },
        });
        actions.push({
            label: 'DISCONNECT',
            kind: 'danger',
            onClick: () => { this._closing = true; this.dismiss(); },
        });
        this._renderActions(actions);
    }

    /**
     * Matchmaking-error landing page. Used by the QuickMatch path (Create
     * and Join re-render their own forms with inline errors so the user
     * can correct + retry without losing their typed input).
     */
    _renderMmError(conn, welcome, err, headline) {
        this.body.innerHTML = '';
        const line = document.createElement('div');
        line.textContent = headline;
        Object.assign(line.style, { color: '#ff9a9a', marginBottom: '12px', fontSize: '13px' });
        this.body.appendChild(line);

        const detail = document.createElement('div');
        detail.textContent = this._humanizeMmError(err);
        Object.assign(detail.style, {
            color: 'rgba(230, 230, 230, 0.85)',
            fontFamily: "'Fira Code', monospace",
            fontSize: '11px',
            wordBreak: 'break-word',
        });
        this.body.appendChild(detail);

        this._renderActions([
            { label: 'BACK', kind: 'primary', onClick: () => this._renderConnected(conn, welcome) },
            { label: 'DISCONNECT', kind: 'danger', onClick: () => { this._closing = true; this.dismiss(); } },
        ]);
    }

    /**
     * Inline error helper. Used by the Create / JoinByCode forms to surface
     * the server's reason without losing the user's input.
     */
    _showInlineError(line, err) {
        if (!line) return;
        line.textContent = this._humanizeMmError(err);
        line.style.display = 'block';
    }

    /**
     * Server `Error` payload → friendly UI string. The matchmaking layer
     * sets `err.code` to the codeName ('NotFound', 'Full', …) when the
     * promise rejects.
     */
    _humanizeMmError(err) {
        const code = err?.code ?? err?.codeName;
        if (code === 'NotFound') return 'Room not found — check the code.';
        if (code === 'Full')     return 'Server is full or this room is at capacity.';
        if (code === 'Banned')   return 'You are banned from this server.';
        if (code === 'RateLimited') return 'Slow down — try again in a moment.';
        if (code === 'Internal') return 'Server error. Please try again.';
        return err?.msg ?? err?.message ?? 'Unknown error.';
    }

    /* ─── form widgets ──────────────────────────────────────────────── */

    /**
     * Build a labeled text input row. Returns `{row, label, input}` so the
     * caller can wire the input value directly.
     *
     * @param {string} labelText
     * @param {string} placeholder
     * @param {object} [opts]
     * @param {number} [opts.maxLength]
     * @param {boolean} [opts.uppercase]  auto-uppercase as the user types
     * @param {boolean} [opts.mono]       use the monospace font (for codes)
     */
    _mkTextInput(labelText, placeholder, opts = {}) {
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', flexDirection: 'column', gap: '4px' });

        const label = document.createElement('label');
        label.textContent = labelText;
        Object.assign(label.style, {
            color: 'rgba(170, 200, 230, 0.85)',
            fontSize: '10px',
            letterSpacing: '1px',
        });
        row.appendChild(label);

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = placeholder;
        if (opts.maxLength) input.maxLength = opts.maxLength;
        Object.assign(input.style, {
            padding: '10px 12px',
            background: 'rgba(0, 0, 0, 0.55)',
            border: '2px solid rgba(140, 220, 255, 0.55)',
            borderRadius: '4px',
            color: 'rgba(240, 245, 255, 1)',
            fontFamily: opts.mono ? "'Fira Code', monospace" : "'Press Start 2P', monospace",
            fontSize: opts.mono ? '14px' : '11px',
            letterSpacing: opts.mono ? '3px' : 'normal',
            textTransform: opts.uppercase ? 'uppercase' : 'none',
            outline: 'none',
        });
        if (opts.uppercase) {
            input.addEventListener('input', () => {
                const start = input.selectionStart;
                input.value = input.value.toUpperCase();
                if (start != null) input.setSelectionRange(start, start);
            });
        }
        input.addEventListener('focus', () => { input.style.borderColor = '#ffe5a0'; });
        input.addEventListener('blur',  () => { input.style.borderColor = 'rgba(140, 220, 255, 0.55)'; });
        row.appendChild(input);

        return { row, label, input };
    }

    /**
     * Build a labeled select. Returns `{row, label, select}`.
     */
    _mkSelect(labelText, options, defaultValue) {
        const row = document.createElement('div');
        Object.assign(row.style, { display: 'flex', flexDirection: 'column', gap: '4px' });

        const label = document.createElement('label');
        label.textContent = labelText;
        Object.assign(label.style, {
            color: 'rgba(170, 200, 230, 0.85)',
            fontSize: '10px',
            letterSpacing: '1px',
        });
        row.appendChild(label);

        const select = document.createElement('select');
        Object.assign(select.style, {
            padding: '10px 12px',
            background: 'rgba(0, 0, 0, 0.55)',
            border: '2px solid rgba(140, 220, 255, 0.55)',
            borderRadius: '4px',
            color: 'rgba(240, 245, 255, 1)',
            fontFamily: "'Press Start 2P', monospace",
            fontSize: '11px',
            outline: 'none',
            cursor: 'pointer',
        });
        for (const o of options) {
            const opt = document.createElement('option');
            opt.value = o.value;
            opt.textContent = o.label;
            if (o.value === defaultValue) opt.selected = true;
            select.appendChild(opt);
        }
        row.appendChild(select);

        return { row, label, select };
    }

    /**
     * Hand the live ConnectionTask over to the caller (typically the
     * EngineDriver) and close the modal without disconnecting. The caller
     * inherits both the socket and the responsibility to disconnect at
     * end of play.
     */
    _handoffToGame(conn, welcome) {
        try {
            this.onStartGame?.(conn, welcome);
        } catch (e) {
            console.error('multiplayer-modal: onStartGame threw', e);
        }
        // Mark the socket as released so dismiss() doesn't disconnect it.
        this._releasedConnection = conn;
        this._closing = true;
        this.dismiss();
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
