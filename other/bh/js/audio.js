// WebAudio synth: sound effects and a procedural synthwave soundtrack whose
// layers follow the run's intensity. No audio files.

const PROGRESSION = [0, 8, 3, 10]; // i - VI - III - VII (semitones over the root)

function mtof(m) {
    return 440 * Math.pow(2, (m - 69) / 12);
}

export class AudioEngine {
    constructor() {
        this.ctx = null;
        this.vol = {sfx: 0.7, music: 0.45};
        this.muted = false;
        this.last = Object.create(null);
        this.gemChain = 0;
        this.gemT = 0;
        this.music = null;
        this.intensity = 0;
        this.boss = false;
        this.paused = false;
    }

    init() {
        if (this.ctx) return true;
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return false;
        try {
            this.ctx = new AC();
        } catch {
            return false;
        }
        const c = this.ctx;
        this.master = c.createGain();
        const comp = c.createDynamicsCompressor();
        comp.threshold.value = -14;
        comp.knee.value = 12;
        comp.ratio.value = 6;
        comp.attack.value = 0.003;
        comp.release.value = 0.2;
        this.master.connect(comp);
        comp.connect(c.destination);
        this.sfx = c.createGain();
        this.sfx.connect(this.master);
        this.mus = c.createGain();
        this.musFilter = c.createBiquadFilter();
        this.musFilter.type = 'lowpass';
        this.musFilter.frequency.value = 18000;
        this.mus.connect(this.musFilter);
        this.musFilter.connect(this.master);
        // Echo for the arpeggio
        this.delay = c.createDelay(1);
        this.delay.delayTime.value = 0.28;
        const fb = c.createGain();
        fb.gain.value = 0.32;
        const dlp = c.createBiquadFilter();
        dlp.type = 'lowpass';
        dlp.frequency.value = 2400;
        this.delay.connect(dlp);
        dlp.connect(fb);
        fb.connect(this.delay);
        dlp.connect(this.mus);
        const len = c.sampleRate;
        this.noiseBuf = c.createBuffer(1, len, c.sampleRate);
        const data = this.noiseBuf.getChannelData(0);
        for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
        this.applyVolumes();
        return true;
    }

    resume() {
        if (this.ctx && this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    }

    applyVolumes() {
        if (!this.ctx) return;
        const t = this.ctx.currentTime;
        this.master.gain.setTargetAtTime(this.muted ? 0 : 1, t, 0.02);
        this.sfx.gain.setTargetAtTime(this.vol.sfx * 0.9, t, 0.02);
        this.mus.gain.setTargetAtTime(this.vol.music * 0.55, t, 0.05);
    }

    setPaused(p) {
        this.paused = p;
        if (!this.ctx) return;
        this.musFilter.frequency.setTargetAtTime(p ? 700 : 18000, this.ctx.currentTime, 0.15);
    }

    ok(name, ms) {
        if (!this.ctx || this.muted) return false;
        const now = performance.now();
        if (now - (this.last[name] || 0) < ms) return false;
        this.last[name] = now;
        return true;
    }

    // ---------------------------------------------------------------- voices

    tone(type, f0, f1, dur, vol, {attack = 0.005, dest = this.sfx, at = 0, q = 0, filter = 0} = {}) {
        const c = this.ctx;
        const t = c.currentTime + at;
        const o = c.createOscillator();
        o.type = type;
        o.frequency.setValueAtTime(f0, t);
        if (f1 && f1 !== f0) o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
        const gn = c.createGain();
        gn.gain.setValueAtTime(0.0001, t);
        gn.gain.exponentialRampToValueAtTime(vol, t + attack);
        gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        let node = o;
        if (filter) {
            const f = c.createBiquadFilter();
            f.type = 'lowpass';
            f.frequency.value = filter;
            f.Q.value = q;
            o.connect(f);
            node = f;
        }
        node.connect(gn);
        gn.connect(dest);
        o.start(t);
        o.stop(t + dur + 0.02);
    }

    noise(dur, vol, freq, {type = 'bandpass', q = 1, f1 = 0, at = 0, dest = this.sfx, attack = 0.003} = {}) {
        const c = this.ctx;
        const t = c.currentTime + at;
        const src = c.createBufferSource();
        src.buffer = this.noiseBuf;
        src.loop = true;
        const f = c.createBiquadFilter();
        f.type = type;
        f.frequency.setValueAtTime(freq, t);
        if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + dur);
        f.Q.value = q;
        const gn = c.createGain();
        gn.gain.setValueAtTime(0.0001, t);
        gn.gain.exponentialRampToValueAtTime(vol, t + attack);
        gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
        src.connect(f);
        f.connect(gn);
        gn.connect(dest);
        src.start(t, Math.random() * 0.5);
        src.stop(t + dur + 0.02);
    }

