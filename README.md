# Good Receipes

Aplikasi web untuk mencatat eksperimen resep masakan sampai ketemu resep juara, lalu menghitung HPP, harga jual, titik impas, dan menyusun ide pemasaran. Dibuat untuk dipakai terutama di HP, dan tampil memenuhi layar di laptop. Data tersimpan di perangkat Anda lebih dulu (tetap jalan tanpa internet), lalu disalin ke **akun pengguna** di server: backend **Laravel** dengan database **PostgreSQL Supabase** (atau MySQL di Laragon untuk uji lokal) dan foto di **Supabase Storage**. Aplikasi siap dijual: setiap pembeli mendaftar sendiri dan datanya terpisah dari pembeli lain.

## Yang bisa dilakukan

- **Resep** dengan kategori, gambar acuan masakan, dan target yang ingin dicapai.
- **Eksperimen** 1..n per resep: bahan dan takaran, suhu, waktu, langkah, catatan kegagalan, foto hasil akhir. Eksperimen bisa **diduplikat** lalu diubah sedikit; bahan yang berubah ditandai dan selisih biaya ditampilkan.
- **Penilaian** 1 sampai 10 untuk rasa, tekstur, tampilan, aroma, dan minat beli. Orang lain menilai lewat **kode QR tanpa login**, boleh disertai komentar. Anda sendiri yang menandai eksperimen **juara**.
- **Daftar bahan** dengan foto, merek, tempat beli, harga, dan **konversi satuan** (beli per kg, dipakai per gram, sdm, sdt, atau butir).
- **Resep tambahan di HPP**: HPP makanan A bisa ikut menghitung resep lain, mis. saus atau isian B (per porsi/gram hasil jadi B, atau per resep penuh). Bisa bertingkat (B memakai C) dan dicegah saling memakai.
- **HPP dan harga**: HPP per resep dan per porsi, harga jual minimum dari margin yang diinginkan, laba per porsi, titik impas (BEP), dan target penjualan per bulan.
- **Marketing**: ide konten dan ide pemasaran per resep, dengan status dan rencana pekan ini.
- **Akun pengguna**: daftar dengan nama dan email, lalu username dan kata sandi dikirim ke email. Masuk dengan username atau email, ganti kata sandi, lupa kata sandi lewat tautan email, dan keluar. Data setiap akun terpisah.
- **Petunjuk untuk penilai**: tulis apa yang dinilai per aspek (mis. Tekstur: "harus kriuk dan kering", Rasa: "jangan terlalu asin") dan **catatan chef**; penilai melihatnya saat membuka QR.
- **Kunci layar perangkat** (opsional): kata sandi tambahan untuk membuka aplikasi di perangkat ini, dengan kunci otomatis saat lama tidak dipakai.
- **Nama dan logo aplikasi** yang bisa diganti sendiri dan tampil di beranda, halaman masuk, kode QR, dan halaman penilai.
- Bisa dipasang ke layar utama (PWA) dan dibuka tanpa internet.

## Mencoba di komputer

Butuh Node.js 20 atau lebih baru. Tidak ada paket yang perlu dipasang untuk menjalankan aplikasi.

```bash
npm run dev
```

Buka http://localhost:8080. Server uji ini memakai tiruan backend Laravel di memori (`tools/server-tiruan.mjs`, tanpa database dan tanpa email). Di `localhost`, `config.js` sengaja tidak memakai server produksi. Di halaman **Masuk**, isi alamat server `http://localhost:8080/api`, lalu masuk dengan email apa saja dan kata sandi `kunci-dev`. Untuk mencoba akun sungguhan (pendaftaran, email, banyak akun), pakai backend Laravel di bawah. Data uji disimpan di `.dev-data.json` (hapus berkas ini atau jalankan `node tools/dev-server.mjs --reset` untuk mengosongkan).

Tombol **Muat data contoh** (Beranda atau Pengaturan) mengisi empat resep contoh, lengkap dengan foto makanan dan bahan, supaya semua layar bisa dilihat. Fotonya berlisensi bebas untuk penggunaan komersial (domain publik, CC0, atau CC BY); daftar pembuat dan sumbernya ada di `contoh/SUMBER.md` dan wajib ikut disertakan bila foto itu dipakai.

