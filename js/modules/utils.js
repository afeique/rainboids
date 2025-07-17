import { GAME_CONFIG, NOISE_CONFIG } from './constants.js';

// Game dimensions singleton
export const GameDimensions = {
    get width() { return window.innerWidth; },
    get height() { return window.innerHeight; }
};

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

// Galaxy pattern generation functions
function calculateGalaxyDensity(x, y, z, spawnWidth, spawnHeight) {
    let galaxyDensity = 0;
    
    // Convert absolute coordinates to normalized coordinates (0-1)
    const normX = x / spawnWidth;
    const normY = y / spawnHeight;
    
    for (const galaxy of NOISE_CONFIG.GALAXY_CENTERS) {
        const dx = normX - galaxy.x;
        const dy = normY - galaxy.y;
        const distance = Math.hypot(dx, dy);
        
        // Halo effect - exponential falloff from galaxy center
        const haloStrength = Math.exp(-distance / (galaxy.haloRadius * 0.5)) * galaxy.intensity;
        
        // Spiral pattern calculation
        const angle = Math.atan2(dy, dx);
        const spiralAngle = Math.log(distance * 100 + 1) * galaxy.spiralTightness;
        
        let spiralStrength = 0;
        for (let arm = 0; arm < NOISE_CONFIG.SPIRAL_ARMS; arm++) {
            const armAngle = (arm * 2 * Math.PI / NOISE_CONFIG.SPIRAL_ARMS) + spiralAngle;
            const angleDiff = Math.abs(((angle - armAngle + Math.PI) % (2 * Math.PI)) - Math.PI);
            const spiralWidth = 0.3 + distance * 0.5; // Spiral arms get wider towards edges
            
            if (angleDiff < spiralWidth) {
                const spiralFalloff = Math.cos(angleDiff / spiralWidth * Math.PI / 2);
                spiralStrength = Math.max(spiralStrength, spiralFalloff * galaxy.intensity);
            }
        }
        
        // Combine halo and spiral effects with distance-based weighting
        const distanceWeight = Math.exp(-distance * 3); // Limit influence radius
        const combinedEffect = Math.max(
            haloStrength * NOISE_CONFIG.HALO_AMPLITUDE,
            spiralStrength * NOISE_CONFIG.SPIRAL_AMPLITUDE
        );
        
        galaxyDensity += combinedEffect * distanceWeight;
    }
    
    // Add depth-based variation - far layers have more galaxy structure influence
    const depthMultiplier = z < 0.6 ? 1.2 : (z < 2.0 ? 0.8 : 0.4);
    return Math.min(1, galaxyDensity * depthMultiplier);
}

export function getStarDensity(x, y, z, spawnWidth = 1920, spawnHeight = 1080) {
    let config;
    if (z < 0.6) {
        config = NOISE_CONFIG.FAR_LAYER;
    } else if (z < 2.0) {
        config = NOISE_CONFIG.MID_LAYER;
    } else {
        config = NOISE_CONFIG.NEAR_LAYER;
    }

    // Calculate base noise density
    const fbmVal = noiseGen.fbm(x * config.FBM_SCALE, y * config.FBM_SCALE, config.FBM_OCTAVES, config.FBM_LACUNARITY, config.FBM_PERSISTENCE);
    const worleyVal = 1.0 - noiseGen.worley(x * config.WORLEY_SCALE, y * config.WORLEY_SCALE);
    
    let baseDensity = (fbmVal * config.FBM_WEIGHT + worleyVal * config.WORLEY_WEIGHT);
    baseDensity = (baseDensity - 0.5) * NOISE_CONFIG.DENSITY_MULTIPLIER + 0.5;
    
    // Calculate galaxy pattern density
    const galaxyDensity = calculateGalaxyDensity(x, y, z, spawnWidth, spawnHeight);
    
    // Combine base noise with galaxy patterns
    // Use multiplication for regions where both are high, addition for overall enhancement
    const combinedDensity = baseDensity * 0.6 + galaxyDensity * 0.4 + (baseDensity * galaxyDensity * 0.3);
    
    return Math.max(0, Math.min(1, combinedDensity));
}

