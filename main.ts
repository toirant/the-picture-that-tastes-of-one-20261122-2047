// One Strawberry — a single glossy ripe strawberry, drawn with a small
// software rasterizer and encoded as a PNG with only the Node stdlib.
//
// Run:  node main.ts            (writes /output/entry.png)
//       OUTPUT_DIR=/tmp/out node main.ts
//
// The picture is one ingredient only: a big ripe strawberry on a warm,
// simple background, lit from the upper left. No text, no props.

import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { deflateSync } from "node:zlib";

// ---------------------------------------------------------------------------
// CRC32 (the PNG chunk checksum), implemented by hand.
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

// ---------------------------------------------------------------------------
// PNG encoder: 8-bit RGB, filter byte 0 on every scanline.
// ---------------------------------------------------------------------------
function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const typeBuf = Buffer.from(type, "ascii");
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuf, data])), 0);
  return Buffer.concat([len, typeBuf, data, crc]);
}

function encodePng(width: number, height: number, rgb: Buffer): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8; // bit depth
  ihdr[9] = 2; // colour type 2 = truecolour RGB
  ihdr[10] = 0; // compression
  ihdr[11] = 0; // filter
  ihdr[12] = 0; // interlace

  // Each scanline is one filter byte (0) followed by width * 3 bytes.
  const raw = Buffer.alloc(height * (1 + width * 3));
  for (let y = 0; y < height; y++) {
    const dst = y * (1 + width * 3);
    raw[dst] = 0;
    rgb.copy(raw, dst + 1, y * width * 3, (y + 1) * width * 3);
  }
  const idat = deflateSync(raw, { level: 9 });
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
  return Buffer.concat([
    signature,
    chunk("IHDR", ihdr),
    chunk("IDAT", idat),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

// ---------------------------------------------------------------------------
// Tiny rasterizer helpers.
// ---------------------------------------------------------------------------
type RGB = [number, number, number];

function clamp(v: number, lo: number, hi: number): number {
  return v < lo ? lo : v > hi ? hi : v;
}

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

function mix(c1: RGB, c2: RGB, t: number): RGB {
  return [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)];
}

/** Smoothstep edge: 1 inside, 0 outside, soft over `soft` pixels. */
function smoothEdge(d: number, soft: number): number {
  const t = clamp(0.5 - d / soft, 0, 1);
  return t * t * (3 - 2 * t);
}

const W = 800;
const H = 800;
const px = new Float32Array(W * H * 3);

function setPixel(x: number, y: number, c: RGB): void {
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = c[0];
  px[i + 1] = c[1];
  px[i + 2] = c[2];
}

function blendPixel(x: number, y: number, c: RGB, alpha: number): void {
  if (alpha <= 0) return;
  if (x < 0 || y < 0 || x >= W || y >= H) return;
  const i = (y * W + x) * 3;
  px[i] = lerp(px[i], c[0], alpha);
  px[i + 1] = lerp(px[i + 1], c[1], alpha);
  px[i + 2] = lerp(px[i + 2], c[2], alpha);
}

/** Fill an ellipse (soft edge) with a solid colour. */
function ellipse(
  cx: number, cy: number, rx: number, ry: number,
  rot: number, c: RGB, alpha = 1,
): void {
  const cos = Math.cos(rot);
  const sin = Math.sin(rot);
  const x0 = Math.max(0, Math.floor(cx - rx - 4));
  const x1 = Math.min(W - 1, Math.ceil(cx + rx + 4));
  const y0 = Math.max(0, Math.floor(cy - ry - 4));
  const y1 = Math.min(H - 1, Math.ceil(cy + ry + 4));
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const u = (dx * cos + dy * sin) / rx;
      const v = (-dx * sin + dy * cos) / ry;
      const d = Math.sqrt(u * u + v * v) - 1;
      const a = smoothEdge(d, 0.02) * alpha;
      if (a > 0) blendPixel(x, y, c, a);
    }
  }
}

