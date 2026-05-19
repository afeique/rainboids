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
// Per-instance attribute layout (16 floats, 64 bytes):
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
//   14     noScan flag — 0 = apply CRT scanlines, 1 = skip (collectible
//          orbs/coins/shapes pass 1 so they read as game objects, not
//          background dressing). 5.79.33.
//   15     sharp flag — 0 = apply radial glow halo, 1 = skip (gold
//          coins pass 1 so they render as crisp point-like pixels
//          without the gaussian-blur halo). 5.79.33.

import { ATLAS_W, ATLAS_H, SLOT, NUM_SLOTS, buildStarfieldAtlas } from './webgl-starfield-atlas.js';

const FLOATS_PER_INSTANCE = 16;
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
in float a_noScan;
in float a_sharp;

uniform vec2 u_drift;       // cumulative ship-motion drift (px)
uniform vec2 u_camera;      // camera world position (px)
uniform vec2 u_viewport;    // canvas size (px)
uniform vec2 u_field;       // game-field size (px) for wrap
uniform float u_time;       // seconds since epoch (mod for stability)
uniform float u_atlasSlots; // NUM_SLOTS

out vec4 v_color;
out vec2 v_uv;
out vec2 v_quadUV;   // 5.74.13 — pass through local quad UV for halo math
out float v_noScan;  // 5.79.33 — flag forwarded to fragment shader
out float v_sharp;   // 5.79.33 — sharp flag forwarded to fragment shader

