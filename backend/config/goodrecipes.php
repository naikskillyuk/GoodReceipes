<?php

/*
| Pengaturan backend Good Receipes.
|
| Skema tabel di bawah harus sama dengan js/lib/schema.js di frontend.
| Nama tabel/kolom di aplikasi (camelCase) dipetakan ke nama tabel/kolom
| database (snake_case), mis. Eksperimen.idResep -> eksperimen.id_resep.
|
| Tipe kolom: t = teks, n = angka, b = ya/tidak, j = JSON.
| Setiap tabel juga punya `diubah` (waktu ubah, ms) dan `dihapus` (penanda hapus).
*/

return [

    // Alamat aplikasi (frontend) untuk tautan di email, mis. https://resep-anda.vercel.app
    'frontend_url' => env('FRONTEND_URL', ''),

    // Toko yang tampil di halaman depan situs (tanpa token link). Kosong = toko pertama yang aktif.
    'toko_utama_email' => env('TOKO_UTAMA_EMAIL', ''),

    'versi' => 2,

    // Vercel mengisi VERCEL=1 secara otomatis.
    'di_vercel' => (bool) env('VERCEL', false),

    'maks_baris_per_permintaan' => 3000,
    // Karakter base64 (sekitar 3 MB). Vercel menolak permintaan di atas 4,5 MB; foto dari aplikasi
    // sudah dikompres ke maksimal 900 piksel sehingga biasanya jauh di bawah ini.
    'maks_panjang_foto' => 4_000_000,
    'maks_nilai_per_eksperimen' => 500,

    // Penyimpanan foto. Bila SUPABASE_URL dan SUPABASE_SERVICE_KEY diisi, foto masuk ke
    // Supabase Storage (bucket publik). Bila kosong, foto disimpan di disk server ini
    // (storage/app/foto) dan dilayani lewat /foto/{nama}.
    'supabase' => [
        'url' => rtrim((string) env('SUPABASE_URL', ''), '/'),
        'service_key' => env('SUPABASE_SERVICE_KEY', ''),
        'bucket' => env('SUPABASE_BUCKET', 'foto'),
    ],

    'tabel' => [
        'Kategori' => [
            'db' => 'kategori',
            'kolom' => ['id' => 't', 'nama' => 't', 'warna' => 't', 'urutan' => 'n'],
        ],
        'Resep' => [
            'db' => 'resep',
            'kolom' => [
                'id' => 't', 'nama' => 't', 'idKategori' => 't', 'targetDicapai' => 't', 'fotoAcuanUrl' => 't',
                'idJuara' => 't', 'dibuat' => 'n',
            ],
        ],
        'Eksperimen' => [
            'db' => 'eksperimen',
            'kolom' => [
                'id' => 't', 'idResep' => 't', 'nomor' => 'n', 'idAsalDuplikat' => 't', 'porsi' => 'n', 'satuanPorsi' => 't',
                'suhuC' => 'n', 'waktuMenit' => 'n', 'langkah' => 'j', 'catatanKegagalan' => 't', 'fotoHasilUrl' => 't',
                'tokenNilai' => 't', 'terimaNilai' => 'b', 'wajibNama' => 'b', 'dibuat' => 'n',
                'panduanNilai' => 'j', 'catatanChef' => 't',
            ],
        ],
        'Bahan' => [
            'db' => 'bahan',
            'kolom' => [
                'id' => 't', 'nama' => 't', 'merek' => 't', 'beliDi' => 't', 'fotoUrl' => 't', 'hargaBeli' => 'n',
                'isiKemasan' => 'n', 'satuanBeli' => 't', 'hargaDiperbarui' => 'n', 'stokMinimum' => 'n',
            ],
        ],
        'KonversiSatuan' => [
            'db' => 'konversi_satuan',
            'kolom' => ['id' => 't', 'idBahan' => 't', 'satuan' => 't', 'nilai' => 'n'],
        ],
        'BahanEksperimen' => [
            'db' => 'bahan_eksperimen',
            'kolom' => ['id' => 't', 'idEksperimen' => 't', 'idBahan' => 't', 'jumlah' => 'n', 'satuan' => 't', 'urutan' => 'n'],
        ],
        'Penilaian' => [
            'db' => 'penilaian',
            'kolom' => [
                'id' => 't', 'idEksperimen' => 't', 'namaPenilai' => 't', 'rasa' => 'n', 'tekstur' => 'n', 'tampilan' => 'n',
                'aroma' => 'n', 'minatBeli' => 'n', 'komentar' => 't', 'waktu' => 'n', 'dariPemilik' => 'b',
            ],
        ],
        'BiayaLain' => [
            'db' => 'biaya_lain',
            'kolom' => ['id' => 't', 'idResep' => 't', 'jenis' => 't', 'nilai' => 'n', 'dihitungPer' => 't', 'urutan' => 'n'],
        ],
        // Resep lain yang dipakai sebagai komponen HPP (mis. saus B di dalam makanan A).
        'ResepTambahan' => [
            'db' => 'resep_tambahan',
            'kolom' => [
                'id' => 't', 'idResep' => 't', 'idResepKomponen' => 't', 'jumlah' => 'n', 'satuan' => 't', 'dipakaiPer' => 't',
                'urutan' => 'n',
            ],
        ],
        'Target' => [
            'db' => 'target',
            'kolom' => [
                'id' => 't', 'idResep' => 't', 'idEksperimenHitung' => 't', 'marginTarget' => 'n', 'hargaJual' => 'n',
                'modalAwal' => 'n', 'labaTargetBulanan' => 'n',
                // HPP resep per porsi yang disimpan dengan tombol "Simpan HPP".
                'hppSimpan' => 'n', 'packingSimpan' => 'n', 'hppSimpanPada' => 'n',
            ],
        ],
        // Paket: beberapa resep dijual bersama dalam satu kemasan.
        'Paket' => [
            'db' => 'paket',
            'kolom' => ['id' => 't', 'nama' => 't', 'marginTarget' => 'n', 'hargaJual' => 'n', 'dibuat' => 'n', 'hppSimpan' => 'n', 'hppSimpanPada' => 'n', 'fotoUrl' => 't'],
        ],
        'IsiPaket' => [
            'db' => 'isi_paket',
            'kolom' => ['id' => 't', 'idPaket' => 't', 'idResep' => 't', 'jumlah' => 'n', 'urutan' => 'n', 'pakaiPacking' => 'b'],
        ],
        'BiayaPaket' => [
            'db' => 'biaya_paket',
            'kolom' => ['id' => 't', 'idPaket' => 't', 'jenis' => 't', 'nilai' => 'n', 'urutan' => 'n'],
        ],
        'Marketing' => [
            'db' => 'marketing',
            'kolom' => ['id' => 't', 'idResep' => 't', 'jenis' => 't', 'judul' => 't', 'alasan' => 't', 'status' => 't', 'dibuat' => 'n'],
        ],
        // Stok = jumlah semua mutasi. MutasiBahan.jumlah dalam satuan dasar bahan (g / ml / pcs).
        'MutasiBahan' => [
            'db' => 'mutasi_bahan',
            'kolom' => ['id' => 't', 'idBahan' => 't', 'jumlah' => 'n', 'jenis' => 't', 'idRef' => 't', 'harga' => 'n', 'catatan' => 't', 'waktu' => 'n'],
        ],
        'Produksi' => [
            'db' => 'produksi',
            'kolom' => ['id' => 't', 'idResep' => 't', 'idEksperimen' => 't', 'kali' => 'n', 'hasil' => 'n', 'hppPorsi' => 'n', 'catatan' => 't', 'waktu' => 'n', 'reject' => 'n'],
        ],
        'MutasiMakanan' => [
            'db' => 'mutasi_makanan',
            'kolom' => ['id' => 't', 'idResep' => 't', 'jumlah' => 'n', 'jenis' => 't', 'idRef' => 't', 'catatan' => 't', 'waktu' => 'n'],
        ],
        'Menu' => [
            'db' => 'menu',
            'kolom' => [
                'id' => 't', 'jenis' => 't', 'idRef' => 't', 'nama' => 't', 'harga' => 'n', 'fotoUrl' => 't', 'keterangan' => 't',
                'aktif' => 'b', 'online' => 'b', 'urutan' => 'n', 'diskon' => 'n', 'diskonSampai' => 'n', 'opsi' => 'j',
            ],
        ],
        'Pesanan' => [
            'db' => 'pesanan',
            'kolom' => [
                'id' => 't', 'nomor' => 't', 'sumber' => 't', 'idPelanggan' => 't', 'nama' => 't', 'hp' => 't', 'catatan' => 't', 'item' => 'j',
                'subtotal' => 'n', 'diskon' => 'n', 'kodePromo' => 't', 'total' => 'n', 'status' => 't', 'oleh' => 't', 'waktu' => 'n',
                'saluran' => 't', 'jadwal' => 'n', 'alamat' => 't', 'ongkir' => 'n', 'caraAmbil' => 't',
            ],
        ],
        'Pembayaran' => [
            'db' => 'pembayaran',
            'kolom' => [
                'id' => 't', 'idPesanan' => 't', 'metode' => 't', 'jumlah' => 'n', 'diterima' => 'n', 'kembalian' => 'n', 'status' => 't',
                'idMayar' => 't', 'linkMayar' => 't', 'waktu' => 'n', 'lunasPada' => 'n',
            ],
        ],
        'Pelanggan' => [
            'db' => 'pelanggan',
            'kolom' => ['id' => 't', 'nama' => 't', 'hp' => 't', 'catatan' => 't', 'dibuat' => 'n'],
        ],
        'Promo' => [
            'db' => 'promo',
            'kolom' => [
                'id' => 't', 'kode' => 't', 'nama' => 't', 'jenis' => 't', 'nilai' => 'n', 'minBelanja' => 'n', 'maksDiskon' => 'n', 'untuk' => 't',
                'mulai' => 'n', 'sampai' => 'n', 'kuota' => 'n', 'aktif' => 'b', 'online' => 'b',
            ],
        ],
        'Setelan' => [
            'db' => 'setelan',
            'kolom' => [
                'id' => 't', 'namaAplikasi' => 't', 'logoUrl' => 't',
                'namaToko' => 't', 'tokenToko' => 't', 'tokoBuka' => 'b', 'alamatToko' => 't', 'waToko' => 't', 'catatanToko' => 't',
                'rekening' => 'j', 'qrisUrl' => 't', 'pakaiMayar' => 'b', 'headerUrl' => 't', 'headerKasirUrl' => 't',
            ],
        ],
        'Banner' => [
            'db' => 'banner',
            'kolom' => [
                'id' => 't', 'judul' => 't', 'teks' => 't', 'fotoUrl' => 't', 'warna' => 't', 'tombol' => 't', 'aksi' => 't', 'nilai' => 't',
                'tampilDi' => 't', 'aktif' => 'b', 'urutan' => 'n',
            ],
        ],
        'Testimoni' => [
            'db' => 'testimoni',
            'kolom' => [
                'id' => 't', 'nama' => 't', 'isi' => 't', 'bintang' => 'n', 'idPesanan' => 't', 'tampil' => 'b', 'sumber' => 't', 'waktu' => 'n',
            ],
        ],
    ],

    // Akun toko (dibuat oleh akun dapur) hanya menerima dan mengirim tabel ini. Sama dengan js/lib/schema.js.
    'tabel_toko_baca' => ['Kategori', 'Resep', 'Paket', 'IsiPaket', 'Menu', 'MutasiMakanan', 'Pesanan', 'Pembayaran', 'Pelanggan', 'Promo', 'Setelan', 'Banner'],
    'tabel_toko_tulis' => ['MutasiMakanan', 'Pesanan', 'Pembayaran', 'Pelanggan'],

    // Kolom angka berisi waktu (ms): disimpan sebagai bilangan bulat besar.
    'kolom_waktu' => ['dibuat', 'waktu', 'hargaDiperbarui', 'hppSimpanPada', 'lunasPada', 'mulai', 'sampai', 'jadwal', 'diskonSampai'],

    // Mayar (payment gateway). Kunci API milik tiap akun dapur disimpan terenkripsi di tabel users.
    'mayar' => [
        'produksi' => 'https://api.mayar.id/hl/v2',
        'sandbox' => 'https://api.mayar.io/hl/v2',
        // Lama link pembayaran berlaku (menit).
        'menit_berlaku' => 60,
    ],

    // Batas pesanan dari link pemesanan pembeli.
    'maks_item_pesanan' => 30,
    'maks_jumlah_per_item' => 100,
    'pesanan_online_per_jam_per_ip' => 20,
];
