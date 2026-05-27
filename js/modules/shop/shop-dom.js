// Shop DOM — Phase 7 ability-tree rewrite (2026-05-19).
//
// Renders a Diablo-style visual ability tree into the #shop-overlay
// instead of the previous tab + scrollable-list layout. Four clusters
// — PRIMARY / POWER / DEFENSE / PASSIVES — are displayed at once. For
// the first three, each weapon/ability is a parent node with its
// per-weapon upgrade nodes orbiting it on a ring at radius ~120px. The
// PASSIVES cluster uses a flat hex grid (no parent-child structure).
//
// Public surface (unchanged from the legacy list-based version, so
// shop-manager / game-engine bindings still work):
//   initShopDom(gameEngine)   — wire up event listeners once at boot
//   showShopDom()             — display the overlay, render initial state
//   hideShopDom()             — hide the overlay
//   renderShopDom()           — rebuild the tree (after purchase / open)
//   updateShopCurrencyDom()   — quick refresh of the gold + wave header
//
// The tree DOM is built into the cluster containers carved out by
// `static-dom.js::_buildShopOverlay()` — `#shop-tree-primary`,
// `#shop-tree-power`, `#shop-tree-defense`, `#shop-tree-passives`.
// Node click → buyShopItem via shop-manager. Node hover → floating
// tooltip positioned next to the cursor.

import { renderIconHTML } from '../ui/icons.js';
import {
    PRIMARY_WEAPONS,
    POWER_WEAPONS,
    ABILITIES,
    getPrimaryUpgrades,
    getPowerUpgrades,
    getAbilityUpgrades,
    getStats,
    getAttunementsForWeapon,
    getMechanicMods,
    getAbilityAttunements,
} from '../combat/weapon-data.js';
import { ELEMENTS } from '../combat/elements.js';
// Phase P4 — rule-modifier PASSIVES cluster (the equippable build layer).
import { PASSIVES, getSlotPassives, maxPassiveSlots } from '../combat/passive-data.js';
import { MAX_STAGES, DEFAULT_RUN_CONFIG } from '../core/constants.js';
// RUN-06 — the reward-dial helper drives the RUN SETUP readout multiplier.
import { wavesPerStageRewardMultForWps } from '../world/reward-dial.js';
// DIR-09 — difficulty MODE selector: the canonical mode list + per-mode
// reward multiplier feed the RUN SETUP mode control + its readout.
import { MODES, DEFAULT_MODE, modeReward } from '../wave/difficulty-constants.js';
// 2026-05-23 — pre-run BUILD mode reuses the loadout-selection helpers so the
// tree can act as the start-of-run weapon/ability picker (see _preRun below).
import { toggleSelection, getUnlockedSet, unlockCost, LOADOUT_SLOTS, BASE_LOADOUT, isAllUnlocked } from './armory.js';
import { loadMeta } from '../core/storage.js';
import { debugState } from '../core/debug-config.js';

// Per-element icon for attunement bubbles (falls back to 'spiral').
const _ELEM_ICON = {
    PYRO: 'fire', CRYO: 'snowflake', VOLT: 'bolt', TOXIC: 'skull',
    VOID: 'vortex', RADIANT: 'sparkle', KINETIC: 'circle-fill',
};

// ── Constants ──────────────────────────────────────────────────────

// Border/state colors — exposed via CSS classes too, kept here for any
// inline accent (parent node uses its weapon's canonical color).
const STATE_COLORS = {
    UNAFFORDABLE: '#555555',
    AFFORDABLE:   '#e0c060',
    OWNED:        '#5cc8ff',
    MAXED:        '#a060e0',
};

// Ability-upgrade SP-era costs ranged 2-3. SP was retired in 6.0.0; for
// the tree to show meaningful gold prices we multiply by ABILITY_COST_MULT
// when materializing ability upgrades. Tuned so a baseline "+1 duration"
// ability upgrade costs ~1600g (matches the lowest weapon-upgrade tier).
const ABILITY_COST_MULT = 800;

// Coin SVG path (copied from the HUD coin icon).
const COIN_SVG_PATH = "M59.989,21c-0.099-1.711-2.134-3.048-6.204-4.068c0.137-0.3,0.214-0.612,0.215-0.936V9h-0.017C53.625,3.172,29.743,3,27,3 S0.375,3.172,0.017,9H0v0.13v0v0l0,6.869c0.005,1.9,2.457,3.387,6.105,4.494c-0.05,0.166-0.08,0.335-0.09,0.507H6v0.13v0v0l0,6.857 C2.07,28.999,0.107,30.317,0.01,32H0v0.13v0v0l0,6.869c0.003,1.323,1.196,2.445,3.148,3.38C3.075,42.581,3.028,42.788,3.015,43H3 v0.13v0v0l0,6.869c0.008,3.326,7.497,5.391,15.818,6.355c0.061,0.012,0.117,0.037,0.182,0.037c0.019,0,0.035-0.01,0.054-0.011 c1.604,0.181,3.234,0.322,4.847,0.423c0.034,0.004,0.064,0.02,0.099,0.02c0.019,0,0.034-0.01,0.052-0.011 C26.1,56.937,28.115,57,30,57c1.885,0,3.9-0.063,5.948-0.188c0.018,0.001,0.034,0.011,0.052,0.011c0.035,0,0.065-0.017,0.099-0.02 c1.613-0.101,3.243-0.241,4.847-0.423C40.965,56.38,40.981,56.39,41,56.39c0.065,0,0.121-0.025,0.182-0.037 c8.321-0.964,15.809-3.03,15.818-6.357V43h-0.016c-0.07-1.226-1.115-2.249-3.179-3.104c0.126-0.289,0.195-0.589,0.195-0.9V32.46 c3.59-1.104,5.995-2.581,6-4.464V21H59.989z";

// ── Module state ───────────────────────────────────────────────────

let _engine = null;
let _elements = null;
// 6.27.0 — Active category tab. Drives which cluster is visible. CSS
// gates visibility off `#shop-tree[data-active-tab]`.
let _activeTab = 'primary';
// 6.x — debounce buy clicks so an accidental double-fire / double-click
// doesn't purchase two stacks for one intent.
let _lastBuyAt = 0;

// 2026-05-23 — Pre-run BUILD mode: the same bubble tree doubles as the
// start-of-run weapon/ability SELECTION screen (game-engine.openArmory).
// In this mode parent nodes are equip toggles, the in-run buy path is
// bypassed, and the BUILD footer (BACK / status / START RUN) is shown.
// _preRunSel mirrors the LOADOUT contract ({primaries,powers,abilities})
// consumed by startNewRun; _unlockedSets caches per-category unlocks.
let _preRun = false;
let _preRunSel = { primaries: [], powers: [], abilities: [] };
// 6.x — per-category "unlock more" store expansion on the compact BUILD list.
// Collapsed by default so the screen shows ONLY owned items (the loadout);
// expanding reveals the locked items to purchase with account-gold.
let _prerunStoreOpen = { primaries: false, powers: false, abilities: false };
let _unlockedSets = null;
// W5 — per-weapon ACTIVE attunement ids chosen for the run: { weaponId: [id…] }.
// Seeded from meta.loadout.attunements; flows into player.activeAttunements on
// START RUN. `_unlockedAttune` caches owned attunement ids for node states.
let _preRunAttune = {};
let _unlockedAttune = null;
// W5 — per-weapon ACTIVE mechanic-mod ids: { weaponId: [id…] }. Mirrors the
// attunement set; flows into the run as granted powerup stacks on START.
let _preRunMods = {};
let _unlockedMods = null;
// W6 — per-ability ACTIVE attunement (ONE element each, radio): { abilityId: attId }.
let _preRunAbilityAttune = {};
let _unlockedAbilityAttune = null;
// P4 — chosen rule-modifier PASSIVES for the run: an ORDERED id list (slot
// order), length ≤ maxSlots(stages). Seeded from meta.loadout.passives; flows
// into player.equippedPassives on START. `_unlockedPassives` caches owned ids.
let _preRunPassives = [];
let _unlockedPassives = null;
// RUN-06 — chosen RUN SHAPE for the run: { stages, wavesPerStage }. Seeded by
// game-engine before showing BUILD; the footer's RUN SETUP controls mutate it;
// flows into game.runConfig on START RUN (beginPreRunFromTree).
let _preRunRunConfig = { ...DEFAULT_RUN_CONFIG };

// RUN-06 — run-shape bounds (UI + apply share these). Stages span 10..100
// stepping by 10; waves-per-stage is one of 3/6/9.
export const RUN_STAGES_MIN = 10;
export const RUN_STAGES_MAX = 100;
export const RUN_STAGES_STEP = 10;
export const RUN_WPS_OPTIONS = [3, 6, 9];

