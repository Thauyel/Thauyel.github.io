// Enemies, bosses and the three stages with their minute-by-minute wave tables.

export const RUN_LENGTH = 900; // seconds (15:00)

// shape: render hint. ai: behaviour in enemies.js.
export const ENEMIES = {
    drone: {name: 'Seeker Drone', shape: 'tri', color: '#ff3df2', r: 11, hp: 8, speed: 72, dmg: 5, xp: 1, ai: 'chase', desc: 'Basic chaser. Comes in numbers.'},
    swarmer: {name: 'Swarmer', shape: 'diamond', color: '#ffb000', r: 8, hp: 5, speed: 112, dmg: 3, xp: 1, ai: 'wobble', desc: 'Small, fast and erratic.'},
    brute: {name: 'Brute', shape: 'square', color: '#ff4d4d', r: 18, hp: 55, speed: 50, dmg: 10, xp: 4, ai: 'chase', kbRes: 0.7, desc: 'Slow armored block. Hard to push back.'},
    spitter: {name: 'Spitter', shape: 'penta', color: '#7dff4d', r: 13, hp: 22, speed: 62, dmg: 5, xp: 3, ai: 'ranged', range: 260, fire: 2.6, shot: 6, desc: 'Keeps its distance and fires plasma.'},
    charger: {name: 'Lancer', shape: 'arrow', color: '#ff7a1a', r: 14, hp: 32, speed: 66, dmg: 9, xp: 3, ai: 'charger', desc: 'Locks on, then dashes at high speed.'},
    splitter: {name: 'Mitosis Cell', shape: 'cell', color: '#3dffb0', r: 15, hp: 36, speed: 56, dmg: 7, xp: 2, ai: 'chase', split: 'splitling', splitN: 3, desc: 'Divides into three when destroyed.'},
    splitling: {name: 'Cell Fragment', shape: 'circle', color: '#3dffb0', r: 8, hp: 9, speed: 92, dmg: 4, xp: 1, ai: 'wobble', desc: 'Fragment of a Mitosis Cell.'},
    bomber: {name: 'Volatile', shape: 'star', color: '#ffe14d', r: 13, hp: 24, speed: 84, dmg: 6, xp: 3, ai: 'bomber', blast: 84, blastDmg: 16, desc: 'Arms itself near you, then detonates. Hurts other enemies too.'},
    phaser: {name: 'Phaser', shape: 'ring', color: '#b06bff', r: 12, hp: 30, speed: 58, dmg: 7, xp: 3, ai: 'phaser', desc: 'Blinks through space toward you.'},
    shard: {name: 'Crystal Crawler', shape: 'hex', color: '#7ae8ff', r: 12, hp: 22, speed: 60, dmg: 6, xp: 2, ai: 'chase', armor: 1, desc: 'Crystalline shell: reduces every hit by 1.'},
    weaver: {name: 'Weaver', shape: 'flower', color: '#ff5fa2', r: 16, hp: 50, speed: 52, dmg: 8, xp: 5, ai: 'caster', range: 300, fire: 4, shot: 7, burst: 8, desc: 'Weaves rings of plasma from a distance.'},
    wraith: {name: 'Void Wraith', shape: 'wisp', color: '#c4b5ff', r: 10, hp: 12, speed: 116, dmg: 4, xp: 2, ai: 'ghost', desc: 'Fast and incorporeal: drifts through other enemies.'},
    titan: {name: 'Titan', shape: 'octa', color: '#ff2d55', r: 30, hp: 420, speed: 40, dmg: 18, xp: 24, ai: 'chase', kbRes: 0.95, desc: 'Massive. Barely moves when hit.'},
    crate: {name: 'Supply Crate', shape: 'crate', color: '#ffd36b', r: 14, hp: 1, speed: 0, dmg: 0, xp: 0, ai: 'crate', crate: true, desc: 'Break it open for supplies.'},
};

