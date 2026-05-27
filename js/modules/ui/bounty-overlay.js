// Looter-Economy Pivot — T41: Bounty board overlay (UI).
//
// Self-contained overlay (mirrors `ability-gift.js`): the constructor builds
// its own DOM (id `bounty-overlay`) and injects its `<style>` once, then
// appends to document.body. `open(board, callbacks)` renders the board the
// T15 engine (`world/bounty-engine.js`) produces; `refresh(board)` re-renders
// after a claim/reroll; `close()` / `isOpen()` manage visibility.
//
// ─── Board / bounty shape consumed ──────────────────────────────────────────
// board = { dailies:[bounty×3], contracts:[bounty×2], rolledAt }
// bounty = {
//   id, templateId, category, kind, text,
//   progressType, target, progress,                 // progress bar = progress/target
//   reward: { rainshards, matrixChance?, fabricateToken? },
//   completed?, claimed?,                            // engine bookkeeping
// }
//
// Buttons per row:
//   CLAIM   — enabled only when `completed && !claimed`  → onClaim(bountyId)
//   REROLL  — R$ cost; disabled when `claimed`           → onReroll(bountyId)
// Plus a board-level close button → onClose?.() then close().

const STYLE_ID = 'bounty-overlay-style';

// Default R$ cost to reroll a single bounty (display-only; the wiring layer
// validates affordability and performs the spend). Daily rerolls are cheaper
// than contract rerolls.
const REROLL_COST = { daily: 250, contract: 600 };

const CSS = `
#bounty-overlay { position: fixed; inset: 0; z-index: 9000; display: none;
  align-items: center; justify-content: center; background: rgba(2,4,10,0.82);
  font-family: 'Press Start 2P', monospace; padding: 24px; }
#bounty-overlay .bo-panel { background: #0d1016; border: 2px solid #5fd0ff;
  box-shadow: 0 0 28px rgba(95,208,255,0.35); width: min(820px, 96vw);
  max-height: 90vh; overflow-y: auto; padding: 22px; color: #e8eefc;
  position: relative; }
#bounty-overlay .bo-close { position: absolute; top: 10px; right: 12px;
  background: transparent; border: 1px solid #3a4a66; color: #9fb0cc;
  font-family: inherit; font-size: 11px; padding: 6px 10px; cursor: pointer;
  transition: border-color .12s, color .12s; }
#bounty-overlay .bo-close:hover { border-color: #5fd0ff; color: #e8eefc; }
#bounty-overlay .bo-title { font-size: 16px; color: #5fd0ff; text-align: center;
  margin-bottom: 6px; letter-spacing: 1px; }
#bounty-overlay .bo-sub { font-size: 9px; color: #9fb0cc; text-align: center;
  line-height: 1.6; margin-bottom: 18px; }
#bounty-overlay .bo-section { margin-bottom: 18px; }
#bounty-overlay .bo-section-head { font-size: 11px; color: #ffcc44;
  letter-spacing: 1px; margin-bottom: 10px; border-bottom: 1px solid #2c3a52;
  padding-bottom: 6px; }
#bounty-overlay .bo-empty { font-size: 9px; color: #6b7a96; padding: 6px 0; }
#bounty-overlay .bo-row { background: #141b27; border: 1px solid #2c3a52;
  padding: 12px 14px; margin-bottom: 10px; display: grid;
  grid-template-columns: 1fr auto; grid-template-areas: "text actions" "bar actions";
  gap: 8px 14px; align-items: center; }
#bounty-overlay .bo-row.bo-done { border-color: #3fd07a;
  box-shadow: 0 0 14px rgba(63,208,122,0.25); background: #122119; }
#bounty-overlay .bo-row.bo-claimed { opacity: 0.55; }
#bounty-overlay .bo-row-text { grid-area: text; font-size: 10px;
  line-height: 1.5; color: #e8eefc; }
#bounty-overlay .bo-cat { font-size: 8px; color: #8ea2c4; text-transform: uppercase;
  letter-spacing: 1px; margin-right: 6px; }
#bounty-overlay .bo-reward { font-size: 8px; color: #ffd45f; margin-top: 6px;
  display: flex; gap: 6px; align-items: center; flex-wrap: wrap; }
#bounty-overlay .bo-chip { display: inline-block; font-size: 7px; padding: 2px 5px;
  border: 1px solid currentColor; border-radius: 2px; letter-spacing: 0.5px; }
#bounty-overlay .bo-chip-matrix { color: #c08bff; }
#bounty-overlay .bo-chip-token { color: #5fd0ff; }
#bounty-overlay .bo-barwrap { grid-area: bar; display: flex; align-items: center;
  gap: 8px; }
#bounty-overlay .bo-bar { flex: 1; height: 8px; background: #0a0e16;
  border: 1px solid #2c3a52; position: relative; overflow: hidden; }
#bounty-overlay .bo-bar-fill { height: 100%; background: #5fd0ff;
  transition: width .2s; }
#bounty-overlay .bo-row.bo-done .bo-bar-fill { background: #3fd07a; }
#bounty-overlay .bo-bar-label { font-size: 8px; color: #9fb0cc; min-width: 56px;
  text-align: right; }
#bounty-overlay .bo-actions { grid-area: actions; display: flex; flex-direction: column;
  gap: 6px; justify-content: center; }
#bounty-overlay .bo-btn { font-family: inherit; font-size: 9px; padding: 7px 10px;
  cursor: pointer; background: #1b2536; color: #e8eefc; border: 1px solid #3a4a66;
  white-space: nowrap; transition: border-color .12s, background .12s; }
#bounty-overlay .bo-btn:hover:not(:disabled) { border-color: #5fd0ff; background: #243349; }
#bounty-overlay .bo-btn-claim:not(:disabled) { border-color: #3fd07a; color: #9dffc4; }
#bounty-overlay .bo-btn-claim:hover:not(:disabled) { background: #163a26; }
#bounty-overlay .bo-btn:disabled { opacity: 0.4; cursor: default; }
@media (max-width: 600px) {
  #bounty-overlay .bo-row { grid-template-columns: 1fr; grid-template-areas: "text" "bar" "actions"; }
  #bounty-overlay .bo-actions { flex-direction: row; }
}
`;

