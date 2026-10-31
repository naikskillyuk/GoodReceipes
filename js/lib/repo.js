// Operasi data tingkat resep: ambil, hitung, simpan. Dipakai semua layar.

import { skorEksperimen, skorPenilaian } from './skor.js';
import { biayaEksperimen, hitungHPP, hitungPaket } from './hpp.js';
import { buatToken } from './util.js';

export const KATEGORI_AWAL = [
  { nama: 'Kue', warna: '#CF3520' },
  { nama: 'Minuman', warna: '#1D2757' },
  { nama: 'Lauk', warna: '#0F5B3C' },
  { nama: 'Camilan', warna: '#8A5A00' },
  { nama: 'Roti', warna: '#7A3E1D' },
];

export const WARNA_KATEGORI = ['#CF3520', '#1D2757', '#0F5B3C', '#8A5A00', '#7A3E1D', '#5B2C83', '#00606B', '#9C2F5B'];

const urut = (a, b) => (a.urutan ?? 0) - (b.urutan ?? 0) || (a.nama || '').localeCompare(b.nama || '');

/** Buat kategori bawaan sekali saja, saat data masih kosong. */
export function pastikanKategoriAwal(db) {
  if (db.meta.kategoriAwalDibuat) return;
  if (db.semua('Kategori').length === 0) {
    // Id tetap dan waktu ubah paling awal: perangkat lain yang juga membuat kategori bawaan
    // tidak menghasilkan kategori ganda, dan tidak menimpa kategori yang sudah diubah pemilik.
    KATEGORI_AWAL.forEach((k, i) => db.simpan('Kategori', { ...k, id: 'kat_awal_' + k.nama.toLowerCase(), urutan: i }, { sekarang: 1 }));
  }
  db.aturMeta({ kategoriAwalDibuat: true });
}

export function daftarKategori(db) {
  return db.semua('Kategori').sort(urut);
}

export function tambahKategori(db, nama, warna) {
  const bersih = String(nama || '').trim();
  if (!bersih) return null;
  const ada = db.semua('Kategori').find((k) => k.nama.toLowerCase() === bersih.toLowerCase());
  if (ada) return ada;
  const urutan = db.semua('Kategori').length;
  return db.simpan('Kategori', { nama: bersih, warna: warna || WARNA_KATEGORI[urutan % WARNA_KATEGORI.length], urutan });
}

export function pakaiKategori(db, id) {
  return db.semua('Resep', (r) => r.idKategori === id).length;
}

export function warnaKategori(db, idKategori) {
  return db.ambil('Kategori', idKategori)?.warna || '#5E5A50';
}

// ---------- Resep ----------

export function buatResep(db, { nama, idKategori, targetDicapai = '', fotoAcuanLokal = '' }) {
  return db.simpan('Resep', {
    nama: nama.trim(),
    idKategori,
    targetDicapai: targetDicapai.trim(),
    fotoAcuanLokal,
    fotoAcuanUrl: '',
    idJuara: '',
    dibuat: Date.now(),
  });
}

export function hapusResep(db, idResep) {
  for (const e of eksperimenResep(db, idResep)) hapusEksperimen(db, e.id, { jagaJuara: false, log: false });
  for (const t of ['BiayaLain', 'Target', 'Marketing', 'ResepTambahan', 'LogResep']) {
    db.semua(t, (r) => r.idResep === idResep).forEach((r) => db.hapus(t, r.id));
  }
  // Resep ini juga dilepas dari HPP resep lain yang memakainya.
  db.semua('ResepTambahan', (r) => r.idResepKomponen === idResep).forEach((r) => db.hapus('ResepTambahan', r.id));
  // ...dan dari paket yang berisinya.
  db.semua('IsiPaket', (r) => r.idResep === idResep).forEach((r) => db.hapus('IsiPaket', r.id));
  // ...dan dari menu jual. Riwayat stok dan pesanan tetap disimpan.
  db.semua('Menu', (m) => m.jenis === 'resep' && m.idRef === idResep).forEach((m) => db.hapus('Menu', m.id));
  db.hapus('Resep', idResep);
}

export function eksperimenResep(db, idResep) {
  return db.semua('Eksperimen', (e) => e.idResep === idResep).sort((a, b) => a.nomor - b.nomor);
}

export function penilaianEksperimen(db, idEksperimen) {
  return db.semua('Penilaian', (p) => p.idEksperimen === idEksperimen).sort((a, b) => (b.waktu || 0) - (a.waktu || 0));
}

export function skorDariDB(db, idEksperimen) {
  return skorEksperimen(penilaianEksperimen(db, idEksperimen));
}

