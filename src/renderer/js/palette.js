/*
 * palette.js - model pencahayaan siklus harian.
 *
 * Kunci desainnya: warna setiap benda TIDAK ditulis ulang untuk tiap jam.
 * Yang ditulis hanya (a) warna dasar/albedo material, dan (b) belasan
 * "keyframe" pencahayaan sepanjang 24 jam. Warna akhir dihitung:
 *
 *   albedo -> x warna cahaya -> x kuat cahaya -> campur ke warna ambient
 *          -> koreksi saturasi -> campur ke kabut sesuai kedalaman
 *
 * Karena semua parameter di-interpolasi mulus (smoothstep) antar keyframe,
 * peralihan pagi->siang->sore->malam tidak pernah "patah": langit, rumput,
 * aspal, dan bodi mobil bergerak bersama seperti cahaya alam sungguhan.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.PDC = root.PDC || {};
    root.PDC.palette = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  /* ============================ util warna ============================ */

  function hexToRgb(h) {
    if (Array.isArray(h)) return h;
    var s = String(h).replace('#', '');
    if (s.length === 3) s = s[0] + s[0] + s[1] + s[1] + s[2] + s[2];
    return [parseInt(s.slice(0, 2), 16), parseInt(s.slice(2, 4), 16), parseInt(s.slice(4, 6), 16)];
  }

  // Pendekatan gamma 2.0: cukup akurat, jauh lebih murah dari sRGB penuh.
  function lin(c) { var v = c / 255; return v * v; }
  function srgb(v) {
    v = v <= 0 ? 0 : Math.sqrt(v);
    v = Math.round(v * 255);
    return v < 0 ? 0 : v > 255 ? 255 : v;
  }
  function mix(a, b, t) { return a + (b - a) * t; }
  function clamp01(v) { return v < 0 ? 0 : v > 1 ? 1 : v; }
  function smoothstep(t) { t = clamp01(t); return t * t * (3 - 2 * t); }

  /** Interpolasi dua warna sRGB lewat ruang linear (tidak jadi kelabu di tengah). */
  function mixHex(a, b, t) {
    var A = hexToRgb(a), B = hexToRgb(b);
    return [
      srgb(mix(lin(A[0]), lin(B[0]), t)),
      srgb(mix(lin(A[1]), lin(B[1]), t)),
      srgb(mix(lin(A[2]), lin(B[2]), t))
    ];
  }

  function css(rgb) { return 'rgb(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ')'; }

  /* ======================= albedo material dasar ======================
   * depth 0 = paling depan (tanpa kabut), 1 = paling jauh (kabut penuh)
   * em    = seberapa "menyala sendiri" (0 = kena cahaya penuh, 1 = tak terpengaruh)
   * ==================================================================== */

  var M = {
    /* --- bukit jauh & dekat --- */
    hillFarA:      ['#7fae7a', 1.00, 0],
    hillFarB:      ['#98c48c', 1.00, 0],
    hillFarC:      ['#6a9a6a', 1.00, 0],
    hillNearA:     ['#5fa04a', 0.72, 0],
    hillNearB:     ['#7cc45e', 0.72, 0],
    hillNearC:     ['#4a8038', 0.72, 0],

    /* --- pohon jauh --- */
    treeFarLit:    ['#5f9a5a', 0.58, 0],
    treeFarMid:    ['#498046', 0.58, 0],
    treeFarDark:   ['#356034', 0.58, 0],
    treeFarTrunk:  ['#5a4632', 0.58, 0],

    /* --- pohon dekat --- */
    treeLit:       ['#68b05e', 0.44, 0],
    treeMid:       ['#458a48', 0.44, 0],
    treeDark:      ['#2f6634', 0.44, 0],
    treeTrunk:     ['#6b4a2f', 0.44, 0],

    /* --- ladang jauh --- */
    fieldFarLight: ['#7cc257', 0.36, 0],
    fieldFarDark:  ['#5aa23c', 0.36, 0],
    flowerFarA:    ['#e0708a', 0.36, 0.03],
    flowerFarB:    ['#eccb5c', 0.36, 0.03],
    flowerFarC:    ['#dcd8c4', 0.36, 0.03],

    /* --- tiang listrik pinggir jalan --- */
    poleWood:      ['#6e5540', 0.24, 0],
    poleWoodDark:  ['#4e3b2c', 0.24, 0],
    poleWire:      ['#2e2f38', 0.24, 0],

    /* --- jalan aspal --- */
    roadKerb:      ['#8d8a7e', 0.14, 0],
    gravel:        ['#a09a88', 0.14, 0],
    roadA:         ['#54575f', 0.12, 0],
    roadB:         ['#5f636c', 0.12, 0],
    roadC:         ['#4a4d55', 0.12, 0],
    roadCrack:     ['#3c3f46', 0.12, 0],
    roadLine:      ['#ece7d2', 0.12, 0.10],
    roadLineY:     ['#f0c24a', 0.12, 0.10],
    postWhite:     ['#e8e6dc', 0.12, 0.05],
    postRed:       ['#d8493c', 0.12, 0.05],
    postDark:      ['#3a3a42', 0.12, 0],

    /* --- mobil --- */
    carOutline:    ['#2b2f3a', 0.06, 0],
    carLight:      ['#f2f5f9', 0.06, 0],
    carBody:       ['#c6ccd6', 0.06, 0],
    carShade:      ['#949ca8', 0.06, 0],
    carDeep:       ['#5f6672', 0.06, 0],
    carGlass:      ['#4d7191', 0.06, 0.06],
    carGlassHi:    ['#b2d2e6', 0.06, 0.10],
    carTire:       ['#23242b', 0.06, 0],
    carRim:        ['#c0c6cf', 0.06, 0],
    carRimDark:    ['#7d838d', 0.06, 0],
    carBumper:     ['#9ea4ae', 0.06, 0],
    carTrim:       ['#3a3e48', 0.06, 0],
    carShadow:     ['#1d2430', 0.06, 0],

    /* --- kabin & pengemudi (fitur klik mobil) --- */
    cabinDark:     ['#252932', 0.06, 0],
    driverHair:    ['#2e2620', 0.06, 0],
    driverSkin:    ['#e2ae84', 0.06, 0],
    driverEye:     ['#1c1a18', 0.06, 0],
    driverShirt:   ['#3f6cc8', 0.06, 0],
    driverPants:   ['#2c3450', 0.06, 0],
    driverShoe:    ['#23242b', 0.06, 0],

    /* --- mobil lalu lintas (bentuk sama, warna bodi beda) --- */
    trafficRedBody:   ['#c8524a', 0.08, 0],
    trafficRedHi:     ['#e88a80', 0.08, 0],
    trafficRedShade:  ['#93362f', 0.08, 0],
    trafficRedDeep:   ['#5f221e', 0.08, 0],
    trafficBlueBody:  ['#4a6cc8', 0.08, 0],
    trafficBlueHi:    ['#84a4e8', 0.08, 0],
    trafficBlueShade: ['#32488f', 0.08, 0],
    trafficBlueDeep:  ['#20305f', 0.08, 0],
    trafficGreenBody: ['#4aa05a', 0.08, 0],
    trafficGreenHi:   ['#82cc8e', 0.08, 0],
    trafficGreenShade:['#2f7040', 0.08, 0],
    trafficGreenDeep: ['#1e4a2a', 0.08, 0],

    /* --- ladang bunga depan --- */
    fieldNearLight:['#74c44c', 0.00, 0],
    fieldNearDark: ['#4fa033', 0.00, 0],
    fieldNearDeep: ['#3a7a28', 0.00, 0],
    bladeLight:    ['#8ad45c', 0.00, 0],
    bladeDark:     ['#43913a', 0.00, 0],
    flowerStem:    ['#3f8a30', 0.00, 0],
    flowerCore:    ['#ffe98a', 0.00, 0.15],
    flowerRed:     ['#e8546a', 0.00, 0.05],
    flowerYellow:  ['#ffd54a', 0.00, 0.05],
    flowerWhite:   ['#fdfdf0', 0.00, 0.05],
    flowerPink:    ['#f58ab8', 0.00, 0.05],
    flowerPurple:  ['#a874e0', 0.00, 0.05],

    /* --- awan (ikut warna cahaya kuat, itulah kenapa senja jadi jingga) --- */
    cloudLit:      ['#ffffff', 0.30, 0],
    cloudMid:      ['#e2e8f2', 0.30, 0],
    cloudDark:     ['#bcc8dd', 0.30, 0],

    /* --- satwa --- */
    bird:          ['#39394a', 0.40, 0],
    butterflyWing: ['#ffb347', 0.04, 0.10],
    butterflyBody: ['#7a5a32', 0.04, 0],

    /* --- partikel --- */
    smoke:         ['#9a9aa4', 0.06, 0],
    dust:          ['#b8ad94', 0.06, 0],
    steam:         ['#c2c8d2', 0.06, 0.10],

    /* --- benda yang menyala sendiri: tidak dipengaruhi cahaya --- */
    sunCore:       ['#fffbe0', 0, 1],
    sunEdge:       ['#ffd97a', 0, 1],
    sunRay:        ['#ffe9a8', 0, 1],
    moonCore:      ['#f6f4e2', 0, 1],
    moonShade:     ['#d2d3c2', 0, 1],
    moonCrater:    ['#c2c3b0', 0, 1],
    star:          ['#ffffff', 0, 1],
    starWarm:      ['#ffe6c0', 0, 1],
    lampGlow:      ['#fff3c0', 0, 1],
    tailGlow:      ['#ff4a3a', 0, 1],
    flameCore:     ['#fff6c8', 0, 1],
    flameMid:      ['#ff9a3a', 0, 1],
    flameOut:      ['#e0452a', 0, 0.9],
    firefly:       ['#dcff8c', 0, 1],
    carLamp:       ['#fff8d8', 0.06, 0.85],
    carTail:       ['#ff5342', 0.06, 0.55],

    /* --- UI --- */
    textFill:      ['#f4f7ff', 0, 1],
    textOutline:   ['#10131f', 0, 1],
    textDim:       ['#b9c4dc', 0, 1],
    panelEdge:     ['#e6ecff', 0, 1]
  };

  /* ========================= keyframe cahaya ========================= *
   * h        : jam (0-24)
   * name     : label fase (ditampilkan di widget)
   * sky      : 4 titik gradien langit, atas -> horizon
   * light    : warna cahaya matahari/bulan
   * lightAmt : kuat cahaya 0..1
   * ambient  : warna bayangan/ambient
   * ambAmt   : seberapa kuat dunia ditarik ke warna ambient
   * sat      : pengali saturasi
   * fog      : warna kabut jarak, fogAmt: kuatnya
   * glow     : cahaya lengkung horizon (fajar/senja), glowAmt kuatnya
   * sunA/moonA/starA/lampA : opasitas matahari/bulan/bintang/lampu mobil
   * =================================================================== */

  var KEYS = [
    {
      h: 0.0, name: 'MALAM',
      sky: ['#060a1a', '#0c1330', '#141f48', '#1d2b5a'],
      light: '#8fa8ff', lightAmt: 0.14, ambient: '#111c3a', ambAmt: 0.74, sat: 0.58,
      fog: '#16224a', fogAmt: 0.38, glow: '#22305e', glowAmt: 0.08,
      sunA: 0, moonA: 1, starA: 1, lampA: 1
    },
    {
      h: 4.2, name: 'SUBUH',
      sky: ['#0c1330', '#1a2250', '#3a3468', '#6b4a6b'],
      light: '#b3a8dc', lightAmt: 0.18, ambient: '#2a2b4e', ambAmt: 0.64, sat: 0.62,
      fog: '#3c3c66', fogAmt: 0.44, glow: '#5c4a78', glowAmt: 0.30,
      sunA: 0, moonA: 0.72, starA: 0.68, lampA: 1
    },
    {
      h: 5.6, name: 'FAJAR',
      sky: ['#1c2a5a', '#4a3f78', '#9a5a72', '#e0865f'],
      light: '#ff9a6a', lightAmt: 0.34, ambient: '#4c3c5c', ambAmt: 0.46, sat: 0.86,
      fog: '#8e6c7c', fogAmt: 0.48, glow: '#ff8a4a', glowAmt: 0.72,
      sunA: 0.35, moonA: 0.26, starA: 0.20, lampA: 0.85
    },
    {
      // saat piringan matahari baru menyembul: tahap paling cepat berubah,
      // diberi keyframe sendiri supaya warnanya melewati tahap jingga dulu
      h: 6.15, name: 'FAJAR',
      sky: ['#2a4a80', '#63679e', '#c07d68', '#f5a878'],
      light: '#ffb072', lightAmt: 0.48, ambient: '#5c4f6e', ambAmt: 0.36, sat: 0.94,
      fog: '#b8907e', fogAmt: 0.44, glow: '#ff9a52', glowAmt: 0.68,
      sunA: 0.82, moonA: 0.06, starA: 0.05, lampA: 0.56
    },
    {
      h: 6.8, name: 'PAGI',
      sky: ['#3a6ba5', '#7b8fc4', '#e8a86a', '#ffd9a0'],
      light: '#ffcf95', lightAmt: 0.62, ambient: '#6e6e8e', ambAmt: 0.28, sat: 1.00,
      fog: '#d0aa88', fogAmt: 0.40, glow: '#ffc07a', glowAmt: 0.56,
      sunA: 1, moonA: 0, starA: 0, lampA: 0.32
    },
    {
      h: 8.5, name: 'PAGI',
      sky: ['#4a8fd4', '#74b3e3', '#b7dcf2', '#e9f4f8'],
      light: '#fff2d8', lightAmt: 0.86, ambient: '#a2bad0', ambAmt: 0.16, sat: 1.06,
      fog: '#d2e6f3', fogAmt: 0.27, glow: '#ffe8c0', glowAmt: 0.14,
      sunA: 1, moonA: 0, starA: 0, lampA: 0
    },
    {
      h: 12.0, name: 'SIANG',
      sky: ['#2d7ed4', '#57a4e8', '#9fd0f2', '#d8edf7'],
      light: '#ffffff', lightAmt: 1.00, ambient: '#bcd6ea', ambAmt: 0.10, sat: 1.00,
      fog: '#d2e8f6', fogAmt: 0.21, glow: '#fff8e0', glowAmt: 0.06,
      sunA: 1, moonA: 0, starA: 0, lampA: 0
    },
    {
      h: 15.5, name: 'SORE',
      sky: ['#3b7fc4', '#6fa3d8', '#c9c9e0', '#f1dab0'],
      light: '#ffe0aa', lightAmt: 0.88, ambient: '#b2b0c2', ambAmt: 0.17, sat: 1.06,
      fog: '#e2d8ca', fogAmt: 0.25, glow: '#ffd9a0', glowAmt: 0.22,
      sunA: 1, moonA: 0, starA: 0, lampA: 0
    },
    {
      h: 17.6, name: 'SENJA',
      sky: ['#2a4a86', '#6b5c9a', '#d1785e', '#ffb36b'],
      light: '#ff9d5c', lightAmt: 0.54, ambient: '#6c5a82', ambAmt: 0.35, sat: 1.12,
      fog: '#c28c7a', fogAmt: 0.40, glow: '#ff7a3a', glowAmt: 0.78,
      sunA: 1, moonA: 0.10, starA: 0.08, lampA: 0.45
    },
    {
      h: 18.8, name: 'MAGRIB',
      sky: ['#16224e', '#3a2f60', '#7a4060', '#d1653f'],
      light: '#d4694a', lightAmt: 0.27, ambient: '#3a3358', ambAmt: 0.56, sat: 0.80,
      fog: '#6c4c64', fogAmt: 0.44, glow: '#d04a2a', glowAmt: 0.52,
      sunA: 0.28, moonA: 0.52, starA: 0.50, lampA: 0.90
    },
    {
      h: 20.2, name: 'MALAM',
      sky: ['#0a1026', '#121a3c', '#1b2650', '#253363'],
      light: '#93aaf0', lightAmt: 0.15, ambient: '#141f40', ambAmt: 0.72, sat: 0.60,
      fog: '#17234c', fogAmt: 0.36, glow: '#243258', glowAmt: 0.10,
      sunA: 0, moonA: 1, starA: 1, lampA: 1
    },
    {
      h: 24.0, name: 'MALAM',
      sky: ['#060a1a', '#0c1330', '#141f48', '#1d2b5a'],
      light: '#8fa8ff', lightAmt: 0.14, ambient: '#111c3a', ambAmt: 0.74, sat: 0.58,
      fog: '#16224a', fogAmt: 0.38, glow: '#22305e', glowAmt: 0.08,
      sunA: 0, moonA: 1, starA: 1, lampA: 1
    }
  ];

  var SUNRISE = 6.0;
  var SUNSET = 18.3;

  /* ===================== interpolasi keyframe ===================== */

  function lerpKeys(hour) {
    var h = ((hour % 24) + 24) % 24;
    var i = 0;
    for (i = 0; i < KEYS.length - 1; i++) {
      if (h >= KEYS[i].h && h <= KEYS[i + 1].h) break;
    }
    if (i >= KEYS.length - 1) i = KEYS.length - 2;
    var a = KEYS[i], b = KEYS[i + 1];
    var span = b.h - a.h;
    var t = smoothstep(span <= 0 ? 0 : (h - a.h) / span);

    var sky = [];
    for (var s = 0; s < 4; s++) sky.push(mixHex(a.sky[s], b.sky[s], t));

    return {
      name: t < 0.5 ? a.name : b.name,
      sky: sky,
      light: mixHex(a.light, b.light, t),
      lightAmt: mix(a.lightAmt, b.lightAmt, t),
      ambient: mixHex(a.ambient, b.ambient, t),
      ambAmt: mix(a.ambAmt, b.ambAmt, t),
      sat: mix(a.sat, b.sat, t),
      fog: mixHex(a.fog, b.fog, t),
      fogAmt: mix(a.fogAmt, b.fogAmt, t),
      glow: mixHex(a.glow, b.glow, t),
      glowAmt: mix(a.glowAmt, b.glowAmt, t),
      sunA: mix(a.sunA, b.sunA, t),
      moonA: mix(a.moonA, b.moonA, t),
      starA: mix(a.starA, b.starA, t),
      lampA: mix(a.lampA, b.lampA, t)
    };
  }

  /* ========================= shading material ========================= */

  function shadeMaterial(baseHex, depth, em, L, pre) {
    var B = hexToRgb(baseHex);
    var r = lin(B[0]), g = lin(B[1]), b = lin(B[2]);

    // 1. warna cahaya sebagai tint (dinormalkan, lalu dilunakkan ke putih)
    r *= pre.tint[0]; g *= pre.tint[1]; b *= pre.tint[2];

    // 2. kuat cahaya
    r *= pre.k; g *= pre.k; b *= pre.k;

    // 3. tarik ke ambient (inilah yang membuat malam biru & redup)
    var aAmt = pre.ambEff;
    r = mix(r, pre.amb[0], aAmt);
    g = mix(g, pre.amb[1], aAmt);
    b = mix(b, pre.amb[2], aAmt);

    // 4. saturasi
    if (L.sat !== 1) {
      var lum = 0.299 * r + 0.587 * g + 0.114 * b;
      r = mix(lum, r, L.sat); g = mix(lum, g, L.sat); b = mix(lum, b, L.sat);
    }

    // 5. kabut jarak
    if (depth > 0 && L.fogAmt > 0) {
      var f = depth * L.fogAmt;
      r = mix(r, pre.fog[0], f); g = mix(g, pre.fog[1], f); b = mix(b, pre.fog[2], f);
    }

    // 6. benda yang menyala sendiri ditarik balik ke albedo aslinya
    if (em > 0) {
      r = mix(r, lin(B[0]), em); g = mix(g, lin(B[1]), em); b = mix(b, lin(B[2]), em);
    }

    return [srgb(r), srgb(g), srgb(b)];
  }

  var version = 0;

  /**
   * Bangun palet lengkap untuk satu jam tertentu.
   * @param {number} hour 0..24 (boleh pecahan)
   * @param {number} W lebar kanvas dasar
   * @param {number} horizonY baris horizon
   */
  function build(hour, W, horizonY) {
    var L = lerpKeys(hour);

    // pra-hitung nilai yang dipakai berulang oleh semua material
    var lc = L.light;
    var mx = Math.max(lc[0], lc[1], lc[2]) || 255;
    var TINT_STRENGTH = 0.72;
    var tint = [
      mix(1, lin(lc[0] / mx * 255), TINT_STRENGTH),
      mix(1, lin(lc[1] / mx * 255), TINT_STRENGTH),
      mix(1, lin(lc[2] / mx * 255), TINT_STRENGTH)
    ];
    var pre = {
      tint: tint,
      k: 0.24 + 0.76 * L.lightAmt,
      amb: [lin(L.ambient[0]), lin(L.ambient[1]), lin(L.ambient[2])],
      ambEff: L.ambAmt * (1 - 0.45 * L.lightAmt),
      fog: [lin(L.fog[0]), lin(L.fog[1]), lin(L.fog[2])]
    };

    var mat = {}, matRgb = {};
    for (var key in M) {
      if (!Object.prototype.hasOwnProperty.call(M, key)) continue;
      var def = M[key];
      var rgb = shadeMaterial(def[0], def[1], def[2], L, pre);
      matRgb[key] = rgb;
      mat[key] = css(rgb);
    }

    // aksen UI mengikuti warna cahaya saat ini
    var accent = [
      srgb(mix(lin(lc[0]), 1, 0.35)),
      srgb(mix(lin(lc[1]), 1, 0.35)),
      srgb(mix(lin(lc[2]), 1, 0.35))
    ];
    matRgb.accent = accent;
    mat.accent = css(accent);

    var sun = bodyPos(hour, SUNRISE, SUNSET, W, horizonY);
    var mh = hour < SUNRISE ? hour + 24 : hour;
    var moon = bodyPos(mh, SUNSET, SUNRISE + 24, W, horizonY);

    return {
      version: ++version,
      hour: hour,
      name: L.name,
      light: L,
      sky: L.sky,
      mat: mat,
      matRgb: matRgb,
      sun: sun,
      moon: moon,
      dayAmt: clamp01(L.lightAmt),
      nightAmt: clamp01(L.starA)
    };
  }

  /*
   * Lintasan matahari & bulan.
   *
   * Catatan komposisi: panel jam menempati langit kiri-atas (x 6..122).
   * Kalau lintasannya dibentang penuh dari tepi kiri ke tepi kanan, matahari
   * tertutup panel sepanjang pagi dan bulan tertutup hampir sepanjang malam -
   * padahal keduanya justru yang ingin dilihat. Jadi lintasannya dipersempit
   * ke langit kanan: terbit di ARC_X0, puncak di tengah keduanya, terbenam di
   * ARC_X1. Titik terbit/terbenam berada di bawah garis ladang sehingga yang
   * terlihat hanya cahayanya - seperti matahari muncul dari balik bukit.
   */
  var ARC_X0 = 134;
  var ARC_X1 = 248;

  function bodyPos(hour, rise, set, W, horizonY) {
    var span = set - rise;
    var u = (hour - rise) / span;
    var uc = clamp01(u);
    // Dasar lengkung hanya 3px di bawah garis ladang supaya piringan matahari
    // benar-benar terlihat saat terbit & terbenam (momen paling cantiknya),
    // bukan tertutup ladang selama setengah jam pertama.
    var arcTop = 13;
    var arcBase = horizonY + 3;
    var y = arcBase - Math.sin(uc * Math.PI) * (arcBase - arcTop);
    // di luar rentang, benda tenggelam lebih jauh di bawah horizon
    if (u < 0) y = arcBase + (-u) * 70;
    if (u > 1) y = arcBase + (u - 1) * 70;
    var x0 = ARC_X0, x1 = ARC_X1;
    if (W !== 256) {                       // skala ke lebar lain bila perlu
      x0 = ARC_X0 / 256 * W;
      x1 = ARC_X1 / 256 * W;
    }
    return {
      x: x0 + uc * (x1 - x0),
      y: y,
      u: u,
      elev: Math.sin(uc * Math.PI),
      above: u >= 0 && u <= 1
    };
  }

  /** Nama fase + salam singkat, untuk label widget. */
  function phaseLabel(hour) {
    var h = ((hour % 24) + 24) % 24;
    if (h < 4) return 'MALAM';
    if (h < 5.5) return 'SUBUH';
    if (h < 6.8) return 'FAJAR';
    if (h < 10.5) return 'PAGI';
    if (h < 15) return 'SIANG';
    if (h < 17.8) return 'SORE';
    if (h < 19) return 'SENJA';
    return 'MALAM';
  }

  return {
    build: build,
    phaseLabel: phaseLabel,
    hexToRgb: hexToRgb,
    mixHex: mixHex,
    css: css,
    smoothstep: smoothstep,
    clamp01: clamp01,
    mix: mix,
    MATERIALS: M,
    KEYS: KEYS,
    SUNRISE: SUNRISE,
    SUNSET: SUNSET
  };
});
