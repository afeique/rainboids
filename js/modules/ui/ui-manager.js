// UI management for overlays, messages, and interface elements
import { MusicPlayer } from '../audio/music-player.js';
import { POWERUP_TYPES, powerupGoldCost } from '../world/powerup.js';
import { SPEEDRUN_TIERS, speedrunTierFor } from '../core/constants.js';
import { loadSettings, saveSettings } from '../core/storage.js';
import { renderIconHTML } from './icons.js';
import { isMobile } from '../platform/platform-detect.js';
import { renderSpAllocation } from './sp-allocation.js';
import { getPassive, getSlotPassives } from '../combat/passive-data.js';

// Format an elapsed-time milliseconds value as M:SS for the pause-menu
// TIMER tab. Mirrors the same formatter that lives in shop-dom.js for
// the (now-removed) shop TIMER panel.
function formatRunTime(ms) {
    if (!isFinite(ms)) return '∞';
    const totalSec = Math.max(0, Math.floor(ms / 1000));
    const m = Math.floor(totalSec / 60);
    const s = totalSec % 60;
    return `${m}:${s.toString().padStart(2, '0')}`;
}

// 5.79.3 — Beam-aware powerup description swap. When the equipped
//   primary is a continuous-tether beam (Lance Beam, Arc Lightning),
//   the bullet-flavored powerups don't actually fire faster / spawn
//   more bullets / explode — instead they buff the beam's per-tick
//   damage (see fireLanceBeam / checkLightningCollisions in 5.79.3).
//   Show the player the right effect for their loadout. Falls back
//   to the cfg.description for non-beam primaries or other powerups.
// 5.79.23 — Beams moved to power weapons; the beam-aware DPS spillover
//   for bullet-flavored primary upgrades is gone. Powerups now show
//   their plain cfg.description regardless of equipped weapon.
function _beamAwarePowerupDescription(type, cfg, _player) {
    return (cfg && cfg.description) || '';
}

export class UIManager {
    constructor() {
        this.elements = {};
        this.musicPlayer = new MusicPlayer();
        this.audioManager = null; // Will be set by the game
        this.initializeElements();
        this.setupMusicPlayer();
    }
    
    initializeElements() {
        // Get all UI elements
        this.elements = {
            score: document.getElementById('score'),
            // 5.88.0 — `livesDisplay` retired with the lives system. The
            // tank count is rendered straight to the canvas inside the
            // triforce widget (see hud/status.js → drawCanvasTriforce).
            waveDisplay: document.getElementById('wave-display'),
            pauseOverlay: document.getElementById('pause-overlay'),
            messageTitle: document.getElementById('message-title'), // Commented out in HTML
            messageSubtitle: document.getElementById('message-subtitle'), // Commented out in HTML
            // titleScreen: document.getElementById('title-screen'),
            // gameTitle: document.getElementById('game-title'),
            // highScoreDisplay: document.getElementById('high-score-display'),
            // Music elements (removed from main UI, only in pause menu)
            musicInfo: null, // Removed from main display
            trackName: null, // Removed from main display
            trackNameText: null, // Removed from main display
            musicProgress: null, // Removed from main display
            musicInfoCurrentTime: null, // Removed from main display
            musicInfoDuration: null, // Removed from main display
            shopButton: document.getElementById('shop-button'), // Commented out in HTML
            pauseShopButton: document.getElementById('pause-shop-button'),
            pauseResumeButton: document.getElementById('pause-resume-button'),
            // Music tab elements
            pauseTabs: document.querySelectorAll('.pause-tab'),
            tabContents: document.querySelectorAll('.pause-tab-content'),
            currentTrackName: document.getElementById('current-track-name'),
            musicCurrentTime: document.getElementById('music-current-time'),
            musicDuration: document.getElementById('music-duration'),
            musicPlayerProgress: document.getElementById('music-player-progress'),
            musicPlayerBuffered: document.getElementById('music-player-buffered'),
            musicPlayerProgressBar: document.getElementById('music-player-progress-bar'),
            musicPlayPause: document.getElementById('music-play-pause'),
            musicPrev: document.getElementById('music-prev'),
            musicNext: document.getElementById('music-next'),
            musicShuffle: document.getElementById('music-shuffle'),
            musicRandom: document.getElementById('music-random'),
            musicRepeat: document.getElementById('music-repeat'),
            playlistTracks: document.getElementById('playlist-tracks'),
            // Music volume elements
            musicVolumeSlider: document.getElementById('music-volume-slider'),
            musicVolumeValue: document.getElementById('music-volume-value'),
            // SFX elements
            sfxVolumeSlider: document.getElementById('sfx-volume-slider'),
            sfxVolumeValue: document.getElementById('sfx-volume-value'),
            sfxTogglesContainer: document.getElementById('sfx-toggles'),
            // Powerups tab elements
            // Powerups pause-tab (lives in the tab strip alongside Music
            // / SFX / Abilities). Renders the same Offense/Drops sub-tabs +
            // card list that the standalone overlay used to show.
            powerupsItemsList: document.getElementById('powerups-items-list'),
            powerupsSubtabs: document.querySelectorAll('.powerups-subtab'),
            // Assists tab toggles (5.74).
            assistAimAssist: document.getElementById('assist-aim-assist'),
            assistAutoAim: document.getElementById('assist-auto-aim'),
            assistAutoFire: document.getElementById('assist-auto-fire'),
            assistAutoCastAbilities: document.getElementById('assist-auto-cast-abilities'),
            // 6.1.1 — assistAutoPower removed; autoFire drives power too.
            // 6.2.3 — Laser Sight toggle. Default ON, desktop-only.
            assistLaserSight: document.getElementById('assist-laser-sight'),
            // HUD pause button (top-left)
            hudPauseBtn: document.getElementById('hud-pause-btn'),
            hudShopBtn: document.getElementById('hud-shop-btn')
        };
    }
    
    setupEventListeners() {
        // 5.69.0 — delegated UI click sound. Captures every click on any
        // button-shaped element across the document and plays the
        // `menuClick` SFX once. Capture-phase + dataset-tagging avoids
        // double-fires for nested elements (e.g. clicking a label inside
        // a tab; the bubble walks back up to the same root). The throttle
        // in audio-manager keeps a multi-click streak from buzzing.
        //
        // Excluded: clicks that originate on the game canvas (gameplay
        // input — bullets / radial menu / tap-to-fire), and clicks on
        // explicitly opted-out elements (data-no-click-sound).
        const playClick = (e) => {
            const t = e.target;
            if (!t || !(t instanceof Element)) return;
            // Drop canvas clicks — those are gameplay, not UI.
            if (t.closest('canvas')) return;
            // Honor explicit opt-out.
            if (t.closest('[data-no-click-sound]')) return;
            // Match common button-like elements: native button, anchor,
            // ARIA role=button, plus the project's UI element classes.
            const matched = t.closest(
                'button, a, [role="button"], [data-click-sound], ' +
                '.pause-tab, .powerup-card, .shop-item, .shop-button, ' +
                '.shop-tab, .shop-close, .shop-row, .powerups-subtab, ' +
                '.music-track-row, .sfx-toggle-row'
            );
            if (!matched) return;
            if (this.audioManager) this.audioManager.playSound('menuClick');
        };
        document.addEventListener('click', playClick, true);
    }
    
    updateScore(money) {
        if (this.elements.score) {
            this.elements.score.textContent = `${Math.floor(money)}`;
        }
    }
    
    // 5.88.0 — `updateLives`, `positionLivesDisplay`, `drawTriforceFormation`,
    // and `drawTriangle` retired with the lives system. The canvas-based
    // tank widget in hud/status.js owns the visualization now.

    updateWave(wave) {
        // Wave display element no longer exists - wave info now shown via spawn timers
        if (this.elements.waveDisplay) {
            this.elements.waveDisplay.textContent = `WAVE: ${wave}`;
        }
    }
    
    hideShopButton() {
        if (this.elements.shopButton) {
            this.elements.shopButton.style.display = 'none';
        }
    }
    
    showShopButton() {
        if (this.elements.shopButton) {
            this.elements.shopButton.style.display = 'block';
        }
    }

    showHudPauseBtn() {
        if (this.elements.hudPauseBtn) {
            this.elements.hudPauseBtn.style.display = 'flex';
        }
    }

    hideHudPauseBtn() {
        if (this.elements.hudPauseBtn) {
            this.elements.hudPauseBtn.style.display = 'none';
        }
    }

    showHudShopBtn() {
        if (this.elements.hudShopBtn) {
            this.elements.hudShopBtn.style.display = 'flex';
        }
    }

    hideHudShopBtn() {
        if (this.elements.hudShopBtn) {
            this.elements.hudShopBtn.style.display = 'none';
        }
    }
    
    showMessage(title, subtitle = '', duration = 0, position = 'center') {
        console.log(`🎯 UI Manager showMessage called: "${title}" | "${subtitle}" | duration: ${duration} | position: ${position}`);
        
        // Check if message elements exist (they're commented out in HTML)
        if (!this.elements.messageTitle || !this.elements.messageSubtitle) {
            console.log('Message elements are commented out, skipping message display');
            return;
        }
        
        this.elements.messageTitle.textContent = title;
        this.elements.messageTitle.style.display = 'block';
        this.elements.messageSubtitle.innerHTML = subtitle.replace(/\n/g, '<br>');
        this.elements.messageSubtitle.style.display = subtitle ? 'block' : 'none';
        
        // Reset opacity for new message
        this.elements.messageTitle.style.opacity = '1';
        this.elements.messageSubtitle.style.opacity = '1';
        
        // Position the message overlay
        const overlay = document.getElementById('game-message-overlay');
        if (overlay && position === 'top') {
            overlay.style.justifyContent = 'flex-start';
            overlay.style.paddingTop = '12.5vh'; // 7/8 from top = 1/8 from top = 12.5% of viewport height
            // Reset font size for top messages
            this.elements.messageTitle.style.fontSize = '48px';
            this.elements.messageSubtitle.style.fontSize = '20px';
        } else if (overlay && position === 'shop') {
            overlay.style.justifyContent = 'flex-end';
            overlay.style.paddingTop = '0';
            overlay.style.paddingBottom = '120px'; // Position above shop button
            // Smaller font size for shop position
            this.elements.messageTitle.style.fontSize = '24px';
            this.elements.messageSubtitle.style.fontSize = '14px';
        } else if (overlay) {
            overlay.style.justifyContent = 'center';
            overlay.style.paddingTop = '0';
            overlay.style.paddingBottom = '0';
            // Reset font size for center messages
            this.elements.messageTitle.style.fontSize = '48px';
            this.elements.messageSubtitle.style.fontSize = '20px';
        }
        
        if (duration > 0) {
            // Check if this is a wave message or level up message to apply slow fade-out
            const isWaveMessage = title.startsWith('WAVE ');
            const isLevelUpMessage = title.startsWith('LEVEL ');
            if (isWaveMessage || isLevelUpMessage) {
                // Show for 60% of duration, then fade out over remaining 40%
                const fadeStartTime = duration * 0.6;
                const fadeOutDuration = duration * 0.4;
                
                setTimeout(() => {
                    this.fadeOutMessage(fadeOutDuration);
                }, fadeStartTime);
            } else {
                // Regular instant hide for non-wave/non-levelup messages
                setTimeout(() => this.hideMessage(), duration);
            }
        }
    }
    