// ---------------------------------------------------------------------------
// Background: warm cream, gently darker toward the edges.
// ---------------------------------------------------------------------------
const BG_TOP: RGB = [253, 238, 214];
const BG_BOTTOM: RGB = [240, 205, 160];
for (let y = 0; y < H; y++) {
  const t = y / (H - 1);
  const row = mix(BG_TOP, BG_BOTTOM, t * t * 0.9 + t * 0.1);
  for (let x = 0; x < W; x++) {
    // Soft vignette: darken the corners a touch so the eye stays central.
    const dx = (x - W / 2) / (W / 2);
    const dy = (y - H / 2) / (H / 2);
    const r = Math.sqrt(dx * dx + dy * dy);
    const vig = 1 - 0.10 * clamp((r - 0.55) / 0.45, 0, 1);
    setPixel(x, y, [row[0] * vig, row[1] * vig, row[2] * vig]);
  }
}

// ---------------------------------------------------------------------------
// Warm glow behind the berry, so it pops off the cream background.
// ---------------------------------------------------------------------------
ellipse(400, 420, 330, 330, 0, [255, 226, 170], 0.35);
ellipse(400, 420, 290, 290, 0, [255, 232, 185], 0.30);

// ---------------------------------------------------------------------------
// Soft shadow under the berry.
// ---------------------------------------------------------------------------
ellipse(400, 668, 235, 42, 0, [120, 70, 35], 0.28);
ellipse(400, 664, 190, 30, 0, [120, 70, 35], 0.22);

// ---------------------------------------------------------------------------
// The strawberry body: a wide heart shape, widest near the top, tapering
// to a rounded point at the bottom. Signed distance in normalised space.
// ---------------------------------------------------------------------------
const BODY_CX = 400;
const BODY_CY = 430;
const BODY_RX = 255;
const BODY_RY = 265;

/** >0 inside the berry, 0 on its edge, <0 outside (normalised units). */
function berryInside(nx: number, ny: number): number {
  // Heart-ish profile: shoulders bulge near the top, tip at the bottom.
  const y = ny; // -1 top .. +1 bottom
  const shoulder = 1 - 0.28 * Math.max(0, -y) * Math.max(0, -y);
  const taper = 1 - 0.55 * Math.pow(Math.max(0, y), 1.6);
  const w = shoulder * taper;
  const d = Math.sqrt((nx / w) * (nx / w) + y * y) - 1;
  return -d;
}

const RED_DEEP: RGB = [168, 18, 32];
const RED_MID: RGB = [214, 38, 48];
const RED_BRIGHT: RGB = [238, 92, 66];
const RED_DARK: RGB = [120, 10, 24];

for (let y = 150; y < 700; y++) {
  for (let x = 120; x < 680; x++) {
    const nx = (x + 0.5 - BODY_CX) / BODY_RX;
    const ny = (y + 0.5 - BODY_CY) / BODY_RY;
    const inside = berryInside(nx, ny);
    if (inside <= -0.02) continue;
    // Warm light from the upper left: bright there, deep red at the edges.
    // Three-stop gradient: deep red in shadow, mid red, bright lit red.
    const light = clamp(0.5 - nx * 0.55 - ny * 0.25, 0, 1);
    let c = light < 0.5
      ? mix(RED_DEEP, RED_MID, light * 2)
      : mix(RED_MID, RED_BRIGHT, (light - 0.5) * 2);
    // Darken the rim for roundness.
    const rim = clamp(inside / 0.25, 0, 1);
    c = mix(RED_DARK, c, rim);
    // A faint vertical sheen down the lit side.
    const sheen = Math.exp(-Math.pow((nx + 0.45) * 3.2, 2)) * 0.25;
    c = mix(c, [255, 150, 120], sheen * clamp(light, 0, 1));
    const a = smoothEdge(-inside, 0.03);
    blendPixel(x, y, c, a);
  }
}

// ---------------------------------------------------------------------------
// Seeds: pale achenes dotted over the berry in gentle rows.
// ---------------------------------------------------------------------------
function seedAt(sx: number, sy: number, scale: number, rot: number): void {
  // Seed sits only where the berry surface is.
  const nx = (sx - BODY_CX) / BODY_RX;
  const ny = (sy - BODY_CY) / BODY_RY;
  if (berryInside(nx, ny) < 0.06) return;
  // Pale gold pit with a darker rim.
  ellipse(sx, sy, 9 * scale, 13 * scale, rot, [214, 150, 60], 0.9);
  ellipse(sx, sy - 1, 6.5 * scale, 10 * scale, rot, [250, 226, 150], 0.95);
  ellipse(sx - 1, sy - 3, 2.5 * scale, 4 * scale, rot, [255, 244, 200], 0.9);
}

