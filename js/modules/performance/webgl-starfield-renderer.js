// WebGL starfield renderer — single instanced draw call for ALL
// migrated star types (background stars + simple-shape decorative
// color stars). Stars persist across the run, so the instance VBO is
// populated ONCE per star (in `addStar`) and never updated per-frame.
//
// What's done in the GPU vs CPU:
//   * Parallax: shader applies `pos = mod(basePos - drift * parallaxFactor, field)`.
//     The engine integrates `shipVel` into `_starDrift` per frame and
//     passes that as a uniform — zero per-star CPU work.
//   * Twinkle: shader scales alpha by `(1-amp) + amp * (0.5 + 0.5 * sin(time*speed + phase))`.
//     Per-instance attribute carries phase/speed/amplitude.
//   * Rotation: shader rotates the unit quad by `(baseAngle + time * rotRate)`.
//     Per-instance attribute carries rotation rate.
//   * Color tint: per-instance RGBA, multiplied with sampled atlas texel.
//
// Per-instance attribute layout (14 floats, 56 bytes):
//    0,1   basePos (world x, y; immutable after spawn)
//    2     parallaxFactor (depth × parallax constant)
//    3     baseSize (full-quad-half-width in px before twinkle scaling)
//    4-7   color (rgba, 0..1)
//    8     twinklePhase
//    9     twinkleSpeed
//   10     twinkleAmplitude
//   11     shapeSlot (0..NUM_SLOTS-1; integer)
//   12     baseAngle (initial rotation, radians)
//   13     rotationRate (radians per second)

import { ATLAS_W, ATLAS_H, SLOT, NUM_SLOTS, buildStarfieldAtlas } from './webgl-starfield-atlas.js';

const FLOATS_PER_INSTANCE = 14;
const BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4;

const VERTEX_SHADER = `#version 300 es
in vec2 a_quadPos;
in vec2 a_quadUV;

in vec2 a_basePos;
in float a_parallax;
in float a_size;
in vec4 a_color;
in float a_twinklePhase;
in float a_twinkleSpeed;
in float a_twinkleAmp;
in float a_shape;
in float a_baseAngle;
in float a_rotRate;

uniform vec2 u_drift;       // cumulative ship-motion drift (px)
uniform vec2 u_camera;      // camera world position (px)
uniform vec2 u_viewport;    // canvas size (px)
uniform vec2 u_field;       // game-field size (px) for wrap
uniform float u_time;       // seconds since epoch (mod for stability)
uniform float u_atlasSlots; // NUM_SLOTS

out vec4 v_color;
out vec2 v_uv;

void main() {
    // 5.64.17 — twinkle now drives BOTH alpha modulation AND a subtle
    // size pulse so stars breathe. Same sin, two outputs.
    float wave = 0.5 + 0.5 * sin(u_time * a_twinkleSpeed + a_twinklePhase);
    float twink = (1.0 - a_twinkleAmp) + a_twinkleAmp * wave;
    // Size pulse — quad grows ~12% on bright peak, shrinks ~6% on dim
    // trough. Independent of alpha so dim stars still pulse visibly.
    float pulse = 0.94 + 0.18 * wave;

    // Rotation: rotate the local unit quad by (baseAngle + time*rate).
    float angle = a_baseAngle + u_time * a_rotRate;
    float c = cos(angle);
    float s = sin(angle);
    vec2 rotQuad = vec2(
        a_quadPos.x * c - a_quadPos.y * s,
        a_quadPos.x * s + a_quadPos.y * c
    );

    // Parallax-corrected world position, wrapped to the game field.
    vec2 worldPos = mod(a_basePos - u_drift * a_parallax, u_field);
    if (worldPos.x < 0.0) worldPos.x += u_field.x;
    if (worldPos.y < 0.0) worldPos.y += u_field.y;

    // Build the rotated quad in world space — with the breathing pulse.
    vec2 worldVertex = worldPos + rotQuad * a_size * 2.0 * pulse;

    // Camera transform → clip space.
    vec2 screenPos = worldVertex - u_camera;
    vec2 clip = (screenPos / u_viewport) * 2.0 - 1.0;
    clip.y = -clip.y;
    gl_Position = vec4(clip, 0.0, 1.0);

    // Atlas UV: pick slot by shape index (atlas is 1×NUM_SLOTS row).
    float slotU = a_shape / u_atlasSlots;
    float slotW = 1.0 / u_atlasSlots;
    v_uv = vec2(slotU + a_quadUV.x * slotW, a_quadUV.y);

    // 5.64.17 — peak-frame color shift toward hot white. At dim trough
    // (wave=0) the star renders in its native palette color; at bright
    // peak (wave=1) it shifts ~25% toward white, giving the impression
    // of a "hot flash" at peak — extra dynamism beyond pure alpha pulse.
    vec3 hotShift = mix(a_color.rgb, vec3(1.0), wave * 0.25);
    v_color = vec4(hotShift, a_color.a * twink);
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec4 v_color;
in vec2 v_uv;
uniform sampler2D u_atlas;
out vec4 fragColor;

// 5.64.18 — pre-blend brightness boost. With additive blend mode
// (SRC_ALPHA, ONE) the source color's RGB drives the contribution
// added to the framebuffer. Multiplying by 1.5× saturates hot pixels
// (white core peaks at 1.0) while letting dim halo pixels stay
// proportionally brighter — gives the field that "screen blend"
// over-exposure feel without needing an HDR float framebuffer.
const float BRIGHTNESS_GAIN = 1.6;

void main() {
    vec4 tex = texture(u_atlas, v_uv);
    vec3 rgb = clamp(tex.rgb * v_color.rgb * BRIGHTNESS_GAIN, 0.0, 1.0);
    fragColor = vec4(rgb, tex.a * v_color.a);
}
`;

