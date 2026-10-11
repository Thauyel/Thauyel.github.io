// Headless simulation test for the bullet-heaven roguelite in other/bh/.
// Runs autopilot through full 15-minute runs on every stage and checks the
// simulation stays finite, bounded and deterministic. No npm dependencies.
//   node tests/bh-sim.mjs            (quick: every stage, a few ships)
//   node tests/bh-sim.mjs --full     (every ship on every stage)
import assert from 'node:assert/strict';
import {Game, RUN_LENGTH, MAX_GEMS} from '../other/bh/js/game.js';
import {Bot} from '../other/bh/js/bot.js';
import {SHIPS, WEAPONS, EVOLVED, PASSIVES} from '../other/bh/js/content.js';
import {STAGES, ENEMIES, BOSSES} from '../other/bh/js/stages.js';

const DT = 1 / 60;
const full = process.argv.includes('--full');

function finite(v, what) {
    assert.ok(Number.isFinite(v), `${what} must be finite, got ${v}`);
}

function run({stage, ship, seed, seconds = RUN_LENGTH + 30, overclock = false, god = false}) {
    const g = new Game({stage, ship, seed, overclock});
    const bot = new Bot(g);
    let maxEnemies = 0, maxProj = 0, maxPickups = 0;
    const seenEvents = new Set();
    let steps = 0;
    while (g.time < seconds && !g.over) {
        bot.act();
        if (god) g.player.hp = g.stats.maxHp;
        g.step(DT);
        steps++;
        for (const ev of g.events) seenEvents.add(ev.type);
        g.events.length = 0;
        maxEnemies = Math.max(maxEnemies, g.enemies.length);
        maxProj = Math.max(maxProj, g.projectiles.length);
        maxPickups = Math.max(maxPickups, g.pickups.length);
        if (steps % 120 === 0) {
            const p = g.player;
            finite(p.x, 'player.x');
            finite(p.y, 'player.y');
            finite(p.hp, 'player.hp');
            assert.ok(p.hp <= g.stats.maxHp + 1e-6, 'hp never exceeds max');
            for (const e of g.enemies) {
                finite(e.x, `${e.def.id}.x`);
                finite(e.y, `${e.def.id}.y`);
                finite(e.hp, `${e.def.id}.hp`);
            }
            for (const pr of g.projectiles) {
                finite(pr.x, `${pr.kind}.x`);
                finite(pr.y, `${pr.kind}.y`);
            }
            assert.ok(g.gemCount <= MAX_GEMS + 1, `gem count bounded (${g.gemCount})`);
            const realGems = g.pickups.filter(pk => pk.kind === 'gem').length;
            assert.equal(realGems, g.gemCount, 'gem counter matches pickups');
            const crates = g.enemies.filter(e => e.def.crate && e.alive).length;
            assert.equal(crates, g.crateCount, 'crate counter matches');
            assert.ok(g.player.weapons.length <= 6 && g.player.passives.length <= 6, 'slot limits');
        }
        if (steps > (seconds + 5) * 60 * 2) throw new Error('runaway loop');
    }
    return {g, maxEnemies, maxProj, maxPickups, seenEvents};
}

// --- data integrity
for (const w of Object.values(WEAPONS)) {
    assert.ok(EVOLVED[w.evo.into], `${w.id} evolves into a defined weapon`);
    assert.ok(PASSIVES[w.evo.with], `${w.id} evolution passive exists`);
    assert.equal(EVOLVED[w.evo.into].from, w.id);
    assert.equal(w.levels.length, 7, `${w.id} has 8 levels`);
}
for (const s of Object.values(SHIPS)) assert.ok(WEAPONS[s.weapon], `${s.id} starting weapon`);
for (const st of Object.values(STAGES)) {
    assert.equal(st.waves.length, 15, `${st.id} has a wave per minute`);
    for (const ev of st.events) {
        if (ev.kind === 'boss') assert.ok(BOSSES[ev.boss], `${st.id} boss ${ev.boss}`);
        if (ev.type) assert.ok(ENEMIES[ev.type], `${st.id} event enemy ${ev.type}`);
    }
}

// --- determinism
{
    const a = run({stage: 'grid', ship: 'vanguard', seed: 42, seconds: 90});
    const b = run({stage: 'grid', ship: 'vanguard', seed: 42, seconds: 90});
    assert.equal(a.g.kills, b.g.kills, 'same seed, same kills');
    assert.equal(a.g.player.x, b.g.player.x, 'same seed, same path');
}

// --- every weapon and evolution exercised with god mode
{
    for (const id of Object.keys(WEAPONS)) {
        const g = new Game({stage: 'grid', ship: 'vanguard', seed: 7, startRelic: false});
        const bot = new Bot(g);
        g.player.weapons.length = 0;
        const w = g.addWeapon(id);
        w.level = w.def.maxLevel;
        g.addPassive(w.def.evo.with);
        g.evolve(w);
        g.addWeapon(id === 'pulse' ? 'lash' : 'pulse');
        let dmg = 0;
        while (g.time < 120) {
            if (g.choice) g.skip() || g.choose(0);
            g.input = bot.steer();
            g.player.hp = g.stats.maxHp;
            g.step(DT);
            g.events.length = 0;
        }
        dmg = w.dmg;
        assert.ok(dmg > 0, `${w.def.name} deals damage`);
        console.log(`  ${w.def.name.padEnd(18)} ${Math.round(dmg).toString().padStart(8)} dmg in 2 min, ${w.kills} kills`);
    }
}

// --- full runs
const ships = full ? Object.keys(SHIPS) : ['vanguard', 'bastion', 'tempest'];
const results = [];
let seed = 1000;
const only = (process.argv.find(a => a.startsWith('--stage=')) || '').slice(8);
for (const stage of Object.keys(STAGES)) {
    if (only && stage !== only) continue;
    for (const ship of ships) {
        const r = run({stage, ship, seed: seed++});
        const g = r.g;
        results.push(r);
        const evolved = g.player.weapons.filter(w => w.def.evolved).map(w => w.def.name);
        console.log(`${stage.padEnd(7)} ${ship.padEnd(9)} ${g.cleared ? 'CLEAR' : 'died '} t=${g.time.toFixed(0).padStart(4)}s lvl=${String(g.player.level).padStart(3)} kills=${String(g.kills).padStart(5)} maxE=${r.maxEnemies} maxP=${r.maxProj} score=${g.score()} evo=[${evolved.join(', ')}]${g.over ? ' cause=' + g.deathCause : ''}`);
    }
}
// God-mode runs make sure the whole timeline (bosses, clear, purger) executes.
for (const stage of Object.keys(STAGES)) {
    if (only && stage !== only) continue;
    const r = run({stage, ship: 'vanguard', seed: 99, god: true, seconds: RUN_LENGTH + 60});
    assert.ok(r.g.cleared, `${stage}: timeline reaches the clear`);
    assert.ok(r.seenEvents.has('bossSpawn') && r.seenEvents.has('clear'), `${stage}: bosses and clear fire`);
    // The autopilot kites bosses rather than hunting them, so this is a loose floor.
    assert.ok(r.g.bossKills >= 1, `${stage}: bosses are beatable (${r.g.bossKills})`);
    console.log(`god ${stage}: bosses killed ${r.g.bossKills}, level ${r.g.player.level}, maxEnemies ${r.maxEnemies}`);
}
const survivedMid = results.filter(r => r.g.time > 300).length;
assert.ok(survivedMid >= results.length * 0.6, 'the autopilot should usually survive the first five minutes');
console.log('bh-sim: ok');