export function fotoSrc(baris, lokal, url) {
  return (baris && (baris[lokal] || baris[url])) || '';
}

/** Ringkasan satu resep untuk kartu: juara, skor, foto, jumlah eksperimen. */
export function ringkasResep(db, resep) {
  const eksperimen = eksperimenResep(db, resep.id);
  const juara = eksperimen.find((e) => e.id === resep.idJuara) || null;
  const skorList = eksperimen.map((e) => ({ e, s: skorDariDB(db, e.id) })).filter((x) => x.s.jumlah > 0);
  const terbaik = skorList.sort((a, b) => b.s.rata - a.s.rata)[0] || null;
  const skorJuara = juara ? skorDariDB(db, juara.id) : null;
  const skor = skorJuara && skorJuara.jumlah ? skorJuara.rata : terbaik ? terbaik.s.rata : NaN;
  const fotoEksp = juara ? fotoSrc(juara, 'fotoHasilLokal', 'fotoHasilUrl') : '';
  const fotoTerakhir = [...eksperimen].reverse().map((e) => fotoSrc(e, 'fotoHasilLokal', 'fotoHasilUrl')).find(Boolean) || '';
  return {
    resep,
    kategori: db.ambil('Kategori', resep.idKategori),
    eksperimen,
    juara,
    skor,
    foto: fotoEksp || fotoTerakhir || fotoSrc(resep, 'fotoAcuanLokal', 'fotoAcuanUrl'),
    jumlahPenilai: juara ? skorJuara.jumlah : 0,
  };
}

export function daftarJuara(db) {
  return db
    .semua('Resep')
    .map((r) => ringkasResep(db, r))
    .filter((r) => r.juara)
    .sort((a, b) => (b.juara.diubah || 0) - (a.juara.diubah || 0));
}

// ---------- Eksperimen ----------

export function bahanEksperimen(db, idEksperimen) {
  return db
    .semua('BahanEksperimen', (b) => b.idEksperimen === idEksperimen)
    .sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0));
}

export function konversiBahan(db, idBahan) {
  return db.semua('KonversiSatuan', (k) => k.idBahan === idBahan);
}

export function petaKonversi(db) {
  const peta = {};
  for (const k of db.semua('KonversiSatuan')) (peta[k.idBahan] ||= []).push(k);
  return peta;
}

export function petaBahan(db) {
  const peta = {};
  for (const b of db.semua('Bahan')) peta[b.id] = b;
  return peta;
}

/** Biaya bahan satu eksperimen, memakai harga bahan terbaru. */
export function biayaBahanEksperimen(db, idEksperimen) {
  return biayaEksperimen(bahanEksperimen(db, idEksperimen), petaBahan(db), petaKonversi(db));
}

/** Draf eksperimen baru (kosong) atau salinan dari eksperimen lain. Belum disimpan. */
export function draftEksperimen(db, idResep, dariId = '') {
  const daftar = eksperimenResep(db, idResep);
  const nomor = daftar.reduce((m, e) => Math.max(m, e.nomor || 0), 0) + 1;
  const sumber = dariId ? db.ambil('Eksperimen', dariId) : null;
  const terakhir = daftar[daftar.length - 1];
  if (sumber) {
    return {
      eksperimen: {
        idResep,
        nomor,
        idAsalDuplikat: sumber.id,
        porsi: sumber.porsi,
        satuanPorsi: sumber.satuanPorsi,
        suhuC: sumber.suhuC,
        waktuMenit: sumber.waktuMenit,
        langkah: [...(sumber.langkah || [])],
        panduanNilai: { ...(sumber.panduanNilai || {}) },
        catatanChef: '',
        catatanKegagalan: '',
        fotoHasilLokal: '',
        fotoHasilUrl: '',
      },
      baris: bahanEksperimen(db, sumber.id).map((b) => ({ idBahan: b.idBahan, jumlah: b.jumlah, satuan: b.satuan })),
      biayaSumber: biayaBahanEksperimen(db, sumber.id).total,
      nomorSumber: sumber.nomor,
    };
  }
  return {
    eksperimen: {
      idResep,
      nomor,
      idAsalDuplikat: '',
      porsi: terakhir ? terakhir.porsi : 1,
      satuanPorsi: terakhir ? terakhir.satuanPorsi : 'porsi',
      suhuC: null,
      waktuMenit: null,
      langkah: [''],
      // Petunjuk penilaian biasanya sama untuk satu resep: ambil dari eksperimen terakhir.
      panduanNilai: terakhir ? { ...(terakhir.panduanNilai || {}) } : {},
      catatanChef: '',
      catatanKegagalan: '',
      fotoHasilLokal: '',
      fotoHasilUrl: '',
    },
    baris: [],
    biayaSumber: null,
    nomorSumber: null,
  };
}

