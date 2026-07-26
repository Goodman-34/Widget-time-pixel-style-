/*
 * validate-sprites.js - pemeriksa kewarasan aset (jalankan: npm run validate)
 *
 * Memeriksa:
 *   1. semua baris tiap sprite sama panjang (kesalahan paling sering saat
 *      mengedit ASCII art dengan tangan)
 *   2. setiap huruf pada sprite punya pemetaan material
 *   3. setiap material yang dipakai memang ada di palette.js
 *   4. font 5x7 benar-benar 5x7
 *   5. palette.build() menghasilkan warna sah (0..255, bukan NaN) untuk
 *      seluruh 24 jam - ini menangkap salah tulis kode warna
 */
'use strict';

const path = require('path');
const R = (f) => require(path.join(__dirname, '..', 'src', 'renderer', 'js', f));

const sprites = R('sprites.js');
const font = R('font.js');
const palette = R('palette.js');

let errors = 0;
let checks = 0;

function fail(msg) { errors++; console.error('  GAGAL  ' + msg); }
function ok(msg) { console.log('  ok     ' + msg); }

/* ---------------------------- 1-3: sprite ---------------------------- */

function checkSprite(name, sp) {
  checks++;
  if (!sp || !sp.rows || !sp.rows.length) { fail(name + ': sprite kosong'); return; }
  const w = sp.rows[0].length;
  if (sp.w !== w) fail(name + ': sp.w=' + sp.w + ' tapi baris pertama ' + w + ' kolom');
  if (sp.h !== sp.rows.length) fail(name + ': sp.h=' + sp.h + ' tapi ada ' + sp.rows.length + ' baris');

  for (let y = 0; y < sp.rows.length; y++) {
    const row = sp.rows[y];
    if (row.length !== w) {
      fail(name + ': baris ' + y + ' panjangnya ' + row.length + ', seharusnya ' + w +
        '  ->  "' + row + '"');
    }
    for (let x = 0; x < row.length; x++) {
      const ch = row[x];
      if (ch === '.' || ch === ' ') continue;
      if (!sp.map || !sp.map[ch]) {
        fail(name + ': huruf "' + ch + '" (baris ' + y + ', kolom ' + x + ') tidak ada di map');
        break;
      }
    }
  }
  for (const ch of Object.keys(sp.map || {})) {
    const mat = sp.map[ch];
    if (!palette.MATERIALS[mat]) {
      fail(name + ': material "' + mat + '" (huruf ' + ch + ') tidak ada di palette.js');
    }
  }
}

function walk(name, val) {
  if (Array.isArray(val)) {
    val.forEach((v, i) => walk(name + '[' + i + ']', v));
  } else if (val && val.rows) {
    checkSprite(name, val);
  }
}

console.log('\n[1-3] sprite & material');
for (const key of Object.keys(sprites)) {
  if (key === 'CAR_WHEELS') continue;
  walk(key, sprites[key]);
}
if (!errors) ok(checks + ' sprite lolos pemeriksaan baris & material');

/* ------------------------- posisi pelek mobil ------------------------- */

console.log('\n[3b] posisi pelek di dalam sprite mobil');
{
  const car = sprites.CAR;
  const rim = sprites.RIMS[0];
  let bad = 0;
  for (const wh of sprites.CAR_WHEELS) {
    if (wh.x < 0 || wh.y < 0 || wh.x + rim.w > car.w || wh.y + rim.h > car.h) {
      fail('CAR_WHEELS ' + JSON.stringify(wh) + ' keluar dari sprite mobil');
      bad++;
      continue;
    }
    // titik tengah pelek harus benar-benar berada di atas pixel pelek 'R'
    const ch = car.rows[wh.y + 1][wh.x + 1];
    if (ch !== 'R') {
      fail('CAR_WHEELS ' + JSON.stringify(wh) + ': huruf di tengah "' + ch + '", harusnya "R"');
      bad++;
    }
  }
  if (!bad) ok('kedua pelek pas di atas pixel "R" sprite mobil');
}

/* ------------------------------ 4: font ------------------------------ */

