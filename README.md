# rasa.terasrumah

Aplikasi toko dan dapur untuk brand **rasa.terasrumah**: dari eksperimen resep, resep juara, HPP, harga jual, belanja dan stok bahan, produksi, stok produk, sampai kasir, pesanan, dan pembayaran. Dibuat untuk dipakai terutama di HP, dan tampil memenuhi layar di laptop. Semua data tersimpan di server (setiap perubahan langsung dikirim, tanpa tombol sinkron): backend **Laravel** dengan database **PostgreSQL Supabase** (atau MySQL di Laragon untuk uji lokal) dan foto di **Supabase Storage**.

## Dua halaman, satu data

| Alamat | Untuk | Isi |
| --- | --- | --- |
| `https://rasaterasrumah.vercel.app/` | **Etalase toko untuk pembeli**, tanpa login | Banner, pilihan populer, kategori, detail produk, keranjang, status pesanan + cara bayar, testimoni |
| `https://rasaterasrumah.vercel.app/admin` | **Login admin & kasir** | Akun admin (dapur): resep & eksperimen, HPP, harga jual (menu), paket, bahan, stok bahan & belanja, produksi, stok produk, kasir, pesanan, pelanggan/promo/testimoni, pengaturan. Akun kasir (toko): katalog kasir, catat pesanan, status pesanan, stok produk, pelanggan |

Semua memakai data yang sama: harga dan menu yang diatur admin langsung tampil di etalase dan kasir, dan setiap pesanan memotong stok produk. Etalase menampilkan toko yang sudah **diaktifkan** di Pengaturan → Toko online (bila server dipakai beberapa toko, isi `TOKO_UTAMA_EMAIL` di backend dengan email akun admin toko utama). Tautan lama seperti `/#/kasir` otomatis dipindah ke `/admin#/kasir`. `/admin` dilayani oleh `index.html` yang sama lewat `rewrites` di `vercel.json`.

**Mengganti domain** ke `rasaterasrumah.vercel.app`: di Vercel buka proyek frontend → *Settings → Domains* → tambahkan `rasaterasrumah.vercel.app` (atau ganti nama proyek menjadi `rasaterasrumah`). Lalu di proyek backend ubah `FRONTEND_URL=https://rasaterasrumah.vercel.app`, dan bila `CORS_ORIGINS` diisi, tambahkan domain baru itu. Pengguna yang sudah masuk di domain lama perlu masuk sekali lagi di domain baru (data ada di server, tidak hilang).

## Yang bisa dilakukan

