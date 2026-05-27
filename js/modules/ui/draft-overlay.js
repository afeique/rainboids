// draft-overlay.js — Looter-Economy Pivot T40: the §4.1 "CHOOSE YOUR NEXT STAGE"
// draft screen. At each stage transition (wired by T32) the run randomizer
// (`run-randomizer.js` `nextDraft`) hands us 2–3 OPTIONS; this overlay previews
// each as a card — theme name, modifier name(s), threat vs the live PWR (with a
// risk tint), the reward, and a bounty mark — and reports the picked index.
//
// Self-contained, mirroring `ability-gift.js`: the constructor builds its own
// DOM (id `draft-overlay`) and injects its stylesheet once (STYLE_ID), then
// appends to document.body. No globals, no game imports — it only reads the
// OPTION shape it's handed:
//
//   { theme:{ name, element, ... }, modifiers:[{ name, ... }],
//     threat:number, reward:{ rainshardMult, dropBias },
//     elites:[{ name, ... }], bountyRelevant?:true, preset?:{ name, ... } }
//
// open(options, { pwr, onPick }) renders the cards; each PICK button fires
// onPick(index) then close()s. isOpen()/close() round out the lifecycle.

const STYLE_ID = 'draft-overlay-style';
const CSS = `
#draft-overlay { position: fixed; inset: 0; z-index: 9000; display: none;
  align-items: center; justify-content: center; background: rgba(2,4,10,0.85);
  font-family: 'Press Start 2P', monospace; padding: 24px; }
#draft-overlay .draft-panel { background: #0d1016; border: 2px solid #66ccff;
  box-shadow: 0 0 28px rgba(102,204,255,0.32); width: min(900px, 96vw);
  max-height: 92vh; overflow-y: auto; padding: 22px; color: #e8eefc; }
#draft-overlay .draft-head { display: flex; align-items: baseline;
  justify-content: space-between; gap: 12px; margin-bottom: 18px;
  border-bottom: 1px solid #2c3a52; padding-bottom: 12px; flex-wrap: wrap; }
#draft-overlay .draft-title { font-size: 15px; color: #66ccff; letter-spacing: 1px; }
#draft-overlay .draft-pwr { font-size: 12px; color: #ffcc44; white-space: nowrap; }
#draft-overlay .draft-grid { display: grid; gap: 14px;
  grid-template-columns: repeat(3, 1fr); align-items: stretch; }
#draft-overlay .draft-grid[data-cards="2"] { grid-template-columns: repeat(2, 1fr); }
#draft-overlay .draft-card { display: flex; flex-direction: column;
  background: #141b27; border: 1px solid #2c3a52; padding: 14px;
  transition: border-color .12s, background .12s; }
#draft-overlay .draft-card:hover { background: #1b2536; }
#draft-overlay .draft-theme { font-size: 12px; margin-bottom: 4px;
  color: #cfe2ff; line-height: 1.4; }
#draft-overlay .draft-element { font-size: 8px; color: #7f8db0;
  margin-bottom: 10px; letter-spacing: 1px; }
#draft-overlay .draft-mods { font-size: 9px; color: #aebbd4; line-height: 1.7;
  margin-bottom: 10px; min-height: 1.7em; }
#draft-overlay .draft-mods .draft-mod-none { color: #6f7d9c; }
#draft-overlay .draft-threat { font-size: 10px; margin-bottom: 6px;
  letter-spacing: 1px; }
#draft-overlay .draft-reward { font-size: 9px; color: #9fe6b0; line-height: 1.7;
  margin-bottom: 4px; }
#draft-overlay .draft-reward .draft-matrix { color: #c79bff; }
#draft-overlay .draft-bounty { font-size: 9px; color: #ffd166; line-height: 1.7;
  margin-bottom: 4px; min-height: 1.7em; }
#draft-overlay .draft-bounty:empty::before { content: ' '; }
#draft-overlay .draft-pick { margin-top: auto; font-family: inherit;
  font-size: 10px; color: #0d1016; background: #66ccff; border: none;
  padding: 10px 8px; cursor: pointer; letter-spacing: 1px;
  transition: background .12s, box-shadow .12s; }
#draft-overlay .draft-pick:hover { background: #8fdcff;
  box-shadow: 0 0 12px rgba(102,204,255,0.55); }
/* risk tints — set as the card's accent color via inline style on .draft-card
   and .draft-threat; these classes just key the hover border. */
#draft-overlay .draft-card.risk-safe:hover  { border-color: #6fe09a; }
#draft-overlay .draft-card.risk-fair:hover  { border-color: #ffd166; }
#draft-overlay .draft-card.risk-risky:hover { border-color: #ff9a52; }
#draft-overlay .draft-card.risk-lethal:hover { border-color: #ff5a5a; }
@media (max-width: 720px) {
  #draft-overlay .draft-grid,
  #draft-overlay .draft-grid[data-cards="2"] { grid-template-columns: 1fr; }
}
`;

