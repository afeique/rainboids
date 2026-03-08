// OPT-8: Uniform spatial grid — O(1) insert, O(k) neighbor query, zero allocation after init.
// Replaces the Quadtree which was rebuilt from scratch every frame with O(n log n) cost.
export class SpatialGrid {
    constructor(width, height, cols = 8, rows = 6) {
        this.cols = cols;
        this.rows = rows;
        this.resize(width, height);

        // Pre-allocate cell arrays (reused every frame — no GC)
        this.cells = new Array(cols * rows);
        for (let i = 0; i < this.cells.length; i++) {
            this.cells[i] = [];
        }
    }

    resize(width, height) {
        this.width = width;
        this.height = height;
        this.cellW = width / this.cols;
        this.cellH = height / this.rows;
    }

    // Clear all cells — O(n) where n = total entities inserted (not grid size)
    clear() {
        for (let i = 0; i < this.cells.length; i++) {
            this.cells[i].length = 0; // Reuse array, avoid allocation
        }
    }

    // Insert entity — O(1) for point entities, O(k) for large entities spanning k cells
    insert(entity) {
        const r = entity.radius || 0;
        const c0 = Math.max(0, Math.floor((entity.x - r) / this.cellW));
        const c1 = Math.min(this.cols - 1, Math.floor((entity.x + r) / this.cellW));
        const r0 = Math.max(0, Math.floor((entity.y - r) / this.cellH));
        const r1 = Math.min(this.rows - 1, Math.floor((entity.y + r) / this.cellH));

        for (let row = r0; row <= r1; row++) {
            for (let col = c0; col <= c1; col++) {
                this.cells[row * this.cols + col].push(entity);
            }
        }
    }

    // Retrieve potential collision candidates for an entity — checks its cell + neighbors
    retrieve(entity) {
        const r = entity.radius || 0;
        const c0 = Math.max(0, Math.floor((entity.x - r) / this.cellW));
        const c1 = Math.min(this.cols - 1, Math.floor((entity.x + r) / this.cellW));
        const r0 = Math.max(0, Math.floor((entity.y - r) / this.cellH));
        const r1 = Math.min(this.rows - 1, Math.floor((entity.y + r) / this.cellH));

        const result = [];
        const seen = new Set();

        for (let row = r0; row <= r1; row++) {
            for (let col = c0; col <= c1; col++) {
                const cell = this.cells[row * this.cols + col];
                for (let i = 0; i < cell.length; i++) {
                    const other = cell[i];
                    if (other !== entity && !seen.has(other)) {
                        seen.add(other);
                        result.push(other);
                    }
                }
            }
        }
        return result;
    }

    // Bulk insert from a pool's activeObjects — avoids per-entity function call overhead
    insertPool(pool) {
        const objs = pool.activeObjects;
        for (let i = 0; i < objs.length; i++) {
            if (objs[i].active) this.insert(objs[i]);
        }
    }

    // Debug draw
    draw(ctx) {
        ctx.strokeStyle = 'rgba(0, 255, 0, 0.15)';
        ctx.lineWidth = 0.5;
        for (let row = 0; row <= this.rows; row++) {
            ctx.beginPath();
            ctx.moveTo(0, row * this.cellH);
            ctx.lineTo(this.width, row * this.cellH);
            ctx.stroke();
        }
        for (let col = 0; col <= this.cols; col++) {
            ctx.beginPath();
            ctx.moveTo(col * this.cellW, 0);
            ctx.lineTo(col * this.cellW, this.height);
            ctx.stroke();
        }
    }
}
