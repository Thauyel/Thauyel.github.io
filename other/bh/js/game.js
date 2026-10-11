// Core simulation. No DOM access: the renderer, audio and UI read `game` and
// consume `game.events`, and the headless test drives it directly.

import {RNG, TAU, clamp, dist2, hash3} from './util.js';
import {WEAPONS, EVOLVED, PASSIVES, RELICS, SHIPS, MAX_WEAPONS, MAX_PASSIVES} from './content.js';
import {ENEMIES, BOSSES, STAGES, RUN_LENGTH} from './stages.js';
import {SpatialHash} from './grid.js';
import {BEHAVIORS, updateProjectile, onWeaponRemoved} from './weapons.js';
import {updateEnemy, updateHazard} from './enemies.js';

export {RUN_LENGTH};
export const MAX_ENEMY_R = 70;
export const MAX_GEMS = 320;
export const PLAYER_SPEED = 150;
export const BASE_MAGNET = 64;
const IFRAMES = 0.45;
const CHUNK = 640;

const BASE_STATS = {
    maxHpMul: 1, recovery: 0, armor: 0, moveSpeed: 1, might: 1, area: 1, projSpeed: 1, duration: 1,
    amount: 0, cooldown: 1, luck: 1, growth: 1, magnetMul: 1, critChance: 0.05, critMult: 2, revival: 0,
};

// Experience needed to advance from `level` to `level + 1`.
export function xpForLevel(level) {
    if (level < 20) return 5 + (level - 1) * 7;
    if (level < 40) return 131 + (level - 19) * 11;
    return 351 + (level - 39) * 15;
}

export class Game {
    constructor(opts = {}) {
        this.seed = (opts.seed ?? Math.floor(Math.random() * 2 ** 31)) >>> 0;
        this.rng = new RNG(this.seed);
        this.stage = STAGES[opts.stage] || STAGES.grid;
        this.ship = SHIPS[opts.ship] || SHIPS.vanguard;
        this.overclock = !!opts.overclock;
        this.diff = {
            hp: this.stage.hpMult * (this.overclock ? 1.5 : 1),
            dmg: this.stage.dmgMult * (this.overclock ? 1.25 : 1),
            spawn: this.stage.spawnMult * (this.overclock ? 1.3 : 1),
            speed: this.overclock ? 1.15 : 1,
        };

        this.time = 0;
        this.frame = 0;
        this.view = {w: 1280, h: 720};
        this.input = {x: 0, y: 0};

        this.enemies = [];
        this.projectiles = [];
        this.bullets = [];
        this.pickups = [];
        this.hazards = [];
        this.fx = [];
        this.timers = [];
        this.events = [];
        this.grid = new SpatialHash(64);
        this.tmpA = [];
        this.tmpB = [];
        this.nextId = 1;

        this.kills = 0;
        this.credits = 0;
        this.bossKills = 0;
        this.eliteKills = 0;
        this.damageTaken = 0;
        this.gemCount = 0;
        this.overflow = null;
        this.crateCount = 0;
        this.crateTimer = 8;
        this.spawnAcc = 0;
        this.eventIdx = 0;
        this.freezeT = 0;
        this.stormT = 40;
        this.trailT = 0;
        this.cleared = false;
        this.clearTime = 0;
        this.purgerT = 0;
        this.over = false;
        this.deathCause = '';
        this.obstacleCache = new Map();
        this.bosses = [];

        this.queue = [];
        this.choice = null;
        this.banished = new Set();
        this.charges = {reroll: 2, skip: 2, banish: 2};
        for (const [k, v] of Object.entries(this.ship.charges || {})) this.charges[k] += v;

        this.player = {
            x: 0, y: 0, r: 12, hp: 1, alive: true,
            dirX: 1, dirY: 0, faceX: 1, moving: false, angle: 0,
            vx: 0, vy: 0, iframes: 0, level: 1, xp: 0, xpNext: xpForLevel(1),
            weapons: [], passives: [], relics: [], revivesUsed: 0, reviveT: 0,
            resStacks: 0, resT: 0, distance: 0, healed: 0,
        };
        this.stats = null;
        this.recalcStats();
        this.addWeapon(this.ship.weapon);

        if (opts.startRelic !== false) {
            this.queue.push({kind: 'relic', reason: 'start'});
            this.openNextChoice();
        }
    }

    // ------------------------------------------------------------ stats

    recalcStats() {
        const p = this.player;
        const s = {...BASE_STATS};
        const add = mods => {
            for (const k in mods) s[k] += mods[k];
        };
        add(this.ship.stats || {});
        const perk = this.ship.perk;
        if (perk) s[perk.stat] += Math.floor(p.level / perk.every) * perk.amount;
        for (const pa of p.passives) {
            s[pa.def.stat] += pa.def.per * pa.level;
            if (pa.def.extra) for (const k in pa.def.extra) s[k] += pa.def.extra[k] * pa.level;
        }
        for (const r of p.relics) if (RELICS[r].stats) add(RELICS[r].stats);

        s.maxHp = Math.round(this.ship.hp * Math.max(0.2, s.maxHpMul));
        s.magnet = BASE_MAGNET * Math.max(0.5, s.magnetMul);
        s.cooldown = Math.max(0.35, s.cooldown);
        s.moveSpeed = Math.max(0.4, s.moveSpeed);
        s.might = Math.max(0.1, s.might);
        s.critChance = clamp(s.critChance, 0, 1);

        const old = this.stats;
        this.stats = s;
        if (!old) {
            p.hp = s.maxHp;
        } else {
            if (s.maxHp > old.maxHp) p.hp += s.maxHp - old.maxHp;
            p.hp = Math.min(p.hp, s.maxHp);
        }
        for (const w of p.weapons) w.dirty = true;
    }

    weaponStats(w) {
        if (!w.dirty && w.s) return w.s;
        const d = w.def;
        const b = {...d.base};
        if (!d.evolved) {
            for (let i = 0; i < w.level - 1; i++) {
                const mods = d.levels[i];
                for (const k in mods) b[k] = (b[k] || 0) + mods[k];
            }
        }
        const st = this.stats;
        const s = {...b};
        s.dmg = (b.dmg || 0) * st.might;
        s.cd = Math.max(0.05, (b.cd || 1) * st.cooldown);
        s.amount = Math.max(1, (b.amount || 1) + (d.noAmount ? 0 : st.amount));
        s.area = (b.area || 1) * st.area;
        s.speed = (b.speed || 1) * st.projSpeed;
        s.duration = (b.duration || 0) * st.duration;
        w.s = s;
        w.dirty = false;
        return s;
    }

    // Damage multiplier that depends on the moment-to-moment situation.
    dynamicMight() {
        const p = this.player;
        let m = 1;
        if (p.relics.includes('laststand') && p.hp < this.stats.maxHp * 0.4) m *= 1.5;
        if (p.relics.includes('kinetic') && p.moving) m *= 1.2;
        if (p.resStacks > 0) m *= 1 + p.resStacks * 0.01;
        return m;
    }

