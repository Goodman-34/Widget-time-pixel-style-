/*
 * main.js - proses utama Electron.
 * Membuat jendela widget tanpa bingkai, transparan, bisa "selalu di atas",
 * plus ikon tray dan penyimpanan setelan di folder data pengguna.
 *
 * Mode tambahan: `electron . --capture` menyimpan tangkapan PNG pemandangan
 * pada beberapa jam berbeda (dipakai untuk memeriksa hasil pixel-art).
 */
'use strict';

const { app, BrowserWindow, Tray, Menu, ipcMain, nativeImage, screen } = require('electron');
const fs = require('fs');
const path = require('path');

const BASE_W = 256;
const BASE_H = 144;

const RENDERER = path.join(__dirname, 'renderer', 'index.html');
const PRELOAD = path.join(__dirname, 'preload.js');
const ASSETS = path.join(__dirname, 'assets');

const DEFAULTS = {
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
  demoSecPerDay: 60,
  winX: null,
  winY: null
};

/* ----------------------------- setelan ----------------------------- */

let settingsPath = null;
let settings = Object.assign({}, DEFAULTS);
let saveTimer = null;

/**
 * Kembalikan setelan ke rentang yang masuk akal.
 *
 * settings.json adalah berkas teks biasa di folder pengguna: bisa rusak karena
 * mati listrik saat menyimpan, bisa juga diedit tangan. Tanpa penjagaan ini,
 * satu angka aneh sudah cukup membuat widget tidak bisa dipakai lagi -
 * misalnya scale 999 (jendela selebar 255.744 px), opacity 0 (tak terlihat
 * sama sekali, panel setelan ikut hilang), atau fps 0 (layar membeku).
 * Semua kasus itu tidak akan bisa diperbaiki lewat antarmuka.
 */
function sanitizeSettings() {
  // Hanya angka atau string angka yang diterima. Number() memetakan banyak
  // nilai aneh ke 0 (null, '', false, []), dan 0 lolos pemeriksaan isFinite -
  // itulah cara bug "posisi 0,0" dulu terjadi.
  const asNum = (v) => {
    if (typeof v !== 'number' && (typeof v !== 'string' || v.trim() === '')) return NaN;
    return Number(v);
  };
  const num = (v, min, max, fallback) => {
    const n = asNum(v);
    if (!Number.isFinite(n)) return fallback;
    return Math.min(max, Math.max(min, n));
  };
  const bool = (v, fallback) => (typeof v === 'boolean' ? v : fallback);

  settings.scale = Math.round(num(settings.scale, 1, 4, DEFAULTS.scale));
  settings.opacity = Math.round(num(settings.opacity, 35, 100, DEFAULTS.opacity));
  settings.speed = Math.round(num(settings.speed, 0, 100, DEFAULTS.speed));
  settings.manualMinutes = Math.round(num(settings.manualMinutes, 0, 1439, DEFAULTS.manualMinutes));
  settings.demoSecPerDay = Math.round(num(settings.demoSecPerDay, 10, 240, DEFAULTS.demoSecPerDay));

  if (![15, 30, 60].includes(settings.fps)) settings.fps = DEFAULTS.fps;
  if (!['live', 'manual', 'demo'].includes(settings.mode)) settings.mode = DEFAULTS.mode;
  if (settings.tzOffsetMin !== null) {
    const tz = asNum(settings.tzOffsetMin);
    settings.tzOffsetMin = Number.isFinite(tz) && tz >= -720 && tz <= 840 ? Math.round(tz) : null;
  }

  for (const k of ['hour12', 'showSeconds', 'showDate', 'showPhase', 'showClock',
                   'showPanel', 'eco', 'alwaysOnTop', 'autoStart', 'lowPower']) {
    settings[k] = bool(settings[k], DEFAULTS[k]);
  }
  for (const k of ['winX', 'winY']) {
    // Hati-hati: Number(null) bernilai 0, bukan NaN. Kalau null diperlakukan
    // sebagai angka, posisi "belum pernah diatur" berubah jadi koordinat 0,0
    // dan widget selalu muncul di pojok kiri-atas, bukan di kanan-atas.
    const v = asNum(settings[k]);
    settings[k] = Number.isFinite(v) ? Math.round(v) : null;
  }
}

