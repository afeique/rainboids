// ── SETTINGS overlay (6.158.0) ─────────────────────────────────────
// Title-screen settings screen. Currently hosts the font (DISPLAY)
// controls; structured so more settings sections can be added later.
// Full-screen DOM overlay reached from the title's SETTINGS button;
// BACK returns to the title. The same font controls are also embedded
// in the pause menu's DISPLAY tab (see static-dom.js).

import { GAME_STATES } from '../core/constants.js';
import { buildFontControls } from './font-settings.js';

export class SettingsOverlay {
    constructor() {
        this.gameEngine = null;
        this._isOpen = false;
        this._built = false;
        this.elements = {};
    }

    setGameEngine(ge) { this.gameEngine = ge; }
    isOpen() { return this._isOpen; }

    _build() {
        if (this._built) return;
        let overlay = document.getElementById('settings-overlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'settings-overlay';
            document.body.appendChild(overlay);
        }
        overlay.className = 'settings-overlay';
        overlay.replaceChildren();

        const panel = document.createElement('div');
        panel.className = 'settings-panel';

        const title = document.createElement('div');
        title.className = 'settings-title';
        title.textContent = 'SETTINGS';
        panel.appendChild(title);

        const section = document.createElement('div');
        section.className = 'settings-section-title';
        section.textContent = 'FONTS';
        panel.appendChild(section);

        const controls = document.createElement('div');
        buildFontControls(controls);
        panel.appendChild(controls);

        const footer = document.createElement('div');
        footer.className = 'font-settings-footer';
        const back = document.createElement('button');
        back.className = 'font-btn font-btn--back';
        back.textContent = '← BACK';
        back.addEventListener('click', () => this.back());
        footer.appendChild(back);
        panel.appendChild(footer);

        overlay.appendChild(panel);
        this.elements = { overlay };
        this._built = true;
    }

    open() {
        this._build();
        this._isOpen = true;
        this.elements.overlay.style.display = 'flex';
        return true;
    }

    close() {
        this._isOpen = false;
        if (this.elements.overlay) this.elements.overlay.style.display = 'none';
    }

    back() {
        this.close();
        const ge = this.gameEngine;
        if (ge && ge.game) ge.game.state = GAME_STATES.TITLE_SCREEN;
    }
}