- **Resep** dengan kategori, gambar acuan masakan, dan target yang ingin dicapai.
- **Eksperimen** 1..n per resep: bahan dan takaran, suhu, waktu, langkah, catatan kegagalan, foto hasil akhir. Eksperimen bisa **diduplikat** lalu diubah sedikit; bahan yang berubah ditandai dan selisih biaya ditampilkan.
- **Penilaian** 1 sampai 10 untuk rasa, tekstur, tampilan, aroma, dan minat beli. Orang lain menilai lewat **kode QR tanpa login**, boleh disertai komentar. Anda sendiri yang menandai eksperimen **juara**.
- **Daftar bahan** dengan foto, merek, tempat beli, harga, dan **konversi satuan** (beli per kg, dipakai per gram, sdm, sdt, atau butir).
- **Resep tambahan di HPP**: HPP makanan A bisa ikut menghitung resep lain, mis. saus atau isian B (per porsi/gram hasil jadi B, atau per resep penuh). Bisa bertingkat (B memakai C) dan dicegah saling memakai.
- **HPP dan harga**: HPP per resep dan per porsi, harga jual minimum dari margin yang diinginkan, laba per porsi, titik impas (BEP), dan target penjualan per bulan.
- **Marketing**: ide konten dan ide pemasaran per resep, dengan status dan rencana pekan ini.
- **Akun pengguna**: dibuat admin; username dan kata sandi dikirim ke email pembeli. Halaman pembuka dengan foto dan tombol **Login**. Masuk dengan username atau email, ganti kata sandi, lupa kata sandi lewat tautan email, dan keluar. Data setiap akun terpisah.
- **Petunjuk untuk penilai**: tulis apa yang dinilai per aspek (mis. Tekstur: "harus kriuk dan kering", Rasa: "jangan terlalu asin") dan **catatan chef**; penilai melihatnya saat membuka QR.
- **Export PDF satu resep**: data resep, HPP, dan setiap eksperimen (bahan dan biaya, langkah, catatan, foto, skor, serta penilaian beserta komentar), lewat tombol **Export PDF** di halaman resep lalu *Simpan sebagai PDF*.
- **Hapus resep** dari halaman resep; eksperimen, penilaian, HPP, dan marketing-nya ikut terhapus.
- **Nama dan logo aplikasi** yang bisa diganti sendiri dan tampil di beranda, halaman masuk, kode QR, dan halaman penilai.
- **Akun dapur dan akun toko**: akun pembeli aplikasi adalah akun dapur (semua menu). Di Pengaturan, akun dapur membuat **akun toko** (kasir) dengan username dan kata sandi sendiri. Akun toko memakai data usaha yang sama, tetapi hanya bisa membuka Kasir, Pesanan, Stok makanan, Menu, dan Pelanggan; resep, bahan, dan HPP tidak dikirim ke perangkatnya.
- **Stok bahan dan belanja**: catat belanja (stok bertambah, harga bahan untuk HPP ikut diperbarui), hitung ulang stok, dan batas stok menipis.
- **Produksi**: masak X kali resep; stok bahan berkurang sesuai takaran eksperimen juara, stok makanan jadi bertambah.
- **Menu jual**: resep dan **paket**, harga saran dari HPP Jual. Paket yang terjual memotong stok setiap isinya.
- **Kasir dan pesanan**: keranjang, pembeli (nama + WhatsApp), kode promo, bayar **tunai** (dengan kembalian) atau **online lewat Mayar** (QR / link, lunas otomatis). Status pesanan Baru → Diproses → Siap → Selesai, atau Batal (stok kembali).
- **Catat pesanan manual** (akun dapur dan toko): untuk pesanan dari WhatsApp, telepon, atau DM. Bisa memakai menu jual dan item di luar menu (mis. kue custom), jadwal ambil/antar, alamat + ongkir, lalu dicatat belum bayar, lunas tunai, lunas transfer, atau dikirimi link Mayar. Pesanan yang belum dibayar bisa diubah; stok dihitung ulang.
- **Etalase / link pemesanan** untuk pembeli tanpa login: beranda dengan banner, pilihan populer, kategori, detail produk, keranjang, status pesanan, dan **testimoni pembeli** di bagian bawah. Bayar lewat **transfer / QRIS toko** (toko menandai lunas) atau Mayar bila diaktifkan.
- **Pesanan saya (pembeli)**: semua pesanan dari perangkat pembeli tampil sebagai daftar (nomor pesanan + isi di kiri, status + panah di kanan); ketuk panah untuk membuka detail.
- **Coming soon**: di *Menu & Harga Jual* centang *Coming soon*; harga disembunyikan di etalase (kartu, detail, baris keranjang) tetapi menu tetap bisa dipesan seperti biasa untuk uji coba.
- **Beranda etalase**: logo besar di atas sapaan, menu kategori, lalu *Top Selling* (6 menu terlaris, grid 2 × 3).
- **Lacak pesanan untuk pembeli**: detail pesanan menampilkan timeline: pesanan dibuat, bukti bayar dikirim, pembayaran dikonfirmasi toko, diterima & disiapkan, siap diambil / dijemput driver, dan selesai (lengkap dengan jamnya). Saat pembeli menekan *Kirim bukti bayar via WhatsApp*, toko melihat tanda *Bukti bayar dikirim* di kasir. Di detail pesanan, kasir/admin bisa menulis **kendala dari dapur** (mis. oven bermasalah, pesanan mundur) yang langsung tampil sebagai pemberitahuan di halaman pembeli, lalu menandai *Kendala selesai*.
- **Beranda kasir**: akun kasir membuka beranda berisi pesanan yang perlu ditindaklanjuti (bukti bayar masuk, belum dibayar, pesanan baru, sedang diproses, siap diambil) dengan tombol tindak lanjut dan WhatsApp, serta tren penjualan 7 / 30 hari: pemasukan (dibanding periode sebelumnya), jumlah pesanan, rata-rata per pesanan, belum dibayar, grafik pemasukan per hari, dan menu favorit. Katalog kasir ada di menu *Katalog*.
- **Cara ambil pesanan online**: di keranjang etalase pembeli wajib memilih *Ambil sendiri* atau *Ojek online (dipesan pembeli)* beserta jamnya. Toko tidak memesankan ojek: pembeli memesan Gojek / Grab sendiri ke alamat toko, ongkir dibayar ke driver. Cara dan jam ambil tampil di daftar dan detail pesanan kasir/admin, halaman status pembeli, dan pesan bukti bayar WhatsApp.
- **Diskon produk**: di *Menu & Harga Jual* isi *Diskon (%)* dan (opsional) tanggal berakhir. Harga coret + label "-X%" tampil di etalase dan kasir; harga diskon dihitung server, margin memakai harga setelah diskon dan ada peringatan bila di bawah HPP. Kode promo tetap di *Pelanggan, Promo & Testimoni*.
- **Banner & Header** (menu admin): foto header beranda etalase (dengan sapaan, nama toko, dan kolom cari) dan foto header kasir; banner informasi berukuran 250 × 100 px (judul, teks, gambar, warna, tombol ke menu / kategori / kode promo / WhatsApp / link; kosongkan judul dan teks untuk banner gambar saja yang bisa ditekan) yang tampil bergeser di etalase dan/atau kasir, bisa diurutkan dan disembunyikan.
- **Menu & Harga Jual dalam tabel**: kolom HPP, harga jual, untung per jual, margin, stok, dan status. *Tambah menu* membuka formulir: pilih resep/paket, harga jual (ada harga saran), ringkasan potensi keuntungan, diskon, varian, keterangan, dan status. *Ubah* di tiap baris membuka formulir yang sama.
- **Foto paket**: unggah di halaman paket; menu paket tampil dengan foto itu di menu jual, kasir, dan etalase. Stok paket = isi yang paling sedikit; bila satu isi kosong, paket *Habis* dan tabel menyebut isi yang kosong.
- **Stok produk dalam tabel**: stok, satuan, status (Tersedia / Menipis / Habis), perubahan terakhir, dan tombol *Kelola* (tambah, hitung ulang, rusak, riwayat).
- **Produksi → kirim ke stok**: mencatat produksi hanya memotong stok bahan. Hasilnya dicek dulu, lalu dikirim lewat *Kirim ke stok* (di riwayat produksi atau kartu *Hasil produksi menunggu dikirim* di halaman Stok produk): isi jumlah yang lolos (masuk stok) dan jumlah reject (tidak dijual). Boleh sebagian; sisanya tetap menunggu.
- **Tambah stok tanpa produksi**: di halaman Stok produk ada form *Tambah stok* (stok awal, titipan, beli jadi), juga di detail tiap produk.
- **Simpan HPP paket**: seperti HPP resep, tekan *Simpan HPP paket* di halaman paket. Angka tersimpan dipakai di Menu & Harga Jual; bila isi atau biaya paket berubah, muncul *Hitungan berubah* dan tombol *Simpan ulang*. Setelah disimpan ada tombol *Masukkan ke Menu & Harga Jual*.
- **Packing di paket**: HPP paket memakai HPP Jual tiap resep tanpa packing-nya (paket punya packing sendiri). Centang *Tetap pakai packing* pada isi paket tertentu (mis. risol tetap diberi plastik) supaya biaya packing resep itu ikut dihitung.
- **Pilihan tambahan / varian berbayar**: di *Menu & Harga Jual* buka *Pilihan tambahan / varian* lalu isi nama dan harganya (mis. Digoreng +Rp 2.000, Tambah keju +Rp 3.000). Pembeli di etalase dan kasir bisa mencentang beberapa pilihan; harga ditambahkan otomatis (dihitung ulang oleh server untuk pesanan online), dan pilihan tercatat di setiap pesanan.
- **Etalase**: layar sambutan (foto latar + logo), banner promo yang bergeser otomatis, ikon pintasan, grid menu, dan testimoni yang bergeser otomatis; warna putih, hijau, dan kuning.
- **Testimoni**: pembeli mengirim testimoni + bintang setelah pesanannya lunas; admin menayangkan, menyembunyikan, atau menulis testimoni sendiri di *Pelanggan, Promo & Testimoni → Testimoni*.
- **Pelanggan dan promo**: pelanggan tercatat otomatis dari nomor WhatsApp (bisa diunduh CSV). Kode promo persen atau potongan, dengan minimal belanja, batas tanggal, kuota, dan khusus pelanggan baru/lama.
- Bisa dipasang ke layar utama (PWA). Saat sinyal putus, aplikasi tetap terbuka dan perubahan menunggu lalu terkirim begitu tersambung lagi.