// RUN-06 — pure: snap a stages value into [10,100] on the 10-step grid.
export function clampRunStages(n) {
    let s = Math.round(((typeof n === 'number' && isFinite(n)) ? n : RUN_STAGES_MIN) / RUN_STAGES_STEP) * RUN_STAGES_STEP;
    return Math.max(RUN_STAGES_MIN, Math.min(RUN_STAGES_MAX, s));
}
// RUN-06 — pure: snap waves-per-stage to the nearest of 3/6/9 (else default 3).
export function clampRunWps(n) {
    if (typeof n !== 'number' || !isFinite(n)) return 3;
    let best = RUN_WPS_OPTIONS[0];
    let bestD = Infinity;
    for (const o of RUN_WPS_OPTIONS) {
        const d = Math.abs(o - n);
        if (d < bestD) { bestD = d; best = o; }
    }
    return best;
}
// DIR-09 — pure: resolve a difficulty mode to a canonical MODES member.
// Upper-cases + validates against MODES; anything else → DEFAULT_MODE (NORMAL).
export function clampRunMode(m) {
    if (typeof m === 'string') {
        const up = m.toUpperCase();
        if (MODES.includes(up)) return up;
    }
    return DEFAULT_MODE;
}
// RUN-06 — pure: clamp a whole runConfig into the valid run-shape grid.
// DIR-09 — also carries+validates `mode` (a valid MODES member, else NORMAL).
export function clampRunConfig(rc) {
    const stages = clampRunStages(rc && rc.stages);
    const wavesPerStage = clampRunWps(rc && rc.wavesPerStage);
    const mode = clampRunMode(rc && rc.mode);
    return { stages, wavesPerStage, mode };
}
// DIR-09 — §14.7 gating: is `mode` unlocked given `maxModeCleared` (the highest
// mode the player has cleared ≥ stage 5 on)? EASY/NORMAL/HARD are ALWAYS open.
// EPIC needs Hard-cleared (maxModeCleared ≥ HARD); LEGENDARY needs Epic-cleared
// (maxModeCleared ≥ EPIC). A default/absent meta (maxModeCleared undefined) →
// EPIC/LEGENDARY locked. Pure; exported for unit tests.
export function isModeUnlocked(mode, maxModeCleared) {
    const m = clampRunMode(mode);
    if (m === 'EASY' || m === 'NORMAL' || m === 'HARD') return true;
    // maxModeCleared is the deepest mode cleared; rank it on the MODES order.
    const clearedRank = MODES.indexOf(clampRunMode(maxModeCleared));
    // clampRunMode coerces absent/garbage to NORMAL; treat that as "nothing
    // proven beyond the always-open tier" so EPIC/LEGENDARY stay locked.
    const proven = (typeof maxModeCleared === 'string' && MODES.includes(maxModeCleared.toUpperCase()))
        ? clearedRank : -1;
    if (m === 'EPIC') return proven >= MODES.indexOf('HARD');
    if (m === 'LEGENDARY') return proven >= MODES.indexOf('EPIC');
    return false;
}
// RUN-06 — pure: the live readout string for a given run shape, e.g.
// "50 waves · rewards ×1.3". Uses the shipped reward-dial helper so the
// multiplier always matches the in-run reward math (×1.0 / ×1.3 / ×1.6).
// DIR-09 — when a mode is passed, the readout also shows the mode + its
// per-mode reward multiplier, e.g. "300 waves · HARD · rewards ×1.3 ×1.3".
export function runSetupReadout(stages, wps, mode) {
    const total = clampRunStages(stages) * clampRunWps(wps);
    const mult = wavesPerStageRewardMultForWps(clampRunWps(wps));
    if (mode === undefined) {
        return `${total} waves · rewards ×${mult.toFixed(1)}`;
    }
    const m = clampRunMode(mode);
    const mr = modeReward(m);
    return `${total} waves · ${m} · rewards ×${mult.toFixed(1)} ×${mr.toFixed(1)}`;
}

// Pre-run passive slot cap for THIS run (round-3 §11.A). Pre-Phase-X there's no
// runConfig, so derive from the fixed stage count.
function _passiveMaxSlots() {
    const stages = (_engine && _engine.game && _engine.game.runConfig && _engine.game.runConfig.stages) || MAX_STAGES;
    return maxPassiveSlots(stages);
}
function _isKeystonePassive(id) {
    const def = PASSIVES[id];
    return !!(def && Array.isArray(def.tags) && def.tags.includes('keystone'));
}

/** Seed the pre-run loadout selection (called by game-engine before show). */
export function setPreRunSelection(sel) {
    _preRunSel = {
        primaries: (sel && Array.isArray(sel.primaries)) ? sel.primaries.slice() : [],
        powers:    (sel && Array.isArray(sel.powers))    ? sel.powers.slice()    : [],
        abilities: (sel && Array.isArray(sel.abilities)) ? sel.abilities.slice() : [],
    };
}

/** Seed the pre-run active-attunement map (called by game-engine before show). */
export function setPreRunAttunements(map) {
    _preRunAttune = {};
    if (map && typeof map === 'object') {
        for (const [wid, ids] of Object.entries(map)) {
            if (Array.isArray(ids)) _preRunAttune[wid] = ids.slice();
        }
    }
}

/** The current pre-run active-attunement map (read by START RUN). */
export function getPreRunAttunements() {
    const out = {};
    for (const [wid, ids] of Object.entries(_preRunAttune)) {
        if (ids && ids.length) out[wid] = ids.slice();
    }
    return out;
}

// Toggle (or force) an attunement id active for a weapon in the pre-run set.
function _toggleAttune(weaponId, attId, forceOn) {
    const cur = _preRunAttune[weaponId] || [];
    const at = cur.indexOf(attId);
    if (at !== -1 && !forceOn) cur.splice(at, 1);
    else if (at === -1) cur.push(attId);
    _preRunAttune[weaponId] = cur;
}

/** Seed the pre-run active-mod map (called by game-engine before show). */
export function setPreRunMods(map) {
    _preRunMods = {};
    if (map && typeof map === 'object') {
        for (const [wid, ids] of Object.entries(map)) {
            if (Array.isArray(ids)) _preRunMods[wid] = ids.slice();
        }
    }
}

/** The current pre-run active-mod map (read by START RUN). */
export function getPreRunMods() {
    const out = {};
    for (const [wid, ids] of Object.entries(_preRunMods)) {
        if (ids && ids.length) out[wid] = ids.slice();
    }
    return out;
}

function _toggleMod(weaponId, modId, forceOn) {
    const cur = _preRunMods[weaponId] || [];
    const at = cur.indexOf(modId);
    if (at !== -1 && !forceOn) cur.splice(at, 1);
    else if (at === -1) cur.push(modId);
    _preRunMods[weaponId] = cur;
}

/** Seed the pre-run ability-attune map (called by game-engine before show). */
export function setPreRunAbilityAttune(map) {
    _preRunAbilityAttune = {};
    if (map && typeof map === 'object') {
        for (const [aid, attId] of Object.entries(map)) {
            if (typeof attId === 'string') _preRunAbilityAttune[aid] = attId;
        }
    }
}

/** The current pre-run ability-attune map (read by START RUN). */
export function getPreRunAbilityAttune() {
    return { ..._preRunAbilityAttune };
}

// W6 — RADIO: one element per ability. Re-picking the active one clears it;
// picking a different element replaces it.
function _setAbilityAttune(abilityId, attId, forceOn) {
    if (_preRunAbilityAttune[abilityId] === attId && !forceOn) {
        delete _preRunAbilityAttune[abilityId];
    } else {
        _preRunAbilityAttune[abilityId] = attId;
    }
}

/** Seed the chosen passive list (called by game-engine before show). */
export function setPreRunPassives(list) {
    _preRunPassives = Array.isArray(list) ? list.filter((id) => PASSIVES[id]).slice(0, _passiveMaxSlots()) : [];
}

/** The chosen passive id list (ordered = slot order), read by START RUN. */
export function getPreRunPassives() {
    return _preRunPassives.slice();
}

/** Seed the pre-run run shape (called by game-engine before show). DIR-09 —
 * clampRunConfig now carries+validates `mode` too, so a seeded mode survives. */
export function setPreRunRunConfig(rc) {
    _preRunRunConfig = clampRunConfig(rc || DEFAULT_RUN_CONFIG);
}

/** The chosen run shape { stages, wavesPerStage, mode }, read by START RUN. */
export function getPreRunRunConfig() {
    return clampRunConfig(_preRunRunConfig);
}

// P4 — toggle a passive into/out of the chosen set. Caps at maxSlots(stages)
// and enforces the keystone budget (≤2 keystones). Returns true if it changed.
function _togglePassive(id) {
    if (!PASSIVES[id]) return false;
    const at = _preRunPassives.indexOf(id);
    if (at !== -1) { _preRunPassives.splice(at, 1); return true; }
    if (_preRunPassives.length >= _passiveMaxSlots()) return false; // slot cap
    if (_isKeystonePassive(id)) {
        const keystones = _preRunPassives.filter((p) => _isKeystonePassive(p)).length;
        if (keystones >= 2) return false; // keystone budget
    }
    _preRunPassives.push(id);
    return true;
}

function $(id) { return document.getElementById(id); }

// ── Lifecycle ──────────────────────────────────────────────────────