export const BOSSES = {
    sentinel: {name: 'Sentinel', shape: 'octa', color: '#ff3df2', r: 34, hp: 900, speed: 72, dmg: 16, xp: 60, patterns: ['radial', 'charge', 'aimed'], desc: 'Guardian unit. Bullet rings and charges.'},
    hive: {name: 'Hive Mother', shape: 'flower', color: '#ffb000', r: 38, hp: 1300, speed: 56, dmg: 16, xp: 80, patterns: ['summon', 'spiral', 'radial'], desc: 'Spawns swarms and spins bullet spirals.'},
    warden: {name: 'Prism Warden', shape: 'hex', color: '#7ae8ff', r: 36, hp: 1700, speed: 62, dmg: 18, xp: 100, patterns: ['laser', 'aimed', 'mines'], desc: 'Sweeps the field with lasers and mines.'},
    overmind: {name: 'The Overmind', shape: 'eye', color: '#ff2d55', r: 56, hp: 7000, speed: 52, dmg: 24, xp: 300, final: true, patterns: ['spiral', 'laser', 'summon', 'radial', 'charge'], desc: 'Neon Grid core intelligence.'},
    colossus: {name: 'Crystal Colossus', shape: 'hex', color: '#9ff4ff', r: 64, hp: 9000, speed: 44, dmg: 28, xp: 300, final: true, patterns: ['mines', 'radial', 'charge', 'aimed', 'summon'], desc: 'The living mountain of the Wastes.'},
    leviathan: {name: 'Void Leviathan', shape: 'eye', color: '#b06bff', r: 60, hp: 11000, speed: 66, dmg: 30, xp: 300, final: true, patterns: ['spiral', 'laser', 'charge', 'mines', 'summon'], desc: 'It swims between dimensions.'},
    purger: {name: 'The Purger', shape: 'skull', color: '#ffffff', r: 28, hp: 1e9, speed: 190, dmg: 9999, xp: 0, purger: true, patterns: [], desc: 'Arrives at 15:00. It cannot be stopped.'},
};

for (const [id, d] of Object.entries(ENEMIES)) {
    d.id = id;
    d.kbRes = d.kbRes || 0;
    d.armor = d.armor || 0;
}
for (const [id, d] of Object.entries(BOSSES)) {
    d.id = id;
    d.ai = d.purger ? 'purger' : 'boss';
    d.kbRes = 1;
    d.armor = 0;
    d.boss = true;
}

function parsePool(text) {
    return text.trim().split(/\s+/).map(tok => {
        const [id, w] = tok.split(':');
        if (!ENEMIES[id]) throw new Error(`unknown enemy ${id}`);
        return [id, Number(w)];
    });
}

// rate: spawns per second. min: enemies kept alive at least. cap: max alive.
function W(rate, min, cap, pool) {
    return {rate, min, cap, pool: parsePool(pool)};
}

// Pressure ramps up over the run on top of the hand-written tables.
function ramp(waves) {
    return waves.map((w, i) => ({...w, rate: w.rate * (1.15 + i * 0.07), min: Math.round(w.min * (1.1 + i * 0.04))}));
}

// Repeating events are expanded into a flat, time-sorted list.
function expand(events) {
    const out = [];
    for (const ev of events) {
        if (ev.every) {
            for (let t = ev.t; t <= (ev.until ?? RUN_LENGTH - 1); t += ev.every) out.push({...ev, t, every: undefined});
        } else {
            out.push(ev);
        }
    }
    out.sort((a, b) => a.t - b.t);
    return out;
}

