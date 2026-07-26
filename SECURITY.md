# Kebijakan Keamanan

## Versi yang didukung

| Versi | Didukung |
|---|---|
| 1.x | ✅ |

## Melaporkan celah keamanan

**Jangan laporkan celah keamanan lewat issue publik.** Gunakan pelaporan
privat GitHub:

1. Buka [Security → Report a vulnerability](https://github.com/Goodman-34/Widget-time-pixel-style-/security/advisories/new).
2. Jelaskan langkah reproduksinya sedetail mungkin.

Proyek ini dipelihara sukarela; laporan akan ditanggapi sesegera mungkin
dengan usaha terbaik, tanpa janji tenggat tertentu.

## Batas keamanan yang dirancang

Fakta-fakta ini bisa diverifikasi langsung dari kode:

- **Tidak ada akses jaringan sama sekali** saat widget berjalan — tidak ada
  telemetri, pemeriksa pembaruan, maupun aset dari CDN. Penambahan `fetch`
  atau sejenisnya dianggap regresi keamanan.
- **Renderer tidak punya akses Node**: `contextIsolation: true`,
  `nodeIntegration: false`; jembatan `preload.js` hanya mengekspos 9 fungsi
  dengan channel IPC bernama tetap.
- **CSP `default-src 'none'`** di `index.html`; tidak ada skrip inline.
- Navigasi dan pembukaan jendela baru **ditolak** (`setWindowOpenHandler`,
  `will-navigate`).
- Masukan dari renderer **disanitasi di proses utama** sebelum disimpan.
- Satu-satunya berkas yang ditulis aplikasi adalah `settings.json` di
  `%APPDATA%\pixel-drive-clock`.

## Catatan tentang peringatan SmartScreen/antivirus

Berkas rilis **tidak ditandatangani secara digital**, jadi Windows SmartScreen
menampilkan peringatan pada unduhan baru. Itu peringatan reputasi, bukan
temuan malware. Kalau ragu, bangun sendiri installer-nya dari kode sumber —
langkahnya ada di [README](README.md#-membangun-sendiri) — atau periksa
berkasnya dengan pemindai pilihan Anda sebelum menjalankan.
