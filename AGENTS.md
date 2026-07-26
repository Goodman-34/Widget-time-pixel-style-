# AGENTS.md — panduan untuk asisten AI

Dokumen ini adalah acuan utama bagi asisten AI (Claude Code, Cursor, Copilot,
Codex, Aider, dan sejenisnya) yang mengerjakan repo ini.
[`CLAUDE.md`](CLAUDE.md) hanya menunjuk ke berkas ini.

**Bahasa:** seluruh komentar kode, teks antarmuka, dan pesan commit ditulis
dalam **Bahasa Indonesia**. Ikuti kebiasaan itu.

---

## 1. Apa ini

Widget jam pixel-art untuk desktop Windows, dibungkus Electron. Sebuah pickup
silver melintasi lapangan bunga, dan seluruh pencahayaannya mengikuti waktu
asli secara mulus sepanjang 24 jam.

**Nol dependensi runtime.** Hanya `electron` dan `electron-builder` sebagai
`devDependencies`. Tidak ada framework, tidak ada bundler, tidak ada langkah
transpile. Berkas dimuat sebagai `<script>` klasik berurutan dan saling
berbagi melalui namespace global `window.PDC`.

---

## 2. Perintah

| Perintah | Fungsi |
|---|---|
| `npm start` | Menjalankan widget dari kode |
| `npm run validate` | **Wajib** setelah menyentuh sprite, font, atau palet |
| `npm run capture` | Menyimpan PNG pemandangan pada 10 jam berbeda |
| `npm run icon` | Membuat ulang ikon |
| `npm run build` | Membuat installer (**jalankan paling akhir**, lihat §7) |

---

## 3. Empat aturan yang tidak boleh dilanggar

### 3.1 Semua baris sprite harus sama panjang

Seluruh pixel-art ada di [`src/renderer/js/sprites.js`](src/renderer/js/sprites.js)
sebagai teks ASCII. Satu baris yang panjangnya beda satu karakter akan
menggeser seluruh gambar, dan itu **sangat sulit dilihat dengan mata**.

```js
var CAR = S([
  '...................KKKKKKKKKKKK.................',   // 48 karakter
  '..................KHHHHHHHHHHHHK................',   // 48 karakter
], CAR_MAP);
```

`.` selalu berarti transparan. Huruf lain dipetakan ke nama material lewat
`map` milik sprite itu. Setiap material yang dipakai **harus** ada di `M`
dalam `palette.js`.

> **Selalu jalankan `npm run validate` setelah mengedit sprite.** Skrip itu
> memeriksa panjang baris, kelengkapan pemetaan huruf, keberadaan material,
> dan posisi pelek roda di dalam sprite mobil.

### 3.2 Jangan pernah menulis warna per jam

Inti proyek ini adalah **peralihan cahaya yang mulus**. Warna benda **tidak**
ditulis untuk tiap jam, melainkan dihitung:

```
albedo → × warna cahaya → × kuat cahaya → campur ke ambient
       → koreksi saturasi → campur ke kabut sesuai kedalaman
```

Yang boleh diedit di [`palette.js`](src/renderer/js/palette.js) hanya dua:

- **`M`** — warna dasar (albedo) tiap material, `[warna, kedalaman, emisif]`
- **`KEYS`** — 12 keyframe pencahayaan sepanjang 24 jam

Semua parameter keyframe di-interpolasi `smoothstep`, dan pencampuran warna
dilakukan di **ruang linear** (gamma ≈ 2.0) supaya tidak menjadi kelabu di
titik tengah. Menambahkan cabang `if (jam > 18)` di mana pun untuk mengubah
warna adalah **kesalahan arsitektur** — itu persis yang dihindari desain ini.

`npm run validate` akan gagal kalau ada lompatan warna yang terlalu tajam
antar menit.

### 3.3 Offset gambar harus bilangan bulat

Ini pixel art. Menggambar di koordinat pecahan membuat gambar bergetar dan
buram. Semua offset parallax sudah dibulatkan di `Scene.prototype._blit`:

```js
var off = Math.floor(this.scroll * factor) % tw;
```

Pertahankan pola itu untuk lapisan baru.

### 3.4 Anda tidak bisa menilai pixel art dari kode

Jangan pernah menyatakan perubahan visual "selesai" tanpa melihat hasilnya.
Gunakan:

```bash
npm run capture
# atau jam tertentu:
npx electron . --capture --out=preview --times=6,12,18,23
```

Perintah itu menjalankan widget tanpa jendela, memanggil `window.__capture(jam)`
di renderer, mengambil hasilnya lewat `canvas.toDataURL()`, lalu menulisnya
sebagai PNG. **Lihat PNG-nya.** Delapan dari enam belas bug pada pembuatan
awal proyek ini murni bug visual yang tidak mungkin ketahuan dari kode.

Mode ini sengaja **tidak** memakai `capturePage()` maupun rendering offscreen,
karena keduanya bergantung pada GPU dan terbukti tidak stabil.

---

## 4. Peta arsitektur

```
src/main.js          proses utama: jendela, tray, IPC, setelan, mode --capture
src/preload.js       contextBridge; renderer TIDAK punya akses Node
src/renderer/js/
  font.js            font pixel 5x7, 51 glyph
  sprites.js         semua pixel-art (ASCII)
  palette.js         model pencahayaan 24 jam   <- inti proyek
  pixel.js           primitif: dithering Bayer, sprite, teks, lingkaran, PRNG
  scene.js           mesin pemandangan: lapisan, parallax, cache tile, HUD
  clock.js           sumber waktu: realtime / manual / demo
  app.js             setelan, antarmuka, loop render
```

Urutan pemuatan skrip di `index.html` **penting** — `font.js` sebelum
`pixel.js`, `sprites.js` dan `palette.js` sebelum `scene.js`.

### Tata letak vertikal

Kanvas dasar **256 × 144**. Batas tiap lapisan ada sebagai konstanta di bagian
atas `scene.js`, lengkap dengan diagram. Jangan mengubahnya tanpa memeriksa
ulang hasil tangkapan gambar — lapisan saling bergantung (contoh: puncak bukit
harus selalu berada di atas garis ladang, kalau tidak bukitnya menghilang).

### Anggaran performa

Widget ini menyala 24 jam, jadi biaya per frame dijaga ketat:

- Kanvas tetap 256 × 144 (36.864 pixel), berapa pun ukuran jendela
- Latar dirender ke tile **hanya saat palet berubah**, bukan tiap frame
- Palet dibangun maksimal 5×/detik (realtime praktis 1× per 30 detik)
- ±20 `drawImage` per frame
- 30 fps, turun ke 12 fps saat tidak difokuskan, berhenti total saat disembunyikan

Kalau menambah sesuatu yang berjalan tiap frame, ukur dampaknya. Jangan
memindahkan pekerjaan berat ke dalam `render()`.

---

## 5. Keputusan desain yang sengaja — jangan "diperbaiki"

**Lintasan matahari & bulan dibatasi ke langit kanan** (`ARC_X0` / `ARC_X1` di
`palette.js`). Ini terlihat aneh secara fisika, tapi disengaja: panel jam
menempati langit kiri-atas, dan kalau lintasannya dibentang penuh dari tepi ke
tepi, matahari tertutup panel sepanjang pagi dan bulan tertutup hampir
sepanjang malam. Alasan lengkapnya ada sebagai komentar di kode.

**Akselerasi hardware dimatikan secara bawaan** (`lowPower`). Seluruh gambar
dihitung di CPU dan tidak ada WebGL sama sekali, jadi proses GPU hanya memakan
RAM tanpa mengerjakan apa pun. Terukur hemat 34 MB RAM privat tanpa menambah
beban CPU.

**`npmRebuild: false`** di `package.json`. Proyek ini nol dependensi native,
dan langkah `@electron/rebuild` justru menyebabkan kegagalan out-of-memory.

---

## 6. Kalau menambah setelan baru

Setelan tersebar di lima tempat. Lewatkan satu saja, dan setelan itu tidak akan
tersimpan atau tidak akan bisa diatur:

1. `DEFAULTS` di [`src/main.js`](src/main.js)
2. `sanitizeSettings()` di `src/main.js` — **wajib**, lihat di bawah
3. `DEFAULTS` di [`src/renderer/js/app.js`](src/renderer/js/app.js)
4. `sanitize()` di `app.js`
5. Elemen di [`index.html`](src/renderer/index.html), lalu daftar ID,
   `syncUI()`, dan `wireUI()` di `app.js`