## Mencoba di komputer

Butuh Node.js 20 atau lebih baru. Tidak ada paket yang perlu dipasang untuk menjalankan aplikasi.

```bash
npm run dev
```

Buka http://localhost:8080. Server uji ini memakai tiruan backend Laravel di memori (`tools/server-tiruan.mjs`, tanpa database dan tanpa email). Di `localhost`, `config.js` sengaja tidak memakai server produksi. Di halaman **Masuk**, isi alamat server `http://localhost:8080/api`, lalu masuk dengan email apa saja dan kata sandi `kunci-dev`. Untuk mencoba akun sungguhan (halaman admin, email, banyak akun), pakai backend Laravel di bawah. Data uji disimpan di `.dev-data.json` (hapus berkas ini atau jalankan `node tools/dev-server.mjs --reset` untuk mengosongkan).

`js/lib/seed.js` berisi empat resep contoh (dipakai tes otomatis, tidak ada tombolnya di aplikasi). Fotonya berlisensi bebas untuk penggunaan komersial (domain publik, CC0, atau CC BY); daftar pembuat dan sumbernya ada di `contoh/SUMBER.md` dan wajib ikut disertakan bila foto itu dipakai.

## Backend Laravel + Supabase

Folder `backend/` berisi API Laravel 13 (PHP 8.3). Semua permintaan masuk ke satu alamat `/api`:

- tanpa login: `masuk`, `lupaSandi`, `aturSandi`, serta `infoNilai` dan `kirimNilai` untuk penilai QR;
- dengan login (token sesi dari `masuk`): `ping`, `sinkron`, `unggahFoto`, `ubahProfil`, `gantiSandi`, `keluar`.

| Bagian | Isi |
|---|---|
| `backend/config/goodrecipes.php` | alamat frontend, batas, dan skema tabel (harus sama dengan `js/lib/schema.js`) |
| `backend/database/migrations/` | tabel akun (`users`, `sesi_masuk`) dan 12 tabel data (`resep`, `eksperimen`, …), masing-masing dengan kolom pemilik `id_pengguna` |
| `backend/app/Services/` | `Akun` (buat akun, masuk, sesi, kata sandi, syarat lunas), `Sinkron` (yang lebih baru menang, per akun), `Foto` (Supabase Storage atau disk), `Penilai` (QR) |
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
3. Jalankan aplikasi (`npm run dev` di folder utama). Buat admin lokal (`php artisan resep:buat-admin "Admin" admin@lokal.test`), buka http://localhost:8000/admin, lalu buat akun pembeli. Username dan kata sandi muncul di Mailpit. Di aplikasi, tekan **Login**; server lokal `http://localhost:8000/api` dipakai otomatis.

Tanpa pengaturan Supabase, foto disimpan di `backend/storage/app/foto` dan dilayani lewat `/foto/...`.

Uji API sungguhan (membuat dua akun uji dan menulis data contoh, jadi pakai database lokal saja):

```bash
API_URL=http://localhost:8000/api PHP=php npm run test:api
```

### Akun pembeli dan halaman admin (untuk penjual aplikasi)

