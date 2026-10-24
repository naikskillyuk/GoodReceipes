// Operasi data tingkat resep: ambil, hitung, simpan. Dipakai semua layar.

import { skorEksperimen, skorPenilaian } from './skor.js';
import { biayaEksperimen, hitungHPP } from './hpp.js';
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
  for (const e of eksperimenResep(db, idResep)) hapusEksperimen(db, e.id, { jagaJuara: false });
  for (const t of ['BiayaLain', 'Target', 'Marketing', 'ResepTambahan']) {
    db.semua(t, (r) => r.idResep === idResep).forEach((r) => db.hapus(t, r.id));
  }
  // Resep ini juga dilepas dari HPP resep lain yang memakainya.
  db.semua('ResepTambahan', (r) => r.idResepKomponen === idResep).forEach((r) => db.hapus('ResepTambahan', r.id));
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

export function hapusEksperimen(db, idEksperimen, { jagaJuara = true } = {}) {
  const e = db.ambil('Eksperimen', idEksperimen);
  if (!e) return;
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
  db.simpan('Resep', { ...resep, idJuara: jadi ? idEksperimen : '' });
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

// ---------- Resep tambahan (resep lain sebagai komponen HPP) ----------

export function resepTambahan(db, idResep) {
  return db.semua('ResepTambahan', (r) => r.idResep === idResep).sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0));
}

/**
 * Biaya resep-resep tambahan sebuah resep, per resep (satu kali masak).
 * Biaya komponen = biaya bahan eksperimen yang dihitung + resep tambahannya sendiri,
 * tanpa biaya lain (kemasan, gas, dll.) supaya tidak terhitung dua kali.
 * `jejak` mencegah perhitungan berputar (A memakai B, B memakai A).
 */
export function biayaResepTambahan(db, idResep, jejak = new Set([idResep])) {
  const rincian = resepTambahan(db, idResep).map((rt) => {
    const resep = db.ambil('Resep', rt.idResepKomponen);
    const jumlah = Number(rt.jumlah) || 0;
    if (!resep) return { ...rt, resep: null, eksperimen: null, biaya: NaN, alasan: 'resepnya sudah dihapus' };
    if (jejak.has(resep.id)) return { ...rt, resep, eksperimen: null, biaya: NaN, alasan: 'saling memakai (berputar)' };
    const eksperimen = eksperimenUntukHitung(db, resep, targetResep(db, resep.id));
    if (!eksperimen) return { ...rt, resep, eksperimen: null, biaya: NaN, alasan: 'belum punya eksperimen' };
    const bahan = biayaBahanEksperimen(db, eksperimen.id);
    const dalam = biayaResepTambahan(db, resep.id, new Set([...jejak, resep.id]));
    const perResep = bahan.total + dalam.total;
    const porsi = Number(eksperimen.porsi) || 0;
    const perPorsi = porsi > 0 ? perResep / porsi : NaN;
    const biaya = rt.satuan === 'resep' ? perResep * jumlah : perPorsi * jumlah;
    let alasan = '';
    if (!Number.isFinite(biaya)) alasan = 'jumlah hasil jadinya belum diisi';
    else if (bahan.bermasalah.length || dalam.bermasalah.length) alasan = 'ada bahan yang biayanya belum bisa dihitung';
    return { ...rt, resep, eksperimen, perResep, perPorsi, satuanPorsi: eksperimen.satuanPorsi || 'porsi', biaya, alasan };
  });
  const total = rincian.reduce((jml, r) => jml + (Number.isFinite(r.biaya) ? r.biaya : 0), 0);
  return { rincian, total, bermasalah: rincian.filter((r) => r.alasan) };
}

/** Apakah resep `idDari` (langsung atau lewat resep lain) memakai resep `idTujuan`? */
export function resepMemakai(db, idDari, idTujuan, jejak = new Set()) {
  if (jejak.has(idDari)) return false;
  jejak.add(idDari);
  return resepTambahan(db, idDari).some((rt) => rt.idResepKomponen === idTujuan || resepMemakai(db, rt.idResepKomponen, idTujuan, jejak));
}

/** Resep yang boleh ditambahkan ke HPP resep ini: bukan dirinya, belum dipakai, dan tidak memakai resep ini. */
export function pilihanResepTambahan(db, idResep) {
  const sudah = new Set(resepTambahan(db, idResep).map((rt) => rt.idResepKomponen));
  return db
    .semua('Resep', (r) => r.id !== idResep && !sudah.has(r.id) && !resepMemakai(db, r.id, idResep))
    .sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
}

export function tambahResepTambahan(db, idResep, idResepKomponen) {
  return db.simpan('ResepTambahan', { idResep, idResepKomponen, jumlah: 1, satuan: 'porsi', urutan: resepTambahan(db, idResep).length });
}

/** Semua angka yang dibutuhkan layar HPP & Harga untuk satu resep. */
export function dataHPP(db, idResep) {
  const resep = db.ambil('Resep', idResep);
  if (!resep) return null;
  const target = targetResep(db, idResep);
  const eksperimen = eksperimenUntukHitung(db, resep, target);
  const biaya = eksperimen ? biayaBahanEksperimen(db, eksperimen.id) : { rincian: [], total: 0, bermasalah: [] };
  const tambahan = biayaResepTambahan(db, idResep);
  const biayaLain = biayaLainResep(db, idResep);
  const porsi = eksperimen ? Number(eksperimen.porsi) || 0 : 0;
  const hpp = hitungHPP({ biayaBahan: biaya.total, biayaResepLain: tambahan.total, biayaLain, porsi });
  return { resep, target, eksperimen, biaya, tambahan, biayaLain, hpp, porsi };
}

/**
 * Semua data satu resep untuk diekspor (PDF): resep, HPP, dan setiap eksperimen lengkap dengan
 * bahan, biaya, HPP per porsi, langkah, catatan, skor, dan penilaian.
 */
export function dataEksporResep(db, idResep) {
  const resep = db.ambil('Resep', idResep);
  if (!resep) return null;
  const tambahan = biayaResepTambahan(db, idResep);
  const biayaLain = biayaLainResep(db, idResep);
  const eksperimen = eksperimenResep(db, idResep).map((e) => {
    const biaya = biayaBahanEksperimen(db, e.id);
    const porsi = Number(e.porsi) || 0;
    return {
      eksperimen: e,
      juara: resep.idJuara === e.id,
      foto: fotoSrc(e, 'fotoHasilLokal', 'fotoHasilUrl'),
      biaya,
      hpp: hitungHPP({ biayaBahan: biaya.total, biayaResepLain: tambahan.total, biayaLain, porsi }),
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

// ---------- Merek (nama dan logo aplikasi) ----------

export const NAMA_APLIKASI_BAWAAN = 'Good Receipes';
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
