// Main game engine and state management
import { GAME_CONFIG, GAME_STATES } from './core/constants.js';
import { random, generateStarPositions, drawMoneyIcon, drawHeartIcon, drawCachedShieldIcon, drawCachedMoneyIcon, drawCachedHeartIcon, glowSpriteCache } from './core/utils.js';
import { rgba } from './core/color-cache.js';
import { depthBatchRenderer } from './performance/depth-batch-renderer.js';
import { nebulaRenderer } from './performance/nebula-renderer.js';
import { SpatialGrid } from './performance/spatial-grid.js';
import { PoolManager } from './core/pool-manager.js';
import { frameClock } from './core/frame-clock.js';
import { Player } from './player/player.js';
import { Bullet } from './player/bullet.js';
import { Asteroid } from './world/asteroid.js';
import { Enemy } from './enemy/enemy.js';
import { EnemyBullet } from './enemy/enemy-bullet.js';
import { FormationManager } from './enemy/formations.js';
import { Particle, drawParticlesBatched } from './world/particle.js';
import { WebGLParticleRenderer } from './performance/webgl-particle-renderer.js';
import { WebGLStarfieldRenderer } from './performance/webgl-starfield-renderer.js';
import { WebGLBulletRenderer } from './performance/webgl-bullet-renderer.js';
import { STAR_SLOT_INDEX, WEBGL_STAR_SHAPES } from './performance/webgl-starfield-atlas.js';
import { ColorStar } from './world/color-star.js';
import { GoldCoin } from './world/gold-coin.js';
import { GoldShape } from './world/gold-shape.js';
import { StatPickup } from './world/stat-pickup.js';
import { BackgroundStar } from './world/background-star.js';
import { LineDebris } from './world/line-debris.js';
import { AsteroidShard } from './world/asteroid-shard.js';
import { Powerup, POWERUP_TYPES } from './world/powerup.js';
import { DEFENSE_SKILLS, PRIMARY_WEAPONS, POWER_WEAPONS } from './combat/weapon-data.js';
import { GameStateMachine } from './core/game-state.js';
import { EventBus } from './core/event-bus.js';
import { GameTimer } from './core/game-timer.js';
import * as hudStatus from './hud/status.js';
import * as hudCombat from './hud/combat.js';
import * as hudStatusIcons from './hud/status-icons.js';
import * as hudNav from './hud/navigation.js';
import * as hudOverlays from './hud/overlays.js';
import * as hudCursor from './hud/cursor.js';
// 5.95.1 — Mobile touch-position reticle (replaces the desktop laser-
// pointer aim trace on mobile / fruit-ninja mode).
import * as hudMobileReticle from './hud/mobile-reticle.js';
// 5.79.60 — `shop-renderer.js` import removed. The legacy canvas-
//   based shop renderer was superseded by the HTML overlay
//   (shop-dom.js); the file now has no live importers. Left on disk
//   for now in case someone wants to revive a canvas-mode shop later.
import * as shopDom from './shop/shop-dom.js';
import * as cam from './world/camera-manager.js';
import { recordVFXFrame } from './debug/vfx-telemetry.js';
import * as shop from './shop/shop-manager.js';
import * as wave from './wave/wave-manager.js';
import * as col from './combat/collision-system.js';
import * as combat from './combat/combat-manager.js';
import * as lifecycle from './player/lifecycle.js';
import * as weaponFx from './combat/weapon-effects-renderer.js';
import * as events from './ui/event-setup.js';
import { showHint, updateHintDimming } from './ui/hint-system.js';
import { RadialMenu } from './ui/radial-menu.js';
import { MobileTouchHandler } from './ui/mobile-touch.js';
import { isMobile, isPortrait } from './platform/platform-detect.js';
import { hasSave, loadSave, writeSave, clearSave } from './core/storage.js';
import { StatsOverlay } from './ui/stats-overlay.js';
import { AnalogStick } from './ui/analog-stick.js';

// 5.100.0 — localStorage key for the analog-stick side preference.
const STICK_SIDE_STORAGE_KEY = 'rainboids:mobile-stick-side';

export const PLAYER_STATES = {
    NORMAL: 'normal'
};


/* ─── Health-shape 3D geometry (5.88.5) ─────────────────────────────────────
 *
 * Per shape: unit-radius vertex coordinates, a flat edge list, and a face
 * list (each face's vertex indices in CCW order viewed from outside, so
 * `cross(b−a, c−a).z > 0` in canvas space → back-facing). Each edge stores
 * its endpoint indices PLUS its two adjacent face indices so the renderer
 * can cull edges whose both faces are back-facing.
 *
 * Cube/octahedron/tetrahedron use unit-sphere coordinates so the projected
 * silhouette fits inside the orb's `radius`. Prism is taller than wide on
 * purpose (the existing prism look from 5.79.62).
 */
const _CUBE_S = 1 / Math.sqrt(3); // ≈ 0.577 — fits the 8 cube vertices in a unit sphere
const HEALTH_SHAPE_GEOMETRY = (() => {
    // Cube
    const cubeVerts = [
        [-_CUBE_S, -_CUBE_S, -_CUBE_S], [ _CUBE_S, -_CUBE_S, -_CUBE_S],
        [ _CUBE_S,  _CUBE_S, -_CUBE_S], [-_CUBE_S,  _CUBE_S, -_CUBE_S],
        [-_CUBE_S, -_CUBE_S,  _CUBE_S], [ _CUBE_S, -_CUBE_S,  _CUBE_S],
        [ _CUBE_S,  _CUBE_S,  _CUBE_S], [-_CUBE_S,  _CUBE_S,  _CUBE_S],
    ];
    // Faces: indices CCW when viewed from outside the cube
    //   0:back  1:front  2:bottom  3:top  4:left  5:right
    const cubeFaces = [
        [0, 3, 2, 1], // back  (z = -s, viewed from -z)
        [4, 5, 6, 7], // front (z = +s, viewed from +z)
        [0, 1, 5, 4], // bottom (y = -s)
        [3, 7, 6, 2], // top (y = +s)
        [0, 4, 7, 3], // left (x = -s)
        [1, 2, 6, 5], // right (x = +s)
    ];
    const cubeEdges = [
        // [vA, vB, faceA, faceB]
        [0, 1, 0, 2], [1, 2, 0, 5], [2, 3, 0, 3], [3, 0, 0, 4], // back face quad
        [4, 5, 1, 2], [5, 6, 1, 5], [6, 7, 1, 3], [7, 4, 1, 4], // front face quad
        [0, 4, 2, 4], [1, 5, 2, 5], [2, 6, 3, 5], [3, 7, 3, 4], // connecting
    ];

    // Octahedron — 6 verts on the unit axes, 8 triangular faces.
    //   v0=+x v1=-x v2=+y v3=-y v4=+z v5=-z
    const octVerts = [
        [ 1,  0,  0], [-1,  0,  0],
        [ 0,  1,  0], [ 0, -1,  0],
        [ 0,  0,  1], [ 0,  0, -1],
    ];
    // 8 faces, each a triangle, CCW from outside
    const octFaces = [
        [0, 2, 4], // +x +y +z
        [2, 1, 4], // -x +y +z
        [1, 3, 4], // -x -y +z
        [3, 0, 4], // +x -y +z
        [0, 5, 2], // +x +y -z
        [2, 5, 1], // -x +y -z
        [1, 5, 3], // -x -y -z
        [3, 5, 0], // +x -y -z
    ];
    const octEdges = [
        [0, 2, 0, 4], [2, 4, 0, 1], [4, 0, 0, 3], // top-right cap
        [2, 1, 1, 5], [1, 4, 1, 2],                // top-left cap
        [1, 3, 2, 6], [3, 4, 2, 3],                // bottom-left cap
        [3, 0, 3, 7],                              // bottom-right cap
        [0, 5, 4, 7], [5, 2, 4, 5],                // -z hemisphere upper
        [5, 1, 5, 6], [5, 3, 6, 7],                // -z hemisphere lower
    ];

    // Tetrahedron — 4 verts on alternate cube corners (regular tet).
    const tetVerts = [
        [ _CUBE_S,  _CUBE_S,  _CUBE_S],
        [ _CUBE_S, -_CUBE_S, -_CUBE_S],
        [-_CUBE_S,  _CUBE_S, -_CUBE_S],
        [-_CUBE_S, -_CUBE_S,  _CUBE_S],
    ];
    // 4 faces; CCW from outside
    const tetFaces = [
        [0, 1, 2], // face opposite v3
        [0, 3, 1], // face opposite v2
        [0, 2, 3], // face opposite v1
        [1, 3, 2], // face opposite v0
    ];
    const tetEdges = [
        [0, 1, 0, 1], [0, 2, 0, 2], [0, 3, 1, 2],
        [1, 2, 0, 3], [1, 3, 1, 3], [2, 3, 2, 3],
    ];

    // 5.121.0 — Triangular prism geometry retired (never used; pool
    // doesn't need an elongated "battery" silhouette alongside the
    // four platonic-style solids).

    // 5.116.0 — Stellated octahedron was added here as a "3D star".
    // 5.120.0 — Retired. Even after the 5.119.0 vertex-parity fix
    // produced a correct stella (two interpenetrating tetrahedra),
    // the painter's-algorithm renderer drew it as a rotating cube
    // with star-shaped face cuts rather than the clean outward
    // 8-point silhouette the design wanted. The pool now keeps only
    // platonic-style solids that read cleanly under the current
    // renderer: tetrahedron (pyramid) + dodecahedron.

    // 5.116.0 — Regular dodecahedron. 20 vertices, 30 edges, 12
    // pentagonal faces. Vertex layout uses golden ratio coordinates
    // (Cartesian form of regular dodecahedron) scaled to fit the
    // unit cube radius.
    const PHI = (1 + Math.sqrt(5)) / 2;        // golden ratio
    const INV_PHI = 1 / PHI;
    const _DODECA_S = 0.6;                     // overall scale
    const dodecaVerts = [
        // 8 cube corners (±1, ±1, ±1)
        [ 1,  1,  1], [ 1,  1, -1], [ 1, -1,  1], [ 1, -1, -1],
        [-1,  1,  1], [-1,  1, -1], [-1, -1,  1], [-1, -1, -1],
        // 12 "golden" verts: (0, ±1/φ, ±φ) · (±1/φ, ±φ, 0) · (±φ, 0, ±1/φ)
        [0,  INV_PHI,  PHI], [0,  INV_PHI, -PHI], [0, -INV_PHI,  PHI], [0, -INV_PHI, -PHI], // 8..11
        [ INV_PHI,  PHI, 0], [ INV_PHI, -PHI, 0], [-INV_PHI,  PHI, 0], [-INV_PHI, -PHI, 0], // 12..15
        [ PHI, 0,  INV_PHI], [ PHI, 0, -INV_PHI], [-PHI, 0,  INV_PHI], [-PHI, 0, -INV_PHI], // 16..19
    ].map(([x, y, z]) => [x * _DODECA_S, y * _DODECA_S, z * _DODECA_S]);

    // 12 pentagonal faces, CCW from outside. Standard dodecahedron
    // face indexing tied to the vertex layout above.
    const dodecaFaces = [
        [ 0, 16, 17,  1, 12], // top-right-front
        [ 0, 12, 14,  4,  8], // top-front
        [ 0,  8, 10,  2, 16], // front-right
        [ 1, 17,  3, 11,  9], // right-back
        [ 1,  9,  5, 14, 12], // top-back-right
        [ 2, 10,  6, 15, 13], // front-bottom
        [ 2, 13,  3, 17, 16], // bottom-right
        [ 3, 13, 15,  7, 11], // bottom-back-right
        [ 4, 14,  5, 19, 18], // top-back-left
        [ 4, 18,  6, 10,  8], // front-left
        [ 5,  9, 11,  7, 19], // back-left
        [ 6, 18, 19,  7, 15], // bottom-back-left
    ];
    // 30 edges, each [vA, vB, faceA, faceB]. Auto-derive: walk each
    // pentagon's 5 edges and dedupe with a map keyed on min-max
    // vertex pair. Each edge in a closed polyhedron borders exactly
    // 2 faces — the second time we see an edge, we fill in faceB.
    const _edgeMap = new Map();
    for (let f = 0; f < dodecaFaces.length; f++) {
        const face = dodecaFaces[f];
        for (let k = 0; k < face.length; k++) {
            const a = face[k];
            const b = face[(k + 1) % face.length];
            const key = a < b ? `${a}_${b}` : `${b}_${a}`;
            const existing = _edgeMap.get(key);
            if (!existing) {
                _edgeMap.set(key, [Math.min(a, b), Math.max(a, b), f, -1]);
            } else {
                existing[3] = f;
            }
        }
    }
    const dodecaEdges = Array.from(_edgeMap.values()).map(e => {
        // Replace any unfilled face slot with the same face so
        // front-facing test always works (degenerate but safe).
        if (e[3] === -1) e[3] = e[2];
        return e;
    });

    return {
        cube:         { verts: cubeVerts,    edges: cubeEdges,   faces: cubeFaces   },
        octahedron:   { verts: octVerts,     edges: octEdges,    faces: octFaces    },
        tetrahedron:  { verts: tetVerts,     edges: tetEdges,    faces: tetFaces    },
        dodecahedron: { verts: dodecaVerts,  edges: dodecaEdges, faces: dodecaFaces },
    };
})();

// Scratch buffers shared across all health-shape draws (reused per frame
// so the GC doesn't see thousands of one-off allocations).
const HEALTH_SHAPE_PROJ_BUF = []; // each slot: [x, y, z]
const HEALTH_SHAPE_HULL_BUF = []; // hull vertex indices
const HEALTH_SHAPE_FACE_BUF = []; // face front-facing flags

// Andrew's monotone chain convex hull, specialized for the small N (≤8)
// of health-shape vertices. Writes hull vertex INDICES (into `points`)
// in CCW order to `out`. `points[i]` must be a tuple-like with x,y at
// indices 0,1.
function _convexHull2D(points, n, out) {
    if (n < 3) {
        for (let i = 0; i < n; i++) out.push(i);
        return;
    }
    // Sort indices by (x, y).
    const idx = [];
    for (let i = 0; i < n; i++) idx.push(i);
    idx.sort((ai, bi) => {
        const a = points[ai], b = points[bi];
        return a[0] - b[0] || a[1] - b[1];
    });
    const cross = (oi, ai, bi) => {
        const o = points[oi], a = points[ai], b = points[bi];
        return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
    };
    const lower = [];
    for (let i = 0; i < n; i++) {
        const p = idx[i];
        while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
            lower.pop();
        }
        lower.push(p);
    }
    const upper = [];
    for (let i = n - 1; i >= 0; i--) {
        const p = idx[i];
        while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
            upper.pop();
        }
        upper.push(p);
    }
    // Drop the last point of each list — it's the first point of the
    // other list.
    upper.pop();
    lower.pop();
    for (let i = 0; i < lower.length; i++) out.push(lower[i]);
    for (let i = 0; i < upper.length; i++) out.push(upper[i]);
}

export class GameEngine {
    constructor(canvas, uiManager, audioManager, inputHandler) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d');

        // WebGL particle layer — bright/glowing particle types render on
        // a separate canvas underneath gameCanvas via instanced quads.
        // If WebGL2 isn't available, the renderer reports unsupported
        // and every type falls back to the Canvas2D branches below.
        this.glCanvas = document.getElementById('glCanvas');
        this.particleRenderer = this.glCanvas
            ? new WebGLParticleRenderer(this.glCanvas)
            : { supported: false, handlesType: () => false, drawParticles: () => {}, resize: () => {} };
        if (this.glCanvas) {
            this.particleRenderer.init();
        }

        // WebGL starfield layer — shares the glCanvas (and GL context)
        // with the particle renderer. Renders BEFORE particles each
        // frame so particles draw on top. Stars are populated once at
        // game start (see _populateWebGLStarfield) and the GPU handles
        // parallax / twinkle / rotation per frame at near-zero CPU
        // cost. Falls back to Canvas2D if the particle renderer is
        // unsupported (same context).
        this.starfieldRenderer = (this.particleRenderer && this.particleRenderer.supported)
            ? new WebGLStarfieldRenderer(this.glCanvas, GAME_CONFIG.WEBGL_STAR_BUFFER_SIZE || 4000)
            : { supported: false, draw: () => {}, addStar: () => false, clear: () => {}, accumulateDrift: () => {}, setFieldSize: () => {} };
        if (this.starfieldRenderer.init && this.particleRenderer.gl) {
            this.starfieldRenderer.init(this.particleRenderer.gl);
            // Let the particle renderer (which owns the shared canvas's
            // context-loss listeners) forward those events to the starfield.
            this.particleRenderer.starfieldRenderer = this.starfieldRenderer;
        }

        // 5.79.2 — WebGL bullet renderer. Single instanced draw call for
        // every player + enemy bullet on screen. Replaces the per-bullet
        // Canvas2D + shadowBlur path that dominated stroke cost at high
        // bullet counts.
        //
        // bulletCanvas sits ABOVE gameCanvas (different layer than the
        // particle/starfield glCanvas which is BELOW gameCanvas) so
        // bullets render on top of asteroids/enemies/player. It runs
        // its own WebGL2 context — multiple contexts on a single page
        // are well within modern browser limits.
        this.bulletCanvas = document.getElementById('bulletCanvas');
        this.bulletRenderer = this.bulletCanvas
            ? new WebGLBulletRenderer(this.bulletCanvas)
            : { supported: false, beginFrame: () => {}, pushBullet: () => false, drawFrame: () => {}, handlesShape: () => false, resize: () => {}, gl: null };
        if (this.bulletCanvas) {
            this.bulletRenderer.init();
        }

        this.uiManager = uiManager;
        this.audioManager = audioManager;
        // Expose weapon catalogs to ui-manager for the pause-menu PRIMARY/POWER tabs.
        this.PRIMARY_WEAPONS_LIST = PRIMARY_WEAPONS;
        this.POWER_WEAPONS_LIST = POWER_WEAPONS;
        this.inputHandler = inputHandler;

        // Set game engine reference in input handler for coordinate transformation
        this.inputHandler.gameEngine = this;

        // 6.18.7 — Pre-bind updateAimForPlayerMovement once. The per-tick
        // sites used to call `.bind(this.inputHandler)` every frame
        // (twice: in update() and in the offensive-hitstop branch),
        // allocating a fresh bound closure each time. Caching the
        // bound fn here turns the per-frame allocation into a one-time
        // bind at init.
        this._boundAimForPlayerMovement =
            this.inputHandler.updateAimForPlayerMovement.bind(this.inputHandler);

        // Make game engine globally accessible for entities
        window.gameEngine = this;
        this._defenseSkillsRef = DEFENSE_SKILLS; // Expose for UI manager skill slots
        // Hold-to-open radial menu for E (primary) / R (power) / F (skill).
        // Pauses gameplay; mouse picks the slice, click commits, key release cancels.
        this.radialMenu = new RadialMenu(this);

        // ── Mobile-mode subsystems (5.94.0 — tower-defense pivot) ─────
        // Touch handler: tap-to-aim-and-fire + PRM/PWR HUD button hit-
        // tests. Installs its own listeners; no-op on desktop.
        //
        // Auto-pilot was removed in 5.94.0. Mobile mode is now a stationary-
        // ship tower-defense experience: the player can't move, only
        // aim + fire via tap. See js/modules/ui/mobile-touch.js and the
        // movement gate in js/modules/player/player.js.
        this.mobile = isMobile();
        this.mobileTouch = new MobileTouchHandler(this);
        // 5.100.0 — Virtual analog stick (Sky-force-style drag-to-move).
        // Drives ship velocity on mobile; tap-anywhere-not-on-stick fires
        // the power weapon. Side preference (LEFT for right-handed,
        // RIGHT for left-handed) persists in localStorage.
        let stickSide = 'left';
        try {
            const saved = (typeof localStorage !== 'undefined')
                ? localStorage.getItem(STICK_SIDE_STORAGE_KEY) : null;
            if (saved === 'right') stickSide = 'right';
        } catch (_) { /* localStorage may be disabled */ }
        this.analogStick = new AnalogStick({ side: stickSide });
        if (this.mobile) {
            // Toggle the body classes that drive the CSS HUD adjustments.
            // The portrait class is also re-evaluated on every resize /
            // orientationchange — see updateMobileBodyClasses().
            if (typeof document !== 'undefined' && document.body) {
                document.body.classList.add('mobile-mode');
            }
            this._updateMobileBodyClasses();
            this.mobileTouch.install();
        }
        this.width = window.innerWidth;
        this.height = window.innerHeight;
        this.canvas.width = this.width;
        this.canvas.height = this.height;
        this.particleRenderer.resize(this.width, this.height);
        if (this.bulletRenderer && this.bulletRenderer.resize) {
            this.bulletRenderer.resize(this.width, this.height);
        }
        // 5.100.0 — Position the analog stick now that the canvas
        // dimensions are known. Any resize / orientation flip later
        // re-runs through the same path (see the resize handler hook).
        this.analogStick.resize(this.width, this.height);

        // State machine — owns all game state transitions with validation + epoch guards
        this.stateMachine = new GameStateMachine(GAME_STATES.TITLE_SCREEN);

        // Event bus — cross-system pub/sub for decoupled communication
        this.events = new EventBus();

        // Wire audio events — systems emit events, AudioManager handles playback
        this.events.on('audio:hit', () => this.audioManager.playHit());
        this.events.on('audio:explosion', () => this.audioManager.playExplosion());
        // 5.68.6 — distinct asteroid / enemy destruction sounds. Layered
        // boom + bass + zap pools per side. Generic `audio:explosion`
        // stays for mines / missile detonations / etc.
        this.events.on('audio:asteroid-destroy', () => this.audioManager.playSound('asteroidDestroy'));
        // 5.69.1 — per-enemy destruction sound. Tries `enemyDestroy_<TYPE>`
        // first; falls back to the generic `enemyDestroy` if no specific
        // clip is registered (so adding a new enemy type degrades safely).
        this.events.on('audio:enemy-destroy', (enemyType) => {
            const am = this.audioManager;
            const name = enemyType ? `enemyDestroy_${enemyType}` : null;
            if (!name || !am.playSound(name)) am.playSound('enemyDestroy');
        });
        this.events.on('audio:coin', () => this.audioManager.playCoin());
        this.events.on('audio:shield', () => this.audioManager.playShield());
        this.events.on('audio:health-regen', () => this.audioManager.playHealthRegen());
        this.events.on('audio:powerup', () => this.audioManager.playPowerup());
        this.events.on('audio:player-explosion', () => this.audioManager.playPlayerExplosion());

        // Granular hit SFX — fall back to generic 'hit' if the named sound
        // isn't registered (so adding new patterns degrades gracefully).
        this.events.on('audio:player-hit-asteroid', () => this.audioManager.playSound('playerHitAsteroid'));
        this.events.on('audio:player-hit-enemy', () => this.audioManager.playSound('playerHitEnemy'));
        // 5.68.5 — per-pattern / per-weapon hit sounds. The audioManager
        // tries the specific name first; if it isn't in MANIFEST, it
        // returns false and we fall back to the generic.
        this.events.on('audio:player-hit-bullet', (pattern) => {
            const am = this.audioManager;
            const name = pattern ? `enemyHit_${pattern}` : null;
            if (!name || !am.playSound(name)) am.playSound('enemyHit');
        });
        this.events.on('audio:enemy-hit-by-bullet', (weaponId) => {
            const am = this.audioManager;
            const name = weaponId ? `playerHit_${weaponId}` : null;
            if (!name || !am.playSound(name)) am.playSound('hit');
        });

        // Wire UI events — systems emit events, UIManager handles display
        this.events.on('ui:show-message', (d) => this.uiManager.showMessage(d.title, d.subtitle, d.duration, d.position));
        this.events.on('ui:hide-message', () => this.uiManager.hideMessage());
        // 5.88.0 — `ui:update-tanks` is the new equivalent of the old
        // `ui:update-lives`; consumed by anything DOM-side that wants to
        // reflect the energy-tank count. UIManager has no DOM lives
        // element anymore, so it's a no-op there — kept for analytics
        // hooks / future HUD widgets.
        this.events.on('ui:update-tanks', () => { /* no-op v1 */ });
        this.events.on('ui:check-orientation', () => this.uiManager.checkOrientation());
        this.events.on('ui:toggle-pause', () => this.uiManager.togglePause());
        this.events.on('ui:show-shop-button', () => this.uiManager.showShopButton());
        this.events.on('ui:hide-shop-button', () => this.uiManager.hideShopButton());
        this.events.on('ui:show-pause-btn', () => this.uiManager.showHudPauseBtn());
        this.events.on('ui:hide-pause-btn', () => this.uiManager.hideHudPauseBtn());
        this.events.on('ui:show-hud-shop-btn', () => this.uiManager.showHudShopBtn());
        this.events.on('ui:hide-hud-shop-btn', () => this.uiManager.hideHudShopBtn());

