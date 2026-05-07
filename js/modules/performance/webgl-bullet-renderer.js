// WebGL bullet renderer (5.79.2). Mirrors the WebGLParticleRenderer
// architecture — instanced quads, dynamic per-bullet VBO, single
// `drawArraysInstanced` per frame for every bullet that maps to an
// atlas slot.
//
// Why this exists:
//   The Canvas2D bullet path was using `ctx.shadowBlur` to bake a
//   black outline halo around every bullet. shadowBlur runs a Gaussian
//   pass per shape. At 150 bullets that's ~1.2 ms / frame on a modern
//   machine and 3-5× more on integrated GPUs (see
//   docs/STROKE_PERF_ANALYSIS_5.79.md). Lifting the body draw to WebGL
//   eliminates the per-bullet Canvas2D cost AND makes the outline
//   "free" — it lives in the atlas alpha channels and is composed in
//   the fragment shader.
//
// Notes:
//   • Bullet TRAILS still render on Canvas2D. They were never the
//     dominant cost. Migrating them would require a textured-quad
//     ribbon pass; not worth the complexity right now.
//   • Player bullets and enemy bullets share the SAME atlas. The
//     atlas slots cover every shape both pools use (circle, triangle,
//     hexagon, diamond, star, square, needle, charge).
//   • Renderer is a no-op when WebGL2 isn't available; the bullet
//     pool falls back to its Canvas2D draw().

import { buildBulletAtlas, BULLET_ATLAS_SLOTS } from './webgl-bullet-atlas.js';

// 13 floats per instance.
//   0,1   position (world x, y)
//   2,3   size (width, height in world pixels)
//   4-7   color (r, g, b, a)
//   8,9   uvOffset (atlas slot top-left)
//  10,11  uvScale  (atlas slot dimensions)
//  12     angle    (radians; enemy bullets rotate, player bullets pass 0)
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

