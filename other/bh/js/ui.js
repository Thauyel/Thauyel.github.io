// DOM user interface: menus, HUD, level-up / cache / relic modals, pause,
// results, codex and settings, with keyboard and gamepad navigation.

import {WEAPONS, EVOLVED, PASSIVES, RELICS, SHIPS, STAT_LABELS, levelText, weaponDef} from './content.js';
import {ENEMIES, BOSSES, STAGES, RUN_LENGTH} from './stages.js';
import {icon, itemKey} from './icons.js';
import {enemyIcon} from './render.js';
import {fmtTime, fmtNum} from './util.js';

function h(tag, attrs = {}, ...kids) {
    const el = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (v === undefined || v === null || v === false) continue;
        if (k === 'class') el.className = v;
        else if (k === 'text') el.textContent = v;
        else if (k === 'html') el.innerHTML = v;
        else if (k.startsWith('on')) el.addEventListener(k.slice(2), v);
        else if (k === 'style') el.style.cssText = v;
        else el.setAttribute(k, v === true ? '' : v);
    }
    for (const kid of kids.flat()) {
        if (kid === null || kid === undefined || kid === false) continue;
        el.append(kid.nodeType ? kid : document.createTextNode(String(kid)));
    }
    return el;
}

const $ = id => document.getElementById(id);

function itemDef(type, id) {
    if (type === 'weapon' || type === 'evolve') return weaponDef(id);
    if (type === 'passive') return PASSIVES[id];
    if (type === 'relic') return RELICS[id];
    return null;
}

export class UI {
    constructor(app) {
        this.app = app;
        this.stack = [];
        this.banishMode = false;
        this.hudT = 0;
        this.slotSig = '';
        this.sel = {ship: 'vanguard', stage: 'grid', overclock: false};

        this.hud = $('hud');
        this.xpFill = $('xp-fill');
        this.lvl = $('hud-level');
        this.timer = $('hud-timer');
        this.sub = $('hud-sub');
        this.kills = $('hud-kills');
        this.credits = $('hud-credits');
        this.slotsW = $('slots-w');
        this.slotsP = $('slots-p');
        this.relicRow = $('hud-relics');
        this.bossbar = $('bossbar');
        this.bannerEl = $('banner');
        this.fps = $('fps');

        $('btn-pause').addEventListener('click', () => app.togglePause());

        this.buildTitle();
        this.buildSettings();
        this.buildHelp();
        this.buildCodex();

        addEventListener('keydown', e => this.onKey(e));
        // Mouse hover moves focus, so keyboard and mouse never disagree.
        document.addEventListener('pointerover', e => {
            const t = e.target.closest && e.target.closest('.nav');
            if (t && this.top() && this.top().contains(t) && document.activeElement !== t && e.pointerType === 'mouse') {
                t.focus({preventScroll: true});
                app.audio.play('hover');
            }
        });
        document.addEventListener('click', e => {
            if (e.target.closest && e.target.closest('button, .nav')) app.audio.play('ui');
        });
    }

    // ---------------------------------------------------------------- screens

    top() {
        return this.stack[this.stack.length - 1] || null;
    }

    open(id, focusSel) {
        const el = $(id);
        if (!el) return;
        if (this.top() === el) return;
        for (const s of this.stack) s.classList.add('behind');
        this.stack.push(el);
        el.classList.remove('hidden', 'behind');
        this.focusFirst(el, focusSel);
    }

    close(id) {
        const el = id ? $(id) : this.top();
        if (!el) return;
        const i = this.stack.indexOf(el);
        if (i >= 0) this.stack.splice(i, 1);
        el.classList.add('hidden');
        const t = this.top();
        if (t) {
            t.classList.remove('behind');
            this.focusFirst(t);
        }
    }

    closeAll() {
        for (const s of this.stack) s.classList.add('hidden');
        this.stack = [];
    }

    focusFirst(el, sel) {
        requestAnimationFrame(() => {
            const target = (sel && el.querySelector(sel)) || el.querySelector('.nav.selected') || el.querySelector('.nav:not([disabled])');
            if (target) target.focus({preventScroll: true});
        });
    }