    // ---------------------------------------------------------------- sfx

    play(name, opt = {}) {
        if (!this.ctx || this.muted) return;
        const r = (a, b) => a + Math.random() * (b - a);
        switch (name) {
            case 'ui':
                if (this.ok('ui', 30)) this.tone('square', 1200, 900, 0.05, 0.05, {filter: 3000});
                break;
            case 'hover':
                if (this.ok('hover', 40)) this.tone('sine', 1800, 1800, 0.03, 0.025);
                break;
            case 'pulse':
                if (this.ok('pulse', 70)) this.tone('square', r(820, 900), 300, 0.07, 0.035, {filter: 4000});
                break;
            case 'lash':
                if (this.ok('lash', 80)) this.noise(0.16, 0.12, 900, {f1: 4000, q: 2});
                break;
            case 'missile':
                if (this.ok('missile', 90)) this.noise(0.25, 0.06, 500, {f1: 1600, q: 1.5});
                break;
            case 'orbit':
                if (this.ok('orbit', 200)) this.tone('sine', 1320, 1760, 0.3, 0.05);
                break;
            case 'arc':
                if (this.ok('arc', 90)) {
                    this.noise(0.18, 0.12, 3200, {q: 0.8});
                    this.tone('sawtooth', 120, 60, 0.15, 0.04, {filter: 1200});
                }
                break;
            case 'blade':
                if (this.ok('blade', 90)) this.noise(0.2, 0.06, 2000, {f1: 600, q: 3});
                break;
            case 'mine':
                if (this.ok('mine', 120)) this.tone('sine', 160, 70, 0.2, 0.12);
                break;
            case 'laser':
                if (this.ok('laser', 100)) this.tone('sawtooth', 1600, 220, 0.3, 0.05, {filter: 3500});
                break;
            case 'drone':
                if (this.ok('drone', 90)) this.tone('triangle', r(1500, 1700), 1100, 0.04, 0.025);
                break;
            case 'shard':
                if (this.ok('shard', 90)) this.tone('triangle', 520, 180, 0.14, 0.06);
                break;
            case 'cryo':
                if (this.ok('cryo', 150)) {
                    this.tone('sine', 2200, 3300, 0.35, 0.04);
                    this.noise(0.3, 0.04, 6000, {type: 'highpass'});
                }
                break;
            case 'hit':
                if (this.ok('hit', 45)) this.tone('square', r(180, 240), 90, 0.04, 0.025, {filter: 1500});
                break;
            case 'kill':
                if (this.ok('kill', 35)) this.tone('triangle', r(320, 420), 70, 0.09, 0.06);
                break;
            case 'gem': {
                if (!this.ok('gem', 28)) break;
                const now = performance.now();
                this.gemChain = now - this.gemT < 450 ? Math.min(this.gemChain + 1, 24) : 0;
                this.gemT = now;
                const f = mtof(76 + [0, 2, 4, 7, 9][this.gemChain % 5] + 12 * Math.floor(this.gemChain / 5) * 0.5);
                this.tone('sine', f, f * 1.01, 0.09, 0.05);
                break;
            }
            case 'levelup':
                [0, 4, 7, 12, 16].forEach((n, i) => this.tone('square', mtof(72 + n), 0, 0.16, 0.06, {at: i * 0.06, filter: 3500}));
                break;
            case 'chest':
                [0, 7, 12, 16, 19, 24].forEach((n, i) => this.tone('triangle', mtof(67 + n), 0, 0.3, 0.08, {at: i * 0.08}));
                this.noise(1.0, 0.04, 7000, {type: 'highpass', at: 0.2});
                break;
            case 'evolve':
                [0, 4, 7, 11, 14].forEach(n => this.tone('sawtooth', mtof(60 + n), 0, 1.4, 0.04, {filter: 2400, attack: 0.05}));
                [12, 19, 24].forEach((n, i) => this.tone('sine', mtof(72 + n), 0, 0.8, 0.06, {at: 0.1 + i * 0.1}));
                break;
            case 'relic':
                [0, 3, 7, 10, 14].forEach((n, i) => this.tone('sine', mtof(64 + n), 0, 1.2, 0.05, {at: i * 0.07, attack: 0.04}));
                break;
            case 'hurt':
                if (this.ok('hurt', 120)) {
                    this.tone('sawtooth', 160, 50, 0.22, 0.12, {filter: 900});
                    this.noise(0.12, 0.08, 400, {q: 1});
                }
                break;
            case 'explode':
                if (this.ok('explode', 70)) {
                    this.noise(0.4, 0.16, 900, {type: 'lowpass', f1: 120});
                    this.tone('sine', 110, 40, 0.3, 0.12);
                }
                break;
            case 'enemyShot':
                if (this.ok('eshot', opt.big ? 120 : 160)) this.tone('square', opt.big ? 420 : 640, opt.big ? 200 : 320, 0.08, opt.big ? 0.04 : 0.02, {filter: 2000});
                break;
            case 'warning':
                if (this.ok('warning', 500)) {
                    this.tone('square', 880, 880, 0.12, 0.05, {filter: 2500});
                    this.tone('square', 660, 660, 0.12, 0.05, {at: 0.16, filter: 2500});
                }
                break;
            case 'boss':
                for (let i = 0; i < 3; i++) {
                    this.tone('sawtooth', 220, 440, 0.35, 0.07, {at: i * 0.42, filter: 1800});
                    this.tone('sawtooth', 440, 220, 0.35, 0.05, {at: i * 0.42 + 0.2, filter: 1800});
                }
                break;
            case 'bossKill':
                this.noise(1.6, 0.22, 1400, {type: 'lowpass', f1: 60});
                this.tone('sine', 90, 30, 1.0, 0.2);
                [0, 7, 12, 16].forEach((n, i) => this.tone('triangle', mtof(64 + n), 0, 0.6, 0.07, {at: 0.3 + i * 0.1}));
                break;
            case 'heal':
                this.tone('sine', 520, 1040, 0.3, 0.08);
                break;
            case 'credit':
                if (this.ok('credit', 40)) {
                    this.tone('square', 1500, 1500, 0.05, 0.03, {filter: 5000});
                    this.tone('square', 2000, 2000, 0.08, 0.03, {at: 0.05, filter: 5000});
                }
                break;
            case 'magnet':
                this.tone('sine', 300, 1800, 0.6, 0.07);
                break;
            case 'emp':
                this.noise(1.2, 0.25, 3000, {type: 'lowpass', f1: 80});
                this.tone('sawtooth', 1200, 40, 0.8, 0.08, {filter: 2500});
                break;
            case 'freeze':
                this.noise(0.8, 0.08, 8000, {type: 'highpass'});
                [0, 5, 12].forEach((n, i) => this.tone('sine', mtof(88 + n), 0, 0.6, 0.04, {at: i * 0.05}));
                break;
            case 'revive':
                [0, 4, 7, 12].forEach((n, i) => this.tone('sawtooth', mtof(55 + n), 0, 1.0, 0.06, {at: i * 0.05, filter: 2000}));
                this.noise(0.8, 0.15, 400, {type: 'lowpass', f1: 3000});
                break;
            case 'death':
                this.tone('sawtooth', 400, 30, 1.6, 0.15, {filter: 1500});
                this.noise(1.4, 0.2, 800, {type: 'lowpass', f1: 50});
                break;
            case 'clear':
                [0, 4, 7, 12, 16, 19, 24].forEach((n, i) => this.tone('square', mtof(60 + n), 0, 0.5, 0.05, {at: i * 0.09, filter: 3000}));
                break;
            case 'purger':
                this.tone('sawtooth', 55, 50, 2.0, 0.15, {filter: 600, attack: 0.3});
                this.tone('sawtooth', 58, 52, 2.0, 0.12, {filter: 600, attack: 0.3});
                break;
        }
    }