void main() {
    v_quadUV = a_quadUV;
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

    // 5.74.28 — flicker / twinkle apply to STARS only. Slot 8 is the
    // generic cloud, slots 13-14 are JWST-style nebula textures (wispy /
    // core). All three are nebula content and should render with static
    // base alpha — flickering haze is distracting and the hard 5 Hz
    // peaks turn oversized cloud quads into a strobe. Slots 9-12 (3D
    // shapes — cube, octahedron, tetrahedron, prism) DO flicker.
    float isCloud8 = step(7.5, a_shape) * (1.0 - step(8.5, a_shape));
    float isNeb = step(12.5, a_shape);  // slots 13+
    float isCloud = max(isCloud8, isNeb);
    float flickPhase = u_time * 5.0 + a_twinklePhase * 7.0;
    float flickPeak = pow(0.5 + 0.5 * sin(flickPhase), 8.0);
    float flickerAlpha = mix(1.0 - flickPeak * 0.45, 1.0, isCloud);
    float twinkAdj = mix(twink, 1.0, isCloud);

    // Hot-shift removed (5.74.19). Pass palette color through unchanged;
    // saturation preserved across the pulse. Brightness dynamism is
    // alpha (twinkle × flicker) for stars; clouds stay rock-steady.
    v_color = vec4(a_color.rgb, a_color.a * twinkAdj * flickerAlpha);
    v_noScan = a_noScan;
    v_sharp = a_sharp;
}
`;

const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec4 v_color;
in vec2 v_uv;
in vec2 v_quadUV;     // 5.74.13 — local 0..1 UV across the whole quad,
                      // independent of the atlas slot the shape occupies.
                      // Used for the radial glow halo so the falloff is
                      // shape-independent.
in float v_noScan;    // 5.79.33 — 1 = skip CRT scanlines (orbs).
in float v_sharp;     // 5.79.33 — 1 = skip radial halo (gold coins).
uniform sampler2D u_atlas;
uniform float u_time;       // seconds — scrolls the scanline pattern
                            // vertically each frame for a slow CRT roll.
out vec4 fragColor;

// 5.74.19 — gain on RGB removed entirely. With additive blending
// (SRC_ALPHA, ONE) the visible contribution per pixel is alpha * rgb,
// so the OLD rgb *= 1.3 then clamp(..,0,1) path desaturated any color
// with two channels near max -- #ffd75c (1.0, 0.84, 0.36) was becoming
// (1.0, 1.0, 0.47) post-clamp, i.e. yellow-gold turned into pale lemon.
// Now we keep RGB at full palette saturation and drive brightness
// through alpha alone. To compensate for losing the 1.3x gain, alpha
// is bumped (halo x 0.9) so stars are still as bright as before but
// their hue stays vivid.
void main() {
    vec4 tex = texture(u_atlas, v_uv);

    // Radial glow halo — distance from quad center.
    vec2 q = v_quadUV - 0.5;
    float dist = length(q) * 2.0;
    float halo = 1.0 - smoothstep(0.0, 1.0, dist);
    halo *= halo;
    // 5.79.33 — sharp orbs (gold coins) suppress the halo entirely so
    //   they render as crisp point-like pixels instead of glowy dots.
    halo *= (1.0 - v_sharp);

    // Shape: atlas silhouette × palette color (NO gain — preserves hue).
    vec3 shapeRGB = tex.rgb * v_color.rgb;

    // Halo: fills only where the atlas is transparent so it never stacks
    // on top of the silhouette and clamps toward white.
    float haloMask = (1.0 - tex.a) * halo;
    vec3 haloRGB = v_color.rgb * haloMask;

    vec3 rgb = clamp(shapeRGB + haloRGB, 0.0, 1.0);
    float a = clamp(tex.a + haloMask * 0.9, 0.0, 1.0) * v_color.a;

    // 5.74.24 — CRT-style scanlines on the WebGL starfield/nebula layer
    // ONLY. The foreground action (gameCanvas) sits on top of glCanvas
    // and is unaffected. gl_FragCoord.y is in framebuffer pixels.
    //
    // 5.79.2 — thicker + more apparent CRT scanlines. Was a fine 1-px
    // band at ~22% contrast (sin period 2). Now: hard 2-px dark band
    // every 5 px → 40% contrast, much more visible. The hard threshold
    // (rather than a smooth sin) gives the chunky retro CRT look the
    // user asked for; we still smooth the edge over a single pixel
    // with smoothstep so it doesn't shimmer at sub-pixel motion.
    //
    // Vertical scroll: add `u_time * SCAN_SPEED` to the phase so the
    // dark bands slowly roll DOWN the screen, mimicking a CRT's
    // electron-beam retrace cycle. 25 px/sec is slow enough to feel
    // like a CRT artifact rather than a moving pattern.
    const float SCAN_SPEED = 25.0;
    float modY = mod(gl_FragCoord.y - u_time * SCAN_SPEED, 5.0);
    // 0..2 dark, 2..3 transition, 3..5 light.
    float scanFactor = smoothstep(2.0, 3.0, modY);
    float scan = mix(0.55, 1.0, scanFactor);
    // 5.79.33 — orbs (health, gold shape, gold coin) pass v_noScan=1
    //   so the scanline tint stays at 1.0, leaving them at full
    //   brightness while the starfield/nebula behind them keeps the
    //   CRT effect.
    float scanFinal = mix(scan, 1.0, v_noScan);
    rgb *= scanFinal;

    fragColor = vec4(rgb, a);
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
        // 5.79.24 — `_baselineCount` divides the instance buffer into a
        //   permanent prefix (background stars + nebula + decorative
        //   color stars) and a transient suffix repopulated each frame
        //   for moving collectibles (gold + health orbs). The renderer
        //   doesn't care about the split — both halves render in one
        //   instanced draw call. The engine writes the prefix once at
        //   init via `setBaseline()`, then per-frame calls
        //   `resetTransients()` + `addStar()` to fill the suffix.
        this._baselineCount = 0;
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
        const aNoScan  = gl.getAttribLocation(program, 'a_noScan');
        const aSharp   = gl.getAttribLocation(program, 'a_sharp');

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
        setInst(aNoScan, 1);
        setInst(aSharp, 1);
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
        this._baselineCount = 0;
        this.driftX = 0;
        this.driftY = 0;
        this._dirty = true;
    }

    /**
     * 5.79.24 — Capture the current `instanceCount` as the "permanent"
     *   baseline. Subsequent calls to `resetTransients()` will rewind
     *   `instanceCount` back to this baseline so the prefix stays
     *   intact. Call after the engine finishes seeding the static
     *   starfield (background stars + nebula + decorative color
     *   stars).
     */
    setBaseline() {
        this._baselineCount = this.instanceCount;
    }

    /**
     * 5.79.24 — Rewind `instanceCount` back to the captured baseline so
     *   the engine can repopulate the suffix with moving entities
     *   (orbs) for the current frame. The permanent stars in [0,
     *   baseline) are preserved; their data is already on the GPU.
     */
    resetTransients() {
        this.instanceCount = this._baselineCount;
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
            shapeSlot, baseAngle, rotRate, noScan = 0, sharp = 0) {
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
        data[base + 14] = noScan;
        data[base + 15] = sharp;
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