    // ------------------------------------------------------------ inventory

    addWeapon(id) {
        const def = WEAPONS[id];
        const w = {id, def, level: 1, cdT: 0.25, dirty: true, s: null, data: {}, dmg: 0, kills: 0, since: this.time};
        this.player.weapons.push(w);
        return w;
    }

    addPassive(id) {
        const pa = {id, def: PASSIVES[id], level: 1, since: this.time};
        this.player.passives.push(pa);
        this.recalcStats();
        return pa;
    }

    findWeapon(id) {
        return this.player.weapons.find(w => w.id === id || w.def.from === id);
    }

    findPassive(id) {
        return this.player.passives.find(pa => pa.id === id);
    }

    canEvolve(w) {
        const d = w.def;
        return !d.evolved && d.evo && w.level >= d.maxLevel && !!this.findPassive(d.evo.with);
    }

    evolve(w) {
        const into = EVOLVED[w.def.evo.into];
        onWeaponRemoved(this, w);
        w.id = into.id;
        w.def = into;
        w.data = {};
        w.dirty = true;
        w.cdT = 0.1;
        this.events.push({type: 'evolve', id: into.id, name: into.name});
        return into;
    }

    // Applies one level-up option. Returns a description object for the UI.
    applyOption(opt) {
        const p = this.player;
        if (opt.type === 'weapon') {
            const w = this.findWeapon(opt.id);
            if (w) {
                w.level = Math.min(w.def.maxLevel, w.level + 1);
                w.dirty = true;
            } else {
                this.addWeapon(opt.id);
            }
        } else if (opt.type === 'passive') {
            const pa = this.findPassive(opt.id);
            if (pa) {
                pa.level = Math.min(pa.def.max, pa.level + 1);
                this.recalcStats();
            } else {
                this.addPassive(opt.id);
            }
        } else if (opt.type === 'heal') {
            this.heal(this.stats.maxHp * 0.3);
        } else if (opt.type === 'credits') {
            this.credits += 50;
        }
        p.lastPick = opt;
    }

    // ------------------------------------------------------------ choices

    openNextChoice() {
        if (this.choice || this.over) return;
        while (this.queue.length && !this.choice) {
            const q = this.queue.shift();
            if (q.kind === 'level') {
                const options = this.levelOptions();
                this.choice = {kind: 'level', level: q.level, options};
            } else if (q.kind === 'chest') {
                this.choice = this.openChest(q);
            } else if (q.kind === 'relic') {
                const pool = Object.keys(RELICS).filter(id => !this.player.relics.includes(id));
                if (!pool.length) continue;
                this.rng.shuffle(pool);
                this.choice = {kind: 'relic', reason: q.reason, options: pool.slice(0, 3)};
            }
        }
        if (this.choice) this.events.push({type: 'choice', kind: this.choice.kind});
    }

    levelOptions() {
        const p = this.player;
        const pool = [];
        for (const w of p.weapons) {
            if (!w.def.evolved && w.level < w.def.maxLevel && !this.banished.has(w.id)) {
                pool.push({type: 'weapon', id: w.id, level: w.level + 1, isNew: false, weight: 1.6});
            }
        }
        for (const pa of p.passives) {
            if (pa.level < pa.def.max && !this.banished.has(pa.id)) {
                pool.push({type: 'passive', id: pa.id, level: pa.level + 1, isNew: false, weight: 1.3});
            }
        }
        if (p.weapons.length < MAX_WEAPONS) {
            for (const id of Object.keys(WEAPONS)) {
                if (!this.findWeapon(id) && !this.banished.has(id)) pool.push({type: 'weapon', id, level: 1, isNew: true, weight: 1});
            }
        }
        if (p.passives.length < MAX_PASSIVES) {
            for (const id of Object.keys(PASSIVES)) {
                if (!this.findPassive(id) && !this.banished.has(id)) pool.push({type: 'passive', id, level: 1, isNew: true, weight: 0.9});
            }
        }
        const fourth = clamp((this.stats.luck - 1) * 1.0, 0, 1);
        const count = 3 + (this.rng.chance(fourth) ? 1 : 0);
        const out = [];
        while (out.length < count && pool.length) {
            const pick = this.rng.weighted(pool, o => o.weight);
            pool.splice(pool.indexOf(pick), 1);
            out.push(pick);
        }
        if (!out.length) {
            out.push({type: 'heal', id: 'heal', level: 0, isNew: false});
            out.push({type: 'credits', id: 'credits', level: 0, isNew: false});
        }
        return out;
    }

    openChest(q) {
        const p = this.player;
        const luck = this.stats.luck * (p.relics.includes('fortune') ? 1.4 : 1);
        const p5 = (q.boss ? 0.1 : 0.03) * luck;
        const p3 = (q.boss ? 0.35 : 0.15) * luck;
        const r = this.rng.next();
        const n = r < p5 ? 5 : r < p5 + p3 ? 3 : 1;
        const items = [];
        for (let i = 0; i < n; i++) {
            const evolvable = p.weapons.filter(w => this.canEvolve(w));
            if (evolvable.length) {
                const w = this.rng.pick(evolvable);
                const fromName = w.def.name;
                const into = this.evolve(w);
                items.push({type: 'evolve', id: into.id, from: fromName, name: into.name});
                continue;
            }
            const up = [];
            for (const w of p.weapons) if (!w.def.evolved && w.level < w.def.maxLevel) up.push({type: 'weapon', id: w.id, level: w.level + 1, weight: 2});
            for (const pa of p.passives) if (pa.level < pa.def.max) up.push({type: 'passive', id: pa.id, level: pa.level + 1, weight: 1});
            if (up.length) {
                const pick = this.rng.weighted(up, o => o.weight);
                this.applyOption(pick);
                items.push(pick);
            } else {
                this.credits += 60;
                this.heal(20);
                items.push({type: 'credits', id: 'credits', amount: 60});
            }
        }
        const bonus = (q.boss ? 120 : 40) * n;
        this.credits += bonus;
        this.events.push({type: 'chest', n, boss: !!q.boss});
        return {kind: 'chest', items, tier: n, credits: bonus, boss: !!q.boss};
    }

    choose(i) {
        const c = this.choice;
        if (!c) return;
        if (c.kind === 'level') {
            const opt = c.options[i];
            if (!opt) return;
            this.applyOption(opt);
            this.events.push({type: 'pick', id: opt.id});
        } else if (c.kind === 'relic') {
            const id = c.options[i];
            if (!id) return;
            this.player.relics.push(id);
            if (id === 'fortune') {
                this.charges.reroll += 2;
                this.charges.skip += 2;
                this.charges.banish += 2;
            }
            this.recalcStats();
            this.events.push({type: 'relic', id});
        }
        this.choice = null;
        this.openNextChoice();
    }

