<?php

/*
| Pengaturan backend Eksperimen Resep.
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
                'isiKemasan' => 'n', 'satuanBeli' => 't', 'hargaDiperbarui' => 'n',
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
            'kolom' => ['id' => 't', 'idResep' => 't', 'idResepKomponen' => 't', 'jumlah' => 'n', 'satuan' => 't', 'urutan' => 'n'],
        ],
        'Target' => [
            'db' => 'target',
            'kolom' => [
                'id' => 't', 'idResep' => 't', 'idEksperimenHitung' => 't', 'marginTarget' => 'n', 'hargaJual' => 'n',
                'modalAwal' => 'n', 'labaTargetBulanan' => 'n',
            ],
        ],
        'Marketing' => [
            'db' => 'marketing',
            'kolom' => ['id' => 't', 'idResep' => 't', 'jenis' => 't', 'judul' => 't', 'alasan' => 't', 'status' => 't', 'dibuat' => 'n'],
        ],
        'Setelan' => [
            'db' => 'setelan',
            'kolom' => ['id' => 't', 'namaAplikasi' => 't', 'logoUrl' => 't'],
        ],
    ],
];
