// ============================================================
//  NEON SURVIVOR
//  Twin-stick arena survival (the portfolio's easter egg).
//
//  - Fixed 60 Hz simulation with interpolated rendering, so motion is smooth on any
//    refresh rate and the game logic is deterministic for a given seed.
//  - Uniform spatial grid for collisions, separation and targeting.
//  - Pooled particles drawn as cached glow sprites with additive blending.
//  - Procedural Web Audio soundtrack driven by a look-ahead scheduler.
//  - Keyboard + mouse, gamepad and touch twin-stick controls.
// ============================================================

const TICK = 1 / 60;
const MAX_STEPS_PER_FRAME = 6;
const ARENA = { w: 3600, h: 3600 };
const MAX_ENEMIES = 240;
const MAX_GEMS = 400;
const PLAYER_SPEED = 250;
const DASH_TIME = 0.17;
const DASH_COOLDOWN = 1.9;
const DASH_MULT = 3.3;
const BLASTER = { dmg: 11, rate: 3.8, speed: 980, life: 0.8 };
const TAU = Math.PI * 2;

// ---------------- Utilities ----------------
const clamp = (v, lo, hi) => (v < lo ? lo : v > hi ? hi : v);
const lerp = (a, b, t) => a + (b - a) * t;
const dist2 = (ax, ay, bx, by) => { const dx = ax - bx, dy = ay - by; return dx * dx + dy * dy; };
const wrapAngle = a => a - TAU * Math.floor((a + Math.PI) / TAU);
const $ = id => document.getElementById(id);

