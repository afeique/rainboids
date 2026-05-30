// ui/draft-overlay.js
// ─────────────────────────────────────────────────────────────────────────────
// Between-wave draft picker (9.0.0 reboot). Two-step, Hades-style:
//   1. CATEGORY — choose OFFENSE or DEFENSE (large tap targets).
//   2. CARDS    — choose 1 of up to 3 randomized cards from that category.
//
// Self-contained DOM overlay. UI only — it rolls cards via combat/draft-engine
// (pure) and hands the chosen card back through onComplete; the engine applies
// it. Mouse/touch click or number keys (1/2/3) select. Mobile-friendly: large
// buttons, single-column layout on narrow viewports.
// ─────────────────────────────────────────────────────────────────────────────

import { rollDraft, cardStacks } from '../combat/draft-engine.js';
import { DRAFT_CATEGORIES, DRAFT_OFFER_COUNT } from '../combat/draft-data.js';

const STYLE_ID = 'draft-overlay-style';

const CSS = `
#draft-overlay { position: fixed; inset: 0; z-index: 9100; display: none;
  align-items: center; justify-content: center; background: rgba(2,4,10,0.92);
  font-family: 'Press Start 2P', monospace; padding: 20px 14px; overflow-y: auto; }
#draft-overlay .df-panel { width: min(880px, 96vw); margin: auto;
  text-align: center; color: #e8eefc; }
#draft-overlay .df-title { font-size: 18px; color: #5fd0ff; letter-spacing: 2px;
  margin-bottom: 6px; }
#draft-overlay .df-sub { font-size: 9px; color: #9fb0cc; line-height: 1.7;
  margin-bottom: 22px; }
#draft-overlay .df-cats { display: flex; gap: 18px; justify-content: center;
  flex-wrap: wrap; }
#draft-overlay .df-cat { flex: 1 1 280px; max-width: 360px; min-height: 180px;
  border: 2px solid #2c3a52; background: #0d1016; padding: 24px 20px; cursor: pointer;
  display: flex; flex-direction: column; align-items: center; justify-content: center;
  gap: 12px; transition: border-color .12s, box-shadow .12s, transform .08s;
  -webkit-tap-highlight-color: transparent; }
#draft-overlay .df-cat:hover, #draft-overlay .df-cat:active { transform: translateY(-2px); }
#draft-overlay .df-cat-off { border-color: #ff7a4a; }
#draft-overlay .df-cat-off:hover, #draft-overlay .df-cat-off:active { box-shadow: 0 0 24px rgba(255,122,74,.4); }
#draft-overlay .df-cat-def { border-color: #5fd0ff; }
#draft-overlay .df-cat-def:hover, #draft-overlay .df-cat-def:active { box-shadow: 0 0 24px rgba(95,208,255,.4); }
#draft-overlay .df-cat-key { font-size: 9px; color: #6b7a96; }
#draft-overlay .df-cat-name { font-size: 17px; letter-spacing: 1px; }
#draft-overlay .df-cat-off .df-cat-name { color: #ff9a6a; }
#draft-overlay .df-cat-def .df-cat-name { color: #8fdcff; }
#draft-overlay .df-cat-desc { font-size: 8px; color: #9fb0cc; line-height: 1.7; }
#draft-overlay .df-cards { display: flex; gap: 14px; justify-content: center;
  flex-wrap: wrap; }
#draft-overlay .df-card { flex: 1 1 220px; max-width: 260px; min-height: 200px;
  border: 2px solid #2c3a52; background: #0d1016; padding: 16px 14px; cursor: pointer;
  display: flex; flex-direction: column; gap: 8px; text-align: left;
  transition: border-color .12s, box-shadow .12s, transform .08s; position: relative;
  -webkit-tap-highlight-color: transparent; }
#draft-overlay .df-card:hover, #draft-overlay .df-card:active { transform: translateY(-3px); }
#draft-overlay .df-card-key { font-size: 8px; color: #6b7a96; }
#draft-overlay .df-card-tag { font-size: 7px; letter-spacing: 1px; text-transform: uppercase;
  align-self: flex-start; border: 1px solid currentColor; padding: 2px 5px; }
#draft-overlay .df-card-name { font-size: 12px; line-height: 1.4; }
#draft-overlay .df-card-desc { font-size: 8px; color: #c4d0e6; line-height: 1.7; flex: 1; }
#draft-overlay .df-card-foot { font-size: 8px; color: #9fb0cc; display: flex;
  justify-content: space-between; align-items: center; border-top: 1px solid #2c3a52;
  padding-top: 8px; }
#draft-overlay .df-card-badge { font-size: 7px; padding: 2px 6px; border: 1px solid currentColor; }
#draft-overlay .df-empty { font-size: 10px; color: #9fb0cc; margin: 20px 0; line-height: 1.8; }
#draft-overlay .df-btn { font-family: inherit; font-size: 11px; padding: 12px 22px;
  cursor: pointer; background: #1b2536; color: #e8eefc; border: 1px solid #3a4a66;
  margin-top: 18px; transition: border-color .12s, background .12s;
  -webkit-tap-highlight-color: transparent; }
#draft-overlay .df-btn:hover, #draft-overlay .df-btn:active { border-color: #5fd0ff; background: #243349; }
@media (max-width: 640px) {
  #draft-overlay { padding: 16px 10px; }
  #draft-overlay .df-cat { flex-basis: 100%; min-height: 130px; padding: 20px 14px; }
  #draft-overlay .df-card { flex-basis: 100%; min-height: 0; padding: 14px 12px; }
  #draft-overlay .df-title { font-size: 16px; }
}
`;

