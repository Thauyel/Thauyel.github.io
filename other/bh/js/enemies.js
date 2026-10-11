// Enemy behaviours, boss attack patterns and environmental hazards.

import {TAU, dist2, segDist2} from './util.js';

export function updateEnemy(g, e, dt) {
    const p = g.player;
    const dx = p.x - e.x, dy = p.y - e.y;
    const d = Math.hypot(dx, dy) || 1;
    const nx = dx / d, ny = dy / d;
    const sp = e.speed;

    switch (e.ai) {
        case 'ghost': {
            // Drifts in a lazy sine so a pack of wraiths fans out instead of stacking.
            const w = Math.sin(g.time * 2.2 + e.seed) * 0.9;
            e.vx = (nx - ny * w) * sp;
            e.vy = (ny + nx * w) * sp;
            break;
        }
        case 'chase':
        case 'purger':
            e.vx = nx * sp;
            e.vy = ny * sp;
            break;
        case 'wobble': {
            const w = Math.sin(g.time * 5 + e.seed) * 0.7;
            e.vx = (nx - ny * w) * sp;
            e.vy = (ny + nx * w) * sp;
            break;
        }
        case 'stream':
            e.vx = e.dirx * sp;
            e.vy = e.diry * sp;
            e.life -= dt;
            if (e.life <= 0) e.alive = false;
            break;
        case 'crate':
            e.vx = 0;
            e.vy = 0;
            break;
        case 'ranged':
        case 'caster':
            keepDistance(e, nx, ny, d, e.def.range);
            e.timer -= dt;
            if (e.timer <= 0 && d < e.def.range * 1.7) {
                e.timer = e.def.fire * g.rng.float(0.8, 1.2);
                const a = Math.atan2(dy, dx);
                if (e.ai === 'ranged') {
                    const shots = e.elite ? 3 : 1;
                    for (let i = 0; i < shots; i++) g.fireBullet(e.x, e.y, a + (i - (shots - 1) / 2) * 0.22, 175, e.dmg, 6, e.def.color);
                } else {
                    const n = e.def.burst * (e.elite ? 2 : 1);
                    const off = g.rng.angle();
                    for (let i = 0; i < n; i++) g.fireBullet(e.x, e.y, off + (i / n) * TAU, 135, e.dmg, 6, e.def.color);
                }
                g.events.push({type: 'enemyShot'});
            }
            break;
        case 'charger':
            if (e.state === 0) {
                e.vx = nx * sp;
                e.vy = ny * sp;
                e.timer -= dt;
                if (e.timer <= 0 && d < 300) {
                    e.state = 1;
                    e.timer = 0.6;
                    e.aimx = nx;
                    e.aimy = ny;
                    e.ang = Math.atan2(ny, nx);
                    g.spawnFx({kind: 'tele', x: e.x, y: e.y, ang: e.ang, len: sp * 6.5 * 0.45 + 20, w: e.r * 2, life: 0.6, color: e.def.color});
                }
            } else if (e.state === 1) {
                e.vx = 0;
                e.vy = 0;
                e.timer -= dt;
                if (e.timer <= 0) {
                    e.state = 2;
                    e.timer = 0.45;
                }
            } else {
                e.vx = e.aimx * sp * 6.5;
                e.vy = e.aimy * sp * 6.5;
                e.timer -= dt;
                if (e.timer <= 0) {
                    e.state = 0;
                    e.timer = g.rng.float(1.5, 2.6);
                }
            }
            break;
        case 'bomber':
            if (e.state === 0) {
                e.vx = nx * sp;
                e.vy = ny * sp;
                if (d < 64 + e.r) {
                    e.state = 1;
                    e.timer = 0.75;
                }
            } else {
                e.vx = 0;
                e.vy = 0;
                e.timer -= dt;
                if (e.timer <= 0) detonate(g, e, d);
            }
            break;
        case 'phaser':
            if (e.state === 0) {
                e.vx = nx * sp;
                e.vy = ny * sp;
                e.timer -= dt;
                if (e.timer <= 0 && d > 130) {
                    e.state = 1;
                    e.timer = 0.45;
                }
            } else {
                e.vx = 0;
                e.vy = 0;
                e.timer -= dt;
                if (e.timer <= 0) {
                    const jump = Math.max(0, Math.min(170, d - 80));
                    g.spawnFx({kind: 'blink', x: e.x, y: e.y, r: e.r * 2, life: 0.3, color: e.def.color});
                    e.x += nx * jump;
                    e.y += ny * jump;
                    g.pushOutOfObstacles(e);
                    g.spawnFx({kind: 'blink', x: e.x, y: e.y, r: e.r * 2, life: 0.3, color: e.def.color});
                    e.state = 0;
                    e.timer = g.rng.float(2.5, 4);
                }
            }
            break;
        case 'boss':
            updateBoss(g, e, dt, nx, ny, d);
            break;
        default:
            e.vx = nx * sp;
            e.vy = ny * sp;
    }
}