        // Frame-counted timers — only advance during PLAYING/WAVE_TRANSITION
        this._gameTimers = [];

        // 6.18.6 — Last whole-second on which the periodic pool sweep
        // ran. Previously the gate was `Math.floor(survivalTime/1000)
        // % PARTICLE_CLEANUP_INTERVAL === 0`, which evaluates true for
        // EVERY frame within a qualifying second — i.e. the cleanup
        // ran ~60 times per "trigger second" instead of once. Tracking
        // the last sweep's second and bailing when it hasn't changed
        // gives the intended once-per-N-seconds cadence.
        this._lastCleanupSecond = -1;

        // Initialize game state properties
        this.initializeGameState();
        
        // Initialize input handler aim coordinates to center of game field
        this.inputHandler.input.aimX = this.gameField.width / 2;
        this.inputHandler.input.aimY = this.gameField.height / 2;

        // Accessibility assists (5.74). Persisted in localStorage; toggled
        // via the ASSISTS pause-menu tab. Read by player.js each tick to
        // adjust aim and auto-trigger fire / power weapon.
        this.assists = this._loadAssists();
        
        // Hide DOM title screen so we only see the wavy canvas version
        // this.uiManager.hideTitleScreen();
        
        this.initializePools();
        this.setupEventListeners();
        // Wire HTML shop overlay (#shop-overlay) — replaces the old canvas
        // shop. Tabs, items, sell buttons, close button all go through DOM.
        shopDom.initShopDom(this);
        this.playerCanFire = true;
        this.previousFire = false;
        this.baseDamage = 2; // Base damage per hit

        this.playerState = PLAYER_STATES.NORMAL;
        this.pendingDamage = 0; // New property to track pending damage

        this.shieldIcon = new Image();

        // Pre-allocated typed arrays for drawOffScreenIndicators (avoid per-frame GC)
        const _SEGMENTS = 24;
        this._edgeGlow = [new Float32Array(_SEGMENTS), new Float32Array(_SEGMENTS), new Float32Array(_SEGMENTS), new Float32Array(_SEGMENTS)];
        this._blurTemp = new Float32Array(_SEGMENTS);

        // Bulletproof continuous spawning system
        this.spawnInterval = 5000; // Spawn something every 5 seconds
        this.lastSpawnTime = 0; // Track last spawn
        this.lastHealthOrbDropAt = 0; // Throttle health orb drops (cooldown gate in dropOrbsFromEntity)
        this.gameStartTime = Date.now();
        this.forceSpawnEnabled = false; // Disabled - wave-based spawning only
        
        // BACKUP SPAWNING SYSTEM - independent emergency spawner
        this.emergencySpawnInterval = 5000; // Emergency spawn every 5 seconds
        this.lastEmergencySpawn = 0;
        
