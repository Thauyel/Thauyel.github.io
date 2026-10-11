// Procedural neon icons for weapons, passives, relics, ships and pickups.
// Rendered once to data URLs for the DOM UI.

import {WEAPONS, EVOLVED, PASSIVES, RELICS, SHIPS} from './content.js';

const TAU = Math.PI * 2;

function poly(c, pts) {
    c.beginPath();
    pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y)));
    c.closePath();
}

function star(c, x, y, r1, r2, n, rot = -Math.PI / 2) {
    const pts = [];
    for (let i = 0; i < n * 2; i++) {
        const r = i % 2 ? r2 : r1, a = rot + (i / (n * 2)) * TAU;
        pts.push([x + Math.cos(a) * r, y + Math.sin(a) * r]);
    }
    poly(c, pts);
}

// Each glyph draws in a 100x100 box centred on (50, 50) using the current
// stroke/fill style.
const GLYPHS = {
    pulse(c) {
        for (let i = 0; i < 3; i++) {
            c.beginPath();
            c.arc(28 + i * 20, 50, 7 - i, 0, TAU);
            c.fill();
        }
        c.beginPath();
        c.moveTo(12, 50);
        c.lineTo(82, 50);
        c.stroke();
    },
    lash(c) {
        c.beginPath();
        c.arc(30, 70, 50, -1.25, -0.1);
        c.stroke();
        c.beginPath();
        c.arc(30, 70, 36, -1.1, -0.15);
        c.stroke();
    },
    missile(c) {
        poly(c, [[80, 20], [62, 52], [48, 38]]);
        c.fill();
        poly(c, [[62, 52], [32, 82], [18, 68], [48, 38]]);
        c.stroke();
        c.beginPath();
        c.moveTo(24, 76);
        c.lineTo(12, 88);
        c.stroke();
    },
    orbit(c) {
        c.beginPath();
        c.arc(50, 50, 30, 0, TAU);
        c.stroke();
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * TAU - 0.5, x = 50 + Math.cos(a) * 30, y = 50 + Math.sin(a) * 30;
            poly(c, [[x, y - 10], [x + 7, y], [x, y + 10], [x - 7, y]]);
            c.fill();
        }
        c.beginPath();
        c.arc(50, 50, 6, 0, TAU);
        c.fill();
    },
    arc(c) {
        poly(c, [[58, 10], [30, 54], [48, 54], [38, 90], [72, 42], [54, 42], [66, 10]]);
        c.fill();
    },
    blade(c) {
        star(c, 50, 50, 38, 10, 4, 0.4);
        c.fill();
        c.beginPath();
        c.arc(50, 50, 6, 0, TAU);
        c.globalCompositeOperation = 'destination-out';
        c.fill();
        c.globalCompositeOperation = 'source-over';
    },
    nova(c) {
        for (const r of [12, 24, 36]) {
            c.beginPath();
            c.arc(50, 50, r, 0, TAU);
            c.stroke();
        }
        c.beginPath();
        c.arc(50, 50, 6, 0, TAU);
        c.fill();
    },
    mine(c) {
        c.beginPath();
        c.arc(50, 50, 18, 0, TAU);
        c.fill();
        for (let i = 0; i < 8; i++) {
            const a = (i / 8) * TAU;
            c.beginPath();
            c.moveTo(50 + Math.cos(a) * 24, 50 + Math.sin(a) * 24);
            c.lineTo(50 + Math.cos(a) * 36, 50 + Math.sin(a) * 36);
            c.stroke();
        }
    },
    laser(c) {
        c.save();
        c.lineWidth *= 2.2;
        c.beginPath();
        c.moveTo(14, 80);
        c.lineTo(86, 20);
        c.stroke();
        c.restore();
        star(c, 22, 74, 18, 4, 4, 0);
        c.fill();
    },
    drone(c) {
        poly(c, [[80, 50], [40, 30], [48, 50], [40, 70]]);
        c.fill();
        poly(c, [[38, 24], [18, 14], [22, 24], [18, 34]]);
        c.fill();
        poly(c, [[38, 76], [18, 66], [22, 76], [18, 86]]);
        c.fill();
    },
    shard(c) {
        poly(c, [[50, 12], [64, 46], [50, 88], [36, 46]]);
        c.fill();
        c.beginPath();
        c.arc(50, 60, 34, Math.PI * 1.05, Math.PI * 1.95);
        c.stroke();
    },
    cryo(c) {
        for (let i = 0; i < 3; i++) {
            const a = (i / 3) * Math.PI;
            const dx = Math.cos(a) * 36, dy = Math.sin(a) * 36;
            c.beginPath();
            c.moveTo(50 - dx, 50 - dy);
            c.lineTo(50 + dx, 50 + dy);
            c.stroke();
            for (const s of [-1, 1]) {
                const bx = 50 + dx * 0.6 * s, by = 50 + dy * 0.6 * s;
                const pa = a + (s > 0 ? 0 : Math.PI);
                c.beginPath();
                c.moveTo(bx, by);
                c.lineTo(bx + Math.cos(pa + 0.7) * 12, by + Math.sin(pa + 0.7) * 12);
                c.moveTo(bx, by);
                c.lineTo(bx + Math.cos(pa - 0.7) * 12, by + Math.sin(pa - 0.7) * 12);
                c.stroke();
            }
        }
    },
    gear(c) {
        star(c, 50, 50, 36, 28, 10);
        c.stroke();
        c.beginPath();
        c.moveTo(50, 50);
        c.lineTo(50, 30);
        c.moveTo(50, 50);
        c.lineTo(64, 58);
        c.stroke();
    },
    battery(c) {
        c.strokeRect(28, 22, 44, 64);
        c.fillRect(42, 12, 16, 10);
        c.fillRect(36, 52, 28, 26);
        c.fillRect(36, 34, 28, 12);
    },
    waves(c) {
        for (const r of [14, 28, 42]) {
            c.beginPath();
            c.arc(50, 72, r, -2.4, -0.74);
            c.stroke();
        }
        c.beginPath();
        c.arc(50, 72, 6, 0, TAU);
        c.fill();
    },
    chevrons(c) {
        for (const x of [22, 46]) {
            c.beginPath();
            c.moveTo(x, 24);
            c.lineTo(x + 26, 50);
            c.lineTo(x, 76);
            c.stroke();
        }
    },
    hourglass(c) {
        poly(c, [[26, 16], [74, 16], [50, 50], [74, 84], [26, 84], [50, 50]]);
        c.stroke();
        poly(c, [[38, 76], [62, 76], [50, 60]]);
        c.fill();
    },
    stack(c) {
        for (let i = 0; i < 3; i++) c.fillRect(22, 22 + i * 22, 56, 12);
    },
    shield(c) {
        c.beginPath();
        c.moveTo(50, 12);
        c.lineTo(82, 24);
        c.quadraticCurveTo(80, 70, 50, 90);
        c.quadraticCurveTo(20, 70, 18, 24);
        c.closePath();
        c.stroke();
    },
    hexplus(c) {
        const pts = [];
        for (let i = 0; i < 6; i++) pts.push([50 + Math.cos((i / 6) * TAU) * 36, 50 + Math.sin((i / 6) * TAU) * 36]);
        poly(c, pts);
        c.stroke();
        c.fillRect(44, 32, 12, 36);
        c.fillRect(32, 44, 36, 12);
    },
    cross(c) {
        c.fillRect(40, 16, 20, 68);
        c.fillRect(16, 40, 68, 20);
    },
    flame(c) {
        c.beginPath();
        c.moveTo(50, 10);
        c.quadraticCurveTo(80, 50, 64, 80);
        c.quadraticCurveTo(50, 92, 36, 80);
        c.quadraticCurveTo(20, 50, 50, 10);
        c.fill();
    },
    magnet(c) {
        c.save();
        c.lineWidth *= 2.4;
        c.beginPath();
        c.arc(50, 46, 24, Math.PI, 0);
        c.lineTo(74, 80);
        c.moveTo(26, 46);
        c.lineTo(26, 80);
        c.stroke();
        c.restore();
    },
    dice(c) {
        c.strokeRect(20, 20, 60, 60);
        for (const [x, y] of [[34, 34], [66, 34], [50, 50], [34, 66], [66, 66]]) {
            c.beginPath();
            c.arc(x, y, 6, 0, TAU);
            c.fill();
        }
    },
    siphon(c) {
        c.beginPath();
        c.moveTo(50, 12);
        c.lineTo(50, 60);
        c.stroke();
        poly(c, [[34, 50], [66, 50], [50, 70]]);
        c.fill();
        c.fillRect(20, 78, 60, 10);
    },
    crosshair(c) {
        c.beginPath();
        c.arc(50, 50, 28, 0, TAU);
        c.moveTo(50, 10);
        c.lineTo(50, 34);
        c.moveTo(50, 66);
        c.lineTo(50, 90);
        c.moveTo(10, 50);
        c.lineTo(34, 50);
        c.moveTo(66, 50);
        c.lineTo(90, 50);
        c.stroke();
        c.beginPath();
        c.arc(50, 50, 5, 0, TAU);
        c.fill();
    },
    links(c) {
        c.save();
        c.lineWidth *= 1.6;
        c.beginPath();
        c.ellipse(38, 50, 22, 14, 0, 0, TAU);
        c.stroke();
        c.beginPath();
        c.ellipse(62, 50, 22, 14, 0, 0, TAU);
        c.stroke();
        c.restore();
    },
    twin(c) {
        for (const y of [36, 64]) {
            c.beginPath();
            c.arc(62, y, 9, 0, TAU);
            c.fill();
            c.beginPath();
            c.moveTo(16, y);
            c.lineTo(56, y);
            c.stroke();
        }
    },
    glass(c) {
        poly(c, [[50, 10], [80, 50], [50, 90], [20, 50]]);
        c.stroke();
        c.beginPath();
        c.moveTo(50, 10);
        c.lineTo(44, 40);
        c.lineTo(58, 52);
        c.lineTo(48, 90);
        c.stroke();
    },
    kinetic(c) {
        c.beginPath();
        c.arc(42, 50, 22, 0, TAU);
        c.stroke();
        poly(c, [[90, 50], [70, 36], [70, 64]]);
        c.fill();
        c.beginPath();
        c.moveTo(14, 50);
        c.lineTo(72, 50);
        c.stroke();
    },
    burst(c) {
        star(c, 50, 50, 40, 14, 8);
        c.fill();
    },
    gem(c) {
        poly(c, [[50, 12], [78, 40], [50, 88], [22, 40]]);
        c.fill();
        c.globalAlpha = 0.5;
        poly(c, [[22, 40], [78, 40], [50, 12]]);
        c.globalCompositeOperation = 'destination-out';
        c.fill();
        c.globalCompositeOperation = 'source-over';
        c.globalAlpha = 1;
    },
    heart(c) {
        c.beginPath();
        c.moveTo(50, 84);
        c.bezierCurveTo(10, 56, 14, 18, 50, 34);
        c.bezierCurveTo(86, 18, 90, 56, 50, 84);
        c.fill();
        c.globalCompositeOperation = 'destination-out';
        c.beginPath();
        c.moveTo(52, 34);
        c.lineTo(44, 52);
        c.lineTo(56, 60);
        c.lineTo(48, 82);
        c.lineWidth = 5;
        c.stroke();
        c.globalCompositeOperation = 'source-over';
    },
    phoenix(c) {
        c.beginPath();
        c.moveTo(50, 84);
        c.quadraticCurveTo(14, 60, 12, 20);
        c.quadraticCurveTo(36, 40, 50, 30);
        c.quadraticCurveTo(64, 40, 88, 20);
        c.quadraticCurveTo(86, 60, 50, 84);
        c.fill();
    },
    storm(c) {
        GLYPHS.magnet(c);
        poly(c, [[54, 18], [40, 50], [52, 50], [44, 76], [62, 42], [50, 42], [58, 18]]);
        c.fill();
    },
    clover(c) {
        for (let i = 0; i < 4; i++) {
            const a = (i / 4) * TAU + Math.PI / 4;
            c.beginPath();
            c.arc(50 + Math.cos(a) * 16, 46 + Math.sin(a) * 16, 14, 0, TAU);
            c.fill();
        }
        c.beginPath();
        c.moveTo(50, 50);
        c.quadraticCurveTo(54, 76, 66, 90);
        c.stroke();
    },
    echo(c) {
        for (const r of [10, 24, 38]) {
            c.beginPath();
            c.arc(30, 50, r, -0.9, 0.9);
            c.stroke();
        }
        c.beginPath();
        c.arc(30, 50, 6, 0, TAU);
        c.fill();
    },
    coin(c) {
        c.beginPath();
        c.arc(50, 50, 32, 0, TAU);
        c.fill();
        c.globalCompositeOperation = 'destination-out';
        c.font = 'bold 44px system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('¢', 50, 53);
        c.globalCompositeOperation = 'source-over';
    },
    question(c) {
        c.font = 'bold 64px system-ui, sans-serif';
        c.textAlign = 'center';
        c.textBaseline = 'middle';
        c.fillText('?', 50, 54);
    },
};