/** Simpan eksperimen beserta daftar bahannya. `baris` = [{idBahan, jumlah, satuan}]. */
export function simpanEksperimen(db, { eksperimen, baris }) {
  const sebab = eksperimen.id ? `Eksperimen ${eksperimen.nomor} diubah` : `Eksperimen ${eksperimen.nomor} dibuat`;
  return denganLogResep(db, eksperimen.idResep, sebab, () => simpanEksperimenSaja(db, { eksperimen, baris }));
}

function simpanEksperimenSaja(db, { eksperimen, baris }) {
  const baru = !eksperimen.id;
  const tersimpan = db.simpan('Eksperimen', {
    ...eksperimen,
    langkah: (eksperimen.langkah || []).map((l) => l.trim()).filter(Boolean),
    catatanKegagalan: (eksperimen.catatanKegagalan || '').trim(),
    dibuat: eksperimen.dibuat || Date.now(),
    terimaNilai: eksperimen.terimaNilai ?? true,
    wajibNama: eksperimen.wajibNama ?? false,
  });
  const lama = baru ? [] : bahanEksperimen(db, tersimpan.id);
  const dipakai = new Set();
  baris.forEach((b, i) => {
    const ada = lama.find((x) => x.idBahan === b.idBahan && !dipakai.has(x.id));
    if (ada) dipakai.add(ada.id);
    db.simpan('BahanEksperimen', {
      id: ada?.id,
      idEksperimen: tersimpan.id,
      idBahan: b.idBahan,
      jumlah: b.jumlah,
      satuan: b.satuan,
      urutan: i,
    });
  });
  lama.filter((x) => !dipakai.has(x.id)).forEach((x) => db.hapus('BahanEksperimen', x.id));
  return tersimpan;
}

export function hapusEksperimen(db, idEksperimen, { jagaJuara = true, log = true } = {}) {
  const e = db.ambil('Eksperimen', idEksperimen);
  if (!e) return;
  if (log) return denganLogResep(db, e.idResep, `Eksperimen ${e.nomor} dihapus`, () => hapusEksperimen(db, idEksperimen, { jagaJuara, log: false }));
  bahanEksperimen(db, idEksperimen).forEach((b) => db.hapus('BahanEksperimen', b.id));
  penilaianEksperimen(db, idEksperimen).forEach((p) => db.hapus('Penilaian', p.id));
  const resep = db.ambil('Resep', e.idResep);
  if (jagaJuara && resep && resep.idJuara === idEksperimen) db.simpan('Resep', { ...resep, idJuara: '' });
  db.hapus('Eksperimen', idEksperimen);
}

/** Tandai (atau lepas) juara. Mengembalikan true bila sekarang menjadi juara. */
export function ubahJuara(db, idEksperimen) {
  const e = db.ambil('Eksperimen', idEksperimen);
  const resep = e && db.ambil('Resep', e.idResep);
  if (!resep) return false;
  const jadi = resep.idJuara !== idEksperimen;
  denganLogResep(db, resep.id, jadi ? `Eksperimen ${e.nomor} jadi juara` : `Juara Eksperimen ${e.nomor} dilepas`, () =>
    db.simpan('Resep', { ...resep, idJuara: jadi ? idEksperimen : '' }),
  );
  return jadi;
}

/** Pastikan eksperimen punya token untuk tautan penilaian. */
export function pastikanToken(db, idEksperimen) {
  const e = db.ambil('Eksperimen', idEksperimen);
  if (!e) return null;
  if (e.tokenNilai) return e;
  return db.simpan('Eksperimen', { ...e, tokenNilai: buatToken() });
}

export function tambahPenilaianPemilik(db, idEksperimen, nilai, komentar, nama) {
  return db.simpan('Penilaian', {
    idEksperimen,
    namaPenilai: nama || 'Saya (pemilik)',
    ...nilai,
    komentar: (komentar || '').trim(),
    waktu: Date.now(),
    dariPemilik: true,
  });
}

/** Semua ulasan, terbaru dulu, dengan label resep dan eksperimen. */
export function semuaUlasan(db) {
  return db
    .semua('Penilaian')
    .map((p) => {
      const e = db.ambil('Eksperimen', p.idEksperimen);
      const r = e && db.ambil('Resep', e.idResep);
      return { p, e, r, skor: skorPenilaian(p) };
    })
    .filter((x) => x.e && x.r)
    .sort((a, b) => (b.p.waktu || 0) - (a.p.waktu || 0));
}

