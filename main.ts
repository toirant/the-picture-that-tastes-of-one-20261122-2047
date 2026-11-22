// One Strawberry, Glossy and Ripe
// A make.fun bounty entry: draws a single ripe strawberry with a small
// software rasterizer and writes it as a PNG using only the Node stdlib.
//
// Run:  node main.ts            (writes to /output/entry.png)
//       OUTPUT_DIR=/tmp/out node main.ts   (writes to a local temp dir)
import { createHash } from "node:crypto";
import { deflateSync } from "node:zlib";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const W = 900;
const H = 900;

// ---------------------------------------------------------------------------
// Tiny raster helpers
// ---------------------------------------------------------------------------
type RGB = [number, number, number];

const px = new Uint8Array(W * H * 3);

function setPixel(x: number, y: number, c: RGB): void {
  if (x < 0 || x >= W || y < 0 || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function getPixel(x: number, y: number): RGB {
  const i = (y * W + x) * 3;
  return [px[i], px[i + 1], px[i + 2]];
}

function blend(x: number, y: number, c: RGB, a: number): void {
  if (a <= 0) return;
  if (a >= 1) return setPixel(x, y, c);
  const [r, g, b] = getPixel(x, y);
  setPixel(x, y, [
    Math.round(r + (c[0] - r) * a),
    Math.round(g + (c[1] - g) * a),
    Math.round(b + (c[2] - b) * a),
  ]);
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [
    Math.round(lerp(c1[0], c2[0], t)),
    Math.round(lerp(c1[1], c2[1], t)),
    Math.round(lerp(c1[2], c2[2], t)),
  ];
}

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

// Soft filled ellipse (with a feathered edge of `feather` pixels).
function ellipse(
  cx: number,
  cy: number,
  rx: number,
  ry: number,
  c: RGB,
  a: number,
  feather = 1.5,
): void {
  const x0 = Math.max(0, Math.floor(cx - rx - feather));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx + feather));
  const y0 = Math.max(0, Math.floor(cy - ry - feather));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry + feather));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = (x - cx) / rx;
      const dy = (y - cy) / ry;
      const d = dx * dx + dy * dy;
      if (d >= 1 + feather / rx) continue;
      const edge = clamp((1 - d) / (feather / rx), 0, 1);
      blend(x, y, c, a * edge);
    }
  }
}

// ---------------------------------------------------------------------------
// Background: warm cream with a soft radial glow behind the berry
// ---------------------------------------------------------------------------
for (let y = 0; y < H; y++) {
  for (let x = 0; x < W; x++) {
    const dx = (x - 450) / 520;
    const dy = (y - 430) / 520;
    const d = Math.sqrt(dx * dx + dy * dy);
    const glow = clamp(1 - d, 0, 1);
    // Warm cream centre fading to a soft peach edge.
    const base = mix([248, 232, 205], [242, 205, 168], clamp(d * 0.9, 0, 1));
    const lit = mix(base, [255, 246, 226], glow * 0.55);
    setPixel(x, y, lit);
  }
}

// Soft ground shadow under the berry.
ellipse(450, 800, 250, 46, [150, 80, 40], 0.22, 26);
ellipse(450, 798, 205, 34, [140, 70, 35], 0.20, 20);

// ---------------------------------------------------------------------------
// Strawberry body
// ---------------------------------------------------------------------------
// Body outline: t goes 0 (top, shoulders) to 1 (bottom tip).
const TOP = 300;
const BOT = 790;
const CX = 450;

function halfWidth(t: number): number {
  // Wide shoulders, gentle taper to a rounded point at the tip.
  const tt = clamp(t, 0, 1);
  const shoulder = Math.sin(Math.min(tt / 0.5, 1) * Math.PI * 0.5);
  const taper = Math.pow(Math.max(0, 1 - tt), 0.62);
  return 8 + 190 * shoulder * (0.05 + 0.95 * taper) * (1 - 0.25 * tt * tt);
}

function bodyAt(x: number, y: number): number {
  // Returns 1 inside the body, 0 outside, feathered at the edge.
  if (y < TOP - 4 || y > BOT + 4) return 0;
  const t = clamp((y - TOP) / (BOT - TOP), 0, 1);
  const hw = halfWidth(t);
  const d = Math.abs(x - CX) / hw;
  if (d >= 1.02) return 0;
  if (d <= 0.985) return 1;
  return clamp((1.02 - d) / 0.035, 0, 1);
}

