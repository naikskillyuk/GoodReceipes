// Data contoh supaya aplikasi bisa dicoba tanpa mengisi dari nol.
// Angka Brownies Fudgy sama dengan mockup: biaya bahan Eks. 3 = Rp 38.960, HPP Rp 4.604 per potong.

import { pastikanKategoriAwal, daftarKategori, simpanBahan, simpanEksperimen, tambahKategori } from './repo.js';
import { ASPEK } from './skor.js';

const HARI = 24 * 3600 * 1000;

/** Foto contoh di folder contoh/foto (sumber dan lisensi: contoh/SUMBER.md). */
const FOTO = (nama) => `contoh/foto/${nama}.jpg`;

/** Lima nilai bulat (1-10) yang totalnya persis `total`. */
function nilaiDariTotal(total) {
  const dasar = Math.floor(total / 5);
  const sisa = total - dasar * 5;
  const hasil = {};
  ASPEK.forEach((a, i) => {
    hasil[a.kunci] = Math.min(10, dasar + (i < sisa ? 1 : 0));
  });
  return hasil;
}

export function muatContoh(db) {
  pastikanKategoriAwal(db);
  const kat = (nama) => daftarKategori(db).find((k) => k.nama === nama) || tambahKategori(db, nama);
  const sekarang = Date.now();

  const bahan = (data, konversi = []) => simpanBahan(db, { satuanBeli: 'kg', isiKemasan: 1, ...data }, konversi).id;
  const kakao = bahan({ nama: 'Cokelat bubuk', fotoUrl: FOTO('cokelat-bubuk'), merek: 'Van Houten', beliDi: 'Toko Sentosa', hargaBeli: 45000, isiKemasan: 500, satuanBeli: 'g' }, [
    { satuan: 'sdm', nilai: 6 },
    { satuan: 'sdt', nilai: 2 },
  ]);
  const dark = bahan({ nama: 'Dark chocolate', merek: 'Collata', beliDi: 'Toko Sentosa', hargaBeli: 95000 });
  const mentega = bahan({ nama: 'Mentega tawar', fotoUrl: FOTO('mentega'), merek: 'Anchor', beliDi: 'Pasar Induk', hargaBeli: 120000 });
  const gula = bahan({ nama: 'Gula pasir', fotoUrl: FOTO('gula-pasir'), merek: 'Gulaku', beliDi: 'Toko Sentosa', hargaBeli: 18000 }, [{ satuan: 'sdm', nilai: 12 }]);
  const telur = bahan({ nama: 'Telur ayam', fotoUrl: FOTO('telur'), merek: 'Peternak lokal', beliDi: 'Pasar Induk', hargaBeli: 30000 }, [{ satuan: 'butir', nilai: 55 }]);
  const terigu = bahan({ nama: 'Tepung terigu', merek: 'Segitiga Biru', beliDi: 'Toko Sentosa', hargaBeli: 13000 });
  const susu = bahan({ nama: 'Susu cair', fotoUrl: FOTO('susu'), merek: 'Full cream', beliDi: 'Minimarket', hargaBeli: 18000, satuanBeli: 'l' });
  const kopi = bahan({ nama: 'Kopi bubuk arabika', fotoUrl: FOTO('kopi-bubuk'), merek: 'Lokal sangrai', beliDi: 'Roastery', hargaBeli: 120000 }, [{ satuan: 'sdm', nilai: 5 }]);
  const gulaAren = bahan({ nama: 'Gula aren cair', merek: '', beliDi: 'Pasar Induk', hargaBeli: 30000, satuanBeli: 'l' });
  const ayam = bahan({ nama: 'Dada ayam fillet', fotoUrl: FOTO('dada-ayam'), merek: '', beliDi: 'Pasar Induk', hargaBeli: 42000 });
  const mayo = bahan({ nama: 'Mayones', fotoUrl: FOTO('mayones'), merek: 'Kewpie', beliDi: 'Minimarket', hargaBeli: 38000, isiKemasan: 1 });
  const sambal = bahan({ nama: 'Bawang merah dan serai', fotoUrl: FOTO('bawang-merah'), merek: '', beliDi: 'Pasar Induk', hargaBeli: 35000 });

  const ulasan = (idEksp, daftarTotal, mulaiHariLalu = 6) => {
    const nama = ['Sari', 'Dewi', 'Budi', 'Rina', 'Andi', 'Maya', 'Tono', 'Lina'];
    daftarTotal.forEach((total, i) => {
      db.simpan('Penilaian', {
        idEksperimen: idEksp,
        namaPenilai: nama[i % nama.length],
        ...nilaiDariTotal(total),
        komentar: ['Enak, tidak terlalu manis.', 'Teksturnya pas, mau beli lagi.', 'Aromanya enak, tampilannya bisa lebih rapi.', ''][i % 4],
        waktu: sekarang - (mulaiHariLalu - i) * HARI * 0.5,
        dariPemilik: false,
      });
    });
  };

  const eksperimen = (idResep, nomor, data, baris) =>
    simpanEksperimen(db, {
      eksperimen: { idResep, nomor, idAsalDuplikat: '', terimaNilai: true, wajibNama: false, fotoHasilLokal: '', fotoHasilUrl: '', dibuat: sekarang - (10 - nomor) * HARI, ...data },
      baris,
    });

  // ----- Brownies Fudgy -----
  const brownies = db.simpan('Resep', {
    nama: 'Brownies Fudgy',
    idKategori: kat('Kue').id,
    targetDicapai: 'Rasa minimal 8, HPP di bawah Rp 5.000 per potong, tekstur fudgy dan lembap, tidak seret.',
    fotoAcuanLokal: '',
    fotoAcuanUrl: FOTO('brownies-1'),
    idJuara: '',
    dibuat: sekarang - 12 * HARI,
  });
  const langkah = [
    'Lelehkan cokelat dan mentega, aduk sampai halus.',
    'Kocok telur dan gula 3 menit, campurkan lelehan cokelat.',
    'Masukkan terigu dan cokelat bubuk, aduk rata.',
    'Panggang 175°C selama 28 menit di loyang 20×20 cm.',
  ];
  const e1 = eksperimen(brownies.id, 1, { porsi: 16, satuanPorsi: 'potong', suhuC: 180, waktuMenit: 30, langkah, catatanKegagalan: 'Terlalu manis dan agak kering di pinggir.' }, [
    { idBahan: dark, jumlah: 150, satuan: 'g' },
    { idBahan: mentega, jumlah: 100, satuan: 'g' },
    { idBahan: gula, jumlah: 200, satuan: 'g' },
    { idBahan: telur, jumlah: 3, satuan: 'butir' },
    { idBahan: terigu, jumlah: 100, satuan: 'g' },
  ]);
  const e2 = eksperimen(brownies.id, 2, { fotoHasilUrl: FOTO('brownies-2'), porsi: 16, satuanPorsi: 'potong', suhuC: 175, waktuMenit: 30, langkah, catatanKegagalan: 'Bagian tengah masih terlalu basah.' }, [
    { idBahan: dark, jumlah: 150, satuan: 'g' },
    { idBahan: mentega, jumlah: 120, satuan: 'g' },
    { idBahan: gula, jumlah: 170, satuan: 'g' },
    { idBahan: telur, jumlah: 3, satuan: 'butir' },
    { idBahan: terigu, jumlah: 70, satuan: 'g' },
  ]);
  const e3 = eksperimen(brownies.id, 3, { fotoHasilUrl: FOTO('brownies-1'), porsi: 16, satuanPorsi: 'potong', suhuC: 175, waktuMenit: 28, langkah, catatanKegagalan: 'Sudah pas. Permukaan retak tipis seperti yang diinginkan.', idAsalDuplikat: e2.id }, [
    { idBahan: dark, jumlah: 150, satuan: 'g' },
    { idBahan: mentega, jumlah: 120, satuan: 'g' },
    { idBahan: gula, jumlah: 150, satuan: 'g' },
    { idBahan: telur, jumlah: 3, satuan: 'butir' },
    { idBahan: terigu, jumlah: 80, satuan: 'g' },
    { idBahan: kakao, jumlah: 3, satuan: 'sdm' },
  ]);
  const e4 = eksperimen(brownies.id, 4, { fotoHasilUrl: FOTO('brownies-3'), porsi: 16, satuanPorsi: 'potong', suhuC: 170, waktuMenit: 32, langkah, catatanKegagalan: 'Lebih padat, kurang fudgy dibanding Eks. 3.', idAsalDuplikat: e3.id }, [
    { idBahan: dark, jumlah: 150, satuan: 'g' },
    { idBahan: mentega, jumlah: 120, satuan: 'g' },
    { idBahan: gula, jumlah: 150, satuan: 'g' },
    { idBahan: telur, jumlah: 3, satuan: 'butir' },
    { idBahan: terigu, jumlah: 100, satuan: 'g' },
    { idBahan: kakao, jumlah: 3, satuan: 'sdm' },
  ]);
  ulasan(e1.id, [32, 33]);
  ulasan(e2.id, [38, 37, 39]);
  ulasan(e3.id, [44, 40, 42, 43, 41, 42]); // rata-rata 8,4
  ulasan(e4.id, [39, 38]);
  db.simpan('Resep', { ...db.ambil('Resep', brownies.id), idJuara: e3.id });
  db.simpan('BiayaLain', { idResep: brownies.id, jenis: 'Kemasan', nilai: 1200, dihitungPer: 'porsi', urutan: 0 });
  db.simpan('BiayaLain', { idResep: brownies.id, jenis: 'Gas dan listrik', nilai: 3500, dihitungPer: 'resep', urutan: 1 });
  db.simpan('BiayaLain', { idResep: brownies.id, jenis: 'Tenaga kerja', nilai: 12000, dihitungPer: 'resep', urutan: 2 });
  db.simpan('Target', { idResep: brownies.id, idEksperimenHitung: e3.id, marginTarget: 40, hargaJual: 8000, modalAwal: 1500000, labaTargetBulanan: 3000000 });
  [
    ['konten', 'Reels: proses membuat brownies dari lelehan sampai potongan', 'Tekstur fudgy sangat menarik di video close-up.', 'dijadwalkan'],
    ['konten', 'Carousel: 4 eksperimen sampai ketemu resep juara', 'Cerita proses membangun kepercayaan pembeli.', 'ide'],
    ['konten', 'Story polling: lebih suka fudgy atau chewy?', 'Murah, cepat, dan memancing interaksi.', 'ide'],
    ['pemasaran', 'Tes pasar: 10 kotak ke teman dan komunitas', 'Dapat ulasan dan harga yang diterima sebelum produksi besar.', 'dijadwalkan'],
    ['pemasaran', 'Pre-order batch pertama', 'Produksi sesuai pesanan, risiko bahan terbuang kecil.', 'ide'],
    ['pemasaran', 'Paket hampers akhir pekan', 'Menaikkan nilai per pesanan.', 'ide'],
  ].forEach(([jenis, judul, alasan, status]) => db.simpan('Marketing', { idResep: brownies.id, jenis, judul, alasan, status, dibuat: sekarang }));

  // ----- Es Kopi Susu Gula Aren -----
  const kopiResep = db.simpan('Resep', {
    nama: 'Es Kopi Susu Gula Aren',
    idKategori: kat('Minuman').id,
    targetDicapai: 'Rasa kopi kuat tapi tidak pahit, HPP di bawah Rp 6.000 per gelas.',
    fotoAcuanLokal: '',
    fotoAcuanUrl: FOTO('es-kopi-1'),
    idJuara: '',
    dibuat: sekarang - 8 * HARI,
  });
  const ek1 = eksperimen(kopiResep.id, 1, { fotoHasilUrl: FOTO('es-kopi-2'), porsi: 10, satuanPorsi: 'gelas', suhuC: null, waktuMenit: 15, langkah: ['Seduh kopi pekat.', 'Campur susu dan gula aren.', 'Tuang ke gelas berisi es.'], catatanKegagalan: 'Terlalu encer.' }, [
    { idBahan: kopi, jumlah: 6, satuan: 'sdm' },
    { idBahan: susu, jumlah: 1000, satuan: 'ml' },
    { idBahan: gulaAren, jumlah: 150, satuan: 'ml' },
  ]);
  const ek2 = eksperimen(kopiResep.id, 2, { fotoHasilUrl: FOTO('es-kopi-1'), porsi: 10, satuanPorsi: 'gelas', suhuC: null, waktuMenit: 15, langkah: ['Seduh kopi pekat.', 'Campur susu dan gula aren.', 'Tuang ke gelas berisi es.'], catatanKegagalan: '' }, [
    { idBahan: kopi, jumlah: 9, satuan: 'sdm' },
    { idBahan: susu, jumlah: 900, satuan: 'ml' },
    { idBahan: gulaAren, jumlah: 180, satuan: 'ml' },
  ]);
  ulasan(ek1.id, [32, 33]);
  ulasan(ek2.id, [37, 36, 35, 36]); // rata-rata 7,2
  db.simpan('Resep', { ...db.ambil('Resep', kopiResep.id), idJuara: ek2.id });

  // ----- Risol Mayo Ayam (belum ada juara) -----
  const risol = db.simpan('Resep', {
    nama: 'Risol Mayo Ayam',
    idKategori: kat('Camilan').id,
    targetDicapai: 'Kulit tipis tidak sobek saat digoreng, isian creamy.',
    fotoAcuanLokal: '',
    fotoAcuanUrl: FOTO('risol-1'),
    idJuara: '',
    dibuat: sekarang - 5 * HARI,
  });
  const er1 = eksperimen(risol.id, 1, { fotoHasilUrl: FOTO('risol-1'), porsi: 12, satuanPorsi: 'buah', suhuC: null, waktuMenit: 45, langkah: ['Buat kulit dadar.', 'Tumis ayam, campur mayones.', 'Isi, gulung, goreng.'], catatanKegagalan: 'Kulit agak tebal.' }, [
    { idBahan: terigu, jumlah: 150, satuan: 'g' },
    { idBahan: telur, jumlah: 2, satuan: 'butir' },
    { idBahan: susu, jumlah: 300, satuan: 'ml' },
    { idBahan: ayam, jumlah: 250, satuan: 'g' },
    { idBahan: mayo, jumlah: 80, satuan: 'g' },
  ]);
  ulasan(er1.id, [33, 32]); // rata-rata 6,5

  // ----- Nasi Ayam Sambal Matah -----
  const nasi = db.simpan('Resep', {
    nama: 'Nasi Ayam Sambal Matah',
    idKategori: kat('Lauk').id,
    targetDicapai: 'Ayam juicy, sambal segar, harga jual Rp 22.000 per kotak.',
    fotoAcuanLokal: '',
    fotoAcuanUrl: FOTO('nasi-ayam-1'),
    idJuara: '',
    dibuat: sekarang - 3 * HARI,
  });
  const en1 = eksperimen(nasi.id, 1, { fotoHasilUrl: FOTO('nasi-ayam-2'), porsi: 8, satuanPorsi: 'kotak', suhuC: 180, waktuMenit: 40, langkah: ['Marinasi ayam.', 'Panggang.', 'Buat sambal matah.'], catatanKegagalan: 'Ayam agak kering.' }, [
    { idBahan: ayam, jumlah: 800, satuan: 'g' },
    { idBahan: sambal, jumlah: 150, satuan: 'g' },
  ]);
  const en2 = eksperimen(nasi.id, 2, { fotoHasilUrl: FOTO('nasi-ayam-1'), porsi: 8, satuanPorsi: 'kotak', suhuC: 170, waktuMenit: 35, langkah: ['Marinasi ayam semalam.', 'Panggang.', 'Buat sambal matah.'], catatanKegagalan: '', idAsalDuplikat: en1.id }, [
    { idBahan: ayam, jumlah: 800, satuan: 'g' },
    { idBahan: sambal, jumlah: 180, satuan: 'g' },
  ]);
  const en3 = eksperimen(nasi.id, 3, { porsi: 8, satuanPorsi: 'kotak', suhuC: 170, waktuMenit: 35, langkah: ['Marinasi ayam semalam.', 'Panggang.', 'Buat sambal matah.'], catatanKegagalan: 'Sambal terlalu pedas untuk sebagian orang.', idAsalDuplikat: en2.id }, [
    { idBahan: ayam, jumlah: 800, satuan: 'g' },
    { idBahan: sambal, jumlah: 200, satuan: 'g' },
  ]);
  ulasan(en1.id, [34, 35]);
  ulasan(en2.id, [39, 38, 39, 38, 39]); // rata-rata 7,7
  ulasan(en3.id, [36, 37]);
  db.simpan('Resep', { ...db.ambil('Resep', nasi.id), idJuara: en2.id });

  return { brownies: brownies.id };
}
