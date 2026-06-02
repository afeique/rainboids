// world/map/dungeon-generator.js
//
// v11.0.0 — procedural dungeon/labyrinth generator for the DUNGEON map. Carves
// rooms + connecting corridors out of a solid grid, merges the leftover wall
// cells into AABB rectangles for the WorldMap, and exposes the floor grid so
// the mode can build a BFS flow-field that lets enemies navigate corridors
// toward the player (no full pathfinder needed).

const WALL = 1, FLOOR = 0;

function _carveRoom(grid, cols, rows, c0, r0, w, h) {
    const room = { c0, r0, w, h, cx: c0 + (w >> 1), cy: r0 + (h >> 1) };
    for (let r = r0; r < r0 + h; r++) {
        for (let c = c0; c < c0 + w; c++) {
            if (c > 0 && c < cols - 1 && r > 0 && r < rows - 1) grid[r * cols + c] = FLOOR;
        }
    }
    return room;
}

function _carveCorridor(grid, cols, rows, ax, ay, bx, by, rng) {
    // L-shaped, 2-wide corridor so the ship flies through comfortably.
    const horizFirst = rng() < 0.5;
    const carve = (c, r) => {
        for (let dr = 0; dr < 2; dr++) {
            for (let dc = 0; dc < 2; dc++) {
                const cc = c + dc, rr = r + dr;
                if (cc > 0 && cc < cols - 1 && rr > 0 && rr < rows - 1) grid[rr * cols + cc] = FLOOR;
            }
        }
    };
    if (horizFirst) {
        for (let c = Math.min(ax, bx); c <= Math.max(ax, bx); c++) carve(c, ay);
        for (let r = Math.min(ay, by); r <= Math.max(ay, by); r++) carve(bx, r);
    } else {
        for (let r = Math.min(ay, by); r <= Math.max(ay, by); r++) carve(ax, r);
        for (let c = Math.min(ax, bx); c <= Math.max(ax, bx); c++) carve(c, by);
    }
}

/** Greedy horizontal merge of contiguous wall cells per row → AABB rects. */
function _mergeWalls(grid, cols, rows, cellSize) {
    const rects = [];
    for (let r = 0; r < rows; r++) {
        let c = 0;
        while (c < cols) {
            if (grid[r * cols + c] === WALL) {
                let c2 = c;
                while (c2 < cols && grid[r * cols + c2] === WALL) c2++;
                rects.push({ x: c * cellSize, y: r * cellSize, w: (c2 - c) * cellSize, h: cellSize });
                c = c2;
            } else c++;
        }
    }
    return rects;
}

/**
 * Generate a dungeon for the given world size.
 * Returns { cols, rows, cellSize, grid, walls, rooms, playerStart, portalPos,
 *           enemySpawns, centerOf, cellOf, isFloor }.
 */