function mulberry32(seed) {
    return function () {
        seed = (seed + 0x6D2B79F5) | 0;
        let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
}
let random = mulberry32((Date.now() ^ (Math.random() * 1e9)) >>> 0);
const rand = (a, b) => (b === undefined ? random() * a : a + random() * (b - a));
const pick = arr => arr[Math.floor(random() * arr.length)];

function weightedKey(weights) {
    let total = 0;
    for (const k in weights) total += weights[k];
    let r = random() * total;
    for (const k in weights) { r -= weights[k]; if (r < 0) return k; }
    return Object.keys(weights)[0];
}

// Draws `count` distinct entries, each with probability proportional to entry.w.
function weightedSample(entries, count) {
    const pool = entries.slice(), out = [];
    while (out.length < count && pool.length) {
        let total = 0;
        for (const e of pool) total += e.w;
        let r = random() * total, i = 0;
        for (; i < pool.length - 1; i++) { r -= pool[i].w; if (r < 0) break; }
        out.push(pool.splice(i, 1)[0]);
    }
    return out;
}

function shuffle(arr) {
    for (let i = arr.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [arr[i], arr[j]] = [arr[j], arr[i]]; }
    return arr;
}

// Removes entries failing `keep` without allocating a new array.
function prune(arr, keep) {
    let j = 0;
    for (let i = 0; i < arr.length; i++) { const v = arr[i]; if (keep(v)) arr[j++] = v; }
    arr.length = j;
}

const formatTime = s => `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
const formatNumber = n => Math.floor(n).toLocaleString('en-US');

function hexToRgb(hex) {
    const v = parseInt(hex.slice(1), 16);
    return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

// ---------------- Persistence ----------------
const STORAGE_KEY = 'neon-survivor:v2';
const prefersReducedMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
const DEFAULT_SETTINGS = { music: 0.6, sfx: 0.7, shake: !prefersReducedMotion, numbers: true, autoFire: null };

function loadSave() {
    const save = { bestScore: 0, bestTime: 0, settings: { ...DEFAULT_SETTINGS } };
    try {
        const data = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
        if (data && typeof data === 'object') {
            if (Number.isFinite(data.bestScore) && data.bestScore >= 0) save.bestScore = data.bestScore;
            if (Number.isFinite(data.bestTime) && data.bestTime >= 0) save.bestTime = data.bestTime;
            const s = data.settings || {};
            for (const key of ['music', 'sfx']) if (Number.isFinite(s[key])) save.settings[key] = clamp(s[key], 0, 1);
            for (const key of ['shake', 'numbers']) if (typeof s[key] === 'boolean') save.settings[key] = s[key];
            if (typeof s.autoFire === 'boolean') save.settings.autoFire = s.autoFire;
        }
    } catch (_) { /* Private mode or corrupt data: keep defaults. */ }
    return save;
}
const save = loadSave();
const settings = save.settings;
function persist() {
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(save)); } catch (_) { /* Storage unavailable. */ }
}

// ---------------- Icons (24×24 path data shared by the DOM and the canvas) ----------------
const circ = (cx, cy, r) => `M${cx - r} ${cy}a${r} ${r} 0 1 0 ${2 * r} 0a${r} ${r} 0 1 0 ${-2 * r} 0`;
const ICON = {
    blaster: 'M3 12h10M13 7l8 5-8 5z',
    orbital: circ(12, 12, 2.5) + circ(12, 12, 8) + circ(20, 12, 1.5),
    missile: 'M4 20l4-4M13 5l6-1-1 6-8 8-5-5zM8 12l-3 1 6 6 1-3',
    tesla: 'M13 2L5 14h6l-1 8 8-12h-6z',
    inferno: 'M12 22c4 0 7-3 7-7 0-5-5-7-5-12-3 2-4 5-4 8-1-1-2-2-2-4-2 2-3 5-3 8 0 4 3 7 7 7z',
    saw: circ(12, 12, 3) + 'M12 2l3 5H9zM22 12l-5 3V9zM12 22l-3-5h6zM2 12l5-3v6z',
    swarm: 'M6 4l4 6H2zM18 4l4 6h-8zM12 14l4 6H8z',
    nova: circ(12, 12, 2) + circ(12, 12, 6) + circ(12, 12, 10),
    might: 'M12 2l2.5 6.5L21 9l-5 4.5L17.5 21 12 17l-5.5 4L8 13.5 3 9l6.5-.5z',
    haste: 'M4 6l6 6-6 6M12 6l6 6-6 6',
    multishot: 'M12 21V4M12 21L5 6M12 21l7-15',
    pierce: 'M2 12h18M16 7l5 5-5 5M8 5v14',
    precision: circ(12, 12, 7) + 'M12 1v6M12 17v6M1 12h6M17 12h6',
    thrusters: 'M6 13l6-6 6 6M6 20l6-6 6 6',
    graviton: 'M6 3v9a6 6 0 0 0 12 0V3M6 7h4M14 7h4',
    capacitor: 'M3 8h16v8H3zM19 10h2v4h-2M7 8v8M11 8v8',
    amplifier: 'M3 9V3h6M21 9V3h-6M3 15v6h6M21 15v6h-6',
    plating: 'M12 2l8 3v6c0 5-3.5 9-8 11-4.5-2-8-6-8-11V5z',
    nanites: circ(12, 12, 9) + 'M12 7v10M7 12h10',
    fortune: circ(8, 8, 3.5) + circ(16, 8, 3.5) + circ(8, 16, 3.5) + circ(16, 16, 3.5),
    reactor: 'M2 8h8M2 12h12M2 16h8M14 6l8 6-8 6z',
    medkit: 'M9 3h6v6h6v6h-6v6H9v-6H3V9h6z',
    nuke: circ(12, 12, 2.5) + 'M12 9.5L8 3a10 10 0 0 1 8 0zM14.2 13.3l6.8 1.4a10 10 0 0 1-4 6.9zM9.8 13.3L7 21.6a10 10 0 0 1-4-6.9z',
    magnet: 'M5 3v9a7 7 0 0 0 14 0V3h-4v9a3 3 0 0 1-6 0V3z',
    freeze: 'M12 2v20M3.3 7l17.4 10M3.3 17L20.7 7M9 4l3 2 3-2M9 20l3-2 3 2',
    credits: circ(12, 12, 9) + 'M15 8.5c-1-1-2-1.5-3-1.5-2 0-3 1-3 2.5 0 3 6 2 6 5 0 1.5-1.2 2.5-3 2.5-1.2 0-2.3-.5-3.2-1.5M12 5v14',
    data: 'M4 6h16v12H4zM8 10h8M8 14h5',
};
ICON.overclock = ICON.tesla;
ICON.shield = ICON.plating;
ICON.berserk = ICON.might;
ICON.repair = ICON.medkit;
ICON.strike = ICON.nuke;

const iconPaths = {};
const iconPath = key => iconPaths[key] || (iconPaths[key] = new Path2D(ICON[key]));
function svgIcon(key) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', ICON[key]);
    svg.appendChild(path);
    return svg;
}

// ---------------- Content ----------------
const WEAPONS = {
    orbital: {
        name: 'Ion Orbital', icon: 'orbital', color: '#3dff9a', desc: 'Plasma orbs circle you and shred anything they touch.',
        levels: [
            { count: 1, dmg: 9, radius: 78, spin: 2.6 },
            { count: 2, dmg: 11, radius: 82, spin: 2.8 },
            { count: 2, dmg: 15, radius: 92, spin: 3.0 },
            { count: 3, dmg: 18, radius: 100, spin: 3.3 },
            { count: 4, dmg: 23, radius: 110, spin: 3.6 },
        ],
    },
    missile: {
        name: 'Homing Pod', icon: 'missile', color: '#ff3b6b', desc: 'Seeker missiles that explode on impact.',
        levels: [
            { count: 1, dmg: 28, cd: 1.8, blast: 60 },
            { count: 1, dmg: 38, cd: 1.55, blast: 68 },
            { count: 2, dmg: 42, cd: 1.45, blast: 74 },
            { count: 2, dmg: 54, cd: 1.25, blast: 84 },
            { count: 3, dmg: 66, cd: 1.05, blast: 96 },
        ],
    },
    tesla: {
        name: 'Tesla Coil', icon: 'tesla', color: '#7df9ff', desc: 'Lightning that arcs from enemy to enemy.',
        levels: [
            { dmg: 14, cd: 1.3, range: 230, chains: 2 },
            { dmg: 18, cd: 1.15, range: 245, chains: 3 },
            { dmg: 23, cd: 1.0, range: 260, chains: 4 },
            { dmg: 29, cd: 0.85, range: 280, chains: 5 },
            { dmg: 37, cd: 0.7, range: 300, chains: 7 },
        ],
    },
    inferno: {
        name: 'Inferno', icon: 'inferno', color: '#ff8a00', desc: 'A short-range cone of fire aimed at the nearest threat.',
        levels: [
            { dmg: 4, cd: 0.09, range: 190, spread: 0.32 },
            { dmg: 5, cd: 0.085, range: 215, spread: 0.34 },
            { dmg: 6.5, cd: 0.08, range: 240, spread: 0.38 },
            { dmg: 8, cd: 0.075, range: 270, spread: 0.42 },
            { dmg: 10, cd: 0.07, range: 310, spread: 0.48 },
        ],
    },
    saw: {
        name: 'Sawblade', icon: 'saw', color: '#d9e3ff', desc: 'Boomerang blades that cut through everything, out and back.',
        levels: [
            { count: 1, dmg: 16, cd: 2.2, range: 320, size: 12 },
            { count: 1, dmg: 22, cd: 2.0, range: 350, size: 13 },
            { count: 2, dmg: 25, cd: 1.9, range: 380, size: 13 },
            { count: 2, dmg: 31, cd: 1.7, range: 420, size: 15 },
            { count: 3, dmg: 38, cd: 1.5, range: 460, size: 16 },
        ],
    },
    swarm: {
        name: 'Swarm Drones', icon: 'swarm', color: '#00e5ff', desc: 'Companion drones fly with you and fire at nearby enemies.',
        levels: [
            { count: 2, dmg: 7, cd: 0.9 },
            { count: 3, dmg: 8, cd: 0.85 },
            { count: 3, dmg: 11, cd: 0.75 },
            { count: 4, dmg: 12, cd: 0.7 },
            { count: 5, dmg: 15, cd: 0.6 },
        ],
    },
    nova: {
        name: 'Shockwave', icon: 'nova', color: '#c084ff', desc: 'A periodic pulse that damages and repels nearby enemies.',
        levels: [
            { dmg: 18, cd: 4.0, radius: 170, knock: 260 },
            { dmg: 26, cd: 3.6, radius: 190, knock: 280 },
            { dmg: 34, cd: 3.2, radius: 215, knock: 300 },
            { dmg: 44, cd: 2.8, radius: 245, knock: 320 },
            { dmg: 58, cd: 2.4, radius: 280, knock: 360 },
        ],
    },
};
const WEAPON_MAX = 5;

const STAT_LABELS = {
    count: ['Count', v => v],
    dmg: ['Damage', v => (Number.isInteger(v) ? v : v.toFixed(1))],
    cd: ['Cooldown', v => `${+v.toFixed(3)}s`],
    radius: ['Radius', v => v],
    blast: ['Blast', v => v],
    range: ['Range', v => v],
    chains: ['Chains', v => v],
    spin: ['Spin', v => v.toFixed(1)],
    spread: ['Spread', v => `${Math.round(v * 180 / Math.PI)}°`],
    size: ['Size', v => v],
    knock: ['Knockback', v => v],
};

// Describes the change from the previous level, derived from the data so text and numbers always agree.
function describeWeaponLevel(id, level) {
    const def = WEAPONS[id];
    if (level <= 1) return def.desc;
    const before = def.levels[level - 2], after = def.levels[level - 1];
    const parts = [];
    for (const key of Object.keys(after)) {
        if (before[key] === after[key] || !STAT_LABELS[key]) continue;
        const [label, fmt] = STAT_LABELS[key];
        parts.push(`${label} ${fmt(before[key])} → ${fmt(after[key])}`);
    }
    return parts.join(' · ');
}

const RARITY = ['common', 'rare', 'epic'];
const PASSIVES = {
    might: { name: 'Hollow Points', icon: 'might', color: '#ff5c7a', rarity: 0, max: 5, desc: 'All damage +12%', apply: s => { s.damage *= 1.12; } },
    haste: { name: 'Rapid Trigger', icon: 'haste', color: '#fff35c', rarity: 0, max: 5, desc: 'Blaster fire rate +12%', apply: s => { s.fireRate *= 1.12; } },
    multishot: { name: 'Split Barrel', icon: 'multishot', color: '#ffd84d', rarity: 1, max: 4, desc: 'Blaster fires +1 projectile', apply: s => { s.projectiles += 1; } },
    pierce: { name: 'Monorail', icon: 'pierce', color: '#7df9ff', rarity: 1, max: 3, desc: 'Blaster shots pierce +1 enemy', apply: s => { s.pierce += 1; } },
    precision: { name: 'Targeting Array', icon: 'precision', color: '#ffb020', rarity: 1, max: 5, desc: 'Critical hit chance +6%', apply: s => { s.crit += 0.06; } },
    thrusters: { name: 'Ion Thrusters', icon: 'thrusters', color: '#00f3ff', rarity: 0, max: 4, desc: 'Move speed +8%', apply: s => { s.speed *= 1.08; } },
    graviton: { name: 'Graviton Field', icon: 'graviton', color: '#b26bff', rarity: 0, max: 4, desc: 'Pickup range +30%', apply: s => { s.magnet *= 1.3; } },
    capacitor: { name: 'Supercapacitor', icon: 'capacitor', color: '#3fa9ff', rarity: 1, max: 5, desc: 'Weapon cooldowns −7%', apply: s => { s.cooldown *= 0.93; } },
    amplifier: { name: 'Field Amplifier', icon: 'amplifier', color: '#c084ff', rarity: 1, max: 4, desc: 'Weapon area +10%', apply: s => { s.area *= 1.1; } },
    plating: { name: 'Nano-Mend', icon: 'plating', color: '#3dff9a', rarity: 0, max: 5, desc: 'Max integrity +1 and repair 1', apply: s => { s.maxHp += 1; } },
    nanites: { name: 'Repair Swarm', icon: 'nanites', color: '#3dff9a', rarity: 2, max: 3, desc: 'Regenerate 1 integrity every 16s (stacks)', apply: s => { s.regen += 1 / 16; } },
    fortune: { name: 'Greed Protocol', icon: 'fortune', color: '#ffd84d', rarity: 2, max: 4, desc: 'Luck +15%: more drops, credits and rare upgrades', apply: s => { s.luck *= 1.15; } },
    reactor: { name: 'Blink Reactor', icon: 'reactor', color: '#00f3ff', rarity: 1, max: 3, desc: 'Dash cooldown −15%', apply: s => { s.dashCd *= 0.85; } },
};

const AUGMENTS = {
    nanite: { name: 'Nanite Rounds', icon: 'might', color: '#ff5c7a', desc: 'Damage +8%', cost: 240, max: 6, apply: s => { s.damage *= 1.08; } },
    servo: { name: 'Servo Motors', icon: 'thrusters', color: '#00f3ff', desc: 'Move speed +6%', cost: 200, max: 5, apply: s => { s.speed *= 1.06; } },
    hull: { name: 'Hull Plating', icon: 'plating', color: '#3dff9a', desc: 'Max integrity +1', cost: 320, max: 5, apply: s => { s.maxHp += 1; } },
    repairbot: { name: 'Repair Bot', icon: 'nanites', color: '#3dff9a', desc: 'Regenerate 1 integrity every 20s', cost: 300, max: 4, apply: s => { s.regen += 1 / 20; } },
    optics: { name: 'Targeting Optics', icon: 'precision', color: '#ffb020', desc: 'Critical hit chance +4%', cost: 240, max: 6, apply: s => { s.crit += 0.04; } },
    scavenger: { name: 'Scavenger', icon: 'fortune', color: '#ffd84d', desc: 'Luck +10%', cost: 200, max: 5, apply: s => { s.luck *= 1.1; } },
    tractor: { name: 'Tractor Beam', icon: 'graviton', color: '#b26bff', desc: 'Pickup range +20%', cost: 160, max: 5, apply: s => { s.magnet *= 1.2; } },
};

const SUPPLIES = {
    repair: { name: 'Repair Kit', icon: 'repair', color: '#ff3b6b', desc: 'Restore 2 integrity', cost: 120 },
    shield: { name: 'Overshield', icon: 'shield', color: '#3dff9a', desc: 'Invulnerable for 8 seconds', cost: 260 },
    strike: { name: 'Orbital Strike', icon: 'strike', color: '#ffaa00', desc: 'Obliterate every enemy on screen', cost: 420 },
    data: { name: 'Data Pack', icon: 'data', color: '#3fa9ff', desc: 'Gain 60% of a level in XP', cost: 180 },
};

const POWERUPS = {
    medkit: { name: 'Medkit', color: '#ff3b6b', desc: '+2 integrity' },
    nuke: { name: 'Tac-Nuke', color: '#ffaa00', desc: 'Screen cleared' },
    magnet: { name: 'Black Hole', color: '#b26bff', desc: 'All data collected' },
    freeze: { name: 'Zero Kelvin', color: '#7df9ff', duration: 5, desc: 'Enemies frozen' },
    overclock: { name: 'Overclock', color: '#fff35c', duration: 7, desc: 'Cooldowns halved' },
    shield: { name: 'Aegis', color: '#3dff9a', duration: 6, desc: 'Invulnerable' },
    berserk: { name: 'Berserk', color: '#ff4df0', duration: 7, desc: 'Double damage' },
};
const TIMED_POWERUPS = Object.keys(POWERUPS).filter(k => POWERUPS[k].duration);

const ENEMIES = {
    drone: { hp: 16, speed: 92, r: 13, xp: 1, credits: 3, score: 10, color: '#ff2d6f', shape: 'circle', mass: 1 },
    dart: { hp: 11, speed: 150, r: 11, xp: 1, credits: 4, score: 15, color: '#ffe14d', shape: 'triangle', mass: 0.7 },
    brute: { hp: 110, speed: 58, r: 26, xp: 5, credits: 18, score: 60, color: '#3f7bff', shape: 'square', mass: 4 },
    spitter: { hp: 30, speed: 80, r: 15, xp: 2, credits: 8, score: 25, color: '#3dff7a', shape: 'diamond', mass: 1 },
    splitter: { hp: 54, speed: 74, r: 20, xp: 3, credits: 9, score: 30, color: '#ff8a00', shape: 'hex', mass: 1.6 },
    shard: { hp: 9, speed: 145, r: 9, xp: 1, credits: 1, score: 5, color: '#ffb347', shape: 'triangle', mass: 0.5 },
    boss: { hp: 2600, speed: 72, r: 62, xp: 0, credits: 400, score: 2500, color: '#b026ff', shape: 'boss', mass: 60 },
};
const MAX_ENEMY_RADIUS = 36; // largest non-boss radius (elite brute) — bosses are handled separately by the grid

const PHASES = [
    { t: 0, name: 'WAVE 1', sub: 'Initialize', rate: 0.9, mix: { drone: 1 } },
    { t: 30, name: 'WAVE 2', sub: 'Swarm', rate: 1.3, mix: { drone: 3, dart: 2 } },
    { t: 60, name: 'WAVE 3', sub: 'Heavy armor', rate: 1.6, mix: { drone: 3, dart: 1, brute: 0.8 } },
    { t: 90, name: 'WAVE 4', sub: 'Crossfire', rate: 1.9, mix: { drone: 2, dart: 2, spitter: 1.4 } },
    { t: 120, name: 'WAVE 5', sub: 'Fracture', rate: 2.2, mix: { drone: 2, splitter: 1.4, spitter: 0.8, brute: 0.5 } },
    { t: 150, name: 'WAVE 6', sub: 'Chaos', rate: 2.6, mix: { drone: 2, dart: 1.6, brute: 0.9, spitter: 1, splitter: 1 } },
    { t: 240, name: 'OVERDRIVE', sub: 'No retreat', rate: 3.0, mix: { drone: 1.6, dart: 1.6, brute: 1.2, spitter: 1.2, splitter: 1.2 } },
];
const BOSS_INTERVAL = 180;

const BASE_STATS = { damage: 1, fireRate: 1, projectiles: 1, pierce: 0, crit: 0.05, critMult: 2, speed: 1, magnet: 120, area: 1, cooldown: 1, regen: 0, maxHp: 5, luck: 1, dashCd: 1 };
const xpFor = level => Math.round(5 + level * 4 + Math.pow(level, 1.55));
const GEM_COLORS = ['#3dff9a', '#3fa9ff', '#c26bff'];
const gemTier = v => (v >= 20 ? 2 : v >= 5 ? 1 : 0);

// ---------------- Audio ----------------
const Sound = (() => {
    let ctx = null, master, musicBus, musicFilter, arpBus, sfxBus, noiseBuf;
    let schedulerId = null, nextTime = 0, stepIndex = 0, musicOn = false, stopTimer = null;
    let intensity = 1, song = null, voices = 0;
    const kickTimes = [];
    const lastPlayed = Object.create(null);
    const STEP = 60 / 124 / 4; // sixteenth notes at 124 BPM
    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    // Chord quality per scale degree of natural minor (semitones above the key root).
    const TRIADS = { 0: [0, 3, 7], 3: [0, 4, 7], 5: [0, 3, 7], 7: [0, 3, 7], 8: [0, 4, 7], 10: [0, 4, 7] };
    const PROGRESSIONS = [[0, 8, 3, 10], [0, 5, 8, 7], [0, 10, 8, 7], [0, 3, 10, 8], [0, 8, 5, 7]];
    const ARPS = [
        [0, 1, 2, 3, 2, 1, 0, 1, 0, 1, 2, 4, 3, 2, 1, 2],
        [0, 2, 1, 3, 0, 2, 1, 4, 0, 2, 1, 3, 0, 2, 4, 3],
        [0, 0, 2, 2, 1, 1, 3, 3, 0, 0, 2, 2, 4, 4, 3, 3],
        [3, 2, 1, 0, 1, 2, 3, 4, 3, 2, 1, 0, 1, 2, 3, 2],
    ];
    const BASSES = [
        [1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 1, 1, 1, 0, 2, 1],
        [1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 1, 1, 1, 2, 2],
        [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 1, 0, 2, 1, 0],
        [0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 2, 0],
    ];

    function init() {
        if (ctx) { if (ctx.state === 'suspended') ctx.resume().catch(() => { }); return true; }
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        try { ctx = new AC(); } catch (_) { ctx = null; return false; }
        const comp = ctx.createDynamicsCompressor();
        comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 4; comp.attack.value = 0.003; comp.release.value = 0.2;
        comp.connect(ctx.destination);
        master = ctx.createGain(); master.gain.value = 0.9; master.connect(comp);
        musicFilter = ctx.createBiquadFilter(); musicFilter.type = 'lowpass'; musicFilter.frequency.value = 18000; musicFilter.Q.value = 0.7;
        musicFilter.connect(master);
        musicBus = ctx.createGain(); musicBus.gain.value = 0; musicBus.connect(musicFilter);
        arpBus = ctx.createGain(); arpBus.connect(musicBus);
        const delay = ctx.createDelay(1), feedback = ctx.createGain(), wet = ctx.createGain();
        delay.delayTime.value = STEP * 3; feedback.gain.value = 0.32; wet.gain.value = 0.28;
        arpBus.connect(delay); delay.connect(feedback); feedback.connect(delay); delay.connect(wet); wet.connect(musicBus);
        sfxBus = ctx.createGain(); sfxBus.gain.value = settings.sfx * 0.8; sfxBus.connect(master);
        noiseBuf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
        const data = noiseBuf.getChannelData(0);
        for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
        remix();
        if (ctx.state === 'suspended') ctx.resume().catch(() => { });
        return true;
    }

    function envelope(gain, t, peak, attack, decay) {
        gain.gain.setValueAtTime(0.0001, t);
        gain.gain.exponentialRampToValueAtTime(peak, t + attack);
        gain.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    }
    function osc(type, freq, t, dur, peak, dest, attack = 0.004, glideTo = 0) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = type;
        o.frequency.setValueAtTime(freq, t);
        if (glideTo) o.frequency.exponentialRampToValueAtTime(glideTo, t + attack + dur);
        envelope(g, t, peak, attack, dur);
        o.connect(g); g.connect(dest);
        o.start(t); o.stop(t + attack + dur + 0.03);
    }
    function noise(t, dur, peak, dest, type = 'highpass', freq = 6000, q = 0.7) {
        const s = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        s.buffer = noiseBuf;
        f.type = type; f.frequency.value = freq; f.Q.value = q;
        envelope(g, t, peak, 0.002, dur);
        s.connect(f); f.connect(g); g.connect(dest);
        s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
    }

    function kick(t) {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine';
        o.frequency.setValueAtTime(150, t);
        o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
        envelope(g, t, 0.9, 0.002, 0.3);
        o.connect(g); g.connect(musicBus);
        o.start(t); o.stop(t + 0.36);
        kickTimes.push(t);
    }
    function bass(t, freq) {
        const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
        o.type = 'sawtooth'; o.frequency.value = freq;
        f.type = 'lowpass'; f.Q.value = 6;
        f.frequency.setValueAtTime(220, t);
        f.frequency.exponentialRampToValueAtTime(intensity >= 3 ? 2400 : 1100, t + 0.02);
        f.frequency.exponentialRampToValueAtTime(220, t + 0.16);
        envelope(g, t, 0.28, 0.004, 0.15);
        o.connect(f); f.connect(g); g.connect(musicBus);
        o.start(t); o.stop(t + 0.2);
    }
    function pad(t, rootMidi, triad) {
        const dur = STEP * 16, f = ctx.createBiquadFilter(), g = ctx.createGain();
        f.type = 'lowpass'; f.frequency.value = 900;
        g.gain.setValueAtTime(0.0001, t);
        g.gain.linearRampToValueAtTime(0.045, t + 0.4);
        g.gain.linearRampToValueAtTime(0.0001, t + dur);
        f.connect(g); g.connect(musicBus);
        for (const interval of triad) {
            for (const detune of [-8, 8]) {
                const o = ctx.createOscillator();
                o.type = 'sawtooth'; o.frequency.value = mtof(rootMidi + interval); o.detune.value = detune;
                o.connect(f); o.start(t); o.stop(t + dur + 0.05);
            }
        }
    }

    function scheduleStep(t, i) {
        const s16 = i % 16, bar = Math.floor(i / 16) % 4;
        const degree = song.prog[bar], triad = TRIADS[degree], root = song.root + degree;
        if (s16 % 4 === 0) kick(t);
        if (s16 === 4 || s16 === 12) {
            noise(t, 0.16, 0.32, musicBus, 'bandpass', 1900, 0.9);
            osc('triangle', 190, t, 0.08, 0.16, musicBus, 0.002, 120);
        }
        if (intensity >= 2 && s16 % 2 === 1) noise(t, 0.035, 0.11, musicBus, 'highpass', 8000);
        if (intensity >= 3 && s16 % 2 === 0) noise(t, 0.02, 0.06, musicBus, 'highpass', 9500);
        const b = song.bass[s16];
        if (b) bass(t, mtof(root - 12 + (b === 2 ? 12 : 0)));
        if (intensity >= 2) {
            const tones = [0, triad[1], triad[2], 12, 12 + triad[1]];
            osc(song.arpWave, mtof(root + 24 + tones[song.arp[s16]]), t, 0.09, 0.06, arpBus, 0.003);
        }
        if (s16 === 0) pad(t, root + 12, triad);
        if (intensity >= 3 && (s16 === 0 || s16 === 6 || s16 === 10)) osc('square', mtof(root + 12), t, 0.12, 0.05, musicBus, 0.002);
    }

    function schedule() {
        const now = ctx.currentTime;
        if (nextTime < now - 0.05) nextTime = now + 0.02; // skip notes a throttled timer missed
        while (nextTime < now + 0.12) { scheduleStep(nextTime, stepIndex); nextTime += STEP; stepIndex++; }
        while (kickTimes.length > 1 && kickTimes[1] <= now) kickTimes.shift();
    }

    function remix() {
        song = {
            root: 33 + Math.floor(Math.random() * 12),
            prog: PROGRESSIONS[Math.floor(Math.random() * PROGRESSIONS.length)],
            arp: ARPS[Math.floor(Math.random() * ARPS.length)],
            bass: BASSES[Math.floor(Math.random() * BASSES.length)],
            arpWave: Math.random() < 0.5 ? 'triangle' : 'square',
        };
    }

    const SFX = {
        shoot: { gap: 0.05, play: (t, out) => osc('square', 880, t, 0.06, 0.035, out, 0.002, 320) },
        hit: { gap: 0.035, play: (t, out) => noise(t, 0.04, 0.1, out, 'bandpass', 2600, 1.2) },
        kill: { gap: 0.035, play: (t, out) => { noise(t, 0.14, 0.2, out, 'lowpass', 1800); osc('triangle', 180, t, 0.12, 0.18, out, 0.002, 60); } },
        explode: { gap: 0.08, play: (t, out) => { noise(t, 0.5, 0.45, out, 'lowpass', 900); osc('sine', 90, t, 0.4, 0.45, out, 0.002, 30); } },
        pickup: { gap: 0.03, play: (t, out, p = 0) => osc('sine', 880 * Math.pow(2, p / 12), t, 0.07, 0.08, out, 0.002) },
        levelup: { gap: 0.2, play: (t, out) => [0, 4, 7, 12].forEach((s, i) => osc('square', mtof(72 + s), t + i * 0.07, 0.14, 0.06, out, 0.003)) },
        dash: { gap: 0.1, play: (t, out) => { noise(t, 0.2, 0.22, out, 'bandpass', 1200, 0.6); osc('sawtooth', 220, t, 0.16, 0.05, out, 0.002, 660); } },
        hurt: { gap: 0.15, play: (t, out) => { osc('sawtooth', 300, t, 0.3, 0.28, out, 0.002, 60); noise(t, 0.25, 0.28, out, 'lowpass', 1200); } },
        zap: { gap: 0.06, play: (t, out) => { noise(t, 0.12, 0.18, out, 'bandpass', 4200, 2); osc('square', 1400, t, 0.08, 0.035, out, 0.001, 300); } },
        flame: { gap: 0.14, play: (t, out) => noise(t, 0.16, 0.07, out, 'bandpass', 700, 0.6) },
        missile: { gap: 0.1, play: (t, out) => noise(t, 0.25, 0.12, out, 'bandpass', 800, 0.8) },
        spit: { gap: 0.12, play: (t, out) => osc('sine', 520, t, 0.12, 0.06, out, 0.003, 180) },
        nova: { gap: 0.2, play: (t, out) => { osc('sine', 160, t, 0.5, 0.32, out, 0.003, 40); noise(t, 0.4, 0.14, out, 'lowpass', 600); } },
        powerup: { gap: 0.15, play: (t, out) => [0, 7, 12, 19].forEach((s, i) => osc('triangle', mtof(76 + s), t + i * 0.05, 0.12, 0.08, out, 0.003)) },
        warning: { gap: 1, play: (t, out) => { for (let i = 0; i < 3; i++) osc('sawtooth', 440, t + i * 0.5, 0.35, 0.1, out, 0.01, 220); } },
        click: { gap: 0.04, play: (t, out) => osc('sine', 1200, t, 0.04, 0.05, out, 0.001) },
        buy: { gap: 0.08, play: (t, out) => { osc('square', 1318, t, 0.06, 0.05, out, 0.002); osc('square', 1760, t + 0.06, 0.12, 0.05, out, 0.002); } },
        error: { gap: 0.15, play: (t, out) => osc('square', 140, t, 0.18, 0.07, out, 0.002) },
        bigboom: { gap: 0.8, play: (t, out) => { noise(t, 1.6, 0.55, out, 'lowpass', 700); osc('sine', 70, t, 1.4, 0.55, out, 0.004, 20); } },
    };

    return {
        init,
        remix,
        get ready() { return !!ctx; },
        sfx(name, pan = 0, param) {
            if (!ctx || ctx.state !== 'running' || settings.sfx <= 0.001) return;
            const def = SFX[name], t = ctx.currentTime;
            if (t - (lastPlayed[name] ?? -9) < def.gap || voices > 32) return;
            lastPlayed[name] = t;
            let out = sfxBus;
            if (pan && ctx.createStereoPanner) {
                const p = ctx.createStereoPanner();
                p.pan.value = clamp(pan, -1, 1);
                p.connect(sfxBus);
                out = p;
            }
            voices++;
            setTimeout(() => voices--, 450);
            def.play(t, out, param);
        },
        startMusic() {
            if (!ctx) return;
            clearTimeout(stopTimer);
            const now = ctx.currentTime;
            musicBus.gain.cancelScheduledValues(now);
            musicBus.gain.setTargetAtTime(settings.music * 0.55, now, 0.3);
            if (musicOn) return;
            musicOn = true;
            nextTime = now + 0.06;
            stepIndex = 0;
            if (!schedulerId) schedulerId = setInterval(schedule, 25);
        },
        stopMusic(fade = 1.5) {
            if (!ctx || !musicOn) return;
            musicOn = false;
            musicBus.gain.cancelScheduledValues(ctx.currentTime);
            musicBus.gain.setTargetAtTime(0, ctx.currentTime, fade / 4);
            stopTimer = setTimeout(() => { if (!musicOn) { clearInterval(schedulerId); schedulerId = null; } }, fade * 1000);
        },
        setIntensity(level) { intensity = level; },
        muffle(on) {
            if (!ctx) return;
            musicFilter.frequency.setTargetAtTime(on ? 650 : 18000, ctx.currentTime, 0.12);
        },
        applyVolumes() {
            if (!ctx) return;
            const now = ctx.currentTime;
            sfxBus.gain.setTargetAtTime(settings.sfx * 0.8, now, 0.05);
            if (musicOn) musicBus.gain.setTargetAtTime(settings.music * 0.55, now, 0.05);
        },
        suspend() { if (ctx && ctx.state === 'running') ctx.suspend().catch(() => { }); },
        resume() { if (ctx && ctx.state === 'suspended') ctx.resume().catch(() => { }); },
        // 1 on each kick drum, decaying to 0: drives the background pulse.
        beat() {
            if (!ctx || !musicOn || !kickTimes.length) return 0;
            const since = ctx.currentTime - kickTimes[0];
            return since < 0 ? 0 : Math.exp(-since * 6);
        },
    };
})();

// ---------------- Rendering resources ----------------
const canvas = $('game');
const ctx = canvas.getContext('2d', { alpha: false });
const view = { cssW: 1, cssH: 1, dpr: 1, zoom: 1, w: 1, h: 1, radarTop: 90 };
const cam = { x: ARENA.w / 2, y: ARENA.h / 2, shakeX: 0, shakeY: 0 };

const glowCache = new Map();
function glow(color) {
    let sprite = glowCache.get(color);
    if (!sprite) {
        sprite = document.createElement('canvas');
        sprite.width = sprite.height = 64;
        const g = sprite.getContext('2d');
        const [r, gr, b] = hexToRgb(color);
        const grad = g.createRadialGradient(32, 32, 0, 32, 32, 32);
        grad.addColorStop(0, `rgba(${r},${gr},${b},1)`);
        grad.addColorStop(0.18, `rgba(${r},${gr},${b},0.75)`);
        grad.addColorStop(0.5, `rgba(${r},${gr},${b},0.22)`);
        grad.addColorStop(1, `rgba(${r},${gr},${b},0)`);
        g.fillStyle = grad;
        g.fillRect(0, 0, 64, 64);
        glowCache.set(color, sprite);
    }
    return sprite;
}
const fillCache = new Map();
function translucent(color, alpha = 0.2) {
    const key = color + alpha;
    let v = fillCache.get(key);
    if (!v) { const [r, g, b] = hexToRgb(color); v = `rgba(${r},${g},${b},${alpha})`; fillCache.set(key, v); }
    return v;
}

// Struct-of-arrays particle pool: no per-particle allocation during play.
const particles = (() => {
    const MAX = 3500;
    const x = new Float32Array(MAX), y = new Float32Array(MAX), px = new Float32Array(MAX), py = new Float32Array(MAX);
    const vx = new Float32Array(MAX), vy = new Float32Array(MAX), life = new Float32Array(MAX), maxLife = new Float32Array(MAX);
    const size = new Float32Array(MAX), drag = new Float32Array(MAX), color = new Uint8Array(MAX);
    const palette = [], paletteIndex = new Map();
    let n = 0;
    const colorId = c => {
        let id = paletteIndex.get(c);
        if (id === undefined) { id = palette.length; palette.push(c); paletteIndex.set(c, id); }
        return id;
    };
    function copy(to, from) {
        x[to] = x[from]; y[to] = y[from]; px[to] = px[from]; py[to] = py[from]; vx[to] = vx[from]; vy[to] = vy[from];
        life[to] = life[from]; maxLife[to] = maxLife[from]; size[to] = size[from]; drag[to] = drag[from]; color[to] = color[from];
    }
    return {
        get count() { return n; },
        clear() { n = 0; },
        spawn(x0, y0, vx0, vy0, lifeTime, sz, c, dr = 3) {
            if (n >= MAX) return;
            const i = n++;
            x[i] = px[i] = x0; y[i] = py[i] = y0; vx[i] = vx0; vy[i] = vy0;
            life[i] = maxLife[i] = lifeTime; size[i] = sz; drag[i] = dr; color[i] = colorId(c);
        },
        burst(x0, y0, count, c, speed, lifeTime, sz, dr = 3) {
            for (let k = 0; k < count; k++) {
                const a = random() * TAU, s = speed * (0.25 + random() * 0.75);
                this.spawn(x0, y0, Math.cos(a) * s, Math.sin(a) * s, lifeTime * (0.5 + random() * 0.5), sz * (0.6 + random() * 0.7), c, dr);
            }
        },
        savePrev() { px.set(x.subarray(0, n)); py.set(y.subarray(0, n)); },
        update(dt) {
            for (let i = 0; i < n; i++) {
                life[i] -= dt;
                if (life[i] <= 0) { copy(i, n - 1); n--; i--; continue; }
                const f = Math.exp(-drag[i] * dt);
                vx[i] *= f; vy[i] *= f;
                x[i] += vx[i] * dt; y[i] += vy[i] * dt;
            }
        },
        draw(alpha, left, top, right, bottom) {
            ctx.globalCompositeOperation = 'lighter';
            for (let i = 0; i < n; i++) {
                const ix = px[i] + (x[i] - px[i]) * alpha, iy = py[i] + (y[i] - py[i]) * alpha;
                if (ix < left || ix > right || iy < top || iy > bottom) continue;
                const k = life[i] / maxLife[i];
                const s = size[i] * (0.35 + 0.65 * k) * 4;
                ctx.globalAlpha = k;
                ctx.drawImage(glow(palette[color[i]]), ix - s / 2, iy - s / 2, s, s);
            }
            ctx.globalAlpha = 1;
            ctx.globalCompositeOperation = 'source-over';
        },
    };
})();

// Uniform grid of enemy centres. Bosses are larger than a cell margin, so queries append them explicitly.
const grid = (() => {
    const CELL = 96;
    const cols = Math.ceil(ARENA.w / CELL), rows = Math.ceil(ARENA.h / CELL);
    const cells = Array.from({ length: cols * rows }, () => []);
    const used = [];
    return {
        clear() { for (const i of used) cells[i].length = 0; used.length = 0; },
        insert(e) {
            const cx = clamp(Math.floor(e.x / CELL), 0, cols - 1), cy = clamp(Math.floor(e.y / CELL), 0, rows - 1);
            const cell = cells[cy * cols + cx];
            if (!cell.length) used.push(cy * cols + cx);
            cell.push(e);
        },
        // Fills `out` with enemies whose bodies may overlap the circle (x, y, r). Callers do the exact test.
        query(x, y, r, out, boss) {
            out.length = 0;
            const m = r + MAX_ENEMY_RADIUS;
            const x0 = clamp(Math.floor((x - m) / CELL), 0, cols - 1), x1 = clamp(Math.floor((x + m) / CELL), 0, cols - 1);
            const y0 = clamp(Math.floor((y - m) / CELL), 0, rows - 1), y1 = clamp(Math.floor((y + m) / CELL), 0, rows - 1);
            for (let cy = y0; cy <= y1; cy++) {
                for (let cx = x0; cx <= x1; cx++) {
                    const cell = cells[cy * cols + cx];
                    for (let i = 0; i < cell.length; i++) out.push(cell[i]);
                }
            }
            if (boss && !boss.dead) out.push(boss);
            return out;
        },
    };
})();
// Separate buffers so nested queries (an explosion inside a projectile hit) never clobber each other.
const bufProjectile = [], bufExplosion = [], bufNearest = [], bufSeparation = [], bufOrbital = [], bufRing = [], bufContact = [];

// ---------------- Input ----------------
const input = {
    keys: new Set(),
    mouse: { x: 0, y: 0, down: false },
    touch: { move: { id: null, ox: 0, oy: 0, x: 0, y: 0 }, aim: { id: null, ox: 0, oy: 0, x: 0, y: 0 } },
    pad: { connected: false, mx: 0, my: 0, ax: 0, ay: 0, am: 0, fire: false, prev: [], navT: 0 },
    aimDevice: 'none', // which device last aimed: 'mouse' | 'pad' | 'touch' | 'none'
    touchMode: false,
    dashAt: -1,
    queueDash() { this.dashAt = performance.now(); },
    consumeDash() {
        const queued = performance.now() - this.dashAt < 150;
        this.dashAt = -1;
        return queued;
    },
    reset() {
        this.keys.clear();
        this.mouse.down = false;
        this.touch.move.id = this.touch.aim.id = null;
        this.dashAt = -1;
    },
    moveVector() {
        const t = this.touch.move;
        if (t.id !== null) {
            const v = stickVector(t);
            return v.m > 0.12 ? v : { x: 0, y: 0, m: 0 };
        }
        if (this.pad.mx || this.pad.my) return { x: this.pad.mx, y: this.pad.my, m: Math.hypot(this.pad.mx, this.pad.my) };
        const k = this.keys;
        let x = (k.has('KeyD') || k.has('ArrowRight') ? 1 : 0) - (k.has('KeyA') || k.has('ArrowLeft') ? 1 : 0);
        let y = (k.has('KeyS') || k.has('ArrowDown') ? 1 : 0) - (k.has('KeyW') || k.has('ArrowUp') ? 1 : 0);
        if (x && y) { x *= Math.SQRT1_2; y *= Math.SQRT1_2; }
        return { x, y, m: x || y ? 1 : 0 };
    },
};
const STICK_RADIUS = 56;
function stickVector(s) {
    let x = (s.x - s.ox) / STICK_RADIUS, y = (s.y - s.oy) / STICK_RADIUS;
    const m = Math.hypot(x, y);
    if (m > 1) { x /= m; y /= m; }
    return { x, y, m: Math.min(1, m) };
}
const autoFireOn = () => (settings.autoFire === null ? input.touchMode : settings.autoFire);
const GAME_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'KeyW', 'KeyA', 'KeyS', 'KeyD', 'ShiftLeft', 'ShiftRight', 'Tab']);
const DIGIT_KEYS = { Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3 };

// ---------------- Game state ----------------
const game = {
    state: 'MENU', // MENU | PLAYING | PAUSED | LEVELUP | SHOP | DYING | GAMEOVER
    run: null,
    manual: false, // tests advance the simulation themselves
    god: false,
    frames: 0,
};

function createRun() {
    const x = ARENA.w / 2, y = ARENA.h / 2;
    return {
        time: 0, score: 0, credits: 0, kills: 0, nextId: 1,
        player: {
            x, y, px: x, py: y, vx: 0, vy: 0, r: 14, hitR: 10, hp: BASE_STATS.maxHp, angle: -Math.PI / 2,
            iframes: 0, dashT: 0, dashCd: 0, dashX: 0, dashY: 0, fireCd: 0, firing: false,
            level: 1, xp: 0, xpNext: xpFor(1), regenAcc: 0, moving: 0,
        },
        stats: { ...BASE_STATS },
        weapons: [], passives: {}, augments: {}, powerups: {},
        enemies: [], spawnQueue: [], projectiles: [], shots: [], gems: [], items: [],
        texts: [], bolts: [], rings: [], ghosts: [],
        phase: -1, spawnBudget: 0, nextSwarmAt: 50, nextBossAt: BOSS_INTERVAL, bossWarned: false, boss: null, bossCount: 0,
        pendingLevels: 0, rerolls: 2, choices: [],
        shop: null, shopRerollCost: 60, shopReturn: 'PLAYING',
        trauma: 0, hitStop: 0, hurtFlash: 0, nukeFlash: 0, pickupCombo: 0, lastPickup: -9, deathT: 0, gemCursor: 0,
    };
}

function recalcStats(run) {
    const s = { ...BASE_STATS };
    for (const id in run.passives) for (let i = 0; i < run.passives[id]; i++) PASSIVES[id].apply(s);
    for (const id in run.augments) for (let i = 0; i < run.augments[id]; i++) AUGMENTS[id].apply(s);
    if (run.powerups.overclock > 0) { s.cooldown *= 0.5; s.fireRate *= 2; }
    if (run.powerups.berserk > 0) { s.damage *= 2; s.speed *= 1.2; }
    const gained = s.maxHp - run.stats.maxHp;
    run.stats = s;
    // New integrity slots arrive repaired.
    if (gained > 0) run.player.hp += gained;
    run.player.hp = Math.min(run.player.hp, s.maxHp);
    hud.dirty = true;
}

// ---------------- Feedback helpers ----------------
const panOf = x => clamp((x - cam.x) / (view.w / 2), -0.8, 0.8);
function addTrauma(run, amount) { run.trauma = Math.min(1, run.trauma + amount); }
function addText(run, x, y, text, color, size, important = false) {
    if (run.texts.length > 90 && !important) return;
    run.texts.push({ x, y, text, color, size, life: 0.75, max: 0.75, vy: -55 });
}
function addBolt(run, x0, y0, x1, y1, color) {
    const len = Math.hypot(x1 - x0, y1 - y0), steps = Math.max(2, Math.ceil(len / 22));
    const nx = -(y1 - y0) / (len || 1), ny = (x1 - x0) / (len || 1);
    const pts = [x0, y0];
    for (let i = 1; i < steps; i++) {
        const t = i / steps, j = rand(-11, 11);
        pts.push(x0 + (x1 - x0) * t + nx * j, y0 + (y1 - y0) * t + ny * j);
    }
    pts.push(x1, y1);
    run.bolts.push({ pts, life: 0.18, max: 0.18, color });
}

let bannerTimer = 0;
function banner(title, sub = '', color = '#00f3ff') {
    const el = $('banner');
    $('banner-title').textContent = title;
    $('banner-sub').textContent = sub;
    el.style.setProperty('--c', color);
    el.classList.remove('show');
    void el.offsetWidth; // restart the CSS animation
    el.classList.add('show');
    clearTimeout(bannerTimer);
    bannerTimer = setTimeout(() => el.classList.remove('show'), 2700);
}

// ---------------- Entities ----------------
function makeEnemy(run, type, x, y, elite = false) {
    const def = ENEMIES[type], t = run.time;
    const hp = def.hp * (1 + t / 150) * (elite ? 4 : 1);
    return {
        id: run.nextId++, type, def, x, y, px: x, py: y, vx: 0, vy: 0, kx: 0, ky: 0,
        r: def.r * (elite ? 1.35 : 1), hp, maxHp: hp,
        speed: def.speed * (1 + Math.min(0.3, t / 1000)) * (elite ? 0.9 : 1),
        mass: def.mass * (elite ? 2 : 1), color: def.color, elite, flash: 0, rot: rand(TAU), spin: rand(-1.5, 1.5),
        dead: false, orbitalReadyAt: 0,
        ai: { mode: 'chase', t: rand(1.5, 3.5), dx: 0, dy: 0, dir: random() < 0.5 ? -1 : 1, wind: 0 },
    };
}

function spawnPoint(run) {
    const p = run.player;
    const dist = Math.hypot(view.w / 2, view.h / 2) + 60;
    for (let i = 0; i < 6; i++) {
        const a = rand(TAU), x = p.x + Math.cos(a) * dist, y = p.y + Math.sin(a) * dist;
        if (x > 40 && x < ARENA.w - 40 && y > 40 && y < ARENA.h - 40) return { x, y };
    }
    const a = rand(TAU);
    return { x: clamp(p.x + Math.cos(a) * dist, 40, ARENA.w - 40), y: clamp(p.y + Math.sin(a) * dist, 40, ARENA.h - 40) };
}

const normalCount = run => run.enemies.length + run.spawnQueue.length - (run.boss ? 1 : 0);

function spawnBoss(run) {
    const pos = spawnPoint(run);
    const boss = makeEnemy(run, 'boss', pos.x, pos.y);
    boss.hp = boss.maxHp = ENEMIES.boss.hp * (1 + 0.9 * run.bossCount) * (1 + run.time / 300);
    boss.ai = { mode: 'chase', t: 2.5, last: '', n: 0, sub: 0, angle: 0, dx: 0, dy: 0, enraged: false };
    run.boss = boss;
    run.enemies.push(boss);
    banner('OVERSEER', 'Neutralize the core', '#b026ff');
    Sound.setIntensity(3);
    addTrauma(run, 0.4);
}

function dropGem(run, x, y, value) {
    if (run.gems.length >= MAX_GEMS) {
        // Fold new XP into an existing gem instead of growing without bound.
        const g = run.gems[run.gemCursor++ % run.gems.length];
        g.value += value; g.tier = gemTier(g.value);
        return;
    }
    const gx = x + rand(-8, 8), gy = y + rand(-8, 8);
    run.gems.push({ x: gx, y: gy, px: gx, py: gy, value, tier: gemTier(value), attract: false, speed: 0, bob: rand(TAU), dead: false });
}

function dropPowerup(run, x, y, type = pick(Object.keys(POWERUPS))) {
    run.items.push({ x, y, type, life: 20, rot: 0, dead: false });
}

function damageEnemy(run, e, amount, fromX, fromY, knock = 0, flat = false) {
    if (e.dead) return;
    let dmg = flat ? amount : amount * run.stats.damage, crit = false;
    if (!flat && random() < run.stats.crit) { dmg *= run.stats.critMult; crit = true; }
    e.hp -= dmg;
    e.flash = 0.07;
    if (knock && e.mass < 20) {
        const dx = e.x - fromX, dy = e.y - fromY, d = Math.hypot(dx, dy) || 1;
        e.kx += (dx / d) * knock / e.mass;
        e.ky += (dy / d) * knock / e.mass;
    }
    if (settings.numbers) addText(run, e.x + rand(-6, 6), e.y - e.r, Math.round(dmg), crit ? '#ffb020' : '#ffffff', crit ? 20 : 14, crit);
    if (e.hp <= 0) killEnemy(run, e);
    else Sound.sfx('hit', panOf(e.x));
}

function killEnemy(run, e) {
    if (e.dead) return;
    e.dead = true;
    const def = e.def, s = run.stats;
    run.kills++;
    run.score += def.score * (e.elite ? 3 : 1);
    let credits = def.credits * (e.elite ? 4 : 1) * (0.5 + 0.5 * s.luck);
    if (e.type === 'boss') credits *= 1 + 0.5 * run.bossCount;
    credits = Math.round(credits);
    run.credits += credits;
    if (e.type === 'boss') {
        bossDefeated(run, e, credits);
        return;
    }
    dropGem(run, e.x, e.y, def.xp * (e.elite ? 5 : 1));
    if (e.elite) {
        dropPowerup(run, e.x + 12, e.y);
        addText(run, e.x, e.y - e.r - 10, `+$${credits}`, '#ffd84d', 18, true);
    } else if (e.type !== 'shard' && random() < Math.min(0.05, 0.012 * s.luck)) {
        dropPowerup(run, e.x, e.y);
    }
    if (e.type === 'splitter') {
        for (let i = 0; i < 3; i++) {
            const a = e.rot + i * TAU / 3;
            const shard = makeEnemy(run, 'shard', clamp(e.x + Math.cos(a) * 14, 20, ARENA.w - 20), clamp(e.y + Math.sin(a) * 14, 20, ARENA.h - 20));
            shard.kx = Math.cos(a) * 220; shard.ky = Math.sin(a) * 220;
            run.spawnQueue.push(shard);
        }
    }
    particles.burst(e.x, e.y, e.elite ? 34 : 14, e.color, e.elite ? 420 : 300, 0.6, e.r > 20 ? 5 : 3.5);
    particles.burst(e.x, e.y, 4, '#ffffff', 200, 0.3, 3);
    addTrauma(run, e.r > 20 ? 0.12 : 0.03);
    Sound.sfx('kill', panOf(e.x));
}

function bossDefeated(run, e, credits) {
    run.bossCount++;
    run.boss = null;
    run.nextBossAt = Math.max(run.nextBossAt + BOSS_INTERVAL, run.time + 60);
    run.bossWarned = false;
    run.rerolls++;
    for (let i = 0; i < 14; i++) {
        const a = i * TAU / 14;
        dropGem(run, e.x + Math.cos(a) * 50, e.y + Math.sin(a) * 50, 6 * (run.bossCount + 1));
    }
    dropPowerup(run, e.x, e.y, pick(TIMED_POWERUPS));
    for (const b of run.shots) b.dead = true;
    particles.burst(e.x, e.y, 160, e.color, 700, 1.4, 7, 1.6);
    particles.burst(e.x, e.y, 60, '#ffffff', 500, 0.8, 4, 2);
    run.rings.push({ x: e.x, y: e.y, r: 20, max: 420, speed: 900, life: 0.6, max_life: 0.6, color: '#ff4df0', damaging: false });
    addText(run, e.x, e.y - 80, `+$${credits}`, '#ffd84d', 30, true);
    run.hitStop = 0.28;
    addTrauma(run, 1);
    banner('OVERSEER DESTROYED', '+1 reroll', '#ff4df0');
    Sound.sfx('bigboom');
    Sound.setIntensity(2);
}

function heal(run, amount) {
    const p = run.player, before = p.hp;
    p.hp = Math.min(run.stats.maxHp, p.hp + amount);
    if (p.hp > before) addText(run, p.x, p.y - 30, `+${p.hp - before}`, '#3dff9a', 20, true);
}

function nuke(run) {
    run.nukeFlash = 1;
    addTrauma(run, 1);
    Sound.sfx('explode');
    const left = cam.x - view.w / 2 - 60, right = cam.x + view.w / 2 + 60, top = cam.y - view.h / 2 - 60, bottom = cam.y + view.h / 2 + 60;
    for (const e of run.enemies) {
        if (e.dead || e.x < left || e.x > right || e.y < top || e.y > bottom) continue;
        if (e.type === 'boss') damageEnemy(run, e, e.maxHp * 0.15, e.x, e.y, 0, true);
        else killEnemy(run, e);
    }
    for (const b of run.shots) b.dead = true;
}

function activatePowerup(run, type, duration) {
    const def = POWERUPS[type];
    banner(def.name, def.desc, def.color);
    Sound.sfx('powerup');
    if (type === 'medkit') heal(run, 2);
    else if (type === 'nuke') nuke(run);
    else if (type === 'magnet') for (const g of run.gems) g.attract = true;
    else {
        run.powerups[type] = Math.max(run.powerups[type] || 0, duration ?? def.duration);
        if (type === 'overclock' || type === 'berserk') recalcStats(run);
    }
    hud.dirty = true;
}

function addXp(run, amount) {
    const p = run.player;
    p.xp += amount;
    while (p.xp >= p.xpNext) {
        p.xp -= p.xpNext;
        p.level++;
        p.xpNext = xpFor(p.level);
        run.pendingLevels++;
    }
}

function addWeapon(run, id) {
    const w = run.weapons.find(x => x.id === id);
    if (w) w.level = Math.min(WEAPON_MAX, w.level + 1);
    else run.weapons.push({ id, level: 1, cd: 0.5, angle: 0, drones: [] });
    hud.dirty = true;
}

// ---------------- Simulation ----------------
function tick() {
    const run = game.run;
    const p = run.player;
    p.px = p.x; p.py = p.y;
    for (const e of run.enemies) { e.px = e.x; e.py = e.y; }
    for (const b of run.projectiles) { b.px = b.x; b.py = b.y; }
    for (const b of run.shots) { b.px = b.x; b.py = b.y; }
    for (const g of run.gems) { g.px = g.x; g.py = g.y; }
    for (const w of run.weapons) for (const d of w.drones) { d.px = d.x; d.py = d.y; }
    particles.savePrev();
    grid.clear();
    for (const e of run.enemies) if (!e.dead && e !== run.boss) grid.insert(e);

    const dt = TICK;
    const frozen = run.powerups.freeze > 0;
    if (game.state === 'PLAYING') {
        run.time += dt;
        run.score += dt * 5;
        updatePowerups(run, dt);
        updatePlayer(run, dt);
        director(run, dt);
    } else {
        run.deathT -= dt;
    }
    if (game.state === 'PLAYING') updateWeapons(run, dt);
    updateProjectiles(run, dt);
    updateEnemies(run, dt, frozen);
    updateShots(run, dt, frozen);
    if (game.state === 'PLAYING') checkPlayerHits(run);
    compactEnemies(run);
    if (game.state === 'PLAYING') updatePickups(run, dt);
    updateEffects(run, dt);

    if (game.state === 'DYING') {
        if (run.deathT <= 0) endRun();
    } else if (game.state === 'PLAYING') {
        if (Math.floor(run.time) !== Math.floor(run.time - dt)) {
            Sound.setIntensity(run.boss ? 3 : run.time > 60 || run.enemies.length > 60 ? 2 : 1);
        }
        // Level-ups wait for a tick that ended alive, so death always wins over a simultaneous level-up.
        if (run.pendingLevels > 0) openLevelUp();
    }
}

function updatePowerups(run, dt) {
    for (const key of Object.keys(run.powerups)) {
        run.powerups[key] -= dt;
        if (run.powerups[key] <= 0) {
            delete run.powerups[key];
            if (key === 'overclock' || key === 'berserk') recalcStats(run);
            hud.dirty = true;
        }
    }
}

function updatePlayer(run, dt) {
    const p = run.player, s = run.stats;
    const mv = input.moveVector();
    if (p.dashCd > 0) p.dashCd -= dt;
    if (p.iframes > 0) p.iframes -= dt;
    if (input.consumeDash() && p.dashCd <= 0 && p.dashT <= 0) {
        let dx = mv.x, dy = mv.y;
        const m = Math.hypot(dx, dy);
        if (m < 0.1) { dx = Math.cos(p.angle); dy = Math.sin(p.angle); } else { dx /= m; dy /= m; }
        p.dashX = dx; p.dashY = dy; p.dashT = DASH_TIME; p.dashCd = DASH_COOLDOWN * s.dashCd;
        p.iframes = Math.max(p.iframes, DASH_TIME + 0.12);
        particles.burst(p.x, p.y, 16, '#00f3ff', 260, 0.35, 3);
        addTrauma(run, 0.06);
        Sound.sfx('dash');
    }
    const speed = PLAYER_SPEED * s.speed;
    if (p.dashT > 0) {
        p.dashT -= dt;
        p.vx = p.dashX * speed * DASH_MULT;
        p.vy = p.dashY * speed * DASH_MULT;
        run.ghosts.push({ x: p.x, y: p.y, angle: p.angle, life: 0.22 });
    } else {
        const k = 1 - Math.exp(-dt * 14);
        p.vx += (mv.x * speed - p.vx) * k;
        p.vy += (mv.y * speed - p.vy) * k;
    }
    p.x = clamp(p.x + p.vx * dt, p.r, ARENA.w - p.r);
    p.y = clamp(p.y + p.vy * dt, p.r, ARENA.h - p.r);
    p.moving = Math.hypot(p.vx, p.vy);
    if (p.moving > 60 && random() < 0.7) {
        const a = Math.atan2(p.vy, p.vx) + Math.PI + rand(-0.4, 0.4);
        particles.spawn(p.x - Math.cos(p.angle) * 8, p.y - Math.sin(p.angle) * 8, Math.cos(a) * 120, Math.sin(a) * 120, 0.28, 2.6, random() < 0.5 ? '#00f3ff' : '#ff4df0', 4);
    }
    resolveAim(run);

    if (s.regen > 0 && p.hp < s.maxHp) {
        p.regenAcc += s.regen * dt;
        if (p.regenAcc >= 1) { p.regenAcc -= 1; heal(run, 1); }
    } else {
        p.regenAcc = 0;
    }
}

function screenToWorld(sx, sy) {
    return { x: (sx - view.cssW / 2) / view.zoom + cam.x, y: (sy - view.cssH / 2) / view.zoom + cam.y };
}

function resolveAim(run) {
    const p = run.player;
    let ax = 0, ay = 0, firing = false, aimed = false;
    const ts = input.touch.aim;
    if (ts.id !== null) {
        const v = stickVector(ts);
        if (v.m > 0.3) { ax = v.x; ay = v.y; firing = aimed = true; }
    } else if (input.pad.am > 0) {
        ax = input.pad.ax; ay = input.pad.ay; firing = aimed = true;
    } else if (input.aimDevice === 'mouse') {
        const w = screenToWorld(input.mouse.x, input.mouse.y);
        ax = w.x - p.x; ay = w.y - p.y; aimed = true;
        firing = input.mouse.down;
    }
    if (input.pad.fire) firing = true;
    if (!firing && autoFireOn()) {
        const target = nearestEnemy(run, p.x, p.y, 680);
        if (target) { ax = target.x - p.x; ay = target.y - p.y; firing = aimed = true; }
    }
    if (aimed && (ax || ay)) p.angle = Math.atan2(ay, ax);
    else if (input.aimDevice !== 'pad') {
        const mv = input.moveVector();
        if (mv.m > 0) p.angle = Math.atan2(mv.y, mv.x);
    }
    p.firing = firing;
}

function nearestEnemy(run, x, y, range, exclude) {
    grid.query(x, y, range, bufNearest, run.boss);
    let best = null, bestD = Infinity;
    for (const e of bufNearest) {
        if (e.dead || (exclude && exclude.has(e))) continue;
        const d = dist2(x, y, e.x, e.y);
        const reach = range + e.r;
        if (d < reach * reach && d < bestD) { bestD = d; best = e; }
    }
    return best;
}

function nearestEnemies(run, x, y, range, count) {
    grid.query(x, y, range, bufNearest, run.boss);
    const list = [];
    for (const e of bufNearest) {
        if (e.dead) continue;
        const d = dist2(x, y, e.x, e.y);
        if (d < (range + e.r) ** 2) list.push({ e, d });
    }
    list.sort((a, b) => a.d - b.d);
    return list.slice(0, count).map(v => v.e);
}

function director(run, dt) {
    const t = run.time;
    let idx = Math.max(0, run.phase);
    while (idx + 1 < PHASES.length && t >= PHASES[idx + 1].t) idx++;
    if (idx !== run.phase) {
        run.phase = idx;
        banner(PHASES[idx].name, PHASES[idx].sub);
        hud.dirty = true;
    }
    const phase = PHASES[idx];

    if (!run.boss) {
        if (!run.bossWarned && t >= run.nextBossAt - 4) {
            run.bossWarned = true;
            banner('WARNING', 'Overseer inbound', '#ff2d55');
            Sound.sfx('warning');
        }
        if (t >= run.nextBossAt) spawnBoss(run);
    }

    const rate = (phase.rate + Math.max(0, t - 240) / 80) * (run.boss ? 0.45 : 1);
    run.spawnBudget = Math.min(run.spawnBudget + rate * dt, 6);
    while (run.spawnBudget >= 1 && normalCount(run) < MAX_ENEMIES) {
        run.spawnBudget -= 1;
        const pos = spawnPoint(run);
        const elite = t > 90 && random() < Math.min(0.08, 0.015 + (t - 90) / 4000);
        run.enemies.push(makeEnemy(run, weightedKey(phase.mix), pos.x, pos.y, elite));
    }

    if (t >= run.nextSwarmAt) {
        run.nextSwarmAt += 55;
        const count = Math.min(36, 12 + Math.floor(t / 30) * 2);
        const type = t > 120 ? 'dart' : 'drone';
        const radius = Math.max(420, Math.min(view.w, view.h) * 0.55);
        const p = run.player;
        let spawned = 0;
        for (let i = 0; i < count && normalCount(run) < MAX_ENEMIES; i++) {
            const a = i * TAU / count;
            run.enemies.push(makeEnemy(run, type, clamp(p.x + Math.cos(a) * radius, 30, ARENA.w - 30), clamp(p.y + Math.sin(a) * radius, 30, ARENA.h - 30)));
            spawned++;
        }
        if (spawned) banner('ENCIRCLEMENT', 'Break through', '#ff2d6f');
    }
}

function updateWeapons(run, dt) {
    const p = run.player, s = run.stats;
    // Main blaster. fireCd only counts down while positive, so it lands in (-dt, 0] and keeps an exact cadence.
    if (p.fireCd > 0) p.fireCd -= dt;
    if (p.firing && p.fireCd <= 0) {
        p.fireCd += 1 / (BLASTER.rate * s.fireRate);
        const n = s.projectiles, spread = 0.1;
        for (let i = 0; i < n; i++) {
            const a = p.angle + (i - (n - 1) / 2) * spread + rand(-0.02, 0.02);
            const cos = Math.cos(a), sin = Math.sin(a);
            run.projectiles.push({
                kind: 'bullet', x: p.x + cos * 18, y: p.y + sin * 18, px: p.x, py: p.y, vx: cos * BLASTER.speed, vy: sin * BLASTER.speed,
                r: 4, dmg: BLASTER.dmg, life: BLASTER.life, pierce: s.pierce, hit: null, color: '#fff35c', dead: false,
            });
        }
        particles.spawn(p.x + Math.cos(p.angle) * 20, p.y + Math.sin(p.angle) * 20, Math.cos(p.angle) * 90, Math.sin(p.angle) * 90, 0.12, 4, '#fff35c', 8);
        Sound.sfx('shoot', panOf(p.x));
    }

    for (const w of run.weapons) {
        const st = WEAPONS[w.id].levels[w.level - 1];
        switch (w.id) {
            case 'orbital': {
                w.angle += st.spin * dt;
                const R = st.radius * s.area, orbR = 10 * s.area;
                for (let i = 0; i < st.count; i++) {
                    const a = w.angle + i * TAU / st.count, ox = p.x + Math.cos(a) * R, oy = p.y + Math.sin(a) * R;
                    grid.query(ox, oy, orbR, bufOrbital, run.boss);
                    for (const e of bufOrbital) {
                        if (e.dead || run.time < e.orbitalReadyAt || dist2(ox, oy, e.x, e.y) > (orbR + e.r) ** 2) continue;
                        e.orbitalReadyAt = run.time + 0.3;
                        damageEnemy(run, e, st.dmg, ox, oy, 90);
                        particles.burst(ox, oy, 3, '#3dff9a', 160, 0.25, 2.5);
                    }
                }
                break;
            }
            case 'missile': {
                w.cd -= dt;
                if (w.cd > 0) break;
                const targets = nearestEnemies(run, p.x, p.y, 900, st.count);
                if (!targets.length) { w.cd = 0.2; break; }
                w.cd = st.cd * s.cooldown;
                for (let i = 0; i < st.count; i++) {
                    const target = targets[i % targets.length];
                    const a = Math.atan2(target.y - p.y, target.x - p.x) + rand(-0.9, 0.9);
                    run.projectiles.push({
                        kind: 'missile', x: p.x, y: p.y, px: p.x, py: p.y, angle: a, speed: 300, turn: 3,
                        vx: Math.cos(a) * 300, vy: Math.sin(a) * 300, r: 6, dmg: st.dmg, blast: st.blast * s.area,
                        target, retarget: 0, life: 3, color: '#ff3b6b', dead: false,
                    });
                }
                Sound.sfx('missile', panOf(p.x));
                break;
            }
            case 'tesla': {
                w.cd -= dt;
                if (w.cd > 0) break;
                const first = nearestEnemy(run, p.x, p.y, st.range * s.area);
                if (!first) { w.cd = 0.15; break; }
                w.cd = st.cd * s.cooldown;
                // Pick the whole chain before dealing damage so kills never shift later targets.
                const chain = [first], hit = new Set(chain);
                let cur = first;
                for (let k = 0; k < st.chains; k++) {
                    const next = nearestEnemy(run, cur.x, cur.y, 170 * s.area, hit);
                    if (!next) break;
                    chain.push(next); hit.add(next); cur = next;
                }
                let x0 = p.x, y0 = p.y, dmg = st.dmg;
                for (const e of chain) {
                    addBolt(run, x0, y0, e.x, e.y, '#7df9ff');
                    damageEnemy(run, e, dmg, x0, y0, 40);
                    particles.burst(e.x, e.y, 5, '#7df9ff', 220, 0.25, 2.5);
                    dmg *= 0.88; x0 = e.x; y0 = e.y;
                }
                Sound.sfx('zap', panOf(p.x));
                break;
            }
            case 'inferno': {
                w.cd -= dt;
                if (w.cd > 0) break;
                const range = st.range * s.area;
                const target = nearestEnemy(run, p.x, p.y, range + 30);
                if (!target) { w.cd = 0.1; break; }
                w.cd = st.cd * s.cooldown;
                const base = Math.atan2(target.y - p.y, target.x - p.x);
                for (let k = 0; k < 2; k++) {
                    const a = base + rand(-st.spread, st.spread), speed = 430;
                    run.projectiles.push({
                        kind: 'flame', x: p.x, y: p.y, px: p.x, py: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed,
                        r: 8 * s.area, dmg: st.dmg, life: range / speed, max: range / speed, hit: new Set(), dead: false,
                    });
                }
                Sound.sfx('flame', panOf(p.x));
                break;
            }
            case 'saw': {
                w.cd -= dt;
                if (w.cd > 0) break;
                w.cd = st.cd * s.cooldown;
                const target = nearestEnemy(run, p.x, p.y, 600);
                const base = target ? Math.atan2(target.y - p.y, target.x - p.x) : p.angle;
                for (let i = 0; i < st.count; i++) {
                    const a = base + (i - (st.count - 1) / 2) * 0.55, speed = 540;
                    run.projectiles.push({
                        kind: 'saw', x: p.x, y: p.y, px: p.x, py: p.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, speed,
                        r: st.size * s.area, dmg: st.dmg, range: st.range * s.area, travel: 0, back: false, spin: 0, life: 5,
                        hit: new Map(), dead: false,
                    });
                }
                Sound.sfx('shoot', panOf(p.x));
                break;
            }
            case 'swarm': {
                while (w.drones.length < st.count) w.drones.push({ x: p.x, y: p.y, px: p.x, py: p.y, cd: rand(0.2, 0.6), angle: 0 });
                const n = w.drones.length, k = 1 - Math.exp(-dt * 7);
                for (let i = 0; i < n; i++) {
                    const d = w.drones[i];
                    const a = run.time * 1.6 + i * TAU / n, R = 62 + Math.sin(run.time * 2 + i) * 12;
                    d.x += (p.x + Math.cos(a) * R - d.x) * k;
                    d.y += (p.y + Math.sin(a) * R - d.y) * k;
                    d.cd -= dt;
                    if (d.cd > 0) continue;
                    const target = nearestEnemy(run, d.x, d.y, 380);
                    if (!target) { d.cd = 0.15; continue; }
                    d.cd = st.cd * s.cooldown * rand(0.9, 1.1);
                    d.angle = Math.atan2(target.y - d.y, target.x - d.x);
                    const speed = 760;
                    run.projectiles.push({
                        kind: 'dshot', x: d.x, y: d.y, px: d.x, py: d.y, vx: Math.cos(d.angle) * speed, vy: Math.sin(d.angle) * speed,
                        r: 3, dmg: st.dmg, life: 0.6, pierce: 0, hit: null, color: '#00e5ff', dead: false,
                    });
                }
                break;
            }
            case 'nova': {
                w.cd -= dt;
                if (w.cd > 0) break;
                const radius = st.radius * s.area;
                if (!nearestEnemy(run, p.x, p.y, radius)) { w.cd = 0.25; break; }
                w.cd = st.cd * s.cooldown;
                run.rings.push({ x: p.x, y: p.y, r: 10, max: radius, speed: 900, life: 0.35, max_life: 0.35, color: '#c084ff', damaging: true, dmg: st.dmg, knock: st.knock, hit: new Set() });
                addTrauma(run, 0.1);
                Sound.sfx('nova', panOf(p.x));
                break;
            }
        }
    }
}

function explode(run, x, y, radius, dmg, color) {
    grid.query(x, y, radius, bufExplosion, run.boss);
    for (const e of bufExplosion) {
        if (!e.dead && dist2(x, y, e.x, e.y) <= (radius + e.r) ** 2) damageEnemy(run, e, dmg, x, y, 140);
    }
    run.rings.push({ x, y, r: radius * 0.3, max: radius, speed: radius * 6, life: 0.3, max_life: 0.3, color, damaging: false });
    particles.burst(x, y, 18, color, 320, 0.45, 4);
    particles.burst(x, y, 6, '#fff35c', 200, 0.3, 3);
    addTrauma(run, 0.05);
    Sound.sfx('explode', panOf(x));
}

function updateProjectiles(run, dt) {
    const p = run.player;
    for (const b of run.projectiles) {
        if (b.dead) continue;
        if (b.kind === 'missile') {
            if (!b.target || b.target.dead) {
                b.target = null;
                if ((b.retarget -= dt) <= 0) { b.target = nearestEnemy(run, b.x, b.y, 700); b.retarget = 0.15; }
            }
            if (b.target) {
                const diff = wrapAngle(Math.atan2(b.target.y - b.y, b.target.x - b.x) - b.angle);
                b.angle += clamp(diff, -b.turn * dt, b.turn * dt);
            }
            b.turn = Math.min(10, b.turn + dt * 5);
            b.speed = Math.min(660, b.speed + 800 * dt);
            b.vx = Math.cos(b.angle) * b.speed; b.vy = Math.sin(b.angle) * b.speed;
            particles.spawn(b.x, b.y, rand(-30, 30), rand(-30, 30), 0.35, 2.4, '#ff6a3b', 3);
        } else if (b.kind === 'saw') {
            b.spin += dt * 16;
            if (!b.back) {
                b.travel += b.speed * dt;
                if (b.travel >= b.range) b.back = true;
            } else {
                const dx = p.x - b.x, dy = p.y - b.y, d = Math.hypot(dx, dy);
                if (d < 26) { b.dead = true; continue; }
                const speed = Math.min(b.speed * 1.3, d / dt);
                b.vx = dx / d * speed; b.vy = dy / d * speed;
            }
        } else if (b.kind === 'flame' && random() < 0.35) {
            particles.spawn(b.x, b.y, b.vx * 0.3, b.vy * 0.3, 0.3, 3.5, random() < 0.5 ? '#ff8a00' : '#ff2d55', 5);
        }
        b.x += b.vx * dt; b.y += b.vy * dt;
        b.life -= dt;
        if (b.life <= 0 || b.x < -40 || b.x > ARENA.w + 40 || b.y < -40 || b.y > ARENA.h + 40) { b.dead = true; continue; }

        grid.query(b.x, b.y, b.r, bufProjectile, run.boss);
        for (const e of bufProjectile) {
            if (e.dead || dist2(e.x, e.y, b.x, b.y) > (e.r + b.r) ** 2) continue;
            if (projectileHit(run, b, e)) break;
        }
    }
    prune(run.projectiles, b => !b.dead);
}

// Returns true when the projectile is used up.
function projectileHit(run, b, e) {
    switch (b.kind) {
        case 'bullet':
        case 'dshot':
            if (b.hit && b.hit.has(e)) return false;
            damageEnemy(run, e, b.dmg, b.x - b.vx * 0.02, b.y - b.vy * 0.02, 40);
            particles.burst(b.x, b.y, 3, b.color, 180, 0.2, 2.2);
            if (b.pierce > 0) { b.pierce--; (b.hit || (b.hit = new Set())).add(e); return false; }
            b.dead = true;
            return true;
        case 'missile':
            explode(run, b.x, b.y, b.blast, b.dmg, '#ff3b6b');
            b.dead = true;
            return true;
        case 'flame':
            if (b.hit.has(e)) return false;
            b.hit.add(e);
            damageEnemy(run, e, b.dmg, b.x, b.y, 12);
            if (b.hit.size >= 3) { b.dead = true; return true; }
            return false;
        case 'saw': {
            const last = b.hit.get(e);
            if (last !== undefined && run.time - last < 0.35) return false;
            b.hit.set(e, run.time);
            damageEnemy(run, e, b.dmg, b.x, b.y, 100);
            particles.burst(b.x, b.y, 4, '#d9e3ff', 240, 0.25, 2.5);
            return false;
        }
    }
    return false;
}

function updateEnemies(run, dt, frozen) {
    const p = run.player;
    const kDecay = Math.exp(-dt * 7);
    for (const e of run.enemies) {
        if (e.dead) continue;
        if (e.flash > 0) e.flash -= dt;
        if (!frozen) {
            const dx = p.x - e.x, dy = p.y - e.y, d = Math.hypot(dx, dy) || 1;
            let tx = (dx / d) * e.speed, ty = (dy / d) * e.speed, direct = false;
            const ai = e.ai;
            if (e.type === 'dart') {
                if (ai.mode === 'chase') {
                    ai.t -= dt;
                    if (ai.t <= 0 && d < 420) { ai.mode = 'wind'; ai.t = 0.4; ai.dx = dx / d; ai.dy = dy / d; }
                } else if (ai.mode === 'wind') {
                    tx = ty = 0; ai.t -= dt;
                    if (ai.t <= 0) { ai.mode = 'lunge'; ai.t = 0.35; }
                } else {
                    tx = ai.dx * e.speed * 3.2; ty = ai.dy * e.speed * 3.2; direct = true; ai.t -= dt;
                    if (ai.t <= 0) { ai.mode = 'chase'; ai.t = rand(2.2, 3.8); }
                }
            } else if (e.type === 'spitter') {
                if (d < 260) { tx = -tx; ty = -ty; } else if (d < 400) { tx = (-dy / d) * e.speed * 0.6 * ai.dir; ty = (dx / d) * e.speed * 0.6 * ai.dir; }
                if (ai.mode === 'chase') {
                    ai.t -= dt;
                    if (ai.t <= 0 && d < 520 && game.state === 'PLAYING') { ai.mode = 'wind'; ai.wind = 0.45; }
                } else {
                    tx *= 0.3; ty *= 0.3; ai.wind -= dt;
                    if (ai.wind <= 0) {
                        ai.mode = 'chase'; ai.t = rand(2.2, 3.2);
                        const speed = 250;
                        run.shots.push({ x: e.x + dx / d * e.r, y: e.y + dy / d * e.r, px: e.x, py: e.y, vx: dx / d * speed, vy: dy / d * speed, r: 6, life: 4.5, color: '#3dff7a', dead: false });
                        Sound.sfx('spit', panOf(e.x));
                    }
                }
            } else if (e.type === 'boss') {
                const v = bossThink(run, e, dt, dx / d, dy / d);
                tx = v.x; ty = v.y; direct = v.direct;
            }
            if (direct) { e.vx = tx; e.vy = ty; } else {
                const k = 1 - Math.exp(-dt * 6);
                e.vx += (tx - e.vx) * k; e.vy += (ty - e.vy) * k;
            }
        }
        // Soft separation keeps crowds readable without a full physics solve.
        let sx = 0, sy = 0;
        if (e.type !== 'boss') {
            grid.query(e.x, e.y, e.r, bufSeparation, run.boss);
            for (const n of bufSeparation) {
                if (n === e || n.dead) continue;
                const ddx = e.x - n.x, ddy = e.y - n.y, min = e.r + n.r, dd = ddx * ddx + ddy * ddy;
                if (dd >= min * min) continue;
                if (dd < 0.0001) { sx += rand(-1, 1); sy += rand(-1, 1); continue; }
                const dist = Math.sqrt(dd), push = (min - dist) * (n.mass / (e.mass + n.mass)) * 0.5;
                sx += (ddx / dist) * push; sy += (ddy / dist) * push;
            }
        }
        const moveScale = frozen ? 0 : 1;
        e.x = clamp(e.x + (e.vx * moveScale + e.kx) * dt + sx, e.r, ARENA.w - e.r);
        e.y = clamp(e.y + (e.vy * moveScale + e.ky) * dt + sy, e.r, ARENA.h - e.r);
        e.kx *= kDecay; e.ky *= kDecay;
        if (e.def.shape === 'triangle') { if (!frozen && (e.vx || e.vy)) e.rot = Math.atan2(e.vy, e.vx); } else if (!frozen) e.rot += e.spin * dt;
    }
}

function bossThink(run, e, dt, ux, uy) {
    const ai = e.ai, v = { x: ux * e.speed, y: uy * e.speed, direct: false };
    if (!ai.enraged && e.hp < e.maxHp * 0.5) {
        ai.enraged = true;
        e.color = '#ff2d55';
        e.speed *= 1.25;
        banner('OVERSEER ENRAGED', 'Core exposed', '#ff2d55');
        Sound.sfx('warning');
        addTrauma(run, 0.5);
    }
    const fire = (angle, speed) => run.shots.push({ x: e.x + Math.cos(angle) * e.r * 0.8, y: e.y + Math.sin(angle) * e.r * 0.8, px: e.x, py: e.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r: 7, life: 6, color: '#ff4df0', dead: false });
    const endPattern = () => { ai.mode = 'chase'; ai.t = rand(1.4, 2.2) * (ai.enraged ? 0.7 : 1); };
    ai.t -= dt;
    switch (ai.mode) {
        case 'chase':
            if (ai.t <= 0 && game.state === 'PLAYING') {
                const options = ['ring', 'spiral', 'charge', 'summon'].filter(o => o !== ai.last);
                ai.last = pick(options);
                if (ai.last === 'ring') { ai.mode = 'ring'; ai.n = ai.enraged ? 3 : 2; ai.t = 0.35; }
                else if (ai.last === 'spiral') { ai.mode = 'spiral'; ai.t = ai.enraged ? 3 : 2.4; ai.sub = 0; }
                else if (ai.last === 'charge') { ai.mode = 'windup'; ai.t = 0.85; ai.dx = ux; ai.dy = uy; }
                else { ai.mode = 'summon'; ai.t = 0.6; }
            }
            break;
        case 'ring':
            v.x *= 0.2; v.y *= 0.2;
            if (ai.t <= 0) {
                const count = ai.enraged ? 26 : 18;
                for (let i = 0; i < count; i++) fire(ai.angle + i * TAU / count, 215);
                ai.angle += 0.17; ai.n--; ai.t = 0.5;
                Sound.sfx('spit', panOf(e.x));
                if (ai.n <= 0) endPattern();
            }
            break;
        case 'spiral':
            v.x *= 0.3; v.y *= 0.3;
            ai.sub -= dt;
            while (ai.sub <= 0) {
                ai.sub += 0.085;
                const arms = ai.enraged ? 4 : 3;
                for (let k = 0; k < arms; k++) fire(ai.angle + k * TAU / arms, 200);
                ai.angle += 0.27;
            }
            if (ai.t <= 0) endPattern();
            break;
        case 'windup':
            v.x = v.y = 0;
            if (ai.t <= 0) { ai.mode = 'charge'; ai.t = 0.65; addTrauma(run, 0.2); }
            break;
        case 'charge':
            v.x = ai.dx * 640; v.y = ai.dy * 640; v.direct = true;
            particles.spawn(e.x + rand(-30, 30), e.y + rand(-30, 30), 0, 0, 0.4, 6, e.color, 2);
            if (ai.t <= 0) { e.vx *= 0.2; e.vy *= 0.2; endPattern(); }
            break;
        case 'summon':
            v.x = v.y = 0;
            if (ai.t <= 0) {
                const count = ai.enraged ? 9 : 6;
                for (let i = 0; i < count && normalCount(run) < MAX_ENEMIES; i++) {
                    const a = i * TAU / count;
                    run.spawnQueue.push(makeEnemy(run, 'drone', clamp(e.x + Math.cos(a) * (e.r + 30), 20, ARENA.w - 20), clamp(e.y + Math.sin(a) * (e.r + 30), 20, ARENA.h - 20)));
                }
                particles.burst(e.x, e.y, 30, e.color, 300, 0.5, 4);
                endPattern();
            }
            break;
    }
    return v;
}

function updateShots(run, dt, frozen) {
    for (const b of run.shots) {
        if (b.dead || frozen) continue;
        b.x += b.vx * dt; b.y += b.vy * dt; b.life -= dt;
        if (b.life <= 0 || b.x < 0 || b.x > ARENA.w || b.y < 0 || b.y > ARENA.h) b.dead = true;
    }
    prune(run.shots, b => !b.dead);
}

function checkPlayerHits(run) {
    const p = run.player;
    const shielded = run.powerups.shield > 0;
    grid.query(p.x, p.y, p.r + 20, bufContact, run.boss);
    for (const e of bufContact) {
        if (e.dead) continue;
        const reach = e.r * 0.85 + p.hitR;
        if (dist2(p.x, p.y, e.x, e.y) > reach * reach) continue;
        if (shielded) {
            const dx = e.x - p.x, dy = e.y - p.y, d = Math.hypot(dx, dy) || 1;
            if (e.mass < 20) { e.kx += dx / d * 420 / e.mass; e.ky += dy / d * 420 / e.mass; }
            continue;
        }
        if (p.iframes <= 0 && !game.god) hurtPlayer(run);
    }
    for (const b of run.shots) {
        if (b.dead || dist2(p.x, p.y, b.x, b.y) > (b.r + p.hitR) ** 2) continue;
        if (shielded || p.iframes > 0 || game.god) { if (shielded) b.dead = true; continue; }
        b.dead = true;
        hurtPlayer(run);
    }
}

function hurtPlayer(run) {
    const p = run.player;
    if (game.state !== 'PLAYING') return;
    p.hp -= 1;
    p.iframes = 1;
    run.hurtFlash = 1;
    run.hitStop = 0.07;
    addTrauma(run, 0.5);
    particles.burst(p.x, p.y, 20, '#ff2d55', 320, 0.5, 3.5);
    Sound.sfx('hurt');
    hud.dirty = true;
    if (p.hp <= 0) {
        p.hp = 0;
        setState('DYING');
        run.deathT = 0.6;
        run.hitStop = 0.15;
        addTrauma(run, 1);
        particles.burst(p.x, p.y, 140, '#00f3ff', 560, 1.3, 5, 1.6);
        particles.burst(p.x, p.y, 60, '#ffffff', 380, 0.9, 4, 2);
        Sound.sfx('bigboom');
        Sound.stopMusic(2.5);
    }
}

function compactEnemies(run) {
    prune(run.enemies, e => !e.dead);
    for (const e of run.spawnQueue) run.enemies.push(e);
    run.spawnQueue.length = 0;
    if (run.boss && run.boss.dead) run.boss = null;
}

function updatePickups(run, dt) {
    const p = run.player, magnet = run.stats.magnet;
    for (const g of run.gems) {
        const d2 = dist2(p.x, p.y, g.x, g.y);
        if (!g.attract && d2 < magnet * magnet) g.attract = true;
        if (g.attract) {
            const d = Math.sqrt(d2) || 1;
            g.speed = Math.min(1600, g.speed + 2600 * dt);
            const step = Math.min(g.speed * dt, d);
            g.x += (p.x - g.x) / d * step;
            g.y += (p.y - g.y) / d * step;
        }
        if (dist2(p.x, p.y, g.x, g.y) < (p.r + 8) ** 2) {
            g.dead = true;
            addXp(run, g.value);
            run.pickupCombo = run.time - run.lastPickup < 0.3 ? Math.min(run.pickupCombo + 1, 24) : 0;
            run.lastPickup = run.time;
            Sound.sfx('pickup', 0, run.pickupCombo);
        }
    }
    prune(run.gems, g => !g.dead);
    if (run.gemCursor > 1e6) run.gemCursor = 0;

    for (const it of run.items) {
        it.life -= dt;
        it.rot += dt * 1.5;
        if (it.life <= 0) { it.dead = true; continue; }
        if (dist2(p.x, p.y, it.x, it.y) < (p.r + 18) ** 2) { it.dead = true; activatePowerup(run, it.type); }
    }
    prune(run.items, it => !it.dead);
}

function updateEffects(run, dt) {
    particles.update(dt);
    for (const t of run.texts) { t.life -= dt; t.y += t.vy * dt; t.vy *= 0.94; }
    prune(run.texts, t => t.life > 0);
    for (const b of run.bolts) b.life -= dt;
    prune(run.bolts, b => b.life > 0);
    for (const g of run.ghosts) g.life -= dt;
    prune(run.ghosts, g => g.life > 0);
    for (const ring of run.rings) {
        const before = ring.r;
        ring.r = Math.min(ring.max, ring.r + ring.speed * dt);
        if (ring.r >= ring.max) ring.life -= dt;
        if (!ring.damaging || before >= ring.max) continue;
        grid.query(ring.x, ring.y, ring.r, bufRing, run.boss);
        for (const e of bufRing) {
            if (e.dead || ring.hit.has(e)) continue;
            if (dist2(ring.x, ring.y, e.x, e.y) <= (ring.r + e.r) ** 2) {
                ring.hit.add(e);
                damageEnemy(run, e, ring.dmg, ring.x, ring.y, ring.knock);
            }
        }
        for (const b of run.shots) if (!b.dead && dist2(ring.x, ring.y, b.x, b.y) < ring.r * ring.r) b.dead = true;
    }
    prune(run.rings, r => r.life > 0);
    run.trauma = Math.max(0, run.trauma - dt * 1.6);
    run.hurtFlash = Math.max(0, run.hurtFlash - dt * 2.5);
    run.nukeFlash = Math.max(0, run.nukeFlash - dt * 2);
}

// ---------------- Level-ups ----------------
function rollChoices(run) {
    const pool = [];
    const luck = run.stats.luck;
    for (const id in WEAPONS) {
        const w = run.weapons.find(x => x.id === id);
        if (!w) pool.push({ kind: 'weapon', id, level: 1, w: 1.1 });
        else if (w.level < WEAPON_MAX) pool.push({ kind: 'weapon', id, level: w.level + 1, w: 1.4 });
    }
    for (const id in PASSIVES) {
        const def = PASSIVES[id], lvl = run.passives[id] || 0;
        if (lvl < def.max) pool.push({ kind: 'passive', id, level: lvl + 1, w: [1, 0.6, 0.32][def.rarity] * Math.pow(luck, def.rarity) });
    }
    const count = luck >= 1.3 ? 4 : 3;
    const choices = weightedSample(pool, count);
    if (!choices.length) choices.push({ kind: 'heal', w: 1 }, { kind: 'credits', w: 1 });
    return choices;
}

function openLevelUp() {
    const run = game.run;
    run.choices = rollChoices(run);
    setState('LEVELUP');
    renderLevelUp();
    Sound.sfx('levelup');
}

function applyChoice(run, c) {
    if (c.kind === 'weapon') addWeapon(run, c.id);
    else if (c.kind === 'passive') { run.passives[c.id] = (run.passives[c.id] || 0) + 1; recalcStats(run); }
    else if (c.kind === 'heal') heal(run, 2);
    else if (c.kind === 'credits') run.credits += 150;
}

function finishLevelUp() {
    const run = game.run;
    run.pendingLevels = Math.max(0, run.pendingLevels - 1);
    if (run.pendingLevels > 0) {
        run.choices = rollChoices(run);
        renderLevelUp();
    } else {
        setState('PLAYING');
    }
}

function chooseLevel(index) {
    const run = game.run;
    if (game.state !== 'LEVELUP' || !run.choices[index]) return;
    applyChoice(run, run.choices[index]);
    Sound.sfx('click');
    finishLevelUp();
}

function rerollLevel() {
    const run = game.run;
    if (game.state !== 'LEVELUP' || run.rerolls <= 0) { Sound.sfx('error'); return; }
    run.rerolls--;
    run.choices = rollChoices(run);
    renderLevelUp();
    Sound.sfx('click');
}

function skipLevel() {
    if (game.state !== 'LEVELUP') return;
    game.run.credits += 40;
    Sound.sfx('buy');
    finishLevelUp();
}

function choiceInfo(run, c) {
    if (c.kind === 'weapon') {
        const def = WEAPONS[c.id];
        return { name: def.name, icon: def.icon, color: def.color, tag: c.level === 1 ? 'New weapon' : `Weapon · level ${c.level}`, desc: describeWeaponLevel(c.id, c.level), level: c.level, max: WEAPON_MAX, rarity: 'weapon' };
    }
    if (c.kind === 'passive') {
        const def = PASSIVES[c.id];
        return { name: def.name, icon: def.icon, color: def.color, tag: `${RARITY[def.rarity]} · level ${c.level}`, desc: def.desc, level: c.level, max: def.max, rarity: RARITY[def.rarity] };
    }
    if (c.kind === 'heal') return { name: 'Field Repair', icon: 'medkit', color: '#ff3b6b', tag: 'Fully upgraded', desc: 'Restore 2 integrity', rarity: 'common' };
    return { name: 'Salvage', icon: 'credits', color: '#ffd84d', tag: 'Fully upgraded', desc: '+150 credits', rarity: 'common' };
}

function pips(level, max) {
    const el = document.createElement('span');
    el.className = 'pips';
    for (let i = 1; i <= max; i++) {
        const dot = document.createElement('i');
        if (i <= level) dot.className = 'on';
        el.appendChild(dot);
    }
    return el;
}

function renderLevelUp() {
    const run = game.run;
    const reached = run.player.level - run.pendingLevels + 1;
    $('levelup-sub').textContent = run.pendingLevels > 1 ? `Level ${reached} · ${run.pendingLevels - 1} more queued` : `Level ${reached}`;
    const container = $('levelup-cards');
    container.replaceChildren();
    run.choices.forEach((c, i) => {
        const info = choiceInfo(run, c);
        const card = document.createElement('button');
        card.type = 'button';
        card.className = `card ${info.rarity}`;
        card.style.setProperty('--c', info.color);
        const key = document.createElement('span'); key.className = 'card-key'; key.textContent = i + 1;
        const icon = document.createElement('span'); icon.className = 'card-icon'; icon.appendChild(svgIcon(info.icon));
        const tag = document.createElement('span'); tag.className = 'card-tag'; tag.textContent = info.tag;
        const name = document.createElement('span'); name.className = 'card-name'; name.textContent = info.name;
        const desc = document.createElement('span'); desc.className = 'card-desc'; desc.textContent = info.desc;
        card.append(key, icon, tag, name, desc);
        if (info.max) card.appendChild(pips(info.level, info.max));
        card.addEventListener('click', guarded(() => chooseLevel(i)));
        container.appendChild(card);
    });
    const reroll = $('btn-reroll');
    reroll.textContent = `Reroll (R) · ${run.rerolls} left`;
    reroll.disabled = run.rerolls <= 0;
    container.firstChild?.focus({ preventScroll: true });
}

// ---------------- Shop ----------------
function weaponPrice(run, id) {
    const w = run.weapons.find(x => x.id === id);
    return w ? 160 + 120 * w.level : 220;
}
const augmentPrice = (run, id) => Math.round(AUGMENTS[id].cost * Math.pow(1.45, run.augments[id] || 0) / 10) * 10;

function rollShop(run) {
    const weapons = Object.keys(WEAPONS).filter(id => (run.weapons.find(w => w.id === id)?.level || 0) < WEAPON_MAX);
    const augments = Object.keys(AUGMENTS).filter(id => (run.augments[id] || 0) < AUGMENTS[id].max);
    run.shop = {
        arsenal: shuffle(weapons).slice(0, 3),
        augments: shuffle(augments).slice(0, 3),
        supplies: shuffle(Object.keys(SUPPLIES)).slice(0, 2),
        sold: new Set(),
    };
}

function openShop() {
    const run = game.run;
    if (game.state !== 'PLAYING' && game.state !== 'PAUSED') return;
    run.shopReturn = game.state;
    if (!run.shop) rollShop(run);
    $('shop-msg').textContent = '';
    setState('SHOP');
    renderShop();
    Sound.sfx('click');
}

function closeShop() {
    if (game.state !== 'SHOP') return;
    setState(game.run.shopReturn);
    Sound.sfx('click');
}

function shopItem({ icon, color, name, level, desc, price, disabled, onBuy }) {
    const run = game.run;
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'shop-item';
    btn.style.setProperty('--c', color);
    const iconEl = document.createElement('span'); iconEl.className = 'shop-icon'; iconEl.appendChild(svgIcon(icon));
    const body = document.createElement('span'); body.className = 'shop-body';
    const nameEl = document.createElement('span'); nameEl.className = 'shop-name'; nameEl.textContent = name;
    if (level) { const small = document.createElement('small'); small.textContent = level; nameEl.appendChild(small); }
    const descEl = document.createElement('span'); descEl.className = 'shop-desc'; descEl.textContent = desc;
    body.append(nameEl, descEl);
    const priceEl = document.createElement('span');
    priceEl.className = 'shop-price';
    if (typeof price === 'number') {
        priceEl.textContent = `$${formatNumber(price)}`;
        if (run.credits < price) priceEl.classList.add('poor');
    } else {
        priceEl.textContent = price;
    }
    btn.append(iconEl, body, priceEl);
    btn.disabled = !!disabled;
    btn.addEventListener('click', guarded(() => {
        if (typeof price === 'number' && run.credits < price) { $('shop-msg').textContent = 'Insufficient credits'; Sound.sfx('error'); return; }
        if (typeof price === 'number') run.credits -= price;
        onBuy();
        Sound.sfx('buy');
        $('shop-msg').textContent = '';
        renderShop(btn);
    }));
    return btn;
}

function renderShop(focusAfter) {
    const run = game.run, shop = run.shop;
    const focusIndex = focusAfter ? [...$('screen-shop').querySelectorAll('button')].indexOf(focusAfter) : -1;
    $('shop-credits').textContent = formatNumber(run.credits);
    $('shop-reroll-cost').textContent = run.shopRerollCost;
    $('btn-shop-reroll').disabled = run.credits < run.shopRerollCost;

    $('shop-arsenal').replaceChildren(...shop.arsenal.map(id => {
        const def = WEAPONS[id], w = run.weapons.find(x => x.id === id), lvl = w ? w.level : 0;
        const maxed = lvl >= WEAPON_MAX;
        return shopItem({
            icon: def.icon, color: def.color, name: def.name,
            level: maxed ? 'MAX' : lvl ? `LV ${lvl}→${lvl + 1}` : 'NEW',
            desc: maxed ? 'Fully upgraded' : describeWeaponLevel(id, lvl + 1),
            price: maxed ? 'MAXED' : weaponPrice(run, id), disabled: maxed,
            onBuy: () => addWeapon(run, id),
        });
    }));
    $('shop-augments').replaceChildren(...shop.augments.map(id => {
        const def = AUGMENTS[id], n = run.augments[id] || 0, maxed = n >= def.max;
        return shopItem({
            icon: def.icon, color: def.color, name: def.name, level: `${n}/${def.max}`, desc: def.desc,
            price: maxed ? 'MAXED' : augmentPrice(run, id), disabled: maxed,
            onBuy: () => { run.augments[id] = n + 1; recalcStats(run); },
        });
    }));
    $('shop-supplies').replaceChildren(...shop.supplies.map(id => {
        const def = SUPPLIES[id], sold = shop.sold.has(id);
        const fullHp = id === 'repair' && run.player.hp >= run.stats.maxHp;
        return shopItem({
            icon: def.icon, color: def.color, name: def.name, desc: fullHp && !sold ? 'Integrity already full' : def.desc,
            price: sold ? 'SOLD' : def.cost, disabled: sold || fullHp,
            onBuy: () => { shop.sold.add(id); buySupply(run, id); },
        });
    }));
    if (focusIndex >= 0) {
        const buttons = [...$('screen-shop').querySelectorAll('button')];
        const target = buttons[focusIndex];
        (target && !target.disabled ? target : $('btn-shop-close')).focus({ preventScroll: true });
    }
}

function buySupply(run, id) {
    if (id === 'repair') heal(run, 2);
    else if (id === 'shield') activatePowerup(run, 'shield', 8);
    else if (id === 'strike') nuke(run);
    else if (id === 'data') addXp(run, Math.ceil(run.player.xpNext * 0.6)); // level-ups open once play resumes
}

function shopReroll() {
    const run = game.run;
    if (run.credits < run.shopRerollCost) { $('shop-msg').textContent = 'Insufficient credits'; Sound.sfx('error'); return; }
    run.credits -= run.shopRerollCost;
    run.shopRerollCost += 40;
    rollShop(run);
    renderShop();
    Sound.sfx('buy');
}

// ---------------- State machine ----------------
const screens = {
    MENU: $('screen-menu'), PAUSED: $('screen-pause'), LEVELUP: $('screen-levelup'), SHOP: $('screen-shop'), GAMEOVER: $('screen-gameover'),
};
let accumulator = 0, lastFrame = performance.now(), overlayShownAt = 0;

function setState(next) {
    game.state = next;
    document.body.dataset.state = next;
    for (const key in screens) screens[key].hidden = key !== next;
    const hudEl = $('hud');
    const hudWasHidden = hudEl.hidden;
    hudEl.hidden = next === 'MENU';
    hudEl.inert = next !== 'PLAYING';
    if (hudWasHidden && !hudEl.hidden) measureHud();
    if (next !== 'PLAYING') input.touch.move.id = input.touch.aim.id = null;
    if (screens[next]) overlayShownAt = performance.now();
    Sound.muffle(next !== 'PLAYING' && next !== 'DYING');
    if (next === 'PLAYING') {
        accumulator = 0;
        lastFrame = performance.now();
        if (document.activeElement && document.activeElement !== document.body) document.activeElement.blur();
    }
    if (next === 'PAUSED') renderPause();
    const overlay = screens[next];
    if (overlay) {
        const target = overlay.querySelector('[data-autofocus]') || overlay.querySelector('button');
        target?.focus({ preventScroll: true });
    }
}

// Ignores clicks right after an overlay opens: a Space key held for dashing would otherwise
// activate the focused card or button on release.
const guarded = handler => event => {
    if (event && event.isTrusted && performance.now() - overlayShownAt < 400) return;
    handler(event);
};

function startRun() {
    Sound.init();
    Sound.startMusic();
    Sound.setIntensity(1);
    game.run = createRun();
    particles.clear();
    grid.clear();
    cam.x = game.run.player.x; cam.y = game.run.player.y;
    hud.reset();
    setState('PLAYING');
}

function togglePause() {
    if (game.state === 'PLAYING') { setState('PAUSED'); Sound.sfx('click'); }
    else if (game.state === 'PAUSED') { setState('PLAYING'); Sound.sfx('click'); }
}

function endRun() {
    const run = game.run;
    const score = Math.floor(run.score);
    const record = score > save.bestScore;
    save.bestScore = Math.max(save.bestScore, score);
    save.bestTime = Math.max(save.bestTime, run.time);
    persist();
    $('go-score').textContent = formatNumber(score);
    $('go-time').textContent = formatTime(run.time);
    $('go-level').textContent = run.player.level;
    $('go-kills').textContent = formatNumber(run.kills);
    $('go-best').textContent = formatNumber(save.bestScore);
    $('go-record').hidden = !record;
    setState('GAMEOVER');
}

function quitToPortfolio() { location.href = '../index.html'; }

function renderMenuBest() {
    $('menu-best').textContent = save.bestScore > 0 ? `Best ${formatNumber(save.bestScore)} pts · longest ${formatTime(save.bestTime)}` : '';
}

function renderPause() {
    $('set-music').value = settings.music;
    $('set-sfx').value = settings.sfx;
    $('set-shake').checked = settings.shake;
    $('set-numbers').checked = settings.numbers;
    $('set-autofire').checked = autoFireOn();
    const run = game.run, list = $('loadout');
    const chips = [];
    const chip = (icon, color, name, level) => {
        const el = document.createElement('span');
        el.className = 'chip';
        el.style.setProperty('--c', color);
        el.appendChild(svgIcon(icon));
        const label = document.createElement('span');
        label.textContent = level ? `${name} ${level}` : name;
        el.appendChild(label);
        return el;
    };
    chips.push(chip('blaster', '#fff35c', 'Pulse Blaster'));
    for (const w of run.weapons) chips.push(chip(WEAPONS[w.id].icon, WEAPONS[w.id].color, WEAPONS[w.id].name, `LV ${w.level}`));
    for (const id in run.passives) chips.push(chip(PASSIVES[id].icon, PASSIVES[id].color, PASSIVES[id].name, `LV ${run.passives[id]}`));
    for (const id in run.augments) chips.push(chip(AUGMENTS[id].icon, AUGMENTS[id].color, AUGMENTS[id].name, `×${run.augments[id]}`));
    list.replaceChildren(...chips);
}

function toggleAutoFire() {
    settings.autoFire = !autoFireOn();
    persist();
    banner(settings.autoFire ? 'AUTO-FIRE ON' : 'AUTO-FIRE OFF', settings.autoFire ? 'Targets the nearest enemy' : 'Aim and fire manually');
    if (game.state === 'PAUSED') $('set-autofire').checked = settings.autoFire;
}

// ---------------- HUD ----------------
const hud = {
    cache: {},
    dirty: true,
    reset() { this.cache = {}; this.dirty = true; },
    set(key, value, apply) {
        if (this.cache[key] === value) return;
        this.cache[key] = value;
        apply(value);
    },
};

function updateHud() {
    const run = game.run;
    if (!run || game.state === 'MENU') return;
    const p = run.player, s = run.stats;
    const segments = $('hp-segments');
    hud.set('maxHp', s.maxHp, n => {
        segments.replaceChildren(...Array.from({ length: n }, () => document.createElement('span')));
        hud.cache.hp = -1;
    });
    hud.set('hp', p.hp, hp => {
        [...segments.children].forEach((el, i) => el.classList.toggle('on', i < hp));
        segments.classList.toggle('critical', hp <= 1);
        segments.setAttribute('aria-label', `Integrity ${hp} of ${s.maxHp}`);
    });
    const dashMax = DASH_COOLDOWN * s.dashCd;
    const dashPct = Math.round(clamp(1 - p.dashCd / dashMax, 0, 1) * 100);
    hud.set('dash', dashPct, v => {
        $('dash-fill').style.width = v + '%';
        $('dash-fill').parentElement.classList.toggle('ready', v >= 100);
    });
    hud.set('timer', Math.floor(run.time), () => { $('timer').textContent = formatTime(run.time); });
    const wave = run.boss ? 'OVERSEER' : run.phase >= 0 ? `${PHASES[run.phase].name} · ${PHASES[run.phase].sub}` : '';
    hud.set('wave', wave, v => {
        $('wave-label').textContent = v;
        $('wave-label').classList.toggle('boss', !!run.boss);
        measureHud(); // the label's width moves the HUD edge the radar sits under
    });
    hud.set('kills', run.kills, v => { $('kills').textContent = formatNumber(v); });
    hud.set('credits', run.credits, v => { $('credits').textContent = formatNumber(v); });
    hud.set('level', p.level, v => { $('level-badge').textContent = `LV ${v}`; });
    hud.set('xp', Math.round(p.xp / p.xpNext * 1000), v => { $('xp-fill').style.width = v / 10 + '%'; });
    hud.set('boss', run.boss ? Math.ceil(run.boss.hp / run.boss.maxHp * 400) : -1, v => {
        $('boss-bar').hidden = v < 0;
        if (v >= 0) {
            $('boss-fill').style.width = v / 4 + '%';
            $('boss-name').textContent = run.boss.ai.enraged ? 'OVERSEER · ENRAGED' : 'OVERSEER';
        }
    });
    if (hud.dirty) {
        hud.dirty = false;
        const slots = [{ icon: 'blaster', color: '#fff35c', name: 'Pulse Blaster' }];
        for (const w of run.weapons) slots.push({ icon: WEAPONS[w.id].icon, color: WEAPONS[w.id].color, name: WEAPONS[w.id].name, level: w.level });
        $('weapon-slots').replaceChildren(...slots.map(slot => {
            const el = document.createElement('div');
            el.className = 'slot';
            el.title = slot.level ? `${slot.name} · level ${slot.level}` : slot.name;
            el.style.setProperty('--c', slot.color);
            el.appendChild(svgIcon(slot.icon));
            if (slot.level) el.appendChild(pips(slot.level, WEAPON_MAX));
            return el;
        }));
        $('powerups').replaceChildren(...Object.keys(run.powerups).map(key => {
            const el = document.createElement('div');
            el.className = 'powerup';
            el.dataset.key = key;
            el.style.setProperty('--c', POWERUPS[key].color);
            const name = document.createElement('span'); name.textContent = POWERUPS[key].name;
            const bar = document.createElement('div'); bar.className = 'bar'; bar.appendChild(document.createElement('i'));
            el.append(name, bar);
            return el;
        }));
    }
    for (const el of $('powerups').children) {
        const key = el.dataset.key, total = POWERUPS[key].duration;
        const remaining = run.powerups[key] || 0;
        el.querySelector('i').style.width = clamp(remaining / Math.max(total, remaining, 0.001), 0, 1) * 100 + '%';
    }
}

// ---------------- Rendering ----------------
const stars = Array.from({ length: 90 }, () => ({ x: Math.random(), y: Math.random(), z: 0.15 + Math.random() * 0.45, s: Math.random() < 0.15 ? 2 : 1 }));
let vignette = null;

function resize() {
    const W = Math.max(1, window.innerWidth), H = Math.max(1, window.innerHeight);
    view.dpr = Math.min(window.devicePixelRatio || 1, 2);
    view.cssW = W; view.cssH = H;
    view.zoom = clamp(Math.min(W, H) / 820, 0.55, 1);
    view.w = W / view.zoom; view.h = H / view.zoom;
    canvas.width = Math.round(W * view.dpr);
    canvas.height = Math.round(H * view.dpr);
    vignette = document.createElement('canvas');
    vignette.width = Math.max(1, Math.round(W / 2)); vignette.height = Math.max(1, Math.round(H / 2));
    const v = vignette.getContext('2d');
    const grad = v.createRadialGradient(vignette.width / 2, vignette.height / 2, Math.min(vignette.width, vignette.height) * 0.35, vignette.width / 2, vignette.height / 2, Math.hypot(vignette.width, vignette.height) / 2);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(1, 'rgba(0,0,0,0.6)');
    v.fillStyle = grad;
    v.fillRect(0, 0, vignette.width, vignette.height);
    measureHud();
    render(1, 0); // keep paused or menu screens drawn while resizing
}

// The radar sits under the HUD's top-right cluster, whose height depends on the layout.
function measureHud() {
    if ($('hud').hidden) { view.radarTop = 90; return; }
    const radarLeft = view.cssW - (view.cssW < 720 ? 86 : 124) - 16;
    let bottom = 0;
    for (const el of document.querySelectorAll('.hud-right, .hud-center')) {
        const r = el.getBoundingClientRect();
        if (r.right > radarLeft && r.width) bottom = Math.max(bottom, r.bottom);
    }
    view.radarTop = (bottom || 80) + 10;
}

function traceShape(shape, x, y, r, rot) {
    ctx.beginPath();
    if (shape === 'circle') { ctx.arc(x, y, r, 0, TAU); return; }
    let sides, radius = r, offset = rot;
    if (shape === 'triangle') {
        ctx.moveTo(x + Math.cos(rot) * r * 1.2, y + Math.sin(rot) * r * 1.2);
        ctx.lineTo(x + Math.cos(rot + 2.45) * r, y + Math.sin(rot + 2.45) * r);
        ctx.lineTo(x + Math.cos(rot + Math.PI) * r * 0.45, y + Math.sin(rot + Math.PI) * r * 0.45);
        ctx.lineTo(x + Math.cos(rot - 2.45) * r, y + Math.sin(rot - 2.45) * r);
        ctx.closePath();
        return;
    }
    if (shape === 'square') { sides = 4; radius = r * 1.2; offset = rot + Math.PI / 4; }
    else if (shape === 'diamond') { sides = 4; radius = r * 1.25; }
    else if (shape === 'hex') sides = 6;
    else sides = 8;
    for (let i = 0; i < sides; i++) {
        const a = offset + i * TAU / sides;
        if (i === 0) ctx.moveTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
        else ctx.lineTo(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
    }
    ctx.closePath();
}

function traceShip(x, y, angle, r) {
    const c = Math.cos(angle), s = Math.sin(angle);
    const pt = (fx, fy) => [x + fx * c - fy * s, y + fx * s + fy * c];
    ctx.beginPath();
    ctx.moveTo(...pt(r * 1.5, 0));
    ctx.lineTo(...pt(-r, r * 0.95));
    ctx.lineTo(...pt(-r * 0.45, 0));
    ctx.lineTo(...pt(-r, -r * 0.95));
    ctx.closePath();
}

function render(alpha, realDt) {
    game.frames++;
    const run = game.run;
    const W = view.cssW, H = view.cssH, dpr = view.dpr, zoom = view.zoom;
    const p = run.player;
    const simRunning = game.state === 'PLAYING' || game.state === 'DYING';
    const time = performance.now() / 1000;

    // Camera follows the interpolated player; the menu drifts slowly over the arena.
    let tx, ty;
    if (game.state === 'MENU') { tx = ARENA.w / 2 + Math.cos(time * 0.07) * 700; ty = ARENA.h / 2 + Math.sin(time * 0.05) * 500; }
    else { tx = lerp(p.px, p.x, alpha); ty = lerp(p.py, p.y, alpha); }
    const follow = realDt > 0 ? 1 - Math.exp(-realDt * 9) : 1;
    cam.x += (tx - cam.x) * follow;
    cam.y += (ty - cam.y) * follow;
    cam.x = view.w >= ARENA.w ? ARENA.w / 2 : clamp(cam.x, view.w / 2 - 120, ARENA.w - view.w / 2 + 120);
    cam.y = view.h >= ARENA.h ? ARENA.h / 2 : clamp(cam.y, view.h / 2 - 120, ARENA.h - view.h / 2 + 120);
    cam.shakeX = cam.shakeY = 0;
    if (settings.shake && simRunning && run.trauma > 0) {
        const t2 = run.trauma * run.trauma * 18;
        cam.shakeX = (Math.random() * 2 - 1) * t2;
        cam.shakeY = (Math.random() * 2 - 1) * t2;
    }
    const cx = cam.x + cam.shakeX, cy = cam.y + cam.shakeY;
    const left = cx - view.w / 2 - 80, right = cx + view.w / 2 + 80, top = cy - view.h / 2 - 80, bottom = cy + view.h / 2 + 80;
    const visible = (x, y, r) => x + r > left && x - r < right && y + r > top && y - r < bottom;

    // Background and parallax stars in screen space.
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalAlpha = 1;
    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = '#020207';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const tile = 900;
    ctx.fillStyle = '#9fdcff';
    for (const s of stars) {
        const sx = (((s.x * tile - cx * s.z) % tile) + tile) % tile, sy = (((s.y * tile - cy * s.z) % tile) + tile) % tile;
        ctx.globalAlpha = 0.25 + s.z;
        for (let ox = sx; ox < W; ox += tile) for (let oy = sy; oy < H; oy += tile) ctx.fillRect(ox, oy, s.s, s.s);
    }
    ctx.globalAlpha = 1;

    // World space.
    const k = dpr * zoom;
    ctx.setTransform(k, 0, 0, k, dpr * W / 2 - cx * k, dpr * H / 2 - cy * k);
    const pulse = Sound.beat();
    ctx.fillStyle = '#060814';
    ctx.fillRect(0, 0, ARENA.w, ARENA.h);
    const gx0 = Math.max(0, Math.floor(left / 80) * 80), gx1 = Math.min(ARENA.w, right), gy0 = Math.max(0, Math.floor(top / 80) * 80), gy1 = Math.min(ARENA.h, bottom);
    ctx.lineWidth = 1.2 / zoom;
    ctx.strokeStyle = `rgba(0,243,255,${0.05 + pulse * 0.04})`;
    ctx.beginPath();
    for (let x = gx0; x <= gx1; x += 80) if (x % 400) { ctx.moveTo(x, Math.max(0, top)); ctx.lineTo(x, gy1); }
    for (let y = gy0; y <= gy1; y += 80) if (y % 400) { ctx.moveTo(Math.max(0, left), y); ctx.lineTo(gx1, y); }
    ctx.stroke();
    ctx.strokeStyle = `rgba(0,243,255,${0.13 + pulse * 0.09})`;
    ctx.beginPath();
    for (let x = gx0; x <= gx1; x += 80) if (!(x % 400)) { ctx.moveTo(x, Math.max(0, top)); ctx.lineTo(x, gy1); }
    for (let y = gy0; y <= gy1; y += 80) if (!(y % 400)) { ctx.moveTo(Math.max(0, left), y); ctx.lineTo(gx1, y); }
    ctx.stroke();
    ctx.strokeStyle = 'rgba(255,45,111,0.25)';
    ctx.lineWidth = 14;
    ctx.strokeRect(0, 0, ARENA.w, ARENA.h);
    ctx.strokeStyle = '#ff2d6f';
    ctx.lineWidth = 3;
    ctx.strokeRect(0, 0, ARENA.w, ARENA.h);

    if (game.state !== 'MENU') {
        drawWorld(run, alpha, time, visible, { left, top, right, bottom });
    }

    // Screen space overlays.
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    if (game.state !== 'MENU') drawScreenOverlays(run, time, W, H, cx, cy);
    if (vignette) ctx.drawImage(vignette, 0, 0, W, H);
    ctx.globalAlpha = 1;
}

function drawWorld(run, a, time, visible, bounds) {
    const p = run.player;
    const frozen = run.powerups.freeze > 0;
    const px = lerp(p.px, p.x, a), py = lerp(p.py, p.y, a);

    // Gems and powerup capsules.
    ctx.globalCompositeOperation = 'lighter';
    for (const g of run.gems) {
        const x = lerp(g.px, g.x, a), y = lerp(g.py, g.y, a) + Math.sin(time * 4 + g.bob) * 2;
        if (!visible(x, y, 20)) continue;
        const size = 5 + g.tier * 2;
        ctx.globalAlpha = 0.5;
        ctx.drawImage(glow(GEM_COLORS[g.tier]), x - size * 2.5, y - size * 2.5, size * 5, size * 5);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    for (const g of run.gems) {
        const x = lerp(g.px, g.x, a), y = lerp(g.py, g.y, a) + Math.sin(time * 4 + g.bob) * 2;
        if (!visible(x, y, 20)) continue;
        const size = 5 + g.tier * 2;
        ctx.beginPath();
        ctx.moveTo(x, y - size * 1.3); ctx.lineTo(x + size, y); ctx.lineTo(x, y + size * 1.3); ctx.lineTo(x - size, y); ctx.closePath();
        ctx.fillStyle = GEM_COLORS[g.tier];
        ctx.fill();
    }
    for (const it of run.items) {
        if (!visible(it.x, it.y, 40) || (it.life < 4 && Math.floor(it.life * 6) % 2)) continue;
        const def = POWERUPS[it.type];
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = 0.6 + Math.sin(time * 5) * 0.2;
        ctx.drawImage(glow(def.color), it.x - 40, it.y - 40, 80, 80);
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = 1;
        traceShape('hex', it.x, it.y, 20, it.rot);
        ctx.fillStyle = 'rgba(5,8,16,0.85)';
        ctx.fill();
        ctx.lineWidth = 2.5;
        ctx.strokeStyle = def.color;
        ctx.stroke();
        ctx.save();
        ctx.translate(it.x - 12 * 0.9, it.y - 12 * 0.9);
        ctx.scale(0.9, 0.9);
        ctx.lineWidth = 2;
        ctx.lineJoin = 'round';
        ctx.stroke(iconPath(it.type));
        ctx.restore();
    }

    // Rings (shockwaves, explosions) and boss charge telegraph.
    for (const ring of run.rings) {
        if (!visible(ring.x, ring.y, ring.r)) continue;
        const fade = ring.r < ring.max ? 1 : clamp(ring.life / ring.max_life, 0, 1);
        ctx.globalAlpha = 0.85 * fade;
        ctx.strokeStyle = ring.color;
        ctx.lineWidth = ring.damaging ? 5 : 3;
        ctx.beginPath();
        ctx.arc(ring.x, ring.y, ring.r, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 0.12 * fade;
        ctx.fillStyle = ring.color;
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    const boss = run.boss;
    if (boss && boss.ai.mode === 'windup') {
        const bx = lerp(boss.px, boss.x, a), by = lerp(boss.py, boss.y, a);
        ctx.globalAlpha = 0.18 + Math.abs(Math.sin(time * 18)) * 0.2;
        ctx.strokeStyle = '#ff2d55';
        ctx.lineWidth = boss.r * 1.6;
        ctx.beginPath();
        ctx.moveTo(bx, by);
        ctx.lineTo(bx + boss.ai.dx * 720, by + boss.ai.dy * 720);
        ctx.stroke();
        ctx.globalAlpha = 1;
    }

    // Enemies: additive glow pass, then bodies.
    ctx.globalCompositeOperation = 'lighter';
    for (const e of run.enemies) {
        const x = lerp(e.px, e.x, a), y = lerp(e.py, e.y, a);
        if (e.dead || !visible(x, y, e.r * 2)) continue;
        const s = e.r * (e.type === 'boss' ? 5 : 4.2);
        ctx.globalAlpha = e.flash > 0 ? 0.95 : e.type === 'boss' ? 0.6 + Sound.beat() * 0.3 : 0.42;
        ctx.drawImage(glow(frozen ? '#7df9ff' : e.color), x - s / 2, y - s / 2, s, s);
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    for (const e of run.enemies) {
        const x = lerp(e.px, e.x, a), y = lerp(e.py, e.y, a);
        if (e.dead || !visible(x, y, e.r * 2)) continue;
        const flashing = e.flash > 0;
        traceShape(e.def.shape, x, y, e.r, e.rot);
        ctx.fillStyle = flashing ? (e.type === 'boss' ? 'rgba(255,255,255,0.35)' : 'rgba(255,255,255,0.8)') : translucent(e.color, e.type === 'boss' ? 0.3 : 0.2);
        ctx.fill();
        ctx.lineWidth = e.type === 'boss' ? 4 : 2.4;
        ctx.strokeStyle = flashing && e.type !== 'boss' ? '#ffffff' : frozen ? '#bff8ff' : e.color;
        ctx.stroke();
        if (e.type === 'boss') {
            traceShape('triangle', x, y, e.r * 0.55, -e.rot * 1.5);
            ctx.lineWidth = 3;
            ctx.stroke();
            ctx.beginPath();
            ctx.arc(x, y, e.r * (0.18 + Sound.beat() * 0.06), 0, TAU);
            ctx.fillStyle = '#ffffff';
            ctx.fill();
        } else if (e.type === 'drone' || e.type === 'spitter') {
            const charging = e.ai.mode === 'wind';
            ctx.beginPath();
            ctx.arc(x, y, e.r * (charging ? 0.5 : 0.3), 0, TAU);
            ctx.fillStyle = charging ? '#ffffff' : e.color;
            ctx.fill();
        } else if (e.type === 'dart' && e.ai.mode === 'wind') {
            ctx.globalAlpha = 0.5;
            ctx.strokeStyle = '#ffe14d';
            ctx.lineWidth = 1.5;
            ctx.setLineDash([8, 8]);
            ctx.beginPath();
            ctx.moveTo(x, y);
            ctx.lineTo(x + e.ai.dx * 170, y + e.ai.dy * 170);
            ctx.stroke();
            ctx.setLineDash([]);
            ctx.globalAlpha = 1;
        }
        if (e.elite) {
            ctx.beginPath();
            ctx.arc(x, y, e.r + 6, 0, TAU);
            ctx.strokeStyle = '#ffd84d';
            ctx.lineWidth = 2;
            ctx.stroke();
        }
        if (e.type !== 'boss' && e.hp < e.maxHp) {
            const w = e.r * 2;
            ctx.fillStyle = 'rgba(0,0,0,0.6)';
            ctx.fillRect(x - w / 2, y - e.r - 9, w, 3);
            ctx.fillStyle = e.color;
            ctx.fillRect(x - w / 2, y - e.r - 9, w * clamp(e.hp / e.maxHp, 0, 1), 3);
        }
    }

    // Projectiles and enemy shots.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    for (const b of run.projectiles) {
        const x = lerp(b.px, b.x, a), y = lerp(b.py, b.y, a);
        if (!visible(x, y, 40)) continue;
        if (b.kind === 'bullet' || b.kind === 'dshot') {
            ctx.globalAlpha = 1;
            ctx.strokeStyle = b.color;
            ctx.lineWidth = b.r * 1.5;
            ctx.beginPath();
            ctx.moveTo(x - b.vx * 0.028, y - b.vy * 0.028);
            ctx.lineTo(x, y);
            ctx.stroke();
            ctx.globalAlpha = 0.7;
            ctx.drawImage(glow(b.color), x - 12, y - 12, 24, 24);
        } else if (b.kind === 'missile') {
            ctx.globalAlpha = 0.8;
            ctx.drawImage(glow('#ff3b6b'), x - 16, y - 16, 32, 32);
            ctx.globalAlpha = 1;
            traceShape('triangle', x, y, 7, b.angle);
            ctx.fillStyle = '#ffd1dc';
            ctx.fill();
        } else if (b.kind === 'flame') {
            const f = b.life / b.max;
            const color = f > 0.7 ? '#fff35c' : f > 0.35 ? '#ff8a00' : '#ff2d55';
            const s = b.r * (2.5 + (1 - f) * 3.5);
            ctx.globalAlpha = 0.35 + f * 0.5;
            ctx.drawImage(glow(color), x - s, y - s, s * 2, s * 2);
        } else if (b.kind === 'saw') {
            ctx.globalAlpha = 0.6;
            ctx.drawImage(glow('#d9e3ff'), x - b.r * 2.5, y - b.r * 2.5, b.r * 5, b.r * 5);
            ctx.globalAlpha = 1;
            ctx.beginPath();
            for (let i = 0; i < 16; i++) {
                const ang = b.spin + i * TAU / 16, rr = i % 2 ? b.r * 0.6 : b.r;
                if (i === 0) ctx.moveTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
                else ctx.lineTo(x + Math.cos(ang) * rr, y + Math.sin(ang) * rr);
            }
            ctx.closePath();
            ctx.fillStyle = 'rgba(217,227,255,0.55)';
            ctx.fill();
        }
    }
    for (const b of run.shots) {
        const x = lerp(b.px, b.x, a), y = lerp(b.py, b.y, a);
        if (!visible(x, y, 20)) continue;
        ctx.globalAlpha = 0.85;
        ctx.drawImage(glow(frozen ? '#7df9ff' : b.color), x - b.r * 3, y - b.r * 3, b.r * 6, b.r * 6);
        ctx.globalAlpha = 1;
        ctx.beginPath();
        ctx.arc(x, y, b.r * 0.55, 0, TAU);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
    }
    ctx.globalAlpha = 1;
    ctx.lineCap = 'butt';

    // Player, companions and orbitals.
    const alive = game.state !== 'DYING' && game.state !== 'GAMEOVER';
    for (const w of run.weapons) {
        if (w.id === 'orbital' && alive) {
            const st = WEAPONS.orbital.levels[w.level - 1], R = st.radius * run.stats.area;
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 0.12;
            ctx.strokeStyle = '#3dff9a';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            ctx.arc(px, py, R, 0, TAU);
            ctx.stroke();
            ctx.globalCompositeOperation = 'lighter';
            const angle = w.angle - st.spin * TICK * (1 - a);
            for (let i = 0; i < st.count; i++) {
                const ang = angle + i * TAU / st.count, ox = px + Math.cos(ang) * R, oy = py + Math.sin(ang) * R, s = 34 * run.stats.area;
                ctx.globalAlpha = 0.9;
                ctx.drawImage(glow('#3dff9a'), ox - s / 2, oy - s / 2, s, s);
                ctx.drawImage(glow('#ffffff'), ox - s / 6, oy - s / 6, s / 3, s / 3);
            }
        } else if (w.id === 'swarm' && alive) {
            ctx.globalCompositeOperation = 'source-over';
            ctx.globalAlpha = 1;
            for (const d of w.drones) {
                const dx = lerp(d.px, d.x, a), dy = lerp(d.py, d.y, a);
                traceShape('triangle', dx, dy, 6, d.angle);
                ctx.fillStyle = 'rgba(0,229,255,0.35)';
                ctx.fill();
                ctx.strokeStyle = '#00e5ff';
                ctx.lineWidth = 1.5;
                ctx.stroke();
            }
        }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;
    for (const g of run.ghosts) {
        ctx.globalAlpha = (g.life / 0.22) * 0.35;
        traceShip(g.x, g.y, g.angle, p.r);
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 2;
        ctx.stroke();
    }
    ctx.globalAlpha = 1;
    if (alive) {
        const blink = p.iframes > 0 && p.dashT <= 0 && Math.floor(time * 20) % 2 === 0;
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = blink ? 0.25 : 0.7;
        ctx.drawImage(glow('#00f3ff'), px - 40, py - 40, 80, 80);
        if (p.moving > 60) {
            ctx.globalAlpha = 0.6 + Math.random() * 0.3;
            const bx = px - Math.cos(p.angle) * 16, by = py - Math.sin(p.angle) * 16;
            ctx.drawImage(glow('#ff4df0'), bx - 12, by - 12, 24, 24);
        }
        ctx.globalCompositeOperation = 'source-over';
        ctx.globalAlpha = blink ? 0.35 : 1;
        traceShip(px, py, p.angle, p.r);
        ctx.fillStyle = 'rgba(0,243,255,0.25)';
        ctx.fill();
        ctx.strokeStyle = '#00f3ff';
        ctx.lineWidth = 2.6;
        ctx.lineJoin = 'round';
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(px + Math.cos(p.angle) * 3, py + Math.sin(p.angle) * 3, 3, 0, TAU);
        ctx.fillStyle = '#ffffff';
        ctx.fill();
        ctx.globalAlpha = 1;
        if (run.powerups.shield > 0) {
            const remaining = run.powerups.shield;
            ctx.globalAlpha = remaining < 1.5 && Math.floor(time * 10) % 2 ? 0.25 : 0.8;
            ctx.beginPath();
            ctx.arc(px, py, p.r + 14 + Math.sin(time * 8) * 1.5, 0, TAU);
            ctx.fillStyle = 'rgba(61,255,154,0.08)';
            ctx.fill();
            ctx.strokeStyle = '#3dff9a';
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.globalAlpha = 1;
        }
    }

    particles.draw(a, bounds.left, bounds.top, bounds.right, bounds.bottom);

    // Lightning.
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineJoin = 'round';
    for (const b of run.bolts) {
        const f = b.life / b.max;
        for (const [width, alphaScale, color] of [[7, 0.3, b.color], [2, 1, '#ffffff']]) {
            ctx.globalAlpha = f * alphaScale;
            ctx.strokeStyle = color;
            ctx.lineWidth = width;
            ctx.beginPath();
            ctx.moveTo(b.pts[0], b.pts[1]);
            for (let i = 2; i < b.pts.length; i += 2) ctx.lineTo(b.pts[i], b.pts[i + 1]);
            ctx.stroke();
        }
    }
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 1;

    // Floating numbers.
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.lineJoin = 'round';
    for (const t of run.texts) {
        if (!visible(t.x, t.y, 40)) continue;
        ctx.globalAlpha = clamp(t.life / t.max * 1.6, 0, 1);
        ctx.font = `700 ${t.size}px Rajdhani, sans-serif`;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(0,0,0,0.7)';
        ctx.strokeText(t.text, t.x, t.y);
        ctx.fillStyle = t.color;
        ctx.fillText(t.text, t.x, t.y);
    }
    ctx.globalAlpha = 1;
}

function drawScreenOverlays(run, time, W, H, cx, cy) {
    const p = run.player;
    const toScreen = (x, y) => [(x - cx) * view.zoom + W / 2, (y - cy) * view.zoom + H / 2];

    // Crosshair for mouse aiming.
    if (game.state === 'PLAYING' && input.aimDevice === 'mouse' && !input.touchMode) {
        const { x, y } = input.mouse;
        ctx.strokeStyle = input.mouse.down ? '#fff35c' : '#00f3ff';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, TAU);
        ctx.moveTo(x - 16, y); ctx.lineTo(x - 11, y);
        ctx.moveTo(x + 11, y); ctx.lineTo(x + 16, y);
        ctx.moveTo(x, y - 16); ctx.lineTo(x, y - 11);
        ctx.moveTo(x, y + 11); ctx.lineTo(x, y + 16);
        ctx.stroke();
    }

    // Pointer to an off-screen boss.
    const boss = run.boss;
    if (boss) {
        const [bx, by] = toScreen(boss.x, boss.y);
        if (bx < 0 || bx > W || by < 0 || by > H) {
            const ang = Math.atan2(by - H / 2, bx - W / 2);
            const margin = 46;
            const scale = Math.min((W / 2 - margin) / Math.abs(Math.cos(ang) || 1e-6), (H / 2 - margin) / Math.abs(Math.sin(ang) || 1e-6));
            const ix = W / 2 + Math.cos(ang) * scale, iy = H / 2 + Math.sin(ang) * scale;
            ctx.globalAlpha = 0.7 + Math.sin(time * 8) * 0.3;
            ctx.fillStyle = boss.color;
            ctx.beginPath();
            ctx.moveTo(ix + Math.cos(ang) * 16, iy + Math.sin(ang) * 16);
            ctx.lineTo(ix + Math.cos(ang + 2.5) * 12, iy + Math.sin(ang + 2.5) * 12);
            ctx.lineTo(ix + Math.cos(ang - 2.5) * 12, iy + Math.sin(ang - 2.5) * 12);
            ctx.closePath();
            ctx.fill();
            ctx.globalAlpha = 1;
        }
    }

    // Radar of the whole arena.
    const size = W < 720 ? 86 : 124;
    const rx = W - size - Math.max(12, W * 0.012), ry = view.radarTop;
    const scale = size / ARENA.w;
    ctx.fillStyle = 'rgba(4,8,18,0.7)';
    ctx.strokeStyle = 'rgba(0,243,255,0.35)';
    ctx.lineWidth = 1;
    ctx.fillRect(rx, ry, size, size);
    ctx.strokeRect(rx + 0.5, ry + 0.5, size - 1, size - 1);
    ctx.strokeStyle = 'rgba(255,255,255,0.25)';
    ctx.strokeRect(rx + (cx - view.w / 2) * scale, ry + (cy - view.h / 2) * scale, view.w * scale, view.h * scale);
    ctx.fillStyle = '#ff2d6f';
    const stride = Math.max(1, Math.floor(run.enemies.length / 200));
    for (let i = 0; i < run.enemies.length; i += stride) {
        const e = run.enemies[i];
        if (!e.dead && e.type !== 'boss') ctx.fillRect(rx + e.x * scale - 1, ry + e.y * scale - 1, 2, 2);
    }
    ctx.fillStyle = '#ffd84d';
    for (const it of run.items) ctx.fillRect(rx + it.x * scale - 1.5, ry + it.y * scale - 1.5, 3, 3);
    if (boss) {
        ctx.fillStyle = boss.color;
        ctx.beginPath();
        ctx.arc(rx + boss.x * scale, ry + boss.y * scale, 4 + Math.sin(time * 8), 0, TAU);
        ctx.fill();
    }
    ctx.fillStyle = '#00f3ff';
    ctx.beginPath();
    ctx.arc(rx + p.x * scale, ry + p.y * scale, 2.5, 0, TAU);
    ctx.fill();

    // Touch sticks.
    for (const [stick, color] of [[input.touch.move, '#00f3ff'], [input.touch.aim, '#ff4df0']]) {
        if (stick.id === null) continue;
        const v = stickVector(stick);
        ctx.globalAlpha = 0.5;
        ctx.strokeStyle = color;
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(stick.ox, stick.oy, STICK_RADIUS, 0, TAU);
        ctx.stroke();
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(stick.ox + v.x * STICK_RADIUS, stick.oy + v.y * STICK_RADIUS, 22, 0, TAU);
        ctx.fill();
        ctx.globalAlpha = 1;
    }

    // Full-screen tints.
    if (run.powerups.freeze > 0) { ctx.fillStyle = 'rgba(125,249,255,0.06)'; ctx.fillRect(0, 0, W, H); }
    if (game.state === 'PLAYING' && p.hp === 1) {
        ctx.fillStyle = `rgba(255,20,60,${0.06 + Math.abs(Math.sin(time * 3)) * 0.08})`;
        ctx.fillRect(0, 0, W, H);
    }
    if (run.hurtFlash > 0) { ctx.fillStyle = `rgba(255,30,70,${run.hurtFlash * 0.28})`; ctx.fillRect(0, 0, W, H); }
    if (run.nukeFlash > 0) { ctx.fillStyle = `rgba(255,255,255,${run.nukeFlash * 0.8})`; ctx.fillRect(0, 0, W, H); }
}

// ---------------- Main loop ----------------
function frame(now) {
    requestAnimationFrame(frame);
    const realDt = Math.min(0.25, Math.max(0, (now - lastFrame) / 1000));
    lastFrame = now;
    pollGamepad(realDt);
    const running = game.state === 'PLAYING' || game.state === 'DYING';
    if (running && !game.manual) {
        const run = game.run;
        if (run.hitStop > 0) {
            run.hitStop -= realDt;
        } else {
            accumulator += realDt * (game.state === 'DYING' ? 0.35 : 1);
            let steps = 0;
            while (accumulator >= TICK && steps < MAX_STEPS_PER_FRAME) {
                tick();
                accumulator -= TICK;
                steps++;
                if (game.state !== 'PLAYING' && game.state !== 'DYING') { accumulator = 0; break; }
            }
            // On very slow devices drop the backlog rather than spiralling or freezing.
            if (steps === MAX_STEPS_PER_FRAME) accumulator = 0;
        }
    }
    const alpha = running && !game.manual ? clamp(accumulator / TICK, 0, 1) : 1;
    render(alpha, realDt);
    updateHud();
}

// ---------------- Input wiring ----------------
window.addEventListener('keydown', e => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const code = e.code, st = game.state;
    input.keys.add(code);
    if (st === 'PLAYING' || st === 'DYING') {
        if (GAME_KEYS.has(code)) e.preventDefault();
        if (e.repeat || st === 'DYING') return;
        if (code === 'Space' || code === 'ShiftLeft' || code === 'ShiftRight') input.queueDash();
        else if (code === 'Escape' || code === 'KeyP') togglePause();
        else if (code === 'KeyB') openShop();
        else if (code === 'KeyF') toggleAutoFire();
        return;
    }
    if (e.repeat) return;
    if (st === 'PAUSED' && (code === 'Escape' || code === 'KeyP')) { e.preventDefault(); togglePause(); }
    else if (st === 'PAUSED' && code === 'KeyB') { e.preventDefault(); openShop(); }
    else if (st === 'SHOP' && (code === 'Escape' || code === 'KeyB')) { e.preventDefault(); closeShop(); }
    else if (st === 'LEVELUP' && code in DIGIT_KEYS) { e.preventDefault(); chooseLevel(DIGIT_KEYS[code]); }
    else if (st === 'LEVELUP' && code === 'KeyR') { e.preventDefault(); rerollLevel(); }
    else if (st === 'GAMEOVER' && code === 'KeyR') { e.preventDefault(); startRun(); }
});
window.addEventListener('keyup', e => input.keys.delete(e.code));

function enableTouchMode() {
    if (input.touchMode) return;
    input.touchMode = true;
    document.body.classList.add('touch-mode');
}

window.addEventListener('pointermove', e => {
    if (e.pointerType !== 'mouse') return;
    if (Math.abs(e.clientX - input.mouse.x) + Math.abs(e.clientY - input.mouse.y) > 2) input.aimDevice = 'mouse';
    input.mouse.x = e.clientX;
    input.mouse.y = e.clientY;
});
window.addEventListener('pointerup', e => { if (e.pointerType === 'mouse' && e.button === 0) input.mouse.down = false; });
canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('pointerdown', e => {
    if (e.pointerType === 'mouse') {
        input.mouse.x = e.clientX; input.mouse.y = e.clientY; input.aimDevice = 'mouse';
        if (e.button === 0) input.mouse.down = true;
        else if (e.button === 2 && game.state === 'PLAYING') input.queueDash();
        return;
    }
    e.preventDefault();
    enableTouchMode();
    if (game.state !== 'PLAYING') return;
    const stick = e.clientX < view.cssW / 2 ? input.touch.move : input.touch.aim;
    if (stick.id !== null) return;
    stick.id = e.pointerId;
    stick.ox = stick.x = e.clientX;
    stick.oy = stick.y = e.clientY;
    if (stick === input.touch.aim) input.aimDevice = 'touch';
    canvas.setPointerCapture?.(e.pointerId);
});
canvas.addEventListener('pointermove', e => {
    for (const stick of [input.touch.move, input.touch.aim]) {
        if (stick.id !== e.pointerId) continue;
        stick.x = e.clientX; stick.y = e.clientY;
        // Floating stick: the base follows a thumb that drifts too far.
        const dx = stick.x - stick.ox, dy = stick.y - stick.oy, d = Math.hypot(dx, dy), max = STICK_RADIUS * 1.4;
        if (d > max) { stick.ox += dx / d * (d - max); stick.oy += dy / d * (d - max); }
    }
});
const releaseStick = e => { for (const stick of [input.touch.move, input.touch.aim]) if (stick.id === e.pointerId) stick.id = null; };
canvas.addEventListener('pointerup', releaseStick);
canvas.addEventListener('pointercancel', releaseStick);
canvas.addEventListener('lostpointercapture', releaseStick);

const touchDash = $('btn-touch-dash');
touchDash.addEventListener('pointerdown', e => { e.preventDefault(); enableTouchMode(); if (game.state === 'PLAYING') input.queueDash(); });

window.addEventListener('blur', () => { input.reset(); if (game.state === 'PLAYING') setState('PAUSED'); });
document.addEventListener('visibilitychange', () => {
    if (document.hidden) {
        input.reset();
        if (game.state === 'PLAYING') setState('PAUSED');
        Sound.suspend();
    } else {
        Sound.resume();
    }
});
window.addEventListener('resize', resize);
window.addEventListener('gamepaddisconnected', () => { if (game.state === 'PLAYING') setState('PAUSED'); });

function focusables() {
    const overlay = screens[game.state];
    if (!overlay) return [];
    return [...overlay.querySelectorAll('button:not(:disabled), input, a[href]')].filter(el => el.offsetParent !== null);
}
function moveFocus(dir) {
    const list = focusables();
    if (!list.length) return;
    const i = list.indexOf(document.activeElement);
    const next = list[i < 0 ? (dir > 0 ? 0 : list.length - 1) : (i + dir + list.length) % list.length];
    next.focus();
    next.scrollIntoView({ block: 'nearest' });
}
function padBack() {
    if (game.state === 'PAUSED') togglePause();
    else if (game.state === 'SHOP') closeShop();
}

function pollGamepad(dt) {
    const pad = input.pad;
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let gp = null;
    for (const g of pads) if (g && g.connected) { gp = g; break; }
    if (!gp) { pad.connected = false; pad.mx = pad.my = pad.ax = pad.ay = pad.am = 0; pad.fire = false; return; }
    pad.connected = true;
    const dead = (x, y, zone) => {
        const m = Math.hypot(x, y);
        if (m < zone) return [0, 0, 0];
        const mag = Math.min(1, (m - zone) / (1 - zone));
        return [x / m * mag, y / m * mag, mag];
    };
    [pad.mx, pad.my] = dead(gp.axes[0] || 0, gp.axes[1] || 0, 0.18);
    [pad.ax, pad.ay, pad.am] = dead(gp.axes[2] || 0, gp.axes[3] || 0, 0.3);
    pad.fire = (gp.buttons[7]?.value || 0) > 0.35;
    if (pad.am > 0 || pad.fire) input.aimDevice = 'pad';
    const pressed = i => !!gp.buttons[i]?.pressed;
    const edge = i => pressed(i) && !pad.prev[i];
    const st = game.state;
    if (st === 'PLAYING') {
        if (edge(0) || edge(1) || edge(4) || edge(5)) input.queueDash();
        if (edge(9)) togglePause();
        else if (edge(3) || edge(8)) openShop();
    } else if (st !== 'DYING') {
        const ly = gp.axes[1] || 0, lx = gp.axes[0] || 0;
        pad.navT -= dt;
        let dir = 0;
        if (edge(12) || edge(14)) dir = -1;
        else if (edge(13) || edge(15)) dir = 1;
        else if (Math.abs(ly) > 0.6 || Math.abs(lx) > 0.6) { if (pad.navT <= 0) { dir = (Math.abs(ly) > Math.abs(lx) ? ly : lx) > 0 ? 1 : -1; pad.navT = 0.22; } }
        else pad.navT = 0;
        const active = document.activeElement;
        if (dir && active && active.type === 'range' && (edge(14) || edge(15) || Math.abs(lx) > Math.abs(ly))) {
            active.value = clamp(+active.value + dir * +active.step, +active.min, +active.max);
            active.dispatchEvent(new Event('input', { bubbles: true }));
        } else if (dir) {
            moveFocus(dir);
        }
        if (edge(0) && active && active !== document.body) active.click();
        if (edge(1)) padBack();
        if (edge(9)) { if (st === 'MENU') startRun(); else if (st === 'GAMEOVER') startRun(); else padBack(); }
        if (st === 'LEVELUP' && edge(3)) rerollLevel();
    }
    pad.prev = gp.buttons.map(b => b.pressed);
}

// ---------------- UI wiring ----------------
$('btn-start').addEventListener('click', startRun);
$('btn-retry').addEventListener('click', guarded(startRun));
$('btn-restart').addEventListener('click', guarded(startRun));
$('btn-resume').addEventListener('click', guarded(togglePause));
$('btn-pause-shop').addEventListener('click', guarded(openShop));
$('btn-quit').addEventListener('click', guarded(quitToPortfolio));
$('btn-go-quit').addEventListener('click', guarded(quitToPortfolio));
$('btn-hud-pause').addEventListener('click', togglePause);
$('btn-hud-shop').addEventListener('click', openShop);
$('btn-reroll').addEventListener('click', guarded(rerollLevel));
$('btn-skip').addEventListener('click', guarded(skipLevel));
$('btn-shop-reroll').addEventListener('click', guarded(shopReroll));
$('btn-shop-close').addEventListener('click', guarded(closeShop));
$('btn-remix').addEventListener('click', () => { Sound.remix(); Sound.sfx('click'); banner('SOUNDTRACK REMIXED', 'New key, new groove', '#ff4df0'); });
$('set-music').addEventListener('input', e => { settings.music = +e.target.value; Sound.applyVolumes(); persist(); });
$('set-sfx').addEventListener('input', e => { settings.sfx = +e.target.value; Sound.applyVolumes(); persist(); });
$('set-shake').addEventListener('change', e => { settings.shake = e.target.checked; persist(); });
$('set-numbers').addEventListener('change', e => { settings.numbers = e.target.checked; persist(); });
$('set-autofire').addEventListener('change', e => { settings.autoFire = e.target.checked; persist(); });

// ---------------- Boot ----------------
game.run = createRun();
renderMenuBest();
setState('MENU');
resize();
requestAnimationFrame(t => { lastFrame = t; frame(t); });

// Test and debugging hooks (used by tests/browser-regression.mjs).
window.NeonSurvivor = {
    get state() { return game.state; },
    get run() { return game.run; },
    get frames() { return game.frames; },
    get particleCount() { return particles.count; },
    set manual(v) { game.manual = !!v; },
    set god(v) { game.god = !!v; },
    start: startRun,
    togglePause, openShop, closeShop, chooseLevel, rerollLevel, skipLevel, shopReroll, activatePowerup: (type, d) => activatePowerup(game.run, type, d),
    addXp: amount => addXp(game.run, amount),
    addWeapon: id => addWeapon(game.run, id),
    seed(n) { random = mulberry32(n >>> 0); },
    step(n = 1) {
        for (let i = 0; i < n && (game.state === 'PLAYING' || game.state === 'DYING'); i++) tick();
    },
    render() { render(1, 0); updateHud(); },
    spawn(type, dx = 0, dy = 0, elite = false) {
        const run = game.run, e = makeEnemy(run, type, run.player.x + dx, run.player.y + dy, elite);
        run.enemies.push(e);
        return e;
    },
    spawnBoss: () => spawnBoss(game.run),
    input, ctx, canvas, WEAPONS, PASSIVES, SUPPLIES, AUGMENTS, BASE_STATS,
};
