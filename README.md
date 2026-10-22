# Eksperimen Resep

Aplikasi web untuk mencatat eksperimen resep masakan sampai ketemu resep juara, lalu menghitung HPP, harga jual, titik impas, dan menyusun ide pemasaran. Dibuat untuk dipakai terutama di HP, dan tampil memenuhi layar di laptop. Data tersimpan di perangkat Anda lebih dulu (tetap jalan tanpa internet), lalu disalin ke **Google Spreadsheet milik Anda sendiri**.

## Yang bisa dilakukan

- **Resep** dengan kategori, gambar acuan masakan, dan target yang ingin dicapai.
- **Eksperimen** 1..n per resep: bahan dan takaran, suhu, waktu, langkah, catatan kegagalan, foto hasil akhir. Eksperimen bisa **diduplikat** lalu diubah sedikit; bahan yang berubah ditandai dan selisih biaya ditampilkan.
- **Penilaian** 1 sampai 10 untuk rasa, tekstur, tampilan, aroma, dan minat beli. Orang lain menilai lewat **kode QR tanpa login**, boleh disertai komentar. Anda sendiri yang menandai eksperimen **juara**.
- **Daftar bahan** dengan foto, merek, tempat beli, harga, dan **konversi satuan** (beli per kg, dipakai per gram, sdm, sdt, atau butir).
- **HPP dan harga**: HPP per resep dan per porsi, harga jual minimum dari margin yang diinginkan, laba per porsi, titik impas (BEP), dan target penjualan per bulan.
- **Marketing**: ide konten dan ide pemasaran per resep, dengan status dan rencana pekan ini.
- **Halaman masuk**: kata sandi pemilik untuk membuka aplikasi di perangkat ini, dengan kunci otomatis saat lama tidak dipakai.
- **Nama dan logo aplikasi** yang bisa diganti sendiri dan tampil di beranda, halaman masuk, kode QR, dan halaman penilai.
- Bisa dipasang ke layar utama (PWA) dan dibuka tanpa internet.

## Mencoba di komputer

Butuh Node.js 20 atau lebih baru. Tidak ada paket yang perlu dipasang untuk menjalankan aplikasi.

```bash
npm run dev
```

Buka http://localhost:8080. Di **Pengaturan**, isi alamat `http://localhost:8080/api` dan kunci `kunci-dev` untuk mencoba sinkronisasi dan penilaian QR tanpa akun Google. Server uji menjalankan berkas `apps-script/Code.gs` yang sama dengan yang nanti Anda pasang di Google. Data uji disimpan di `.dev-data.json` (hapus berkas ini atau jalankan `node tools/dev-server.mjs --reset` untuk mengosongkan).

Tombol **Muat data contoh** (Beranda atau Pengaturan) mengisi empat resep contoh supaya semua layar bisa dilihat.

## Menyambungkan Google Spreadsheet

Satu kali saja, sekitar 5 menit.

1. Buat Google Spreadsheet baru (kosong). Nama bebas, misalnya "Database Eksperimen Resep".
2. Menu **Ekstensi > Apps Script** (*Extensions > Apps Script*).
3. Hapus isi editor, lalu tempel seluruh isi `apps-script/Code.gs`.
4. Ganti nilai `KUNCI` di baris paling atas dengan kata sandi panjang buatan Anda. **Ubah hanya di editor Apps Script, jangan di berkas yang Anda commit ke GitHub.**
5. Klik **Deploy > New deployment** (di tampilan bahasa Indonesia: *Terapkan > Deployment baru*), lalu pilih jenis **Web app** (*Aplikasi web*).
   - *Execute as* (Jalankan sebagai): **Me** (Saya)
   - *Who has access* (Yang memiliki akses): **Anyone** (Siapa saja)
6. Klik **Deploy** dan setujui izin akses Spreadsheet dan Drive. Google akan memperingatkan bahwa aplikasi belum diverifikasi; itu skrip Anda sendiri, jadi pilih *Advanced > Go to ... (unsafe)*.
7. Salin **Web app URL** (berakhiran `/exec`).
8. Di aplikasi, buka **Pengaturan > Sambungan ke Google Spreadsheet**, tempel URL dan kunci, tekan **Tes koneksi**, lalu **Simpan** dan **Sinkron sekarang**.

Setelah itu, tab-tab data muncul otomatis di Spreadsheet, dan foto masuk ke folder Drive **Foto Eksperimen Resep**. Mengubah `Code.gs` di kemudian hari? Pilih **Deploy > Manage deployments > Edit > New version** supaya URL tetap sama.

Di HP atau laptop lain, cukup isi URL dan kunci yang sama di Pengaturan; semua data ditarik dari Spreadsheet.

