// Diablo-style stats screen (5.79.0).
//
// Opened by pressing the ` (backtick) key while in a run. The screen
// pauses gameplay (piggy-backs on togglePause) and shows the player's
// level, XP progress, and every derived combat stat with hover tooltips
// that explain the formula behind each number — what it scales with
// and what raises it.

import { POWERUP_TYPES } from '../world/powerup.js';
import { iconSpriteCache } from '../core/utils.js';
import { SLOT_ORDER, SLOT_LABEL } from '../world/item-names.js';
import { getStageLabel as stageLabelFor } from '../core/constants.js';

// Helper: percent-format with 1 decimal of headroom for tiny gains.
function pct(v) { return `${(v * 100).toFixed(1)}%`; }
function mult(v) { return `${v.toFixed(2)}×`; }

// Build the stat row list. Each entry is { key, value, tip }.
//   - key: short label
//   - value: rendered value
//   - tip:  multi-line tooltip explaining the formula + scaling
function buildStatsModel(player, gameEngine) {
    const lvl = player.level | 0;
    const xp = player.experience | 0;
    const xpNext = player.experienceToNextLevel | 0;
    const maxHp = player.getEffectiveMaxHealth?.() ?? player.maxHealth;
    const dmgRed = player.getEffectiveShield?.() ?? player.shield;
    const critC = player.getEffectiveCritChance?.() ?? 0;
    const critDStacks = player.getPowerupStacks?.('CRIT_DAMAGE') | 0;
    const critDMax = Math.min(550, 300 + critDStacks * 15);
    const goldFind = player.getGoldFindMultiplier?.() ?? 1;
    const streakMul = player.getHitStreakMultiplier?.() ?? 1;
    const stacks = (id) => player.getPowerupStacks ? player.getPowerupStacks(id) : 0;

    // Primary fire rate (ms between shots) — lower is faster.
    const baseFireMs = player.baseFireRate ?? 400;
    const rapidStacks = stacks('RAPID_FIRE');
    const effFireMs = baseFireMs * Math.pow(1 - 0.22, rapidStacks);
    const effFireRateHz = 1000 / effFireMs;

    const sections = [];

    // ── Vitals ─────────────────────────────────────────────────────────
    // 5.102.0 — Trimmed to two actionable rows. Shield Tanks (triforce)
    // and Lives (retired in 5.88.0) are reflected in the HUD and don't
    // need duplication here.
    sections.push({
        title: 'VITALS',
        rows: [
            {
                key: 'Max HP',
                value: `${maxHp}`,
                tip: `+35 per HEALTH_BOOST stack (×${stacks('HEALTH_BOOST')}). Cap 600.`,
            },
            {
                key: 'Damage Reduction',
                value: `${dmgRed.toFixed(0)}%`,
                tip: `Base 15% + 8% per SHIELD_BOOST stack (×${stacks('SHIELD_BOOST')}). Cap 75%.`,
            },
        ],
    });

    // ── Offense ────────────────────────────────────────────────────────
    // 5.102.0 — Primary / Power rows dropped — the HUD loadout squares
    // already show what's equipped. Range / Knockback dropped — Range
    // is always 1.0 since 5.100.3 (LONG_RANGE retired) and Knockback
    // isn't a number the player references mid-run.
    sections.push({
        title: 'OFFENSE',
        rows: [
            {
                key: 'Fire Rate',
                value: `${effFireRateHz.toFixed(2)} /s`,
                tip: `Base ${(1000/baseFireMs).toFixed(2)}/s. RAPID_FIRE ×${rapidStacks} → ×0.78 each.`,
            },
            {
                key: 'Crit Chance',
                value: `${critC.toFixed(0)}%`,
                tip: `Base 8% + 7% per CRIT_CHANCE stack (×${stacks('CRIT_CHANCE')}). Cap 60%.`,
            },
            {
                key: 'Crit Damage',
                value: `200–${critDMax.toFixed(0)}%`,
                tip: `Random per crit. +15% ceiling per CRIT_DAMAGE stack (×${critDStacks}). Cap 550%.`,
            },
            {
                key: 'Streak Buff',
                value: `${mult(streakMul)}`,
                tip: `Active kill-streak damage. Resets on damage.`,
            },
        ],
    });

    // ── Economy ────────────────────────────────────────────────────────
    // 5.102.0 — Per-level orb/drop scaling rows dropped — they're
    // invisible to the player in-game and never inform a decision.
    sections.push({
        title: 'ECONOMY',
        rows: [
            {
                key: 'Gold Find',
                value: `${mult(goldFind)}`,
                tip: `+10% per wave (wave ${gameEngine?.game?.currentWave ?? 1}).`,
            },
        ],
    });

    // ── Powerups (just an inventory peek) ────────────────────────────
    const ownedPowerups = [];
    if (player.powerups && typeof player.powerups.forEach === 'function') {
        player.powerups.forEach((pw, type) => {
            const cfg = POWERUP_TYPES[type];
            if (!cfg) return;
            ownedPowerups.push({ type, name: cfg.name || type, stacks: pw.stacks | 0, cap: cfg.maxStacks || 99 });
        });
    }
    ownedPowerups.sort((a, b) => b.stacks - a.stacks);

    // 5.102.0 — Powerups list: one short tip line per row. Hide the
    // section entirely when none are held instead of printing "— none —".
    if (ownedPowerups.length > 0) {
        sections.push({
            title: 'POWERUPS',
            rows: ownedPowerups.map((p) => ({
                key: p.name,
                value: `×${p.stacks} / ${p.cap}`,
                tip: `Permanent for the run.`,
            })),
        });
    }

    // ── Diablo-style defensive INVENTORY (5.99.4) ────────────────────
    // 5.102.0 — One line per slot. Value collapsed to `Lx +N TYPE` so
    // the inventory fits on a phone width. Empty slots render `—`. No
    // tooltip noise; the rule (auto-equip if better) is implicit.
    const inventoryRows = [];
    const equipped = (player && player.equippedItems) || null;
    for (const slot of SLOT_ORDER) {
        const it = equipped ? equipped[slot] : null;
        const slotName = SLOT_LABEL[slot] || slot.toUpperCase();
        if (it) {
            inventoryRows.push({
                key: slotName,
                value: `L${it.level} ${it.bonusLabel}`,
                tip: it.name,
            });
        } else {
            inventoryRows.push({
                key: slotName,
                value: '—',
                tip: '',
            });
        }
    }
    sections.push({
        title: 'INVENTORY',
        rows: inventoryRows,
    });

    // 5.102.0 — WORLD SCALING section removed. The numbers were
    // dev-flavored and never informed player decisions; difficulty
    // reads through gameplay (HP bars, damage taken) without it.

    return {
        level: lvl,
        xp,
        xpNext,
        sections,
    };
}

