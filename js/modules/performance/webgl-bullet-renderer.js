// WebGL bullet renderer (5.79.60 — procedural-SDF rewrite).
//
// Single instanced draw call per frame for every player + enemy bullet.
// No atlas, no texture, no mipmaps — each bullet's silhouette, body,
// core, and glow are computed in the fragment shader from analytical
// signed-distance fields. Replaces the atlas-based 5.79.2 architecture.
//
// Why the rewrite:
//   • The previous atlas + mix-blend-mode pipeline was paying for a
//     full-screen GPU composition pass every frame (tanked FPS).
//   • The atlas occupied a 1024×128 RGBA texture + a full mipmap chain
//     for what is essentially a few SDF bands. Procedural SDFs have
//     zero memory cost, no mipmap upload, and cheaper per-fragment
//     work (no texture sampling).
//   • Standard src-over alpha blending — no exotic blend modes, no
//     CSS mix-blend on the canvas — so the bullet layer composites
//     onto the page like any normal canvas.
//
// Per-instance layout (10 floats):
//    0,1   world position (x, y)
//    2,3   quad size (width, height) — height differs from width by
//          aspect for elongated enemy bullets
//    4-7   color (r, g, b, instance-alpha)
//    8     rotation angle (radians)
//    9     shape id (0..7)
//
// Bullet TRAILS still render on Canvas2D (drawTrail in player/bullet.js
// and enemy/enemy-bullet.js). They were never the dominant cost.
// Renderer is a no-op when WebGL2 isn't available; the bullet pool
// falls back to its Canvas2D draw().

const SHAPE_IDS = {
    circle:   0,
    triangle: 1,
    hexagon:  2,
    diamond:  3,
    star:     4,
    square:   5,
    needle:   6,
    charge:   7,
};

const FLOATS_PER_INSTANCE = 10;
const BYTES_PER_INSTANCE = FLOATS_PER_INSTANCE * 4;

const VERTEX_SHADER = `#version 300 es
in vec2 a_quadPos;

in vec2 a_pos;
in vec2 a_size;
in vec4 a_color;
in float a_angle;
in float a_shape;

uniform vec2 u_camera;
uniform vec2 u_viewport;

out vec4 v_color;
out vec2 v_local;
out float v_shape;

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
    v_local = a_quadPos;
    v_shape = a_shape;
}
`;

