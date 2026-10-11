// Ships, weapons (and their evolutions), passive modules and relics.
// Pure data: behaviours live in weapons.js, rules in game.js.

export const MAX_WEAPONS = 6;
export const MAX_PASSIVES = 6;

// ---------------------------------------------------------------- weapons
// `base` is level 1. `levels[i]` is the delta applied when reaching level i + 2.
// Evolved weapons replace the base stats entirely and ignore `levels`.

export const WEAPONS = {
    pulse: {
        name: 'Pulse Blaster', color: '#3df2ff', behavior: 'pulse',
        desc: 'Fires plasma bolts at the nearest enemy.',
        base: {dmg: 10, cd: 1.1, amount: 1, speed: 480, pierce: 1, area: 1, duration: 1.6, knock: 3, interval: 0.09},
        levels: [{amount: 1}, {cd: -0.15}, {amount: 1}, {dmg: 8}, {pierce: 1}, {amount: 1}, {dmg: 10}],
        evo: {with: 'overclock', into: 'hyperpulse'},
    },
    lash: {
        name: 'Plasma Lash', color: '#ff3df2', behavior: 'lash',
        desc: 'Sweeps a plasma whip horizontally. Passes through enemies.',
        base: {dmg: 12, cd: 1.3, amount: 1, area: 1, knock: 6, w: 210, h: 46, interval: 0.12},
        levels: [{amount: 1}, {dmg: 5, area: 0.1}, {dmg: 5}, {area: 0.1}, {dmg: 5}, {dmg: 5}, {dmg: 5}],
        evo: {with: 'repair', into: 'siphonlash'},
    },
    missile: {
        name: 'Homing Missiles', color: '#ffb000', behavior: 'missile',
        desc: 'Launches missiles that seek out enemies and explode.',
        base: {dmg: 14, cd: 1.6, amount: 1, speed: 260, area: 1, duration: 3, blast: 40, knock: 4, turn: 5},
        levels: [{amount: 1}, {dmg: 6}, {area: 0.15}, {amount: 1}, {cd: -0.25}, {amount: 1}, {dmg: 10}],
        evo: {with: 'amplifier', into: 'swarm'},
    },
    orbit: {
        name: 'Orbital Shards', color: '#7ae8ff', behavior: 'orbit',
        desc: 'Crystal shards orbit your ship for a while.',
        base: {dmg: 10, cd: 2.5, amount: 2, speed: 1, area: 1, duration: 3, radius: 82, knock: 7, hitCd: 0.5},
        levels: [{amount: 1}, {speed: 0.25, area: 0.25}, {dmg: 10}, {amount: 1}, {duration: 0.5, area: 0.25}, {dmg: 10, speed: 0.25}, {amount: 1}],
        evo: {with: 'extender', into: 'halo'},
    },
    arc: {
        name: 'Arc Lightning', color: '#b9a4ff', behavior: 'arc',
        desc: 'Strikes random nearby enemies with lightning that chains.',
        base: {dmg: 15, cd: 2.4, amount: 2, area: 1, range: 420, chain: 1, chainRange: 110, knock: 2},
        levels: [{amount: 1}, {dmg: 8}, {chain: 1}, {amount: 1}, {area: 0.2, dmg: 5}, {amount: 1}, {chain: 1, dmg: 10}],
        evo: {with: 'capacitor', into: 'stormlattice'},
    },
    blade: {
        name: 'Phase Blade', color: '#5dff9e', behavior: 'blade',
        desc: 'Throws a blade that flies out and returns, cutting everything in its path.',
        base: {dmg: 12, cd: 1.7, amount: 1, speed: 380, area: 1, duration: 2.2, knock: 3, interval: 0.12},
        levels: [{dmg: 8}, {amount: 1}, {area: 0.1, speed: 95}, {amount: 1}, {dmg: 8}, {area: 0.15}, {amount: 1}],
        evo: {with: 'targeting', into: 'riftglaive'},
    },
    nova: {
        name: 'Nova Field', color: '#ff5fa2', behavior: 'nova',
        desc: 'Damaging energy field around your ship.',
        base: {dmg: 8, cd: 0.8, area: 1, radius: 70, knock: 4},
        levels: [{area: 0.2, dmg: 2}, {dmg: 2, cd: -0.1}, {area: 0.2}, {dmg: 3}, {area: 0.2, cd: -0.1}, {dmg: 3}, {area: 0.2, dmg: 3}],
        evo: {with: 'plating', into: 'singularity'},
        noAmount: true,
    },
    mine: {
        name: 'Gravity Mine', color: '#c4ff3d', behavior: 'mine',
        desc: 'Lobs mines that leave a damaging gravity well.',
        base: {dmg: 8, cd: 3.2, amount: 1, area: 1, duration: 2.5, radius: 48, tick: 0.45},
        levels: [{amount: 1}, {area: 0.2}, {dmg: 4, duration: 0.5}, {amount: 1}, {area: 0.2}, {dmg: 4, duration: 0.5}, {amount: 1}],
        evo: {with: 'attractor', into: 'horizon'},
    },
    laser: {
        name: 'Prism Laser', color: '#ff4d6d', behavior: 'laser',
        desc: 'Fires a piercing beam at enemies. Damages repeatedly while active.',
        base: {dmg: 7, cd: 2.2, amount: 1, area: 1, length: 520, width: 10, duration: 0.35, tick: 0.1, speed: 1, interval: 0.15},
        levels: [{dmg: 3}, {amount: 1}, {area: 0.25}, {duration: 0.15}, {amount: 1}, {dmg: 4}, {amount: 1}],
        evo: {with: 'velocity', into: 'spectrum'},
    },
    drone: {
        name: 'Drone Wingmen', color: '#4dd2ff', behavior: 'drone',
        desc: 'Escort drones that shoot at nearby enemies.',
        base: {dmg: 7, cd: 0.9, amount: 1, speed: 520, area: 1, pierce: 1, radius: 56, range: 480},
        levels: [{dmg: 3}, {amount: 1}, {cd: -0.1}, {pierce: 1}, {amount: 1}, {dmg: 4}, {amount: 1, cd: -0.1}],
        evo: {with: 'dice', into: 'hive'},
    },
    shard: {
        name: 'Shard Burst', color: '#ffe14d', behavior: 'shard',
        desc: 'Hurls heavy shards in high arcs. High damage, pierces.',
        base: {dmg: 20, cd: 1.5, amount: 1, speed: 1, area: 1, pierce: 3, duration: 3, knock: 3, interval: 0.1},
        levels: [{amount: 1}, {dmg: 10}, {pierce: 2}, {amount: 1}, {dmg: 10}, {pierce: 2}, {dmg: 10, area: 0.2}],
        evo: {with: 'armor', into: 'shatterstorm'},
    },
    cryo: {
        name: 'Cryo Ring', color: '#9ff4ff', behavior: 'cryo',
        desc: 'Emits an expanding frost ring that damages and slows.',
        base: {dmg: 8, cd: 3, amount: 1, area: 1, radius: 170, speed: 1, slow: 0.4, slowT: 1.5, knock: 2, interval: 0.3},
        levels: [{dmg: 4}, {area: 0.15}, {amount: 1}, {dmg: 4, slowT: 0.5}, {cd: -0.4}, {area: 0.15, dmg: 4}, {amount: 1}],
        evo: {with: 'siphon', into: 'absolutezero'},
    },
};