function loadSettings() {
  // getPath('userData') sudah tersedia sebelum app siap, jadi setelan bisa
  // dibaca lebih awal - dibutuhkan karena disableHardwareAcceleration()
  // wajib dipanggil sebelum event 'ready'.
  settingsPath = path.join(app.getPath('userData'), 'settings.json');
  try {
    let raw = fs.readFileSync(settingsPath, 'utf8');
    // Notepad menyimpan berkas UTF-8 dengan BOM di depan, dan JSON.parse
    // langsung gagal karenanya. Buang supaya setelan yang diedit tangan
    // tidak diam-diam kembali ke bawaan.
    if (raw.charCodeAt(0) === 0xFEFF) raw = raw.slice(1);
    const obj = JSON.parse(raw);
    if (obj && typeof obj === 'object') {
      for (const k of Object.keys(DEFAULTS)) {
        if (obj[k] !== undefined) settings[k] = obj[k];
      }
    }
  } catch (e) { /* pertama kali dijalankan atau berkas rusak: pakai bawaan */ }
  sanitizeSettings();
}

function saveSettings() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    saveTimer = null;
    try {
      fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
      fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
    } catch (e) { console.error('gagal menyimpan setelan:', e.message); }
  }, 400);
}

function flushSettings() {
  if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
  try {
    fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
    fs.writeFileSync(settingsPath, JSON.stringify(settings, null, 2), 'utf8');
  } catch (e) { /* diam saja saat keluar */ }
}

/* ------------------------------ ikon ------------------------------ */

function imageOrEmpty(file) {
  try {
    const p = path.join(ASSETS, file);
    if (fs.existsSync(p)) {
      const img = nativeImage.createFromPath(p);
      if (!img.isEmpty()) return img;
    }
  } catch (e) { /* abaikan */ }
  return nativeImage.createEmpty();
}

/* ----------------------------- jendela ----------------------------- */

let win = null;
let tray = null;
let quitting = false;

/**
 * Pastikan posisi tersimpan masih terlihat di salah satu layar.
 * Penting saat pengguna mencabut monitor kedua atau mengganti resolusi:
 * tanpa ini widget bisa muncul di koordinat yang tidak ada layarnya dan
 * seolah-olah hilang.
 */
function clampToScreen(x, y, w, h) {
  if (x == null || y == null) return null;
  const MIN_VISIBLE = 80;                 // minimal bagian yang harus terlihat
  for (const a of screen.getAllDisplays().map(d => d.workArea)) {
    const overlapX = Math.min(x + w, a.x + a.width) - Math.max(x, a.x);
    const overlapY = Math.min(y + h, a.y + a.height) - Math.max(y, a.y);
    if (overlapX >= Math.min(MIN_VISIBLE, w) && overlapY >= Math.min(MIN_VISIBLE, h)) {
      return { x: Math.round(x), y: Math.round(y) };
    }
  }
  return null;
}

/** Geser jendela kembali ke dalam layar bila ukurannya membuatnya keluar. */
function nudgeIntoScreen() {
  if (!win || win.isDestroyed()) return;
  const b = win.getBounds();
  if (clampToScreen(b.x, b.y, b.width, b.height)) return;
  // layar yang paling dekat dengan posisi jendela sekarang - bukan layar
  // utama, supaya widget di monitor kedua tidak mendadak berpindah monitor
  const a = screen.getDisplayMatching(b).workArea;
  win.setPosition(
    Math.max(a.x, Math.min(b.x, a.x + a.width - b.width)),
    Math.max(a.y, Math.min(b.y, a.y + a.height - b.height))
  );
}

