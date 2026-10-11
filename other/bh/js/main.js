// Entry point: wires simulation, renderer, audio, input and UI together and
// runs the fixed-timestep loop.

import {Game, RUN_LENGTH} from './game.js';
import {Bot} from './bot.js';
import {Renderer} from './render.js';
import {AudioEngine} from './audio.js';
import {Input} from './input.js';
import {UI} from './ui.js';
import {SHIPS} from './content.js';
import {STAGES} from './stages.js';

const STEP = 1 / 60;
const MAX_STEPS = 6;
const SETTINGS_KEY = 'neonhorde.settings.v1';
const SCORES_KEY = 'neonhorde.scores.v1';
const MAX_SCORES = 8;

const $ = id => document.getElementById(id);

function load(key, fallback) {
    try {
        const v = JSON.parse(localStorage.getItem(key));
        return v && typeof v === 'object' ? v : fallback;
    } catch {
        return fallback;
    }
}

function save(key, v) {
    try {
        localStorage.setItem(key, JSON.stringify(v));
    } catch {
        // Storage can be unavailable (private mode); the game still works.
    }
}

class App {
    constructor() {
        this.canvas = $('stage');
        const defaults = {sfx: 0.7, music: 0.45, damageNumbers: true, shake: true, lowFx: false, fps: false, muted: false};
        const saved = load(SETTINGS_KEY, {});
        this.settings = {...defaults};
        for (const k of Object.keys(defaults)) if (typeof saved[k] === typeof defaults[k]) this.settings[k] = saved[k];
        const scores = load(SCORES_KEY, {});
        this.scores = {};
        for (const id of Object.keys(STAGES)) this.scores[id] = Array.isArray(scores[id]) ? scores[id].filter(s => s && Number.isFinite(s.score)) : [];

        this.renderer = new Renderer(this.canvas);
        this.audio = new AudioEngine();
        this.input = new Input(this.canvas, $('stick'), $('stick-knob'));
        this.input.setEnabled(false);
        this.mode = 'menu';
        this.game = null;
        this.paused = false;
        this.acc = 0;
        this.lastTs = performance.now();
        this.fpsT = 0;
        this.fpsN = 0;

        this.ui = new UI(this);
        this.ui.bindChoiceButtons();
        this.bindButtons();
        this.applySettings();
        this.onResize();
        this.startAttract();
        this.ui.open('scr-title');

        addEventListener('resize', () => this.onResize());
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) this.autoPause();
        });
        addEventListener('blur', () => this.autoPause());
        const unlock = () => {
            if (this.audio.init()) {
                this.audio.resume();
                if (!this.audio.music) this.audio.startMusic(this.mode === 'run' && this.game ? this.game.stage.music : STAGES.grid.music);
                this.audio.intensity = this.mode === 'run' ? 0.15 : 0.1;
                this.applySettings();
            }
        };
        addEventListener('pointerdown', unlock);
        addEventListener('keydown', unlock);
        addEventListener('gamepadconnected', unlock);

        requestAnimationFrame(ts => this.loop(ts));
    }

    bindButtons() {
        $('btn-ship-back').addEventListener('click', () => this.ui.close('scr-ship'));
        $('btn-stage-back').addEventListener('click', () => this.ui.close('scr-stage'));
        $('btn-resume').addEventListener('click', () => this.togglePause());
        $('btn-pause-settings').addEventListener('click', () => this.ui.open('scr-settings'));
        $('btn-quit').addEventListener('click', () => this.ui.open('scr-confirm', '#btn-confirm-no'));
        $('btn-confirm-no').addEventListener('click', () => this.ui.close('scr-confirm'));
        $('btn-confirm-yes').addEventListener('click', () => this.quitToMenu());
        $('btn-retry').addEventListener('click', () => {
            const g = this.game;
            this.ui.closeAll();
            this.startRun(g.ship.id, g.stage.id, g.overclock);
        });
        $('btn-newrun').addEventListener('click', () => {
            this.quitToMenu();
            this.ui.openShips();
        });
        $('btn-menu').addEventListener('click', () => this.quitToMenu());
        $('btn-mute').addEventListener('click', () => this.toggleMute());
    }

    applySettings() {
        const s = this.settings;
        this.renderer.settings = {damageNumbers: s.damageNumbers, shake: s.shake, particles: s.lowFx ? 0.35 : 1};
        this.audio.vol = {sfx: s.sfx, music: s.music};
        this.audio.muted = s.muted;
        this.audio.applyVolumes();
        $('fps').classList.toggle('hidden', !s.fps);
        $('btn-mute').classList.toggle('muted', s.muted);
        $('btn-mute').setAttribute('aria-pressed', String(s.muted));
        save(SETTINGS_KEY, s);
    }

    toggleMute() {
        this.settings.muted = !this.settings.muted;
        this.applySettings();
    }

    onResize() {
        const view = this.renderer.resize();
        if (this.game) this.game.view = view;
        if (this.attract) this.attract.view = view;
        this.view = view;
    }

    startAttract() {
        const ships = Object.keys(SHIPS), stages = Object.keys(STAGES);
        const seed = Math.floor(Math.random() * 1e9);
        this.attract = new Game({stage: stages[seed % stages.length], ship: ships[seed % ships.length], seed, startRelic: false});
        this.attract.view = this.view || this.attract.view;
        this.bot = new Bot(this.attract);
        this.renderer.particles.length = 0;
    }

    startRun(ship, stage, overclock) {
        this.mode = 'run';
        this.game = new Game({stage, ship, overclock});
        this.game.view = this.view;
        this.paused = false;
        this.acc = 0;
        this.overT = 0;
        this.resultsShown = false;
        this.lastMinute = false;
        this.ui.purgerShown = false;
        this.ui.choiceRef = null;
        this.renderer.particles.length = 0;
        this.renderer.nums.length = 0;
        this.ui.showHud(true);
        this.input.setEnabled(true);
        this.audio.init();
        this.audio.resume();
        this.audio.boss = false;
        this.audio.intensity = 0.15;
        this.audio.startMusic(STAGES[stage].music);
        this.audio.setPaused(false);
        this.canvas.focus?.();
    }

    quitToMenu() {
        this.mode = 'menu';
        this.input.setEnabled(false);
        this.game = null;
        this.paused = false;
        this.ui.closeAll();
        this.ui.showHud(false);
        this.audio.setPaused(false);
        this.audio.boss = false;
        this.audio.intensity = 0.1;
        this.audio.startMusic(STAGES.grid.music);
        this.startAttract();
        this.ui.refreshStages();
        this.ui.open('scr-title');
    }

    togglePause() {
        const g = this.game;
        if (this.mode !== 'run' || !g || g.over) return;
        if (this.paused) {
            // Close settings/confirm stacked over the pause screen too.
            for (const id of ['scr-confirm', 'scr-settings', 'scr-pause']) if (this.ui.stack.includes($(id))) this.ui.close(id);
            this.paused = false;
            this.audio.setPaused(!!g.choice);
        } else {
            if (this.ui.top()) return; // a choice is open; it already pauses the game
            this.paused = true;
            this.input.endStick();
            this.ui.showPause(g);
            this.audio.setPaused(true);
        }
    }

    autoPause() {
        if (this.mode === 'run' && this.game && !this.game.over && !this.paused && !this.ui.top()) this.togglePause();
    }

    record(g) {
        const list = this.scores[g.stage.id] || (this.scores[g.stage.id] = []);
        const entry = {
            score: g.score(), ship: g.ship.id, time: Math.round(g.time), level: g.player.level, kills: g.kills,
            cleared: g.cleared, overclock: g.overclock, date: Date.now(),
        };
        list.push(entry);
        list.sort((a, b) => b.score - a.score);
        const rank = list.indexOf(entry);
        this.scores[g.stage.id] = list.slice(0, MAX_SCORES);
        save(SCORES_KEY, this.scores);
        return rank < MAX_SCORES ? rank : -1;
    }

    loop(ts) {
        requestAnimationFrame(t => this.loop(t));
        const dt = Math.min(0.1, Math.max(0, (ts - this.lastTs) / 1000));
        this.lastTs = ts;

        for (const a of this.input.padActions()) this.ui.padAction(a);

        try {
            if (this.mode === 'run' && this.game) this.frameRun(dt);
            else this.frameMenu(dt);
        } catch (err) {
            // Never leave a frozen canvas behind without a trace.
            console.error(err);
            throw err;
        }

        if (this.settings.fps) {
            this.fpsT += dt;
            this.fpsN++;
            if (this.fpsT >= 0.5) {
                const g = this.game || this.attract;
                $('fps').textContent = `${Math.round(this.fpsN / this.fpsT)} fps · ${g.enemies.length} enemies · ${g.projectiles.length} proj`;
                this.fpsT = 0;
                this.fpsN = 0;
            }
        }
    }

    frameRun(dt) {
        const g = this.game;
        const blocked = this.paused || !!g.choice || g.over;
        if (!blocked) {
            this.acc += dt;
            let n = 0;
            while (this.acc >= STEP && n < MAX_STEPS) {
                g.input = this.input.move();
                g.step(STEP);
                this.acc -= STEP;
                n++;
                if (g.choice || g.over) {
                    this.acc = 0;
                    break;
                }
            }
            if (n >= MAX_STEPS) this.acc = 0;
        } else {
            this.acc = 0;
        }

        const events = g.events;
        this.renderer.consume(g, events);
        this.audio.consume(events);
        this.ui.consume(g, events);
        events.length = 0;

        if (g.choice && g.choice !== this.ui.choiceRef && !this.paused) {
            this.input.endStick();
            this.ui.showChoice(g);
        }

        this.audio.intensity = Math.min(1, 0.15 + g.time / 700);
        this.audio.boss = g.bosses.some(b => b.alive && !b.def.purger);
        this.audio.setPaused(this.paused || !!g.choice);

        if (!g.cleared && !this.lastMinute && g.time >= RUN_LENGTH - 60) {
            this.lastMinute = true;
            this.ui.banner('ONE MINUTE REMAINING', 'warn');
        }

        if (g.over) {
            this.overT += dt;
            if (this.overT > 1.8 && !this.resultsShown) {
                this.resultsShown = true;
                this.input.setEnabled(false);
                const rank = this.record(g);
                this.ui.showResults(g, rank);
            }
        }

        this.renderer.draw(g, blocked && !g.over ? 0 : dt, dt);
        this.ui.updateHud(g, dt);
    }

    frameMenu(dt) {
        const g = this.attract;
        this.acc += dt;
        let n = 0;
        while (this.acc >= STEP && n < MAX_STEPS) {
            this.bot.act();
            g.step(STEP);
            this.acc -= STEP;
            n++;
        }
        if (n >= MAX_STEPS) this.acc = 0;
        if (g.choice) this.bot.act();
        this.renderer.consume(g, g.events);
        g.events.length = 0;
        this.renderer.draw(g, dt);
        if (g.over || g.time > 300) this.startAttract();
    }
}

// Expose for debugging and the browser test.
window.NEON_HORDE = new App();
