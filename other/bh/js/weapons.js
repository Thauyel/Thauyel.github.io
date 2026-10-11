// Weapon behaviours (one per weapon family, shared with its evolution) and
// player-projectile physics.

import {TAU, dist2, segDist2} from './util.js';

const MAX_R = 70; // must cover the largest enemy radius (see game.js MAX_ENEMY_R)
const Q = []; // scratch list for grid queries made from this module

// Counts down the weapon cooldown and calls fire() when ready. fire() returns
// false when it had nothing to shoot at, which retries shortly.
function cooldown(g, w, s, dt, fire) {
    w.cdT -= dt;
    if (w.cdT > 0) return;
    if (fire() === false) {
        w.cdT = 0.12;
        return;
    }
    w.cdT += s.cd;
    if (w.cdT < 0) w.cdT = s.cd * 0.5;
    g.events.push({type: 'shoot', id: w.def.behavior});
    if (g.player.relics.includes('echo') && g.rng.chance(0.15)) g.schedule(0.15, fire);
}

function angleTo(p, t) {
    return Math.atan2(t.y - p.y, t.x - p.x);
}

function pushBolt(g, w, s, x, y, ang, extra = {}) {
    const sp = extra.speed || s.speed;
    g.projectiles.push({
        kind: 'bolt', x, y, vx: Math.cos(ang) * sp, vy: Math.sin(ang) * sp,
        r: (extra.r || 5) * s.area, dmg: extra.dmg ?? s.dmg, pierce: extra.pierce ?? (s.pierce || 1),
        life: extra.life ?? (s.duration || 1.4), src: w, color: extra.color || w.def.color,
        hit: new Set(), kb: s.knock || 1, style: extra.style || 'bolt',
    });
}

// ------------------------------------------------------------------ behaviours