- **Tidak ada pendaftaran sendiri.** Setelah pembeli membayar, buat akunnya di halaman admin `https://<backend-anda>/admin`: isi nama, email, dan pembelian (tanggal, jumlah, metode, lunas). Server membuat **username** (dari nama + 4 angka) dan **kata sandi acak**, lalu mengirim keduanya ke email pembeli. Bila email gagal (atau tidak dicentang), kata sandi ditampilkan sekali di layar.
- Akun hanya bisa masuk bila **aktif dan pembeliannya lunas**. Menandai belum lunas atau menonaktifkan akun langsung mengeluarkan semua perangkatnya; datanya tetap tersimpan.
- Di halaman admin juga: cari dan saring akun, ringkasan pendapatan, ubah nama/email, atur ulang kata sandi (dikirim ke email), dan keluarkan semua perangkat.
- **Tampilan** (menu admin): ganti **logo aplikasi** dan **foto latar halaman Login** untuk semua pengguna. Gambar diperkecil di browser sebelum diunggah (logo 512 px, latar 1600 px) dan disimpan di Supabase Storage; **Kembalikan bawaan** memakai gambar asli lagi. Pengguna yang memasang logo sendiri di Pengaturan tetap memakai logonya.
- Pembeli masuk dengan username atau email, mengganti kata sandi di **Pengaturan > Akun > Ganti kata sandi akun**, dan memakai **Lupa password?** (tautan ke email, berlaku 60 menit, sekali pakai).
- Setiap akun hanya melihat datanya sendiri. Di perangkat yang dipakai bergantian, data akun sebelumnya dihapus dari perangkat saat akun lain masuk.
- Percobaan dibatasi: masuk 10 kali gagal per 5 menit (per IP dan per akun), lupa kata sandi 5 kali per 10 menit per IP, masuk admin 5 kali gagal per 10 menit.

Admin disimpan terpisah dari akun pembeli. Buat admin pertama (atau ganti kata sandinya) dari komputer, di folder `backend`:

```bash
php artisan resep:buat-admin "Nama Anda" email@anda.com --env=production   # kata sandi ditanyakan (minimal 10 karakter)
```

Perintah cadangan (`--env=production` untuk database Supabase):

```bash
php artisan resep:daftar-akun                                    # semua akun beserta status lunas
php artisan resep:buat-akun "Nama Pembeli" email@pembeli.com --jumlah=150000 --metode=QRIS --kirim-email
php artisan resep:akun-aktif sitiaminah1625 tidak                # nonaktifkan; semua perangkatnya keluar
```

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

