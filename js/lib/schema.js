// Skema tabel. Satu tabel di sini = satu tabel di database server (lihat backend/config/goodrecipes.php).
//
// Tipe kolom: t = teks, n = angka, b = ya/tidak, j = JSON (daftar/objek, disimpan sebagai teks).
// Kolom di `lokal` hanya ada di perangkat (mis. foto mentah) dan tidak dikirim ke server.
// Setiap baris juga punya `diubah` (waktu ubah, ms) dan `dihapus` (penanda hapus).

export const TABEL = {
  Kategori: {
    awalan: 'kat',
    kolom: { id: 't', nama: 't', warna: 't', urutan: 'n' },
  },
  Resep: {
    awalan: 'res',
    kolom: { id: 't', nama: 't', idKategori: 't', targetDicapai: 't', fotoAcuanUrl: 't', idJuara: 't', dibuat: 'n' },
    lokal: ['fotoAcuanLokal'],
  },
  Eksperimen: {
    awalan: 'eks',
    kolom: {
      id: 't', idResep: 't', nomor: 'n', idAsalDuplikat: 't', porsi: 'n', satuanPorsi: 't',
      suhuC: 'n', waktuMenit: 'n', langkah: 'j', catatanKegagalan: 't', fotoHasilUrl: 't',
      tokenNilai: 't', terimaNilai: 'b', wajibNama: 'b', dibuat: 'n',
      // Petunjuk untuk penilai {umum, rasa, tekstur, tampilan, aroma, minatBeli} dan catatan chef (opsional).
      panduanNilai: 'j', catatanChef: 't',
    },
    lokal: ['fotoHasilLokal'],
  },
  Bahan: {
    awalan: 'bhn',
    kolom: {
      id: 't', nama: 't', merek: 't', beliDi: 't', fotoUrl: 't', hargaBeli: 'n', isiKemasan: 'n',
      satuanBeli: 't', hargaDiperbarui: 'n',
      // Batas stok menipis, dalam satuan dasar (g / ml / pcs).
      stokMinimum: 'n',
    },
    lokal: ['fotoLokal'],
  },
  KonversiSatuan: {
    awalan: 'knv',
    kolom: { id: 't', idBahan: 't', satuan: 't', nilai: 'n' },
  },
  BahanEksperimen: {
    awalan: 'be',
    kolom: { id: 't', idEksperimen: 't', idBahan: 't', jumlah: 'n', satuan: 't', urutan: 'n' },
  },
  Penilaian: {
    awalan: 'nil',
    kolom: {
      id: 't', idEksperimen: 't', namaPenilai: 't', rasa: 'n', tekstur: 'n', tampilan: 'n',
      aroma: 'n', minatBeli: 'n', komentar: 't', waktu: 'n', dariPemilik: 'b',
    },
  },
  BiayaLain: {
    awalan: 'byl',
    kolom: { id: 't', idResep: 't', jenis: 't', nilai: 'n', dihitungPer: 't', urutan: 'n' },
  },
  // Resep lain yang dipakai sebagai komponen saat menghitung HPP (mis. saus B di dalam makanan A).
  // satuan: 'porsi' (satuan hasil jadi resep komponen, mis. porsi atau gram) atau 'resep' (satu kali masak).
  // dipakaiPer: 'porsi' (takaran untuk tiap porsi resep ini) atau 'resep' (untuk satu kali masak resep ini).
  ResepTambahan: {
    awalan: 'rtb',
    kolom: { id: 't', idResep: 't', idResepKomponen: 't', jumlah: 'n', satuan: 't', dipakaiPer: 't', urutan: 'n' },
  },
  Target: {
    awalan: 'tgt',
    kolom: {
      id: 't', idResep: 't', idEksperimenHitung: 't', marginTarget: 'n', hargaJual: 'n',
      modalAwal: 'n', labaTargetBulanan: 'n',
      // HPP resep per porsi yang disimpan dengan tombol "Simpan HPP" (packing dicatat terpisah).
      hppSimpan: 'n', packingSimpan: 'n', hppSimpanPada: 'n',
    },
  },
  // Log perubahan bahan resep (dibuat otomatis). bahan = keadaan bahan saat itu [{idBahan, nama, jumlah, satuan, biaya}],
  // perubahan = hanya bahan yang berubah [{jenis: 'tambah'|'hapus'|'takaran'|'harga', nama, lama, baru}].
  // hppLama/hppBaru = HPP resep per porsi (eksperimen yang dihitung) sebelum dan sesudah.
  LogResep: {
    awalan: 'lgr',
    kolom: {
      id: 't', idResep: 't', idEksperimen: 't', nomorEksperimen: 'n', waktu: 'n', sebab: 't',
      hppLama: 'n', hppBaru: 'n', bahan: 'j', perubahan: 'j',
    },
  },
  // Paket: beberapa resep dijual bersama dalam satu kemasan. Biaya paket (kotak, label) dihitung sekali.
  // hppSimpan: HPP paket yang disimpan dengan tombol "Simpan HPP paket" (dipakai di menu jual), seperti HPP resep.
  Paket: {
    awalan: 'pkt',
    kolom: { id: 't', nama: 't', marginTarget: 'n', hargaJual: 'n', dibuat: 'n', hppSimpan: 'n', hppSimpanPada: 'n', fotoUrl: 't' },
    lokal: ['fotoLokal'],
  },
  // pakaiPacking: biaya packing resep ini tetap ikut di HPP paket (mis. risol tetap diberi plastik).
  // Bawaan (kosong/false): packing resep dibuang karena paket punya packing sendiri.
  IsiPaket: {
    awalan: 'ipk',
    kolom: { id: 't', idPaket: 't', idResep: 't', jumlah: 'n', urutan: 'n', pakaiPacking: 'b' },
  },
  BiayaPaket: {
    awalan: 'bpk',
    kolom: { id: 't', idPaket: 't', jenis: 't', nilai: 'n', urutan: 'n' },
  },
  Marketing: {
    awalan: 'mkt',
    kolom: { id: 't', idResep: 't', jenis: 't', judul: 't', alasan: 't', status: 't', dibuat: 'n' },
  },
  // ---------- Stok, produksi, penjualan ----------
  // Stok = jumlah semua mutasi (baris hanya ditambah), supaya aman dipakai banyak perangkat.
  // MutasiBahan.jumlah dalam satuan dasar bahan (g / ml / pcs): + masuk (beli), − keluar (produksi).
  // jenis: 'beli' | 'produksi' | 'koreksi'. harga = total harga belanja (jenis 'beli').
  MutasiBahan: {
    awalan: 'mbh',
    kolom: { id: 't', idBahan: 't', jumlah: 'n', jenis: 't', idRef: 't', harga: 'n', catatan: 't', waktu: 'n' },
  },
  // Satu kali produksi di dapur: `kali` resep dari eksperimen idEksperimen, menghasilkan `hasil` porsi.
  // Hasil produksi tidak otomatis masuk stok: dikirim ke stok produk (MutasiMakanan jenis 'produksi', idRef = id produksi)
  // setelah dicek. reject = jumlah hasil yang tidak lolos (tidak dijual).
  Produksi: {
    awalan: 'prd',
    kolom: { id: 't', idResep: 't', idEksperimen: 't', kali: 'n', hasil: 'n', hppPorsi: 'n', catatan: 't', waktu: 'n', reject: 'n' },
  },
  // Stok makanan jadi per resep (dalam satuan porsi resep). jenis: 'produksi' | 'jual' | 'koreksi' | 'rusak'.
  MutasiMakanan: {
    awalan: 'mmk',
    kolom: { id: 't', idResep: 't', jumlah: 'n', jenis: 't', idRef: 't', catatan: 't', waktu: 'n' },
  },
  // Menu yang dijual toko. jenis 'resep' | 'paket'; idRef = id resep/paket. online = tampil di link pemesanan.
  Menu: {
    awalan: 'mnu',
    // diskon = potongan harga produk (0 = tanpa diskon): persen, atau Rupiah bila diskonJenis 'nominal'.
    // diskonJenis 'persen' (bawaan, juga bila kosong) | 'nominal'. diskonSampai = batas waktu (ms, 0 = tanpa batas).
    // opsi = pilihan tambahan berbayar [{nama, harga}], mis. "Digoreng" +2000, "Tambah keju" +3000 (boleh pilih beberapa).
    // segera = "Coming soon": harga tidak ditampilkan di etalase, tetapi tetap bisa dipesan seperti biasa (untuk uji coba).
    kolom: { id: 't', jenis: 't', idRef: 't', nama: 't', harga: 'n', fotoUrl: 't', keterangan: 't', aktif: 'b', online: 'b', urutan: 'n', diskon: 'n', diskonJenis: 't', diskonSampai: 'n', opsi: 'j', segera: 'b' },
  },
  // Pesanan. item = [{idMenu, nama, harga, jumlah, opsi?}] (idMenu kosong = item di luar menu; opsi = nama pilihan tambahan,
  // harga sudah termasuk pilihan tambahan). sumber 'kasir' | 'online' | 'manual'.
  // Pesanan manual: saluran (WhatsApp, Telepon, ...), jadwal ambil/antar (ms), alamat antar, ongkir.
  // Pesanan online: caraAmbil 'ambil' (diambil sendiri) | 'ojol' (ojek online dipesan pembeli sendiri) + jadwal jam ambil.
  // Lacak pesanan: buktiPada = waktu pembeli menekan "Kirim bukti bayar" (ms), kendala = pesan dari dapur untuk pembeli
  // ('' = tidak ada), riwayat = [{status, waktu}] perubahan status untuk timeline.
  // status: 'menunggu' (online, belum dibayar) | 'baru' | 'diproses' | 'siap' | 'selesai' | 'batal'.
  // Status bayar dibaca dari tabel Pembayaran (ada yang lunas = lunas).
  Pesanan: {
    awalan: 'psn',
    kolom: {
      id: 't', nomor: 't', sumber: 't', idPelanggan: 't', nama: 't', hp: 't', catatan: 't', item: 'j',
      subtotal: 'n', diskon: 'n', kodePromo: 't', total: 'n', status: 't', oleh: 't', waktu: 'n',
      saluran: 't', jadwal: 'n', alamat: 't', ongkir: 'n', caraAmbil: 't',
      buktiPada: 'n', kendala: 't', riwayat: 'j',
    },
  },
  // metode 'tunai' | 'transfer' (transfer/QRIS manual) | 'mayar'. status 'menunggu' | 'lunas' | 'batal'. Baris Mayar dibuat dan dilunasi oleh server.
  Pembayaran: {
    awalan: 'byr',
    kolom: {
      id: 't', idPesanan: 't', metode: 't', jumlah: 'n', diterima: 'n', kembalian: 'n', status: 't',
      idMayar: 't', linkMayar: 't', waktu: 'n', lunasPada: 'n',
    },
  },
  // Pelanggan dikenali dari nomor WhatsApp (hp: hanya angka, diawali 62).
  Pelanggan: {
    awalan: 'plg',
    kolom: { id: 't', nama: 't', hp: 't', catatan: 't', dibuat: 'n' },
  },
  // Kode promo. jenis 'persen' | 'nominal'. untuk: 'semua' | 'baru' (belum pernah pesan) | 'lama'.
  // idMenu = promo khusus satu produk ('' = seluruh belanja): minJumlah = minimal beli produk itu,
  // berlaku 'kelipatan' (tiap minJumlah item dapat potongan; bawaan) | 'sekali' (1x per pesanan).
  Promo: {
    awalan: 'prm',
    kolom: {
      id: 't', kode: 't', nama: 't', jenis: 't', nilai: 'n', minBelanja: 'n', maksDiskon: 'n', untuk: 't',
      mulai: 'n', sampai: 'n', kuota: 'n', aktif: 'b', online: 'b', idMenu: 't', minJumlah: 'n', berlaku: 't',
    },
  },
  // Satu baris saja (id tetap 'stl_merek'): nama dan logo aplikasi, ikut tersinkron dan tampil di halaman penilai.
  // Banner informasi di etalase / kasir (diatur admin): judul, teks, gambar, warna, dan tombol.
  // aksi: '' | 'menu' | 'kategori' | 'promo' | 'wa' | 'link'; nilai = nama kategori / kode promo / alamat link.
  // tampilDi: 'etalase' | 'kasir' | 'semua'. Ukuran tampil 250 x 100 (rasio 5:2).
  // Judul dan teks kosong + ada gambar = banner gambar saja (gambar penuh, tanpa tulisan).
  Banner: {
    awalan: 'bnr',
    kolom: {
      id: 't', judul: 't', teks: 't', fotoUrl: 't', warna: 't', tombol: 't', aksi: 't', nilai: 't',
      tampilDi: 't', aktif: 'b', urutan: 'n',
    },
    lokal: ['fotoLokal'],
  },
  // Testimoni pembeli: dikirim pembeli dari halaman status pesanan (tampil setelah disetujui admin),
  // atau ditulis admin. Yang tampil = muncul di bawah halaman pemesanan.
  Testimoni: {
    awalan: 'tst',
    kolom: { id: 't', nama: 't', isi: 't', bintang: 'n', idPesanan: 't', tampil: 'b', sumber: 't', waktu: 'n' },
  },
  Setelan: {
    awalan: 'stl',
    // Baris 'stl_toko': nama toko, link pemesanan (tokenToko), buka/tutup, alamat, WhatsApp.
    // Pembayaran manual: rekening = [{bank, nomor, atasNama}], foto QRIS (qrisUrl). pakaiMayar = pakai Mayar bila kuncinya diisi.
    kolom: {
      id: 't', namaAplikasi: 't', logoUrl: 't',
      namaToko: 't', tokenToko: 't', tokoBuka: 'b', alamatToko: 't', waToko: 't', catatanToko: 't',
      rekening: 'j', qrisUrl: 't', pakaiMayar: 'b',
      // Foto header beranda etalase pembeli dan halaman katalog kasir.
      headerUrl: 't', headerKasirUrl: 't',
    },
    lokal: ['logoLokal', 'qrisLokal', 'headerLokal', 'headerKasirLokal'],
  },
};

