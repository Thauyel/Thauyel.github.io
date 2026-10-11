// Uniform spatial hash for broad-phase enemy queries. Rebuilt every simulation step.
// Cell keys are exact (no collisions) for coordinates within about +/-2 million units.

export class SpatialHash {
    constructor(cell = 64) {
        this.cell = cell;
        this.inv = 1 / cell;
        this.map = new Map();
        this.spare = [];
    }

    clear() {
        for (const bucket of this.map.values()) {
            bucket.length = 0;
            this.spare.push(bucket);
        }
        this.map.clear();
    }

    insert(item) {
        const cx = Math.floor(item.x * this.inv), cy = Math.floor(item.y * this.inv);
        const key = (cx + 32768) * 65536 + (cy + 32768);
        let bucket = this.map.get(key);
        if (!bucket) {
            bucket = this.spare.pop() || [];
            this.map.set(key, bucket);
        }
        bucket.push(item);
    }

    // Collects every item whose cell overlaps the square around (x, y) into `out`.
    // Callers do the exact distance check (including the item's own radius).
    query(x, y, r, out) {
        out.length = 0;
        const inv = this.inv;
        const x0 = Math.floor((x - r) * inv), x1 = Math.floor((x + r) * inv);
        const y0 = Math.floor((y - r) * inv), y1 = Math.floor((y + r) * inv);
        for (let cx = x0; cx <= x1; cx++) {
            for (let cy = y0; cy <= y1; cy++) {
                const bucket = this.map.get((cx + 32768) * 65536 + (cy + 32768));
                if (!bucket) continue;
                for (let i = 0; i < bucket.length; i++) out.push(bucket[i]);
            }
        }
        return out;
    }
}