export class BountyOverlay {
    constructor() {
        this.overlay = null;
        this.panel = null;
        this.dailiesEl = null;
        this.contractsEl = null;
        this._cbs = {};
        this._build();
    }

    _build() {
        if (typeof document === 'undefined') return;
        if (!document.getElementById(STYLE_ID)) {
            const style = document.createElement('style');
            style.id = STYLE_ID;
            style.textContent = CSS;
            document.head.appendChild(style);
        }

        const overlay = document.createElement('div');
        overlay.id = 'bounty-overlay';

        const panel = document.createElement('div');
        panel.className = 'bo-panel';

        const closeBtn = document.createElement('button');
        closeBtn.className = 'bo-close';
        closeBtn.type = 'button';
        closeBtn.textContent = 'X';
        closeBtn.addEventListener('click', () => this._handleClose());

        const title = document.createElement('div');
        title.className = 'bo-title';
        title.textContent = 'BOUNTY BOARD';

        const sub = document.createElement('div');
        sub.className = 'bo-sub';
        sub.textContent = 'Complete directed goals for Rainshards, Matrices and Fabricate tokens. Dailies refresh; contracts persist.';

        // DAILIES section
        const dailySection = document.createElement('div');
        dailySection.className = 'bo-section';
        const dailyHead = document.createElement('div');
        dailyHead.className = 'bo-section-head';
        dailyHead.textContent = 'DAILIES';
        const dailies = document.createElement('div');
        dailies.className = 'bo-list bo-list-daily';
        dailySection.append(dailyHead, dailies);

        // CONTRACTS section
        const contractSection = document.createElement('div');
        contractSection.className = 'bo-section';
        const contractHead = document.createElement('div');
        contractHead.className = 'bo-section-head';
        contractHead.textContent = 'CONTRACTS';
        const contracts = document.createElement('div');
        contracts.className = 'bo-list bo-list-contract';
        contractSection.append(contractHead, contracts);

        panel.append(closeBtn, title, sub, dailySection, contractSection);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        this.overlay = overlay;
        this.panel = panel;
        this.dailiesEl = dailies;
        this.contractsEl = contracts;
    }

    isOpen() {
        return !!(this.overlay && this.overlay.style.display === 'flex');
    }

    /**
     * open(board, { onClaim, onReroll, onClose }) — render the board and show.
     *   onClaim(bountyId)  — fired by an enabled CLAIM button.
     *   onReroll(bountyId) — fired by an enabled REROLL button.
     *   onClose()          — fired by the close button (before close()).
     */
    open(board, callbacks = {}) {
        if (!this.overlay) return false;
        this._cbs = callbacks || {};
        this._render(board);
        this.overlay.style.display = 'flex';
        return true;
    }

    /** refresh(board) — re-render with an updated board (after claim/reroll). */
    refresh(board) {
        if (!this.overlay) return false;
        this._render(board);
        return true;
    }