## Backend Laravel + Supabase

Folder `backend/` berisi API Laravel 13 (PHP 8.3). Semua permintaan masuk ke satu alamat `/api`:

- tanpa login: `daftar`, `masuk`, `lupaSandi`, `aturSandi`, serta `infoNilai` dan `kirimNilai` untuk penilai QR;
- dengan login (token sesi dari `masuk`): `ping`, `sinkron`, `unggahFoto`, `ubahProfil`, `gantiSandi`, `keluar`.

| Bagian | Isi |
|---|---|
| `backend/config/goodrecipes.php` | alamat frontend, batas, dan skema tabel (harus sama dengan `js/lib/schema.js`) |
| `backend/database/migrations/` | tabel akun (`users`, `sesi_masuk`) dan 12 tabel data (`resep`, `eksperimen`, …), masing-masing dengan kolom pemilik `id_pengguna` |
| `backend/app/Services/` | `Akun` (daftar, masuk, sesi, kata sandi), `Sinkron` (yang lebih baru menang, per akun), `Foto` (Supabase Storage atau disk), `Penilai` (QR) |
| `backend/app/Mail/`, `resources/views/email/` | email akun baru dan email lupa kata sandi |
| `backend/app/Http/Controllers/ApiController.php` | endpoint `GET/POST /api` dan `GET /foto/{nama}` |

### 1. Uji lokal dengan Laragon (MySQL)

1. Jalankan Laragon (MySQL dan Mailpit aktif) dan buat database `goodrecipes`.
2. Pasang paket dan siapkan tabel:
   ```bash
   cd backend
   composer install
   cp .env.example .env        # lalu sesuaikan DB_*, FRONTEND_URL, dan MAIL_* (lihat di bawah)
   php artisan key:generate
   php artisan migrate         # sudah pernah migrasi versi tanpa akun? pakai: php artisan migrate:fresh
   php artisan serve           # http://localhost:8000
   ```
   Untuk uji lokal, arahkan email ke Mailpit Laragon: `MAIL_HOST=127.0.0.1`, `MAIL_PORT=1025`. Semua email yang "terkirim" bisa dibaca di http://localhost:8025. Isi `FRONTEND_URL=http://localhost:8080`.
3. Jalankan aplikasi (`npm run dev` di folder utama). Di halaman **Masuk**, tekan **ganti** di bawah, isi server `http://localhost:8000/api`, lalu **Daftar akun baru**. Username dan kata sandi muncul di Mailpit.

Tanpa pengaturan Supabase, foto disimpan di `backend/storage/app/foto` dan dilayani lewat `/foto/...`.

Uji API sungguhan (membuat dua akun uji dan menulis data contoh, jadi pakai database lokal saja):

```bash
API_URL=http://localhost:8000/api PHP=php npm run test:api
```

### Akun pembeli (untuk penjual aplikasi)

- Pembeli mendaftar sendiri di halaman **Daftar akun baru**: cukup nama dan email. Server membuat **username** (dari nama + 4 angka) dan **kata sandi acak**, lalu mengirim keduanya ke email itu. Kata sandi pertama sengaja dikirim lewat email, jadi berhasil masuk berarti emailnya benar.
- Pembeli bisa masuk dengan username atau email, mengganti kata sandi di **Pengaturan > Akun**, dan memakai **Lupa kata sandi** (tautan ke email, berlaku 60 menit, sekali pakai).
- Setiap akun hanya melihat datanya sendiri. Di perangkat yang dipakai bergantian, data akun sebelumnya dihapus dari perangkat saat akun lain masuk.
- Percobaan dibatasi: masuk 10 kali gagal per 5 menit (per IP dan per akun), daftar dan lupa kata sandi 5 kali per 10 menit per IP.

Perintah untuk Anda sebagai penjual (jalankan di folder `backend`, dengan `.env` mengarah ke database produksi):