## Menerbitkan ke GitHub Pages

1. Buat repositori di GitHub dan unggah seluruh isi folder ini (cabang `main`).
2. Pilih **salah satu**:
   - **Otomatis (disarankan)**: di *Settings > Pages > Source* pilih **GitHub Actions**. Berkas `.github/workflows/pages.yml` menjalankan uji lalu menerbitkan setiap kali Anda push.
   - **Manual**: *Source > Deploy from a branch > main / (root)*. Sebelum commit, jalankan `npm run sw` agar daftar cache offline mutakhir.
3. Alamatnya `https://<nama-pengguna>.github.io/<nama-repositori>/`. Buka di HP, lalu pasang ke layar utama.

Aplikasi memakai alamat berbasis `#` sehingga berjalan di subfolder GitHub Pages tanpa pengaturan tambahan.

Opsional: isi `scriptUrl` di `config.js` dengan URL Apps Script Anda agar tautan QR untuk penilai lebih pendek dan alamat itu otomatis terisi di perangkat baru. URL itu bukan rahasia, tetapi **jangan pernah menaruh kunci** di berkas ini.

## Halaman masuk dan kata sandi

Di **Pengaturan > Keamanan**, pilih **Buat kata sandi** (minimal 6 karakter). Sesudah itu:

- Setiap kali aplikasi dibuka di perangkat itu (atau setelah lama tidak dipakai), yang tampil lebih dulu adalah halaman **Masuk**. Isi aplikasi tidak dimuat ke halaman sebelum kata sandi benar.
- **Kunci otomatis** bisa diatur: 1, 5, 15, 30 menit, 1 jam, atau hanya saat aplikasi ditutup. **Kunci sekarang** ada di Pengaturan, di Beranda (ikon gembok), dan di sisi kiri pada laptop.
- Salah kata sandi dua kali masih langsung bisa mengulang; sesudahnya ada jeda 1, 2, 4, … sampai 30 detik.
- **Penilai yang membuka kode QR tidak pernah diminta masuk.** Halaman penilai terpisah dari data pemilik.
- **Lupa kata sandi?** Ada dua jalan: masukkan **kunci rahasia Apps Script** (nilai `KUNCI` di Code.gs) untuk menghapus kata sandi tanpa kehilangan data, atau **kosongkan data perangkat ini** (kata sandi dan kunci Apps Script di perangkat ikut dihapus; data di Spreadsheet aman dan kembali setelah kunci dimasukkan lagi dan sinkron).

Yang perlu diketahui dengan jujur: kata sandi disimpan sebagai hash PBKDF2-SHA256 dengan garam acak, hanya di perangkat ini, dan **tidak ikut ke Spreadsheet maupun berkas cadangan**. Ia mengunci *tampilan* aplikasi, bukan mengenkripsi data di browser. Orang yang mahir dan memegang perangkat Anda masih bisa membaca data lewat alat pengembang browser, jadi tetap pakai kunci layar HP. Kata sandi butuh koneksi aman (HTTPS atau `localhost`); GitHub Pages sudah HTTPS.

## Nama dan logo aplikasi

Di **Pengaturan > Nama dan logo aplikasi**, isi nama (maksimal 40 karakter) dan pilih gambar logo. Logo otomatis diperkecil menjadi PNG maksimal 256 piksel (transparan boleh). Setelah **Simpan tampilan**:

- Nama dan logo tampil di beranda, halaman masuk, sisi kiri pada laptop, kartu kode QR, dan judul serta ikon tab browser.
- Keduanya disimpan di Spreadsheet (lembar `Setelan`, logo di Drive), jadi ikut muncul di perangkat Anda yang lain dan **di halaman penilai** yang dibuka lewat QR. Untuk penilai ini, tempel ulang `apps-script/Code.gs` yang terbaru lalu **Deploy > Kelola deployment > Versi baru**. Tanpa pembaruan itu semuanya tetap jalan, hanya penilai melihat nama dan logo bawaan.
- **Kembalikan bawaan** menghapus nama dan logo sendiri.

**Ikon dan nama di layar utama HP tidak ikut berubah.** Keduanya dibaca browser dari berkas `manifest.webmanifest` dan folder `icons/` saat aplikasi dipasang, sehingga tidak bisa diganti dari dalam aplikasi. Untuk mengubahnya: ganti `icons/icon-192.png`, `icon-512.png`, `icon-maskable-512.png`, `icon-180.png`, dan `icon.svg` dengan logo Anda (ukuran sama), ubah `name` dan `short_name` di `manifest.webmanifest`, jalankan `npm run sw`, terbitkan ulang, lalu hapus dan pasang ulang aplikasinya di HP.

## Cara kerja penilaian lewat QR

