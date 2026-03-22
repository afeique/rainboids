// Cached CSS color string factory
// Pre-builds alpha lookup tables (101 entries per base RGB color)
// for O(1) access instead of per-frame template literal construction.
//
// Benchmark: ~10× faster for a full frame of ~100 color strings.
// See tools/benchmark/scripts/color-cache.bench.js

const tables = new Map();

/**
 * Get a cached `rgba(r,g,b,a)` string. Alpha quantized to 0.01 steps.
 * Drop-in replacement for `\`rgba(${r},${g},${b},${a})\``.
 */
export function rgba(r, g, b, a) {
    const key = (r << 16) | (g << 8) | b;
    let table = tables.get(key);
    if (!table) {
        table = new Array(101);
        for (let i = 0; i <= 100; i++) {
            table[i] = `rgba(${r},${g},${b},${(i / 100).toFixed(2)})`;
        }
        tables.set(key, table);
    }
    // Clamp to [0, 100] and truncate to integer index
    const idx = a <= 0 ? 0 : a >= 1 ? 100 : (a * 100) | 0;
    return table[idx];
}

// ── HSL cache ────────────────────────────────────────────────────────────
// Keyed by quantised (h, s, l) integers.  Eliminates per-frame template
// literal construction for asteroid wireframes, particles, and debris.
const hslCache = new Map();

/**
 * Get a cached `hsl(h, s%, l%)` string.
 * Hue quantized to nearest integer 0-360, saturation & lightness to 0-100.
 * Drop-in replacement for `\`hsl(${h}, ${s}%, ${l}%)\``.
 */
export function hsl(h, s, l) {
    const hi = ((h | 0) % 361 + 361) % 361;   // 0-360, handles negatives
    const si = s <= 0 ? 0 : s >= 100 ? 100 : (s | 0);
    const li = l <= 0 ? 0 : l >= 100 ? 100 : (l | 0);
    const key = `${hi}|${si}|${li}`;
    let cached = hslCache.get(key);
    if (cached === undefined) {
        cached = `hsl(${hi}, ${si}%, ${li}%)`;
        hslCache.set(key, cached);
    }
    return cached;
}