function keepDistance(e, nx, ny, d, range) {
    const sp = e.speed;
    if (d > range * 1.1) {
        e.vx = nx * sp;
        e.vy = ny * sp;
    } else if (d < range * 0.75) {
        e.vx = -nx * sp * 0.7;
        e.vy = -ny * sp * 0.7;
    } else {
        const s = e.seed > 50 ? 1 : -1;
        e.vx = -ny * sp * 0.5 * s;
        e.vy = nx * sp * 0.5 * s;
    }
}

function detonate(g, e, d) {
    const R = e.def.blast * (e.elite ? 1.5 : 1);
    const scale = e.dmg / e.def.dmg;
    g.spawnFx({kind: 'explosion', x: e.x, y: e.y, r: R, life: 0.4, color: e.def.color});
    g.events.push({type: 'explode', x: e.x, y: e.y, r: R});
    if (d < R + g.player.r) g.hurtPlayer(e.def.blastDmg * scale, 'Volatile blast');
    const x = e.x, y = e.y;
    const dmg = 20 * (1 + g.time / 300);
    g.killEnemy(e, null);
    g.forEnemiesInCircle(x, y, R, o => {
        if (o.boss || o.def.crate) return;
        o.hp -= dmg;
        o.flash = 0.1;
        if (o.hp <= 0) g.killEnemy(o, null);
    });
}

// ------------------------------------------------------------------ bosses

function updateBoss(g, e, dt, nx, ny, d) {
    const def = e.def;
    const phase2 = !!def.final && e.hp < e.maxHp * 0.5;
    if (phase2 && !e.enraged) {
        e.enraged = true;
        g.events.push({type: 'warning', text: `${def.name} is enraged`});
    }
    if (!e.atk) {
        // Bosses are slower than the ship; off-screen they sprint back into view
        // so they can't be left behind.
        const offscreen = !g.onScreen(e.x, e.y, -e.r);
        const sp = e.speed * (phase2 ? 1.2 : 1) * (offscreen ? 2.8 : 1);
        if (d > 170) {
            e.vx = nx * sp;
            e.vy = ny * sp;
        } else {
            e.vx = -ny * sp * 0.6;
            e.vy = nx * sp * 0.6;
        }
        e.timer -= dt;
        if (e.timer <= 0 && g.onScreen(e.x, e.y, 120)) {
            const name = def.patterns[e.patIdx++ % def.patterns.length];
            e.atk = {name, t: 0, n: 0, acc: 0, phase2};
        }
        return;
    }
    const a = e.atk;
    const done = ATTACKS[a.name](g, e, a, dt, nx, ny, d);
    a.t += dt;
    if (done) {
        e.atk = null;
        e.timer = phase2 ? 1.0 : 1.7;
    }
}