export function initShopDom(gameEngine) {
    _engine = gameEngine;
    _elements = {
        overlay:        $('shop-overlay'),
        menu:           $('shop-menu'),
        coinsAmt:       $('shop-coins-amount'),
        coresBox:       $('shop-tree-cores'),
        coresAmt:       $('shop-cores-amount'),
        prerunHint:     $('shop-prerun-hint'),
        startBtn:       $('shop-prerun-start'),
        // RUN-06 — RUN SETUP controls (BUILD footer).
        runSetup:       $('shop-runsetup'),
        runSetupWps:    $('shop-runsetup-wps'),
        // DIR-09 — difficulty MODE selector group.
        runSetupMode:   $('shop-runsetup-mode'),
        runSetupStagesVal: $('shop-runsetup-stages-value'),
        runSetupStagesDec: $('shop-runsetup-stages-dec'),
        runSetupStagesInc: $('shop-runsetup-stages-inc'),
        runSetupReadout:   $('shop-runsetup-readout'),
        tree:           $('shop-tree'),
        tabs:           $('shop-tree-tabs'),
        clusterPrimary: $('shop-tree-primary'),
        clusterPower:   $('shop-tree-power'),
        clusterDefense: $('shop-tree-defense'),
        clusterPassive: $('shop-tree-passives'),
        clusterPassiveSkills: $('shop-tree-passiveskills'),
        clusterGear:    $('shop-tree-gear'),
        tooltip:        $('shop-tree-tooltip'),
        closeBtn:       $('shop-close-button'),
    };

    // Close button. In pre-run BUILD mode this returns to the title;
    // in-run it routes back through the normal shop-close flow.
    if (_elements.closeBtn) {
        _elements.closeBtn.addEventListener('click', () => {
            if (_preRun) {
                if (_engine && typeof _engine.cancelPreRunToTitle === 'function') _engine.cancelPreRunToTitle();
                return;
            }
            _engine.closeShopAndReturn();
        });
    }

    // Pre-run BUILD footer — START RUN begins the run with the selected
    // loadout; BACK returns to the title. Buttons exist only after
    // static-dom built the overlay (they're hidden in the in-run shop).
    const startBtn = $('shop-prerun-start');
    if (startBtn) {
        startBtn.addEventListener('click', () => {
            if (_engine && typeof _engine.beginPreRunFromTree === 'function') {
                _engine.beginPreRunFromTree({
                    ..._preRunSel,
                    attunements: getPreRunAttunements(),
                    mods: getPreRunMods(),
                    abilityAttune: getPreRunAbilityAttune(),
                    passives: getPreRunPassives(),
                    runConfig: getPreRunRunConfig(),
                });
            }
        });
    }
    const backBtn = $('shop-prerun-back');
    if (backBtn) {
        backBtn.addEventListener('click', () => {
            if (_engine && typeof _engine.cancelPreRunToTitle === 'function') {
                _engine.cancelPreRunToTitle();
            }
        });
    }

    // RUN-06 — RUN SETUP controls. Waves-per-stage segmented buttons set
    // _preRunRunConfig.wavesPerStage; the stages stepper bumps stages by 10
    // clamped to [10,100]. Each change re-renders the controls (active state +
    // value + readout). All pure-state mutations + a re-render — no run starts
    // here (that's the START RUN handler).
    if (_elements.runSetupWps) {
        _elements.runSetupWps.addEventListener('click', (e) => {
            const btn = e.target.closest('.shop-runsetup-btn');
            if (!btn || !btn.dataset.wps) return;
            _preRunRunConfig.wavesPerStage = clampRunWps(parseInt(btn.dataset.wps, 10));
            _renderRunSetup();
        });
    }
    if (_elements.runSetupStagesDec) {
        _elements.runSetupStagesDec.addEventListener('click', () => {
            _preRunRunConfig.stages = clampRunStages(_preRunRunConfig.stages - RUN_STAGES_STEP);
            _renderRunSetup();
        });
    }
    if (_elements.runSetupStagesInc) {
        _elements.runSetupStagesInc.addEventListener('click', () => {
            _preRunRunConfig.stages = clampRunStages(_preRunRunConfig.stages + RUN_STAGES_STEP);
            _renderRunSetup();
        });
    }

    // DIR-09 — difficulty MODE selector. Clicking an UNLOCKED mode button sets
    // _preRunRunConfig.mode + re-renders (active state + readout). Gated modes
    // (EPIC/LEGENDARY, §14.7) render disabled with an unlock-hint title, so a
    // click on them never reaches here. No run starts here (that's START RUN).
    if (_elements.runSetupMode) {
        _elements.runSetupMode.addEventListener('click', (e) => {
            const btn = e.target.closest('.shop-runsetup-btn');
            if (!btn || !btn.dataset.mode || btn.disabled) return;
            const mode = clampRunMode(btn.dataset.mode);
            if (!isModeUnlocked(mode, _maxModeCleared())) return; // belt-and-suspenders
            _preRunRunConfig.mode = mode;
            _renderRunSetup();
        });
    }

    // 6.27.0 — Tab strip. Clicking a tab swaps the active category;
    // the tree's `data-active-tab` attr drives which cluster shows
    // (CSS), and we toggle the `.active` class on the buttons.
    if (_elements.tabs) {
        _elements.tabs.addEventListener('click', (e) => {
            const btn = e.target.closest('.shop-tree-tab');
            if (!btn) return;
            const tab = btn.dataset.tab;
            if (!tab || tab === _activeTab) return;
            _activeTab = tab;
            _syncActiveTab();
            _hideTooltip();
        });
    }

    // U3 — keyboard tab cycling while the tree overlay is up: ◂ ▸ arrows,
    // Q/E, and Tab / Shift+Tab. Guarded on overlay visibility so it never
    // intercepts gameplay keys (the overlay is only 'flex' in BUILD / shop,
    // never during PLAYING, so this can't clash with the F/E/R radials).
    document.addEventListener('keydown', (e) => {
        if (!_elements || !_elements.overlay || _elements.overlay.style.display !== 'flex') return;
        let dir = 0;
        if (e.code === 'ArrowRight' || e.code === 'KeyE') dir = 1;
        else if (e.code === 'ArrowLeft' || e.code === 'KeyQ') dir = -1;
        else if (e.code === 'Tab') dir = e.shiftKey ? -1 : 1;
        else return;
        e.preventDefault();
        _cycleTab(dir);
    });

    // Replace the header coin glyph with the same SVG used by the HUD.
    const headerIcon = _elements.menu?.querySelector('.shop-tree-currency-icon');
    if (headerIcon) {
        headerIcon.replaceChildren(makeCoinIconSvg(22));
    }

    // Click handler — buy on left-click of any node button.
    if (_elements.tree) {
        _elements.tree.addEventListener('click', (e) => {
            const node = e.target.closest('.shop-node');
            if (!node) return;
            const id = node.dataset.id;
            if (!id) return;

            // Pre-run BUILD mode: parent nodes are EQUIP toggles; upgrade
            // (attunement) nodes are browse-only for now — purchasing
            // attunements with account-gold is a later step. No in-run
            // buying happens here.
            if (_preRun) {
                // Attunement orbit node: locked → unlock (account-gold) +
                // activate; owned → toggle active for this run.
                if (node.dataset.kind === 'attunement') {
                    const wid = node.dataset.weapon;
                    const owned = !!(_unlockedAttune && _unlockedAttune.has(id));
                    if (!owned) {
                        if (_engine && typeof _engine.unlockPreRunItem === 'function'
                            && _engine.unlockPreRunItem('attunements', id)) {
                            _toggleAttune(wid, id, true);
                        }
                    } else {
                        _toggleAttune(wid, id);
                    }
                    renderShopDom();
                    return;
                }
                // Mechanic-mod orbit node: same unlock/activate as attunements.
                if (node.dataset.kind === 'mod') {
                    const wid = node.dataset.weapon;
                    const owned = !!(_unlockedMods && _unlockedMods.has(id));
                    if (!owned) {
                        if (_engine && typeof _engine.unlockPreRunItem === 'function'
                            && _engine.unlockPreRunItem('mods', id)) {
                            _toggleMod(wid, id, true);
                        }
                    } else {
                        _toggleMod(wid, id);
                    }
                    renderShopDom();
                    return;
                }
                // Ability attunement: locked → unlock + set; owned → radio-set
                // (one element per ability).
                if (node.dataset.kind === 'abilityAttune') {
                    const aid = node.dataset.ability;
                    const owned = !!(_unlockedAbilityAttune && _unlockedAbilityAttune.has(id));
                    if (!owned) {
                        if (_engine && typeof _engine.unlockPreRunItem === 'function'
                            && _engine.unlockPreRunItem('abilityAttunements', id)) {
                            _setAbilityAttune(aid, id, true);
                        }
                    } else {
                        _setAbilityAttune(aid, id);
                    }
                    renderShopDom();
                    return;
                }
                // P4 — rule-modifier passive bubble: locked → unlock (gold) then
                // auto-equip if there's room; owned → toggle into/out of the run.
                if (node.dataset.kind === 'rulePassive') {
                    const owned = !!(_unlockedPassives && _unlockedPassives.has(id));
                    if (!owned) {
                        if (_engine && typeof _engine.unlockPreRunItem === 'function'
                            && _engine.unlockPreRunItem('passives', id)) {
                            _togglePassive(id);
                        }
                    } else {
                        _togglePassive(id);
                    }
                    renderShopDom();
                    return;
                }
                if (node.classList.contains('shop-node--parent')) {
                    const cat = node.dataset.category;
                    if (cat && _preRunSel[cat]) {
                        if (node.dataset.prerunSelectable === '1') {
                            // Unlocked → toggle equip (≤4 per category).
                            _preRunSel[cat] = toggleSelection(_preRunSel[cat], id, LOADOUT_SLOTS);
                        } else if (_engine && typeof _engine.unlockPreRunItem === 'function') {
                            // Locked → buy the unlock with account-gold, then
                            // auto-equip it if there's a free loadout slot.
                            if (_engine.unlockPreRunItem(cat, id)) {
                                _preRunSel[cat] = toggleSelection(_preRunSel[cat], id, LOADOUT_SLOTS);
                            }
                        }
                        renderShopDom();
                    }
                }
                return;
            }

            // Parent nodes (weapon/ability themselves) are not buyable;
            // only upgrade nodes carry a non-empty `data-buyable`.
            if (node.dataset.buyable !== '1') return;
            // Ignore a second buy within 200ms (double-click / double-fire)
            // so a single intent can't buy two stacks before the re-render.
            const nowT = (typeof performance !== 'undefined') ? performance.now() : Date.now();
            if (_lastBuyAt && nowT - _lastBuyAt < 200) return;
            _lastBuyAt = nowT;
            const ok = _engine.buyShopItem(id);
            if (ok) {
                node.classList.remove('shop-node--flash');
                // Force a reflow so the animation restarts.
                void node.offsetWidth;
                node.classList.add('shop-node--flash');
            }
            renderShopDom();
        });

        // Right-click any owned node to sell one stack back at-cost. The
        // refund equals what was paid for the last stack (sellShopItem reads
        // the same ramped costOverrides), so selling a trait to buy another
        // nets zero gold — free respec.
        _elements.tree.addEventListener('contextmenu', (e) => {
            if (_preRun) return; // no selling on the pre-run BUILD screen
            const node = e.target.closest('.shop-node');
            if (!node || node.dataset.sellable !== '1') return;
            e.preventDefault();
            const id = node.dataset.id;
            if (!id || !_engine.sellShopItem) return;
            if (_engine.sellShopItem(id)) {
                node.classList.remove('shop-node--flash');
                void node.offsetWidth;
                node.classList.add('shop-node--flash');
                _hideTooltip();
            }
            renderShopDom();
        });

        // Tooltip — show on pointerover, hide on pointerout, follow cursor.
        _elements.tree.addEventListener('pointerover', (e) => {
            const node = e.target.closest('.shop-node');
            if (!node) return;
            _showTooltip(node, e);
        });
        _elements.tree.addEventListener('pointermove', (e) => {
            if (_elements.tooltip && _elements.tooltip.style.display !== 'none') {
                _positionTooltip(e);
            }
        });
        _elements.tree.addEventListener('pointerout', (e) => {
            const node = e.target.closest('.shop-node');
            if (!node) return;
            // Only hide if leaving the entire node (not just hopping
            // between the node's icon/label children).
            if (node.contains(e.relatedTarget)) return;
            _hideTooltip();
        });
    }
}