    reroll() {
        const c = this.choice;
        if (!c || c.kind !== 'level' || this.charges.reroll <= 0 || !this.canReroll()) return false;
        this.charges.reroll--;
        c.options = this.levelOptions();
        return true;
    }

    // False when only the fixed fallback options (repair / credits) remain.
    canReroll() {
        const c = this.choice;
        return !!c && c.kind === 'level' && c.options.some(o => o.type === 'weapon' || o.type === 'passive');
    }

    skip() {
        const c = this.choice;
        if (!c) return false;
        if (c.kind === 'level') {
            if (this.charges.skip <= 0) return false;
            this.charges.skip--;
            this.credits += 25;
            this.heal(this.stats.maxHp * 0.05);
        } else if (c.kind !== 'relic' && c.kind !== 'chest') {
            return false;
        }
        this.choice = null;
        this.openNextChoice();
        return true;
    }

    banish(i) {
        const c = this.choice;
        if (!c || c.kind !== 'level' || this.charges.banish <= 0) return false;
        const opt = c.options[i];
        if (!opt || opt.type === 'heal' || opt.type === 'credits') return false;
        // Owned items can't be banished: it would strand their slot.
        if (!opt.isNew) return false;
        this.charges.banish--;
        this.banished.add(opt.id);
        c.options = this.levelOptions();
        return true;
    }

    // ------------------------------------------------------------ progression

    addXp(v) {
        const p = this.player;
        p.xp += v * this.stats.growth;
        let leveled = false;
        while (p.xp >= p.xpNext) {
            p.xp -= p.xpNext;
            p.level++;
            p.xpNext = xpForLevel(p.level);
            this.queue.push({kind: 'level', level: p.level});
            leveled = true;
            const perk = this.ship.perk;
            if (perk && p.level % perk.every === 0) this.recalcStats();
        }
        if (leveled) {
            this.events.push({type: 'levelup', level: p.level});
            this.openNextChoice();
        }
    }

    heal(v) {
        const p = this.player;
        const before = p.hp;
        p.hp = Math.min(this.stats.maxHp, p.hp + v);
        p.healed += p.hp - before;
    }

    score() {
        const survived = Math.min(this.time, RUN_LENGTH);
        const overtime = Math.max(0, this.time - RUN_LENGTH);
        const raw = this.kills * 10 + this.credits * 5 + survived * 10 + overtime * 40
            + this.bossKills * 1500 + this.eliteKills * 300 + this.player.level * 100 + (this.cleared ? 20000 : 0);
        return Math.floor(raw * this.stage.scoreMult * (this.overclock ? 1.75 : 1));
    }

    // ------------------------------------------------------------ helpers

    schedule(delay, fn) {
        this.timers.push({t: this.time + delay, fn});
    }

    spawnFx(fx) {
        fx.age = 0;
        this.fx.push(fx);
        return fx;
    }

    onScreen(x, y, margin = 0) {
        const p = this.player;
        return Math.abs(x - p.x) < this.view.w / 2 + margin && Math.abs(y - p.y) < this.view.h / 2 + margin;
    }

    spawnRadius() {
        return Math.hypot(this.view.w / 2, this.view.h / 2) + 40;
    }

    // Nearest damageable (non-crate) enemy within maxR, optionally excluding a set of ids.
    nearestEnemy(x, y, maxR = 1e9, exclude = null) {
        let best = null, bd = maxR * maxR;
        for (const e of this.enemies) {
            if (!e.alive || e.def.crate || e.def.purger) continue;
            if (exclude && exclude.has(e.id)) continue;
            const d = dist2(x, y, e.x, e.y);
            if (d < bd) {
                bd = d;
                best = e;
            }
        }
        return best;
    }

    // Up to n distinct nearest targets (for missiles and multi-shot weapons).
    nearestEnemies(x, y, n, maxR = 1e9) {
        const list = [];
        const r2 = maxR * maxR;
        for (const e of this.enemies) {
            if (!e.alive || e.def.crate || e.def.purger) continue;
            const d = dist2(x, y, e.x, e.y);
            if (d < r2) list.push([d, e]);
        }
        list.sort((a, b) => a[0] - b[0]);
        return list.slice(0, n).map(v => v[1]);
    }

    randomEnemy(x, y, maxR) {
        const r2 = maxR * maxR;
        const list = this.tmpB;
        list.length = 0;
        for (const e of this.enemies) {
            if (!e.alive || e.def.crate || e.def.purger) continue;
            if (dist2(x, y, e.x, e.y) < r2) list.push(e);
        }
        return list.length ? this.rng.pick(list) : null;
    }

    // Calls fn(e) for every live enemy whose body overlaps the circle.
    forEnemiesInCircle(x, y, r, fn, includeCrates = true) {
        const list = this.grid.query(x, y, r + MAX_ENEMY_R, this.tmpA);
        // Copy: fn may trigger kills that spawn enemies, but never re-queries tmpA.
        for (let i = 0; i < list.length; i++) {
            const e = list[i];
            if (!e.alive || (!includeCrates && e.def.crate)) continue;
            const rr = r + e.r;
            if (dist2(x, y, e.x, e.y) < rr * rr) fn(e);
        }
    }

    // ------------------------------------------------------------ obstacles

    obstaclesInChunk(cx, cy) {
        const key = (cx + 32768) * 65536 + (cy + 32768);
        let list = this.obstacleCache.get(key);
        if (list) return list;
        list = [];
        const cfg = this.stage.obstacles;
        if (cfg) {
            for (let i = 0; i < cfg.per; i++) {
                const x = (cx + 0.1 + 0.8 * hash3(cx, cy, i * 3 + this.seed)) * CHUNK;
                const y = (cy + 0.1 + 0.8 * hash3(cx, cy, i * 3 + 1 + this.seed)) * CHUNK;
                const r = cfg.minR + (cfg.maxR - cfg.minR) * hash3(cx, cy, i * 3 + 2 + this.seed);
                if (x * x + y * y < 260 * 260) continue; // keep the start clear
                list.push({x, y, r, seed: hash3(cx, cy, 99 + i)});
            }
        }
        this.obstacleCache.set(key, list);
        if (this.obstacleCache.size > 400) {
            const first = this.obstacleCache.keys().next().value;
            this.obstacleCache.delete(first);
        }
        return list;
    }

    // Visits obstacles in the 3x3 chunks around a point.
    forObstaclesNear(x, y, fn) {
        if (!this.stage.obstacles) return;
        const cx = Math.floor(x / CHUNK), cy = Math.floor(y / CHUNK);
        for (let i = -1; i <= 1; i++) {
            for (let j = -1; j <= 1; j++) {
                const list = this.obstaclesInChunk(cx + i, cy + j);
                for (const o of list) fn(o);
            }
        }
    }

