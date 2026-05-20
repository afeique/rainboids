// WebGL particle renderer — single instanced draw call for every
// migrated particle type (embers, flashes, classic explosion fragments,
// sparkles, shrapnel streaks, expanding rings).
//
// Architecture:
//   * One static unit-quad VBO (4 verts, TRIANGLE_STRIP).
//   * One dynamic per-instance VBO sized for MAX_PARTICLES, filled each
//     frame from a CPU-side Float32Array scratch buffer.
//   * One sprite atlas texture (1024×256) shared across types — each
//     instance carries its own UV rectangle as an attribute.
//   * Additive blending (`SRC_ALPHA, ONE`) — equivalent to Canvas2D's
//     `globalCompositeOperation = 'screen'` for the bright/glowing
//     particles, which is every type we migrate.
//   * Fragment shader is one texture lookup × per-instance color.
//
// The renderer is a no-op (returns gracefully) when WebGL2 isn't
// available; the engine then falls back to drawing every type on
// Canvas2D.

import { GAME_CONFIG } from '../core/constants.js';
import { ATLAS_SLOTS, buildParticleAtlas } from './webgl-particle-atlas.js';

// 13 floats per instance. Order matches the attribute pointer setup in
// `_setupInstanceAttribs()`.
//   0,1   position (world x, y)
//   2,3   size (width, height)
//   4-7   color (r, g, b, a)
//   8,9   uvOffset (atlas slot top-left)
//  10,11  uvScale (atlas slot dimensions)
//  12     angle (radians, used by streaks; 0 for sprites)
const FLOATS_PER_INSTANCE = 13;
const BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4;

const VERTEX_SHADER = `#version 300 es
in vec2 a_quadPos;
in vec2 a_quadUV;

in vec2 a_pos;
in vec2 a_size;
in vec4 a_color;
in vec2 a_uvOffset;
in vec2 a_uvScale;
in float a_angle;

uniform vec2 u_camera;
uniform vec2 u_viewport;

out vec4 v_color;
out vec2 v_uv;

void main() {
    float c = cos(a_angle);
    float s = sin(a_angle);
    vec2 scaled = a_quadPos * a_size;
    vec2 rotated = vec2(scaled.x * c - scaled.y * s, scaled.x * s + scaled.y * c);
    vec2 worldPos = a_pos + rotated;
    vec2 screenPos = worldPos - u_camera;
    vec2 clip = (screenPos / u_viewport) * 2.0 - 1.0;
    clip.y = -clip.y;
    gl_Position = vec4(clip, 0.0, 1.0);
    v_color = a_color;
    v_uv = a_uvOffset + a_quadUV * a_uvScale;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec4 v_color;
in vec2 v_uv;

uniform sampler2D u_atlas;

out vec4 fragColor;

// 5.64.18 — pre-blend brightness gain. With the additive blend mode
// (SRC_ALPHA, ONE) the source RGB drives the contribution added to the
// framebuffer. A 1.3× multiply saturates hot pixels and lets dim halo
// pixels read proportionally brighter — emulates a screen-blend over-
// exposure feel without a float framebuffer.
const float BRIGHTNESS_GAIN = 1.3;

void main() {
    vec4 tex = texture(u_atlas, v_uv);
    vec3 rgb = clamp(tex.rgb * v_color.rgb * BRIGHTNESS_GAIN, 0.0, 1.0);
    fragColor = vec4(rgb, tex.a * v_color.a);
}
`;

/**
 * Cached color-string → [r, g, b, a] (0..1 floats).
 * Uses a 1×1 offscreen canvas to parse arbitrary CSS color strings
 * (hex, rgb, rgba, hsl, named). The parse only happens once per unique
 * string — subsequent frames hit the Map.
 */
class ColorParser {
    constructor() {
        this.cache = new Map();
        this.canvas = document.createElement('canvas');
        this.canvas.width = 1;
        this.canvas.height = 1;
        this.ctx = this.canvas.getContext('2d', { willReadFrequently: true });
    }
    parse(str) {
        let v = this.cache.get(str);
        if (v) return v;
        this.ctx.clearRect(0, 0, 1, 1);
        this.ctx.fillStyle = str;
        this.ctx.fillRect(0, 0, 1, 1);
        const px = this.ctx.getImageData(0, 0, 1, 1).data;
        v = new Float32Array([px[0] / 255, px[1] / 255, px[2] / 255, px[3] / 255]);
        this.cache.set(str, v);
        return v;
    }
}

