// Autopilot: steers away from threats toward pickups and makes build choices.
// Drives the title-screen attract mode and the headless balance test.

import {WEAPONS} from './content.js';

export class Bot {
    constructor(game) {
        this.g = game;
    }

    steer() {
        const g = this.g, p = g.player;
        const speed = 150 * g.stats.moveSpeed;
        const H = 0.35; // look-ahead seconds
        if (!this.anchor) this.anchor = {x: p.x, y: p.y};
        this.anchor.x += (p.x - this.anchor.x) * 0.002;
        this.anchor.y += (p.y - this.anchor.y) * 0.002;

        // Threats near enough to matter, with predicted positions.
        const threats = [];
        for (const e of g.enemies) {
            if (!e.alive || e.def.crate) continue;
            const dx = e.x - p.x, dy = e.y - p.y;
            if (dx * dx + dy * dy > 340 * 340) continue;
            let w = e.boss ? 3 : 1;
            if (e.def.purger) w = 10;
            let r = e.r;
            if (e.ai === 'bomber' && e.state === 1) {
                r = e.def.blast + 10;
                w = 4;
            }
            if (e.ai === 'charger' && e.state >= 1) w = 3;
            // Chasers home in on wherever we go: model them as closing by speed * H.
            const chaser = e.ai !== 'stream' && e.ai !== 'crate' && !(e.ai === 'charger' && e.state === 2);
            threats.push(chaser ? {x: e.x, y: e.y, r: r + e.speed * H * 0.8, w} : {x: e.x + e.vx * H, y: e.y + e.vy * H, r, w});
        }
        for (const b of g.bullets) {
            const dx = b.x - p.x, dy = b.y - p.y;
            if (dx * dx + dy * dy > 220 * 220) continue;
            threats.push({x: b.x + b.vx * H * 0.6, y: b.y + b.vy * H * 0.6, r: b.r + 4, w: 2.5});
        }
        for (const h of g.hazards) {
            if (h.kind === 'blast') threats.push({x: h.x, y: h.y, r: h.r + 8, w: 6, zone: true});
            else if (h.kind === 'well') threats.push({x: h.x, y: h.y, r: h.core + 40, w: 6, zone: true});
        }
        const beams = g.hazards.filter(h => h.kind === 'beam');

        // Best pickup target.
        let goal = null, bd = 1e12;
        const lowHp = p.hp < g.stats.maxHp * 0.5;
        for (const pk of g.pickups) {
            if (pk.attracted) continue;
            const d2 = (pk.x - p.x) ** 2 + (pk.y - p.y) ** 2;
            if (d2 > 520 * 520) continue;
            let pri = d2;
            if (pk.kind === 'chest' || pk.kind === 'relic') pri *= 0.1;
            else if (pk.kind === 'heal') pri *= lowHp ? 0.1 : 6;
            else if (pk.kind === 'magnet' || pk.kind === 'bomb' || pk.kind === 'freeze') pri *= 0.3;
            if (pri < bd) {
                bd = pri;
                goal = pk;
            }
        }

        // Short-range builds have to get close to do damage.
        const ranged = p.weapons.some(w => !['orbit', 'nova', 'lash'].includes(w.def.behavior));
        let prey = null;
        if (!ranged) {
            let pd = 1e12;
            for (const e of g.enemies) {
                if (!e.alive || e.def.crate || e.boss) continue;
                const d2 = (e.x - p.x) ** 2 + (e.y - p.y) ** 2;
                if (d2 < pd) {
                    pd = d2;
                    prey = e;
                }
            }
        }

        let best = null, bestScore = 1e18;
        const N = 16;
        for (let i = 0; i <= N; i++) {
            const still = i === N;
            const a = (i / N) * Math.PI * 2;
            const dx = still ? 0 : Math.cos(a), dy = still ? 0 : Math.sin(a);
            const x = p.x + dx * speed * H, y = p.y + dy * speed * H;
            let danger = 0;
            for (const t of threats) {
                const gap = Math.hypot(t.x - x, t.y - y) - t.r - p.r;
                if (t.zone && gap < 0) danger += t.w * 50;
                const gg = Math.max(3, gap + 6);
                danger += t.w * 600 / (gg * gg);
            }
            for (const h of beams) {
                const ca = Math.cos(h.ang), sa = Math.sin(h.ang);
                const rx = x - h.x, ry = y - h.y;
                const along = rx * ca + ry * sa;
                const perp = Math.abs(-rx * sa + ry * ca);
                if (along > 0 && along < h.len && perp < h.w + 40) danger += (h.warn > 0 ? 6 : 20);
            }
            g.forObstaclesNear(x, y, o => {
                const gap = Math.hypot(o.x - x, o.y - y) - o.r - p.r;
                if (gap < 10) danger += 3;
            });
            let score = ranged ? danger : danger * 0.45;
            if (prey) score += Math.abs(Math.hypot(prey.x - x, prey.y - y) - 75) * 0.004;
            if (goal) score += Math.hypot(goal.x - x, goal.y - y) * 0.02 * (goal.kind === 'chest' || goal.kind === 'relic' ? 3 : 1);
            // Prefer circling the anchor (keeps gems in reach) and keeping momentum.
            const ax = x - this.anchor.x, ay = y - this.anchor.y, ad = Math.hypot(ax, ay) || 1;
            score += Math.abs(ad - 260) * 0.002;
            if (this.last && !still) score -= (dx * this.last.x + dy * this.last.y) * 0.08;
            if (still) score += 0.05;
            if (score < bestScore) {
                bestScore = score;
                best = {x: dx, y: dy};
            }
        }
        this.last = best;
        return best;
    }

    // Picks for the current choice. Returns the option index.
    decide() {
        const g = this.g, c = g.choice;
        if (!c) return -1;
        if (c.kind === 'chest') return 0;
        if (c.kind === 'relic') {
            const prefs = ['critmass', 'twin', 'phoenix', 'chain', 'resonance', 'fortune', 'laststand', 'dilation', 'bulwark', 'echo', 'kinetic', 'storm', 'frost', 'glass'];
            let best = 0, bs = 1e9;
            c.options.forEach((id, i) => {
                const s = prefs.indexOf(id);
                if (s >= 0 && s < bs) {
                    bs = s;
                    best = i;
                }
            });
            return best;
        }
        const p = g.player;
        const wantPassives = new Set(p.weapons.filter(w => !w.def.evolved && w.def.evo).map(w => w.def.evo.with));
        let best = 0, bs = -1e9;
        c.options.forEach((o, i) => {
            let s = 0;
            if (o.type === 'weapon') {
                const w = g.findWeapon(o.id);
                s = o.isNew ? 60 : 50 + (w ? w.level * 3 : 0);
                // Spread the slots: owned weapons with a matching passive first.
                if (!o.isNew && w && w.def.evo && g.findPassive(w.def.evo.with)) s += 25;
                if (o.isNew && p.weapons.length >= 4) s -= 15;
                if (o.isNew && g.findPassive(WEAPONS[o.id].evo.with)) s += 20;
            } else if (o.type === 'passive') {
                s = o.isNew ? 30 : 35;
                if (wantPassives.has(o.id)) s += 40;
                if (o.id === 'plating' || o.id === 'armor' || o.id === 'repair') s += 8;
            } else {
                s = 1;
            }
            if (s > bs) {
                bs = s;
                best = i;
            }
        });
        return best;
    }

    // Applies one tick of autopilot (input + any pending choice).
    act() {
        const g = this.g;
        if (g.choice) {
            g.choose(this.decide());
            return;
        }
        g.input = this.steer();
    }
}
