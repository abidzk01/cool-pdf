#!/usr/bin/env node
'use strict';

/**
 * Generate the PWA icons from assets/icon-rxpdf-cool.png.
 *
 *   node tools/make-pwa-icons.js
 *
 * Writes into assets/pwa/:
 *   icon-192.png, icon-512.png            (purpose: any)
 *   maskable-512.png                       (purpose: maskable, 70% safe zone)
 *   apple-touch-icon.png                   (180, opaque)
 *
 * No dependencies: a small PNG decoder/encoder built on node:zlib, plus
 * alpha-aware bilinear scaling and a background composite.
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.dirname(__dirname);
const SOURCE = path.join(ROOT, 'assets', 'icon-rxpdf-cool.png');
const OUT_DIR = path.join(ROOT, 'assets', 'pwa');
const BACKGROUND = [0x0b, 0x12, 0x20];
const OUTPUTS = [
  { file: 'icon-192.png', size: 192, content: 0.86, opaque: false },
  { file: 'icon-512.png', size: 512, content: 0.86, opaque: false },
  { file: 'maskable-512.png', size: 512, content: 0.66, opaque: true },
  { file: 'apple-touch-icon.png', size: 180, content: 0.86, opaque: true },
];

// ── PNG decode ───────────────────────────────────────────────────────────
function decodePng(buffer) {
  if (buffer.readUInt32BE(0) !== 0x89504e47) throw new Error('not a PNG');
  let offset = 8;
  let width = 0, height = 0, depth = 0, colorType = 0, interlace = 0;
  const idat = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      depth = data[8];
      colorType = data[9];
      interlace = data[12];
    } else if (type === 'IDAT') {
      idat.push(data);
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length;
  }
  if (depth !== 8) throw new Error('only 8-bit PNGs are supported (got ' + depth + ')');
  if (interlace !== 0) throw new Error('interlaced PNGs are not supported');

  const channels = { 0: 1, 2: 3, 4: 2, 6: 4 }[colorType];
  if (!channels) throw new Error('unsupported color type ' + colorType);

  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  let rawPos = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[rawPos++];
    const line = raw.subarray(rawPos, rawPos + stride);
    rawPos += stride;
    const out = y * stride;
    const prev = out - stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? pixels[out + x - channels] : 0;
      const b = y > 0 ? pixels[prev + x] : 0;
      const c = y > 0 && x >= channels ? pixels[prev + x - channels] : 0;
      let value = line[x];
      if (filter === 1) value += a;
      else if (filter === 2) value += b;
      else if (filter === 3) value += (a + b) >> 1;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
        value += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
      }
      pixels[out + x] = value & 0xff;
    }
  }
  return { width, height, channels, pixels };
}

function toRgba(image) {
  const { width, height, channels, pixels } = image;
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const s = i * channels;
    const d = i * 4;
    if (channels === 1) { rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s]; rgba[d + 3] = 255; }
    else if (channels === 2) { rgba[d] = rgba[d + 1] = rgba[d + 2] = pixels[s]; rgba[d + 3] = pixels[s + 1]; }
    else if (channels === 3) { rgba[d] = pixels[s]; rgba[d + 1] = pixels[s + 1]; rgba[d + 2] = pixels[s + 2]; rgba[d + 3] = 255; }
    else { rgba[d] = pixels[s]; rgba[d + 1] = pixels[s + 1]; rgba[d + 2] = pixels[s + 2]; rgba[d + 3] = pixels[s + 3]; }
  }
  return { width, height, rgba };
}

// ── Scaling + composite ──────────────────────────────────────────────────
function sampleBilinear(img, fx, fy) {
  const { width, height, rgba } = img;
  const x = Math.min(width - 1, Math.max(0, fx * (width - 1)));
  const y = Math.min(height - 1, Math.max(0, fy * (height - 1)));
  const x0 = Math.floor(x), y0 = Math.floor(y);
  const x1 = Math.min(width - 1, x0 + 1), y1 = Math.min(height - 1, y0 + 1);
  const dx = x - x0, dy = y - y0;
  const out = [0, 0, 0, 0];
  for (let c = 0; c < 4; c++) {
    const p00 = rgba[(y0 * width + x0) * 4 + c];
    const p10 = rgba[(y0 * width + x1) * 4 + c];
    const p01 = rgba[(y1 * width + x0) * 4 + c];
    const p11 = rgba[(y1 * width + x1) * 4 + c];
    out[c] = p00 * (1 - dx) * (1 - dy) + p10 * dx * (1 - dy) + p01 * (1 - dx) * dy + p11 * dx * dy;
  }
  return out;
}

function renderIcon(source, size, contentRatio, opaque) {
  const out = Buffer.alloc(size * size * 4);
  const inner = size * contentRatio;
  const offset = (size - inner) / 2;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const d = (y * size + x) * 4;
      const inside = x >= offset && x < offset + inner && y >= offset && y < offset + inner;
      let sr = 0, sg = 0, sb = 0, sa = 0;
      if (inside) {
        const [r, g, b, a] = sampleBilinear(source, (x - offset) / inner, (y - offset) / inner);
        sr = r; sg = g; sb = b; sa = a / 255;
      }
      if (opaque || !inside) {
        out[d] = Math.round(BACKGROUND[0] * (1 - sa) + sr * sa);
        out[d + 1] = Math.round(BACKGROUND[1] * (1 - sa) + sg * sa);
        out[d + 2] = Math.round(BACKGROUND[2] * (1 - sa) + sb * sa);
        out[d + 3] = 255;
      } else {
        out[d] = Math.round(sr);
        out[d + 1] = Math.round(sg);
        out[d + 2] = Math.round(sb);
        out[d + 3] = Math.round(sa * 255);
      }
    }
  }
  return out;
}

// ── PNG encode ───────────────────────────────────────────────────────────
function crc32(buf) {
  let c, crc = 0xffffffff;
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    crc = (crc >>> 8) ^ c;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data]);
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(body), 0);
  return Buffer.concat([length, body, crc]);
}

function encodePng(rgba, size) {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const stride = size * 4;
  const raw = Buffer.alloc((stride + 1) * size);
  for (let y = 0; y < size; y++) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

// ── Main ─────────────────────────────────────────────────────────────────
const source = toRgba(decodePng(fs.readFileSync(SOURCE)));
fs.mkdirSync(OUT_DIR, { recursive: true });
for (const spec of OUTPUTS) {
  const rgba = renderIcon(source, spec.size, spec.content, spec.opaque);
  const png = encodePng(rgba, spec.size);
  const target = path.join(OUT_DIR, spec.file);
  fs.writeFileSync(target, png);
  console.log(`${spec.file}  ${spec.size}x${spec.size}  ${png.length.toLocaleString()} bytes`);
}