export const NAMA_TABEL = Object.keys(TABEL);

// Akun toko hanya menerima dan mengirim tabel berikut (sama dengan backend/config/goodrecipes.php).
export const TABEL_TOKO_BACA = ['Kategori', 'Resep', 'Paket', 'IsiPaket', 'Menu', 'MutasiMakanan', 'Pesanan', 'Pembayaran', 'Pelanggan', 'Promo', 'Setelan', 'Banner'];
export const TABEL_TOKO_TULIS = ['MutasiMakanan', 'Pesanan', 'Pembayaran', 'Pelanggan'];

const META = { diubah: 'n', dihapus: 'b' };

function tipeKolom(tabel, nama) {
  return TABEL[tabel].kolom[nama] || META[nama];
}

/** Baris lokal -> objek sederhana untuk dikirim (tanpa kolom lokal). */
export function keBaris(tabel, baris) {
  const def = TABEL[tabel];
  const keluar = {};
  for (const nama of [...Object.keys(def.kolom), 'diubah', 'dihapus']) {
    const nilai = baris[nama];
    if (nilai === undefined || nilai === null) {
      if (nama === 'dihapus') keluar[nama] = false;
      continue;
    }
    const tipe = tipeKolom(tabel, nama);
    keluar[nama] = tipe === 'j' ? JSON.stringify(nilai) : nilai;
  }
  return keluar;
}