export class StatsOverlay {
    constructor(uiManager) {
        this.uiManager = uiManager;
        this.gameEngine = null;
        this.elements = {
            overlay: document.getElementById('stats-overlay'),
            title:   document.getElementById('stats-panel-title'),
            close:   document.getElementById('stats-panel-close'),
            summary: document.getElementById('stats-summary'),
            columns: document.getElementById('stats-columns'),
            tooltip: document.getElementById('stats-tooltip'),
        };
        this._isOpen = false;
        // Tooltip pinning so a hovered row keeps its tooltip pinned to the
        // overlay coords (we follow mousemove for fine positioning).
        this._activeRow = null;
        this._lastX = 0;
        this._lastY = 0;

        if (this.elements.close) {
            this.elements.close.addEventListener('click', () => this.close());
        }
        if (this.elements.overlay) {
            // Click outside the panel closes the overlay.
            this.elements.overlay.addEventListener('click', (e) => {
                if (e.target === this.elements.overlay) this.close();
            });
        }
    }

    isOpen() { return this._isOpen; }

    setGameEngine(ge) { this.gameEngine = ge; }

    open() {
        if (!this.elements.overlay) return false;
        const ge = this.gameEngine;
        if (!ge?.player) return false;
        // Capture the SOURCE before togglePause() mutates pause-overlay
        // visibility. If the pause overlay is already visible (user
        // opened stats via a pause-menu button), we need to restore
        // the pause menu on close. Reading the overlay AFTER
        // togglePause() always reports 'flex' because togglePause
        // itself shows the overlay when transitioning to PAUSED — that
        // erases the source signal (the pre-6.12.5 bug).
        const pauseDom = document.getElementById('pause-overlay');
        this._cameFromPauseMenu = !!(pauseDom && pauseDom.style.display === 'flex');
        // Stats screen pauses the game like the regular pause, but skips
        // opening the pause menu DOM. We track our own _isOpen so close()
        // can restore properly.
        this._wasPaused = !!(ge.game && ge.game.state === 'paused');
        if (!this._wasPaused) ge.togglePause();
        this._isOpen = true;
        this.elements.overlay.style.display = 'flex';
        // Hide the pause overlay under us (togglePause may have just
        // flipped it on; or it was already up if cameFromPauseMenu).
        if (pauseDom) pauseDom.style.display = 'none';
        this.render();
        return true;
    }