export class DraftOverlay {
    constructor() {
        this.overlay = null;
        this.titleEl = null;
        this.subEl = null;
        this.bodyEl = null;
        this.player = null;
        this.opts = {};
        this._step = null;
        this._cards = [];
        this._keyHandler = null;
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
        panel.className = 'df-panel';
        const title = document.createElement('div');
        title.className = 'df-title';
        const sub = document.createElement('div');
        sub.className = 'df-sub';
        const body = document.createElement('div');
        body.className = 'df-body';
        panel.append(title, sub, body);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        this.overlay = overlay;
        this.titleEl = title;
        this.subEl = sub;
        this.bodyEl = body;
    }

    isOpen() {
        return !!(this.overlay && this.overlay.style.display === 'flex');
    }

    open(player, opts = {}) {
        if (!this.overlay) return false;
        this.player = player;
        this.opts = opts || {};
        this._renderCategory();
        this.overlay.style.display = 'flex';
        this._bindKeys();
        return true;
    }

    close() {
        if (this.overlay) this.overlay.style.display = 'none';
        this._unbindKeys();
    }

    _complete(card) {
        const cb = this.opts && this.opts.onComplete;
        this.close();
        if (cb) cb(card || null);
    }

    _renderCategory() {
        this._step = 'category';
        const wave = (this.opts && this.opts.waveNumber) | 0;
        this.titleEl.textContent = wave ? `WAVE ${wave} CLEARED` : 'WAVE CLEARED';
        this.subEl.textContent = 'Choose a draft. Offense sharpens your guns; defense keeps you alive.';
        this.bodyEl.replaceChildren();
        const cats = document.createElement('div');
        cats.className = 'df-cats';
        cats.append(
            this._catCard('df-cat-off', '1', 'OFFENSE', 'Stackable powerups & weapon attunements (elemental boons).', DRAFT_CATEGORIES.OFFENSE),
            this._catCard('df-cat-def', '2', 'DEFENSE', 'More life, regen, lifesteal, toughness or speed.', DRAFT_CATEGORIES.DEFENSE),
        );
        this.bodyEl.appendChild(cats);
    }

    _catCard(cls, key, name, desc, category) {
        const el = document.createElement('div');
        el.className = `df-cat ${cls}`;
        el.tabIndex = 0;
        const keyEl = document.createElement('div');
        keyEl.className = 'df-cat-key';
        keyEl.textContent = `[${key}]`;
        const nameEl = document.createElement('div');
        nameEl.className = 'df-cat-name';
        nameEl.textContent = name;
        const descEl = document.createElement('div');
        descEl.className = 'df-cat-desc';
        descEl.textContent = desc;
        el.append(keyEl, nameEl, descEl);
        el.addEventListener('click', () => this._pickCategory(category));
        return el;
    }