export const EVOLVED = {
    hyperpulse: {
        name: 'Hyper Pulse', color: '#aefcff', behavior: 'pulse', from: 'pulse',
        desc: 'Near-continuous stream of piercing plasma.',
        base: {dmg: 24, cd: 0.16, amount: 2, speed: 640, pierce: 3, area: 1.2, duration: 1.6, knock: 2, interval: 0.04, volley: true},
    },
    siphonlash: {
        name: 'Siphon Lash', color: '#ff9cf6', behavior: 'lash', from: 'lash',
        desc: 'Critical hits restore hull integrity.',
        base: {dmg: 26, cd: 1.1, amount: 2, area: 1.25, knock: 8, w: 230, h: 58, interval: 0.1, crit: 0.2, lifesteal: 0.5},
    },
    swarm: {
        name: 'Swarm Barrage', color: '#ffd36b', behavior: 'missile', from: 'missile',
        desc: 'Missile salvos that scatter cluster bomblets.',
        base: {dmg: 22, cd: 1.2, amount: 4, speed: 320, area: 1.2, duration: 3, blast: 52, knock: 5, turn: 7, cluster: 4},
    },
    halo: {
        name: 'Halo Array', color: '#d6fbff', behavior: 'orbit', from: 'orbit',
        desc: 'A permanent ring of shards.',
        base: {dmg: 24, cd: 0.5, amount: 4, speed: 1.5, area: 1.4, duration: 1, radius: 96, knock: 9, hitCd: 0.35, permanent: true},
    },
    stormlattice: {
        name: 'Storm Lattice', color: '#e2d8ff', behavior: 'arc', from: 'arc',
        desc: 'Long lightning chains that leave crackling static fields.',
        base: {dmg: 30, cd: 1.6, amount: 5, area: 1.3, range: 520, chain: 4, chainRange: 150, knock: 3, field: true},
    },
    riftglaive: {
        name: 'Rift Glaive', color: '#b6ffd3', behavior: 'blade', from: 'blade',
        desc: 'Critical hits tear open damaging rifts.',
        base: {dmg: 26, cd: 1.2, amount: 2, speed: 440, area: 1.4, duration: 2.6, knock: 4, interval: 0.1, crit: 0.15, rift: true},
    },
    singularity: {
        name: 'Singularity Core', color: '#ffb3d1', behavior: 'nova', from: 'nova',
        desc: 'Grows with every kill inside it and repairs your hull.',
        base: {dmg: 14, cd: 0.6, area: 1.4, radius: 72, knock: 2, heal: 0.4, grow: true},
        noAmount: true,
    },
    horizon: {
        name: 'Event Horizon', color: '#e6ff9e', behavior: 'mine', from: 'mine',
        desc: 'Wells drift toward enemies and drag them in.',
        base: {dmg: 16, cd: 2.4, amount: 3, area: 1.4, duration: 3.5, radius: 56, tick: 0.35, pull: 140, drift: 70},
    },
    spectrum: {
        name: 'Spectrum Cannon', color: '#ffc2cf', behavior: 'laser', from: 'laser',
        desc: 'Rotating prism beams sweep the field.',
        base: {dmg: 14, cd: 4.5, amount: 3, area: 1.5, length: 560, width: 14, duration: 3, tick: 0.12, speed: 1, rotate: 1.6},
    },
    hive: {
        name: 'Drone Hive', color: '#a9e9ff', behavior: 'drone', from: 'drone',
        desc: 'A swarm of drones firing triple shots.',
        base: {dmg: 12, cd: 0.55, amount: 3, speed: 600, area: 1.2, pierce: 2, radius: 70, range: 560, spread: 3},
    },
    shatterstorm: {
        name: 'Shatterstorm', color: '#fff2a6', behavior: 'shard', from: 'shard',
        desc: 'Shards burst into fragments when spent.',
        base: {dmg: 34, cd: 1.2, amount: 3, speed: 1.1, area: 1.3, pierce: 6, duration: 3, knock: 4, interval: 0.08, frag: 6},
    },
    absolutezero: {
        name: 'Absolute Zero', color: '#e0fdff', behavior: 'cryo', from: 'cryo',
        desc: 'Freezes enemies solid. Frozen enemies take +50% damage.',
        base: {dmg: 18, cd: 2.4, amount: 2, area: 1.4, radius: 200, speed: 1.2, slow: 1, slowT: 1.6, knock: 0, interval: 0.25, freeze: true},
    },
};