export function generateDungeon(width, height, opts = {}) {
    const rng = opts.rng || Math.random;
    const cellSize = opts.cellSize || 200;
    const cols = Math.max(8, Math.floor(width / cellSize));
    const rows = Math.max(6, Math.floor(height / cellSize));
    const grid = new Uint8Array(cols * rows).fill(WALL);

    // Rooms: a handful of non-tiny rectangular chambers.
    const roomCount = opts.roomCount || (8 + Math.floor(rng() * 5));
    const rooms = [];
    let attempts = 0;
    while (rooms.length < roomCount && attempts < roomCount * 8) {
        attempts++;
        const w = 2 + Math.floor(rng() * 3);
        const h = 2 + Math.floor(rng() * 3);
        const c0 = 1 + Math.floor(rng() * (cols - w - 2));
        const r0 = 1 + Math.floor(rng() * (rows - h - 2));
        if (c0 < 1 || r0 < 1) continue;
        rooms.push(_carveRoom(grid, cols, rows, c0, r0, w, h));
    }
    if (rooms.length < 2) {
        // Degenerate fallback: two guaranteed rooms.
        rooms.length = 0;
        rooms.push(_carveRoom(grid, cols, rows, 1, 1, 3, 3));
        rooms.push(_carveRoom(grid, cols, rows, cols - 4, rows - 4, 3, 3));
    }

    // Connect each room to the next (chain) so the whole map is reachable,
    // plus a couple of extra links for loops.
    for (let i = 1; i < rooms.length; i++) {
        _carveCorridor(grid, cols, rows, rooms[i - 1].cx, rooms[i - 1].cy, rooms[i].cx, rooms[i].cy, rng);
    }
    const extra = 2 + Math.floor(rng() * 3);
    for (let k = 0; k < extra; k++) {
        const a = rooms[Math.floor(rng() * rooms.length)];
        const b = rooms[Math.floor(rng() * rooms.length)];
        if (a !== b) _carveCorridor(grid, cols, rows, a.cx, a.cy, b.cx, b.cy, rng);
    }

    const walls = _mergeWalls(grid, cols, rows, cellSize);
    const centerOf = (c, r) => ({ x: (c + 0.5) * cellSize, y: (r + 0.5) * cellSize });
    const cellOf = (x, y) => ({
        c: Math.max(0, Math.min(cols - 1, Math.floor(x / cellSize))),
        r: Math.max(0, Math.min(rows - 1, Math.floor(y / cellSize))),
    });
    const isFloor = (c, r) => c >= 0 && c < cols && r >= 0 && r < rows && grid[r * cols + c] === FLOOR;

    // Player starts in the first room; portal sits in the room farthest from it.
    const start = rooms[0];
    let far = rooms[1] || rooms[0];
    let bestD = -1;
    for (const rm of rooms) {
        const d = (rm.cx - start.cx) ** 2 + (rm.cy - start.cy) ** 2;
        if (d > bestD) { bestD = d; far = rm; }
    }
    const playerStart = centerOf(start.cx, start.cy);
    const portalPos = centerOf(far.cx, far.cy);

    // Distribute enemies through the rooms between start and exit.
    const enemySpawns = [];
    const wantEnemies = opts.enemyCount || 16;
    for (const rm of rooms) {
        if (rm === start) continue;
        const n = 1 + Math.floor(rng() * 2);
        for (let i = 0; i < n && enemySpawns.length < wantEnemies; i++) {
            const cc = rm.c0 + Math.floor(rng() * rm.w);
            const rr = rm.r0 + Math.floor(rng() * rm.h);
            enemySpawns.push(centerOf(cc, rr));
        }
    }

    return {
        cols, rows, cellSize, grid, walls, rooms,
        playerStart, portalPos, enemySpawns,
        centerOf, cellOf, isFloor,
    };
}

/**
 * BFS flow-field (distance-to-target over floor cells). Returns an Int32Array
 * of per-cell distance (−1 = wall/unreachable). Cheap to recompute (~hundreds
 * of cells) every few hundred ms as the player moves.
 */
export function buildFlowField(dungeon, targetX, targetY) {
    const { cols, rows, grid } = dungeon;
    const dist = new Int32Array(cols * rows).fill(-1);
    const { c: tc, r: tr } = dungeon.cellOf(targetX, targetY);
    // Snap target to nearest floor cell if it's in a wall.
    let sc = tc, sr = tr;
    if (grid[tr * cols + tc] !== FLOOR) {
        let best = Infinity;
        for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) {
            if (grid[r * cols + c] === FLOOR) {
                const d = (c - tc) ** 2 + (r - tr) ** 2;
                if (d < best) { best = d; sc = c; sr = r; }
            }
        }
    }
    const queue = [sr * cols + sc];
    dist[sr * cols + sc] = 0;
    let head = 0;
    while (head < queue.length) {
        const idx = queue[head++];
        const c = idx % cols, r = (idx / cols) | 0;
        const d = dist[idx];
        const nbrs = [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1]];
        for (const [nc, nr] of nbrs) {
            if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
            const ni = nr * cols + nc;
            if (grid[ni] === FLOOR && dist[ni] === -1) {
                dist[ni] = d + 1;
                queue.push(ni);
            }
        }
    }
    return dist;
}

/**
 * Given a flow-field and an entity position, return the world-space waypoint to
 * steer toward (the center of the lowest-distance neighbouring floor cell), or
 * null if not on/next-to a reachable cell.
 */
export function flowWaypoint(dungeon, dist, x, y) {
    const { cols, rows, cellSize } = dungeon;
    const { c, r } = dungeon.cellOf(x, y);
    let best = dist[r * cols + c];
    let bc = c, br = r, found = best >= 0;
    const nbrs = [[c + 1, r], [c - 1, r], [c, r + 1], [c, r - 1], [c + 1, r + 1], [c - 1, r - 1], [c + 1, r - 1], [c - 1, r + 1]];
    for (const [nc, nr] of nbrs) {
        if (nc < 0 || nc >= cols || nr < 0 || nr >= rows) continue;
        const d = dist[nr * cols + nc];
        if (d >= 0 && (!found || d < best)) { best = d; bc = nc; br = nr; found = true; }
    }
    if (!found) return null;
    return { x: (bc + 0.5) * cellSize, y: (br + 0.5) * cellSize };
}