export class WebGLStarfieldRenderer {
    constructor(canvas, maxStars = 4000) {
        this.canvas = canvas;
        this.gl = null;
        this.program = null;
        this.atlasTex = null;
        this.atlasCanvas = null;

        this.quadVbo = null;
        this.instanceVbo = null;
        this.vao = null;

        this.maxStars = maxStars;
        this.instanceData = new Float32Array(maxStars * FLOATS_PER_INSTANCE);
        this.instanceCount = 0;
        this._dirty = false;

        this.uDrift = null;
        this.uCamera = null;
        this.uViewport = null;
        this.uField = null;
        this.uTime = null;
        this.uAtlas = null;
        this.uAtlasSlots = null;

        this.supported = false;
        this._contextLost = false;

        // Drift state — cumulative ship motion. Engine integrates per-
        // frame; renderer reads at draw time.
        this.driftX = 0;
        this.driftY = 0;

        // Field size — set via setFieldSize() so the wrap uniform is
        // correct.
        this.fieldW = 4000;
        this.fieldH = 3000;

        this._onContextLost = (e) => {
            e.preventDefault();
            this._contextLost = true;
        };
        this._onContextRestored = () => {
            this._contextLost = false;
            this._initGL();
            // Re-upload the instance data on context restore.
            this._uploadAllInstances();
        };
    }