const seedRows = [
  { y: 300, n: 4, s: 0.85 },
  { y: 345, n: 5, s: 0.95 },
  { y: 395, n: 6, s: 1.0 },
  { y: 445, n: 6, s: 1.0 },
  { y: 495, n: 5, s: 0.95 },
  { y: 545, n: 4, s: 0.9 },
  { y: 590, n: 3, s: 0.8 },
];
for (const row of seedRows) {
  for (let i = 0; i < row.n; i++) {
    const t = row.n === 1 ? 0.5 : i / (row.n - 1);
    const sx = 400 + (t - 0.5) * 2 * (BODY_RX * 0.72) * (1 - Math.abs(row.y - 430) / 900);
    const sy = row.y + (i % 2 === 0 ? 3 : -3);
    const rot = (sx - 400) / 400 * 0.5;
    seedAt(sx, sy, row.s, rot);
  }
}

// ---------------------------------------------------------------------------
// Gloss: two soft white highlights on the lit upper-left shoulder.
// ---------------------------------------------------------------------------
ellipse(318, 300, 62, 34, -0.6, [255, 255, 255], 0.55);
ellipse(292, 330, 30, 16, -0.6, [255, 255, 255], 0.45);
ellipse(470, 265, 26, 14, 0.4, [255, 235, 220], 0.30);

// ---------------------------------------------------------------------------
// Calyx: green leaflets fanning over the top of the berry, plus a stem.
// ---------------------------------------------------------------------------
const LEAF: RGB = [46, 125, 50];
const LEAF_LIGHT: RGB = [86, 168, 74];
const LEAF_DARK: RGB = [28, 84, 32];

// Stem first (behind the leaves).
ellipse(400, 158, 9, 30, 0.12, [74, 110, 52], 1);

// Five pointed leaflets, fanning out from the crown.
const leaflets = [
  { cx: 400, cy: 196, rx: 26, ry: 62, rot: 0.0 },
  { cx: 330, cy: 206, rx: 24, ry: 56, rot: -0.75 },
  { cx: 470, cy: 206, rx: 24, ry: 56, rot: 0.75 },
  { cx: 300, cy: 220, rx: 20, ry: 44, rot: -1.05 },
  { cx: 500, cy: 220, rx: 20, ry: 44, rot: 1.05 },
];
for (const leaf of leaflets) {
  ellipse(leaf.cx, leaf.cy, leaf.rx, leaf.ry, leaf.rot, LEAF, 1);
}
// Light on the upper leaflets.
ellipse(392, 178, 18, 34, 0.1, LEAF_LIGHT, 0.8);
ellipse(336, 190, 14, 28, -0.7, LEAF_LIGHT, 0.6);
ellipse(466, 190, 14, 28, 0.7, LEAF_LIGHT, 0.6);
// Crown centre where the leaflets meet.
ellipse(400, 210, 34, 20, 0, LEAF_DARK, 0.9);

// A couple of juice droplets on the lit shoulder for freshness.
ellipse(352, 372, 7, 10, 0, [255, 255, 255], 0.5);
ellipse(352, 370, 3.5, 5, 0, [255, 255, 255], 0.8);
ellipse(452, 420, 6, 8, 0, [255, 255, 255], 0.45);

// ---------------------------------------------------------------------------
// Write the PNG.
// ---------------------------------------------------------------------------
const rgb = Buffer.alloc(W * H * 3);
for (let i = 0; i < W * H * 3; i++) {
  rgb[i] = clamp(Math.round(px[i]), 0, 255);
}
const png = encodePng(W, H, rgb);

const outDir = process.env.OUTPUT_DIR ?? "/output";
mkdirSync(outDir, { recursive: true });
const outPath = join(outDir, "entry.png");
writeFileSync(outPath, png);
console.log(`wrote ${outPath}: ${png.length} bytes, ${W}x${H}`);
