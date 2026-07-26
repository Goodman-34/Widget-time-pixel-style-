# CLAUDE.md

Panduan lengkap untuk asisten AI di repo ini ada di **[AGENTS.md](AGENTS.md)**.
Baca berkas itu lebih dulu — isinya aturan arsitektur, jebakan lingkungan yang
pernah benar-benar terjadi, dan daftar periksa sebelum menyatakan selesai.

Berkas ini hanya memuat hal khusus Claude Code.

---

## Ringkasan singkat

Widget jam pixel-art untuk Windows, dibungkus Electron. **Nol dependensi
runtime**, tanpa bundler, tanpa transpile. Komentar kode dan teks antarmuka
berbahasa **Indonesia**.

## Perintah paling sering dipakai

```bash
npm run validate    # WAJIB setelah menyentuh sprite / font / palet
npm run capture     # render PNG 10 jam berbeda, lalu LIHAT hasilnya
npm start           # jalankan widget
npm run build       # bikin installer - JALANKAN PALING AKHIR
```

## Empat hal yang paling sering bikin salah

1. **Baris sprite harus sama panjang.** Semua pixel-art adalah teks ASCII di
   `src/renderer/js/sprites.js`. Beda satu karakter merusak seluruh gambar dan
   nyaris tidak terlihat mata. Selalu tutup dengan `npm run validate`.
2. **Jangan menulis warna per jam.** Warna dihitung dari albedo + 12 keyframe
   cahaya di `palette.js`. Menambah `if (jam > 18)` untuk mengubah warna
   adalah kesalahan arsitektur.
3. **Anda tidak bisa menilai pixel art dari kode.** Pakai `npm run capture`
   lalu benar-benar buka PNG-nya dengan tool Read.
4. **Jangan jalankan `npm run build` di tengah sesi.** Proses itu terbukti
   merusak `node_modules/electron/dist/electron.exe` (215 MB → 0,5 MB),
   dan setelah itu `npm start` mati diam-diam tanpa pesan galat apa pun.

## Khusus Claude Code di Windows

**Bersihkan `ELECTRON_RUN_AS_NODE` sebelum memanggil Electron.** Kalau sesi
berjalan di dalam IDE berbasis Electron (VSCode, Cursor, Antigravity), variabel
itu terwarisi dan membuat Electron berjalan sebagai Node biasa:

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
& ".\node_modules\electron\dist\electron.exe" . --capture --out=preview
```

**Electron adalah aplikasi GUI di Windows**, jadi `console.log` belum tentu
sampai ke terminal Anda. Kalau sebuah perintah Electron tampak "berhasil tapi
tidak melakukan apa-apa", jangan langsung menyalahkan kode: periksa dulu ukuran
`electron.exe`, lalu tulis jejak ke berkas (lihat `capLog()` di `main.js`).

**Untuk menjalankan skrip Node/build**, `Start-Process ... -Wait -PassThru`
dengan keluaran dialihkan ke berkas lebih andal daripada memipa langsung.

## Sebelum melapor selesai

- [ ] `npm run validate` → SEMUA PEMERIKSAAN LOLOS
- [ ] Ada perubahan visual? → `npm run capture` lalu **buka PNG-nya**
- [ ] `npm start` → widget muncul dan bergerak
- [ ] Menyentuh setelan? → uji dengan `settings.json` rusak **dan** dihapus
- [ ] Laporkan apa adanya; sebut yang belum diuji sebagai belum diuji