export function showShopDom(preRun = false) {
    if (!_elements) return;
    _preRun = !!preRun;
    if (_elements.overlay) _elements.overlay.style.display = 'flex';
    _applyPreRunChrome();
    renderShopDom();
}

export function hideShopDom() {
    if (!_elements) return;
    if (_elements.overlay) _elements.overlay.style.display = 'none';
    _preRun = false;
    _applyPreRunChrome();
    _hideTooltip();
}

export function updateShopCurrencyDom() {
    if (!_elements || !_engine) return;
    if (_elements.coinsAmt) {
        // Pre-run BUILD shows the persistent account-gold wallet; the in-run
        // shop shows run-gold (game.money).
        const amt = _preRun
            ? ((_engine.game && _engine.game.accountGold) || 0)
            : (_engine.game ? _engine.game.money : 0);
        _elements.coinsAmt.textContent = `${Math.floor(amt)}`;
    }
    // Cores (✦) — only meaningful pre-run (they fund GEAR salvage/reroll/
    // tier-up). Read game.cores with a meta fallback (BUILD can open before a
    // run exists).
    if (_elements.coresAmt) {
        let cores = 0;
        if (_engine.game && typeof _engine.game.cores === 'number') cores = _engine.game.cores | 0;
        else { const m = loadMeta(); if (m && typeof m.cores === 'number') cores = m.cores | 0; }
        _elements.coresAmt.textContent = `${Math.max(0, cores)}`;
    }
}

// Legend labels: the same four node states read differently pre-run (loadout
// selection) vs in-run (gold shop). Order matches the static-dom legend:
// unaffordable · affordable · owned · maxed.
const _LEGEND_LABELS_INRUN = ['Too expensive', 'Affordable', 'Owned', 'Maxed'];
const _LEGEND_LABELS_PRERUN = ['Locked', 'Available', 'Equipped', 'Active'];
function _relabelLegend(preRun) {
    if (!_elements || !_elements.menu) return;
    const labels = preRun ? _LEGEND_LABELS_PRERUN : _LEGEND_LABELS_INRUN;
    const spans = _elements.menu.querySelectorAll('.shop-tree-legend-label');
    spans.forEach((span, i) => { if (labels[i] != null) span.textContent = labels[i]; });
}

// Toggle BUILD-mode chrome: show/hide the pre-run footer, swap the title,
// and hide the in-run close 'x' (BACK button replaces it in BUILD mode).
function _applyPreRunChrome() {
    const footer = $('shop-prerun-footer');
    if (footer) footer.style.display = _preRun ? 'flex' : 'none';
    if (_elements.closeBtn) _elements.closeBtn.style.display = _preRun ? 'none' : '';
    const title = _elements.menu ? _elements.menu.querySelector('.shop-tree-title') : null;
    if (title) title.textContent = _preRun ? 'BUILD YOUR LOADOUT' : 'UPGRADES';
    // Cores readout is BUILD-only; hidden (but keeps its grid column) in-run.
    if (_elements.coresBox) _elements.coresBox.style.visibility = _preRun ? 'visible' : 'hidden';
    // Pre-run instructions hint (BUILD-only).
    if (_elements.prerunHint) {
        _elements.prerunHint.style.display = _preRun ? '' : 'none';
        if (_preRun) {
            _elements.prerunHint.textContent =
                'Click a weapon or ability to equip it · click its orbiting bubbles to attune & mod · ◂ ▸ / Q E / Tab switch tabs · review GEAR, then START RUN';
        }
    }
    // Legend labels read differently pre-run (the same node states mean
    // locked / equip-able / equipped / active rather than shop costs).
    _relabelLegend(_preRun);
    // GEAR + PASSIVES are BUILD-only — hide them for the in-run shop, and
    // bounce the active tab off them if we're leaving BUILD mode.
    for (const t of ['gear', 'passiveskills']) {
        const btn = _elements.tabs ? _elements.tabs.querySelector(`.shop-tree-tab[data-tab="${t}"]`) : null;
        if (btn) btn.style.display = _preRun ? '' : 'none';
    }
    if (!_preRun && (_activeTab === 'gear' || _activeTab === 'passiveskills')) { _activeTab = 'primary'; _syncActiveTab(); }
    // RUN-06 — the RUN SETUP group is BUILD-only; refresh its displayed state
    // when entering BUILD so it reflects the current/last-chosen run shape.
    if (_elements.runSetup) _elements.runSetup.style.display = _preRun ? '' : 'none';
    if (_preRun) {
        _updatePreRunStatus();
        _renderRunSetup();
    }
}

// Pure readiness summary for a pre-run selection. A run is startable once at
// least one PRIMARY is equipped (powers/abilities are optional); `complete`
// means every category has at least one pick. Exported for unit tests.
export function loadoutReadiness(sel, slots = LOADOUT_SLOTS) {
    const n = (k) => (Array.isArray(sel && sel[k]) ? sel[k].length : 0);
    const primaries = n('primaries');
    const powers = n('powers');
    const abilities = n('abilities');
    return {
        primaries, powers, abilities, slots,
        ready: primaries >= 1,
        complete: primaries >= 1 && powers >= 1 && abilities >= 1,
    };
}

// Refresh the "PRIMARY n/4 · POWER n/4 · ABILITY n/4" status line + the START
// button's enabled/label state (can't start a run with no primary weapon).
function _updatePreRunStatus() {
    const status = $('shop-prerun-status');
    const r = loadoutReadiness(_preRunSel);
    if (status) {
        let text = `PRIMARY ${r.primaries}/${r.slots}   ·   POWER ${r.powers}/${r.slots}   ·   ABILITY ${r.abilities}/${r.slots}`;
        if (!r.ready) text += '   ·   ⚠ SELECT A PRIMARY';
        else if (r.complete) text += '   ·   ✓ READY';
        status.textContent = text;
        status.classList.toggle('shop-prerun-status--warn', !r.ready);
        status.classList.toggle('shop-prerun-status--ready', r.complete);
    }
    const startBtn = _elements && _elements.startBtn;
    if (startBtn) {
        startBtn.disabled = !r.ready;
        startBtn.classList.toggle('armory-btn--disabled', !r.ready);
        startBtn.textContent = r.ready ? 'START RUN →' : 'SELECT A PRIMARY';
    }
}

// DIR-09 — read maxModeCleared from persistent meta (§14.7 gating source). A
// default/absent meta yields undefined → EPIC/LEGENDARY stay locked.
function _maxModeCleared() {
    const m = loadMeta();
    return (m && typeof m.maxModeCleared === 'string') ? m.maxModeCleared : undefined;
}

// RUN-06 — reflect `_preRunRunConfig` into the RUN SETUP controls: the active
// waves-per-stage button, the stages value, the stepper disabled-at-bounds
// state, and the live readout (total waves + reward multiplier).
// DIR-09 — also reflects the difficulty MODE selector: active mode button,
// gated (EPIC/LEGENDARY) buttons disabled + unlock-hint title, and the readout
// now carries the mode + its per-mode reward multiplier.
function _renderRunSetup() {
    if (!_elements) return;
    const rc = clampRunConfig(_preRunRunConfig);
    _preRunRunConfig = rc; // keep state on-grid
    if (_elements.runSetupWps) {
        for (const btn of _elements.runSetupWps.querySelectorAll('.shop-runsetup-btn')) {
            btn.classList.toggle('active', parseInt(btn.dataset.wps, 10) === rc.wavesPerStage);
        }
    }
    if (_elements.runSetupStagesVal) _elements.runSetupStagesVal.textContent = `${rc.stages}`;
    if (_elements.runSetupStagesDec) _elements.runSetupStagesDec.disabled = rc.stages <= RUN_STAGES_MIN;
    if (_elements.runSetupStagesInc) _elements.runSetupStagesInc.disabled = rc.stages >= RUN_STAGES_MAX;
    if (_elements.runSetupMode) {
        const maxCleared = _maxModeCleared();
        for (const btn of _elements.runSetupMode.querySelectorAll('.shop-runsetup-btn')) {
            const mode = clampRunMode(btn.dataset.mode);
            const unlocked = isModeUnlocked(mode, maxCleared);
            btn.classList.toggle('active', mode === rc.mode);
            btn.disabled = !unlocked;
            btn.classList.toggle('shop-runsetup-btn--locked', !unlocked);
            if (unlocked) {
                btn.removeAttribute('title');
            } else {
                btn.title = mode === 'EPIC'
                    ? 'Locked — clear ≥ stage 5 on HARD to unlock EPIC'
                    : 'Locked — clear ≥ stage 5 on EPIC to unlock LEGENDARY';
            }
        }
    }
    if (_elements.runSetupReadout) _elements.runSetupReadout.textContent = runSetupReadout(rc.stages, rc.wavesPerStage, rc.mode);
}