    pushOutOfObstacles(ent) {
        if (!this.stage.obstacles) return;
        this.forObstaclesNear(ent.x, ent.y, o => {
            const dx = ent.x - o.x, dy = ent.y - o.y;
            const rr = o.r + ent.r;
            const d2 = dx * dx + dy * dy;
            if (d2 < rr * rr) {
                const d = Math.sqrt(d2) || 0.001;
                ent.x = o.x + (dx / d) * rr;
                ent.y = o.y + (dy / d) * rr;
            }
        });
    }

    blockedAt(x, y, r) {
        let hit = false;
        this.forObstaclesNear(x, y, o => {
            if (dist2(x, y, o.x, o.y) < (o.r + r) * (o.r + r)) hit = true;
        });
        return hit;
    }

    // ------------------------------------------------------------ enemies

    spawnEnemy(typeId, x, y, opts = {}) {
        const def = ENEMIES[typeId];
        const t = this.time / 60;
        const elite = !!opts.elite;
        // Stage multipliers ease in over the first five minutes so every stage opens gently.
        const ease = Math.min(1, t / 5);
        const stageHp = 1 + (this.stage.hpMult - 1) * ease, stageDmg = 1 + (this.stage.dmgMult - 1) * ease;
        const oc = this.overclock;
        const hp = def.hp * (1 + t * this.stage.hpGrowth) * stageHp * (oc ? 1.5 : 1) * (elite ? 12 : 1);
        const e = {
            id: this.nextId++, def, ai: opts.ai || def.ai,
            x, y, r: def.r * (elite ? 1.6 : 1),
            hp, maxHp: hp,
            speed: def.speed * (1 + t * 0.012) * this.diff.speed * (elite ? 1.05 : 1) * (opts.speedMul || 1),
            dmg: def.dmg * (1 + t * 0.05) * stageDmg * (oc ? 1.25 : 1) * (elite ? 1.5 : 1),
            xp: def.xp * (elite ? 10 : 1),
            elite, boss: false,
            vx: 0, vy: 0, kx: 0, ky: 0, flash: 0, slowT: 0, slowF: 0, freezeT: 0,
            state: 0, timer: this.rng.float(0.5, 2.5), ang: 0, alive: true,
            seed: this.rng.next() * 100, dirx: opts.dirx || 0, diry: opts.diry || 0, life: opts.life || 0,
        };
        if (def.crate) this.crateCount++;
        this.enemies.push(e);
        return e;
    }

    spawnBoss(id, relic) {
        const def = BOSSES[id];
        const p = this.player;
        const a = this.rng.angle();
        const R = this.spawnRadius();
        let hp;
        if (def.purger) {
            hp = def.hp;
        } else {
            hp = def.hp * this.stage.bossMult * (0.6 + 0.04 * p.level) * (1 + this.time / 600) * (this.overclock ? 1.5 : 1);
        }
        const e = {
            id: this.nextId++, def, ai: def.ai,
            x: p.x + Math.cos(a) * R, y: p.y + Math.sin(a) * R, r: def.r,
            hp, maxHp: hp,
            speed: def.speed * this.diff.speed,
            dmg: def.dmg * this.diff.dmg * (def.purger ? 1 : 1 + this.time / 900),
            xp: def.xp, elite: false, boss: true, relic: !!relic,
            vx: 0, vy: 0, kx: 0, ky: 0, flash: 0, slowT: 0, slowF: 0, freezeT: 0,
            state: 0, timer: 2, ang: 0, alive: true, seed: this.rng.next() * 100,
            atk: null, patIdx: 0, dirx: 0, diry: 0, life: 0,
        };
        this.pushOutOfObstacles(e);
        this.enemies.push(e);
        this.bosses.push(e);
        this.events.push({type: 'bossSpawn', id, name: def.name, final: !!def.final, purger: !!def.purger});
        return e;
    }

    // A point just outside the visible area, biased toward the travel direction.
    spawnPoint() {
        const p = this.player;
        const R = this.spawnRadius() + this.rng.float(0, 80);
        let a;
        if (p.moving && this.rng.chance(0.45)) a = Math.atan2(p.dirY, p.dirX) + this.rng.float(-0.9, 0.9);
        else a = this.rng.angle();
        let x = p.x + Math.cos(a) * R, y = p.y + Math.sin(a) * R;
        if (this.stage.obstacles) {
            for (let k = 0; k < 4 && this.blockedAt(x, y, 18); k++) {
                x += this.rng.float(-60, 60);
                y += this.rng.float(-60, 60);
            }
        }
        return {x, y};
    }

    pickFromPool(pool) {
        const pick = this.rng.weighted(pool, it => it[1]);
        return pick ? pick[0] : 'drone';
    }

    currentWave() {
        const idx = clamp(Math.floor(this.time / 60), 0, this.stage.waves.length - 1);
        return this.stage.waves[idx];
    }

    updateSpawning(dt) {
        const p = this.player;
        if (this.cleared) {
            this.purgerT -= dt;
            if (this.purgerT <= 0) {
                this.purgerT = 45;
                const e = this.spawnBoss('purger', false);
                e.speed *= 1 + (this.time - RUN_LENGTH) / 200;
            }
            for (const e of this.bosses) if (e.def.purger && e.alive) e.speed += dt * 6;
            return;
        }

        // Scripted events
        const events = this.stage.events;
        while (this.eventIdx < events.length && events[this.eventIdx].t <= this.time) {
            this.runEvent(events[this.eventIdx++]);
        }

        const wave = this.currentWave();
        let alive = 0;
        for (const e of this.enemies) if (e.alive && !e.boss && !e.def.crate) alive++;
        this.aliveCount = alive;

        this.spawnAcc += dt * wave.rate * this.diff.spawn;
        let budget = 12;
        while (this.spawnAcc >= 1 && budget-- > 0) {
            this.spawnAcc -= 1;
            if (alive >= wave.cap) continue;
            const pt = this.spawnPoint();
            this.spawnEnemy(this.pickFromPool(wave.pool), pt.x, pt.y);
            alive++;
        }
        if (this.spawnAcc > 4) this.spawnAcc = 4;
        // Keep a minimum crowd on the field.
        let fill = 4;
        while (alive < wave.min && fill-- > 0) {
            const pt = this.spawnPoint();
            this.spawnEnemy(this.pickFromPool(wave.pool), pt.x, pt.y);
            alive++;
        }

        // Supply crates
        this.crateTimer -= dt;
        if (this.crateTimer <= 0) {
            this.crateTimer = 18;
            if (this.crateCount < 4) {
                const a = this.rng.angle();
                const R = this.spawnRadius() * this.rng.float(0.6, 1.4);
                const x = p.x + Math.cos(a) * R, y = p.y + Math.sin(a) * R;
                if (!this.blockedAt(x, y, 20)) this.spawnEnemy('crate', x, y);
            }
        }
    }