const ATTACKS = {
    radial(g, e, a, dt, nx, ny) {
        e.vx = nx * e.speed * 0.3;
        e.vy = ny * e.speed * 0.3;
        if (a.t >= a.n * 0.55) {
            if (a.n >= 3) return true;
            const N = a.phase2 ? 24 : 16;
            const off = a.n * (Math.PI / N);
            for (let k = 0; k < N; k++) g.fireBullet(e.x, e.y, off + (k / N) * TAU, 150, e.dmg * 0.45, 7, e.def.color);
            a.n++;
            g.events.push({type: 'enemyShot', big: true});
        }
        return false;
    },
    aimed(g, e, a, dt, nx, ny) {
        e.vx = 0;
        e.vy = 0;
        if (a.t >= a.n * 0.3) {
            if (a.n >= 5) return true;
            const base = Math.atan2(ny, nx);
            const k = a.phase2 ? 7 : 5;
            for (let i = 0; i < k; i++) g.fireBullet(e.x, e.y, base + (i - (k - 1) / 2) * 0.17, 190, e.dmg * 0.45, 6, e.def.color);
            a.n++;
            g.events.push({type: 'enemyShot', big: true});
        }
        return false;
    },
    spiral(g, e, a, dt) {
        e.vx *= 0.9;
        e.vy *= 0.9;
        a.acc += dt;
        const arms = a.phase2 ? 4 : 3;
        while (a.acc >= 0.09) {
            a.acc -= 0.09;
            const base = a.t * 2.1;
            for (let i = 0; i < arms; i++) g.fireBullet(e.x, e.y, base + (i / arms) * TAU, 145, e.dmg * 0.4, 6, e.def.color);
        }
        return a.t >= 3.2;
    },
    charge(g, e, a, dt, nx, ny) {
        const reps = a.phase2 ? 2 : 1;
        const cycle = 1.6;
        const local = a.t - a.n * cycle;
        if (local < 0.9) {
            if (!a.aimed) {
                a.aimed = true;
                a.ax = nx;
                a.ay = ny;
                e.ang = Math.atan2(ny, nx);
                g.spawnFx({kind: 'tele', x: e.x, y: e.y, ang: e.ang, len: 620, w: e.r * 2, life: 0.9, color: e.def.color});
            }
            e.vx = 0;
            e.vy = 0;
        } else if (local < cycle) {
            const v = Math.min(560, e.speed * 7);
            e.vx = a.ax * v;
            e.vy = a.ay * v;
        } else {
            a.n++;
            a.aimed = false;
            if (a.n >= reps) return true;
        }
        return false;
    },
    summon(g, e, a) {
        const pool = g.currentWave().pool.filter(([id]) => id !== 'titan');
        const n = a.phase2 ? 10 : 6;
        for (let i = 0; i < n; i++) {
            const ang = (i / n) * TAU;
            const m = g.spawnEnemy(g.pickFromPool(pool.length ? pool : [['drone', 1]]), e.x + Math.cos(ang) * (e.r + 30), e.y + Math.sin(ang) * (e.r + 30));
            m.kx = Math.cos(ang) * 120;
            m.ky = Math.sin(ang) * 120;
        }
        g.spawnFx({kind: 'shockwave', x: e.x, y: e.y, r: e.r + 60, life: 0.4, color: e.def.color});
        return true;
    },
    laser(g, e, a, dt, nx, ny) {
        e.vx = 0;
        e.vy = 0;
        if (!a.n) {
            a.n = 1;
            const k = a.phase2 ? 4 : 3;
            const base = Math.atan2(ny, nx) + 0.4;
            const rot = (g.rng.chance(0.5) ? 1 : -1) * (a.phase2 ? 0.55 : 0.42);
            for (let i = 0; i < k; i++) {
                g.hazards.push({
                    kind: 'beam', owner: e, x: e.x, y: e.y, ang: base + (i / k) * TAU, rot, len: 900, w: 20,
                    warn: 1.0, life: 1.7, dmg: e.dmg * 0.6, color: e.def.color, age: 0,
                });
            }
        }
        return a.t >= 2.9;
    },
    mines(g, e, a) {
        if (!a.n) {
            a.n = 1;
            const p = g.player;
            const k = a.phase2 ? 9 : 6;
            g.hazards.push({kind: 'blast', x: p.x, y: p.y, r: 70, warn: 1.1, life: 0.25, dmg: e.dmg * 0.7, color: e.def.color, age: 0});
            for (let i = 0; i < k; i++) {
                const ang = g.rng.angle(), r = g.rng.float(90, 240);
                g.hazards.push({
                    kind: 'blast', x: p.x + Math.cos(ang) * r, y: p.y + Math.sin(ang) * r, r: 70,
                    warn: 1.2 + i * 0.12, life: 0.25, dmg: e.dmg * 0.7, color: e.def.color, age: 0,
                });
            }
        }
        e.vx *= 0.9;
        e.vy *= 0.9;
        return a.t >= 0.8;
    },
};

// ------------------------------------------------------------------ hazards

export function updateHazard(g, h, dt) {
    const p = g.player;
    h.age += dt;
    if (h.kind === 'beam') {
        if (!h.owner.alive) {
            h.dead = true;
            return;
        }
        h.x = h.owner.x;
        h.y = h.owner.y;
    }
    if (h.warn > 0) {
        h.warn -= dt;
        return;
    }
    switch (h.kind) {
        case 'blast':
            if (!h.fired) {
                h.fired = true;
                g.spawnFx({kind: 'explosion', x: h.x, y: h.y, r: h.r, life: 0.35, color: h.color});
                g.events.push({type: 'explode', x: h.x, y: h.y, r: h.r});
                if (dist2(p.x, p.y, h.x, h.y) < (h.r + p.r * 0.6) ** 2) g.hurtPlayer(h.dmg, 'Detonation');
            }
            h.life -= dt;
            break;
        case 'beam': {
            h.ang += h.rot * dt;
            h.life -= dt;
            const x1 = h.x + Math.cos(h.ang) * h.len, y1 = h.y + Math.sin(h.ang) * h.len;
            const rr = h.w / 2 + p.r * 0.7;
            // Each beam can hit at most once per second, so a sweep costs one hit.
            if ((h.nextHit || 0) <= g.time && segDist2(p.x, p.y, h.x, h.y, x1, y1) < rr * rr) {
                h.nextHit = g.time + 1;
                g.hurtPlayer(h.dmg, 'Boss laser');
            }
            break;
        }
        case 'well': {
            h.life -= dt;
            if (dist2(p.x, p.y, h.x, h.y) < (h.core + p.r) ** 2) g.hurtPlayer(h.dmg, 'Gravity well');
            break;
        }
        default:
            h.life = 0;
    }
    if (h.life <= 0) h.dead = true;
}