export const BEHAVIORS = {
    pulse(g, w, s, dt) {
        cooldown(g, w, s, dt, () => {
            const p = g.player;
            const target = g.nearestEnemy(p.x, p.y, 760);
            if (!target) return false;
            const n = s.amount;
            if (s.volley) {
                const base = angleTo(p, target);
                for (let i = 0; i < n; i++) pushBolt(g, w, s, p.x, p.y, base + (i - (n - 1) / 2) * 0.08);
            } else {
                for (let i = 0; i < n; i++) {
                    g.schedule(i * s.interval, () => {
                        const t = g.nearestEnemy(p.x, p.y, 760) || target;
                        pushBolt(g, w, s, p.x, p.y, angleTo(p, t) + (i ? g.rng.float(-0.05, 0.05) : 0));
                    });
                }
            }
        });
    },

    lash(g, w, s, dt) {
        cooldown(g, w, s, dt, () => {
            const p = g.player;
            const offsets = [0, 0, -30, -30, 30, 30, -60, -60, 60, 60];
            const face = p.faceX;
            for (let i = 0; i < s.amount; i++) {
                g.schedule(i * s.interval, () => sweep(g, w, s, i % 2 === 0 ? face : -face, offsets[i % offsets.length]));
            }
        });
    },

    missile(g, w, s, dt) {
        cooldown(g, w, s, dt, () => {
            const p = g.player;
            const targets = g.nearestEnemies(p.x, p.y, s.amount, 820);
            if (!targets.length) return false;
            for (let i = 0; i < s.amount; i++) {
                const t = targets[i % targets.length];
                const spread = (i - (s.amount - 1) / 2) * 0.5;
                const a = angleTo(p, t) + Math.PI + spread * 0.8 + g.rng.float(-0.2, 0.2);
                g.projectiles.push({
                    kind: 'missile', x: p.x, y: p.y, ang: a, v: s.speed * 0.45, vmax: s.speed * 1.7,
                    turn: s.turn, target: t, life: s.duration, src: w, color: w.def.color,
                    dmg: s.dmg, blast: s.blast * s.area, cluster: s.cluster || 0, trail: 0,
                });
            }
        });
    },

    orbit(g, w, s, dt) {
        const d = w.data;
        d.ang = (d.ang || 0) + 3.0 * s.speed * dt;
        d.live = 0;
        for (const pr of g.projectiles) if (pr.src === w && pr.kind === 'orbit' && !pr.dead) d.live++;
        if (s.permanent) {
            if (d.live !== s.amount) {
                for (const pr of g.projectiles) if (pr.src === w && pr.kind === 'orbit') pr.dead = true;
                spawnOrbit(g, w, s, Infinity);
            }
            return;
        }
        if (d.live > 0) return; // cooldown starts when the shards expire
        cooldown(g, w, s, dt, () => spawnOrbit(g, w, s, s.duration));
    },

    arc(g, w, s, dt) {
        cooldown(g, w, s, dt, () => {
            const p = g.player;
            if (!g.randomEnemy(p.x, p.y, s.range)) return false;
            for (let i = 0; i < s.amount; i++) g.schedule(i * 0.07, () => strike(g, w, s));
        });
    },

    blade(g, w, s, dt) {
        cooldown(g, w, s, dt, () => {
            const p = g.player;
            const first = g.nearestEnemy(p.x, p.y, 700);
            const baseAng = first ? angleTo(p, first) : Math.atan2(p.dirY, p.dirX);
            for (let i = 0; i < s.amount; i++) {
                g.schedule(i * s.interval, () => {
                    const t = i === 0 ? null : g.randomEnemy(p.x, p.y, 520);
                    const a = t ? angleTo(p, t) : baseAng + (i ? g.rng.float(-0.6, 0.6) : 0);
                    g.projectiles.push({
                        kind: 'blade', x: p.x, y: p.y, dx: Math.cos(a), dy: Math.sin(a),
                        v: s.speed, decel: s.speed / 0.9, life: s.duration, r: 14 * s.area,
                        dmg: s.dmg, src: w, color: w.def.color, hitMap: new Map(), hitCd: 0.35, kb: s.knock, spin: 0,
                    });
                });
            }
        });
    },

    nova(g, w, s, dt) {
        const p = g.player;
        const d = w.data;
        d.R = s.radius * s.area * (1 + (d.growth || 0));
        d.t = (d.t ?? 0.2) - dt;
        d.pulse = Math.max(0, (d.pulse || 0) - dt);
        if (d.t > 0) return;
        d.t = s.cd;
        d.pulse = 0.25;
        g.forEnemiesInCircle(p.x, p.y, d.R, e => {
            const dx = e.x - p.x, dy = e.y - p.y, dd = Math.hypot(dx, dy) || 1;
            g.hitEnemy(e, s.dmg, w, dx / dd, dy / dd, s.knock * 0.5);
        });
    },

    mine(g, w, s, dt) {
        cooldown(g, w, s, dt, () => {
            const p = g.player;
            for (let i = 0; i < s.amount; i++) {
                const t = g.randomEnemy(p.x, p.y, 320);
                let x, y;
                if (t && i % 2 === 0) {
                    x = t.x;
                    y = t.y;
                } else {
                    const a = g.rng.angle(), r = g.rng.float(60, 230);
                    x = p.x + Math.cos(a) * r;
                    y = p.y + Math.sin(a) * r;
                }
                g.projectiles.push({kind: 'shell', x: p.x, y: p.y, x0: p.x, y0: p.y, x1: x, y1: y, t: 0, T: 0.4 + i * 0.05, src: w, color: w.def.color, s});
            }
        });
    },

    laser(g, w, s, dt) {
        cooldown(g, w, s, dt, () => {
            const p = g.player;
            const len = s.length * s.speed;
            const width = s.width * s.area;
            if (s.rotate) {
                const base = g.rng.angle();
                for (let i = 0; i < s.amount; i++) {
                    g.projectiles.push(makeBeam(w, s, base + (i / s.amount) * TAU, len, width, s.rotate));
                }
                return;
            }
            const first = g.nearestEnemy(p.x, p.y, len);
            if (!first) return false;
            for (let i = 0; i < s.amount; i++) {
                g.schedule(i * s.interval, () => {
                    const t = i === 0 ? (first.alive ? first : g.nearestEnemy(p.x, p.y, len)) : g.randomEnemy(p.x, p.y, len);
                    if (!t) return;
                    g.projectiles.push(makeBeam(w, s, angleTo(p, t), len, width, 0));
                });
            }
        });
    },

    drone(g, w, s, dt) {
        const p = g.player;
        const d = w.data;
        if (!d.drones) d.drones = [];
        while (d.drones.length < s.amount) d.drones.push({x: p.x, y: p.y, t: 0.3 + d.drones.length * 0.17, ang: 0});
        if (d.drones.length > s.amount) d.drones.length = s.amount;
        const n = d.drones.length;
        const R = s.radius * Math.sqrt(s.area);
        for (let i = 0; i < n; i++) {
            const dr = d.drones[i];
            const a = g.time * 1.3 + (i / n) * TAU;
            const tx = p.x + Math.cos(a) * R, ty = p.y + Math.sin(a) * R;
            const k = 1 - Math.exp(-8 * dt);
            dr.x += (tx - dr.x) * k;
            dr.y += (ty - dr.y) * k;
            dr.t -= dt;
            if (dr.t > 0) continue;
            const t = g.nearestEnemy(dr.x, dr.y, s.range);
            if (!t) {
                dr.t = 0.15;
                continue;
            }
            dr.t = s.cd;
            dr.ang = Math.atan2(t.y - dr.y, t.x - dr.x);
            const shots = s.spread || 1;
            for (let k2 = 0; k2 < shots; k2++) {
                pushBolt(g, w, s, dr.x, dr.y, dr.ang + (k2 - (shots - 1) / 2) * 0.16, {r: 4, life: 1.3, style: 'drone'});
            }
            g.events.push({type: 'shoot', id: 'drone'});
        }
    },

    shard(g, w, s, dt) {
        cooldown(g, w, s, dt, () => {
            const p = g.player;
            for (let i = 0; i < s.amount; i++) {
                g.schedule(i * s.interval, () => {
                    g.projectiles.push({
                        kind: 'shard', x: p.x, y: p.y,
                        vx: g.rng.float(-150, 150) + p.faceX * 50, vy: -g.rng.float(380, 470) * s.speed,
                        grav: 820 * s.speed, r: 11 * s.area, dmg: s.dmg, pierce: s.pierce, life: s.duration,
                        src: w, color: w.def.color, hit: new Set(), kb: s.knock, rot: 0, frag: s.frag || 0,
                    });
                });
            }
        });
    },

    cryo(g, w, s, dt) {
        cooldown(g, w, s, dt, () => {
            const p = g.player;
            for (let i = 0; i < s.amount; i++) {
                g.schedule(i * s.interval, () => {
                    g.projectiles.push({
                        kind: 'ring', x: p.x, y: p.y, cur: 8, R: s.radius * s.area, speed: 330 * s.speed,
                        hit: new Set(), dmg: s.dmg, slow: s.slow, slowT: s.slowT * g.stats.duration, freeze: !!s.freeze,
                        src: w, color: w.def.color, kb: s.knock,
                    });
                });
            }
        });
    },
};