    runEvent(ev) {
        const p = this.player;
        const wave = this.currentWave();
        if (ev.kind === 'ring') {
            const n = ev.count;
            const R = Math.max(this.view.w, this.view.h) / 2 + 60;
            for (let i = 0; i < n; i++) {
                const a = (i / n) * TAU;
                const e = this.spawnEnemy(ev.type, p.x + Math.cos(a) * R, p.y + Math.sin(a) * R);
                this.pushOutOfObstacles(e);
            }
            this.events.push({type: 'warning', text: 'Encirclement'});
        } else if (ev.kind === 'stream') {
            const a = this.rng.angle();
            const dx = Math.cos(a), dy = Math.sin(a);
            const R = this.spawnRadius() + 60;
            const n = ev.count;
            for (let i = 0; i < n; i++) {
                const off = (i - (n - 1) / 2) * 34;
                const x = p.x - dx * R - dy * off + this.rng.float(-10, 10);
                const y = p.y - dy * R + dx * off + this.rng.float(-10, 10);
                this.spawnEnemy(ev.type, x, y, {ai: 'stream', dirx: dx, diry: dy, speedMul: 1.7, life: 9});
            }
            this.events.push({type: 'warning', text: 'Data stream'});
        } else if (ev.kind === 'elite') {
            const pool = wave.pool.filter(([id]) => id !== 'swarmer' && id !== 'splitling');
            const type = this.pickFromPool(pool.length ? pool : wave.pool);
            const pt = this.spawnPoint();
            this.spawnEnemy(type, pt.x, pt.y, {elite: true});
            this.events.push({type: 'warning', text: 'Elite signature'});
        } else if (ev.kind === 'boss') {
            this.spawnBoss(ev.boss, ev.relic);
        } else if (ev.kind === 'hazard') {
            this.spawnStageHazard(ev.hazard);
        }
    }

    spawnStageHazard(kind) {
        const p = this.player;
        if (kind === 'shardstorm') {
            for (let i = 0; i < 8; i++) {
                const a = this.rng.angle(), r = this.rng.float(0, 280);
                this.hazards.push({
                    kind: 'blast', x: p.x + Math.cos(a) * r + p.vx * 0.8, y: p.y + Math.sin(a) * r + p.vy * 0.8,
                    r: 62, warn: 1.1 + i * 0.18, life: 0.25, dmg: 14 * this.diff.dmg, color: '#9ff4ff', age: 0,
                });
            }
            this.events.push({type: 'warning', text: 'Shard storm'});
        } else if (kind === 'gravwell') {
            const a = this.rng.angle(), r = this.rng.float(120, 260);
            this.hazards.push({
                kind: 'well', x: p.x + Math.cos(a) * r, y: p.y + Math.sin(a) * r,
                r: 240, core: 38, warn: 1.6, life: 11, pull: 62, dmg: 12 * this.diff.dmg, color: '#b06bff', age: 0,
            });
            this.events.push({type: 'warning', text: 'Gravity well'});
        }
    }

    // Damage an enemy. dirx/diry is the knockback direction (normalized or 0).
    hitEnemy(e, base, src, dirx = 0, diry = 0, kb = 0, opts = null) {
        if (!e.alive) return 0;
        if (e.def.purger) {
            e.flash = 0.05;
            return 0;
        }
        let dmg = base * this.dynMul;
        let crit = false;
        const cc = this.stats.critChance + (src && src.s && src.s.crit ? src.s.crit : 0);
        if (cc > 0 && this.rng.next() < cc) {
            crit = true;
            dmg *= this.stats.critMult;
        }
        if (e.freezeT > 0 && e.shatter) dmg *= 1.5;
        if (e.def.armor) dmg = Math.max(dmg * 0.25, dmg - e.def.armor);
        e.hp -= dmg;
        e.flash = 0.1;
        if (kb && !e.boss && e.def.kbRes < 1) {
            const k = kb * 22 * (1 - e.def.kbRes);
            e.kx += dirx * k;
            e.ky += diry * k;
        }
        if (src) src.dmg += dmg;
        this.events.push({type: 'dmg', x: e.x, y: e.y - e.r, v: dmg, crit});
        if (crit && src && src.s) {
            if (src.s.lifesteal) this.heal(src.s.lifesteal);
            if (src.s.rift && (!opts || !opts.noRift)) {
                this.projectiles.push({
                    kind: 'zone', style: 'rift', x: e.x, y: e.y, r: 34 * src.s.area, life: 1.2, max: 1.2, tick: 0.25, tickT: 0,
                    dmg: src.s.dmg * 0.4, src, color: src.def.color, slow: 0,
                });
            }
        }
        if (e.hp <= 0) this.killEnemy(e, src);
        return dmg;
    }

    killEnemy(e, src, silent = false) {
        if (!e.alive) return;
        e.alive = false;
        const p = this.player;
        if (e.def.crate) {
            this.crateCount--;
            this.dropCrateLoot(e.x, e.y);
            this.events.push({type: 'kill', x: e.x, y: e.y, color: e.def.color, r: e.r, crate: true});
            return;
        }
        if (silent) {
            this.events.push({type: 'kill', x: e.x, y: e.y, color: e.def.color, r: e.r, silent: true});
            return;
        }
        this.kills++;
        if (src) src.kills++;
        this.events.push({type: 'kill', x: e.x, y: e.y, color: e.def.color, r: e.r, elite: e.elite, boss: e.boss});

        if (e.xp > 0) this.dropGem(e.x, e.y, e.xp);

        if (e.boss) {
            this.bossKills++;
            this.pickups.push(this.makePickup('chest', e.x, e.y, {boss: true}));
            if (e.relic) this.pickups.push(this.makePickup('relic', e.x + 40, e.y));
            this.events.push({type: 'bossKill', name: e.def.name, final: !!e.def.final});
        } else if (e.elite) {
            this.eliteKills++;
            this.pickups.push(this.makePickup('chest', e.x, e.y, {boss: false}));
        } else {
            const luck = this.stats.luck;
            const r = this.rng.next();
            if (r < 0.02 * luck) this.pickups.push(this.makePickup('credit', e.x, e.y, {value: this.rng.int(5, 15)}));
            else if (r < 0.023 * luck) this.pickups.push(this.makePickup('heal', e.x, e.y));
            else if (r < 0.0238 * luck) this.pickups.push(this.makePickup('magnet', e.x, e.y));
            else if (r < 0.0244 * luck) this.pickups.push(this.makePickup('bomb', e.x, e.y));
            else if (r < 0.0249 * luck) this.pickups.push(this.makePickup('freeze', e.x, e.y));
        }

        if (e.def.split) {
            for (let i = 0; i < e.def.splitN; i++) {
                const a = (i / e.def.splitN) * TAU + this.rng.float(0, 1);
                const c = this.spawnEnemy(e.def.split, e.x + Math.cos(a) * 10, e.y + Math.sin(a) * 10);
                c.kx = Math.cos(a) * 160;
                c.ky = Math.sin(a) * 160;
            }
        }

        if (p.relics.includes('chain') && this.rng.chance(0.12)) {
            const x = e.x, y = e.y;
            const dmg = 25 * this.stats.might * (1 + this.time / 600);
            this.schedule(0.08, () => this.explode(x, y, 70, dmg, null, '#ffb000'));
        }

        // Singularity Core: kills inside the field heal and grow it.
        for (const w of p.weapons) {
            if (w.def.id === 'singularity') {
                const s = this.weaponStats(w);
                const R = s.radius * s.area * (1 + (w.data.growth || 0));
                if (dist2(e.x, e.y, p.x, p.y) < (R + e.r) * (R + e.r)) {
                    w.data.healBudget = (w.data.healBudget || 0);
                    if (w.data.healBudget < 6) {
                        this.heal(s.heal);
                        w.data.healBudget += s.heal;
                    }
                    w.data.growth = Math.min(0.5, (w.data.growth || 0) + 0.0015);
                }
            }
        }
    }

