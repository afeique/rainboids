// Diablo-style stats screen (5.79.0).
//
// Opened by pressing the ` (backtick) key while in a run. The screen
// pauses gameplay (piggy-backs on togglePause) and shows the player's
// level, XP progress, and every derived combat stat with hover tooltips
// that explain the formula behind each number — what it scales with
// and what raises it.

import { POWERUP_TYPES } from '../world/powerup.js';
import { iconSpriteCache } from '../core/utils.js';

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
    // Crit damage is randomized (200%..max) per shot. Show min/max range.
    const critDStacks = player.getPowerupStacks?.('CRIT_DAMAGE') | 0;
    const critDMin = player.baseCritDamage;
    const critDMax = Math.min(550, 300 + critDStacks * 15);
    const range = player.getRangeMultiplier?.() ?? 1;
    const goldFind = player.getGoldFindMultiplier?.() ?? 1;
    const knockback = player.getKnockbackMultiplier?.() ?? 1;
    const streakMul = player.getHitStreakMultiplier?.() ?? 1;
    const dropRateBonus = (lvl - 1) * 0.015;
    const dropQtyBonus = Math.floor((lvl - 1) / 5);

    // Powerup stacks summary
    const stacks = (id) => player.getPowerupStacks ? player.getPowerupStacks(id) : 0;

    // Primary fire rate (ms between shots) — lower is faster.
    const baseFireMs = player.baseFireRate ?? 400;
    const rapidStacks = stacks('RAPID_FIRE');
    const effFireMs = baseFireMs * Math.pow(1 - 0.22, rapidStacks);
    const effFireRateHz = 1000 / effFireMs;

    const sections = [];

    // ── Hero / vitals ─────────────────────────────────────────────────
    sections.push({
        title: 'VITALS',
        rows: [
            {
                key: 'Max HP',
                value: `${maxHp}`,
                tip:
                    `Max health pool.\n` +
                    `Base: 25 HP.\n` +
                    `+ HEALTH_BOOST stacks (×${stacks('HEALTH_BOOST')}) → +35 each.\n` +
                    `Hard cap: 600.\n` +
                    `Does NOT scale with player level — invest in HEALTH_BOOST to raise.`,
            },
            {
                key: 'Shield (DR)',
                value: `${dmgRed.toFixed(0)}%`,
                tip:
                    `Damage reduction applied to incoming damage.\n` +
                    `Base: 15% (starting armor).\n` +
                    `+ SHIELD_BOOST stacks (×${stacks('SHIELD_BOOST')}) → +8% each.\n` +
                    `Hard cap: 75%.`,
            },
            {
                key: 'Shield Tanks',
                value: `${player.healthTanks || 0}`,
                tip:
                    `Number of full HP-bar tanks. When HP hits 0, one tank is\n` +
                    `consumed and HP refills. Earned via the Defense shop tab.`,
            },
            {
                key: 'Lives',
                value: `${gameEngine?.game?.lives ?? '—'}`,
                tip:
                    `Lives left. When all tanks AND HP run out, you lose a life\n` +
                    `and respawn at the field's edge. Out of lives = run over.`,
            },
        ],
    });

    // ── Offense ───────────────────────────────────────────────────────
    sections.push({
        title: 'OFFENSE',
        rows: [
            {
                key: 'Primary',
                value: `${player.activePrimary || '—'}`,
                tip:
                    `Equipped primary weapon. Cycle with R (hold for radial menu).\n` +
                    `Each primary has its own per-weapon upgrade tree in the shop.`,
            },
            {
                key: 'Power',
                value: `${player.activePower || '—'}`,
                tip:
                    `Equipped power weapon (R-click / SPACE / DOWN). Cycle with F.\n` +
                    `Each power weapon has its own upgrade tree in the shop.`,
            },
            {
                key: 'Defense Skill',
                value: `${player.activeSkill || '—'}`,
                tip:
                    `Equipped defensive skill (Q to activate). Cycle with E.\n` +
                    `Skill upgrades are SP-priced in the shop's Defense tab.`,
            },
            {
                key: 'Fire Rate',
                value: `${effFireRateHz.toFixed(2)} /s`,
                tip:
                    `Effective auto-fire rate.\n` +
                    `Base interval: ${baseFireMs}ms (${(1000/baseFireMs).toFixed(2)}/s).\n` +
                    `RAPID_FIRE stacks (×${rapidStacks}) → ×0.78 interval each.\n` +
                    `Effective interval: ${Math.round(effFireMs)}ms.`,
            },
            {
                key: 'Crit Chance',
                value: `${critC.toFixed(0)}%`,
                tip:
                    `Probability each shot crits.\n` +
                    `Base: 8%.\n` +
                    `+ CRIT_CHANCE stacks (×${stacks('CRIT_CHANCE')}) → +7% each.\n` +
                    `Hard cap: 60%.`,
            },
            {
                key: 'Crit Damage',
                value: `${critDMin.toFixed(0)}–${critDMax.toFixed(0)}%`,
                tip:
                    `Crit damage roll range. Each crit picks a random multiplier in\n` +
                    `this range and applies it to base damage.\n` +
                    `Base range: 200%–300%.\n` +
                    `+ CRIT_DAMAGE stacks (×${critDStacks}) → +15% on the ceiling each.\n` +
                    `Hard cap: 550%.`,
            },
            {
                key: 'Range Mult',
                value: `${mult(range)}`,
                tip:
                    `Bullet travel-distance multiplier.\n` +
                    `Base: 1.00×.\n` +
                    `+ LONG_RANGE stacks (×${stacks('LONG_RANGE')}) → +55% each.`,
            },
            {
                key: 'Knockback',
                value: `${mult(knockback)}`,
                tip:
                    `Power-weapon knockback impulse multiplier (Mine, Nova,\n` +
                    `Lightning, Missile).\n` +
                    `Base: 1.00×.\n` +
                    `+ KNOCKBACK stacks (×${stacks('KNOCKBACK')}) → +40% each, cap 3.50×.`,
            },
            {
                key: 'Streak Buff',
                value: `${mult(streakMul)}`,
                tip:
                    `Active kill-streak damage multiplier.\n` +
                    `Tiers — 3+ kills EMPOWERED 1.25×, 6+ UNSTOPPABLE 1.50×,\n` +
                    `10+ GODLIKE 1.75×, 15+ LEGENDARY 2.00× (cap).\n` +
                    `Resets when you take damage.`,
            },
        ],
    });

    // ── Economy / drops (5.79.0 — scales with player level) ──────────
    sections.push({
        title: 'ECONOMY & DROPS',
        rows: [
            {
                key: 'Gold Find',
                value: `${mult(goldFind)}`,
                tip:
                    `Gold-amount AND money-drop-rate multiplier.\n` +
                    `Formula: 1 + (level - 1) × 0.10.\n` +
                    `Stacks multiplicatively with kill-streak gold bonus.\n` +
                    `Level ${lvl} → ${mult(goldFind)}.`,
            },
            {
                key: 'Drop Rate Bonus',
                value: `+${(dropRateBonus * 100).toFixed(1)}%`,
                tip:
                    `Extra orb-drop probability granted by player level.\n` +
                    `Formula: (level - 1) × 1.5%, applied to BOTH health and\n` +
                    `money base drop rates. Stacks additively with the\n` +
                    `entity-level / enemy bonuses.\n` +
                    `Level ${lvl} → +${(dropRateBonus * 100).toFixed(1)}%.`,
            },
            {
                key: 'Drop Qty Bonus',
                value: `+${dropQtyBonus} max orbs`,
                tip:
                    `Extra max-orbs-per-drop granted by player level.\n` +
                    `Formula: floor((level - 1) / 5).\n` +
                    `L5 → +1, L10 → +2, L15 → +3, L20 → +4.\n` +
                    `Level ${lvl} → +${dropQtyBonus}.`,
            },
            {
                key: 'Health Orb',
                value: `+${(lvl - 1) >= 0 ? Math.floor((lvl - 1) * 0.6) : 0}–${Math.floor((lvl - 1) * 0.6) + Math.floor((lvl - 1) * 0.15)} HP`,
                tip:
                    `Per-orb heal bonus from player level.\n` +
                    `Floor: +0.6 HP/level. Ceiling: +0.75 HP/level.\n` +
                    `Combined with the base orb amount (1–4 HP) and split\n` +
                    `into multiple small orbs when budget exceeds the\n` +
                    `per-orb cap. Level ${lvl}.`,
            },
            {
                key: 'Money Orb',
                value: `+${(lvl - 1) * 3}–${(lvl - 1) * 5}¢`,
                tip:
                    `Per-orb gold bonus from player level.\n` +
                    `Min: +3/level. Max: +5/level.\n` +
                    `Stacks on top of Gold Find and the kill-streak gold\n` +
                    `multiplier (which lift the combined budget).\n` +
                    `Level ${lvl}.`,
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

    if (ownedPowerups.length > 0) {
        sections.push({
            title: 'POWERUPS HELD',
            rows: ownedPowerups.map((p) => ({
                key: p.name,
                value: `×${p.stacks} / ${p.cap}`,
                tip:
                    `Stacks: ${p.stacks} (cap ${p.cap}).\n` +
                    `Spend +1 SP in the POWERUPS pause-tab to add another stack.\n` +
                    `Powerups are permanent for the run.`,
            })),
        });
    } else {
        sections.push({
            title: 'POWERUPS HELD',
            rows: [{ key: '— none —', value: '', tip: 'Spend SP in the POWERUPS pause-tab to buy powerups.' }],
        });
    }

    // ── Scaling info card ────────────────────────────────────────────
    sections.push({
        title: 'WORLD SCALING',
        rows: [
            {
                key: 'Enemy HP',
                value: `${mult(1 + (gameEngine?.game?.enemyLevel - 1 || 0) * 0.22)}`,
                tip:
                    `Wave's enemy HP multiplier.\n` +
                    `Formula: 1 + (enemyLevel - 1) × 0.22.\n` +
                    `Level ${gameEngine?.game?.enemyLevel ?? 1}.`,
            },
            {
                key: 'Enemy Damage',
                value: `${mult(1 + (gameEngine?.game?.enemyLevel - 1 || 0) * 0.30)}`,
                tip:
                    `Wave's enemy damage output multiplier.\n` +
                    `Formula: 1 + (enemyLevel - 1) × 0.30 (5.79.0 — was 0.18).\n` +
                    `Steepened because PLAYER damage no longer scales with\n` +
                    `level — you must invest in shop upgrades + powerups\n` +
                    `to keep up.`,
            },
            {
                key: 'Asteroid HP',
                value: `${mult(1 + (gameEngine?.game?.asteroidLevel - 1 || 0) * 0.35)}`,
                tip:
                    `Wave's asteroid HP multiplier.\n` +
                    `Formula: 1 + (asteroidLevel - 1) × 0.35.\n` +
                    `Level ${gameEngine?.game?.asteroidLevel ?? 1}.`,
            },
            {
                key: 'Asteroid Collision',
                value: `${mult(1 + (gameEngine?.game?.asteroidLevel - 1 || 0) * 0.30)}`,
                tip:
                    `Asteroid collision damage multiplier.\n` +
                    `Formula: 1 + (asteroidLevel - 1) × 0.30.\n` +
                    `Higher waves = chunkier rocks that hit harder.`,
            },
            {
                key: 'Player Damage',
                value: '× 1.00',
                tip:
                    `5.79.0 — Player base damage does NOT scale with level.\n` +
                    `Use shop upgrades (per-weapon trees), CRIT_CHANCE,\n` +
                    `CRIT_DAMAGE, and damage-relevant powerups to grow DPS.\n` +
                    `Kill-streak provides a temporary in-fight multiplier.`,
            },
        ],
    });

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
        // Stats screen pauses the game like the regular pause, but skips
        // opening the pause menu DOM. We track our own _isOpen so close()
        // can restore properly.
        this._wasPaused = !!(ge.game && ge.game.state === 'paused');
        if (!this._wasPaused) ge.togglePause();
        this._isOpen = true;
        this.elements.overlay.style.display = 'flex';
        // The pause overlay may also have flipped on. Hide it under us.
        const pauseDom = document.getElementById('pause-overlay');
        if (pauseDom) {
            this._pauseDomWasFlex = pauseDom.style.display === 'flex';
            pauseDom.style.display = 'none';
        }
        this.render();
        return true;
    }

    close() {
        if (!this._isOpen) return;
        this._isOpen = false;
        if (this.elements.overlay) this.elements.overlay.style.display = 'none';
        if (this.elements.tooltip) this.elements.tooltip.style.display = 'none';
        // Restore pause-menu display if it was up before, otherwise resume.
        const ge = this.gameEngine;
        const pauseDom = document.getElementById('pause-overlay');
        if (this._pauseDomWasFlex && pauseDom) {
            pauseDom.style.display = 'flex';
        } else if (!this._wasPaused && ge) {
            // We took the pause; resume it now.
            ge.togglePause();
        }
        this._pauseDomWasFlex = false;
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
            const cells = [
                { label: 'LEVEL', value: `${model.level}` },
                {
                    label: 'XP',
                    value: model.xpNext > 0
                        ? `${model.xp} / ${model.xpNext}`
                        : `${model.xp}`,
                },
                {
                    // 5.79.14 — Gold cell renders the cached coin icon
                    //   to the LEFT of the amount, matching the HUD's
                    //   bottom-right gold readout. Same iconSpriteCache
                    //   instance the canvas HUD uses so the look stays
                    //   consistent across DOM + canvas.
                    label: 'GOLD', value: `${ge.game?.money ?? 0}`, icon: 'coin',
                },
                { label: 'WAVE', value: `${ge.game?.currentWave ?? 1}` },
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