    // Spatial navigation across .nav elements of the top screen.
    navigate(dir) {
        const scr = this.top();
        if (!scr) return;
        const items = [...scr.querySelectorAll('.nav')].filter(el => !el.disabled && el.offsetParent !== null);
        if (!items.length) return;
        const cur = document.activeElement;
        if (!items.includes(cur)) {
            items[0].focus();
            return;
        }
        const r0 = cur.getBoundingClientRect();
        const cx = r0.left + r0.width / 2, cy = r0.top + r0.height / 2;
        let best = null, bs = Infinity;
        for (const el of items) {
            if (el === cur) continue;
            const r = el.getBoundingClientRect();
            const x = r.left + r.width / 2, y = r.top + r.height / 2;
            const dx = x - cx, dy = y - cy;
            let along, across;
            if (dir === 'left') [along, across] = [-dx, dy];
            else if (dir === 'right') [along, across] = [dx, dy];
            else if (dir === 'up') [along, across] = [-dy, dx];
            else [along, across] = [dy, dx];
            if (along <= 4) continue;
            const score = along + Math.abs(across) * 2.5;
            if (score < bs) {
                bs = score;
                best = el;
            }
        }
        if (best) {
            best.focus();
            best.scrollIntoView({block: 'nearest'});
            this.app.audio.play('hover');
        }
    }