        // Ghost preview positions (stored to prevent flickering)
        this.ghostEnemyPosition = this.generateGhostPosition();
        this.ghostAsteroidPosition = this.generateGhostPosition();
    }
    
    // Performance monitoring — call from console: gameEngine.showPerformanceStats()
    showPerformanceStats() {
        const pools = [
            this.particlePool, this.bulletPool, this.enemyPool, this.asteroidPool,
            this.enemyBulletPool, this.colorStarPool, this.backgroundStarPool,
            this.lineDebrisPool, this.powerupPool
        ];
        console.log('📊 Pool Stats:');
        console.table(pools.map(p => p.getStats()));
    }
    
    // Helper method to initialize/reset game state
    initializeGameState() {
        // Reset state machine to title screen
        this.stateMachine.forceState(GAME_STATES.TITLE_SCREEN);

        this.game = {
            money: 0,
            survivalTime: 0, // Time survived in milliseconds
            survivalRecord: parseInt(localStorage.getItem('rainboidsSurvivalRecord')) || 0, // Best survival time
            gameStartTime: 0, // When the current game started
            currentWave: 0,
            screenShakeDuration: 0,
            screenShakeMagnitude: 0,
            enemyLevel: 1,    // Enemy level increases each wave
            asteroidLevel: 1,  // Asteroid level increases each wave
            waveComplete: false,
            waveCountdownTime: 0,
            waveCountdownDuration: 5000, // 5 seconds between waves
            // Run-wide stats — drive the Game Complete screen + speedrun meta.
            stats: {
                gameStartTime: 0,        // set when run actually starts
                finalTimeMs: 0,          // populated on run completion
                completed: false,
                shotsFired: 0,
                shotsHit: 0,
                totalDamageDealt: 0,
                totalDamageTaken: 0,
                enemiesKilled: 0,
                asteroidsDestroyed: 0,
                bossesKilled: 0,
                deaths: 0,
                coinsEarned: 0,
                weaponShots: {},         // weaponId → shots fired
            },
        };

        // Wire this.game.state as getter/setter to the state machine
        // so all existing reads (this.game.state === X) work unchanged
        // while writes go through validation
        const sm = this.stateMachine;
        Object.defineProperty(this.game, 'state', {
            get() { return sm.state; },
            set(newState) { sm.transition(newState); },
            enumerable: true,
            configurable: true
        });
        
        // Initialize cursor system
        this.cursor = {
            isOverTarget: false,
            x: 0,
            y: 0,
            hoveredEntity: null
        };
        
        // Targeted entity system (click-based targeting). Drives the cursor
        // crosshair and asteroid/enemy outlines.
        this.targetedEntity = null;

        // Last target the player damaged (enemy ship OR asteroid). Drives
        // the top-center info panel. While the entity is alive, the panel
        // reads its live HP via `lastHitEnemy`. When it dies (or the pool
        // recycles it), `lastHitInfo` keeps the snapshot visible for a
        // short grace period so the panel doesn't flicker between rapid
        // kills (e.g. Storm Needles cycling 7+ enemies/sec).
        this.lastHitEnemy = null;
        this.lastHitInfo = null;          // { name, level, health, maxHealth, expireAt, ref }
        this.LAST_HIT_GRACE_MS = 900;     // how long the snapshot lingers after death
        
        // Target info display system
        this.targetInfo = {
            active: false,
            target: null,
            displayTime: 0,
            maxDisplayTime: 3000 // 3 seconds
        };
        
        // Money pickup display system
        this.moneyPickupDisplay = {
            amount: 0,
            displayTime: 0,
            maxDisplayTime: 3000, // 3 seconds
            fadeStartTime: 2000 // Start fading after 2 seconds
        };
        
        // Damage numbers system
        this.damageNumbers = [];

        // 5.72.2 — Gold popups + slot-roll display state.
        //   goldPopups        : screen-space "+N" floaters (one per gain)
        //   _lastSeenMoney    : last sampled game.money for delta detection
        //   _displayedMoney   : smoothed value used by drawBottomRightGold
        //                       so the readout rolls toward real money
        //                       like a casino slot reel
        this.goldPopups = [];
        this._lastSeenMoney = 0;
        this._displayedMoney = 0;
        
        // Initialize wave message system
        this.waveMessage = {
            active: false,
            startTime: 0,
            duration: 0,
            title: '',
            subtitle: ''
        };

        // Pause button hit rect (top-right corner, updated each frame by drawPauseButton)
        const btnSize = 56;
        const margin = 12;
        const hitPad = 10;
        this.pauseButtonRect = {
            x: window.innerWidth - margin - btnSize - hitPad,
            y: margin - hitPad,
            w: btnSize + hitPad * 2,
            h: btnSize + hitPad * 2
        };
        
        // Camera and game field system
        this.gameField = {
            width: GAME_CONFIG.FIELD_WIDTH,
            height: GAME_CONFIG.FIELD_HEIGHT
        };
        
        this.camera = {
            x: 0,
            y: 0,
            targetX: 0,
            targetY: 0,
            smoothing: 0.1, // Camera smoothing factor
            // 5.96.0 — Mobile-only zoom-out. Renders the world transform
            //   scaled around the canvas center so MORE world fits on a
            //   phone-sized viewport. Desktop stays at 1.0.
            //   Portrait mobile: 0.65 (most aggressive zoom-out)
            //   Landscape mobile: 0.8 (moderate)
            //   See _refreshCameraZoom() for the runtime branch.
            zoom: 1
        };
        this._refreshCameraZoom();
        
        // Initialize cheat flags
        // 5.96.0 — Reverted the 5.95.0 mobile-only `onePunchMan = true`
        //   default. Mobile is a tower-defense RPG, not fruit-ninja:
        //   weapon upgrades, damage multipliers, and kill streaks all
        //   need to matter. The cheat stays available via the console
        //   (`gameEngine.cheats.onePunchMan = true`) for dev work.
        this.cheats = {
            onePunchMan: false,
        };

        // Powerup HUD DOM ref cache
        this._powerupHudCache = new Map();

        // Shop filtered items cache
        this.shopFilteredItems = [];

        // Expose cheat functions globally (case insensitive)
        this.setupCheatCodes();

    }
    
    setupCheatCodes() {
        // Display available keyboard cheats
        console.log(`
  CHEAT CODES (keyboard, during gameplay):
  [        – +1000 Gold
  ]        – +5 SP
  (SHIFT+ cheats removed in 5.64.11 — SHIFT is now the skill-cycle key.
   For dev/testing, drive cheats from the console:
       window.gameEngine.cheats.onePunchMan = true
       window.gameEngine.game.money += N
       window.gameEngine.player.skillPoints += N)`);
    }

    /**
     * Recompute the `mobile-portrait` body class. Called on init + on
     * every resize / orientationchange. The class drives the CSS rules
     * that hide non-essential HUD chrome in portrait orientation.
     */
    _updateMobileBodyClasses() {
        if (typeof document === 'undefined' || !document.body) return;
        if (!this.mobile) {
            document.body.classList.remove('mobile-portrait');
            // Re-evaluate camera zoom on a fresh desktop layout too (idempotent).
            this._refreshCameraZoom();
            return;
        }
        const portrait = isPortrait();
        document.body.classList.toggle('mobile-portrait', portrait);
        // 5.96.0 — keep the camera zoom in sync with orientation flips.
        this._refreshCameraZoom();
    }

    /**
     * 5.96.0 — Set `this.camera.zoom` based on platform + orientation.
     *   Desktop: 1.0 (no zoom)
     *   Mobile portrait: 0.65 (aggressive zoom-out — phone screens are
     *     the most cramped; small ship + small enemies = more world
     *     visible at once)
     *   Mobile landscape: 0.8 (moderate zoom-out — wider viewport
     *     already shows more, so a lighter scale keeps entities readable)
     * Safe to call any time; reads the current `isMobile()` / `isPortrait()`
     * state.
     */
    _refreshCameraZoom() {
        if (!this.camera) return;
        if (!this.mobile) {
            this.camera.zoom = 1;
            return;
        }
        // 5.100.0 — Slightly less aggressive zoom-out now that the ship
        // MOVES on mobile (5.94's stationary-ship pivot is reversed for
        // 5.100). A moving ship needs more world visible so the player
        // can plan dodges; the pre-5.100 values were tuned for a fixed
        // camera. Portrait 0.65 → 0.78, landscape 0.8 → 0.88.
        this.camera.zoom = isPortrait() ? 0.78 : 0.88;
    }

    /**
     * 5.100.0 — Flip the analog stick to the opposite side and persist
     * the preference to localStorage. Callable from a debug toggle or a
     * future pause-menu setting.
     */
    flipAnalogStickSide() {
        if (!this.analogStick) return;
        const next = this.analogStick.side === 'left' ? 'right' : 'left';
        this.analogStick.setSide(next);
        this.analogStick.resize(this.width, this.height);
        try {
            if (typeof localStorage !== 'undefined') {
                localStorage.setItem(STICK_SIDE_STORAGE_KEY, next);
            }
        } catch (_) { /* localStorage disabled */ }
    }

    /**
     * Returns true when the top-of-screen HUD elements (target info,
     * wave-info overlays, key hints) should be hidden. Mobile portrait
     * mode hides them to free up screen real estate; entity health bars
     * above each enemy / asteroid replace the global target info panel.
     */
    _shouldHideTopHud() {
        return !!(this.mobile && isPortrait());
    }

    /**
     * 5.99.3 — Mobile background-drift generator. Sum of sinusoids at
     * distinct frequencies + slight DC bias so the field reads as
     * always wandering. Amplitudes are tuned to feel ALIVE (slightly
     * stronger than the 5.97 tuning) without being dizzy. Called from
     * the PLAYING / WAVE_TRANSITION / PAUSED / SHOP / GAME_OVER paths
     * on mobile — never on desktop (desktop reads player.vel directly).
     */
    _mobileBackgroundDrift() {
        const t = Date.now() * 0.001;
        return {
            x: Math.cos(t * 0.85) * 4.0
             + Math.sin(t * 0.31) * 2.4
             + Math.cos(t * 1.7)  * 1.2
             + Math.sin(t * 0.18) * 1.0,
            y: Math.sin(t * 0.72) * 3.4
             + Math.cos(t * 0.43) * 2.0
             + Math.sin(t * 1.5)  * 1.2
             + Math.cos(t * 0.21) * 1.0,
        };
    }

    /**
     * 5.99.3 — Feed the mobile drift into the nebula's drift accumulator.
     * The nebula renderer reads `_titleNebulaDriftX/Y` and
     * `_titleNebulaRotation` (originally set on the title screen) to
     * apply parallax to its lens-flare layers. We re-use those fields
     * for in-game / paused mobile drift so the nebula visibly evolves
     * with the starfield, not just sit static behind it.
     */
    _accumulateMobileNebulaDrift(drift) {
        const NEB_DRIFT_MUL = 0.18;
        const NEB_DRIFT_LIMIT = 8000;
        let nx = (this._titleNebulaDriftX || 0) - drift.x * NEB_DRIFT_MUL;
        let ny = (this._titleNebulaDriftY || 0) - drift.y * NEB_DRIFT_MUL;
        if (nx >  NEB_DRIFT_LIMIT) nx =  NEB_DRIFT_LIMIT;
        if (nx < -NEB_DRIFT_LIMIT) nx = -NEB_DRIFT_LIMIT;
        if (ny >  NEB_DRIFT_LIMIT) ny =  NEB_DRIFT_LIMIT;
        if (ny < -NEB_DRIFT_LIMIT) ny = -NEB_DRIFT_LIMIT;
        this._titleNebulaDriftX = nx;
        this._titleNebulaDriftY = ny;
        // Slow combined-frequency rotation drift so the lens-flare
        // layers visibly turn too. Same shape as the title-screen
        // formula, just always active on mobile.
        const t = Date.now() * 0.001;
        this._titleNebulaRotation =
            Math.sin(t * 0.18) * 0.13 + Math.cos(t * 0.07) * 0.06;
    }
    
    initializePools() {
        this.player = new Player();
        this.player.gameEngine = this; // Inject ref so player doesn't need window.gameEngine
        // Position player at center of game field
        this.player.x = this.gameField.width / 2;
        this.player.y = this.gameField.height / 2;
        
        this.bulletPool = new PoolManager(Bullet, 10);     // Reduced from 20  
        // 6.18.8 — Particle pool starts at MAX_PARTICLES (2500). Pre-6.17.2
        // this field acted as a hard cap with eviction; 6.17.2 removed
        // the cap (pool grows on demand). With size=50, the first ~2450
        // particles after boot each pay `new Particle()` — distributed
        // GC pressure during early gameplay before steady state. Boots
        // with a warm pool now; ~500 KB upfront, no warm-up GC blip.
        this.particlePool = new PoolManager(Particle, GAME_CONFIG.MAX_PARTICLES);
        this.lineDebrisPool = new PoolManager(LineDebris, 100); // Sized for 5.64.5 fragmented ship-shred — 2x pieces per enemy + multi-death overlap
        // Sized for asteroid + enemy bursts both flowing through this
        // pool. Asteroid burst: 10–22 shards; enemy burst: 18–46. A
        // worst-case "wave-clear instant" can produce ~5 enemy bursts
        // and a few asteroid bursts in the same frame, so 200 leaves
        // headroom without overshoot. AsteroidShard objects are tiny
        // (~10 fields + 3-element scratch projection array), so the
        // memory footprint of 200 is negligible.
        this.asteroidShardPool = new PoolManager(AsteroidShard, 200);
        this.asteroidPool = new PoolManager(Asteroid, 5);  // Reduced from 20
        this.enemyPool = new PoolManager(Enemy, 5);        // Reduced from 15
        this.enemyBulletPool = new PoolManager(EnemyBullet, 20); // Reduced from 50
        // 5.115.0 — Choreographed enemy formations (orbit / weave /
        // flank / cross / figure8). Bundled by wave-manager at spawn;
        // ticked each frame BEFORE individual enemy AI so per-slot
        // target positions are fresh.
        this.formationManager = new FormationManager(this);
        this.colorStarPool = new PoolManager(ColorStar, GAME_CONFIG.COLOR_STAR_COUNT + 10);
        // 5.79.32 — Gold drops live in their own pools (separate from
        //   colorStarPool's collectible-orb path so they don't share the
        //   homing/heal-orb logic). GoldCoin = pixel coins (many per
        //   drop), GoldShape = chunky shape orb (one per drop).
        this.goldCoinPool = new PoolManager(GoldCoin, 60);
        this.goldShapePool = new PoolManager(GoldShape, 20);
        // 5.98.0 — Permanent stat-pickup pool (mobile-only drops). Small
        // pool — these spawn at <2% rate per enemy kill, so 16 is plenty.
        this.statPickupPool = new PoolManager(StatPickup, 16);
        this.backgroundStarPool = new PoolManager(BackgroundStar, GAME_CONFIG.BACKGROUND_STAR_COUNT * 2);
        this.powerupPool = new PoolManager(Powerup, 5); // Reduced from 20

        // OPT-8: Spatial grid for O(1) insert / O(k) collision query
        this.spatialGrid = new SpatialGrid(this.gameField.width, this.gameField.height, 8, 6);

        // OPT-7: Temporal upsampling — 60Hz logic, display-rate render with interpolation.
        this.useTemporalUpsampling = true;
        this.logicTickRate = GAME_CONFIG.LOGIC_TICK_MS; // 60 Hz fixed timestep
        this.logicAccumulator = 0;
        this.maxLogicStepsPerFrame = 4;         // spiral-of-death guard (bumped for higher tick rate)
        this.lastFrameTime = performance.now();

        // Powerup display system
        this.powerupDisplay = {
            active: false,
            text: '',
            description: '',
            color: '#ffffff',
            opacity: 1.0,
            fadeTimer: 0,
            maxFadeTime: 180 // 3 seconds fade out
        };
    }
    
    setupEventListeners() { return events.setupEventListeners.call(this); }
    
    init({ writeWave1Save = true } = {}) {
        this._suppressWave1Save = !writeWave1Save;
        // Cancel any pending game timers from previous game
        for (let i = 0; i < this._gameTimers.length; i++) this._gameTimers[i].cancel();
        this._gameTimers.length = 0;

        // Reset core game state (money, wave, survival timer)
        this.initializeGameState();
        // Start in WAVE_TRANSITION (the "WAVE 1" intro screen). The
        // wave-1 spawn timer below flips to PLAYING once entities are
        // in the pool. Setting PLAYING here prematurely would let
        // checkWaveComplete race-fire on a 0-enemies tuple before the
        // wave-1 hunter actually spawns, skipping the player straight
        // to the wave-2 shop popup.
        this.game.state = GAME_STATES.WAVE_TRANSITION;
        this.game.gameStartTime = Date.now(); // Start survival timer
        // Reset player
        this.player = new Player();
        this.player.gameEngine = this; // Inject ref so player doesn't need window.gameEngine
        // Position player at center of game field
        this.player.x = this.gameField.width / 2;
        this.player.y = this.gameField.height / 2;

        // 5.79.0 — apply randomized loadout if startNewRun seeded one.
        //   Skipped on Continue (startContinueRun bypasses this branch
        //   by calling init({ writeWave1Save:false }) without seeding).
        const loadout = this._pendingNewRunLoadout;
        this._pendingNewRunLoadout = null;
        if (loadout) {
            if (loadout.primary && PRIMARY_WEAPONS[loadout.primary]) {
                this.player.activePrimary = loadout.primary;
                this.player.ownedPrimaries = new Set([loadout.primary]);
            }
            if (loadout.power && POWER_WEAPONS[loadout.power]) {
                this.player.activePower = loadout.power;
                this.player.ownedPowers = new Set([loadout.power]);
            }
            if (loadout.skill && DEFENSE_SKILLS[loadout.skill]) {
                this.player.activeSkill = loadout.skill;
                this.player.ownedSkills = new Set([loadout.skill]);
            }
        }
        // 5.88.3 — energy tanks unified with the triforce. healthTanks is
        // now the SPARE count (each triangle = 1 spare); the active tank
        // is the healthbar. Start at 3 spares = full triforce; total
        // effective lives = 4 (3 spares + 1 active). Health-orb overflow
        // grants spares, capped at 3. No invincibility / respawn delay.
        // 5.88.5 — base HP bumped to 40 alongside player.js. These
        // mirror legacy fields used by the HUD bar's smoothed-display
        // animation; values are overwritten later anyway, so the
        // initial number just needs to match the player's start HP.
        this.playerShields = 40;
        // 6.12.4 — Player STARTS with 3 spare tanks (full triforce).
        this.healthTanks = 3;
        if (this.player) this.player._tankProgress = 0;
        this.displayShields = 40;
        this.animatingDamage = false;
        this.pendingDamage = 0; // Reset pending damage
        
        // Reset bulletproof spawning state
        this.gameStartTime = Date.now();
        this.lastSpawnTime = 0; // Reset spawn timer
        this.lastEmergencySpawn = 0; // Reset emergency timer
        this.lastHealthOrbDropAt = 0; // Reset health orb drop cooldown
        this.nextShopTime = Date.now() + this.shopInterval;
        this.forceSpawnEnabled = false; // Keep disabled for wave-based spawning
        
        
        // Reset ghost preview positions
        this.ghostEnemyPosition = this.generateGhostPosition();
        this.ghostAsteroidPosition = this.generateGhostPosition();
        // Clear all pools.
        // 6.18.4 — Drain via PoolManager.drainActive() instead of nulling
        // `activeObjects = []`. The direct assignment orphaned the
        // freed entities — they were neither in activeObjects nor in
        // the free pool, so the next session had to allocate fresh
        // instances (paying `new ObjectClass()` cost) until the pool
        // grew back to peak. drainActive() releases each entity
        // properly so it goes back on `this.pool` for reuse.
        this.bulletPool.drainActive();
        this.particlePool.drainActive();
        this.lineDebrisPool.drainActive();
        this.asteroidShardPool.drainActive();
        this.asteroidPool.drainActive();
        this.enemyPool.drainActive();
        // 5.115.0 — drop any active formations on reset so stale
        // _formation refs don't point to dead enemies after pool wipe.
        if (this.formationManager) this.formationManager.clear();
        this.enemyBulletPool.drainActive();
        this.colorStarPool.drainActive();
        this.goldCoinPool.drainActive();
        this.goldShapePool.drainActive();
        this.statPickupPool.drainActive();
        this.backgroundStarPool.drainActive();
        this.powerupPool.drainActive();

        // 5.64.16 — wipe the WebGL star buffer too so the new run's
        // stars don't render on top of the previous run's leftovers.
        if (this.starfieldRenderer.clear) this.starfieldRenderer.clear();

        // Generate all color stars at once using generative method
        this.generateInitialColorStars();
        this.generateBackgroundStars();

        // Generate nebula background (pre-rendered, no per-frame cost)
        nebulaRenderer.generate(this.gameField.width, this.gameField.height);

        // 5.74.20 — WebGL nebula cloud layer. Uses the new `cloud` atlas
        // slot (soft volumetric blob with noise) added in the starfield
        // atlas. Each cloud is just an oversized "star" instance with a
        // huge size, low parallax, low alpha, and a saturated color tint.
        // Drawn through the same instanced pipeline as the rest of the
        // starfield — zero new draw calls, GPU-tiny.
        this._populateWebGLNebula();

        // 5.79.24 — Lock the starfield's permanent prefix. After this
        //   call, the buffer in [0, baseline) holds every static
        //   star/nebula instance; per-frame `_pushOrbsToWebGL()`
        //   appends moving orbs to the suffix.
        if (this.starfieldRenderer.setBaseline) this.starfieldRenderer.setBaseline();
        
        // Initialize first wave with intro message and delay
        this.game.currentWave = 1;
        this.game.waveComplete = false;
        // 5.88.0 — `updateLives` removed; tanks are rendered on the canvas.
        this.game.state = GAME_STATES.WAVE_TRANSITION;
        // 5.79.0 — write the initial wave-1 save so a fresh run that
        //   quits before clearing wave 1 still has something to resume.
        //   Suppressed when init() is called from startContinueRun()
        //   so the loaded snapshot isn't clobbered.
        if (!this._suppressWave1Save) this.persistWaveStartSave?.();
        this._suppressWave1Save = false;
        // Reset stats for the new run — Game Complete pulls from this object.
        this.game.stats = {
            gameStartTime: Date.now(),
            finalTimeMs: 0,
            completed: false,
            shotsFired: 0,
            shotsHit: 0,
            totalDamageDealt: 0,
            totalDamageTaken: 0,
            enemiesKilled: 0,
            asteroidsDestroyed: 0,
            bossesKilled: 0,
            deaths: 0,
            coinsEarned: 0,
            weaponShots: {},
        };

        // Wave 1 intro: title fade-out hands off to a 700ms fade-IN that
        // reveals the player on the empty playfield, then a brief beat,
        // then wave-1 entities warp in. The wave intro overlay text is
        // disabled per the user request — fade transition only.
        this.waveMessage = {
            active: true,
            startTime: Date.now(),
            duration: 3400,
            title: 'WAVE 1',
            subtitle: this.getWaveSubtitle(1),
            phase: 'intro',
        };

        // Black-to-clear fade over the first 700ms — picks up where the
        // title launch animation's fade-to-black left off so the screen
        // never flashes between the two.
        this._postInitFade = { startTime: Date.now(), duration: 700 };

        // Timeline:
        //   0-700ms    fade in (black → clear, revealing player)
        //   700-1100ms hold (player visible, empty field, orientation beat)
        //   1100ms     spawn wave-1 entities + grant invincibility
        //   3400ms     state → PLAYING
        this._gameTimers.push(new GameTimer(1100, () => {
            if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
                this.spawnWaveEntities();
                // 5.88.0 — wave-start invincibility (3s while the field
                // populates). Kept because spawning enemies on top of
                // the player would be unfair regardless of the new
                // tank-based hit model.
                if (this.player && this.player.active) {
                    this.player.makeInvincible(3000);
                }
            }
        }));
        this._gameTimers.push(new GameTimer(3400, () => {
            if (this.game.state === GAME_STATES.WAVE_TRANSITION) {
                this.game.state = GAME_STATES.PLAYING;
            }
        }));

        // Wave-1 onboarding hints. `once: false` means they re-fire
        // on EVERY wave-1 start instead of being localStorage-suppressed
        // after first view — players were reporting they never saw them.
        // IDs bumped to v5 anyway so any persisted v4 entries are
        // ignored; with once:false the persistence is irrelevant but
        // bumping keeps the localStorage key set clean.
        this._gameTimers.push(new GameTimer(4000, () => {
            if (this.game.state !== GAME_STATES.PLAYING) return;
            showHint(
                'wave1-cycle-weapons-v6',
                'Press <strong>F</strong> to cycle primary weapons, <strong>E</strong> for power weapons, <strong>R</strong> for skills.',
                7500,
                { once: false },
            );
        }));
        this._gameTimers.push(new GameTimer(12000, () => {
            if (this.game.state !== GAME_STATES.PLAYING) return;
            showHint(
                'wave1-fire-and-skill-v5',
                'Hold <strong>Space</strong> (or right-click) to fire your power weapon. Press <strong>Q</strong> to activate your skill.',
                8000,
                { once: false },
            );
        }));
        this._gameTimers.push(new GameTimer(20000, () => {
            if (this.game.state !== GAME_STATES.PLAYING) return;
            showHint(
                'wave1-open-shop-v4',
                'Open the <strong>shop</strong> any time — pause menu (<strong>ESC</strong>) or the <strong>🛒</strong> button in the top-right.',
                8000,
                { once: false },
            );
        }));
        // 5.79.2 — stats menu hint. Fires once near the end of the
        //   wave-1 onboarding window. `once: true` so returning players
        //   don't see it every run.
        this._gameTimers.push(new GameTimer(28000, () => {
            if (this.game.state !== GAME_STATES.PLAYING) return;
            showHint(
                'stats-menu-v1',
                'Press <strong>`</strong> (backtick, top-left of <strong>1</strong>) to open the <strong>STATS</strong> screen — see every derived stat, formula, and how it scales with level.',
                9000,
                { once: true },
            );
        }));
    }

    // ── Save / load (5.79.0) ──────────────────────────────────────────
    //
    // We snapshot the run at the start of each wave so the player can quit
    // and pick up where they left off via the title screen's Continue
    // button. Snapshot covers what the run would look like just after a
    // wave-clear shop close — the new wave hasn't spawned yet, the player
    // has whatever loadout/HP/gold/level they finished the prior wave with.

    hasSavedRun() { return hasSave(); }
    clearSavedRun() { clearSave(); }

    serializeRunState() {
        const p = this.player;
        if (!p) return null;
        const powerups = {};
        if (p.powerups && typeof p.powerups.forEach === 'function') {
            p.powerups.forEach((pw, type) => {
                // Drop the heavy `config` ref — we can rehydrate from
                // POWERUP_TYPES on load; keep just the stack count and
                // permanent flag.
                powerups[type] = {
                    stacks: pw.stacks | 0,
                    isPermanent: pw.isPermanent !== false,
                };
            });
        }
        return {
            // Engine-side run fields
            wave: this.game.currentWave | 0,
            money: this.game.money | 0,
            // 5.88.0 — `lives` removed; energy tanks are now serialized via
            // `engineTanks` below (the runtime owner is `this.healthTanks`,
            // distinct from per-player `p.healthTanks` used in multiplayer
            // snapshots).
            engineTanks: this.healthTanks | 0,
            stats: this.game.stats ? { ...this.game.stats, weaponShots: { ...(this.game.stats.weaponShots || {}) } } : null,
            // Player snapshot
            player: {
                level: p.level | 0,
                experience: p.experience | 0,
                experienceToNextLevel: p.experienceToNextLevel | 0,
                skillPoints: p.skillPoints | 0,
                health: p.health,
                maxHealth: p.maxHealth,
                shield: p.shield,
                healthTanks: p.healthTanks | 0,
                activePrimary: p.activePrimary,
                activePower: p.activePower,
                activeSkill: p.activeSkill,
                ownedPrimaries: Array.from(p.ownedPrimaries || []),
                ownedPowers: Array.from(p.ownedPowers || []),
                ownedSkills: Array.from(p.ownedSkills || []),
                powerups,
            },
        };
    }

    persistWaveStartSave() {
        // Called by wave-manager.nextWave right after currentWave is
        // bumped. Failures (private mode, full quota) are swallowed —
        // the run keeps going.
        try { writeSave(this.serializeRunState()); } catch {}
    }

    restoreRunState(snap) {
        if (!snap) return false;
        const p = this.player;
        if (!p) return false;
        // Engine-side
        this.game.currentWave = Math.max(1, snap.wave | 0);
        this.game.money = Math.max(0, snap.money | 0);
        // 5.88.3 — energy-tank restore. `engineTanks` is the new field
        // (= spare count, 0..3). Older saves with `lives` (1..3) map 1:1.
        // Saves from the brief 5.88.0 window where engineTanks could be
        // up to 4 are clamped down to 3 — one of the tanks is now the
        // active healthbar, not a separate slot.
        if (typeof snap.engineTanks === 'number') {
            this.healthTanks = Math.max(0, Math.min(3, snap.engineTanks | 0));
        } else if (typeof snap.lives === 'number') {
            this.healthTanks = Math.max(0, Math.min(3, snap.lives | 0));
        }
        if (snap.stats) {
            // Preserve the original gameStartTime so accumulated time
            // numbers stay consistent across the resume.
            this.game.stats = { ...this.game.stats, ...snap.stats };
        }
        // Player-side
        const ps = snap.player || {};
        if (typeof ps.level === 'number') p.level = Math.max(1, ps.level);
        if (typeof ps.experience === 'number') p.experience = Math.max(0, ps.experience);
        if (typeof ps.experienceToNextLevel === 'number' && ps.experienceToNextLevel > 0) {
            p.experienceToNextLevel = ps.experienceToNextLevel;
        }
        if (typeof ps.skillPoints === 'number') p.skillPoints = Math.max(0, ps.skillPoints);
        if (typeof ps.maxHealth === 'number') p.maxHealth = ps.maxHealth;
        if (typeof ps.health === 'number') p.health = Math.min(ps.health, p.maxHealth);
        if (typeof ps.shield === 'number') p.shield = ps.shield;
        if (typeof ps.healthTanks === 'number') p.healthTanks = Math.max(0, ps.healthTanks | 0);
        if (typeof ps.activePrimary === 'string') p.activePrimary = ps.activePrimary;
        if (typeof ps.activePower === 'string')   p.activePower   = ps.activePower;
        if (typeof ps.activeSkill === 'string')   p.activeSkill   = ps.activeSkill;
        if (Array.isArray(ps.ownedPrimaries)) p.ownedPrimaries = new Set(ps.ownedPrimaries);
        if (Array.isArray(ps.ownedPowers))    p.ownedPowers    = new Set(ps.ownedPowers);
        if (Array.isArray(ps.ownedSkills))    p.ownedSkills    = new Set(ps.ownedSkills);
        // Rehydrate powerups via POWERUP_TYPES so cards / stats look up
        // configs correctly. Falls back to a minimal stub if the type
        // was deleted in a later patch.
        if (ps.powerups && typeof ps.powerups === 'object') {
            p.powerups = new Map();
            for (const [type, pw] of Object.entries(ps.powerups)) {
                const stacks = Math.max(1, pw.stacks | 0);
                const cfg = POWERUP_TYPES[type] || {};
                p.powerups.set(type, {
                    stacks,
                    timeRemaining: Infinity,
                    config: cfg,
                    isPermanent: true,
                });
            }
        }
        // Realign asteroid+enemy level for the resumed wave.
        try {
            const { getEnemyLevel, getAsteroidLevel } = wave;
            if (typeof getEnemyLevel === 'function') this.game.enemyLevel = getEnemyLevel(this.game.currentWave);
            if (typeof getAsteroidLevel === 'function') this.game.asteroidLevel = getAsteroidLevel(this.game.currentWave);
        } catch {}
        // HUD refresh — tanks render straight from `this.healthTanks` on
        // the canvas, so there's no DOM update to dispatch here.
        if (this.uiManager?.updateScore) this.uiManager.updateScore(this.game.money);
        return true;
    }

    startContinueRun() {
        // Convenience: do a full init() first to put pools / stars / wave
        // intro in their wave-1 baseline, then overlay the saved snapshot.
        // Pass writeWave1Save:false so init() doesn't clobber the saved
        // snapshot we're about to restore.
        const snap = loadSave();
        if (!snap) return false;
        this.init({ writeWave1Save: false });
        return this.restoreRunState(snap);
    }

    // 6.x — Canonical GAME OVER button action, shared by the desktop
    // click/keyboard path (event-setup.js) and the mobile touch path
    // (mobile-touch.js, which previously had no way to run it → mobile
    // players were stuck on the game-over screen).
    triggerGameOverAction(id) {
        if (id === 'newGame') {
            if (typeof this.startNewRun === 'function') this.startNewRun();
            else this.init();
        } else if (id === 'restartWave') {
            if (typeof this.startContinueRun === 'function') {
                const ok = this.startContinueRun();
                if (!ok) (typeof this.startNewRun === 'function') ? this.startNewRun() : this.init();
            } else {
                this.init();
            }
        }
    }

    startNewRun() {
        clearSave();
        // 5.79.0 — randomize starting loadout (primary, power, skill).
        //   We seed `_pendingNewRunLoadout` here and `init()` reads it
        //   right after the Player is constructed so the assignment
        //   happens BEFORE the wave-1 save is written.
        this._pendingNewRunLoadout = this._rollRandomLoadout();
        this.init();
    }

    _rollRandomLoadout() {
        const pickKey = (obj) => {
            const keys = Object.keys(obj || {});
            if (keys.length === 0) return null;
            return keys[Math.floor(Math.random() * keys.length)];
        };
        return {
            primary: pickKey(PRIMARY_WEAPONS),
            power:   pickKey(POWER_WEAPONS),
            skill:   pickKey(DEFENSE_SKILLS),
        };
    }

    // Generate all initial color stars using purely generative method
    generateInitialColorStars() {
        const spawnWidth = this.gameField.width;
        const spawnHeight = this.gameField.height;
        const webglOn = this.starfieldRenderer.supported;

        // 5.64.16 — when WebGL is on, render *most* color stars via the
        // GPU. Bump the count by WEBGL_COLOR_STAR_MULTIPLIER (default 3×)
        // so the field is visibly richer; the GPU eats the cost.
        const baseCount = GAME_CONFIG.COLOR_STAR_COUNT;
        const count = webglOn
            ? baseCount * (GAME_CONFIG.WEBGL_COLOR_STAR_MULTIPLIER || 3)
            : baseCount;
        const starPositions = generateStarPositions(spawnWidth, spawnHeight, count);

        starPositions.forEach(({ x, y, z, density }) => {
            const colorStar = this.colorStarPool.get(x, y, false, z, density);
            if (colorStar && webglOn) this._tryAddColorStarToWebGL(colorStar);
        });
    }

    // Generate background stars using same generative logic
    generateBackgroundStars() {
        const spawnWidth = this.gameField.width;
        const spawnHeight = this.gameField.height;
        const webglOn = this.starfieldRenderer.supported;

        // 5.64.16 — WebGL pipeline scales much further than Canvas2D's
        // depth-batch path. Bump BACKGROUND_STAR_COUNT by
        // WEBGL_BACKGROUND_STAR_MULTIPLIER (default 6×) when WebGL is
        // active for a much richer parallax field.
        const baseCount = GAME_CONFIG.BACKGROUND_STAR_COUNT * 2;
        const count = webglOn
            ? baseCount * (GAME_CONFIG.WEBGL_BACKGROUND_STAR_MULTIPLIER || 6)
            : baseCount;
        const backgroundStarPositions = generateStarPositions(spawnWidth, spawnHeight, count);

        backgroundStarPositions.forEach(({ x, y, z, density }) => {
            const bgStar = this.backgroundStarPool.get(x, y, z, density);
            if (bgStar && webglOn) this._tryAddBackgroundStarToWebGL(bgStar);
        });
    }

    // ── WebGL starfield population helpers (5.64.16) ────────────────
    //
    // The Canvas star pools (backgroundStarPool, colorStarPool) remain
    // populated and updated as before so the existing
    // collision/interaction logic still works. These helpers ALSO add
    // a parallel GPU instance for rendering — when a star is in the
    // WebGL buffer, its `_inWebGL` flag is set so the Canvas2D draw
    // path skips it.

    // 5.64.18 — astronomical brightness rule: tiny stars are BRIGHT
    // (distant pinpoints with high apparent surface brightness), big
    // stars are DIM (closer, light spread over more pixels). Returns
    // an alpha multiplier in [0.20, 1.0] for a given quad size in px.
    //
    // Rationale: previous "make everything brightest" pass made the
    // big color-star shapes feel like game entities. Inverse-size
    // damping pushes them into the background where they belong, while
    // tiny background stars can stay punchy.
    _starBrightnessForSize(size) {
        // Curve: max alpha at size <= 2px, fall off through size = 30px.
        // sizeFalloff(2)≈1.0, sizeFalloff(6)≈0.85, sizeFalloff(12)≈0.55,
        // sizeFalloff(20)≈0.30, sizeFalloff(30)≈0.20 (clamp floor).
        const t = (size - 2) / 28; // 0 at 2px, 1 at 30px
        const v = 1.0 - 0.8 * Math.max(0, Math.min(1, t));
        return v < 0.20 ? 0.20 : v;
    }

    // 5.78.0 — O1 starfield-dirty mechanism. Whenever the engine
    // adds/removes WebGL star instances outside the bulk-spawn path,
    // call `markStarfieldDirty()` so the render layer can re-flush
    // the instance buffer. The dirty flag is checked at the top of
    // the WebGL starfield draw; if set, the buffer is cleared and
    // re-populated from the live pools. Pre-emptive — we don't churn
    // stars today but a future starburst FX would otherwise leave
    // the WebGL buffer stale.
    markStarfieldDirty() { this._starfieldDirty = true; }

    _flushStarfieldIfDirty() {
        if (!this._starfieldDirty) return;
        if (!this.starfieldRenderer || !this.starfieldRenderer.supported) {
            this._starfieldDirty = false;
            return;
        }
        if (this.starfieldRenderer.clear) this.starfieldRenderer.clear();
        // Re-populate from the live pools. Mark every active star as
        // not-yet-in-WebGL so the engine helpers re-add them.
        if (this.backgroundStarPool) {
            for (const s of this.backgroundStarPool.activeObjects) {
                s._inWebGL = false;
                this._tryAddBackgroundStarToWebGL(s);
            }
        }
        if (this.colorStarPool) {
            for (const s of this.colorStarPool.activeObjects) {
                if (s.isCollectible) continue;
                s._inWebGL = false;
                this._tryAddColorStarToWebGL(s);
            }
        }
        // Re-seed nebula clouds (they aren't in any pool).
        if (typeof this._populateWebGLNebula === 'function') {
            this._populateWebGLNebula();
        }
        // 5.79.24 — Re-anchor the baseline since we just rewrote the
        //   permanent prefix; transient orbs should layer on top of
        //   the freshly populated background.
        if (this.starfieldRenderer.setBaseline) this.starfieldRenderer.setBaseline();
        this._starfieldDirty = false;
    }

    _tryAddBackgroundStarToWebGL(star) {
        if (!this.starfieldRenderer.supported) return;
        const rgba = this._parseStarColor(star.color);
        const parallax = Math.pow(star.z, 1.8) * 0.12;
        const drawSize = star.radius * 1.4;
        // Size-inverse alpha: tiny background stars (sub-3px) get full
        // brightness; rare big ones get damped so they don't compete
        // with foreground entities.
        const baseAlpha = this._starBrightnessForSize(drawSize);
        const ok = this.starfieldRenderer.addStar(
            star.x, star.y,
            parallax,
            drawSize,
            rgba[0], rgba[1], rgba[2], baseAlpha,
            star.opacityOffset || 0,
            (star.twinkleSpeed || 0.01) * 60,
            Math.max(star.twinkleAmplitude || 0, 0.35),
            STAR_SLOT_INDEX.dot,
            0,
            0,
        );
        if (ok) star._inWebGL = true;
    }

    _tryAddColorStarToWebGL(star) {
        if (!this.starfieldRenderer.supported) return;
        if (star.isCollectible) return;          // health/money orbs stay on Canvas
        // 5.79.23 — Restored original slot mapping. Fancy shapes (multi-
        //   point, geometric, 3D solids) reach their actual atlas
        //   slots again. Big-star pool was independently restricted to
        //   point/circle in the constructor, so no fancy shape ever
        //   spawns at big size.
        const slotKey = (star.shape === 'circle' || star.shape === 'point') ? 'dot' : star.shape;
        if (!WEBGL_STAR_SHAPES.has(slotKey)) return;  // sparkle/burst stay on Canvas
        const rgba = this._parseStarColor(star.color);
        const parallax = Math.pow(star.z, 1.8) * 0.12;
        const sizeMul = star.sizeVariation || 1;
        // 5.64.18 — shape bump tightened (was 2.2 for shapes; now 1.4
        // matching the dot bump). Big silhouette stars were dominating
        // the field and reading as game entities. The size-inverse
        // alpha rule below additionally dampens any remaining big stars.
        const shapeSizeBump = (slotKey === 'dot') ? 1.4 : 1.5;
        const drawSize = star.radius * sizeMul * shapeSizeBump;
        // 5.74.19 — shape-star alpha floor lifted (0.65 → 0.95) to
        // compensate for the BRIGHTNESS_GAIN removal in the fragment
        // shader. Additive blend means `alpha × rgb` is the contribution,
        // so a brighter alpha keeps the color punch without going through
        // the rgb-clamp path that was desaturating colors. Dot stars
        // keep their existing size-inverse damp.
        const baseAlpha = (slotKey === 'dot')
            ? this._starBrightnessForSize(drawSize)
            : Math.max(0.95, this._starBrightnessForSize(drawSize));
        // Aggressive saturation boost for shape stars: subtract 75% of the
        // min channel (kills the gray "white component" baked into pastel
        // palette entries), then normalize to max-channel = 1. A pastel
        // like #a6b3ff (0.65, 0.70, 1.0) → after desat (0.16, 0.21, 0.51)
        // → after norm (0.31, 0.41, 1.0) — much more clearly BLUE. Pure
        // colors stay pure: (1, 0, 0) → (0.75, 0, 0) → (1, 0, 0). Only
        // shape stars get this; dot stars (the bulk of the field) stay
        // in their muted natural palette so the field still reads like
        // a starscape, not a rave.
        let r = rgba[0], g = rgba[1], b = rgba[2];
        if (slotKey !== 'dot') {
            const minCh = Math.min(r, g, b);
            const desat = minCh * 0.75;
            r = Math.max(0, r - desat);
            g = Math.max(0, g - desat);
            b = Math.max(0, b - desat);
            const maxCh = Math.max(r, g, b, 0.001);
            const norm = 1 / maxCh;
            r = Math.min(1, r * norm);
            g = Math.min(1, g * norm);
            b = Math.min(1, b * norm);
        }
        const ok = this.starfieldRenderer.addStar(
            star.x, star.y,
            parallax,
            drawSize,
            r, g, b, baseAlpha,
            star.opacityOffset || 0,
            (star.twinkleSpeed || 0.005) * 60,
            (slotKey === 'dot') ? 0.40 : 0.55,
            STAR_SLOT_INDEX[slotKey],
            star.rotation || 0,
            (star.rotationSpeed || 0) * 60,
        );
        if (ok) star._inWebGL = true;
    }

    // 5.79.24 — Push every active money/health orb into the WebGL
    //   starfield as a transient instance. Called per-frame after
    //   `resetTransients()` so the suffix of the instance buffer
    //   carries the orbs at their CURRENT world position. Orbs use
    //   parallax 0 (their position is the world position; no drift
    //   correction). Atlas slot is picked from the orb's `shape` field
    //   (already constrained to the WEBGL_STAR_SHAPES pool in
    //   color-star.js → reset).
    _pushOrbsToWebGL() {
        if (!this.starfieldRenderer.supported) return;
        // Health/legacy collectibles in colorStarPool.
        // 5.79.62 — 3D health shapes (cube/octahedron/tetrahedron/prism)
        //   skip the WebGL atlas entirely — they render via Canvas2D in
        //   `_drawHealthShapesCanvas2D` for pixel-perfect crisp edges.
        //   The atlas was baking 128-px sprites which then minified to
        //   8-16 px on screen; the thin internal "3D" edges shimmered
        //   sub-pixel during rotation. Canvas2D draws at on-screen size
        //   so the lines stay crisp.
        const orbs = this.colorStarPool.activeObjects;
        for (let i = 0; i < orbs.length; i++) {
            const orb = orbs[i];
            if (!orb.active || !orb.isCollectible) continue;
            if (orb.is3DShape) continue;
            this._pushOrbInstance(orb);
        }
        // 5.79.33 — Gold coins are NOT pushed here. They render on
        //   Canvas2D via _drawGoldSparklesCanvas2D() below (renamed in
        //   5.118.0) as pixel-perfect squares/circles/dots with a
        //   twinkle + additive sparkle pulse — the "treasure dust"
        //   scatter that accompanies every gem drop.
        // 5.117.0 — Gold SHAPES (gems) also dropped from the WebGL
        //   atlas push. They now render on Canvas2D via
        //   _drawGoldShapesCanvas2D() with per-shape jewel colors +
        //   black stroke that the atlas couldn't express.
    }

    /**
     * 5.117.0 — Gold shapes rendered as 2D jewel polygons with a
     * thick black stroke. Pulled off the WebGL atlas (which couldn't
     * support per-shape borders) so each drop reads as a polished
     * treasure gem against any background.
     *
     * Per shape per frame:
     *   • viewport cull
     *   • build the silhouette vertices (star / hexagon / diamond /
     *     triangle) with rotation
     *   • fill with the jewel color (pink/red/violet/purple/magenta)
     *   • stroke with black for background contrast
     *   • subtle inner highlight (top-center sheen) so the gem looks
     *     polished without breaking the flat-shape aesthetic
     *
     * Cost is dominated by Canvas2D polygon fills. Typical active
     * gold-shape count is 1-10; per-frame budget well under 0.5ms.
     */
    _drawGoldShapesCanvas2D(ctx, vL, vT, vR, vB) {
        const shapes = this.goldShapePool.activeObjects;
        if (shapes.length === 0) return;
        const t = frameClock.now * 0.001;
        for (let i = 0; i < shapes.length; i++) {
            const s = shapes[i];
            if (!s.active) continue;
            if (s.x < vL || s.x > vR || s.y < vT || s.y > vB) continue;
            const alpha = (s.opacity ?? 1);
            if (alpha <= 0) continue;
            const sizeMul = s.sizeVariation || 1;
            const wave = 0.5 + 0.5 * Math.sin(
                t * (s.twinkleSpeed || 3.5) + (s.twinklePhase || 0),
            );
            const r = Math.max(3, s.radius * sizeMul * (0.95 + 0.10 * wave));
            const rot = (s.rotation || 0) + t * (s.rotationSpeed || 0) * 60;

            ctx.save();
            ctx.translate(Math.round(s.x), Math.round(s.y));
            ctx.rotate(rot);
            ctx.globalAlpha = alpha;

            // Path for the shape silhouette.
            _gemPath(ctx, s.shape, r);

            // Fill with jewel color.
            ctx.fillStyle = s.color || '#ff44aa';
            ctx.fill();
            // Black stroke for background contrast — thicker than
            // health drops so the gem reads as a distinct collectible
            // against busy backdrops.
            ctx.strokeStyle = s.borderColor || '#000000';
            ctx.lineWidth = Math.max(1.5, r * 0.14);
            ctx.lineJoin = 'round';
            ctx.stroke();

            // Inner highlight: a small white sheen near the top so the
            // gem reads as polished/reflective. Drawn with `lighter`
            // composite so it brightens the jewel color underneath
            // without washing it out.
            ctx.globalCompositeOperation = 'lighter';
            const sheen = ctx.createRadialGradient(-r * 0.25, -r * 0.4, 0, -r * 0.25, -r * 0.4, r * 0.7);
            if (sheen && typeof sheen.addColorStop === 'function') {
                sheen.addColorStop(0.00, `rgba(255, 255, 255, ${alpha * 0.55})`);
                sheen.addColorStop(0.50, `rgba(255, 240, 255, ${alpha * 0.18})`);
                sheen.addColorStop(1.00, 'rgba(255, 240, 255, 0)');
                ctx.fillStyle = sheen;
                ctx.fill();
            }
            ctx.restore();
        }
    }

    /**
     * 5.79.33 — Render gold coins as pixel-perfect filled squares on
     * Canvas2D. Bypasses the WebGL starfield's antialiased atlas-dot
     * silhouette which made them look like soft glowy specks. Hard
     * `fillRect` gives the user "sharp and point-like pixels" they
     * asked for — no halo, no AA, no Gaussian falloff.
     *
     * 5.118.0 — Renamed from _drawGoldCoinsCanvas2D to better describe
     * intent: this is the "treasure dust sparkle" layer. Three shape
     * variants per coin (square / circle / single pixel) + twinkle
     * modulation + an additive sparkle pulse during the bright phase
     * of each coin's twinkle wave. Cheap: the pulse only fires when
     * sin(twinkle) > 0.7 so most coins skip the extra gradient on any
     * given frame.
     */
    _drawGoldSparklesCanvas2D(ctx, vL, vT, vR, vB) {
        const coins = this.goldCoinPool.activeObjects;
        if (coins.length === 0) return;
        const t = frameClock.now * 0.001;
        ctx.save();
        ctx.imageSmoothingEnabled = false;
        // PASS 1 — flat pixel-art bodies. Fast loop, no composite changes.
        for (let i = 0; i < coins.length; i++) {
            const c = coins[i];
            if (!c.active) continue;
            // Viewport cull.
            if (c.x < vL || c.x > vR || c.y < vT || c.y > vB) continue;
            const baseAlpha = c.opacity ?? 1;
            if (baseAlpha <= 0) continue;
            // Twinkle: scale alpha by a sine wave from each coin's own
            // phase + speed (assigned in reset). Brightness oscillates
            // ~0.55 → 1.0 so coins SPARKLE in place rather than
            // sitting at constant brightness.
            const twink = Math.sin(t * (c.twinkleSpeed || 3) + (c.twinklePhase || 0));
            const flicker = 0.65 + 0.35 * (0.5 + 0.5 * twink);
            const alpha = baseAlpha * flicker;
            // Hard pixel render — 1×1 at radius<1.8, 2×2 at radius<2.5,
            // 3×3 at the upper bound. Keeps coins crisp regardless of
            // float radius. Same size budget for square / circle / dot
            // so the three shapes feel consistent in scale.
            const px = c.radius >= 2.5 ? 3 : c.radius >= 1.8 ? 2 : 1;
            const half = px / 2;
            ctx.globalAlpha = alpha;
            ctx.fillStyle = c.color || '#ffd700';
            switch (c.shape) {
                case 'circle': {
                    // Tiny filled disk — soft round contrast to the
                    // square coins.
                    ctx.beginPath();
                    ctx.arc(c.x, c.y, Math.max(0.6, px * 0.55), 0, Math.PI * 2);
                    ctx.fill();
                    break;
                }
                case 'dot': {
                    // Smallest sparkle — always 1×1 regardless of
                    // underlying radius so the variety reads.
                    ctx.fillRect(c.x | 0, c.y | 0, 1, 1);
                    break;
                }
                case 'square':
                default: {
                    ctx.fillRect(c.x - half, c.y - half, px, px);
                    break;
                }
            }
        }
        // PASS 2 — additive sparkle pulse. ONE composite switch for the
        // whole pass, then a quick second loop. Only coins currently
        // in the bright half of their twinkle wave get the pulse, so
        // typical pass-2 count is roughly half the active coins.
        ctx.globalCompositeOperation = 'lighter';
        for (let i = 0; i < coins.length; i++) {
            const c = coins[i];
            if (!c.active) continue;
            if (c.x < vL || c.x > vR || c.y < vT || c.y > vB) continue;
            const baseAlpha = c.opacity ?? 1;
            if (baseAlpha <= 0) continue;
            const twink = Math.sin(t * (c.twinkleSpeed || 3) + (c.twinklePhase || 0));
            // Pulse fires only when twinkle is in its bright window
            // (top 30% of the wave). Most coins skip on any given
            // frame so the cost is bounded.
            const pulse = Math.max(0, twink - 0.7) / 0.3;
            if (pulse <= 0) continue;
            const px = c.radius >= 2.5 ? 3 : c.radius >= 1.8 ? 2 : 1;
            const haloR = px * 2.5;
            ctx.globalAlpha = baseAlpha * pulse * 0.55;
            ctx.fillStyle = '#fff8b0';
            ctx.beginPath();
            ctx.arc(c.x, c.y, haloR, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore();
    }

    /**
     * 5.88.5 — 3D health shapes: real polyhedron vertices rotated through
     * a per-orb 3-axis matrix, projected to 2D each frame, drawn as a
     * convex-hull silhouette plus the front-facing edges. No textures,
     * no atlas, no cached sprites — pure vector primitives at native
     * size, so there is nothing for bilinear / minification filters to
     * smear. Replaces the fixed 2D silhouette + 2D spin from 5.79.62.
     *
     * Per orb per frame:
     *   • build Rz·Ry·Rx from rotZ (existing spin) + rotX, rotY (tumble)
     *   • project N≤8 vertices to 2D
     *   • silhouette = convex hull of projected verts (exact for convex
     *     polyhedra)
     *   • cull back-facing faces; draw edges of remaining front faces as
     *     "internal 3D" lines on top of the filled silhouette
     *
     * Cost is dominated by ~10 small-N convex hull computations + a
     * handful of Canvas2D path calls per orb, comfortably <100 µs/frame
     * for the typical 1–20 orb count.
     */
    _drawHealthShapesCanvas2D(ctx, vL, vT, vR, vB) {
        const orbs = this.colorStarPool.activeObjects;
        if (orbs.length === 0) return;

        const t = frameClock.now * 0.001;

        for (let i = 0; i < orbs.length; i++) {
            const orb = orbs[i];
            if (!orb.active || !orb.is3DShape) continue;
            if (orb.x < vL || orb.x > vR || orb.y < vT || orb.y > vB) continue;

            const sizeMul = orb.sizeVariation || 1;
            const wave = 0.5 + 0.5 * Math.sin(
                t * (orb.twinkleSpeed || 3.5) + (orb.twinklePhase || 0),
            );
            const pulseMul = 0.94 + 0.18 * wave;
            const r = Math.max(4, Math.round(orb.radius * sizeMul * pulseMul));
            const depthOpacity = orb.depthOpacity ?? 1;
            const alpha = (orb.opacity ?? 1) * depthOpacity * 0.95;
            if (alpha <= 0) continue;

            // Three axes of rotation. Z is the existing camera-axis spin
            // (rotation + rotationSpeed); X and Y are the new "slight"
            // tumble. Compute angles from time so frame-rate doesn't
            // affect the visual speed.
            const rotZ = (orb.rotation || 0) + t * (orb.rotationSpeed || 0) * 60;
            const rotX = (orb.rotX || 0) + t * (orb.tumbleSpeedX || 0) * 60;
            const rotY = (orb.rotY || 0) + t * (orb.tumbleSpeedY || 0) * 60;

            const geom = HEALTH_SHAPE_GEOMETRY[orb.shape];
            if (!geom) continue;

            const isHealth = orb.starType === 'health';

            ctx.save();
            // Integer-aligned translate so the pixel grid is consistent
            // across the whole orb. The 3D rotation produces sub-pixel
            // edge coords, but Canvas2D's polygon AA renders those
            // crisply — no minification aliasing because there's no
            // texture being sampled.
            ctx.translate(Math.round(orb.x), Math.round(orb.y));

            // 5.116.0 — Glow rewrite using ADDITIVE BLENDING so health
            // orbs pop against ANY background (dark voids, bright
            // nebulae, busy combat FX all clear). All glow layers run
            // under `globalCompositeOperation = 'lighter'` so colors
            // ADD to whatever's behind them — same trick the particle
            // layer uses for explosions and bullet cores.
            //
            // Layers (all behind the 3D body, all additive):
            //   1. Bloom halo — wide pulsing cyan-blue radial (3.0× r).
            //   2. Inner glow core — small bright core that bleeds
            //      through the body silhouette so the orb looks lit
            //      from within (2× r, hot white-cyan center).
            //   3. Sparkle ring — four orbiting motes, smaller +
            //      brighter than 5.102.0 since additive makes them
            //      already vivid.
            // After the body draws normally, a glossy specular sheen
            // (NOT additive) sits on top — same as 5.102.0.
            //
            // Perf: additive blending is a free composite mode in
            // every browser's canvas backend. The 6 gradients per orb
            // (1 bloom + 1 core + 4 sparkle) are the dominant cost;
            // typical health-orb count is 1-5 active so the per-frame
            // budget is well under 0.5ms.
            if (isHealth) {
                ctx.save();
                ctx.globalCompositeOperation = 'lighter';

                // 1. Bloom halo. Wider + brighter than 5.102.0 to
                // counter the "blends into background" complaint.
                const bloomR = r * (2.9 + 0.5 * wave);
                const bloom = ctx.createRadialGradient(0, 0, r * 0.3, 0, 0, bloomR);
                if (bloom && typeof bloom.addColorStop === 'function') {
                    bloom.addColorStop(0.00, `rgba(120, 230, 255, ${alpha * 0.55})`);
                    bloom.addColorStop(0.35, `rgba(60, 150, 255, ${alpha * 0.30})`);
                    bloom.addColorStop(1.00, 'rgba(40, 100, 220, 0)');
                    ctx.fillStyle = bloom;
                    ctx.beginPath();
                    ctx.arc(0, 0, bloomR, 0, Math.PI * 2);
                    ctx.fill();
                }

                // 2. Inner glow core — a hot white-cyan pulse that
                // bleeds through the 3D body silhouette so the orb
                // reads as "lit from within" rather than just a
                // colored polygon.
                const coreR = r * (1.4 + 0.25 * wave);
                const core = ctx.createRadialGradient(0, 0, 0, 0, 0, coreR);
                if (core && typeof core.addColorStop === 'function') {
                    core.addColorStop(0.00, `rgba(255, 255, 255, ${alpha * 0.65})`);
                    core.addColorStop(0.45, `rgba(150, 240, 255, ${alpha * 0.35})`);
                    core.addColorStop(1.00, 'rgba(80, 200, 255, 0)');
                    ctx.fillStyle = core;
                    ctx.beginPath();
                    ctx.arc(0, 0, coreR, 0, Math.PI * 2);
                    ctx.fill();
                }

                // 3. Sparkle ring — four motes orbiting with the orb.
                // Additive makes them really pop without needing the
                // larger gradients from 5.102.0.
                const sparkA = t * 0.9 + (orb.twinklePhase || 0);
                const sparkR = r * 1.55;
                for (let s = 0; s < 4; s++) {
                    const a = sparkA + (s * Math.PI / 2);
                    const sx = Math.cos(a) * sparkR;
                    const sy = Math.sin(a) * sparkR;
                    const sRad = r * 0.32;
                    const sAlpha = alpha * (0.55 + 0.45 * Math.sin(t * 4 + s * 1.3));
                    if (sAlpha <= 0) continue;
                    const spark = ctx.createRadialGradient(sx, sy, 0, sx, sy, sRad);
                    if (spark && typeof spark.addColorStop === 'function') {
                        spark.addColorStop(0.00, `rgba(255, 255, 255, ${Math.min(1, sAlpha)})`);
                        spark.addColorStop(0.55, `rgba(180, 230, 255, ${Math.min(1, sAlpha) * 0.4})`);
                        spark.addColorStop(1.00, 'rgba(180, 230, 255, 0)');
                        ctx.fillStyle = spark;
                        ctx.beginPath();
                        ctx.arc(sx, sy, sRad, 0, Math.PI * 2);
                        ctx.fill();
                    }
                }
                ctx.restore(); // pops the additive composite mode
            }

            ctx.globalAlpha = alpha;
            ctx.fillStyle = orb.color;
            ctx.lineJoin = 'miter';
            ctx.lineCap = 'butt';

            this._drawHealthShape3D(
                ctx, r, orb.borderColor || '#000', geom, rotX, rotY, rotZ,
            );

            // 5.102.0 — Specular highlight on top, clipped to a circle
            // matching the orb's bounding silhouette. Gives the orb a
            // glossy, "wet" sheen so it reads as a polished collectible
            // instead of a flat colored polygon.
            if (isHealth) {
                ctx.save();
                ctx.beginPath();
                ctx.arc(0, 0, r * 0.95, 0, Math.PI * 2);
                ctx.clip();
                const sheenX = -r * 0.35, sheenY = -r * 0.4;
                const sheen = ctx.createRadialGradient(sheenX, sheenY, 0, sheenX, sheenY, r * 0.85);
                if (sheen && typeof sheen.addColorStop === 'function') {
                    sheen.addColorStop(0.00, `rgba(255, 255, 255, ${alpha * 0.85})`);
                    sheen.addColorStop(0.45, `rgba(220, 240, 255, ${alpha * 0.32})`);
                    sheen.addColorStop(1.00, 'rgba(220, 240, 255, 0)');
                    ctx.fillStyle = sheen;
                    ctx.beginPath();
                    ctx.arc(sheenX, sheenY, r * 0.85, 0, Math.PI * 2);
                    ctx.fill();
                }
                ctx.restore();
            }
            ctx.restore();
        }
    }

    /**
     * Project the geometry's 3D vertices through a Rz·Ry·Rx rotation
     * matrix, fill the convex-hull silhouette, and stroke front-facing
     * edges. `geom` carries per-shape verts (unit-scale), edges, and
     * faces (CCW from outside).
     */
    _drawHealthShape3D(ctx, r, borderCol, geom, rotX, rotY, rotZ) {
        // 5.117.0 — Painter's algorithm rewrite. Pre-5.117 used a
        // convex-hull silhouette + front-facing edge overlay, which
        // (a) made the body look see-through (only the silhouette
        //     was filled; the interior edges revealed both front AND
        //     back-facing edges visible against the body fill, giving
        //     a "glass polyhedron" look), and (b) was wrong for the
        //     Stella Octangula since its convex hull is a cube, not
        //     the 8-pointed star.
        // New approach: project verts, compute per-face front-facing
        // + depth, sort front-facing faces back-to-front, fill each
        // face with the body color and stroke its edges in the
        // border color. Works correctly for ALL polyhedra (convex
        // or concave) and the body reads as a SOLID object.
        const cx = Math.cos(rotX), sx = Math.sin(rotX);
        const cy = Math.cos(rotY), sy = Math.sin(rotY);
        const cz = Math.cos(rotZ), sz = Math.sin(rotZ);

        // Reuse a scratch array per shape so the GC isn't beat up.
        const projected = HEALTH_SHAPE_PROJ_BUF;
        const verts = geom.verts;
        const n = verts.length;
        for (let i = 0; i < n; i++) {
            const v = verts[i];
            const vx = v[0], vy = v[1], vz = v[2];
            const y1 = vy * cx - vz * sx;
            const z1 = vy * sx + vz * cx;
            const x2 = vx * cy + z1 * sy;
            const z2 = -vx * sy + z1 * cy;
            const x3 = x2 * cz - y1 * sz;
            const y3 = x2 * sz + y1 * cz;
            const p = projected[i] || (projected[i] = [0, 0, 0]);
            p[0] = x3 * r;
            p[1] = -y3 * r;  // canvas Y grows downward
            p[2] = z2;
        }

        // Pre-compute front-facing + centroid depth for every face.
        // Front-facing test: 2D cross of (b-a) × (c-a) with the face
        // defined CCW from outside; negative cross in screen space
        // (canvas Y down) means the face faces us.
        const faces = geom.faces;
        const meta = HEALTH_SHAPE_FACE_BUF;
        meta.length = 0;
        for (let f = 0; f < faces.length; f++) {
            const face = faces[f];
            const a = projected[face[0]], b = projected[face[1]], c = projected[face[2]];
            const cross = (b[0] - a[0]) * (c[1] - a[1]) - (b[1] - a[1]) * (c[0] - a[0]);
            if (cross >= 0) continue; // back-facing — skip
            // Centroid depth = average vert z. Smaller = further back.
            let sumZ = 0;
            const fl = face.length;
            for (let k = 0; k < fl; k++) sumZ += projected[face[k]][2];
            meta.push({ idx: f, depth: sumZ / fl });
        }
        // Back-to-front sort so foreground faces overpaint background.
        meta.sort((a, b) => a.depth - b.depth);

        // Fill + stroke each face. Body fillStyle was set by caller;
        // borderCol drives the stroke (orb's dark navy / gold-amber).
        const stroke = Math.max(1, Math.round(r * 0.10));
        ctx.lineWidth = stroke;
        ctx.strokeStyle = borderCol;
        for (let i = 0; i < meta.length; i++) {
            const face = faces[meta[i].idx];
            ctx.beginPath();
            const p0 = projected[face[0]];
            ctx.moveTo(p0[0], p0[1]);
            for (let k = 1; k < face.length; k++) {
                const p = projected[face[k]];
                ctx.lineTo(p[0], p[1]);
            }
            ctx.closePath();
            ctx.fill();
            ctx.stroke();
        }
    }

    _pushOrbInstance(orb) {
        const slotKey = WEBGL_STAR_SHAPES.has(orb.shape) ? orb.shape : 'dot';
        const rgba = this._parseStarColor(orb.color);
        const sizeMul = orb.sizeVariation || 1;
        const drawSize = orb.radius * sizeMul * 1.5;
        const alpha = (orb.opacity ?? 1) * 0.95;
        // 5.79.33 — Orbs (health, gold shape, gold coin) skip the CRT
        //   scanline darkening so they read as game objects, not
        //   background dressing. Gold coins ALSO skip the radial halo
        //   so they render as crisp point-like pixels — user wants
        //   sharp dots, not glowy specks.
        const isCoin = orb.kind === 'coin';
        this.starfieldRenderer.addStar(
            orb.x, orb.y,
            0,
            drawSize,
            rgba[0], rgba[1], rgba[2], alpha,
            orb.twinklePhase || 0,
            orb.twinkleSpeed || 3.5,
            0.45,
            STAR_SLOT_INDEX[slotKey],
            orb.rotation || 0,
            (orb.rotationSpeed || 0) * 60,
            1,                    // noScan = 1
            isCoin ? 1 : 0,       // sharp = 1 for gold coins
        );
    }

    // 5.74.28 — JWST-inspired nebula regions. Instead of scattering
    // single-color blobs across the field, we now generate 4-6 coherent
    // "nebula regions" — each region is a cluster of 5-8 layered clouds
    // at related positions with palette-coordinated colors, mimicking the
    // multi-hue layered structure visible in JWST imagery (Pillars of
    // Creation, Cosmic Cliffs / Carina, Tarantula, Southern Ring, etc).
    //
    // Each region picks a palette template (warm/cool/binary/cold) which
    // defines a few related colors. Layers use mixed atlas slots:
    //   slot 8  (cloud)         — soft gaussian backbone
    //   slot 13 (nebula_wispy)  — anisotropic filaments / streamers
    //   slot 14 (nebula_core)   — dense bright cores / ionization fronts
    // Layers are jittered around the region center with size, alpha, and
    // rotation variation. Result reads as a nebula region with depth,
    // color variation, and structural complexity — all rendered through
    // the same instanced WebGL pipeline as stars (zero new draw calls).
    _populateWebGLNebula() {
        if (!this.starfieldRenderer.supported) return;
        const SLOT_CLOUD = 8;
        const SLOT_WISPY = 13;
        const SLOT_CORE = 14;

        // Palette templates inspired by famous JWST images. Each entry
        // is { core, mid, edge } RGB triplets — core is the brightest
        // hottest tone, mid is the dominant color, edge is the cooler
        // outer halo / dust.
        const PALETTES = [
            // Pillars of Creation — gold/amber dust + teal H II + deep red
            { core: [1.00, 0.95, 0.70], mid: [1.00, 0.55, 0.20], edge: [0.85, 0.20, 0.30] },
            { core: [0.85, 1.00, 0.95], mid: [0.30, 0.85, 0.95], edge: [0.20, 0.40, 0.85] },
            // Cosmic Cliffs (Carina, NGC 3324) — orange ridge + cyan gas + tan dust
            { core: [1.00, 0.85, 0.55], mid: [1.00, 0.45, 0.15], edge: [0.30, 0.85, 0.95] },
            // Tarantula Nebula — magenta + blue + amber
            { core: [1.00, 0.70, 0.95], mid: [0.85, 0.30, 0.85], edge: [0.30, 0.50, 1.00] },
            // Southern Ring — emerald/teal core with violet halo
            { core: [0.65, 1.00, 0.85], mid: [0.30, 0.85, 0.75], edge: [0.65, 0.40, 0.95] },
            // NGC 6334 (Cat's Paw) — deep red core, violet wisps, gold edges
            { core: [1.00, 0.55, 0.40], mid: [0.85, 0.30, 0.55], edge: [1.00, 0.80, 0.35] },
            // Helix-style — gold center, cool teal halo
            { core: [1.00, 0.90, 0.50], mid: [0.65, 0.85, 0.60], edge: [0.30, 0.70, 0.95] },
            // Eagle Nebula greenish — emerald + warm dust
            { core: [0.85, 1.00, 0.65], mid: [0.45, 0.85, 0.40], edge: [1.00, 0.55, 0.30] },
        ];

        // 5.74.30 — sizes scaled back UP (~1.7×) while keeping the dim
        // alphas from 5.74.29. Bigger silhouette = more presence as a
        // background structure, but the low alpha keeps gameplay legible.
        // Region scale 0.7–1.3 (was 0.45–0.85), halo/wispy/core sizes
        // restored toward the 5.74.28 footprint but at the dimmer alpha.
        const NUM_REGIONS = 4;
        for (let r = 0; r < NUM_REGIONS; r++) {
            const palette = PALETTES[(Math.random() * PALETTES.length) | 0];
            const regionX = (0.15 + Math.random() * 0.7) * this.gameField.width;
            const regionY = (0.15 + Math.random() * 0.7) * this.gameField.height;
            const regionAngle = Math.random() * Math.PI * 2;
            const regionScale = 0.70 + Math.random() * 0.60;

            // Outer halo: 1-2 large soft clouds with edge color.
            const haloCount = 1 + ((Math.random() * 2) | 0);
            for (let i = 0; i < haloCount; i++) {
                const ox = (Math.random() - 0.5) * 220 * regionScale;
                const oy = (Math.random() - 0.5) * 220 * regionScale;
                const size = (520 + Math.random() * 220) * regionScale;
                const alpha = 0.05 + Math.random() * 0.04;
                this.starfieldRenderer.addStar(
                    regionX + ox, regionY + oy,
                    0.02 + Math.random() * 0.03,
                    size,
                    palette.edge[0], palette.edge[1], palette.edge[2], alpha,
                    Math.random() * Math.PI * 2,
                    0.03 + Math.random() * 0.05, 0.06,
                    SLOT_CLOUD,
                    Math.random() * Math.PI * 2,
                    (Math.random() - 0.5) * 0.003,
                );
            }

            // Mid-body: 2 wispy filaments aligned to region angle.
            const wispyCount = 2;
            for (let i = 0; i < wispyCount; i++) {
                const along = (Math.random() - 0.5) * 360 * regionScale;
                const across = (Math.random() - 0.5) * 110 * regionScale;
                const ox = Math.cos(regionAngle) * along - Math.sin(regionAngle) * across;
                const oy = Math.sin(regionAngle) * along + Math.cos(regionAngle) * across;
                const size = (360 + Math.random() * 180) * regionScale;
                const alpha = 0.07 + Math.random() * 0.06;
                this.starfieldRenderer.addStar(
                    regionX + ox, regionY + oy,
                    0.03 + Math.random() * 0.04,
                    size,
                    palette.mid[0], palette.mid[1], palette.mid[2], alpha,
                    Math.random() * Math.PI * 2,
                    0.04 + Math.random() * 0.06, 0.08,
                    SLOT_WISPY,
                    regionAngle + (Math.random() - 0.5) * 0.6,
                    (Math.random() - 0.5) * 0.004,
                );
            }

            // Core: 1 dense bright core / ionization front.
            const coreCount = 1;
            for (let i = 0; i < coreCount; i++) {
                const ox = (Math.random() - 0.5) * 150 * regionScale;
                const oy = (Math.random() - 0.5) * 150 * regionScale;
                const size = (230 + Math.random() * 150) * regionScale;
                const alpha = 0.10 + Math.random() * 0.06;
                this.starfieldRenderer.addStar(
                    regionX + ox, regionY + oy,
                    0.04 + Math.random() * 0.04,
                    size,
                    palette.core[0], palette.core[1], palette.core[2], alpha,
                    Math.random() * Math.PI * 2,
                    0.05 + Math.random() * 0.07, 0.10,
                    SLOT_CORE,
                    Math.random() * Math.PI * 2,
                    (Math.random() - 0.5) * 0.005,
                );
            }
        }

        // Drift haze: 3 small lonely clouds scattered across the field.
        const DRIFT_TINTS = [
            [0.20, 0.40, 0.85], [0.40, 0.30, 0.80], [0.30, 0.55, 0.85],
            [0.50, 0.40, 0.75], [0.25, 0.55, 0.75],
        ];
        const DRIFT_COUNT = 3;
        for (let i = 0; i < DRIFT_COUNT; i++) {
            const x = Math.random() * this.gameField.width;
            const y = Math.random() * this.gameField.height;
            const size = 300 + Math.random() * 180;
            const tint = DRIFT_TINTS[(Math.random() * DRIFT_TINTS.length) | 0];
            const alpha = 0.04 + Math.random() * 0.03;
            this.starfieldRenderer.addStar(
                x, y, 0.02 + Math.random() * 0.03,
                size,
                tint[0], tint[1], tint[2], alpha,
                Math.random() * Math.PI * 2,
                0.04 + Math.random() * 0.05, 0.06,
                SLOT_CLOUD,
                Math.random() * Math.PI * 2,
                (Math.random() - 0.5) * 0.003,
            );
        }
    }

    /**
     * Parse a CSS color string into [r, g, b] floats (0..1).
     * Uses a 1×1 offscreen canvas; results cached.
     */
    _parseStarColor(str) {
        if (!this._starColorCache) {
            this._starColorCache = new Map();
            this._starColorCanvas = document.createElement('canvas');
            this._starColorCanvas.width = 1;
            this._starColorCanvas.height = 1;
            this._starColorCtx = this._starColorCanvas.getContext('2d', { willReadFrequently: true });
        }
        let v = this._starColorCache.get(str);
        if (v) return v;
        const ctx = this._starColorCtx;
        ctx.clearRect(0, 0, 1, 1);
        ctx.fillStyle = str || '#ffffff';
        ctx.fillRect(0, 0, 1, 1);
        const px = ctx.getImageData(0, 0, 1, 1).data;
        v = [px[0] / 255, px[1] / 255, px[2] / 255];
        this._starColorCache.set(str, v);
        return v;
    }
    
    // Spawn a single color star using simple random generation (for replacement color stars)
    spawnColorStar() {
        // Use game field dimensions for full coverage, same as other star generation
        const spawnWidth = this.gameField.width;
        const spawnHeight = this.gameField.height;
        
        // Simple random position
        const x = random(0, spawnWidth);
        const y = random(0, spawnHeight);
        
        // Same depth distribution as the generative method
        const depthRoll = Math.random();
        let z;
        if (depthRoll < 0.15) { z = random(0.1, 0.3); }      // 15% Very far
        else if (depthRoll < 0.35) { z = random(0.3, 0.6); } // 20% Far
        else if (depthRoll < 0.55) { z = random(0.6, 1.0); } // 20% Mid-far
        else if (depthRoll < 0.70) { z = random(1.0, 1.5); } // 15% Mid
        else if (depthRoll < 0.82) { z = random(1.5, 2.0); } // 12% Mid-close
        else if (depthRoll < 0.91) { z = random(2.0, 2.5); } // 9% Close
        else if (depthRoll < 0.97) { z = random(2.5, 3.0); } // 6% Very close
        else { z = random(3.0, 4.0); }                      // 3% Foreground
        
        // Simple density value (not using complex noise function for individual stars)
        const density = 0.5 + Math.random() * 0.3; // Random density between 0.5-0.8
        
        const colorStar = this.colorStarPool.get(x, y, false, z, density);
    }
    

    
    spawnAsteroidOffscreen() { return wave.spawnAsteroidOffscreen.call(this); }
    
    createDebris(ast) { return combat.createDebris.call(this, ast); }

    updateWaveSystem() { return wave.updateWaveSystem.call(this); }

    getWaveSubtitle(waveNumber) { return wave.getWaveSubtitle.call(this, waveNumber); }

    showWaveComplete() { return wave.showWaveComplete.call(this); }
    
    // Wavy rainbow text used for wave-message overlays and the title screen.
    drawWavyText(text, x, y, options) { return hudOverlays.drawWavyText.call(this, text, x, y, options); }
    
    drawTitleScreen() { return hudOverlays.drawTitleScreen.call(this); }
    
    startNextWave() { return wave.startNextWave.call(this); }

    spawnWaveEntities() { return wave.spawnWaveEntities.call(this); }

    spawnAsteroids(count) { return wave.spawnAsteroids.call(this, count); }

    spawnEnemies(count) { return wave.spawnEnemies.call(this, count); }

    spawnLeveledAsteroids(count, opts) { return wave.spawnLeveledAsteroids.call(this, count, opts); }

    spawnLeveledEnemies(enemyType, count, opts) { return wave.spawnLeveledEnemies.call(this, enemyType, count, opts); }

    initializeLeveledAsteroid(asteroid, opts) { return wave.initializeLeveledAsteroid.call(this, asteroid, opts); }
    
    applyEnemyLevelScaling(enemy, opts = {}) { return wave.applyEnemyLevelScaling.call(this, enemy, opts); }

    completeWave() { return wave.completeWave.call(this); }
    completeRun() { return wave.completeRun.call(this); }
    openWaveClearPowerupsMenu() { return wave.openWaveClearPowerupsMenu.call(this); }
    // 5.98.0 — Mobile wave-clear 3-pick overlay.
    openWavePickOverlay() { return wave.openWavePickOverlay.call(this); }
    closeWavePickOverlay() { return wave.closeWavePickOverlay.call(this); }
    // 5.101.0 — shop-suggestion overlay (3 weapon-relevant upgrades).
    openShopSuggestOverlay() { return wave.openShopSuggestOverlay.call(this); }
    renderShopSuggestOverlay() { return wave.renderShopSuggestOverlay.call(this); }
    // 5.75.0 — mission system bindings.
    checkMissionOnKill() { return wave.checkMissionOnKill.call(this); }
    checkMissionOnCrit() { return wave.checkMissionOnCrit.call(this); }
    checkMissionOnAsteroidDestroy() { return wave.checkMissionOnAsteroidDestroy.call(this); }
    checkMissionOnDamage() { return wave.checkMissionOnDamage.call(this); }
    resolveMissionOnWaveClear() { return wave.resolveMissionOnWaveClear.call(this); }
    
    sellShopItem(itemId) { return shop.sellShopItem.call(this, itemId); }

    openShop() { return shop.openShop.call(this); }
    checkCapstoneUnlocks() { return shop.checkCapstoneUnlocks.call(this); }

    _rebuildShopCache() { return shop._rebuildShopCache.call(this); }

    _buildPrimaryTabItems(weaponId = null) { return shop._buildPrimaryTabItems.call(this, weaponId); }

    _buildPowerTabItems(weaponId = null) { return shop._buildPowerTabItems.call(this, weaponId); }

    // Phase 7 (2026-05-19) — Unified item list for the skill-tree shop.
    _buildTreeItems() { return shop._buildTreeItems.call(this); }

    // 6.1.0 — POWERUPS tab restored. Builds a gold-priced list from
    // POWERUP_TYPES (see shop-manager._buildPowerupsTabItems).
    _buildPowerupsTabItems() { return shop._buildPowerupsTabItems.call(this); }
    _buildPassiveTabItems() { return shop._buildPassiveTabItems.call(this); }
    closeShop() { return shop.closeShop.call(this); }
    closeShopToPlaying() { return shop.closeShopToPlaying.call(this); }
    closeShopAndReturn() { return shop.closeShopAndReturn.call(this); }

    buyShopItem(itemId) { return shop.buyShopItem.call(this, itemId); }

    _handleUpgradeBuy(item) { return shop._handleUpgradeBuy.call(this, item); }
    
    getPowerupConfig(type) { return combat.getPowerupConfig.call(this, type); }
    onEnemyKill(enemy) { return combat.onEnemyKill.call(this, enemy); }
    updateKillStreak() { return combat.updateKillStreak.call(this); }

    queueNotification(title, subtitle, duration) { return wave.queueNotification.call(this, title, subtitle, duration); }

    processNotificationQueue() { return wave.processNotificationQueue.call(this); }

    // 5.79.60 — drawShop / drawShopTabs / drawShopItem /
    //   drawMultilineText wrappers removed. The legacy canvas shop
    //   was replaced by the HTML overlay (shop-dom.js) in earlier
    //   patches; nothing called these four methods anymore. The
    //   `import * as shopRenderer` at the top of this file was
    //   dropped in the same cleanup.
    startNewWave() { return wave.startNewWave.call(this); }
    
    spawnWaveAsteroids() { return wave.spawnWaveAsteroids.call(this); }
    startEnemySubWave() { return wave.startEnemySubWave.call(this); }
    
    initializeWaveAsteroid(asteroid, opts) { return wave.initializeWaveAsteroid.call(this, asteroid, opts); }

    // Legacy method - replaced by startNewWave and sub-wave system

    forceSpawnEntity() { return wave.forceSpawnEntity.call(this); }
    forceSpawnEnemy() { return wave.forceSpawnEnemy.call(this); }
    forceSpawnAsteroid() { return wave.forceSpawnAsteroid.call(this); }
    isInMinimapArea(worldX, worldY) { return wave.isInMinimapArea.call(this, worldX, worldY); }

    getRandomSpawnPosition(opts) { return wave.getRandomSpawnPosition.call(this, opts); }
    getOnScreenSpawnPosition(opts) { return wave.getOnScreenSpawnPosition.call(this, opts); }

    getRandomEnemyType() { return wave.getRandomEnemyType.call(this); }
    
    spawnContinuousAsteroid() { return wave.spawnContinuousAsteroid.call(this); }
    spawnRandomEnemy() { return wave.spawnRandomEnemy.call(this); }
    
    createEnemyDebris(enemy) { return combat.createEnemyDebris.call(this, enemy); }
    triggerEnemyFinalExplosion(enemy) { return combat.triggerEnemyFinalExplosion.call(this, enemy); }
    triggerEnemyDebrisBurst(enemy) { return combat.triggerEnemyDebrisBurst.call(this, enemy); }
    createShapeDebris(enemy) { return combat.createShapeDebris.call(this, enemy); }

    // Phase 3 — BRN / STUN status procs. Called from collision-system.js
    // at the Arc Lightning + Lance Beam hit paths. Refresh-style; no
    // immunity gap on repeated stun (user requirement).
    applyBurn(enemy, sourceDmg, durationMs) { return combat.applyBurn(enemy, sourceDmg, durationMs); }
    applyStun(enemy, durationMs) { return combat.applyStun(enemy, durationMs); }

    // Phase 6 (2026-05-19) — Cluster Launcher detonation hooks. Called
    // from `Bullet._detonate` when a cluster bomb's armed timer expires
    // or an enemy enters its proximity radius (primary), or when a
    // sub-bomblet's flight-time elapses (sub).
    detonateCluster(x, y, baseDamage, baseRadius, subBombCount, opts) {
        return combat.detonateCluster.call(this, x, y, baseDamage, baseRadius, subBombCount, opts);
    }
    detonateSubBomblet(x, y, baseDamage, baseRadius) {
        return combat.detonateSubBomblet.call(this, x, y, baseDamage, baseRadius);
    }
    spawnSubBomblet(x, y, angle, speed, opts) {
        return combat.spawnSubBomblet.call(this, x, y, angle, speed, opts);
    }

    // Phase 4 (2026-05-19) — Nova Chain Reaction secondary spawn.
    //   Pushes a smaller nova ring onto the player's `novaRings` queue
    //   at (x,y). The ring inherits the same shape as the primary nova
    //   spawned by `fireNova` (player/weapons.js:849) so the renderer +
    //   collision loops handle it identically.
    //
    //   Parameters:
    //     x, y           — detonation origin (killed enemy's position)
    //     radiusFrac     — multiplier on base NOVA_BLAST.ringRadius
    //     damageFrac     — multiplier on base NOVA_BLAST.ringDamage
    //     hopsRemaining  — chain depth budget left for further chains
    //                      (0 = terminal; collision site WILL NOT chain
    //                      from this ring again).
    //
    //   Hop-cap is enforced at TWO sites for defense in depth:
    //     1. The caller (collision-system.checkNovaCollisions) only
    //        invokes this when `hopsRemaining > 0`.
    //     2. This helper hard-clamps `hopsRemaining` to [0, 3] so a bad
    //        caller can't smuggle in a runaway value.
    _spawnSecondaryNova(x, y, radiusFrac = 0.6, damageFrac = 0.4, hopsRemaining = 0) {
        const p = this.player;
        if (!p) return;
        const cfg = POWER_WEAPONS.NOVA_BLAST;
        if (!cfg) return;

        // Hard ceiling — defensive clamp regardless of caller input.
        const clampedHops = Math.max(0, Math.min(3, hopsRemaining | 0));

        const shockwaveStacks = (typeof p.getPowerupStacks === 'function')
            ? p.getPowerupStacks('SHOCKWAVE') : 0;
        const baseRingMax = cfg.ringRadius + shockwaveStacks * 40;
        const ringMax = baseRingMax * radiusFrac;
        const dmg = cfg.ringDamage * damageFrac;

        if (!Array.isArray(p.novaRings)) p.novaRings = [];
        p.novaActive = true;
        p.novaRings.push({
            x, y,
            currentRadius: 0,
            maxRadius: ringMax,
            damage: dmg,
            duration: cfg.ringDuration,
            elapsed: 0,
            hitEnemies: new Set(),
            hitAsteroids: new Set(),
            // Secondaries don't re-roll Aftershock — primary already had
            // its chance; otherwise a deep chain would multiply slow-AoE
            // beyond design.
            aftershock: false,
            active: true,
            // Phase 4 — chain bookkeeping. The collision loop reads this
            // to decide whether further chains may spawn from THIS ring's
            // kills. Hard ceiling of 3 enforced above.
            _hopsRemaining: clampedHops,
            _isSecondary: true,
        });

        // Light VFX at the secondary origin so the chain reads as a real
        // mini-detonation rather than a silent ring birth. Mirrors the
        // first-frame flash from fireNova() but scaled to the smaller
        // radius. Burst sizes are bounded so a 3-hop cascade can't spike
        // particle counts.
        if (this.particlePool) {
            const ORANGE = '#ffaa00';
            const ORANGE_BRIGHT = '#ffe080';
            this.particlePool.get(x, y, 'explosionFlash', Math.max(20, ringMax * 0.35));
            for (let i = 0; i < 10; i++) {
                const ang = (i / 10) * Math.PI * 2 + (Math.random() - 0.5) * 0.4;
                this.particlePool.get(x, y, 'explosionShrapnel', ang, 3 + Math.random() * 4,
                    i % 2 === 0 ? ORANGE_BRIGHT : ORANGE);
            }
        }

        return p.novaRings[p.novaRings.length - 1];
    }

    createHealthOrb(x, y, healAmountOverride = null) { return combat.createHealthOrb.call(this, x, y, healAmountOverride); }
    createMoneyOrb(x, y, moneyAmountOverride = null, isPixel = false) { return combat.createMoneyOrb.call(this, x, y, moneyAmountOverride, isPixel); }
    dropStarsFromEntity(x, y) { return combat.dropStarsFromEntity.call(this, x, y); }
    dropOrbsFromEntity(x, y, entity = null) { return combat.dropOrbsFromEntity.call(this, x, y, entity); }
    
    dropPowerup(x, y, type = null) { return combat.dropPowerup.call(this, x, y, type); }
    collectPowerup(powerup) { return combat.collectPowerup.call(this, powerup); }
    showPowerupDisplay(name, color, description) { return combat.showPowerupDisplay.call(this, name, color, description); }
    
    drawPowerupDisplay() { return hudCombat.drawPowerupDisplay.call(this); }
    
    drawPowerupIndicators() { return hudCombat.drawPowerupIndicators.call(this); }

    syncPowerupHUD() { return hudCombat.syncPowerupHUD.call(this); }

    setTargetInfo(target) { return combat.setTargetInfo.call(this, target); }
    updateTargetInfo(deltaTime) { return combat.updateTargetInfo.call(this, deltaTime); }
    handleEntityTargeting(worldX, worldY) { return combat.handleEntityTargeting.call(this, worldX, worldY); }
    updateHoverDetection() { return combat.updateHoverDetection.call(this); }
    
    addMoneyPickup(amount) { return combat.addMoneyPickup.call(this, amount); }
    updateMoneyPickupDisplay(deltaTime) { return combat.updateMoneyPickupDisplay.call(this, deltaTime); }
    
    drawMoneyPickupDisplay() { return hudCombat.drawMoneyPickupDisplay.call(this); }
    
    createDamageNumber(x, y, damage, opts) { return combat.createDamageNumber.call(this, x, y, damage, opts); }
    triggerPlayerHitFX(ix, iy, damage) { return combat.triggerPlayerHitFX.call(this, ix, iy, damage); }
    updateDamageNumbers(deltaTime) { return combat.updateDamageNumbers.call(this, deltaTime); }
    // 5.107.0 — Vampirism + Thorns helpers. Called by the damage-
    // dealing / damage-taking sites in collision-system.js. Both are
    // no-ops when the corresponding powerup has zero stacks.
    applyVampirism(damageDealt) { return combat.applyVampirism.call(this, damageDealt); }
    applyThorns(damageTaken, source) { return combat.applyThorns.call(this, damageTaken, source); }
    // 5.108.0 — Guardian / Static Discharge / Whirlwind hooks.
    tryConsumeGuardian() { return combat.tryConsumeGuardian.call(this); }
    tickStaticDischarge() { return combat.tickStaticDischarge.call(this); }
    tickWhirlwind() { return combat.tickWhirlwind.call(this); }

    drawDamageNumbers() { return hudCombat.drawDamageNumbers.call(this); }

    // Phase 3 — BRN / STUN icon + particle overlay over status-afflicted
    // enemies. Walks `enemyPool.activeObjects`; cheap for the common
    // case where no enemies are afflicted.
    drawStatusIcons() { return hudStatusIcons.drawStatusIcons.call(this); }

    drawTargetInfo() { return hudCombat.drawTargetInfo.call(this); }

    // 5.74.18 — taking damage no longer resets the kill streak. The
    // existing damage-path callsites still call this for back-compat
    // but it's now a no-op. Streak now decays only on a 30s no-kill
    // timeout (see combat-manager.updateKillStreak).
    _breakKillStreak() { /* intentional no-op — see comment above */ }

    // Snapshot the most recently hit target so the top-center info panel
    // can keep rendering for a grace period after the entity dies / the
    // pool recycles it. Same target re-hits just refresh the snapshot
    // (no flicker). A new target replaces it.
    _setLastHit(target) {
        if (!target || !target.active) return;
        this.lastHitEnemy = target;
        const name = (target.config && target.config.name)
            ? target.config.name.toUpperCase()
            : 'ASTEROID';
        this.lastHitInfo = {
            ref: target,
            name,
            level: target.level || 1,
            health: target.health,
            maxHealth: target.maxHealth,
            expireAt: Date.now() + this.LAST_HIT_GRACE_MS,
        };
    }
    
    handleCollisions() { return col.handleCollisions.call(this); }
    handleWeaponEffectCollisions() { return col.handleWeaponEffectCollisions.call(this); }
    checkLanceBeamCollisions() { return col.checkLanceBeamCollisions.call(this); }
    checkMineCollisions() { return col.checkMineCollisions.call(this); }
    checkNovaCollisions() { return col.checkNovaCollisions.call(this); }
    checkLightningCollisions() { return col.checkLightningCollisions.call(this); }
    checkMissileCollisions() { return col.checkMissileCollisions.call(this); }
    checkDeflectorOrbCollisions() { return col.checkDeflectorOrbCollisions.call(this); }
    checkTractorShieldCollisions() { return col.checkTractorShieldCollisions.call(this); }
    damageEnemy(enemy, damage) { return col.damageEnemy.call(this, enemy, damage); }
    applyDamageToEnemy(enemy, damage, opts) { return col.applyDamageToEnemy.call(this, enemy, damage, opts); }
    destroyAsteroid(ast) { return col.destroyAsteroid.call(this, ast); }
    // Mine defensive plasma shield zone — 6.23.0 (2026-05-19), refactored
    //   from Phase 5. Shield now comes from PLAYER mines that own the
    //   MINE_SHIELD_RADIUS upgrade (set on the mine at lay-time via
    //   skills.js). If the player is standing inside any of their own
    //   armed mine's shield zone, refund 40% of damage taken. Done as a
    //   thin wrapper here (rather than in collision-system.js) so the
    //   underlying collision pipeline stays untouched — all the FX,
    //   damage numbers, thorns, kill-streak break, and death checks
    //   run on the pre-mitigation damage; we heal back the 40%
    //   afterward. Net HP delta matches a 0.6 multiplier.
    //   The `mineShieldFlash` particle fires on every damage event where
    //   the refund applied, so the shield reads as a Star-Wars-style
    //   edge flash instead of a persistent aura.
    getMineShieldMultiplier() { return combat.getMineShieldMultiplier(this.player); }
    isPlayerInMineShield() { return combat.isPlayerInMineShield(this.player); }
    _applyMineShieldRefund(player, hpBefore) {
        const shieldMine = combat.getActivePlayerMineShield(player);
        if (!shieldMine) return;
        // Only refund if the player actually lost HP and is still alive
        // (don't resurrect — death already triggered tank consumption /
        // guardian / handlePlayerDeath inside the collision handler).
        if (player.health <= 0) return;
        const dmgTaken = hpBefore - player.health;
        if (dmgTaken <= 0) return;
        const mult = 0.6;
        const refund = Math.round(dmgTaken * (1 - mult)); // refund 40%
        if (refund <= 0) return;
        const cap = (typeof player.getCurrentMaxHp === 'function')
            ? player.getCurrentMaxHp()
            : (player.maxHealth || hpBefore);
        player.health = Math.min(cap, player.health + refund);
        if (this.game && this.game.stats) {
            this.game.stats.totalDamageTaken = Math.max(
                0, (this.game.stats.totalDamageTaken || 0) - refund
            );
        }
        // Star-Wars / Star-Trek-style edge flash on hit. Drawn AT the
        //   mine center using its shield radius; the particle renders a
        //   bright ring right at the shield perimeter so the player sees
        //   exactly which mine soaked the shot.
        if (this.particlePool && this.particlePool.get) {
            this.particlePool.get(
                shieldMine.x, shieldMine.y,
                'mineShieldFlash',
                shieldMine.shieldRadius || 120,
                '#5cc8ff',
            );
        }
    }
    handlePlayerEnemyCollision(player, enemy) {
        const hpBefore = player.health;
        const result = col.handlePlayerEnemyCollision.call(this, player, enemy);
        this._applyMineShieldRefund(player, hpBefore);
        return result;
    }
    handlePlayerEnemyBulletCollision(player, bullet) {
        const hpBefore = player.health;
        const result = col.handlePlayerEnemyBulletCollision.call(this, player, bullet);
        this._applyMineShieldRefund(player, hpBefore);
        return result;
    }
    handleEnemyAsteroidCollision(enemy, asteroid) { return col.handleEnemyAsteroidCollision.call(this, enemy, asteroid); }

    // ── Multiplayer wiring (MVD slice, 2026-05-13) ──────────────────────────
    update() {
        // Radial menu (E/R/F held) freezes gameplay just like the pause menu —
        // particles still finish their lifetimes but no entity logic ticks.
        const radialOpen = this.radialMenu && this.radialMenu.isOpen();
        if (radialOpen) {
            this.particlePool.updateActive();
            this.lineDebrisPool.updateActive();
            this.asteroidShardPool.updateActive();
            return;
        }
        if (this.game.state === GAME_STATES.PLAYING || this.game.state === GAME_STATES.WAVE_TRANSITION) {
            // Tick game timers (only during active gameplay — frozen during PAUSED/SHOP)
            const timerDt = GAME_CONFIG.LOGIC_TICK_MS;
            for (let i = this._gameTimers.length - 1; i >= 0; i--) {
                const t = this._gameTimers[i];
                t.tick(timerDt);
                if (t.done) this._gameTimers.splice(i, 1);
            }

            // Update survival timer.
            // 6.18.5 — Accumulate by logic-tick rather than reading
            // wall-clock from `gameStartTime`. The wall-clock path
            // kept ticking during PAUSED/SHOP/title-overlay states,
            // so a player who paused for 5 minutes saw their
            // "survival time" jump by 5 minutes of phantom progress.
            // This block is already gated by PLAYING/WAVE_TRANSITION,
            // so adding LOGIC_TICK_MS here counts only frames where
            // gameplay actually advanced.
            if (this.game.gameStartTime > 0) {
                this.game.survivalTime += GAME_CONFIG.LOGIC_TICK_MS;
            }
            
            const input = this.inputHandler.getInput();
            // Add the update method to the input object so player can call it
            input.updateAimForPlayerMovement = this._boundAimForPlayerMovement;

            // ── Mobile tower-defense mode (5.94.0) ───────────────────────
            // No auto-pilot — the player is stationary on mobile. Movement
            // input is gated off at the Player.update level via isMobile().
            // The only inputs are tap-to-aim-and-fire and the PRM/PWR HUD
            // buttons, both handled by js/modules/ui/mobile-touch.js.

            // Respawn is now instant - no animation needed

            // Safety: chargePaused should never be true during gameplay — it's only
            // valid during SHOP/PAUSED states (when this code path doesn't run).
            // If it's stuck true from an edge case, force-clear it.
            if (this.player.chargePaused) {
                this.player.chargePaused = false;
            }

            // Calculate tractor beam state - active when not charging
            const tractorEngaged = !this.player.isCharging;

            // Normal gameplay updates
            this.player.update(input, this.particlePool, this.bulletPool, this.audioManager, this.colorStarPool, tractorEngaged, this.gameField);

            // 6.23.0 (2026-05-19) — Mine shield zone tracking.
            //   Originally (Phase 5) we fired a one-shot crossing sparkle
            //   when the player entered an ENEMY-mine shield. The
            //   shield now belongs to PLAYER mines and renders ON HIT
            //   only (see `_applyMineShieldRefund`, which spawns the
            //   `mineShieldFlash` particle each time damage is mitigated).
            //   The boolean is still tracked here so other systems (e.g.
            //   the HUD / status overlays) can query `player._inMineShield`
            //   if they want a passive indicator.
            {
                const insideShield = combat.isPlayerInMineShield(this.player);
                this.player._inMineShield = insideShield;
            }

            // 5.108.0 — Passive AoE powerups tick AFTER the player has
            // moved this frame so their positions key off the latest
            // ship coords. Both early-return cheaply when their
            // powerup has zero stacks; safe to call unconditionally.
            this.tickStaticDischarge();
            this.tickWhirlwind();

            // Update camera to follow player
            this.updateCamera();
            
            // Target info updates removed for cleaner UI
            // this.updateTargetInfo(16); // Assume 60fps
            
            // Update money pickup display
            this.updateMoneyPickupDisplay(GAME_CONFIG.LOGIC_TICK_MS);

            // Update damage numbers
            this.updateDamageNumbers(GAME_CONFIG.LOGIC_TICK_MS);
            
            // Update hover detection
            this.updateHoverDetection();

            // Update kill streak timer
            this.updateKillStreak();
            
            // Clean up targeted entity if it's no longer active
            if (this.targetedEntity && !this.targetedEntity.active) {
                this.targetedEntity = null;
            }

            // Last-hit panel: while the entity is alive, mirror its current
            // HP into the snapshot. When it dies (or the pool recycles it
            // for a different entity), keep the last snapshot for the grace
            // period so the panel doesn't disappear-then-reappear between
            // rapid kills.
            const now = Date.now();
            if (this.lastHitEnemy && this.lastHitEnemy.active &&
                this.lastHitInfo && this.lastHitInfo.ref === this.lastHitEnemy) {
                this.lastHitInfo.health = this.lastHitEnemy.health;
                this.lastHitInfo.expireAt = now + this.LAST_HIT_GRACE_MS;
            }
            if (this.lastHitEnemy && !this.lastHitEnemy.active) {
                this.lastHitEnemy = null;
            }
            if (this.lastHitInfo && now > this.lastHitInfo.expireAt) {
                this.lastHitInfo = null;
            }
            
            this.bulletPool.activeObjects.forEach(bullet =>
                bullet.update(this.particlePool, this.asteroidPool, this.enemyPool, this, this.gameField));
            this.bulletPool.cleanupInactive();
            this.particlePool.updateActive();
            this.lineDebrisPool.updateActive();
            this.asteroidShardPool.updateActive();
            this.powerupPool.activeObjects.forEach(p => p.update(this.player, tractorEngaged, this.particlePool));
            // Inject gameEngine ref for asteroids (needed for targeting highlight in draw)
            for (const a of this.asteroidPool.activeObjects) a.gameEngine = this;
            this.asteroidPool.updateActive(this.gameField);
            this.asteroidPool.cleanupInactive();

            // 5.115.0 — Tick formations BEFORE individual enemy AI so
            // each member's position is formation-adjusted before its
            // own AI runs (the AI may still rotate / aim / shoot, but
            // its movement output gets overridden by the lerp toward
            // the formation slot target). Ended formations are
            // released here too.
            if (this.formationManager) this.formationManager.update();

            // Update enemies and enemy bullets (only during active gameplay)
            this.enemyPool.activeObjects.forEach(enemy => enemy.update(this.player, this, this.gameField));
            this.enemyPool.cleanupInactive();
            // 5.115.0 — Soft separation pass: overlapping enemies push
            // each other apart with no damage. Keeps formations from
            // collapsing into a single point and reads as natural
            // "they avoid each other" behavior.
            _separateEnemies(this.enemyPool.activeObjects);
            // Inject gameEngine ref for enemy bullets (needed for particle effects on death)
            for (const eb of this.enemyBulletPool.activeObjects) eb.gameEngine = this;
            this.enemyBulletPool.updateActive();
            this.enemyBulletPool.cleanupInactive();
            
            // Update color stars with player position and tractor beam state
            this.colorStarPool.activeObjects.forEach(s => s.update(this.player.vel, this.player, tractorEngaged, this.gameField, this.particlePool));
            // 5.79.32 — Gold drops (coins + shapes) integrate motion +
            //   lifetime + blink. Independent classes — each calls
            //   its own update(). No homing; tractor pulls them in
            //   when engaged. Inactive entries are released.
            const playerPos = this.player ? { x: this.player.x, y: this.player.y } : null;
            for (let i = this.goldCoinPool.activeObjects.length - 1; i >= 0; i--) {
                const c = this.goldCoinPool.activeObjects[i];
                c.update(playerPos, tractorEngaged);
                if (!c.active) this.goldCoinPool.release(c);
            }
            for (let i = this.goldShapePool.activeObjects.length - 1; i >= 0; i--) {
                const s = this.goldShapePool.activeObjects[i];
                s.update(playerPos, tractorEngaged);
                if (!s.active) this.goldShapePool.release(s);
            }
            // 5.98.0 — Stat-pickup tick + cleanup. Same shape as gold.
            for (let i = this.statPickupPool.activeObjects.length - 1; i >= 0; i--) {
                const p = this.statPickupPool.activeObjects[i];
                p.update(playerPos, tractorEngaged);
                if (!p.active) this.statPickupPool.release(p);
            }
            // Update background stars with player velocity for parallax.
            // 5.97.0 — Mobile mode has a stationary ship, so player.vel is
            // always zero and the starfield would freeze. Inject a gentle
            // synthetic drift so the world still feels alive while the
            // player aims. 5.99.3 — bumped amplitudes + added nebula
            // drift so the background reads as constantly evolving.
            let bgDrift = this.player.vel;
            if (this.mobile) {
                bgDrift = this._mobileBackgroundDrift();
                this._accumulateMobileNebulaDrift(bgDrift);
            }
            this.backgroundStarPool.activeObjects.forEach(s => s.update(bgDrift, this.gameField));

            // 5.64.16 — feed cumulative ship drift to the WebGL star
            // renderer so its vertex shader applies parallax (the GPU
            // version replaces the per-star CPU mutation that BackgroundStar
            // and ColorStar do for their Canvas2D positions).
            // 5.97.0 — On mobile, feed the synthetic drift here too so the
            // GPU starfield gets the same wandering parallax as the CPU
            // pool (otherwise the WebGL layer would sit static while the
            // Canvas2D stars drift).
            if (this.starfieldRenderer.accumulateDrift) {
                if (this.mobile) {
                    this.starfieldRenderer.accumulateDrift(bgDrift.x, bgDrift.y);
                } else if (this.player && this.player.vel) {
                    this.starfieldRenderer.accumulateDrift(this.player.vel.x, this.player.vel.y);
                }
            }

            // 5.68.2 — fade the contextual hint overlay if the player ship
            // or mouse cursor is overlapping its bounding rect. Keeps
            // tooltips out of the way during action without forcing them
            // to dismiss.
            if (this.player && this.player.active) {
                const ph = this.player;
                const screenX = ph.x - this.camera.x;
                const screenY = ph.y - this.camera.y;
                const mouseX = (this.inputHandler && this.inputHandler.input)
                    ? this.inputHandler.input.screenAimX
                    : -9999;
                const mouseY = (this.inputHandler && this.inputHandler.input)
                    ? this.inputHandler.input.screenAimY
                    : -9999;
                updateHintDimming(screenX, screenY, ph.radius || 14, mouseX, mouseY);
            }
            
            this.handleCollisions();
            
            // Update powerup display fade
            if (this.powerupDisplay.active) {
                this.powerupDisplay.fadeTimer--;
                if (this.powerupDisplay.fadeTimer <= 0) {
                    this.powerupDisplay.active = false;
                } else {
                    // Smooth fade out
                    this.powerupDisplay.opacity = this.powerupDisplay.fadeTimer / this.powerupDisplay.maxFadeTime;
                }
            }

            // Performance: Clean up inactive objects periodically.
            // 6.18.6 — Gate on whole-second change rather than the
            // raw `floor(survivalTime/1000) % N === 0` predicate so
            // the sweep fires once per N-second boundary instead of
            // ~60 times per trigger second.
            const currentSecond = Math.floor(this.game.survivalTime / 1000);
            if (currentSecond !== this._lastCleanupSecond &&
                currentSecond % GAME_CONFIG.PARTICLE_CLEANUP_INTERVAL === 0) {
                this._lastCleanupSecond = currentSecond;
                this.particlePool.cleanupInactive();
                this.lineDebrisPool.cleanupInactive();
                this.asteroidShardPool.cleanupInactive();
                this.powerupPool.cleanupInactive();
                this.bulletPool.cleanupInactive();
                this.enemyBulletPool.cleanupInactive();
            }
            
            // Update wave system to check for completion and progression
            this.updateWaveSystem();
            
            this.uiManager.updateScore(this.game.money);
        } else if (this.game.state === GAME_STATES.GAME_OVER || this.game.state === GAME_STATES.PAUSED) {
            this.particlePool.updateActive();
            this.lineDebrisPool.updateActive();
            this.asteroidShardPool.updateActive();
            // Stars twinkle but don't drift when paused — player can't move in these states
            // 5.99.3 — Mobile keeps the synthetic drift running through
            // PAUSED / GAME_OVER so the background never freezes (the
            // user explicitly asked for constant background motion on
            // mobile). Desktop stays frozen so a paused game reads as
            // paused. Same for SHOP below.
            let driftPaused = { x: 0, y: 0 };
            if (this.mobile) {
                driftPaused = this._mobileBackgroundDrift();
                this._accumulateMobileNebulaDrift(driftPaused);
                if (this.starfieldRenderer.accumulateDrift) {
                    this.starfieldRenderer.accumulateDrift(driftPaused.x, driftPaused.y);
                }
            }
            this.backgroundStarPool.activeObjects.forEach(s => s.update(driftPaused, this.gameField));
        } else if (this.game.state === GAME_STATES.SHOP) {
            // When in shop, only update background stars for ambiance.
            let driftShop = { x: 0, y: 0 };
            if (this.mobile) {
                driftShop = this._mobileBackgroundDrift();
                this._accumulateMobileNebulaDrift(driftShop);
                if (this.starfieldRenderer.accumulateDrift) {
                    this.starfieldRenderer.accumulateDrift(driftShop.x, driftShop.y);
                }
            }
            this.backgroundStarPool.activeObjects.forEach(s => s.update(driftShop, this.gameField));
            // Keep existing particles moving but don't create new ones
            this.particlePool.updateActive();
            this.lineDebrisPool.updateActive();
            this.asteroidShardPool.updateActive();
        } else if (this.game.state === GAME_STATES.TITLE_SCREEN) {
            // Sandstorm-grade chaotic drift — multiple sine waves at
            // distinct frequencies sum into a fast, direction-shifting
            // motion. Near-depth stars rip across the field while far
            // ones drift more gently thanks to background-star.js's
            // parallaxFactor.
            const t = Date.now() * 0.001;
            const drift = {
                x: Math.cos(t * 1.7) * 7
                 + Math.sin(t * 0.4) * 4.5
                 + Math.cos(t * 3.1) * 2.5,
                y: Math.sin(t * 1.3) * 5.5
                 + Math.cos(t * 0.7) * 3
                 + Math.sin(t * 2.9) * 2.5,
            };
            this.backgroundStarPool.activeObjects.forEach(s => s.update(drift, this.gameField));

            // 5.79.24 — Feed the synthetic drift into the WebGL starfield
            //   too. Without this, the background stars rendered by the
            //   GPU sit static while only the (mostly empty) Canvas2D
            //   pool moves — title screen reads as a frozen field.
            //   Mirrors the in-game `accumulateDrift(player.vel)` call.
            if (this.starfieldRenderer.accumulateDrift) {
                this.starfieldRenderer.accumulateDrift(drift.x, drift.y);
            }

            // Lens-flare nebula drift accumulator — multiplier kept low
            // so the lens flare stars feel much further away than the
            // foreground starfield. We negate so the nebula drifts in the
            // same direction as the background stars (which move opposite
            // to `drift`).
            const NEB_DRIFT_MUL = 0.18;
            const NEB_DRIFT_LIMIT = 8000;
            let nx = (this._titleNebulaDriftX || 0) - drift.x * NEB_DRIFT_MUL;
            let ny = (this._titleNebulaDriftY || 0) - drift.y * NEB_DRIFT_MUL;
            if (nx >  NEB_DRIFT_LIMIT) nx =  NEB_DRIFT_LIMIT;
            if (nx < -NEB_DRIFT_LIMIT) nx = -NEB_DRIFT_LIMIT;
            if (ny >  NEB_DRIFT_LIMIT) ny =  NEB_DRIFT_LIMIT;
            if (ny < -NEB_DRIFT_LIMIT) ny = -NEB_DRIFT_LIMIT;
            this._titleNebulaDriftX = nx;
            this._titleNebulaDriftY = ny;

            // Slow combined-frequency rotation for the lens flare layers.
            // Two slow sinusoids sum into a wandering angular offset of
            // ≈ ±0.19 rad. Per-layer scaling by depth (inside
            // nebula-renderer.js) keeps the deepest layer nearly still
            // while the closest layer rotates noticeably — same depth feel
            // as the drift parallax, just rotational instead of positional.
            //   sin(t*0.18)·0.13  →  period ≈ 35s
            //   cos(t*0.07)·0.06  →  period ≈ 90s
            this._titleNebulaRotation =
                Math.sin(t * 0.18) * 0.13 + Math.cos(t * 0.07) * 0.06;

            // Tick the title-launch animation if it's running. When it
            // completes, fire the stored callback (which kicks off init()).
            const a = this._titleAnimState();
            if (a.phase === 'launch' && Date.now() - a.startTime >= a.duration) {
                a.phase = 'done';
                if (a.onComplete) {
                    const cb = a.onComplete;
                    a.onComplete = null;
                    cb();
                }
            }
        }
    }
    
    draw() {
        // Clear gameCanvas to TRANSPARENT each frame so the WebGL particle
        // layer underneath (glCanvas) shows through. The black void of the
        // game comes from glCanvas's CSS background + the page body bg.
        // Stars, nebula, entities, weapon effects all draw on top of this
        // transparent layer; particles render on the GL layer beneath.
        this.ctx.clearRect(0, 0, this.width, this.height);

        // 5.79.2 — clear the bullet canvas once per frame regardless of
        //   game state so the title screen / pause overlays don't sit
        //   behind stale bullet sprites. drawFrame() is also called
        //   unconditionally at the end so any stale instance buffer is
        //   flushed (no-op when no instances were pushed).
        this.bulletRenderer.beginFrame();

        // 5.64.16 — clear the GL layer ONCE per frame (was previously
        // done inside particleRenderer.drawParticles). Doing it here
        // lets the starfield renderer draw BEFORE particles without
        // having its output wiped.
        if (this.particleRenderer.supported && !this.particleRenderer._contextLost) {
            const gl = this.particleRenderer.gl;
            gl.viewport(0, 0, this.glCanvas.width, this.glCanvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
            // WebGL starfield draws BEFORE everything else on the GL
            // layer — particles will render on top via additive blend.
            // Drift is integrated each frame from player.vel below.
            const timeSec = (typeof performance !== 'undefined' && performance.now)
                ? performance.now() * 0.001
                : Date.now() * 0.001;
            // 5.78.0 — re-flush the starfield instance buffer if any
            // pool churn marked it dirty. No-op on the typical frame.
            this._flushStarfieldIfDirty();
            // 5.79.24 — Repopulate the transient suffix with active
            //   gold/health orbs at their CURRENT world positions.
            //   `resetTransients()` rewinds instanceCount to the
            //   permanent baseline; `_pushOrbsToWebGL()` appends one
            //   instance per active orb. Both no-op when WebGL is off.
            if (this.starfieldRenderer.resetTransients) {
                this.starfieldRenderer.resetTransients();
                this._pushOrbsToWebGL();
            }
            this.starfieldRenderer.setFieldSize(this.gameField.width, this.gameField.height);
            this.starfieldRenderer.draw(
                this.camera.x, this.camera.y,
                this.glCanvas.width, this.glCanvas.height,
                timeSec,
            );
        }

        // Render the parallax starfield + nebula on every state EXCEPT the
        // pre-init splash. Title screen now uses the same world background
        // (with a synthetic camera drift driven by update()) so the menu
        // sits on top of an animated starfield instead of a black void.
        {
            // Apply camera transformation for world objects.
            // 5.96.0 — Zoom-around-canvas-center transform before the
            //   camera translate. On mobile (portrait 0.65 / landscape
            //   0.8) this shows MORE world per screen pixel; desktop
            //   uses zoom=1 so the transform collapses to identity.
            this.ctx.save();
            const zoom = (this.camera && this.camera.zoom) || 1;
            if (zoom !== 1) {
                this.ctx.translate(this.width / 2, this.height / 2);
                this.ctx.scale(zoom, zoom);
                this.ctx.translate(-this.width / 2, -this.height / 2);
            }
            this.ctx.translate(-this.camera.x, -this.camera.y);
            
            // Nebula layer — deepest background, before all stars
            // Title screen feeds an extra drift to the nebula so the lens
            // flare layers wander even when the camera isn't moving — and
            // applies it scaled by depth, so the closest layer drifts most
            // (but the deepest barely moves, giving a "much-farther-away"
            // parallax feel relative to the foreground starfield). Also
            // pipes a slow rotation so the lens flare layers tumble.
            const onTitle = this.game.state === GAME_STATES.TITLE_SCREEN;
            const nebDriftX = onTitle ? (this._titleNebulaDriftX || 0) : 0;
            const nebDriftY = onTitle ? (this._titleNebulaDriftY || 0) : 0;
            const nebRot    = onTitle ? (this._titleNebulaRotation || 0) : 0;
            nebulaRenderer.draw(
                this.ctx,
                this.camera.x, this.camera.y,
                nebDriftX, nebDriftY,
                nebRot, this.width, this.height,
            );

            // 5.64.16 — split rendering: stars whose `_inWebGL` flag is
            // set are drawn by the WebGL starfield (above, on glCanvas).
            // The Canvas2D depth-batch path now handles ONLY:
            //   • backgroundStars NOT in WebGL (none, by default)
            //   • colorStars NOT in WebGL — i.e. sparkle / burst /
            //     collectible orbs which the simple atlas can't render
            // Toggle: GAME_CONFIG.WEBGL_STARFIELD_KEEP_CANVAS_FALLBACKS
            // controls whether Canvas2D draws the fallbacks at all.
            const visibleBackgroundStars = this.getVisibleStars(this.backgroundStarPool.activeObjects);
            const visibleColorStars = this.getVisibleStars(this.colorStarPool.activeObjects);

            const keepCanvas = GAME_CONFIG.WEBGL_STARFIELD_KEEP_CANVAS_FALLBACKS !== false;
            if (keepCanvas) {
                // Strip stars already rendered on WebGL.
                const canvasBg = visibleBackgroundStars.filter(s => !s._inWebGL);
                const canvasColor = visibleColorStars.filter(s => !s._inWebGL);

                depthBatchRenderer.groupStarsByDepth(canvasBg, canvasColor);
                depthBatchRenderer.renderDepthBatches(this.ctx);

                // Render complex color stars that need special effects (not batched).
                canvasColor.forEach(star => {
                    if (star.active && (star.isBurst || star.shape === 'sparkle' || star.shape === 'burst')) {
                        star.draw(this.ctx);
                    }
                });
            }
            
            // Viewport-culled rendering — off-screen objects skip draw() entirely.
            // Generous padding ensures particles/trails/glow don't pop in at edges.
            // 5.96.0 — When `camera.zoom` < 1 the visible world window
            //   expands by 1/zoom around the canvas center. The cull
            //   bounds widen to match so zoomed-out players don't lose
            //   entities at the screen edges.
            const pad = 120;
            const visW = this.width / zoom;
            const visH = this.height / zoom;
            const cx = this.camera.x + this.width / 2;
            const cy = this.camera.y + this.height / 2;
            const vL = cx - visW / 2 - pad;
            const vT = cy - visH / 2 - pad;
            const vR = cx + visW / 2 + pad;
            const vB = cy + visH / 2 + pad;

            // Entity / HUD rendering — skipped on the pre-init title screen
            // since pools are empty and the player ship would otherwise
            // appear at the center of the menu.
            if (this.game.state !== GAME_STATES.TITLE_SCREEN) {
                this.lineDebrisPool.drawActiveVisible(this.ctx, vL, vT, vR, vB);
                this.asteroidShardPool.drawActiveVisible(this.ctx, vL, vT, vR, vB);
                // Two-layer particle render — every bright/glowing type
                // (embers, flashes, sparkles, classic explosion fragments,
                // shrapnel streaks, expanding rings) draws on the WebGL
                // layer underneath gameCanvas via one instanced draw
                // call. The Canvas2D pass below handles the remaining
                // shape-only / text particle types that WebGL doesn't
                // own (`particleRenderer.handlesType` decides).
                this.particleRenderer.drawParticles(
                    this.particlePool,
                    this.camera.x, this.camera.y,
                    vL, vT, vR, vB,
                );
                drawParticlesBatched(this.particlePool, this.ctx, vL, vT, vR, vB, this.particleRenderer);
                this.powerupPool.drawActiveVisible(this.ctx, vL, vT, vR, vB);
                // 5.79.33 — Gold coins render here as hard fillRect
                //   pixels (above the world layer, below entities) so
                //   they read as crisp point-like collectibles.
                // 5.118.0 — Renamed to _drawGoldSparklesCanvas2D; the
                //   tiny pieces now sparkle/twinkle with shape variety
                //   (square / circle / dot) to feel like treasure dust.
                this._drawGoldSparklesCanvas2D(this.ctx, vL, vT, vR, vB);
                // 5.117.0 — Gold SHAPES (gems) render on Canvas2D too
                // so they can carry per-shape colors + a thick black
                // stroke. Pulled off the WebGL atlas (which couldn't
                // express per-instance borders).
                this._drawGoldShapesCanvas2D(this.ctx, vL, vT, vR, vB);
                this._drawHealthShapesCanvas2D(this.ctx, vL, vT, vR, vB);
                // 5.98.0 — Stat pickups render between gold/health and
                // asteroids/enemies so they sit on top of the drop layer
                // and never get hidden behind a passing rock.
                this.statPickupPool.drawActiveVisible(this.ctx, vL, vT, vR, vB);
                this.asteroidPool.drawActiveVisible(this.ctx, vL, vT, vR, vB);
                this.enemyPool.drawActiveVisible(this.ctx, vL, vT, vR, vB);

                // Phase 3 — BRN / STUN status overlays drawn in world
                // space, on top of the enemy silhouette so flames + bolts
                // sit visibly over the body. Also spawns short-lived
                // particles (burnFlame / stunArc) into particlePool —
                // those render on the next draw cycle as part of the
                // particle pass.
                this.drawStatusIcons();

                // 5.79.2 — Bullet bodies render on WebGL via the
                //   instanced renderer (bulletCanvas). Trails still
                //   draw on Canvas2D below — the trail loop wasn't the
                //   dominant cost. beginFrame() / drawFrame() are also
                //   called unconditionally below at the end of draw()
                //   so the bulletCanvas stays cleared on title-screen
                //   frames; here we just push instances.
                this.enemyBulletPool.drawActiveVisible(this.ctx, vL, vT, vR, vB, this);
                this.bulletPool.drawActiveVisible(this.ctx, vL, vT, vR, vB, this);

                this.player.draw(this.ctx);

                this.drawWeaponEffects();

                // Laser-pointer aim — subtle line from muzzle to bullet's
                // max range, with a tick at the end and reticles around
                // any entities the shot will hit/pierce. Drawn in the
                // world-space camera transform so it stays anchored to
                // the ship as the camera moves/shakes.
                this.drawLaserPointerAim();

                // Draw game field boundaries
                this.drawGameFieldBoundaries();
            }

            this.ctx.restore();

            if (this.game.state !== GAME_STATES.TITLE_SCREEN) {
                // Draw UI elements without camera transformation
                // Sync DOM powerup HUD
                this.syncPowerupHUD();

                // Draw powerup display at top
                this.drawPowerupDisplay();

                // Draw off-screen entity indicators
                this.drawOffScreenIndicators();

                // Draw minimap (5.72.1 — disabled per user request).
                // this.drawMinimap();

                // Draw spawn countdown timer (hidden per user request)
                // this.drawSpawnTimer();

                // Draw jitter circle to show bullet spread area
                this.drawJitterCircle();

                // 5.95.1 — Mobile reticle DISABLED in 5.100.1. The
                // 5.100.0 pivot to drag-to-move + auto-aim means the
                // player never aims manually on mobile, so a reticle
                // following the auto-aim target (or stale touch coords)
                // is visual noise. The auto-aim target's identity is
                // communicated via the bullets flying that way and the
                // enemy's own hit-flash feedback.

                // 5.88.0 — respawn / post-respawn invincibility countdown
                // removed entirely. The tank-based hit model has no respawn
                // window: hits cost a tank, hp refills, gameplay continues.
            }
        }

        // 5.79.2 — flush the bullet WebGL layer once at the end of draw()
        //   regardless of game state. On title screen this just emits a
        //   no-op (no instances pushed) but the beginFrame() clear at
        //   the top still wipes any stale bullets, letting the title
        //   show through unobstructed.
        const bcamX = this.camera.x - (this._frameScreenOffsetX || 0);
        const bcamY = this.camera.y - (this._frameScreenOffsetY || 0);
        this.bulletRenderer.drawFrame(bcamX, bcamY);
    }
    
    drawHUD() { return hudStatus.drawHUD.call(this); }

    drawWaveIntroOverlay() { return hudStatus.drawWaveIntroOverlay.call(this); }

    /**
     * Black overlay that fades from opaque to clear over `duration` ms after
     * the title launch animation hands off to init(). Picks up where the
     * launch fade-to-black left off so the screen never flashes between
     * the title sequence and the playfield reveal.
     */
    drawPostInitFadeIn() {
        const f = this._postInitFade;
        if (!f) return;
        const elapsed = Date.now() - f.startTime;
        if (elapsed >= f.duration) {
            this._postInitFade = null;
            return;
        }
        const alpha = 1 - elapsed / f.duration;
        if (alpha <= 0.001) return;
        this.ctx.save();
        this.ctx.fillStyle = `rgba(0, 0, 0, ${alpha})`;
        this.ctx.fillRect(0, 0, this.width, this.height);
        this.ctx.restore();
    }

    drawGameComplete() { return hudStatus.drawGameComplete.call(this); }

    drawWeaponEffects() { return weaponFx.drawWeaponEffects.call(this); }

    drawSkillCooldownHUD() { return hudStatus.drawSkillCooldownHUD.call(this); }

    // 5.99.2 — Canvas-rendered pickup toast (replaces the dead
    // showMessage / #game-message-overlay DOM path). Set by
    // triggerPickupToast and rendered each frame in drawHUD until the
    // duration expires.
    drawPickupToast() { return hudStatus.drawPickupToast.call(this); }
    triggerPickupToast({ title, subtitle, accentColor, duration = 1800 } = {}) {
        this._pickupToast = {
            title: title || '',
            subtitle: subtitle || '',
            accentColor: accentColor || '#33ddff',
            startAt: Date.now(),
            duration,
        };
    }
    
    drawCursorCooldownTimer() { return hudCursor.drawCursorCooldownTimer.call(this); }
    
    updateCamera() { return cam.updateCamera.call(this); }
    screenToWorldCoordinates(screenX, screenY) { return cam.screenToWorldCoordinates.call(this, screenX, screenY); }
    isEntityOnScreen(entity, buffer = 50) { return cam.isEntityOnScreen.call(this, entity, buffer); }
    getVisibleStars(stars) { return cam.getVisibleStars.call(this, stars); }
    
    drawGameFieldBoundaries() {
        this.ctx.save();
        this.ctx.strokeStyle = '#444444';
        this.ctx.lineWidth = 2;
        this.ctx.setLineDash([10, 10]);
        this.ctx.strokeRect(0, 0, this.gameField.width, this.gameField.height);
        this.ctx.setLineDash([]);
        this.ctx.restore();
    }
    
    drawOffScreenIndicators() { return hudNav.drawOffScreenIndicators.call(this); }

    drawMinimap() { return hudNav.drawMinimap.call(this); }
    
    // Optimized starfield rendering with batching and sprite caching
    renderOptimizedStarfield() {
        // Background stars - all get batched (simple circles)
        for (const star of this.backgroundStarPool.activeObjects) {
            if (star.active) {
                star.draw(this.ctx); // Prepares rendering properties
                starfieldRenderer.addStarToBatch(star, 'background');
            }
        }
        
        // Color stars - simple shapes get batched, complex ones render directly
        for (const star of this.colorStarPool.activeObjects) {
            if (star.active) {
                star.draw(this.ctx); // Handles complex stars directly + prepares properties
                
                // Only add simple shapes to batch (complex ones already rendered by star.draw())
                if (!star.isBurst && star.shape !== 'sparkle' && star.shape !== 'burst') {
                    starfieldRenderer.addStarToBatch(star, 'color');
                }
            }
        }
        
        // Render all batched stars in one efficient pass
        starfieldRenderer.renderBatchedStars(this.ctx);
    }

    drawJitterCircle() { return hudCursor.drawJitterCircle.call(this); }

    drawLaserPointerAim() { return hudCursor.drawLaserPointerAim.call(this); }

    // 5.95.1 — Mobile touch-position reticle dispatcher.
    drawMobileReticle() { return hudMobileReticle.drawMobileReticle.call(this); }
    
    triggerHitstop(frames) { return cam.triggerHitstop.call(this, frames); }
    triggerCameraKick(dx, dy, magnitude) { return cam.triggerCameraKick.call(this, dx, dy, magnitude); }
    triggerScreenFlash(alpha, duration) { return cam.triggerScreenFlash.call(this, alpha, duration); }
    triggerGoldScreenFlash(alpha, duration) { return cam.triggerGoldScreenFlash.call(this, alpha, duration); }

    gameLoop() {
      try {
        frameClock.advance();
        const frameStart = performance.now();

        // ── Hitstop: selective freeze — entities stop, VFX/player keep going ──
        if (this._hitstopFrames > 0) {
            this._hitstopFrames--;
            // Keep lastFrameTime current so temporal upsampling doesn't burst-update after hitstop
            this.lastFrameTime = frameStart;

            // Keep VFX alive during hitstop — particles and debris continue expanding
            // while gameplay entities are frozen. This contrast sells "impact" not "lag".
            this.particlePool.updateActive();
            this.lineDebrisPool.updateActive();
            this.asteroidShardPool.updateActive();

            // Player keeps moving during offensive hitstop (movement is survival)
            if (this.player && this.player.active &&
                (this.game.state === GAME_STATES.PLAYING || this.game.state === GAME_STATES.WAVE_TRANSITION)) {
                const input = this.inputHandler.getInput();
                input.updateAimForPlayerMovement = this._boundAimForPlayerMovement;
                // Update player movement only (firing is suppressed by not running collisions)
                this.player.update(input, this.particlePool, this.bulletPool, this.audioManager,
                    this.colorStarPool, !this.player.isCharging, this.gameField);
                this.updateCamera();
            }

            // Damage numbers and money pickups keep animating
            this.updateDamageNumbers(GAME_CONFIG.LOGIC_TICK_MS);
            this.updateMoneyPickupDisplay(GAME_CONFIG.LOGIC_TICK_MS);

            // Render full frame
            this.ctx.save();
            const kickX = this._cameraKickX || 0;
            const kickY = this._cameraKickY || 0;
            if (kickX || kickY) this.ctx.translate(kickX, kickY);
            this.draw();
            this.ctx.restore();
            this.drawHUD();
            // FLICKER FIX: hitstop fires on every hit (3-5 frames), and used
            // to skip drawTargetInfo — making the top-center enemy panel
            // pop out for the duration of the freeze, then back in. Now we
            // draw it during hitstop too, so the panel stays solid.
            if (!this._shouldHideTopHud()) this.drawTargetInfo();
            // 5.72.3 — drawMoneyPickupDisplay disabled. It rendered a "+N"
        // text near the OLD top-left coin position, which is now empty
        // (gold moved to bottom-right in 5.72.0). The new goldPopups
        // system in drawBottomRightGold replaces it with proper
        // BR-anchored, arc-trajectory popups.
        // this.drawMoneyPickupDisplay();
            this.drawDamageNumbers();
            // Screen flash overlay
            if (this._screenFlashAlpha > 0) {
                this.ctx.fillStyle = `rgba(255,255,255,${this._screenFlashAlpha})`;
                this.ctx.fillRect(0, 0, this.width, this.height);
                this._screenFlashAlpha -= this._screenFlashAlpha / (this._screenFlashDuration || 1);
            }
            // 5.85.0 — gold flash channel (life-loss feedback)
            if (this._goldFlashTimer > 0) {
                const ga = (this._goldFlashTimer / (this._goldFlashDuration || 1)) * (this._goldFlashAlpha || 0);
                this.ctx.save();
                this.ctx.globalCompositeOperation = 'lighter';
                this.ctx.fillStyle = `rgba(255, 215, 0, ${ga})`;
                this.ctx.fillRect(0, 0, this.width, this.height);
                this.ctx.restore();
                this._goldFlashTimer--;
            }
            // Wave intro overlay — disabled for now so the warp-in visuals
            // stay visible. Re-enable by uncommenting the call below.
            // this.drawWaveIntroOverlay();
            this.drawPostInitFadeIn();
            recordVFXFrame(this);
            requestAnimationFrame(() => this.gameLoop());
            return;
        }

        // ── Camera kick decay ──
        if (this._cameraKickX) {
            this._cameraKickX *= 0.7; // fast exponential decay
            if (Math.abs(this._cameraKickX) < 0.3) this._cameraKickX = 0;
        }
        if (this._cameraKickY) {
            this._cameraKickY *= 0.7;
            if (Math.abs(this._cameraKickY) < 0.3) this._cameraKickY = 0;
        }

        // OPT-7: Fixed-timestep accumulator — logic runs at 60 Hz, render at display refresh.
        if (this.useTemporalUpsampling) {
            const dt = Math.min(frameStart - this.lastFrameTime, 100); // cap large gaps
            this.lastFrameTime = frameStart;
            this.logicAccumulator += dt;
            let steps = 0;
            while (this.logicAccumulator >= this.logicTickRate && steps < this.maxLogicStepsPerFrame) {
                // Advance the audio scheduling cursor before running the
                // tick so any sounds emitted by this update() get stamped
                // at this tick's logical time, not the wall-clock instant
                // we happen to be running it on. Without this, multi-step
                // catch-up frames pile every sound onto the same audio
                // currentTime → audible "burst after delay" pattern.
                this.audioManager.beginLogicTick(this.logicTickRate);
                this.update();
                this.logicAccumulator -= this.logicTickRate;
                steps++;
            }
            // Spiral-of-death guard: drop accumulated time if we fell too far behind
            if (steps >= this.maxLogicStepsPerFrame) this.logicAccumulator = 0;
        } else {
            this.audioManager.beginLogicTick(GAME_CONFIG.LOGIC_TICK_MS || 16.6667);
            this.update();
        }

        this.ctx.save();

        // ── Camera kick (directional impact lurch) ──
        let kickX = this._cameraKickX || 0;
        let kickY = this._cameraKickY || 0;
        // 5.79.2 — track the per-frame total screen offset (shake + kick)
        //   in screen pixels so the WebGL bullet renderer can apply the
        //   same translation to its draw call. Without this, bullets
        //   wouldn't shake/kick with the rest of the frame.
        let frameShakeX = 0;
        let frameShakeY = 0;

        if (this.game.screenShakeDuration > 0) {
            // Enhanced shake — stronger random component for punchier feel
            const time = Date.now() * 0.01;
            const shakeIntensity = this.game.screenShakeMagnitude * (this.game.screenShakeDuration / this.game.originalShakeMagnitude);

            // Multi-frequency shake with dominant random jitter (Vlambeer style)
            const dx = Math.sin(time * 17) * shakeIntensity * 0.25 +
                      (Math.random() - 0.5) * shakeIntensity * 0.75;
            const dy = Math.cos(time * 13) * shakeIntensity * 0.25 +
                      (Math.random() - 0.5) * shakeIntensity * 0.75;

            this.ctx.translate(dx + kickX, dy + kickY);
            frameShakeX = dx + kickX;
            frameShakeY = dy + kickY;
            this.game.screenShakeDuration--;

            // Smooth decay of shake magnitude
            if (this.game.screenShakeDuration > 0) {
                this.game.screenShakeMagnitude = Math.max(0, this.game.screenShakeMagnitude - this.game.shakeDecayRate);
            } else {
                this.game.screenShakeMagnitude = 0;
            }
        } else if (kickX || kickY) {
            this.ctx.translate(kickX, kickY);
            frameShakeX = kickX;
            frameShakeY = kickY;
        }
        this._frameScreenOffsetX = frameShakeX;
        this._frameScreenOffsetY = frameShakeY;
        
        this.draw();
        this.ctx.restore();
        
        // Draw HUD elements outside of screen shake transform
        this.drawHUD();
        
        // Top-center panel for the most recently hit enemy.
        if (!this._shouldHideTopHud()) this.drawTargetInfo();
        
        // Draw money pickup display
        // 5.72.3 — drawMoneyPickupDisplay disabled. It rendered a "+N"
        // text near the OLD top-left coin position, which is now empty
        // (gold moved to bottom-right in 5.72.0). The new goldPopups
        // system in drawBottomRightGold replaces it with proper
        // BR-anchored, arc-trajectory popups.
        // this.drawMoneyPickupDisplay();
        
        // Draw damage numbers
        this.drawDamageNumbers();
        
        // Draw cursor cooldown timer
        if (this.game.state === GAME_STATES.PLAYING) {
            this.drawCursorCooldownTimer();
        }
        
        if (this.game.state === GAME_STATES.GAME_OVER) {
            this.ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
            this.ctx.fillRect(0, 0, this.width, this.height);
            // 5.88.4 — proper screen with NEW GAME / RESTART WAVE buttons.
            this.drawGameOverScreen();
        }
        
        // Shop UI is rendered as an HTML overlay (#shop-overlay) — no canvas
        // drawing needed. See js/modules/shop/shop-dom.js for the renderer
        // and the open/close lifecycle in shop-manager.js.
        
        // Screen flash overlay (kill feedback — drawn over everything except cursor)
        if (this._screenFlashTimer > 0) {
            const flashAlpha = (this._screenFlashTimer / this._screenFlashDuration) * this._screenFlashAlpha;
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'lighter';
            this.ctx.fillStyle = `rgba(255, 255, 255, ${flashAlpha})`;
            this.ctx.fillRect(0, 0, this.width, this.height);
            this.ctx.restore();
            this._screenFlashTimer--;
        }

        // 5.85.0 — gold-tinted flash for life-loss feedback. Layers on top
        // of (and outlasts) the white death-flash so the moment reads as a
        // distinct "Triforce shattered" beat rather than another hit.
        if (this._goldFlashTimer > 0) {
            const goldAlpha = (this._goldFlashTimer / (this._goldFlashDuration || 1)) * (this._goldFlashAlpha || 0);
            this.ctx.save();
            this.ctx.globalCompositeOperation = 'lighter';
            this.ctx.fillStyle = `rgba(255, 215, 0, ${goldAlpha})`;
            this.ctx.fillRect(0, 0, this.width, this.height);
            this.ctx.restore();
            this._goldFlashTimer--;
        }

        // Death overlay — brief dark tint after player death
        if (this._deathOverlayTimer > 0) {
            const dt = this._deathOverlayTimer;
            const dd = this._deathOverlayDuration;
            // Ramp up quickly, fade out slowly
            const progress = 1 - dt / dd;
            const alpha = progress < 0.15
                ? (progress / 0.15) * 0.18  // ramp up
                : 0.18 * (dt / (dd * 0.85)); // fade out
            this.ctx.fillStyle = `rgba(0, 0, 20, ${Math.max(0, alpha)})`;
            this.ctx.fillRect(0, 0, this.width, this.height);
            this._deathOverlayTimer--;
        }

        // Wave intro full-screen darken — disabled for now so the warp-in
        // visuals stay visible. Re-enable by uncommenting the call below.
        // this.drawWaveIntroOverlay();
        // Post-init black-to-clear fade-in (wave 1 only, ~700ms).
        this.drawPostInitFadeIn();

        // Final-victory screen — replaces all HUD chrome with the stats readout.
        this.drawGameComplete();

        // Radial menu overlay — drawn over HUD/world but under the custom cursor.
        if (this.radialMenu && this.radialMenu.isOpen()) {
            this.radialMenu.draw(this.ctx);
        }

        // Draw custom cursor (always on top, after all UI elements)
        this.drawCustomCursor();
        
        // VFX telemetry — record effect state for automated analysis
        recordVFXFrame(this);

        // Performance monitoring - warn if frame takes too long
        const frameTime = performance.now() - frameStart;
        if (frameTime > GAME_CONFIG.LOGIC_TICK_MS) { // Over budget for target tick rate
            // Skip some non-critical updates next frame if we're running slow
            this.performanceMode = true;
        } else {
            this.performanceMode = false;
        }
        
        requestAnimationFrame(() => this.gameLoop());
      } catch (err) {
        console.error('Game loop error:', err);
        // Keep the loop alive even if a frame throws
        requestAnimationFrame(() => this.gameLoop());
      }
    }

    // 5.76.2 — state-resume stack. Replaces the divergent
    // `_pausedFromWaveClear` flag + shop's `shopReturnState` with a
    // single LIFO stack of `{ state, fromWaveClear? }` frames. Every
    // transition that has a return-to (PLAYING/WAVE_TRANSITION → PAUSED,
    // X → SHOP) pushes; every resume (PAUSED → ?, SHOP → ?) pops and
    // restores. Wave-clear pause uses `fromWaveClear: true` so the
    // resume routes through `startNextWave` instead of re-entering
    // WAVE_TRANSITION mid-air.
    _pushResumeFrame(frame) {
        if (!this._stateResumeStack) this._stateResumeStack = [];
        this._stateResumeStack.push(frame);
    }
    _popResumeFrame() {
        if (!this._stateResumeStack || this._stateResumeStack.length === 0) return null;
        return this._stateResumeStack.pop();
    }
    // Back-compat read-only proxy. Some code paths still set
    // `this._pausedFromWaveClear = true` directly; expose a getter that
    // peeks at the top frame.
    get _pausedFromWaveClear() {
        const top = this._stateResumeStack && this._stateResumeStack[this._stateResumeStack.length - 1];
        return !!(top && top.fromWaveClear);
    }
    set _pausedFromWaveClear(v) {
        if (!this._stateResumeStack) this._stateResumeStack = [];
        const top = this._stateResumeStack[this._stateResumeStack.length - 1];
        if (v) {
            // If top frame already represents a wave-clear, no-op. Else
            // tag it so consumers reading `_pausedFromWaveClear` see it.
            if (top && top.state === GAME_STATES.WAVE_TRANSITION) top.fromWaveClear = true;
            else this._stateResumeStack.push({ state: GAME_STATES.WAVE_TRANSITION, fromWaveClear: true });
        } else if (top && top.fromWaveClear) {
            top.fromWaveClear = false;
        }
    }

    // 5.79.0 — backtick-key Diablo-style stats screen. Pauses the game
    //   while open; closing resumes (unless the player paused via ESC
    //   while the stats screen was up — then closing restores pause).
    toggleStatsScreen() {
        if (!this._statsOverlay) {
            this._statsOverlay = new StatsOverlay(this.uiManager);
            this._statsOverlay.setGameEngine(this);
        }
        return this._statsOverlay.toggle();
    }

    isStatsScreenOpen() { return !!(this._statsOverlay && this._statsOverlay.isOpen()); }

    // 6.36.0 — Open the STATS screen as a wave-clear level-up step. The
    // game is already paused by the wave-clear flow; `onClose` continues
    // into the next wave once the player finishes spending SP.
    openStatsForLevelUp(onClose) {
        if (!this._statsOverlay) {
            this._statsOverlay = new StatsOverlay(this.uiManager);
            this._statsOverlay.setGameEngine(this);
        }
        return this._statsOverlay.openForLevelUp(onClose);
    }

    togglePause() {
        // 6.1.2 — Guard against ESC resuming while a modal "must-pick"
        // overlay is still on screen. The survivor-card overlay (wave-
        // pick) and the post-card shop-suggest overlay BOTH leave the
        // game in GAME_STATES.PAUSED until the player picks / skips —
        // pressing ESC during either would pop the resume frame and
        // call startNextWave() with the overlay still visible, which
        // resumed gameplay invisibly in the background. Short-circuit
        // the toggle when either overlay is visible.
        const wavePickOverlay = document.getElementById('wave-pick-overlay');
        const shopSuggestOverlay = document.getElementById('shop-suggest-overlay');
        const wavePickOpen = wavePickOverlay && wavePickOverlay.style.display === 'flex';
        const shopSuggestOpen = shopSuggestOverlay && shopSuggestOverlay.style.display === 'flex';
        if (wavePickOpen || shopSuggestOpen) return;

        // 5.99.0 — Explicit show/hide of the pause overlay (not via
        // uiManager.togglePause()'s display-string toggle). Pre-5.99 the
        // toggle relied on `style.display === 'flex'` round-tripping,
        // which broke when the wave-pick overlay opened on top of an
        // already-shown pause-overlay (closing wave-pick left pause-
        // overlay 'flex' but state PLAYING, so the next togglePause flip
        // re-paused the game). Direct setStyle calls keep DOM ↔ state in
        // sync regardless of which order overlays opened/closed.
        const overlay = document.getElementById('pause-overlay');
        if (this.game.state === GAME_STATES.PLAYING || this.game.state === GAME_STATES.WAVE_TRANSITION) {
            // Playing/WaveTransition → Paused. Push the prior state so
            // resume can restore it. (For wave-clear pauses, the
            // wave-manager will already have pushed { WAVE_TRANSITION,
            // fromWaveClear: true } before this fires.)
            const top = this._stateResumeStack && this._stateResumeStack[this._stateResumeStack.length - 1];
            const alreadyPushedByWaveClear = top && top.fromWaveClear;
            if (!alreadyPushedByWaveClear) {
                this._pushResumeFrame({ state: this.game.state });
            }
            this.game.state = GAME_STATES.PAUSED;
            if (overlay) overlay.style.display = 'flex';
            // Mirror the post-show side-effects of uiManager.togglePause()
            // (powerups list refresh, music sync, weapon-tab refresh).
            if (this.uiManager) {
                this.uiManager.updatePowerupsList && this.uiManager.updatePowerupsList();
                this.uiManager.syncMusicPlayerState && this.uiManager.syncMusicPlayerState();
                this.uiManager.updatePrimaryTab && this.uiManager.updatePrimaryTab();
                this.uiManager.updatePowerTab && this.uiManager.updatePowerTab();
            }
            if (this.player) this.player.pauseChargeShot();
        } else if (this.game.state === GAME_STATES.PAUSED) {
            // Paused → resume. Pop the frame and route accordingly.
            if (overlay) overlay.style.display = 'none';
            if (this.player) this.player.resumeChargeShot();
            const frame = this._popResumeFrame();
            if (frame && frame.fromWaveClear) {
                this.game.state = GAME_STATES.WAVE_TRANSITION;
                this.startNextWave();
            } else if (frame && frame.state) {
                this.game.state = frame.state;
            } else {
                this.game.state = GAME_STATES.PLAYING;
            }
        } else if (this.game.state === GAME_STATES.SHOP) {
            this.closeShopAndReturn();
        }
    }
    
    closeShopToPause() { return shop.closeShopToPause.call(this); }
    
    triggerScreenShake(duration, magnitude, asteroidSize = 0) { return cam.triggerScreenShake.call(this, duration, magnitude, asteroidSize); }
    
    loadSurvivalRecord() {
        this.game.survivalRecord = parseInt(localStorage.getItem('rainboidsSurvivalRecord')) || 0;
    }
    
    checkSurvivalRecord() {
        if (this.game.survivalTime > this.game.survivalRecord) {
            this.game.survivalRecord = this.game.survivalTime;
            localStorage.setItem('rainboidsSurvivalRecord', this.game.survivalRecord);
        }
    }
    
    formatSurvivalTime(milliseconds) {
        const totalSeconds = Math.floor(milliseconds / 1000);
        const hours = Math.floor(totalSeconds / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        
        if (hours > 0) {
            return `${hours} hours, ${minutes} minutes, ${seconds} seconds`;
        } else if (minutes > 0) {
            return `${minutes} minutes, ${seconds} seconds`;
        } else {
            return `${seconds} seconds`;
        }
    }
    
    start() {
        this.loadSurvivalRecord();
        // Pre-build the parallax starfield + nebula so the title screen has
        // a real animated backdrop instead of an empty void. The full init()
        // path runs again when the player presses a key — this just front-
        // loads the visual pieces.
        this.generateInitialColorStars();
        this.generateBackgroundStars();
        nebulaRenderer.generate(this.gameField.width, this.gameField.height);
        this._populateWebGLNebula();
        // 5.79.24 — Lock the starfield baseline here too (in addition to
        //   init()), so the per-frame `resetTransients()` in the render
        //   loop doesn't rewind to 0 and erase the title screen
        //   starfield. Without this the title screen rendered as a
        //   black void because the baseline was never recorded.
        if (this.starfieldRenderer.setBaseline) this.starfieldRenderer.setBaseline();
        // Center the camera in the gameField so the title screen view is
        // anchored on the playable area's middle (no out-of-field artifacts).
        this.camera.x = (this.gameField.width  - this.width)  / 2;
        this.camera.y = (this.gameField.height - this.height) / 2;
        this.gameLoop();
    }

    // Title-start launch animation state. Driven by drawTitleScreen and
    // gameLoop's title-screen update path.
    _titleAnimState() {
        if (!this._titleAnim) {
            this._titleAnim = {
                phase: 'idle',     // 'idle' → 'launch' → 'done'
                startTime: 0,
                duration: 1900,    // total animation time before init() fires
                onComplete: null,
            };
        }
        return this._titleAnim;
    }

    /**
     * Trigger the title-start launch animation. Stored callback fires once
     * the animation completes; the caller wires init() into the callback so
     * the actual run starts immediately after the screen is fully black.
     *
     * Each press picks a random animation style and seeds per-letter random
     * data — direction vectors, phase offsets, drop delays — so even if the
     * same style is rolled twice it doesn't look identical.
     */
    triggerTitleStart(onComplete) {
        const a = this._titleAnimState();
        if (a.phase === 'launch') return false;
        a.phase = 'launch';
        a.startTime = Date.now();
        a.onComplete = onComplete || null;

        const STYLES = ['twister', 'explosion', 'wave', 'cascade', 'warpdrive', 'pinwheel'];
        a.style = STYLES[Math.floor(Math.random() * STYLES.length)];

        // Per-letter random seeds — fixed for the lifetime of one launch.
        const N = 9; // RAINBOIDS
        const seeds = [];
        for (let i = 0; i < N; i++) {
            seeds.push({
                angle:  Math.random() * Math.PI * 2,
                pitch:  (Math.random() - 0.5) * 0.55,
                speed:  0.85 + Math.random() * 0.35,
                phase:  Math.random() * Math.PI * 2,
                delay:  Math.random() * 280,
                spinDir: Math.random() < 0.5 ? -1 : 1,
            });
        }
        a.letterSeeds = seeds;
        return true;
    }
    
    // Get performance statistics for starfield rendering
    getStarfieldStats() {
        const stats = {
            totalStars: this.backgroundStarPool.activeObjects.length + this.colorStarPool.activeObjects.length,
            backgroundStars: this.backgroundStarPool.activeObjects.length,
            colorStars: this.colorStarPool.activeObjects.length
        };
        
        return stats;
    }
    
    // Debug method - call from console: gameEngine.debugStarfieldPerformance()
    debugStarfieldPerformance() {
        const stats = this.getStarfieldStats();
        const batchStats = depthBatchRenderer.getStats();
        
        return {
            mode: 'depth-batching',
            totalStars: stats.totalStars,
            backgroundStars: stats.backgroundStars,
            colorStars: stats.colorStars,
            depthBuckets: batchStats.depthBuckets,
            batchedStars: batchStats.totalStars,
            frameCount: batchStats.frameCount,
            efficiency: batchStats.depthBuckets <= 5 ? 'excellent' : 
                       batchStats.depthBuckets <= 10 ? 'good' : 'needs optimization'
        };
    }
    
    // Debug method to show live depth batching performance
    showDepthBatchStats() {
        const batchStats = depthBatchRenderer.getStats();
        const totalStars = this.backgroundStarPool.activeObjects.length + this.colorStarPool.activeObjects.length;
        
        return {
            mode: 'depth-batching',
            activeBuckets: batchStats.depthBuckets,
            batchedStars: batchStats.totalStars,
            totalStars: totalStars,
            framesProcessed: batchStats.frameCount,
            efficiency: batchStats.depthBuckets <= 5 ? 'excellent' : 
                       batchStats.depthBuckets <= 10 ? 'good' : 'needs optimization',
            avgStarsPerBucket: batchStats.depthBuckets > 0 ? Math.round(batchStats.totalStars / batchStats.depthBuckets) : 0
        };
    }

    checkCursorTarget(mouseX, mouseY) {
        // Check if cursor is over any enemy
        for (const enemy of this.enemyPool.activeObjects) {
            if (enemy.active) {
                const dx = mouseX - enemy.x;
                const dy = mouseY - enemy.y;
                const distance = Math.hypot(dx, dy);
                if (distance <= enemy.radius) {
                    return 'enemy';
                }
            }
        }
        
        // Check if cursor is over any asteroid
        for (const ast of this.asteroidPool.activeObjects) {
            if (ast.active) {
                const dx = mouseX - ast.x;
                const dy = mouseY - ast.y;
                const distance = Math.hypot(dx, dy);
                if (distance <= ast.radius) {
                    return 'asteroid';
                }
            }
        }
        
        // Check if cursor is over player ship
        if (this.player && this.player.active) {
            const dx = mouseX - this.player.x;
            const dy = mouseY - this.player.y;
            const distance = Math.hypot(dx, dy);
            if (distance <= this.player.radius) {
                return 'player';
            }
        }
        
        // Check if cursor is over any star
        for (const colorStar of this.colorStarPool.activeObjects) {
            if (colorStar.active) {
                const dx = mouseX - colorStar.x;
                const dy = mouseY - colorStar.y;
                const distance = Math.hypot(dx, dy);
                
                // Use enhanced collision radius for orbs to match collection behavior
                let targetRadius = colorStar.radius;
                if (colorStar.isBurst) {
                    // Use appropriate orb collection radius based on type
                    const collectionRadius = colorStar.starType === 'health' ? 
                        GAME_CONFIG.HEALTH_ORB_COLLECTION_RADIUS : 
                        GAME_CONFIG.MONEY_ORB_COLLECTION_RADIUS;
                    targetRadius += collectionRadius;
                }
                
                if (distance <= targetRadius) {
                    return colorStar.isBurst ? 'star' : 'colorStar';
                }
            }
        }
        
        return 'none';
    }
    
    setCursorState(isOverTarget) {
        this.cursor.isOverTarget = isOverTarget;
    }

    // ── Accessibility assists ─────────────────────────────────────────────
    // Persisted toggles for Aim Assist (cursor snap), Auto Aim (track
    // nearest), and Auto Fire (auto-trigger primary + power). Read by
    // player.update each tick.
    _loadAssists() {
        // 6.1.1 — `autoPower` retired. `autoFire` now drives BOTH
        // primary AND power weapon firing — one toggle, both barrels.
        // Mobile bakes Aim Assist / Auto Aim / Auto Fire all ON (tap
        // anywhere on the canvas DASHES, auto-fire handles all shooting).
        // Desktop defaults: all off; user opts in via ASSISTS tab.
        // 6.2.3 — `laserSight` added. Default ON on desktop (preserves
        // the always-on pre-6.2.3 behavior of the muzzle laser + cone
        // visualization); mobile gets it false (mobile already uses the
        // touch-position reticle and never drew the laser anyway).
        const mobile = isMobile();
        const defaults = mobile
            ? { aimAssist: true, autoAim: true, autoFire: true, laserSight: false }
            : { aimAssist: false, autoAim: false, autoFire: false, laserSight: true };
        try {
            const raw = localStorage.getItem('rainboidsAssists');
            const stored = raw ? JSON.parse(raw) : null;
            const merged = stored ? Object.assign({}, defaults, stored) : defaults;
            // Strip the retired `autoPower` field if present in stored.
            delete merged.autoPower;
            if (mobile) {
                // Re-force baked-in toggles ON. Stored value might have
                // flipped them off from a previous desktop session.
                merged.aimAssist = true;
                merged.autoAim   = true;
                merged.autoFire  = true;
            }
            return merged;
        } catch (e) {
            return defaults;
        }
    }

    setAssist(name, value) {
        if (!this.assists || !(name in this.assists)) return;
        this.assists[name] = !!value;
        try {
            localStorage.setItem('rainboidsAssists', JSON.stringify(this.assists));
        } catch (e) { /* localStorage may be unavailable */ }
    }

    // Find the nearest *destructible* threat to a point. Includes enemies,
    // asteroids, and mine-shaped enemy bullets (bombs — they have HP and
    // can be shot). Excludes regular enemy bullets, which can't be hit and
    // would just yank the reticle around when Auto Aim / Aim Assist is on.
    // Returns {x, y, dist, target} or null.
    findNearestTarget(fromX, fromY, maxDist = Infinity) {
        let best = null;
        let bestDistSq = maxDist * maxDist;
        const consider = (obj) => {
            if (!obj || !obj.active) return;
            const dx = obj.x - fromX;
            const dy = obj.y - fromY;
            const d2 = dx * dx + dy * dy;
            if (d2 < bestDistSq) {
                bestDistSq = d2;
                best = obj;
            }
        };
        if (this.enemyPool) for (const e of this.enemyPool.activeObjects) consider(e);
        if (this.asteroidPool) for (const a of this.asteroidPool.activeObjects) consider(a);
        if (this.enemyBulletPool) {
            for (const b of this.enemyBulletPool.activeObjects) {
                if (b && (b.shape === 'mine' || b.shape === 'homing_mine')) consider(b);
            }
        }
        if (!best) return null;
        return { x: best.x, y: best.y, dist: Math.sqrt(bestDistSq), target: best };
    }
    
    drawCustomCursor() { return hudCursor.drawCustomCursor.call(this); }
    
    drawDefaultCrosshair(ctx, x, y) { return hudCursor.drawDefaultCrosshair.call(this, ctx, x, y); }
    drawRedTargetingCursor(ctx, x, y) { return hudCursor.drawRedTargetingCursor.call(this, ctx, x, y); }

    
    takeDamage(damageAmount = this.baseDamage, opts = {}) { return lifecycle.takeDamage.call(this, damageAmount, opts); }
    handlePlayerDeath() { return lifecycle.handlePlayerDeath.call(this); }
    createPlayerShipDebris(x, y, angle) { return lifecycle.createPlayerShipDebris.call(this, x, y, angle); }
    _consumeTank() { return lifecycle._consumeTank.call(this); }
    applyHealthOrbToTanks(orbAmount, amountHealed) { return lifecycle.applyHealthOrbToTanks.call(this, orbAmount, amountHealed); }
    // 5.114.0 — shared overflow → tank accumulator; called from REGEN
    // ticks at max HP so passive regen also pays into the tank bar.
    accumulateOverflowToTank(credit) { return lifecycle.accumulateOverflowToTank.call(this, credit); }
    
    updateHUD() { return hudStatus.updateHUD.call(this); }
    
    findNearestEnemy() { return col.findNearestEnemy.call(this); }

    drawSurvivalTimer(ctx) { return hudOverlays.drawSurvivalTimer.call(this, ctx); }
    drawGameOverScreen() { return hudOverlays.drawGameOverScreen.call(this); }
    drawBottomRightGold(ctx) { return hudStatus.drawBottomRightGold.call(this, ctx); }
    drawPauseButton() { return hudOverlays.drawPauseButton.call(this); }
    drawStopwatchIcon(ctx, x, y, size) { return hudOverlays.drawStopwatchIcon.call(this, ctx, x, y, size); }
    drawCanvasTriforce(ctx, tanks, baseX, baseY) { return hudStatus.drawCanvasTriforce.call(this, ctx, tanks, baseX, baseY); }
    spawnTriforceVaporize(x, y, size) { return hudStatus.spawnTriforceVaporize.call(this, x, y, size); }
    getDisappearingTankPos(tanksBefore, baseX, baseY) { return hudStatus.getDisappearingTankPos(tanksBefore, baseX, baseY); }
    spawnTankRecharge(slotIndex) { return hudStatus.spawnTankRecharge.call(this, slotIndex); }
    drawLevelAndCoinsDisplay(ctx, barX, barY, barHeight) { return hudStatus.drawLevelAndCoinsDisplay.call(this, ctx, barX, barY, barHeight); }
    drawEquippedWeaponSquares(ctx, barX, barY, barHeight) { return hudStatus.drawEquippedWeaponSquares.call(this, ctx, barX, barY, barHeight); }
    drawDefenseIndicators(ctx) { return hudStatus.drawDefenseIndicators.call(this, ctx); }
    triggerWeaponCycleAnim(slot = 'primary') {
        this._weaponCycleAnim = { start: Date.now(), duration: 350, slot };
    }
    drawLevelUpText() { return hudStatus.drawLevelUpText.call(this); }
    
    handlePlayerAsteroidCollision(player, asteroid) { return col.handlePlayerAsteroidCollision.call(this, player, asteroid); }
    
    drawSpawnTimer() { return hudOverlays.drawSpawnTimer.call(this); }
    drawStreakIndicator() { return hudOverlays.drawStreakIndicator.call(this); }
    drawXPBar(ctx, barX, barY, barWidth, barHeight) { return hudStatus.drawXPBar.call(this, ctx, barX, barY, barWidth, barHeight); }
    drawXPLevelBar(ctx) { return hudStatus.drawXPLevelBar.call(this, ctx); }
    drawCircularTimer(ctx, x, y, radius, progress, color, icon, timeRemaining) { return hudOverlays.drawCircularTimer.call(this, ctx, x, y, radius, progress, color, icon, timeRemaining); }
    drawRespawnCountdown() { return hudOverlays.drawRespawnCountdown.call(this); }
    drawInvincibilityCountdown() { return hudOverlays.drawInvincibilityCountdown.call(this); }
    drawGhostPreviews(spawnProgress) { return hudOverlays.drawGhostPreviews.call(this, spawnProgress); }

    generateGhostPosition() {
        const side = Math.floor(Math.random() * 4);
        let x, y;
        
        switch (side) {
            case 0: // Top
                x = Math.random() * this.gameField.width;
                y = -50;
                break;
            case 1: // Right
                x = this.gameField.width + 50;
                y = Math.random() * this.gameField.height;
                break;
            case 2: // Bottom
                x = Math.random() * this.gameField.width;
                y = this.gameField.height + 50;
                break;
            case 3: // Left
                x = -50;
                y = Math.random() * this.gameField.height;
                break;
        }
        
        return { x, y };
    }
    
    drawGhostEnemy(progress) { return hudOverlays.drawGhostEnemy.call(this, progress); }
    drawGhostAsteroid(progress) { return hudOverlays.drawGhostAsteroid.call(this, progress); }
}

// 5.117.0 — Gold-shape silhouette path. Called inside a rotated
// canvas transform (origin at the gem center). Each shape gets
// hardcoded math instead of going through a switch with branches
// per draw — JIT inlines the math nicely and avoids object alloc.
//
// Shapes (matching SHAPE_POOL in world/gold-shape.js):
//   star4 / star5 / star6 / star8 — N-pointed stars with inner
//                                   ratio ~0.45 so the points read.
//   hexagon — regular 6-gon.
//   diamond — square rotated 45° (4 verts).
//   triangle — pointed-up equilateral.
function _gemPath(ctx, shape, r) {
    ctx.beginPath();
    switch (shape) {
        case 'star4': _nStarPath(ctx, r, 4, 0.45); break;
        case 'star5': _nStarPath(ctx, r, 5, 0.42); break;
        case 'star6': _nStarPath(ctx, r, 6, 0.50); break;
        case 'star8': _nStarPath(ctx, r, 8, 0.50); break;
        case 'hexagon': _polyPath(ctx, r, 6); break;
        case 'diamond': {
            ctx.moveTo(0, -r);
            ctx.lineTo(r * 0.85, 0);
            ctx.lineTo(0, r);
            ctx.lineTo(-r * 0.85, 0);
            ctx.closePath();
            break;
        }
        case 'triangle': {
            ctx.moveTo(0, -r);
            ctx.lineTo(r * 0.866, r * 0.5);
            ctx.lineTo(-r * 0.866, r * 0.5);
            ctx.closePath();
            break;
        }
        default: ctx.arc(0, 0, r, 0, Math.PI * 2);
    }
}

// N-pointed star — `points` outer tips alternating with `points`
// inner verts at `innerRatio * r`. Starts pointing up.
function _nStarPath(ctx, r, points, innerRatio) {
    const verts = points * 2;
    for (let i = 0; i < verts; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / points;
        const rr = (i % 2 === 0) ? r : r * innerRatio;
        const x = Math.cos(a) * rr;
        const y = Math.sin(a) * rr;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

// Regular convex polygon — `points` evenly spaced verts.
function _polyPath(ctx, r, points) {
    for (let i = 0; i < points; i++) {
        const a = -Math.PI / 2 + (i * Math.PI * 2) / points;
        const x = Math.cos(a) * r;
        const y = Math.sin(a) * r;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
    }
    ctx.closePath();
}

// 5.115.0 — Soft enemy-enemy separation. Each frame, for every
// overlapping pair, push them apart along the line between centers.
// Strength is half-and-half (each enemy moves the same delta) so
// neither dominates. No damage applied — enemies don't hurt each
// other, they just avoid overlap. O(n²) over active enemies which
// is fine for typical counts (10-20).
//
// Warping enemies + bosses skip the push: warping is the
// invuln/positioning window and bosses have scripted positions that
// should never get nudged off-script.
function _separateEnemies(enemies) {
    const n = enemies.length;
    if (n < 2) return;
    for (let i = 0; i < n; i++) {
        const a = enemies[i];
        if (!a || !a.active || a.warping || a.isBoss) continue;
        const ra = a.radius || 14;
        for (let j = i + 1; j < n; j++) {
            const b = enemies[j];
            if (!b || !b.active || b.warping || b.isBoss) continue;
            const rb = b.radius || 14;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const r = ra + rb;
            const distSq = dx * dx + dy * dy;
            if (distSq <= 0 || distSq >= r * r) continue;
            const dist = Math.sqrt(distSq);
            const overlap = r - dist;
            // Equal split — each enemy moves overlap/2 along the
            // axis of separation. The 0.55 factor is a touch more
            // than 0.5 so overlapping pairs separate in a single
            // tick instead of skating along each other for several.
            const nx = dx / dist;
            const ny = dy / dist;
            const push = overlap * 0.55;
            a.x -= nx * push * 0.5;
            a.y -= ny * push * 0.5;
            b.x += nx * push * 0.5;
            b.y += ny * push * 0.5;
        }
    }
} 