// U3 — the ordered, currently-VISIBLE tabs. GEAR + PASSIVES are BUILD-only
// (hidden in the in-run shop), so they're only in the cycle pre-run.
function _visibleTabs() {
    return _preRun
        ? ['gear', 'primary', 'power', 'defense', 'passiveskills', 'passive']
        : ['primary', 'power', 'defense', 'passive'];
}

// U3 — pure tab stepper: given an ordered tab list, the current tab, and a
// direction (+1 next / −1 prev), return the next tab id (wrapping). A current
// tab not in the list falls back to the first. Exported for unit tests.
export function nextTab(tabs, current, dir) {
    if (!Array.isArray(tabs) || tabs.length === 0) return current;
    let i = tabs.indexOf(current);
    if (i < 0) i = 0;
    const len = tabs.length;
    const step = (dir | 0) || 1;
    return tabs[(((i + step) % len) + len) % len];
}

// U3 — cycle the active BUILD/shop tab by `dir` (keyboard ◂ ▸ / Q-E / Tab).
function _cycleTab(dir) {
    _activeTab = nextTab(_visibleTabs(), _activeTab, dir);
    _syncActiveTab();
    _hideTooltip();
}

// U3 — public tab cycle for the gamepad (D-pad), routed via game-engine. A
// no-op unless the tree overlay is actually visible, so the gamepad handler
// can call it on every D-pad edge without state-checking. Returns whether it
// acted.
export function cycleShopTabIfVisible(dir) {
    if (!_elements || !_elements.overlay || _elements.overlay.style.display !== 'flex') return false;
    _cycleTab(dir);
    return true;
}

// 6.27.0 — Reflect `_activeTab` into the DOM: set the tree's
// data-active-tab (CSS shows the matching cluster) and toggle the
// `.active` class on the tab buttons.
function _syncActiveTab() {
    if (_elements.tree) _elements.tree.dataset.activeTab = _activeTab;
    if (_elements.tabs) {
        for (const btn of _elements.tabs.querySelectorAll('.shop-tree-tab')) {
            btn.classList.toggle('active', btn.dataset.tab === _activeTab);
        }
    }
}

// ── Main render ────────────────────────────────────────────────────

export function renderShopDom() {
    if (!_elements || !_engine) return;
    updateShopCurrencyDom();
    _syncActiveTab();

    // Pre-run BUILD can run before a Player exists (TITLE → BUILD). Fall
    // back to a stub so upgrade nodes render at 0 stacks rather than crash.
    const player = _engine.player || { getPowerupStacks: () => 0 };

    // Pre-run: cache the per-category unlocked sets so parent nodes can show
    // locked vs selectable. In-run this stays null (no selection chrome).
    if (_preRun) {
        const meta = loadMeta() || {};
        _unlockedSets = {
            primaries: getUnlockedSet('primaries', meta),
            powers:    getUnlockedSet('powers', meta),
            abilities: getUnlockedSet('abilities', meta),
        };
        _unlockedAttune = getUnlockedSet('attunements', meta);
        _unlockedMods = getUnlockedSet('mods', meta);
        _unlockedAbilityAttune = getUnlockedSet('abilityAttunements', meta);
        _unlockedPassives = getUnlockedSet('passives', meta);
    } else {
        _unlockedSets = null;
        _unlockedAttune = null;
        _unlockedMods = null;
        _unlockedAbilityAttune = null;
        _unlockedPassives = null;
    }

    // 6.30.0 — Weapon/ability clusters are buyable; the PASSIVE cluster is
    // READ-ONLY (passives come from wave-clear cards, not the shop) — it
    // just visualizes what the player has collected.
    _renderWeaponCluster(_elements.clusterPrimary, _collectPrimaryGroups(), player, 'primaries');
    _renderWeaponCluster(_elements.clusterPower,   _collectPowerGroups(),   player, 'powers');
    _renderWeaponCluster(_elements.clusterDefense, _collectDefenseGroups(), player, 'abilities');
    _renderPassiveCluster(_elements.clusterPassive, player);
    // P4 — rule-modifier PASSIVES cluster (BUILD-only; equippable bubbles).
    _renderRulePassiveCluster(_elements.clusterPassiveSkills);

    // GEAR tab (BUILD-only): the engine renders the equipment + stash panels.
    if (_elements.clusterGear) {
        if (_preRun && _engine && typeof _engine.renderPreRunGear === 'function') {
            _engine.renderPreRunGear(_elements.clusterGear);
        } else {
            _elements.clusterGear.replaceChildren();
        }
    }

    if (_preRun) _updatePreRunStatus();
}

// ── Cluster builders ───────────────────────────────────────────────

// W5 — pre-run: a weapon's orbit nodes are its ATTUNEMENTS (the upfront element
// picks). In-run keeps the stackable upgrade nodes (until W4 moves them to cards).
function _attuneNodes(weaponId) {
    return getAttunementsForWeapon(weaponId).map((a) => ({
        id: a.id, name: a.name, element: a.element, weaponId,
        description: a.description || '', cost: a.cost,
        icon: _ELEM_ICON[a.element] || 'spiral', kind: 'attunement',
    }));
}

// W5 — pre-run: a weapon's mechanic-mod nodes (upfront behavior picks).
function _modNodes(weaponId) {
    return getMechanicMods(weaponId).map((m) => ({
        id: m.id, name: m.name, weaponId,
        description: m.description || '', cost: m.cost,
        icon: m.icon || 'bolt', kind: 'mod',
    }));
}

// W6 — pre-run: an ability's orbit nodes are its ATTUNEMENTS (one element each,
// radio). element-colored, like weapon attunements.
function _abilityAttuneNodes(abilityId) {
    return getAbilityAttunements(abilityId).map((a) => ({
        id: a.id, name: a.name, element: a.element, abilityId,
        description: a.description || '', cost: a.cost,
        icon: _ELEM_ICON[a.element] || 'spiral', kind: 'abilityAttune',
    }));
}

// Each "group" describes one weapon/ability node + its orbiting upgrade
// nodes. Shape:
//   { parent: { id, name, icon, color },
//     upgrades: [{ id, name, icon, description, cost, maxStacks }, ...] }
function _collectPrimaryGroups() {
    const groups = [];
    for (const w of Object.values(PRIMARY_WEAPONS)) {
        groups.push({
            parent: { id: w.id, name: w.name, icon: w.icon, color: w.color, description: w.description },
            upgrades: _preRun ? [..._attuneNodes(w.id), ..._modNodes(w.id)] : getPrimaryUpgrades(w.id).map(u => ({
                id: u.id,
                name: u.name,
                icon: u.icon,
                description: u.description || '',
                cost: u.cost,
                costOverrides: u.costOverrides || null,
                maxStacks: u.maxStacks || 1,
                color: w.color,
                weaponId: w.id,
                tier: u.tier || 1,
                requires: u.requires || null,
            })),
        });
    }
    return groups;
}

function _collectPowerGroups() {
    const groups = [];
    for (const w of Object.values(POWER_WEAPONS)) {
        groups.push({
            parent: { id: w.id, name: w.name, icon: w.icon, color: w.color, description: w.description },
            upgrades: _preRun ? [..._attuneNodes(w.id), ..._modNodes(w.id)] : getPowerUpgrades(w.id).map(u => ({
                id: u.id,
                name: u.name,
                icon: u.icon,
                description: u.description || '',
                cost: u.costOverrides ? u.costOverrides[0] : u.cost,
                costOverrides: u.costOverrides || null,
                maxStacks: u.maxStacks || 1,
                color: w.color,
                weaponId: w.id,
                tier: u.tier || 1,
                requires: u.requires || null,
            })),
        });
    }
    return groups;
}

function _collectDefenseGroups() {
    const groups = [];
    for (const s of Object.values(ABILITIES)) {
        groups.push({
            parent: { id: s.id, name: s.name, icon: s.icon, color: s.color, description: s.description },
            upgrades: _preRun ? _abilityAttuneNodes(s.id) : getAbilityUpgrades(s.id).map(u => ({
                id: u.id,
                name: u.name,
                icon: u.icon,
                description: u.description || '',
                // SP-era costs scaled into gold so the tree displays a
                // meaningful number. See ABILITY_COST_MULT note up top.
                cost: (u.cost || 0) * ABILITY_COST_MULT,
                costOverrides: null,
                maxStacks: u.maxStacks || 1,
                color: s.color,
                abilityId: s.id,
                tier: u.tier || 1,
                requires: u.requires || null,
            })),
        });
    }
    return groups;
}

// 6.x — COMPACT pre-run selector (replaces the bubble tree on the BUILD
// screen). Shows ONLY owned items as a tight list of equip buttons; clicking a
// weapon equips it AND expands its attunements/mods as a dropdown below. Reuses
// the tree's delegated click handler by emitting the same `.shop-node` +
// data-* nodes the bubble tree uses, so equip/attune/unlock/radio logic is
// shared. The bubble tree is preserved (debugState.showBubbleTree toggles it).
function _isBaseKit(category, id) {
    const base = BASE_LOADOUT[category];
    return Array.isArray(base) && base.includes(id);
}

