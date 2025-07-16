import { GAME_CONFIG, NOISE_CONFIG } from './constants.js';

// Utility functions
export const random = (a, b) => Math.random() * (b - a) + a;

export function wrap(object, width, height) {
    if (object.x < 0) object.x += width;
    if (object.x > width) object.x -= width;
    if (object.y < 0) object.y += height;
    if (object.y > height) object.y -= height;
}

export function collision(a, b) {
    const dx = a.x - b.x;
    const dy = a.y - b.y;
    return Math.hypot(dx, dy) < a.radius + b.radius;
}

export function triggerHapticFeedback(duration = 10) {
    if (navigator.vibrate) {
        navigator.vibrate(duration);
    }
}

export function checkOrientation() {
    const isMobile = window.matchMedia("(any-pointer: coarse)").matches;
    return isMobile && window.innerHeight > window.innerWidth;
}

export function isPortrait() {
    const isMobile = window.matchMedia("(any-pointer: coarse)").matches;
    return isMobile && window.innerHeight > window.innerWidth;
}

// --- NOISE GENERATION AND STAR DISTRIBUTION ---

class NoiseGenerator {
    constructor(seed = Date.now()) {
        this.p = new Uint8Array(512);
        this.seed = seed;
        this.reseed(this.seed);
    }

    reseed(seed) {
        this.seed = seed;
        const random = this.seededRandom(seed);
        for (let i = 0; i < 256; i++) {
            this.p[i] = i;
        }
        for (let i = 255; i > 0; i--) {
            const n = Math.floor(random() * (i + 1));
            [this.p[i], this.p[n]] = [this.p[n], this.p[i]];
        }
        for (let i = 0; i < 256; i++) {
            this.p[i + 256] = this.p[i];
        }
    }

    perlin2(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        const u = this.fade(x);
        const v = this.fade(y);
        const A = this.p[X] + Y,
              AA = this.p[A],
              AB = this.p[A + 1],
              B = this.p[X + 1] + Y,
              BA = this.p[B],
              BB = this.p[B + 1];

        return this.lerp(v, this.lerp(u, this.grad(this.p[AA], x, y), this.grad(this.p[BA], x - 1, y)),
                            this.lerp(u, this.grad(this.p[AB], x, y - 1), this.grad(this.p[BB], x - 1, y - 1)));
    }

    fbm(x, y, octaves, lacunarity, persistence) {
        let total = 0;
        let frequency = 1;
        let amplitude = 1;
        let maxValue = 0;
        for (let i = 0; i < octaves; i++) {
            total += this.perlin2(x * frequency, y * frequency) * amplitude;
            maxValue += amplitude;
            amplitude *= persistence;
            frequency *= lacunarity;
        }
        return total / maxValue;
    }

    worley(x, y, numPointsPerCell = 1) {
        const Pi = Math.floor(x);
        const Pf = x - Pi;
        const Pj = Math.floor(y);
        const Pfj = y - Pj;

        let minDist = 1000.0;

        for (let j = -1; j <= 1; j++) {
            for (let i = -1; i <= 1; i++) {
                const N = this.getPoint(Pi + i, Pj + j, numPointsPerCell);
                const diff = { x: N.x + i - Pf, y: N.y + j - Pfj };
                const dist = Math.hypot(diff.x, diff.y);
                minDist = Math.min(minDist, dist);
            }
        }
        return Math.min(minDist, 1.0);
    }
    
    getPoint(xi, yi, numPoints) {
        const seed = xi * 127 + yi * 311 + this.seed;
        const random = this.seededRandom(seed);
        let min_dist = 10.0;
        let best_point = {x: 0, y: 0};
        for(let i=0; i<numPoints; i++){
            let p_x = random();
            let p_y = random();
            let d = Math.hypot(p_x - 0.5, p_y - 0.5);
            if(d < min_dist) {
                min_dist = d;
                best_point.x = p_x;
                best_point.y = p_y;
            }
        }
        return best_point;
    }

    seededRandom(seed) {
        let state = seed;
        return function() {
            state = (state * 9301 + 49297) % 233280;
            return state / 233280;
        };
    }

    fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    lerp(t, a, b) { return a + t * (b - a); }
    grad(hash, x, y) {
        const h = hash & 15;
        const u = h < 8 ? x : y;
        const v = h < 4 ? y : h === 12 || h === 14 ? x : 0;
        return ((h & 1) === 0 ? u : -u) + ((h & 2) === 0 ? v : -v);
    }
}

const noiseGen = new NoiseGenerator();

export function getStarDensity(x, y, z) {
    let config;
    if (z < 0.6) {
        config = NOISE_CONFIG.FAR_LAYER;
    } else if (z < 2.0) {
        config = NOISE_CONFIG.MID_LAYER;
    } else {
        config = NOISE_CONFIG.NEAR_LAYER;
    }

    const fbmVal = noiseGen.fbm(x * config.FBM_SCALE, y * config.FBM_SCALE, config.FBM_OCTAVES, config.FBM_LACUNARITY, config.FBM_PERSISTENCE);
    const worleyVal = 1.0 - noiseGen.worley(x * config.WORLEY_SCALE, y * config.WORLEY_SCALE);
    
    let density = (fbmVal * config.FBM_WEIGHT + worleyVal * config.WORLEY_WEIGHT);
    density = (density - 0.5) * NOISE_CONFIG.DENSITY_MULTIPLIER + 0.5;
    return Math.max(0, Math.min(1, density));
}

export function generatePoissonStarPosition(spawnWidth, spawnHeight, existingStars, z) {
    const maxAttempts = 30;
    const baseRadius = GAME_CONFIG.MIN_STAR_DIST;
    
    for (let i = 0; i < maxAttempts; i++) {
        const x = random(0, spawnWidth);
        const y = random(0, spawnHeight);
        
        const density = getStarDensity(x, y, z);
        const minDistance = baseRadius + (1.0 - density) * baseRadius * 3;

        let tooClose = false;
        for (const star of existingStars) {
            const dist = Math.hypot(x - star.x, y - star.y);
            
            const otherStarMinDist = baseRadius + (1.0 - star.density) * baseRadius * 3;
            if (dist < Math.max(minDistance, otherStarMinDist)) {
                tooClose = true;
                break;
            }
        }
        
        if (!tooClose) {
            return { x, y, density };
        }
    }
    
    return null; // Return null if no valid position is found
} 

export function isCirclePolygonColliding(circle, polygon) {
    if (!polygon.active || !circle.active) return false;

    // First, check if the circle's center is inside the polygon
    let inside = false;
    for (let i = 0, j = polygon.vertices.length - 1; i < polygon.vertices.length; j = i++) {
        const xi = polygon.x + polygon.vertices[i].x;
        const yi = polygon.y + polygon.vertices[i].y;
        const xj = polygon.x + polygon.vertices[j].x;
        const yj = polygon.y + polygon.vertices[j].y;

        const intersect = ((yi > circle.y) !== (yj > circle.y))
            && (circle.x < (xj - xi) * (circle.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    if (inside) return true;

    // Second, check if any of the polygon's edges are close to the circle
    for (let i = 0, j = polygon.vertices.length - 1; i < polygon.vertices.length; j = i++) {
        const p1 = { x: polygon.x + polygon.vertices[i].x, y: polygon.y + polygon.vertices[i].y };
        const p2 = { x: polygon.x + polygon.vertices[j].x, y: polygon.y + polygon.vertices[j].y };
        if (isLineCircleColliding(p1, p2, circle)) {
            return true;
        }
    }

    return false;
}

function isLineCircleColliding(p1, p2, circle) {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const lenSq = dx * dx + dy * dy;

    // t is the projection of the circle's center onto the line segment
    let t = ((circle.x - p1.x) * dx + (circle.y - p1.y) * dy) / lenSq;
    t = Math.max(0, Math.min(1, t)); // clamp t to the segment

    const closestX = p1.x + t * dx;
    const closestY = p1.y + t * dy;

    const distSq = (circle.x - closestX) * (circle.x - closestX) + (circle.y - closestY) * (circle.y - closestY);

    return distSq < circle.radius * circle.radius;
}

/**
 * Wraps a value around a given range.
 * @param {number} value The value to wrap.
 * @param {number} min The minimum value of the range.
 * @param {number} max The maximum value of the range.
 * @returns {number} The wrapped value.
 */
export function wrapValue(value, min, max) {
    const range = max - min;
    if (range === 0) return min; // Avoid division by zero
    return min + (value - min) % range;
} 