function bacaBool(v) {
  return v === true || v === 1 || /^(true|1|ya)$/i.test(String(v));
}

/** Baris dari server (bisa berupa teks) -> baris bertipe. */
export function dariBaris(tabel, mentah) {
  const def = TABEL[tabel];
  const baris = {};
  for (const nama of [...Object.keys(def.kolom), 'diubah', 'dihapus']) {
    const v = mentah[nama];
    const tipe = tipeKolom(tabel, nama);
    if (tipe === 'n') {
      baris[nama] = v === '' || v === undefined || v === null ? null : Number(v);
      if (Number.isNaN(baris[nama])) baris[nama] = null;
    } else if (tipe === 'b') {
      baris[nama] = bacaBool(v);
    } else if (tipe === 'j') {
      try {
        baris[nama] = typeof v === 'string' ? JSON.parse(v || 'null') : v ?? null;
      } catch {
        baris[nama] = null;
      }
    } else {
      baris[nama] = v === undefined || v === null ? '' : String(v);
    }
  }
  return baris;
}

/** Pasangan [kolom foto lokal, kolom tautan foto di server] per tabel. */
export const KOLOM_FOTO = {
  Resep: [['fotoAcuanLokal', 'fotoAcuanUrl']],
  Paket: [['fotoLokal', 'fotoUrl']],
  Banner: [['fotoLokal', 'fotoUrl']],
  Eksperimen: [['fotoHasilLokal', 'fotoHasilUrl']],
  Bahan: [['fotoLokal', 'fotoUrl']],
  Setelan: [['logoLokal', 'logoUrl'], ['qrisLokal', 'qrisUrl'], ['headerLokal', 'headerUrl'], ['headerKasirLokal', 'headerKasirUrl']],
};