function _renderCompactList(container, groups, player, category) {
    container.replaceChildren();
    const ownedSet = _unlockedSets ? _unlockedSets[category] : null;
    const sel = (_preRunSel && _preRunSel[category]) || [];

    const list = document.createElement('div');
    list.className = 'shop-prerun-list';

    const ownedGroups = groups.filter((g) => !ownedSet || ownedSet.has(g.parent.id));
    if (ownedGroups.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'shop-prerun-empty';
        empty.textContent = category === 'abilities'
            ? 'No abilities yet. Clear Stage 1 for a free pick, or buy more in the Armory.'
            : 'Only your starter is unlocked. Earn gold, then buy more in the Armory.';
        list.appendChild(empty);
        container.appendChild(list);
        return;
    }

    for (const group of ownedGroups) {
        const wid = group.parent.id;
        const equipped = sel.includes(wid);

        const row = document.createElement('div');
        row.className = 'shop-prerun-row' + (equipped ? ' is-equipped' : '');
        row.style.setProperty('--node-accent', group.parent.color || '#8bd');

        // Equip toggle — a `.shop-node--parent` so the tree click handler equips
        // it (≤4 per category). Marked selectable since it's owned.
        const pick = document.createElement('button');
        pick.type = 'button';
        pick.className = 'shop-node shop-node--parent shop-prerun-pick'
            + (equipped ? ' shop-node--equipped' : '');
        pick.dataset.id = wid;
        pick.dataset.category = category;
        pick.dataset.prerunSelectable = '1';
        const nm = document.createElement('span');
        nm.className = 'shop-prerun-name';
        nm.textContent = group.parent.name;
        const badge = document.createElement('span');
        badge.className = 'shop-prerun-badge';
        badge.textContent = equipped ? '✓ EQUIPPED' : 'EQUIP';
        pick.append(nm, badge);
        row.appendChild(pick);

        // Sell (100% refund) — only for purchased, non-base items. Not a
        // `.shop-node`, so the equip handler ignores it; own listener. 8.x:
        // suppressed while everything is unlocked (nothing is "purchased" to sell;
        // weapon buy/sell is retired by the weapons-as-loot rework, T30).
        if (!_isBaseKit(category, wid) && !isAllUnlocked()) {
            const sell = document.createElement('button');
            sell.type = 'button';
            sell.className = 'shop-prerun-sell';
            sell.textContent = `SELL ${unlockCost(category).toLocaleString()}`;
            sell.title = 'Resell for a full refund';
            sell.addEventListener('click', (e) => {
                e.stopPropagation();
                if (_engine && typeof _engine.sellUnlock === 'function') _engine.sellUnlock(category, wid);
            });
            row.appendChild(sell);
        }
        list.appendChild(row);

        // Attunement / mod dropdown — only while equipped. Reuses the bubble
        // tree's `.shop-node[data-kind=...]` nodes so the existing handler
        // toggles/unlocks/radio-sets them.
        if (equipped && Array.isArray(group.upgrades) && group.upgrades.length) {
            const drop = document.createElement('div');
            drop.className = 'shop-prerun-attune';
            for (const up of group.upgrades) {
                const chip = document.createElement('button');
                chip.type = 'button';
                chip.className = 'shop-node shop-prerun-chip';
                chip.dataset.id = up.id;
                chip.dataset.kind = up.kind;
                if (up.weaponId) chip.dataset.weapon = up.weaponId;
                if (up.abilityId) chip.dataset.ability = up.abilityId;

                let owned = false, active = false;
                if (up.kind === 'attunement') {
                    owned = !!(_unlockedAttune && _unlockedAttune.has(up.id));
                    active = (_preRunAttune[up.weaponId] || []).includes(up.id);
                } else if (up.kind === 'mod') {
                    owned = !!(_unlockedMods && _unlockedMods.has(up.id));
                    active = (_preRunMods[up.weaponId] || []).includes(up.id);
                } else if (up.kind === 'abilityAttune') {
                    owned = !!(_unlockedAbilityAttune && _unlockedAbilityAttune.has(up.id));
                    active = _preRunAbilityAttune[up.abilityId] === up.id;
                }
                chip.classList.toggle('is-active', active);
                chip.classList.toggle('is-owned', owned && !active);
                chip.classList.toggle('is-locked', !owned);
                if (up.element && ELEMENTS[up.element]) chip.style.setProperty('--chip-accent', ELEMENTS[up.element].color || '#8bd');
                chip.textContent = owned ? up.name : `${up.name} · ${unlockCost(up.kind === 'mod' ? 'mods' : up.kind === 'abilityAttune' ? 'abilityAttunements' : 'attunements').toLocaleString()}`;
                drop.appendChild(chip);
            }
            list.appendChild(drop);
        }
    }

    // ── "Unlock more" store — collapsed by default so the screen stays an
    // owned-only loadout list. Expanding shows LOCKED items to buy with
    // account-gold (clicking a locked parent routes to the unlock handler).
    const lockedGroups = ownedSet ? groups.filter((g) => !ownedSet.has(g.parent.id)) : [];
    if (lockedGroups.length) {
        const toggle = document.createElement('button');
        toggle.type = 'button';
        toggle.className = 'shop-prerun-store-toggle';
        const open = !!_prerunStoreOpen[category];
        toggle.textContent = open
            ? `− Hide store`
            : `＋ Unlock more (${lockedGroups.length}) · ${unlockCost(category).toLocaleString()} ea`;
        toggle.addEventListener('click', (e) => {
            e.stopPropagation();
            _prerunStoreOpen[category] = !_prerunStoreOpen[category];
            renderShopDom();
        });
        list.appendChild(toggle);

        if (open) {
            const store = document.createElement('div');
            store.className = 'shop-prerun-store';
            for (const group of lockedGroups) {
                const buy = document.createElement('button');
                buy.type = 'button';
                // Locked parent: NO data-prerun-selectable → the tree handler
                // routes the click to unlockPreRunItem (buy + auto-equip).
                buy.className = 'shop-node shop-node--parent shop-prerun-pick shop-prerun-pick--locked';
                buy.dataset.id = group.parent.id;
                buy.dataset.category = category;
                buy.style.setProperty('--node-accent', group.parent.color || '#8bd');
                const nm = document.createElement('span');
                nm.className = 'shop-prerun-name';
                nm.textContent = group.parent.name;
                const badge = document.createElement('span');
                badge.className = 'shop-prerun-badge';
                badge.textContent = `UNLOCK ${unlockCost(category).toLocaleString()}`;
                buy.append(nm, badge);
                store.appendChild(buy);
            }
            list.appendChild(store);
        }
    }

    container.appendChild(list);
}

// Weapon-style cluster: parent + orbiting upgrades. One subgroup per
// weapon, separated by a thin divider.
function _renderWeaponCluster(container, groups, player, category) {
    if (!container) return;
    // 6.x — Pre-run uses the compact list selector by default; the bubble tree
    // is preserved and shown only when the debug "Show bubble tree" toggle is on.
    if (_preRun && !debugState.showBubbleTree) {
        _renderCompactList(container, groups, player, category);
        return;
    }
    container.replaceChildren();

    for (const group of groups) {
        const sub = document.createElement('div');
        sub.className = 'shop-tree-subgroup';
        sub.style.setProperty('--node-accent', group.parent.color);

        // Inner ring: parent node centered, upgrades orbit it.
        const ring = document.createElement('div');
        ring.className = 'shop-tree-ring';

        // Parent node (centered). In-run: not buyable. Pre-run: equip toggle.
        ring.appendChild(_buildParentNode(group.parent, category));

        // Orbit upgrade nodes around the parent. The radius grows with the
        // node count so the BUILD ring (attunements + mods) doesn't crowd.
        const N = group.upgrades.length;
        const RADIUS = N <= 4 ? 110 : (N <= 6 ? 130 : (N <= 9 ? 152 : 178));
        // 6.225.3 — size the ring box to THIS orbit's radius so the empty
        // padding around every cluster is constant. With a fixed 400px box,
        // small rings (few bubbles) left a big void above/below while large
        // rings nearly touched — making the vertical gap between consecutive
        // weapons/abilities look uneven. CSS reads `--orbit-radius` to derive
        // the box height, so the column now has a uniform gap throughout.
        ring.style.setProperty('--orbit-radius', `${RADIUS}px`);
        for (let i = 0; i < N; i++) {
            const upg = group.upgrades[i];
            // Distribute around the circle starting at the top (-90°).
            const angleDeg = -90 + (360 * i) / N;
            const angleRad = (angleDeg * Math.PI) / 180;
            const tx = Math.cos(angleRad) * RADIUS;
            const ty = Math.sin(angleRad) * RADIUS;
            const node = (upg.kind === 'attunement') ? _buildAttunementNode(upg)
                : (upg.kind === 'mod') ? _buildModNode(upg)
                : (upg.kind === 'abilityAttune') ? _buildAbilityAttuneNode(upg)
                : _buildUpgradeNode(upg, player);
            node.style.transform = `translate(-50%, -50%) translate(${tx}px, ${ty}px)`;
            ring.appendChild(node);
        }
        sub.appendChild(ring);
        container.appendChild(sub);
    }
}

// 6.30.0 — READ-ONLY passive cluster. Passives are gained only from
// wave-clear cards, so these nodes are not buyable — they just show
// the player's collected passives (lit + stack badge) vs the ones
// they haven't picked yet (dimmed). Hover shows name + effect + stacks.
function _renderPassiveCluster(container, player) {
    if (!container) return;
    container.replaceChildren();

    const grid = document.createElement('div');
    grid.className = 'shop-tree-passive-grid';

    for (const upg of getStats({ includeHidden: false })) {
        grid.appendChild(_buildPassiveDisplayNode(upg, player));
    }
    container.appendChild(grid);
}