    fadeOutMessage(fadeOutDuration) {
        // Disable CSS animations that might interfere with fade-out
        this.elements.messageTitle.style.animation = 'none';
        this.elements.messageSubtitle.style.animation = 'none';
        
        // Force a reflow to ensure animation disable takes effect
        this.elements.messageTitle.offsetHeight;
        this.elements.messageSubtitle.offsetHeight;
        
        // Add smooth transition for opacity
        this.elements.messageTitle.style.transition = `opacity ${fadeOutDuration}ms ease-out`;
        this.elements.messageSubtitle.style.transition = `opacity ${fadeOutDuration}ms ease-out`;
        
        // Force another reflow to ensure transition is applied
        this.elements.messageTitle.offsetHeight;
        this.elements.messageSubtitle.offsetHeight;
        
        // Use requestAnimationFrame to ensure the transition starts properly
        requestAnimationFrame(() => {
            // Start fade out
            this.elements.messageTitle.style.opacity = '0';
            this.elements.messageSubtitle.style.opacity = '0';
        });
        
        // Hide completely after fade completes
        setTimeout(() => {
            this.hideMessage();
        }, fadeOutDuration);
    }

    hideMessage() {
        // Check if message elements exist (they're commented out in HTML)
        if (!this.elements.messageTitle || !this.elements.messageSubtitle) {
            return;
        }
        
        this.elements.messageTitle.style.display = 'none';
        this.elements.messageSubtitle.style.display = 'none';
        
        // Clear any transitions and restore animations
        this.elements.messageTitle.style.transition = '';
        this.elements.messageSubtitle.style.transition = '';
        this.elements.messageTitle.style.animation = '';
        this.elements.messageSubtitle.style.animation = '';
        
        // Reset positioning to center for next message
        const overlay = document.getElementById('game-message-overlay');
        if (overlay) {
            overlay.style.justifyContent = 'center';
            overlay.style.paddingTop = '0';
        }
    }
    
    togglePause() {
        if (!this.elements.pauseOverlay) {
            return;
        }
        
        const isPaused = this.elements.pauseOverlay.style.display === 'flex';
        if (isPaused) {
            this.elements.pauseOverlay.style.display = 'none';
        } else {
            this.elements.pauseOverlay.style.display = 'flex';

            // Update powerups list when pause menu is shown
            this.updatePowerupsList();

            // Sync music player button state when pause menu is shown
            this.syncMusicPlayerState();

            // 5.79.58 — Controls tab is now built ONCE in setGameEngine()
            //   at boot. The bindings array is fully static (WASD,
            //   arrows, ESC etc. never change at runtime), so rebuilding
            //   it on every pause-open was both wasteful and the source
            //   of a visible flash where the empty `<div id="controls-tab">`
            //   stub showed for a frame before innerHTML repopulated.
            //   Removed — no per-open update needed.

            // Refresh weapon-equip tabs so the EQUIPPED badge stays current.
            this.updatePrimaryTab();
            this.updatePowerTab();
        }
        return !isPaused;
    }

    // 5.79.40 — Controls tab rewritten as a programmatic table builder.
    //   Two columns: action on the left, key binding (SimpleKeys
    //   pixel-art sprites) on the right. Sections (Movement / Combat /
    //   Loadout / System) are full-width header rows that span the
    //   table. The previous version called innerHTML with text-only
    //   markup every time the pause menu opened, which is why the
    //   sprite-based HTML never survived a tab open — the JS overrode
    //   it. Rebuilding from data on each open keeps the bindings in a
    //   single declarative source.
    updateControlsTab() {
        const controlsTab = document.getElementById('controls-tab');
        if (!controlsTab) return;

        // 5.100.1 — Mobile devices get a wholly different Controls page
        // that documents the analog stick + tap-for-power model. The
        // desktop / keyboard build below assumes WASD + mouse and is
        // useless to a mobile player.
        if (isMobile()) {
            this._renderMobileControlsTab(controlsTab);
            return;
        }

        const SPRITE_DIR = 'sprites/keys/';

        // Section icons reuse the SVG icon registry so the section
        //   headers carry the same visual treatment as the rest of
        //   the SVG-based UI.
        const sections = [
            {
                name: 'Movement',
                accent: 'cyan',
                iconPath: 'M12 2 L4 5 V11 C4 16 7.5 20.5 12 22 C16.5 20.5 20 16 20 11 V5 Z',
                rows: [
                    { action: 'Move ship', keys: [{ kind: 'wasd' }] },
                    // 6.1.1 — Dash row added. SHIFT is the dodge button:
                    // 135 px burst over 250 ms, 1.5 s cooldown, i-frames
                    // during the burst. Critical for late-game survival.
                    { action: 'Dash', keys: [
                        { kind: 'sprite', file: 'SHIFT.png', alt: 'Shift' },
                    ] },
                ],
            },
            {
                name: 'Combat',
                accent: 'orange',
                iconPath: 'M12 4 A8 8 0 1 0 12 20 A8 8 0 1 0 12 4 Z M12 8 A4 4 0 1 0 12 16 A4 4 0 1 0 12 8 Z M12 11 A1 1 0 1 0 12 13 A1 1 0 1 0 12 11 Z',
                rows: [
                    { action: 'Aim', keys: [
                        { kind: 'mouse', side: 'none' },
                        { kind: 'or' },
                        { kind: 'sprite', file: 'ARROWLEFT.png', alt: 'Left' },
                        { kind: 'sprite', file: 'ARROWRIGHT.png', alt: 'Right' },
                    ] },
                    { action: 'Fire Primary', keys: [
                        { kind: 'mouse', side: 'left' },
                        { kind: 'or' },
                        { kind: 'sprite', file: 'ARROWUP.png', alt: 'Up' },
                    ] },
                    { action: 'Fire Power', keys: [
                        { kind: 'mouse', side: 'right' },
                        { kind: 'or' },
                        { kind: 'sprite', file: 'SPACE.png', alt: 'Space' },
                        { kind: 'or' },
                        { kind: 'sprite', file: 'ARROWDOWN.png', alt: 'Down' },
                    ] },
                    { action: 'Activate Ability', keys: [
                        { kind: 'sprite', file: 'TAB.png', alt: 'Tab' },
                    ] },
                ],
            },
            {
                name: 'Loadout',
                accent: 'pink',
                iconPath: 'M13 2 L4 14 H10 L9 22 L20 9 H13 Z',
                rows: [
                    // Hold to open the weapon/ability radial; the cursor picks
                    // a slice and a click equips it (event-setup.js).
                    { action: 'Primary Radial', keys: [
                        { kind: 'sprite', file: 'F.png', alt: 'F' },
                    ] },
                    { action: 'Power Radial', keys: [
                        { kind: 'sprite', file: 'E.png', alt: 'E' },
                    ] },
                    { action: 'Defense Radial', keys: [
                        { kind: 'sprite', file: 'R.png', alt: 'R' },
                    ] },
                ],
            },
            {
                name: 'System',
                accent: 'gold',
                iconPath: 'M7 5 H10 V19 H7 Z M14 5 H17 V19 H14 Z',
                rows: [
                    { action: 'Pause or Resume', keys: [
                        { kind: 'spriteCluster', files: ['ESC.png'], alt: 'ESC' },
                        // { kind: 'spriteCluster', files: ['E.png', 'S.png', 'C.png'], alt: 'ESC' },
                    ] },
                    { action: 'Stats Screen', keys: [
                        { kind: 'text', label: '`' },
                    ] },
                ],
            },
        ];

        // Build DOM with createElement — no innerHTML for the body,
        //   so the sprite paths are guaranteed to resolve via the
        //   browser's standard <img> resource pipeline.
        controlsTab.replaceChildren();

        const heading = document.createElement('h2');
        heading.textContent = 'CONTROLS';
        controlsTab.appendChild(heading);

        const table = document.createElement('table');
        table.className = 'controls-table';

        for (const section of sections) {
            // Section header row — spans both columns.
            const headerRow = document.createElement('tr');
            headerRow.className = 'controls-section-row';
            headerRow.dataset.accent = section.accent;

            const headerCell = document.createElement('td');
            headerCell.colSpan = 2;
            headerCell.className = 'controls-section-cell';

            const iconWrap = document.createElement('span');
            iconWrap.className = 'controls-section-icon';
            // Build the SVG via createElementNS so there's no
            //   string-interpolated HTML — keeps the static analyzer
            //   happy and avoids any innerHTML usage on this branch.
            const SVG_NS = 'http://www.w3.org/2000/svg';
            const svgEl = document.createElementNS(SVG_NS, 'svg');
            svgEl.setAttribute('viewBox', '0 0 24 24');
            svgEl.setAttribute('width', '18');
            svgEl.setAttribute('height', '18');
            svgEl.setAttribute('fill', 'currentColor');
            const pathEl = document.createElementNS(SVG_NS, 'path');
            pathEl.setAttribute('d', section.iconPath);
            svgEl.appendChild(pathEl);
            iconWrap.appendChild(svgEl);
            headerCell.appendChild(iconWrap);

            // 5.79.43 — Animated bullet dot removed; the SVG icon alone
            //   is the section indicator. The doubled-up icon+dot was
            //   crowded.
            const title = document.createElement('span');
            title.className = 'controls-section-title';
            title.textContent = section.name;
            headerCell.appendChild(title);

            headerRow.appendChild(headerCell);
            table.appendChild(headerRow);

            for (const row of section.rows) {
                const tr = document.createElement('tr');
                tr.className = 'controls-row';
                tr.dataset.accent = section.accent;

                const actionCell = document.createElement('td');
                actionCell.className = 'controls-action';
                actionCell.textContent = row.action;
                tr.appendChild(actionCell);

                const keysCell = document.createElement('td');
                keysCell.className = 'controls-keys';
                for (const k of row.keys) {
                    keysCell.appendChild(this._buildKeyTile(k, SPRITE_DIR));
                }
                tr.appendChild(keysCell);

                table.appendChild(tr);
            }
        }

        controlsTab.appendChild(table);

        const footer = document.createElement('div');
        footer.className = 'controls-footer';

        footer.appendChild(this._buildKeyTile({ kind: 'spriteCluster', files: ['ESC.png'], alt: 'ESC', small: true }, SPRITE_DIR));
        // footer.appendChild(this._buildKeyTile({ kind: 'spriteCluster', files: ['E.png', 'S.png', 'C.png'], alt: 'ESC', small: true }, SPRITE_DIR));
        const hint = document.createElement('span');
        hint.className = 'controls-footer-text';
        hint.textContent = 'to resume play';
        footer.appendChild(hint);
        controlsTab.appendChild(footer);
    }