// Each shape SDF returns the signed distance from the silhouette in
// unit-quad space (-0.5..0.5). Negative = inside, positive = outside.
// Body silhouette sits at distance 0; body radius is ~0.40 of the quad
// half-width, leaving ~0.10 of headroom for the soft glow tail before
// the quad edge clips at 0.5.
const FRAGMENT_SHADER = `#version 300 es
precision mediump float;

in vec4 v_color;
in vec2 v_local;
in float v_shape;

out vec4 fragColor;

float circleSDF(vec2 p)   { return length(p) - 0.40; }

float triangleSDF(vec2 p) {
    p.y = -p.y;
    p.x = abs(p.x);
    const float k = 0.866;
    return max(p.x * k + p.y * 0.5 - 0.40, -p.y - 0.34);
}

float hexagonSDF(vec2 p) {
    p = abs(p);
    return max(p.x - 0.40, p.x * 0.5 + p.y * 0.866 - 0.40);
}

float diamondSDF(vec2 p)  { return abs(p.x) + abs(p.y) - 0.42; }

float starSDF(vec2 p) {
    float ang = atan(p.y, p.x) + 1.5708;
    float r = length(p);
    float k = ang * (5.0 / 6.2832);
    float sector = fract(k);
    float w = sector < 0.5 ? sector * 2.0 : (1.0 - sector) * 2.0;
    return r - mix(0.18, 0.42, w);
}

float squareSDF(vec2 p) {
    vec2 d = abs(p) - 0.32;
    return max(d.x, d.y);
}

float needleSDF(vec2 p) {
    p = abs(p);
    return length(vec2(p.x, max(0.0, p.y - 0.32))) - 0.06;
}

float chargeSDF(vec2 p)   { return length(p) - 0.45; }

float bulletSDF(vec2 p, int shape) {
    if (shape == 0) return circleSDF(p);
    if (shape == 1) return triangleSDF(p);
    if (shape == 2) return hexagonSDF(p);
    if (shape == 3) return diamondSDF(p);
    if (shape == 4) return starSDF(p);
    if (shape == 5) return squareSDF(p);
    if (shape == 6) return needleSDF(p);
    if (shape == 7) return chargeSDF(p);
    return circleSDF(p);
}

void main() {
    vec2 p = v_local;
    int shape = int(v_shape + 0.5);
    float d = bulletSDF(p, shape);

    // 5.79.61 — Flat body only, no glow / no core / no gradient.
    // Cheapest possible bullet: SDF + 1px antialiased edge.
    if (d > 0.005) discard;

    float aa = fwidth(d);
    float bodyMask = 1.0 - smoothstep(-aa, aa, d);
    if (bodyMask < 0.005) discard;

    fragColor = vec4(v_color.rgb, bodyMask * v_color.a);
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

        this.quadVbo = null;
        this.instanceVbo = null;
        this.vao = null;

        // Sized for the worst-case bullet count we'd reasonably see
        // in a single frame across both pools. 1024 is generous;
        // storm-needles peak is ~250.
        this.maxInstances = 1024;
        this.instanceData = new Float32Array(this.maxInstances * FLOATS_PER_INSTANCE);
        this.instanceCount = 0;

        this.uCamera = null;
        this.uViewport = null;

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
            console.warn('[WebGLBulletRenderer] WebGL2 unavailable — bullets will use Canvas2D');
            return false;
        }
        this.gl = gl;
        this.canvas.addEventListener('webglcontextlost', this._onContextLost, false);
        this.canvas.addEventListener('webglcontextrestored', this._onContextRestored, false);
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

        // Static unit quad — TRIANGLE_STRIP, just position. No UVs needed.
        const quad = new Float32Array([
            -0.5, -0.5,
             0.5, -0.5,
            -0.5,  0.5,
             0.5,  0.5,
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

        // Standard src-over alpha blending — predictable, no exotic
        // blend modes. The canvas itself composites onto the page via
        // ordinary alpha (no mix-blend-mode).
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
        gl.bindBuffer(gl.ARRAY_BUFFER, this.quadVbo);
        gl.enableVertexAttribArray(aQuadPos);
        gl.vertexAttribPointer(aQuadPos, 2, gl.FLOAT, false, 2 * 4, 0);

        const aPos    = gl.getAttribLocation(program, 'a_pos');
        const aSize   = gl.getAttribLocation(program, 'a_size');
        const aColor  = gl.getAttribLocation(program, 'a_color');
        const aAngle  = gl.getAttribLocation(program, 'a_angle');
        const aShape  = gl.getAttribLocation(program, 'a_shape');
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
        setInst(aAngle, 1);
        setInst(aShape, 1);
    }

    /** Resize the bullet canvas drawing buffer. */
    resize(w, h) {
        if (!this.supported || this._contextLost) return;
        this.canvas.width = w;
        this.canvas.height = h;
        this.gl.viewport(0, 0, w, h);
    }

    /** Reset the per-frame instance scratch AND clear the canvas. */
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
     * `size` is the desired body diameter in screen pixels. The body
     * silhouette in unit-quad space sits at radius 0.40, so the quad
     * needs to be `size / 0.80 = size * 1.25` wide for the body to
     * land at the requested diameter. The remaining 0.10 of quad
     * half-width is the soft glow tail.
     *
     * `aspect > 1` stretches the quad along its rotation axis (height)
     * for elongated enemy bullets. `angle` then rotates the quad to
     * align the long axis with travel.
     */
    pushBullet(shape, x, y, size, color, alpha, angle = 0, aspect = 1) {
        if (this.instanceCount >= this.maxInstances) return false;
        const shapeId = SHAPE_IDS[shape];
        if (shapeId === undefined) return false;

        const data = this.instanceData;
        const base = this.instanceCount * FLOATS_PER_INSTANCE;
        const rgb = this._colorParser.parse(color || '#ffff80');
        const sizeScaled = size * 1.25;

        data[base + 0] = x;
        data[base + 1] = y;
        data[base + 2] = sizeScaled;
        data[base + 3] = sizeScaled * aspect;
        data[base + 4] = rgb[0];
        data[base + 5] = rgb[1];
        data[base + 6] = rgb[2];
        data[base + 7] = alpha;
        data[base + 8] = angle;
        data[base + 9] = shapeId;
        this.instanceCount++;
        return true;
    }

    /** Draw all pushed instances. One instanced draw call. */
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

        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);

        gl.bindVertexArray(null);
    }

    /** Returns true when this renderer can handle the given shape key. */
    handlesShape(shape) {
        return this.supported
            && !this._contextLost
            && Object.prototype.hasOwnProperty.call(SHAPE_IDS, shape);
    }
}
