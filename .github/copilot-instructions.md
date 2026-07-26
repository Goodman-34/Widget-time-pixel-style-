# Instruksi untuk GitHub Copilot

Acuan utama repo ini: **[AGENTS.md](../AGENTS.md)** — aturan arsitektur,
jebakan lingkungan, dan daftar periksa lengkap ada di sana.

Aturan inti yang harus selalu dipatuhi:

- Tulis semua komentar kode, teks antarmuka, dan pesan commit dalam
  **Bahasa Indonesia**.
- Kode renderer (`src/renderer/js/`) adalah **ES5** (`var`, `function`) tanpa
  transpile; `src/main.js` dan `tools/` boleh ES2020+.
- **Jangan menambah dependensi** — proyek ini nol dependensi runtime.
- Semua pixel-art adalah string ASCII di `sprites.js`; **setiap baris sprite
  harus sama panjang**, dan setiap huruf harus terdaftar di `M` dalam
  `palette.js`. Setelah mengubahnya jalankan `npm run validate`.
- **Jangan menulis warna per jam** (tidak boleh ada `if (jam > 18)` untuk
  warna) — warna dihitung dari albedo + 12 keyframe cahaya di `palette.js`.
- Offset gambar harus bilangan bulat (`Math.floor`/`Math.round`), kalau tidak
  pixel-art bergetar.
- Perubahan visual harus diverifikasi dengan `npm run capture`, bukan hanya
  dibaca dari kode.
- Menambah setelan berarti mengubah **5 tempat**: DEFAULTS + sanitasi di
  `main.js`, DEFAULTS + sanitasi di `app.js`, dan elemen UI di `index.html`
  beserta `syncUI()`/`wireUI()`.
- Jangan melonggarkan keamanan: `contextIsolation: true`, CSP
  `default-src 'none'`, tanpa akses jaringan sama sekali.