    // 6.1.1 — Mobile-specific Controls page. Documents the new dodge-
    // first model: analog stick to move, tap anywhere to DASH (i-frames),
    // and auto-fire / auto-aim handle ALL the shooting (primary + power).
    _renderMobileControlsTab(controlsTab) {
        controlsTab.replaceChildren();

        const heading = document.createElement('h2');
        heading.textContent = 'CONTROLS';
        controlsTab.appendChild(heading);

        const sections = [
            {
                name: 'Movement',
                accent: 'cyan',
                rows: [
                    { action: 'Move ship', glyph: '🎮', detail: 'Drag the analog stick at the bottom corner' },
                    { action: 'Dash', glyph: '⚡', detail: 'TAP anywhere outside the stick. 1.5s cooldown' },
                ],
            },
            {
                name: 'Combat',
                accent: 'orange',
                rows: [
                    { action: 'Aim',              glyph: '🎯', detail: 'AUTO — locks onto nearest target' },
                    { action: 'Fire primary',     glyph: '🔫', detail: 'AUTO — holds while a target is in range' },
                    { action: 'Fire power',       glyph: '💥', detail: 'AUTO — fires the moment it\'s ready / fully charged' },
                ],
            },
            {
                name: 'System',
                accent: 'gold',
                rows: [
                    { action: 'Shop / Stats / Pause', glyph: '⏸', detail: 'Tap the buttons at the bottom of the screen' },
                    { action: 'Swap primary weapon',  glyph: '🔄', detail: 'Pause menu → PRIMARY tab' },
                    { action: 'Swap power weapon',    glyph: '🔄', detail: 'Pause menu → POWER tab' },
                    { action: 'Buy powerups',         glyph: '✨', detail: 'Open Shop → POWERUPS tab (gold)' },
                ],
            },
            {
                name: 'Tips',
                accent: 'pink',
                rows: [
                    { action: 'Dash through bullets', glyph: '⚡', detail: 'Tap timing IS the game on mobile. I-frames during the burst' },
                    { action: 'Pick up items',        glyph: '💎', detail: 'Items magnet to you automatically. They auto-equip if they\'re an upgrade' },
                ],
            },
        ];

        const table = document.createElement('table');
        table.className = 'controls-table';

        for (const section of sections) {
            const headerRow = document.createElement('tr');
            headerRow.className = 'controls-section-row';
            headerRow.dataset.accent = section.accent;
            const headerCell = document.createElement('td');
            headerCell.colSpan = 2;
            headerCell.className = 'controls-section-cell';
            const headerTitle = document.createElement('span');
            headerTitle.className = 'controls-section-title';
            headerTitle.textContent = section.name;
            headerCell.appendChild(headerTitle);
            headerRow.appendChild(headerCell);
            table.appendChild(headerRow);

            for (const row of section.rows) {
                const tr = document.createElement('tr');
                tr.className = 'controls-row';

                const actionCell = document.createElement('td');
                actionCell.className = 'controls-action';
                actionCell.textContent = row.action;
                tr.appendChild(actionCell);

                const keysCell = document.createElement('td');
                keysCell.className = 'controls-keys';
                const chip = document.createElement('span');
                chip.className = 'controls-mobile-chip';
                if (row.glyph) {
                    const g = document.createElement('span');
                    g.className = 'controls-mobile-chip-icon';
                    g.textContent = row.glyph;
                    chip.appendChild(g);
                }
                const text = document.createElement('span');
                text.className = 'controls-mobile-chip-text';
                text.textContent = row.detail;
                chip.appendChild(text);
                keysCell.appendChild(chip);
                tr.appendChild(keysCell);
                table.appendChild(tr);
            }
        }
        controlsTab.appendChild(table);

        const footer = document.createElement('div');
        footer.className = 'controls-footer';
        const hint = document.createElement('span');
        hint.className = 'controls-footer-text';
        hint.textContent = 'Tap RESUME (top) to return to play';
        footer.appendChild(hint);
        controlsTab.appendChild(footer);
    }

    // Build a single key tile: sprite, sprite-backed text, "or"
    //   separator, WASD diamond, or mouse SVG. Returns a DOM Node
    //   ready to append.
    _buildKeyTile(k, dir) {
        if (k.kind === 'sprite') {
            const img = document.createElement('img');
            img.className = 'kbd';
            img.src = dir + k.file;
            img.alt = k.alt || '';
            img.decoding = 'sync';
            return img;
        }
        if (k.kind === 'text') {
            const span = document.createElement('span');
            const cls = ['kbd-sprite-text'];
            if (k.wide)  cls.push('kbd-sprite-wide');
            if (k.small) cls.push('kbd-sprite-small');
            if (k.tone)  cls.push('kbd-tone-' + k.tone);
            span.className = cls.join(' ');
            span.textContent = k.label;
            return span;
        }
        if (k.kind === 'or') {
            const span = document.createElement('span');
            span.className = 'kbd-or';
            span.textContent = 'or';
            return span;
        }
        if (k.kind === 'spriteCluster') {
            // 5.79.50 — Composite multi-letter key built from individual
            //   Jumbo letter sprites (used for ESC = E + S + C). Letters
            //   sit flush together so the cluster reads as a single
            //   tactile key while reusing the existing single-letter
            //   pixel-art assets.
            const wrap = document.createElement('span');
            const cls = ['kbd-sprite-cluster'];
            if (k.small) cls.push('kbd-sprite-cluster-small');
            wrap.className = cls.join(' ');
            wrap.setAttribute('aria-label', k.alt || '');
            for (const file of (k.files || [])) {
                const img = document.createElement('img');
                img.className = 'kbd';
                img.src = dir + file;
                img.alt = '';
                img.decoding = 'sync';
                wrap.appendChild(img);
            }
            return wrap;
        }
        if (k.kind === 'wasd') {
            const wrap = document.createElement('span');
            wrap.className = 'kbd-cluster kbd-wasd';
            const w = document.createElement('img');
            w.className = 'kbd';
            w.src = dir + 'W.png';
            w.alt = 'W';
            w.decoding = 'sync';
            wrap.appendChild(w);
            const bottom = document.createElement('span');
            bottom.className = 'kbd-row-bottom';
            for (const letter of ['A', 'S', 'D']) {
                const im = document.createElement('img');
                im.className = 'kbd';
                im.src = dir + letter + '.png';
                im.alt = letter;
                im.decoding = 'sync';
                bottom.appendChild(im);
            }
            wrap.appendChild(bottom);
            return wrap;
        }
        if (k.kind === 'mouse') {
            return this._buildMouseSvgKey(k.side);
        }
        // Fallback — plain text node.
        return document.createTextNode(String(k.label || ''));
    }