// Map the threat-vs-pwr ratio onto a risk bucket: color shifts toward red as
// threat exceeds pwr. ≤0.85 safe(green), ≤1.1 fair(yellow), ≤1.4 risky(orange),
// else lethal(red). Returns { cls, color, label }.
function riskTier(threat, pwr) {
    const ratio = pwr > 0 ? threat / pwr : 2;
    if (ratio <= 0.85) return { cls: 'risk-safe',   color: '#6fe09a', label: 'safe' };
    if (ratio <= 1.1)  return { cls: 'risk-fair',   color: '#ffd166', label: 'fair' };
    if (ratio <= 1.4)  return { cls: 'risk-risky',  color: '#ff9a52', label: 'risky' };
    return { cls: 'risk-lethal', color: '#ff5a5a', label: 'lethal' };
}

function fmtNum(n) {
    return Number(n || 0).toLocaleString('en-US');
}

// Turn an option's reward block into the short display line the mockup shows.
// "+25% R$" from rainshardMult; a "◆ Matrix" tag when the drop bias is rich
// enough to imply a Matrix-grade payout; a bare "standard" when nothing stands
// out. Returns { text, matrix } so the caller can color the Matrix tag.
function rewardLine(reward) {
    const rs = reward && typeof reward.rainshardMult === 'number' ? reward.rainshardMult : 1;
    const bias = reward && typeof reward.dropBias === 'number' ? reward.dropBias : 1;
    const parts = [];
    const pct = Math.round((rs - 1) * 100);
    if (pct > 0) parts.push(`+${pct}% R$`);
    // A noticeably rich drop bias previews a Matrix-grade reward (the ◆ mark).
    const matrix = bias >= 1.5;
    if (!parts.length && !matrix) parts.push('standard');
    return { text: parts.join('  '), matrix };
}

export class DraftOverlay {
    constructor() {
        this._onPick = null;
        this.overlay = null;
        this.grid = null;
        this.pwrEl = null;
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
        overlay.id = 'draft-overlay';

        const panel = document.createElement('div');
        panel.className = 'draft-panel';

        const head = document.createElement('div');
        head.className = 'draft-head';
        const title = document.createElement('div');
        title.className = 'draft-title';
        title.textContent = 'CHOOSE YOUR NEXT STAGE';
        const pwr = document.createElement('div');
        pwr.className = 'draft-pwr';
        head.append(title, pwr);

        const grid = document.createElement('div');
        grid.className = 'draft-grid';

        panel.append(head, grid);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);