function createWindow() {
  const w = BASE_W * settings.scale;
  const h = BASE_H * settings.scale;
  const pos = clampToScreen(settings.winX, settings.winY, w, h);

  win = new BrowserWindow({
    width: w,
    height: h,
    x: pos ? pos.x : undefined,
    y: pos ? pos.y : undefined,
    useContentSize: true,
    frame: false,
    transparent: true,
    hasShadow: false,
    resizable: false,
    maximizable: false,
    fullscreenable: false,
    skipTaskbar: true,
    autoHideMenuBar: true,
    backgroundColor: '#00000000',
    icon: imageOrEmpty('icon.png'),
    show: false,
    webPreferences: {
      preload: PRELOAD,
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      backgroundThrottling: false,
      spellcheck: false
    }
  });

  win.setMenuBarVisibility(false);
  applyAlwaysOnTop(settings.alwaysOnTop);
  win.setOpacity(settings.opacity / 100);

  win.loadFile(RENDERER);

  win.once('ready-to-show', () => {
    win.show();
    if (!pos) centerTopRight();
  });

  const remember = () => {
    if (!win || win.isDestroyed() || win.isMinimized()) return;
    const b = win.getBounds();
    settings.winX = b.x;
    settings.winY = b.y;
    saveSettings();
  };
  win.on('moved', remember);
  win.on('resized', remember);

  win.on('close', (e) => {
    // Sembunyikan ke tray hanya kalau tray-nya memang ada. Tanpa tray,
    // menyembunyikan jendela sama saja membuat aplikasi tidak bisa ditutup.
    if (!quitting && tray) { e.preventDefault(); win.hide(); }
  });
  win.on('closed', () => { win = null; });

  // widget tidak boleh berpindah halaman atau membuka jendela baru
  win.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  win.webContents.on('will-navigate', (e) => e.preventDefault());
}

function centerTopRight() {
  const area = screen.getPrimaryDisplay().workArea;
  const b = win.getBounds();
  win.setPosition(area.x + area.width - b.width - 24, area.y + 24);
}

function applyAlwaysOnTop(on) {
  if (!win) return;
  win.setAlwaysOnTop(!!on, on ? 'floating' : 'normal');
}

function applyScale(scale) {
  if (!win) return;
  scale = Math.max(1, Math.min(4, parseInt(scale, 10) || DEFAULTS.scale));
  settings.scale = scale;
  const wasResizable = win.isResizable();
  if (!wasResizable) win.setResizable(true);
  win.setContentSize(BASE_W * scale, BASE_H * scale);
  if (!wasResizable) win.setResizable(false);
  // membesar dari 1x ke 4x di dekat tepi layar bisa mendorong widget keluar
  nudgeIntoScreen();
  saveSettings();
}

function toggleWindow() {
  if (!win) { createWindow(); return; }
  if (win.isVisible()) win.hide();
  else { win.show(); win.focus(); }
}

/* ------------------------------ tray ------------------------------ */

function buildTray() {
  const img = imageOrEmpty('tray.png');
  try {
    tray = new Tray(img);
  } catch (e) {
    // Kalau ikon tray gagal dibuat (shell explorer bermasalah, kebijakan
    // perusahaan, dsb.) widget akan jadi tak terjangkau: ia disembunyikan dari
    // taskbar DAN tombol tutup hanya menyembunyikannya. Jadi kembalikan ke
    // taskbar supaya pengguna tetap bisa memunculkan dan menutupnya.
    console.error('tray tidak tersedia, widget dikembalikan ke taskbar:', e.message);
    if (win && !win.isDestroyed()) {
      win.setSkipTaskbar(false);
      if (!win.isVisible()) win.show();
    }
    return;
  }
  tray.setToolTip('Pixel Drive Clock');
  refreshTrayMenu();
  tray.on('click', toggleWindow);
  tray.on('double-click', toggleWindow);
}

function refreshTrayMenu() {
  if (!tray) return;
  const scaleItems = [1, 2, 3, 4].map(s => ({
    label: s + 'x  (' + (BASE_W * s) + 'x' + (BASE_H * s) + ')',
    type: 'radio',
    checked: settings.scale === s,
    click: () => { applyScale(s); if (win) win.webContents.send('settings:changed', { scale: s }); refreshTrayMenu(); }
  }));

  tray.setContextMenu(Menu.buildFromTemplate([
    { label: 'Tampilkan / sembunyikan', click: toggleWindow },
    { type: 'separator' },
    {
      label: 'Selalu di atas',
      type: 'checkbox',
      checked: !!settings.alwaysOnTop,
      click: (mi) => {
        settings.alwaysOnTop = mi.checked;
        applyAlwaysOnTop(mi.checked);
        saveSettings();
        if (win) win.webContents.send('settings:changed', { alwaysOnTop: mi.checked });
      }
    },
    { label: 'Ukuran', submenu: scaleItems },
    { type: 'separator' },
    {
      label: 'Jalan otomatis saat Windows menyala',
      type: 'checkbox',
      checked: !!settings.autoStart,
      click: (mi) => {
        settings.autoStart = mi.checked;
        applyAutoStart(mi.checked);
        saveSettings();
        if (win) win.webContents.send('settings:changed', { autoStart: mi.checked });
      }
    },
    { type: 'separator' },
    { label: 'Keluar', click: () => { quitting = true; app.quit(); } }
  ]));
}