// ---------- Bahan ----------

/** Simpan bahan dan ganti seluruh daftar konversinya. konversi = [{satuan, nilai}]. */
export function simpanBahan(db, bahan, konversi = []) {
  const lama = db.ambil('Bahan', bahan.id);
  const hargaBerubah = !lama || lama.hargaBeli !== bahan.hargaBeli || lama.isiKemasan !== bahan.isiKemasan || lama.satuanBeli !== bahan.satuanBeli;
  if (lama) {
    const sebab = hargaBerubah ? `Harga ${lama.nama} diperbarui` : `Data bahan ${lama.nama} diubah`;
    return denganLogResep(db, resepPemakaiBahan(db, lama.id), sebab, () => simpanBahanSaja(db, bahan, konversi, hargaBerubah));
  }
  return simpanBahanSaja(db, bahan, konversi, hargaBerubah);
}

function simpanBahanSaja(db, bahan, konversi, hargaBerubah) {
  const tersimpan = db.simpan('Bahan', {
    ...bahan,
    nama: bahan.nama.trim(),
    merek: (bahan.merek || '').trim(),
    beliDi: (bahan.beliDi || '').trim(),
    hargaDiperbarui: hargaBerubah ? Date.now() : bahan.hargaDiperbarui || Date.now(),
  });
  const lamaKonv = konversiBahan(db, tersimpan.id);
  const dipakai = new Set();
  for (const k of konversi) {
    const satuan = String(k.satuan).trim().toLowerCase();
    if (!satuan || !(Number(k.nilai) > 0)) continue;
    const ada = lamaKonv.find((x) => x.satuan === satuan);
    if (ada) dipakai.add(ada.id);
    const row = db.simpan('KonversiSatuan', { id: ada?.id, idBahan: tersimpan.id, satuan, nilai: Number(k.nilai) });
    dipakai.add(row.id);
  }
  lamaKonv.filter((x) => !dipakai.has(x.id)).forEach((x) => db.hapus('KonversiSatuan', x.id));
  return tersimpan;
}

export function pemakaianBahan(db, idBahan) {
  const eks = new Set(db.semua('BahanEksperimen', (b) => b.idBahan === idBahan).map((b) => b.idEksperimen));
  return eks.size;
}

export function hapusBahan(db, idBahan) {
  const bahan = db.ambil('Bahan', idBahan);
  if (bahan) return denganLogResep(db, resepPemakaiBahan(db, idBahan), `Bahan ${bahan.nama} dihapus`, () => hapusBahanSaja(db, idBahan));
  return hapusBahanSaja(db, idBahan);
}

function hapusBahanSaja(db, idBahan) {
  konversiBahan(db, idBahan).forEach((k) => db.hapus('KonversiSatuan', k.id));
  db.semua('BahanEksperimen', (b) => b.idBahan === idBahan).forEach((b) => db.hapus('BahanEksperimen', b.id));
  db.hapus('Bahan', idBahan);
}

// ---------- HPP, target, marketing ----------

export function eksperimenUntukHitung(db, resep, target) {
  const daftar = eksperimenResep(db, resep.id);
  return (
    daftar.find((e) => e.id === target?.idEksperimenHitung) ||
    daftar.find((e) => e.id === resep.idJuara) ||
    daftar[daftar.length - 1] ||
    null
  );
}

export function targetResep(db, idResep) {
  return db.semua('Target', (t) => t.idResep === idResep)[0] || null;
}

export function biayaLainResep(db, idResep) {
  return db.semua('BiayaLain', (b) => b.idResep === idResep).sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0));
}

// ---------- HPP Resep (tab "HPP Resep", disimpan dengan tombol) ----------

/** HPP resep dari eksperimen tertentu: bahan + biaya lain resep itu (resep lain tidak ikut). */
export function hppEksperimen(db, idResep, eksperimen) {
  const porsi = eksperimen ? Number(eksperimen.porsi) || 0 : 0;
  const biaya = eksperimen ? biayaBahanEksperimen(db, eksperimen.id) : { rincian: [], total: 0, bermasalah: [] };
  const biayaLain = biayaLainResep(db, idResep);
  const hpp = hitungHPP({ biayaBahan: biaya.total, biayaLain, porsi });
  return { biaya, biayaLain, hpp, porsi };
}

const TARGET_BARU = { marginTarget: 40, hargaJual: 0, modalAwal: 0, labaTargetBulanan: 0 };

