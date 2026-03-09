// Cached CSS color string factory
// Pre-builds alpha lookup tables (101 entries per base RGB color)
// for O(1) access instead of per-frame template literal construction.
//
// Benchmark: ~10× faster for a full frame of ~100 color strings.
// See benchmark/scripts/color-cache.bench.js

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
