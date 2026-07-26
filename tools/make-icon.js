/*
 * make-icon.js - membuat ikon aplikasi tanpa perlu editor gambar.
 *
 * Ikon digambar sebagai pixel-art 64x64 memakai palet & sprite mobil yang
 * sama dengan widget, lalu ditulis jadi PNG dengan encoder mini di bawah
 * (hanya butuh zlib bawaan Node - nol dependensi).
 *
 * Keluaran:
 *   build/icon.png      512x512  -> dipakai electron-builder (jadi .ico)
 *   src/assets/icon.png 256x256  -> ikon jendela
 *   src/assets/tray.png  32x32   -> ikon tray
 */
'use strict';

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.join(__dirname, '..');
const R = (f) => require(path.join(ROOT, 'src', 'renderer', 'js', f));
const palette = R('palette.js');
const sprites = R('sprites.js');

/* ------------------------- encoder PNG mini ------------------------- */

let CRC_TABLE = null;
function crcTable() {
  if (CRC_TABLE) return CRC_TABLE;
  CRC_TABLE = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    CRC_TABLE[n] = c;
  }
  return CRC_TABLE;
}

function crc32(buf) {
  const t = crcTable();
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = t[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function chunk(type, data) {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length, 0);
  const t = Buffer.from(type, 'ascii');
  const crc = Buffer.alloc(4);
  crc.writeUInt32BE(crc32(Buffer.concat([t, data])), 0);
  return Buffer.concat([len, t, data, crc]);
}

function encodePNG(w, h, rgba) {
  const sig = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A]);
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0);
  ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8;    // bit depth
  ihdr[9] = 6;    // truecolor + alpha
  const stride = w * 4;
  const raw = Buffer.alloc((stride + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (stride + 1)] = 0;                       // filter: none
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }
  const idat = zlib.deflateSync(raw, { level: 9 });
  return Buffer.concat([sig, chunk('IHDR', ihdr), chunk('IDAT', idat), chunk('IEND', Buffer.alloc(0))]);
}

/* --------------------------- kanvas array --------------------------- */

function Img(w, h) {
  this.w = w; this.h = h;
  this.d = Buffer.alloc(w * h * 4);
}
Img.prototype.set = function (x, y, c, a) {
  x |= 0; y |= 0;
  if (x < 0 || y < 0 || x >= this.w || y >= this.h) return;
  const i = (y * this.w + x) * 4;
  this.d[i] = c[0]; this.d[i + 1] = c[1]; this.d[i + 2] = c[2];
  this.d[i + 3] = a == null ? 255 : a;
};
Img.prototype.rect = function (x, y, w, h, c) {
  for (let yy = y; yy < y + h; yy++) for (let xx = x; xx < x + w; xx++) this.set(xx, yy, c);
};
Img.prototype.circle = function (cx, cy, r, c) {
  for (let y = Math.floor(cy - r); y <= Math.ceil(cy + r); y++) {
    const dy = y - cy;
    const dx = Math.sqrt(Math.max(0, r * r - dy * dy));
    for (let x = Math.round(cx - dx); x <= Math.round(cx + dx); x++) this.set(x, y, c);
  }
};
Img.prototype.sprite = function (sp, x, y, matRgb) {
  for (let ry = 0; ry < sp.h; ry++) {
    const row = sp.rows[ry];
    for (let rx = 0; rx < sp.w; rx++) {
      const ch = row[rx];
      if (ch === '.' || ch === ' ') continue;
      const c = matRgb[sp.map[ch]];
      if (c) this.set(x + rx, y + ry, c);
    }
  }
};

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
function dith(x, y) { return BAYER4[((y & 3) << 2) | (x & 3)] / 16; }

/* ---------------------------- gambar ikon ---------------------------- */