    // 5.79.42 — Mouse-button SVG key tile. Original silhouette:
    //   pear-shaped body with a divider between the L/R buttons and
    //   the body, a small scroll-wheel rectangle at center-top.
    //   `side` is 'left' / 'right' / 'none':
    //     - 'left'  → left button filled with `currentColor` (cyan).
    //     - 'right' → right button filled with `currentColor` (orange).
    //     - 'none'  → neither button highlighted; just the silhouette,
    //                 dividers, and wheel. Used by the "Aim reticle"
    //                 binding (5.79.45) where the user mouses without
    //                 a click.
    //
    //   Built with createElementNS so the SVG renders inline without
    //   any string-interpolated HTML (security-analyzer-friendly).
    _buildMouseSvgKey(side) {
        const SVG_NS = 'http://www.w3.org/2000/svg';
        const wrap = document.createElement('span');
        wrap.className = 'kbd-mouse-svg';
        if (side === 'left')  wrap.classList.add('kbd-mouse-l');
        if (side === 'right') wrap.classList.add('kbd-mouse-r');
        if (side === 'none')  wrap.classList.add('kbd-mouse-none');

        const svg = document.createElementNS(SVG_NS, 'svg');
        svg.setAttribute('viewBox', '0 0 24 32');
        svg.setAttribute('fill', 'none');
        const ariaLabel =
            side === 'left'  ? 'Left mouse button'  :
            side === 'right' ? 'Right mouse button' :
                               'Mouse';
        svg.setAttribute('aria-label', ariaLabel);

        // Mouse body silhouette — symmetric pear shape.
        const body = document.createElementNS(SVG_NS, 'path');
        body.setAttribute('d',
            'M 12 4 C 7 4 5 7 5 12 L 5 22 ' +
            'C 5 28 8 30 12 30 ' +
            'C 16 30 19 28 19 22 ' +
            'L 19 12 C 19 7 17 4 12 4 Z');
        body.setAttribute('class', 'mouse-body');
        svg.appendChild(body);

        // Active button highlight — only drawn for left/right.
        if (side === 'left' || side === 'right') {
            const button = document.createElementNS(SVG_NS, 'path');
            if (side === 'left') {
                button.setAttribute('d',
                    'M 12 4 C 7 4 5 7 5 12 L 5 14 L 12 14 Z');
            } else {
                button.setAttribute('d',
                    'M 12 4 L 12 14 L 19 14 L 19 12 C 19 7 17 4 12 4 Z');
            }
            button.setAttribute('class', 'mouse-button-active');
            svg.appendChild(button);
        }

        // Vertical divider between the two top buttons.
        const vDiv = document.createElementNS(SVG_NS, 'line');
        vDiv.setAttribute('x1', '12');
        vDiv.setAttribute('y1', '4');
        vDiv.setAttribute('x2', '12');
        vDiv.setAttribute('y2', '14');
        vDiv.setAttribute('class', 'mouse-divider');
        svg.appendChild(vDiv);

        // Horizontal divider — separates the button row from the body.
        const hDiv = document.createElementNS(SVG_NS, 'line');
        hDiv.setAttribute('x1', '5');
        hDiv.setAttribute('y1', '14');
        hDiv.setAttribute('x2', '19');
        hDiv.setAttribute('y2', '14');
        hDiv.setAttribute('class', 'mouse-divider');
        svg.appendChild(hDiv);

        // Tiny scroll-wheel rectangle centered between the buttons.
        const wheel = document.createElementNS(SVG_NS, 'rect');
        wheel.setAttribute('x', '11');
        wheel.setAttribute('y', '7');
        wheel.setAttribute('width', '2');
        wheel.setAttribute('height', '4');
        wheel.setAttribute('rx', '0.8');
        wheel.setAttribute('class', 'mouse-wheel');
        svg.appendChild(wheel);

        // 5.79.45 — Motion arcs flanking the body convey "the mouse
        //   is being moved" for the neutral aim-reticle binding.
        //   Two short curves on each side, bowed outward at the
        //   body's vertical midline. Drawn into a slightly wider
        //   viewBox (-3 0 30 32) so the arcs sit just outside the
        //   pear-shape silhouette without clipping.
        if (side === 'none') {
            svg.setAttribute('viewBox', '-3 0 30 32');
            const arcs = [
                'M 3 11 Q 0 16 3 21',   // left outer
                'M 3 13 Q 1 16 3 19',   // left inner
                'M 21 11 Q 24 16 21 21', // right outer
                'M 21 13 Q 23 16 21 19', // right inner
            ];
            for (const d of arcs) {
                const arc = document.createElementNS(SVG_NS, 'path');
                arc.setAttribute('d', d);
                arc.setAttribute('class', 'mouse-motion');
                svg.appendChild(arc);
            }
        }

        wrap.appendChild(svg);
        return wrap;
    }

    // ── Pause-menu PRIMARY tab ─────────────────────────────────────────────
    // Lists every primary weapon. Click a row to equip it. Primaries are
    // free and always available — no `ownedPrimaries` gating.
    //
    // All DOM is built with createElement / textContent (no innerHTML) to
    // keep XSS risk impossible even if a future weapon-data entry contains
    // markup-flavored characters.
    // 6.x — Pause-menu STATS tab. Reuses the shared SP-allocation card
    // (passive stat icons + [−]/[+] controls) so the player can spend and
    // freely redistribute stat points without leaving the pause menu.
    // The backtick stats overlay renders the same card.
    updateStatsTab() {
        const tab = document.getElementById('stats-tab');
        if (!tab) return;
        const player = this.gameEngine && this.gameEngine.player;
        tab.replaceChildren();
        const h2 = document.createElement('h2');
        h2.textContent = 'STATS';
        tab.appendChild(h2);
        const subtitle = document.createElement('div');
        subtitle.className = 'pause-tab-subtitle';
        subtitle.textContent = 'Spend & freely redistribute passive stat points';
        tab.appendChild(subtitle);
        if (!player) return;
        renderSpAllocation(tab, player, { onChange: () => this.updateStatsTab() });
    }

    updatePrimaryTab() {
        // 5.79.59 — Owns the entire #primary-tab now (h2 + subtitle +
        //   list). Was scoped to the inner #primary-weapon-list
        //   container with the heading hardcoded in index.html, which
        //   meant the tab couldn't be pre-rendered without leaving
        //   stale static markup behind. Now the function builds
        //   everything from scratch via createElement so a single
        //   stub `<div id="primary-tab">` in index.html is enough.
        const tab = document.getElementById('primary-tab');
        if (!tab) return;
        const player = this.gameEngine && this.gameEngine.player;
        if (!player) {
            tab.replaceChildren();
            return;
        }

        tab.replaceChildren();
        const h2 = document.createElement('h2');
        h2.textContent = 'PRIMARY WEAPON';
        tab.appendChild(h2);
        const subtitle = document.createElement('div');
        subtitle.className = 'pause-tab-subtitle';
        subtitle.textContent = 'Click a weapon to equip it';
        tab.appendChild(subtitle);

        const list = document.createElement('div');
        list.id = 'primary-weapon-list';
        list.className = 'pause-tab-list';
        tab.appendChild(list);

        const PRIMARY = this.gameEngine.PRIMARY_WEAPONS_LIST;
        if (!PRIMARY) {
            const placeholder = document.createElement('div');
            placeholder.style.color = '#888';
            placeholder.textContent = 'Weapon list unavailable.';
            list.appendChild(placeholder);
            return;
        }
        for (const id of Object.keys(PRIMARY)) {
            const equipped = player.activePrimary === id;
            list.appendChild(this._buildWeaponRow(PRIMARY[id], id, equipped, '#00ccff', () => {
                if (player.ownedPrimaries && !player.ownedPrimaries.has(id)) {
                    player.ownedPrimaries.add(id);
                }
                player.equipPrimary(id);
                this.updatePrimaryTab();
            }));
        }
    }

    // ── Pause-menu POWER tab ───────────────────────────────────────────────
    // Lists every power weapon. Click a row to equip it. Powers are now
    // free and always available — same model as primaries. Upgrades are
    // still purchased in the shop's POWER tab (which surfaces the upgrades
    // for whichever power is currently equipped).
    updatePowerTab() {
        // 5.79.59 — Owns the entire #power-tab now (h2 + subtitle +
        //   list). Same refactor pattern as updatePrimaryTab: a single
        //   stub `<div id="power-tab">` in index.html is enough; the
        //   function builds everything from scratch on each call.
        const tab = document.getElementById('power-tab');
        if (!tab) return;
        const player = this.gameEngine && this.gameEngine.player;
        if (!player) {
            tab.replaceChildren();
            return;
        }

        tab.replaceChildren();
        const h2 = document.createElement('h2');
        h2.textContent = 'POWER WEAPON';
        tab.appendChild(h2);
        const subtitle = document.createElement('div');
        subtitle.className = 'pause-tab-subtitle';
        subtitle.textContent = 'Click a weapon to equip it';
        tab.appendChild(subtitle);

        const list = document.createElement('div');
        list.id = 'power-weapon-list';
        list.className = 'pause-tab-list';
        tab.appendChild(list);

        const POWER = this.gameEngine.POWER_WEAPONS_LIST;
        if (!POWER) return;
        for (const id of Object.keys(POWER)) {
            const equipped = player.activePower === id;
            list.appendChild(this._buildWeaponRow(POWER[id], id, equipped, '#ffaa00', () => {
                // Auto-add to ownedPowers (set still gates equipPower).
                if (player.ownedPowers && !player.ownedPowers.has(id)) {
                    player.ownedPowers.add(id);
                }
                player.equipPower(id);
                this.updatePowerTab();
            }));
        }
    }

    // ── Pause-menu PASSIVES tab (P5b) ──────────────────────────────────────
    // The in-run swap panel: assign any OWNED, slot-deliverable passive into any
    // currently-UNLOCKED slot, and unequip, at any time. Clicking an unequipped
    // passive drops it into the first free unlocked slot; clicking an equipped
    // one removes it. player.equipPassive enforces the keystone budget (≤2) +
    // resets ramp accrual on the swap.
    updatePassivesTab() {
        const tab = document.getElementById('passives-tab');
        if (!tab) return;
        const player = this.gameEngine && this.gameEngine.player;
        tab.replaceChildren();
        if (!player) return;

        const slots = Array.isArray(player.equippedPassives) ? player.equippedPassives : [];
        const unlocked = Math.max(0, player.passiveSlotsUnlocked | 0);
        const owned = (player.ownedPassives instanceof Set) ? player.ownedPassives : new Set();
        const equippedCount = slots.slice(0, unlocked).filter(Boolean).length;
        const keystoneCount = slots.slice(0, unlocked)
            .filter((id) => id && getPassive(id) && (getPassive(id).tags || []).includes('keystone')).length;

        const h2 = document.createElement('h2');
        h2.textContent = 'PASSIVES';
        tab.appendChild(h2);
        const subtitle = document.createElement('div');
        subtitle.className = 'pause-tab-subtitle';
        subtitle.textContent = `${equippedCount}/${unlocked} slot${unlocked === 1 ? '' : 's'} filled · ${keystoneCount}/2 keystones · click to equip / unequip · swap freely`;
        tab.appendChild(subtitle);

        const list = document.createElement('div');
        list.id = 'passives-swap-list';
        list.className = 'pause-tab-list';
        tab.appendChild(list);

        // Owned, slot-deliverable passives (the run's pool ∩ slot channel).
        const pool = getSlotPassives().filter((p) => owned.has(p.id));
        if (pool.length === 0) {
            const empty = document.createElement('div');
            empty.style.color = '#888';
            empty.textContent = 'No passives owned for this run. Unlock + pick them on the BUILD screen.';
            list.appendChild(empty);
            return;
        }

        for (const def of pool) {
            const slotIdx = slots.indexOf(def.id);
            const equipped = slotIdx !== -1 && slotIdx < unlocked;
            const keystone = (def.tags || []).includes('keystone');
            const row = this._buildPassiveSwapRow(def, equipped, equipped ? slotIdx : -1, keystone, () => {
                if (equipped) {
                    player.equipPassive(slotIdx, null);
                } else {
                    // First free unlocked slot, else no-op (unequip one to free room).
                    let free = -1;
                    for (let i = 0; i < unlocked; i++) { if (!slots[i]) { free = i; break; } }
                    if (free !== -1) player.equipPassive(free, def.id);
                }
                this.updatePassivesTab();
            });
            list.appendChild(row);
        }
    }

