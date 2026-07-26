/*
 * sprites.js - semua pixel-art ditulis sebagai ASCII supaya mudah diedit tangan.
 *
 * Aturan: setiap baris dalam satu sprite HARUS sama panjang.
 * '.' selalu berarti transparan. Huruf lain dipetakan ke warna material
 * lewat tabel `map` masing-masing sprite (lihat palette.js untuk nama material).
 *
 * Jalankan `npm run validate` untuk memastikan semua baris rapi.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {
    root.PDC = root.PDC || {};
    root.PDC.sprites = api;
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function S(rows, map) {
    return { w: rows[0].length, h: rows.length, rows: rows, map: map };
  }

  /* ------------------------------------------------------------------ *
   * MOBIL - pickup silver 48x18, menghadap ke kanan.
   * Bentuk: bak belakang, kabin ganda, kap mesin panjang.
   * K outline  H sorot terang  B badan  S bayangan  D bayangan dalam
   * W kaca     w sorot kaca    T ban    R pelek     b bumper
   * L lampu depan  l lampu belakang  G spion
   * ------------------------------------------------------------------ */
  var CAR_MAP = {
    K: 'carOutline', H: 'carLight', B: 'carBody', S: 'carShade', D: 'carDeep',
    W: 'carGlass', w: 'carGlassHi', T: 'carTire', R: 'carRim', b: 'carBumper',
    L: 'carLamp', l: 'carTail', G: 'carTrim'
  };

  var CAR = S([
    '...................KKKKKKKKKKKK.................',
    '..................KHHHHHHHHHHHHK................',
    '.................KWWWWWWWWWWWWWWK...............',
    '................KWWWWWWWWBWWWWWWWK..............',
    '...............KWWwwWWWWWBWWWWwwWWK.............',
    '...............KWWWWWWWWWBWWwwWWWWWK............',
    '..............KWWWWWWWWWWBWWWWWWWWWWK...........',
    'KHHHHHHHHHHHHHKSSSSSSSSSSSSSSSSSSSSSSG..........',
    'KllBBBBBBBBBBBKBBBBBBBBBBSBBBBBBBBBBBHHHHHHHHHK.',
    'KllBBBBBBBBBBBKBBBBBBBBBBSBBBBBBBBBBBBBBBBBBLLK.',
    'KBBBSTTTTTTSBBKBBBBBBBBBBSBBBBBBBBBSTTTTTTSBLLK.',
    'KSSSTTTTTTTTSSKSSSSSSSSSSDSSSSSSSSSTTTTTTTTSbbK.',
    'KSSSTTRRRRTTSSKSSSSSSSSSSDSSSSSSSSSTTRRRRTTSbbK.',
    'KDDDTTRRRRTTDDDDDDDDDDDDDDDDDDDDDDDTTRRRRTTDDDK.',
    '....TTRRRRTTDDDDDDDDDDDDDDDDDDDDDDDTTRRRRTT.....',
    '....TTRRRRTT.......................TTRRRRTT.....',
    '.....TTTTTT.........................TTTTTT......',
    '......TTTT...........................TTTT.......'
  ], CAR_MAP);

  // Posisi pelek di dalam sprite CAR (untuk animasi putaran roda)
  var CAR_WHEELS = [{ x: 6, y: 12 }, { x: 37, y: 12 }];

  // 2 frame pelek 4x4 yang saling invers -> terbaca sebagai roda berputar
  var RIM_MAP = { R: 'carRim', S: 'carRimDark' };
  var RIMS = [
    S(['SRRS', 'RSSR', 'RSSR', 'SRRS'], RIM_MAP),
    S(['RSSR', 'SRRS', 'SRRS', 'RSSR'], RIM_MAP)
  ];

  /* ------------------------------------------------------------------ *
   * MOBIL LALU LINTAS - bentuk pickup yang sama di-mirror (hadap kiri)
   * dengan tiga warna bodi berbeda, supaya jalanan tidak sepi.
   * ------------------------------------------------------------------ */
  function mirrorRows(rows) {
    var out = [];
    for (var i = 0; i < rows.length; i++) {
      out.push(rows[i].split('').reverse().join(''));
    }
    return out;
  }

  function trafficMap(warna) {
    return {
      K: 'carOutline', H: warna + 'Hi', B: warna + 'Body', S: warna + 'Shade',
      D: warna + 'Deep', W: 'carGlass', w: 'carGlassHi', T: 'carTire',
      R: 'carRim', b: 'carBumper', L: 'carLamp', l: 'carTail', G: 'carTrim'
    };
  }

  var TRAFFIC_ROWS = mirrorRows(CAR.rows);
  var TRAFFIC = [
    S(TRAFFIC_ROWS, trafficMap('trafficRed')),
    S(TRAFFIC_ROWS, trafficMap('trafficBlue')),
    S(TRAFFIC_ROWS, trafficMap('trafficGreen'))
  ];
  // posisi pelek hasil pencerminan: x' = lebar - x - lebar_pelek
  var TRAFFIC_WHEELS = [{ x: 38, y: 12 }, { x: 7, y: 12 }];

  /* ------------------------------------------------------------------ *
   * JENDELA KABIN & PENGEMUDI - overlay 10x4 yang ditempel tepat di
   * kaca samping depan sprite CAR (anchor lokal x=26, y=3).
   * I interior gelap, h rambut, s kulit, e mata, t kemeja
   * Bentuk tiap baris mengikuti kemiringan pilar kaca aslinya.
   * ------------------------------------------------------------------ */
  var WIN_MAP = {
    I: 'cabinDark', h: 'driverHair', s: 'driverSkin', e: 'driverEye', t: 'driverShirt'
  };

  // kaca baru turun separuh: bagian atas terbuka, bawah masih kaca
  var WIN_HALF = S([
    'IIIIIII...',
    'IIIIIIII..',
    '..........',
    '..........'
  ], WIN_MAP);

  // kaca turun penuh, pengemudi menoleh: mata terbuka / terpejam (kedip).
  // Mata sengaja diapit kulit di kedua sisi - kalau ditempel ke interior
  // gelap, terbuka/terpejamnya tidak bisa dibedakan.
  var WIN_OPEN = S([
    'IhhhhII...',
    'IhssesII..',
    'IhssssIII.',
    'IIttttIIII'
  ], WIN_MAP);

  var WIN_BLINK = S([
    'IhhhhII...',
    'IhssssII..',
    'IhssssIII.',
    'IIttttIIII'
  ], WIN_MAP);

  /* ------------------------------------------------------------------ *
   * API NITRO - semburan ke belakang (kiri) dari knalpot, 2 frame.
   * F inti putih-kuning, O tengah jingga, R luar merah
   * ------------------------------------------------------------------ */
  var FLAME_MAP = { F: 'flameCore', O: 'flameMid', R: 'flameOut' };
  var FLAMES = [
    S([
      '.......ROO.',
      '..RROOOFFFF',
      '...RROOFFFF',
      '.....RROO..'
    ], FLAME_MAP),
    S([
      '....RROOO..',
      '.RROOOFFFFF',
      '..RROOFFFF.',
      '......ROO..'
    ], FLAME_MAP)
  ];

  /* ------------------------------------------------------------------ *
   * PENGEMUDI - keluar memeriksa mesin saat mogok. 5x8 (berdiri/jalan)
   * dan 8x8 (membungkuk ke kap). Versi hadap kiri dibuat dengan mirror.
   * h rambut, s kulit, t kemeja, p celana, b sepatu
   * ------------------------------------------------------------------ */
  var DRIVER_MAP = {
    h: 'driverHair', s: 'driverSkin', t: 'driverShirt', p: 'driverPants', b: 'driverShoe'
  };

  var DRIVER_STAND_ROWS = [
    '.hhh.',
    '.hsss',
    '.ttt.',
    '.ttt.',
    '.ttt.',
    '.p.p.',
    '.p.p.',
    '.b.b.'
  ];
  var DRIVER_WALK_ROWS = [
    '.hhh.',
    '.hsss',
    '.ttt.',
    '.ttt.',
    '.ttt.',
    '.p.p.',
    'p...p',
    'b...b'
  ];
  // membungkuk ke kanan, kepala menunduk ke arah mesin
  var DRIVER_BEND_ROWS = [
    '......hh',
    '.....hss',
    '..ttttt.',
    '.tt.....',
    '.pp.....',
    '.pp.....',
    '.p.p....',
    '.b.b....'
  ];

  var DRIVER = {
    stand: S(DRIVER_STAND_ROWS, DRIVER_MAP),
    walk: S(DRIVER_WALK_ROWS, DRIVER_MAP),
    standL: S(mirrorRows(DRIVER_STAND_ROWS), DRIVER_MAP),
    walkL: S(mirrorRows(DRIVER_WALK_ROWS), DRIVER_MAP),
    // membungkuk menghadap kiri: dipakai saat memeriksa mesin dari depan mobil
    bendL: S(mirrorRows(DRIVER_BEND_ROWS), DRIVER_MAP)
  };

  /* ------------------------------------------------------------------ *
   * AWAN - L sisi kena cahaya, M badan, D sisi bawah
   * ------------------------------------------------------------------ */
  var CLOUD_MAP = { L: 'cloudLit', M: 'cloudMid', D: 'cloudDark' };

  var CLOUDS = [
    S([
      '......LLLLLL............',
      '...LLLLLLLLLLL..........',
      '.LLLLLLLLLLLLLLLL.......',
      'MMMMMMMMMMMMMMMMMMM.....',
      'MMMMMMMMMMMMMMMMMMMMMM..',
      '.DDDDDDDDDDDDDDDDDDDDDD.',
      '...DDDDDDDDDDDDDDDDDD...',
      '......DDDDDDDDDD........'
    ], CLOUD_MAP),
    S([
      '.....LLLL.......',
      '..LLLLLLLLL.....',
      '.LLLLLLLLLLLL...',
      'MMMMMMMMMMMMMM..',
      '.DDDDDDDDDDDDD..',
      '...DDDDDDDD.....'
    ], CLOUD_MAP),
    S([
      '......LLLLLL........',
      '..LLLLLLLLLLLLL.....',
      'MMMMMMMMMMMMMMMMM...',
      '..DDDDDDDDDDDD......'
    ], CLOUD_MAP)
  ];

  /* ------------------------------------------------------------------ *
   * POHON & PERDU - A daun terang, B daun tengah, C daun gelap, t batang
   * Dua set: versi jauh (berkabut) dan dekat memakai map berbeda.
   * ------------------------------------------------------------------ */
  var TREE_NEAR_MAP = { A: 'treeLit', B: 'treeMid', C: 'treeDark', t: 'treeTrunk' };
  var TREE_FAR_MAP = { A: 'treeFarLit', B: 'treeFarMid', C: 'treeFarDark', t: 'treeFarTrunk' };

  var TREE_SHAPES = [
    // pohon rindang 13x16
    [
      '.....AAA.....',
      '...AAAAAAA...',
      '..AAAAAAAAA..',
      '.AAAAABBBBB..',
      'AAAAABBBBBBB.',
      'AAAABBBBBBBB.',
      '.AAABBBBBBBCC',
      '.ABBBBBBBCCC.',
      '..BBBBBBCCCC.',
      '...BBBBCCCC..',
      '.....ttC.....',
      '.....tt......',
      '.....tt......',
      '....ttt......',
      '....ttt......',
      '...CCCCC.....'
    ],
    // perdu 9x7
    [
      '...AAA...',
      '.AAAAABB.',
      'AAAABBBBC',
      'AAABBBBCC',
      '.ABBBBCC.',
      '..BBBCC..',
      '...CCC...'
    ],
    // cemara 9x14
    [
      '....A....',
      '...AAA...',
      '..AAABB..',
      '...AAB...',
      '..AAAABB.',
      '.AAAABBB.',
      '...AABB..',
      '..AAAABB.',
      '.AAAABBBC',
      'AAAAABBBC',
      '...ttt...',
      '...ttt...',
      '..tttt...',
      '..CCCC...'
    ]
  ];

  var TREES_NEAR = TREE_SHAPES.map(function (r) { return S(r, TREE_NEAR_MAP); });
  var TREES_FAR = TREE_SHAPES.map(function (r) { return S(r, TREE_FAR_MAP); });

  /* ------------------------------------------------------------------ *
   * BUNGA - P mahkota, C inti, S tangkai/daun
   * ------------------------------------------------------------------ */
  function flowerMap(petal) {
    return { P: petal, C: 'flowerCore', S: 'flowerStem' };
  }

  var FLOWER_BIG_SHAPES = [
    [
      '.PPP.',
      'PPCPP',
      '.PPP.',
      '..S..',
      '.SS..',
      '..S..',
      '..S..'
    ],
    [
      '.PPP.',
      'PP.PP',
      '.PPP.',
      '..S..',
      '..SS.',
      '..S..',
      '..S..'
    ],
    [
      '..P..',
      '.PPP.',
      'PPCPP',
      '.PPP.',
      '..S..',
      '.SS..',
      '..S..'
    ]
  ];

  var FLOWER_SMALL_SHAPES = [
    ['PPP', 'PCP', '.S.', '.S.'],
    ['.P.', 'PCP', '.P.', '.S.'],
    ['PP.', '.CP', '.S.', '.S.']
  ];

  var FLOWER_TINY_SHAPES = [
    ['.P.', 'PCP', '.P.'],
    ['P.P', '.C.', 'P.P'],
    ['.P.', '.C.', '.P.']
  ];

  var NEAR_PETALS = ['flowerRed', 'flowerYellow', 'flowerWhite', 'flowerPink', 'flowerPurple'];
  var FAR_PETALS = ['flowerFarA', 'flowerFarB', 'flowerFarC'];

  function buildFlowerSet(shapes, petals) {
    var out = [];
    for (var p = 0; p < petals.length; p++) {
      for (var s = 0; s < shapes.length; s++) {
        out.push(S(shapes[s], flowerMap(petals[p])));
      }
    }
    return out;
  }

  var FLOWERS_NEAR = buildFlowerSet(FLOWER_BIG_SHAPES, NEAR_PETALS)
    .concat(buildFlowerSet(FLOWER_SMALL_SHAPES, NEAR_PETALS));
  var FLOWERS_FAR = buildFlowerSet(FLOWER_TINY_SHAPES, FAR_PETALS);

  /* ------------------------------------------------------------------ *
   * SATWA
   * ------------------------------------------------------------------ */
  var BIRD_MAP = { b: 'bird' };
  var BIRDS = [
    S(['..b..', '.b.b.', 'b...b'], BIRD_MAP),
    S(['b...b', '.bbb.', '.....'], BIRD_MAP),
    S(['.....', 'bb.bb', '..b..'], BIRD_MAP)
  ];

  var BFLY_MAP = { A: 'butterflyWing', B: 'butterflyBody' };
  var BUTTERFLIES = [
    S(['.A.A.', 'AABAA', '.A.A.', '..B..'], BFLY_MAP),
    S(['..A..', '.ABA.', '..A..', '..B..'], BFLY_MAP)
  ];

  /* ------------------------------------------------------------------ *
   * PATOK REFLEKTOR pinggir jalan (pemberi kesan kecepatan) 2x5
   * ------------------------------------------------------------------ */
  var POST = S([
    'PP',
    'rr',
    'PP',
    'PP',
    'DD'
  ], { P: 'postWhite', r: 'postRed', D: 'postDark' });

  /* ------------------------------------------------------------------ *
   * RUMPUT BELAKANG (tuft kecil untuk ladang jauh) 4x3
   * ------------------------------------------------------------------ */
  var TUFT_FAR = S([
    '.g..',
    'g.g.',
    'ghgh'
  ], { g: 'fieldFarLight', h: 'fieldFarDark' });

  return {
    CAR: CAR,
    CAR_WHEELS: CAR_WHEELS,
    RIMS: RIMS,
    TRAFFIC: TRAFFIC,
    TRAFFIC_WHEELS: TRAFFIC_WHEELS,
    WIN_HALF: WIN_HALF,
    WIN_OPEN: WIN_OPEN,
    WIN_BLINK: WIN_BLINK,
    FLAMES: FLAMES,
    DRIVER: DRIVER,
    CLOUDS: CLOUDS,
    TREES_NEAR: TREES_NEAR,
    TREES_FAR: TREES_FAR,
    FLOWERS_NEAR: FLOWERS_NEAR,
    FLOWERS_FAR: FLOWERS_FAR,
    BIRDS: BIRDS,
    BUTTERFLIES: BUTTERFLIES,
    POST: POST,
    TUFT_FAR: TUFT_FAR
  };
});
