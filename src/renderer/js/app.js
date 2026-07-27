/*
 * app.js - perekat: setelan, antarmuka, dan loop render.
 * Berjalan baik di dalam Electron (window.widgetAPI ada) maupun langsung
 * dibuka di browser (setelan disimpan ke localStorage).
 */
(function () {
  'use strict';
  var P = window.PDC;
  var api = null;
  if (typeof Neutralino !== 'undefined') {
    Neutralino.init();
    Neutralino.events.on('trayMenuItemClicked', function(evt) {
      if (evt.detail.id === 'SHOW') Neutralino.window.show();
      if (evt.detail.id === 'QUIT') Neutralino.app.exit();
    });
    Neutralino.os.setTray({
      icon: '/assets/icon.png',
      menuItems: [
        { id: 'SHOW', text: 'Tampilkan Widget' },
        { id: 'QUIT', text: 'Tutup' }
      ]
    });
    api = {
      setSettings: function(s) { try { localStorage.setItem('pdc-settings', JSON.stringify(s)); } catch(e){} },
      setScale: function(s) { 
        Neutralino.window.setSize({width: 256 * s, height: 144 * s});
      },
      setOpacity: function(o) { document.body.style.opacity = o; },
      setAlwaysOnTop: function(t) { Neutralino.window.setAlwaysOnTop(t); },
      setAutoStart: function(t) { },
      hide: function() { Neutralino.window.hide(); },
      quit: function() { Neutralino.app.exit(); },
      getSettings: function() { 
        return new Promise(function(resolve) {
          try { resolve(JSON.parse(localStorage.getItem('pdc-settings') || '{}')); }
          catch(e) { resolve({}); }
        });
      }
    };
  } else if (window.widgetAPI) {
    api = window.widgetAPI;
  }
  var BASE_W = P.Scene.W, BASE_H = P.Scene.H;

  var DEFAULTS = {
    scale: 2,
    hour12: false,
    showSeconds: true,
    showDate: true,
    showPhase: true,
    showClock: true,
    showPanel: true,
    speed: 55,
    fps: 30,
    eco: true,
    opacity: 100,
    alwaysOnTop: true,
    autoStart: false,
    lowPower: true,
    mode: 'live',
    tzOffsetMin: null,
    manualMinutes: 720,
    demoSecPerDay: 60
  };

  var S = {};
  for (var k in DEFAULTS) S[k] = DEFAULTS[k];

  var canvas = document.getElementById('scene');
  var widget = document.getElementById('widget');
  var panel = document.getElementById('panel');
  var scene = new P.Scene(canvas);
  var clock = new P.Clock();

  var pal = null;
  var palDirty = true;
  var lastPalHour = 0;
  var lastPalMs = -1e9;
  var PAL_MIN_MS = 180;             // maksimum ~5 kali bangun palet per detik
  var PAL_MIN_HOUR = 0.5 / 60;      // atau tiap setengah menit waktu adegan

  var isCapture = /(\?|&)capture=1/.test(location.search);

  /* ======================== penyimpanan setelan ======================== */

  var saveTimer = null;

  function readLocal() {
    try { return JSON.parse(localStorage.getItem('pdc-settings') || '{}'); }
    catch (e) { return {}; }
  }

  function persist() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(function () {
      saveTimer = null;
      if (api) api.setSettings(S);
      else { try { localStorage.setItem('pdc-settings', JSON.stringify(S)); } catch (e) {} }
    }, 250);
  }

  /** Kirim segera setelan yang masih menunggu jeda 250 ms - dipanggil saat
   *  widget akan ditutup, supaya perubahan detik-detik terakhir tidak hilang. */
  function flushPersist() {
    if (!saveTimer) return;
    clearTimeout(saveTimer);
    saveTimer = null;
    if (api) api.setSettings(S);
    else { try { localStorage.setItem('pdc-settings', JSON.stringify(S)); } catch (e) {} }
  }

  /* =========================== terapkan setelan =========================== */

  function applyScale(fromMain) {
    var w = BASE_W * S.scale, h = BASE_H * S.scale;
    widget.style.width = w + 'px';
    widget.style.height = h + 'px';
    document.body.style.width = w + 'px';
    document.body.style.height = h + 'px';
    // fromMain: jendela sudah diubah proses utama (menu tray) - jangan
    // dikirim balik, nanti saling menimpa
    if (api && !fromMain) api.setScale(S.scale);
  }

  function applyClockMode() {
    clock.mode = S.mode;
    clock.tzOffsetMin = S.tzOffsetMin;
    clock.manualHour = S.manualMinutes / 60;
    clock.demoDayPerSec = 1 / Math.max(5, S.demoSecPerDay);
  }

  function applyWindow() {
    if (!api) return;
    api.setOpacity(S.opacity / 100);
    api.setAlwaysOnTop(!!S.alwaysOnTop);
  }

  function forcePalette() { palDirty = true; }

  /* ============================== palet ============================== */

  /** Jarak dua jam pada lingkaran 24 jam (23:59 dan 00:01 = 2 menit). */
  function hourDist(a, b) {
    var d = Math.abs(a - b) % 24;
    return d > 12 ? 24 - d : d;
  }

  function ensurePalette(hour, nowMs) {
    if (pal && !palDirty) {
      // belum cukup berubah, atau baru saja dibangun -> pakai yang lama
      if (hourDist(hour, lastPalHour) < PAL_MIN_HOUR) return pal;
      if (nowMs - lastPalMs < PAL_MIN_MS) return pal;
    }
    palDirty = false;
    lastPalHour = hour;
    lastPalMs = nowMs;
    pal = P.palette.build(hour, BASE_W, P.LAYOUT.HORIZON);
    return pal;
  }

  function renderOpts() {
    return {
      showClock: S.showClock,
      showPanel: S.showPanel,
      speed: S.speed * 0.62,
      bigScale: 3
    };
  }

  function clockOpts() {
    return {
      hour12: S.hour12,
      showSeconds: S.showSeconds,
      showDate: S.showDate,
      showPhase: S.showPhase
    };
  }

  /* ============================ loop render ============================ */

  var last = 0, acc = 0, running = false;
  var carHitOn = null;

  /** Area klik mobil hanya aktif saat animasinya bisa dipicu; selebihnya
   *  wilayah itu kembali berfungsi sebagai pegangan geser widget. */
  function syncCarHit() {
    var on = !isCapture && scene.carClickable();
    if (on === carHitOn) return;
    carHitOn = on;
    el['car-hit'].classList.toggle('aktif', on);
  }

  function targetFps() {
    if (S.eco && !document.hasFocus()) return 12;
    // penjagaan: fps 0 akan membuat interval jadi Infinity dan layar membeku
    return S.fps >= 1 ? S.fps : 30;
  }

  function frame(now) {
    if (!running) return;
    requestAnimationFrame(frame);
    if (document.hidden) { last = now; return; }

    var dt = (now - last) / 1000;
    last = now;
    if (dt > 0.25) dt = 0.25;
    if (dt < 0) dt = 0;

    var interval = 1 / targetFps();
    acc += dt;
    if (acc < interval) return;
    var step = acc;
    acc = 0;

    clock.update(step);
    var info = clock.info(clockOpts());
    var opt = renderOpts();
    scene.update(step, opt.speed);
    var p = ensurePalette(info.hour, now);
    scene.render(p, info, opt);
    syncCarHit();
  }

  function start() {
    if (running) return;
    running = true;
    last = performance.now();
    acc = 1;
    requestAnimationFrame(frame);
  }

  /* ======================= mode tangkap gambar ======================= *
   * Dipakai `electron . --capture` untuk menyimpan PNG tiap jam tertentu,
   * berguna untuk memeriksa hasil gambar tanpa harus membuka jendela.
   * ================================================================== */

  window.__capture = function (hour, up) {
    up = up || 3;
    clock.mode = 'manual';
    clock.manualHour = hour;
    scene.time = 4.2;
    scene.scroll = 213;
    scene.swayPhase = 1.1;
    forcePalette();
    var info = clock.info({ hour12: false, showSeconds: true, showDate: true, showPhase: true });
    var p = ensurePalette(hour, 1e12);
    scene.render(p, info, { showClock: true, showPanel: true, speed: 34, bigScale: 3 });
    var c = document.createElement('canvas');
    c.width = BASE_W * up; c.height = BASE_H * up;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  };

  /**
   * Tangkap satu fase animasi klik-mobil pada titik waktunya (untuk
   * `electron . --capture --event=...`). Keadaan event dipaksa lalu dunia
   * disimulasikan ~3 detik supaya partikel (uap, asap, debu) ikut terbentuk.
   */
  window.__captureEvent = function (phase, tt, hour, up) {
    up = up || 3;
    clock.mode = 'manual';
    clock.manualHour = hour;
    scene.time = 4.2;
    scene.scroll = 213;
    scene.swayPhase = 1.1;
    scene.smoke.length = 0; scene.dust.length = 0;
    scene.steam.length = 0; scene.traffic.length = 0;
    scene.trafficTimer = 999;   // jangan ada mobil lain di tangkapan fase
    forcePalette();
    for (var k = 0; k < 40; k++) {
      scene.ev.phase = phase;
      scene.ev.t = tt;
      if (phase === 'mogok') scene.ev.breakDur = 60;
      scene.update(0.08, 34);
    }
    scene.ev.phase = phase;
    scene.ev.t = tt;
    var info = clock.info({ hour12: false, showSeconds: true, showDate: true, showPhase: true });
    var p = ensurePalette(hour, 1e12);
    scene.render(p, info, { showClock: true, showPanel: true, speed: 34, bigScale: 3 });
    var c = document.createElement('canvas');
    c.width = BASE_W * up; c.height = BASE_H * up;
    var g = c.getContext('2d');
    g.imageSmoothingEnabled = false;
    g.drawImage(canvas, 0, 0, c.width, c.height);
    return c.toDataURL('image/png');
  };

  /* ============================ antarmuka ============================ */

  var el = {};
  ['btn-settings', 'btn-min', 'btn-close', 'panel-close', 'seg-mode', 'grp-manual',
   'rng-manual', 'lbl-manual', 'grp-demo', 'rng-demo', 'lbl-demo', 'sel-tz',
   'seg-fmt', 'chk-clock', 'chk-sec', 'chk-date', 'chk-phase', 'chk-panel', 'seg-scale',
   'rng-speed', 'lbl-speed', 'seg-fps', 'chk-eco', 'rng-op', 'lbl-op',
   'chk-top', 'chk-auto', 'chk-lowpower', 'btn-reset', 'grp-tz',
   'car-hit'].forEach(function (id) {
    el[id] = document.getElementById(id);
  });

  function fmtHM(mins) {
    var h = Math.floor(mins / 60), m = mins % 60;
    return (h < 10 ? '0' : '') + h + ':' + (m < 10 ? '0' : '') + m;
  }

  function tzLabel(o) {
    var sign = o < 0 ? '-' : '+';
    var a = Math.abs(o);
    return 'UTC' + sign + (Math.floor(a / 60) < 10 ? '0' : '') + Math.floor(a / 60) +
      ':' + (a % 60 < 10 ? '0' : '') + (a % 60);
  }

  function buildTzOptions() {
    var offs = [-720, -660, -600, -540, -480, -420, -360, -300, -270, -240, -210, -180,
      -120, -60, 0, 60, 120, 180, 210, 240, 270, 300, 330, 345, 360, 390, 420, 480,
      525, 540, 570, 600, 630, 660, 720, 765, 780, 840];
    var html = '<option value="sys">Ikuti jam sistem</option>';
    for (var i = 0; i < offs.length; i++) {
      var o = offs[i];
      var lab = tzLabel(o);
      if (o === 420) lab += '  (WIB)';
      if (o === 480) lab += '  (WITA)';
      if (o === 540) lab += '  (WIT)';
      html += '<option value="' + o + '">' + lab + '</option>';
    }
    el['sel-tz'].innerHTML = html;
  }

  function setSeg(seg, attr, value) {
    var bs = seg.querySelectorAll('button');
    for (var i = 0; i < bs.length; i++) {
      bs[i].classList.toggle('on', String(bs[i].getAttribute(attr)) === String(value));
    }
  }

  function syncUI() {
    setSeg(el['seg-mode'], 'data-mode', S.mode);
    setSeg(el['seg-fmt'], 'data-h12', S.hour12 ? '1' : '0');
    setSeg(el['seg-scale'], 'data-scale', S.scale);
    setSeg(el['seg-fps'], 'data-fps', S.fps);

    el['grp-manual'].hidden = S.mode !== 'manual';
    el['grp-demo'].hidden = S.mode !== 'demo';
    el['grp-tz'].hidden = S.mode !== 'live';

    el['rng-manual'].value = S.manualMinutes;
    el['lbl-manual'].textContent = fmtHM(S.manualMinutes);
    el['rng-demo'].value = S.demoSecPerDay;
    el['lbl-demo'].textContent = S.demoSecPerDay + ' s / hari';
    el['sel-tz'].value = S.tzOffsetMin == null ? 'sys' : String(S.tzOffsetMin);
    if (el['sel-tz'].selectedIndex < 0) {
      // offset sah hasil edit tangan yang tidak ada di daftar (mis. 90):
      // tampilkan apa adanya supaya dropdown tidak terlihat kosong
      var ekstra = document.createElement('option');
      ekstra.value = String(S.tzOffsetMin);
      ekstra.textContent = tzLabel(S.tzOffsetMin) + '  (khusus)';
      el['sel-tz'].appendChild(ekstra);
      el['sel-tz'].value = String(S.tzOffsetMin);
    }

    el['chk-clock'].checked = !!S.showClock;
    el['chk-sec'].checked = !!S.showSeconds;
    el['chk-date'].checked = !!S.showDate;
    el['chk-phase'].checked = !!S.showPhase;
    el['chk-panel'].checked = !!S.showPanel;
    el['chk-eco'].checked = !!S.eco;
    el['chk-top'].checked = !!S.alwaysOnTop;
    el['chk-auto'].checked = !!S.autoStart;
    el['chk-lowpower'].checked = !!S.lowPower;

    el['rng-speed'].value = S.speed;
    el['lbl-speed'].textContent = S.speed;
    el['rng-op'].value = S.opacity;
    el['lbl-op'].textContent = S.opacity + '%';
  }

  function togglePanel(show) {
    panel.hidden = show == null ? !panel.hidden : !show;
  }

  function wireUI() {
    buildTzOptions();

    el['btn-settings'].onclick = function () { togglePanel(); };
    el['panel-close'].onclick = function () { togglePanel(false); };
    widget.addEventListener('contextmenu', function (e) { e.preventDefault(); togglePanel(); });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') togglePanel(false);
    });

    el['btn-min'].onclick = function () { if (api) api.hide(); else togglePanel(false); };
    el['btn-close'].onclick = function () { flushPersist(); if (api) api.quit(); else window.close(); };
    window.addEventListener('beforeunload', flushPersist);

    el['seg-mode'].onclick = function (e) {
      var m = e.target.getAttribute('data-mode');
      if (!m) return;
      S.mode = m;
      if (m === 'demo') clock.demoHour = clock.sceneHour();
      applyClockMode(); forcePalette(); syncUI(); persist();
    };

    el['seg-fmt'].onclick = function (e) {
      var v = e.target.getAttribute('data-h12');
      if (v == null) return;
      S.hour12 = v === '1'; syncUI(); persist();
    };

    el['seg-scale'].onclick = function (e) {
      var v = e.target.getAttribute('data-scale');
      if (!v) return;
      S.scale = parseInt(v, 10); applyScale(); syncUI(); persist();
    };

    el['seg-fps'].onclick = function (e) {
      var v = e.target.getAttribute('data-fps');
      if (!v) return;
      S.fps = parseInt(v, 10); syncUI(); persist();
    };

    el['rng-manual'].oninput = function () {
      S.manualMinutes = parseInt(this.value, 10);
      el['lbl-manual'].textContent = fmtHM(S.manualMinutes);
      clock.manualHour = S.manualMinutes / 60;
      forcePalette(); persist();
    };

    el['rng-demo'].oninput = function () {
      S.demoSecPerDay = parseInt(this.value, 10);
      el['lbl-demo'].textContent = S.demoSecPerDay + ' s / hari';
      applyClockMode(); persist();
    };

    el['sel-tz'].onchange = function () {
      S.tzOffsetMin = this.value === 'sys' ? null : parseInt(this.value, 10);
      applyClockMode(); forcePalette(); persist();
    };

    function chk(id, key, after) {
      el[id].onchange = function () {
        S[key] = this.checked;
        if (after) after();
        persist();
      };
    }
    chk('chk-clock', 'showClock');
    chk('chk-sec', 'showSeconds');
    chk('chk-date', 'showDate');
    chk('chk-phase', 'showPhase');
    chk('chk-panel', 'showPanel');
    chk('chk-eco', 'eco');
    chk('chk-top', 'alwaysOnTop', function () { if (api) api.setAlwaysOnTop(S.alwaysOnTop); });
    chk('chk-auto', 'autoStart', function () { if (api) api.setAutoStart(S.autoStart); });
    chk('chk-lowpower', 'lowPower');   // berlaku saat widget dijalankan ulang

    el['rng-speed'].oninput = function () {
      S.speed = parseInt(this.value, 10);
      el['lbl-speed'].textContent = S.speed;
      persist();
    };

    el['rng-op'].oninput = function () {
      S.opacity = parseInt(this.value, 10);
      el['lbl-op'].textContent = S.opacity + '%';
      if (api) api.setOpacity(S.opacity / 100);
      persist();
    };

    el['btn-reset'].onclick = function () {
      for (var key in DEFAULTS) S[key] = DEFAULTS[key];
      applyScale(); applyClockMode(); applyWindow(); forcePalette(); syncUI(); persist();
    };

    // klik mobil -> kedipan + nitro; scene menolak sendiri selama animasi
    // dan jeda 30-100 detik masih berjalan
    el['car-hit'].onclick = function () { scene.pokeCar(); };
  }

  /* ============================== mulai ============================== */

  /**
   * Sisi renderer juga menjaga diri sendiri: setelan bisa datang dari
   * localStorage (saat berkas dibuka langsung di browser) yang tidak melewati
   * pembersihan di proses utama.
   */
  function sanitize() {
    // Hanya angka atau string angka yang diterima: Number() memetakan null,
    // '', false, dan [] ke 0, dan 0 lolos isFinite - nilai seperti itu harus
    // jatuh ke bawaan, bukan ke batas bawah rentang.
    function asNum(v) {
      if (typeof v !== 'number' && (typeof v !== 'string' || v.trim() === '')) return NaN;
      return Number(v);
    }
    function num(v, min, max, fb) {
      var n = asNum(v);
      if (!isFinite(n)) return fb;
      return Math.min(max, Math.max(min, n));
    }
    S.scale = Math.round(num(S.scale, 1, 4, DEFAULTS.scale));
    S.opacity = Math.round(num(S.opacity, 35, 100, DEFAULTS.opacity));
    S.speed = Math.round(num(S.speed, 0, 100, DEFAULTS.speed));
    S.manualMinutes = Math.round(num(S.manualMinutes, 0, 1439, DEFAULTS.manualMinutes));
    S.demoSecPerDay = Math.round(num(S.demoSecPerDay, 10, 240, DEFAULTS.demoSecPerDay));
    if ([15, 30, 60].indexOf(S.fps) < 0) S.fps = DEFAULTS.fps;
    if (['live', 'manual', 'demo'].indexOf(S.mode) < 0) S.mode = DEFAULTS.mode;
    if (S.tzOffsetMin !== null) {
      var tz = asNum(S.tzOffsetMin);
      S.tzOffsetMin = (isFinite(tz) && tz >= -720 && tz <= 840) ? Math.round(tz) : null;
    }
    var flags = ['hour12', 'showSeconds', 'showDate', 'showPhase', 'showClock',
                 'showPanel', 'eco', 'alwaysOnTop', 'autoStart', 'lowPower'];
    for (var i = 0; i < flags.length; i++) {
      if (typeof S[flags[i]] !== 'boolean') S[flags[i]] = DEFAULTS[flags[i]];
    }
  }

  function boot(loaded) {
    if (loaded) for (var key in DEFAULTS) if (loaded[key] !== undefined) S[key] = loaded[key];
    sanitize();
    if (api) document.body.classList.add('electron');
    if (isCapture) {
      document.body.classList.add('capture');
      panel.hidden = true;
      S.scale = 1;
    }
    applyScale();
    applyClockMode();
    applyWindow();
    wireUI();
    syncUI();
    if (api && api.onSettingsChanged) {
      // Perubahan dari menu tray (ukuran / selalu di atas / autostart).
      // Proses utama sudah menyimpan dan menerapkan sisi jendelanya; di sini
      // cukup selaraskan S dan tampilan. Tanpa ini S renderer jadi basi, dan
      // persist() berikutnya membatalkan perubahan tray secara diam-diam.
      api.onSettingsChanged(function (patch) {
        if (!patch || typeof patch !== 'object') return;
        for (var key in patch) {
          if (DEFAULTS[key] !== undefined) S[key] = patch[key];
        }
        sanitize();
        if (patch.scale !== undefined) applyScale(true);
        syncUI();
      });
    }
    if (api && S.autoStart) api.setAutoStart(true);
    if (!isCapture) start();
    window.__ready = true;
  }

  if (api && api.getSettings) {
    api.getSettings().then(boot, function () { boot(readLocal()); });
  } else {
    boot(readLocal());
  }
})();