function drawIcon() {
  const N = 64;
  const img = new Img(N, N);
  const pal = palette.build(9.6, N, 34);
  const m = pal.matRgb;
  const sky = pal.sky;

  // langit (gradien 4 titik + dither halus)
  for (let y = 0; y < 36; y++) {
    const t = y / 35;
    let seg, u;
    if (t < 0.34) { seg = 0; u = t / 0.34; }
    else if (t < 0.68) { seg = 1; u = (t - 0.34) / 0.34; }
    else { seg = 2; u = (t - 0.68) / 0.32; }
    const A = sky[seg], B = sky[seg + 1];
    for (let x = 0; x < N; x++) {
      const j = dith(x, y) * 0.10;
      img.set(x, y, [
        Math.min(255, Math.round(A[0] + (B[0] - A[0]) * (u + j))),
        Math.min(255, Math.round(A[1] + (B[1] - A[1]) * (u + j))),
        Math.min(255, Math.round(A[2] + (B[2] - A[2]) * (u + j)))
      ]);
    }
  }

  // matahari + sinar
  img.circle(47, 12, 9.5, m.sunEdge);
  img.circle(47, 12, 6.5, m.sunCore);
  for (let k = 0; k < 8; k++) {
    const a = k * Math.PI / 4;
    for (let q = 0; q < 4; q++) {
      img.set(Math.round(47 + Math.cos(a) * (11 + q)), Math.round(12 + Math.sin(a) * (11 + q)), m.sunRay);
    }
  }

  // bukit
  for (let x = 0; x < N; x++) {
    const ridge = 30 - Math.round(3.2 * Math.sin(x / 9.5) + 1.8 * Math.sin(x / 3.7 + 1.2));
    for (let y = ridge; y < 38; y++) {
      img.set(x, y, (y - ridge) < 2 ? m.hillNearB : m.hillNearA);
    }
  }

  // ladang bunga jauh
  for (let y = 36; y < 43; y++) {
    for (let x = 0; x < N; x++) {
      img.set(x, y, dith(x, y) < 0.45 ? m.fieldFarDark : m.fieldFarLight);
    }
  }
  const rnd = (function (s) { return function () { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; }; })(7);
  for (let i = 0; i < 26; i++) {
    const fx = Math.floor(rnd() * N), fy = 36 + Math.floor(rnd() * 6);
    img.set(fx, fy, i % 3 === 0 ? m.flowerFarA : (i % 3 === 1 ? m.flowerFarB : m.flowerFarC));
  }

  // jalan aspal
  img.rect(0, 42, N, 2, m.roadKerb);
  img.rect(0, 44, N, 1, m.roadLine);
  for (let y = 45; y < 53; y++) {
    for (let x = 0; x < N; x++) img.set(x, y, dith(x, y) < 0.5 ? m.roadA : m.roadB);
  }
  for (let x = 0; x < N; x += 12) img.rect(x, 47, 7, 2, m.roadLineY);
  img.rect(0, 53, N, 1, m.roadLine);

  // mobil (sprite yang sama dengan widget) - ban menyentuh baris 51
  img.sprite(sprites.CAR, 8, 34, m);
  for (const wh of sprites.CAR_WHEELS) {
    img.sprite(sprites.RIMS[0], 8 + wh.x, 34 + wh.y, m);
  }

  // ladang bunga depan
  for (let y = 54; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const deep = (y - 54) / (N - 54);
      img.set(x, y, dith(x, y) < 0.3 + 0.45 * deep ? (deep > 0.5 ? m.fieldNearDeep : m.fieldNearDark) : m.fieldNearLight);
    }
  }
  const petals = [m.flowerRed, m.flowerYellow, m.flowerWhite, m.flowerPink, m.flowerPurple];
  for (let i = 0; i < 16; i++) {
    const fx = 2 + Math.floor(rnd() * (N - 5));
    const fy = 55 + Math.floor(rnd() * 6);
    const c = petals[i % petals.length];
    img.set(fx, fy - 1, c); img.set(fx - 1, fy, c); img.set(fx + 1, fy, c);
    img.set(fx, fy + 1, c); img.set(fx, fy, m.flowerCore);
    img.set(fx, fy + 2, m.flowerStem);
  }

  // sudut membulat + garis tepi
  const Rr = 10;
  const corners = [[Rr, Rr], [N - 1 - Rr, Rr], [Rr, N - 1 - Rr], [N - 1 - Rr, N - 1 - Rr]];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const inX = x >= Rr && x <= N - 1 - Rr;
      const inY = y >= Rr && y <= N - 1 - Rr;
      if (inX || inY) continue;
      let best = 1e9;
      for (const c of corners) {
        const d = Math.hypot(x - c[0], y - c[1]);
        if (d < best) best = d;
      }
      if (best > Rr) img.d[(y * N + x) * 4 + 3] = 0;
      else if (best > Rr - 1.2) img.set(x, y, [22, 26, 40], 255);
    }
  }
  for (let x = Rr; x <= N - 1 - Rr; x++) { img.set(x, 0, [22, 26, 40]); img.set(x, N - 1, [22, 26, 40]); }
  for (let y = Rr; y <= N - 1 - Rr; y++) { img.set(0, y, [22, 26, 40]); img.set(N - 1, y, [22, 26, 40]); }

  return img;
}

/* ------------------------ perbesar / perkecil ------------------------ */

function upscale(img, f) {
  const out = new Img(img.w * f, img.h * f);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      const si = (((y / f) | 0) * img.w + ((x / f) | 0)) * 4;
      const di = (y * out.w + x) * 4;
      out.d[di] = img.d[si]; out.d[di + 1] = img.d[si + 1];
      out.d[di + 2] = img.d[si + 2]; out.d[di + 3] = img.d[si + 3];
    }
  }
  return out;
}

function downscale2(img) {
  const out = new Img(img.w >> 1, img.h >> 1);
  for (let y = 0; y < out.h; y++) {
    for (let x = 0; x < out.w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (let dy = 0; dy < 2; dy++) {
        for (let dx = 0; dx < 2; dx++) {
          const si = (((y * 2 + dy) * img.w) + (x * 2 + dx)) * 4;
          const al = img.d[si + 3] / 255;
          r += img.d[si] * al; g += img.d[si + 1] * al; b += img.d[si + 2] * al; a += al;
        }
      }
      const di = (y * out.w + x) * 4;
      if (a > 0) {
        out.d[di] = Math.round(r / a); out.d[di + 1] = Math.round(g / a); out.d[di + 2] = Math.round(b / a);
      }
      out.d[di + 3] = Math.round((a / 4) * 255);
    }
  }
  return out;
}

/* ------------------------------- tulis ------------------------------- */

function write(file, img) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, encodePNG(img.w, img.h, img.d));
  console.log('  ' + path.relative(ROOT, file) + '  ' + img.w + 'x' + img.h +
    '  (' + (fs.statSync(file).size / 1024).toFixed(1) + ' KB)');
}

const base = drawIcon();
console.log('ikon dibuat dari pixel-art 64x64:');
write(path.join(ROOT, 'build', 'icon.png'), upscale(base, 8));
write(path.join(ROOT, 'src', 'assets', 'icon.png'), upscale(base, 4));
write(path.join(ROOT, 'src', 'assets', 'tray.png'), downscale2(base));
