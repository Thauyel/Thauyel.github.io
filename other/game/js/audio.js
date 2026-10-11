// VERTIGO — procedural WebAudio: a district-aware synth score that intensifies with speed, plus SFX.
(function (V) {
    'use strict';

    const mtof = m => 440 * Math.pow(2, (m - 69) / 12);
    const BPM = 104;
    const STEP = 60 / BPM / 4;
    const BASS = [1, 0, 0, 1, 0, 0, 1, 0, 1, 0, 0, 0, 0, 0, 1, 0];
    const ARP = [0, 1, 2, 3, 2, 1, 2, 3, 0, 2, 1, 3, 2, 3, 1, 2];
    const PENTA = [0, 3, 5, 7, 10, 12, 15, 17, 19, 22, 24, 27, 29];

    const Audio = {
        ctx: null,
        muted: false,
        intensity: 0,
        target: 0,
        district: 0,
        step: 0,
        nextTime: 0,
        timer: null,

        init() {
            if (this.ctx) {
                if (this.ctx.state === 'suspended') this.ctx.resume();
                return;
            }
            const AC = window.AudioContext || window.webkitAudioContext;
            if (!AC) return;
            const ctx = new AC();
            this.ctx = ctx;
            this.master = ctx.createGain();
            this.master.gain.value = this.muted ? 0 : 0.9;
            const comp = ctx.createDynamicsCompressor();
            comp.threshold.value = -14;
            comp.ratio.value = 4;
            this.master.connect(comp).connect(ctx.destination);

            this.musicFilter = ctx.createBiquadFilter();
            this.musicFilter.type = 'lowpass';
            this.musicFilter.frequency.value = 1200;
            this.musicFilter.Q.value = 0.7;
            this.music = ctx.createGain();
            this.music.gain.value = 0.42;
            this.music.connect(this.musicFilter).connect(this.master);

            this.delay = ctx.createDelay(1);
            this.delay.delayTime.value = STEP * 3;
            const fb = ctx.createGain();
            fb.gain.value = 0.38;
            const dl = ctx.createBiquadFilter();
            dl.type = 'lowpass';
            dl.frequency.value = 2400;
            this.delay.connect(dl).connect(fb).connect(this.delay);
            this.delaySend = ctx.createGain();
            this.delaySend.gain.value = 0.35;
            this.delaySend.connect(this.delay);
            dl.connect(this.master);

            this.sfx = ctx.createGain();
            this.sfx.gain.value = 0.75;
            this.sfx.connect(this.master);

            const len = ctx.sampleRate * 2;
            this.noise = ctx.createBuffer(1, len, ctx.sampleRate);
            const d = this.noise.getChannelData(0);
            for (let i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;

            const wind = ctx.createBufferSource();
            wind.buffer = this.noise;
            wind.loop = true;
            this.windFilter = ctx.createBiquadFilter();
            this.windFilter.type = 'bandpass';
            this.windFilter.frequency.value = 500;
            this.windFilter.Q.value = 0.8;
            this.windGain = ctx.createGain();
            this.windGain.gain.value = 0;
            wind.connect(this.windFilter).connect(this.windGain).connect(this.master);
            wind.start();

            this.nextTime = ctx.currentTime + 0.1;
            this.timer = setInterval(() => this.tick(), 25);
        },

        setMuted(m) {
            this.muted = m;
            if (this.ctx) this.master.gain.setTargetAtTime(m ? 0 : 0.9, this.ctx.currentTime, 0.05);
        },

        setDistrict(i) {
            this.district = i % V.DISTRICTS.length;
        },

        // level: 0..1 music intensity; speed: px/s for wind.
        update(level, speed, dt) {
            if (!this.ctx) return;
            this.target = level;
            this.intensity += (this.target - this.intensity) * Math.min(1, dt * 1.5);
            const t = this.ctx.currentTime;
            this.musicFilter.frequency.setTargetAtTime(500 + 5200 * this.intensity * this.intensity, t, 0.1);
            const w = Math.max(0, Math.min(1, (speed - 300) / 1800));
            this.windGain.gain.setTargetAtTime(w * 0.14, t, 0.1);
            this.windFilter.frequency.setTargetAtTime(350 + speed * 0.7, t, 0.1);
        },

        duck(amount, time) {
            if (!this.ctx) return;
            const g = this.music.gain, t = this.ctx.currentTime;
            g.cancelScheduledValues(t);
            g.setValueAtTime(g.value, t);
            g.linearRampToValueAtTime(0.42 * amount, t + 0.05);
            g.linearRampToValueAtTime(0.42, t + time);
        },

        tick() {
            const ctx = this.ctx;
            if (!ctx || ctx.state !== 'running') return;
            if (this.nextTime < ctx.currentTime - 0.2) this.nextTime = ctx.currentTime + 0.05;
            while (this.nextTime < ctx.currentTime + 0.12) {
                this.playStep(this.step, this.nextTime);
                this.nextTime += STEP;
                this.step++;
            }
        },

        playStep(s, t) {
            const prog = V.DISTRICTS[this.district].chords;
            const chord = prog[Math.floor(s / 16) % prog.length];
            const k = s % 16, I = this.intensity;
            if (k === 0) this.pad(chord.slice(1), t, STEP * 16);
            if (BASS[k] && I > 0.08) this.bass(mtof(chord[0] + (k === 14 ? 7 : 0)), t, 0.16 + 0.1 * I);
            if (I > 0.15) {
                const tones = chord.slice(1);
                const n = tones[ARP[k] % tones.length] + 12 + (k >= 8 && I > 0.6 ? 12 : 0);
                this.pluck(mtof(n), t, 0.03 + 0.08 * I);
            }
            if (I > 0.32 && k % 4 === 0) this.kick(t, 0.5 * Math.min(1, (I - 0.3) * 3));
            if (I > 0.55 && (k % 2 === 1 || I > 0.85)) this.hat(t, k % 4 === 2 ? 0.05 : 0.03);
            if (I > 0.7 && k % 8 === 4) this.clap(t);
        },

        env(g, t, a, peak, dec) {
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(peak, t + a);
            g.gain.exponentialRampToValueAtTime(0.0001, t + a + dec);
        },

        pad(notes, t, dur) {
            const ctx = this.ctx;
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass';
            f.frequency.value = 900;
            const g = ctx.createGain();
            g.gain.setValueAtTime(0.0001, t);
            g.gain.linearRampToValueAtTime(0.05, t + 0.9);
            g.gain.setValueAtTime(0.05, t + dur - 0.3);
            g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.8);
            f.connect(g).connect(this.music);
            for (const n of notes) {
                for (const det of [-7, 7]) {
                    const o = ctx.createOscillator();
                    o.type = 'sawtooth';
                    o.frequency.value = mtof(n);
                    o.detune.value = det;
                    o.connect(f);
                    o.start(t);
                    o.stop(t + dur + 0.9);
                }
            }
        },

        pluck(freq, t, vol) {
            const ctx = this.ctx;
            const o = ctx.createOscillator();
            o.type = 'triangle';
            o.frequency.value = freq;
            const o2 = ctx.createOscillator();
            o2.type = 'square';
            o2.frequency.value = freq * 1.002;
            const f = ctx.createBiquadFilter();
            f.type = 'lowpass';
            f.frequency.setValueAtTime(3200, t);
            f.frequency.exponentialRampToValueAtTime(300, t + 0.25);
            const g = ctx.createGain();
            const g2 = ctx.createGain();
            g2.gain.value = 0.25;
            this.env(g, t, 0.005, vol, 0.3);
            o.connect(f);
            o2.connect(g2).connect(f);
            f.connect(g);
            g.connect(this.music);
            g.connect(this.delaySend);
            o.start(t);
            o2.start(t);
            o.stop(t + 0.4);
            o2.stop(t + 0.4);
        },

        bass(freq, t, vol) {
            const ctx = this.ctx;
            const o = ctx.createOscillator();
            o.type = 'sine';
            o.frequency.value = freq;
            const o2 = ctx.createOscillator();
            o2.type = 'triangle';
            o2.frequency.value = freq * 2;
            const g = ctx.createGain();
            const g2 = ctx.createGain();
            g2.gain.value = 0.18;
            this.env(g, t, 0.01, vol, 0.32);
            o.connect(g);
            o2.connect(g2).connect(g);
            g.connect(this.music);
            o.start(t);
            o2.start(t);
            o.stop(t + 0.4);
            o2.stop(t + 0.4);
        },

        kick(t, vol) {
            const ctx = this.ctx;
            const o = ctx.createOscillator();
            o.frequency.setValueAtTime(150, t);
            o.frequency.exponentialRampToValueAtTime(42, t + 0.14);
            const g = ctx.createGain();
            this.env(g, t, 0.003, vol, 0.22);
            o.connect(g).connect(this.music);
            o.start(t);
            o.stop(t + 0.3);
        },

        noiseHit(t, type, freq, q, vol, dec, dest) {
            const ctx = this.ctx;
            const n = ctx.createBufferSource();
            n.buffer = this.noise;
            const f = ctx.createBiquadFilter();
            f.type = type;
            f.frequency.value = freq;
            f.Q.value = q;
            const g = ctx.createGain();
            this.env(g, t, 0.002, vol, dec);
            n.connect(f).connect(g).connect(dest || this.music);
            n.start(t, Math.random() * 1.5);
            n.stop(t + dec + 0.05);
            return f;
        },

        hat(t, vol) {
            this.noiseHit(t, 'highpass', 7500, 0.7, vol, 0.045);
        },

        clap(t) {
            this.noiseHit(t, 'bandpass', 1600, 1.2, 0.09, 0.14);
        },

        // ---------- SFX ----------

        now() {
            return this.ctx ? this.ctx.currentTime : 0;
        },

        tone(type, f0, f1, t, dur, vol, dest) {
            const ctx = this.ctx;
            const o = ctx.createOscillator();
            o.type = type;
            o.frequency.setValueAtTime(f0, t);
            if (f1 !== f0) o.frequency.exponentialRampToValueAtTime(f1, t + dur);
            const g = ctx.createGain();
            this.env(g, t, 0.004, vol, dur);
            o.connect(g).connect(dest || this.sfx);
            o.start(t);
            o.stop(t + dur + 0.05);
            return g;
        },

        play(name, arg) {
            if (!this.ctx || this.ctx.state !== 'running') return;
            const t = this.now();
            switch (name) {
                case 'grapple': {
                    const f = this.noiseHit(t, 'bandpass', 3000, 2, 0.25, 0.09, this.sfx);
                    f.frequency.exponentialRampToValueAtTime(700, t + 0.09);
                    this.tone('sine', 1300, 380, t, 0.08, 0.12);
                    break;
                }
                case 'release': {
                    const f = this.noiseHit(t, 'bandpass', 400, 1.5, 0.1 + Math.min(0.15, arg / 10000), 0.25, this.sfx);
                    f.frequency.exponentialRampToValueAtTime(1800, t + 0.25);
                    break;
                }
                case 'jump':
                    this.tone('square', 220, 440, t, 0.1, 0.05);
                    break;
                case 'miss':
                    this.tone('triangle', 200, 120, t, 0.12, 0.08);
                    break;
                case 'orb': {
                    const n = PENTA[Math.min(arg, PENTA.length - 1)];
                    const f = mtof(76 + n);
                    const g = this.tone('sine', f, f, t, 0.35, 0.16);
                    g.connect(this.delaySend);
                    this.tone('triangle', f * 2, f * 2, t, 0.12, 0.05);
                    break;
                }
                case 'ring':
                    this.tone('sawtooth', 300, 1400, t, 0.45, 0.08).connect(this.delaySend);
                    this.tone('sine', 600, 2000, t, 0.4, 0.12);
                    break;
                case 'nearmiss': {
                    const f = this.noiseHit(t, 'highpass', 2000, 1, 0.18, 0.18, this.sfx);
                    f.frequency.exponentialRampToValueAtTime(6000, t + 0.18);
                    this.tone('sine', 880, 1320, t, 0.12, 0.08);
                    break;
                }
                case 'land':
                    this.tone('sine', 140, 50, t, 0.18, Math.min(0.4, arg / 3000));
                    this.noiseHit(t, 'lowpass', 600, 0.7, Math.min(0.3, arg / 4000), 0.15, this.sfx);
                    break;
                case 'crash':
                    this.noiseHit(t, 'lowpass', 1200, 0.8, 0.6, 0.7, this.sfx).frequency.exponentialRampToValueAtTime(120, t + 0.7);
                    this.tone('square', 180, 35, t, 0.5, 0.18);
                    this.tone('sine', 90, 30, t, 0.6, 0.5);
                    this.duck(0.15, 2.5);
                    break;
                case 'splash':
                    this.noiseHit(t, 'bandpass', 900, 0.6, 0.5, 0.9, this.sfx).frequency.exponentialRampToValueAtTime(300, t + 0.9);
                    this.tone('sine', 300, 80, t, 0.3, 0.2);
                    this.duck(0.15, 2.5);
                    break;
                case 'district': {
                    const chord = V.DISTRICTS[this.district].chords[0].slice(1);
                    chord.forEach((n, i) => {
                        this.tone('sine', mtof(n + 12), mtof(n + 12), t + i * 0.06, 1.6, 0.07).connect(this.delaySend);
                    });
                    break;
                }
                case 'chain':
                    this.tone('triangle', mtof(64 + Math.min(arg, 8) * 2), mtof(64 + Math.min(arg, 8) * 2), t, 0.1, 0.04);
                    break;
                case 'ui':
                    this.tone('sine', 660, 990, t, 0.08, 0.08);
                    break;
                case 'record':
                    [0, 4, 7, 12].forEach((n, i) => this.tone('triangle', mtof(72 + n), mtof(72 + n), t + i * 0.09, 0.4, 0.09).connect(this.delaySend));
                    break;
            }
        }
    };

    V.Audio = Audio;
})(window.VERTIGO = window.VERTIGO || {});