/**
 * Simpan HPP resep per porsi saat ini. Angka inilah yang dipakai di HPP Jual, di resep lain, dan di paket,
 * sampai disimpan ulang. Mengembalikan null bila HPP belum bisa dihitung (mis. jumlah porsi kosong).
 */
export function simpanHPPResep(db, idResep) {
  const resep = db.ambil('Resep', idResep);
  if (!resep) return null;
  const target = targetResep(db, idResep);
  const { hpp } = hppEksperimen(db, idResep, eksperimenUntukHitung(db, resep, target));
  if (!Number.isFinite(hpp.hppPorsi)) return null;
  return db.simpan('Target', {
    ...TARGET_BARU,
    ...(target || { idResep }),
    hppSimpan: hpp.hppPorsi,
    packingSimpan: Number.isFinite(hpp.packingPorsi) ? hpp.packingPorsi : 0,
    hppSimpanPada: Date.now(),
  });
}

/**
 * HPP resep per porsi yang dipakai di mana-mana: yang tersimpan, atau hitungan saat ini bila belum pernah disimpan.
 * `berubah` = hitungan saat ini berbeda dari yang tersimpan (mis. harga bahan naik), perlu disimpan ulang.
 */
export function hppResep(db, idResep) {
  const resep = db.ambil('Resep', idResep);
  if (!resep) return null;
  const target = targetResep(db, idResep);
  const eksperimen = eksperimenUntukHitung(db, resep, target);
  const kini = hppEksperimen(db, idResep, eksperimen);
  const tersimpan = !!target && typeof target.hppSimpan === 'number' && Number.isFinite(target.hppSimpan);
  const hppPorsi = tersimpan ? target.hppSimpan : kini.hpp.hppPorsi;
  // HPP yang disimpan sebelum kolom packingSimpan ada: pakai packing hitungan saat ini.
  const packingTersimpan = tersimpan && typeof target.packingSimpan === 'number' && Number.isFinite(target.packingSimpan);
  const packingPorsi = packingTersimpan ? target.packingSimpan : kini.hpp.packingPorsi;
  const berubah = tersimpan && Number.isFinite(kini.hpp.hppPorsi) && Math.abs(kini.hpp.hppPorsi - target.hppSimpan) >= 0.5;
  return {
    resep,
    target,
    eksperimen,
    ...kini,
    satuanPorsi: (eksperimen && eksperimen.satuanPorsi) || 'porsi',
    tersimpan,
    berubah,
    disimpanPada: tersimpan ? target.hppSimpanPada : null,
    hppPorsi,
    packingPorsi,
    tanpaPacking: hppPorsi - (Number.isFinite(packingPorsi) ? packingPorsi : 0),
  };
}

// ---------- Log perubahan bahan resep ----------
//
// Setiap kali bahan eksperimen yang dihitung HPP-nya berubah (takaran, bahan ditambah/dihapus, harga bahan,
// atau eksperimen yang dihitung diganti), dicatat satu baris LogResep: hanya bahan yang berubah, plus HPP
// per porsi sebelum dan sesudahnya. Baris pertama ("Catatan awal") menjadi patokan dan dibuat tepat sebelum
// perubahan pertama, jadi resep lama pun langsung punya pembanding.

export function logResep(db, idResep) {
  return db
    .semua('LogResep', (l) => l.idResep === idResep)
    .sort((a, b) => (b.waktu || 0) - (a.waktu || 0) || (b.diubah || 0) - (a.diubah || 0));
}

/** Keadaan bahan resep saat ini (eksperimen yang dihitung HPP-nya). */
function potretResep(db, idResep) {
  const resep = db.ambil('Resep', idResep);
  const eks = resep && eksperimenUntukHitung(db, resep, targetResep(db, idResep));
  if (!eks) return null;
  const { biaya, hpp } = hppEksperimen(db, idResep, eks);
  return {
    idEksperimen: eks.id,
    nomorEksperimen: eks.nomor,
    hppPorsi: Number.isFinite(hpp.hppPorsi) ? hpp.hppPorsi : null,
    bahan: biaya.rincian.map((r) => ({
      idBahan: r.idBahan,
      nama: r.bahan ? r.bahan.nama : 'Bahan terhapus',
      jumlah: Number(r.jumlah) || 0,
      satuan: r.satuan || '',
      biaya: Number.isFinite(r.biaya) ? Math.round(r.biaya) : null,
    })),
  };
}