    explode(x, y, r, dmg, src, color) {
        this.spawnFx({kind: 'explosion', x, y, r, life: 0.35, color});
        this.events.push({type: 'explode', x, y, r});
        this.forEnemiesInCircle(x, y, r, e => {
            const dx = e.x - x, dy = e.y - y, d = Math.hypot(dx, dy) || 1;
            this.hitEnemy(e, dmg, src, dx / d, dy / d, 3, {noRift: true});
        });
    }

    // ------------------------------------------------------------ pickups

    makePickup(kind, x, y, extra = {}) {
        const r = kind === 'gem' || kind === 'credit' ? 7 : kind === 'chest' || kind === 'relic' ? 16 : 11;
        return {kind, x, y, r, value: 0, vx: 0, vy: 0, attracted: false, age: 0, alive: true, ...extra};
    }

    dropGem(x, y, value, toOverflow = false) {
        if (toOverflow || this.gemCount >= MAX_GEMS) {
            if (this.overflow && this.overflow.alive) {
                this.overflow.value += value;
            } else {
                this.overflow = this.makePickup('gem', x, y, {value, overflow: true});
                this.pickups.push(this.overflow);
                this.gemCount++;
            }
            return;
        }
        this.pickups.push(this.makePickup('gem', x, y, {value}));
        this.gemCount++;
    }

    dropCrateLoot(x, y) {
        const table = [['heal', 32], ['credit', 30], ['magnet', 10], ['bomb', 9], ['freeze', 8], ['gem', 11]];
        const kind = this.rng.weighted(table, t => t[1])[0];
        if (kind === 'gem') this.dropGem(x, y, 10 + Math.floor(this.time / 30));
        else this.pickups.push(this.makePickup(kind, x, y, {value: kind === 'credit' ? this.rng.int(20, 60) : 0}));
    }

    vacuum() {
        for (const pk of this.pickups) if (pk.kind === 'gem' || pk.kind === 'credit') pk.attracted = true;
    }

    collect(pk) {
        const p = this.player;
        pk.alive = false;
        switch (pk.kind) {
            case 'gem':
                this.gemCount--;
                if (pk === this.overflow) this.overflow = null;
                if (p.relics.includes('resonance')) {
                    p.resStacks = Math.min(30, p.resStacks + 1);
                    p.resT = 5;
                }
                this.events.push({type: 'gem', value: pk.value});
                this.addXp(pk.value);
                return;
            case 'credit':
                this.credits += pk.value;
                break;
            case 'heal':
                this.heal(30);
                break;
            case 'magnet':
                this.vacuum();
                break;
            case 'bomb':
                this.emp();
                break;
            case 'freeze':
                this.freezeT = 6;
                break;
            case 'chest':
                this.queue.push({kind: 'chest', boss: pk.boss});
                this.openNextChoice();
                break;
            case 'relic':
                this.queue.push({kind: 'relic', reason: 'cache'});
                this.openNextChoice();
                break;
        }
        this.events.push({type: 'pickup', kind: pk.kind, x: pk.x, y: pk.y});
    }

    emp() {
        const p = this.player;
        this.spawnFx({kind: 'shockwave', x: p.x, y: p.y, r: Math.hypot(this.view.w, this.view.h) / 2, life: 0.6, color: '#ffffff'});
        for (const e of this.enemies) {
            if (!e.alive || e.def.crate || e.def.purger) continue;
            if (!this.onScreen(e.x, e.y, 40)) continue;
            if (e.boss) this.hitEnemy(e, e.maxHp * 0.05 / this.dynMul, null);
            else this.killEnemy(e, null);
        }
        this.events.push({type: 'emp'});
    }

    updatePickups(dt) {
        const p = this.player;
        const mag = this.stats.magnet;
        const farR = this.spawnRadius() * 2.2;
        const farR2 = farR * farR;
        for (const pk of this.pickups) {
            if (!pk.alive) continue;
            pk.age += dt;
            // Gems left far behind are absorbed into the overflow crystal, which
            // itself relocates to the edge of the view so it can be collected.
            if (pk.kind === 'gem' && !pk.attracted && this.frame % 30 === 0 && dist2(pk.x, pk.y, p.x, p.y) > farR2) {
                if (pk.overflow) {
                    const a = this.rng.angle(), R = this.spawnRadius() * 0.75;
                    pk.x = p.x + Math.cos(a) * R;
                    pk.y = p.y + Math.sin(a) * R;
                } else {
                    pk.alive = false;
                    this.gemCount--;
                    this.dropGem(p.x + p.dirX * this.spawnRadius() * 0.7, p.y + p.dirY * this.spawnRadius() * 0.7, pk.value, true);
                    continue;
                }
            }
            const dx = p.x - pk.x, dy = p.y - pk.y;
            const d = Math.hypot(dx, dy) || 0.001;
            const magnetic = pk.kind === 'gem' || pk.kind === 'credit' || pk.kind === 'heal';
            if (!pk.attracted && magnetic && d < mag + pk.r) {
                pk.attracted = true;
                pk.vx = -dx / d * 140;
                pk.vy = -dy / d * 140;
                pk.pull = 0;
            }
            if (pk.attracted) {
                pk.pull = (pk.pull || 0) + dt;
                const acc = 1600 + pk.pull * 2400;
                pk.vx += (dx / d) * acc * dt;
                pk.vy += (dy / d) * acc * dt;
                const sp = Math.hypot(pk.vx, pk.vy), max = 520 + pk.pull * 900;
                if (sp > max) {
                    pk.vx *= max / sp;
                    pk.vy *= max / sp;
                }
                pk.x += pk.vx * dt;
                pk.y += pk.vy * dt;
            }
            const rr = p.r + pk.r;
            if (dist2(p.x, p.y, pk.x, pk.y) < rr * rr) this.collect(pk);
        }
        // Compact
        let j = 0;
        for (let i = 0; i < this.pickups.length; i++) {
            const pk = this.pickups[i];
            if (pk.alive) this.pickups[j++] = pk;
        }
        this.pickups.length = j;
    }

