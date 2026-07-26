/*
 * pixel.js - primitif menggambar pixel-art di atas canvas 2D.
 * Semua koordinat dalam "pixel dasar" (kanvas 256x144). Pembesaran ke ukuran
 * jendela dilakukan sekali oleh CSS (image-rendering: pixelated), jadi di sini
 * kita cuma pernah menyentuh 36.864 pixel - itulah kenapa widget ini ringan.
 */
(function (root) {
  'use strict';
  root.PDC = root.PDC || {};

  /* --------------------------- canvas util --------------------------- */

  function makeCanvas(w, h) {
    var c = document.createElement('canvas');
    c.width = Math.max(1, w | 0);
    c.height = Math.max(1, h | 0);
    var g = c.getContext('2d', { alpha: true });
    g.imageSmoothingEnabled = false;
    return c;
  }

  function ctxOf(c) {
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    return g;
  }

  /* ------------------------------ acak ------------------------------ */

  /** mulberry32: PRNG deterministik -> pemandangan selalu sama tiap start. */
  function prng(seed) {
    var a = seed >>> 0;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0;
      var t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  /* ---------------------------- dithering ---------------------------- */

  var BAYER8 = [
     0, 32,  8, 40,  2, 34, 10, 42,
    48, 16, 56, 24, 50, 18, 58, 26,
    12, 44,  4, 36, 14, 46,  6, 38,
    60, 28, 52, 20, 62, 30, 54, 22,
     3, 35, 11, 43,  1, 33,  9, 41,
    51, 19, 59, 27, 49, 17, 57, 25,
    15, 47,  7, 39, 13, 45,  5, 37,
    63, 31, 55, 23, 61, 29, 53, 21
  ];

  function bayer(x, y) { return BAYER8[((y & 7) << 3) | (x & 7)] / 64; }

  /**
   * Kuantisasi + ordered dithering satu kanal.
   * Ini yang memberi langit tekstur "pixel-art" alih-alih gradien halus 24-bit.
   */
  function ditherChannel(v, thr, levels) {
    var x = (v / 255) * (levels - 1);
    var f = Math.floor(x);
    var lvl = f + ((x - f) > thr ? 1 : 0);
    if (lvl < 0) lvl = 0; else if (lvl > levels - 1) lvl = levels - 1;
    return (lvl / (levels - 1)) * 255;
  }

  /* ---------------- pola dither (untuk alpha semu) ---------------- */

  var patCache = new Map();

  /**
   * Pola 8x8 berisi warna `rgb` pada `amount` bagian pixel (0..1),
   * dipilih pakai matriks Bayer. Dipakai untuk bayangan, panel jam,
   * kerucut lampu - semuanya tanpa alpha-blend yang "terlalu modern".
   */
  function pattern(g, rgb, amount) {
    var a = Math.round(Math.max(0, Math.min(1, amount)) * 64);
    if (a <= 0) return null;
    var key = rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',' + a;
    var p = patCache.get(key);
    if (p) return p;
    if (patCache.size > 320) patCache.clear();

    var c = makeCanvas(8, 8);
    var cg = ctxOf(c);
    var img = cg.createImageData(8, 8);
    var d = img.data;
    for (var y = 0; y < 8; y++) {
      for (var x = 0; x < 8; x++) {
        var i = (y * 8 + x) * 4;
        if (BAYER8[(y << 3) | x] < a) {
          d[i] = rgb[0]; d[i + 1] = rgb[1]; d[i + 2] = rgb[2]; d[i + 3] = 255;
        }
      }
    }
    cg.putImageData(img, 0, 0);
    p = g.createPattern(c, 'repeat');
    patCache.set(key, p);
    return p;
  }

  function ditherRect(g, x, y, w, h, rgb, amount) {
    var p = pattern(g, rgb, amount);
    if (!p) return;
    g.fillStyle = p;
    g.fillRect(x | 0, y | 0, w | 0, h | 0);
  }

  function clearPatternCache() { patCache.clear(); }

  /* ----------------------------- sprite ----------------------------- */

  /**
   * Render sprite ASCII menjadi canvas kecil sesuai palet saat ini.
   * Dilakukan hanya saat palet berubah, lalu dipakai ulang tiap frame
   * dengan satu drawImage - jauh lebih murah dari ratusan fillRect.
   */
  function renderSprite(sprite, palRgb, overrideMap, target) {
    var w = sprite.w, h = sprite.h;
    var c = target && target.width === w && target.height === h ? target : makeCanvas(w, h);
    var g = ctxOf(c);
    var img = g.createImageData(w, h);
    var d = img.data;
    var map = overrideMap || sprite.map;
    var colors = {};
    for (var ch in map) {
      if (!Object.prototype.hasOwnProperty.call(map, ch)) continue;
      colors[ch] = palRgb[map[ch]] || [255, 0, 255];
    }
    for (var y = 0; y < h; y++) {
      var row = sprite.rows[y];
      for (var x = 0; x < w; x++) {
        var k = row.charAt(x);
        if (k === '.' || k === ' ') continue;
        var col = colors[k];
        if (!col) continue;
        var i = (y * w + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* --------------------------- bentuk dasar --------------------------- */

  /** Lingkaran pixel (midpoint scanline) - matahari, bulan, gumpalan asap. */
  function fillCircle(g, cx, cy, r, css) {
    g.fillStyle = css;
    var ri = Math.max(0, r);
    var y0 = Math.ceil(cy - ri), y1 = Math.floor(cy + ri);
    for (var y = y0; y <= y1; y++) {
      var dy = y - cy;
      var dx = Math.sqrt(Math.max(0, ri * ri - dy * dy));
      var xa = Math.round(cx - dx), xb = Math.round(cx + dx);
      if (xb < xa) continue;
      g.fillRect(xa, y, xb - xa + 1, 1);
    }
  }

  function circleDither(g, cx, cy, r, rgb, amount) {
    var p = pattern(g, rgb, amount);
    if (!p) return;
    g.fillStyle = p;
    var ri = Math.max(0, r);
    var y0 = Math.ceil(cy - ri), y1 = Math.floor(cy + ri);
    for (var y = y0; y <= y1; y++) {
      var dy = y - cy;
      var dx = Math.sqrt(Math.max(0, ri * ri - dy * dy));
      var xa = Math.round(cx - dx), xb = Math.round(cx + dx);
      if (xb < xa) continue;
      g.fillRect(xa, y, xb - xa + 1, 1);
    }
  }

  function px(g, x, y, css) { g.fillStyle = css; g.fillRect(x | 0, y | 0, 1, 1); }

  function hline(g, x, y, w, css) { g.fillStyle = css; g.fillRect(x | 0, y | 0, w | 0, 1); }

  function vline(g, x, y, h, css) { g.fillStyle = css; g.fillRect(x | 0, y | 0, 1, h | 0); }

  /* ------------------------------ teks ------------------------------ */

  var textCache = new Map();

  /**
   * Render satu baris teks (font 5x7) + garis tepi 1px, ke canvas cache.
   * Karena string jam hanya berubah sekali per detik, biaya render teks
   * praktis nol.
   */
  function renderText(text, scale, fillRgb, outlineRgb, tracking) {
    var F = root.PDC.font;
    var tr = tracking == null ? 1 : tracking;
    var key = text + '|' + scale + '|' + fillRgb.join() + '|' +
      (outlineRgb ? outlineRgb.join() : 'x') + '|' + tr;
    var cached = textCache.get(key);
    if (cached) return cached;
    if (textCache.size > 80) textCache.clear();

    var pts = [];
    var cx = 0;
    for (var i = 0; i < text.length; i++) {
      var gl = F.glyph(text.charAt(i));
      for (var y = 0; y < F.H; y++) {
        var row = gl[y];
        for (var x = 0; x < F.W; x++) {
          if (row.charAt(x) === '#') pts.push([cx + x, y]);
        }
      }
      cx += F.W + tr;
    }

    var pad = outlineRgb ? 1 : 0;
    var bw = Math.max(1, (F.measure(text, tr) + pad * 2) * scale);
    var bh = (F.H + pad * 2) * scale;
    var c = makeCanvas(bw, bh);
    var g = ctxOf(c);

    var j, p;
    if (outlineRgb) {
      g.fillStyle = 'rgb(' + outlineRgb.join(',') + ')';
      var OFF = [[-1, 0], [1, 0], [0, -1], [0, 1], [-1, -1], [1, -1], [-1, 1], [1, 1]];
      for (var o = 0; o < OFF.length; o++) {
        for (j = 0; j < pts.length; j++) {
          p = pts[j];
          g.fillRect((p[0] + pad + OFF[o][0]) * scale, (p[1] + pad + OFF[o][1]) * scale, scale, scale);
        }
      }
    }
    g.fillStyle = 'rgb(' + fillRgb.join(',') + ')';
    for (j = 0; j < pts.length; j++) {
      p = pts[j];
      g.fillRect((p[0] + pad) * scale, (p[1] + pad) * scale, scale, scale);
    }

    var out = { canvas: c, w: bw, h: bh, pad: pad, scale: scale };
    textCache.set(key, out);
    return out;
  }

  function drawText(g, text, x, y, scale, fillRgb, outlineRgb, tracking) {
    var t = renderText(text, scale, fillRgb, outlineRgb, tracking);
    g.drawImage(t.canvas, (x | 0) - t.pad * scale, (y | 0) - t.pad * scale);
    return t;
  }

  function clearTextCache() { textCache.clear(); }

  root.PDC.pixel = {
    makeCanvas: makeCanvas,
    ctxOf: ctxOf,
    prng: prng,
    BAYER8: BAYER8,
    bayer: bayer,
    ditherChannel: ditherChannel,
    pattern: pattern,
    ditherRect: ditherRect,
    circleDither: circleDither,
    clearPatternCache: clearPatternCache,
    renderSprite: renderSprite,
    fillCircle: fillCircle,
    px: px,
    hline: hline,
    vline: vline,
    renderText: renderText,
    drawText: drawText,
    clearTextCache: clearTextCache
  };
})(typeof self !== 'undefined' ? self : this);
