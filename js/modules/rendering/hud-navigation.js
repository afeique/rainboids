// HUD navigation rendering — minimap, off-screen enemy indicators.
// Each function is called with `.call(this)` where `this` is the GameEngine instance,
// so all `this.*` references work exactly as they did as class methods.

import { GAME_STATES } from '../constants.js';

export function drawMinimap() {
        // Scale minimap on small screens so it doesn't clip
        const minDim = Math.min(this.width, this.height);
        const minimapSize = minDim < 500 ? Math.max(80, Math.floor(minDim * 0.22)) : 150;
        const margin = minimapSize < 120 ? 10 : 20;
        const minimapX = this.width - minimapSize - margin;
        const minimapY = this.height - minimapSize - margin; // Move to bottom right
        const scaleX = minimapSize / this.gameField.width;
        const scaleY = minimapSize / this.gameField.height;

        this.ctx.save();

        // Draw minimap background
        this.ctx.fillStyle = 'rgba(0, 0, 0, 0.7)';
        this.ctx.fillRect(minimapX, minimapY, minimapSize, minimapSize);

        // Draw minimap border
        this.ctx.strokeStyle = '#666666';
        this.ctx.lineWidth = 2;
        this.ctx.strokeRect(minimapX, minimapY, minimapSize, minimapSize);

        // Draw camera view area
        const cameraViewX = minimapX + this.camera.x * scaleX;
        const cameraViewY = minimapY + this.camera.y * scaleY;
        const cameraViewW = this.width * scaleX;
        const cameraViewH = this.height * scaleY;

        this.ctx.strokeStyle = '#00ffff';
        this.ctx.lineWidth = 1;
        this.ctx.strokeRect(cameraViewX, cameraViewY, cameraViewW, cameraViewH);

        // Draw player as blue dot
        if (this.player && this.player.active) {
            const playerX = minimapX + this.player.x * scaleX;
            const playerY = minimapY + this.player.y * scaleY;

            this.ctx.fillStyle = '#00ffff';
            this.ctx.beginPath();
            this.ctx.arc(playerX, playerY, 3, 0, Math.PI * 2);
            this.ctx.fill();
        }

        // Draw asteroids as gray dots
        this.asteroidPool.activeObjects.forEach(asteroid => {
            if (asteroid.active) {
                const astX = minimapX + asteroid.x * scaleX;
                const astY = minimapY + asteroid.y * scaleY;

                this.ctx.fillStyle = '#888888';
                this.ctx.beginPath();
                this.ctx.arc(astX, astY, 2, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });

        // Draw enemies as red dots
        this.enemyPool.activeObjects.forEach(enemy => {
            if (enemy.active) {
                const enemyX = minimapX + enemy.x * scaleX;
                const enemyY = minimapY + enemy.y * scaleY;

                this.ctx.fillStyle = '#ff4444';
                this.ctx.beginPath();
                this.ctx.arc(enemyX, enemyY, 2, 0, Math.PI * 2);
                this.ctx.fill();
            }
        });

        // Minimap label removed - it's obvious what it is

        this.ctx.restore();
}

export function drawOffScreenIndicators() {
        if (!this.player || !this.player.active) return;
        if (this.game.state !== GAME_STATES.PLAYING && this.game.state !== GAME_STATES.WAVE_TRANSITION) return;

        const ctx = this.ctx;
        const w = this.width;
        const h = this.height;

        // ── Segment buffers (pre-allocated, cleared each frame) ──
        const SEGMENTS = 24;
        this._edgeGlow[0].fill(0);
        this._edgeGlow[1].fill(0);
        this._edgeGlow[2].fill(0);
        this._edgeGlow[3].fill(0);
        const edges = {
            top:    this._edgeGlow[0],
            bottom: this._edgeGlow[1],
            left:   this._edgeGlow[2],
            right:  this._edgeGlow[3],
        };

        // Fade-in margin: entities within this many px INSIDE the screen edge
        // contribute a partial glow so it doesn't pop in.
        const fadeMargin = 120;

        // Distance falloff — use screen diagonal so nearby = bright
        const screenDiag = Math.sqrt(w * w + h * h);
        const maxDist = screenDiag * 3;

        // ── Accumulate with sub-segment interpolation ──
        const addEntity = (entity) => {
            if (!entity || !entity.active) return;

            const sx = entity.x - this.camera.x;
            const sy = entity.y - this.camera.y;

            // How far past each edge (negative = still on-screen by that amount)
            const pastTop    = -sy;
            const pastBottom = sy - h;
            const pastLeft   = -sx;
            const pastRight  = sx - w;

            // Entity must be past (or within fadeMargin of) at least one edge
            const maxPast = Math.max(pastTop, pastBottom, pastLeft, pastRight);
            if (maxPast < -fadeMargin) return;

            // Distance from screen center for intensity falloff
            // Use squared falloff (1 - (d/max)^2) so nearby entities are much brighter,
            // and a single enemy just off-screen produces a clearly visible glow.
            const dx = sx - w * 0.5;
            const dy = sy - h * 0.5;
            const dist = Math.sqrt(dx * dx + dy * dy);
            const t = Math.min(1, dist / maxDist);
            const distIntensity = Math.max(0.15, 1 - t * t); // floor of 0.15 per entity
            if (distIntensity < 0.01) return;

            // Helper: spread contribution across neighboring segments (tent filter)
            const contribute = (arr, t, intensity) => {
                // t is 0..1 position along edge; map to fractional segment index
                const fi = Math.max(0, Math.min(SEGMENTS - 0.001, t * SEGMENTS));
                const lo = Math.floor(fi);
                const frac = fi - lo;
                // Linear interpolation to two neighboring segments
                arr[lo] += intensity * (1 - frac);
                if (lo + 1 < SEGMENTS) arr[lo + 1] += intensity * frac;
            };

            // For each edge the entity is near/past, compute edge-proximity alpha
            // edgePast > 0 means off-screen; -fadeMargin..0 means approaching edge
            const addEdge = (edgePast, arr, alongT) => {
                if (edgePast < -fadeMargin) return;
                // Ramp: 0 at -fadeMargin, 1 at edge (0), stays 1 beyond
                const edgeFade = edgePast >= 0 ? 1 : (edgePast + fadeMargin) / fadeMargin;
                contribute(arr, alongT, distIntensity * edgeFade);
            };

            const tx = Math.max(0, Math.min(1, sx / w)); // normalized x along horiz edges
            const ty = Math.max(0, Math.min(1, sy / h)); // normalized y along vert edges
            addEdge(pastTop,    edges.top,    tx);
            addEdge(pastBottom, edges.bottom, tx);
            addEdge(pastLeft,   edges.left,   ty);
            addEdge(pastRight,  edges.right,  ty);
        };

        const enemies = this.enemyPool.activeObjects;
        for (let i = 0; i < enemies.length; i++) addEntity(enemies[i]);

        // ── Gaussian-ish blur pass (3-tap, two passes) for smooth spatial blending ──
        const blur = (arr) => {
            const tmp = this._blurTemp;
            for (let i = 0; i < SEGMENTS; i++) {
                const prev = i > 0 ? arr[i - 1] : 0;
                const next = i < SEGMENTS - 1 ? arr[i + 1] : 0;
                tmp[i] = prev * 0.25 + arr[i] * 0.5 + next * 0.25;
            }
            // Second pass for wider spread
            for (let i = 0; i < SEGMENTS; i++) {
                const prev = i > 0 ? tmp[i - 1] : 0;
                const next = i < SEGMENTS - 1 ? tmp[i + 1] : 0;
                arr[i] = prev * 0.25 + tmp[i] * 0.5 + next * 0.25;
            }
        };
        blur(edges.top);
        blur(edges.bottom);
        blur(edges.left);
        blur(edges.right);

        // ── Early-out if nothing to draw ──
        let hasAny = false;
        const allEdges = [edges.top, edges.bottom, edges.left, edges.right];
        for (let e = 0; e < 4 && !hasAny; e++) {
            for (let i = 0; i < SEGMENTS; i++) {
                if (allEdges[e][i] > 0.01) { hasAny = true; break; }
            }
        }
        if (!hasAny) return;

        // ── Render: ONE gradient per edge, vary globalAlpha per segment ──
        ctx.save();

        const glowDepth = 80;
        const r = 220, g = 50, b = 30;
        const segW = w / SEGMENTS;
        const segH = h / SEGMENTS;

        // Pre-create one gradient per edge direction (4 total, reused across segments)
        const gradTop    = ctx.createLinearGradient(0, 0, 0, glowDepth);
        const gradBottom = ctx.createLinearGradient(0, h, 0, h - glowDepth);
        const gradLeft   = ctx.createLinearGradient(0, 0, glowDepth, 0);
        const gradRight  = ctx.createLinearGradient(w, 0, w - glowDepth, 0);

        const setupGrad = (grad) => {
            grad.addColorStop(0, `rgb(${r},${g},${b})`);
            grad.addColorStop(0.4, `rgba(${r},${g},${b},0.4)`);
            grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
        };
        setupGrad(gradTop);
        setupGrad(gradBottom);
        setupGrad(gradLeft);
        setupGrad(gradRight);

        // Draw each edge: set fillStyle once, vary globalAlpha per segment.
        // sqrt curve boosts low values so a single enemy is noticeable,
        // while high values (many enemies) still cap at 0.9.
        const drawEdge = (arr, grad, fillRect) => {
            ctx.fillStyle = grad;
            for (let i = 0; i < SEGMENTS; i++) {
                const val = Math.min(arr[i], 1.0);
                if (val < 0.01) continue;
                ctx.globalAlpha = Math.min(0.9, Math.sqrt(val) * 0.7);
                fillRect(i);
            }
        };

        drawEdge(edges.top,    gradTop,    (i) => ctx.fillRect(i * segW, 0, segW + 1, glowDepth));
        drawEdge(edges.bottom, gradBottom, (i) => ctx.fillRect(i * segW, h - glowDepth, segW + 1, glowDepth));
        drawEdge(edges.left,   gradLeft,   (i) => ctx.fillRect(0, i * segH, glowDepth, segH + 1));
        drawEdge(edges.right,  gradRight,  (i) => ctx.fillRect(w - glowDepth, i * segH, glowDepth, segH + 1));

        ctx.globalAlpha = 1;
        ctx.restore();
}
