// Small math and randomness helpers shared by the simulation and the renderer.

export const TAU = Math.PI * 2;

export function clamp(v, lo, hi) {
    return v < lo ? lo : v > hi ? hi : v;
}

export function lerp(a, b, t) {
    return a + (b - a) * t;
}

export function dist2(ax, ay, bx, by) {
    const dx = ax - bx, dy = ay - by;
    return dx * dx + dy * dy;
}

export function wrapAngle(a) {
    while (a > Math.PI) a -= TAU;
    while (a < -Math.PI) a += TAU;
    return a;
}

// Distance from point (px, py) to the segment (ax, ay)-(bx, by).
export function segDist2(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    return dist2(px, py, ax + dx * t, ay + dy * t);
}

// Integer hash used for deterministic world features (obstacle chunks).
export function hash3(a, b, c) {
    let h = Math.imul(a | 0, 374761393) ^ Math.imul(b | 0, 668265263) ^ Math.imul(c | 0, 2147483647);
    h = Math.imul(h ^ (h >>> 13), 1274126177);
    h ^= h >>> 16;
    return (h >>> 0) / 4294967296;
}

export class RNG {
    constructor(seed) {
        this.s = seed >>> 0;
    }
    next() {
        // mulberry32
        this.s = (this.s + 0x6D2B79F5) | 0;
        let t = this.s;
        t = Math.imul(t ^ (t >>> 15), t | 1);
        t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    }
    float(a = 0, b = 1) {
        return a + (b - a) * this.next();
    }
    int(a, b) {
        return a + Math.floor(this.next() * (b - a + 1));
    }
    chance(p) {
        return this.next() < p;
    }
    angle() {
        return this.next() * TAU;
    }
    pick(arr) {
        return arr[Math.floor(this.next() * arr.length)];
    }
    // items: array; weight(item) -> number >= 0. Returns an item or null.
    weighted(items, weight) {
        let total = 0;
        for (const it of items) total += Math.max(0, weight(it));
        if (total <= 0) return null;
        let r = this.next() * total;
        for (const it of items) {
            r -= Math.max(0, weight(it));
            if (r < 0) return it;
        }
        return items[items.length - 1];
    }
    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(this.next() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
        return arr;
    }
}

export function fmtTime(sec) {
    sec = Math.max(0, Math.floor(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export function fmtNum(n) {
    n = Math.round(n);
    if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + 'M';
    if (n >= 1e4) return (n / 1e3).toFixed(n >= 1e5 ? 0 : 1) + 'k';
    return String(n);
}