// Called before a weapon instance changes into its evolution.
export function onWeaponRemoved(g, w) {
    for (const pr of g.projectiles) if (pr.src === w && pr.kind === 'orbit') pr.dead = true;
}

// ------------------------------------------------------------------ helpers

function sweep(g, w, s, side, yo) {
    const p = g.player;
    const W = s.w * s.area, H = s.h * s.area;
    const x0 = side > 0 ? p.x : p.x - W, x1 = side > 0 ? p.x + W : p.x;
    const cy = p.y + yo, y0 = cy - H / 2, y1 = cy + H / 2;
    g.spawnFx({kind: 'lash', x: p.x, y: cy, side, w: W, h: H, life: 0.2, color: w.def.color});
    const list = g.grid.query((x0 + x1) / 2, cy, W / 2 + MAX_R, Q);
    for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.alive) continue;
        const nx = Math.max(x0, Math.min(e.x, x1)), ny = Math.max(y0, Math.min(e.y, y1));
        if (dist2(nx, ny, e.x, e.y) < e.r * e.r) g.hitEnemy(e, s.dmg, w, side, 0, s.knock);
    }
}

function spawnOrbit(g, w, s, life) {
    for (let i = 0; i < s.amount; i++) {
        g.projectiles.push({
            kind: 'orbit', idx: i, n: s.amount, x: g.player.x, y: g.player.y, r: 11 * s.area,
            life, src: w, color: w.def.color, hitMap: new Map(), hitCd: s.hitCd, kb: s.knock,
        });
    }
}