for (const [id, d] of Object.entries(WEAPONS)) {
    d.id = id;
    d.kind = 'weapon';
    d.maxLevel = d.levels.length + 1;
}
for (const [id, d] of Object.entries(EVOLVED)) {
    d.id = id;
    d.kind = 'weapon';
    d.evolved = true;
    d.maxLevel = WEAPONS[d.from].maxLevel;
    d.levels = [];
    d.noAmount = d.noAmount || false;
}

export function weaponDef(id) {
    return WEAPONS[id] || EVOLVED[id];
}

// ---------------------------------------------------------------- passives

export const PASSIVES = {
    overclock: {name: 'Overclock Core', stat: 'cooldown', per: -0.08, max: 5, color: '#3df2ff', desc: 'Weapons recharge 8% faster.'},
    powercell: {name: 'Power Cell', stat: 'might', per: 0.1, max: 5, color: '#ff4d6d', desc: '+10% damage.'},
    amplifier: {name: 'Payload Amplifier', stat: 'area', per: 0.1, max: 5, color: '#ffb000', desc: '+10% area of effect.'},
    velocity: {name: 'Velocity Coil', stat: 'projSpeed', per: 0.1, max: 5, color: '#ff8a3d', desc: '+10% projectile speed.'},
    extender: {name: 'Field Extender', stat: 'duration', per: 0.1, max: 5, color: '#7ae8ff', desc: '+10% effect duration.'},
    capacitor: {name: 'Capacitor Array', stat: 'amount', per: 1, max: 2, color: '#b9a4ff', desc: '+1 projectile for every weapon.'},
    plating: {name: 'Hull Plating', stat: 'maxHpMul', per: 0.2, max: 5, color: '#ff5fa2', desc: '+20% max hull.'},
    armor: {name: 'Reactive Armor', stat: 'armor', per: 1, max: 5, color: '#ffe14d', desc: 'Reduces incoming damage by 1.'},
    repair: {name: 'Nano Repair', stat: 'recovery', per: 0.25, max: 5, color: '#5dff9e', desc: 'Repairs 0.25 hull per second.'},
    thrusters: {name: 'Ion Thrusters', stat: 'moveSpeed', per: 0.1, max: 5, color: '#4dd2ff', desc: '+10% movement speed.'},
    attractor: {name: 'Attractor', stat: 'magnetMul', per: 0.3, max: 5, color: '#c4ff3d', desc: '+30% pickup radius.'},
    dice: {name: 'Quantum Dice', stat: 'luck', per: 0.1, max: 5, color: '#9ff4ff', desc: '+10% luck: better level-up and cache odds.'},
    siphon: {name: 'Data Siphon', stat: 'growth', per: 0.08, max: 5, color: '#ff9cf6', desc: '+8% experience gained.'},
    targeting: {name: 'Targeting Matrix', stat: 'critChance', per: 0.04, max: 5, color: '#ffd36b', desc: '+4% critical chance, +0.2× critical damage.', extra: {critMult: 0.2}},
};
for (const [id, d] of Object.entries(PASSIVES)) {
    d.id = id;
    d.kind = 'passive';
}