const PASSIVE_GLYPH = {
    overclock: 'gear', powercell: 'battery', amplifier: 'waves', velocity: 'chevrons', extender: 'hourglass',
    capacitor: 'stack', plating: 'shield', armor: 'hexplus', repair: 'cross', thrusters: 'flame',
    attractor: 'magnet', dice: 'dice', siphon: 'siphon', targeting: 'crosshair',
};
const RELIC_GLYPH = {
    chain: 'links', twin: 'twin', glass: 'glass', kinetic: 'kinetic', critmass: 'burst', resonance: 'gem',
    laststand: 'heart', dilation: 'hourglass', phoenix: 'phoenix', storm: 'storm', fortune: 'clover',
    frost: 'cryo', echo: 'echo', bulwark: 'shield',
};

function frame(c, size, color, kind) {
    const s = size / 100;
    c.save();
    c.scale(s, s);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    if (kind === 'relic') {
        const pts = [];
        for (let i = 0; i < 6; i++) pts.push([50 + Math.cos((i / 6) * TAU + Math.PI / 6) * 47, 50 + Math.sin((i / 6) * TAU + Math.PI / 6) * 47]);
        poly(c, pts);
    } else {
        c.beginPath();
        c.roundRect(4, 4, 92, 92, kind === 'passive' ? 46 : 18);
    }
    const grad = c.createLinearGradient(0, 0, 0, 100);
    grad.addColorStop(0, 'rgba(255,255,255,0.10)');
    grad.addColorStop(1, 'rgba(0,0,0,0.35)');
    c.fillStyle = 'rgba(8, 4, 20, 0.92)';
    c.fill();
    c.fillStyle = grad;
    c.fill();
    c.lineWidth = kind === 'evolved' ? 6 : 4;
    c.strokeStyle = kind === 'evolved' ? '#ffd36b' : color;
    c.shadowColor = kind === 'evolved' ? '#ffd36b' : color;
    c.shadowBlur = 12;
    c.stroke();
    c.restore();
}