    close() {
        if (!this._isOpen) return;
        this._isOpen = false;
        if (this.elements.overlay) this.elements.overlay.style.display = 'none';
        if (this.elements.tooltip) this.elements.tooltip.style.display = 'none';
        // Restore based on the captured source, NOT on current overlay
        // visibility (which we've been mutating).
        const ge = this.gameEngine;
        const pauseDom = document.getElementById('pause-overlay');
        if (this._cameFromPauseMenu && pauseDom) {
            // User entered via a pause-menu button — restore the pause
            // menu so they land back where they came from.
            pauseDom.style.display = 'flex';
        } else if (!this._wasPaused && ge) {
            // User entered via backtick / HUD button while playing —
            // resume the game directly, bypassing the pause menu.
            ge.togglePause();
        }
        // If !cameFromPauseMenu && _wasPaused, game was paused via some
        // other path (e.g. shop transition); leave it paused with no
        // overlay surface — caller's responsibility to manage that.
        this._cameFromPauseMenu = false;
        this._wasPaused = false;
    }

    toggle() { return this._isOpen ? (this.close(), false) : (this.open(), true); }

    render() {
        const ge = this.gameEngine;
        if (!ge?.player) return;
        const model = buildStatsModel(ge.player, ge);

        // Header summary cells (Level, XP progress, Gold, Time).
        const summary = this.elements.summary;
        if (summary) {
            summary.replaceChildren();
            // 6.1.0 — STAGE label (S-W format like the HUD shield)
            // replaces the bare wave number. Gold stays as-is.
            const wave = ge.game?.currentWave ?? 1;
            const cells = [
                { label: 'STAGE', value: stageLabelFor(wave) },
                {
                    label: 'GOLD', value: `${ge.game?.money ?? 0}`, icon: 'coin',
                },
            ];
            for (const c of cells) {
                const cell = document.createElement('div');
                cell.className = 'stats-summary-cell';
                const lbl = document.createElement('div');
                lbl.className = 'stats-summary-label';
                lbl.textContent = c.label;
                const val = document.createElement('div');
                val.className = 'stats-summary-value';
                if (c.icon === 'coin') {
                    val.style.display = 'inline-flex';
                    val.style.alignItems = 'center';
                    val.style.gap = '6px';
                    const sprite = iconSpriteCache.getSprite('coin', 18, '#FFD700', '#B8860B');
                    if (sprite) {
                        // The cached canvas is rendered at 2× supersample
                        // (5.79.3); stamp the display size on the element
                        // so it lands at the requested 18px.
                        const d = sprite._displaySize || 18;
                        sprite.style.width = `${d}px`;
                        sprite.style.height = `${d}px`;
                        val.appendChild(sprite);
                    }
                    const amt = document.createElement('span');
                    amt.textContent = c.value;
                    val.appendChild(amt);
                } else {
                    val.textContent = c.value;
                }
                cell.appendChild(lbl);
                cell.appendChild(val);
                summary.appendChild(cell);
            }
        }

        // Sections / rows
        const cols = this.elements.columns;
        if (cols) {
            cols.replaceChildren();
            for (const sec of model.sections) {
                const card = document.createElement('div');
                card.className = 'stats-section';
                const title = document.createElement('div');
                title.className = 'stats-section-title';
                title.textContent = sec.title;
                card.appendChild(title);
                for (const row of sec.rows) {
                    const r = document.createElement('div');
                    r.className = 'stats-row';
                    r.dataset.tip = row.tip || '';
                    const k = document.createElement('span');
                    k.className = 'stats-key';
                    k.textContent = row.key;
                    const v = document.createElement('span');
                    v.className = 'stats-value';
                    v.textContent = row.value;
                    r.appendChild(k);
                    r.appendChild(v);
                    r.addEventListener('mouseenter', () => this._showTip(r));
                    r.addEventListener('mousemove',  (e) => this._moveTip(e));
                    r.addEventListener('mouseleave', () => this._hideTip());
                    card.appendChild(r);
                }
                cols.appendChild(card);
            }
        }
    }

    _showTip(row) {
        const tip = this.elements.tooltip;
        if (!tip) return;
        tip.textContent = row.dataset.tip || '';
        tip.style.display = 'block';
        this._activeRow = row;
    }
    _moveTip(e) {
        const tip = this.elements.tooltip;
        if (!tip || !this._activeRow) return;
        const panel = tip.parentElement;
        if (!panel) return;
        const panelRect = panel.getBoundingClientRect();
        const localX = e.clientX - panelRect.left;
        const localY = e.clientY - panelRect.top;
        // Offset so the tooltip doesn't sit under the cursor; clamp to the
        // panel so it never escapes the dialog box.
        const tipW = tip.offsetWidth || 320;
        const tipH = tip.offsetHeight || 80;
        let x = localX + 18;
        let y = localY + 18;
        if (x + tipW > panelRect.width)  x = Math.max(8, localX - tipW - 12);
        if (y + tipH > panelRect.height) y = Math.max(8, localY - tipH - 12);
        tip.style.left = `${x}px`;
        tip.style.top  = `${y}px`;
    }
    _hideTip() {
        if (this.elements.tooltip) this.elements.tooltip.style.display = 'none';
        this._activeRow = null;
    }
}
