'use strict';
/*
 * Generuje assets/icon.png (256x256, RGBA) bez żadnych zależności.
 * Rysowanie oparte o SDF (capsule/ring), neonowy styl: ciemne tło,
 * cyjanowy pierścień + magentowy symbol ENTER (↵) z poświatą.
 *
 * Uruchamiany automatycznie przez `npm run build` oraz `npm run icon`.
 */
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const SIZE = 256;

// ---- mała matma ----
const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
function segDist(px, py, ax, ay, bx, by) {
  const vx = bx - ax, vy = by - ay;
  const wx = px - ax, wy = py - ay;
  const len2 = vx * vx + vy * vy || 1e-9;
  const t = clamp((wx * vx + wy * vy) / len2, 0, 1);
  const dx = px - (ax + t * vx), dy = py - (ay + t * vy);
  return Math.hypot(dx, dy);
}

// segmenty symbolu ENTER (↵) w przestrzeni 256x256
const ARROW = [
  [176, 60, 176, 150], // pionowa kreska
  [176, 150, 92, 150],  // pozioma kreska
  [92, 150, 122, 122],  // grot góra
  [92, 150, 122, 178],  // grot dół
];
function arrowDist(x, y) {
  let d = Infinity;
  for (const s of ARROW) d = Math.min(d, segDist(x, y, s[0], s[1], s[2], s[3]));
  return d;
}

// zaokrąglony prostokąt (maska tła)
function roundRectInside(x, y, r) {
  const min = r, max = SIZE - r;
  let cx = clamp(x, min, max), cy = clamp(y, min, max);
  return Math.hypot(x - cx, y - cy) <= r;
}

function mix(a, b, t) { return a + (b - a) * t; }

const buf = Buffer.alloc(SIZE * SIZE * 4);

const CYAN = [0, 232, 255];
const MAG = [255, 43, 214];

for (let y = 0; y < SIZE; y++) {
  for (let x = 0; x < SIZE; x++) {
    const i = (y * SIZE + x) * 4;
    const inside = roundRectInside(x + 0.5, y + 0.5, 46);
    if (!inside) { buf[i + 3] = 0; continue; }

    // tło: pionowy gradient + lekki radialny rozjaśnienie
    const gy = y / SIZE;
    let r = mix(10, 22, gy), g = mix(10, 18, gy), b = mix(24, 46, gy);
    const dc = Math.hypot(x - 128, y - 118) / 150;
    const halo = clamp(1 - dc, 0, 1) * 0.18;
    r += 40 * halo; g += 20 * halo; b += 70 * halo;

    // pierścień (cyjan)
    const ringR = 102, ringHalf = 5;
    const dr = Math.abs(Math.hypot(x - 128, y - 128) - ringR);
    if (dr < ringHalf) {
      const t = 1 - dr / ringHalf;
      r = mix(r, CYAN[0], t); g = mix(g, CYAN[1], t); b = mix(b, CYAN[2], t);
    } else {
      const glow = clamp(1 - (dr - ringHalf) / 26, 0, 1) * 0.55;
      r += CYAN[0] * glow * 0.5; g += CYAN[1] * glow * 0.5; b += CYAN[2] * glow * 0.5;
    }

    // strzałka ENTER (magenta)
    const da = arrowDist(x, y);
    const aHalf = 11;
    if (da < aHalf) {
      const t = clamp(1 - da / aHalf, 0, 1);
      r = mix(r, MAG[0], t); g = mix(g, MAG[1], t); b = mix(b, MAG[2], t);
    } else {
      const glow = clamp(1 - (da - aHalf) / 22, 0, 1) * 0.7;
      r += MAG[0] * glow * 0.55; g += MAG[1] * glow * 0.55; b += MAG[2] * glow * 0.55;
    }

    buf[i] = clamp(Math.round(r), 0, 255);
    buf[i + 1] = clamp(Math.round(g), 0, 255);
    buf[i + 2] = clamp(Math.round(b), 0, 255);
    buf[i + 3] = 255;
  }
}

// ---- enkoder PNG ----
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  return t;
})();
function crc32(b) {
  let c = 0xffffffff;
  for (let i = 0; i < b.length; i++) c = CRC_TABLE[(c ^ b[i]) & 0xff] ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const body = Buffer.concat([t, data]);
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([len, body, crc]);
}

const ihdr = Buffer.alloc(13);
ihdr.writeUInt32BE(SIZE, 0); ihdr.writeUInt32BE(SIZE, 4);
ihdr[8] = 8;  // bit depth
ihdr[9] = 6;  // RGBA
ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;

// scanlines z filtrem 0
const raw = Buffer.alloc(SIZE * (SIZE * 4 + 1));
for (let y = 0; y < SIZE; y++) {
  raw[y * (SIZE * 4 + 1)] = 0;
  buf.copy(raw, y * (SIZE * 4 + 1) + 1, y * SIZE * 4, (y + 1) * SIZE * 4);
}
const idat = zlib.deflateSync(raw, { level: 9 });

const png = Buffer.concat([
  Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  chunk('IHDR', ihdr),
  chunk('IDAT', idat),
  chunk('IEND', Buffer.alloc(0)),
]);

const out = path.join(__dirname, '..', 'assets', 'icon.png');
fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, png);
console.log('icon ->', out, '(' + png.length + ' bytes)');