// Atlas channel layout (see webgl-bullet-atlas.js):
//   R = outline mask  (1.0 where the black ring is)
//   G = body mask     (1.0 where the colored body is)
//   B = core mask     (1.0 where the bright white center is)
//   A = max(R, G, B)  — combined opacity
//
// Composition rule (additive in RGB so the channels don't fight each
// other when the texture sampler interpolates):
//   color = body*tint + core*white + outline*black
//   alpha = atlasAlpha * instanceAlpha
//
// 5.79.14 — Punched-up bullet shader for the "neon ball" look:
//   • Brightness gain bumped 1.35× → 1.55× so the colored body
//     saturates more aggressively. Hot pixels read as "glowing" not
//     "flat colored disc".
//   • Top-left highlight (UV-space ramp) adds a subtle gloss to the
//     body, making bullets look like 3D balls instead of 2D circles.
//     Cheap — one mix() against a clamped UV diagonal.
//   • Outline channel (R) explicitly composites BLACK on top of the
//     body so the dark stroke is unmistakable even when the bullet
//     color is dark itself. Was just "RGB at zero" via masking which
//     blended weakly when the body bled into the outline texel.
void main() {
    vec4 tex = texture(u_atlas, v_uv);
    float aOut  = tex.r;
    float aBody = tex.g;
    float aCore = tex.b;
    if (tex.a < 0.01) discard;

    // Saturated body color
    vec3 lit = clamp(v_color.rgb * 1.55, 0.0, 1.0);

    // Soft top-left gloss — 0..1 ramp across the UV, brightest at
    // (0.30, 0.30). Adds white toward the upper-left of every body.
    vec2 g = v_uv;
    float gloss = clamp(1.0 - length(g - vec2(0.30, 0.30)) * 1.6, 0.0, 1.0);
    gloss *= aBody * 0.35;

    vec3 bodyCol = lit + vec3(gloss);
    vec3 col = bodyCol * aBody + vec3(1.0) * aCore;

    // Outline → composite black ON TOP. Uses the outline mask
    // directly so the black stroke wins over any body bleed at the
    // antialiased edge, giving a crisp ring around every bullet.
    col = mix(col, vec3(0.0), aOut);

    float alpha = tex.a * v_color.a;
    fragColor = vec4(col, alpha);
}
`;

// Color cache shared with the particle renderer's pattern — parses CSS
// color strings (hex, rgb, rgba, named) into [r, g, b, a] floats.
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

export class WebGLBulletRenderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.gl = null;
        this.program = null;
        this.atlasTex = null;
        this.atlasCanvas = null;

        this.quadVbo = null;
        this.instanceVbo = null;
        this.vao = null;

        // Sized for the worst-case bullet count we'd reasonably see in a
        // single frame across both pools (player + enemy + missiles, etc.).
        // 1024 is generous; storm-needles peak is ~250.
        this.maxInstances = 1024;
        this.instanceData = new Float32Array(this.maxInstances * FLOATS_PER_INSTANCE);
        this.instanceCount = 0;

        this.uCamera = null;
        this.uViewport = null;
        this.uAtlas = null;

        this.supported = false;
        this._contextLost = false;
        this._colorParser = new ColorParser();

        this._onContextLost = (e) => {
            e.preventDefault();
            this._contextLost = true;
        };
        this._onContextRestored = () => {
            this._contextLost = false;
            this._initGL();
        };
    }

    /**
     * Boot the renderer. The `sharedGL` argument lets us reuse the WebGL2
     * context already created by WebGLParticleRenderer (browsers limit
     * the number of simultaneous contexts; sharing keeps us inside the
     * limit). Returns true on success.
     */
    init(sharedGL = null) {
        if (sharedGL) {
            this.gl = sharedGL;
        } else {
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
                console.warn('[WebGLBulletRenderer] WebGL2 unavailable — bullets will use Canvas2D');
                return false;
            }
            this.gl = gl;
            this.canvas.addEventListener('webglcontextlost', this._onContextLost, false);
            this.canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);
        }
        try {
            this._initGL();
        } catch (err) {
            console.warn('[WebGLBulletRenderer] init failed:', err);
            this.supported = false;
            return false;
        }
        this.supported = true;
        return true;
    }

    _initGL() {
        const gl = this.gl;
        const vs = this._compile(gl.VERTEX_SHADER, VERTEX_SHADER);
        const fs = this._compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
        const program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);
        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            const log = gl.getProgramInfoLog(program);
            throw new Error('Bullet program link failed: ' + log);
        }
        this.program = program;
        gl.useProgram(program);

        this.uCamera   = gl.getUniformLocation(program, 'u_camera');
        this.uViewport = gl.getUniformLocation(program, 'u_viewport');
        this.uAtlas    = gl.getUniformLocation(program, 'u_atlas');
        gl.uniform1i(this.uAtlas, 0);

        // Static unit quad — TRIANGLE_STRIP. Same layout as the particle
        // renderer.
        const quad = new Float32Array([
            -0.5, -0.5,  0, 0,
             0.5, -0.5,  1, 0,
            -0.5,  0.5,  0, 1,
             0.5,  0.5,  1, 1,
        ]);
        this.quadVbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

        // Dynamic instance VBO.
        this.instanceVbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
        gl.bufferData(gl.ARRAY_BUFFER, this.maxInstances * BYTES_PER_INSTANCE, gl.DYNAMIC_DRAW);

        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        this._setupAttribs();
        gl.bindVertexArray(null);

        // Atlas texture.
        //
        // 5.79.21 — ROOT CAUSE FIX for the missing bullet outline:
        //   We previously used `LINEAR` minification with no mipmaps.
        //   When a bullet renders at ~17 screen px from a 128-px atlas
        //   slot, the GPU minifies the texture to ~14% scale. Without
        //   mipmaps, `LINEAR` only samples a 2×2 texel neighborhood
        //   per fragment — out of a 7.5×7.5 effective texel region.
        //   The 12-px-wide outline ring (~9% of the slot) was aliased
        //   away on most fragments, so the outline was invisible at
        //   typical bullet render sizes. The body + core (which fill
        //   65% of the slot) survived the aliasing, but the thin
        //   outline didn't.
        //
        //   Fix: generate the full mipmap chain via
        //   `gl.generateMipmap()`, switch MIN_FILTER to
        //   `LINEAR_MIPMAP_LINEAR` (trilinear). Now the GPU samples a
        //   pre-downsampled pyramid where each mip level averages
        //   adjacent atlas texels — the outline ring's contribution
        //   is preserved through all the downsamples and shows up as
        //   a proper black ring at every render size.
        //
        //   Atlas dimensions are 1024×128 — both POT, so generateMipmap
        //   works without restriction.
        this.atlasCanvas = buildBulletAtlas();
        this.atlasTex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlasCanvas);
        gl.generateMipmap(gl.TEXTURE_2D);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

        // Standard alpha blending — bullet outlines need to darken
        // (not add to) the destination so they read as black on bright
        // backgrounds.
        gl.enable(gl.BLEND);
        gl.blendFuncSeparate(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA, gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
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
            throw new Error(`Bullet ${kind} shader compile failed: ${log}`);
        }
        return sh;
    }

    _setupAttribs() {
        const gl = this.gl;
        const program = this.program;

        const aQuadPos = gl.getAttribLocation(program, 'a_quadPos');
        const aQuadUV  = gl.getAttribLocation(program, 'a_quadUV');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
        const QSTRIDE = 4 * 4;
        gl.enableVertexAttribArray(aQuadPos);
        gl.vertexAttribPointer(aQuadPos, 2, gl.FLOAT, false, QSTRIDE, 0);
        gl.enableVertexAttribArray(aQuadUV);
        gl.vertexAttribPointer(aQuadUV, 2, gl.FLOAT, false, QSTRIDE, 2 * 4);

        const aPos     = gl.getAttribLocation(program, 'a_pos');
        const aSize    = gl.getAttribLocation(program, 'a_size');
        const aColor   = gl.getAttribLocation(program, 'a_color');
        const aUvOff   = gl.getAttribLocation(program, 'a_uvOffset');
        const aUvScale = gl.getAttribLocation(program, 'a_uvScale');
        const aAngle   = gl.getAttribLocation(program, 'a_angle');
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

    /** Resize the bullet canvas drawing buffer. Engine calls this from
     *  the window resize handler. */
    resize(w, h) {
        if (!this.supported || this._contextLost) return;
        this.canvas.width = w;
        this.canvas.height = h;
        this.gl.viewport(0, 0, w, h);
    }

    /**
     * Reset the per-frame instance scratch AND clear the canvas. Caller
     * invokes this once per frame before walking the bullet pools.
     */
    beginFrame() {
        this.instanceCount = 0;
        if (this.supported && !this._contextLost) {
            const gl = this.gl;
            gl.viewport(0, 0, this.canvas.width, this.canvas.height);
            gl.clearColor(0, 0, 0, 0);
            gl.clear(gl.COLOR_BUFFER_BIT);
        }
    }

    /**
     * Push one bullet into the instance buffer.
     *
     * @param {string} shape    'circle' | 'triangle' | 'hexagon' | ...
     * @param {number} x        world x
     * @param {number} y        world y
     * @param {number} size     world-pixel diameter (the quad will be
     *                          drawn at this size; the atlas slot is
     *                          designed to fit into a 100-px diameter
     *                          quad — the size attribute scales it).
     * @param {string} color    bullet body tint (CSS color string)
     * @param {number} alpha    0..1 instance alpha
     * @returns {boolean} true if pushed, false if buffer full or shape
     *                    unknown.
     */
    pushBullet(shape, x, y, size, color, alpha, angle = 0, aspect = 1) {
        if (this.instanceCount >= this.maxInstances) return false;
        const slot = BULLET_ATLAS_SLOTS[shape];
        if (!slot) return false;
        const data = this.instanceData;
        const base = this.instanceCount * FLOATS_PER_INSTANCE;
        const rgb = this._colorParser.parse(color || '#ffff80');
        // Pick a quad size that gives the bullet roughly the right
        // pixel diameter. The atlas's body radius is ~48 px in a 128
        // slot → body diameter ≈ 96 px. The quad coords run -0.5..0.5,
        // so a quad of `size = bullet_diameter * (128/96)` produces a
        // body of `bullet_diameter` pixels on screen.
        // 5.79.12 — `aspect > 1` stretches the quad along its rotation
        //   axis (height) for an elongated bullet shape. `angle` then
        //   rotates the quad to align the long axis with travel.
        // 5.79.20 — Atlas BODY_R is now 42 (was 46/48), body diameter
        //   84 in the 128 slot. Scale factor 128/84 ≈ 1.524 so the
        //   caller's `size` lands as the rendered body diameter; the
        //   12-px outline ring extends beyond it for visibility.
        const sizeScaled = size * (128 / 84);
        data[base + 0]  = x;
        data[base + 1]  = y;
        data[base + 2]  = sizeScaled;
        data[base + 3]  = sizeScaled * aspect;
        data[base + 4]  = rgb[0];
        data[base + 5]  = rgb[1];
        data[base + 6]  = rgb[2];
        data[base + 7]  = alpha;
        data[base + 8]  = slot.uOff;
        data[base + 9]  = slot.vOff;
        data[base + 10] = slot.uScale;
        data[base + 11] = slot.vScale;
        data[base + 12] = angle;
        this.instanceCount++;
        return true;
    }

    /**
     * Draw all pushed instances. Bullet canvas has its own WebGL2
     * context — no shared blend state with the particle/starfield
     * renderer to worry about.
     */
    drawFrame(camX, camY) {
        if (!this.supported || this._contextLost) return;
        if (this.instanceCount === 0) return;

        const gl = this.gl;
        const n = this.instanceCount;

        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData, 0, n * FLOATS_PER_INSTANCE);

        gl.uniform2f(this.uCamera, camX, camY);
        gl.uniform2f(this.uViewport, this.canvas.width, this.canvas.height);

        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);

        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);

        gl.bindVertexArray(null);
    }

    /** Returns true when this renderer can handle the given shape key. */
    handlesShape(shape) {
        return this.supported && !this._contextLost && BULLET_ATLAS_SLOTS.hasOwnProperty(shape);
    }
}