function strike(g, w, s) {
    const p = g.player;
    const t = g.randomEnemy(p.x, p.y, s.range);
    if (!t) return;
    const R = 24 * s.area;
    g.spawnFx({kind: 'lightning', pts: jagged(t.x + g.rng.float(-40, 40), t.y - 320, t.x, t.y, g), life: 0.22, color: w.def.color, width: 3});
    g.spawnFx({kind: 'explosion', x: t.x, y: t.y, r: R * 1.4, life: 0.25, color: w.def.color});
    const hitSet = new Set();
    g.forEnemiesInCircle(t.x, t.y, R, e => {
        hitSet.add(e.id);
        g.hitEnemy(e, s.dmg, w, 0, 0, 0);
    });
    if (s.field) {
        g.projectiles.push({
            kind: 'zone', style: 'static', x: t.x, y: t.y, r: 40 * s.area, life: 1.5, max: 1.5, tick: 0.3, tickT: 0.3,
            dmg: s.dmg * 0.3, src: w, color: w.def.color, slow: 0,
        });
    }
    hitSet.add(t.id);
    let cur = t;
    let dmg = s.dmg;
    for (let c = 0; c < s.chain; c++) {
        const next = g.nearestEnemy(cur.x, cur.y, s.chainRange * s.area, hitSet);
        if (!next) break;
        dmg *= 0.85;
        g.spawnFx({kind: 'lightning', pts: jagged(cur.x, cur.y, next.x, next.y, g), life: 0.18, color: w.def.color, width: 2});
        hitSet.add(next.id);
        g.hitEnemy(next, dmg, w, 0, 0, 0);
        cur = next;
    }
}

function jagged(x0, y0, x1, y1, g) {
    const pts = [[x0, y0]];
    const n = 6;
    const dx = x1 - x0, dy = y1 - y0, len = Math.hypot(dx, dy) || 1;
    const px = -dy / len, py = dx / len;
    for (let i = 1; i < n; i++) {
        const t = i / n, off = g.rng.float(-1, 1) * Math.min(26, len * 0.12);
        pts.push([x0 + dx * t + px * off, y0 + dy * t + py * off]);
    }
    pts.push([x1, y1]);
    return pts;
}

function makeBeam(w, s, ang, len, width, rotate) {
    return {
        kind: 'beam', x: 0, y: 0, ang, len, width, life: s.duration, max: s.duration, rotate,
        tick: s.tick, dmg: s.dmg, src: w, color: w.def.color, hitMap: new Map(), follow: true,
    };
}

// ------------------------------------------------------------------ projectiles

function collideList(g, pr) {
    const list = g.grid.query(pr.x, pr.y, pr.r + MAX_R, Q);
    for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.alive || pr.hit.has(e.id)) continue;
        const rr = pr.r + e.r;
        if (dist2(pr.x, pr.y, e.x, e.y) >= rr * rr) continue;
        pr.hit.add(e.id);
        const sp = Math.hypot(pr.vx, pr.vy) || 1;
        g.hitEnemy(e, pr.dmg, pr.src, pr.vx / sp, pr.vy / sp, pr.kb);
        if (--pr.pierce <= 0) return true;
    }
    return false;
}

function collideTimed(g, pr) {
    const list = g.grid.query(pr.x, pr.y, pr.r + MAX_R, Q);
    for (let i = 0; i < list.length; i++) {
        const e = list[i];
        if (!e.alive) continue;
        const rr = pr.r + e.r;
        if (dist2(pr.x, pr.y, e.x, e.y) >= rr * rr) continue;
        const next = pr.hitMap.get(e.id);
        if (next !== undefined && next > g.time) continue;
        pr.hitMap.set(e.id, g.time + pr.hitCd);
        const dx = e.x - g.player.x, dy = e.y - g.player.y, d = Math.hypot(dx, dy) || 1;
        g.hitEnemy(e, pr.dmg, pr.src, dx / d, dy / d, pr.kb);
    }
    if (pr.hitMap.size > 300) {
        for (const [id, t] of pr.hitMap) if (t <= g.time) pr.hitMap.delete(id);
    }
}

function fragment(g, pr) {
    const n = pr.frag;
    const w = pr.src;
    for (let i = 0; i < n; i++) {
        const a = (i / n) * TAU + g.rng.float(0, 0.5);
        g.projectiles.push({
            kind: 'bolt', x: pr.x, y: pr.y, vx: Math.cos(a) * 380, vy: Math.sin(a) * 380, r: 5,
            dmg: pr.dmg * 0.4, pierce: 2, life: 0.5, src: w, color: pr.color, hit: new Set(), kb: 1, style: 'frag',
        });
    }
}