    _buildPassiveSwapRow(def, equipped, slotIdx, keystone, onClick) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'pause-equip-row' + (equipped ? ' equipped' : '');
        const name = document.createElement('span');
        name.className = 'pause-equip-name';
        name.textContent = (keystone ? '★ ' : '') + (def.name || def.id);
        const desc = document.createElement('span');
        desc.className = 'pause-equip-desc';
        desc.textContent = (def.desc || '') + (def.downside ? `  ↯ ${def.downside}` : '');
        const status = document.createElement('span');
        status.className = 'pause-equip-status';
        status.textContent = equipped ? `SLOT ${slotIdx + 1}` : '';
        row.append(name, desc, status);
        row.addEventListener('click', (e) => { e.stopPropagation(); onClick(); });
        return row;
    }

    // Shared row builder for both PRIMARY and POWER tabs.
    // No innerHTML anywhere — every text node is set via textContent.
    // The click listener wraps `onClick` with stopPropagation BEFORE calling
    // it, because `onClick` typically re-renders the tab via replaceChildren
    // — which detaches the clicked row. The bubbling click then reaches the
    // pause-overlay's dismissOnBackdrop handler, which calls
    // `e.target.closest('#pause-menu')`. On a detached node closest() walks
    // a null parent chain and returns null, so the backdrop misclassifies
    // the click as "outside menu" and toggles pause off. stopPropagation
    // prevents the bubble entirely.
    _buildWeaponRow(weaponDef, weaponId, equipped, defaultBorder, onClick) {
        const accent = (equipped && weaponDef.color) ? weaponDef.color : defaultBorder;
        const row = document.createElement('div');
        row.className = 'weapon-row';
        row.dataset.weaponId = weaponId;
        row.style.cssText = `
            display: flex; align-items: center; gap: 14px;
            padding: 12px 14px; border-radius: 8px; cursor: pointer;
            background: ${equipped ? 'rgba(255, 255, 255, 0.10)' : 'rgba(255, 255, 255, 0.05)'};
            border: 2px solid ${equipped ? accent : 'rgba(255, 255, 255, 0.15)'};
            transition: background 0.15s, border-color 0.15s, transform 0.1s;
        `;

        const iconEl = document.createElement('span');
        iconEl.style.cssText = 'font-size: 28px; min-width: 36px; text-align: center; display: inline-flex; align-items: center; justify-content: center; color: inherit;';
        iconEl.innerHTML = renderIconHTML(weaponDef.icon, { size: 28, fallback: '?' });
        row.appendChild(iconEl);

        const body = document.createElement('div');
        body.style.cssText = 'flex: 1; text-align: left;';

        const nameRow = document.createElement('div');
        nameRow.style.cssText = `font-size: 14px; color: ${equipped ? accent : '#FFF'}; font-weight: bold;`;
        nameRow.textContent = weaponDef.name || weaponId;
        if (equipped) {
            const badge = document.createElement('span');
            badge.style.cssText = 'font-size: 10px; color: #00ff88; margin-left: 8px;';
            badge.textContent = 'EQUIPPED';
            nameRow.appendChild(badge);
        }
        body.appendChild(nameRow);

        const descEl = document.createElement('div');
        descEl.style.cssText = 'font-size: 11px; color: #aaa; margin-top: 4px; line-height: 1.4;';
        descEl.textContent = weaponDef.description || '';
        body.appendChild(descEl);

        row.appendChild(body);

        row.addEventListener('mouseenter', () => {
            if (!equipped) row.style.background = 'rgba(255, 255, 255, 0.12)';
            row.style.transform = 'translateY(-1px)';
        });
        row.addEventListener('mouseleave', () => {
            if (!equipped) row.style.background = 'rgba(255, 255, 255, 0.05)';
            row.style.transform = 'none';
        });
        row.addEventListener('click', (e) => {
            e.stopPropagation();
            onClick();
        });
        return row;
    }
    
    // showTitleScreen() {
    //     this.elements.titleScreen.style.display = 'flex';
    // }
    
    // hideTitleScreen() {
    //     this.elements.titleScreen.style.display = 'none';
    // }
    
    // setupTitleScreen() {
    //     const titleText = "RAINBOIDS";
    //     this.elements.gameTitle.innerHTML = '';
    //     titleText.split('').forEach((char, index) => {
    //         const span = document.createElement('span');
    //         span.textContent = char;
    //         span.className = 'title-char';
    //         span.style.animationDelay = `${index * 0.1}s`;
    //         this.elements.gameTitle.appendChild(span);
    //     });
    // }
    
    // updateHighScore(highScore) {
    //     this.elements.highScoreDisplay.textContent = `HIGH SCORE: ${highScore}`;
    // }
    
    checkOrientation() {
        // Desktop-only build: no orientation handling. Kept as a no-op so the
        // ui:check-orientation event bus subscription stays valid.
        return false;
    }
    
    // Currently-active sub-tab in the Powerups pause-tab.
    // Persisted on the instance so subsequent renders remember it.
    _powerupsSubTab = 'OFFENSE';

    setPowerupsSubTab(sub) {
        this._powerupsSubTab = sub;
        if (this.elements.powerupsSubtabs) {
            this.elements.powerupsSubtabs.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.subtab === sub);
            });
        }
        this.renderPowerupsOverlay();
    }

    // Render the Powerups overlay — shows EVERY known powerup in the
    // selected category with its current stack count (0 for ones the
    // player hasn't picked up yet). Mirrors the shop-card visual so
    // the screen reads as a "collection" page.
    renderPowerupsOverlay() {
        // 5.79.59 — Owns the entire #powerups-tab now. Builds h2 +
        //   scroll-container `#powerups-items-list` from scratch on
        //   each call so a single empty stub in index.html is enough.
        const tab = document.getElementById('powerups-tab');
        if (!tab || !this.gameEngine?.player) return;
        tab.replaceChildren();
        const h2 = document.createElement('h2');
        h2.textContent = 'POWERUPS';
        tab.appendChild(h2);
        const list = document.createElement('div');
        list.id = 'powerups-items-list';
        list.className = 'pause-tab-list pause-tab-list--scroll';
        tab.appendChild(list);
        // Keep `this.elements.powerupsItemsList` pointing at the live
        //   container so any external caller that cached the reference
        //   still works.
        this.elements.powerupsItemsList = list;

        const player = this.gameEngine.player;
        // 6.0.0 — Powerups are bought with GOLD. SP retired alongside
        // player leveling. Top banner shows the player's gold balance.
        const gold = (this.gameEngine.game && this.gameEngine.game.money) | 0;
        const banner = document.createElement('div');
        banner.className = 'powerups-pick-banner';
        const bannerSigil = document.createElement('span');
        bannerSigil.className = 'powerups-pick-sigil';
        bannerSigil.textContent = '$';
        banner.appendChild(bannerSigil);
        const bannerCount = document.createElement('span');
        bannerCount.className = 'powerups-pick-count';
        bannerCount.textContent = `${gold}`;
        banner.appendChild(bannerCount);
        const bannerLabel = document.createElement('span');
        bannerLabel.className = 'powerups-pick-label';
        bannerLabel.textContent = 'GOLD AVAILABLE';
        banner.appendChild(bannerLabel);
        list.appendChild(banner);

        // 5.100.3 — Filter out powerups with `hidden: true` so retired
        // entries (the LONG_RANGE definition lived here briefly before
        // its full removal in 5.110.0) don't pollute the visible
        // Powerups list. The filter stays as a forward-compat guard for
        // any future config flagged `hidden`.
        const entries = Object.entries(POWERUP_TYPES).filter(([, cfg]) => !cfg.hidden);

        if (entries.length === 0) {
            const empty = document.createElement('div');
            empty.style.cssText = 'text-align: center; color: #888; padding: 40px; font-family: monospace;';
            empty.textContent = 'No powerups available.';
            list.appendChild(empty);
            return;
        }

        for (const [type, cfg] of entries) {
            const stacks = player.getPowerupStacks ? player.getPowerupStacks(type) : 0;
            const owned = stacks > 0;

            const card = document.createElement('div');
            card.className = 'powerup-card' + (owned ? ' powerup-card--owned' : ' powerup-card--locked');
            // 5.74.16 — owned cards use a single bright-blue accent
            // (was cfg.color per-powerup, which made the strip look
            // chaotic with rainbow borders). Fixed cyan-blue plus a
            // soft glow reads as a clean uniform "purchased" frame.
            if (owned) {
                card.style.borderColor = '#00ccff';
                card.style.boxShadow = '0 0 14px rgba(0, 204, 255, 0.45)';
            }
            // Card-wide click behaves like the buy button. Disabled at
            // cap so maxed cards don't accept clicks.
            const cardCap = cfg.maxStacks || 99;
            const cardAtCap = stacks >= cardCap;
            // 6.0.0 — Stack-aware GOLD cost via powerupGoldCost (see
            // world/powerup.js). Same formula the buyer + button label
            // use so the displayed price matches what gets deducted.
            const cardGoldCost  = powerupGoldCost(cfg, stacks);
            const cardCanAfford = gold >= cardGoldCost;
            if (cardCanAfford && !cardAtCap) {
                card.classList.add('powerup-card--interactive');
                card.addEventListener('click', (e) => {
                    e.stopPropagation();
                    this.purchasePowerup(type);
                });
            }

            const iconWrap = document.createElement('div');
            iconWrap.className = 'powerup-card-icon';
            iconWrap.style.color = cfg.color || '#cccccc';
            iconWrap.innerHTML = renderIconHTML(cfg.icon, { size: 32, fallback: '★' });
            card.appendChild(iconWrap);

            const body = document.createElement('div');
            body.className = 'powerup-card-body';

            const name = document.createElement('div');
            name.className = 'powerup-card-name';
            const abbr = cfg.abbr || (cfg.name || type).slice(0, 3).toUpperCase();
            name.textContent = `${cfg.name || type} (${abbr})`;
            name.style.color = cfg.color || '#ffffff';
            body.appendChild(name);

            const desc = document.createElement('div');
            desc.className = 'powerup-card-desc';
            // 5.79.3 — beam-aware powerup descriptions. When a beam
            //   weapon is equipped, bullet-flavored powerups (RAPID,
            //   MULTI, BIG, PIERCING, HOMING, EXPLOSIVE) read as
            //   "beam DPS bonus" instead of their bullet-only effect.
            //   Switches back automatically when the player swaps to
            //   a non-beam primary.
            desc.textContent = _beamAwarePowerupDescription(type, cfg, player);
            body.appendChild(desc);

            card.appendChild(body);

            // 5.75.0 — show stacks against the cap (e.g. ×3 / 5).
            const cap = cfg.maxStacks || 99;
            const atCap = stacks >= cap;
            const right = document.createElement('div');
            right.className = 'powerup-card-stacks';
            right.textContent = owned ? `×${stacks} / ${cap}` : `0 / ${cap}`;
            card.appendChild(right);

            // Buy button — shows the stack-aware gold cost (e.g.
            //   "1500 G" at stack 0, "2350 G" at stack 1, etc.).
            //   Disabled at cap or when the player can't afford.
            const buyBtn = document.createElement('button');
            buyBtn.type = 'button';
            buyBtn.className = 'powerup-card-buy';
            buyBtn.textContent = atCap ? 'MAX' : `${cardGoldCost} G`;
            buyBtn.disabled = atCap || gold < cardGoldCost;
            buyBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                e.preventDefault();
                this.purchasePowerup(type);
            });
            card.appendChild(buyBtn);

            list.appendChild(card);
        }
    }

    // 6.0.0 — Buy a powerup by spending GOLD. SP retired alongside
    //   player leveling. Re-renders the list after success.
    purchasePowerup(type) {
        const ge = this.gameEngine;
        if (!ge || !ge.player || !ge.game) return false;
        const cfg = POWERUP_TYPES[type];
        if (!cfg) return false;
        const cap = cfg.maxStacks || 99;
        const stacks = ge.player.getPowerupStacks ? ge.player.getPowerupStacks(type) : 0;
        if (stacks >= cap) return false;
        const cost = powerupGoldCost(cfg, stacks);
        if ((ge.game.money | 0) < cost) return false;
        ge.game.money -= cost;
        ge.player.addPowerup(type, { ...cfg, duration: Infinity }, true);
        if (ge.events) ge.events.emit('audio:coin');
        this.renderPowerupsOverlay();
        return true;
    }

    // Back-compat shim — older event subscriptions still call this.
    updatePowerupsList() { this.renderPowerupsOverlay(); }
    
    setGameEngine(gameEngine) {
        this.gameEngine = gameEngine;
        // 5.79.58/59 → 5.100.1 — Pre-render every dynamic pause-menu
        //   tab ONCE at boot, before the pause overlay can ever be
        //   opened. The pause-menu first open finds every tab already
        //   populated; no flash of empty-then-rebuilt content. The
        //   per-pause refresh calls in togglePauseMenu still fire so
        //   live state (equipped weapon, money/SP balance, owned
        //   powerups, elapsed timer) stays accurate, but the FIRST
        //   paint of any tab is never empty.
        //
        //   5.100.1 — added Abilities + Timer pre-renders and the
        //   assists-tab sync so the user-reported flash on first-open
        //   is gone across ALL dynamic pause tabs.
        this.syncAssistsTab();
        this.updateControlsTab();
        this.updatePrimaryTab();
        this.updatePowerTab();
        // 6.1.0 — Powerups pre-render removed (POWERUPS tab moved to
        // the shop; pause-menu powerups-tab DOM was deleted).
        if (this.updateTimerTab) this.updateTimerTab();
    }

    // Reflect engine-side assists state in the tab checkboxes.
    syncAssistsTab() {
        const a = this.gameEngine && this.gameEngine.assists;
        if (!a) return;
        if (this.elements.assistAimAssist) this.elements.assistAimAssist.checked = !!a.aimAssist;
        if (this.elements.assistAutoAim) this.elements.assistAutoAim.checked = !!a.autoAim;
        if (this.elements.assistAutoFire) this.elements.assistAutoFire.checked = !!a.autoFire;
        if (this.elements.assistAutoCastAbilities) this.elements.assistAutoCastAbilities.checked = !!a.autoCastAbilities;
        // 6.1.1 — autoPower retired; autoFire drives both barrels.
        // 6.2.3 — Laser Sight toggle. Default ON; falsy → laser hidden.
        if (this.elements.assistLaserSight) this.elements.assistLaserSight.checked = a.laserSight !== false;
    }

    setAudioManager(audioManager) {
        this.audioManager = audioManager;
        this.setupSfxControls();
        this.setupMusicVolumeControl();
        // Wire the delegated UI click sound now that audio is available.
        this.setupEventListeners();
    }
    
    setupSfxControls() {
        if (!this.audioManager || !this.elements.sfxVolumeSlider) return;

        // 5.79.0 — restore last-saved SFX volume from localStorage
        // before reading the manager's current value, so the slider
        // reflects the user's persisted preference on every load.
        const settings = loadSettings();
        if (typeof settings.sfxVolume === 'number') {
            this.audioManager.setSfxVolume(settings.sfxVolume);
        }
        // Slider 0..100 maps directly to gain 0..1 (5.68.8 — was clipped
        // to 0..20% via the old `maxSfxVolume = 0.2` cap, removed).
        const initialVolume = this.audioManager.getSfxVolume() * 100;
        this.elements.sfxVolumeSlider.value = initialVolume;
        this.updateSfxVolumeDisplay(initialVolume);

        this.elements.sfxVolumeSlider.addEventListener('input', (e) => {
            const sliderValue = e.target.value;
            const normalizedVolume = sliderValue / 100;
            this.audioManager.setSfxVolume(normalizedVolume);
            this.updateSfxVolumeDisplay(sliderValue);
            saveSettings({ sfxVolume: normalizedVolume });
        });
    }

    updateSfxVolumeDisplay(sliderValue) {
        // Slider value IS the volume percentage now (1:1 mapping to gain).
        this.elements.sfxVolumeValue.textContent = `${Math.round(sliderValue)}%`;
    }
    
    setupMusicVolumeControl() {
        if (!this.elements.musicVolumeSlider) return;

        // 5.79.0 — restore last-saved music volume from localStorage.
        const settings = loadSettings();
        if (typeof settings.musicVolume === 'number') {
            this.musicPlayer.setVolume(settings.musicVolume);
        }

        // Set initial value
        const initialVolume = this.musicPlayer.getVolume() * 100;
        this.elements.musicVolumeSlider.value = initialVolume;
        this.elements.musicVolumeValue.textContent = `${Math.round(initialVolume)}%`;

        // Handle slider changes
        this.elements.musicVolumeSlider.addEventListener('input', (e) => {
            const volume = e.target.value / 100;
            this.musicPlayer.setVolume(volume);
            this.elements.musicVolumeValue.textContent = `${e.target.value}%`;
            saveSettings({ musicVolume: volume });
        });

        // Create sound effect toggles
        this.createSfxToggles();
    }
    
    createSfxToggles() {
        if (!this.audioManager || !this.elements.sfxTogglesContainer) return;
        
        const soundNames = this.audioManager.getSoundNames();
        const friendlyNames = {
            shoot: 'Shooting',
            hit: 'Hit/Damage',
            coin: 'Pickup',
            explosion: 'Asteroid Explosion',
            playerExplosion: 'Player Explosion',
            thruster: 'Thruster',
            tractorBeam: 'Tractor Beam'
        };
        
        soundNames.forEach(soundName => {
            const toggleDiv = document.createElement('div');
            toggleDiv.className = 'sfx-toggle';

            const label = document.createElement('span');
            label.className = 'sfx-toggle-label';
            label.textContent = friendlyNames[soundName] || soundName;

            const controlsDiv = document.createElement('div');
            controlsDiv.className = 'sfx-controls';

            // 6.1.5 — Variant picker. Sounds with generator-produced
            // variants get a `◀ vN/M ▶` cycler so the player can pin a
            // specific variant for the rest of the session (overrides
            // the random pick the session started with). Test button
            // plays whatever variant is currently active so cycling
            // gives immediate audible feedback.
            const variants = this.audioManager.getVariants(soundName);
            let variantLabel = null;
            if (variants && variants.length > 1) {
                const prevBtn = document.createElement('button');
                prevBtn.className = 'sfx-variant-btn';
                prevBtn.textContent = '◀';
                prevBtn.title = 'Previous variant';

                variantLabel = document.createElement('span');
                variantLabel.className = 'sfx-variant-label';
                variantLabel.title = 'Current variant for this session';
                const renderLabel = () => {
                    variantLabel.textContent = `v${this.audioManager.getCurrentVariantIndex(soundName)}/${variants.length}`;
                };
                renderLabel();

                const nextBtn = document.createElement('button');
                nextBtn.className = 'sfx-variant-btn';
                nextBtn.textContent = '▶';
                nextBtn.title = 'Next variant';

                // Both buttons cycle then auto-preview the new variant
                // so the player hears the change immediately. The
                // toggle's enabled state still gates audio.
                const cycle = (delta) => {
                    this.audioManager.cycleVariant(soundName, delta);
                    renderLabel();
                    if (this.audioManager.isSoundEnabled(soundName)) {
                        this.audioManager.playSound(soundName);
                    }
                };
                prevBtn.addEventListener('click', () => cycle(-1));
                nextBtn.addEventListener('click', () => cycle(1));

                controlsDiv.appendChild(prevBtn);
                controlsDiv.appendChild(variantLabel);
                controlsDiv.appendChild(nextBtn);
            }

            // Test button — plays the CURRENT variant choice so cycle
            // + test work as expected together.
            const testButton = document.createElement('button');
            testButton.className = 'sfx-test-button';
            testButton.textContent = '♪';
            testButton.title = 'Test current variant';
            testButton.addEventListener('click', () => {
                if (this.audioManager.isSoundEnabled(soundName)) {
                    this.audioManager.playSound(soundName);
                }
            });

            // Toggle switch — on/off.
            const switchDiv = document.createElement('div');
            switchDiv.className = 'sfx-toggle-switch active';
            switchDiv.dataset.sound = soundName;
            switchDiv.addEventListener('click', () => {
                const isEnabled = !this.audioManager.isSoundEnabled(soundName);
                this.audioManager.setSoundEnabled(soundName, isEnabled);
                switchDiv.classList.toggle('active', isEnabled);
            });

            controlsDiv.appendChild(testButton);
            controlsDiv.appendChild(switchDiv);

            toggleDiv.appendChild(label);
            toggleDiv.appendChild(controlsDiv);
            this.elements.sfxTogglesContainer.appendChild(toggleDiv);
        });
    }
    
    setupMusicPlayer() {
        // Set up music player callbacks
        this.musicPlayer.onTrackChange = (track) => {
            this.updateTrackDisplay(track);
            this.updatePlaylistDisplay();
        };

        // Fires when the playlist array itself is reordered (e.g. shuffle).
        // We rebuild the rendered DOM list so the highlighted row and the
        // playing audio are always pointing at the same track.
        this.musicPlayer.onPlaylistChange = () => {
            this.populatePlaylist();
        };
        
        this.musicPlayer.onPlayStateChange = (isPlaying) => {
            if (this.elements.musicPlayPause) {
                this.elements.musicPlayPause.textContent = isPlaying ? '⏸' : '▶';
            }
        };
        
        this.musicPlayer.onProgressUpdate = (progress, currentTime, duration) => {
            this.updateProgress(progress, currentTime, duration);
        };

        // Buffered (downloaded) fraction — drives the ghost fill behind
        // the playback bar so the user can see how much is loaded.
        this.musicPlayer.onBufferedUpdate = (fraction) => {
            if (this.elements.musicPlayerBuffered) {
                this.elements.musicPlayerBuffered.style.width = `${Math.max(0, Math.min(1, fraction)) * 100}%`;
            }
        };
        
        // Set up event listeners (skip music info since it's removed)
        if (this.elements.musicInfo) {
            this.elements.musicInfo.addEventListener('click', () => {
                this.showMusicTab();
            });
        }
        
        if (this.elements.shopButton) {
            this.elements.shopButton.addEventListener('click', () => {
                if (this.gameEngine) {
                    // Pause game and open shop
                    this.gameEngine.togglePause();
                    this.gameEngine.openShop();
                }
            });
        }
        
        // Pause overlay backdrop dismiss (tap outside menu unpauses).
        // 5.74.4 — switched the in-menu test from `e.target.closest(...)`
        // to a direct-click identity check (`e.target === e.currentTarget`).
        // If a child handler (e.g. POWERUPS +1 buy button) replaces its
        // own subtree via `replaceChildren()` before this listener fires,
        // the original target is detached, `closest('#pause-menu')`
        // returns null, and the backdrop misclassifies the click as
        // outside-menu — closing the pause menu and starting the next
        // wave when the player only meant to spend a Pick.
        if (this.elements.pauseOverlay) {
            const dismissOnBackdrop = (e) => {
                if (e.target === e.currentTarget) {
                    if (this.gameEngine) this.gameEngine.togglePause();
                }
            };
            this.elements.pauseOverlay.addEventListener('click', dismissOnBackdrop);
        }

        // Pause menu action buttons. The legacy gold UPGRADES/SHOP button is
        // retired (see static-dom.js / hud-buttons.js), so this element is
        // normally absent — the guard simply skips wiring. The listener is
        // kept for reuse: if the button is ever re-added, it wires up again.
        if (this.elements.pauseShopButton) {
            this.elements.pauseShopButton.addEventListener('click', () => {
                if (this.gameEngine) {
                    this.elements.pauseOverlay.style.display = 'none';
                    this.gameEngine.openShop();
                }
            });
        }

        // Powerups sub-tab buttons (Offense / Drops) inside the
        // Powerups pause-tab. Re-rendering hits the live cards.
        if (this.elements.powerupsSubtabs) {
            this.elements.powerupsSubtabs.forEach(btn => {
                btn.addEventListener('click', () => {
                    this.setPowerupsSubTab(btn.dataset.subtab);
                });
            });
        }

        if (this.elements.pauseResumeButton) {
            this.elements.pauseResumeButton.addEventListener('click', () => {
                if (this.gameEngine) {
                    this.gameEngine.togglePause();
                }
            });
        }

        if (this.elements.hudPauseBtn) {
            this.elements.hudPauseBtn.addEventListener('click', () => {
                if (this.gameEngine) {
                    this.gameEngine.togglePause();
                }
            });
        }

        // HUD shop button — top-right, sits next to the pause button.
        // Lets the player jump into the shop at any time during play
        // (also auto-opens between waves; see wave-manager.js).
        if (this.elements.hudShopBtn) {
            this.elements.hudShopBtn.addEventListener('click', () => {
                if (this.gameEngine) this.gameEngine.openShop();
            });
        }

        // Tab switching
        this.elements.pauseTabs.forEach(tab => {
            tab.addEventListener('click', () => {
                const tabName = tab.dataset.tab;
                this.switchTab(tabName);
            });
        });

        // Assists toggles (5.74) — read initial state from the engine and
        // persist changes back through setAssist (which writes localStorage).
        const wireAssist = (el, key) => {
            if (!el) return;
            el.addEventListener('change', () => {
                if (this.gameEngine) this.gameEngine.setAssist(key, el.checked);
            });
        };
        wireAssist(this.elements.assistAimAssist, 'aimAssist');
        wireAssist(this.elements.assistAutoAim, 'autoAim');
        wireAssist(this.elements.assistAutoFire, 'autoFire');
        wireAssist(this.elements.assistAutoCastAbilities, 'autoCastAbilities');
        // 6.1.1 — autoPower wiring removed; merged into autoFire.
        // 6.2.3 — Laser Sight toggle.
        wireAssist(this.elements.assistLaserSight, 'laserSight');

        // Control-scheme picker (GAMEPAD tab). Each button carries its
        // scheme in data-scheme; clicking persists it through the engine,
        // which re-highlights the buttons via updateControlSchemeSelector.
        const wireScheme = (el) => {
            if (!el) return;
            el.addEventListener('click', () => {
                if (this.gameEngine) this.gameEngine.setControlScheme(el.dataset.scheme);
            });
        };
        wireScheme(document.getElementById('control-scheme-gamepad'));
        wireScheme(document.getElementById('control-scheme-alt'));
        const wireLayout = (el) => {
            if (!el) return;
            el.addEventListener('click', () => {
                if (!this.gameEngine?.gamepad) return;
                this.gameEngine.gamepad.setLayout(el.dataset.layout);
                document.getElementById('gamepad-layout-pro')?.classList.toggle('active', el.dataset.layout === 'pro');
                document.getElementById('gamepad-layout-classic')?.classList.toggle('active', el.dataset.layout === 'classic');
            });
        };
        wireLayout(document.getElementById('gamepad-layout-pro'));
        wireLayout(document.getElementById('gamepad-layout-classic'));

        // Music controls
        this.elements.musicPlayPause.addEventListener('click', () => {
            this.musicPlayer.togglePlayPause();
        });
        
        this.elements.musicPrev.addEventListener('click', () => {
            this.musicPlayer.previous();
        });
        
        this.elements.musicNext.addEventListener('click', () => {
            this.musicPlayer.next();
        });
        
        // Shuffle button: re-orders the playlist and starts the new track 0.
        // Snap the scroll position back to the top so the user sees the
        // freshly-shuffled order from the start, with the now-playing
        // track 0 sitting at the top. Brief 'active' flash gives visual
        // confirmation that something happened.
        this.elements.musicShuffle.addEventListener('click', () => {
            this.musicPlayer.shuffleAndPlay();
            if (this.elements.playlistTracks) {
                this.elements.playlistTracks.scrollTop = 0;
            }
            this.elements.musicShuffle.classList.add('active');
            setTimeout(() => this.elements.musicShuffle.classList.remove('active'), 250);
        });

        // Random button: jump straight to a random track without
        // touching playlist order. Scroll the playlist so the user can
        // see which track was picked. Same brief flash for feedback.
        if (this.elements.musicRandom) {
            this.elements.musicRandom.addEventListener('click', () => {
                this.musicPlayer.playRandomTrack();
                this.scrollToCurrentTrack();
                this.elements.musicRandom.classList.add('active');
                setTimeout(() => this.elements.musicRandom.classList.remove('active'), 250);
            });
        }
        
        this.elements.musicRepeat.addEventListener('click', () => {
            // Toggle repeat-one mode only
            const isRepeatOne = this.elements.musicRepeat.classList.toggle('active');
            this.elements.musicRepeat.classList.toggle('repeat-one', isRepeatOne);
            // Set repeat-one mode in the music player
            if (isRepeatOne) {
                this.musicPlayer.setRepeatOne(true);
            } else {
                this.musicPlayer.setRepeatOne(false);
            }
        });
        
        // Progress bar click
        this.elements.musicPlayerProgressBar.addEventListener('click', (e) => {
            const rect = this.elements.musicPlayerProgressBar.getBoundingClientRect();
            const percentage = (e.clientX - rect.left) / rect.width;
            this.musicPlayer.seek(percentage);
        });
        
        // Display initial track if loaded
        const currentTrack = this.musicPlayer.getCurrentTrack();
        if (currentTrack) {
            this.updateTrackDisplay(currentTrack);
        }
        
        // Populate playlist
        this.populatePlaylist();
    }
    
    populatePlaylist() {
        if (!this.elements.playlistTracks) return;
        
        // Clear existing tracks
        this.elements.playlistTracks.innerHTML = '';
        
        // Add all tracks from the music player
        this.musicPlayer.playlist.forEach((track, index) => {
            const trackElement = document.createElement('div');
            trackElement.className = 'playlist-track';
            
            // Create inner span for content
            const contentSpan = document.createElement('span');
            contentSpan.className = 'playlist-track-content';
            contentSpan.innerHTML = `${track.name} · <span style="color: #00ccff;">${track.artist}</span>`;
            
            trackElement.appendChild(contentSpan);
            trackElement.dataset.index = index;

            // Mark current track as playing
            if (index === this.musicPlayer.currentTrackIndex) {
                trackElement.classList.add('playing');
            }

            // Add click handler
            trackElement.addEventListener('click', () => {
                this.musicPlayer.loadTrack(index);
                this.musicPlayer.play();
                this.updatePlaylistDisplay();
            });

            this.elements.playlistTracks.appendChild(trackElement);
        });
    }

    updateTrackDisplay(track) {
        // Format track display
        const trackDisplay = `<span style="color: #00ff00;">${track.name}</span>&nbsp;<span style="color: #666;">·</span>&nbsp;<span style="color: #00ccff;">${track.artist || 'unknown'}</span>`;

        // Update music info box (skip since removed from main UI)
        if (this.elements.trackNameText) {
            this.elements.trackNameText.innerHTML = trackDisplay;
        }

        // Update pause menu current track
        if (this.elements.currentTrackName) {
            this.elements.currentTrackName.innerHTML = trackDisplay;
        }
    }

    updateProgress(progress, currentTime, duration) {
        // Update main music info (skip since removed from main UI)
        if (this.elements.musicProgress) {
            this.elements.musicProgress.style.width = `${progress * 100}%`;
        }
        
        // Update pause menu music player
        if (this.elements.musicPlayerProgress) {
            this.elements.musicPlayerProgress.style.width = `${progress * 100}%`;
        }
        
        // Update time displays (skip main UI, only update pause menu)
        if (this.elements.musicInfoCurrentTime) {
            this.elements.musicInfoCurrentTime.textContent = this.formatTime(currentTime);
        }
        if (this.elements.musicInfoDuration) {
            this.elements.musicInfoDuration.textContent = this.formatTime(duration);
        }
        if (this.elements.musicCurrentTime) {
            this.elements.musicCurrentTime.textContent = this.formatTime(currentTime);
        }
        if (this.elements.musicDuration) {
            this.elements.musicDuration.textContent = this.formatTime(duration);
        }
    }
    
    formatTime(seconds) {
        if (isNaN(seconds)) return '0:00';
        const mins = Math.floor(seconds / 60);
        const secs = Math.floor(seconds % 60);
        return `${mins}:${secs.toString().padStart(2, '0')}`;
    }
    
    showMusicTab() {
        // Pause the game
        if (this.gameEngine) {
            this.gameEngine.togglePause();
        }
        
        // Switch to music tab
        this.switchTab('music');
    }
    
    // Show / hide the ASSISTS pause-menu tab button. Desktop keeps it
    // always visible; mobile reveals it only while a gamepad is connected
    // (driven by game-engine._refreshAssistsTabVisibility). If the tab is
    // hidden while it's the active tab, fall back to CONTROLS so the menu
    // doesn't show an empty body.
    setAssistsTabVisible(visible) {
        const btn = document.querySelector('.pause-tab[data-tab="assists"]');
        if (!btn) return;
        btn.style.display = visible ? '' : 'none';
        if (!visible && btn.classList.contains('active')) {
            this.switchTab('controls');
        }
    }

    // Show / hide the GAMEPAD pause-menu tab button. Revealed whenever a
    // gamepad is connected (any platform), hidden on disconnect — driven by
    // game-engine._refreshGamepadTabVisibility(). Falls back to CONTROLS if
    // it's hidden while active so the menu never shows an empty body.
    setGamepadTabVisible(visible) {
        const btn = document.querySelector('.pause-tab[data-tab="gamepad"]');
        if (!btn) return;
        btn.style.display = visible ? '' : 'none';
        if (!visible && btn.classList.contains('active')) {
            this.switchTab('controls');
        }
    }

    // Show / hide the GAMEPAD section in the HOW TO PLAY tutorial overlay.
    setGamepadTutorialVisible(visible) {
        const sec = document.getElementById('tutorial-gamepad-section');
        if (sec) sec.style.display = visible ? '' : 'none';
    }

    // Highlight the active control-scheme button in the GAMEPAD tab picker.
    // `active` is the resolved scheme; `alt` is the device's non-gamepad
    // option ('keyboard' | 'touch') so the alt button matches whatever the
    // engine would switch to.
    updateControlSchemeSelector(active, alt) {
        const gpBtn = document.getElementById('control-scheme-gamepad');
        const altBtn = document.getElementById('control-scheme-alt');
        if (gpBtn) gpBtn.classList.toggle('active', active === 'gamepad');
        if (altBtn) {
            if (alt) altBtn.dataset.scheme = alt;
            altBtn.classList.toggle('active', active !== 'gamepad');
        }
        const layout = this.gameEngine?.gamepad?.getLayout?.() || 'pro';
        document.getElementById('gamepad-layout-pro')?.classList.toggle('active', layout === 'pro');
        document.getElementById('gamepad-layout-classic')?.classList.toggle('active', layout === 'classic');
    }

    switchTab(tabName) {
        this.elements.pauseTabs.forEach(tab => {
            tab.classList.toggle('active', tab.dataset.tab === tabName);
        });
        
        this.elements.tabContents.forEach(content => {
            content.classList.toggle('active', content.id === `${tabName}-tab`);
        });
        
        if (tabName === 'music') {
            this.syncMusicPlayerState();
        }

        // Refresh equip lists when their tabs are opened.
        if (tabName === 'primary') this.updatePrimaryTab();
        if (tabName === 'power') this.updatePowerTab();
        if (tabName === 'passives') this.updatePassivesTab();
        if (tabName === 'stats') this.updateStatsTab();
        if (tabName === 'assists') this.syncAssistsTab();
        if (tabName === 'gamepad' && this.gameEngine) {
            this.updateControlSchemeSelector(this.gameEngine.controlScheme, this.gameEngine.altControlScheme);
        }

        // 6.1.0 — Powerups tab moved to the shop overlay; no
        // pause-menu powerups-tab to re-render.

        // 5.72.1 — TIMER tab moved from shop to pause menu. Render
        // the speedrun-tier card on tab open. Don't poll-refresh here;
        // the live elapsed-time row updates via updateTimerTab() called
        // from the engine's HUD update loop while the tab is visible.
        if (tabName === 'timer') this.updateTimerTab();
    }

    updateTimerTab() {
        const mount = document.getElementById('timer-panel-mount');
        if (!mount) return;
        const ge = this.gameEngine;
        const live = (ge && ge.game) ? (ge.game.survivalTime || 0) : 0;
        const liveTier = speedrunTierFor(live);

        const wrap = document.createElement('div');
        wrap.className = 'shop-help shop-timer';

        const intro = document.createElement('p');
        intro.className = 'shop-help-intro';
        intro.textContent = 'Speedrun bonus — finish the 20-wave campaign faster for a bigger score multiplier on the Game Complete screen. Live elapsed time below; tier table is your target.';
        wrap.appendChild(intro);

        const liveBox = document.createElement('div');
        liveBox.className = 'shop-timer-live';
        const lbl = document.createElement('span');
        lbl.className = 'shop-timer-live-label';
        lbl.textContent = 'CURRENT RUN';
        const time = document.createElement('span');
        time.className = 'shop-timer-live-time';
        time.textContent = formatRunTime(live);
        time.style.color = liveTier.color;
        const proj = document.createElement('span');
        proj.className = 'shop-timer-live-projected';
        proj.textContent = `If you finish now: ${liveTier.label} (${liveTier.multiplier.toFixed(1)}×)`;
        proj.style.color = liveTier.color;
        liveBox.appendChild(lbl);
        liveBox.appendChild(time);
        liveBox.appendChild(proj);
        wrap.appendChild(liveBox);

        const table = document.createElement('div');
        table.className = 'shop-timer-table';
        const header = document.createElement('div');
        header.className = 'shop-timer-row shop-timer-row--header';
        for (const [text, cls] of [['TIER','tier'],['FINISH UNDER','time'],['MULTIPLIER','mult']]) {
            const c = document.createElement('span');
            c.className = `shop-timer-cell shop-timer-cell--${cls}`;
            c.textContent = text;
            header.appendChild(c);
        }
        table.appendChild(header);

        for (const tier of SPEEDRUN_TIERS) {
            const row = document.createElement('div');
            row.className = 'shop-timer-row';
            if (tier === liveTier) row.classList.add('shop-timer-row--current');
            const tierCell = document.createElement('span');
            tierCell.className = 'shop-timer-cell shop-timer-cell--tier';
            tierCell.textContent = tier.label;
            tierCell.style.color = tier.color;
            row.appendChild(tierCell);
            const timeCell = document.createElement('span');
            timeCell.className = 'shop-timer-cell shop-timer-cell--time';
            timeCell.textContent = tier.maxMs === Infinity ? '20:00+' : formatRunTime(tier.maxMs);
            row.appendChild(timeCell);
            const multCell = document.createElement('span');
            multCell.className = 'shop-timer-cell shop-timer-cell--mult';
            multCell.textContent = `${tier.multiplier.toFixed(1)}×`;
            multCell.style.color = tier.color;
            row.appendChild(multCell);
            table.appendChild(row);
        }
        wrap.appendChild(table);

        mount.replaceChildren(wrap);
    }
    
    startMusic() {
        this.musicPlayer.play();
    }
    
    syncMusicPlayerState() {
        // Update play/pause button to match current music player state
        const isPlaying = this.musicPlayer.isPlaying;
        this.elements.musicPlayPause.textContent = isPlaying ? '⏸' : '▶';
        
        // Ensure playlist display is correct for first track
        this.updatePlaylistDisplay();
    }
    
    updatePlaylistDisplay() {
        // Update playing status in playlist
        const tracks = this.elements.playlistTracks.querySelectorAll('.playlist-track');
        tracks.forEach((track, index) => {
            if (index === this.musicPlayer.currentTrackIndex) {
                track.classList.add('playing');
            } else {
                track.classList.remove('playing');
            }
        });
    }

    // Scroll the playlist container so the currently playing track is
    // visible (and roughly centered). Used when the user jumps via the
    // random button — without this, the player would silently start a
    // track buried far down in the list.
    scrollToCurrentTrack() {
        if (!this.elements.playlistTracks) return;
        const active = this.elements.playlistTracks.querySelector('.playlist-track.playing');
        if (active && typeof active.scrollIntoView === 'function') {
            active.scrollIntoView({ block: 'center', behavior: 'smooth' });
        }
    }

}