console.log('\n[4] font 5x7');
{
  let bad = 0;
  for (const ch of Object.keys(font.GLYPHS)) {
    const g = font.GLYPHS[ch];
    if (g.length !== font.H) { fail('glyph "' + ch + '": ' + g.length + ' baris'); bad++; continue; }
    for (let y = 0; y < g.length; y++) {
      if (g[y].length !== font.W) { fail('glyph "' + ch + '" baris ' + y + ': ' + g[y].length + ' kolom'); bad++; }
      if (/[^#.]/.test(g[y])) { fail('glyph "' + ch + '" baris ' + y + ': huruf tak dikenal'); bad++; }
    }
  }
  const need = '0123456789: ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  for (const c of need) {
    if (!font.GLYPHS[c]) { fail('glyph wajib "' + c + '" tidak ada'); bad++; }
  }
  if (!bad) ok(Object.keys(font.GLYPHS).length + ' glyph valid, semua karakter wajib ada');
}

/* ---------------------------- 5: palet 24 jam ---------------------------- */

console.log('\n[5] palette.build() sepanjang 24 jam');
{
  let bad = 0;
  let sampled = 0;
  for (let h = 0; h <= 24.0001; h += 0.25) {
    const pal = palette.build(h, 256, 100);
    sampled++;
    for (const key of Object.keys(pal.matRgb)) {
      const c = pal.matRgb[key];
      for (let i = 0; i < 3; i++) {
        if (!Number.isFinite(c[i]) || c[i] < 0 || c[i] > 255 || c[i] !== Math.round(c[i])) {
          fail('jam ' + h.toFixed(2) + ' material "' + key + '" -> ' + JSON.stringify(c));
          bad++;
        }
      }
    }
    for (const s of pal.sky) {
      for (let i = 0; i < 3; i++) {
        if (!Number.isFinite(s[i]) || s[i] < 0 || s[i] > 255) {
          fail('jam ' + h.toFixed(2) + ' warna langit -> ' + JSON.stringify(s));
          bad++;
        }
      }
    }
    for (const v of [pal.sun.x, pal.sun.y, pal.moon.x, pal.moon.y]) {
      if (!Number.isFinite(v)) { fail('jam ' + h.toFixed(2) + ' posisi matahari/bulan NaN'); bad++; }
    }
  }
  if (!bad) ok(sampled + ' titik waktu diuji, semua warna & posisi sah');
}

/* ------------------- 6: mulusnya peralihan antar jam ------------------- */

console.log('\n[6] peralihan warna harus mulus (tidak ada lompatan tajam)');
{
  let worst = 0, worstAt = 0, worstKey = '';
  let prev = palette.build(0, 256, 100);
  for (let h = 0.05; h <= 24.0001; h += 0.05) {
    const cur = palette.build(h, 256, 100);
    for (const key of Object.keys(cur.matRgb)) {
      const a = prev.matRgb[key], b = cur.matRgb[key];
      const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
      if (d > worst) { worst = d; worstAt = h; worstKey = key; }
    }
    for (let s = 0; s < 4; s++) {
      const a = prev.sky[s], b = cur.sky[s];
      const d = Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);
      if (d > worst) { worst = d; worstAt = h; worstKey = 'langit#' + s; }
    }
    prev = cur;
  }
  // Ambang ini untuk menangkap keyframe yang salah tulis (lompatan ratusan),
  // bukan untuk melarang matahari terbit. Angka di bawah dihitung per 3 MENIT
  // waktu adegan; saat mode realtime palet hanya dibangun tiap 30 detik, jadi
  // pergeseran nyata per pembaruan sekitar 1/6 dari angka ini.
  if (worst > 24) fail('lompatan warna terbesar ' + worst + ' pada jam ' + worstAt.toFixed(2) + ' (' + worstKey + ')');
  else ok('lompatan terbesar hanya ' + worst + '/765 per 3 menit (jam ' + worstAt.toFixed(2) + ', ' + worstKey + ')');
}

console.log('');
if (errors) {
  console.error('SELESAI dengan ' + errors + ' masalah.\n');
  process.exit(1);
}
console.log('SEMUA PEMERIKSAAN LOLOS.\n');