- Di halaman eksperimen, pilih **Bagikan kode QR**. Tautan berisi token acak 16 karakter untuk eksperimen itu.
- Penilai membuka tautan tanpa login, mengisi lima penggeser, nama (boleh dikosongkan atau diwajibkan), dan komentar. Jawaban dikirim langsung ke Apps Script Anda, tanpa melalui aplikasi Anda.
- QR **baru aktif setelah eksperimen tersinkron** ke Spreadsheet. Aplikasi memberi tahu bila belum.
- Penilaian masuk ke perangkat Anda pada sinkron berikutnya (otomatis tiap menit saat aplikasi terbuka).
- Untuk menutup penilaian, matikan **Terima penilaian** di halaman QR, lalu sinkron.

## Keamanan singkat

- Semua tindakan pemilik (sinkron, unggah foto) butuh `KUNCI`; perbandingan dilakukan dengan waktu konstan. Kunci hanya disimpan di perangkat Anda dan tidak ikut berkas cadangan.
- Penilai hanya bisa membaca nama resep, nomor eksperimen, dan foto hasil, serta mengirim satu penilaian. Mereka tidak bisa membaca atau mengubah data lain.
- Masukan penilai dibersihkan: nilai harus bilangan bulat 1 sampai 10, teks dipotong, karakter kontrol dibuang, dan awalan rumus Spreadsheet (`=`, `+`, `-`, `@`) dinetralkan. Setiap eksperimen menerima maksimal 500 penilaian.
- Siapa pun yang memegang tautan QR dapat menilai berkali-kali. Untuk uji pasar kecil ini wajar; matikan **Terima penilaian** bila sudah cukup.
- Foto dan logo diberi akses "siapa pun dengan tautan" agar tampil di aplikasi dan halaman penilai. Jangan unggah gambar yang bersifat pribadi.
- Kata sandi aplikasi (lihat bagian di atas) hanya mengunci tampilan di perangkat itu dan bukan enkripsi data.

## Cara data disimpan dan disinkronkan

- Satu dokumen JSON di IndexedDB perangkat. Setiap baris punya waktu ubah; penghapusan ditandai (bukan dibuang) supaya perangkat lain ikut menghapus.
- Sinkron mengirim baris yang berubah lalu menerima baris baru. Jika dua perangkat mengubah baris yang sama, **yang terakhir diubah menang**.
- Foto disimpan di perangkat sebagai JPEG maksimal 900 piksel, lalu diunggah ke Drive saat sinkron.
- Aplikasi meminta browser menjaga penyimpanan tetap permanen. Tetap unduh **cadangan** dari Pengaturan sesekali.

## Struktur folder

```
index.html, config.js, manifest.webmanifest, sw.js   berkas yang diterbitkan
css/app.css                                           gaya (HP dan laptop)
js/main.js                                            titik masuk, sinkron otomatis
js/lib/                                               logika murni (HPP, satuan, skor, data, sinkron, kunci)
js/ui/ dan js/layar/                                  komponen dan layar (termasuk masuk.js)
vendor/                                               Preact + htm, qrcode, font (lihat vendor/LISENSI.md)
icons/                                                ikon aplikasi
apps-script/Code.gs                                   backend Google Apps Script
tools/                                                server uji dan pembaruan cache offline
tests/                                                uji otomatis
```

## Pengujian

```bash
npm test          # uji logika, data, sinkronisasi, kata sandi, dan PWA (tanpa paket tambahan)
npm i             # sekali saja, memasang playwright-core
npm run e2e       # semua alur di browser Chromium: bahan, resep, eksperimen, HPP, QR, penilai, offline,
                  # lalu halaman masuk, kunci otomatis, lupa kata sandi, serta nama dan logo aplikasi
npm run e2e:masuk # hanya alur masuk dan merek (SS=/folder untuk menyimpan tangkapan layar)
```

`npm run e2e` memakai Chromium yang sudah ada di komputer; atur `CHROMIUM=/jalur/ke/chromium` bila lokasinya berbeda.

## Rumus yang dipakai

- Biaya takaran = jumlah dalam satuan dasar × (harga beli ÷ isi kemasan dalam satuan dasar).
- HPP per porsi = (biaya bahan + biaya lain per resep + biaya lain per porsi × porsi) ÷ porsi.
- Harga jual minimum = HPP ÷ (1 − margin). Tombol "Pakai" membulatkan ke atas ke kelipatan Rp 500.
- Margin sebenarnya = (harga jual − HPP) ÷ harga jual.
- BEP (porsi) = modal awal ÷ laba per porsi, dibulatkan ke atas. Target jual per bulan = laba bulanan yang diinginkan ÷ laba per porsi.
