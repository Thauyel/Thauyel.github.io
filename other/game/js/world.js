// VERTIGO — simulation core. No DOM access, so it also runs headless under Node.
(function (V) {
    'use strict';

    const GROUND = 1000;
    const PX_PER_M = 20;
    const DISTRICT_LEN = 20000;
    const GRAVITY = 2100;
    const PLAYER_R = 11;
    const RANGE = 640;
    const MAX_SPEED = 2600;
    const RUN_SPEED = 420;
    const REEL_MIN = 260;
    const REEL_SPEED = 420;
    const PUMP = 260;
    const DRAG = 0.00011;
    const CHUNK = 1500;

    function mulberry32(a) {
        return function () {
            a |= 0;
            a = (a + 0x6D2B79F5) | 0;
            let t = Math.imul(a ^ (a >>> 15), 1 | a);
            t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
    }

    function hash(a, b, c) {
        let h = Math.imul(a | 0, 374761393) ^ Math.imul((b | 0) + 0x9E3779B9, 668265263) ^ Math.imul((c | 0) + 0x7F4A7C15, 2246822519);
        h = Math.imul(h ^ (h >>> 13), 1274126177);
        h ^= h >>> 16;
        return (h >>> 0) / 4294967296;
    }

    function hashString(s) {
        let h = 2166136261;
        for (let i = 0; i < s.length; i++) {
            h ^= s.charCodeAt(i);
            h = Math.imul(h, 16777619);
        }
        return h >>> 0;
    }

    const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

    // Each district: a building vocabulary, a palette and a chord loop. The ceiling overhead takes its style from the key.
    // Chords are [bass, ...voicing] as MIDI notes.
    const DISTRICTS = [
        {
            key: 'oldtown', name: 'Old Town', tag: 'Gothic spires & row houses at dusk', weather: 'motes',
            palette: {
                skyTop: '#2b1d3f', skyMid: '#a8456b', skyBot: '#f6a35c', far: '#6a3552', mid: '#43223f', fog: '#f0a070',
                ground: '#1a1020', cloud: '#f7b37f', accent: '#ffcf6b', player: '#fff4e6', sun: '#ffd38a',
                sunX: 0.74, sunY: 0.6, sunR: 70, stars: 0.18, aurora: 0, rain: 0, motes: 1, synth: 0
            },
            colors: ['#7a3b3b', '#8a5a3c', '#5d4a6b', '#6e3d4f', '#4f3a55', '#7d4b40'],
            chords: [[45, 57, 60, 64, 67], [41, 57, 60, 65, 69], [48, 55, 60, 64, 67], [43, 55, 59, 62, 67]]
        },
        {
            key: 'downtown', name: 'Downtown', tag: 'Curtain walls after dark', weather: null,
            palette: {
                skyTop: '#03061a', skyMid: '#0f1d45', skyBot: '#3a3f7a', far: '#18204a', mid: '#0d1430', fog: '#4a4f9a',
                ground: '#05060f', cloud: '#2a3366', accent: '#4de1ff', player: '#ffffff', sun: '#e8ecff',
                sunX: 0.24, sunY: 0.24, sunR: 38, stars: 0.95, aurora: 0, rain: 0, motes: 0, synth: 0
            },
            colors: ['#1b2a4a', '#22304f', '#162238', '#2a2f55', '#1d3346'],
            chords: [[38, 57, 60, 62, 65], [46, 58, 62, 65, 69], [41, 57, 60, 65, 69], [48, 55, 60, 64, 67]]
        },
        {
            key: 'docks', name: 'The Docks', tag: 'Gantries, containers & cold rain', weather: 'rain',
            palette: {
                skyTop: '#0b1719', skyMid: '#22404a', skyBot: '#5d7d7a', far: '#24393d', mid: '#152629', fog: '#6f8f88',
                ground: '#081012', cloud: '#3c5a5e', accent: '#ffb347', player: '#ffffff', sun: '#cfe3df',
                sunX: 0.6, sunY: 0.3, sunR: 0, stars: 0.05, aurora: 0, rain: 1, motes: 0, synth: 0
            },
            colors: ['#5b3a2e', '#4a4f55', '#6b4a35', '#3f4a4c'],
            containers: ['#c0392b', '#2e86de', '#27ae60', '#e67e22', '#8e44ad', '#d4ac0d', '#16a085'],
            chords: [[40, 55, 59, 62, 64], [36, 55, 60, 64, 67], [38, 54, 57, 62, 66], [35, 54, 59, 62, 66]]
        },
        {
            key: 'brutalia', name: 'Brutalia', tag: 'Raw concrete, bold cantilevers', weather: null,
            palette: {
                skyTop: '#6f7fa0', skyMid: '#c9b8b0', skyBot: '#f0d9c4', far: '#a4a2a8', mid: '#86858d', fog: '#e6d5c8',
                ground: '#3a3a40', cloud: '#ffffff', accent: '#ff5a36', player: '#1d1d22', sun: '#fff4e0',
                sunX: 0.3, sunY: 0.5, sunR: 90, stars: 0, aurora: 0, rain: 0, motes: 0.4, synth: 0
            },
            colors: ['#8d8b87', '#9b9893', '#7e7c78', '#a3a09a'],
            chords: [[36, 55, 60, 63, 67], [44, 56, 60, 63, 68], [39, 55, 58, 63, 67], [46, 58, 62, 65, 70]]
        },
        {
            key: 'arcology', name: 'Neon Arcology', tag: 'Tomorrow, floating', weather: null,
            palette: {
                skyTop: '#0e021f', skyMid: '#4a0f5c', skyBot: '#ff3d7f', far: '#2e0b44', mid: '#1c0630', fog: '#ff6fa0',
                ground: '#0a0214', cloud: '#7a2a7a', accent: '#00f0ff', player: '#ffffff', sun: '#ffcc33',
                sunX: 0.5, sunY: 0.56, sunR: 120, stars: 0.7, aurora: 1, rain: 0, motes: 0, synth: 1
            },
            colors: ['#14072a', '#1b0b35', '#100422'],
            neon: ['#00f0ff', '#ff2bd6', '#9dff00', '#ffcc33'],
            chords: [[42, 57, 61, 64, 66], [38, 57, 62, 66, 69], [45, 57, 61, 64, 69], [40, 56, 59, 64, 68]]
        }
    ];

    const SIGNS = ['HOTEL', 'CAFÉ', '24H', 'JAZZ', 'NOODLES', 'OPEN', 'ARCH', 'DINER', 'BAR'];

    function districtIndexAt(x) {
        return Math.max(0, Math.floor(x / DISTRICT_LEN));
    }

    function districtAt(x) {
        return DISTRICTS[districtIndexAt(x) % DISTRICTS.length];
    }

    function World(seed) {
        this.seed = seed >>> 0;
        this.rng = mulberry32(this.seed);
        this.time = 0;
        this.buildings = [];
        this.ceiling = [];
        this.aim = null;
        this.orbs = [];
        this.rings = [];
        this.waters = [];
        this.events = [];
        this.hold = false;
        this.prevHold = false;
        this.chain = 0;
        this.bonus = 0;
        this.dist = 0;
        this.district = 0;
        this.stats = { orbs: 0, rings: 0, nearMisses: 0, grapples: 0, maxMult: 1, maxSpeed: 0, longestFlight: 0 };
        this.player = {
            x: -450, y: GROUND - 300 - PLAYER_R, px: -450, py: GROUND - 300 - PLAYER_R,
            vx: RUN_SPEED, vy: 0, r: PLAYER_R, anchor: null, ropeLen: 0, grounded: true,
            alive: true, airTime: 0, cause: null, inWater: false
        };
        this.lastStyle = '';
        this.nextRingX = 3500;

        const start = { x: -760, w: 1210, parts: [], style: 'house', seed: 7, deco: { chimneys: [0.12, 0.5], start: true }, color: '#7a3b3b' };
        this.addPart(start, -760, GROUND - 300, 1210, 300);
        this.buildings.push(start);
        this.bx = 450 + 70;
        this.addCeiling(-1400, 1100, GROUND - 820);
        this.chunkEnd = 450;
        this.ensure(this.player.x + 4000);
    }

    World.prototype.difficulty = function (x) {
        return 1 - Math.exp(-Math.max(0, x) / 60000);
    };

    World.prototype.addPart = function (b, x, y, w, h) {
        b.parts.push({ x, y, w, h, nm: false });
    };

    World.prototype.emit = function (type, data) {
        const e = data || {};
        e.type = type;
        this.events.push(e);
    };

    World.prototype.mult = function () {
        return 1 + Math.min(this.chain, 8);
    };

    World.prototype.score = function () {
        return Math.floor(this.bonus);
    };

    World.prototype.isWater = function (x) {
        for (const w of this.waters) if (x >= w.x0 && x <= w.x1) return true;
        return false;
    };

    // ---------- Generation ----------

    World.prototype.ensure = function (toX) {
        let generated = false;
        while (this.chunkEnd < toX) {
            this.generateChunk(this.chunkEnd, this.chunkEnd + CHUNK);
            this.chunkEnd += CHUNK;
            generated = true;
        }
        if (generated) this.cull(this.player.x - 2600);
    };

    World.prototype.cull = function (minX) {
        this.buildings = this.buildings.filter(b => b.x + b.w > minX);
        this.ceiling = this.ceiling.filter(c => c.x1 > minX);
        this.orbs = this.orbs.filter(o => o.x > minX);
        this.rings = this.rings.filter(r => r.x > minX);
        this.waters = this.waters.filter(w => w.x1 > minX);
    };

    World.prototype.generateChunk = function (x0, x1) {
        while (this.bx < x1) {
            const b = this.makeBuilding(this.bx);
            this.buildings.push(b);
            this.bx = b.x + b.w + b.gap;
        }
        // The ceiling trails the building cursor so its clearance check sees every roof below.
        while (this.ceilX < Math.min(x1, this.bx - 400)) this.makeCeiling(this.ceilX);
    };

    World.prototype.topNear = function (x0, x1) {
        let top = GROUND;
        for (const b of this.buildings) {
            if (b.x > x1 || b.x + b.w < x0) continue;
            for (const q of b.parts) if (q.x < x1 && q.x + q.w > x0) top = Math.min(top, q.y);
        }
        return top;
    };

    World.prototype.insidePart = function (x, y, margin) {
        for (const b of this.buildings) {
            if (b.x - margin > x || b.x + b.w + margin < x) continue;
            for (const q of b.parts) {
                if (x > q.x - margin && x < q.x + q.w + margin && y > q.y - margin && y < q.y + q.h + margin) return true;
            }
        }
        return false;
    };

    World.prototype.addCeiling = function (x0, x1, y) {
        this.ceiling.push({ x0, x1, y, style: districtAt(x0).key });
        this.ceilX = x1;
    };

    // One ceiling segment, preceded by an ungrabbable gap that widens with difficulty.
    World.prototype.makeCeiling = function (x) {
        const r = this.rng;
        const d = this.difficulty(x);
        const gap = r() < 0.4 + 0.35 * d ? 120 + r() * (180 + 320 * d) : 0;
        const x0 = x + gap, x1 = x0 + 380 + r() * 560;
        let y = GROUND - (800 + r() * 110) + (r() - 0.5) * 120 * d;
        // A pendulum hung from anywhere on the segment must clear the roofs it can sweep over.
        y = Math.max(20, Math.min(y, this.topNear(x0 - 280, x1 + 280) - 300));
        this.addCeiling(x0, x1, y);

        for (let ox = x0 + 180; ox < x1 - 80; ox += 460) {
            if (r() < 0.55) {
                const rad = 300 + r() * 60;
                for (let i = 0; i < 5; i++) {
                    const t = (55 + i * 17.5) * Math.PI / 180;
                    this.addOrb(ox + Math.cos(t) * rad, y + Math.sin(t) * rad);
                }
            }
            if (ox > this.nextRingX) {
                const rx = ox + 230, ry = y + 300 + r() * 60;
                if (!this.insidePart(rx, ry, 90) && ry < GROUND - 200) {
                    this.rings.push({ x: rx, y: ry, cy: ry, r: 62, taken: false, ph: r() * 6 });
                }
                this.nextRingX = ox + 2600 + r() * 2600;
            }
        }
    };

    World.prototype.addOrb = function (x, y) {
        if (y > GROUND - 50 || this.insidePart(x, y, 16)) return;
        this.orbs.push({ x, y, taken: false, ph: (x * 0.013) % 6.28 });
    };

    World.prototype.makeBuilding = function (x) {
        const r = this.rng;
        const d = this.difficulty(x);
        const dist = districtAt(x);
        const pick = list => list[(r() * list.length) | 0];
        const b = { x, w: 0, parts: [], style: '', seed: (r() * 1e9) | 0, deco: {}, gap: 0, color: pick(dist.colors) };

        switch (dist.key) {
            case 'oldtown': {
                if (r() < 0.2 && x > 2400 && this.lastStyle !== 'tower') {
                    const w = 72 + r() * 28, h = 290 + r() * 90 + d * 40, spire = 110 + r() * 50;
                    b.style = 'tower';
                    b.w = w;
                    this.addPart(b, x, GROUND - h, w, h);
                    this.addPart(b, x + w * 0.38, GROUND - h - spire * 0.62, w * 0.24, spire * 0.62);
                    b.deco.spire = spire;
                    b.deco.clock = r() < 0.75;
                    b.color = '#6b5a6e';
                } else {
                    const w = 90 + r() * 90, h = 110 + r() * 150 + d * 60;
                    b.style = 'house';
                    b.w = w;
                    this.addPart(b, x, GROUND - h, w, h);
                    b.deco.chimneys = [];
                    const n = r() < 0.75 ? 1 + (r() < 0.4 ? 1 : 0) : 0;
                    for (let i = 0; i < n; i++) b.deco.chimneys.push(0.12 + r() * 0.7);
                    b.deco.cornice = r() < 0.5;
                }
                b.gap = 40 + r() * 110 + d * 90;
                break;
            }
            case 'downtown': {
                const w = 130 + r() * 130, h = Math.min(540, 240 + r() * 240 + d * 80);
                b.style = 'glass';
                b.w = w;
                if (r() < 0.45 && h > 340) {
                    const sb = 60 + r() * 80;
                    this.addPart(b, x, GROUND - h + sb, w, h - sb);
                    this.addPart(b, x + w * 0.18, GROUND - h, w * 0.64, sb);
                } else {
                    this.addPart(b, x, GROUND - h, w, h);
                }
                if (r() < 0.5) b.deco.antenna = { at: 0.3 + r() * 0.4, h: 40 + r() * 50 };
                if (r() < 0.3) b.deco.tank = 0.15 + r() * 0.5;
                if (r() < 0.35) b.deco.sign = pick(SIGNS);
                b.deco.tint = r();
                b.gap = 50 + r() * 120 + d * 110;
                break;
            }
            case 'docks': {
                const roll = r();
                if (roll < 0.45) {
                    const w = 200 + r() * 140, h = 90 + r() * 70 + d * 40;
                    b.style = 'warehouse';
                    b.w = w;
                    this.addPart(b, x, GROUND - h, w, h);
                } else if (roll < 0.82) {
                    const cols = 1 + (r() < 0.5 ? 1 : 0), rows = 2 + ((r() * (3 + d * 2)) | 0);
                    b.style = 'containers';
                    b.w = cols * 66;
                    b.deco.cells = [];
                    for (let j = 0; j < rows; j++) {
                        this.addPart(b, x, GROUND - (j + 1) * 28, b.w, 28);
                        for (let i = 0; i < cols; i++) b.deco.cells.push(pick(dist.containers));
                    }
                    b.deco.cols = cols;
                } else {
                    const w = 70 + r() * 30, h = 170 + r() * 100;
                    b.style = 'silo';
                    b.w = w;
                    this.addPart(b, x, GROUND - h, w, h);
                }
                if (r() < 0.42 + d * 0.2) {
                    b.gap = 180 + r() * 200 + d * 120;
                    this.waters.push({ x0: x + b.w, x1: x + b.w + b.gap });
                } else {
                    b.gap = 50 + r() * 80;
                }
                break;
            }
            case 'brutalia': {
                const roll = r();
                if (roll < 0.45) {
                    const w = 160 + r() * 100, h = 200 + r() * 200 + d * 40, cap = 70 + r() * 50;
                    const bw = w * (0.42 + r() * 0.18);
                    const off = (w - bw) * (r() < 0.5 ? 0.5 : r());
                    b.style = 'brutal';
                    b.w = w;
                    this.addPart(b, x, GROUND - h, w, cap);
                    this.addPart(b, x + off, GROUND - h + cap, bw, h - cap);
                } else if (roll < 0.75) {
                    const n = 3 + ((r() * (3 + d * 2)) | 0);
                    let cx = 0, minX = Infinity, maxX = -Infinity, y = GROUND;
                    const boxes = [];
                    for (let i = 0; i < n; i++) {
                        const bw = 70 + r() * 40, bh = 50 + r() * 14;
                        const bx = cx + (i ? (r() - 0.5) * 60 : 0) - bw / 2;
                        y -= bh;
                        boxes.push([bx, y, bw, bh]);
                        minX = Math.min(minX, bx);
                        maxX = Math.max(maxX, bx + bw);
                        cx = bx + bw / 2;
                    }
                    b.style = 'habitat';
                    b.w = maxX - minX;
                    for (const [bx, by, bw, bh] of boxes) this.addPart(b, x + bx - minX, by, bw, bh);
                } else {
                    const w = 110 + r() * 60, h = 300 + r() * 160;
                    b.style = 'slab';
                    b.w = w;
                    this.addPart(b, x, GROUND - h, w, h);
                }
                b.gap = 50 + r() * 100 + d * 100;
                break;
            }
            default: {
                const roll = r();
                if (roll < 0.5) {
                    const w = 60 + r() * 50, h = 280 + r() * 240;
                    b.style = 'neon';
                    b.w = w;
                    this.addPart(b, x, GROUND - h, w, h);
                } else if (roll < 0.82) {
                    const w = 130 + r() * 90, y = GROUND - (330 + r() * 190);
                    b.style = 'platform';
                    b.w = w;
                    this.addPart(b, x, y, w, 22);
                    b.deco.trees = [];
                    const n = 1 + ((r() * 3) | 0);
                    for (let i = 0; i < n; i++) b.deco.trees.push(0.15 + r() * 0.7);
                } else {
                    const w = 170 + r() * 80, h = 150 + r() * 80;
                    b.style = 'zig';
                    b.w = w;
                    const tiers = 3;
                    for (let i = 0; i < tiers; i++) {
                        const tw = w * (1 - i * 0.25), th = h / tiers;
                        this.addPart(b, x + (w - tw) / 2, GROUND - th * (i + 1), tw, th);
                    }
                }
                b.neon = pick(dist.neon);
                b.gap = 60 + r() * 120 + d * 120;
            }
        }
        b.parts.sort((p, q) => p.y - q.y);
        this.lastStyle = b.style;
        return b;
    };

    // ---------- Simulation ----------

    // Where a grapple fired from (ox, oy) along (dx, dy) would bite into the ceiling, if within range.
    World.prototype.raycast = function (ox, oy, dx, dy) {
        const len = Math.hypot(dx, dy);
        if (!len) return null;
        dx /= len;
        dy /= len;
        if (dy > -0.05) return null;
        let best = null, bestT = RANGE;
        for (const c of this.ceiling) {
            if (c.x1 < ox - RANGE) continue;
            if (c.x0 > ox + RANGE) break;
            const t = (c.y - oy) / dy;
            if (t <= 0 || t > bestT) continue;
            const x = ox + dx * t;
            if (x < c.x0 || x > c.x1) continue;
            bestT = t;
            best = { cx: x, cy: c.y };
        }
        return best;
    };

    // Unit aim direction: toward this.aim (a world point), or up-and-forward when nothing is aiming.
    World.prototype.aimDir = function () {
        const p = this.player;
        if (this.aim) {
            const dx = this.aim.x - p.x, dy = this.aim.y - p.y, d = Math.hypot(dx, dy);
            if (d > 1) return { x: dx / d, y: dy / d };
        }
        return { x: 0.5, y: -0.866 };
    };

    World.prototype.findTarget = function () {
        const p = this.player;
        const d = this.aimDir();
        return this.raycast(p.x, p.y, d.x, d.y);
    };

    World.prototype.attach = function (a) {
        const p = this.player;
        p.anchor = a;
        p.ropeLen = clamp(Math.hypot(p.x - a.cx, p.y - a.cy), 90, RANGE);
        this.chain++;
        this.stats.grapples++;
        this.stats.maxMult = Math.max(this.stats.maxMult, this.mult());
        this.emit('grapple', { anchor: a, mult: this.mult() });
    };

    World.prototype.release = function () {
        const p = this.player;
        this.emit('release', { anchor: p.anchor, speed: Math.hypot(p.vx, p.vy) });
        p.anchor = null;
    };

    World.prototype.crash = function (cause, q) {
        const p = this.player;
        if (!p.alive) return;
        p.alive = false;
        p.cause = cause;
        const speed = Math.hypot(p.vx, p.vy);
        p.anchor = null;
        if (cause === 'wall' && q) {
            p.x = p.px < q.x + q.w / 2 ? q.x - p.r - 1 : q.x + q.w + p.r + 1;
            p.vx = -p.vx * 0.25;
            p.vy = Math.min(p.vy * 0.3, 0) - 200;
        } else if (cause === 'ceiling' && q) {
            p.y = q.y + q.h + p.r + 1;
            p.vy = Math.abs(p.vy) * 0.3;
            p.vx *= 0.4;
        } else if (cause === 'water') {
            p.inWater = true;
            p.vx *= 0.3;
            p.vy *= 0.1;
        } else {
            p.y = GROUND - p.r;
            p.vy = -Math.abs(p.vy) * 0.35;
            p.vx *= 0.6;
        }
        this.emit('crash', { cause, x: p.x, y: p.y, speed });
    };

    World.prototype.updateRings = function () {
        for (const ring of this.rings) ring.cy = ring.y + Math.sin(this.time * 1.2 + ring.ph) * 10;
    };

    World.prototype.step = function (dt) {
        this.time += dt;
        const p = this.player;
        this.updateRings();

        if (!p.alive) {
            if (p.inWater) {
                p.vy += (40 - p.vy) * 2 * dt;
                p.vx *= 1 - 2 * dt;
            } else {
                p.vy += GRAVITY * dt;
            }
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            if (!p.inWater && p.y > GROUND - p.r) {
                p.y = GROUND - p.r;
                p.vy = Math.abs(p.vy) > 120 ? -p.vy * 0.3 : 0;
                p.vx *= 0.75;
            }
            return;
        }

        const press = this.hold && !this.prevHold;
        this.prevHold = this.hold;

        if (p.anchor && !this.hold) this.release();
        if (this.hold && !p.anchor) {
            if (press && p.grounded) {
                p.vy = -760;
                p.grounded = false;
                this.emit('jump');
            }
            const t = this.findTarget();
            if (t) this.attach(t);
            else if (press && !p.grounded) this.emit('miss');
        }

        p.vy += GRAVITY * dt;
        let sp = Math.hypot(p.vx, p.vy);
        p.vx -= DRAG * sp * p.vx * dt;
        p.vy -= DRAG * sp * p.vy * dt;

        if (p.grounded && !p.anchor) p.vx += (RUN_SPEED - p.vx) * (p.vx < RUN_SPEED ? 4 : 1.5) * dt;

        if (p.anchor) {
            const a = p.anchor;
            if (p.ropeLen > REEL_MIN) p.ropeLen = Math.max(REEL_MIN, p.ropeLen - REEL_SPEED * dt);
            const dx = p.x - a.cx, dy = p.y - a.cy, d = Math.hypot(dx, dy) || 1;
            if (dy > 0) {
                let tx = -dy / d, ty = dx / d;
                if (p.vx * tx + p.vy * ty < 0) {
                    tx = -tx;
                    ty = -ty;
                }
                p.vx += tx * PUMP * dt;
                p.vy += ty * PUMP * dt;
            }
        }

        p.px = p.x;
        p.py = p.y;
        p.x += p.vx * dt;
        p.y += p.vy * dt;

        if (p.anchor) {
            const a = p.anchor;
            const dx = p.x - a.cx, dy = p.y - a.cy, d = Math.hypot(dx, dy);
            if (d > p.ropeLen) {
                const nx = dx / d, ny = dy / d;
                p.x = a.cx + nx * p.ropeLen;
                p.y = a.cy + ny * p.ropeLen;
                const rv = p.vx * nx + p.vy * ny;
                if (rv > 0) {
                    p.vx -= rv * nx;
                    p.vy -= rv * ny;
                }
            }
        }

        const wasGrounded = p.grounded;
        p.grounded = false;
        for (const b of this.buildings) {
            if (b.x > p.x + 400) break;
            if (b.x + b.w < p.x - 40) continue;
            for (const q of b.parts) {
                const cx = clamp(p.x, q.x, q.x + q.w), cy = clamp(p.y, q.y, q.y + q.h);
                const dx = p.x - cx, dy = p.y - cy;
                if (dx * dx + dy * dy >= p.r * p.r) continue;
                const pen = p.y + p.r - q.y;
                const fromAbove = p.py + p.r <= q.y + 4 || (pen < 12 && p.vy >= 0 && p.x > q.x - 4 && p.x < q.x + q.w + 4);
                if (fromAbove) {
                    p.y = q.y - p.r;
                    if (p.vy > 0) {
                        if (!wasGrounded && p.airTime > 0.15) this.emit('land', { v: p.vy, x: p.x, y: q.y });
                        p.vy = 0;
                    }
                    p.grounded = true;
                } else {
                    this.crash(p.py - p.r >= q.y + q.h - 4 ? 'ceiling' : 'wall', q);
                    return;
                }
            }
        }

        // The ceiling is solid: bump off its underside, or off the walls of a gap you rose into.
        for (const c of this.ceiling) {
            if (c.x0 > p.x + p.r) break;
            if (c.x1 < p.x - p.r || p.y - p.r >= c.y) continue;
            const dx = p.x - clamp(p.x, c.x0, c.x1), dy = p.y - Math.min(p.y, c.y);
            if (dx * dx + dy * dy >= p.r * p.r) continue;
            const v = Math.hypot(p.vx, p.vy);
            if (p.py - p.r >= c.y - 3) {
                p.y = c.y + p.r;
                if (p.vy < 0) p.vy = -p.vy * 0.15;
            } else {
                p.x = p.px < (c.x0 + c.x1) / 2 ? c.x0 - p.r : c.x1 + p.r;
                p.vx = -p.vx * 0.3;
            }
            if (v > 250) this.emit('bonk', { x: p.x, y: p.y - p.r, v });
        }

        if (p.grounded) {
            if (this.chain > 0 && p.airTime > 0.15) this.emit('chainEnd', { chain: this.chain });
            this.chain = 0;
            p.airTime = 0;
        } else {
            p.airTime += dt;
            this.stats.longestFlight = Math.max(this.stats.longestFlight, p.airTime);
        }

        if (p.y + p.r >= GROUND) {
            this.crash(this.isWater(p.x) ? 'water' : 'street');
            return;
        }

        sp = Math.hypot(p.vx, p.vy);
        if (sp > MAX_SPEED) {
            p.vx *= MAX_SPEED / sp;
            p.vy *= MAX_SPEED / sp;
            sp = MAX_SPEED;
        }
        this.stats.maxSpeed = Math.max(this.stats.maxSpeed, sp);

        for (const o of this.orbs) {
            if (o.taken || Math.abs(o.x - p.x) > 40) continue;
            const dx = o.x - p.x, dy = o.y - p.y;
            if (dx * dx + dy * dy < 31 * 31) {
                o.taken = true;
                this.stats.orbs++;
                const pts = 10 * this.mult();
                this.bonus += pts;
                this.emit('orb', { x: o.x, y: o.y, pts, n: this.stats.orbs });
            }
        }

        for (const ring of this.rings) {
            if (ring.taken || Math.abs(ring.x - p.x) > 24 || Math.abs(ring.cy - p.y) > ring.r) continue;
            ring.taken = true;
            this.stats.rings++;
            const f = Math.min(MAX_SPEED, sp * 1.2 + 350) / Math.max(sp, 1);
            p.vx *= f;
            p.vy *= f;
            if (p.vx < 300) p.vx = 300;
            const pts = 50 * this.mult();
            this.bonus += pts;
            this.emit('ring', { x: ring.x, y: ring.cy, pts });
        }

        if (!p.grounded && p.airTime > 0.35 && sp > 600) {
            for (const b of this.buildings) {
                if (b.x > p.x + 60) break;
                if (b.x + b.w < p.x - 60) continue;
                for (const q of b.parts) {
                    if (q.nm) continue;
                    const cx = clamp(p.x, q.x, q.x + q.w), cy = clamp(p.y, q.y, q.y + q.h);
                    if (Math.hypot(p.x - cx, p.y - cy) - p.r < 24) {
                        q.nm = true;
                        this.stats.nearMisses++;
                        const pts = 25 * this.mult();
                        this.bonus += pts;
                        this.emit('nearmiss', { x: cx, y: cy, pts });
                    }
                }
            }
        }

        const m = p.x / PX_PER_M;
        if (m > this.dist) {
            this.bonus += (m - this.dist) * this.mult();
            this.dist = m;
        }

        const di = districtIndexAt(p.x);
        if (di !== this.district) {
            this.district = di;
            this.emit('district', { index: di });
        }

        this.ensure(p.x + 4000);
    };

    // Autopilot used for the title-screen demo and for headless balance testing: it aims as well as holds.
    World.prototype.botHold = function () {
        const p = this.player;
        if (!p.alive) return false;
        if (p.anchor) {
            const a = p.anchor;
            return !(p.x - a.cx > p.ropeLen * 0.5 && p.vy < 0 && p.vx > 0);
        }
        for (const deg of [56, 48, 64, 40, 72, 32, 80]) {
            const a = deg * Math.PI / 180, dx = Math.cos(a), dy = -Math.sin(a);
            const t = this.raycast(p.x, p.y, dx, dy);
            if (!t) continue;
            this.aim = { x: p.x + dx * 100, y: p.y + dy * 100 };
            if (p.grounded) return t.cx - p.x > 120;
            return t.cx - p.x > 50 && p.vy > -200;
        }
        return false;
    };

    V.World = World;
    V.DISTRICTS = DISTRICTS;
    V.districtAt = districtAt;
    V.districtIndexAt = districtIndexAt;
    V.hash = hash;
    V.hashString = hashString;
    V.mulberry32 = mulberry32;
    V.clamp = clamp;
    V.CONST = { GROUND, PX_PER_M, DISTRICT_LEN, RANGE, PLAYER_R, MAX_SPEED };
})(typeof window !== 'undefined' ? (window.VERTIGO = window.VERTIGO || {}) : (globalThis.VERTIGO = globalThis.VERTIGO || {}));