    /**
     * Init reuses a pre-existing GL context (passed in from the engine
     * so we share the WebGLParticleRenderer's context — same canvas,
     * one context). Returns true on success.
     */
    init(gl) {
        if (!gl) return false;
        this.gl = gl;
        try {
            this._initGL();
        } catch (err) {
            console.warn('[WebGLStarfieldRenderer] init failed:', err);
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
            throw new Error('Starfield program link failed: ' + log);
        }
        this.program = program;

        gl.useProgram(program);
        this.uDrift       = gl.getUniformLocation(program, 'u_drift');
        this.uCamera      = gl.getUniformLocation(program, 'u_camera');
        this.uViewport    = gl.getUniformLocation(program, 'u_viewport');
        this.uField       = gl.getUniformLocation(program, 'u_field');
        this.uTime        = gl.getUniformLocation(program, 'u_time');
        this.uAtlas       = gl.getUniformLocation(program, 'u_atlas');
        this.uAtlasSlots  = gl.getUniformLocation(program, 'u_atlasSlots');
        gl.uniform1i(this.uAtlas, 1); // texture unit 1 (particle renderer uses 0)
        gl.uniform1f(this.uAtlasSlots, NUM_SLOTS);

        // Static unit quad — same as particle renderer.
        const quad = new Float32Array([
            -0.5, -0.5,   0, 0,
             0.5, -0.5,   1, 0,
            -0.5,  0.5,   0, 1,
             0.5,  0.5,   1, 1,
        ]);
        this.quadVbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
        gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);

        // Dynamic instance VBO — sized for maxStars.
        this.instanceVbo = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
        gl.bufferData(gl.ARRAY_BUFFER, this.maxStars * BYTES_PER_INSTANCE, gl.DYNAMIC_DRAW);

        // VAO captures all attribute bindings.
        this.vao = gl.createVertexArray();
        gl.bindVertexArray(this.vao);
        this._setupAttribs();
        gl.bindVertexArray(null);

