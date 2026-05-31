// ─────────────────────────────────────────────────────────────────────────
// NavGrid — A* + flow-field navigation for the HYBRID nav model
// ─────────────────────────────────────────────────────────────────────────
//
// Steering (steering.js + context-steering.js) is the DEFAULT and handles the
// open-space, sparse-obstacle common case beautifully. But it has one failure
// mode: a large CONCAVE obstacle (a U-shaped pocket) traps a purely-local
// agent — it drives into the cup chasing the goal and dithers, because it has
// no map and no concept of "back out and go around."
//
// The only place Rainboids grows such an obstacle is a screen-filling boss in
// the enlarged boss arena (BOSS_ARENA_SCALE). So we reserve A* for exactly
// that: build a coarse grid over the boss arena, mark cells covered by the
// boss hull blocked, and run ONE flow field outward from the player (the
// shared goal). Every enemy then reads a "downhill toward the player" vector
// from its cell — O(1) per agent — and feeds it to steering as the goal
// direction. Steering still does the actual moving + dynamic dodging; the flow
// field only fixes the global-routing blind spot.
//
// A flow field (one Dijkstra/BFS from the goal) is the right tool over per-
// agent A* here because every enemy shares ONE goal (the player), so we pay
// the search once for the whole swarm instead of once per enemy.
//
// Rebuilt on a throttle (the boss & player move), not every tick.

const SQRT2 = Math.SQRT2;

export class NavGrid {
    /**
     * @param cellSize world units per cell (coarse — e.g. ~64). Bigger = cheaper.
     */
    constructor(cellSize = 64) {
        this.cellSize = cellSize;
        this.cols = 0; this.rows = 0;
        this.minX = 0; this.minY = 0;
        this.blocked = null;     // Uint8Array, 1 = impassable
        this.cost = null;        // Float64Array, distance-to-goal (flow potential)
        this.flowX = null;       // Float64Array, unit "downhill" vector per cell
        this.flowY = null;
        this._queue = null;      // reused BFS/Dijkstra ring buffer
        this.valid = false;
    }

    /** (Re)allocate to cover [minX,minY]..[maxX,maxY]. Idempotent on size. */
    resize(minX, minY, maxX, maxY) {
        const cols = Math.max(1, Math.ceil((maxX - minX) / this.cellSize));
        const rows = Math.max(1, Math.ceil((maxY - minY) / this.cellSize));
        this.minX = minX; this.minY = minY;
        if (cols !== this.cols || rows !== this.rows) {
            this.cols = cols; this.rows = rows;
            const n = cols * rows;
            this.blocked = new Uint8Array(n);
            this.cost = new Float64Array(n);
            this.flowX = new Float64Array(n);
            this.flowY = new Float64Array(n);
            this._queue = new Int32Array(n);
        }
    }

    _idx(cx, cy) { return cy * this.cols + cx; }

    cellOf(x, y) {
        let cx = Math.floor((x - this.minX) / this.cellSize);
        let cy = Math.floor((y - this.minY) / this.cellSize);
        if (cx < 0) cx = 0; else if (cx >= this.cols) cx = this.cols - 1;
        if (cy < 0) cy = 0; else if (cy >= this.rows) cy = this.rows - 1;
        return { cx, cy };
    }

    clearBlocked() { if (this.blocked) this.blocked.fill(0); }

    /** Mark a filled circle (e.g. the boss hull) impassable, with a margin. */
    blockCircle(x, y, radius) {
        if (!this.blocked) return;
        const r = radius;
        const mincx = Math.floor((x - r - this.minX) / this.cellSize);
        const maxcx = Math.floor((x + r - this.minX) / this.cellSize);
        const mincy = Math.floor((y - r - this.minY) / this.cellSize);
        const maxcy = Math.floor((y + r - this.minY) / this.cellSize);
        const r2 = r * r;
        for (let cy = Math.max(0, mincy); cy <= Math.min(this.rows - 1, maxcy); cy++) {
            for (let cx = Math.max(0, mincx); cx <= Math.min(this.cols - 1, maxcx); cx++) {
                const wx = this.minX + (cx + 0.5) * this.cellSize;
                const wy = this.minY + (cy + 0.5) * this.cellSize;
                const dx = wx - x, dy = wy - y;
                if (dx * dx + dy * dy <= r2) this.blocked[this._idx(cx, cy)] = 1;
            }
        }
    }

