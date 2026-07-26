# GEMINI.md

Panduan lengkap untuk asisten AI di repo ini ada di **[AGENTS.md](AGENTS.md)**.
Baca berkas itu lebih dulu — isinya aturan arsitektur, jebakan lingkungan yang
pernah benar-benar terjadi, dan daftar periksa sebelum menyatakan selesai.

Ringkasan tersingkat yang tetap harus dipatuhi:

- **Bahasa Indonesia** untuk semua komentar kode, teks antarmuka, dan pesan
  commit.
- Widget jam pixel-art Windows berbasis Electron, **nol dependensi runtime**,
  tanpa bundler, tanpa transpile. Renderer memakai ES5.
- Semua pixel-art adalah teks ASCII di `src/renderer/js/sprites.js` — **semua
  baris sprite harus sama panjang**. Selalu tutup dengan `npm run validate`.
- **Jangan menulis warna per jam.** Warna dihitung dari model pencahayaan di
  `palette.js` (albedo + 12 keyframe cahaya).
- **Perubahan visual wajib dilihat**: `npm run capture`, lalu buka PNG-nya.
- **`npm run build` dijalankan paling akhir** — proses itu pernah merusak
  `node_modules/electron/dist/electron.exe` (215 MB → 0,5 MB) sehingga
  `npm start` mati tanpa pesan apa pun.
- Menambah setelan = mengubah **5 tempat** (lihat AGENTS.md §6).