export function updateProjectile(g, pr, dt) {
    const p = g.player;
    switch (pr.kind) {
        case 'bolt': {
            pr.x += pr.vx * dt;
            pr.y += pr.vy * dt;
            pr.life -= dt;
            if (pr.life <= 0 || collideList(g, pr)) pr.dead = true;
            break;
        }
        case 'missile': {
            if (!pr.target || !pr.target.alive) pr.target = g.nearestEnemy(pr.x, pr.y, 520);
            if (pr.target) {
                const want = Math.atan2(pr.target.y - pr.y, pr.target.x - pr.x);
                let diff = want - pr.ang;
                while (diff > Math.PI) diff -= TAU;
                while (diff < -Math.PI) diff += TAU;
                const maxTurn = pr.turn * dt;
                pr.ang += Math.max(-maxTurn, Math.min(maxTurn, diff));
            }
            pr.v = Math.min(pr.vmax, pr.v + pr.vmax * 1.6 * dt);
            pr.x += Math.cos(pr.ang) * pr.v * dt;
            pr.y += Math.sin(pr.ang) * pr.v * dt;
            pr.life -= dt;
            let boom = pr.life <= 0;
            if (!boom) {
                const list = g.grid.query(pr.x, pr.y, 8 + MAX_R, Q);
                for (let i = 0; i < list.length; i++) {
                    const e = list[i];
                    if (!e.alive || e.def.purger) continue;
                    const rr = 8 + e.r;
                    if (dist2(pr.x, pr.y, e.x, e.y) < rr * rr) {
                        boom = true;
                        break;
                    }
                }
            }
            if (boom) {
                pr.dead = true;
                g.explode(pr.x, pr.y, pr.blast, pr.dmg, pr.src, pr.color);
                for (let k = 0; k < pr.cluster; k++) {
                    const a = g.rng.angle(), r = g.rng.float(30, 70);
                    const x = pr.x + Math.cos(a) * r, y = pr.y + Math.sin(a) * r;
                    g.schedule(0.12 + k * 0.06, () => g.explode(x, y, pr.blast * 0.6, pr.dmg * 0.5, pr.src, pr.color));
                }
            }
            break;
        }
        case 'orbit': {
            const s = g.weaponStats(pr.src);
            const R = s.radius * s.area;
            const a = (pr.src.data.ang || 0) + (pr.idx / pr.n) * TAU;
            pr.x = p.x + Math.cos(a) * R;
            pr.y = p.y + Math.sin(a) * R;
            pr.dmg = s.dmg;
            pr.life -= dt;
            if (pr.life <= 0) pr.dead = true;
            else collideTimed(g, pr);
            break;
        }
        case 'blade': {
            pr.v -= pr.decel * dt;
            pr.x += pr.dx * pr.v * dt;
            pr.y += pr.dy * pr.v * dt;
            pr.spin += dt * 14;
            pr.life -= dt;
            if (pr.life <= 0) pr.dead = true;
            else collideTimed(g, pr);
            break;
        }
        case 'shard': {
            pr.vy += pr.grav * dt;
            pr.x += pr.vx * dt;
            pr.y += pr.vy * dt;
            pr.rot += dt * 9;
            pr.life -= dt;
            if (pr.life <= 0 || collideList(g, pr)) {
                pr.dead = true;
                if (pr.frag) fragment(g, pr);
            }
            break;
        }
        case 'shell': {
            pr.t += dt;
            const k = Math.min(1, pr.t / pr.T);
            pr.x = pr.x0 + (pr.x1 - pr.x0) * k;
            pr.y = pr.y0 + (pr.y1 - pr.y0) * k;
            pr.h = Math.sin(k * Math.PI) * 50;
            if (k >= 1) {
                pr.dead = true;
                const s = pr.s;
                g.projectiles.push({
                    kind: 'zone', style: 'well', x: pr.x1, y: pr.y1, r: s.radius * s.area, life: s.duration, max: s.duration,
                    tick: s.tick, tickT: 0, dmg: s.dmg, src: pr.src, color: pr.color, slow: 0.25,
                    pull: s.pull || 0, drift: s.drift || 0,
                });
                g.events.push({type: 'mine', x: pr.x1, y: pr.y1});
            }
            break;
        }
        case 'zone': {
            pr.life -= dt;
            if (pr.life <= 0) {
                pr.dead = true;
                break;
            }
            if (pr.drift) {
                const t = g.nearestEnemy(pr.x, pr.y, 400);
                if (t) {
                    const dx = t.x - pr.x, dy = t.y - pr.y, d = Math.hypot(dx, dy) || 1;
                    pr.x += (dx / d) * pr.drift * dt;
                    pr.y += (dy / d) * pr.drift * dt;
                }
            }
            if (pr.pull) {
                const R = pr.r * 1.9;
                const list = g.grid.query(pr.x, pr.y, R + MAX_R, Q);
                for (let i = 0; i < list.length; i++) {
                    const e = list[i];
                    if (!e.alive || e.boss || e.def.crate) continue;
                    const dx = pr.x - e.x, dy = pr.y - e.y, d = Math.hypot(dx, dy);
                    if (d > 4 && d < R) {
                        e.x += (dx / d) * pr.pull * dt * (1 - e.def.kbRes);
                        e.y += (dy / d) * pr.pull * dt * (1 - e.def.kbRes);
                    }
                }
            }
            pr.tickT -= dt;
            if (pr.tickT <= 0) {
                pr.tickT = pr.tick;
                g.forEnemiesInCircle(pr.x, pr.y, pr.r, e => {
                    if (pr.slow && !e.def.purger) {
                        e.slowF = e.slowT > 0 ? Math.max(e.slowF, pr.slow) : pr.slow;
                        e.slowT = Math.max(e.slowT, pr.tick + 0.15);
                    }
                    g.hitEnemy(e, pr.dmg, pr.src, 0, 0, 0, {noRift: true});
                });
            }
            break;
        }
        case 'beam': {
            if (pr.follow) {
                pr.x = p.x;
                pr.y = p.y;
            }
            pr.ang += pr.rotate * dt;
            pr.life -= dt;
            if (pr.life <= 0) {
                pr.dead = true;
                break;
            }
            const x1 = pr.x + Math.cos(pr.ang) * pr.len, y1 = pr.y + Math.sin(pr.ang) * pr.len;
            const half = pr.width / 2;
            const ca = Math.cos(pr.ang), sa = Math.sin(pr.ang);
            for (const e of g.enemies) {
                if (!e.alive) continue;
                const rr = half + e.r;
                if (segDist2(e.x, e.y, pr.x, pr.y, x1, y1) >= rr * rr) continue;
                const next = pr.hitMap.get(e.id);
                if (next !== undefined && next > g.time) continue;
                pr.hitMap.set(e.id, g.time + pr.tick);
                g.hitEnemy(e, pr.dmg, pr.src, ca, sa, 0.5);
            }
            break;
        }
        case 'ring': {
            pr.cur += pr.speed * dt;
            if (pr.cur >= pr.R) {
                pr.dead = true;
                break;
            }
            const list = g.grid.query(pr.x, pr.y, pr.cur + MAX_R, Q);
            for (let i = 0; i < list.length; i++) {
                const e = list[i];
                if (!e.alive || pr.hit.has(e.id)) continue;
                const d = Math.sqrt(dist2(pr.x, pr.y, e.x, e.y));
                if (Math.abs(d - pr.cur) > 14 + e.r) continue;
                pr.hit.add(e.id);
                if ((!e.boss || !pr.freeze) && !e.def.purger) {
                    e.slowF = e.slowT > 0 ? Math.max(e.slowF, Math.min(0.85, pr.slow)) : Math.min(0.85, pr.slow);
                    e.slowT = Math.max(e.slowT, pr.slowT);
                }
                if (pr.freeze && !e.def.purger) {
                    e.freezeT = Math.max(e.freezeT, e.boss ? pr.slowT * 0.25 : pr.slowT);
                    e.shatter = true;
                }
                const dx = e.x - pr.x, dy = e.y - pr.y, dd = d || 1;
                g.hitEnemy(e, pr.dmg, pr.src, dx / dd, dy / dd, pr.kb);
            }
            break;
        }
        default:
            pr.dead = true;
    }
}