function _buildPassiveDisplayNode(upg, player) {
    const stacks = (player.getPowerupStacks && typeof player.getPowerupStacks === 'function')
        ? player.getPowerupStacks(upg.id) : 0;
    const maxStacks = upg.maxStacks || 1;
    const owned = stacks > 0;
    const maxed = stacks >= maxStacks;

    // Non-button div so it reads as a display, not a buy target.
    const node = document.createElement('div');
    node.className = 'shop-node shop-node--upgrade shop-node--passive';
    node.dataset.id = upg.id;
    node.dataset.buyable = '0'; // never purchasable — reward-only
    const state = maxed ? 'maxed' : (owned ? 'owned' : 'unaffordable');
    node.dataset.state = state;
    node.classList.add(`shop-node--${state}`);
    if (upg.color) node.style.setProperty('--node-color', upg.color);

    node.dataset.tooltipKind = 'upgrade';
    node.dataset.tooltipName = upg.name;
    node.dataset.tooltipDesc = upg.description || '';
    node.dataset.tooltipStacks = `${stacks}/${maxStacks}`;
    node.dataset.tooltipState = owned ? 'owned' : 'reward';
    // No cost — passives aren't bought. Mark so the tooltip can show
    // "WAVE REWARD" instead of a price.
    node.dataset.tooltipReward = '1';

    const icon = document.createElement('span');
    icon.className = 'shop-node-icon';
    icon.innerHTML = renderIconHTML(upg.icon, { size: 26, fallback: '?' });
    node.appendChild(icon);

    if (owned) {
        const badge = document.createElement('span');
        badge.className = 'shop-node-badge';
        badge.textContent = `${stacks}/${maxStacks}`;
        node.appendChild(badge);
    }

    return node;
}

// P4 — rule-modifier PASSIVES cluster (BUILD-only, equippable). Slot-deliverable
// passives shown as bubbles: chosen = lit + slot badge; owned-not-chosen = gold
// (click to equip); locked = grey (click to unlock with account-gold). Caps at
// maxSlots(stages) + the keystone budget (≤2), enforced in _togglePassive.
function _renderRulePassiveCluster(container) {
    if (!container) return;
    container.replaceChildren();

    const maxSlots = _passiveMaxSlots();
    const keystones = _preRunPassives.filter((p) => _isKeystonePassive(p)).length;

    const head = document.createElement('div');
    head.className = 'armory-section-title';
    head.textContent = `PASSIVES · ${_preRunPassives.length}/${maxSlots} chosen · ${keystones}/2 keystones`;
    container.appendChild(head);

    const sub = document.createElement('div');
    sub.className = 'shop-prerun-hint';
    sub.style.display = '';
    sub.textContent = 'Rule-changing relics — click to equip (★ = build-defining keystone, max 2; the rest stack safely). More slots open as you clear stages. Locked = unlock with account Rainshards (R$).';
    container.appendChild(sub);

    const grid = document.createElement('div');
    grid.className = 'shop-tree-passive-grid';
    for (const p of getSlotPassives()) {
        grid.appendChild(_buildRulePassiveNode(p));
    }
    container.appendChild(grid);
}

function _buildRulePassiveNode(p) {
    const owned = !!(_unlockedPassives && _unlockedPassives.has(p.id));
    const chosenAt = _preRunPassives.indexOf(p.id);
    const chosen = chosenAt !== -1;
    const keystone = _isKeystonePassive(p.id);

    const node = document.createElement('div');
    node.className = 'shop-node shop-node--upgrade shop-node--passive';
    if (keystone) node.classList.add('shop-node--keystone');
    node.dataset.id = p.id;
    node.dataset.kind = 'rulePassive';

    const state = chosen ? 'owned' : (owned ? 'affordable' : 'unaffordable');
    node.dataset.state = state;
    node.classList.add(`shop-node--${state}`);

    node.dataset.tooltipKind = 'upgrade';
    node.dataset.tooltipName = `${p.name}${keystone ? ' ★' : ''}`;
    node.dataset.tooltipDesc = (p.desc || '') + (p.downside ? `  ↯ ${p.downside}` : '');
    node.dataset.tooltipState = chosen ? `EQUIPPED · slot ${chosenAt + 1}`
        : (owned ? 'Click to equip' : `LOCKED · ${unlockCost('passives')} ⬢`);

    const icon = document.createElement('span');
    icon.className = 'shop-node-icon';
    // 6.158.3 — each passive carries a themed icon slug (passive-data.js);
    // fall back to a star (keystone) / disc (modular) if one is ever missing.
    icon.innerHTML = renderIconHTML(p.icon || (keystone ? 'star' : 'circle-fill'), { size: 24, fallback: keystone ? '★' : '●' });
    node.appendChild(icon);

    if (chosen) {
        const badge = document.createElement('span');
        badge.className = 'shop-node-badge';
        badge.textContent = `${chosenAt + 1}`;
        node.appendChild(badge);
    }
    return node;
}

// ── Node builders ──────────────────────────────────────────────────

// W5 — pre-run attunement orbit node. States reuse the shared node classes:
// active (owned) = lit blue + ✓; owned-not-active = gold (click to activate);
// locked = grey + unlock cost. Click handling lives in the tree click listener.
function _buildAttunementNode(att) {
    const node = document.createElement('div');
    node.className = 'shop-node shop-node--upgrade shop-node--attune';
    node.dataset.id = att.id;
    node.dataset.kind = 'attunement';
    node.dataset.weapon = att.weaponId;
    const elColor = (ELEMENTS[att.element] && ELEMENTS[att.element].color) || null;
    if (elColor) node.style.setProperty('--node-color', elColor);

    const owned = !!(_unlockedAttune && _unlockedAttune.has(att.id));
    const active = (_preRunAttune[att.weaponId] || []).includes(att.id);
    const state = active ? 'owned' : (owned ? 'affordable' : 'unaffordable');
    node.dataset.state = state;
    node.classList.add(`shop-node--${state}`);

    node.dataset.tooltipKind = 'upgrade';
    node.dataset.tooltipName = `${att.name} · ${att.element}`;
    node.dataset.tooltipDesc = att.description || '';
    node.dataset.tooltipState = active ? 'ACTIVE'
        : (owned ? 'Click to activate' : `LOCKED · ${att.cost} ⬢`);

    const icon = document.createElement('span');
    icon.className = 'shop-node-icon';
    icon.innerHTML = renderIconHTML(att.icon, { size: 24, fallback: '?' });
    node.appendChild(icon);

    if (active) {
        const badge = document.createElement('span');
        badge.className = 'shop-node-badge';
        badge.textContent = '✓';
        node.appendChild(badge);
    }
    return node;
}

// W5 — pre-run mechanic-mod orbit node. Same state model as attunements
// (active = lit + ✓, owned = available, locked = grey + cost) but uses the
// mod's own icon + a neutral accent. Click handling lives in the tree listener.
function _buildModNode(mod) {
    const node = document.createElement('div');
    node.className = 'shop-node shop-node--upgrade shop-node--mod';
    node.dataset.id = mod.id;
    node.dataset.kind = 'mod';
    node.dataset.weapon = mod.weaponId;
    node.style.setProperty('--node-color', '#cfd8e6'); // neutral (element-agnostic)

    const owned = !!(_unlockedMods && _unlockedMods.has(mod.id));
    const active = (_preRunMods[mod.weaponId] || []).includes(mod.id);
    const state = active ? 'owned' : (owned ? 'affordable' : 'unaffordable');
    node.dataset.state = state;
    node.classList.add(`shop-node--${state}`);

    node.dataset.tooltipKind = 'upgrade';
    node.dataset.tooltipName = mod.name;
    node.dataset.tooltipDesc = mod.description || '';
    node.dataset.tooltipState = active ? 'ACTIVE'
        : (owned ? 'Click to activate' : `LOCKED · ${mod.cost} ⬢`);

    const icon = document.createElement('span');
    icon.className = 'shop-node-icon';
    icon.innerHTML = renderIconHTML(mod.icon, { size: 24, fallback: '?' });
    node.appendChild(icon);

    if (active) {
        const badge = document.createElement('span');
        badge.className = 'shop-node-badge';
        badge.textContent = '✓';
        node.appendChild(badge);
    }
    return node;
}

// W6 — pre-run ability-attunement node (one element per ability, RADIO).
// element-colored; active when it's the one chosen for its ability.
function _buildAbilityAttuneNode(att) {
    const node = document.createElement('div');
    node.className = 'shop-node shop-node--upgrade shop-node--attune';
    node.dataset.id = att.id;
    node.dataset.kind = 'abilityAttune';
    node.dataset.ability = att.abilityId;
    const elColor = (ELEMENTS[att.element] && ELEMENTS[att.element].color) || null;
    if (elColor) node.style.setProperty('--node-color', elColor);

    const owned = !!(_unlockedAbilityAttune && _unlockedAbilityAttune.has(att.id));
    const active = _preRunAbilityAttune[att.abilityId] === att.id;
    const state = active ? 'owned' : (owned ? 'affordable' : 'unaffordable');
    node.dataset.state = state;
    node.classList.add(`shop-node--${state}`);

    node.dataset.tooltipKind = 'upgrade';
    node.dataset.tooltipName = `${att.name} · ${att.element}`;
    node.dataset.tooltipDesc = att.description || '';
    node.dataset.tooltipState = active ? 'ACTIVE'
        : (owned ? 'Click to set (one per ability)' : `LOCKED · ${att.cost} ⬢`);

    const icon = document.createElement('span');
    icon.className = 'shop-node-icon';
    icon.innerHTML = renderIconHTML(att.icon, { size: 24, fallback: '?' });
    node.appendChild(icon);

    if (active) {
        const badge = document.createElement('span');
        badge.className = 'shop-node-badge';
        badge.textContent = '✓';
        node.appendChild(badge);
    }
    return node;
}