        this.overlay = overlay;
        this.grid = grid;
        this.pwrEl = pwr;
    }

    isOpen() { return !!(this.overlay && this.overlay.style.display === 'flex'); }

    /**
     * open(options, { pwr, onPick })
     * @param {Array<Option>} options  2–3 entries from `nextDraft(...)`.
     * @param {object} cfg
     * @param {number} cfg.pwr     the player's live PWR (threat is on this scale).
     * @param {function} cfg.onPick  onPick(index) fires with the chosen card index.
     * @returns {boolean} true if the overlay opened.
     */
    open(options, { pwr = 0, onPick } = {}) {
        if (!this.overlay || !this.grid) return false;
        const opts = Array.isArray(options) ? options : [];
        if (!opts.length) return false;

        this._onPick = onPick || null;
        this.pwrEl.textContent = `PWR ${fmtNum(pwr)}`;
        this.grid.replaceChildren();
        this.grid.dataset.cards = String(Math.min(3, opts.length));

        opts.forEach((opt, index) => {
            this.grid.appendChild(this._buildCard(opt, index, pwr));
        });

        this.overlay.style.display = 'flex';
        return true;
    }

    _buildCard(opt, index, pwr) {
        const theme = opt && opt.theme ? opt.theme : {};
        const modifiers = Array.isArray(opt && opt.modifiers) ? opt.modifiers : [];
        const elites = Array.isArray(opt && opt.elites) ? opt.elites : [];
        const threat = Number(opt && opt.threat) || 0;
        const tier = riskTier(threat, pwr);

        const card = document.createElement('div');
        card.className = `draft-card ${tier.cls}`;
        // Risk tint: the card border shifts toward red as threat exceeds pwr.
        card.style.borderColor = tier.color;

        // Theme name + element flavor tag.
        const themeEl = document.createElement('div');
        themeEl.className = 'draft-theme';
        themeEl.textContent = theme.name || theme.id || 'Unknown';
        const elementEl = document.createElement('div');
        elementEl.className = 'draft-element';
        elementEl.textContent = theme.element ? String(theme.element) : '';

        // Modifier name(s) — or the preset name when this is a curated combo,
        // falling back to "standard" when the stage is unmodified.
        const modsEl = document.createElement('div');
        modsEl.className = 'draft-mods';
        const modNames = modifiers.map((m) => (m && (m.name || m.id))).filter(Boolean);
        if (opt && opt.preset && (opt.preset.name || opt.preset.id)) {
            modsEl.textContent = opt.preset.name || opt.preset.id;
        } else if (modNames.length) {
            modsEl.textContent = modNames.join(' · ');
        } else {
            const none = document.createElement('span');
            none.className = 'draft-mod-none';
            none.textContent = 'no modifiers';
            modsEl.appendChild(none);
        }
        // Surface any elite affix/combo names as a hover hint.
        const eliteNames = elites.map((e) => (e && (e.name || e.id))).filter(Boolean);
        if (eliteNames.length) modsEl.title = `Elites: ${eliteNames.join(', ')}`;

        // Threat vs PWR, tinted by risk.
        const threatEl = document.createElement('div');
        threatEl.className = 'draft-threat';
        threatEl.style.color = tier.color;
        threatEl.textContent = `threat ${fmtNum(threat)}  (${tier.label})`;

        // Reward line ("+25% R$" / "◆ Matrix" / "standard").
        const rewardEl = document.createElement('div');
        rewardEl.className = 'draft-reward';
        const rl = rewardLine(opt && opt.reward);
        if (rl.text) rewardEl.appendChild(document.createTextNode(rl.text));
        if (rl.matrix) {
            if (rl.text) rewardEl.appendChild(document.createTextNode('  '));
            const matrix = document.createElement('span');
            matrix.className = 'draft-matrix';
            matrix.textContent = '◆ Matrix';
            rewardEl.appendChild(matrix);
        }

        // Bounty mark — present only when this option matches an active bounty.
        const bountyEl = document.createElement('div');
        bountyEl.className = 'draft-bounty';
        bountyEl.textContent = opt && opt.bountyRelevant ? '◇ bounty ✓' : '';

        // PICK button → onPick(index) then close.
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'draft-pick';
        pick.textContent = 'PICK';
        pick.addEventListener('click', () => this._choose(index));

        card.append(themeEl, elementEl, modsEl, threatEl, rewardEl, bountyEl, pick);
        return card;
    }

    _choose(index) {
        const cb = this._onPick;
        this.close();
        if (cb) cb(index);
    }

    close() {
        this._onPick = null;
        if (this.overlay) this.overlay.style.display = 'none';
    }
}
