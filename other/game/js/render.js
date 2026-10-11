// VERTIGO — canvas renderer: sky, parallax skylines, cached buildings, anchors, player, effects.
(function (V) {
    'use strict';

    const { GROUND, DISTRICT_LEN, PX_PER_M } = V.CONST;
    const DISTRICTS = V.DISTRICTS;
    const hash = V.hash;
    const clamp = V.clamp;
    const TAU = Math.PI * 2;
    const SCARF = '#ff3b5c';
    const PS = 1.35; // player drawing scale
    const fig = ly => ly * PS + 11 * (1 - PS); // figure-local y, keeping the feet on the collision circle

    const hexToRgb = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
    const rgba = (c, a) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a === undefined ? 1 : a})`;
    const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
    const lerp = (a, b, t) => a + (b - a) * t;
    const smooth = (a, b, x) => {
        const t = clamp((x - a) / (b - a), 0, 1);
        return t * t * (3 - 2 * t);
    };
    const angleLerp = (a, b, t) => {
        let d = (b - a) % TAU;
        if (d > Math.PI) d -= TAU;
        if (d < -Math.PI) d += TAU;
        return a + d * t;
    };

    const COL_KEYS = ['skyTop', 'skyMid', 'skyBot', 'far', 'mid', 'fog', 'ground', 'cloud', 'accent', 'player', 'sun'];
    const NUM_KEYS = ['sunX', 'sunY', 'sunR', 'stars', 'aurora', 'rain', 'motes', 'synth'];
    const PALS = DISTRICTS.map(d => {
        const o = {};
        for (const k of COL_KEYS) o[k] = hexToRgb(d.palette[k]);
        for (const k of NUM_KEYS) o[k] = d.palette[k];
        return o;
    });

    function paletteAt(x) {
        const p = Math.max(0, x) / DISTRICT_LEN;
        const i = Math.floor(p);
        const t = smooth(0.86, 1, p - i);
        const A = PALS[i % PALS.length], B = PALS[(i + 1) % PALS.length];
        const o = {};
        for (const k of COL_KEYS) o[k] = mix(A[k], B[k], t);
        for (const k of NUM_KEYS) o[k] = lerp(A[k], B[k], t);
        return o;
    }

    // ---------- Building artwork (static parts are cached per building) ----------

    function windowsPath(ctx, b, x0, y0, w, h, cw, ch, ww, wh, threshold, shape) {
        const lit = new Path2D(), dark = new Path2D();
        const cols = Math.max(1, Math.floor(w / cw)), rows = Math.max(1, Math.floor(h / ch));
        const ox = x0 + (w - cols * cw) / 2 + (cw - ww) / 2;
        for (let j = 0; j < rows; j++) {
            for (let i = 0; i < cols; i++) {
                const x = ox + i * cw, y = y0 + j * ch;
                const path = hash(b.seed, i, j) > threshold ? lit : dark;
                if (shape === 'arch') {
                    path.moveTo(x + ww, y + ww / 2);
                    path.arc(x + ww / 2, y + ww / 2, ww / 2, 0, Math.PI, true);
                    path.lineTo(x, y + wh);
                    path.lineTo(x + ww, y + wh);
                    path.closePath();
                } else {
                    path.rect(x, y, ww, wh);
                }
            }
        }
        return { lit, dark };
    }

    function fillWindows(ctx, paths, litColor, darkColor, glow) {
        ctx.fillStyle = darkColor;
        ctx.fill(paths.dark);
        if (glow) {
            ctx.save();
            ctx.shadowColor = litColor;
            ctx.shadowBlur = glow;
            ctx.fillStyle = litColor;
            ctx.fill(paths.lit);
            ctx.restore();
        } else {
            ctx.fillStyle = litColor;
            ctx.fill(paths.lit);
        }
    }

    function shade(ctx, q, side) {
        const g = ctx.createLinearGradient(q.x, 0, q.x + q.w, 0);
        g.addColorStop(0, 'rgba(255,255,255,0.06)');
        g.addColorStop(0.6, 'rgba(0,0,0,0)');
        g.addColorStop(1, `rgba(0,0,0,${side || 0.28})`);
        ctx.fillStyle = g;
        ctx.fillRect(q.x, q.y, q.w, q.h);
    }

    const STATIC = {
        house(ctx, b) {
            const q = b.parts[0];
            for (const c of b.deco.chimneys || []) {
                const x = q.x + c * q.w;
                ctx.fillStyle = '#3a2430';
                ctx.fillRect(x, q.y - 26, 16, 26);
                ctx.fillRect(x - 3, q.y - 30, 22, 5);
            }
            ctx.fillStyle = b.color;
            ctx.fillRect(q.x, q.y, q.w, q.h);
            ctx.fillStyle = 'rgba(0,0,0,0.12)';
            for (let y = q.y + 10; y < GROUND; y += 9) ctx.fillRect(q.x, y, q.w, 1);
            shade(ctx, q);
            ctx.fillStyle = 'rgba(25,10,25,0.55)';
            ctx.fillRect(q.x - 5, q.y, q.w + 10, 8);
            if (b.deco.cornice) ctx.fillRect(q.x - 3, q.y + 12, q.w + 6, 3);
            const paths = windowsPath(ctx, b, q.x + 6, q.y + 26, q.w - 12, GROUND - q.y - 70, 32, 46, 16, 24, 0.42, 'arch');
            fillWindows(ctx, paths, '#ffcf7a', 'rgba(20,10,30,0.55)', 8);
            ctx.fillStyle = 'rgba(20,8,20,0.8)';
            const dx = q.x + q.w / 2 - 10;
            ctx.beginPath();
            ctx.moveTo(dx, GROUND);
            ctx.lineTo(dx, GROUND - 24);
            ctx.arc(dx + 10, GROUND - 24, 10, Math.PI, 0);
            ctx.lineTo(dx + 20, GROUND);
            ctx.fill();
            if (b.deco.start) {
                const sx = q.x + q.w - 330, sy = q.y - 120;
                ctx.fillStyle = '#2a1626';
                ctx.fillRect(sx + 30, sy + 60, 6, 60);
                ctx.fillRect(sx + 214, sy + 60, 6, 60);
                ctx.fillRect(sx, sy, 250, 62);
                ctx.strokeStyle = '#ffcf6b';
                ctx.lineWidth = 2;
                ctx.strokeRect(sx + 5, sy + 5, 240, 52);
                ctx.save();
                ctx.shadowColor = '#ffcf6b';
                ctx.shadowBlur = 12;
                ctx.fillStyle = '#ffe2a0';
                ctx.font = '800 22px system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('HOLD TO SWING →', sx + 125, sy + 40);
                ctx.restore();
            }
        },
        tower(ctx, b) {
            const q = b.parts[0];
            const spire = b.deco.spire;
            ctx.fillStyle = '#3d3346';
            ctx.beginPath();
            ctx.moveTo(q.x + 2, q.y);
            ctx.lineTo(q.x + q.w / 2, q.y - spire);
            ctx.lineTo(q.x + q.w - 2, q.y);
            ctx.fill();
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            ctx.beginPath();
            ctx.moveTo(q.x + 2, q.y);
            ctx.lineTo(q.x + q.w / 2, q.y - spire);
            ctx.lineTo(q.x + q.w / 2, q.y);
            ctx.fill();
            ctx.strokeStyle = '#ffcf6b';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(q.x + q.w / 2, q.y - spire);
            ctx.lineTo(q.x + q.w / 2, q.y - spire - 18);
            ctx.moveTo(q.x + q.w / 2 - 6, q.y - spire - 12);
            ctx.lineTo(q.x + q.w / 2 + 6, q.y - spire - 12);
            ctx.stroke();
            ctx.fillStyle = b.color;
            ctx.fillRect(q.x, q.y, q.w, GROUND - q.y);
            ctx.fillStyle = 'rgba(0,0,0,0.13)';
            for (let y = q.y + 6; y < GROUND; y += 14) ctx.fillRect(q.x, y, q.w, 1.5);
            shade(ctx, { x: q.x, y: q.y, w: q.w, h: GROUND - q.y });
            ctx.fillStyle = 'rgba(30,15,35,0.7)';
            for (let i = 0; i < 4; i++) ctx.fillRect(q.x - 4 + i * (q.w + 8) / 4, q.y - 8, (q.w + 8) / 8, 8);
            ctx.fillRect(q.x - 4, q.y, q.w + 8, 6);
            const paths = windowsPath(ctx, b, q.x + 8, q.y + (b.deco.clock ? 90 : 30), q.w - 16, GROUND - q.y - 140, 26, 70, 12, 40, 0.5, 'arch');
            fillWindows(ctx, paths, '#ffcf7a', 'rgba(20,10,30,0.6)', 10);
            if (b.deco.clock) {
                const cx = q.x + q.w / 2, cy = q.y + 44, r = q.w * 0.3;
                ctx.fillStyle = '#2a1d2e';
                ctx.beginPath();
                ctx.arc(cx, cy, r + 4, 0, TAU);
                ctx.fill();
                ctx.save();
                ctx.shadowColor = '#ffe2a8';
                ctx.shadowBlur = 18;
                ctx.fillStyle = '#f6e7c4';
                ctx.beginPath();
                ctx.arc(cx, cy, r, 0, TAU);
                ctx.fill();
                ctx.restore();
                ctx.fillStyle = '#2a1d2e';
                for (let i = 0; i < 12; i++) {
                    const a = i / 12 * TAU;
                    ctx.fillRect(cx + Math.sin(a) * r * 0.8 - 1, cy - Math.cos(a) * r * 0.8 - 1, 2, 2);
                }
            }
        },
        glass(ctx, b) {
            const lit = b.deco.tint > 0.5 ? '#ffe9b0' : '#cfe8ff';
            for (const q of b.parts) {
                const g = ctx.createLinearGradient(0, q.y, 0, GROUND);
                g.addColorStop(0, b.color);
                g.addColorStop(1, '#070a18');
                ctx.fillStyle = g;
                ctx.fillRect(q.x, q.y, q.w, q.h);
                const paths = windowsPath(ctx, b, q.x + 6, q.y + 10, q.w - 12, q.h - 20, 17, 21, 10, 13, 0.6);
                fillWindows(ctx, paths, lit, 'rgba(120,160,230,0.10)', 0);
                ctx.fillStyle = 'rgba(255,255,255,0.05)';
                ctx.beginPath();
                ctx.moveTo(q.x, q.y);
                ctx.lineTo(q.x + q.w * 0.45, q.y);
                ctx.lineTo(q.x, q.y + q.h * 0.5);
                ctx.fill();
                shade(ctx, q, 0.35);
                ctx.fillStyle = 'rgba(160,200,255,0.25)';
                ctx.fillRect(q.x, q.y, q.w, 2);
            }
            const top = b.parts[0];
            if (b.deco.tank !== undefined) {
                const x = top.x + b.deco.tank * top.w;
                ctx.strokeStyle = '#2a2a3a';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x + 4, top.y);
                ctx.lineTo(x + 6, top.y - 14);
                ctx.moveTo(x + 24, top.y);
                ctx.lineTo(x + 22, top.y - 14);
                ctx.stroke();
                ctx.fillStyle = '#5a3d2e';
                ctx.fillRect(x + 2, top.y - 36, 24, 22);
                ctx.beginPath();
                ctx.moveTo(x, top.y - 36);
                ctx.lineTo(x + 14, top.y - 46);
                ctx.lineTo(x + 28, top.y - 36);
                ctx.fill();
            }
            if (b.deco.antenna) {
                const x = top.x + b.deco.antenna.at * top.w;
                ctx.strokeStyle = '#8a92b0';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, top.y);
                ctx.lineTo(x, top.y - b.deco.antenna.h);
                ctx.stroke();
            }
            if (b.deco.sign) {
                const x = top.x + top.w / 2, y = top.y - 12;
                ctx.font = 'bold 20px system-ui, sans-serif';
                ctx.textAlign = 'center';
                ctx.save();
                ctx.shadowColor = '#ff4fa3';
                ctx.shadowBlur = 14;
                ctx.fillStyle = '#ff7cc0';
                ctx.fillText(b.deco.sign, x, y);
                ctx.restore();
            }
        },
        warehouse(ctx, b) {
            const q = b.parts[0];
            const tooth = 40, n = Math.ceil(q.w / tooth);
            ctx.fillStyle = b.color;
            ctx.fillRect(q.x, q.y + 18, q.w, GROUND - q.y - 18);
            ctx.save();
            ctx.beginPath();
            ctx.rect(q.x, q.y - 2, q.w, 22);
            ctx.clip();
            for (let i = 0; i < n; i++) {
                const x = q.x + i * tooth;
                ctx.fillStyle = b.color;
                ctx.beginPath();
                ctx.moveTo(x, q.y + 19);
                ctx.lineTo(x, q.y);
                ctx.lineTo(x + tooth, q.y + 19);
                ctx.fill();
                ctx.fillStyle = 'rgba(255,190,110,0.55)';
                ctx.fillRect(x, q.y + 2, 4, 16);
            }
            ctx.restore();
            ctx.fillStyle = 'rgba(0,0,0,0.16)';
            for (let x = q.x + 4; x < q.x + q.w; x += 7) ctx.fillRect(x, q.y + 20, 2, GROUND - q.y - 20);
            shade(ctx, { x: q.x, y: q.y + 18, w: q.w, h: GROUND - q.y - 18 });
            const dw = Math.min(70, q.w * 0.3), dx = q.x + q.w * 0.3;
            ctx.fillStyle = '#2b2b2b';
            ctx.fillRect(dx, GROUND - 60, dw, 60);
            ctx.fillStyle = 'rgba(255,179,71,0.65)';
            for (let i = 0; i < 6; i++) ctx.fillRect(dx + i * dw / 6, GROUND - 64, dw / 12, 4);
            const paths = windowsPath(ctx, b, q.x + 8, q.y + 30, q.w - 16, 16, 30, 20, 22, 10, 0.4);
            fillWindows(ctx, paths, '#ffb347', 'rgba(0,0,0,0.35)', 6);
        },
        containers(ctx, b) {
            const cols = b.deco.cols;
            b.parts.forEach((q, row) => {
                for (let i = 0; i < cols; i++) {
                    const color = b.deco.cells[(b.parts.length - 1 - row) * cols + i] || '#888';
                    const x = q.x + i * 66;
                    ctx.fillStyle = color;
                    ctx.fillRect(x + 1, q.y + 1, 64, q.h - 2);
                    ctx.fillStyle = 'rgba(0,0,0,0.22)';
                    for (let k = 4; k < 62; k += 6) ctx.fillRect(x + k, q.y + 3, 2, q.h - 6);
                    ctx.fillStyle = 'rgba(0,0,0,0.35)';
                    ctx.fillRect(x + 1, q.y + q.h - 4, 64, 3);
                    ctx.fillStyle = 'rgba(255,255,255,0.18)';
                    ctx.fillRect(x + 1, q.y + 1, 64, 2);
                }
            });
        },
        silo(ctx, b) {
            const q = b.parts[0];
            const cap = q.w * 0.35;
            ctx.fillStyle = b.color;
            ctx.beginPath();
            ctx.ellipse(q.x + q.w / 2, q.y + cap, q.w / 2, cap, 0, Math.PI, 0);
            ctx.fill();
            ctx.fillRect(q.x, q.y + cap, q.w, GROUND - q.y - cap);
            ctx.fillStyle = 'rgba(255,255,255,0.08)';
            for (let y = q.y + cap + 20; y < GROUND; y += 30) ctx.fillRect(q.x, y, q.w, 3);
            shade(ctx, { x: q.x, y: q.y, w: q.w, h: GROUND - q.y }, 0.4);
            ctx.strokeStyle = 'rgba(0,0,0,0.4)';
            ctx.lineWidth = 1.5;
            ctx.beginPath();
            const lx = q.x + q.w * 0.75;
            ctx.moveTo(lx, q.y + cap);
            ctx.lineTo(lx, GROUND);
            ctx.moveTo(lx + 8, q.y + cap);
            ctx.lineTo(lx + 8, GROUND);
            for (let y = q.y + cap; y < GROUND; y += 8) {
                ctx.moveTo(lx, y);
                ctx.lineTo(lx + 8, y);
            }
            ctx.stroke();
        },
        brutal(ctx, b) {
            const [cap, base] = b.parts;
            ctx.fillStyle = b.color;
            ctx.fillRect(base.x, base.y, base.w, GROUND - base.y);
            ctx.fillStyle = 'rgba(0,0,0,0.25)';
            for (let x = base.x + 10; x < base.x + base.w - 8; x += 22) ctx.fillRect(x, base.y + 10, 8, GROUND - base.y - 20);
            const sg = ctx.createLinearGradient(0, base.y, 0, base.y + 70);
            sg.addColorStop(0, 'rgba(0,0,0,0.5)');
            sg.addColorStop(1, 'rgba(0,0,0,0)');
            ctx.fillStyle = sg;
            ctx.fillRect(base.x, base.y, base.w, 70);
            shade(ctx, { x: base.x, y: base.y, w: base.w, h: GROUND - base.y });
            ctx.fillStyle = b.color;
            ctx.fillRect(cap.x, cap.y, cap.w, cap.h);
            ctx.fillStyle = 'rgba(0,0,0,0.07)';
            for (let y = cap.y + 8; y < cap.y + cap.h; y += 10) ctx.fillRect(cap.x, y, cap.w, 1);
            for (let x = cap.x + 30; x < cap.x + cap.w; x += 60) ctx.fillRect(x, cap.y, 1, cap.h);
            ctx.fillStyle = '#2b2b30';
            ctx.fillRect(cap.x + 8, cap.y + cap.h * 0.35, cap.w - 16, cap.h * 0.32);
            const paths = windowsPath(ctx, b, cap.x + 10, cap.y + cap.h * 0.35 + 3, cap.w - 20, cap.h * 0.32 - 4, 14, 100, 10, cap.h * 0.32 - 6, 0.55);
            fillWindows(ctx, paths, '#ffd9a0', 'rgba(0,0,0,0)', 6);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(cap.x, cap.y + cap.h - 4, cap.w, 4);
            ctx.fillStyle = 'rgba(255,255,255,0.15)';
            ctx.fillRect(cap.x, cap.y, cap.w, 2);
        },
        habitat(ctx, b) {
            const boxes = b.parts.slice().sort((p, q) => q.y - p.y);
            boxes.forEach((q, i) => {
                ctx.fillStyle = b.color;
                ctx.fillRect(q.x, q.y, q.w, q.h);
                ctx.fillStyle = 'rgba(0,0,0,0.08)';
                for (let y = q.y + 7; y < q.y + q.h; y += 9) ctx.fillRect(q.x, y, q.w, 1);
                const lit = hash(b.seed, i, 3) > 0.45;
                ctx.fillStyle = lit ? '#ffd9a0' : '#2b2b30';
                ctx.fillRect(q.x + q.w * 0.18, q.y + 12, q.w * 0.5, q.h - 26);
                ctx.fillStyle = 'rgba(0,0,0,0.35)';
                ctx.fillRect(q.x + q.w * 0.12, q.y + q.h - 12, q.w * 0.62, 3);
                ctx.fillStyle = 'rgba(0,0,0,0.25)';
                ctx.fillRect(q.x + q.w - 10, q.y, 10, q.h);
                ctx.fillStyle = 'rgba(255,255,255,0.15)';
                ctx.fillRect(q.x, q.y, q.w, 2);
            });
            for (const q of b.parts) {
                for (const o of b.parts) {
                    if (o === q || Math.abs(o.y - (q.y + q.h)) > 1) continue;
                    const x0 = Math.max(q.x, o.x), x1 = Math.min(q.x + q.w, o.x + o.w);
                    if (x1 > x0) {
                        ctx.fillStyle = 'rgba(0,0,0,0.3)';
                        ctx.fillRect(x0, o.y, x1 - x0, 8);
                    }
                }
            }
        },
        slab(ctx, b) {
            const q = b.parts[0];
            ctx.fillStyle = b.color;
            ctx.fillRect(q.x, q.y, q.w, q.h);
            for (let x = q.x + 6, i = 0; x < q.x + q.w - 6; x += 14, i++) {
                ctx.fillStyle = 'rgba(0,0,0,0.28)';
                ctx.fillRect(x, q.y + 26, 7, q.h - 40);
                ctx.fillStyle = 'rgba(255,255,255,0.1)';
                ctx.fillRect(x + 7, q.y + 26, 2, q.h - 40);
            }
            const paths = windowsPath(ctx, b, q.x + 6, q.y + 30, q.w - 12, q.h - 50, 14, 18, 7, 10, 0.78);
            fillWindows(ctx, paths, '#ffd9a0', 'rgba(0,0,0,0)', 4);
            ctx.fillStyle = 'rgba(0,0,0,0.3)';
            ctx.fillRect(q.x, q.y + 16, q.w, 6);
            shade(ctx, q, 0.3);
            ctx.fillStyle = 'rgba(255,255,255,0.16)';
            ctx.fillRect(q.x, q.y, q.w, 2);
        },
        neon(ctx, b) {
            const q = b.parts[0];
            ctx.fillStyle = b.color;
            ctx.fillRect(q.x, q.y, q.w, q.h);
            const paths = windowsPath(ctx, b, q.x + 6, q.y + 14, q.w - 12, q.h - 30, 12, 16, 5, 7, 0.7);
            fillWindows(ctx, paths, b.neon, 'rgba(255,255,255,0.03)', 0);
            ctx.strokeStyle = b.neon;
            ctx.beginPath();
            ctx.moveTo(q.x + q.w / 2, q.y);
            ctx.lineTo(q.x + q.w / 2, q.y - 40);
            ctx.lineWidth = 2;
            ctx.stroke();
            ctx.save();
            ctx.shadowColor = b.neon;
            ctx.shadowBlur = 16;
            ctx.lineWidth = 2;
            ctx.strokeRect(q.x + 1, q.y + 1, q.w - 2, q.h);
            ctx.restore();
        },
        platform(ctx, b) {
            const q = b.parts[0];
            const g = ctx.createLinearGradient(0, q.y + q.h, 0, q.y + q.h + 120);
            g.addColorStop(0, rgba(hexToRgb(b.neon), 0.35));
            g.addColorStop(1, rgba(hexToRgb(b.neon), 0));
            ctx.fillStyle = g;
            ctx.beginPath();
            ctx.moveTo(q.x + 12, q.y + q.h);
            ctx.lineTo(q.x + q.w - 12, q.y + q.h);
            ctx.lineTo(q.x + q.w * 0.7, q.y + q.h + 120);
            ctx.lineTo(q.x + q.w * 0.3, q.y + q.h + 120);
            ctx.fill();
            for (const t of b.deco.trees) {
                const x = q.x + t * q.w;
                ctx.fillStyle = '#3a1d4a';
                ctx.fillRect(x - 1.5, q.y - 16, 3, 16);
                ctx.fillStyle = '#2bd6a0';
                ctx.beginPath();
                ctx.arc(x, q.y - 22, 11, 0, TAU);
                ctx.arc(x + 7, q.y - 16, 8, 0, TAU);
                ctx.arc(x - 7, q.y - 16, 8, 0, TAU);
                ctx.fill();
            }
            ctx.fillStyle = b.color;
            ctx.beginPath();
            ctx.moveTo(q.x, q.y);
            ctx.lineTo(q.x + q.w, q.y);
            ctx.lineTo(q.x + q.w - 12, q.y + q.h);
            ctx.lineTo(q.x + 12, q.y + q.h);
            ctx.fill();
            ctx.save();
            ctx.shadowColor = b.neon;
            ctx.shadowBlur = 14;
            ctx.strokeStyle = b.neon;
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(q.x, q.y + 1);
            ctx.lineTo(q.x + q.w, q.y + 1);
            ctx.stroke();
            ctx.restore();
        },
        zig(ctx, b) {
            const tiers = b.parts.slice().sort((p, q) => q.y - p.y);
            for (const q of tiers) {
                ctx.fillStyle = b.color;
                ctx.fillRect(q.x, q.y, q.w, GROUND - q.y);
                ctx.fillStyle = '#2bd6a0';
                ctx.fillRect(q.x, q.y - 4, q.w, 5);
                const paths = windowsPath(ctx, b, q.x + 8, q.y + 12, q.w - 16, q.h - 22, 16, 18, 9, 6, 0.5);
                fillWindows(ctx, paths, b.neon, 'rgba(255,255,255,0.03)', 0);
                ctx.save();
                ctx.shadowColor = b.neon;
                ctx.shadowBlur = 12;
                ctx.strokeStyle = b.neon;
                ctx.lineWidth = 1.5;
                ctx.strokeRect(q.x + 1, q.y + 1, q.w - 2, q.h - 2);
                ctx.restore();
            }
        }
    };

    // ---------- Renderer ----------

    function Renderer(canvas) {
        this.canvas = canvas;
        this.ctx = canvas.getContext('2d', { alpha: false });
        this.cam = { x: 0, y: 600, s: 1, zoom: 1, snap: true };
        this.particles = [];
        this.popups = [];
        this.speedLines = [];
        this.shake = 0;
        this.flash = 0;
        this.bestX = null;
        this.reducedMotion = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
        const rnd = V.mulberry32(1234);
        this.stars = Array.from({ length: 160 }, () => ({ u: rnd(), v: rnd(), s: 0.5 + rnd() * 1.4, ph: rnd() * TAU }));
        this.clouds = Array.from({ length: 8 }, () => ({
            u: rnd(), v: 0.08 + rnd() * 0.35, k: 0.6 + rnd() * 0.8, sp: 4 + rnd() * 10,
            puffs: Array.from({ length: 5 }, () => [rnd() * 160 - 80, rnd() * 24 - 12, 30 + rnd() * 40])
        }));
        this.rain = Array.from({ length: 140 }, () => ({ u: rnd(), v: rnd(), l: 0.6 + rnd() * 0.8 }));
        this.motes = Array.from({ length: 46 }, () => ({ u: rnd(), v: rnd(), ph: rnd() * TAU, s: 0.6 + rnd() * 1.6 }));
        this.reset();
        this.resize();
    }

    Renderer.prototype.reset = function () {
        this.particles.length = 0;
        this.popups.length = 0;
        this.trail = [];
        this.scarf = null;
        this.body = { angle: 0, spin: 0, run: 0, tumble: 0 };
        this.rope = { t: 1, retract: null };
        this.cam.snap = true;
        this.shake = 0;
        this.flash = 0;
    };

    Renderer.prototype.resize = function () {
        const w = window.innerWidth, h = window.innerHeight;
        const dpr = Math.min(2, window.devicePixelRatio || 1);
        this.w = w;
        this.h = h;
        this.dpr = dpr;
        this.canvas.width = Math.round(w * dpr);
        this.canvas.height = Math.round(h * dpr);
        this.canvas.style.width = w + 'px';
        this.canvas.style.height = h + 'px';
        this.base = Math.min(h / 1120, w / 760);
        this.cacheScale = Math.min(2, Math.ceil(this.base * dpr * 4) / 4);
        const vg = this.ctx.createRadialGradient(w / 2, h / 2, Math.min(w, h) * 0.35, w / 2, h / 2, Math.hypot(w, h) * 0.6);
        vg.addColorStop(0, 'rgba(0,0,0,0)');
        vg.addColorStop(1, 'rgba(0,0,0,0.42)');
        this.vignette = vg;
    };

    Renderer.prototype.buildingCache = function (b) {
        const scale = this.cacheScale;
        if (b._cache && b._cache.scale === scale) return b._cache;
        let top = Infinity;
        for (const q of b.parts) top = Math.min(top, q.y);
        const x0 = b.x - 12, y0 = top - 190, x1 = b.x + b.w + 12, y1 = GROUND + 2;
        const c = document.createElement('canvas');
        c.width = Math.ceil((x1 - x0) * scale);
        c.height = Math.ceil((y1 - y0) * scale);
        const cx = c.getContext('2d');
        cx.setTransform(scale, 0, 0, scale, -x0 * scale, -y0 * scale);
        (STATIC[b.style] || STATIC.house)(cx, b);
        b._cache = { canvas: c, x: x0, y: y0, w: x1 - x0, h: y1 - y0, scale };
        return b._cache;
    };

    Renderer.prototype.onEvent = function (e, world) {
        const p = world.player;
        const motion = this.reducedMotion ? 0.3 : 1;
        switch (e.type) {
            case 'grapple':
                this.rope.t = 0;
                this.rope.retract = null;
                this.burst(e.anchor.cx, e.anchor.cy, 8, '#ffffff', 220, 0.3);
                break;
            case 'release':
                this.rope.retract = { x: e.anchor.cx, y: e.anchor.cy, t: 0 };
                this.body.spin = clamp((e.speed - 700) / 260, 0, 7);
                break;
            case 'orb':
                this.burst(e.x, e.y, 10, '#ffe066', 260, 0.5);
                this.popup(e.x, e.y - 14, '+' + e.pts, '#ffe066', 15);
                break;
            case 'ring':
                this.burst(e.x, e.y, 26, '#7df9ff', 500, 0.7);
                this.particles.push({ kind: 'wave', x: e.x, y: e.y, life: 0.5, max: 0.5, r: 20, color: '#7df9ff' });
                this.popup(e.x, e.y - 40, 'BOOST +' + e.pts, '#7df9ff', 20);
                this.shake = Math.max(this.shake, 6 * motion);
                break;
            case 'nearmiss':
                this.burst(e.x, e.y, 8, '#ff9f5a', 300, 0.35);
                this.popup(p.x, p.y - 40, 'CLOSE CALL +' + e.pts, '#ff9f5a', 17);
                break;
            case 'land':
                for (let i = 0; i < 10; i++) {
                    this.particles.push({
                        kind: 'dust', x: e.x + (Math.random() - 0.5) * 20, y: e.y - 2,
                        vx: (Math.random() - 0.5) * 220 + p.vx * 0.2, vy: -Math.random() * 90,
                        life: 0.6, max: 0.6, r: 4 + Math.random() * 5
                    });
                }
                this.shake = Math.max(this.shake, Math.min(8, e.v / 200) * motion);
                break;
            case 'crash': {
                const water = e.cause === 'water';
                this.shake = 22 * motion;
                this.flash = water ? 0.25 : 0.55;
                this.body.spin = (Math.random() < 0.5 ? -1 : 1) * (6 + Math.random() * 6);
                const n = water ? 40 : 30;
                for (let i = 0; i < n; i++) {
                    const a = Math.random() * TAU, s = 150 + Math.random() * 600;
                    this.particles.push({
                        kind: water ? 'drop' : 'debris', x: e.x, y: e.y,
                        vx: Math.cos(a) * s * (water ? 0.5 : 1), vy: water ? -200 - Math.random() * 600 : Math.sin(a) * s - 200,
                        life: 1.2 + Math.random(), max: 2.2, r: 2 + Math.random() * 4, rot: Math.random() * 6, vr: (Math.random() - 0.5) * 20,
                        color: water ? '#bfefff' : ['#ffffff', SCARF, '#ffcf6b', '#999999'][i % 4]
                    });
                }
                break;
            }
            case 'district':
                this.flash = Math.max(this.flash, 0.18);
                break;
        }
    };

    Renderer.prototype.burst = function (x, y, n, color, speed, life) {
        for (let i = 0; i < n; i++) {
            const a = Math.random() * TAU, s = speed * (0.3 + Math.random() * 0.7);
            this.particles.push({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: life * (0.5 + Math.random() * 0.5), max: life, color });
        }
    };

    Renderer.prototype.popup = function (x, y, text, color, size) {
        this.popups.push({ x, y, text, color, size, life: 1.1, max: 1.1 });
    };

    Renderer.prototype.update = function (world, dt, simDt) {
        const p = world.player;
        const cam = this.cam;
        const sp = Math.hypot(p.vx, p.vy);
        const zoomTarget = 1 - 0.17 * smooth(500, 2000, sp);
        cam.zoom += (zoomTarget - cam.zoom) * Math.min(1, dt * 1.5);
        cam.s = this.base * cam.zoom;
        const viewW = this.w / cam.s, viewH = this.h / cam.s;
        const tx = p.x + Math.min(viewW * 0.25, 300) + clamp(p.vx * 0.14, -120, 260);
        // Keep the street in frame (buildings are the threat) unless the player climbs near the top edge.
        const ty = Math.min(GROUND + 50 - viewH / 2, p.y + viewH / 2 - 170);
        if (cam.snap) {
            cam.x = tx;
            cam.y = ty;
            cam.snap = false;
        }
        cam.x += (tx - cam.x) * Math.min(1, dt * 6);
        cam.y += (ty - cam.y) * Math.min(1, dt * 4);

        this.shake *= Math.exp(-dt * 7);
        this.flash *= Math.exp(-dt * 5);

        // Player body pose
        const body = this.body;
        if (!p.alive) {
            body.angle += body.spin * simDt;
            body.spin *= Math.exp(-simDt * 1.5);
        } else if (p.anchor) {
            const target = Math.atan2(p.anchor.cy - p.y, p.anchor.cx - p.x) + Math.PI / 2;
            body.angle = angleLerp(body.angle, target, 1 - Math.exp(-simDt * 20));
            body.spin = 0;
        } else if (p.grounded) {
            body.angle = angleLerp(body.angle, 0, 1 - Math.exp(-simDt * 16));
            body.spin = 0;
            body.run += simDt * Math.max(200, p.vx) * 0.035;
        } else if (body.spin > 0.8) {
            body.angle += body.spin * simDt;
            body.spin *= Math.exp(-simDt * 0.5);
        } else {
            body.angle = angleLerp(body.angle, clamp(p.vx * 0.0003, -0.4, 0.4), 1 - Math.exp(-simDt * 4));
        }
        this.rope.t += simDt;
        if (this.rope.retract) {
            this.rope.retract.t += simDt;
            if (this.rope.retract.t > 0.14) this.rope.retract = null;
        }

        // Scarf (verlet ribbon anchored at the neck)
        const neck = this.local(p, body.angle, 0, fig(-17));
        if (!this.scarf) this.scarf = Array.from({ length: 10 }, () => ({ x: neck.x, y: neck.y, px: neck.x, py: neck.y }));
        const sc = this.scarf;
        sc[0].x = neck.x;
        sc[0].y = neck.y;
        const g = 900 * simDt * simDt;
        for (let i = 1; i < sc.length; i++) {
            const n = sc[i];
            const vx = (n.x - n.px) * 0.94, vy = (n.y - n.py) * 0.94;
            n.px = n.x;
            n.py = n.y;
            n.x += vx + Math.sin(world.time * 9 + i) * 0.25;
            n.y += vy + g;
        }
        for (let k = 0; k < 3; k++) {
            for (let i = 1; i < sc.length; i++) {
                const a = sc[i - 1], b = sc[i];
                const dx = b.x - a.x, dy = b.y - a.y, d = Math.hypot(dx, dy) || 1;
                const f = (d - 5.5) / d;
                if (i === 1) {
                    b.x -= dx * f;
                    b.y -= dy * f;
                } else {
                    a.x += dx * f * 0.5;
                    a.y += dy * f * 0.5;
                    b.x -= dx * f * 0.5;
                    b.y -= dy * f * 0.5;
                }
            }
        }

        this.trail.push({ x: p.x, y: p.y, sp });
        if (this.trail.length > 18) this.trail.shift();

        for (const q of this.particles) {
            q.life -= simDt;
            if (q.kind === 'wave') {
                q.r += simDt * 400;
                continue;
            }
            q.vy += (q.kind === 'dust' ? -40 : 1300) * simDt;
            if (q.kind === 'dust') {
                q.vx *= 1 - simDt * 3;
                q.vy *= 1 - simDt * 3;
                q.r += simDt * 14;
            }
            q.x += q.vx * simDt;
            q.y += q.vy * simDt;
            if (q.kind === 'debris') {
                q.rot += q.vr * simDt;
                if (q.y > GROUND) {
                    q.y = GROUND;
                    q.vy *= -0.4;
                    q.vx *= 0.7;
                }
            }
        }
        this.particles = this.particles.filter(q => q.life > 0);
        for (const q of this.popups) {
            q.life -= dt;
            q.y -= dt * 50;
        }
        this.popups = this.popups.filter(q => q.life > 0);

        if (sp > 1300 && p.alive) {
            if (Math.random() < (sp - 1300) / 900) this.speedLines.push({ y: Math.random(), x: 1.1, l: 0.1 + Math.random() * 0.25, life: 1 });
        }
        for (const l of this.speedLines) l.x -= dt * 3.2;
        this.speedLines = this.speedLines.filter(l => l.x + l.l > -0.1);
        this.speed = sp;
    };

    Renderer.prototype.local = function (p, angle, lx, ly) {
        const c = Math.cos(angle), s = Math.sin(angle);
        return { x: p.x + lx * c - ly * s, y: p.y + lx * s + ly * c };
    };

    Renderer.prototype.draw = function (world, opts) {
        const ctx = this.ctx, w = this.w, h = this.h, dpr = this.dpr, cam = this.cam, s = cam.s;
        const pal = paletteAt(cam.x);
        const t = world.time;
        this.pal = pal;
        const groundSY = h / 2 + (GROUND - cam.y) * s;

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.drawSky(ctx, pal, t, groundSY);
        this.drawSkyline(ctx, pal, 0.18, 0.62, 150, 1.25, 11, pal.far);
        this.drawSkyline(ctx, pal, 0.42, 0.8, 110, 0.95, 23, pal.mid);

        let sx = 0, sy = 0;
        if (this.shake > 0.3) {
            sx = (Math.random() - 0.5) * this.shake;
            sy = (Math.random() - 0.5) * this.shake;
        }
        ctx.setTransform(dpr * s, 0, 0, dpr * s, dpr * (w / 2 - cam.x * s + sx), dpr * (h / 2 - cam.y * s + sy));
        const x0 = cam.x - w / 2 / s - 60, x1 = cam.x + w / 2 / s + 60;
        const y0 = cam.y - h / 2 / s - 60, y1 = cam.y + h / 2 / s + 60;
        this.view = { x0, x1, y0, y1 };

        for (const a of world.anchors) if (a.type === 'crane' && a.x > x0 - 400 && a.x < x1 + 400) this.drawCrane(ctx, a);
        this.drawGround(ctx, world, pal, t, x0, x1, y1);
        if (this.bestX !== null && this.bestX > x0 && this.bestX < x1) this.drawBestMarker(ctx, pal, y0);

        for (const b of world.buildings) {
            if (b.x > x1 || b.x + b.w < x0) continue;
            const c = this.buildingCache(b);
            ctx.drawImage(c.canvas, c.x, c.y, c.w, c.h);
            this.drawBuildingLive(ctx, b, t);
        }

        const target = world.player.alive && !world.player.anchor && opts.showTarget ? world.findTarget() : null;
        for (const r of world.rings) if (r.x > x0 && r.x < x1 && !r.taken) this.drawRing(ctx, r, t, pal, true);
        for (const o of world.orbs) if (!o.taken && o.x > x0 && o.x < x1) this.drawOrb(ctx, o, t);
        for (const a of world.anchors) if (a.cx > x0 - 60 && a.cx < x1 + 60) this.drawAnchor(ctx, a, t, pal, a === target);
        if (target) this.drawTargetLine(ctx, world.player, target, pal);
        if (opts.hint) this.drawHint(ctx, opts.hint, world, s, t);

        this.drawTrail(ctx, pal);
        this.drawRope(ctx, world, pal);
        this.drawPlayer(ctx, world.player, pal, t);
        for (const r of world.rings) if (r.x > x0 && r.x < x1 && !r.taken) this.drawRing(ctx, r, t, pal, false);
        this.drawParticles(ctx);
        this.drawPopups(ctx, s);

        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        this.drawWeather(ctx, pal, t);
        this.drawSpeedLines(ctx);
        ctx.fillStyle = this.vignette;
        ctx.fillRect(0, 0, w, h);
        if (this.flash > 0.01) {
            ctx.fillStyle = `rgba(255,255,255,${this.flash})`;
            ctx.fillRect(0, 0, w, h);
        }
    };

    Renderer.prototype.drawSky = function (ctx, pal, t, groundSY) {
        const w = this.w, h = this.h;
        const horizon = clamp(groundSY, h * 0.4, h * 1.6);
        const g = ctx.createLinearGradient(0, horizon - h * 1.1, 0, horizon);
        g.addColorStop(0, rgba(pal.skyTop));
        g.addColorStop(0.55, rgba(pal.skyMid));
        g.addColorStop(1, rgba(pal.skyBot));
        ctx.fillStyle = g;
        ctx.fillRect(0, 0, w, h);

        if (pal.stars > 0.02) {
            const W = w * 1.4;
            ctx.fillStyle = '#ffffff';
            for (const st of this.stars) {
                const x = (((st.u * W - this.cam.x * 0.012) % W) + W) % W - w * 0.2;
                const y = st.v * horizon * 0.75;
                const a = pal.stars * (0.45 + 0.55 * Math.sin(t * 1.7 + st.ph));
                if (a <= 0.02) continue;
                ctx.globalAlpha = a;
                ctx.fillRect(x, y, st.s, st.s);
            }
            ctx.globalAlpha = 1;
        }

        if (pal.aurora > 0.02) {
            ctx.save();
            ctx.globalCompositeOperation = 'lighter';
            const bands = [[0, 240, 255], [255, 43, 214], [157, 255, 0]];
            bands.forEach((c, k) => {
                const baseY = h * (0.12 + k * 0.07);
                const ag = ctx.createLinearGradient(0, baseY - 40, 0, baseY + 90);
                ag.addColorStop(0, rgba(c, 0));
                ag.addColorStop(0.4, rgba(c, 0.16 * pal.aurora));
                ag.addColorStop(1, rgba(c, 0));
                ctx.fillStyle = ag;
                ctx.beginPath();
                for (let x = 0; x <= w + 20; x += 20) {
                    const y = baseY + Math.sin(x * 0.006 + t * 0.4 + k * 2) * 26 + Math.sin(x * 0.013 - t * 0.3) * 12;
                    if (x === 0) ctx.moveTo(x, y - 40);
                    else ctx.lineTo(x, y - 40);
                }
                ctx.lineTo(w + 20, baseY + 120);
                ctx.lineTo(0, baseY + 120);
                ctx.fill();
            });
            ctx.restore();
        }

        if (pal.sunR > 2) {
            const sx = w * pal.sunX, sy = horizon * pal.sunY;
            const r = pal.sunR * this.base;
            const glow = ctx.createRadialGradient(sx, sy, r * 0.5, sx, sy, r * 3.2);
            glow.addColorStop(0, rgba(pal.sun, 0.45));
            glow.addColorStop(1, rgba(pal.sun, 0));
            ctx.fillStyle = glow;
            ctx.fillRect(sx - r * 3.2, sy - r * 3.2, r * 6.4, r * 6.4);
            if (pal.synth < 0.99) {
                ctx.globalAlpha = 1 - pal.synth;
                ctx.fillStyle = rgba(pal.sun);
                ctx.beginPath();
                ctx.arc(sx, sy, r, 0, TAU);
                ctx.fill();
                ctx.globalAlpha = 1;
            }
            if (pal.synth > 0.01) {
                ctx.save();
                ctx.globalAlpha = pal.synth;
                const sg = ctx.createLinearGradient(0, sy - r, 0, sy + r);
                sg.addColorStop(0, '#ffe066');
                sg.addColorStop(1, '#ff2b8a');
                // Retro sun: clip to horizontal bands whose gaps widen toward the bottom.
                ctx.beginPath();
                const scroll = (t * 6) % (r * 0.14);
                let yTop = sy - r;
                for (let i = 0; i < 8; i++) {
                    const gap = sy + r * (0.05 + i * 0.14) + scroll;
                    ctx.rect(sx - r, yTop, r * 2, gap - yTop);
                    yTop = gap + r * (0.02 + i * 0.012);
                }
                ctx.clip();
                ctx.fillStyle = sg;
                ctx.beginPath();
                ctx.arc(sx, sy, r, 0, TAU);
                ctx.fill();
                ctx.restore();
            }
        }

        const W2 = w + 500;
        for (const c of this.clouds) {
            const x = (((c.u * W2 - this.cam.x * 0.05 * this.cam.s - t * c.sp) % W2) + W2) % W2 - 250;
            const y = c.v * horizon;
            ctx.fillStyle = rgba(pal.cloud, 0.11);
            ctx.beginPath();
            for (const [dx, dy, r] of c.puffs) {
                ctx.moveTo(x + dx * c.k * 1.4 + r * c.k * 1.3, y + dy * c.k * 0.5);
                ctx.ellipse(x + dx * c.k * 1.4, y + dy * c.k * 0.5, r * c.k * 1.3, r * c.k * 0.5, 0, 0, TAU);
            }
            ctx.fill();
        }
    };

    Renderer.prototype.drawSkyline = function (ctx, pal, f, scaleK, colW, hMul, layer, color) {
        const w = this.w, h = this.h, cam = this.cam;
        const sl = cam.s * scaleK;
        const cx = cam.x * f;
        const baseY = h / 2 + (GROUND - cam.y) * cam.s * (0.25 + 0.75 * f) - (1 - f) * 60 * this.base;
        const left = cx - w / 2 / sl, right = cx + w / 2 / sl;
        const i0 = Math.floor(left / colW) - 1, i1 = Math.ceil(right / colW) + 1;
        const toX = X => (X - cx) * sl + w / 2;
        const lit = mix(pal.accent, [255, 255, 255], 0.45);
        const shapes = new Path2D();
        const windows = [];
        for (let i = i0; i <= i1; i++) {
            const key = V.districtAt((i * colW) / f).key;
            const r1 = hash(i, layer, 1), r2 = hash(i, layer, 2), r3 = hash(i, layer, 3);
            const bw = colW * (0.55 + 0.45 * r2);
            let hh;
            const xL = toX(i * colW), xR = toX(i * colW + bw);
            switch (key) {
                case 'oldtown': hh = 50 + 110 * r1; break;
                case 'downtown': hh = 90 + 260 * Math.pow(r1, 1.3); break;
                case 'docks': hh = 30 + 70 * r1; break;
                case 'brutalia': hh = 80 + 150 * r1; break;
                default: hh = 100 + 280 * r1;
            }
            hh *= hMul * sl;
            const top = baseY - hh;
            shapes.rect(xL, top, xR - xL, baseY - top + 2);
            const bwS = xR - xL;
            if (key === 'oldtown' && r3 < 0.5) {
                shapes.moveTo(xL, top);
                shapes.lineTo((xL + xR) / 2, top - bwS * 0.45);
                shapes.lineTo(xR, top);
            } else if (key === 'oldtown' && r3 > 0.9) {
                shapes.moveTo(xL + bwS * 0.3, top);
                shapes.lineTo((xL + xR) / 2, top - 90 * sl);
                shapes.lineTo(xR - bwS * 0.3, top);
            } else if (key === 'downtown' && r3 > 0.75) {
                shapes.rect((xL + xR) / 2 - 1, top - 40 * sl, 2, 40 * sl);
            } else if (key === 'docks' && r3 > 0.7) {
                const mx = xL + bwS * 0.3;
                shapes.rect(mx, top - 150 * sl, 5 * sl, 150 * sl);
                shapes.rect(mx - 30 * sl, top - 150 * sl, 140 * sl, 5 * sl);
            } else if (key === 'brutalia' && r3 > 0.55) {
                shapes.rect(xL - 16 * sl, top - 40 * sl, bwS + 32 * sl, 40 * sl);
            } else if (key === 'arcology' && r3 > 0.7) {
                shapes.moveTo(xR, top);
                shapes.arc((xL + xR) / 2, top, bwS / 2, 0, Math.PI, true);
            } else if (key === 'arcology' && r3 < 0.2) {
                shapes.moveTo(xL + bwS * 0.4, top);
                shapes.lineTo((xL + xR) / 2, top - 120 * sl);
                shapes.lineTo(xR - bwS * 0.4, top);
            }
            if (layer > 20 && key !== 'docks') {
                for (let k = 0; k < 14; k++) {
                    if (hash(i, k, 77) < 0.7) continue;
                    const wx = xL + 4 + hash(i, k, 5) * Math.max(0, bwS - 10);
                    const wy = top + 8 + hash(i, k, 9) * Math.max(0, hh - 20);
                    windows.push(wx, wy);
                }
            }
        }
        ctx.fillStyle = rgba(color);
        ctx.fill(shapes);
        ctx.fillRect(0, baseY, w, h - baseY + 2);
        if (windows.length) {
            ctx.fillStyle = rgba(lit, 0.55);
            const ws = Math.max(1.5, 3 * sl);
            for (let k = 0; k < windows.length; k += 2) ctx.fillRect(windows[k], windows[k + 1], ws, ws * 1.3);
        }
        const fg = ctx.createLinearGradient(0, baseY - 260 * sl, 0, baseY);
        fg.addColorStop(0, rgba(pal.fog, 0));
        fg.addColorStop(1, rgba(pal.fog, layer > 20 ? 0.22 : 0.38));
        ctx.fillStyle = fg;
        ctx.fillRect(0, baseY - 260 * sl, w, 260 * sl);
        ctx.fillStyle = rgba(pal.fog, layer > 20 ? 0.12 : 0.22);
        ctx.fillRect(0, baseY, w, h - baseY + 2);
    };

    Renderer.prototype.drawGround = function (ctx, world, pal, t, x0, x1, y1) {
        ctx.fillStyle = rgba(pal.ground);
        ctx.fillRect(x0, GROUND, x1 - x0, Math.max(10, y1 - GROUND));
        // Street lamps, hashed per 180px slot so they stay put.
        const slot = 180;
        for (let i = Math.floor(x0 / slot); i <= Math.ceil(x1 / slot); i++) {
            if (hash(i, 5, 5) < 0.45) continue;
            const x = i * slot + 40;
            if (world.isWater(x)) continue;
            ctx.strokeStyle = 'rgba(0,0,0,0.6)';
            ctx.lineWidth = 3;
            ctx.beginPath();
            ctx.moveTo(x, GROUND);
            ctx.lineTo(x, GROUND - 58);
            ctx.lineTo(x + 12, GROUND - 62);
            ctx.stroke();
            const lg = ctx.createRadialGradient(x + 12, GROUND - 60, 1, x + 12, GROUND - 60, 46);
            lg.addColorStop(0, 'rgba(255,220,150,0.55)');
            lg.addColorStop(1, 'rgba(255,220,150,0)');
            ctx.fillStyle = lg;
            ctx.fillRect(x - 34, GROUND - 106, 92, 92);
        }
        for (const wr of world.waters) {
            if (wr.x1 < x0 || wr.x0 > x1) continue;
            const wg = ctx.createLinearGradient(0, GROUND - 6, 0, GROUND + 160);
            wg.addColorStop(0, '#2f5d63');
            wg.addColorStop(1, '#061416');
            ctx.fillStyle = wg;
            ctx.fillRect(wr.x0, GROUND - 6, wr.x1 - wr.x0, Math.max(160, y1 - GROUND));
            ctx.fillStyle = 'rgba(190,240,240,0.35)';
            for (let k = 0; k < 18; k++) {
                const yy = GROUND + 2 + (k % 6) * 9;
                const xx = wr.x0 + ((hash(k, 3, 3) * (wr.x1 - wr.x0) + t * (20 + k * 3)) % (wr.x1 - wr.x0));
                ctx.fillRect(xx, yy, 14 + (k % 4) * 6, 1.5);
            }
        }
        ctx.fillStyle = rgba(pal.accent, 0.35);
        ctx.fillRect(x0, GROUND, x1 - x0, 2);
    };

    Renderer.prototype.drawBestMarker = function (ctx, pal, y0) {
        const x = this.bestX;
        const g = ctx.createLinearGradient(0, GROUND, 0, y0);
        g.addColorStop(0, 'rgba(255,224,102,0.45)');
        g.addColorStop(1, 'rgba(255,224,102,0)');
        ctx.fillStyle = g;
        ctx.fillRect(x - 3, y0, 6, GROUND - y0);
        ctx.fillStyle = '#ffe066';
        ctx.font = `bold ${14 / this.cam.s}px system-ui, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('BEST ' + Math.round(x / PX_PER_M) + ' m', x, GROUND - 24);
    };

    Renderer.prototype.drawBuildingLive = function (ctx, b, t) {
        if (b.style === 'tower' && b.deco.clock) {
            const q = b.parts[0];
            const cx = q.x + q.w / 2, cy = q.y + 44, r = q.w * 0.3;
            const now = new Date();
            const hr = (now.getHours() % 12 + now.getMinutes() / 60) / 12 * TAU, mn = now.getMinutes() / 60 * TAU;
            ctx.strokeStyle = '#2a1d2e';
            ctx.lineCap = 'round';
            ctx.lineWidth = 2.5;
            ctx.beginPath();
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.sin(hr) * r * 0.5, cy - Math.cos(hr) * r * 0.5);
            ctx.moveTo(cx, cy);
            ctx.lineTo(cx + Math.sin(mn) * r * 0.78, cy - Math.cos(mn) * r * 0.78);
            ctx.stroke();
        } else if (b.style === 'glass' && b.deco.antenna) {
            const top = b.parts[0];
            const a = 0.5 + 0.5 * Math.sin(t * 3 + b.seed);
            ctx.fillStyle = `rgba(255,60,60,${a})`;
            ctx.beginPath();
            ctx.arc(top.x + b.deco.antenna.at * top.w, top.y - b.deco.antenna.h, 3.5, 0, TAU);
            ctx.fill();
        } else if (b.style === 'neon') {
            const q = b.parts[0];
            const k = (Math.sin(t * 0.8 + (b.seed % 100)) * 0.5 + 0.5);
            ctx.fillStyle = b.neon;
            ctx.globalAlpha = 0.9;
            ctx.fillRect(q.x + q.w - 7, q.y + 10 + k * (q.h - 40), 4, 14);
            ctx.globalAlpha = 1;
        } else if (b.style === 'silo') {
            const q = b.parts[0];
            ctx.fillStyle = `rgba(255,80,60,${0.5 + 0.5 * Math.sin(t * 2.5 + b.seed)})`;
            ctx.beginPath();
            ctx.arc(q.x + q.w / 2, q.y - 4, 3, 0, TAU);
            ctx.fill();
        }
    };

    Renderer.prototype.drawCrane = function (ctx, a) {
        const armY = a.y - 80;
        const tx = a.x - a.arm * 0.7;
        ctx.save();
        ctx.globalAlpha = 0.72;
        ctx.strokeStyle = '#c98a2c';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.moveTo(tx - 8, GROUND);
        ctx.lineTo(tx - 8, armY);
        ctx.moveTo(tx + 8, GROUND);
        ctx.lineTo(tx + 8, armY);
        for (let y = GROUND; y > armY; y -= 22) {
            ctx.moveTo(tx - 8, y);
            ctx.lineTo(tx + 8, y - 22);
        }
        ctx.moveTo(tx - a.arm * 0.35, armY);
        ctx.lineTo(a.x + 40, armY);
        ctx.moveTo(tx - a.arm * 0.35, armY + 10);
        ctx.lineTo(a.x + 40, armY + 10);
        for (let x = tx - a.arm * 0.35; x < a.x + 40; x += 20) {
            ctx.moveTo(x, armY);
            ctx.lineTo(x + 10, armY + 10);
            ctx.lineTo(x + 20, armY);
        }
        ctx.moveTo(tx, armY);
        ctx.lineTo(tx, armY - 40);
        ctx.lineTo(a.x + 30, armY);
        ctx.moveTo(tx, armY - 40);
        ctx.lineTo(tx - a.arm * 0.35, armY);
        ctx.stroke();
        ctx.fillStyle = '#7a5520';
        ctx.fillRect(tx - a.arm * 0.35 - 6, armY - 4, 34, 22);
        ctx.fillStyle = '#d9d9d9';
        ctx.fillRect(tx + 10, armY - 2, 20, 16);
        ctx.restore();
    };

    Renderer.prototype.drawAnchor = function (ctx, a, t, pal, targeted) {
        const x = a.cx, y = a.cy;
        ctx.save();
        switch (a.type) {
            case 'balloon': {
                const cols = [['#ff6b6b', '#ffe066'], ['#4dabf7', '#ffffff'], ['#b197fc', '#ffd8a8'], ['#63e6be', '#ff8787'], ['#ffa94d', '#5c7cfa'], ['#f783ac', '#fff3bf']][a.hue];
                ctx.strokeStyle = 'rgba(60,30,30,0.9)';
                ctx.lineWidth = 1;
                ctx.beginPath();
                ctx.moveTo(x - 6, y - 12);
                ctx.lineTo(x - 18, y - 40);
                ctx.moveTo(x + 6, y - 12);
                ctx.lineTo(x + 18, y - 40);
                ctx.stroke();
                ctx.fillStyle = '#7a4a2a';
                ctx.fillRect(x - 7, y - 13, 14, 11);
                const f = 0.6 + 0.4 * Math.sin(t * 13 + a.ph);
                ctx.fillStyle = `rgba(255,170,60,${0.5 * f})`;
                ctx.beginPath();
                ctx.arc(x, y - 30, 6 + f * 3, 0, TAU);
                ctx.fill();
                ctx.fillStyle = cols[0];
                ctx.beginPath();
                ctx.moveTo(x - 14, y - 36);
                ctx.bezierCurveTo(x - 40, y - 60, x - 30, y - 100, x, y - 100);
                ctx.bezierCurveTo(x + 30, y - 100, x + 40, y - 60, x + 14, y - 36);
                ctx.fill();
                ctx.fillStyle = cols[1];
                ctx.beginPath();
                ctx.moveTo(x - 5, y - 36);
                ctx.bezierCurveTo(x - 14, y - 60, x - 10, y - 100, x, y - 100);
                ctx.bezierCurveTo(x + 10, y - 100, x + 14, y - 60, x + 5, y - 36);
                ctx.fill();
                ctx.fillStyle = 'rgba(0,0,0,0.15)';
                ctx.beginPath();
                ctx.moveTo(x + 14, y - 36);
                ctx.bezierCurveTo(x + 40, y - 60, x + 30, y - 100, x, y - 100);
                ctx.bezierCurveTo(x + 18, y - 90, x + 22, y - 60, x + 8, y - 36);
                ctx.fill();
                break;
            }
            case 'drone': {
                ctx.strokeStyle = '#9aa4c4';
                ctx.lineWidth = 1.5;
                ctx.beginPath();
                ctx.moveTo(x, y);
                ctx.lineTo(x, y - 14);
                ctx.moveTo(x - 18, y - 20);
                ctx.lineTo(x + 18, y - 20);
                ctx.stroke();
                ctx.fillStyle = '#1e2440';
                ctx.fillRect(x - 10, y - 24, 20, 8);
                const spin = Math.abs(Math.sin(t * 40 + a.ph));
                ctx.fillStyle = 'rgba(200,220,255,0.55)';
                for (const dx of [-18, 18]) {
                    ctx.beginPath();
                    ctx.ellipse(x + dx, y - 24, 3 + spin * 10, 2, 0, 0, TAU);
                    ctx.fill();
                }
                ctx.fillStyle = Math.sin(t * 6 + a.ph) > 0 ? '#4de1ff' : '#ff4d6d';
                ctx.fillRect(x - 2, y - 22, 4, 3);
                break;
            }
            case 'crane': {
                ctx.strokeStyle = '#3a3a3a';
                ctx.lineWidth = 1.2;
                ctx.beginPath();
                ctx.moveTo(a.x, a.y - 70);
                ctx.lineTo(x, y - 8);
                ctx.stroke();
                ctx.fillStyle = '#ffb347';
                ctx.fillRect(x - 6, y - 10, 12, 6);
                ctx.strokeStyle = '#ffb347';
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(x, y + 2, 5, -Math.PI / 2, Math.PI * 0.9);
                ctx.stroke();
                break;
            }
            case 'beacon': {
                ctx.fillStyle = '#6b6a70';
                ctx.beginPath();
                for (let i = 0; i < 6; i++) {
                    const an = i / 6 * TAU + Math.PI / 6;
                    ctx.lineTo(x + Math.cos(an) * 13, y - 18 + Math.sin(an) * 13);
                }
                ctx.fill();
                ctx.fillStyle = 'rgba(0,0,0,0.25)';
                ctx.fillRect(x - 11, y - 17, 22, 5);
                ctx.fillStyle = `rgba(255,90,54,${0.5 + 0.5 * Math.sin(t * 4 + a.ph)})`;
                ctx.beginPath();
                ctx.arc(x, y - 32, 3.5, 0, TAU);
                ctx.fill();
                ctx.strokeStyle = '#3a3a40';
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(x, y - 6);
                ctx.lineTo(x, y);
                ctx.stroke();
                break;
            }
            case 'ring': {
                const k = Math.abs(Math.cos(t * 1.6 + a.ph));
                ctx.shadowColor = '#00f0ff';
                ctx.shadowBlur = 12;
                ctx.strokeStyle = '#00f0ff';
                ctx.lineWidth = 2.5;
                ctx.beginPath();
                ctx.ellipse(x, y - 18, 4 + k * 14, 16, 0, 0, TAU);
                ctx.stroke();
                ctx.strokeStyle = '#ff2bd6';
                ctx.beginPath();
                ctx.ellipse(x, y - 18, 16, 4 + (1 - k) * 12, 0, 0, TAU);
                ctx.stroke();
                break;
            }
        }
        ctx.restore();
        const pulse = 0.6 + 0.4 * Math.sin(t * 4 + a.ph);
        ctx.fillStyle = rgba(pal.accent, 0.25 * pulse);
        ctx.beginPath();
        ctx.arc(x, y, 9, 0, TAU);
        ctx.fill();
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(x, y, 3, 0, TAU);
        ctx.fill();
        if (targeted) {
            const r = 18 + Math.sin(t * 10) * 2;
            ctx.strokeStyle = rgba(pal.accent);
            ctx.lineWidth = 2.5;
            ctx.save();
            ctx.translate(x, y);
            ctx.rotate(t * 2);
            for (let i = 0; i < 4; i++) {
                ctx.rotate(Math.PI / 2);
                ctx.beginPath();
                ctx.moveTo(r, -6);
                ctx.lineTo(r, -r * 0.35 + 6);
                ctx.moveTo(r, 6);
                ctx.lineTo(r, r * 0.35 - 6);
                ctx.stroke();
                ctx.beginPath();
                ctx.arc(0, 0, r, -0.35, 0.35);
                ctx.stroke();
            }
            ctx.restore();
        }
    };

    Renderer.prototype.drawTargetLine = function (ctx, p, a, pal) {
        ctx.save();
        ctx.strokeStyle = rgba(pal.accent, 0.28);
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 8]);
        ctx.beginPath();
        ctx.moveTo(p.x, p.y);
        ctx.lineTo(a.cx, a.cy);
        ctx.stroke();
        ctx.restore();
    };

    Renderer.prototype.drawHint = function (ctx, hint, world, s, t) {
        const p = world.player;
        const at = { x: p.x, y: p.y - 70 };
        const k = 1 + Math.sin(t * 8) * 0.08;
        ctx.save();
        ctx.translate(at.x, at.y);
        ctx.scale(k / s, k / s);
        ctx.font = '900 22px Unbounded, system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.lineWidth = 5;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.strokeText(hint, 0, 0);
        ctx.fillStyle = '#ffffff';
        ctx.fillText(hint, 0, 0);
        ctx.restore();
    };

    Renderer.prototype.drawOrb = function (ctx, o, t) {
        const y = o.y + Math.sin(t * 3 + o.ph) * 4;
        const g = ctx.createRadialGradient(o.x, y, 1, o.x, y, 16);
        g.addColorStop(0, 'rgba(255,240,170,0.9)');
        g.addColorStop(1, 'rgba(255,200,60,0)');
        ctx.fillStyle = g;
        ctx.fillRect(o.x - 16, y - 16, 32, 32);
        ctx.fillStyle = '#fff6c8';
        ctx.save();
        ctx.translate(o.x, y);
        ctx.rotate(t * 2 + o.ph);
        ctx.beginPath();
        for (let i = 0; i < 4; i++) {
            ctx.lineTo(0, -7);
            ctx.lineTo(2, -2);
            ctx.rotate(Math.PI / 2);
        }
        ctx.fill();
        ctx.restore();
    };

    Renderer.prototype.drawRing = function (ctx, r, t, pal, back) {
        ctx.save();
        ctx.lineWidth = 6;
        ctx.strokeStyle = back ? 'rgba(125,249,255,0.35)' : '#7df9ff';
        ctx.shadowColor = '#7df9ff';
        ctx.shadowBlur = back ? 0 : 16;
        ctx.beginPath();
        ctx.ellipse(r.x, r.cy, 16, r.r, 0, back ? Math.PI / 2 : -Math.PI / 2, back ? Math.PI * 1.5 : Math.PI / 2);
        ctx.stroke();
        if (!back) {
            ctx.shadowBlur = 0;
            ctx.fillStyle = 'rgba(125,249,255,0.9)';
            ctx.font = 'bold 13px system-ui, sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('»', r.x + 2 + Math.sin(t * 6) * 3, r.cy + 4);
        }
        ctx.restore();
    };

    Renderer.prototype.drawRope = function (ctx, world, pal) {
        const p = world.player;
        const hand = this.local(p, this.body.angle, 0, fig(-28));
        let tx, ty;
        if (p.anchor) {
            const k = Math.min(1, this.rope.t / 0.07);
            tx = hand.x + (p.anchor.cx - hand.x) * k;
            ty = hand.y + (p.anchor.cy - hand.y) * k;
        } else if (this.rope.retract) {
            const k = 1 - this.rope.retract.t / 0.14;
            tx = hand.x + (this.rope.retract.x - hand.x) * k;
            ty = hand.y + (this.rope.retract.y - hand.y) * k;
        } else return;
        ctx.save();
        ctx.lineCap = 'round';
        ctx.strokeStyle = rgba(pal.accent, 0.25);
        ctx.lineWidth = 6;
        ctx.beginPath();
        ctx.moveTo(hand.x, hand.y);
        ctx.lineTo(tx, ty);
        ctx.stroke();
        ctx.strokeStyle = '#ffffff';
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.restore();
    };

    Renderer.prototype.drawTrail = function (ctx, pal) {
        const tr = this.trail;
        if (tr.length < 3) return;
        ctx.save();
        ctx.globalCompositeOperation = 'lighter';
        ctx.lineCap = 'round';
        for (let i = 1; i < tr.length; i++) {
            const a = tr[i - 1], b = tr[i];
            const k = i / tr.length;
            const s = smooth(700, 1800, b.sp);
            if (s <= 0.01) continue;
            ctx.strokeStyle = rgba(pal.accent, 0.35 * k * s);
            ctx.lineWidth = 12 * k;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
        }
        ctx.restore();
    };

    Renderer.prototype.drawPlayer = function (ctx, p, pal, t) {
        const sc = this.scarf;
        if (sc) {
            ctx.save();
            ctx.lineCap = 'round';
            ctx.strokeStyle = SCARF;
            for (let i = 1; i < sc.length; i++) {
                ctx.lineWidth = 5 * (1 - i / sc.length) + 1.2;
                ctx.beginPath();
                ctx.moveTo(sc[i - 1].x, sc[i - 1].y);
                ctx.lineTo(sc[i].x, sc[i].y);
                ctx.stroke();
            }
            ctx.restore();
        }

        const body = this.body;
        let arms, legs;
        if (!p.alive) {
            arms = [[2.4, 0.6], [-2.0, -0.8]];
            legs = [[0.6, 0.5], [-0.3, 0.9]];
        } else if (p.anchor) {
            const sway = Math.sin(t * 3) * 0.1;
            arms = [[Math.PI - 0.12, 0], [Math.PI + 0.25, -0.5]];
            legs = [[0.25 + sway, 0.5], [-0.05 + sway, 0.2]];
        } else if (p.grounded) {
            const r = body.run;
            arms = [[Math.sin(r) * 1.0, -0.6], [-Math.sin(r) * 1.0, -0.6]];
            legs = [[-Math.sin(r) * 0.9, Math.max(0, Math.cos(r)) * 1.2], [Math.sin(r) * 0.9, Math.max(0, -Math.cos(r)) * 1.2]];
        } else if (body.spin > 0.8) {
            arms = [[2.6, -1.4], [-2.6, 1.4]];
            legs = [[1.6, -2.3], [1.3, -2.2]];
        } else {
            const v = clamp(p.vy / 900, -1, 1);
            arms = [[2.0 - v * 0.6, 0.3], [-2.0 + v * 0.6, -0.3]];
            legs = [[0.4, 0.5 + v * 0.3], [-0.3, 0.8]];
        }

        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate(body.angle);
        ctx.translate(0, fig(0));
        ctx.scale(PS, PS);
        const col = rgba(pal.player);
        ctx.strokeStyle = col;
        ctx.fillStyle = col;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 3.6;
        const limb = (x, y, a1, a2, l1, l2) => {
            const kx = x + Math.sin(a1) * l1, ky = y + Math.cos(a1) * l1;
            const a = a1 + a2;
            ctx.moveTo(x, y);
            ctx.lineTo(kx, ky);
            ctx.lineTo(kx + Math.sin(a) * l2, ky + Math.cos(a) * l2);
        };
        ctx.beginPath();
        ctx.moveTo(0, -5);
        ctx.lineTo(0, -17);
        for (const [a1, a2] of legs) limb(0, -5, a1, a2, 8.5, 8);
        for (const [a1, a2] of arms) limb(0, -16, a1, a2, 6.5, 6.5);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(0, -23, 5.5, 0, TAU);
        ctx.fill();
        ctx.fillStyle = rgba(pal.accent);
        ctx.fillRect(0.5, -25, 5.5, 2.6);
        ctx.restore();
    };

    Renderer.prototype.drawParticles = function (ctx) {
        for (const q of this.particles) {
            const a = clamp(q.life / q.max, 0, 1);
            if (q.kind === 'spark') {
                ctx.strokeStyle = q.color;
                ctx.globalAlpha = a;
                ctx.lineWidth = 2;
                ctx.beginPath();
                ctx.moveTo(q.x, q.y);
                ctx.lineTo(q.x - q.vx * 0.03, q.y - q.vy * 0.03);
                ctx.stroke();
            } else if (q.kind === 'dust') {
                ctx.globalAlpha = a * 0.4;
                ctx.fillStyle = '#d8d0d0';
                ctx.beginPath();
                ctx.arc(q.x, q.y, q.r, 0, TAU);
                ctx.fill();
            } else if (q.kind === 'wave') {
                ctx.globalAlpha = a;
                ctx.strokeStyle = q.color;
                ctx.lineWidth = 3;
                ctx.beginPath();
                ctx.arc(q.x, q.y, q.r, 0, TAU);
                ctx.stroke();
            } else {
                ctx.globalAlpha = a;
                ctx.fillStyle = q.color;
                ctx.save();
                ctx.translate(q.x, q.y);
                ctx.rotate(q.rot || 0);
                ctx.fillRect(-q.r / 2, -q.r / 2, q.r, q.r);
                ctx.restore();
            }
        }
        ctx.globalAlpha = 1;
    };

    Renderer.prototype.drawPopups = function (ctx, s) {
        ctx.textAlign = 'center';
        for (const q of this.popups) {
            ctx.globalAlpha = clamp(q.life / q.max * 1.5, 0, 1);
            ctx.font = `800 ${q.size / s}px system-ui, sans-serif`;
            ctx.fillStyle = 'rgba(0,0,0,0.5)';
            ctx.fillText(q.text, q.x + 1.5 / s, q.y + 1.5 / s);
            ctx.fillStyle = q.color;
            ctx.fillText(q.text, q.x, q.y);
        }
        ctx.globalAlpha = 1;
    };

    Renderer.prototype.drawWeather = function (ctx, pal, t) {
        const w = this.w, h = this.h;
        if (pal.rain > 0.02) {
            ctx.strokeStyle = `rgba(200,230,240,${0.35 * pal.rain})`;
            ctx.lineWidth = 1;
            ctx.beginPath();
            const drift = this.cam.x * 0.35;
            for (const d of this.rain) {
                const x = (((d.u * (w + 200) - drift - t * 160) % (w + 200)) + w + 200) % (w + 200) - 100;
                const y = ((d.v * h + t * 1100 * d.l) % (h + 40)) - 20;
                ctx.moveTo(x, y);
                ctx.lineTo(x - 5 - Math.min(20, this.speed * 0.01), y + 18 * d.l);
            }
            ctx.stroke();
        }
        if (pal.motes > 0.02) {
            for (const m of this.motes) {
                const x = (((m.u * (w + 100) - this.cam.x * 0.25 + Math.sin(t * 0.5 + m.ph) * 20) % (w + 100)) + w + 100) % (w + 100) - 50;
                const y = m.v * h + Math.sin(t * 0.7 + m.ph * 2) * 16;
                ctx.fillStyle = rgba(pal.accent, pal.motes * (0.25 + 0.35 * Math.sin(t * 2 + m.ph) ** 2));
                ctx.beginPath();
                ctx.arc(x, y, m.s * 1.3, 0, TAU);
                ctx.fill();
            }
        }
    };

    Renderer.prototype.drawSpeedLines = function (ctx) {
        if (!this.speedLines.length) return;
        const w = this.w, h = this.h;
        ctx.strokeStyle = 'rgba(255,255,255,0.22)';
        ctx.lineWidth = 1.5;
        ctx.beginPath();
        for (const l of this.speedLines) {
            ctx.moveTo(l.x * w, l.y * h);
            ctx.lineTo((l.x + l.l) * w, l.y * h);
        }
        ctx.stroke();
    };

    V.Renderer = Renderer;
    V.paletteAt = paletteAt;
})(window.VERTIGO = window.VERTIGO || {});