// ---------------------------------------------------------------- relics

export const RELICS = {
    chain: {name: 'Chain Reaction', color: '#ffb000', desc: 'Destroyed enemies have a 12% chance to detonate, damaging those around them.'},
    twin: {name: 'Twin Protocol', color: '#3df2ff', desc: '+1 projectile for every weapon, but −10% damage.', stats: {amount: 1, might: -0.1}},
    glass: {name: 'Glass Cannon', color: '#ff4d6d', desc: '+60% damage, −40% max hull.', stats: {might: 0.6, maxHpMul: -0.4}},
    kinetic: {name: 'Kinetic Converter', color: '#4dd2ff', desc: 'While moving: +20% damage. While still: +3 armor.'},
    critmass: {name: 'Critical Mass', color: '#ffd36b', desc: '+15% critical chance and +1× critical damage.', stats: {critChance: 0.15, critMult: 1}},
    resonance: {name: 'Gem Resonance', color: '#5dff9e', desc: '+25% experience. Each gem collected grants +1% damage for 5s (up to +30%).', stats: {growth: 0.25}},
    laststand: {name: 'Last Stand', color: '#ff2d55', desc: 'Below 40% hull: +50% damage, +25% speed and +50% repair.'},
    dilation: {name: 'Time Dilation', color: '#b9a4ff', desc: 'Enemies move 12% slower and their projectiles 30% slower.'},
    phoenix: {name: 'Phoenix Protocol', color: '#ff8a3d', desc: '+1 revival. Reviving releases a devastating nova.', stats: {revival: 1}},
    storm: {name: 'Magnetic Storm', color: '#c4ff3d', desc: 'Every 40 seconds, pulls in every gem on the field.'},
    fortune: {name: 'Fortune Engine', color: '#ffe14d', desc: '+30% luck, +2 Reroll, Skip and Banish. Better caches.', stats: {luck: 0.3}},
    frost: {name: 'Frozen Wake', color: '#9ff4ff', desc: 'Moving leaves a frost trail that slows and damages enemies.'},
    echo: {name: 'Echo Chamber', color: '#ff9cf6', desc: 'Weapons have a 15% chance to fire twice.'},
    bulwark: {name: 'Bulwark', color: '#7ae8ff', desc: '+3 armor and +25% max hull, but −10% speed.', stats: {armor: 3, maxHpMul: 0.25, moveSpeed: -0.1}},
};
for (const [id, d] of Object.entries(RELICS)) {
    d.id = id;
    d.kind = 'relic';
}