    // ------------------------------------------------------------ player

    hurtPlayer(amount, cause = 'enemy', ignoreIframes = false) {
        const p = this.player;
        if (!p.alive || this.over) return;
        if (p.iframes > 0 && !ignoreIframes) return;
        let armor = this.stats.armor;
        if (p.relics.includes('kinetic') && !p.moving) armor += 3;
        let dmg = Math.max(1, amount - armor);
        if (p.relics.includes('bulwark') && cause === 'contact') dmg *= 0.85;
        p.hp -= dmg;
        p.iframes = IFRAMES;
        this.damageTaken += dmg;
        this.events.push({type: 'hurt', v: dmg, cause});
        if (p.hp <= 0) {
            const avail = this.stats.revival - p.revivesUsed;
            if (avail > 0) {
                p.revivesUsed++;
                p.hp = this.stats.maxHp * 0.5;
                p.iframes = 2.5;
                p.reviveT = 2.5;
                // The Purger is thrown back to the edge of the view.
                for (const b of this.bosses) {
                    if (!b.alive || !b.def.purger) continue;
                    const a = Math.atan2(b.y - p.y, b.x - p.x);
                    b.x = p.x + Math.cos(a) * this.spawnRadius();
                    b.y = p.y + Math.sin(a) * this.spawnRadius();
                }
                const big = p.relics.includes('phoenix');
                const R = big ? 620 : 400;
                this.spawnFx({kind: 'shockwave', x: p.x, y: p.y, r: R, life: 0.8, color: '#ff8a3d'});
                this.forEnemiesInCircle(p.x, p.y, R, e => {
                    if (e.def.purger) return;
                    if (e.boss) this.hitEnemy(e, e.maxHp * (big ? 0.15 : 0.08) / this.dynMul, null);
                    else this.killEnemy(e, null);
                });
                for (const b of this.bullets) b.life = 0;
                this.events.push({type: 'revive'});
            } else {
                p.hp = 0;
                p.alive = false;
                this.over = true;
                this.deathCause = cause;
                this.events.push({type: 'death'});
            }
        }
    }

    updatePlayer(dt) {
        const p = this.player;
        let ix = this.input.x || 0, iy = this.input.y || 0;
        const len = Math.hypot(ix, iy);
        if (len > 1) {
            ix /= len;
            iy /= len;
        }
        const moving = len > 0.08;
        p.moving = moving;
        let speed = PLAYER_SPEED * this.stats.moveSpeed;
        const low = p.hp < this.stats.maxHp * 0.4;
        if (p.relics.includes('laststand') && low) speed *= 1.25;
        if (p.relics.includes('kinetic') && moving) speed *= 1.1;
        p.vx = ix * speed;
        p.vy = iy * speed;
        if (moving) {
            const l = Math.hypot(ix, iy);
            p.dirX = ix / l;
            p.dirY = iy / l;
            if (Math.abs(ix) > 0.15) p.faceX = ix > 0 ? 1 : -1;
            p.angle = Math.atan2(p.dirY, p.dirX);
        }
        // Gravity wells pull the ship.
        for (const h of this.hazards) {
            if (h.kind !== 'well' || h.warn > 0) continue;
            const dx = h.x - p.x, dy = h.y - p.y, d = Math.hypot(dx, dy);
            if (d < h.r && d > 1) {
                const f = h.pull * (1 - d / h.r) + 18;
                p.vx += (dx / d) * f;
                p.vy += (dy / d) * f;
            }
        }
        const ox = p.x, oy = p.y;
        p.x += p.vx * dt;
        p.y += p.vy * dt;
        this.pushOutOfObstacles(p);
        p.distance += Math.hypot(p.x - ox, p.y - oy);

        if (p.iframes > 0) p.iframes -= dt;
        if (p.reviveT > 0) p.reviveT -= dt;
        let regen = this.stats.recovery;
        if (p.relics.includes('laststand') && low) regen *= 1.5;
        if (regen > 0 && p.hp < this.stats.maxHp) this.heal(regen * dt);
        if (p.resT > 0) {
            p.resT -= dt;
            if (p.resT <= 0) p.resStacks = 0;
        }

        // Relic effects that tick
        if (p.relics.includes('storm')) {
            this.stormT -= dt;
            if (this.stormT <= 0) {
                this.stormT = 40;
                this.vacuum();
                this.events.push({type: 'warning', text: 'Magnetic storm'});
            }
        }
        if (p.relics.includes('frost') && moving) {
            this.trailT -= dt;
            if (this.trailT <= 0) {
                this.trailT = 0.16;
                this.projectiles.push({
                    kind: 'zone', style: 'frost', x: p.x, y: p.y, r: 24 * this.stats.area, life: 2.4, max: 2.4,
                    tick: 0.5, tickT: 0, dmg: 5 * this.stats.might, src: null, color: '#9ff4ff', slow: 0.3,
                });
            }
        }
    }

    // ------------------------------------------------------------ enemies loop

    updateEnemies(dt) {
        const p = this.player;
        const farR = this.spawnRadius() + 380;
        const farR2 = farR * farR;
        const dil = p.relics.includes('dilation') ? 0.88 : 1;
        const stasis = this.freezeT > 0;

        for (const e of this.enemies) {
            if (!e.alive) continue;
            if (e.flash > 0) e.flash -= dt;
            const frozen = (stasis && !e.def.purger) || e.freezeT > 0;
            if (e.freezeT > 0) e.freezeT -= dt;
            if (e.slowT > 0) e.slowT -= dt;

            if (!frozen) updateEnemy(this, e, dt);
            else {
                e.vx = 0;
                e.vy = 0;
            }
            if (!e.alive) continue; // bombers remove themselves

            let mul = dil;
            if (e.slowT > 0) mul *= 1 - e.slowF;
            e.x += (e.vx * mul + e.kx) * dt;
            e.y += (e.vy * mul + e.ky) * dt;
            const decay = Math.exp(-9 * dt);
            e.kx *= decay;
            e.ky *= decay;
            if (e.vx || e.vy) e.ang = Math.atan2(e.vy, e.vx);

            if (this.stage.obstacles && e.ai !== 'ghost' && !e.def.crate) this.pushOutOfObstacles(e);

            // Recycle enemies left far behind.
            const d2 = dist2(e.x, e.y, p.x, p.y);
            if (d2 > farR2) {
                if (e.ai === 'stream' || e.def.crate) {
                    e.alive = false;
                    if (e.def.crate) this.crateCount--;
                } else {
                    const pt = this.spawnPoint();
                    e.x = pt.x;
                    e.y = pt.y;
                    e.kx = e.ky = 0;
                }
            }
        }
    }