    consume(events) {
        if (!this.ctx || this.muted) return;
        for (const ev of events) {
            switch (ev.type) {
                case 'shoot':
                    this.play(ev.id);
                    break;
                case 'dmg':
                    this.play('hit');
                    break;
                case 'kill':
                    if (ev.boss) this.play('bossKill');
                    else if (!ev.silent) this.play('kill');
                    break;
                case 'gem':
                    this.play('gem');
                    break;
                case 'levelup':
                    this.play('levelup');
                    break;
                case 'chest':
                    this.play('chest');
                    break;
                case 'evolve':
                    this.play('evolve');
                    break;
                case 'relic':
                    this.play('relic');
                    break;
                case 'hurt':
                    this.play('hurt');
                    break;
                case 'explode':
                    this.play('explode');
                    break;
                case 'enemyShot':
                    this.play('enemyShot', ev);
                    break;
                case 'warning':
                    this.play('warning');
                    break;
                case 'bossSpawn':
                    this.play(ev.purger ? 'purger' : 'boss');
                    break;
                case 'pickup':
                    if (ev.kind === 'heal') this.play('heal');
                    else if (ev.kind === 'credit') this.play('credit');
                    else if (ev.kind === 'magnet') this.play('magnet');
                    else if (ev.kind === 'bomb') this.play('emp');
                    else if (ev.kind === 'freeze') this.play('freeze');
                    break;
                case 'revive':
                    this.play('revive');
                    break;
                case 'death':
                    this.play('death');
                    break;
                case 'clear':
                    this.play('clear');
                    break;
                case 'mine':
                    this.play('mine');
                    break;
            }
        }
    }