> **Kenapa sanitasi wajib:** `settings.json` adalah berkas teks di folder
> pengguna. Bisa rusak karena mati listrik saat menyimpan, bisa juga diedit
> tangan. Tanpa penjagaan, satu angka aneh sudah cukup membuat widget tidak
> bisa dipakai lagi — `scale: 999` berarti jendela selebar 255.744 px,
> `opacity: 0` berarti tak terlihat sama sekali (panel setelan ikut hilang),
> `fps: 0` berarti layar membeku. Ketiganya **tidak bisa diperbaiki lewat
> antarmuka**.
>
> Hati-hati juga: `Number(null)` bernilai `0`, bukan `NaN`. Jangan sampai
> posisi "belum pernah diatur" berubah jadi koordinat `0,0`.

---

## 7. Jebakan lingkungan (nyata, pernah terjadi)

### 7.1 `electron-builder` merusak biner Electron

Setelah `npm run build`, `node_modules/electron/dist/electron.exe` bisa
menyusut dari **215 MB menjadi 0,5 MB**. Akibatnya `npm start` keluar diam-diam
dengan exit code 0, **tanpa pesan galat apa pun** — sangat membingungkan kalau
tidak tahu.

Terjadi dua kali dan sudah dikonfirmasi. Periksa:

```powershell
(Get-Item node_modules\electron\dist\electron.exe).Length / 1MB
```

Kalau jauh di bawah 200 → `npm install --save-dev electron@43.2.0 --force`.

**Karena itu: jalankan `npm run build` sebagai langkah paling akhir**, bukan di
tengah siklus uji.

### 7.2 `ELECTRON_RUN_AS_NODE` bocor dari IDE berbasis Electron

Kalau menjalankan perintah dari dalam VSCode/Cursor/Antigravity, variabel
lingkungan itu ikut terwarisi dan membuat Electron berjalan sebagai Node biasa.
Gejalanya: `TypeError: Cannot read properties of undefined (reading 'on')`
karena `require('electron')` mengembalikan string path, bukan modul.

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
```

Jangan menambal ini di dalam kode aplikasi — masalahnya ada di lingkungan
pengembangan, bukan di widget.

### 7.3 Build gagal "out of memory" padahal RAM lega

`Zone Allocation failed - process out of memory` bisa muncul walau RAM bebas
masih 4 GB, karena proses anak Node tidak diizinkan meng-commit memori sebanyak
reservasi bawaan V8. Solusinya:

```powershell
node --max-old-space-size=1024 --max-semi-space-size=8 `
     node_modules\electron-builder\out\cli\cli.js --win nsis portable
```

### 7.4 Electron adalah aplikasi GUI di Windows

`console.log` belum tentu sampai ke terminal. Untuk diagnosis, tulis ke berkas
(lihat `capLog()` di `main.js`).

---

## 8. Keamanan — jangan dilonggarkan

- `contextIsolation: true`, `nodeIntegration: false`, renderer **tanpa** akses Node
- CSP `default-src 'none'` di `index.html`; tidak ada skrip inline
- `setWindowOpenHandler` menolak semua, `will-navigate` dicegah
- Widget **tidak pernah** mengakses jaringan. Jangan menambahkan `fetch`,
  telemetri, pemeriksa pembaruan, atau font/CDN eksternal.
- Satu-satunya berkas yang ditulis adalah `settings.json` di `userData`

---

## 9. Sebelum menyatakan selesai

1. `npm run validate` → harus **SEMUA PEMERIKSAAN LOLOS**
2. `npm run capture` → **lihat** PNG-nya kalau ada perubahan visual
3. `npm start` → widget benar-benar muncul dan bergerak
4. Kalau menyentuh setelan: uji dengan `settings.json` yang rusak, dan uji
   dengan `settings.json` yang dihapus (jalur pemasangan baru)
5. Laporkan apa adanya. Kalau ada yang belum diuji, katakan belum diuji.

---

## 10. Gaya kode

- ES5 di `src/renderer/js/` (`var`, `function`) — tidak ada langkah transpile
- ES2020+ boleh di `src/main.js` dan `tools/` (proses Node)
- Indentasi 2 spasi, titik koma dipakai
- Komentar menjelaskan **kenapa**, bukan **apa**. Komentar yang menerangkan
  keputusan desain dan jebakan yang pernah terjadi sangat dihargai di repo ini
- Jangan menambah dependensi. Kalau merasa butuh, pikirkan ulang