    /**
     * Build the flow field with goal at (gx, gy) via a Dijkstra expansion over
     * the 8-connected grid (uniform cell cost, diagonal = √2). Then derive a
     * per-cell unit vector pointing toward the lowest-cost neighbor — the
     * "downhill toward the goal" direction every agent reads. Routes around
     * blocked cells, so concave hulls are handled globally.
     */
    buildFlowField(gx, gy) {
        if (!this.cost) { this.valid = false; return; }
        const { cols, rows, cost, blocked, _queue } = this;
        const n = cols * rows;
        const INF = Infinity;
        for (let i = 0; i < n; i++) cost[i] = blocked[i] ? INF : INF;

        const goal = this.cellOf(gx, gy);
        let gi = this._idx(goal.cx, goal.cy);
        // If the goal cell is blocked (player overlapping the hull edge), nudge
        // to the nearest open cell so the field still forms.
        if (blocked[gi]) {
            gi = this._nearestOpen(goal.cx, goal.cy);
            if (gi < 0) { this.valid = false; return; }
        }

        // Bucketed Dijkstra via a simple binary-heap-free approach: because
        // edge costs are only 1 or √2, a Dial-style approach is overkill at
        // this grid size — use a plain priority scan with a small open list.
        // For coarse boss grids (tens of cells per side) this is trivially fast.
        cost[gi] = 0;
        // Min-heap (array of cell indices) keyed by cost.
        const heap = _queue; let hlen = 0;
        heap[hlen++] = gi;
        const inHeapCost = cost;
        const push = (idx) => {
            heap[hlen++] = idx;
            let c = hlen - 1;
            while (c > 0) {
                const p = (c - 1) >> 1;
                if (inHeapCost[heap[p]] <= inHeapCost[heap[c]]) break;
                const t = heap[p]; heap[p] = heap[c]; heap[c] = t; c = p;
            }
        };
        const pop = () => {
            const top = heap[0];
            heap[0] = heap[--hlen];
            let c = 0;
            for (;;) {
                let l = c * 2 + 1, r = l + 1, s = c;
                if (l < hlen && inHeapCost[heap[l]] < inHeapCost[heap[s]]) s = l;
                if (r < hlen && inHeapCost[heap[r]] < inHeapCost[heap[s]]) s = r;
                if (s === c) break;
                const t = heap[s]; heap[s] = heap[c]; heap[c] = t; c = s;
            }
            return top;
        };

        while (hlen > 0) {
            const cur = pop();
            const ccost = cost[cur];
            const cx = cur % cols, cy = (cur / cols) | 0;
            for (let dy = -1; dy <= 1; dy++) {
                for (let dx = -1; dx <= 1; dx++) {
                    if (dx === 0 && dy === 0) continue;
                    const nx = cx + dx, ny = cy + dy;
                    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
                    const ni = ny * cols + nx;
                    if (blocked[ni]) continue;
                    // Prevent diagonal corner-cutting through a blocked cell.
                    if (dx !== 0 && dy !== 0) {
                        if (blocked[cy * cols + nx] && blocked[ny * cols + cx]) continue;
                    }
                    const step = (dx !== 0 && dy !== 0) ? SQRT2 : 1;
                    const nc = ccost + step;
                    if (nc < cost[ni]) { cost[ni] = nc; push(ni); }
                }
            }
        }

        // Derive flow vectors: point toward the lowest-cost 8-neighbor.
        const { flowX, flowY } = this;
        for (let cy = 0; cy < rows; cy++) {
            for (let cx = 0; cx < cols; cx++) {
                const i = cy * cols + cx;
                if (blocked[i] || cost[i] === INF) { flowX[i] = 0; flowY[i] = 0; continue; }
                let bestC = cost[i], bx = 0, by = 0;
                for (let dy = -1; dy <= 1; dy++) {
                    for (let dx = -1; dx <= 1; dx++) {
                        if (dx === 0 && dy === 0) continue;
                        const nx = cx + dx, ny = cy + dy;
                        if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
                        const ni = ny * cols + nx;
                        if (blocked[ni]) continue;
                        if (cost[ni] < bestC) { bestC = cost[ni]; bx = dx; by = dy; }
                    }
                }
                const len = Math.hypot(bx, by);
                if (len > 1e-9) { flowX[i] = bx / len; flowY[i] = by / len; }
                else { flowX[i] = 0; flowY[i] = 0; }
            }
        }
        this.valid = true;
    }

    _nearestOpen(cx, cy) {
        // Expanding ring search for the closest non-blocked cell.
        const { cols, rows, blocked } = this;
        for (let r = 1; r < Math.max(cols, rows); r++) {
            for (let dy = -r; dy <= r; dy++) {
                for (let dx = -r; dx <= r; dx++) {
                    if (Math.abs(dx) !== r && Math.abs(dy) !== r) continue;
                    const nx = cx + dx, ny = cy + dy;
                    if (nx < 0 || ny < 0 || nx >= cols || ny >= rows) continue;
                    const ni = ny * cols + nx;
                    if (!blocked[ni]) return ni;
                }
            }
        }
        return -1;
    }

    /**
     * Sample the flow direction at a world position into `out` {x,y}. Returns
     * false if the field is invalid or the cell has no flow (then the caller
     * falls back to direct steering toward the goal).
     */
    sampleFlow(x, y, out) {
        if (!this.valid) return false;
        const { cx, cy } = this.cellOf(x, y);
        const i = this._idx(cx, cy);
        const fx = this.flowX[i], fy = this.flowY[i];
        if (fx === 0 && fy === 0) return false;
        out.x = fx; out.y = fy;
        return true;
    }
}
