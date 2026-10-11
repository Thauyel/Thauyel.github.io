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

    await navigate('/other/game.html', 'typeof draw === "function"');
    assert.equal(await evaluate(`(() => {
        let saves = 0, restores = 0;
        const save = ctx.save.bind(ctx), restore = ctx.restore.bind(ctx);
        ctx.save = () => { saves++; save(); };
        ctx.restore = () => { restores++; restore(); };
        const original = ctx.getTransform();
        for (const amount of [0, 0.51, 20]) {
            shakeAmount = amount;
            draw();
            if (saves !== restores) return false;
            const after = ctx.getTransform();
            if (['a','b','c','d','e','f'].some(key => after[key] !== original[key])) return false;
        }
        return true;
    })()`), true, 'Canvas state and transform must be restored on every shake frame');
    console.log('Passed canvas shake state and transform restoration checks.');

    await evaluate(`localStorage.removeItem('neonhorde.scores.v1')`);
    await navigate('/other/bh/', 'window.NEON_HORDE !== undefined');
    assert.equal(await evaluate(`(async () => {
        const app = window.NEON_HORDE, ui = app.ui;
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
        const top = () => ui.top() && ui.top().id;
        app.ui.closeAll();
        app.startRun('vanguard', 'grid', false);
        await wait(100);
        // A starting relic is offered and the clock is held until it is answered.
        if (top() !== 'scr-relic' || app.game.time !== 0) return 'relic';
        document.querySelector('#relic-cards .choice').click();
        if (app.game.player.relics.length !== 1 || top()) return 'relic pick';
        await wait(400);
        if (!(app.game.time > 0.1)) return 'clock';
        const g = app.game;
        g.addXp(g.player.xpNext);
        await wait(100);
        if (top() !== 'scr-level' || document.querySelectorAll('#level-cards .choice').length < 3) return 'level';
        const before = g.charges.reroll;
        document.getElementById('btn-reroll').click();
        if (g.charges.reroll !== before - 1) return 'reroll';
        document.querySelector('#level-cards .choice').click();
        if (top() || g.choice) return 'level pick';
        // A maxed weapon with its paired module evolves from a cache.
        const w = g.player.weapons[0];
        w.level = w.def.maxLevel;
        if (!g.findPassive(w.def.evo.with)) g.addPassive(w.def.evo.with);
        g.queue.push({kind: 'chest', boss: true});
        g.openNextChoice();
        await wait(100);
        if (top() !== 'scr-chest' || w.def.id !== 'hyperpulse') return 'evolve';
        document.getElementById('btn-chest-ok').click();
        document.getElementById('btn-chest-ok').click();
        if (top() || g.choice) return 'chest close';
        app.togglePause();
        const paused = g.time;
        await wait(300);
        if (!app.paused || g.time !== paused || top() !== 'scr-pause') return 'pause';
        app.togglePause();
        await wait(200);
        if (app.paused || !(g.time > paused)) return 'resume';
        g.player.iframes = 0;
        g.hurtPlayer(1e6, 'test');
        await wait(2300);
        if (top() !== 'scr-over') return 'results';
        const scores = JSON.parse(localStorage.getItem('neonhorde.scores.v1'));
        if (!scores || scores.grid.length !== 1 || scores.grid[0].ship !== 'vanguard') return 'score';
        document.getElementById('btn-retry').click();
        await wait(100);
        return app.game !== g && top() === 'scr-relic' ? true : 'retry';
    })()`), true, 'Neon Horde run flow: relic, level-up, reroll, evolution, pause, results and retry');
    await evaluate(`localStorage.removeItem('neonhorde.scores.v1')`);
    assert.deepEqual(exceptions, [], 'No JavaScript exceptions expected');
    console.log('Passed Neon Horde choice, evolution, pause, results and retry checks.');
} finally {
    await call('Page.close');
    socket.close();
}