/** Bahan yang berubah saja: [{jenis: 'tambah'|'hapus'|'takaran'|'harga', nama, lama, baru}]. */
export function bedaBahan(lama = [], baru = []) {
  const kunci = (daftar) => {
    const ke = {};
    return new Map(daftar.map((b) => [`${b.idBahan}#${(ke[b.idBahan] = (ke[b.idBahan] || 0) + 1)}`, b]));
  };
  const pLama = kunci(lama);
  const pBaru = kunci(baru);
  const hasil = [];
  for (const [k, b] of pBaru) {
    const l = pLama.get(k);
    if (!l) hasil.push({ jenis: 'tambah', nama: b.nama, baru: b });
    else if (l.jumlah !== b.jumlah || l.satuan !== b.satuan) hasil.push({ jenis: 'takaran', nama: b.nama, lama: l, baru: b });
    else if (l.biaya !== b.biaya) hasil.push({ jenis: 'harga', nama: b.nama, lama: l, baru: b });
  }
  for (const [k, l] of pLama) if (!pBaru.has(k)) hasil.push({ jenis: 'hapus', nama: l.nama, lama: l });
  return hasil;
}

function pastikanLogAwal(db, idResep) {
  if (logResep(db, idResep).length) return;
  const kini = potretResep(db, idResep);
  if (!kini) return;
  db.simpan('LogResep', {
    idResep, idEksperimen: kini.idEksperimen, nomorEksperimen: kini.nomorEksperimen, waktu: Date.now(),
    sebab: 'Catatan awal', hppLama: null, hppBaru: kini.hppPorsi, bahan: kini.bahan, perubahan: [],
  });
}

/** Catat perubahan bahan resep dibanding catatan terakhir. Tidak mencatat apa pun bila bahannya sama. */
export function catatLogResep(db, idResep, sebab) {
  const kini = potretResep(db, idResep);
  if (!kini) return null;
  const akhir = logResep(db, idResep)[0];
  if (!akhir) return pastikanLogAwal(db, idResep);
  const perubahan = bedaBahan(akhir.bahan || [], kini.bahan);
  if (!perubahan.length) return null;
  return db.simpan('LogResep', {
    idResep, idEksperimen: kini.idEksperimen, nomorEksperimen: kini.nomorEksperimen,
    waktu: Math.max(Date.now(), (akhir.waktu || 0) + 1),
    sebab, hppLama: akhir.hppBaru, hppBaru: kini.hppPorsi, bahan: kini.bahan, perubahan,
  });
}

/** Jalankan `ubah`, lalu catat perubahan bahan di resep-resep ini (patokan dibuat dulu bila belum ada). */
export function denganLogResep(db, idResep, sebab, ubah) {
  const daftar = [...new Set([].concat(idResep).filter(Boolean))];
  daftar.forEach((id) => pastikanLogAwal(db, id));
  const hasil = ubah();
  daftar.forEach((id) => catatLogResep(db, id, sebab));
  return hasil;
}

/** Resep yang eksperimen hitungan HPP-nya memakai bahan ini. */
export function resepPemakaiBahan(db, idBahan) {
  return db.semua('Resep').filter((r) => {
    const eks = eksperimenUntukHitung(db, r, targetResep(db, r.id));
    return eks && db.semua('BahanEksperimen', (b) => b.idEksperimen === eks.id && b.idBahan === idBahan).length > 0;
  }).map((r) => r.id);
}

// ---------- HPP Jual: HPP resep ini + HPP resep lain (mis. saus) ----------

export function resepTambahan(db, idResep) {
  return db.semua('ResepTambahan', (r) => r.idResep === idResep).sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0));
}

/**
 * HPP resep lain yang ikut dijual bersama resep ini (mis. saus, sambal, minuman).
 * Memakai HPP tersimpan resep itu TANPA packing, supaya packing tidak terhitung dua kali.
 * `jumlah` dalam satuan porsi resep itu (mis. 30 gram), atau satuan 'resep' = satu resep penuh.
 * `dipakaiPer`: 'porsi' = untuk setiap porsi yang dijual (bawaan); 'resep' (data lama) = untuk satu kali masak,
 * dibagi jumlah porsi resep ini (`porsiInduk`).
 */
