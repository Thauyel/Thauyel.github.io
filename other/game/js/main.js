// VERTIGO — game states, input, HUD, persistence and the frame loop.
(function (V) {
    'use strict';

    const $ = id => document.getElementById(id);
    const { PX_PER_M } = V.CONST;
    const Audio = V.Audio;
    const STORE_KEY = 'vertigo.v1';
    const SUBSTEP = 1 / 240;

    const QUIPS = {
        wall: ['You found a load-bearing wall.', 'Facade inspection: failed.', 'Form follows function. You followed the wall.', 'Structural integrity: the building’s, not yours.', 'That elevation was not a suggestion.'],
        ceiling: ['Cantilevers look better from a distance.', 'You discovered the soffit.', 'Overhangs are for shade, not for faces.'],
        street: ['Zoning violation: pedestrian level.', 'Gravity is not a design suggestion.', 'Welcome to street level. Population: you.', 'The ground floor is public space. Rudely so.'],
        water: ['Waterfront property acquired.', 'Docked. Permanently.', 'Sea level, reached ahead of schedule.']
    };

    const canvas = $('stage');
    const renderer = new V.Renderer(canvas);
    const ui = {
        hud: $('hud'), dist: $('hud-dist'), score: $('hud-score'), mult: $('hud-mult'),
        title: $('screen-title'), pause: $('screen-pause'), over: $('screen-over'),
        banner: $('banner'), titleBest: $('title-best'), dailyDate: $('daily-date')
    };

    let store = {};
    try {
        store = JSON.parse(localStorage.getItem(STORE_KEY)) || {};
    } catch {
        store = {};
    }
    const save = () => {
        try {
            localStorage.setItem(STORE_KEY, JSON.stringify(store));
        } catch { /* storage unavailable: records last for this visit only */ }
    };

    let state = 'title';
    let mode = 'endless';
    let world = new V.World(randomSeed());
    let hold = false;
    let timeScale = 1;
    let slowTimer = 0;
    let deathTimer = 0;
    let overAt = 0;
    let demoDeadFor = 0;
    let orbStreak = 0;
    let lastOrbAt = 0;
    let bannerTimer = null;
    const hudCache = { dist: -1, score: -1, mult: -1 };

    Audio.muted = !!store.muted;

    function randomSeed() {
        return (Math.random() * 4294967296) >>> 0;
    }

    function todayKey() {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    }

    function record(m) {
        if (m === 'daily') return store.daily && store.daily.date === todayKey() ? store.daily : null;
        return store.best || null;
    }

    const fmt = n => Math.round(n).toLocaleString('en-US');

    function roman(n) {
        return ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n] || String(n);
    }

    function show(el, on) {
        el.classList.toggle('hidden', !on);
    }

    function refreshTitle() {
        const best = record('endless'), daily = record('daily');
        const parts = [];
        if (best) parts.push(`Best ${fmt(best.dist)} m · ${fmt(best.score)} pts`);
        if (daily) parts.push(`Today ${fmt(daily.dist)} m`);
        ui.titleBest.textContent = parts.join('   ·   ');
        ui.dailyDate.textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    function refreshMute() {
        const icon = Audio.muted
            ? '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 9l5 6M21 9l-5 6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
            : '<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M4 9h4l5-4v14l-5-4H4z" fill="currentColor"/><path d="M16 8.5a5 5 0 0 1 0 7M18.5 6a8.5 8.5 0 0 1 0 12" stroke="currentColor" stroke-width="2" fill="none" stroke-linecap="round"/></svg>';
        for (const b of [$('btn-mute'), $('btn-mute-title')]) {
            b.innerHTML = icon;
            b.setAttribute('aria-pressed', String(Audio.muted));
        }
    }

    function toggleMute() {
        Audio.init();
        Audio.setMuted(!Audio.muted);
        store.muted = Audio.muted;
        save();
        refreshMute();
    }

    function showBanner(index) {
        const d = V.DISTRICTS[index % V.DISTRICTS.length];
        const loop = Math.floor(index / V.DISTRICTS.length);
        $('banner-kicker').textContent = `District ${String(index + 1).padStart(2, '0')}`;
        $('banner-title').textContent = d.name + (loop ? ' ' + roman(loop + 1) : '');
        $('banner-tag').textContent = d.tag;
        ui.banner.classList.remove('show');
        void ui.banner.offsetWidth;
        ui.banner.classList.add('show');
        clearTimeout(bannerTimer);
        bannerTimer = setTimeout(() => ui.banner.classList.remove('show'), 3100);
    }

    function startGame(m) {
        mode = m;
        const seed = m === 'daily' ? V.hashString('vertigo:' + todayKey()) : randomSeed();
        world = new V.World(seed);
        renderer.reset();
        const best = record(m);
        renderer.bestX = best && best.dist > 25 ? best.dist * PX_PER_M : null;
        state = 'playing';
        hold = false;
        timeScale = 1;
        slowTimer = 0;
        orbStreak = 0;
        hudCache.dist = hudCache.score = hudCache.mult = -1;
        show(ui.title, false);
        show(ui.over, false);
        show(ui.pause, false);
        show(ui.hud, true);
        Audio.init();
        Audio.setDistrict(0);
        Audio.play('ui');
        showBanner(0);
        canvas.focus({ preventScroll: true });
    }

    function toMenu() {
        state = 'title';
        hold = false;
        world = new V.World(randomSeed());
        renderer.reset();
        renderer.bestX = null;
        demoDeadFor = 0;
        timeScale = 1;
        show(ui.over, false);
        show(ui.pause, false);
        show(ui.hud, false);
        show(ui.title, true);
        ui.banner.classList.remove('show');
        Audio.setDistrict(0);
        refreshTitle();
    }

    function setPaused(p) {
        if (p && state === 'playing') {
            state = 'paused';
            hold = false;
            show(ui.pause, true);
            $('btn-resume').focus({ preventScroll: true });
        } else if (!p && state === 'paused') {
            state = 'playing';
            show(ui.pause, false);
            canvas.focus({ preventScroll: true });
        }
    }

    function gameOver() {
        state = 'over';
        overAt = performance.now();
        const p = world.player;
        const dist = Math.floor(world.dist), score = world.score();
        const district = V.DISTRICTS[world.district % V.DISTRICTS.length];
        const quips = QUIPS[p.cause] || QUIPS.wall;
        $('over-kicker').textContent = `Wrecked in ${district.name}`;
        $('over-quip').textContent = quips[(Math.random() * quips.length) | 0];
        $('over-score').textContent = fmt(score);
        $('st-dist').textContent = `${fmt(dist)} m`;
        $('st-speed').textContent = `${fmt(world.stats.maxSpeed / PX_PER_M * 3.6)} km/h`;
        $('st-orbs').textContent = fmt(world.stats.orbs);
        $('st-mult').textContent = `×${world.stats.maxMult}`;
        $('st-near').textContent = fmt(world.stats.nearMisses);
        $('st-air').textContent = `${world.stats.longestFlight.toFixed(1)} s`;

        const prev = record(mode);
        const isRecord = !prev || score > prev.score;
        if (isRecord && score > 0) {
            const entry = { dist, score };
            if (mode === 'daily') store.daily = Object.assign({ date: todayKey() }, entry);
            else store.best = entry;
            save();
            Audio.play('record');
        }
        show($('over-record'), isRecord && score > 0 && !!prev);
        const now = record(mode);
        $('over-best').textContent = now ? `${mode === 'daily' ? 'Today’s best' : 'Best'}: ${fmt(now.score)} pts · ${fmt(now.dist)} m` : '';
        show(ui.over, true);
        show(ui.hud, false);
        $('btn-retry').focus({ preventScroll: true });
    }

    function handleEvents() {
        const live = state === 'playing' || state === 'dying';
        for (const e of world.events) {
            renderer.onEvent(e, world);
            if (!live) {
                if (e.type === 'district') Audio.setDistrict(e.index);
                continue;
            }
            switch (e.type) {
                case 'grapple':
                    Audio.play('grapple');
                    if (e.mult > 1) Audio.play('chain', e.mult);
                    break;
                case 'release':
                    Audio.play('release', e.speed);
                    break;
                case 'jump':
                case 'miss':
                    Audio.play(e.type);
                    break;
                case 'orb': {
                    const now = performance.now();
                    orbStreak = now - lastOrbAt < 900 ? orbStreak + 1 : 0;
                    lastOrbAt = now;
                    Audio.play('orb', orbStreak);
                    break;
                }
                case 'ring':
                    Audio.play('ring');
                    break;
                case 'nearmiss':
                    Audio.play('nearmiss');
                    if (!renderer.reducedMotion) {
                        timeScale = 0.4;
                        slowTimer = 0.2;
                    }
                    break;
                case 'land':
                    Audio.play('land', e.v);
                    break;
                case 'crash':
                    Audio.play(e.cause === 'water' ? 'splash' : 'crash');
                    timeScale = 0.2;
                    slowTimer = 0.45;
                    state = 'dying';
                    deathTimer = 1.5;
                    hold = false;
                    break;
                case 'district':
                    Audio.setDistrict(e.index);
                    Audio.play('district');
                    showBanner(e.index);
                    break;
            }
        }
        world.events.length = 0;
    }

    function updateHud() {
        if (state !== 'playing' && state !== 'dying') return;
        const dist = Math.floor(world.dist), score = world.score(), mult = world.mult();
        if (dist !== hudCache.dist) ui.dist.textContent = fmt(hudCache.dist = dist);
        if (score !== hudCache.score) ui.score.textContent = fmt(hudCache.score = score);
        if (mult !== hudCache.mult) {
            const grew = mult > hudCache.mult && hudCache.mult > 0;
            hudCache.mult = mult;
            ui.mult.textContent = '×' + mult;
            ui.mult.classList.toggle('on', mult > 1);
            ui.mult.classList.toggle('hot', mult >= 6);
            if (grew && ui.mult.animate && !renderer.reducedMotion) {
                ui.mult.animate([{ transform: 'translateX(-50%) scale(1.45)' }, { transform: 'translateX(-50%) scale(1)' }], { duration: 220, easing: 'ease-out' });
            }
        }
    }

    // ---------- Input ----------

    const HOLD_KEYS = new Set(['Space', 'ArrowUp', 'KeyW', 'KeyZ', 'KeyX', 'KeyJ']);

    canvas.tabIndex = -1;
    canvas.addEventListener('pointerdown', e => {
        if (e.button > 0) return;
        e.preventDefault();
        if (state === 'playing') {
            hold = true;
            if (canvas.setPointerCapture) canvas.setPointerCapture(e.pointerId);
        }
    });
    const releasePointer = () => {
        hold = false;
    };
    canvas.addEventListener('pointerup', releasePointer);
    canvas.addEventListener('pointercancel', releasePointer);
    canvas.addEventListener('lostpointercapture', releasePointer);
    canvas.addEventListener('contextmenu', e => e.preventDefault());

    window.addEventListener('keydown', e => {
        const code = e.code;
        if (HOLD_KEYS.has(code) || code === 'Enter') {
            const onButton = document.activeElement && document.activeElement.tagName === 'BUTTON';
            if (state === 'playing') {
                e.preventDefault();
                if (!e.repeat && code !== 'Enter') hold = true;
                return;
            }
            if (onButton && (code === 'Space' || code === 'Enter')) return;
            if (e.repeat) return;
            if (state === 'title' && (code === 'Space' || code === 'Enter')) {
                e.preventDefault();
                startGame('endless');
            } else if (state === 'over' && performance.now() - overAt > 600) {
                e.preventDefault();
                startGame(mode);
            } else if (state === 'paused' && code === 'Space') {
                e.preventDefault();
                setPaused(false);
            }
            return;
        }
        if (e.repeat) return;
        if (code === 'KeyP' || code === 'Escape') {
            if (state === 'playing') setPaused(true);
            else if (state === 'paused') setPaused(false);
            else if (state === 'over' && code === 'Escape') toMenu();
        } else if (code === 'KeyM') {
            toggleMute();
        } else if (code === 'KeyR' && (state === 'playing' || state === 'paused' || (state === 'over' && performance.now() - overAt > 600))) {
            startGame(mode);
        }
    });
    window.addEventListener('keyup', e => {
        if (HOLD_KEYS.has(e.code)) hold = false;
    });
    window.addEventListener('blur', () => {
        hold = false;
    });
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) setPaused(true);
    });
    window.addEventListener('resize', () => renderer.resize());

    $('btn-play').addEventListener('click', () => startGame('endless'));
    $('btn-daily').addEventListener('click', () => startGame('daily'));
    $('btn-retry').addEventListener('click', () => startGame(mode));
    $('btn-menu').addEventListener('click', toMenu);
    $('btn-pause').addEventListener('click', () => setPaused(true));
    $('btn-resume').addEventListener('click', () => setPaused(false));
    $('btn-restart').addEventListener('click', () => startGame(mode));
    $('btn-quit').addEventListener('click', toMenu);
    $('btn-mute').addEventListener('click', toggleMute);
    $('btn-mute-title').addEventListener('click', toggleMute);
    for (const b of document.querySelectorAll('button')) b.addEventListener('pointerdown', e => e.stopPropagation());

    // First-run coaching: prompt the hold, then the release, until the player has the idea.
    function tutorialHint() {
        if (state !== 'playing' || store.coached) return null;
        const p = world.player;
        if (world.dist > 150) {
            store.coached = true;
            save();
            return null;
        }
        if (!p.alive) return null;
        if (!p.anchor && !hold && world.stats.grapples < 2 && world.findTarget()) return 'HOLD';
        if (p.anchor && world.stats.grapples <= 2 && p.x > p.anchor.cx + 30 && p.vy < 0) return 'LET GO!';
        return null;
    }

    // ---------- Loop ----------

    let last = performance.now();

    function frame(now) {
        const dt = Math.min(0.05, Math.max(0, (now - last) / 1000));
        last = now;
        let simDt = 0;

        if (state !== 'paused') {
            if (slowTimer > 0) slowTimer -= dt;
            else timeScale += (1 - timeScale) * Math.min(1, dt * 3);
            simDt = dt * timeScale;
            const n = Math.max(1, Math.ceil(simDt / SUBSTEP));
            const h = simDt / n;
            for (let i = 0; i < n; i++) {
                world.hold = state === 'title' ? world.botHold() : state === 'playing' && hold;
                world.step(h);
            }
            handleEvents();
        }

        renderer.update(world, state === 'paused' ? 0 : dt, simDt);
        renderer.draw(world, { showTarget: state === 'playing' || state === 'title', hint: tutorialHint() });
        updateHud();

        const sp = Math.hypot(world.player.vx, world.player.vy);
        let level = 0.25;
        if (state === 'playing') level = 0.22 + 0.78 * Math.min(1, sp / 1500);
        else if (state === 'dying' || state === 'over') level = 0.12;
        else if (state === 'paused') level = 0.05;
        Audio.update(level, state === 'playing' ? sp : 0, dt);

        if (state === 'dying') {
            deathTimer -= dt;
            if (deathTimer <= 0) gameOver();
        } else if (state === 'title' && !world.player.alive) {
            demoDeadFor += dt;
            if (demoDeadFor > 1.8) {
                world = new V.World(randomSeed());
                renderer.reset();
                demoDeadFor = 0;
            }
        }
        requestAnimationFrame(frame);
    }

    refreshTitle();
    refreshMute();
    requestAnimationFrame(frame);

    // Handy for debugging from the console.
    V.debug = { get world() { return world; }, get state() { return state; }, renderer, startGame, toMenu };
})(window.VERTIGO = window.VERTIGO || {});