function _buildParentNode(parent, category) {
    const node = document.createElement('div');
    node.className = 'shop-node shop-node--parent';
    node.dataset.id = parent.id;
    node.dataset.buyable = '0';
    node.style.setProperty('--node-color', parent.color);
    node.dataset.tooltipKind = 'parent';
    node.dataset.tooltipName = parent.name;
    node.dataset.tooltipDesc = parent.description || '';

    // Pre-run BUILD: the parent node is the EQUIP toggle. Reuse the existing
    // node state classes for visuals — owned (blue) = equipped, affordable
    // (gold) = available to equip, unaffordable (grey) = locked (unlock it
    // in the Armory / future attunement store).
    let equipped = false;
    if (_preRun && category) {
        const unlocked = _unlockedSets && _unlockedSets[category];
        const isUnlocked = unlocked ? unlocked.has(parent.id) : true;
        equipped = (_preRunSel[category] || []).includes(parent.id);
        node.dataset.category = category;
        node.dataset.prerunSelectable = isUnlocked ? '1' : '0';
        const state = equipped ? 'owned' : (isUnlocked ? 'affordable' : 'unaffordable');
        node.dataset.state = state;
        node.classList.add(`shop-node--${state}`);
        if (!isUnlocked) node.classList.add('shop-node--locked');
        node.dataset.tooltipState = equipped
            ? 'EQUIPPED'
            : (isUnlocked ? 'Click to equip' : `LOCKED · ${unlockCost(category)} ⬢`);
    }

    const icon = document.createElement('div');
    icon.className = 'shop-node-icon';
    icon.innerHTML = renderIconHTML(parent.icon, { size: 30, fallback: '?' });
    node.appendChild(icon);

    // Pre-run: a ✓ badge marks equipped weapons/abilities.
    if (equipped) {
        const badge = document.createElement('span');
        badge.className = 'shop-node-badge';
        badge.textContent = '✓';
        node.appendChild(badge);
    }

    // 6.28.0 — Weapon name removed (many didn't fit under the node).
    // Name + description show in the hover tooltip (dataset above).
    return node;
}

function _buildUpgradeNode(upg, player) {
    const currentStacks = (player.getPowerupStacks && typeof player.getPowerupStacks === 'function')
        ? player.getPowerupStacks(upg.id) : 0;
    const maxStacks = upg.maxStacks || 1;
    const isMaxed = currentStacks >= maxStacks;
    const isOwned = currentStacks > 0;

    // Stack-aware cost (mirrors actualCostFor in the old shop).
    let cost = upg.cost;
    if (upg.costOverrides) {
        cost = upg.costOverrides[Math.min(currentStacks, upg.costOverrides.length - 1)] || cost;
    }

    // At-cost sell refund — the price of the LAST stack owned. Mirrors
    // sellShopItem in shop-manager.js (both read costOverrides) so the
    // displayed refund matches the gold actually returned; selling one
    // trait to buy another nets zero.
    let refund = 0;
    if (isOwned) {
        refund = upg.costOverrides
            ? (upg.costOverrides[Math.min(currentStacks - 1, upg.costOverrides.length - 1)] || upg.cost)
            : upg.cost;
    }

    const money = (_engine && _engine.game && _engine.game.money) || 0;
    const canAfford = !isMaxed && money >= cost;

    // Gate check — capstones require a prerequisite stack count. Until
    // satisfied we render the node but treat it as locked (state == locked).
    let locked = false;
    if (upg.requires) {
        const reqStacks = (player.getPowerupStacks && typeof player.getPowerupStacks === 'function')
            ? player.getPowerupStacks(upg.requires.id) : 0;
        if (reqStacks < (upg.requires.stacks || 1)) locked = true;
    }

    const node = document.createElement('button');
    node.type = 'button';
    node.className = 'shop-node shop-node--upgrade';
    node.dataset.id = upg.id;
    node.dataset.buyable = (isMaxed || locked) ? '0' : '1';

    // State class — drives border color, dim, badge tone.
    let state;
    if (locked)          state = 'locked';
    else if (isMaxed)    state = 'maxed';
    else if (isOwned)    state = 'owned';
    else if (canAfford)  state = 'affordable';
    else                 state = 'unaffordable';
    node.dataset.state = state;
    node.classList.add(`shop-node--${state}`);

    if (upg.color) node.style.setProperty('--node-color', upg.color);
    if (isMaxed || locked) node.disabled = true;

    // Tooltip payload — stashed on dataset so pointerover can read it
    // without rebuilding lookups.
    node.dataset.tooltipKind = 'upgrade';
    node.dataset.tooltipName = upg.name;
    node.dataset.tooltipDesc = upg.description || '';
    node.dataset.tooltipCost = String(cost);
    node.dataset.tooltipStacks = `${currentStacks}/${maxStacks}`;
    node.dataset.tooltipState = state;
    // Owned nodes can be sold back at-cost via right-click (see the
    // contextmenu handler in initShopDom). Stash the refund for the tooltip.
    if (isOwned) {
        node.dataset.sellable = '1';
        node.dataset.tooltipRefund = String(refund);
    }
    if (locked && upg.requires) {
        node.dataset.tooltipLock = `Locked — needs ${upg.requires.id} ×${upg.requires.stacks || 1}`;
    }

    // Capstone (tier 2) rosette ring.
    if (upg.tier === 2) node.classList.add('shop-node--capstone');

    // Inner content — icon only, centered in the circle. 6.27.0 — the
    // per-node cost label was removed; cost is now hover-only (tooltip).
    // Affordability/maxed/locked state is conveyed by the border color
    // (see .shop-node--<state>) and the stack badge.
    const icon = document.createElement('span');
    icon.className = 'shop-node-icon';
    icon.innerHTML = renderIconHTML(upg.icon, { size: 26, fallback: '?' });
    node.appendChild(icon);

    // Stack badge (only if owned or maxed).
    if (isOwned) {
        const badge = document.createElement('span');
        badge.className = 'shop-node-badge';
        badge.textContent = `${currentStacks}/${maxStacks}`;
        node.appendChild(badge);
    }

    // 6.28.0 — Upgrade name removed from under the node; it's hover-only
    // now (tooltip carries name + description + cost + stacks).
    return node;
}

// ── Tooltip ────────────────────────────────────────────────────────

function _showTooltip(node, e) {
    if (!_elements.tooltip) return;
    const tip = _elements.tooltip;
    tip.replaceChildren();

    const kind = node.dataset.tooltipKind;
    const name = node.dataset.tooltipName || '';
    const desc = node.dataset.tooltipDesc || '';

    const nameEl = document.createElement('div');
    nameEl.className = 'shop-tree-tooltip-name';
    nameEl.textContent = name;
    tip.appendChild(nameEl);

    if (desc) {
        const descEl = document.createElement('div');
        descEl.className = 'shop-tree-tooltip-desc';
        descEl.textContent = desc;
        tip.appendChild(descEl);
    }

    if (kind === 'upgrade') {
        const stacks = node.dataset.tooltipStacks || '';
        const cost = node.dataset.tooltipCost || '';
        const state = node.dataset.tooltipState || '';
        const lock = node.dataset.tooltipLock || '';

        if (lock) {
            const lockEl = document.createElement('div');
            lockEl.className = 'shop-tree-tooltip-lock';
            lockEl.textContent = lock;
            tip.appendChild(lockEl);
        }

        const metaEl = document.createElement('div');
        metaEl.className = 'shop-tree-tooltip-meta';
        metaEl.appendChild(_makeMeta('STACK', stacks));
        // 6.30.0 — Passive display nodes aren't bought; show how they're
        // acquired instead of a price.
        if (node.dataset.tooltipReward === '1') {
            metaEl.appendChild(_makeMeta('FROM', 'WAVE REWARD'));
        } else if (state === 'maxed') {
            metaEl.appendChild(_makeMeta('COST', 'MAX'));
        } else {
            metaEl.appendChild(_makeMeta('COST', cost));
        }
        // Owned upgrades can be sold back at-cost via right-click.
        if (node.dataset.sellable === '1') {
            metaEl.appendChild(_makeMeta('SELL', node.dataset.tooltipRefund || ''));
        }
        tip.appendChild(metaEl);

        if (node.dataset.sellable === '1') {
            const sellHint = document.createElement('div');
            sellHint.className = 'shop-tree-tooltip-sellhint';
            sellHint.textContent = 'Right-click to sell (at-cost)';
            tip.appendChild(sellHint);
        }
    }

    tip.style.display = 'block';
    _positionTooltip(e);
}

function _makeMeta(label, value) {
    const wrap = document.createElement('span');
    wrap.className = 'shop-tree-tooltip-meta-cell';
    const lbl = document.createElement('span');
    lbl.className = 'shop-tree-tooltip-meta-label';
    lbl.textContent = label;
    wrap.appendChild(lbl);
    const val = document.createElement('span');
    val.className = 'shop-tree-tooltip-meta-value';
    val.textContent = value;
    wrap.appendChild(val);
    return wrap;
}

function _positionTooltip(e) {
    if (!_elements.tooltip) return;
    const tip = _elements.tooltip;
    const pad = 14;
    // Place to the right of the cursor by default; flip left if it
    // would overflow the viewport.
    const tipW = tip.offsetWidth || 260;
    const tipH = tip.offsetHeight || 100;
    let x = e.clientX + pad;
    let y = e.clientY + pad;
    if (x + tipW + pad > window.innerWidth)  x = e.clientX - tipW - pad;
    if (y + tipH + pad > window.innerHeight) y = window.innerHeight - tipH - pad;
    if (x < pad) x = pad;
    if (y < pad) y = pad;
    tip.style.left = `${x}px`;
    tip.style.top  = `${y}px`;
}

function _hideTooltip() {
    if (_elements?.tooltip) _elements.tooltip.style.display = 'none';
}

// ── Coin SVG helper ────────────────────────────────────────────────

function makeCoinIconSvg(size) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 60 60');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.setAttribute('class', 'shop-coin-icon');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', COIN_SVG_PATH);
    path.setAttribute('fill', '#FFD700');
    path.setAttribute('stroke', '#B8860B');
    path.setAttribute('stroke-width', '1.5');
    svg.appendChild(path);
    return svg;
}