// Seed positions, laid out in gentle curved rows across the body.
type Seed = { x: number; y: number; s: number; rot: number };
const seeds: Seed[] = [];
for (let row = 0; row < 9; row++) {
  const t = 0.10 + row * 0.095;
  const y = TOP + t * (BOT - TOP);
  const hw = halfWidth(t) * 0.86;
  const count = 3 + Math.floor(hw / 52);
  for (let k = 0; k < count; k++) {
    const f = count === 1 ? 0 : (k / (count - 1)) * 2 - 1;
    // Alternate rows are offset so seeds sit in a honeycomb pattern.
    const off = row % 2 === 0 ? 0 : 0.5 / Math.max(count - 1, 1);
    const fx = clamp(f + off * (Math.abs(f) < 0.9 ? 1 : 0), -0.95, 0.95);
    const x = CX + fx * hw;
    const s = 7.5 + (1 - Math.abs(fx)) * 2.5;
    seeds.push({ x, y, s, rot: fx * 0.55 });
  }
}

function seedAt(x: number, y: number): number {
  // 1 inside a seed, 0 outside, feathered.
  for (const sd of seeds) {
    const dx = x - sd.x;
    const dy = y - sd.y;
    const c = Math.cos(sd.rot);
    const s = Math.sin(sd.rot);
    const rx = dx * c + dy * s;
    const ry = -dx * s + dy * c;
    const d = (rx * rx) / (sd.s * sd.s) + (ry * ry) / ((sd.s * 1.55) * (sd.s * 1.55));
    if (d < 1.15) return clamp((1.15 - d) / 0.3, 0, 1);
  }
  return 0;
}

const RED_DEEP: RGB = [178, 18, 28];
const RED_MID: RGB = [222, 52, 48];
const RED_BRIGHT: RGB = [244, 96, 74];
const RED_GLOW: RGB = [255, 138, 105];

for (let y = TOP - 6; y <= BOT + 6; y++) {
  for (let x = CX - 235; x <= CX + 235; x++) {
    const inside = bodyAt(x, y);
    if (inside <= 0) continue;
    const t = clamp((y - TOP) / (BOT - TOP), 0, 1);
    const nx = (x - CX) / halfWidth(t); // -1..1 across the body
    // Light from the upper left: bright near (-0.45, 0.25), deep at the edges.
    const lx = -0.45;
    const ly = 0.22;
    const dl = Math.sqrt((nx - lx) * (nx - lx) + (t - ly) * (t - ly) * 1.6);
    let col = mix(RED_BRIGHT, RED_DEEP, clamp(dl * 0.85, 0, 1));
    col = mix(col, RED_GLOW, clamp(1 - dl * 1.5, 0, 1) * 0.55);
    // Ripen toward a deeper red near the tip.
    col = mix(col, [196, 26, 34], t * t * 0.35);
    // Seeds: pale golden pits with a warm shadow rim.
    const sd = seedAt(x, y);
    if (sd > 0) {
      const pit = mix([214, 168, 92], [244, 214, 140], clamp(1 - dl, 0, 1) * 0.5);
      col = mix(col, pit, sd * 0.92);
    }
    blend(x, y, col, inside);
  }
}

// Glossy highlight: a soft diagonal shine on the upper-left shoulder.
ellipse(368, 392, 66, 118, [255, 214, 190], 0.34, 34);
ellipse(352, 372, 34, 62, [255, 236, 214], 0.42, 20);
ellipse(338, 348, 15, 30, [255, 248, 238], 0.55, 10);
// A faint second sheen low on the right, as if light bounces off the table.
ellipse(560, 640, 42, 84, [255, 160, 130], 0.14, 26);

// Warm rim light along the body's right edge, and a deeper shade at the tip,
// so the berry lifts off the background instead of sitting flat.
for (let y = TOP + 40; y <= BOT; y++) {
  const t = clamp((y - TOP) / (BOT - TOP), 0, 1);
  const hw = halfWidth(t);
  const rimX = Math.round(CX + hw * 0.97);
  const strength = 0.5 * (1 - Math.abs(t - 0.45));
  blend(rimX, y, [255, 120, 88], strength * 0.55);
  blend(rimX - 1, y, [255, 120, 88], strength * 0.3);
  blend(rimX + 1, y, [255, 120, 88], strength * 0.3);
  // Deepen the very tip so the point reads rounded, not cut off.
  if (t > 0.9) {
    const tipShade = (t - 0.9) / 0.1;
    const x0 = Math.round(CX - hw * 0.5);
    const x1 = Math.round(CX + hw * 0.5);
    for (let x = x0; x <= x1; x++) {
      if (bodyAt(x, y) > 0) blend(x, y, [150, 14, 24], tipShade * 0.25);
    }
  }
}