export const STAGES = {
    grid: {
        name: 'Neon Grid', tag: 'Normal', difficulty: 1,
        desc: 'An endless digital plain. Data streams cut across the field.',
        hpMult: 1, dmgMult: 1, spawnMult: 1, scoreMult: 1, hpGrowth: 0.28, bossMult: 1,
        bg: {base: '#07020f', base2: '#14062a', grid: 'rgba(255, 61, 242, 0.13)', major: 'rgba(61, 242, 255, 0.22)', pattern: 'grid'},
        music: {root: 45, scale: [0, 3, 7, 10, 12, 15], tempo: 118},
        final: 'overmind',
        waves: ramp([
            W(1.0, 8, 50, 'drone:1'),
            W(1.5, 14, 70, 'drone:3 swarmer:2'),
            W(1.9, 20, 90, 'drone:2 swarmer:2 spitter:1'),
            W(2.3, 25, 110, 'drone:2 swarmer:1 brute:1 spitter:1'),
            W(2.7, 30, 130, 'drone:2 swarmer:2 charger:1 spitter:1'),
            W(3.0, 35, 150, 'drone:2 swarmer:2 brute:1 charger:1 bomber:1'),
            W(3.4, 40, 170, 'drone:2 brute:2 bomber:1 spitter:1'),
            W(3.8, 45, 190, 'drone:2 swarmer:3 charger:2 weaver:1'),
            W(4.2, 50, 210, 'drone:2 brute:2 bomber:2 spitter:1'),
            W(4.6, 55, 230, 'drone:2 swarmer:2 charger:1 weaver:1 brute:1'),
            W(5.0, 60, 250, 'swarmer:2 brute:2 bomber:1 titan:0.3'),
            W(5.5, 65, 270, 'drone:2 charger:2 weaver:1 spitter:2 titan:0.3'),
            W(6.0, 70, 290, 'swarmer:3 brute:2 bomber:2 titan:0.5'),
            W(6.5, 75, 310, 'drone:3 charger:2 weaver:1 titan:0.5'),
            W(7.5, 85, 340, 'swarmer:3 brute:2 bomber:2 charger:2 weaver:1 titan:0.8'),
        ]),
        events: expand([
            {t: 75, kind: 'ring', type: 'swarmer', count: 20},
            {t: 90, kind: 'elite', every: 120, until: 870},
            {t: 150, kind: 'stream', type: 'swarmer', count: 18, every: 150, until: 870},
            {t: 180, kind: 'boss', boss: 'sentinel'},
            {t: 240, kind: 'ring', type: 'drone', count: 30},
            {t: 360, kind: 'boss', boss: 'hive', relic: true},
            {t: 420, kind: 'ring', type: 'brute', count: 12},
            {t: 540, kind: 'boss', boss: 'warden'},
            {t: 600, kind: 'ring', type: 'swarmer', count: 40},
            {t: 720, kind: 'boss', boss: 'sentinel', relic: true},
            {t: 760, kind: 'ring', type: 'charger', count: 20},
            {t: 780, kind: 'boss', boss: 'overmind'},
            {t: 840, kind: 'ring', type: 'swarmer', count: 50},
        ]),
    },
    wastes: {
        name: 'Crystal Wastes', tag: 'Hard', difficulty: 2,
        desc: 'Crystal pillars block your path. Shard storms rain from above.',
        hpMult: 1.25, dmgMult: 1.1, spawnMult: 1.1, scoreMult: 1.5, hpGrowth: 0.3, bossMult: 1.3,
        bg: {base: '#020a10', base2: '#062030', grid: 'rgba(122, 232, 255, 0.12)', major: 'rgba(196, 255, 61, 0.16)', pattern: 'hex'},
        music: {root: 43, scale: [0, 2, 3, 7, 8, 12], tempo: 124},
        obstacles: {per: 2, minR: 22, maxR: 58, color: '#7ae8ff'},
        final: 'colossus',
        waves: ramp([
            W(1.1, 10, 55, 'shard:1 drone:2'),
            W(1.6, 16, 75, 'shard:2 drone:2 splitter:1'),
            W(2.0, 22, 95, 'shard:2 splitter:2 spitter:1'),
            W(2.4, 27, 115, 'shard:2 splitter:1 charger:1 drone:2'),
            W(2.8, 32, 135, 'shard:2 splitter:2 brute:1 spitter:1'),
            W(3.2, 37, 155, 'shard:3 charger:2 bomber:1'),
            W(3.6, 42, 175, 'splitter:2 brute:2 spitter:2 drone:2'),
            W(4.0, 47, 195, 'shard:3 bomber:2 charger:1 weaver:1'),
            W(4.4, 52, 215, 'splitter:3 brute:2 shard:2'),
            W(4.8, 57, 235, 'shard:3 charger:2 spitter:2 titan:0.15'),
            W(5.2, 62, 255, 'splitter:3 bomber:2 brute:2 titan:0.15'),
            W(5.7, 67, 275, 'shard:3 weaver:1 charger:2 titan:0.2'),
            W(6.2, 72, 295, 'splitter:3 brute:2 bomber:2 titan:0.25'),
            W(6.8, 78, 315, 'shard:3 charger:2 weaver:2 titan:0.3'),
            W(7.8, 88, 345, 'shard:3 splitter:3 brute:2 bomber:2 titan:0.4'),
        ]),
        events: expand([
            {t: 70, kind: 'ring', type: 'shard', count: 18},
            {t: 90, kind: 'elite', every: 110, until: 870},
            {t: 180, kind: 'boss', boss: 'warden'},
            {t: 200, kind: 'hazard', hazard: 'shardstorm', every: 45, until: 880},
            {t: 260, kind: 'ring', type: 'splitter', count: 16},
            {t: 360, kind: 'boss', boss: 'sentinel', relic: true},
            {t: 450, kind: 'ring', type: 'charger', count: 18},
            {t: 540, kind: 'boss', boss: 'hive'},
            {t: 630, kind: 'ring', type: 'shard', count: 36},
            {t: 720, kind: 'boss', boss: 'warden', relic: true},
            {t: 780, kind: 'boss', boss: 'colossus'},
            {t: 830, kind: 'ring', type: 'splitter', count: 30},
        ]),
    },
    void: {
        name: 'Void Core', tag: 'Extreme', difficulty: 3,
        desc: 'The edge of reality. Gravity wells drag you toward oblivion.',
        hpMult: 1.45, dmgMult: 1.25, spawnMult: 1.2, scoreMult: 2, hpGrowth: 0.32, bossMult: 1.6,
        bg: {base: '#030008', base2: '#12002a', grid: 'rgba(176, 107, 255, 0.10)', major: 'rgba(255, 45, 85, 0.14)', pattern: 'void'},
        music: {root: 41, scale: [0, 1, 5, 7, 8, 12], tempo: 132},
        final: 'leviathan',
        waves: ramp([
            W(1.2, 12, 60, 'wraith:1 drone:2'),
            W(1.8, 18, 80, 'wraith:2 phaser:1 drone:2'),
            W(2.2, 24, 100, 'wraith:2 phaser:1 swarmer:2'),
            W(2.6, 29, 120, 'wraith:2 phaser:2 bomber:1 swarmer:1'),
            W(3.0, 34, 140, 'wraith:2 weaver:1 phaser:1 splitter:1'),
            W(3.4, 39, 160, 'wraith:3 bomber:2 phaser:1 swarmer:2'),
            W(3.8, 44, 180, 'wraith:2 weaver:1 splitter:2 charger:1'),
            W(4.2, 49, 200, 'wraith:3 phaser:2 bomber:2'),
            W(4.6, 54, 220, 'wraith:2 weaver:2 splitter:2 titan:0.1'),
            W(5.0, 59, 240, 'wraith:3 phaser:2 charger:2 titan:0.15'),
            W(5.5, 64, 260, 'wraith:3 bomber:2 weaver:1 titan:0.2'),
            W(6.0, 69, 280, 'wraith:3 phaser:2 splitter:2 titan:0.25'),
            W(6.5, 74, 300, 'wraith:4 weaver:2 charger:2 titan:0.25'),
            W(7.1, 80, 320, 'wraith:4 phaser:2 bomber:2 titan:0.3'),
            W(8.0, 90, 350, 'wraith:4 weaver:2 splitter:2 charger:2 titan:0.4'),
        ]),
        events: expand([
            {t: 60, kind: 'ring', type: 'wraith', count: 24},
            {t: 90, kind: 'elite', every: 100, until: 870},
            {t: 150, kind: 'hazard', hazard: 'gravwell', every: 50, until: 880},
            {t: 180, kind: 'boss', boss: 'hive'},
            {t: 240, kind: 'stream', type: 'wraith', count: 22, every: 120, until: 870},
            {t: 360, kind: 'boss', boss: 'warden', relic: true},
            {t: 420, kind: 'ring', type: 'phaser', count: 20},
            {t: 540, kind: 'boss', boss: 'sentinel'},
            {t: 600, kind: 'ring', type: 'wraith', count: 48},
            {t: 720, kind: 'boss', boss: 'hive', relic: true},
            {t: 780, kind: 'boss', boss: 'leviathan'},
            {t: 820, kind: 'ring', type: 'bomber', count: 24},
        ]),
    },
};
for (const [id, d] of Object.entries(STAGES)) d.id = id;