export function biayaResepTambahan(db, idResep, porsiInduk = 0) {
  const rincian = resepTambahan(db, idResep).map((rt) => {
    const jumlah = Number(rt.jumlah) || 0;
    const dipakaiPer = rt.dipakaiPer === 'porsi' ? 'porsi' : 'resep';
    const k = rt.idResepKomponen === idResep ? null : hppResep(db, rt.idResepKomponen);
    const gagal = (alasan) => ({ ...rt, jumlah, dipakaiPer, resep: k ? k.resep : null, komponen: k, biaya: NaN, biayaPorsi: NaN, alasan });
    if (!k) return gagal('resepnya sudah dihapus');
    if (!k.eksperimen) return gagal('belum punya eksperimen');
    const perSatuan = k.tanpaPacking;
    const biaya = rt.satuan === 'resep' ? perSatuan * k.porsi * jumlah : perSatuan * jumlah;
    const biayaPorsi = dipakaiPer === 'porsi' ? biaya : porsiInduk > 0 ? biaya / porsiInduk : NaN;
    return {
      ...rt,
      jumlah,
      dipakaiPer,
      resep: k.resep,
      komponen: k,
      perSatuan,
      satuanPorsi: k.satuanPorsi,
      biaya,
      biayaPorsi,
      alasan: Number.isFinite(biayaPorsi) ? '' : 'jumlah hasil jadinya belum diisi',
    };
  });
  const totalPorsi = rincian.reduce((jml, r) => jml + (Number.isFinite(r.biayaPorsi) ? r.biayaPorsi : 0), 0);
  return { rincian, totalPorsi, bermasalah: rincian.filter((r) => r.alasan) };
}

/** Resep yang boleh ditambahkan ke HPP Jual resep ini: bukan dirinya dan belum ada. */
export function pilihanResepTambahan(db, idResep) {
  const sudah = new Set(resepTambahan(db, idResep).map((rt) => rt.idResepKomponen));
  return db.semua('Resep', (r) => r.id !== idResep && !sudah.has(r.id)).sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
}

export function tambahResepTambahan(db, idResep, idResepKomponen) {
  return db.simpan('ResepTambahan', { idResep, idResepKomponen, jumlah: 1, satuan: 'porsi', dipakaiPer: 'porsi', urutan: resepTambahan(db, idResep).length });
}

/**
 * Semua angka untuk tab HPP Resep dan HPP Jual satu resep.
 * - hpp: hitungan HPP resep saat ini; hppPorsi/packingPorsi: yang tersimpan (lihat hppResep)
 * - tambahan: HPP resep lain; hppJual = hppPorsi + tambahan.totalPorsi
 */
export function dataHPP(db, idResep) {
  const h = hppResep(db, idResep);
  if (!h) return null;
  const tambahan = biayaResepTambahan(db, idResep, h.porsi);
  return { ...h, tambahan, hppJual: h.hppPorsi + tambahan.totalPorsi };
}

/**
 * Semua data satu resep untuk diekspor (PDF): resep, HPP, dan setiap eksperimen lengkap dengan
 * bahan, biaya, HPP per porsi, langkah, catatan, skor, dan penilaian.
 */
export function dataEksporResep(db, idResep) {
  const resep = db.ambil('Resep', idResep);
  if (!resep) return null;
  const eksperimen = eksperimenResep(db, idResep).map((e) => {
    const { biaya, hpp } = hppEksperimen(db, idResep, e);
    return {
      eksperimen: e,
      juara: resep.idJuara === e.id,
      foto: fotoSrc(e, 'fotoHasilLokal', 'fotoHasilUrl'),
      biaya,
      hpp,
      skor: skorDariDB(db, e.id),
      penilaian: penilaianEksperimen(db, e.id),
    };
  });
  return {
    resep,
    kategori: db.ambil('Kategori', resep.idKategori),
    fotoAcuan: fotoSrc(resep, 'fotoAcuanLokal', 'fotoAcuanUrl'),
    hpp: dataHPP(db, idResep),
    eksperimen,
  };
}

// ---------- Paket (beberapa resep dijual dalam satu kemasan) ----------

export function daftarPaket(db) {
  return db.semua('Paket').sort((a, b) => (b.dibuat || 0) - (a.dibuat || 0));
}

export function buatPaket(db, nama) {
  return db.simpan('Paket', { nama: (nama || '').trim() || 'Paket baru', marginTarget: 40, hargaJual: 0, dibuat: Date.now() });
}

export function hapusPaket(db, idPaket) {
  for (const t of ['IsiPaket', 'BiayaPaket']) db.semua(t, (r) => r.idPaket === idPaket).forEach((r) => db.hapus(t, r.id));
  db.semua('Menu', (m) => m.jenis === 'paket' && m.idRef === idPaket).forEach((m) => db.hapus('Menu', m.id));
  db.hapus('Paket', idPaket);
}

export function isiPaket(db, idPaket) {
  return db.semua('IsiPaket', (r) => r.idPaket === idPaket).sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0));
}

export function biayaPaketList(db, idPaket) {
  return db.semua('BiayaPaket', (r) => r.idPaket === idPaket).sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0));
}