export class WebGLParticleRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = null;
        this.program = null;
        this.atlasTex = null;
        this.atlasCanvas = null;

        this.quadVbo = null;
        this.instanceVbo = null;
        this.vao = null;

        this.maxInstances = GAME_CONFIG.MAX_PARTICLES;
        this.instanceData = new Float32Array(this.maxInstances * FLOATS_PER_INSTANCE);
        this.instanceCount = 0;

        this.uCamera = null;
        this.uViewport = null;
        this.uAtlas = null;

        this.supported = false;
        this._contextLost = false;
        this._colorParser = new ColorParser();

        // Particle types this renderer handles. Anything else stays on
        // Canvas2D. Maps type → atlas slot key.
        this.TYPE_TO_SLOT = {
            explosionEmber:        'dot',
            explosion:             'dot',
            starSparkle:           'spark',
            explosionFlash:        'flash',
            enemyPlasmaCore:       'flash',
            explosionRingColored:  'ring',
            explosionShrapnel:     'streak',
        };

        // The starfield renderer shares this canvas/GL context but can't
        // register its own loss/restore listeners (the canvas only fires
        // them once). The engine sets this so we can forward the events.
        this.starfieldRenderer = null;

        this._onContextLost = (e) => {
            e.preventDefault();
            this._contextLost = true;
            if (this.starfieldRenderer && this.starfieldRenderer.handleContextLost) {
                this.starfieldRenderer.handleContextLost();
            }
        };
        this._onContextRestored = () => {
            this._contextLost = false;
            this._initGL();
            // Restore the shared-context starfield AFTER our own GL re-init.
            if (this.starfieldRenderer && this.starfieldRenderer.handleContextRestored) {
                this.starfieldRenderer.handleContextRestored();
            }
        };
    }

    /**
     * Boot the renderer. Returns true if WebGL2 was acquired, shaders
     * compiled, and the atlas was uploaded successfully. False means the
     * caller should keep all particles on the Canvas2D path.
     */
    init() {
        const gl = this.canvas.getContext('webgl2', {
            alpha: true,
            premultipliedAlpha: false,
            antialias: false,
            depth: false,
            stencil: false,
            preserveDrawingBuffer: false,
            failIfMajorPerformanceCaveat: false,
        });
        if (!gl) {
            console.warn('[WebGLParticleRenderer] WebGL2 unavailable — particles will use Canvas2D');
            return false;
        }
        this.gl = gl;
        this.canvas.addEventListener('webglcontextlost', this._onContextLost, false);
        this.canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);
        try {
            this._initGL();
        } catch (err) {
            console.warn('[WebGLParticleRenderer] init failed:', err);
            this.supported = false;
            return false;
        }
        this.supported = true;
        return true;
    }

    _initGL() {
        const gl = this.gl;
        // Compile + link program.
        const vs = this._compile(gl.VERTEX_SHADER, VERTEX_SHADER);
        const fs = this._compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(program);
            throw new Error('Program link failed: ' + log);
        }
        this.program = program;
        gl.useProgram(program);

        // Uniform locations.
        this.uCamera = gl.getUniformLocation(program, 'u_camera');
        this.uViewport = gl.getUniformLocation(program, 'u_viewport');
        this.uAtlas = gl.getUniformLocation(program, 'u_atlas');
        gl.uniform1i(this.uAtlas, 0);

        // Static unit quad — 4 verts in TRIANGLE_STRIP order. xy ∈ [-0.5, 0.5],
        // uv ∈ [0, 1]. The vertex shader scales by per-instance size and
        // rotates by per-instance angle.
        const quad = new Float32Array([
            // x,    y,    u, v
            -0.5, -0.5,   0, 0,
             0.5, -0.5,   1, 0,
            -0.5,  0.5,   0, 1,
             0.5,  0.5,   1, 1,
        ]);
        this.quadVbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

        // Dynamic instance VBO — sized once for MAX_PARTICLES, refilled
        // every frame via bufferSubData.
        this.instanceVbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
        gl.bufferData(gl.ARRAY_BUFFER, this.maxInstances * BYTES_PER_INSTANCE, gl.DYNAMIC_DRAW);

        // VAO — captures all attribute bindings so we don't have to
        // re-set them every frame.
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        this._setupAttribs();
        gl.bindVertexArray(null);

        // Atlas texture.
        this.atlasCanvas = buildParticleAtlas();
        this.atlasTex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlasCanvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Render state — additive blending. The fragment alpha already
        // encodes the soft falloff, and the source-alpha multiply keeps
        // colors balanced; ONE for the destination is what gives the
        // bright bloom on overlapping particles.
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE, gl.ONE, gl.ONE);
        gl.disable(gl.DEPTH_TEST);
        gl.disable(gl.CULL_FACE);
    }

    _compile(type, src) {
        const gl = this.gl;
        const sh = gl.createShader(type);
        gl.shaderSource(sh, src);
        gl.compileShader(sh);
        if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) {
            const log = gl.getShaderInfoLog(sh);
            const kind = type === gl.VERTEX_SHADER ? 'vertex' : 'fragment';
            throw new Error(`${kind} shader compile failed: ${log}`);
        }
        return sh;
    }

    _setupAttribs() {
        const gl = this.gl;
        const program = this.program;

        // Quad attributes (a_quadPos, a_quadUV) live on the static quad VBO.
        const aQuadPos = gl.getAttribLocation(program, 'a_quadPos');
        const aQuadUV  = gl.getAttribLocation(program, 'a_quadUV');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
        const QSTRIDE = 4 * 4; // 4 floats × 4 bytes
        gl.enableVertexAttribArray(aQuadPos);
        gl.vertexAttribPointer(aQuadPos, 2, gl.FLOAT, false, QSTRIDE, 0);
        gl.enableVertexAttribArray(aQuadUV);
        gl.vertexAttribPointer(aQuadUV, 2, gl.FLOAT, false, QSTRIDE, 2 * 4);

        // Instance attributes (per-particle) live on the dynamic VBO.
        const aPos      = gl.getAttribLocation(program, 'a_pos');
        const aSize     = gl.getAttribLocation(program, 'a_size');
        const aColor    = gl.getAttribLocation(program, 'a_color');
        const aUvOff    = gl.getAttribLocation(program, 'a_uvOffset');
        const aUvScale  = gl.getAttribLocation(program, 'a_uvScale');
        const aAngle    = gl.getAttribLocation(program, 'a_angle');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
        const ISTRIDE = BYTES_PER_INSTANCE;
        let off = 0;
        const setInst = (loc, count) => {
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, count, gl.FLOAT, false, ISTRIDE, off);
            gl.vertexAttribDivisor(loc, 1);
            off += count * 4;
        };
        setInst(aPos, 2);
        setInst(aSize, 2);
        setInst(aColor, 4);
        setInst(aUvOff, 2);
        setInst(aUvScale, 2);
        setInst(aAngle, 1);
    }

    /**
     * Resize the WebGL drawing surface to match the canvas display size.
     * Call from the engine resize handler. The viewport uniform is
     * updated each frame in `drawParticles()` so it tracks live changes.
     */
    resize(w, h) {
        if (!this.supported || this._contextLost) return;
        // Set drawing-buffer size to match the canvas display size. We
        // intentionally don't multiply by devicePixelRatio — the Canvas2D
        // layer doesn't either, so both layers share the same pixel grid.
        this.canvas.width = w;
        this.canvas.height = h;
        this.gl.viewport(0, 0, w, h);
    }

    /**
     * Render every supported particle in `pool.activeObjects` in a
     * single instanced draw call. Particles whose type isn't in
     * `TYPE_TO_SLOT` are skipped — the Canvas2D pass renders them.
     *
     * @param {Object} pool      particle pool (uses `pool.activeObjects`).
     * @param {number} camX
     * @param {number} camY
     * @param {number} viewLeft  viewport-cull bounds in world space.
     * @param {number} viewTop
     * @param {number} viewRight
     * @param {number} viewBottom
     */
    drawParticles(pool, camX, camY, viewLeft, viewTop, viewRight, viewBottom) {
        if (!this.supported || this._contextLost) return;
        const gl = this.gl;
        const list = pool.activeObjects;

        // 5.64.16 — clear ownership moved to the engine (`clearGLFrame`)
        // so the starfield renderer can draw BEFORE particles without
        // having its output wiped. The engine clears glCanvas once per
        // frame; both starfield and particles render onto that cleared
        // surface in order.
        gl.viewport(0, 0, this.canvas.width, this.canvas.height);

        // 6.16.1 — grow the instance buffer if needed BEFORE packing.
        // The previous `n < max` walk silently dropped late-arriving
        // particles (death-explosion sub-particles appended after the
        // older hit-spark sea). Now we count first, then resize once.
        // The count walk is O(active), no allocations; it's cheap.
        const slotMap = this.TYPE_TO_SLOT;
        let need = 0;
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (!p.active) continue;
            if (!slotMap[p.type]) continue;
            need++;
        }
        if (need > this.maxInstances) this._growInstanceBuffer(need);

        // Fill the instance scratch — no upper bound now, the buffer is
        // sized for `need` (or larger from a previous frame).
        const data = this.instanceData;
        let n = 0;
        for (let i = 0; i < list.length; i++) {
            const p = list[i];
            if (!p.active) continue;
            const slotKey = slotMap[p.type];
            if (!slotKey) continue;

            // Per-type packing: writes [pos, size, color, uvOff, uvScale, angle]
            // into the scratch array. Returns whether the particle was
            // visible after viewport culling — if not, skip the write.
            const packed = this._packParticle(p, slotKey, n, viewLeft, viewTop, viewRight, viewBottom);
            if (packed) n++;
        }

        if (n === 0) return;
        this.instanceCount = n;

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        // Upload only the slice we filled.
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, n * FLOATS_PER_INSTANCE);

        gl.uniform2f(this.uCamera, camX, camY);
        gl.uniform2f(this.uViewport, this.canvas.width, this.canvas.height);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);

        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);

        gl.bindVertexArray(null);
    }

    /**
     * Encode one particle into the instance scratch at slot `n`. Returns
     * true if the particle was visible (and the caller should advance
     * the instance count) or false if culled.
     */
    _packParticle(p, slotKey, n, vL, vT, vR, vB) {
        const data = this.instanceData;
        const base = n * FLOATS_PER_INSTANCE;
        const slot = ATLAS_SLOTS[slotKey];

        // Per-type size, alpha, rotation, position offset. Mirrors the
        // visual recipe of each Canvas2D draw path in particle.js so the
        // migration is visually equivalent.
        let w = 0, h = 0, alpha = 0, angle = 0;
        let posX = p.x, posY = p.y;

        const lifeAlpha = p.life > 0 ? p.life : 0;

        switch (p.type) {
            case 'explosionEmber': {
                // 5.64.17 — brighter & bigger so embers read clearly.
                // Alpha curve was pow(life, 0.55) — now closer to linear
                // with a small power so embers stay punchier into the
                // mid-life range. Bump quad size 1.55× → 1.8×.
                const softA = Math.pow(lifeAlpha, 0.45);
                const drawR = (p.radius + 4) * 1.8;
                w = drawR * 2;
                h = drawR * 2;
                alpha = softA;
                break;
            }
            case 'explosion': {
                // Classic small dust fragment. Boosted size + alpha
                // multiplier for visibility (5.64.17).
                w = p.radius * 3.2;
                h = p.radius * 3.2;
                alpha = Math.min(1, lifeAlpha * 1.3);
                break;
            }
            case 'starSparkle': {
                if (p.radius < 0.05) return false;
                // Sparkle was already strong; bump size 7 → 8 so the
                // 4-point cross arms extend a bit further into the void.
                w = p.radius * 8;
                h = p.radius * 8;
                alpha = Math.min(1, lifeAlpha * 3.0);
                break;
            }
            case 'explosionFlash': {
                // 5.64.17 — flash dampener removed. Was *0.6 which
                // dimmed the punch unnecessarily; now full eased alpha.
                // Bigger quad too so the flash visibly engulfs the area.
                const flashLife = lifeAlpha / 1.2;
                const eased = flashLife * flashLife * Math.sqrt(Math.max(0, flashLife));
                w = p.radius * 2.6;
                h = p.radius * 2.6;
                alpha = eased * 0.95;
                break;
            }
            case 'enemyPlasmaCore': {
                // Hot plasma fireball — uses the flash slot but with a
                // longer life and a punchier alpha curve so the core
                // stays bright through mid-life, then fades out smoothly.
                // Quad multiplier 2.4× so the fireball reads as a defined
                // hot blob, not a thin halo.
                const maxLife = p.maxLife || 1.8;
                const coreLife = lifeAlpha / maxLife;
                // Sustain → falloff: holds peak for first ~50%, then fades.
                const sustained = coreLife > 0.55
                    ? 1
                    : Math.pow(Math.max(0, coreLife) / 0.55, 0.7);
                w = p.radius * 2.4;
                h = p.radius * 2.4;
                alpha = sustained;
                break;
            }
            case 'explosionRingColored': {
                // Boost ring alpha multiplier 1.5 → 2.0 so the wavefront
                // edge reads as a hot pulse, not a faint halo.
                w = p.radius * 2;
                h = p.radius * 2;
                alpha = Math.min(1, lifeAlpha * 2.0);
                break;
            }
            case 'explosionShrapnel': {
                // Streak quad: width = streak length, height = stroke thickness.
                // Atlas streak slot has its bright head on u=1 (right) with
                // a sharp hot tip; rotate the quad to the velocity angle,
                // then shift the quad's CENTER backwards along the velocity
                // by streakLen/2 so the head lands at (p.x, p.y) — matching
                // the original Canvas2D line which drew tail→head with the
                // head at the particle's position.
                const streakLen = p.length < p._speed * 3 ? p.length : p._speed * 3;
                w = streakLen;
                h = Math.max(1.6, p.radius * 2);
                alpha = lifeAlpha;
                angle = p.angle || 0;
                posX = p.x - p._cosA * (streakLen * 0.5);
                posY = p.y - p._sinA * (streakLen * 0.5);
                break;
            }
            default:
                return false;
        }

        if (alpha <= 0 || w <= 0 || h <= 0) return false;

        // Viewport cull — use the quad's longer side as a conservative
        // bounding radius (since we may rotate).
        const cull = Math.max(w, h) * 0.5;
        if (posX + cull < vL || posX - cull > vR || posY + cull < vT || posY - cull > vB) {
            return false;
        }

        // Parse the CSS color string into [r, g, b, a] floats. The
        // ColorParser caches each unique string globally — there are
        // ~50 unique colors across all particle types, so a cache hit
        // costs one Map lookup. No per-particle caching is needed
        // because pooled particles get a new color string in reset().
        const rgb = this._colorParser.parse(p.color || '#ffffff');

        data[base + 0]  = posX;
        data[base + 1]  = posY;
        data[base + 2]  = w;
        data[base + 3]  = h;
        data[base + 4]  = rgb[0];
        data[base + 5]  = rgb[1];
        data[base + 6]  = rgb[2];
        data[base + 7]  = alpha;
        data[base + 8]  = slot.uOff;
        data[base + 9]  = slot.vOff;
        data[base + 10] = slot.uScale;
        data[base + 11] = slot.vScale;
        data[base + 12] = angle;
        return true;
    }

    /** True when the renderer handles the given particle type. */
    handlesType(type) {
        return this.supported && !this._contextLost && this.TYPE_TO_SLOT.hasOwnProperty(type);
    }

    /**
     * 6.16.1 — Grow the per-frame instance VBO + scratch array so a
     * higher-than-baseline particle count can render in a single draw
     * call. Doubles the previous capacity (clamped at `needed + 256`),
     * reallocates both the Float32Array AND the GL buffer, then rebinds
     * the instance attribute pointers because the underlying VBO id is
     * the SAME (we use bufferData on the existing id), so VAO bindings
     * remain valid. Logged once per grow event for telemetry.
     */
    _growInstanceBuffer(needed) {
        const newCap = Math.max(this.maxInstances * 2, needed + 256);
        this.maxInstances = newCap;
        this.instanceData = new Float32Array(newCap * FLOATS_PER_INSTANCE);
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
        gl.bufferData(gl.ARRAY_BUFFER, newCap * BYTES_PER_INSTANCE, gl.DYNAMIC_DRAW);
    }
}