Email akun baru dan lupa kata sandi dikirim lewat SMTP. Pilihan mudah: [Resend](https://resend.com) atau [Brevo](https://www.brevo.com) (ada paket gratis), dengan domain Anda sendiri yang sudah diverifikasi supaya email tidak masuk Spam. Contoh isian untuk Resend ada di `backend/.env.example` (`MAIL_HOST=smtp.resend.com`, `MAIL_PORT=465`, `MAIL_SCHEME=smtps`, `MAIL_USERNAME=resend`, `MAIL_PASSWORD=<API key>`). Bila email gagal terkirim saat admin membuat akun, akun tetap dibuat dan kata sandinya ditampilkan sekali di halaman admin.

## Menerbitkan ke GitHub Pages

1. Buat repositori di GitHub dan unggah seluruh isi folder ini (cabang `main`).
2. Pilih **salah satu**:
   - **Otomatis (disarankan)**: di *Settings > Pages > Source* pilih **GitHub Actions**. Berkas `.github/workflows/pages.yml` menjalankan uji lalu menerbitkan setiap kali Anda push.
   - **Manual**: *Source > Deploy from a branch > main / (root)*. Sebelum commit, jalankan `npm run sw` agar daftar cache offline mutakhir.
3. Alamatnya `https://<nama-pengguna>.github.io/<nama-repositori>/`. Buka di HP, lalu pasang ke layar utama.

Aplikasi memakai alamat berbasis `#` sehingga berjalan di subfolder GitHub Pages tanpa pengaturan tambahan.

Isi `scriptUrl` di `config.js` dengan alamat API server Anda (wajib untuk dijual). URL itu bukan rahasia, tetapi **jangan pernah menaruh kunci atau kata sandi** di berkas ini.

## Nama dan logo aplikasi

Di **Pengaturan > Nama dan logo aplikasi**, isi nama (maksimal 40 karakter) dan pilih gambar logo. Logo otomatis diperkecil menjadi PNG maksimal 256 piksel (transparan boleh). Setelah **Simpan tampilan**:

- Nama dan logo tampil di beranda, halaman masuk, sisi kiri pada laptop, kartu kode QR, dan judul serta ikon tab browser.
- Keduanya disimpan di server (tabel `setelan`, logo di Supabase Storage), jadi ikut muncul di perangkat Anda yang lain dan **di halaman penilai** yang dibuka lewat QR.
- **Kembalikan bawaan** menghapus nama dan logo sendiri.

**Ikon dan nama di layar utama HP tidak ikut berubah.** Keduanya dibaca browser dari berkas `manifest.webmanifest` dan folder `icons/` saat aplikasi dipasang, sehingga tidak bisa diganti dari dalam aplikasi. Untuk mengubahnya: ganti `icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png` (latar penuh), `icon-180.png` (latar penuh), dan `logo.png` (tanpa kotak, untuk halaman Login) dengan logo Anda (ukuran sama), ubah `name` dan `short_name` di `manifest.webmanifest`, jalankan `npm run sw`, terbitkan ulang, lalu hapus dan pasang ulang aplikasinya di HP.

## Logo dan foto halaman Login

Di `/admin` → **Pengaturan → Tampilan halaman Login**: unggah logo dan foto latar, lalu simpan. Berlaku untuk semua perangkat. Hanya pemilik toko utama yang melihat kartu ini (akun dengan email `TOKO_UTAMA_EMAIL`, atau pemilik toko online yang aktif). Panel server lama (`/admin/tampilan` di alamat backend) tetap bisa dipakai.

## Pembayaran transfer & QRIS (tanpa Mayar)

Bawaan aplikasi: pembayaran non-tunai memakai **rekening bank dan foto QRIS toko**.

1. Di `/admin` → **Pengaturan → Pembayaran transfer & QRIS**: isi bank, nomor rekening, atas nama (boleh lebih dari satu), unggah foto/tangkapan layar QRIS, lalu **Simpan info pembayaran**.
2. Kasir: saat bayar, pilih tab **Transfer / QRIS** untuk menunjukkan QRIS dan rekening ke pembeli, lalu **Tandai lunas** setelah uang masuk.
3. Link pemesanan: pembeli memesan → melihat QRIS + rekening + tombol *Kirim bukti bayar via WhatsApp* (ke nomor WhatsApp toko). Pesanan masuk ke tab **Menunggu bayar**; buka pesanan → **Cek & tandai lunas**. Stok dipotong saat ditandai lunas.

## Pembayaran otomatis Mayar (opsional)

1. Daftar di [Mayar](https://mayar.id) (uji coba: web.mayar.club), lalu buat kunci API **Read & Write** di dashboard: Integrasi → API Key.
2. Di aplikasi, masuk sebagai akun dapur → **Pengaturan → Pembayaran online (Mayar)** → tempel kunci, centang *mode uji* bila kuncinya dari sandbox, lalu **Simpan kunci**. Kunci disimpan terenkripsi di server (tidak pernah dikirim ke aplikasi) dan alamat webhook didaftarkan otomatis. Bila gagal, salin alamat webhook yang tampil ke dashboard Mayar: Integrasi → Webhook.
3. Status lunas tidak dipercaya dari isi webhook saja: server selalu menanyakan ulang ke API Mayar (`GET /payments/{id}`). Kasir dan halaman pembeli juga mengecek berkala, jadi tetap jalan walau webhook terlambat.
4. Isi `FRONTEND_URL` di server supaya pembeli diarahkan kembali ke halaman status pesanan setelah membayar.

Di server uji (`npm run dev`), Mayar ditiru: link bayar membuka halaman **Mayar (tiruan)** dengan tombol *Bayar*.

## Cara kerja penilaian lewat QR

- Di halaman eksperimen, pilih **Bagikan kode QR**. Tautan berisi token acak 16 karakter untuk eksperimen itu.
- Penilai membuka tautan tanpa login, mengisi lima penggeser, nama (boleh dikosongkan atau diwajibkan), dan komentar. Jawaban dikirim langsung ke server Anda, tanpa melalui aplikasi Anda.
- QR aktif begitu eksperimen tersimpan di server (biasanya sedetik setelah disimpan). Aplikasi memberi tahu bila belum.
- Penilaian langsung tersimpan di database (tabel `penilaian`) dan muncul di aplikasi pemilik dalam beberapa detik (diperiksa tiap 20 detik saat aplikasi terbuka).
- Untuk menutup penilaian, matikan **Terima penilaian** di halaman QR; langsung berlaku.

## Keamanan singkat

- Semua tindakan pemilik (simpan data, unggah foto, ubah akun) butuh token sesi dari login. Server hanya menyimpan hash SHA-256 token itu, dan setiap baca/tulis dibatasi ke data akun pemilik token.
- Kata sandi akun disimpan dengan bcrypt (bawaan Laravel). Mengganti kata sandi mengeluarkan perangkat lain; atur ulang lewat email mengeluarkan semua perangkat.
- Penilai hanya bisa membaca nama resep, nomor eksperimen, dan foto hasil, serta mengirim satu penilaian. Mereka tidak bisa membaca atau mengubah data lain.
- Masukan penilai dibersihkan: nilai harus bilangan bulat 1 sampai 10, teks dipotong, karakter kontrol dibuang, dan petunjuk dari pemilik juga dibatasi panjangnya. Server Laravel membatasi 180 permintaan per menit per alamat IP. Setiap eksperimen menerima maksimal 500 penilaian.
- Siapa pun yang memegang tautan QR dapat menilai berkali-kali. Untuk uji pasar kecil ini wajar; matikan **Terima penilaian** bila sudah cukup.
- Foto dan logo disimpan di bucket publik Supabase Storage agar tampil di aplikasi dan halaman penilai. Jangan unggah gambar yang bersifat pribadi.

## Cara data disimpan

- Data utama ada di database server (Supabase). Perangkat hanya menyimpan salinan di IndexedDB supaya aplikasi cepat dan tetap terbuka saat sinyal putus.
- Setiap perubahan dikirim ke server sekitar 1 detik setelah disimpan; data baru (mis. penilaian QR, perubahan dari perangkat lain) diambil saat aplikasi dibuka, tiap 20 detik, dan saat tersambung lagi. Tidak ada tombol sinkron. Bila pengiriman gagal, muncul pemberitahuan dan dicoba lagi otomatis.
- Setiap baris punya waktu ubah; penghapusan ditandai (bukan dibuang) supaya perangkat lain ikut menghapus. Jika dua perangkat mengubah baris yang sama, **yang terakhir diubah menang**.
- Foto diperkecil menjadi JPEG maksimal 900 piksel lalu diunggah ke Supabase Storage.
- Keluar dari akun membuang salinan di perangkat; semua data kembali dari server saat masuk lagi.

## Struktur folder

```
index.html, config.js, manifest.webmanifest, sw.js   berkas yang diterbitkan
css/app.css                                           gaya (HP dan laptop)
js/main.js                                            titik masuk, simpan otomatis ke server
js/lib/                                               logika murni (HPP, satuan, skor, data, sinkron, akun)
js/ui/ dan js/layar/                                  komponen dan layar (termasuk cetak-resep.js untuk export PDF)
vendor/                                               Preact + htm, qrcode, font (lihat vendor/LISENSI.md)
contoh/foto/                                          foto data contoh untuk tes (sumber dan lisensi: contoh/SUMBER.md)
gambar/                                               foto latar halaman Login
icons/                                                ikon aplikasi
backend/                                              backend Laravel (API, migrasi database, Supabase)
tools/                                                server uji dan pembaruan cache offline
tests/                                                uji otomatis
```

## Pengujian

```bash
npm test          # uji logika, data, export, hapus resep, sinkronisasi, dan PWA (tanpa paket tambahan)
npm i             # sekali saja, memasang playwright-core
npm run e2e       # semua alur di browser Chromium: bahan, resep, eksperimen, HPP, QR, penilai, offline,
                  # lalu Login, simpan otomatis ke server, export PDF, hapus resep, keluar, nama dan logo aplikasi
npm run e2e:masuk # hanya alur masuk dan merek (SS=/folder untuk menyimpan tangkapan layar)
npm run e2e:toko  # stok, produksi, menu, kasir, Mayar tiruan, link pemesanan, dan akun toko
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