/**
 * Hitungan satu paket. Setiap resep di dalamnya memakai HPP Jual-nya TANPA packing
 * (HPP resep tersimpan + resep lain), karena paket punya packing sendiri yang dihitung sekali.
 */
export function dataPaket(db, idPaket) {
  const paket = db.ambil('Paket', idPaket);
  if (!paket) return null;
  const isi = isiPaket(db, idPaket).map((i) => {
    const d = dataHPP(db, i.idResep);
    const ada = d && d.eksperimen;
    const packing = ada && Number.isFinite(d.packingPorsi) ? d.packingPorsi : 0;
    // Bawaan: packing resep dibuang (paket punya packing sendiri). Dicentang: packing resep tetap dihitung.
    const biayaProduksi = ada ? d.hppJual - (i.pakaiPacking ? 0 : packing) : NaN;
    const alasan = !d ? 'resepnya sudah dihapus' : !d.eksperimen ? 'belum punya eksperimen' : !Number.isFinite(biayaProduksi) ? 'jumlah porsinya belum diisi' : '';
    return {
      ...i,
      resep: d ? d.resep : null,
      satuanPorsi: ada ? d.satuanPorsi : 'porsi',
      biayaProduksi,
      biayaPorsiResep: packing,
      alasan,
    };
  });
  const biaya = biayaPaketList(db, idPaket);
  const hitung = hitungPaket({ isi, biayaPaket: biaya });
  // Seperti HPP resep: angka tersimpan dipakai di menu jual sampai disimpan ulang.
  const tersimpan = typeof paket.hppSimpan === 'number' && Number.isFinite(paket.hppSimpan);
  const berubah = tersimpan && Math.abs(hitung.hppPaket - paket.hppSimpan) >= 0.5;
  return {
    paket,
    biaya,
    ...hitung,
    isi: hitung.rincian,
    hppHitung: hitung.hppPaket,
    hppPaket: tersimpan ? paket.hppSimpan : hitung.hppPaket,
    tersimpan,
    berubah,
    disimpanPada: tersimpan ? paket.hppSimpanPada || null : null,
  };
}

/** Simpan HPP paket saat ini (dipakai di menu jual). Null bila ada isi yang belum bisa dihitung. */
export function simpanHPPPaket(db, idPaket) {
  const d = dataPaket(db, idPaket);
  if (!d || d.bermasalah.length || !Number.isFinite(d.hppHitung)) return null;
  return db.simpan('Paket', { ...d.paket, hppSimpan: d.hppHitung, hppSimpanPada: Date.now() });
}

export function tambahIsiPaket(db, idPaket, idResep) {
  return db.simpan('IsiPaket', { idPaket, idResep, jumlah: 1, urutan: isiPaket(db, idPaket).length });
}

// ---------- Merek (nama dan logo aplikasi) ----------

export const NAMA_APLIKASI_BAWAAN = 'rasa.terasrumah';
export const LOGO_BAWAAN = 'icons/icon-192.png';
export const ID_MEREK = 'stl_merek';

/** Nama dan logo yang tampil di aplikasi. Bila belum diatur, memakai bawaan. */
export function ambilMerek(db) {
  const baris = db.ambil('Setelan', ID_MEREK);
  const nama = baris && baris.namaAplikasi && baris.namaAplikasi.trim() ? baris.namaAplikasi.trim() : NAMA_APLIKASI_BAWAAN;
  const logoSendiri = baris ? baris.logoLokal || baris.logoUrl || '' : '';
  // Urutan logo: milik pengguna, lalu logo situs dari admin, lalu logo bawaan aplikasi.
  const logoSitus = (db.pengaturan.situs && db.pengaturan.situs.logoUrl) || '';
  return { nama, logo: logoSendiri || logoSitus || LOGO_BAWAAN, logoSendiri, namaSendiri: baris && baris.namaAplikasi ? baris.namaAplikasi.trim() : '' };
}

/**
 * Simpan nama dan logo. `logo` = data URL baru, '' untuk menghapus logo, atau undefined bila tidak berubah.
 * Nama kosong berarti memakai nama bawaan.
 */
export function simpanMerek(db, { nama, logo }) {
  const lama = db.ambil('Setelan', ID_MEREK) || {};
  const patch = { id: ID_MEREK, namaAplikasi: String(nama == null ? lama.namaAplikasi || '' : nama).trim().slice(0, 40) };
  if (logo !== undefined && logo !== (lama.logoLokal || lama.logoUrl || '')) {
    patch.logoLokal = logo || '';
    patch.logoUrl = '';
  }
  return db.simpan('Setelan', { ...lama, ...patch });
}