```bash
php artisan resep:daftar-akun                                    # semua akun
php artisan resep:buat-akun "Nama Pembeli" email@pembeli.com --kirim-email   # buat akun manual
php artisan resep:akun-aktif sitiaminah1625 tidak                # nonaktifkan (mis. belum bayar); semua perangkatnya keluar
php artisan resep:akun-aktif sitiaminah1625 ya                   # aktifkan lagi
```

Akun nonaktif tidak bisa masuk atau sinkron, tetapi datanya tetap tersimpan. Data akun juga bisa dilihat di Supabase (*Table Editor > users*).

### 2. Pindah ke Supabase

1. Buat proyek di [supabase.com](https://supabase.com).
2. **Database**: tombol **Connect** di dasbor Supabase. Untuk menjalankan migrasi dari komputer, pakai **Session pooler** (port 5432). Di `backend/.env`, ganti blok MySQL dengan blok Supabase yang sudah disiapkan (`DB_CONNECTION=pgsql`, host `aws-…pooler.supabase.com`, user `postgres.<ref>`, kata sandi database, `DB_SSLMODE=require`).
3. **Foto**: *Project Settings > API*, salin **Project URL** ke `SUPABASE_URL` dan kunci **service_role** ke `SUPABASE_SERVICE_KEY`. Kunci ini rahasia: hanya di `.env` server, jangan pernah di `config.js` atau frontend.
4. Jalankan:
   ```bash
   php artisan migrate               # membuat tabel di Supabase dan menyalakan RLS
   php artisan resep:siapkan-storage # membuat bucket publik "foto"
   ```
5. Terbitkan backend ke Vercel (bagian berikut), lalu isi `scriptUrl` di `config.js` dengan `https://<backend-anda>.vercel.app/api` dan terbitkan ulang aplikasinya. Ini wajib: semua pembeli masuk ke server ini.
6. Siapkan pengirim email (bagian **Email** di bawah).

### 3. Hosting di Vercel

Vercel menjalankan Laravel lewat runtime komunitas [`vercel-php`](https://github.com/vercel-community/php) (PHP 8.3). Database dan foto tetap di Supabase. Buat **dua proyek Vercel** dari repositori GitHub yang sama:

**a. Backend (Laravel)**

1. Vercel > **Add New > Project**, pilih repositori ini, lalu di **Root Directory** pilih `backend`. *Framework Preset*: **Other**. Pengaturan lainnya sudah ada di `backend/vercel.json` (semua permintaan ke `api/index.php`, storage dan cache di `/tmp`, log ke `stderr`).
2. Di **Settings > Environment Variables**, isi:

   | Nama | Nilai |
   |---|---|
   | `APP_KEY` | hasil `php artisan key:generate --show` |
   | `APP_URL` | `https://<backend-anda>.vercel.app` |
   | `FRONTEND_URL` | alamat aplikasi, mis. `https://<frontend-anda>.vercel.app` (untuk tautan di email) |
   | `MAIL_MAILER`, `MAIL_SCHEME`, `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD`, `MAIL_FROM_ADDRESS`, `MAIL_FROM_NAME` | pengirim email (lihat **Email**) |
   | `DB_HOST` | host **Transaction pooler** Supabase, mis. `aws-0-ap-southeast-1.pooler.supabase.com` |
   | `DB_PORT` | `6543` |
   | `DB_DATABASE` | `postgres` |
   | `DB_USERNAME` | `postgres.<ref-proyek>` |
   | `DB_PASSWORD` | kata sandi database Supabase |
   | `DB_EMULATE_PREPARES` | `true` (wajib untuk Transaction pooler) |
   | `SUPABASE_URL` | `https://<ref-proyek>.supabase.co` |
   | `SUPABASE_SERVICE_KEY` | kunci `service_role` (rahasia) |
   | `CORS_ORIGINS` | alamat frontend, mis. `https://<frontend-anda>.vercel.app` (atau `*`) |

   `DB_CONNECTION=pgsql`, `DB_SSLMODE=require`, `APP_ENV=production`, dan `APP_DEBUG=false` sudah diisi oleh `vercel.json`.
3. **Deploy**, lalu buka `https://<backend-anda>.vercel.app/api`. Harus tampil `{"ok":true,...}`.

Migrasi **tidak** dijalankan di Vercel. Jalankan dari komputer (`php artisan migrate`, dengan `.env` mengarah ke Supabase) setiap kali ada migrasi baru.

Batasan Vercel yang perlu diketahui:

- Disk Vercel tidak permanen, jadi foto **wajib** ke Supabase Storage. Tanpa `SUPABASE_URL`/`SUPABASE_SERVICE_KEY`, unggah foto ditolak dengan pesan yang jelas.
- Satu permintaan maksimal 4,5 MB. Foto dari aplikasi sudah dikompres (maksimal 900 piksel), dan server menolak foto di atas sekitar 3 MB.
- Vercel tidak bisa memakai alamat database langsung Supabase (IPv6), jadi pakai pooler. *Transaction pooler* (6543) paling cocok untuk serverless; *Session pooler* (5432) juga bisa tanpa `DB_EMULATE_PREPARES`.

**b. Frontend (PWA)**, opsional sebagai pengganti GitHub Pages

1. Buat proyek Vercel kedua dari repositori yang sama dengan **Root Directory** kosong (folder utama). `vercel.json` di folder utama sudah mengatur build: memperbarui cache offline lalu hanya menerbitkan berkas aplikasi (folder `backend/`, `tests/`, dan lainnya tidak ikut).
2. Deploy, lalu pakai alamat `https://<frontend-anda>.vercel.app`. Pasang ke layar utama HP dari alamat ini.

Bila tetap memakai GitHub Pages untuk frontend, lewati langkah b; cukup isi `CORS_ORIGINS` dengan alamat GitHub Pages Anda.

Semua tabel memakai Row Level Security tanpa kebijakan, sehingga API otomatis Supabase (kunci `anon`) tidak bisa membaca data. Laravel tetap bisa karena masuk sebagai pemilik tabel.

### Email

Email akun baru dan lupa kata sandi dikirim lewat SMTP. Pilihan mudah: [Resend](https://resend.com) atau [Brevo](https://www.brevo.com) (ada paket gratis), dengan domain Anda sendiri yang sudah diverifikasi supaya email tidak masuk Spam. Contoh isian untuk Resend ada di `backend/.env.example` (`MAIL_HOST=smtp.resend.com`, `MAIL_PORT=465`, `MAIL_SCHEME=smtps`, `MAIL_USERNAME=resend`, `MAIL_PASSWORD=<API key>`). Bila email gagal terkirim saat pendaftaran, akun tidak dibuat dan pembeli melihat pesan untuk mencoba lagi.

## Menerbitkan ke GitHub Pages

1. Buat repositori di GitHub dan unggah seluruh isi folder ini (cabang `main`).
2. Pilih **salah satu**:
   - **Otomatis (disarankan)**: di *Settings > Pages > Source* pilih **GitHub Actions**. Berkas `.github/workflows/pages.yml` menjalankan uji lalu menerbitkan setiap kali Anda push.
   - **Manual**: *Source > Deploy from a branch > main / (root)*. Sebelum commit, jalankan `npm run sw` agar daftar cache offline mutakhir.
3. Alamatnya `https://<nama-pengguna>.github.io/<nama-repositori>/`. Buka di HP, lalu pasang ke layar utama.

Aplikasi memakai alamat berbasis `#` sehingga berjalan di subfolder GitHub Pages tanpa pengaturan tambahan.

Isi `scriptUrl` di `config.js` dengan alamat API server Anda (wajib untuk dijual). URL itu bukan rahasia, tetapi **jangan pernah menaruh kunci atau kata sandi** di berkas ini.

## Kunci layar perangkat (opsional)

Selain login akun, pengguna bisa menambah kata sandi khusus perangkat di **Pengaturan > Keamanan > Buat kata sandi** (minimal 6 karakter), misalnya untuk HP yang dipakai bersama. Sesudah itu:

- Setiap kali aplikasi dibuka di perangkat itu (atau setelah lama tidak dipakai), yang tampil lebih dulu adalah halaman **Masuk**. Isi aplikasi tidak dimuat ke halaman sebelum kata sandi benar.
- **Kunci otomatis** bisa diatur: 1, 5, 15, 30 menit, 1 jam, atau hanya saat aplikasi ditutup. **Kunci sekarang** ada di Pengaturan, di Beranda (ikon gembok), dan di sisi kiri pada laptop.
- Salah kata sandi dua kali masih langsung bisa mengulang; sesudahnya ada jeda 1, 2, 4, … sampai 30 detik.
- **Penilai yang membuka kode QR tidak pernah diminta masuk.** Halaman penilai terpisah dari data pemilik.
- **Lupa kata sandi perangkat?** Masukkan **kata sandi akun** untuk menghapusnya tanpa kehilangan data, atau **keluar dari akun** (data perangkat dihapus; data di server aman dan kembali setelah masuk lagi).

Yang perlu diketahui dengan jujur: kata sandi disimpan sebagai hash PBKDF2-SHA256 dengan garam acak, hanya di perangkat ini, dan **tidak ikut ke server maupun berkas cadangan**. Ia mengunci *tampilan* aplikasi, bukan mengenkripsi data di browser. Orang yang mahir dan memegang perangkat Anda masih bisa membaca data lewat alat pengembang browser, jadi tetap pakai kunci layar HP. Kata sandi butuh koneksi aman (HTTPS atau `localhost`); GitHub Pages sudah HTTPS.

## Nama dan logo aplikasi

Di **Pengaturan > Nama dan logo aplikasi**, isi nama (maksimal 40 karakter) dan pilih gambar logo. Logo otomatis diperkecil menjadi PNG maksimal 256 piksel (transparan boleh). Setelah **Simpan tampilan**:

- Nama dan logo tampil di beranda, halaman masuk, sisi kiri pada laptop, kartu kode QR, dan judul serta ikon tab browser.
- Keduanya disimpan di server (tabel `setelan`, logo di Supabase Storage), jadi ikut muncul di perangkat Anda yang lain dan **di halaman penilai** yang dibuka lewat QR.
- **Kembalikan bawaan** menghapus nama dan logo sendiri.

**Ikon dan nama di layar utama HP tidak ikut berubah.** Keduanya dibaca browser dari berkas `manifest.webmanifest` dan folder `icons/` saat aplikasi dipasang, sehingga tidak bisa diganti dari dalam aplikasi. Untuk mengubahnya: ganti `icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `icon-180.png`, dan `icon.svg` dengan logo Anda (ukuran sama), ubah `name` dan `short_name` di `manifest.webmanifest`, jalankan `npm run sw`, terbitkan ulang, lalu hapus dan pasang ulang aplikasinya di HP.

## Cara kerja penilaian lewat QR

- Di halaman eksperimen, pilih **Bagikan kode QR**. Tautan berisi token acak 16 karakter untuk eksperimen itu.
- Penilai membuka tautan tanpa login, mengisi lima penggeser, nama (boleh dikosongkan atau diwajibkan), dan komentar. Jawaban dikirim langsung ke server Anda, tanpa melalui aplikasi Anda.
- QR **baru aktif setelah eksperimen tersinkron** ke server. Aplikasi memberi tahu bila belum.
- Penilaian masuk ke perangkat Anda pada sinkron berikutnya (otomatis tiap menit saat aplikasi terbuka).
- Untuk menutup penilaian, matikan **Terima penilaian** di halaman QR, lalu sinkron.

## Keamanan singkat

- Semua tindakan pemilik (sinkron, unggah foto, ubah akun) butuh token sesi dari login. Server hanya menyimpan hash SHA-256 token itu, dan setiap baca/tulis dibatasi ke data akun pemilik token. Token tidak ikut berkas cadangan.
- Kata sandi akun disimpan dengan bcrypt (bawaan Laravel). Mengganti kata sandi mengeluarkan perangkat lain; atur ulang lewat email mengeluarkan semua perangkat.
- Penilai hanya bisa membaca nama resep, nomor eksperimen, dan foto hasil, serta mengirim satu penilaian. Mereka tidak bisa membaca atau mengubah data lain.
- Masukan penilai dibersihkan: nilai harus bilangan bulat 1 sampai 10, teks dipotong, karakter kontrol dibuang, dan petunjuk dari pemilik juga dibatasi panjangnya. Server Laravel membatasi 180 permintaan per menit per alamat IP. Setiap eksperimen menerima maksimal 500 penilaian.
- Siapa pun yang memegang tautan QR dapat menilai berkali-kali. Untuk uji pasar kecil ini wajar; matikan **Terima penilaian** bila sudah cukup.
- Foto dan logo disimpan di bucket publik Supabase Storage agar tampil di aplikasi dan halaman penilai. Jangan unggah gambar yang bersifat pribadi.
- Kata sandi aplikasi (lihat bagian di atas) hanya mengunci tampilan di perangkat itu dan bukan enkripsi data.

## Cara data disimpan dan disinkronkan

- Satu dokumen JSON di IndexedDB perangkat. Setiap baris punya waktu ubah; penghapusan ditandai (bukan dibuang) supaya perangkat lain ikut menghapus.
- Sinkron mengirim baris yang berubah lalu menerima baris baru. Jika dua perangkat mengubah baris yang sama, **yang terakhir diubah menang**.
- Foto disimpan di perangkat sebagai JPEG maksimal 900 piksel, lalu diunggah ke Supabase Storage saat sinkron.
- Aplikasi meminta browser menjaga penyimpanan tetap permanen. Tetap unduh **cadangan** dari Pengaturan sesekali.

## Struktur folder

```
index.html, config.js, manifest.webmanifest, sw.js   berkas yang diterbitkan
css/app.css                                           gaya (HP dan laptop)
js/main.js                                            titik masuk, sinkron otomatis
js/lib/                                               logika murni (HPP, satuan, skor, data, sinkron, akun, kunci)
js/ui/ dan js/layar/                                  komponen dan layar (termasuk masuk.js)
vendor/                                               Preact + htm, qrcode, font (lihat vendor/LISENSI.md)
contoh/foto/                                          foto untuk "Muat data contoh" (sumber dan lisensi: contoh/SUMBER.md)
icons/                                                ikon aplikasi
backend/                                              backend Laravel (API, migrasi database, Supabase)
tools/                                                server uji dan pembaruan cache offline
tests/                                                uji otomatis
```

## Pengujian

```bash
npm test          # uji logika, data, sinkronisasi, kata sandi, dan PWA (tanpa paket tambahan)
npm i             # sekali saja, memasang playwright-core
npm run e2e       # semua alur di browser Chromium: bahan, resep, eksperimen, HPP, QR, penilai, offline,
                  # lalu masuk/daftar akun, kunci layar, lupa kata sandi, keluar, serta nama dan logo aplikasi
npm run e2e:masuk # hanya alur masuk dan merek (SS=/folder untuk menyimpan tangkapan layar)
npm run test:api  # backend Laravel sungguhan (lihat bagian Backend Laravel + Supabase)
```

`npm run e2e` memakai Chrome, Edge, atau Chromium yang sudah ada di komputer (dicari otomatis); atur `CHROMIUM=/jalur/ke/browser` bila lokasinya berbeda.

## Rumus yang dipakai

- Biaya takaran = jumlah dalam satuan dasar × (harga beli ÷ isi kemasan dalam satuan dasar).
- Biaya resep tambahan = (biaya bahan resep itu + resep tambahannya sendiri) ÷ hasil jadinya × jumlah yang dipakai; atau × jumlah resep bila dipilih "resep penuh". Biaya lain resep itu (kemasan, gas, dll.) tidak ikut, supaya tidak terhitung dua kali.
- HPP per porsi = (biaya bahan + biaya resep tambahan + biaya lain per resep + biaya lain per porsi × porsi) ÷ porsi.
- Harga jual minimum = HPP ÷ (1 − margin). Tombol "Pakai" membulatkan ke atas ke kelipatan Rp 500.
- Margin sebenarnya = (harga jual − HPP) ÷ harga jual.
- BEP (porsi) = modal awal ÷ laba per porsi, dibulatkan ke atas. Target jual per bulan = laba bulanan yang diinginkan ÷ laba per porsi.
