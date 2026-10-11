// Canvas renderer: neon sprites with baked glow, additive projectiles and
// particles, screen shake and off-screen indicators.

import {TAU, clamp, hash3} from './util.js';
import {RUN_LENGTH} from './stages.js';

const WORLD_MIN = 700; // world units visible across the shorter screen side

// ------------------------------------------------------------------ shapes

function polyPath(c, pts) {
    c.beginPath();
    for (let i = 0; i < pts.length; i++) {
        const [x, y] = pts[i];
        if (i) c.lineTo(x, y);
        else c.moveTo(x, y);
    }
    c.closePath();
}

function regular(c, n, r, rot = 0) {
    const pts = [];
    for (let i = 0; i < n; i++) {
        const a = rot + (i / n) * TAU;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    polyPath(c, pts);
}

function starPath(c, n, r1, r2, rot = 0) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
        const a = rot + (i / (n * 2)) * TAU, r = i % 2 ? r2 : r1;
        pts.push([Math.cos(a) * r, Math.sin(a) * r]);
    }
    polyPath(c, pts);
}

// Draws an enemy body (facing +x) centred on the origin.
function enemyShape(c, shape, r, color, detail) {
    c.lineJoin = 'round';
    c.lineWidth = Math.max(1.5, r * 0.16);
    c.strokeStyle = color;
    c.fillStyle = 'rgba(10, 4, 24, 0.85)';
    switch (shape) {
        case 'tri':
            polyPath(c, [[r * 1.15, 0], [-r * 0.8, r * 0.85], [-r * 0.45, 0], [-r * 0.8, -r * 0.85]]);
            break;
        case 'diamond':
            polyPath(c, [[r * 1.2, 0], [0, r * 0.7], [-r, 0], [0, -r * 0.7]]);
            break;
        case 'square':
            c.beginPath();
            c.rect(-r * 0.85, -r * 0.85, r * 1.7, r * 1.7);
            break;
        case 'penta':
            regular(c, 5, r);
            break;
        case 'hex':
            regular(c, 6, r);
            break;
        case 'octa':
            regular(c, 8, r, Math.PI / 8);
            break;
        case 'arrow':
            polyPath(c, [[r * 1.3, 0], [-r * 0.2, r * 0.9], [-r * 0.2, r * 0.35], [-r, r * 0.35], [-r, -r * 0.35], [-r * 0.2, -r * 0.35], [-r * 0.2, -r * 0.9]]);
            break;
        case 'star':
            starPath(c, 5, r * 1.1, r * 0.5, -Math.PI / 2);
            break;
        case 'ring':
        case 'circle':
        case 'cell':
            c.beginPath();
            c.arc(0, 0, r, 0, TAU);
            break;
        case 'flower':
            starPath(c, 6, r * 1.05, r * 0.65);
            break;
        case 'wisp':
            c.beginPath();
            c.moveTo(r * 1.1, 0);
            c.quadraticCurveTo(0, r * 1.1, -r * 1.2, r * 0.6);
            c.quadraticCurveTo(-r * 0.6, 0, -r * 1.2, -r * 0.6);
            c.quadraticCurveTo(0, -r * 1.1, r * 1.1, 0);
            break;
        case 'crate':
            c.beginPath();
            c.rect(-r * 0.9, -r * 0.9, r * 1.8, r * 1.8);
            break;
        case 'eye':
            c.beginPath();
            c.moveTo(r * 1.15, 0);
            c.quadraticCurveTo(0, r * 1.3, -r * 1.15, 0);
            c.quadraticCurveTo(0, -r * 1.3, r * 1.15, 0);
            break;
        case 'skull':
            c.beginPath();
            c.arc(0, -r * 0.15, r, Math.PI * 0.85, Math.PI * 2.15);
            c.lineTo(r * 0.55, r * 0.95);
            c.lineTo(-r * 0.55, r * 0.95);
            c.closePath();
            break;
        default:
            c.beginPath();
            c.arc(0, 0, r, 0, TAU);
    }
    c.fill();
    c.stroke();
    if (!detail) return;
    // Inner details
    c.lineWidth = Math.max(1, r * 0.09);
    c.fillStyle = color;
    switch (shape) {
        case 'tri':
        case 'arrow':
        case 'diamond':
            c.beginPath();
            c.arc(r * 0.25, 0, r * 0.2, 0, TAU);
            c.fill();
            break;
        case 'square':
            c.beginPath();
            c.rect(-r * 0.4, -r * 0.4, r * 0.8, r * 0.8);
            c.stroke();
            break;
        case 'penta':
            c.beginPath();
            c.arc(r * 0.2, 0, r * 0.32, 0, TAU);
            c.stroke();
            c.beginPath();
            c.arc(r * 0.3, 0, r * 0.13, 0, TAU);
            c.fill();
            break;
        case 'hex':
            regular(c, 6, r * 0.5, Math.PI / 6);
            c.stroke();
            break;
        case 'octa':
            regular(c, 8, r * 0.55, Math.PI / 8);
            c.stroke();
            c.beginPath();
            c.arc(r * 0.15, 0, r * 0.22, 0, TAU);
            c.fill();
            break;
        case 'cell':
            c.beginPath();
            c.arc(-r * 0.25, -r * 0.2, r * 0.25, 0, TAU);
            c.arc(r * 0.3, r * 0.25, r * 0.2, 0, TAU);
            c.fill();
            break;
        case 'ring':
            c.beginPath();
            c.arc(0, 0, r * 0.5, 0, TAU);
            c.stroke();
            break;
        case 'star':
        case 'flower':
            c.beginPath();
            c.arc(0, 0, r * 0.3, 0, TAU);
            c.fill();
            break;
        case 'wisp':
            c.beginPath();
            c.arc(r * 0.4, -r * 0.2, r * 0.14, 0, TAU);
            c.arc(r * 0.4, r * 0.2, r * 0.14, 0, TAU);
            c.fill();
            break;
        case 'crate':
            c.beginPath();
            c.moveTo(-r * 0.9, -r * 0.9);
            c.lineTo(r * 0.9, r * 0.9);
            c.moveTo(r * 0.9, -r * 0.9);
            c.lineTo(-r * 0.9, r * 0.9);
            c.stroke();
            break;
        case 'eye':
            c.beginPath();
            c.arc(r * 0.1, 0, r * 0.45, 0, TAU);
            c.stroke();
            c.beginPath();
            c.arc(r * 0.2, 0, r * 0.22, 0, TAU);
            c.fill();
            break;
        case 'skull':
            c.fillStyle = '#000';
            c.beginPath();
            c.arc(-r * 0.38, -r * 0.1, r * 0.24, 0, TAU);
            c.arc(r * 0.38, -r * 0.1, r * 0.24, 0, TAU);
            c.fill();
            break;
    }
}

// Codex portrait of an enemy or boss as a data URL.
export function enemyIcon(def, size = 64) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    const c = cv.getContext('2d');
    c.translate(size / 2, size / 2);
    const r = size * 0.3;
    c.rotate(DIRECTIONAL.has(def.shape) ? -Math.PI / 2 : 0);
    c.shadowColor = def.color;
    c.shadowBlur = size * 0.15;
    enemyShape(c, def.shape, r, def.color, true);
    c.shadowBlur = 0;
    enemyShape(c, def.shape, r, def.color, true);
    return cv.toDataURL();
}

// Shapes that point in their travel direction; the rest spin slowly.
const DIRECTIONAL = new Set(['tri', 'diamond', 'arrow', 'wisp', 'penta', 'eye']);