    // ---------------------------------------------------------------- music

    startMusic(cfg) {
        if (!this.ctx) return;
        this.stopMusic();
        this.music = {cfg, step: 0, next: this.ctx.currentTime + 0.1};
        this.timer = setInterval(() => this.schedule(), 25);
    }

    stopMusic() {
        if (this.timer) clearInterval(this.timer);
        this.timer = null;
        this.music = null;
    }

    schedule() {
        const m = this.music;
        if (!m || !this.ctx) return;
        const c = this.ctx;
        if (m.next < c.currentTime - 0.5) m.next = c.currentTime + 0.05; // tab was asleep
        const stepDur = 60 / m.cfg.tempo / 4;
        while (m.next < c.currentTime + 0.12) {
            this.playStep(m, m.step, m.next, stepDur);
            m.step++;
            m.next += stepDur;
        }
    }

    playStep(m, step, t, sd) {
        const c = this.ctx;
        const cfg = m.cfg;
        const I = this.paused ? 0 : this.intensity;
        const s16 = step % 16;
        const bar = Math.floor(step / 16);
        const chord = PROGRESSION[bar % 4] + (this.boss && bar % 8 >= 4 ? 1 : 0);
        const root = cfg.root + chord;
        const dest = this.mus;

        const env = (node, vol, dur, attack = 0.005) => {
            const gn = c.createGain();
            gn.gain.setValueAtTime(0.0001, t);
            gn.gain.exponentialRampToValueAtTime(vol, t + attack);
            gn.gain.exponentialRampToValueAtTime(0.0001, t + dur);
            node.connect(gn);
            return gn;
        };
        const osc = (type, f, dur, vol, out = dest, filter = 0, attack = 0.005) => {
            const o = c.createOscillator();
            o.type = type;
            o.frequency.setValueAtTime(f, t);
            let n = o;
            if (filter) {
                const fl = c.createBiquadFilter();
                fl.type = 'lowpass';
                fl.frequency.setValueAtTime(filter, t);
                fl.frequency.exponentialRampToValueAtTime(Math.max(100, filter * 0.3), t + dur);
                o.connect(fl);
                n = fl;
            }
            env(n, vol, dur, attack).connect(out);
            o.start(t);
            o.stop(t + dur + 0.05);
        };
        const noise = (dur, vol, freq, type) => {
            const src = c.createBufferSource();
            src.buffer = this.noiseBuf;
            const f = c.createBiquadFilter();
            f.type = type;
            f.frequency.value = freq;
            src.connect(f);
            env(f, vol, dur, 0.002).connect(dest);
            src.start(t, Math.random() * 0.5);
            src.stop(t + dur + 0.02);
        };

        // Pad: sustained chord at the bar start
        if (s16 === 0) {
            for (const n of [0, 3, 7]) {
                for (const det of [-6, 6]) {
                    const o = c.createOscillator();
                    o.type = 'sawtooth';
                    o.frequency.setValueAtTime(mtof(root + 12 + n), t);
                    o.detune.value = det;
                    const fl = c.createBiquadFilter();
                    fl.type = 'lowpass';
                    fl.frequency.value = 700 + I * 900;
                    o.connect(fl);
                    env(fl, 0.018, sd * 16, 0.3).connect(dest);
                    o.start(t);
                    o.stop(t + sd * 16 + 0.1);
                }
            }
        }
        // Bass: driving eighths
        if (s16 % 2 === 0) {
            const oct = s16 % 8 === 6 ? 12 : 0;
            osc('sawtooth', mtof(root - 12 + oct), sd * 1.8, 0.11, dest, 900 + I * 700);
        }
        // Drums
        if (I > 0.05 && s16 % 4 === 0) {
            const o = c.createOscillator();
            o.type = 'sine';
            o.frequency.setValueAtTime(150, t);
            o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
            env(o, 0.5, 0.2).connect(dest);
            o.start(t);
            o.stop(t + 0.25);
        }
        if (I > 0.15 && s16 % 4 === 2) noise(0.04, 0.05, 8000, 'highpass');
        if (I > 0.35 && (s16 === 4 || s16 === 12)) {
            noise(0.16, 0.12, 1800, 'bandpass');
            osc('triangle', 190, 0.1, 0.06);
        }
        if (I > 0.55 && s16 % 2 === 1) noise(0.02, 0.025, 10000, 'highpass');
        // Arpeggio
        if (I > 0.25) {
            const scale = cfg.scale;
            const pattern = [0, 2, 4, 2, 1, 3, 5, 3];
            const deg = scale[pattern[step % 8] % scale.length];
            const up = I > 0.7 && bar % 2 === 1 ? 12 : 0;
            const f = mtof(root + 24 + deg + up);
            const o = c.createOscillator();
            o.type = 'square';
            o.frequency.setValueAtTime(f, t);
            const fl = c.createBiquadFilter();
            fl.type = 'lowpass';
            fl.frequency.value = 1800 + I * 1500;
            o.connect(fl);
            const g = env(fl, 0.03, sd * 0.9);
            g.connect(dest);
            g.connect(this.delay);
            o.start(t);
            o.stop(t + sd + 0.05);
        }
        // Boss lead
        if (this.boss && I > 0.2 && s16 % 8 === 0) {
            osc('sawtooth', mtof(root + 12 + (s16 === 8 ? 7 : 0)), sd * 7, 0.025, dest, 2500, 0.05);
        }
    }
}