function applyAutoStart(on) {
  try {
    // Pada build portable, electron-builder mengekstrak aplikasi ke folder
    // sementara dan menjalankannya dari sana, sehingga process.execPath
    // menunjuk ke %TEMP% yang akan dibersihkan Windows. Mendaftarkan path itu
    // membuat "jalan otomatis" rusak diam-diam setelah reboot berikutnya.
    // PORTABLE_EXECUTABLE_FILE berisi lokasi .exe portable yang sebenarnya.
    const exe = process.env.PORTABLE_EXECUTABLE_FILE || process.execPath;
    // Saat jalan dari kode sumber, process.execPath adalah electron.exe polos;
    // tanpa argumen folder proyek, yang terbuka saat login adalah aplikasi
    // bawaan Electron, bukan widget ini.
    const args = app.isPackaged ? [] : [path.resolve(__dirname, '..')];
    app.setLoginItemSettings({ openAtLogin: !!on, path: exe, args });
  } catch (e) { console.error('gagal mengatur autostart:', e.message); }
}

/* ------------------------------- IPC ------------------------------- */

function registerIpc() {
  ipcMain.handle('settings:get', () => settings);

  ipcMain.on('settings:set', (_e, partial) => {
    if (!partial || typeof partial !== 'object') return;
    for (const k of Object.keys(DEFAULTS)) {
      if (partial[k] !== undefined) settings[k] = partial[k];
    }
    // Renderer tidak boleh dipercaya begitu saja: tanpa ini, nilai liar
    // (scale 999, fps "abc") ikut tertulis ke settings.json.
    sanitizeSettings();
    saveSettings();
    refreshTrayMenu();
  });

  ipcMain.on('win:scale', (_e, scale) => { applyScale(scale); refreshTrayMenu(); });
  ipcMain.on('win:opacity', (_e, v) => {
    // batas bawah harus sama dengan sanitizeSettings (35) - kalau beda,
    // nilai yang berlaku dalam sesi "melompat" setelah widget dijalankan ulang
    const o = Math.max(0.35, Math.min(1, Number(v) || 1));
    settings.opacity = Math.round(o * 100);
    if (win) win.setOpacity(o);
    saveSettings();
  });
  ipcMain.on('win:top', (_e, on) => {
    settings.alwaysOnTop = !!on;
    applyAlwaysOnTop(!!on);
    saveSettings();
    refreshTrayMenu();
  });
  ipcMain.on('win:autostart', (_e, on) => {
    settings.autoStart = !!on;
    applyAutoStart(!!on);
    saveSettings();
    refreshTrayMenu();
  });
  ipcMain.on('win:hide', () => {
    if (!win) return;
    // Tanpa tray, jendela yang disembunyikan tidak bisa dimunculkan lagi
    // (tidak ada di taskbar maupun Alt-Tab). Minimize saja - fallback tray
    // sudah mengembalikannya ke taskbar.
    if (tray) win.hide();
    else win.minimize();
  });
  ipcMain.on('app:quit', () => { quitting = true; app.quit(); });
}

/* --------------------- mode tangkap gambar (dev) --------------------- */

function captureArgs() {
  const args = process.argv.slice(1);
  const on = args.some(a => a === '--capture' || a.startsWith('--capture='));
  if (!on) return null;
  const outArg = args.find(a => a.startsWith('--out='));
  const timesArg = args.find(a => a.startsWith('--times='));
  return {
    out: outArg ? outArg.slice(6) : path.join(app.getPath('temp'), 'pdc-capture'),
    times: timesArg
      ? timesArg.slice(8).split(',').map(Number).filter(n => !isNaN(n))
      : [1, 5.2, 6.2, 7.5, 12, 16, 17.7, 18.6, 20, 22.5]
  };
}