    separate() {
        const near = this.tmpA;
        for (const e of this.enemies) {
            if (!e.alive || e.ai === 'ghost' || e.ai === 'stream' || e.def.crate) continue;
            if (((e.id + this.frame) & 1) === 1 && !e.boss) continue; // half the crowd per step
            this.grid.query(e.x, e.y, e.r + 32, near);
            for (let i = 0; i < near.length; i++) {
                const o = near[i];
                if (o === e || !o.alive || o.ai === 'ghost' || o.def.crate) continue;
                const dx = e.x - o.x, dy = e.y - o.y;
                const rr = e.r + o.r;
                const d2 = dx * dx + dy * dy;
                if (d2 >= rr * rr || d2 === 0) continue;
                const d = Math.sqrt(d2);
                const push = (rr - d) * 0.5;
                const nx = dx / d, ny = dy / d;
                // Heavier (bigger) enemies get pushed less.
                const we = o.r / rr, wo = e.r / rr;
                if (!e.boss) {
                    e.x += nx * push * we;
                    e.y += ny * push * we;
                }
                if (!o.boss) {
                    o.x -= nx * push * wo;
                    o.y -= ny * push * wo;
                }
            }
        }
    }

    contactDamage() {
        const p = this.player;
        // Own list: a revive inside hurtPlayer re-queries tmpA.
        const near = this.grid.query(p.x, p.y, p.r + MAX_ENEMY_R, this.contactList || (this.contactList = []));
        let worst = null;
        for (const e of near) {
            if (!e.alive || e.def.crate || e.dmg <= 0) continue;
            if (e.freezeT > 0 || (this.freezeT > 0 && !e.def.purger)) continue;
            const rr = (e.r + p.r) * 0.9;
            if (dist2(e.x, e.y, p.x, p.y) < rr * rr) {
                if (!worst || e.dmg > worst.dmg) worst = e;
            }
        }
        if (worst) {
            if (worst.def.purger) {
                if (p.reviveT <= 0) this.hurtPlayer(worst.dmg, 'The Purger', true);
                return;
            }
            const before = p.iframes;
            this.hurtPlayer(worst.dmg, 'contact');
            if (p.iframes > before) {
                // Landing a hit bounces the attackers back, giving the pilot room to escape.
                for (const e of near) {
                    if (!e.alive || e.def.crate || e.boss) continue;
                    const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
                    if (d > e.r + p.r + 24) continue;
                    const k = 260 * (1 - e.def.kbRes * 0.7);
                    e.kx += (dx / d) * k;
                    e.ky += (dy / d) * k;
                    if (e.ai === 'charger' && e.state === 2) e.timer = 0;
                }
            }
        }
    }

    fireBullet(x, y, ang, speed, dmg, r = 6, color = '#ff4d6d') {
        const dil = this.player.relics.includes('dilation') ? 0.7 : 1;
        this.bullets.push({x, y, vx: Math.cos(ang) * speed * dil, vy: Math.sin(ang) * speed * dil, r, dmg, life: 7, color});
    }

    updateBullets(dt) {
        const p = this.player;
        const stasis = this.freezeT > 0;
        let j = 0;
        for (let i = 0; i < this.bullets.length; i++) {
            const b = this.bullets[i];
            if (!stasis) {
                b.x += b.vx * dt;
                b.y += b.vy * dt;
                b.life -= dt;
            }
            const rr = b.r + p.r * 0.8;
            if (b.life > 0 && dist2(b.x, b.y, p.x, p.y) < rr * rr) {
                this.hurtPlayer(b.dmg, 'projectile');
                b.life = 0;
            }
            if (b.life > 0 && this.stage.obstacles && this.blockedAt(b.x, b.y, b.r * 0.5)) b.life = 0;
            if (b.life > 0) this.bullets[j++] = b;
        }
        this.bullets.length = j;
    }

    // ------------------------------------------------------------ main step

    step(dt) {
        if (this.over || this.choice) return;
        this.time += dt;
        this.frame++;
        this.dynMul = this.dynamicMight();

        // Timers (scheduled closures)
        if (this.timers.length) {
            const due = [];
            this.timers = this.timers.filter(t => {
                if (t.t <= this.time) {
                    due.push(t);
                    return false;
                }
                return true;
            });
            for (const t of due) t.fn();
        }

        if (this.freezeT > 0) this.freezeT -= dt;

        this.updatePlayer(dt);
        this.updateSpawning(dt);
        this.updateEnemies(dt);

        this.grid.clear();
        for (const e of this.enemies) if (e.alive) this.grid.insert(e);
        this.separate();
        this.contactDamage();

        for (const w of this.player.weapons) {
            const s = this.weaponStats(w);
            BEHAVIORS[w.def.behavior](this, w, s, dt);
        }

        let j = 0;
        for (let i = 0; i < this.projectiles.length; i++) {
            const pr = this.projectiles[i];
            if (!pr.dead) updateProjectile(this, pr, dt);
            if (!pr.dead) this.projectiles[j++] = pr;
        }
        this.projectiles.length = j;

        this.updateBullets(dt);

        j = 0;
        for (let i = 0; i < this.hazards.length; i++) {
            const h = this.hazards[i];
            if (!h.dead) updateHazard(this, h, dt);
            if (!h.dead) this.hazards[j++] = h;
        }
        this.hazards.length = j;

        this.updatePickups(dt);

        j = 0;
        for (let i = 0; i < this.enemies.length; i++) {
            const e = this.enemies[i];
            if (e.alive) this.enemies[j++] = e;
        }
        this.enemies.length = j;
        if (this.bosses.length) this.bosses = this.bosses.filter(b => b.alive);

        j = 0;
        for (let i = 0; i < this.fx.length; i++) {
            const f = this.fx[i];
            f.age += dt;
            if (f.age < f.life) this.fx[j++] = f;
        }
        this.fx.length = j;

        for (const w of this.player.weapons) if (w.data.healBudget) w.data.healBudget = Math.max(0, w.data.healBudget - dt * 6);

        if (!this.cleared && this.time >= RUN_LENGTH) this.clearStage();
    }

    clearStage() {
        this.cleared = true;
        this.clearTime = this.time;
        for (const e of this.enemies) {
            if (e.alive && !e.def.crate) this.killEnemy(e, null, true);
        }
        this.bullets.length = 0;
        for (const h of this.hazards) h.dead = true;
        this.purgerT = 3;
        this.events.push({type: 'clear'});
    }
}