function glyph(c, size, name, color) {
    const s = size / 100;
    c.save();
    // Inset the glyph inside the frame.
    c.translate(size * 0.18, size * 0.18);
    c.scale(s * 0.64, s * 0.64);
    c.lineJoin = 'round';
    c.lineCap = 'round';
    c.lineWidth = 7;
    c.strokeStyle = color;
    c.fillStyle = color;
    c.shadowColor = color;
    c.shadowBlur = 14;
    (GLYPHS[name] || GLYPHS.question)(c);
    c.restore();
}

function canvas(size) {
    const cv = document.createElement('canvas');
    cv.width = cv.height = size;
    return cv;
}

const cache = new Map();

// key examples: 'weapon:pulse', 'weapon:hyperpulse', 'passive:dice', 'relic:echo', 'ship:vanguard', 'misc:heal'
export function icon(key, size = 96) {
    const ck = `${key}@${size}`;
    if (cache.has(ck)) return cache.get(ck);
    const [kind, id] = key.split(':');
    const cv = canvas(size);
    const c = cv.getContext('2d');
    if (kind === 'weapon') {
        const d = WEAPONS[id] || EVOLVED[id];
        const beh = d ? d.behavior : 'question';
        frame(c, size, d ? d.color : '#fff', d && d.evolved ? 'evolved' : 'weapon');
        glyph(c, size, beh, d ? d.color : '#fff');
        if (d && d.evolved) {
            c.save();
            c.fillStyle = '#ffd36b';
            c.shadowColor = '#ffd36b';
            c.shadowBlur = 8;
            star(c, size * 0.8, size * 0.2, size * 0.11, size * 0.045, 4, 0);
            c.fill();
            c.restore();
        }
    } else if (kind === 'passive') {
        const d = PASSIVES[id];
        frame(c, size, d ? d.color : '#fff', 'passive');
        glyph(c, size, PASSIVE_GLYPH[id], d ? d.color : '#fff');
    } else if (kind === 'relic') {
        const d = RELICS[id];
        frame(c, size, d ? d.color : '#fff', 'relic');
        glyph(c, size, RELIC_GLYPH[id], d ? d.color : '#fff');
    } else if (kind === 'ship') {
        const d = SHIPS[id];
        c.save();
        c.translate(size / 2, size / 2);
        c.rotate(-Math.PI / 2);
        const s = size * 0.3;
        poly(c, d.shape.map(([x, y]) => [x * s, y * s]));
        c.fillStyle = 'rgba(8, 4, 20, 0.9)';
        c.fill();
        c.lineWidth = size * 0.035;
        c.lineJoin = 'round';
        c.strokeStyle = d.color;
        c.shadowColor = d.color;
        c.shadowBlur = size * 0.15;
        c.stroke();
        c.stroke();
        c.beginPath();
        c.arc(0, 0, size * 0.05, 0, TAU);
        c.fillStyle = '#fff';
        c.fill();
        c.restore();
    } else {
        const colors = {heal: '#ff5fa2', credits: '#ffd36b', skip: '#9ff4ff', locked: '#666'};
        frame(c, size, colors[id] || '#fff', 'weapon');
        glyph(c, size, id === 'heal' ? 'cross' : id === 'credits' ? 'coin' : 'question', colors[id] || '#fff');
    }
    const url = cv.toDataURL();
    cache.set(ck, url);
    return url;
}

export function itemKey(type, id) {
    if (type === 'weapon' || type === 'evolve') return `weapon:${id}`;
    if (type === 'passive') return `passive:${id}`;
    if (type === 'relic') return `relic:${id}`;
    return `misc:${id}`;
}