function capLog(cfg, msg) {
  // Electron di Windows adalah aplikasi GUI, jadi console.log belum tentu
  // sampai ke terminal. Catat juga ke berkas supaya mode ini bisa didiagnosis.
  console.log(msg);
  try { fs.appendFileSync(path.join(cfg.out, 'capture.log'), msg + '\r\n'); } catch (e) { /* abaikan */ }
}

async function runCapture(cfg) {
  fs.mkdirSync(cfg.out, { recursive: true });
  capLog(cfg, 'mulai, target: ' + cfg.times.join(', '));
  const w = new BrowserWindow({
    width: BASE_W, height: BASE_H, show: false,
    webPreferences: {
      preload: PRELOAD, contextIsolation: true, nodeIntegration: false,
      sandbox: false, backgroundThrottling: false
    }
  });
  await w.loadFile(RENDERER, { search: 'capture=1' });
  capLog(cfg, 'halaman termuat');

  let ready = false;
  for (let i = 0; i < 120; i++) {
    ready = await w.webContents.executeJavaScript('window.__ready === true');
    if (ready) break;
    await new Promise(r => setTimeout(r, 60));
  }
  capLog(cfg, ready ? 'renderer siap' : 'PERINGATAN: renderer tidak pernah siap');

  // Batas waktu per gambar: renderer yang macet tidak boleh membuat
  // `npm run capture` menggantung selamanya (terutama di CI).
  const withTimeout = (p, ms, label) => Promise.race([
    p,
    new Promise((_, rej) => setTimeout(() => rej(new Error('waktu habis (' + label + ')')), ms))
  ]);

  for (const t of cfg.times) {
    const url = await withTimeout(
      w.webContents.executeJavaScript('window.__capture(' + t + ', 3)'),
      30000, 'jam ' + t
    );
    if (!/^data:image\/png;base64,./.test(String(url))) {
      throw new Error('hasil __capture bukan data-URL PNG (jam ' + t + ')');
    }
    const b64 = String(url).split(',')[1];
    const label = String(t).replace('.', 'h');
    const file = path.join(cfg.out, 'jam-' + label + '.png');
    fs.writeFileSync(file, Buffer.from(b64, 'base64'));
    capLog(cfg, 'tersimpan ' + file);
  }
  capLog(cfg, 'CAPTURE_DONE ' + cfg.out);
  quitting = true;
  app.quit();
}

/* ------------------------------- boot ------------------------------- */

const capture = captureArgs();

loadSettings();

/*
 * Seluruh pemandangan digambar di CPU ke kanvas 256x144 (ImageData + fillRect),
 * lalu diperbesar oleh compositor. Tidak ada WebGL sama sekali. Karena itu
 * proses GPU Chromium hampir tidak mengerjakan apa pun tapi tetap memakan
 * ~80 MB RAM. Mematikannya membuat widget jauh lebih ringan; bisa dinyalakan
 * kembali dari setelan bila ada masalah tampilan.
 */
// Mode tangkap gambar juga selalu tanpa GPU: hasilnya cuma dibaca dari
// canvas.toDataURL(), jadi jalur GPU tidak dipakai sama sekali dan justru
// membuat jendela offscreen tidak stabil.
if (settings.lowPower || capture) {
  app.disableHardwareAcceleration();
}

if (!capture && !app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on('second-instance', () => { if (win) { win.show(); win.focus(); } });

  app.whenReady().then(() => {
    registerIpc();
    if (capture) {
      runCapture(capture).catch(e => {
        capLog(capture, 'GAGAL: ' + (e && e.stack ? e.stack : e));
        app.exit(1);
      });
      return;
    }
    createWindow();
    buildTray();
    if (settings.autoStart) applyAutoStart(true);
  });

  app.on('window-all-closed', () => {
    // Widget tetap hidup di tray - tapi kalau tray gagal dibuat, jendela yang
    // tertutup (mis. Alt+F4) tidak bisa dibuka lagi dan prosesnya jadi zombie
    // yang hanya bisa dimatikan lewat Task Manager. Lebih baik ikut keluar.
    if (!tray) { quitting = true; app.quit(); }
  });
  app.on('before-quit', () => {
    quitting = true;
    // Mode tangkap tidak mengubah setelan apa pun; jangan menimpa
    // settings.json milik widget yang mungkin sedang berjalan bersamaan.
    if (!capture) flushSettings();
  });
  app.on('activate', () => { if (!win) createWindow(); });
}
