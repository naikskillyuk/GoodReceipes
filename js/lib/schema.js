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
  ResepTambahan: {
    awalan: 'rtb',
    kolom: { id: 't', idResep: 't', idResepKomponen: 't', jumlah: 'n', satuan: 't', urutan: 'n' },
  },
  Target: {
    awalan: 'tgt',
    kolom: {
      id: 't', idResep: 't', idEksperimenHitung: 't', marginTarget: 'n', hargaJual: 'n',
      modalAwal: 'n', labaTargetBulanan: 'n',
    },
  },
  Marketing: {
    awalan: 'mkt',
    kolom: { id: 't', idResep: 't', jenis: 't', judul: 't', alasan: 't', status: 't', dibuat: 'n' },
  },
  // Satu baris saja (id tetap 'stl_merek'): nama dan logo aplikasi, ikut tersinkron dan tampil di halaman penilai.
  Setelan: {
    awalan: 'stl',
    kolom: { id: 't', namaAplikasi: 't', logoUrl: 't' },
    lokal: ['logoLokal'],
  },
};

export const NAMA_TABEL = Object.keys(TABEL);

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

/** Pasangan [kolom foto lokal, kolom foto di Drive] per tabel. */
export const KOLOM_FOTO = {
  Resep: [['fotoAcuanLokal', 'fotoAcuanUrl']],
  Eksperimen: [['fotoHasilLokal', 'fotoHasilUrl']],
  Bahan: [['fotoLokal', 'fotoUrl']],
  Setelan: [['logoLokal', 'logoUrl']],
};