// ---------------------------------------------------------------- ships

// `shape` is a polygon in unit coordinates, nose pointing to +x.
export const SHIPS = {
    vanguard: {
        name: 'Vanguard', weapon: 'pulse', color: '#3df2ff', hp: 120,
        desc: 'Reliable frontline frame. Gains damage as it levels.',
        stats: {might: 0.1}, perk: {stat: 'might', amount: 0.05, every: 10, text: '+5% damage every 10 levels'},
        charges: {reroll: 1},
        shape: [[1.2, 0], [-0.7, 0.75], [-0.35, 0], [-0.7, -0.75]],
    },
    seeker: {
        name: 'Seeker', weapon: 'missile', color: '#ffb000', hp: 100,
        desc: 'Ordnance specialist with fast-cycling launchers.',
        stats: {cooldown: -0.08, luck: 0.1}, perk: {stat: 'luck', amount: 0.05, every: 10, text: '+5% luck every 10 levels'},
        shape: [[1.2, 0], [0.1, 0.5], [-0.8, 0.9], [-0.5, 0], [-0.8, -0.9], [0.1, -0.5]],
    },
    tempest: {
        name: 'Tempest', weapon: 'arc', color: '#b9a4ff', hp: 90,
        desc: 'Storm caller. Wider and longer-lasting effects.',
        stats: {area: 0.1, duration: 0.1, maxHpMul: -0.1}, perk: {stat: 'area', amount: 0.05, every: 10, text: '+5% area every 10 levels'},
        shape: [[1.1, 0], [0.3, 0.35], [-0.2, 0.95], [-0.8, 0.3], [-0.8, -0.3], [-0.2, -0.95], [0.3, -0.35]],
    },
    bastion: {
        name: 'Bastion', weapon: 'orbit', color: '#7ae8ff', hp: 150,
        desc: 'Heavy fortress frame. Slow, armored and self-repairing.',
        stats: {maxHpMul: 0.3, armor: 2, moveSpeed: -0.1, recovery: 0.2}, perk: {stat: 'armor', amount: 1, every: 15, text: '+1 armor every 15 levels'},
        shape: [[1.0, 0], [0.5, 0.8], [-0.7, 0.8], [-0.9, 0], [-0.7, -0.8], [0.5, -0.8]],
    },
    phantom: {
        name: 'Phantom', weapon: 'blade', color: '#5dff9e', hp: 80,
        desc: 'Very fast interceptor with a wide pickup field.',
        stats: {moveSpeed: 0.25, magnetMul: 0.3, maxHpMul: -0.15}, perk: {stat: 'moveSpeed', amount: 0.03, every: 10, text: '+3% speed every 10 levels'},
        charges: {skip: 2},
        shape: [[1.3, 0], [-0.6, 0.6], [-0.2, 0], [-0.6, -0.6]],
    },
    lumen: {
        name: 'Lumen', weapon: 'laser', color: '#ff4d6d', hp: 100,
        desc: 'Precision optics. Fast projectiles and critical hits.',
        stats: {projSpeed: 0.2, critChance: 0.05, growth: 0.1}, perk: {stat: 'critChance', amount: 0.02, every: 10, text: '+2% critical chance every 10 levels'},
        shape: [[1.25, 0], [0, 0.45], [-0.75, 0.75], [-0.45, 0], [-0.75, -0.75], [0, -0.45]],
    },
    reactor: {
        name: 'Reactor', weapon: 'nova', color: '#ff5fa2', hp: 130,
        desc: 'Unstable core that constantly repairs itself.',
        stats: {recovery: 0.4, maxHpMul: 0.1}, perk: {stat: 'recovery', amount: 0.1, every: 10, text: '+0.1 repair/s every 10 levels'},
        shape: [[1.0, 0], [0.7, 0.7], [0, 1.0], [-0.7, 0.7], [-1.0, 0], [-0.7, -0.7], [0, -1.0], [0.7, -0.7]],
    },
    frost: {
        name: 'Frostbite', weapon: 'cryo', color: '#9ff4ff', hp: 110,
        desc: 'Cryogenic frame. Longer effects, faster cooldowns.',
        stats: {duration: 0.15, cooldown: -0.05}, perk: {stat: 'duration', amount: 0.05, every: 10, text: '+5% duration every 10 levels'},
        shape: [[1.2, 0], [0.2, 0.25], [0, 0.95], [-0.6, 0.25], [-0.9, 0], [-0.6, -0.25], [0, -0.95], [0.2, -0.25]],
    },
    hivemind: {
        name: 'Hivemind', weapon: 'drone', color: '#4dd2ff', hp: 100,
        desc: 'Carrier frame. Fortunate, with an extra drone bay later.',
        stats: {luck: 0.15, projSpeed: 0.1}, perk: {stat: 'amount', amount: 1, every: 30, text: '+1 projectile at level 30 and 60'},
        charges: {banish: 1},
        shape: [[1.0, 0], [0.4, 0.6], [-0.3, 1.0], [-0.9, 0.5], [-0.6, 0], [-0.9, -0.5], [-0.3, -1.0], [0.4, -0.6]],
    },
};
for (const [id, d] of Object.entries(SHIPS)) d.id = id;