// ---------------------------------------------------------------------------
// Calyx: green sepals fanning over the top of the berry
// ---------------------------------------------------------------------------
function leaf(x0: number, y0: number, x1: number, y1: number, w: number, c: RGB): void {
  // A tapered leaf drawn as a filled triangle strip from base to tip.
  const dx = x1 - x0;
  const dy = y1 - y0;
  const len = Math.sqrt(dx * dx + dy * dy);
  const ux = dx / len;
  const uy = dy / len;
  const pxn = -uy;
  const pyn = ux;
  const steps = Math.ceil(len);
  for (let i = 0; i <= steps; i++) {
    const f = i / steps;
    const bx = x0 + dx * f;
    const by = y0 + dy * f;
    const half = w * Math.sin(Math.PI * Math.pow(f, 0.7)) * (1 - f * 0.25);
    for (let o = -half; o <= half; o += 1) {
      blend(Math.round(bx + pxn * o), Math.round(by + pyn * o), c, 0.96);
    }
  }
}

const GREEN: RGB = [46, 125, 52];
const GREEN_LIGHT: RGB = [86, 168, 74];
const GREEN_DARK: RGB = [30, 92, 38];

leaf(450, 316, 300, 268, 26, GREEN_DARK);
leaf(450, 316, 372, 238, 26, GREEN);
leaf(450, 316, 450, 222, 28, GREEN_LIGHT);
leaf(450, 316, 528, 238, 26, GREEN);
leaf(450, 316, 600, 268, 26, GREEN_DARK);
leaf(450, 316, 338, 306, 20, GREEN);
leaf(450, 316, 562, 306, 20, GREEN);
// Centre rosette where the leaves meet.
ellipse(450, 312, 42, 20, GREEN_LIGHT, 1, 8);
ellipse(450, 308, 26, 12, GREEN, 1, 6);

// Stem, leaning slightly right, with a warm highlight.
for (let i = 0; i <= 60; i++) {
  const f = i / 60;
  const sx = 450 + f * 26;
  const sy = 306 - f * 62;
  ellipse(sx, sy, 7 - f * 2, 7 - f * 2, [96, 74, 44], 1, 3);
  ellipse(sx - 2, sy, 2.5, 3.5, [150, 120, 80], 0.8, 2);
}

// A few juice droplets catching the light on the skin.
ellipse(520, 470, 7, 10, [255, 220, 200], 0.75, 4);
ellipse(396, 560, 6, 8, [255, 220, 200], 0.7, 4);
ellipse(492, 690, 5, 7, [255, 210, 190], 0.65, 3);

// ---------------------------------------------------------------------------
// PNG encoding (stdlib only: node:zlib deflate + hand-rolled CRC32)
// ---------------------------------------------------------------------------
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}
function crc32(buf: Buffer): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  }
  return (c ^ 0xffffffff) >>> 0;
}
function chunk(type: string, data: Buffer): Buffer {
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  out.write(type, 4, "ascii");
  data.copy(out, 8);
  const crc = crc32(Buffer.concat([Buffer.from(type, "ascii"), data]));
  out.writeUInt32BE(crc, 8 + data.length);
  return out;
}

function writePng(path: string): void {
  const raw = Buffer.alloc(H * (1 + W * 3));
  for (let y = 0; y < H; y++) {
    raw[y * (1 + W * 3)] = 0; // filter: none
    raw.set(px.subarray(y * W * 3, (y + 1) * W * 3), y * (1 + W * 3) + 1);
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(W, 0);
  ihdr.writeUInt32BE(H, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type: truecolour RGB
  const png = Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw, { level: 9 })),
    chunk("IEND", Buffer.alloc(0)),
  ]);
  writeFileSync(path, png);
  const hash = createHash("sha256").update(png).digest("hex");
  console.log(`wrote ${path} (${png.length} bytes, ${W}x${H}, sha256 ${hash.slice(0, 16)}...)`);
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------
const outDir = process.env.OUTPUT_DIR || "/output";
mkdirSync(outDir, { recursive: true });
writePng(join(outDir, "entry.png"));
