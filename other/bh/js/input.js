// Keyboard, floating touch joystick and gamepad input.

const MOVE_KEYS = {
    KeyW: [0, -1], ArrowUp: [0, -1], KeyS: [0, 1], ArrowDown: [0, 1],
    KeyA: [-1, 0], ArrowLeft: [-1, 0], KeyD: [1, 0], ArrowRight: [1, 0],
}; // event.code is the physical key, so WASD also works on AZERTY/QWERTZ layouts

export class Input {
    constructor(canvas, stickEl, knobEl) {
        this.keys = new Set();
        this.stick = {id: null, ox: 0, oy: 0, x: 0, y: 0};
        this.stickEl = stickEl;
        this.knobEl = knobEl;
        this.padPrev = {};
        this.padIndex = -1;
        this.lastDevice = 'keyboard';
        this.enabled = true; // joystick only while playing

        addEventListener('keydown', e => {
            if (MOVE_KEYS[e.code]) this.keys.add(e.code);
            this.lastDevice = 'keyboard';
        });
        addEventListener('keyup', e => this.keys.delete(e.code));
        addEventListener('blur', () => {
            this.keys.clear();
            this.endStick();
        });

        canvas.addEventListener('pointerdown', e => {
            if (!this.enabled || this.stick.id !== null) return;
            if (e.pointerType === 'mouse' && e.button !== 0) return;
            this.stick.id = e.pointerId;
            this.stick.ox = e.clientX;
            this.stick.oy = e.clientY;
            this.stick.x = 0;
            this.stick.y = 0;
            this.lastDevice = e.pointerType === 'mouse' ? 'keyboard' : 'touch';
            try {
                canvas.setPointerCapture(e.pointerId);
            } catch {
                // capture is best-effort
            }
            this.showStick();
            e.preventDefault();
        });
        canvas.addEventListener('pointermove', e => {
            if (e.pointerId !== this.stick.id) return;
            const R = 56;
            let dx = e.clientX - this.stick.ox, dy = e.clientY - this.stick.oy;
            const d = Math.hypot(dx, dy);
            if (d > R) {
                // Drag the base along so direction changes stay responsive.
                this.stick.ox += (dx / d) * (d - R);
                this.stick.oy += (dy / d) * (d - R);
                dx = (dx / d) * R;
                dy = (dy / d) * R;
            }
            this.stick.x = dx / R;
            this.stick.y = dy / R;
            this.showStick();
        });
        const end = e => {
            if (e.pointerId === this.stick.id) this.endStick();
        };
        canvas.addEventListener('pointerup', end);
        canvas.addEventListener('pointercancel', end);
        canvas.addEventListener('contextmenu', e => e.preventDefault());

        addEventListener('gamepadconnected', e => {
            this.padIndex = e.gamepad.index;
        });
        addEventListener('gamepaddisconnected', e => {
            if (e.gamepad.index === this.padIndex) this.padIndex = -1;
        });
    }

    endStick() {
        this.stick.id = null;
        this.stick.x = 0;
        this.stick.y = 0;
        if (this.stickEl) this.stickEl.classList.add('hidden');
    }

    showStick() {
        if (!this.stickEl) return;
        this.stickEl.classList.remove('hidden');
        this.stickEl.style.transform = `translate(${this.stick.ox}px, ${this.stick.oy}px)`;
        this.knobEl.style.transform = `translate(${this.stick.x * 56}px, ${this.stick.y * 56}px)`;
    }

    setEnabled(on) {
        this.enabled = on;
        if (!on) this.endStick();
    }

    gamepad() {
        if (!navigator.getGamepads) return null;
        const pads = navigator.getGamepads();
        if (this.padIndex >= 0 && pads[this.padIndex]) return pads[this.padIndex];
        for (const p of pads) if (p && p.connected) return p;
        return null;
    }

    move() {
        let x = 0, y = 0;
        for (const k of this.keys) {
            const v = MOVE_KEYS[k];
            x += v[0];
            y += v[1];
        }
        if (this.stick.id !== null) {
            const m = Math.hypot(this.stick.x, this.stick.y);
            if (m > 0.12) {
                x += this.stick.x;
                y += this.stick.y;
            }
        }
        const pad = this.gamepad();
        if (pad) {
            const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
            if (Math.hypot(ax, ay) > 0.2) {
                x += ax;
                y += ay;
                this.lastDevice = 'gamepad';
            }
            const b = pad.buttons;
            if (b[12] && b[12].pressed) y -= 1;
            if (b[13] && b[13].pressed) y += 1;
            if (b[14] && b[14].pressed) x -= 1;
            if (b[15] && b[15].pressed) x += 1;
        }
        const len = Math.hypot(x, y);
        if (len > 1) {
            x /= len;
            y /= len;
        }
        return {x, y};
    }

    // Edge-triggered gamepad buttons for menus: returns a list of actions.
    padActions() {
        const pad = this.gamepad();
        const out = [];
        if (!pad) return out;
        const b = i => !!(pad.buttons[i] && pad.buttons[i].pressed);
        const ax = pad.axes[0] || 0, ay = pad.axes[1] || 0;
        const now = {
            confirm: b(0), back: b(1), reroll: b(2), skip: b(3), pause: b(9) || b(8),
            up: b(12) || ay < -0.6, down: b(13) || ay > 0.6, left: b(14) || ax < -0.6, right: b(15) || ax > 0.6,
        };
        for (const k in now) {
            if (now[k] && !this.padPrev[k]) out.push(k);
        }
        if (out.length) this.lastDevice = 'gamepad';
        this.padPrev = now;
        return out;
    }
}
