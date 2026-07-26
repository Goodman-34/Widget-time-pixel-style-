# Panduan Kontribusi

Terima kasih sudah tertarik ikut mengerjakan Pixel Drive Clock. Dokumen ini
merangkum semua aturan yang perlu diketahui sebelum mengubah kode.

## Bahasa

Seluruh komentar kode, teks antarmuka, pesan commit, dan dokumentasi ditulis
dalam **Bahasa Indonesia**.

## Persiapan

Butuh Node.js 20 atau lebih baru.

```bash
git clone https://github.com/Goodman-34/Widget-time-pixel-style-.git
cd Widget-time-pixel-style-
npm install
npm start
```

| Perintah | Fungsi |
|---|---|
| `npm start` | Menjalankan widget dari kode |
| `npm run validate` | **Wajib** setelah menyentuh sprite, font, atau palet |
| `npm run capture` | Menyimpan PNG pemandangan pada 10 jam berbeda |
| `npm run icon` | Membuat ulang ikon |
| `npm run build` | Membuat installer — **jalankan paling akhir** |

## Empat aturan yang tidak boleh dilanggar

1. **Semua baris sprite harus sama panjang** — pixel-art ditulis sebagai teks
   ASCII di `sprites.js`; selisih satu karakter merusak seluruh gambar dan
   nyaris tidak terlihat mata. `npm run validate` menangkapnya.
2. **Jangan menulis warna per jam** — warna dihitung dari model pencahayaan di
   `palette.js` (albedo tiap material + 12 keyframe cahaya), bukan tabel per
   jam. Cabang `if (jam > 18)` untuk warna adalah kesalahan arsitektur.
3. **Offset gambar harus bilangan bulat** — koordinat pecahan membuat
   pixel-art bergetar.
4. **Perubahan visual harus dilihat** — jalankan `npm run capture` lalu buka
   PNG-nya. Kode yang "kelihatan benar" belum tentu gambarnya benar.

## Menambah setelan baru = mengubah 5 tempat

Setelan tersebar di lima tempat. Lewatkan satu saja, dan setelan itu tidak
akan tersimpan atau tidak akan bisa diatur:

1. `DEFAULTS` di `src/main.js`
2. `sanitizeSettings()` di `src/main.js` — wajib, karena `settings.json` bisa
   rusak atau diedit tangan; satu nilai liar (mis. `scale: 999`) cukup membuat
   widget tidak bisa dipakai lagi lewat antarmuka
3. `DEFAULTS` di `src/renderer/js/app.js`
4. `sanitize()` di `app.js`
5. Elemen di `src/renderer/index.html`, lalu daftar ID, `syncUI()`, dan
   `wireUI()` di `app.js`

## Sebelum membuka pull request

- [ ] `npm run validate` → SEMUA PEMERIKSAAN LOLOS
- [ ] Ada perubahan visual? → `npm run capture` dan periksa PNG-nya
- [ ] `npm start` → widget muncul dan bergerak
- [ ] Menambah/mengubah setelan? → ikuti daftar **5 tempat** di atas, lalu
      uji dengan `settings.json` rusak **dan** dihapus
- [ ] Jangan menambah dependensi runtime — proyek ini sengaja nol dependensi

## Gaya kode

- ES5 (`var`, `function`) di `src/renderer/js/` — tidak ada transpile
- ES2020+ boleh di `src/main.js` dan `tools/`
- Indentasi 2 spasi, titik koma dipakai
- Komentar menjelaskan **kenapa**, bukan **apa**

## Melaporkan bug atau mengusulkan fitur

Pakai [template issue](https://github.com/Goodman-34/Widget-time-pixel-style-/issues/new/choose)
yang tersedia. Untuk celah keamanan, ikuti [`SECURITY.md`](SECURITY.md) —
jangan lewat issue publik.