export function generatePoissonStarPosition(spawnWidth, spawnHeight, existingStars, z) {
    const maxAttempts = 30;
    const baseRadius = GAME_CONFIG.MIN_STAR_DIST;
    
    for (let i = 0; i < maxAttempts; i++) {
        const x = random(0, spawnWidth);
        const y = random(0, spawnHeight);
        
        const density = getStarDensity(x, y, z, spawnWidth, spawnHeight);
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

/**
 * Draws a money/coin stack icon using SVG path data
 * @param {CanvasRenderingContext2D} ctx - The canvas rendering context
 * @param {number} x - The x coordinate for the icon center
 * @param {number} y - The y coordinate for the icon center
 * @param {number} size - The size of the icon (width/height)
 * @param {string} fillColor - The fill color for the icon (default: dark goldenrod)
 * @param {string} strokeColor - The stroke color for the icon (default: bright yellow)
 */
export function drawMoneyIcon(ctx, x, y, size = 20, fillColor = '#FFFF00', strokeColor = '#B8860B') {
    ctx.save();
    
    // Calculate scale factor (original SVG viewBox is 60x60)
    const scale = size / 60;
    
    // Translate to center the icon at the specified position
    ctx.translate(x - size / 2, y - size / 2);
    ctx.scale(scale, scale);
    
    // Set fill and stroke styles
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5 / scale; // Adjust line width for scaling
    
    // Draw the exact SVG path for coin stack
    ctx.beginPath();
    const pathData = "M59.989,21c-0.099-1.711-2.134-3.048-6.204-4.068c0.137-0.3,0.214-0.612,0.215-0.936V9h-0.017C53.625,3.172,29.743,3,27,3 S0.375,3.172,0.017,9H0v0.13v0v0l0,6.869c0.005,1.9,2.457,3.387,6.105,4.494c-0.05,0.166-0.08,0.335-0.09,0.507H6v0.13v0v0l0,6.857 C2.07,28.999,0.107,30.317,0.01,32H0v0.13v0v0l0,6.869c0.003,1.323,1.196,2.445,3.148,3.38C3.075,42.581,3.028,42.788,3.015,43H3 v0.13v0v0l0,6.869c0.008,3.326,7.497,5.391,15.818,6.355c0.061,0.012,0.117,0.037,0.182,0.037c0.019,0,0.035-0.01,0.054-0.011 c1.604,0.181,3.234,0.322,4.847,0.423c0.034,0.004,0.064,0.02,0.099,0.02c0.019,0,0.034-0.01,0.052-0.011 C26.1,56.937,28.115,57,30,57c1.885,0,3.9-0.063,5.948-0.188c0.018,0.001,0.034,0.011,0.052,0.011c0.035,0,0.065-0.017,0.099-0.02 c1.613-0.101,3.243-0.241,4.847-0.423C40.965,56.38,40.981,56.39,41,56.39c0.065,0,0.121-0.025,0.182-0.037 c8.321-0.964,15.809-3.03,15.818-6.357V43h-0.016c-0.07-1.226-1.115-2.249-3.179-3.104c0.126-0.289,0.195-0.589,0.195-0.9V32.46 c3.59-1.104,5.995-2.581,6-4.464V21H59.989z M7,18.674v-4.831c0.934,0.252,1.938,0.482,3,0.691v4.881 c-0.123-0.026-0.25-0.052-0.37-0.078c-0.532-0.117-1.051-0.239-1.547-0.368C7.705,18.872,7.346,18.773,7,18.674z M51.771,16.482 l-0.028-0.006l-0.364,0.283C50.851,17.17,50.04,17.586,49,17.988v-4.757c1.189-0.414,2.201-0.873,3-1.376v4.138 C52,16.145,51.92,16.309,51.771,16.482z M25.175,38.983c0.275,0.005,0.55,0.009,0.825,0.012v4.998 c-0.194-0.002-0.388-0.002-0.581-0.005c-0.088-0.001-0.173-0.004-0.26-0.005c-0.458-0.008-0.914-0.019-1.367-0.033 c-0.056-0.002-0.112-0.004-0.168-0.006c-0.545-0.018-1.086-0.041-1.623-0.067v-4.992c1.002,0.047,2.009,0.078,3.016,0.096 C25.069,38.981,25.122,38.982,25.175,38.983z M28.984,38.98c1.007-0.019,2.014-0.05,3.016-0.096v4.993 c-0.214,0.011-0.429,0.021-0.646,0.03c-0.6,0.025-1.209,0.046-1.828,0.061c-0.146,0.004-0.293,0.006-0.44,0.009 c-0.357,0.007-0.723,0.009-1.085,0.012v-4.995c0.275-0.003,0.55-0.007,0.825-0.012C28.878,38.982,28.931,38.981,28.984,38.98z M34.666,43.708c-0.22,0.017-0.442,0.034-0.666,0.05v-4.987c1.014-0.067,2.016-0.147,3-0.243v4.966 c-0.618,0.065-1.25,0.126-1.899,0.179C34.956,43.686,34.811,43.697,34.666,43.708z M39,38.312c1.031-0.124,2.032-0.265,3-0.422v4.91 c-0.942,0.166-1.943,0.319-3,0.458V38.312z M17.519,43.548c-0.102-0.01-0.203-0.021-0.304-0.031 c-0.072-0.007-0.143-0.016-0.215-0.023v-4.965c0.984,0.095,1.986,0.176,3,0.243v4.983C19.16,43.695,18.33,43.627,17.519,43.548z M15,38.312v4.946c-1.057-0.139-2.058-0.292-3-0.458v-4.91C12.968,38.047,13.969,38.189,15,38.312z M44,42.414v-4.881 c1.062-0.209,2.066-0.439,3-0.691v4.831C46.109,41.930,45.106,42.179,44,42.414z M25.175,15.983c0.275,0.005,0.55,0.009,0.825,0.012 v4.993c-1.346-0.013-2.684-0.048-4-0.114v-4.989c1.002,0.047,2.009,0.078,3.016,0.096C25.069,15.981,25.122,15.982,25.175,15.983z M28.984,15.98c1.007-0.019,2.014-0.05,3.016-0.096v4.989c-0.17,0.008-0.333,0.02-0.504,0.028c-0.014,0.001-0.028,0.001-0.043,0.002 c-0.671,0.03-1.355,0.052-2.048,0.068c-0.108,0.003-0.216,0.004-0.324,0.007c-0.356,0.007-0.72,0.008-1.081,0.012v-4.995 c0.275-0.003,0.55-0.007,0.825-0.012C28.878,15.982,28.931,15.981,28.984,15.98z M34.984,27.98c1.007-0.019,2.014-0.05,3.016-0.096 v4.988c-1.314,0.065-2.65,0.101-4,0.115v-4.992c0.275-0.003,0.55-0.007,0.825-0.012C34.878,27.982,34.931,27.981,34.984,27.98z M25.347,32.709c-0.64-0.05-1.265-0.105-1.875-0.166c-0.131-0.013-0.262-0.027-0.392-0.04C23.053,32.5,23.027,32.496,23,32.494 v-4.966c0.984,0.095,1.986,0.176,3,0.243v4.984c-0.081-0.006-0.167-0.01-0.248-0.016C25.616,32.729,25.481,32.719,25.347,32.709z M19.145,31.992c-0.396-0.063-0.768-0.131-1.145-0.197v-4.904c0.968,0.157,1.969,0.298,3,0.422v4.946 c-0.612-0.081-1.211-0.165-1.786-0.255C19.191,31.999,19.168,31.995,19.145,31.992z M31.175,27.983 c0.275,0.005,0.55,0.009,0.825,0.012v4.993c-0.487-0.005-0.978-0.007-1.453-0.018c-0.073-0.002-0.149-0.003-0.222-0.004 c-0.752-0.019-1.487-0.048-2.209-0.083c-0.039-0.002-0.078-0.004-0.116-0.005v-4.993c1.002,0.047,2.009,0.078,3.016,0.096 C31.069,27.981,31.122,27.982,31.175,27.983z M41.242,32.661c-0.036,0.003-0.071,0.006-0.107,0.009 c-0.373,0.031-0.758,0.051-1.136,0.078v-4.978c1.014-0.067,2.016-0.147,3-0.243v4.961C42.419,32.55,41.839,32.611,41.242,32.661z M17,20.49v-4.962c0.984,0.095,1.986,0.176,3,0.243v4.978C18.982,20.676,17.978,20.593,17,20.49z M37,20.488 c-0.966,0.102-1.966,0.191-3,0.265v-4.982c1.014-0.067,2.016-0.147,3-0.243V20.488z M39,15.312c1.031-0.124,2.032-0.265,3-0.422 v4.902c-0.948,0.167-1.946,0.321-3,0.46V15.312z M44,19.407v-4.873c1.062-0.209,2.066-0.439,3-0.691v4.82 C46.104,18.924,45.095,19.173,44,19.407z M15,15.312v4.941c-0.198-0.026-0.404-0.047-0.6-0.074c-0.128-0.018-0.25-0.037-0.376-0.055 c-0.578-0.083-1.143-0.172-1.697-0.265C12.216,19.84,12.109,19.82,12,19.801v-4.91C12.968,15.047,13.969,15.189,15,15.312z M16,26.533v4.873c-1.105-0.237-2.107-0.489-3-0.751v-4.813C13.934,26.094,14.938,26.325,16,26.533z M47.907,31.817 c-0.439,0.076-0.882,0.151-1.337,0.22c-0.261,0.04-0.528,0.078-0.796,0.116c-0.253,0.036-0.516,0.067-0.773,0.1v-4.941 c1.031-0.124,2.032-0.265,3-0.422v4.91C47.969,31.806,47.938,31.812,47.907,31.817z M11,25.231v4.751 c-1.572-0.607-2.586-1.227-2.916-1.779l-0.067-0.112C8.011,28.06,8.001,28.027,8,27.996l0-4.141 C8.799,24.358,9.811,24.817,11,25.231z M10,37.533v4.881c-0.918-0.195-1.765-0.4-2.536-0.61c-0.122-0.034-0.248-0.067-0.367-0.102 C7.064,41.692,7.033,41.683,7,41.674v-4.831C7.934,37.094,8.938,37.325,10,37.533z M13,48.533v4.881 c-1.106-0.235-2.109-0.484-3-0.741v-4.831C10.934,48.094,11.938,48.325,13,48.533z M15,48.891c0.968,0.157,1.969,0.298,3,0.422 v4.946c-1.057-0.139-2.058-0.292-3-0.458V48.891z M20,49.528c0.984,0.095,1.986,0.176,3,0.243v4.987 c-1.039-0.073-2.039-0.162-3-0.263V49.528z M25,49.884c1.002,0.047,2.009,0.078,3.016,0.096c0.053,0.001,0.106,0.002,0.158,0.003 c0.275,0.005,0.55,0.009,0.825,0.012v4.999c-1.382-0.013-2.716-0.053-4-0.116V49.884z M31,49.994 c0.275-0.003,0.55-0.007,0.825-0.012c0.053-0.001,0.106-0.002,0.159-0.003c1.007-0.019,2.014-0.05,3.016-0.096v4.993 c-1.284,0.063-2.618,0.103-4,0.116V49.994z M37,49.771c1.014-0.067,2.016-0.147,3-0.243v4.966c-0.961,0.101-1.961,0.19-3,0.263 V49.771z M42,49.312c1.031-0.124,2.032-0.265,3-0.422v4.91c-0.942,0.166-1.943,0.319-3,0.458V49.312z M47,48.533 c1.062-0.209,2.066-0.439,3-0.691v4.831c-0.891,0.257-1.894,0.506-3,0.741V48.533z M51.892,39.321l-0.341,0.299 C51.026,40.083,50.151,40.55,49,41v-4.768c1.189-0.414,2.201-0.873,3-1.376v4.138C52,39.097,51.962,39.207,51.892,39.321z M52.564,30.796c-0.498,0.139-1.025,0.269-1.563,0.396c-0.249,0.058-0.503,0.116-0.763,0.172c-0.077,0.017-0.159,0.032-0.237,0.049 v-4.879c1.062-0.209,2.066-0.439,3-0.691v4.831C52.857,30.714,52.712,30.755,52.564,30.796z M2,15.996l0-4.141 c0.799,0.503,1.811,0.962,3,1.376v4.788C3.055,17.29,2.002,16.559,2,15.996z M2,38.996l0-4.141c0.799,0.503,1.811,0.962,3,1.376 v4.769l-0.571-0.222L4.417,40.79C2.847,40.139,2.002,39.5,2,38.996z M5,49.996l0-4.141c0.799,0.503,1.811,0.962,3,1.376v4.788 C6.055,51.29,5.002,50.559,5,49.996z M52,52.019v-4.787c1.189-0.414,2.201-0.873,3-1.376v4.138 C54.999,50.557,53.945,51.289,52,52.019z M55,30.019v-4.787c1.189-0.414,2.201-0.873,3-1.376v4.138 C57.999,28.557,56.945,29.289,55,30.019z";
    
    // Use Path2D for better performance with complex paths
    const path = new Path2D(pathData);
    ctx.fill(path);
    ctx.stroke(path);
    
    ctx.restore();
} 

/**
 * Draws a heart icon using SVG path data
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {number} x - The x position to center the icon
 * @param {number} y - The y position to center the icon 
 * @param {number} size - The size of the icon (width/height)
 * @param {string} fillColor - The fill color for the icon (default: maroon)
 * @param {string} strokeColor - The stroke color for the icon (default: bright crimson)
 */
export function drawHeartIcon(ctx, x, y, size = 20, fillColor = '#800000', strokeColor = '#DC143C') {
    ctx.save();
    
    // Calculate scale factor (original SVG viewBox is 24x24)
    const scale = size / 24;
    
    // Translate to center the icon at the specified position
    ctx.translate(x - size / 2, y - size / 2);
    ctx.scale(scale, scale);
    
    // Set fill and stroke styles
    ctx.fillStyle = fillColor;
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5 / scale; // Adjust line width for scaling
    
    // Draw the exact SVG path for heart
    ctx.beginPath();
    const pathData = "M8.10627 18.2468C5.29819 16.0833 2 13.5422 2 9.1371C2 4.27416 7.50016 0.825464 12 5.50063L14 7.49928C14.2929 7.79212 14.7678 7.79203 15.0607 7.49908C15.3535 7.20614 15.3534 6.73127 15.0605 6.43843L13.1285 4.50712C17.3685 1.40309 22 4.67465 22 9.1371C22 13.5422 18.7018 16.0833 15.8937 18.2468C15.6019 18.4717 15.3153 18.6925 15.0383 18.9109C14 19.7294 13 20.5 12 20.5C11 20.5 10 19.7294 8.96173 18.9109C8.68471 18.6925 8.39814 18.4717 8.10627 18.2468Z";
    
    // Use Path2D for better performance with complex paths
    const path = new Path2D(pathData);
    ctx.fill(path);
    ctx.stroke(path);
    
    ctx.restore();
} 

// --- ICON SPRITE CACHE SYSTEM ---
class IconSpriteCache {
    constructor() {
        this.cache = new Map();
    }
    
    /**
     * Gets a cached sprite for an icon, creating it if it doesn't exist
     * @param {string} iconType - The type of icon ('shield', 'coin', 'heart')
     * @param {number} size - The size of the icon
     * @param {string} fillColor - The fill color
     * @param {string} strokeColor - The stroke color
     * @returns {HTMLCanvasElement} The cached sprite canvas
     */
    getSprite(iconType, size, fillColor = '', strokeColor = '') {
        const key = `${iconType}_${size}_${fillColor}_${strokeColor}`;
        
        if (!this.cache.has(key)) {
            this.cache.set(key, this.createSprite(iconType, size, fillColor, strokeColor));
        }
        
        return this.cache.get(key);
    }
    
    /**
     * Creates a new sprite by rendering the icon to an offscreen canvas
     * @param {string} iconType - The type of icon
     * @param {number} size - The size of the icon
     * @param {string} fillColor - The fill color
     * @param {string} strokeColor - The stroke color
     * @returns {HTMLCanvasElement} The sprite canvas
     */
    createSprite(iconType, size, fillColor, strokeColor) {
        const canvas = document.createElement('canvas');
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');
        
        // Render the icon to the sprite canvas
        switch (iconType) {
            case 'shield':
                this.renderShieldToSprite(ctx, size, fillColor, strokeColor);
                break;
            case 'coin':
                this.renderCoinToSprite(ctx, size, fillColor, strokeColor);
                break;
            case 'heart':
                this.renderHeartToSprite(ctx, size, fillColor, strokeColor);
                break;
        }
        
        return canvas;
    }
    
    /**
     * Renders a shield icon to a sprite canvas
     */
    renderShieldToSprite(ctx, size, fillColor, strokeColor) {
        ctx.save();
        
        const scale = size / 16; // SVG viewBox is 16x16
        const centerX = size / 2;
        const centerY = size / 2;
        
        // Create gradient fill
        const gradient = ctx.createLinearGradient(centerX, centerY - size/2, centerX, centerY + size/2);
        gradient.addColorStop(0, 'rgba(135, 206, 250, 0.95)'); // Light sky blue
        gradient.addColorStop(0.5, 'rgba(100, 180, 255, 0.9)'); // Sky blue
        gradient.addColorStop(1, 'rgba(70, 150, 220, 0.85)'); // Deeper sky blue
        
        // Draw shield shape using exact SVG path coordinates
        const offsetX = centerX - 8 * scale;
        const offsetY = centerY - 8 * scale;
        
        ctx.beginPath();
        // Start at top center (8,0)
        ctx.moveTo(offsetX + 8 * scale, offsetY + 0 * scale);
        // Line to left top corner (1,3)
        ctx.lineTo(offsetX + 1 * scale, offsetY + 3 * scale);
        // Line down left side to (1, 6.88306)
        ctx.lineTo(offsetX + 1 * scale, offsetY + 6.88306 * scale);
        // Curve to bottom left (4.35009, 13.3929)
        ctx.bezierCurveTo(
            offsetX + 1 * scale, offsetY + 9.46667 * scale,
            offsetX + 2.24773 * scale, offsetY + 11.8912 * scale,
            offsetX + 4.35009 * scale, offsetY + 13.3929 * scale
        );
        // Line to bottom center (8,16)
        ctx.lineTo(offsetX + 8 * scale, offsetY + 16 * scale);
        // Line to bottom right (11.6499, 13.3929)
        ctx.lineTo(offsetX + 11.6499 * scale, offsetY + 13.3929 * scale);
        // Curve to right side
        ctx.bezierCurveTo(
            offsetX + 13.7523 * scale, offsetY + 11.8912 * scale,
            offsetX + 15 * scale, offsetY + 9.46667 * scale,
            offsetX + 15 * scale, offsetY + 6.88306 * scale
        );
        // Line up right side to (15,3)
        ctx.lineTo(offsetX + 15 * scale, offsetY + 3 * scale);
        // Line to top center, completing the path
        ctx.lineTo(offsetX + 8 * scale, offsetY + 0 * scale);
        ctx.closePath();
        
        // Fill and stroke
        ctx.fillStyle = gradient;
        ctx.fill();
        ctx.strokeStyle = 'rgba(120, 180, 255, 0.8)';
        ctx.lineWidth = 2;
        ctx.stroke();
        
        ctx.restore();
    }
    
    /**
     * Renders a coin icon to a sprite canvas
     */
    renderCoinToSprite(ctx, size, fillColor, strokeColor) {
        ctx.save();
        
        const scale = size / 60; // Original SVG viewBox is 60x60
        ctx.scale(scale, scale);
        
        ctx.fillStyle = fillColor || '#FFFF00';
        ctx.strokeStyle = strokeColor || '#B8860B';
        ctx.lineWidth = 1.5 / scale;
        
        // Draw the coin stack path
        const pathData = "M59.989,21c-0.099-1.711-2.134-3.048-6.204-4.068c0.137-0.3,0.214-0.612,0.215-0.936V9h-0.017C53.625,3.172,29.743,3,27,3 S0.375,3.172,0.017,9H0v0.13v0v0l0,6.869c0.005,1.9,2.457,3.387,6.105,4.494c-0.05,0.166-0.08,0.335-0.09,0.507H6v0.13v0v0l0,6.857 C2.07,28.999,0.107,30.317,0.01,32H0v0.13v0v0l0,6.869c0.003,1.323,1.196,2.445,3.148,3.38C3.075,42.581,3.028,42.788,3.015,43H3 v0.13v0v0l0,6.869c0.008,3.326,7.497,5.391,15.818,6.355c0.061,0.012,0.117,0.037,0.182,0.037c0.019,0,0.035-0.01,0.054-0.011 c1.604,0.181,3.234,0.322,4.847,0.423c0.034,0.004,0.064,0.02,0.099,0.02c0.019,0,0.034-0.01,0.052-0.011 C26.1,56.937,28.115,57,30,57c1.885,0,3.9-0.063,5.948-0.188c0.018,0.001,0.034,0.011,0.052,0.011c0.035,0,0.065-0.017,0.099-0.02 c1.613-0.101,3.243-0.241,4.847-0.423C40.965,56.38,40.981,56.39,41,56.39c0.065,0,0.121-0.025,0.182-0.037 c8.321-0.964,15.809-3.03,15.818-6.357V43h-0.016c-0.07-1.226-1.115-2.249-3.179-3.104c0.126-0.289,0.195-0.589,0.195-0.9V32.46 c3.59-1.104,5.995-2.581,6-4.464V21H59.989z M7,18.674v-4.831c0.934,0.252,1.938,0.482,3,0.691v4.881 c-0.123-0.026-0.25-0.052-0.37-0.078c-0.532-0.117-1.051-0.239-1.547-0.368C7.705,18.872,7.346,18.773,7,18.674z M51.771,16.482 l-0.028-0.006l-0.364,0.283C50.851,17.17,50.04,17.586,49,17.988v-4.757c1.189-0.414,2.201-0.873,3-1.376v4.138 C52,16.145,51.92,16.309,51.771,16.482z M25.175,38.983c0.275,0.005,0.55,0.009,0.825,0.012v4.998 c-0.194-0.002-0.388-0.002-0.581-0.005c-0.088-0.001-0.173-0.004-0.26-0.005c-0.458-0.008-0.914-0.019-1.367-0.033 c-0.056-0.002-0.112-0.004-0.168-0.006c-0.545-0.018-1.086-0.041-1.623-0.067v-4.992c1.002,0.047,2.009,0.078,3.016,0.096 C25.069,38.981,25.122,38.982,25.175,38.983z M28.984,38.98c1.007-0.019,2.014-0.05,3.016-0.096v4.993 c-0.214,0.011-0.429,0.021-0.646,0.03c-0.6,0.025-1.209,0.046-1.828,0.061c-0.146,0.004-0.293,0.006-0.44,0.009 c-0.357,0.007-0.723,0.009-1.085,0.012v-4.995c0.275-0.003,0.55-0.007,0.825-0.012C28.878,38.982,28.931,38.981,28.984,38.98z M34.666,43.708c-0.22,0.017-0.442,0.034-0.666,0.05v-4.987c1.014-0.067,2.016-0.147,3-0.243v4.966 c-0.618,0.065-1.25,0.126-1.899,0.179C34.956,43.686,34.811,43.697,34.666,43.708z M39,38.312c1.031-0.124,2.032-0.265,3-0.422v4.91 c-0.942,0.166-1.943,0.319-3,0.458V38.312z M17.519,43.548c-0.102-0.01-0.203-0.021-0.304-0.031 c-0.072-0.007-0.143-0.016-0.215-0.023v-4.965c0.984,0.095,1.986,0.176,3,0.243v4.983C19.16,43.695,18.33,43.627,17.519,43.548z M15,38.312v4.946c-1.057-0.139-2.058-0.292-3-0.458v-4.91C12.968,38.047,13.969,38.189,15,38.312z M44,42.414v-4.881 c1.062-0.209,2.066-0.439,3-0.691v4.831C46.109,41.930,45.106,42.179,44,42.414z M25.175,15.983c0.275,0.005,0.55,0.009,0.825,0.012 v4.993c-1.346-0.013-2.684-0.048-4-0.114v-4.989c1.002,0.047,2.009,0.078,3.016,0.096C25.069,15.981,25.122,15.982,25.175,15.983z M28.984,15.98c1.007-0.019,2.014-0.05,3.016-0.096v4.989c-0.17,0.008-0.333,0.02-0.504,0.028c-0.014,0.001-0.028,0.001-0.043,0.002 c-0.671,0.03-1.355,0.052-2.048,0.068c-0.108,0.003-0.216,0.004-0.324,0.007c-0.356,0.007-0.72,0.008-1.081,0.012v-4.995 c0.275-0.003,0.55-0.007,0.825-0.012C28.878,15.982,28.931,15.981,28.984,15.98z M34.984,27.98c1.007-0.019,2.014-0.05,3.016-0.096 v4.988c-1.314,0.065-2.65,0.101-4,0.115v-4.992c0.275-0.003,0.55-0.007,0.825-0.012C34.878,27.982,34.931,27.981,34.984,27.98z M25.347,32.709c-0.64-0.05-1.265-0.105-1.875-0.166c-0.131-0.013-0.262-0.027-0.392-0.04C23.053,32.5,23.027,32.496,23,32.494 v-4.966c0.984,0.095,1.986,0.176,3,0.243v4.984c-0.081-0.006-0.167-0.01-0.248-0.016C25.616,32.729,25.481,32.719,25.347,32.709z M19.145,31.992c-0.396-0.063-0.768-0.131-1.145-0.197v-4.904c0.968,0.157,1.969,0.298,3,0.422v4.946 c-0.612-0.081-1.211-0.165-1.786-0.255C19.191,31.999,19.168,31.995,19.145,31.992z M31.175,27.983 c0.275,0.005,0.55,0.009,0.825,0.012v4.993c-0.487-0.005-0.978-0.007-1.453-0.018c-0.073-0.002-0.149-0.003-0.222-0.004 c-0.752-0.019-1.487-0.048-2.209-0.083c-0.039-0.002-0.078-0.004-0.116-0.005v-4.993c1.002,0.047,2.009,0.078,3.016,0.096 C31.069,27.981,31.122,27.982,31.175,27.983z M41.242,32.661c-0.036,0.003-0.071,0.006-0.107,0.009 c-0.373,0.031-0.758,0.051-1.136,0.078v-4.978c1.014-0.067,2.016-0.147,3-0.243v4.961C42.419,32.55,41.839,32.611,41.242,32.661z M17,20.49v-4.962c0.984,0.095,1.986,0.176,3,0.243v4.978C18.982,20.676,17.978,20.593,17,20.49z M37,20.488 c-0.966,0.102-1.966,0.191-3,0.265v-4.982c1.014-0.067,2.016-0.147,3-0.243V20.488z M39,15.312c1.031-0.124,2.032-0.265,3-0.422 v4.902c-0.948,0.167-1.946,0.321-3,0.46V15.312z M44,19.407v-4.873c1.062-0.209,2.066-0.439,3-0.691v4.82 C46.104,18.924,45.095,19.173,44,19.407z M15,15.312v4.941c-0.198-0.026-0.404-0.047-0.6-0.074c-0.128-0.018-0.25-0.037-0.376-0.055 c-0.578-0.083-1.143-0.172-1.697-0.265C12.216,19.84,12.109,19.82,12,19.801v-4.91C12.968,15.047,13.969,15.189,15,15.312z M16,26.533v4.873c-1.105-0.237-2.107-0.489-3-0.751v-4.813C13.934,26.094,14.938,26.325,16,26.533z M47.907,31.817 c-0.439,0.076-0.882,0.151-1.337,0.22c-0.261,0.04-0.528,0.078-0.796,0.116c-0.253,0.036-0.516,0.067-0.773,0.1v-4.941 c1.031-0.124,2.032-0.265,3-0.422v4.91C47.969,31.806,47.938,31.812,47.907,31.817z M11,25.231v4.751 c-1.572-0.607-2.586-1.227-2.916-1.779l-0.067-0.112C8.011,28.06,8.001,28.027,8,27.996l0-4.141 C8.799,24.358,9.811,24.817,11,25.231z M10,37.533v4.881c-0.918-0.195-1.765-0.4-2.536-0.61c-0.122-0.034-0.248-0.067-0.367-0.102 C7.064,41.692,7.033,41.683,7,41.674v-4.831C7.934,37.094,8.938,37.325,10,37.533z M13,48.533v4.881 c-1.106-0.235-2.109-0.484-3-0.741v-4.831C10.934,48.094,11.938,48.325,13,48.533z M15,48.891c0.968,0.157,1.969,0.298,3,0.422 v4.946c-1.057-0.139-2.058-0.292-3-0.458V48.891z M20,49.528c0.984,0.095,1.986,0.176,3,0.243v4.987 c-1.039-0.073-2.039-0.162-3-0.263V49.528z M25,49.884c1.002,0.047,2.009,0.078,3.016,0.096c0.053,0.001,0.106,0.002,0.158,0.003 c0.275,0.005,0.55,0.009,0.825,0.012v4.999c-1.382-0.013-2.716-0.053-4-0.116V49.884z M31,49.994 c0.275-0.003,0.55-0.007,0.825-0.012c0.053-0.001,0.106-0.002,0.159-0.003c1.007-0.019,2.014-0.05,3.016-0.096v4.993 c-1.284,0.063-2.618,0.103-4,0.116V49.994z M37,49.771c1.014-0.067,2.016-0.147,3-0.243v4.966c-0.961,0.101-1.961,0.19-3,0.263 V49.771z M42,49.312c1.031-0.124,2.032-0.265,3-0.422v4.91c-0.942,0.166-1.943,0.319-3,0.458V49.312z M47,48.533 c1.062-0.209,2.066-0.439,3-0.691v4.831c-0.891,0.257-1.894,0.506-3,0.741V48.533z M51.892,39.321l-0.341,0.299 C51.026,40.083,50.151,40.55,49,41v-4.768c1.189-0.414,2.201-0.873,3-1.376v4.138C52,39.097,51.962,39.207,51.892,39.321z M52.564,30.796c-0.498,0.139-1.025,0.269-1.563,0.396c-0.249,0.058-0.503,0.116-0.763,0.172c-0.077,0.017-0.159,0.032-0.237,0.049 v-4.879c1.062-0.209,2.066-0.439,3-0.691v4.831C52.857,30.714,52.712,30.755,52.564,30.796z M2,15.996l0-4.141 c0.799,0.503,1.811,0.962,3,1.376v4.788C3.055,17.29,2.002,16.559,2,15.996z M2,38.996l0-4.141c0.799,0.503,1.811,0.962,3,1.376 v4.769l-0.571-0.222L4.417,40.79C2.847,40.139,2.002,39.5,2,38.996z M5,49.996l0-4.141c0.799,0.503,1.811,0.962,3,1.376v4.788 C6.055,51.29,5.002,50.559,5,49.996z M52,52.019v-4.787c1.189-0.414,2.201-0.873,3-1.376v4.138 C54.999,50.557,53.945,51.289,52,52.019z M55,30.019v-4.787c1.189-0.414,2.201-0.873,3-1.376v4.138 C57.999,28.557,56.945,29.289,55,30.019z";
        
        const path = new Path2D(pathData);
        ctx.fill(path);
        ctx.stroke(path);
        
        ctx.restore();
    }
    
    /**
     * Renders a heart icon to a sprite canvas
     */
    renderHeartToSprite(ctx, size, fillColor, strokeColor) {
        ctx.save();
        
        const scale = size / 24; // Original SVG viewBox is 24x24
        ctx.scale(scale, scale);
        
        ctx.fillStyle = fillColor || '#800000';
        ctx.strokeStyle = strokeColor || '#DC143C';
        ctx.lineWidth = 1.5 / scale;
        
        // Draw the heart path
        const pathData = "M8.10627 18.2468C5.29819 16.0833 2 13.5422 2 9.1371C2 4.27416 7.50016 0.825464 12 5.50063L14 7.49928C14.2929 7.79212 14.7678 7.79203 15.0607 7.49908C15.3535 7.20614 15.3534 6.73127 15.0605 6.43843L13.1285 4.50712C17.3685 1.40309 22 4.67465 22 9.1371C22 13.5422 18.7018 16.0833 15.8937 18.2468C15.6019 18.4717 15.3153 18.6925 15.0383 18.9109C14 19.7294 13 20.5 12 20.5C11 20.5 10 19.7294 8.96173 18.9109C8.68471 18.6925 8.39814 18.4717 8.10627 18.2468Z";
        
        const path = new Path2D(pathData);
        ctx.fill(path);
        ctx.stroke(path);
        
        ctx.restore();
    }
    
    /**
     * Clears the sprite cache (useful for memory management)
     */
    clearCache() {
        this.cache.clear();
    }
}

// Global sprite cache instance
const iconSpriteCache = new IconSpriteCache();

/**
 * Optimized function to draw a cached shield icon sprite
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {number} x - The x position to center the icon
 * @param {number} y - The y position to center the icon
 * @param {number} size - The size of the icon
 */
export function drawCachedShieldIcon(ctx, x, y, size = 30) {
    const sprite = iconSpriteCache.getSprite('shield', size);
    ctx.drawImage(sprite, x - size / 2, y - size / 2);
}

/**
 * Optimized function to draw a cached coin/money icon sprite
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {number} x - The x position to center the icon
 * @param {number} y - The y position to center the icon
 * @param {number} size - The size of the icon
 * @param {string} fillColor - The fill color
 * @param {string} strokeColor - The stroke color
 */
export function drawCachedMoneyIcon(ctx, x, y, size = 20, fillColor = '#FFFF00', strokeColor = '#B8860B') {
    const sprite = iconSpriteCache.getSprite('coin', size, fillColor, strokeColor);
    ctx.drawImage(sprite, x - size / 2, y - size / 2);
}

/**
 * Optimized function to draw a cached heart icon sprite
 * @param {CanvasRenderingContext2D} ctx - The canvas context
 * @param {number} x - The x position to center the icon
 * @param {number} y - The y position to center the icon
 * @param {number} size - The size of the icon
 * @param {string} fillColor - The fill color
 * @param {string} strokeColor - The stroke color
 */
export function drawCachedHeartIcon(ctx, x, y, size = 20, fillColor = '#800000', strokeColor = '#DC143C') {
    const sprite = iconSpriteCache.getSprite('heart', size, fillColor, strokeColor);
    ctx.drawImage(sprite, x - size / 2, y - size / 2);
} 