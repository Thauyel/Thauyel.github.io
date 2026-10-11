// Run against a served checkout and Chromium with remote debugging enabled.
// See README.md. Uses Node's built-in WebSocket and fetch; no npm dependencies.
import assert from 'node:assert/strict';

const site = process.argv[2] || 'http://127.0.0.1:8000';
const debuggerUrl = process.argv[3] || 'http://127.0.0.1:9222';
const response = await fetch(`${debuggerUrl}/json/new?${encodeURIComponent('about:blank')}`, {method: 'PUT'});
assert.equal(response.ok, true, 'Chromium debugging endpoint must be available');
const target = await response.json();
const socket = new WebSocket(target.webSocketDebuggerUrl);
await new Promise(resolve => socket.addEventListener('open', resolve, {once: true}));
let sequence = 0;
const pending = new Map();
const exceptions = [];
socket.addEventListener('message', event => {
    const message = JSON.parse(event.data);
    if (message.id) {
        pending.get(message.id)?.(message);
        pending.delete(message.id);
    }
    if (message.method === 'Runtime.exceptionThrown') exceptions.push(message.params.exceptionDetails);
});
function call(method, params = {}) {
    return new Promise(resolve => {
        const id = ++sequence;
        pending.set(id, resolve);
        socket.send(JSON.stringify({id, method, params}));
    });
}
async function evaluate(expression) {
    const reply = await call('Runtime.evaluate', {expression, awaitPromise: true, returnByValue: true});
    assert.equal(reply.error, undefined);
    assert.equal(reply.result.exceptionDetails, undefined, JSON.stringify(reply.result.exceptionDetails));
    return reply.result.result.value;
}
async function press(key, code) {
    for (const type of ['keyDown', 'keyUp']) await call('Input.dispatchKeyEvent', {type, key, code});
}
async function navigate(path, ready) {
    await call('Page.navigate', {url: site + path});
    for (let attempt = 0; attempt < 100; attempt++) {
        if (await evaluate(`location.pathname === ${JSON.stringify(path)} && (${ready})`)) return;
        await new Promise(resolve => setTimeout(resolve, 100));
    }
    throw new Error(`Page did not initialize: ${path}`);
}
try {
    await call('Runtime.enable');
    await call('Network.enable');
    await call('Network.setCacheDisabled', {cacheDisabled: true});
    await navigate('/', 'typeof openLightbox === "function"');
    assert.equal(await evaluate(`(() => {
        document.body.style.overflow = 'auto';
        for (const [open, close, id] of [
            [openMockupGallery, closeMockupGallery, 'mockup-lightbox'],
            [openHermesMockupGallery, closeHermesMockupGallery, 'hermes-mockup-lightbox']
        ]) {
            open();
            document.querySelector('#' + id + ' img').click();
            if (document.body.style.overflow !== 'hidden') return false;
            closeLightbox(null, true);
            if (document.body.style.overflow !== 'hidden') return false;
            close();
            if (document.body.style.overflow !== 'auto') return false;
        }
        openMockupGallery();
        document.querySelector('#mockup-lightbox img').click();
        closeMockupGallery();
        if (document.body.style.overflow !== 'hidden') return false;
        closeLightbox(null, true);
        return document.body.style.overflow === 'auto';
    })()`), true, 'Nested modals must retain and restore the scroll lock');
    assert.equal(await evaluate(`(async () => {
        const image = document.querySelector('.poster-gallery img');
        image.click();
        toggleZoomCenter();
        img.dispatchEvent(new MouseEvent('mousedown', {clientX: 100, clientY: 100}));
        window.dispatchEvent(new MouseEvent('mousemove', {clientX: 120, clientY: 120}));
        window.dispatchEvent(new MouseEvent('mouseup'));
        closeLightbox(null, true);
        image.click();
        img.click();
        if (scale !== 2 || isDragging || isDragAction) return false;
        initialDistance = 100; initialScale = 3; touchStartX = 100;
        navigateGallery(1);
        await new Promise(resolve => setTimeout(resolve, 200));
        const reset = scale === 1 && initialDistance === null && initialScale === 1 && touchStartX === 0;
        closeLightbox(null, true);
        return reset;
    })()`), true, 'Reopening and navigating must reset gesture state');
    console.log('Passed nested modal scrolling and drag/touch reset checks.');

    await navigate('/other/digit.html', 'typeof App !== "undefined"');
    assert.equal(await evaluate(`(async () => {
        App.state.correctAnswer = [1]; App.state.fullSequence = [1];
        App.state.userInputs = []; App.state.score = 0;
        App.showScreen('input');
        App.addInput(1); App.removeInput(); App.addInput(1);
        await new Promise(resolve => setTimeout(resolve, 350));
        App.finalize(true);
        return App.state.score === 1 && App.state.userInputs.length === 1;
    })()`), true, 'One answer must award at most one point');
    assert.equal(await evaluate(`(async () => {
        // Skip sequence presentation to test the next-round and timer transitions.
        App.runDisplayLoop = async () => {};
        await App.playRound();
        App.state.correctAnswer = [1]; App.state.fullSequence = [1];
        App.startInputPhase(); App.addInput(1); App.togglePause();
        await new Promise(resolve => setTimeout(resolve, 350));
        if (App.state.score !== 1) return false;
        App.togglePause();
        await new Promise(resolve => setTimeout(resolve, 350));
        if (App.state.score !== 2) return false;
        await App.playRound();
        App.state.correctAnswer = [1]; App.startInputPhase();
        App.finalize(false); App.finalize(false);
        return App.state.score === 2 && App.state.roundFinalized;
    })()`), true, 'Round resets, pause/resume and timeout finalization must work');
    console.log('Passed single scoring, input locking, next-round reset, pause/resume and timeout checks.');

    // Physical keyboard entry and pause-aware presentation timing.
    await navigate('/other/digit.html', 'typeof App !== "undefined"');
    await evaluate(`(() => {
        App.state.correctAnswer = [1, 2, 3]; App.state.fullSequence = [1, 2, 3];
        App.state.userInputs = []; App.state.score = 0; App.showScreen('input');
    })()`);
    for (const [key, code] of [['1', 'Digit1'], ['9', 'Digit9'], ['Backspace', 'Backspace'], ['2', 'Numpad2']]) await press(key, code);
    assert.deepEqual(await evaluate('App.state.userInputs'), [1, 2], 'Digits and Backspace must work from the keyboard');
    await press('Escape', 'Escape');
    assert.equal(await evaluate('App.state.isPaused'), true, 'Escape must pause a round');
    await press('Escape', 'Escape');
    await navigate('/other/digit.html', 'typeof App !== "undefined"');
    assert.equal(await evaluate(`(async () => {
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        App.generateSmartSequence = () => [7];
        App.startGame('easy');          // 1000 ms lead-in, 1000 ms digit, 200 ms blank
        await wait(2100);               // pause inside the final blank
        App.togglePause(); await wait(600);
        if (!App.dom.screens.input.classList.contains('hidden')) return 'input started while paused';
        App.togglePause(); await wait(300);
        if (App.dom.screens.input.classList.contains('hidden')) return 'input did not start after resuming';
        if (App.state.roundFinalized) return 'answer time was lost to the pause';
        App.generateSmartSequence = () => [5];
        App.startGame('easy');
        await wait(1200);               // the digit is visible
        App.togglePause(); await wait(500); App.togglePause();
        await wait(800);
        return App.dom.numberBox.innerText === '5' ? true : 'digit hidden too soon after resuming';
    })()`), true, 'Pauses must not eat into answer or digit display time');
    console.log('Passed digit keyboard input and pause timing checks.');

    // ---- Neon Survivor ----
    await navigate('/other/game.html', 'typeof NeonSurvivor !== "undefined"');
    await evaluate(`localStorage.removeItem('neon-survivor:v2')`);
    await call('Emulation.setDeviceMetricsOverride', {width: 1366, height: 768, deviceScaleFactor: 1, mobile: false});
    const start = await evaluate(`JSON.stringify(document.getElementById('btn-start').getBoundingClientRect())`);
    const {x, y, width, height} = JSON.parse(start);
    for (const type of ['mousePressed', 'mouseReleased']) {
        await call('Input.dispatchMouseEvent', {type, x: x + width / 2, y: y + height / 2, button: 'left', clickCount: 1});
    }
    assert.equal(await evaluate('NeonSurvivor.state'), 'PLAYING', 'The start button must begin a run');
    assert.equal(await evaluate(`(async () => {
        const G = NeonSurvivor, wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        for (let i = 0; i < 3; i++) { G.togglePause(); G.togglePause(); G.start(); }
        const before = G.frames; await wait(1000);
        return G.frames - before;
    })()`) < 100, true, 'Pausing and restarting must not stack animation loops');

    assert.equal(await evaluate(`(() => {
        const G = NeonSurvivor; G.manual = true; G.seed(1); G.start();
        const p = G.run.player; p.hp = 1; p.iframes = 0;
        G.addXp(500);                       // queue level-ups
        G.spawn('brute', 0, 0);             // and die in the same tick
        G.step(1);
        if (G.state !== 'DYING') return 'state ' + G.state;
        G.step(200);
        return G.state;
    })()`), 'GAMEOVER', 'Death must win over a simultaneous level-up');

    assert.equal(await evaluate(`(() => {
        const G = NeonSurvivor; G.start();
        const run = G.run;
        run.passives.thrusters = 3; run.augments.servo = 2; G.addWeapon('tesla');
        G.activatePowerup('berserk'); G.activatePowerup('shield', 9);
        G.run.time = 250; G.step(1); G.render();
        G.start(); G.step(1); G.render();
        const r = G.run, s = r.stats;
        const clean = Object.keys(G.BASE_STATS).every(k => s[k] === G.BASE_STATS[k]);
        return clean && !r.weapons.length && !Object.keys(r.powerups).length && r !== run &&
            document.getElementById('powerups').children.length === 0 &&
            document.getElementById('wave-label').textContent.startsWith('WAVE 1');
    })()`), true, 'Restart must reset stats, weapons, powerups and HUD');

    assert.equal(await evaluate(`(() => {
        const G = NeonSurvivor; G.start(); G.seed(3);
        G.addWeapon('tesla');
        const p = G.run.player, foes = [0, 1, 2].map(i => { const e = G.spawn('shard', 60 + i * 110, 0); e.hp = e.maxHp = 1; return e; });
        G.run.weapons[0].cd = 0;
        G.step(1);
        return foes.every(e => e.dead);
    })()`), true, 'Tesla chains must hit every target even when earlier links die');

    assert.equal(await evaluate(`(() => {
        const G = NeonSurvivor; G.start();
        G.run.credits = 5000; G.openShop(); G.closeShop();
        G.run.shop.supplies = ['data', 'repair']; G.openShop();
        const before = G.run.player.level;
        G.run.player.xp = G.run.player.xpNext - 1;
        document.querySelector('#shop-supplies button').click();
        const queued = G.run.pendingLevels;
        if (G.state !== 'SHOP' || queued < 1 || G.run.player.level !== before + queued) return 'shop state ' + G.state;
        const xpWidth = parseFloat(document.getElementById('xp-fill').style.width || '0');
        if (G.run.player.xp >= G.run.player.xpNext || xpWidth > 100) return 'xp overflow';
        return 'ok';
    })()`), 'ok', 'Data Pack must queue level-ups instead of opening one over the shop');
    await press('Escape', 'Escape');
    assert.equal(await evaluate(`NeonSurvivor.state`), 'PLAYING', 'Escape must close the shop');
    await evaluate('NeonSurvivor.step(1)');
    assert.equal(await evaluate(`NeonSurvivor.state`), 'LEVELUP', 'Queued level-ups open once play resumes');
    // Releasing a held dash key right after the cards appear must not pick one.
    await call('Input.dispatchKeyEvent', {type: 'keyDown', key: ' ', code: 'Space', windowsVirtualKeyCode: 32});
    await call('Input.dispatchKeyEvent', {type: 'keyUp', key: ' ', code: 'Space', windowsVirtualKeyCode: 32});
    assert.equal(await evaluate(`NeonSurvivor.state`), 'LEVELUP', 'A held Space must not choose a card');
    assert.equal(await evaluate(`(async () => {
        await new Promise(resolve => setTimeout(resolve, 450));
        const G = NeonSurvivor, pending = G.run.pendingLevels;
        document.dispatchEvent(new KeyboardEvent('keydown', {code: 'Digit1', bubbles: true}));
        return G.run.pendingLevels === pending - 1;
    })()`), true, 'Number keys must choose level-up cards');

    // The shop must stay usable on short screens.
    assert.equal(await evaluate(`(() => {
        const G = NeonSurvivor; G.start(); G.openShop();
        const overlay = document.getElementById('screen-shop'), close = document.getElementById('btn-shop-close');
        overlay.scrollTop = overlay.scrollHeight;
        const r = close.getBoundingClientRect();
        G.closeShop();
        return r.bottom <= innerHeight && r.top >= 0;
    })()`), true, 'Shop close button must be reachable');

    await call('Emulation.setDeviceMetricsOverride', {width: 800, height: 520, deviceScaleFactor: 1, mobile: false});
    assert.equal(await evaluate(`(async () => {
        const G = NeonSurvivor; G.start(); G.togglePause();
        dispatchEvent(new Event('resize'));
        await new Promise(resolve => requestAnimationFrame(resolve));
        const c = G.canvas, pixel = G.ctx.getImageData(Math.floor(c.width / 2), Math.floor(c.height / 2), 1, 1).data;
        G.togglePause();
        return c.width === 800 && pixel[1] + pixel[2] > 60;
    })()`), true, 'Resizing while paused must redraw the scene');

    assert.equal(await evaluate(`(() => {
        const G = NeonSurvivor, ctx = G.ctx;
        let saves = 0, restores = 0;
        const save = ctx.save.bind(ctx), restore = ctx.restore.bind(ctx);
        ctx.save = () => { saves++; save(); };
        ctx.restore = () => { restores++; restore(); };
        G.run.trauma = 1; G.run.items.push({x: G.run.player.x + 40, y: G.run.player.y, type: 'nuke', life: 10, rot: 0, dead: false});
        G.render();
        delete ctx.save; delete ctx.restore;
        const t = ctx.getTransform();
        return saves > 0 && saves === restores && t.e === 0 && t.f === 0;
    })()`), true, 'Rendering must leave the canvas state balanced');

    // A long god-mode run through waves and bosses must stay stable.
    assert.equal(await evaluate(`(() => {
        const G = NeonSurvivor; G.seed(42); G.start(); G.god = true;
        for (const id of Object.keys(G.WEAPONS)) for (let i = 0; i < 3; i++) G.addWeapon(id);
        let maxEnemies = 0;
        for (let i = 0; i < 60 * 400; i++) {
            if (G.state === 'LEVELUP') { G.chooseLevel(0); continue; }
            G.step(1);
            maxEnemies = Math.max(maxEnemies, G.run.enemies.length);
            if (i % 600 === 0) G.render();
        }
        G.god = false;
        return G.run.bossCount >= 1 && maxEnemies <= 240 && G.state === 'PLAYING';
    })()`), true, 'Survival run must spawn and defeat bosses within the enemy cap');
    assert.deepEqual(exceptions, [], 'No JavaScript exceptions expected');
    console.log('Passed game loop, death, restart, weapon, shop, level-up, resize and long-run checks.');
} finally {
    await call('Page.close');
    socket.close();
}