// ---------------------------------------------------------------- text helpers

const STAT_TEXT = {
    dmg: v => `${v > 0 ? '+' : ''}${v} damage`,
    cd: v => `${v < 0 ? '−' : '+'}${Math.abs(v)}s cooldown`,
    amount: v => `+${v} projectile${v > 1 ? 's' : ''}`,
    area: v => `+${Math.round(v * 100)}% area`,
    speed: v => (v >= 5 ? `+${v} speed` : `+${Math.round(v * 100)}% speed`),
    pierce: v => `+${v} pierce`,
    duration: v => `+${v}s duration`,
    chain: v => `+${v} chain`,
    slowT: v => `+${v}s slow`,
};

export function levelText(def, level) {
    // Text for the upgrade that brings `def` to `level`.
    if (def.kind === 'passive') return def.desc;
    if (level <= 1) return def.desc;
    const mods = def.levels[level - 2];
    if (!mods) return def.desc;
    return Object.entries(mods).map(([k, v]) => (STAT_TEXT[k] ? STAT_TEXT[k](v) : `${k} ${v}`)).join(', ');
}

export const STAT_LABELS = [
    ['maxHp', 'Max hull', v => Math.round(v)],
    ['recovery', 'Repair', v => `${v.toFixed(2)}/s`],
    ['armor', 'Armor', v => Math.round(v)],
    ['moveSpeed', 'Speed', v => `${Math.round(v * 100)}%`],
    ['might', 'Damage', v => `${Math.round(v * 100)}%`],
    ['area', 'Area', v => `${Math.round(v * 100)}%`],
    ['projSpeed', 'Proj. speed', v => `${Math.round(v * 100)}%`],
    ['duration', 'Duration', v => `${Math.round(v * 100)}%`],
    ['amount', 'Amount', v => `+${v}`],
    ['cooldown', 'Cooldown', v => `${Math.round(v * 100)}%`],
    ['luck', 'Luck', v => `${Math.round(v * 100)}%`],
    ['growth', 'Growth', v => `${Math.round(v * 100)}%`],
    ['magnet', 'Pickup range', v => Math.round(v)],
    ['critChance', 'Crit chance', v => `${Math.round(v * 100)}%`],
    ['critMult', 'Crit damage', v => `×${v.toFixed(1)}`],
    ['revival', 'Revivals', v => v],
];