    _pickCategory(category) {
        let cards = rollDraft(this.player, category, DRAFT_OFFER_COUNT);
        if (!cards.length) {
            const other = category === DRAFT_CATEGORIES.OFFENSE
                ? DRAFT_CATEGORIES.DEFENSE : DRAFT_CATEGORIES.OFFENSE;
            cards = rollDraft(this.player, other, DRAFT_OFFER_COUNT);
        }
        if (!cards.length) { this._renderEmpty(); return; }
        this._renderCards(cards);
    }

    _renderEmpty() {
        this._step = 'empty';
        this.bodyEl.replaceChildren();
        const msg = document.createElement('div');
        msg.className = 'df-empty';
        msg.textContent = 'All boons maxed. Nothing left to draft — onward!';
        const btn = document.createElement('button');
        btn.className = 'df-btn';
        btn.type = 'button';
        btn.textContent = 'CONTINUE';
        btn.addEventListener('click', () => this._complete(null));
        this.bodyEl.append(msg, btn);
    }

    _renderCards(cards) {
        this._step = 'cards';
        this._cards = cards;
        this.titleEl.textContent = 'CHOOSE A BOON';
        this.subEl.textContent = 'Pick one. Attuning your weapon to an element unlocks its upgrade line.';
        this.bodyEl.replaceChildren();
        const row = document.createElement('div');
        row.className = 'df-cards';
        cards.forEach((card, i) => row.appendChild(this._cardEl(card, i + 1)));
        this.bodyEl.appendChild(row);
    }

    _cardEl(card, key) {
        const color = card.color || '#e8eefc';
        const el = document.createElement('div');
        el.className = 'df-card';
        el.tabIndex = 0;
        el.style.borderColor = color;
        el.addEventListener('mouseenter', () => { el.style.boxShadow = `0 0 22px ${color}66`; });
        el.addEventListener('mouseleave', () => { el.style.boxShadow = 'none'; });

        const tagText = this._cardTag(card);
        const stacks = cardStacks(this.player, card);
        const badge = (card.kind === 'attunement')
            ? 'NEW BOON'
            : (stacks > 0 ? `OWNED x${stacks}` : 'NEW');

        const keyEl = document.createElement('div');
        keyEl.className = 'df-card-key';
        keyEl.textContent = `[${key}]`;

        const tag = document.createElement('div');
        tag.className = 'df-card-tag';
        tag.style.color = color;
        tag.textContent = tagText;

        const name = document.createElement('div');
        name.className = 'df-card-name';
        name.style.color = color;
        name.textContent = card.name || card.id;

        const desc = document.createElement('div');
        desc.className = 'df-card-desc';
        desc.textContent = card.desc || '';

        const foot = document.createElement('div');
        foot.className = 'df-card-foot';
        const per = document.createElement('span');
        per.textContent = card.perStack || '';
        const badgeEl = document.createElement('span');
        badgeEl.className = 'df-card-badge';
        badgeEl.style.color = color;
        badgeEl.textContent = badge;
        foot.append(per, badgeEl);

        el.append(keyEl, tag, name, desc, foot);
        el.addEventListener('click', () => this._complete(card));
        return el;
    }

    _cardTag(card) {
        switch (card.kind) {
            case 'attunement':  return `${card.element} ATTUNE`;
            case 'attUpgrade':  return `${card.element} UPGRADE`;
            case 'perWeapon':   return 'WEAPON';
            case 'global':      return 'OFFENSE';
            case 'defense':     return 'DEFENSE';
            default:            return 'BOON';
        }
    }

    _bindKeys() {
        if (this._keyHandler) return;
        this._keyHandler = (e) => {
            if (!this.isOpen()) return;
            const n = e.key >= '1' && e.key <= '9' ? parseInt(e.key, 10) : 0;
            if (this._step === 'category') {
                if (n === 1) { e.preventDefault(); this._pickCategory(DRAFT_CATEGORIES.OFFENSE); }
                else if (n === 2) { e.preventDefault(); this._pickCategory(DRAFT_CATEGORIES.DEFENSE); }
            } else if (this._step === 'cards') {
                if (n >= 1 && n <= this._cards.length) { e.preventDefault(); this._complete(this._cards[n - 1]); }
            } else if (this._step === 'empty') {
                if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._complete(null); }
            }
        };
        window.addEventListener('keydown', this._keyHandler, true);
    }

    _unbindKeys() {
        if (this._keyHandler) {
            window.removeEventListener('keydown', this._keyHandler, true);
            this._keyHandler = null;
        }
    }
}