// ------------------------------------------------------------------ renderer

export class Renderer {
    constructor(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', {alpha: false});
        this.sprites = new Map();
        this.particles = [];
        this.nums = [];
        this.shake = 0;
        this.flash = 0;
        this.flashColor = '#fff';
        this.hurt = 0;
        this.time = 0;
        this.patterns = {};
        this.settings = {damageNumbers: true, shake: true, particles: 1};
        this.resize();
    }

    resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        const w = window.innerWidth, h = window.innerHeight;
        this.dpr = dpr;
        this.w = w;
        this.h = h;
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.scale = clamp(Math.min(w, h) / WORLD_MIN, 0.45, 1.8);
        // Sprites are baked at the on-screen resolution.
        const res = Math.min(3, Math.max(1, this.scale * dpr));
        if (res !== this.res) {
            this.res = res;
            this.sprites.clear();
            this.patterns = {};
        }
        return {w: w / this.scale, h: h / this.scale};
    }

    sprite(key, half, draw) {
        let s = this.sprites.get(key);
        if (s) return s;
        const res = this.res;
        const size = Math.ceil(half * 2 * res);
        const cv = document.createElement('canvas');
        cv.width = cv.height = Math.max(2, size);
        const c = cv.getContext('2d');
        c.translate(size / 2, size / 2);
        c.scale(res, res);
        draw(c);
        s = {cv, half};
        this.sprites.set(key, s);
        return s;
    }

    enemySprite(e, white) {
        const def = e.def;
        const r = e.r;
        const key = `e|${def.id}|${Math.round(r)}|${e.elite ? 1 : 0}|${white ? 1 : 0}`;
        const pad = r * 0.9 + 6;
        return this.sprite(key, r * 1.35 + pad, c => {
            const color = white ? '#ffffff' : e.elite ? '#ffd36b' : def.color;
            c.shadowColor = color;
            c.shadowBlur = r * 0.9 + 4;
            enemyShape(c, def.shape, r, color, true);
            c.shadowBlur = 0;
            enemyShape(c, def.shape, r, color, true);
            if (e.elite && !white) {
                c.strokeStyle = def.color;
                c.lineWidth = 1.5;
                c.beginPath();
                c.arc(0, 0, r * 1.25, 0, TAU);
                c.stroke();
            }
        });
    }

    glowDot(color, r) {
        const key = `g|${color}|${r}`;
        return this.sprite(key, r * 3, c => {
            const g = c.createRadialGradient(0, 0, 0, 0, 0, r * 3);
            g.addColorStop(0, '#ffffff');
            g.addColorStop(0.18, color);
            g.addColorStop(0.45, hexA(color, 0.35));
            g.addColorStop(1, hexA(color, 0));
            c.fillStyle = g;
            c.beginPath();
            c.arc(0, 0, r * 3, 0, TAU);
            c.fill();
        });
    }

    // Draws a cached sprite at world position with rotation and alpha.
    blit(s, x, y, rot = 0, alpha = 1, scale = 1) {
        const c = this.ctx;
        const k = this.viewK;
        const cos = Math.cos(rot) * k * scale / this.res, sin = Math.sin(rot) * k * scale / this.res;
        const sx = (x - this.camX) * k + this.ox, sy = (y - this.camY) * k + this.oy;
        c.setTransform(cos, sin, -sin, cos, sx, sy);
        c.globalAlpha = alpha;
        const off = s.cv.width / 2;
        c.drawImage(s.cv, -off, -off);
    }

    worldTransform() {
        const k = this.viewK;
        this.ctx.setTransform(k, 0, 0, k, this.ox - this.camX * k, this.oy - this.camY * k);
    }

    // ---------------------------------------------------------------- events

    consume(g, events) {
        const q = this.settings.particles;
        for (const ev of events) {
            switch (ev.type) {
                case 'kill':
                    if (ev.silent) {
                        this.burst(ev.x, ev.y, ev.color, 4 * q, 120, 0.4);
                        break;
                    }
                    this.burst(ev.x, ev.y, ev.color, (ev.boss ? 60 : ev.elite ? 24 : 5 + ev.r / 4) * q, ev.boss ? 380 : 180, ev.boss ? 1 : 0.45);
                    if (ev.boss) {
                        this.addShake(18);
                        this.ring(ev.x, ev.y, ev.color, 220, 0.7);
                        this.flash = 0.5;
                        this.flashColor = ev.color;
                    } else if (ev.elite) {
                        this.addShake(6);
                        this.ring(ev.x, ev.y, '#ffd36b', 90, 0.4);
                    }
                    break;
                case 'dmg':
                    if (this.settings.damageNumbers && this.nums.length < 90 && g.onScreen(ev.x, ev.y, 20)) {
                        this.nums.push({x: ev.x + (Math.random() - 0.5) * 10, y: ev.y, vy: -60, life: 0.6, max: 0.6, v: ev.v, crit: ev.crit});
                    }
                    break;
                case 'hurt':
                    this.addShake(7);
                    this.hurt = 0.35;
                    break;
                case 'explode':
                    this.addShake(Math.min(6, ev.r / 25));
                    this.burst(ev.x, ev.y, '#ffb36b', 6 * q, 160, 0.35);
                    break;
                case 'levelup':
                    this.ring(g.player.x, g.player.y, '#3df2ff', 160, 0.6);
                    break;
                case 'evolve':
                case 'clear':
                case 'emp':
                case 'revive':
                    this.flash = 0.6;
                    this.flashColor = ev.type === 'revive' ? '#ff8a3d' : '#ffffff';
                    this.addShake(10);
                    break;
                case 'bossSpawn':
                    this.addShake(ev.final ? 16 : 10);
                    break;
                case 'pickup':
                    this.burst(ev.x, ev.y, ev.kind === 'heal' ? '#ff5fa2' : '#ffd36b', 8 * q, 120, 0.4);
                    break;
                case 'mine':
                    this.burst(ev.x, ev.y, '#c4ff3d', 5 * q, 90, 0.3);
                    break;
            }
        }
    }

    addShake(v) {
        if (this.settings.shake) this.shake = Math.min(22, this.shake + v);
    }

    burst(x, y, color, n, speed, life) {
        n = Math.round(n);
        if (this.particles.length > 1800) return;
        for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.7);
            this.particles.push({
                x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.5 + Math.random() * 0.6),
                max: life, size: 1.5 + Math.random() * 2.5, color, kind: 'spark',
            });
        }
    }

    ring(x, y, color, r, life) {
        this.particles.push({x, y, vx: 0, vy: 0, life, max: life, size: r, color, kind: 'ring'});
    }

    trail(x, y, color, size, life) {
        if (this.particles.length > 1800) return;
        this.particles.push({x, y, vx: (Math.random() - 0.5) * 20, vy: (Math.random() - 0.5) * 20, life, max: life, size, color, kind: 'dot'});
    }

    // ---------------------------------------------------------------- frame

    // dt drives the simulation-coupled visuals (frozen while paused); realDt
    // drives screen effects such as flashes and shake, which always settle.
    draw(g, dt, realDt = dt) {
        const c = this.ctx;
        this.time += dt;
        const p = g.player;
        this.viewK = this.scale * this.dpr;
        let sx = 0, sy = 0;
        if (this.shake > 0.1) {
            sx = (Math.random() - 0.5) * this.shake;
            sy = (Math.random() - 0.5) * this.shake;
            this.shake *= Math.exp(-realDt * 10);
        } else this.shake = 0;
        this.camX = p.x + sx;
        this.camY = p.y + sy;
        this.ox = (this.w * this.dpr) / 2;
        this.oy = (this.h * this.dpr) / 2;
        const vw = this.w / this.scale, vh = this.h / this.scale;
        this.vx0 = p.x - vw / 2 - 60;
        this.vx1 = p.x + vw / 2 + 60;
        this.vy0 = p.y - vh / 2 - 60;
        this.vy1 = p.y + vh / 2 + 60;

        this.drawBackground(g);
        this.drawObstacles(g);
        this.drawHazardsUnder(g);
        this.drawZones(g);
        this.drawPickups(g);
        this.drawEnemies(g);
        this.drawWeaponsUnder(g);
        this.drawPlayer(g);
        c.globalCompositeOperation = 'lighter';
        this.drawProjectiles(g);
        this.drawFx(g);
        this.drawParticles(dt);
        c.globalCompositeOperation = 'source-over';
        this.drawBullets(g);
        this.drawHazardsOver(g);
        this.drawNumbers(dt);
        this.drawIndicators(g);
        this.drawOverlay(g, realDt);
        c.globalAlpha = 1;
        c.setTransform(1, 0, 0, 1, 0, 0);
    }

    drawBackground(g) {
        const c = this.ctx;
        const bg = g.stage.bg;
        c.setTransform(1, 0, 0, 1, 0, 0);
        c.globalAlpha = 1;
        const W = this.canvas.width, H = this.canvas.height;
        const grad = c.createRadialGradient(W / 2, H / 2, 0, W / 2, H / 2, Math.max(W, H) * 0.7);
        grad.addColorStop(0, bg.base2);
        grad.addColorStop(1, bg.base);
        c.fillStyle = grad;
        c.fillRect(0, 0, W, H);

        if (bg.pattern === 'void') this.drawStars(g);

        this.worldTransform();
        const x0 = this.vx0, x1 = this.vx1, y0 = this.vy0, y1 = this.vy1;
        if (bg.pattern === 'grid' || bg.pattern === 'void') {
            const step = bg.pattern === 'void' ? 128 : 64;
            c.lineWidth = 1 / this.scale;
            c.strokeStyle = bg.grid;
            c.beginPath();
            for (let x = Math.floor(x0 / step) * step; x < x1; x += step) {
                c.moveTo(x, y0);
                c.lineTo(x, y1);
            }
            for (let y = Math.floor(y0 / step) * step; y < y1; y += step) {
                c.moveTo(x0, y);
                c.lineTo(x1, y);
            }
            c.stroke();
            const major = step * 5;
            c.strokeStyle = bg.major;
            c.lineWidth = 2 / this.scale;
            c.beginPath();
            for (let x = Math.floor(x0 / major) * major; x < x1; x += major) {
                c.moveTo(x, y0);
                c.lineTo(x, y1);
            }
            for (let y = Math.floor(y0 / major) * major; y < y1; y += major) {
                c.moveTo(x0, y);
                c.lineTo(x1, y);
            }
            c.stroke();
            if (bg.pattern === 'grid') {
                // Glowing nodes where major lines cross.
                c.fillStyle = bg.major;
                for (let x = Math.floor(x0 / major) * major; x < x1; x += major) {
                    for (let y = Math.floor(y0 / major) * major; y < y1; y += major) {
                        const pulse = 2 + Math.sin(this.time * 2 + x * 0.01 + y * 0.013) * 1.2;
                        c.fillRect(x - pulse, y - pulse, pulse * 2, pulse * 2);
                    }
                }
            }
        } else if (bg.pattern === 'hex') {
            const pat = this.hexPattern(bg);
            c.fillStyle = pat;
            c.fillRect(x0, y0, x1 - x0, y1 - y0);
        }
    }

    hexPattern(bg) {
        if (this.patterns.hex) return this.patterns.hex;
        const s = 46;
        const w = s * 3, h = Math.sqrt(3) * s;
        const res = this.res;
        const cv = document.createElement('canvas');
        cv.width = Math.round(w * res);
        cv.height = Math.round(h * res);
        const c = cv.getContext('2d');
        c.scale(cv.width / w, cv.height / h);
        c.strokeStyle = bg.grid;
        c.lineWidth = 1.2;
        const hex = (cx, cy) => {
            c.beginPath();
            for (let i = 0; i <= 6; i++) {
                const a = (i / 6) * TAU;
                const x = cx + Math.cos(a) * s, y = cy + Math.sin(a) * s;
                if (i) c.lineTo(x, y);
                else c.moveTo(x, y);
            }
            c.stroke();
        };
        for (const [cx, cy] of [[0, 0], [w, 0], [0, h], [w, h], [w / 2, h / 2]]) hex(cx, cy);
        const pat = this.ctx.createPattern(cv, 'repeat');
        pat.setTransform(new DOMMatrix([1 / (cv.width / w), 0, 0, 1 / (cv.height / h), 0, 0]));
        this.patterns.hex = pat;
        return pat;
    }

    drawStars(g) {
        const c = this.ctx;
        const p = g.player;
        const W = this.canvas.width, H = this.canvas.height;
        c.setTransform(1, 0, 0, 1, 0, 0);
        for (let layer = 0; layer < 3; layer++) {
            const par = 0.15 + layer * 0.2;
            const cell = 160;
            const k = this.viewK;
            const cx = p.x * par, cy = p.y * par;
            const vw = W / k, vh = H / k;
            const gx0 = Math.floor((cx - vw / 2) / cell), gx1 = Math.floor((cx + vw / 2) / cell);
            const gy0 = Math.floor((cy - vh / 2) / cell), gy1 = Math.floor((cy + vh / 2) / cell);
            c.fillStyle = layer === 2 ? 'rgba(255,255,255,0.8)' : layer === 1 ? 'rgba(196,181,255,0.6)' : 'rgba(176,107,255,0.45)';
            for (let gx = gx0; gx <= gx1; gx++) {
                for (let gy = gy0; gy <= gy1; gy++) {
                    const hx = hash3(gx, gy, layer * 7 + 1), hy = hash3(gx, gy, layer * 7 + 2);
                    const x = (gx + hx) * cell, y = (gy + hy) * cell;
                    const sx = (x - cx) * k + W / 2, sy = (y - cy) * k + H / 2;
                    const sz = (1 + layer) * this.dpr * (0.6 + hash3(gx, gy, 9) * 0.8);
                    c.fillRect(sx, sy, sz, sz);
                }
            }
        }
        // Nebula wash that drifts slowly.
        const nx = W / 2 + Math.sin(this.time * 0.05) * W * 0.3 - p.x * 0.05 * this.viewK % W;
        const neb = c.createRadialGradient(nx, H * 0.4, 0, nx, H * 0.4, Math.max(W, H) * 0.6);
        neb.addColorStop(0, 'rgba(176, 107, 255, 0.10)');
        neb.addColorStop(1, 'rgba(176, 107, 255, 0)');
        c.fillStyle = neb;
        c.fillRect(0, 0, W, H);
    }

    drawObstacles(g) {
        if (!g.stage.obstacles) return;
        const color = g.stage.obstacles.color;
        const seen = [];
        g.forObstaclesNear(g.player.x, g.player.y, o => {
            if (o.x + o.r < this.vx0 || o.x - o.r > this.vx1 || o.y + o.r < this.vy0 || o.y - o.r > this.vy1) return;
            seen.push(o);
        });
        for (const o of seen) {
            const variant = Math.floor(o.seed * 4);
            const rr = Math.round(o.r / 4) * 4;
            const s = this.sprite(`o|${rr}|${variant}`, rr * 1.5 + 10, c => {
                const n = 6 + variant;
                const pts = [];
                for (let i = 0; i < n; i++) {
                    const a = (i / n) * TAU + variant;
                    const r = rr * (0.8 + 0.2 * Math.sin(i * 2.3 + variant));
                    pts.push([Math.cos(a) * r, Math.sin(a) * r]);
                }
                c.shadowColor = color;
                c.shadowBlur = 18;
                polyPath(c, pts);
                c.fillStyle = 'rgba(10, 40, 60, 0.85)';
                c.fill();
                c.lineWidth = 2.5;
                c.strokeStyle = color;
                c.stroke();
                c.shadowBlur = 0;
                c.lineWidth = 1.2;
                c.strokeStyle = 'rgba(159, 244, 255, 0.55)';
                c.beginPath();
                for (let i = 0; i < n; i += 2) {
                    c.moveTo(0, 0);
                    c.lineTo(pts[i][0], pts[i][1]);
                }
                c.stroke();
            });
            this.blit(s, o.x, o.y, 0, 1);
        }
        this.ctx.globalAlpha = 1;
    }

    drawHazardsUnder(g) {
        const c = this.ctx;
        this.worldTransform();
        for (const h of g.hazards) {
            if (h.kind === 'blast') {
                const total = h.age + Math.max(0, h.warn);
                const prog = h.warn > 0 ? clamp(h.age / total, 0, 1) : 1;
                c.globalAlpha = 0.18 + prog * 0.25;
                c.fillStyle = h.color;
                c.beginPath();
                c.arc(h.x, h.y, h.r * prog, 0, TAU);
                c.fill();
                c.globalAlpha = 0.7;
                c.strokeStyle = h.color;
                c.lineWidth = 2 / this.scale;
                c.beginPath();
                c.arc(h.x, h.y, h.r, 0, TAU);
                c.stroke();
            } else if (h.kind === 'well') {
                const active = h.warn <= 0;
                const t = this.time;
                c.globalAlpha = active ? 0.5 : 0.25;
                c.strokeStyle = h.color;
                c.lineWidth = 2 / this.scale;
                for (let i = 0; i < 4; i++) {
                    const r = h.r * (1 - ((t * 0.35 + i / 4) % 1));
                    c.globalAlpha = (active ? 0.4 : 0.15) * (r / h.r);
                    c.beginPath();
                    c.arc(h.x, h.y, r, 0, TAU);
                    c.stroke();
                }
                const gr = c.createRadialGradient(h.x, h.y, 0, h.x, h.y, h.core * 2);
                gr.addColorStop(0, '#000000');
                gr.addColorStop(0.5, hexA(h.color, active ? 0.8 : 0.3));
                gr.addColorStop(1, hexA(h.color, 0));
                c.globalAlpha = 1;
                c.fillStyle = gr;
                c.beginPath();
                c.arc(h.x, h.y, h.core * 2, 0, TAU);
                c.fill();
            }
        }
        c.globalAlpha = 1;
    }

    drawHazardsOver(g) {
        const c = this.ctx;
        this.worldTransform();
        for (const h of g.hazards) {
            if (h.kind !== 'beam') continue;
            const x1 = h.x + Math.cos(h.ang) * h.len, y1 = h.y + Math.sin(h.ang) * h.len;
            if (h.warn > 0) {
                c.globalAlpha = 0.35 + 0.3 * Math.sin(this.time * 30);
                c.strokeStyle = h.color;
                c.lineWidth = 2 / this.scale;
                c.setLineDash([10, 8]);
                c.beginPath();
                c.moveTo(h.x, h.y);
                c.lineTo(x1, y1);
                c.stroke();
                c.setLineDash([]);
            } else {
                c.globalCompositeOperation = 'lighter';
                c.globalAlpha = 0.5;
                c.strokeStyle = h.color;
                c.lineWidth = h.w * 1.6;
                c.lineCap = 'round';
                c.beginPath();
                c.moveTo(h.x, h.y);
                c.lineTo(x1, y1);
                c.stroke();
                c.globalAlpha = 0.9;
                c.strokeStyle = '#ffffff';
                c.lineWidth = h.w * 0.4;
                c.stroke();
                c.globalCompositeOperation = 'source-over';
            }
        }
        c.globalAlpha = 1;
    }

    drawZones(g) {
        const c = this.ctx;
        this.worldTransform();
        c.globalCompositeOperation = 'lighter';
        for (const pr of g.projectiles) {
            if (pr.kind !== 'zone') continue;
            if (pr.x + pr.r < this.vx0 || pr.x - pr.r > this.vx1 || pr.y + pr.r < this.vy0 || pr.y - pr.r > this.vy1) continue;
            const fade = Math.min(1, pr.life / 0.3, (pr.max - pr.life) / 0.15 + 0.2);
            const gr = c.createRadialGradient(pr.x, pr.y, 0, pr.x, pr.y, pr.r);
            const a = pr.style === 'frost' ? 0.16 : 0.32;
            gr.addColorStop(0, hexA(pr.color, a * 0.3));
            gr.addColorStop(0.75, hexA(pr.color, a));
            gr.addColorStop(1, hexA(pr.color, 0));
            c.globalAlpha = fade;
            c.fillStyle = gr;
            c.beginPath();
            c.arc(pr.x, pr.y, pr.r, 0, TAU);
            c.fill();
            if (pr.style === 'well' || pr.style === 'static' || pr.style === 'rift') {
                c.strokeStyle = pr.color;
                c.lineWidth = 1.6 / this.scale;
                c.globalAlpha = fade * 0.8;
                const rot = this.time * (pr.pull ? -3 : 2);
                c.setLineDash([6, 8]);
                c.lineDashOffset = rot * 20;
                c.beginPath();
                c.arc(pr.x, pr.y, pr.r * 0.92, 0, TAU);
                c.stroke();
                c.setLineDash([]);
                if (pr.pull) {
                    for (let i = 0; i < 3; i++) {
                        const ang = rot + (i / 3) * TAU;
                        c.beginPath();
                        c.arc(pr.x, pr.y, pr.r * 0.55, ang, ang + 1.2);
                        c.stroke();
                    }
                }
            }
        }
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
    }

    drawPickups(g) {
        const t = this.time;
        for (const pk of g.pickups) {
            if (pk.x < this.vx0 || pk.x > this.vx1 || pk.y < this.vy0 || pk.y > this.vy1) continue;
            let s, rot = 0, scale = 1;
            switch (pk.kind) {
                case 'gem': {
                    const v = pk.value;
                    const tier = pk.overflow ? 4 : v < 3 ? 0 : v < 10 ? 1 : v < 40 ? 2 : 3;
                    const colors = ['#3df2ff', '#5dff9e', '#ff3df2', '#ffd36b', '#ff2d55'];
                    const sizes = [5, 6.5, 8, 9.5, 13];
                    const r = sizes[tier], color = colors[tier];
                    s = this.sprite(`gem|${tier}`, r * 2.6, c => {
                        c.shadowColor = color;
                        c.shadowBlur = r * 1.2;
                        polyPath(c, [[0, -r * 1.25], [r * 0.85, 0], [0, r * 1.25], [-r * 0.85, 0]]);
                        c.fillStyle = color;
                        c.fill();
                        c.shadowBlur = 0;
                        polyPath(c, [[0, -r * 1.25], [r * 0.85, 0], [0, 0]]);
                        c.fillStyle = 'rgba(255,255,255,0.55)';
                        c.fill();
                    });
                    if (pk.overflow) scale = 1 + Math.sin(t * 6) * 0.12;
                    rot = Math.sin(t * 2 + pk.x * 0.01) * 0.3;
                    break;
                }
                case 'credit':
                    s = this.sprite('credit', 12, c => {
                        c.shadowColor = '#ffd36b';
                        c.shadowBlur = 8;
                        regular(c, 6, 6, Math.PI / 6);
                        c.fillStyle = '#ffd36b';
                        c.fill();
                        c.shadowBlur = 0;
                        regular(c, 6, 3, Math.PI / 6);
                        c.fillStyle = '#8a5a00';
                        c.fill();
                    });
                    rot = t * 2;
                    break;
                case 'heal':
                    s = this.sprite('heal', 18, c => {
                        c.shadowColor = '#ff5fa2';
                        c.shadowBlur = 10;
                        c.fillStyle = '#ff5fa2';
                        c.fillRect(-3.5, -9, 7, 18);
                        c.fillRect(-9, -3.5, 18, 7);
                        c.shadowBlur = 0;
                        c.fillStyle = '#fff';
                        c.fillRect(-1.5, -6, 3, 12);
                        c.fillRect(-6, -1.5, 12, 3);
                    });
                    scale = 1 + Math.sin(t * 5) * 0.08;
                    break;
                case 'magnet':
                    s = this.sprite('magnet', 18, c => {
                        c.shadowColor = '#c4ff3d';
                        c.shadowBlur = 10;
                        c.strokeStyle = '#c4ff3d';
                        c.lineWidth = 4;
                        c.lineCap = 'round';
                        c.beginPath();
                        c.arc(0, -1, 7, Math.PI, 0);
                        c.lineTo(7, 8);
                        c.moveTo(-7, -1);
                        c.lineTo(-7, 8);
                        c.stroke();
                    });
                    rot = Math.sin(t * 3) * 0.4;
                    break;
                case 'bomb':
                    s = this.sprite('bomb', 18, c => {
                        c.shadowColor = '#ffffff';
                        c.shadowBlur = 10;
                        c.strokeStyle = '#ffffff';
                        c.lineWidth = 2.5;
                        c.beginPath();
                        c.arc(0, 0, 9, 0, TAU);
                        c.stroke();
                        c.fillStyle = '#ffe14d';
                        polyPath(c, [[2, -8], [-4, 1], [0, 1], [-2, 8], [4, -1], [0, -1]]);
                        c.fill();
                    });
                    scale = 1 + Math.sin(t * 7) * 0.1;
                    break;
                case 'freeze':
                    s = this.sprite('freeze', 18, c => {
                        c.shadowColor = '#9ff4ff';
                        c.shadowBlur = 10;
                        c.strokeStyle = '#9ff4ff';
                        c.lineWidth = 2.5;
                        c.lineCap = 'round';
                        for (let i = 0; i < 3; i++) {
                            const a = (i / 3) * Math.PI;
                            c.beginPath();
                            c.moveTo(Math.cos(a) * -9, Math.sin(a) * -9);
                            c.lineTo(Math.cos(a) * 9, Math.sin(a) * 9);
                            c.stroke();
                        }
                    });
                    rot = t;
                    break;
                case 'chest':
                    s = this.sprite(`chest|${pk.boss ? 1 : 0}`, 30, c => {
                        const col = pk.boss ? '#ffd36b' : '#3df2ff';
                        c.shadowColor = col;
                        c.shadowBlur = 16;
                        c.fillStyle = 'rgba(20, 10, 40, 0.95)';
                        c.strokeStyle = col;
                        c.lineWidth = 2.5;
                        c.beginPath();
                        c.rect(-14, -9, 28, 20);
                        c.fill();
                        c.stroke();
                        c.beginPath();
                        c.rect(-15, -14, 30, 7);
                        c.fill();
                        c.stroke();
                        c.shadowBlur = 0;
                        c.fillStyle = col;
                        c.fillRect(-3, -10, 6, 8);
                    });
                    scale = 1 + Math.sin(t * 4) * 0.06;
                    this.beacon(pk.x, pk.y, pk.boss ? '#ffd36b' : '#3df2ff');
                    break;
                case 'relic':
                    s = this.sprite('relic', 28, c => {
                        c.shadowColor = '#ff9cf6';
                        c.shadowBlur = 16;
                        c.strokeStyle = '#ff9cf6';
                        c.lineWidth = 2.5;
                        regular(c, 6, 15, Math.PI / 6);
                        c.fillStyle = 'rgba(30, 6, 40, 0.9)';
                        c.fill();
                        c.stroke();
                        c.shadowBlur = 0;
                        starPath(c, 4, 8, 3);
                        c.fillStyle = '#ffffff';
                        c.fill();
                    });
                    rot = t * 0.8;
                    this.beacon(pk.x, pk.y, '#ff9cf6');
                    break;
                default:
                    continue;
            }
            this.blit(s, pk.x, pk.y, rot, 1, scale);
        }
        this.ctx.globalAlpha = 1;
    }

    beacon(x, y, color) {
        const c = this.ctx;
        this.worldTransform();
        c.globalCompositeOperation = 'lighter';
        const gr = c.createLinearGradient(x, y - 140, x, y);
        gr.addColorStop(0, hexA(color, 0));
        gr.addColorStop(1, hexA(color, 0.35 + Math.sin(this.time * 4) * 0.1));
        c.fillStyle = gr;
        c.globalAlpha = 1;
        c.fillRect(x - 8, y - 140, 16, 140);
        c.globalCompositeOperation = 'source-over';
    }

    drawEnemies(g) {
        const t = this.time;
        const c = this.ctx;
        for (const e of g.enemies) {
            if (!e.alive) continue;
            if (e.x + e.r < this.vx0 || e.x - e.r > this.vx1 || e.y + e.r < this.vy0 || e.y - e.r > this.vy1) continue;
            const shape = e.def.shape;
            let rot = DIRECTIONAL.has(shape) ? e.ang : t * (e.boss ? 0.4 : 1.2) + e.seed;
            if (shape === 'skull' || shape === 'crate') rot = 0;
            if (e.ai === 'charger' && e.state === 1) rot = e.ang;
            let alpha = e.ai === 'ghost' ? 0.75 : 1;
            if (e.ai === 'phaser' && e.state === 1) alpha = 0.3 + 0.3 * Math.sin(t * 40);
            let scale = 1;
            if (e.ai === 'bomber' && e.state === 1) scale = 1 + 0.25 * Math.abs(Math.sin(t * 22));
            if (e.boss) scale = 1 + Math.sin(t * 3) * 0.03;
            const s = this.enemySprite(e, false);
            this.blit(s, e.x, e.y, rot, alpha, scale);
            if (e.flash > 0) this.blit(this.enemySprite(e, true), e.x, e.y, rot, Math.min(1, e.flash * 10) * 0.85, scale);
            if (e.freezeT > 0 || (g.freezeT > 0 && !e.def.purger)) {
                this.worldTransform();
                c.globalAlpha = 0.45;
                c.fillStyle = '#9ff4ff';
                c.beginPath();
                c.arc(e.x, e.y, e.r * 1.05, 0, TAU);
                c.fill();
            } else if (e.slowT > 0) {
                this.worldTransform();
                c.globalAlpha = 0.5;
                c.strokeStyle = '#9ff4ff';
                c.lineWidth = 1.5 / this.scale;
                c.beginPath();
                c.arc(e.x, e.y, e.r + 3, 0, TAU);
                c.stroke();
            }
            if (e.ai === 'bomber' && e.state === 1) {
                this.worldTransform();
                c.globalAlpha = 0.15 + 0.15 * Math.abs(Math.sin(t * 22));
                c.fillStyle = e.def.color;
                c.beginPath();
                c.arc(e.x, e.y, e.def.blast * (e.elite ? 1.5 : 1), 0, TAU);
                c.fill();
            }
            if ((e.elite || (e.boss && !e.def.purger)) && e.hp < e.maxHp) {
                this.worldTransform();
                const w = e.r * 2, y = e.y - e.r - 10;
                c.globalAlpha = 0.85;
                c.fillStyle = 'rgba(0,0,0,0.6)';
                c.fillRect(e.x - w / 2, y, w, 4);
                c.fillStyle = e.boss ? e.def.color : '#ffd36b';
                c.fillRect(e.x - w / 2, y, w * clamp(e.hp / e.maxHp, 0, 1), 4);
            }
            if (e.def.purger) {
                this.worldTransform();
                c.globalCompositeOperation = 'lighter';
                const gr = c.createRadialGradient(e.x, e.y, 0, e.x, e.y, e.r * 3);
                gr.addColorStop(0, 'rgba(255,255,255,0.25)');
                gr.addColorStop(1, 'rgba(255,45,85,0)');
                c.globalAlpha = 1;
                c.fillStyle = gr;
                c.beginPath();
                c.arc(e.x, e.y, e.r * 3, 0, TAU);
                c.fill();
                c.globalCompositeOperation = 'source-over';
            }
        }
        c.globalAlpha = 1;
    }

    drawWeaponsUnder(g) {
        const c = this.ctx;
        const p = g.player;
        this.worldTransform();
        for (const w of p.weapons) {
            if (w.def.behavior === 'nova' && w.data.R) {
                const R = w.data.R;
                const pulse = w.data.pulse || 0;
                c.globalCompositeOperation = 'lighter';
                const gr = c.createRadialGradient(p.x, p.y, R * 0.2, p.x, p.y, R);
                gr.addColorStop(0, hexA(w.def.color, 0.02));
                gr.addColorStop(0.85, hexA(w.def.color, 0.12 + pulse * 0.6));
                gr.addColorStop(1, hexA(w.def.color, 0));
                c.globalAlpha = 1;
                c.fillStyle = gr;
                c.beginPath();
                c.arc(p.x, p.y, R, 0, TAU);
                c.fill();
                c.strokeStyle = w.def.color;
                c.globalAlpha = 0.35 + pulse;
                c.lineWidth = 1.5 / this.scale;
                c.beginPath();
                c.arc(p.x, p.y, R, 0, TAU);
                c.stroke();
                c.globalCompositeOperation = 'source-over';
            }
            if (w.def.behavior === 'drone' && w.data.drones) {
                const color = w.def.color;
                const s = this.sprite(`drone|${color}`, 14, cc => {
                    cc.shadowColor = color;
                    cc.shadowBlur = 8;
                    polyPath(cc, [[8, 0], [-5, 5], [-2, 0], [-5, -5]]);
                    cc.fillStyle = 'rgba(10,4,24,0.9)';
                    cc.fill();
                    cc.strokeStyle = color;
                    cc.lineWidth = 1.8;
                    cc.stroke();
                });
                for (const d of w.data.drones) this.blit(s, d.x, d.y, d.ang, 1);
                this.worldTransform();
            }
        }
        c.globalAlpha = 1;
    }

    drawPlayer(g) {
        const p = g.player;
        const c = this.ctx;
        const ship = g.ship;
        if (!p.alive) return;
        // Engine trail
        if (p.moving && Math.random() < 0.8) {
            this.trail(p.x - p.dirX * 12, p.y - p.dirY * 12, ship.color, 2.5, 0.35);
        }
        const blink = p.iframes > 0 && Math.floor(this.time * 30) % 2 === 0;
        const s = this.sprite(`ship|${ship.id}`, 30, cc => {
            const sc = 15;
            const pts = ship.shape.map(([x, y]) => [x * sc, y * sc]);
            cc.shadowColor = ship.color;
            cc.shadowBlur = 14;
            polyPath(cc, pts);
            cc.fillStyle = 'rgba(8, 4, 20, 0.95)';
            cc.fill();
            cc.lineWidth = 2.4;
            cc.lineJoin = 'round';
            cc.strokeStyle = ship.color;
            cc.stroke();
            cc.shadowBlur = 0;
            cc.stroke();
            cc.fillStyle = '#ffffff';
            cc.beginPath();
            cc.arc(2, 0, 3, 0, TAU);
            cc.fill();
        });
        // Flame
        this.worldTransform();
        c.globalCompositeOperation = 'lighter';
        const fl = 8 + Math.random() * 6 + (p.moving ? 6 : 0);
        const bx = p.x - Math.cos(p.angle) * 10, by = p.y - Math.sin(p.angle) * 10;
        const gr = c.createRadialGradient(bx, by, 0, bx, by, fl);
        gr.addColorStop(0, 'rgba(255,255,255,0.9)');
        gr.addColorStop(0.4, hexA(ship.color, 0.6));
        gr.addColorStop(1, hexA(ship.color, 0));
        c.fillStyle = gr;
        c.globalAlpha = 1;
        c.beginPath();
        c.arc(bx, by, fl, 0, TAU);
        c.fill();
        c.globalCompositeOperation = 'source-over';
        this.blit(s, p.x, p.y, p.angle, blink ? 0.35 : 1);

        // Hull bar
        this.worldTransform();
        const frac = clamp(p.hp / g.stats.maxHp, 0, 1);
        const w = 36, y = p.y + 22;
        c.globalAlpha = 0.9;
        c.fillStyle = 'rgba(0,0,0,0.55)';
        c.fillRect(p.x - w / 2 - 1, y - 1, w + 2, 6);
        c.fillStyle = frac > 0.5 ? '#5dff9e' : frac > 0.25 ? '#ffd36b' : '#ff2d55';
        c.fillRect(p.x - w / 2, y, w * frac, 4);
        c.globalAlpha = 1;
    }

    drawProjectiles(g) {
        const c = this.ctx;
        for (const pr of g.projectiles) {
            if (pr.kind === 'zone') continue;
            if (pr.kind !== 'beam' && (pr.x < this.vx0 || pr.x > this.vx1 || pr.y < this.vy0 || pr.y > this.vy1)) continue;
            switch (pr.kind) {
                case 'bolt': {
                    const s = this.glowDot(pr.color, Math.max(2.5, Math.round(pr.r)));
                    this.worldTransform();
                    c.globalAlpha = 0.6;
                    c.strokeStyle = pr.color;
                    c.lineWidth = pr.r * 1.2;
                    c.lineCap = 'round';
                    c.beginPath();
                    c.moveTo(pr.x, pr.y);
                    c.lineTo(pr.x - pr.vx * 0.035, pr.y - pr.vy * 0.035);
                    c.stroke();
                    this.blit(s, pr.x, pr.y, 0, 1);
                    break;
                }
                case 'missile': {
                    const color = pr.color;
                    const s = this.sprite(`missile|${color}`, 12, cc => {
                        cc.shadowColor = color;
                        cc.shadowBlur = 8;
                        cc.fillStyle = color;
                        polyPath(cc, [[8, 0], [-5, 4], [-3, 0], [-5, -4]]);
                        cc.fill();
                    });
                    this.blit(s, pr.x, pr.y, pr.ang, 1);
                    if (Math.random() < 0.7) this.trail(pr.x, pr.y, '#ff8a3d', 2, 0.3);
                    break;
                }
                case 'orbit': {
                    const color = pr.color;
                    const r = Math.round(pr.r);
                    const s = this.sprite(`orb|${color}|${r}`, r * 2.2, cc => {
                        cc.shadowColor = color;
                        cc.shadowBlur = r;
                        polyPath(cc, [[r * 1.3, 0], [0, r * 0.6], [-r * 1.3, 0], [0, -r * 0.6]]);
                        cc.fillStyle = color;
                        cc.fill();
                        cc.shadowBlur = 0;
                        polyPath(cc, [[r * 0.8, 0], [0, r * 0.3], [-r * 0.8, 0], [0, -r * 0.3]]);
                        cc.fillStyle = '#ffffff';
                        cc.fill();
                    });
                    const a = Math.atan2(pr.y - g.player.y, pr.x - g.player.x) + Math.PI / 2;
                    this.blit(s, pr.x, pr.y, a, Math.min(1, pr.life * 4));
                    break;
                }
                case 'blade': {
                    const color = pr.color;
                    const r = Math.round(pr.r);
                    const s = this.sprite(`blade|${color}|${r}`, r * 1.8, cc => {
                        cc.shadowColor = color;
                        cc.shadowBlur = r * 0.7;
                        starPath(cc, 4, r, r * 0.28);
                        cc.fillStyle = color;
                        cc.fill();
                        cc.shadowBlur = 0;
                        cc.beginPath();
                        cc.arc(0, 0, r * 0.18, 0, TAU);
                        cc.fillStyle = '#ffffff';
                        cc.fill();
                    });
                    this.blit(s, pr.x, pr.y, pr.spin, 1);
                    break;
                }
                case 'shard': {
                    const color = pr.color;
                    const r = Math.round(pr.r);
                    const s = this.sprite(`shard|${color}|${r}`, r * 2, cc => {
                        cc.shadowColor = color;
                        cc.shadowBlur = r * 0.8;
                        polyPath(cc, [[r * 1.3, 0], [-r * 0.6, r * 0.7], [-r * 0.3, 0], [-r * 0.6, -r * 0.7]]);
                        cc.fillStyle = color;
                        cc.fill();
                    });
                    this.blit(s, pr.x, pr.y, pr.rot, 1);
                    break;
                }
                case 'shell': {
                    const s = this.glowDot(pr.color, 4);
                    this.blit(s, pr.x, pr.y - (pr.h || 0), 0, 1);
                    break;
                }
                case 'beam': {
                    this.worldTransform();
                    const x1 = pr.x + Math.cos(pr.ang) * pr.len, y1 = pr.y + Math.sin(pr.ang) * pr.len;
                    const fade = Math.min(1, pr.life / 0.12, (pr.max - pr.life) / 0.05 + 0.3);
                    const flick = 0.85 + Math.random() * 0.15;
                    c.lineCap = 'round';
                    c.globalAlpha = 0.35 * fade;
                    c.strokeStyle = pr.color;
                    c.lineWidth = pr.width * 2.4 * flick;
                    c.beginPath();
                    c.moveTo(pr.x, pr.y);
                    c.lineTo(x1, y1);
                    c.stroke();
                    c.globalAlpha = 0.8 * fade;
                    c.lineWidth = pr.width;
                    c.stroke();
                    c.globalAlpha = fade;
                    c.strokeStyle = '#ffffff';
                    c.lineWidth = pr.width * 0.35;
                    c.stroke();
                    break;
                }
                case 'ring': {
                    this.worldTransform();
                    const k = pr.cur / pr.R;
                    c.globalAlpha = (1 - k) * 0.9;
                    c.strokeStyle = pr.color;
                    c.lineWidth = (10 - k * 6);
                    c.beginPath();
                    c.arc(pr.x, pr.y, pr.cur, 0, TAU);
                    c.stroke();
                    c.globalAlpha = (1 - k) * 0.5;
                    c.strokeStyle = '#ffffff';
                    c.lineWidth = 2;
                    c.stroke();
                    break;
                }
            }
        }
        c.globalAlpha = 1;
    }

    drawFx(g) {
        const c = this.ctx;
        this.worldTransform();
        for (const f of g.fx) {
            const k = f.age / f.life;
            switch (f.kind) {
                case 'lash': {
                    c.globalAlpha = (1 - k) * 0.9;
                    const W = f.w, H = f.h;
                    const x0 = f.x, dir = f.side;
                    const grd = c.createLinearGradient(x0, 0, x0 + dir * W, 0);
                    grd.addColorStop(0, hexA(f.color, 0.1));
                    grd.addColorStop(0.7, hexA(f.color, 0.8));
                    grd.addColorStop(1, hexA('#ffffff', 0.9));
                    c.fillStyle = grd;
                    c.beginPath();
                    c.moveTo(x0, f.y);
                    c.quadraticCurveTo(x0 + dir * W * 0.5, f.y - H * (1.1 - k * 0.5), x0 + dir * W, f.y - H * 0.1);
                    c.quadraticCurveTo(x0 + dir * W * 0.55, f.y + H * 0.15, x0, f.y + H * 0.2);
                    c.closePath();
                    c.fill();
                    break;
                }
                case 'lightning': {
                    c.globalAlpha = 1 - k;
                    c.strokeStyle = f.color;
                    c.lineWidth = f.width * 2.2;
                    c.lineJoin = 'round';
                    c.beginPath();
                    f.pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
                    c.stroke();
                    c.strokeStyle = '#ffffff';
                    c.lineWidth = f.width * 0.7;
                    c.stroke();
                    break;
                }
                case 'explosion': {
                    c.globalAlpha = (1 - k) * 0.8;
                    const r = f.r * (0.4 + k * 0.7);
                    const gr = c.createRadialGradient(f.x, f.y, 0, f.x, f.y, r);
                    gr.addColorStop(0, 'rgba(255,255,255,0.9)');
                    gr.addColorStop(0.35, hexA(f.color, 0.7));
                    gr.addColorStop(1, hexA(f.color, 0));
                    c.fillStyle = gr;
                    c.beginPath();
                    c.arc(f.x, f.y, r, 0, TAU);
                    c.fill();
                    break;
                }
                case 'shockwave': {
                    c.globalAlpha = (1 - k) * 0.8;
                    c.strokeStyle = f.color;
                    c.lineWidth = 8 * (1 - k) + 1;
                    c.beginPath();
                    c.arc(f.x, f.y, f.r * (0.1 + k * 0.9), 0, TAU);
                    c.stroke();
                    break;
                }
                case 'tele': {
                    c.globalAlpha = 0.25 + 0.25 * Math.sin(this.time * 30);
                    c.fillStyle = f.color;
                    c.save();
                    c.translate(f.x, f.y);
                    c.rotate(f.ang);
                    c.fillRect(0, -f.w / 2, f.len, f.w);
                    c.restore();
                    break;
                }
                case 'blink': {
                    c.globalAlpha = 1 - k;
                    c.strokeStyle = f.color;
                    c.lineWidth = 2;
                    c.beginPath();
                    c.arc(f.x, f.y, f.r * (1 - k * 0.6), 0, TAU);
                    c.stroke();
                    break;
                }
            }
        }
        c.globalAlpha = 1;
    }

    drawParticles(dt) {
        const c = this.ctx;
        this.worldTransform();
        let j = 0;
        const list = this.particles;
        for (let i = 0; i < list.length; i++) {
            const pt = list[i];
            pt.life -= dt;
            if (pt.life <= 0) continue;
            list[j++] = pt;
            const k = pt.life / pt.max;
            if (pt.kind === 'ring') {
                c.globalAlpha = k * 0.8;
                c.strokeStyle = pt.color;
                c.lineWidth = 3 * k + 1;
                c.beginPath();
                c.arc(pt.x, pt.y, pt.size * (1 - k) + 6, 0, TAU);
                c.stroke();
                continue;
            }
            pt.x += pt.vx * dt;
            pt.y += pt.vy * dt;
            const drag = Math.exp(-4 * dt);
            pt.vx *= drag;
            pt.vy *= drag;
            if (pt.x < this.vx0 || pt.x > this.vx1 || pt.y < this.vy0 || pt.y > this.vy1) continue;
            c.globalAlpha = k;
            c.fillStyle = pt.color;
            const s = pt.size * (pt.kind === 'dot' ? k : 1);
            c.fillRect(pt.x - s / 2, pt.y - s / 2, s, s);
        }
        list.length = j;
        c.globalAlpha = 1;
    }

    drawBullets(g) {
        for (const b of g.bullets) {
            if (b.x < this.vx0 || b.x > this.vx1 || b.y < this.vy0 || b.y > this.vy1) continue;
            const s = this.sprite(`bullet|${b.color}|${b.r}`, b.r * 2.6, c => {
                const gr = c.createRadialGradient(0, 0, 0, 0, 0, b.r * 2.4);
                gr.addColorStop(0, '#ffffff');
                gr.addColorStop(0.35, '#ffffff');
                gr.addColorStop(0.5, b.color);
                gr.addColorStop(1, hexA(b.color, 0));
                c.fillStyle = gr;
                c.beginPath();
                c.arc(0, 0, b.r * 2.4, 0, TAU);
                c.fill();
            });
            this.blit(s, b.x, b.y, 0, 1);
        }
        this.ctx.globalAlpha = 1;
    }

    drawNumbers(dt) {
        if (!this.nums.length) return;
        const c = this.ctx;
        this.worldTransform();
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        let j = 0;
        for (let i = 0; i < this.nums.length; i++) {
            const n = this.nums[i];
            n.life -= dt;
            if (n.life <= 0) continue;
            this.nums[j++] = n;
            n.y += n.vy * dt;
            n.vy *= Math.exp(-3 * dt);
            const k = n.life / n.max;
            c.globalAlpha = Math.min(1, k * 2);
            const size = n.crit ? 15 : 11;
            c.font = `800 ${size}px system-ui, sans-serif`;
            c.lineWidth = 3;
            c.strokeStyle = 'rgba(0,0,0,0.7)';
            const txt = String(Math.max(1, Math.round(n.v)));
            c.strokeText(txt, n.x, n.y);
            c.fillStyle = n.crit ? '#ffd36b' : '#ffffff';
            c.fillText(txt, n.x, n.y);
        }
        this.nums.length = j;
        c.globalAlpha = 1;
    }

    drawIndicators(g) {
        const c = this.ctx;
        const p = g.player;
        const targets = [];
        for (const b of g.bosses) if (b.alive) targets.push([b.x, b.y, b.def.purger ? '#ffffff' : b.def.color, b.r]);
        for (const pk of g.pickups) if (pk.kind === 'chest' || pk.kind === 'relic') targets.push([pk.x, pk.y, pk.kind === 'relic' ? '#ff9cf6' : pk.boss ? '#ffd36b' : '#3df2ff', 0]);
        if (!targets.length) return;
        c.setTransform(1, 0, 0, 1, 0, 0);
        const W = this.canvas.width, H = this.canvas.height, k = this.viewK;
        const m = 26 * this.dpr;
        for (const [x, y, color, r] of targets) {
            const sx = (x - p.x) * k + W / 2, sy = (y - p.y) * k + H / 2;
            if (sx > -r * k && sx < W + r * k && sy > -r * k && sy < H + r * k) continue;
            const ang = Math.atan2(sy - H / 2, sx - W / 2);
            const cx = clamp(sx, m, W - m), cy = clamp(sy, m, H - m);
            c.save();
            c.translate(cx, cy);
            c.rotate(ang);
            c.globalAlpha = 0.75 + 0.25 * Math.sin(this.time * 6);
            c.fillStyle = color;
            c.shadowColor = color;
            c.shadowBlur = 10 * this.dpr;
            const s = 10 * this.dpr;
            c.beginPath();
            c.moveTo(s, 0);
            c.lineTo(-s * 0.7, s * 0.7);
            c.lineTo(-s * 0.3, 0);
            c.lineTo(-s * 0.7, -s * 0.7);
            c.closePath();
            c.fill();
            c.restore();
        }
        c.globalAlpha = 1;
    }

    drawOverlay(g, dt) {
        const c = this.ctx;
        const W = this.canvas.width, H = this.canvas.height;
        c.setTransform(1, 0, 0, 1, 0, 0);
        // Vignette
        const v = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.35, W / 2, H / 2, Math.max(W, H) * 0.75);
        v.addColorStop(0, 'rgba(0,0,0,0)');
        v.addColorStop(1, 'rgba(0,0,0,0.55)');
        c.globalAlpha = 1;
        c.fillStyle = v;
        c.fillRect(0, 0, W, H);

        const p = g.player;
        const low = p.alive && p.hp < g.stats.maxHp * 0.3;
        if (this.hurt > 0 || low) {
            const a = Math.max(this.hurt * 1.4, low ? 0.25 + 0.15 * Math.sin(this.time * 6) : 0);
            const hv = c.createRadialGradient(W / 2, H / 2, Math.min(W, H) * 0.3, W / 2, H / 2, Math.max(W, H) * 0.7);
            hv.addColorStop(0, 'rgba(255,45,85,0)');
            hv.addColorStop(1, `rgba(255,45,85,${clamp(a, 0, 0.7)})`);
            c.fillStyle = hv;
            c.fillRect(0, 0, W, H);
            this.hurt = Math.max(0, this.hurt - dt);
        }
        if (g.freezeT > 0) {
            c.globalAlpha = Math.min(0.18, g.freezeT * 0.1);
            c.fillStyle = '#9ff4ff';
            c.fillRect(0, 0, W, H);
        }
        if (this.flash > 0) {
            c.globalAlpha = Math.min(0.7, this.flash);
            c.fillStyle = this.flashColor;
            c.fillRect(0, 0, W, H);
            this.flash = Math.max(0, this.flash - dt * 1.6);
        }
        // Countdown tint in the last 30 seconds
        const left = RUN_LENGTH - g.time;
        if (!g.cleared && left < 30 && left > 0) {
            c.globalAlpha = 0.05 + 0.05 * Math.sin(this.time * 8);
            c.fillStyle = '#ff2d55';
            c.fillRect(0, 0, W, H);
        }
        c.globalAlpha = 1;
    }
}

// '#rrggbb' + alpha -> 'rgba(...)'
const hexCache = new Map();
export function hexA(hex, a) {
    const key = hex + a.toFixed(2);
    let v = hexCache.get(key);
    if (v) return v;
    const n = parseInt(hex.slice(1), 16);
    v = `rgba(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255}, ${a.toFixed(2)})`;
    if (hexCache.size < 4000) hexCache.set(key, v);
    return v;
}