    close() {
        if (this.overlay) this.overlay.style.display = 'none';
    }

    _handleClose() {
        const cb = this._cbs && this._cbs.onClose;
        this.close();
        if (cb) cb();
    }

    _render(board) {
        const b = board || {};
        this._renderList(this.dailiesEl, b.dailies || [], 'daily');
        this._renderList(this.contractsEl, b.contracts || [], 'contract');
    }

    _renderList(container, bounties, kind) {
        if (!container) return;
        container.replaceChildren();
        if (!bounties.length) {
            const empty = document.createElement('div');
            empty.className = 'bo-empty';
            empty.textContent = 'No bounties available.';
            container.appendChild(empty);
            return;
        }
        for (const bounty of bounties) {
            container.appendChild(this._buildRow(bounty, kind));
        }
    }

    _buildRow(bounty, kind) {
        const target = Math.max(1, Number(bounty.target) || 1);
        const progress = Math.max(0, Math.min(target, Number(bounty.progress) || 0));
        const completed = !!bounty.completed || progress >= target;
        const claimed = !!bounty.claimed;
        const pct = Math.round((progress / target) * 100);

        const row = document.createElement('div');
        row.className = 'bo-row';
        if (completed) row.classList.add('bo-done');
        if (claimed) row.classList.add('bo-claimed');

        // Text + category + reward summary.
        const textWrap = document.createElement('div');
        textWrap.className = 'bo-row-text';
        const line = document.createElement('div');
        if (bounty.category) {
            const cat = document.createElement('span');
            cat.className = 'bo-cat';
            cat.textContent = bounty.category;
            line.appendChild(cat);
        }
        const txt = document.createElement('span');
        txt.textContent = bounty.text || bounty.id || 'Bounty';
        line.appendChild(txt);
        textWrap.appendChild(line);
        textWrap.appendChild(this._buildReward(bounty.reward));

        // Progress bar.
        const barWrap = document.createElement('div');
        barWrap.className = 'bo-barwrap';
        const bar = document.createElement('div');
        bar.className = 'bo-bar';
        const fill = document.createElement('div');
        fill.className = 'bo-bar-fill';
        fill.style.width = `${pct}%`;
        bar.appendChild(fill);
        const barLabel = document.createElement('span');
        barLabel.className = 'bo-bar-label';
        barLabel.textContent = `${progress}/${target}`;
        barWrap.append(bar, barLabel);

        // Actions: CLAIM + REROLL.
        const actions = document.createElement('div');
        actions.className = 'bo-actions';

        const claimBtn = document.createElement('button');
        claimBtn.className = 'bo-btn bo-btn-claim';
        claimBtn.type = 'button';
        claimBtn.textContent = claimed ? 'CLAIMED' : 'CLAIM';
        claimBtn.disabled = !(completed && !claimed);
        claimBtn.addEventListener('click', () => {
            if (claimBtn.disabled) return;
            const cb = this._cbs && this._cbs.onClaim;
            if (cb) cb(bounty.id);
        });

        const cost = REROLL_COST[kind] != null ? REROLL_COST[kind] : 250;
        const rerollBtn = document.createElement('button');
        rerollBtn.className = 'bo-btn bo-btn-reroll';
        rerollBtn.type = 'button';
        rerollBtn.textContent = `REROLL R$${cost}`;
        rerollBtn.disabled = claimed;
        rerollBtn.addEventListener('click', () => {
            if (rerollBtn.disabled) return;
            const cb = this._cbs && this._cbs.onReroll;
            if (cb) cb(bounty.id);
        });

        actions.append(claimBtn, rerollBtn);

        row.append(textWrap, barWrap, actions);
        return row;
    }

    _buildReward(reward) {
        const wrap = document.createElement('div');
        wrap.className = 'bo-reward';
        const r = reward || {};

        const rs = document.createElement('span');
        rs.textContent = `R$${Number(r.rainshards) || 0}`;
        wrap.appendChild(rs);

        if (r.matrixChance) {
            const chip = document.createElement('span');
            chip.className = 'bo-chip bo-chip-matrix';
            const pct = Math.round(Number(r.matrixChance) * 100);
            chip.textContent = `MATRIX ${pct}%`;
            wrap.appendChild(chip);
        }
        if (r.fabricateToken) {
            const chip = document.createElement('span');
            chip.className = 'bo-chip bo-chip-token';
            const n = Number(r.fabricateToken) || 0;
            chip.textContent = n > 1 ? `${n}× FAB TOKEN` : 'FAB TOKEN';
            wrap.appendChild(chip);
        }

        return wrap;
    }
}