        // Bake atlas + upload as a separate texture on TEXTURE1.
        this.atlasCanvas = buildStarfieldAtlas();
        this.atlasTex = gl.createTexture();
        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);
        gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlasCanvas);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
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

        const aQuadPos = gl.getAttribLocation(program, 'a_quadPos');
        const aQuadUV  = gl.getAttribLocation(program, 'a_quadUV');
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
        const QSTRIDE = 4 * 4;
        gl.enableVertexAttribArray(aQuadPos);
        gl.vertexAttribPointer(aQuadPos, 2, gl.FLOAT, false, QSTRIDE, 0);
        gl.enableVertexAttribArray(aQuadUV);
        gl.vertexAttribPointer(aQuadUV, 2, gl.FLOAT, false, QSTRIDE, 2 * 4);

        const aBase    = gl.getAttribLocation(program, 'a_basePos');
        const aPara    = gl.getAttribLocation(program, 'a_parallax');
        const aSize    = gl.getAttribLocation(program, 'a_size');
        const aColor   = gl.getAttribLocation(program, 'a_color');
        const aPhase   = gl.getAttribLocation(program, 'a_twinklePhase');
        const aSpeed   = gl.getAttribLocation(program, 'a_twinkleSpeed');
        const aAmp     = gl.getAttribLocation(program, 'a_twinkleAmp');
        const aShape   = gl.getAttribLocation(program, 'a_shape');
        const aAngle   = gl.getAttribLocation(program, 'a_baseAngle');
        const aRot     = gl.getAttribLocation(program, 'a_rotRate');

        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
        const ISTRIDE = BYTES_PER_INSTANCE;
        let off = 0;
        const setInst = (loc, count) => {
            gl.enableVertexAttribArray(loc);
            gl.vertexAttribPointer(loc, count, gl.FLOAT, false, ISTRIDE, off);
            gl.vertexAttribDivisor(loc, 1);
            off += count * 4;
        };
        setInst(aBase, 2);
        setInst(aPara, 1);
        setInst(aSize, 1);
        setInst(aColor, 4);
        setInst(aPhase, 1);
        setInst(aSpeed, 1);
        setInst(aAmp, 1);
        setInst(aShape, 1);
        setInst(aAngle, 1);
        setInst(aRot, 1);
    }

    setFieldSize(w, h) {
        this.fieldW = w;
        this.fieldH = h;
    }

    /**
     * Reset the instance buffer + cumulative drift so we can repopulate
     * from scratch (e.g. on new run / respawn).
     */
    clear() {
        this.instanceCount = 0;
        this.driftX = 0;
        this.driftY = 0;
        this._dirty = true;
    }

    /**
     * Add one star instance. Returns true if the star was added,
     * false if the buffer is full.
     *
     * params:
     *   x, y           — world position (px)
     *   parallax       — parallax factor (depth-based; 0 = static, higher = moves more)
     *   size           — quad-half-width (px); ~radius equivalent
     *   r, g, b, a     — color in [0, 1]
     *   twinklePhase   — radians offset for sin (random per star, 0..2π)
     *   twinkleSpeed   — radians/second
     *   twinkleAmp     — alpha-modulation amplitude in [0, 1]
     *   shapeSlot      — atlas slot index (0..NUM_SLOTS-1)
     *   baseAngle      — initial rotation (radians)
     *   rotRate        — rotation rate (radians/second)
     */
    addStar(x, y, parallax, size, r, g, b, a,
            twinklePhase, twinkleSpeed, twinkleAmp,
            shapeSlot, baseAngle, rotRate) {
        if (this.instanceCount >= this.maxStars) return false;
        const base = this.instanceCount * FLOATS_PER_INSTANCE;
        const data = this.instanceData;
        data[base + 0]  = x;
        data[base + 1]  = y;
        data[base + 2]  = parallax;
        data[base + 3]  = size;
        data[base + 4]  = r;
        data[base + 5]  = g;
        data[base + 6]  = b;
        data[base + 7]  = a;
        data[base + 8]  = twinklePhase;
        data[base + 9]  = twinkleSpeed;
        data[base + 10] = twinkleAmp;
        data[base + 11] = shapeSlot;
        data[base + 12] = baseAngle;
        data[base + 13] = rotRate;
        this.instanceCount++;
        this._dirty = true;
        return true;
    }

    /** Re-upload the entire instance buffer. Called once after a batch of addStar. */
    flush() {
        if (!this.supported || this._contextLost) return;
        if (!this._dirty) return;
        const gl = this.gl;
        gl.bindBuffer(gl.ARRAY_BUFFER, this.instanceVbo);
        gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.instanceData, 0, this.instanceCount * FLOATS_PER_INSTANCE);
        this._dirty = false;
    }

    _uploadAllInstances() {
        this._dirty = true;
        this.flush();
    }

    /**
     * Add a per-frame contribution to the cumulative drift.
     * (Engine calls this with shipVel each frame.)
     */
    accumulateDrift(dx, dy) {
        this.driftX += dx;
        this.driftY += dy;
    }

    /**
     * Render the starfield. Must be called BEFORE the particle layer
     * so stars sit underneath particles. The caller is responsible for
     * setting up additive blending (we use the same blend state as the
     * particle renderer so no toggle is needed when interleaved).
     *
     * @param {number} camX
     * @param {number} camY
     * @param {number} viewportW
     * @param {number} viewportH
     * @param {number} timeSec  monotonic seconds (used for twinkle/rotation)
     */
    draw(camX, camY, viewportW, viewportH, timeSec) {
        if (!this.supported || this._contextLost || this.instanceCount === 0) return;
        this.flush(); // safety — usually a no-op after spawn

        const gl = this.gl;
        gl.useProgram(this.program);
        gl.bindVertexArray(this.vao);

        gl.activeTexture(gl.TEXTURE1);
        gl.bindTexture(gl.TEXTURE_2D, this.atlasTex);

        gl.uniform2f(this.uDrift, this.driftX, this.driftY);
        gl.uniform2f(this.uCamera, camX, camY);
        gl.uniform2f(this.uViewport, viewportW, viewportH);
        gl.uniform2f(this.uField, this.fieldW, this.fieldH);
        // Mod time to avoid float-precision drift over long sessions.
        gl.uniform1f(this.uTime, timeSec % 86400);

        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, this.instanceCount);

        gl.bindVertexArray(null);
    }
}