    onKey(e) {
        const scr = this.top();
        const app = this.app;
        if (e.repeat && (e.code === 'Escape' || e.code === 'KeyP')) return;
        if (!scr) {
            if (app.mode === 'run' && (e.code === 'Escape' || e.code === 'KeyP')) {
                app.togglePause();
                e.preventDefault();
            }
            if (e.code === 'KeyM') app.toggleMute();
            return;
        }
        const id = scr.id;
        const map = {ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', KeyW: 'up', KeyS: 'down', KeyA: 'left', KeyD: 'right'};
        if (map[e.code]) {
            e.preventDefault();
            this.navigate(map[e.code]);
            return;
        }
        if (e.code === 'Enter' || e.code === 'Space' || e.code === 'NumpadEnter') {
            const a = document.activeElement;
            if (a && scr.contains(a) && a.classList.contains('nav')) {
                e.preventDefault();
                if (a.type === 'range') return;
                a.click();
            }
            return;
        }
        if (e.code === 'KeyM') app.toggleMute();
        if (e.code === 'Escape' || e.code === 'Backspace') {
            if (e.code === 'Backspace' && document.activeElement && document.activeElement.tagName === 'INPUT') return;
            e.preventDefault();
            this.back();
            return;
        }
        if (e.code === 'KeyP' && id === 'scr-pause') {
            app.togglePause();
            return;
        }
        if (id === 'scr-level') {
            const n = {Digit1: 0, Digit2: 1, Digit3: 2, Digit4: 3, Numpad1: 0, Numpad2: 1, Numpad3: 2, Numpad4: 3}[e.code];
            if (n !== undefined) {
                const card = scr.querySelectorAll('.choice')[n];
                if (card) card.click();
            }
            if (e.code === 'KeyR') $('btn-reroll').click();
            if (e.code === 'KeyX') $('btn-skip').click();
            if (e.code === 'KeyB') $('btn-banish').click();
        }
        if (id === 'scr-relic') {
            const n = {Digit1: 0, Digit2: 1, Digit3: 2}[e.code];
            if (n !== undefined) {
                const card = scr.querySelectorAll('.choice')[n];
                if (card) card.click();
            }
        }
    }

    padAction(a) {
        const scr = this.top();
        if (!scr) {
            if (a === 'pause' && this.app.mode === 'run') this.app.togglePause();
            return;
        }
        if (a === 'up' || a === 'down' || a === 'left' || a === 'right') this.navigate(a);
        else if (a === 'confirm') {
            const el = document.activeElement;
            if (el && scr.contains(el) && el.classList.contains('nav')) {
                if (el.type === 'range') return;
                el.click();
            } else this.focusFirst(scr);
        } else if (a === 'back') this.back();
        else if (a === 'pause' && scr.id === 'scr-pause') this.app.togglePause();
        else if (scr.id === 'scr-level' && a === 'reroll') $('btn-reroll').click();
        else if (scr.id === 'scr-level' && a === 'skip') $('btn-skip').click();
    }

    back() {
        const scr = this.top();
        if (!scr) return;
        const id = scr.id;
        if (id === 'scr-title') return;
        if (id === 'scr-pause') return this.app.togglePause();
        if (id === 'scr-level') {
            if (this.banishMode) this.setBanish(false);
            return;
        }
        if (id === 'scr-chest') return $('btn-chest-ok').click();
        if (id === 'scr-relic' || id === 'scr-over') return;
        if (id === 'scr-confirm') return this.close();
        this.close();
    }

    // ---------------------------------------------------------------- title

    buildTitle() {
        const scr = $('scr-title');
        const menu = scr.querySelector('.menu');
        const btn = (text, fn, cls = '') => h('button', {class: `btn nav ${cls}`, type: 'button', onclick: fn}, text);
        menu.append(
            btn('Play', () => this.openShips(), 'primary'),
            btn('Codex', () => this.open('scr-codex')),
            btn('Settings', () => this.open('scr-settings')),
            btn('How to play', () => this.open('scr-help')),
        );
        this.buildShips();
        this.buildStages();
    }

    buildShips() {
        const grid = $('ship-grid');
        grid.innerHTML = '';
        for (const s of Object.values(SHIPS)) {
            const w = WEAPONS[s.weapon];
            const card = h('button', {class: 'card ship-card nav', type: 'button', 'data-id': s.id, onclick: () => this.pickShip(s.id), onfocus: () => this.showShip(s.id)},
                h('img', {src: icon(`ship:${s.id}`, 96), alt: '', width: 56, height: 56}),
                h('div', {class: 'card-name', text: s.name}),
                h('div', {class: 'card-sub'}, h('img', {src: icon(`weapon:${w.id}`, 48), alt: '', width: 18, height: 18}), w.name),
            );
            grid.append(card);
        }
        this.showShip(this.sel.ship);
    }

    showShip(id) {
        const s = SHIPS[id];
        const w = WEAPONS[s.weapon];
        const statText = Object.entries(s.stats).map(([k, v]) => {
            const label = (STAT_LABELS.find(l => l[0] === k) || [k, k === 'maxHpMul' ? 'Max hull' : k === 'magnetMul' ? 'Pickup range' : k])[1];
            const pct = ['armor', 'recovery', 'amount'].includes(k) ? (v > 0 ? `+${v}` : `${v}`) : `${v > 0 ? '+' : ''}${Math.round(v * 100)}%`;
            return h('li', {}, h('span', {text: label}), h('b', {class: v > 0 ? 'pos' : 'neg', text: pct}));
        });
        const extras = [];
        for (const [k, v] of Object.entries(s.charges || {})) extras.push(h('li', {}, h('span', {text: k[0].toUpperCase() + k.slice(1)}), h('b', {class: 'pos', text: `+${v}`})));
        const panel = $('ship-detail');
        panel.innerHTML = '';
        panel.append(
            h('div', {class: 'detail-head'},
                h('img', {src: icon(`ship:${id}`, 128), alt: '', width: 72, height: 72}),
                h('div', {}, h('h3', {text: s.name}), h('p', {text: s.desc})),
            ),
            h('div', {class: 'detail-weapon'},
                h('img', {src: icon(`weapon:${w.id}`, 64), alt: '', width: 36, height: 36}),
                h('div', {}, h('b', {text: w.name}), h('small', {text: w.desc})),
            ),
            h('ul', {class: 'stat-list'},
                h('li', {}, h('span', {text: 'Hull'}), h('b', {text: String(Math.round(s.hp * (1 + (s.stats.maxHpMul || 0))))})),
                statText, extras,
                h('li', {class: 'perk'}, h('span', {text: 'Growth'}), h('b', {text: s.perk.text})),
            ),
        );
    }

    openShips() {
        this.open('scr-ship', `.ship-card[data-id="${this.sel.ship}"]`);
    }

    pickShip(id) {
        this.sel.ship = id;
        for (const c of document.querySelectorAll('.ship-card')) c.classList.toggle('selected', c.dataset.id === id);
        this.showShip(id);
        this.refreshStages();
        this.open('scr-stage', `.stage-card[data-id="${this.sel.stage}"]`);
    }

    buildStages() {
        const grid = $('stage-grid');
        grid.innerHTML = '';
        for (const st of Object.values(STAGES)) {
            const card = h('button', {class: `card stage-card nav st-${st.id}`, type: 'button', 'data-id': st.id, onclick: () => this.startStage(st.id)},
                h('div', {class: 'stage-tag', text: st.tag}),
                h('div', {class: 'card-name', text: st.name}),
                h('p', {class: 'card-desc', text: st.desc}),
                h('div', {class: 'stage-meta'},
                    h('span', {text: `Enemy hull ×${st.hpMult}`}),
                    h('span', {text: `Score ×${st.scoreMult}`}),
                ),
                h('div', {class: 'stage-best', 'data-best': st.id}),
            );
            grid.append(card);
        }
        const oc = $('overclock');
        oc.addEventListener('click', () => {
            this.sel.overclock = !this.sel.overclock;
            oc.classList.toggle('on', this.sel.overclock);
            oc.setAttribute('aria-pressed', String(this.sel.overclock));
        });
    }

    refreshStages() {
        for (const el of document.querySelectorAll('[data-best]')) {
            const list = this.app.scores[el.dataset.best] || [];
            const best = list[0];
            el.textContent = best ? `Best ${fmtNum(best.score)} · ${best.cleared ? 'Cleared' : fmtTime(best.time)} · ${SHIPS[best.ship] ? SHIPS[best.ship].name : ''}` : 'No record yet';
        }
    }

    startStage(id) {
        this.sel.stage = id;
        this.closeAll();
        this.app.startRun(this.sel.ship, id, this.sel.overclock);
    }

    // ---------------------------------------------------------------- settings / help / codex

    buildSettings() {
        const box = $('settings-body');
        const st = this.app.settings;
        const slider = (key, label) => {
            const input = h('input', {type: 'range', min: 0, max: 100, value: Math.round(st[key] * 100), class: 'nav', 'aria-label': label});
            const out = h('output', {text: `${Math.round(st[key] * 100)}%`});
            input.addEventListener('input', () => {
                st[key] = input.value / 100;
                out.textContent = `${input.value}%`;
                this.app.applySettings();
            });
            input.addEventListener('keydown', e => {
                if (e.code === 'ArrowLeft' || e.code === 'ArrowRight') {
                    e.stopPropagation();
                }
            });
            return h('label', {class: 'set-row'}, h('span', {text: label}), input, out);
        };
        const toggle = (key, label) => {
            const b = h('button', {type: 'button', class: `toggle nav ${st[key] ? 'on' : ''}`, 'aria-pressed': String(!!st[key])}, h('span', {class: 'knob'}));
            b.addEventListener('click', () => {
                st[key] = !st[key];
                b.classList.toggle('on', st[key]);
                b.setAttribute('aria-pressed', String(st[key]));
                this.app.applySettings();
            });
            return h('div', {class: 'set-row'}, h('span', {text: label}), b);
        };
        box.append(
            slider('sfx', 'Effects volume'),
            slider('music', 'Music volume'),
            toggle('damageNumbers', 'Damage numbers'),
            toggle('shake', 'Screen shake'),
            toggle('lowFx', 'Reduced particles'),
            toggle('fps', 'Show FPS'),
        );
        $('btn-settings-back').addEventListener('click', () => this.close('scr-settings'));
    }

    buildHelp() {
        $('btn-help-back').addEventListener('click', () => this.close('scr-help'));
    }

    buildCodex() {
        const tabs = $('codex-tabs');
        const body = $('codex-body');
        const sections = {
            Weapons: () => Object.values(WEAPONS).map(w => {
                const evo = EVOLVED[w.evo.into];
                return h('div', {class: 'codex-entry'},
                    h('img', {src: icon(`weapon:${w.id}`, 64), alt: '', width: 44, height: 44}),
                    h('div', {},
                        h('b', {text: w.name}), h('p', {text: w.desc}),
                        h('div', {class: 'recipe'},
                            h('span', {text: 'Max level'}), ' + ',
                            h('img', {src: icon(`passive:${w.evo.with}`, 48), alt: '', width: 20, height: 20}),
                            h('span', {text: PASSIVES[w.evo.with].name}), ' → ',
                            h('img', {src: icon(`weapon:${evo.id}`, 48), alt: '', width: 20, height: 20}),
                            h('b', {class: 'gold', text: evo.name}),
                        ),
                        h('small', {text: evo.desc}),
                    ),
                );
            }),
            Passives: () => Object.values(PASSIVES).map(p => {
                const users = Object.values(WEAPONS).filter(w => w.evo.with === p.id).map(w => w.name);
                return h('div', {class: 'codex-entry'},
                    h('img', {src: icon(`passive:${p.id}`, 64), alt: '', width: 44, height: 44}),
                    h('div', {}, h('b', {text: p.name}), h('p', {text: `${p.desc} Max level ${p.max}.`}),
                        users.length ? h('small', {text: `Evolves: ${users.join(', ')}`}) : null),
                );
            }),
            Relics: () => Object.values(RELICS).map(r => h('div', {class: 'codex-entry'},
                h('img', {src: icon(`relic:${r.id}`, 64), alt: '', width: 44, height: 44}),
                h('div', {}, h('b', {text: r.name}), h('p', {text: r.desc})),
            )),
            Enemies: () => [...Object.values(ENEMIES), ...Object.values(BOSSES)].map(e => h('div', {class: 'codex-entry'},
                h('img', {src: enemyIcon(e, 64), alt: '', width: 44, height: 44}),
                h('div', {}, h('b', {text: e.name + (e.boss ? (e.final ? ' · Final boss' : e.purger ? '' : ' · Boss') : '')}), h('p', {text: e.desc})),
            )),
        };
        const show = name => {
            body.innerHTML = '';
            body.append(...sections[name]());
            for (const t of tabs.children) t.classList.toggle('selected', t.dataset.tab === name);
            body.scrollTop = 0;
        };
        for (const name of Object.keys(sections)) {
            tabs.append(h('button', {type: 'button', class: 'tab nav', 'data-tab': name, onclick: () => show(name)}, name));
        }
        this.codexShow = show;
        let built = false;
        const scr = $('scr-codex');
        new MutationObserver(() => {
            if (!scr.classList.contains('hidden') && !built) {
                built = true;
                show('Weapons');
            }
        }).observe(scr, {attributes: true, attributeFilter: ['class']});
        $('btn-codex-back').addEventListener('click', () => this.close('scr-codex'));
    }

    // ---------------------------------------------------------------- HUD

    showHud(on) {
        this.hud.classList.toggle('hidden', !on);
        this.slotSig = '';
        if (!on) this.bossbar.classList.add('hidden');
    }

    updateHud(g, dt) {
        const p = g.player;
        this.xpFill.style.transform = `scaleX(${Math.min(1, p.xp / p.xpNext)})`;
        this.hudT -= dt;
        if (this.hudT > 0) return;
        this.hudT = 0.1;
        this.lvl.textContent = `LV ${p.level}`;
        if (g.cleared) {
            this.timer.textContent = fmtTime(g.time);
            this.timer.classList.add('overtime');
            this.timer.classList.remove('urgent');
            this.sub.textContent = 'OVERTIME';
        } else {
            this.timer.textContent = fmtTime(g.time);
            this.timer.classList.toggle('urgent', RUN_LENGTH - g.time < 60);
            this.timer.classList.remove('overtime');
            this.sub.textContent = g.stage.name + (g.overclock ? ' · OC' : '');
        }
        this.kills.textContent = fmtNum(g.kills);
        this.credits.textContent = fmtNum(g.credits);

        const sig = p.weapons.map(w => w.id + w.level).join() + '|' + p.passives.map(pa => pa.id + pa.level).join() + '|' + p.relics.join();
        if (sig !== this.slotSig) {
            this.slotSig = sig;
            this.renderSlots(this.slotsW, p.weapons.map(w => ({key: `weapon:${w.def.id}`, level: w.level, max: w.def.maxLevel, evolved: w.def.evolved, name: w.def.name})), 6);
            this.renderSlots(this.slotsP, p.passives.map(pa => ({key: `passive:${pa.id}`, level: pa.level, max: pa.def.max, name: pa.def.name})), 6);
            this.relicRow.innerHTML = '';
            for (const r of p.relics) this.relicRow.append(h('img', {src: icon(`relic:${r}`, 48), alt: RELICS[r].name, title: RELICS[r].name, width: 22, height: 22}));
        }

        const boss = g.bosses.find(b => b.alive && !b.def.purger) || g.bosses.find(b => b.alive);
        if (boss) {
            this.bossbar.classList.remove('hidden');
            this.bossbar.querySelector('.bb-name').textContent = boss.def.name + (boss.enraged ? ' · ENRAGED' : '');
            this.bossbar.querySelector('.bb-fill').style.transform = `scaleX(${boss.def.purger ? 1 : Math.max(0, boss.hp / boss.maxHp)})`;
            this.bossbar.style.setProperty('--boss', boss.def.color);
        } else {
            this.bossbar.classList.add('hidden');
        }
    }

    renderSlots(el, items, n) {
        el.innerHTML = '';
        for (let i = 0; i < n; i++) {
            const it = items[i];
            if (!it) {
                el.append(h('div', {class: 'slot empty'}));
                continue;
            }
            const pips = h('div', {class: 'pips'});
            if (!it.evolved) for (let k = 0; k < it.max; k++) pips.append(h('i', {class: k < it.level ? 'on' : ''}));
            el.append(h('div', {class: `slot ${it.evolved ? 'evolved' : ''}`, title: it.name},
                h('img', {src: icon(it.key, 64), alt: it.name, width: 30, height: 30}), pips));
        }
    }

    banner(text, kind = 'info', sub = '') {
        const el = h('div', {class: `banner-item ${kind}`}, h('div', {class: 'b-title', text}), sub ? h('div', {class: 'b-sub', text: sub}) : null);
        this.bannerEl.append(el);
        while (this.bannerEl.children.length > 3) this.bannerEl.firstChild.remove();
        setTimeout(() => el.classList.add('out'), kind === 'boss' || kind === 'big' ? 2600 : 1700);
        setTimeout(() => el.remove(), kind === 'boss' || kind === 'big' ? 3200 : 2300);
    }

    consume(g, events) {
        for (const ev of events) {
            switch (ev.type) {
                case 'warning':
                    this.banner(ev.text.toUpperCase(), 'warn');
                    break;
                case 'bossSpawn':
                    if (ev.purger) {
                        if (!this.purgerShown) this.banner('THE PURGER APPROACHES', 'boss', 'It cannot be destroyed. Survive as long as you can.');
                        this.purgerShown = true;
                    } else this.banner(`WARNING: ${ev.name.toUpperCase()}`, 'boss', ev.final ? 'Final boss signature detected' : 'Boss signature detected');
                    break;
                case 'bossKill':
                    this.banner(`${ev.name.toUpperCase()} DESTROYED`, 'big');
                    break;
                case 'evolve':
                    this.banner(`EVOLUTION: ${ev.name.toUpperCase()}`, 'big');
                    break;
                case 'clear':
                    this.banner('STAGE CLEARED', 'big', 'Every second of overtime is worth bonus score');
                    break;
                case 'revive':
                    this.banner('REVIVED', 'big');
                    break;
                case 'pickup':
                    if (ev.kind === 'freeze') this.banner('STASIS FIELD', 'info');
                    else if (ev.kind === 'bomb') this.banner('EMP BLAST', 'info');
                    else if (ev.kind === 'magnet') this.banner('VACUUM', 'info');
                    break;
            }
        }
    }

    // ---------------------------------------------------------------- choices

    cardFor(g, opt, i) {
        const p = g.player;
        const def = itemDef(opt.type, opt.id);
        let name, desc, badge, color, key, hint = '';
        if (opt.type === 'heal') {
            name = 'Repair Kit';
            desc = 'Restore 30% hull.';
            badge = '';
            color = '#ff5fa2';
            key = 'misc:heal';
        } else if (opt.type === 'credits') {
            name = 'Credit Cache';
            desc = '+50 credits.';
            badge = '';
            color = '#ffd36b';
            key = 'misc:credits';
        } else {
            name = def.name;
            color = def.color;
            key = itemKey(opt.type, opt.id);
            badge = opt.isNew ? 'NEW' : `LV ${opt.level}`;
            desc = opt.isNew ? def.desc : levelText(def, opt.level);
            if (opt.type === 'passive' && !opt.isNew) desc = def.desc;
            if (opt.type === 'weapon') {
                const partner = PASSIVES[def.evo.with];
                const has = !!g.findPassive(def.evo.with);
                hint = `${has ? '✓' : '◇'} Evolves with ${partner.name}`;
            } else if (opt.type === 'passive') {
                const users = p.weapons.filter(w => !w.def.evolved && w.def.evo && w.def.evo.with === opt.id).map(w => w.def.name);
                if (users.length) hint = `✓ Evolves ${users.join(', ')}`;
            }
        }
        const banishable = opt.isNew && opt.type !== 'heal' && opt.type !== 'credits';
        const card = h('button', {
            class: `card choice nav ${opt.isNew ? 'is-new' : ''}`, type: 'button', style: `--c:${color}`,
            'data-banishable': banishable ? '1' : '0',
            onclick: () => this.pickOption(i),
        },
        h('div', {class: 'choice-icon'}, h('img', {src: icon(key, 96), alt: '', width: 56, height: 56})),
        h('div', {class: 'choice-text'},
            h('div', {class: 'choice-top'}, h('b', {text: name}), badge ? h('span', {class: 'badge', text: badge}) : null),
            h('p', {text: desc}),
            hint ? h('small', {class: 'hint', text: hint}) : null,
        ),
        h('kbd', {text: String(i + 1)}),
        );
        return card;
    }

    showChoice(g) {
        const c = g.choice;
        if (!c) return;
        this.choiceRef = c;
        if (c.kind === 'level') this.showLevel(g);
        else if (c.kind === 'chest') this.showChest(g);
        else if (c.kind === 'relic') this.showRelic(g);
    }

    showLevel(g) {
        const c = g.choice;
        this.setBanish(false);
        $('level-title').textContent = `LEVEL ${c.level}`;
        const box = $('level-cards');
        box.innerHTML = '';
        c.options.forEach((o, i) => box.append(this.cardFor(g, o, i)));
        const rr = $('btn-reroll'), sk = $('btn-skip'), bn = $('btn-banish');
        rr.querySelector('b').textContent = g.charges.reroll;
        sk.querySelector('b').textContent = g.charges.skip;
        bn.querySelector('b').textContent = g.charges.banish;
        rr.disabled = g.charges.reroll <= 0 || !g.canReroll();
        sk.disabled = g.charges.skip <= 0;
        bn.disabled = g.charges.banish <= 0 || !c.options.some(o => o.isNew);
        const scr = $('scr-level');
        if (this.top() !== scr) this.open('scr-level');
        else this.focusFirst(scr);
        scr.querySelector('.modal').classList.remove('pop');
        void scr.offsetWidth;
        scr.querySelector('.modal').classList.add('pop');
    }

    setBanish(on) {
        this.banishMode = on;
        $('scr-level').classList.toggle('banishing', on);
        $('btn-banish').classList.toggle('on', on);
    }

    pickOption(i) {
        const g = this.app.game;
        if (!g || !g.choice) return;
        if (g.choice.kind === 'level' && this.banishMode) {
            if (g.banish(i)) {
                this.app.audio.play('emp');
                this.showLevel(g);
            }
            return;
        }
        g.choose(i);
        this.afterChoice();
    }

    afterChoice() {
        const g = this.app.game;
        for (const id of ['scr-level', 'scr-chest', 'scr-relic']) if (this.stack.includes($(id))) this.close(id);
        if (g.choice) this.showChoice(g);
    }

    bindChoiceButtons() {
        $('btn-reroll').addEventListener('click', () => {
            const g = this.app.game;
            if (g && g.reroll()) this.showLevel(g);
        });
        $('btn-skip').addEventListener('click', () => {
            const g = this.app.game;
            if (g && g.choice && g.choice.kind === 'level' && g.skip()) this.afterChoice();
        });
        $('btn-banish').addEventListener('click', () => {
            const g = this.app.game;
            if (!g || g.charges.banish <= 0) return;
            this.setBanish(!this.banishMode);
        });
        $('btn-relic-skip').addEventListener('click', () => {
            const g = this.app.game;
            if (g && g.choice && g.choice.kind === 'relic' && g.skip()) this.afterChoice();
        });
        $('btn-chest-ok').addEventListener('click', () => {
            const g = this.app.game;
            if (!g || !g.choice || g.choice.kind !== 'chest') return;
            if (this.chestRevealing) {
                this.finishChestReveal();
                return;
            }
            g.choose(0); // chests apply on open; this just closes and opens the next queued choice
            this.afterChoice();
        });
    }

    showChest(g) {
        const c = g.choice;
        $('chest-title').textContent = c.boss ? 'BOSS CACHE' : 'SUPPLY CACHE';
        const list = $('chest-items');
        list.innerHTML = '';
        const items = c.items.map(it => {
            let name, desc, key, cls = '';
            if (it.type === 'evolve') {
                const d = EVOLVED[it.id];
                name = d.name;
                desc = `${it.from} evolved! ${d.desc}`;
                key = `weapon:${it.id}`;
                cls = 'evolve';
            } else if (it.type === 'credits') {
                name = 'Credits';
                desc = `+${it.amount} credits and a quick repair.`;
                key = 'misc:credits';
            } else {
                const d = itemDef(it.type, it.id);
                name = d.name;
                desc = it.type === 'weapon' ? `LV ${it.level}: ${levelText(d, it.level)}` : `LV ${it.level}: ${d.desc}`;
                key = itemKey(it.type, it.id);
            }
            return h('div', {class: `chest-item ${cls}`},
                h('img', {src: icon(key, 96), alt: '', width: 48, height: 48}),
                h('div', {}, h('b', {text: name}), h('p', {text: desc})));
        });
        list.append(...items);
        $('chest-credits').textContent = `+${c.credits} credits`;
        this.open('scr-chest', '#btn-chest-ok');
        // Staggered reveal
        this.chestRevealing = true;
        $('btn-chest-ok').textContent = 'Reveal all';
        items.forEach((el, i) => {
            el.style.animationDelay = `${0.25 + i * 0.35}s`;
        });
        clearTimeout(this.chestTimer);
        this.chestTimer = setTimeout(() => this.finishChestReveal(), 250 + items.length * 350 + 300);
    }

    finishChestReveal() {
        this.chestRevealing = false;
        clearTimeout(this.chestTimer);
        for (const el of document.querySelectorAll('#chest-items .chest-item')) el.style.animationDelay = '0s';
        $('btn-chest-ok').textContent = 'Continue';
    }

    showRelic(g) {
        const c = g.choice;
        $('relic-title').textContent = c.reason === 'start' ? 'CHOOSE A STARTING RELIC' : 'RELIC CACHE';
        const box = $('relic-cards');
        box.innerHTML = '';
        c.options.forEach((id, i) => {
            const r = RELICS[id];
            box.append(h('button', {class: 'card choice relic nav', type: 'button', style: `--c:${r.color}`, onclick: () => this.pickOption(i)},
                h('div', {class: 'choice-icon'}, h('img', {src: icon(`relic:${id}`, 96), alt: '', width: 56, height: 56})),
                h('div', {class: 'choice-text'}, h('div', {class: 'choice-top'}, h('b', {text: r.name})), h('p', {text: r.desc})),
                h('kbd', {text: String(i + 1)}),
            ));
        });
        this.open('scr-relic');
    }

    // ---------------------------------------------------------------- pause & results

    showPause(g) {
        const box = $('pause-body');
        box.innerHTML = '';
        box.append(this.buildSummary(g, false));
        this.open('scr-pause');
    }

    buildSummary(g, final) {
        const p = g.player;
        const wrap = h('div', {class: 'summary'});
        const build = h('div', {class: 'sum-build'});
        build.append(h('h4', {text: 'Weapons'}));
        const table = h('table', {class: 'dmg-table'});
        table.append(h('tr', {}, h('th', {text: ''}), h('th', {text: 'Weapon'}), h('th', {text: 'Lv'}), h('th', {text: 'Damage'}), h('th', {text: 'DPS'}), h('th', {text: 'Kills'})));
        const total = p.weapons.reduce((a, w) => a + w.dmg, 0) || 1;
        for (const w of [...p.weapons].sort((a, b) => b.dmg - a.dmg)) {
            const alive = Math.max(1, g.time - w.since);
            table.append(h('tr', {},
                h('td', {}, h('img', {src: icon(`weapon:${w.def.id}`, 48), alt: '', width: 24, height: 24})),
                h('td', {}, h('span', {class: w.def.evolved ? 'gold' : '', text: w.def.name}), h('div', {class: 'bar'}, h('i', {style: `width:${(w.dmg / total) * 100}%;background:${w.def.color}`}))),
                h('td', {text: w.def.evolved ? '★' : String(w.level)}),
                h('td', {text: fmtNum(w.dmg)}),
                h('td', {text: fmtNum(w.dmg / alive)}),
                h('td', {text: fmtNum(w.kills)}),
            ));
        }
        build.append(table);
        const pas = h('div', {class: 'sum-icons'});
        for (const pa of p.passives) pas.append(h('div', {class: 'sum-chip'}, h('img', {src: icon(`passive:${pa.id}`, 48), alt: '', width: 24, height: 24}), h('span', {text: `${pa.def.name} ${pa.level}/${pa.def.max}`})));
        for (const r of p.relics) pas.append(h('div', {class: 'sum-chip relic'}, h('img', {src: icon(`relic:${r}`, 48), alt: '', width: 24, height: 24}), h('span', {text: RELICS[r].name})));
        if (pas.children.length) {
            build.append(h('h4', {text: 'Modules & relics'}), pas);
        }
        const stats = h('div', {class: 'sum-stats'});
        stats.append(h('h4', {text: final ? 'Run' : 'Ship stats'}));
        const ul = h('ul', {class: 'stat-list compact'});
        if (final) {
            const rows = [
                ['Time', fmtTime(g.time)], ['Level', p.level], ['Kills', fmtNum(g.kills)], ['Bosses', g.bossKills], ['Elites', g.eliteKills],
                ['Credits', fmtNum(g.credits)], ['Damage taken', fmtNum(g.damageTaken)], ['Hull repaired', fmtNum(p.healed)], ['Distance', `${fmtNum(p.distance / 10)} m`],
            ];
            for (const [k, v] of rows) ul.append(h('li', {}, h('span', {text: k}), h('b', {text: String(v)})));
        } else {
            for (const [k, label, fmt] of STAT_LABELS) ul.append(h('li', {}, h('span', {text: label}), h('b', {text: String(k === 'maxHp' ? `${Math.ceil(p.hp)}/${Math.round(g.stats.maxHp)}` : fmt(g.stats[k]))})));
            ul.append(h('li', {}, h('span', {text: 'Reroll / Skip / Banish'}), h('b', {text: `${g.charges.reroll} / ${g.charges.skip} / ${g.charges.banish}`})));
        }
        stats.append(ul);
        wrap.append(build, stats);
        return wrap;
    }

    showResults(g, rank) {
        const scr = $('scr-over');
        const cleared = g.cleared;
        $('over-title').textContent = cleared ? 'STAGE CLEARED' : 'SHIP DESTROYED';
        scr.classList.toggle('won', cleared);
        $('over-sub').textContent = `${g.ship.name} · ${g.stage.name}${g.overclock ? ' · Overclock' : ''}` + (g.deathCause && g.over ? ` · ${cleared ? 'Caught by' : 'Lost to'} ${g.deathCause === 'contact' ? 'enemy contact' : g.deathCause}` : '');
        $('over-score').textContent = fmtNum(g.score());
        $('over-rank').textContent = rank === 0 ? 'NEW HIGH SCORE' : rank > 0 ? `#${rank + 1} on the board` : '';
        const box = $('over-body');
        box.innerHTML = '';
        box.append(this.buildSummary(g, true));
        const list = this.app.scores[g.stage.id] || [];
        if (list.length) {
            const hs = h('ol', {class: 'scores'});
            list.forEach((s, i) => hs.append(h('li', {class: i === rank ? 'me' : ''},
                h('span', {text: fmtNum(s.score)}),
                h('span', {text: SHIPS[s.ship] ? SHIPS[s.ship].name : s.ship}),
                h('span', {text: s.cleared ? 'Clear' : fmtTime(s.time)}),
                h('span', {text: `Lv ${s.level}${s.overclock ? ' · OC' : ''}`}),
            )));
            box.append(h('div', {class: 'sum-scores'}, h('h4', {text: `${g.stage.name} high scores`}), hs));
        }
        this.open('scr-over', '#btn-retry');
    }
}
