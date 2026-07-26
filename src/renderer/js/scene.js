/*
 * scene.js - mesin gambar pemandangan.
 *
 * Tata letak vertikal (dalam pixel dasar, kanvas 256x144):
 *
 *    0 .. 99   langit (gradien + kilau matahari, di-dither)
 *   62 ..102   bukit jauh          parallax 0.10
 *   74 ..104   bukit dekat         parallax 0.22
 *   84 ..106   deretan pohon jauh  parallax 0.38
 *  100 ..120   ladang bunga jauh   parallax 0.55
 *   84 ..120   tiang listrik+kabel parallax 0.78
 *  118 ..137   JALAN ASPAL         parallax 1.00
 *  111 ..128   MOBIL (diam di tengah layar, dunia yang bergerak)
 *  124 ..144   ladang bunga depan  parallax 1.45  (menutup kaki mobil)
 *
 * Semua lapisan latar dirender sekali ke "tile" saat palet berubah, lalu tiap
 * frame hanya di-blit ulang dengan offset. Biaya per frame: ~20 drawImage.
 */
(function (root) {
  'use strict';
  root.PDC = root.PDC || {};
  var P = root.PDC;

  var W = 256, H = 144;
  var HORIZON = 100;
  var SKY_H = 106;

  // Batas tiap lapisan dipilih supaya: puncak bukit selalu di atas garis
  // ladang, dan aspal cukup lebar sehingga ban mobil jelas menempel di jalan
  // (bukan tenggelam di rumput).
  var HILLFAR_TOP = 60, HILLFAR_BOT = 99;
  var HILLNEAR_TOP = 72, HILLNEAR_BOT = 101;
  var TREE_TOP = 82, TREE_BOT = 104;
  var FARFIELD_TOP = 100, FARFIELD_BOT = 121;
  var MID_TOP = 80, MID_BOT = 118;
  var ROAD_TOP = 116, ROAD_BOT = 139;
  var FORE_TOP = 126, FORE_BOT = 144;

  var CAR_X = 98;
  var CAR_GROUND = 130;          // baris tempat ban menyentuh aspal

  // lebar tile: dipilih supaya pola tidak terasa berulang
  var TW_HILLFAR = 512, TW_HILLNEAR = 448, TW_TREE = 352,
      TW_FARFIELD = 384, TW_MID = 512, TW_ROAD = 128, TW_FORE = 384;

  var PX_FACTOR = {
    cloud: 0.06, hillFar: 0.10, hillNear: 0.22, tree: 0.38,
    farField: 0.55, mid: 0.78, road: 1.00, fore: 1.45
  };

  var SWAY_FRAMES = 4;

  function Scene(canvas) {
    var pix = P.pixel;
    this.canvas = canvas;
    canvas.width = W; canvas.height = H;
    this.g = pix.ctxOf(canvas);

    this.pal = null;
    this.palVersion = -1;
    this.scroll = 0;
    this.time = 0;
    this.swayPhase = 0;

    this.sky = pix.makeCanvas(W, SKY_H);
    this.tiles = {};
    this.bank = {};

    this.smoke = [];
    this.dust = [];
    this.smokeTimer = 0;
    this.shoot = null;
    this.shootTimer = 6;

    this._initProps();
  }

  Scene.W = W; Scene.H = H;

  /* ==================================================================== *
   *  Objek yang posisinya tetap (bintang, awan, satwa)
   * ==================================================================== */

  Scene.prototype._initProps = function () {
    var rnd = P.pixel.prng(20260726);
    var i;

    this.stars = [];
    for (i = 0; i < 96; i++) {
      this.stars.push({
        x: Math.floor(rnd() * W),
        y: Math.floor(rnd() * (HORIZON - 14)),
        b: 0.35 + rnd() * 0.65,
        big: rnd() > 0.90,
        warm: rnd() > 0.75,
        sp: 1.2 + rnd() * 3.4,
        ph: rnd() * 6.283
      });
    }

    this.clouds = [];
    for (i = 0; i < 8; i++) {
      this.clouds.push({
        s: Math.floor(rnd() * 3),
        x: rnd() * (W + 120),
        y: 8 + Math.floor(rnd() * 46),
        drift: 1.2 + rnd() * 2.2
      });
    }

    this.birds = [];
    for (i = 0; i < 6; i++) {
      this.birds.push({
        x: rnd() * (W + 80),
        y: 18 + rnd() * 34,
        sp: 7 + rnd() * 6,
        ph: rnd() * 6.283,
        amp: 1.5 + rnd() * 2.5,
        fl: 5 + rnd() * 5
      });
    }

    this.flies = [];
    for (i = 0; i < 18; i++) {
      this.flies.push({
        x: rnd() * W,
        y: FORE_TOP - 6 + rnd() * 16,
        ax: 6 + rnd() * 14, ay: 3 + rnd() * 6,
        fx: 0.25 + rnd() * 0.5, fy: 0.4 + rnd() * 0.8,
        ph: rnd() * 6.283, bl: 0.6 + rnd() * 1.6
      });
    }

    this.bflies = [];
    for (i = 0; i < 6; i++) {
      this.bflies.push({
        x: rnd() * W,
        y: FORE_TOP - 10 + rnd() * 14,
        ax: 10 + rnd() * 20, ay: 4 + rnd() * 7,
        fx: 0.3 + rnd() * 0.5, fy: 0.7 + rnd() * 1.1,
        ph: rnd() * 6.283, fl: 6 + rnd() * 5
      });
    }
  };

  /* ==================================================================== *
   *  Langit: gradien 4 titik + kilau matahari/bulan + cahaya horizon,
   *  lalu di-dither Bayer 8x8 supaya bertekstur pixel.
   * ==================================================================== */

  Scene.prototype._buildSky = function (pal) {
    var pix = P.pixel;
    var g = pix.ctxOf(this.sky);
    var img = g.createImageData(W, SKY_H);
    var d = img.data;
    var st = pal.sky;
    var L = pal.light;

    var sun = pal.sun, moon = pal.moon;
    var sunA = L.sunA, moonA = L.moonA, glowAmt = L.glowAmt;
    var gc = L.glow;
    var sc = pal.matRgb.sunEdge, mc = pal.matRgb.moonCore;

    var LEVELS = 22;
    var y, x, i, t, r, gg, b, seg, u;

    for (y = 0; y < SKY_H; y++) {
      // gradien 4 titik: 0 - 0.34 - 0.68 - 1
      t = y / (SKY_H - 1);
      if (t < 0.34) { seg = 0; u = t / 0.34; }
      else if (t < 0.68) { seg = 1; u = (t - 0.34) / 0.34; }
      else { seg = 2; u = (t - 0.68) / 0.32; }
      var A = st[seg], B = st[seg + 1];
      var br = A[0] + (B[0] - A[0]) * u;
      var bg = A[1] + (B[1] - A[1]) * u;
      var bb = A[2] + (B[2] - A[2]) * u;

      // cahaya lengkung dekat horizon (fajar & senja)
      var hz = glowAmt > 0.001 ? Math.pow(Math.max(0, 1 - (HORIZON - y) / 52), 1.6) : 0;

      for (x = 0; x < W; x++) {
        r = br; gg = bg; b = bb;

        if (sunA > 0.01) {
          var dx = x - sun.x, dy = y - sun.y;
          var dist = Math.sqrt(dx * dx + dy * dy);
          var g1 = 1 - dist / 30; if (g1 < 0) g1 = 0; g1 = g1 * g1 * 0.90 * sunA;
          var g2 = 1 - dist / 88; if (g2 < 0) g2 = 0; g2 = g2 * g2 * 0.40 * sunA;
          var ga = g1 + g2; if (ga > 1) ga = 1;
          if (ga > 0.002) {
            r += (sc[0] - r) * ga; gg += (sc[1] - gg) * ga; b += (sc[2] - b) * ga;
          }
        }

        if (moonA > 0.01) {
          var mdx = x - moon.x, mdy = y - moon.y;
          var mdist = Math.sqrt(mdx * mdx + mdy * mdy);
          var ma = 1 - mdist / 26; if (ma < 0) ma = 0; ma = ma * ma * 0.34 * moonA;
          if (ma > 0.002) {
            r += (mc[0] - r) * ma; gg += (mc[1] - gg) * ma; b += (mc[2] - b) * ma;
          }
        }

        if (hz > 0.001) {
          var lat = 1 - Math.abs(x - sun.x) / 190; if (lat < 0) lat = 0;
          var ha = hz * glowAmt * (0.35 + 0.65 * lat);
          if (ha > 0.002) {
            r += (gc[0] - r) * ha; gg += (gc[1] - gg) * ha; b += (gc[2] - b) * ha;
          }
        }

        var thr = pix.BAYER8[((y & 7) << 3) | (x & 7)] / 64;
        i = (y * W + x) * 4;
        d[i] = pix.ditherChannel(r, thr, LEVELS);
        d[i + 1] = pix.ditherChannel(gg, thr, LEVELS);
        d[i + 2] = pix.ditherChannel(b, thr, LEVELS);
        d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
  };

  /* ==================================================================== *
   *  Tile bukit
   * ==================================================================== */

  function hillTile(tw, hgt, seed, mats, palRgb) {
    var pix = P.pixel;
    var c = pix.makeCanvas(tw, hgt);
    var g = pix.ctxOf(c);
    var img = g.createImageData(tw, hgt);
    var d = img.data;
    var rnd = pix.prng(seed);

    var k1 = 1 + Math.floor(rnd() * 2);
    var k2 = 3 + Math.floor(rnd() * 3);
    var k3 = 7 + Math.floor(rnd() * 5);
    var p1 = rnd() * 6.283, p2 = rnd() * 6.283, p3 = rnd() * 6.283;

    var top = palRgb[mats[0]], body = palRgb[mats[1]], dark = palRgb[mats[2]];
    var usable = hgt - 5;

    for (var x = 0; x < tw; x++) {
      var ph = 6.283185307 * x / tw;
      var n = 0.55 * Math.sin(k1 * ph + p1) + 0.30 * Math.sin(k2 * ph + p2) + 0.15 * Math.sin(k3 * ph + p3);
      n = (n + 1) * 0.5;                       // 0..1
      var sy = Math.round((hgt - 2) - n * usable);
      if (sy < 0) sy = 0;
      for (var y = sy; y < hgt; y++) {
        var k = y - sy;
        var col;
        var thr = pix.BAYER8[((y & 7) << 3) | (x & 7)] / 64;
        if (k < 2) col = top;
        else if (k < 5) col = thr < 0.55 ? top : body;
        else if (y > hgt - 8) col = thr < (y - (hgt - 8)) / 8 ? dark : body;
        else col = body;
        var i = (y * tw + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);
    return c;
  }

  /* ==================================================================== *
   *  Tile deretan pohon (latar ladang)
   * ==================================================================== */

  /** Gambar sprite dan ulangi di sisi berlawanan bila melewati batas tile,
   *  supaya sambungan tile tetap mulus. */
  function wrapDraw(g, sp, x, y, tw) {
    g.drawImage(sp, x, y);
    if (x + sp.width > tw) g.drawImage(sp, x - tw, y);
    else if (x < 0) g.drawImage(sp, x + tw, y);
  }

  Scene.prototype._treeTile = function (palRgb) {
    var pix = P.pixel;
    var hgt = TREE_BOT - TREE_TOP;
    var c = pix.makeCanvas(TW_TREE, hgt);
    var g = pix.ctxOf(c);
    var rnd = pix.prng(9911);
    var far = this.bank.treesFar;
    var x = 2;
    while (x < TW_TREE) {
      var idx = rnd() < 0.45 ? 1 : (rnd() < 0.5 ? 0 : 2);
      var sp = far[idx];
      var y = hgt - sp.height - Math.floor(rnd() * 3);
      wrapDraw(g, sp, x, y, TW_TREE);
      x += Math.max(6, sp.width - 3 - Math.floor(rnd() * 3));
    }
    return c;
  };

  /* ==================================================================== *
   *  Tile ladang bunga jauh
   * ==================================================================== */

  Scene.prototype._farFieldTile = function (palRgb) {
    var pix = P.pixel;
    var hgt = FARFIELD_BOT - FARFIELD_TOP;
    var c = pix.makeCanvas(TW_FARFIELD, hgt);
    var g = pix.ctxOf(c);
    var img = g.createImageData(TW_FARFIELD, hgt);
    var d = img.data;
    var lt = palRgb.fieldFarLight, dk = palRgb.fieldFarDark;

    for (var y = 0; y < hgt; y++) {
      // makin ke depan makin terang: gradasi dither vertikal
      var mixAmt = 0.25 + 0.55 * (1 - y / hgt);
      for (var x = 0; x < TW_FARFIELD; x++) {
        var thr = pix.BAYER8[((y & 7) << 3) | (x & 7)] / 64;
        var col = thr < mixAmt ? dk : lt;
        var i = (y * TW_FARFIELD + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);

    var rnd = pix.prng(4242);
    var tuft = this.bank.tuftFar;
    var i2;
    for (i2 = 0; i2 < 110; i2++) {
      wrapDraw(g, tuft, Math.floor(rnd() * TW_FARFIELD), 1 + Math.floor(rnd() * (hgt - 4)), TW_FARFIELD);
    }
    var ff = this.bank.flowersFar;
    for (i2 = 0; i2 < 120; i2++) {
      var sp = ff[Math.floor(rnd() * ff.length)];
      wrapDraw(g, sp, Math.floor(rnd() * TW_FARFIELD), 2 + Math.floor(rnd() * (hgt - 5)), TW_FARFIELD);
    }
    return c;
  };

  /* ==================================================================== *
   *  Tile tiang listrik + kabel + pohon besar (di belakang jalan)
   * ==================================================================== */

  Scene.prototype._midTile = function (palRgb, palCss) {
    var pix = P.pixel;
    var hgt = MID_BOT - MID_TOP;
    var c = pix.makeCanvas(TW_MID, hgt);
    var g = pix.ctxOf(c);
    var rnd = pix.prng(7331);

    var SPACING = 128;               // 512 / 128 = 4 tiang -> sambungan mulus
    var poleTopY = 4;
    var baseY = hgt - 2;
    var wood = palCss.poleWood, woodD = palCss.poleWoodDark, wire = palCss.poleWire;

    var near = this.bank.treesNear;
    var t;
    for (t = 0; t < TW_MID; t += SPACING) {
      // pohon besar di antara tiang
      var idx = rnd() < 0.5 ? 0 : 2;
      var sp = near[idx];
      var tx = t + 34 + Math.floor(rnd() * 40);
      wrapDraw(g, sp, tx, baseY - sp.height + 1, TW_MID);
      var sp2 = near[1];
      wrapDraw(g, sp2, t + 92 + Math.floor(rnd() * 20), baseY - sp2.height + 1, TW_MID);
    }

    // kabel: lengkung antar tiang (digambar sebelum tiang biar rapi)
    g.fillStyle = wire;
    for (t = 0; t < TW_MID; t += SPACING) {
      for (var k = 0; k < SPACING; k++) {
        var u = k / SPACING;
        var sag = Math.sin(u * Math.PI) * 5;
        var x = t + k;
        g.fillRect(x % TW_MID, Math.round(poleTopY + 1 + sag), 1, 1);
        g.fillRect(x % TW_MID, Math.round(poleTopY + 4 + sag), 1, 1);
      }
    }

    for (t = 0; t < TW_MID; t += SPACING) {
      var px0 = t + 20;
      g.fillStyle = wood;
      g.fillRect(px0, poleTopY, 2, baseY - poleTopY);
      g.fillStyle = woodD;
      g.fillRect(px0 + 1, poleTopY, 1, baseY - poleTopY);
      g.fillStyle = wood;
      g.fillRect(px0 - 4, poleTopY + 1, 10, 1);
      g.fillRect(px0 - 3, poleTopY + 4, 8, 1);
    }
    return c;
  };

  /* ==================================================================== *
   *  Tile jalan aspal
   * ==================================================================== */

  Scene.prototype._roadTile = function (palRgb, palCss) {
    var pix = P.pixel;
    var hgt = ROAD_BOT - ROAD_TOP;                 // 19
    var c = pix.makeCanvas(TW_ROAD, hgt);
    var g = pix.ctxOf(c);
    var img = g.createImageData(TW_ROAD, hgt);
    var d = img.data;
    var rnd = pix.prng(1357);

    var A = palRgb.roadA, B = palRgb.roadB, C = palRgb.roadC;
    var gravel = palRgb.gravel, kerb = palRgb.roadKerb;

    // noise deterministik untuk bercak aspal
    var noise = new Float32Array(TW_ROAD * hgt);
    for (var n = 0; n < noise.length; n++) noise[n] = rnd();

    for (var y = 0; y < hgt; y++) {
      for (var x = 0; x < TW_ROAD; x++) {
        var col;
        var thr = pix.BAYER8[((y & 7) << 3) | (x & 7)] / 64;
        var nz = noise[y * TW_ROAD + x];
        if (y <= 1) {                              // bahu jalan atas (kerikil)
          col = thr < 0.5 ? gravel : kerb;
        } else if (y >= hgt - 4) {                 // bahu bawah (tertutup rumput depan)
          col = thr < 0.45 ? kerb : gravel;
        } else {
          col = nz < 0.16 ? C : (thr < 0.5 ? A : B);
          if (y === 2 || y === hgt - 5) col = C;   // sisi aspal sedikit lebih gelap
        }
        var i = (y * TW_ROAD + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
    }
    g.putImageData(img, 0, 0);

    // garis tepi putih
    g.fillStyle = palCss.roadLine;
    g.fillRect(0, 3, TW_ROAD, 1);
    g.fillRect(0, hgt - 6, TW_ROAD, 1);

    // marka tengah putus-putus (periode 32 -> 128/32 = 4, mulus di sambungan)
    g.fillStyle = palCss.roadLineY;
    for (var dx = 0; dx < TW_ROAD; dx += 32) g.fillRect(dx, 8, 17, 2);

    // retakan halus
    g.fillStyle = palCss.roadCrack;
    var rnd2 = pix.prng(24680);
    for (var q = 0; q < 10; q++) {
      var cx = Math.floor(rnd2() * TW_ROAD);
      var cy = 4 + Math.floor(rnd2() * (hgt - 10));
      var len = 3 + Math.floor(rnd2() * 7);
      for (var s = 0; s < len; s++) {
        g.fillRect((cx + s) % TW_ROAD, cy + (rnd2() < 0.4 ? 1 : 0), 1, 1);
      }
    }
    return c;
  };

  /* ==================================================================== *
   *  Tile ladang bunga depan - 4 frame ayunan angin
   * ==================================================================== */

  Scene.prototype._foreTiles = function (palRgb, palCss) {
    var pix = P.pixel;
    var hgt = FORE_BOT - FORE_TOP;                 // 20
    var groundTop = 10;                            // tanah padat mulai di sini
    var out = [];
    var lt = palRgb.fieldNearLight, dk = palRgb.fieldNearDark, dp = palRgb.fieldNearDeep;
    var bladeL = palCss.bladeLight, bladeD = palCss.bladeDark;
    var flowers = this.bank.flowersNear;

    // dasar tanah (sama untuk semua frame)
    var base = pix.makeCanvas(TW_FORE, hgt);
    var bg = pix.ctxOf(base);
    var img = bg.createImageData(TW_FORE, hgt);
    var d = img.data;
    for (var y = groundTop; y < hgt; y++) {
      var deep = (y - groundTop) / (hgt - groundTop);
      for (var x = 0; x < TW_FORE; x++) {
        var thr = pix.BAYER8[((y & 7) << 3) | (x & 7)] / 64;
        var col = thr < 0.35 + 0.4 * deep ? (deep > 0.55 ? dp : dk) : lt;
        var i = (y * TW_FORE + x) * 4;
        d[i] = col[0]; d[i + 1] = col[1]; d[i + 2] = col[2]; d[i + 3] = 255;
      }
    }
    bg.putImageData(img, 0, 0);

    // daftar rumput & bunga (posisi tetap, hanya lenturnya berubah per frame)
    var rnd = pix.prng(31415);
    var blades = [];
    for (var bI = 0; bI < 330; bI++) {
      blades.push({
        x: Math.floor(rnd() * TW_FORE),
        len: 3 + Math.floor(rnd() * 7),
        ph: rnd() * 6.283,
        light: rnd() < 0.5
      });
    }
    var plants = [];
    for (var fI = 0; fI < 52; fI++) {
      plants.push({
        x: Math.floor(rnd() * TW_FORE),
        s: Math.floor(rnd() * flowers.length),
        dy: Math.floor(rnd() * 4),
        ph: rnd() * 6.283
      });
    }

    for (var f = 0; f < SWAY_FRAMES; f++) {
      var c = pix.makeCanvas(TW_FORE, hgt);
      var g = pix.ctxOf(c);
      g.drawImage(base, 0, 0);
      var wind = (f / SWAY_FRAMES) * 6.283185;

      var j, bl, bend, yy, xx;
      for (j = 0; j < blades.length; j++) {
        bl = blades[j];
        bend = Math.sin(wind + bl.ph) * 1.6;
        g.fillStyle = bl.light ? bladeL : bladeD;
        for (var k = 0; k < bl.len; k++) {
          yy = groundTop - k;
          if (yy < 0) break;
          xx = bl.x + Math.round(bend * (k / bl.len) * (k / bl.len) * 2);
          g.fillRect(((xx % TW_FORE) + TW_FORE) % TW_FORE, yy, 1, 1);
        }
      }

      for (j = 0; j < plants.length; j++) {
        var pl = plants[j];
        var sp = flowers[pl.s];
        bend = Math.sin(wind + pl.ph) * 1.4;
        var baseY = groundTop + pl.dy - sp.height + 2;
        // gambar baris demi baris supaya bagian atas (kepala bunga) ikut melenturs
        for (var r = 0; r < sp.height; r++) {
          var up = 1 - r / sp.height;
          var shift = Math.round(bend * up * up);
          var dx = ((pl.x + shift) % TW_FORE + TW_FORE) % TW_FORE;
          g.drawImage(sp, 0, r, sp.width, 1, dx, baseY + r, sp.width, 1);
          if (dx + sp.width > TW_FORE) {
            g.drawImage(sp, 0, r, sp.width, 1, dx - TW_FORE, baseY + r, sp.width, 1);
          }
        }
      }
      out.push(c);
    }
    return out;
  };

  /* ==================================================================== *
   *  Bank sprite - dibuat sekali, dilukis ulang saat palet berubah
   * ==================================================================== */

  Scene.prototype._buildBank = function (palRgb) {
    var pix = P.pixel, S = P.sprites, b = this.bank;

    function one(key, sprite) {
      b[key] = pix.renderSprite(sprite, palRgb, null, b[key]);
    }
    function many(key, list) {
      var arr = b[key] || (b[key] = []);
      for (var i = 0; i < list.length; i++) {
        arr[i] = pix.renderSprite(list[i], palRgb, null, arr[i]);
      }
      arr.length = list.length;
    }

    one('car', S.CAR);
    many('rims', S.RIMS);
    many('clouds', S.CLOUDS);
    many('treesFar', S.TREES_FAR);
    many('treesNear', S.TREES_NEAR);
    many('flowersFar', S.FLOWERS_FAR);
    many('flowersNear', S.FLOWERS_NEAR);
    many('birds', S.BIRDS);
    many('bflies', S.BUTTERFLIES);
    one('post', S.POST);
    one('tuftFar', S.TUFT_FAR);
  };

  Scene.prototype._rebuild = function (pal) {
    var rgb = pal.matRgb, css = pal.mat;
    this._buildBank(rgb);
    this._buildSky(pal);
    var t = this.tiles;
    t.hillFar = hillTile(TW_HILLFAR, HILLFAR_BOT - HILLFAR_TOP, 1201,
      ['hillFarB', 'hillFarA', 'hillFarC'], rgb);
    t.hillNear = hillTile(TW_HILLNEAR, HILLNEAR_BOT - HILLNEAR_TOP, 5502,
      ['hillNearB', 'hillNearA', 'hillNearC'], rgb);
    t.tree = this._treeTile(rgb);
    t.farField = this._farFieldTile(rgb);
    t.mid = this._midTile(rgb, css);
    t.road = this._roadTile(rgb, css);
    t.fore = this._foreTiles(rgb, css);
    P.pixel.clearPatternCache();
    P.pixel.clearTextCache();
    this.palVersion = pal.version;
  };

  /* ==================================================================== *
   *  Blit tile berulang dengan offset parallax (offset selalu bulat)
   * ==================================================================== */

  Scene.prototype._blit = function (tile, tw, y, factor) {
    var g = this.g;
    var off = Math.floor(this.scroll * factor) % tw;
    if (off < 0) off += tw;
    var x = -off;
    while (x < W) { g.drawImage(tile, x, y); x += tw; }
  };

  /* ==================================================================== *
   *  Update: gerak dunia, partikel
   * ==================================================================== */

  Scene.prototype.update = function (dt, speed) {
    this.time += dt;
    this.scroll += speed * dt;
    this.swayPhase += dt * 1.6;

    var i, p;

    // asap knalpot
    if (speed > 2) {
      this.smokeTimer -= dt;
      if (this.smokeTimer <= 0) {
        this.smokeTimer = 0.16 + Math.random() * 0.12;
        this.smoke.push({ x: CAR_X - 1, y: CAR_GROUND - 5, vx: -14 - Math.random() * 10, vy: -5 - Math.random() * 6, life: 1, r: 1 });
        if (this.smoke.length > 22) this.smoke.shift();
      }
      if (Math.random() < dt * 22) {
        var wx = Math.random() < 0.5 ? CAR_X + 8 : CAR_X + 39;
        this.dust.push({ x: wx, y: CAR_GROUND - 1, vx: -26 - Math.random() * 22, vy: -3 - Math.random() * 8, life: 1 });
        if (this.dust.length > 26) this.dust.shift();
      }
    }
    for (i = this.smoke.length - 1; i >= 0; i--) {
      p = this.smoke[i];
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vy *= 0.985; p.r += dt * 3.4; p.life -= dt * 0.85;
      if (p.life <= 0) this.smoke.splice(i, 1);
    }
    for (i = this.dust.length - 1; i >= 0; i--) {
      p = this.dust[i];
      p.x += p.vx * dt; p.y += p.vy * dt; p.vy += dt * 18; p.life -= dt * 1.7;
      if (p.life <= 0) this.dust.splice(i, 1);
    }

    // bintang jatuh (hanya malam)
    if (this.pal && this.pal.light.starA > 0.5) {
      if (this.shoot) {
        this.shoot.t += dt;
        if (this.shoot.t > this.shoot.dur) this.shoot = null;
      } else {
        this.shootTimer -= dt;
        if (this.shootTimer <= 0) {
          this.shootTimer = 14 + Math.random() * 26;
          this.shoot = {
            t: 0, dur: 0.7,
            x: 20 + Math.random() * (W - 90),
            y: 6 + Math.random() * 40,
            dx: 62 + Math.random() * 40, dy: 34 + Math.random() * 22
          };
        }
      }
    }
  };

  /* ==================================================================== *
   *  Matahari, bulan, bintang
   * ==================================================================== */

  Scene.prototype._drawSun = function (pal) {
    var pix = P.pixel, g = this.g;
    var a = pal.light.sunA;
    if (a < 0.02) return;
    var s = pal.sun;
    if (s.y > HORIZON + 12) return;
    var R = 9;

    // sinar berdenyut - "matahari cerah"
    var pulse = 3.2 + Math.sin(this.time * 1.7) * 1.4;
    var rayCol = pal.matRgb.sunRay;
    var pat = pix.pattern(g, rayCol, Math.min(1, a * 0.85));
    if (pat) {
      g.fillStyle = pat;
      for (var k = 0; k < 8; k++) {
        var ang = k * Math.PI / 4 + this.time * 0.06;
        var len = pulse + (k % 2 === 0 ? 2.4 : 0);
        for (var q = 0; q < len; q++) {
          var rr = R + 2 + q;
          g.fillRect(Math.round(s.x + Math.cos(ang) * rr), Math.round(s.y + Math.sin(ang) * rr), 1, 1);
        }
      }
    }

    pix.circleDither(g, s.x, s.y, R + 1.6, pal.matRgb.sunEdge, Math.min(1, a * 0.55));
    pix.circleDither(g, s.x, s.y, R, pal.matRgb.sunEdge, a);
    pix.circleDither(g, s.x, s.y, R - 2.4, pal.matRgb.sunCore, a);
  };

  Scene.prototype._drawMoon = function (pal) {
    var pix = P.pixel, g = this.g;
    var a = pal.light.moonA;
    if (a < 0.02) return;
    var m = pal.moon;
    if (m.y > HORIZON + 10) return;
    var R = 7;
    // halo lembut dua lapis - dibuat tipis supaya siluet bulan tetap bulat
    pix.circleDither(g, m.x, m.y, R + 7, pal.matRgb.moonCore, a * 0.04);
    pix.circleDither(g, m.x, m.y, R + 3, pal.matRgb.moonCore, a * 0.09);
    // piringan: warna teduh dulu, lalu piringan terang digeser sedikit ke
    // kiri-atas -> menyisakan tepi 1px yang lebih gelap di kanan-bawah
    pix.circleDither(g, m.x, m.y, R, pal.matRgb.moonShade, a);
    pix.circleDither(g, m.x - 0.8, m.y - 0.8, R - 1, pal.matRgb.moonCore, a);
    // kawah: satu pixel saja, cukup pada ukuran ini
    if (a > 0.5) {
      g.fillStyle = pal.mat.moonCrater;
      g.fillRect(Math.round(m.x - 2), Math.round(m.y - 1), 1, 1);
      g.fillRect(Math.round(m.x + 1), Math.round(m.y - 3), 1, 1);
      g.fillRect(Math.round(m.x), Math.round(m.y + 2), 2, 1);
    }
  };

  Scene.prototype._drawStars = function (pal) {
    var g = this.g, pix = P.pixel;
    var a = pal.light.starA;
    if (a < 0.02) return;
    var cold = pal.mat.star, warm = pal.mat.starWarm;
    for (var i = 0; i < this.stars.length; i++) {
      var s = this.stars[i];
      var tw = 0.62 + 0.38 * Math.sin(this.time * s.sp + s.ph);
      var v = a * s.b * tw;
      if (v < 0.12) continue;
      // "alpha" pixel tunggal disimulasikan dengan ambang - tetap ala pixel-art
      if (v < 0.42 && ((s.x + s.y + Math.floor(this.time * 4)) & 1)) continue;
      g.fillStyle = s.warm ? warm : cold;
      g.fillRect(s.x, s.y, 1, 1);
      if (s.big && v > 0.6) {
        g.fillRect(s.x - 1, s.y, 1, 1); g.fillRect(s.x + 1, s.y, 1, 1);
        g.fillRect(s.x, s.y - 1, 1, 1); g.fillRect(s.x, s.y + 1, 1, 1);
      }
    }
    if (this.shoot) {
      var sh = this.shoot;
      var u = sh.t / sh.dur;
      var hx = sh.x + sh.dx * u, hy = sh.y + sh.dy * u;
      g.fillStyle = cold;
      for (var k = 0; k < 9; k++) {
        var t2 = u - k * 0.012;
        if (t2 < 0) break;
        if (k > 0 && ((k + Math.floor(this.time * 30)) % 2)) continue;
        g.fillRect(Math.round(sh.x + sh.dx * t2), Math.round(sh.y + sh.dy * t2), 1, 1);
      }
      g.fillRect(Math.round(hx), Math.round(hy), 1, 1);
    }
  };

  /* ==================================================================== *
   *  Awan & satwa
   * ==================================================================== */

  Scene.prototype._drawClouds = function (pal) {
    var g = this.g;
    var span = W + 120;
    for (var i = 0; i < this.clouds.length; i++) {
      var c = this.clouds[i];
      var sp = this.bank.clouds[c.s];
      var x = c.x - this.scroll * PX_FACTOR.cloud - this.time * c.drift;
      x = ((x % span) + span) % span - 60;
      g.drawImage(sp, Math.floor(x), c.y);
    }
  };

  Scene.prototype._drawBirds = function (pal) {
    var g = this.g;
    var a = pal.light.lightAmt;
    if (a < 0.42) return;
    var span = W + 80;
    for (var i = 0; i < this.birds.length; i++) {
      var b = this.birds[i];
      var x = b.x - this.scroll * 0.09 - this.time * b.sp;
      x = ((x % span) + span) % span - 40;
      var y = b.y + Math.sin(this.time * 0.8 + b.ph) * b.amp;
      var fr = Math.floor(this.time * b.fl + b.ph) % 3;
      g.drawImage(this.bank.birds[fr], Math.floor(x), Math.round(y));
    }
  };

  Scene.prototype._drawButterflies = function (pal) {
    var g = this.g;
    var a = pal.light.lightAmt;
    if (a < 0.45) return;
    for (var i = 0; i < this.bflies.length; i++) {
      var b = this.bflies[i];
      var x = b.x - this.scroll * 1.1 + Math.sin(this.time * b.fx + b.ph) * b.ax;
      x = ((x % (W + 30)) + (W + 30)) % (W + 30) - 15;
      var y = b.y + Math.sin(this.time * b.fy + b.ph * 2) * b.ay;
      var fr = Math.floor(this.time * b.fl) % 2;
      g.drawImage(this.bank.bflies[fr], Math.floor(x), Math.round(y));
    }
  };

  Scene.prototype._drawFireflies = function (pal) {
    var g = this.g, pix = P.pixel;
    var a = pal.light.starA;
    if (a < 0.15) return;
    var col = pal.matRgb.firefly;
    for (var i = 0; i < this.flies.length; i++) {
      var f = this.flies[i];
      var blink = Math.sin(this.time * f.bl + f.ph);
      if (blink < 0.25) continue;
      var v = a * (blink - 0.25) / 0.75;
      var x = f.x - this.scroll * 0.9 + Math.sin(this.time * f.fx + f.ph) * f.ax;
      x = ((x % (W + 24)) + (W + 24)) % (W + 24) - 12;
      var y = f.y + Math.sin(this.time * f.fy + f.ph * 1.7) * f.ay;
      pix.circleDither(g, x, y, 1.7, col, v * 0.35);
      g.fillStyle = pal.mat.firefly;
      g.fillRect(Math.round(x), Math.round(y), 1, 1);
    }
  };

  /* ==================================================================== *
   *  Mobil
   * ==================================================================== */

  Scene.prototype._drawCar = function (pal, speed) {
    var pix = P.pixel, g = this.g;
    var bob = speed > 2 ? Math.round(Math.sin(this.time * 6.4) * 0.7) : 0;
    var top = CAR_GROUND - 17 + bob;

    // bayangan: arah & panjangnya mengikuti posisi matahari
    var sunUp = pal.light.sunA > 0.05 && pal.sun.above;
    var dir = pal.sun.x > CAR_X + 24 ? -1 : 1;
    var stretch = sunUp ? (1 - pal.sun.elev) * 10 : 0;
    var shAmt = 0.20 + 0.42 * pal.light.lightAmt;
    var shX = CAR_X + 2 + (sunUp ? dir * stretch * 0.5 : 0);
    var shW = 44 + (sunUp ? stretch : 0);
    var pat = pix.pattern(g, pal.matRgb.carShadow, shAmt);
    if (pat) {
      g.fillStyle = pat;
      g.fillRect(Math.round(shX + 2), CAR_GROUND - 1, Math.round(shW - 4), 2);
      g.fillRect(Math.round(shX), CAR_GROUND, Math.round(shW), 1);
    }

    // lampu depan + kerucut cahaya
    var lampA = pal.light.lampA;
    if (lampA > 0.05) {
      var lx = CAR_X + 46, ly = top + 9;
      var LEN = 46;
      // kerucut digambar kolom per kolom supaya cahayanya meredup ke depan
      // (satu poligon rata terlihat seperti balok kuning, bukan cahaya)
      var lastAmt = -1, cur = null;
      for (var dx = 0; dx < LEN; dx++) {
        var u = dx / LEN;
        var amt = Math.round(lampA * (0.26 - 0.21 * u) * 24) / 24;
        if (amt <= 0) continue;
        if (amt !== lastAmt) { cur = pix.pattern(g, pal.matRgb.lampGlow, amt); lastAmt = amt; }
        if (!cur) continue;
        g.fillStyle = cur;
        var yTop = Math.round(ly - 1 - u * 7);
        var yBot = Math.round(ly + 2 + u * 10);
        g.fillRect(lx + dx, yTop, 1, yBot - yTop);
      }
      // genangan cahaya di aspal, meredup menjauh dari mobil
      var poolPat = pix.pattern(g, pal.matRgb.lampGlow, Math.round(lampA * 0.16 * 24) / 24);
      if (poolPat) { g.fillStyle = poolPat; g.fillRect(lx + 3, CAR_GROUND - 3, 22, 4); }
      poolPat = pix.pattern(g, pal.matRgb.lampGlow, Math.round(lampA * 0.08 * 24) / 24);
      if (poolPat) { g.fillStyle = poolPat; g.fillRect(lx + 25, CAR_GROUND - 3, 20, 4); }
      pix.circleDither(g, lx - 1, ly, 4.5, pal.matRgb.lampGlow, lampA * 0.45);
      pix.circleDither(g, lx - 1, ly, 2.2, pal.matRgb.lampGlow, lampA);
      pix.circleDither(g, CAR_X + 1, top + 9, 3.2, pal.matRgb.tailGlow, lampA * 0.40);
    }

    // asap knalpot (di belakang mobil)
    var i, p;
    for (i = 0; i < this.smoke.length; i++) {
      p = this.smoke[i];
      pix.circleDither(g, p.x, p.y, p.r, pal.matRgb.smoke, p.life * 0.30);
    }

    g.drawImage(this.bank.car, CAR_X, top);

    // pelek berputar
    var rimFrame = speed > 2 ? (Math.floor(this.scroll * 0.42) & 1) : 0;
    var rim = this.bank.rims[rimFrame];
    var wheels = P.sprites.CAR_WHEELS;
    for (i = 0; i < wheels.length; i++) {
      g.drawImage(rim, CAR_X + wheels[i].x, top + wheels[i].y);
    }

    // debu dari ban
    g.fillStyle = pal.mat.dust;
    for (i = 0; i < this.dust.length; i++) {
      p = this.dust[i];
      if (p.life > 0.35 || (Math.floor(this.time * 20) & 1)) {
        g.fillRect(Math.round(p.x), Math.round(p.y), 1, 1);
      }
    }
  };

  /* ==================================================================== *
   *  Patok reflektor di pinggir jalan (pemberi rasa kecepatan)
   * ==================================================================== */

  Scene.prototype._drawPosts = function (pal) {
    var g = this.g;
    var sp = this.bank.post;
    var SPACING = 44;
    var off = Math.floor(this.scroll * PX_FACTOR.road) % SPACING;
    if (off < 0) off += SPACING;
    for (var x = -off; x < W + SPACING; x += SPACING) {
      g.drawImage(sp, x, ROAD_TOP - sp.height + 3);
    }
  };

  /* ==================================================================== *
   *  HUD jam
   * ==================================================================== */

  Scene.prototype.drawHud = function (pal, info, opt) {
    var pix = P.pixel, F = P.font, g = this.g;
    if (!opt.showClock) return;

    var BIG = opt.bigScale || 3;
    var PADX = 5, PADY = 5, GAP = 4;

    var timeW = F.measure(info.time, 1) * BIG;
    var sideStrings = [];
    if (info.ampm) sideStrings.push(info.ampm);
    if (info.sec) sideStrings.push(info.sec);
    var sideW = 0;
    for (var i = 0; i < sideStrings.length; i++) {
      sideW = Math.max(sideW, F.measure(sideStrings[i], 1));
    }
    var topW = timeW + (sideW ? 4 + sideW : 0);

    var left = info.date || '';
    var right = info.phase || '';
    var botW = 0;
    if (left && right) botW = F.measure(left, 1) + 6 + F.measure(right, 1);
    else botW = F.measure(left || right, 1);

    var innerW = Math.max(topW, botW);
    var hasBottom = !!(left || right);
    var innerH = F.H * BIG + (hasBottom ? GAP + F.H : 0);
    var pw = innerW + PADX * 2;
    var ph = innerH + PADY * 2;
    var px0 = 6, py0 = 9;

    if (opt.showPanel) {
      pix.ditherRect(g, px0, py0, pw, ph, pal.matRgb.textOutline, 0.72);
      var edge = pix.pattern(g, pal.matRgb.panelEdge, 0.30);
      if (edge) {
        g.fillStyle = edge;
        g.fillRect(px0, py0, pw, 1);
        g.fillRect(px0, py0 + ph - 1, pw, 1);
        g.fillRect(px0, py0, 1, ph);
        g.fillRect(px0 + pw - 1, py0, 1, ph);
      }
    }

    var fill = pal.matRgb.textFill, out = pal.matRgb.textOutline;
    var tx = px0 + PADX, ty = py0 + PADY;
    pix.drawText(g, info.time, tx, ty, BIG, fill, out, 1);

    if (info.ampm) pix.drawText(g, info.ampm, tx + timeW + 4, ty + 1, 1, pal.matRgb.accent, out, 1);
    if (info.sec) {
      pix.drawText(g, info.sec, tx + timeW + 4, ty + F.H * BIG - F.H, 1, pal.matRgb.textDim, out, 1);
    }
    if (hasBottom) {
      var by = ty + F.H * BIG + GAP;
      if (left) pix.drawText(g, left, tx, by, 1, pal.matRgb.textDim, out, 1);
      if (right) {
        pix.drawText(g, right, px0 + pw - PADX - F.measure(right, 1), by, 1, pal.matRgb.accent, out, 1);
      }
    }

    if (info.badge) {
      var bw = F.measure(info.badge, 1) + 4;
      pix.ditherRect(g, px0, py0 + ph + 2, bw, F.H + 4, pal.matRgb.textOutline, 0.72);
      pix.drawText(g, info.badge, px0 + 2, py0 + ph + 4, 1, pal.matRgb.accent, out, 1);
    }
  };

  /* ==================================================================== *
   *  Frame lengkap
   * ==================================================================== */

  Scene.prototype.render = function (pal, info, opt) {
    var g = this.g;
    if (!this.pal || pal.version !== this.palVersion) {
      this.pal = pal;
      this._rebuild(pal);
    }
    this.pal = pal;

    g.clearRect(0, 0, W, H);
    g.drawImage(this.sky, 0, 0);

    this._drawStars(pal);
    this._drawMoon(pal);
    this._drawSun(pal);
    this._drawClouds(pal);
    this._drawBirds(pal);

    this._blit(this.tiles.hillFar, TW_HILLFAR, HILLFAR_TOP, PX_FACTOR.hillFar);
    this._blit(this.tiles.hillNear, TW_HILLNEAR, HILLNEAR_TOP, PX_FACTOR.hillNear);
    this._blit(this.tiles.tree, TW_TREE, TREE_TOP, PX_FACTOR.tree);
    this._blit(this.tiles.farField, TW_FARFIELD, FARFIELD_TOP, PX_FACTOR.farField);
    this._blit(this.tiles.mid, TW_MID, MID_TOP, PX_FACTOR.mid);
    this._blit(this.tiles.road, TW_ROAD, ROAD_TOP, PX_FACTOR.road);
    this._drawPosts(pal);

    this._drawCar(pal, opt.speed);

    var frame = Math.floor(this.swayPhase) % SWAY_FRAMES;
    this._blit(this.tiles.fore[frame], TW_FORE, FORE_TOP, PX_FACTOR.fore);

    this._drawFireflies(pal);
    this._drawButterflies(pal);

    this.drawHud(pal, info, opt);
  };

  P.Scene = Scene;
  P.LAYOUT = {
    W: W, H: H, HORIZON: HORIZON, ROAD_TOP: ROAD_TOP, ROAD_BOT: ROAD_BOT,
    CAR_X: CAR_X, CAR_GROUND: CAR_GROUND
  };
})(typeof self !== 'undefined' ? self : this);
