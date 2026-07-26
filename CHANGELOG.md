# Catatan Perubahan

Semua perubahan penting proyek ini dicatat di berkas ini.
Formatnya mengikuti [Keep a Changelog](https://keepachangelog.com/id-ID/1.1.0/),
dan penomoran versi mengikuti [Semantic Versioning](https://semver.org/lang/id/).

## [Belum dirilis]

### Ditambahkan
- Kotak centang **"Tampilkan jam"** di panel pengaturan — setelan `showClock`
  sebelumnya hanya bisa diubah dengan mengedit `settings.json` secara manual.
- Zona waktu hasil edit tangan yang tidak ada di daftar (mis. UTC+01:30) kini
  tetap ditampilkan di dropdown dengan label `(khusus)`, bukan tampil kosong.

### Diperbaiki
- Perubahan dari **menu tray** (ukuran, selalu di atas, jalan otomatis) kini
  tersinkron ke panel pengaturan. Sebelumnya perubahan itu bisa dibatalkan
  diam-diam begitu setelan lain disentuh dari panel.
- Tanpa ikon tray, menutup jendela kini benar-benar mematikan aplikasi —
  sebelumnya prosesnya bisa hidup terus tanpa cara dijangkau selain Task
  Manager. Tombol sembunyikan juga memakai minimize pada kondisi itu.
- Nilai liar di `settings.json` (`null`, `""`, `false`, `[]` pada kunci angka)
  kini jatuh ke nilai bawaan, bukan diam-diam menjadi `0`.
- Setelan yang diubah kurang dari 250 ms sebelum menutup widget tidak lagi
  hilang.
- Batas bawah transparansi disamakan (35%) antara jalur IPC dan sanitasi —
  sebelumnya nilai bisa "melompat" setelah widget dijalankan ulang.
- Lengkung kabel listrik kini menggantung tepat dari palang tiang; sebelumnya
  titik gantungnya meleset 20 px di udara kosong.
- "Jalan otomatis saat Windows menyala" yang diaktifkan saat menjalankan dari
  kode sumber kini membuka widget, bukan aplikasi bawaan Electron.
- Widget di monitor kedua yang perlu digeser masuk layar tidak lagi
  berpindah ke monitor utama.
- Mode `--capture` kini punya batas waktu 30 detik per gambar, memvalidasi
  hasilnya, dan tidak lagi menimpa `settings.json`.

### Dokumentasi
- Lokasi setelan yang benar: `%APPDATA%\pixel-drive-clock` (bukan
  `%APPDATA%\Pixel Drive Clock`).
- Langkah pemulihan biner Electron untuk npm 11+ yang memblokir skrip
  pemasangan.
- Semua berkas `.md` diberi BOM UTF-8 supaya penampil berbasis Windows tidak
  salah menebak encoding-nya.

## [1.0.0] — 26 Juli 2026

Rilis pertama.

- Jam pixel-art dengan font 5×7 buatan sendiri, format 12/24 jam, tanggal
  berbahasa Indonesia, dan label fase hari.
- Tiga mode waktu: Realtime (38 zona waktu, WIB/WITA/WIT dilabeli), Manual,
  dan Demo (satu hari dalam 10–240 detik).
- Pemandangan pickup silver di lapangan bunga dengan siklus cahaya mulus
  24 jam: matahari, bulan, bintang, bintang jatuh, lampu mobil otomatis,
  7 lapisan parallax.
- Seluruh gambar dibuat dengan kode (nol berkas gambar); total aset 118 KB.
- Terukur: ±0,65% CPU dari 8 core, ±109 MB RAM privat, 301 MB terpasang.
- Installer NSIS + versi portable untuk Windows 10 64-bit ke atas.

[Belum dirilis]: https://github.com/Goodman-34/Widget-time-pixel-style-/compare/v1.0.0...HEAD
[1.0.0]: https://github.com/Goodman-34/Widget-time-pixel-style-/releases/tag/v1.0.0
