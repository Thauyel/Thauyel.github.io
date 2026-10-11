// Headless balance check for the Vertigo level generator (other/game/).
// Runs the built-in autopilot across many seeds; no browser or npm dependencies.
//   node tests/vertigo-sim.mjs
import assert from 'node:assert/strict';

await import('../other/game/js/world.js');
const V = globalThis.VERTIGO;

function run(seed, seconds) {
    const world = new V.World(seed);
    for (let t = 0; t < seconds && world.player.alive; t += 1 / 60) {
        world.hold = world.botHold();
        for (let i = 0; i < 4; i++) world.step(1 / 240);
        world.events.length = 0;
    }
    return world;
}

const a = run(12345, 20), b = run(12345, 20);
assert.equal(a.player.x, b.player.x, 'the same seed must build the same city');
assert.equal(a.score(), b.score());

const dists = [];
for (let s = 1; s <= 40; s++) dists.push(run(s * 7919, 120).dist);
dists.sort((x, y) => x - y);
const median = dists[dists.length >> 1];
const early = dists.filter(d => d < 100).length;
console.log(`autopilot over 40 seeds: median ${Math.round(median)} m, worst ${Math.round(dists[0])} m, deaths under 100 m: ${early}`);
assert.ok(median > 1500, 'generated cities should be traversable by the autopilot');
assert.ok(early <= 4, 'the opening stretch should rarely be lethal');
console.log('vertigo-sim: ok');
