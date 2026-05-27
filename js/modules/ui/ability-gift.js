// First-ability milestone gift (6.x). Abilities are purchase-locked, so the
// FIRST time the player has cleared Stage 1 they're offered a free CHOICE of
// one ability when they next open the pre-run BUILD screen (the "or first run"
// branch of the agreed onboarding beat). Picking one unlocks it permanently
// (account-gold cost waived) and teaches the ability system at a natural,
// low-pressure moment. Shown once per account (meta.firstAbilityGifted).
//
// Self-contained: builds its own DOM + stylesheet (mounts over the ARMORY).

const STYLE_ID = 'ability-gift-style';
const CSS = `
#ability-gift-overlay { position: fixed; inset: 0; z-index: 9000; display: none;
  align-items: center; justify-content: center; background: rgba(2,4,10,0.82);
  font-family: 'Press Start 2P', monospace; padding: 24px; }
#ability-gift-overlay .agift-panel { background: #0d1016; border: 2px solid #ffcc44;
  box-shadow: 0 0 28px rgba(255,204,68,0.35); width: min(720px, 95vw);
  max-height: 90vh; overflow-y: auto; padding: 22px; color: #e8eefc; }
#ability-gift-overlay .agift-title { font-size: 16px; color: #ffcc44; text-align: center;
  margin-bottom: 6px; letter-spacing: 1px; }
#ability-gift-overlay .agift-sub { font-size: 9px; color: #9fb0cc; text-align: center;
  line-height: 1.6; margin-bottom: 18px; }
#ability-gift-overlay .agift-grid { display: grid; grid-template-columns: 1fr 1fr;
  gap: 12px; }
#ability-gift-overlay .agift-card { text-align: left; background: #141b27;
  border: 1px solid #2c3a52; padding: 14px; cursor: pointer; font-family: inherit;
  color: inherit; transition: border-color .12s, background .12s; }
#ability-gift-overlay .agift-card:hover { border-color: #ffcc44; background: #1b2536; }
#ability-gift-overlay .agift-name { font-size: 11px; margin-bottom: 8px; }
#ability-gift-overlay .agift-desc { font-size: 9px; color: #aebbd4; line-height: 1.6; }
@media (max-width: 560px) { #ability-gift-overlay .agift-grid { grid-template-columns: 1fr; } }
`;

export class AbilityGiftOverlay {
    constructor() {
        this._onPick = null;
        this.overlay = null;
        this.grid = null;
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
        overlay.id = 'ability-gift-overlay';
        const panel = document.createElement('div');
        panel.className = 'agift-panel';
        const title = document.createElement('div');
        title.className = 'agift-title';
        title.textContent = 'FIRST ABILITY UNLOCKED';
        const sub = document.createElement('div');
        sub.className = 'agift-sub';
        sub.textContent = "You cleared your first stage — choose one ability to keep, free. Activate equipped abilities with 1-4. (You can buy more in the Build screen.)";
        const grid = document.createElement('div');
        grid.className = 'agift-grid';
        panel.append(title, sub, grid);
        overlay.appendChild(panel);
        document.body.appendChild(overlay);
        this.overlay = overlay;
        this.grid = grid;
    }

    isOpen() { return !!(this.overlay && this.overlay.style.display === 'flex'); }

    /** choices: [{ id, name, description, color }]. onPick(id) fires on choose. */
    open(choices, onPick) {
        if (!this.overlay || !this.grid) return false;
        this._onPick = onPick;
        this.grid.replaceChildren();
        for (const c of (choices || [])) {
            const card = document.createElement('button');
            card.className = 'agift-card';
            card.type = 'button';
            const name = document.createElement('div');
            name.className = 'agift-name';
            name.textContent = c.name || c.id;
            name.style.color = c.color || '#ffcc44';
            const desc = document.createElement('div');
            desc.className = 'agift-desc';
            desc.textContent = c.description || '';
            card.append(name, desc);
            card.addEventListener('click', () => this._choose(c.id));
            this.grid.appendChild(card);
        }
        this.overlay.style.display = 'flex';
        return true;
    }

    _choose(id) {
        this.overlay.style.display = 'none';
        const cb = this._onPick;
        this._onPick = null;
        if (cb) cb(id);
    }
}
