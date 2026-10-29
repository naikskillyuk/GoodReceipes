// Stok bahan, produksi, stok makanan, menu jual, pesanan, pembayaran, pelanggan, dan promo.
//
// Stok selalu dihitung dari jumlah baris mutasi (tidak ada angka stok yang ditimpa), supaya kasir dan dapur
// di perangkat berbeda tidak saling menimpa. Aturan yang juga dipakai server (backend/app/Services/Penjualan.php):
// - menu paket memotong stok setiap resep isinya
// - mutasi penjualan memakai id tetap "mmk_{idPesanan}_{idResep}" sehingga tidak pernah terpotong dua kali
// - pelanggan memakai id tetap "plg_{nomor WhatsApp}"

import { buatId } from './util.js';
import { panggilApi } from './sync.js';
import { dariBaris } from './schema.js';
import { alamatServer } from './akun.js';
import { keDasar, hargaPerDasar, labelDasar, infoSatuanBeli } from './units.js';
import { hargaMinimum, bulatkanHarga } from './hpp.js';
import { bahanEksperimen, konversiBahan, eksperimenUntukHitung, targetResep, hppResep, dataHPP, dataPaket, fotoSrc, isiPaket } from './repo.js';

// ---------- Peran akun ----------

/** 'dapur' (pemilik, semua menu) atau 'toko' (kasir: menu, stok makanan, pesanan, pembayaran). */
export function peranAkun(db) {
  return db.pengaturan.akun && db.pengaturan.akun.peran === 'toko' ? 'toko' : 'dapur';
}

/** Halaman toko / POS (bagian pertama alamat). Semua halaman lain hanya ada di /admin. */
export const RUTE_TOKO = ['', 'kasir', 'catat-pesanan', 'pesanan', 'stok-makanan', 'pelanggan', 'pengaturan'];

// Situs punya dua pintu: "/" = halaman toko (POS), "/admin" = halaman admin resep, HPP, harga, dan stok.
export const ALAMAT_TOKO = '/';
export const ALAMAT_ADMIN = '/admin';

/** Sedang dibuka di /admin? */
export function halamanAdmin(jalur = globalThis.location?.pathname || '/') {
  return /^\/admin\/?$/.test(jalur);
}

/** Tampilan toko dipakai di halaman utama, dan selalu untuk akun toko. */
export function tampilanToko(db) {
  return !halamanAdmin() || peranAkun(db) === 'toko';
}

const jumlahkan = (daftar, kunci) => {
  const peta = new Map();
  for (const r of daftar) peta.set(r[kunci], (peta.get(r[kunci]) || 0) + (Number(r.jumlah) || 0));
  return peta;
};
const bulat = (n) => Math.round(n * 1000) / 1000;

// ---------- Stok bahan ----------

/** Map idBahan -> stok dalam satuan dasar (g / ml / pcs). */
export function stokBahan(db) {
  return jumlahkan(db.semua('MutasiBahan'), 'idBahan');
}

/** Isi satu kemasan dalam satuan dasar (mis. 1 kg -> 1000 g). */
export function isiKemasanDasar(bahan) {
  return (Number(bahan.isiKemasan) || 0) * infoSatuanBeli(bahan.satuanBeli).faktor;
}

export function daftarStokBahan(db) {
  const stok = stokBahan(db);
  return db
    .semua('Bahan')
    .map((bahan) => {
      const jumlah = bulat(stok.get(bahan.id) || 0);
      const minimum = Number(bahan.stokMinimum) || 0;
      const perDasar = hargaPerDasar(bahan);
      return {
        bahan,
        stok: jumlah,
        minimum,
        satuan: labelDasar(bahan),
        menipis: jumlah <= 0 || (minimum > 0 && jumlah <= minimum),
        nilai: Number.isFinite(perDasar) ? Math.max(0, jumlah) * perDasar : 0,
      };
    })
    .sort((a, b) => Number(b.menipis) - Number(a.menipis) || a.bahan.nama.localeCompare(b.bahan.nama));
}

/**
 * Catat belanja bahan. baris = [{idBahan, jumlahKemasan, hargaTotal, perbaruiHarga}].
 * Stok bertambah sebanyak jumlahKemasan x isi kemasan. Dengan perbaruiHarga, harga bahan ikut diganti
 * dengan harga per kemasan belanja ini (HPP memakai harga terbaru).
 */
export function catatBelanja(db, baris, { tempat = '', catatan = '', sekarang = Date.now() } = {}) {
  const nota = buatId('nota');
  const hasil = [];
  for (const b of baris) {
    const bahan = db.ambil('Bahan', b.idBahan);
    const kemasan = Number(b.jumlahKemasan) || 0;
    if (!bahan || !(kemasan > 0)) continue;
    const harga = Number(b.hargaTotal) || 0;
    hasil.push(
      db.simpan('MutasiBahan', {
        idBahan: bahan.id,
        jumlah: kemasan * isiKemasanDasar(bahan),
        jenis: 'beli',
        idRef: nota,
        harga,
        catatan: [tempat.trim() && 'Beli di ' + tempat.trim(), catatan.trim()].filter(Boolean).join(' · '),
        waktu: sekarang,
      }),
    );
    if (b.perbaruiHarga && harga > 0) {
      const perKemasan = Math.round(harga / kemasan);
      db.simpan('Bahan', {
        ...bahan,
        hargaBeli: perKemasan,
        beliDi: tempat.trim() || bahan.beliDi,
        hargaDiperbarui: perKemasan !== bahan.hargaBeli ? sekarang : bahan.hargaDiperbarui || sekarang,
      });
    }
  }
  return hasil;
}

/** Samakan stok dengan hitungan nyata (satuan dasar). Mencatat selisihnya sebagai koreksi. */
export function koreksiStokBahan(db, idBahan, stokNyata, catatan = '') {
  const kini = stokBahan(db).get(idBahan) || 0;
  const selisih = bulat(Number(stokNyata) - kini);
  if (!Number.isFinite(selisih) || selisih === 0) return null;
  return db.simpan('MutasiBahan', { idBahan, jumlah: selisih, jenis: 'koreksi', idRef: '', harga: 0, catatan: catatan.trim() || 'Hitung ulang stok', waktu: Date.now() });
}

export function riwayatBahan(db, idBahan) {
  return db.semua('MutasiBahan', (m) => m.idBahan === idBahan).sort((a, b) => (b.waktu || 0) - (a.waktu || 0));
}

// ---------- Produksi ----------

/**
 * Rencana produksi `kali` x resep (memakai eksperimen yang dipakai untuk HPP, biasanya juara).
 * bahan = [{bahan, butuh, stok, kurang, satuan}] dalam satuan dasar.
 */
export function rencanaProduksi(db, idResep, kali = 1) {
  const resep = db.ambil('Resep', idResep);
  if (!resep) return null;
  const eksperimen = eksperimenUntukHitung(db, resep, targetResep(db, idResep));
  const porsi = eksperimen ? Number(eksperimen.porsi) || 0 : 0;
  const stok = stokBahan(db);
  const peta = new Map();
  const bermasalah = [];
  for (const b of eksperimen ? bahanEksperimen(db, eksperimen.id) : []) {
    const bahan = db.ambil('Bahan', b.idBahan);
    if (!bahan) continue;
    const dasar = keDasar(bahan, konversiBahan(db, bahan.id), b.jumlah, b.satuan) * kali;
    if (!Number.isFinite(dasar)) {
      bermasalah.push(bahan.nama);
      continue;
    }
    peta.set(bahan.id, (peta.get(bahan.id) || 0) + dasar);
  }
  const bahan = [...peta].map(([id, butuh]) => {
    const b = db.ambil('Bahan', id);
    const ada = bulat(stok.get(id) || 0);
    return { bahan: b, butuh: bulat(butuh), stok: ada, kurang: bulat(Math.max(0, butuh - ada)), satuan: labelDasar(b) };
  });
  return {
    resep,
    eksperimen,
    porsi,
    satuanPorsi: (eksperimen && eksperimen.satuanPorsi) || 'porsi',
    hasil: porsi * kali,
    bahan,
    bermasalah,
    kurang: bahan.filter((b) => b.kurang > 0),
  };
}

/** Catat produksi: stok bahan berkurang sesuai resep, stok makanan bertambah sebanyak hasil. */
export function catatProduksi(db, { idResep, kali = 1, hasil, catatan = '', sekarang = Date.now() }) {
  const r = rencanaProduksi(db, idResep, kali);
  if (!r || !r.eksperimen) throw new Error('Resep ini belum punya eksperimen.');
  const jadi = Number(hasil);
  if (!(jadi > 0)) throw new Error('Isi jumlah hasil produksi.');
  const h = hppResep(db, idResep);
  const prd = db.simpan('Produksi', {
    idResep,
    idEksperimen: r.eksperimen.id,
    kali: Number(kali),
    hasil: jadi,
    hppPorsi: h && Number.isFinite(h.hppPorsi) ? h.hppPorsi : null,
    catatan: catatan.trim(),
    waktu: sekarang,
  });
  for (const b of r.bahan) {
    db.simpan('MutasiBahan', { idBahan: b.bahan.id, jumlah: -b.butuh, jenis: 'produksi', idRef: prd.id, harga: 0, catatan: `Produksi ${r.resep.nama}`, waktu: sekarang });
  }
  db.simpan('MutasiMakanan', { idResep, jumlah: jadi, jenis: 'produksi', idRef: prd.id, catatan: `Produksi ${kali}x resep`, waktu: sekarang });
  return prd;
}

/** Batalkan catatan produksi: stok bahan dan stok makanan dikembalikan. */
export function hapusProduksi(db, idProduksi) {
  db.semua('MutasiBahan', (m) => m.idRef === idProduksi).forEach((m) => db.hapus('MutasiBahan', m.id));
  db.semua('MutasiMakanan', (m) => m.idRef === idProduksi).forEach((m) => db.hapus('MutasiMakanan', m.id));
  db.hapus('Produksi', idProduksi);
}

export function daftarProduksi(db) {
  return db.semua('Produksi').sort((a, b) => (b.waktu || 0) - (a.waktu || 0));
}

// ---------- Stok makanan ----------

/** Map idResep -> stok makanan jadi. */
export function stokMakanan(db) {
  return jumlahkan(db.semua('MutasiMakanan'), 'idResep');
}

/** Satuan porsi resep (akun toko tidak punya data eksperimen: 'porsi'). */
function satuanResep(db, resep) {
  const e = resep && eksperimenUntukHitung(db, resep, targetResep(db, resep.id));
  return (e && e.satuanPorsi) || 'porsi';
}

/** Stok makanan per resep yang pernah diproduksi atau ada di menu. */
export function daftarStokMakanan(db) {
  const stok = stokMakanan(db);
  const id = new Set([...stok.keys()]);
  for (const m of db.semua('Menu')) for (const idResep of Object.keys(isiMenu(db, m))) id.add(idResep);
  return [...id]
    .map((idResep) => db.ambil('Resep', idResep))
    .filter(Boolean)
    .map((resep) => ({ resep, stok: bulat(stok.get(resep.id) || 0), satuan: satuanResep(db, resep) }))
    .sort((a, b) => a.resep.nama.localeCompare(b.resep.nama));
}

/** jenis 'koreksi' (stokNyata = hitungan nyata) atau 'rusak' (jumlah = yang dibuang). */
export function ubahStokMakanan(db, idResep, { jenis, nilai, catatan = '' }) {
  const kini = stokMakanan(db).get(idResep) || 0;
  const jumlah = jenis === 'rusak' ? -Math.abs(Number(nilai)) : bulat(Number(nilai) - kini);
  if (!Number.isFinite(jumlah) || jumlah === 0) return null;
  return db.simpan('MutasiMakanan', { idResep, jumlah, jenis, idRef: '', catatan: catatan.trim() || (jenis === 'rusak' ? 'Rusak / basi' : 'Hitung ulang stok'), waktu: Date.now() });
}

export function riwayatMakanan(db, idResep) {
  return db.semua('MutasiMakanan', (m) => m.idResep === idResep).sort((a, b) => (b.waktu || 0) - (a.waktu || 0));
}

// ---------- Menu jual ----------

/** Resep yang terpakai untuk 1 menu: {idResep: jumlah}. Paket = isi paketnya. */
export function isiMenu(db, menu) {
  if (!menu) return {};
  if (menu.jenis === 'paket') {
    const hasil = {};
    for (const i of isiPaket(db, menu.idRef)) hasil[i.idResep] = (hasil[i.idResep] || 0) + (Number(i.jumlah) || 1);
    return hasil;
  }
  return menu.idRef ? { [menu.idRef]: 1 } : {};
}

/** Berapa menu ini masih bisa dijual dari stok makanan. null = tidak ada resep yang dilacak. */
export function sisaMenu(db, menu, stok = stokMakanan(db)) {
  const isi = Object.entries(isiMenu(db, menu));
  if (!isi.length) return null;
  return Math.min(...isi.map(([idResep, per]) => Math.floor(Math.max(0, stok.get(idResep) || 0) / per)));
}

export function daftarMenu(db, { hanyaAktif = false } = {}) {
  const stok = stokMakanan(db);
  return db
    .semua('Menu', (m) => !hanyaAktif || m.aktif)
    .sort((a, b) => (a.urutan ?? 0) - (b.urutan ?? 0) || (a.nama || '').localeCompare(b.nama || ''))
    .map((menu) => ({ menu, sisa: sisaMenu(db, menu, stok) }));
}

/** Resep dan paket yang belum ada di menu. */
export function pilihanMenu(db) {
  const ada = new Set(db.semua('Menu').map((m) => m.jenis + ':' + m.idRef));
  return [
    ...db.semua('Resep', (r) => !ada.has('resep:' + r.id)).map((r) => ({ jenis: 'resep', id: r.id, nama: r.nama })),
    ...db.semua('Paket', (p) => !ada.has('paket:' + p.id)).map((p) => ({ jenis: 'paket', id: p.id, nama: p.nama })),
  ].sort((a, b) => a.nama.localeCompare(b.nama));
}

/** Harga saran: harga jual yang sudah ditetapkan di HPP Jual / paket, atau harga minimum dari margin target. */
export function hargaSaranMenu(db, jenis, idRef) {
  if (jenis === 'paket') {
    const p = dataPaket(db, idRef);
    if (!p) return 0;
    if (p.paket.hargaJual > 0) return p.paket.hargaJual;
    const h = hargaMinimum(p.hppPaket, p.paket.marginTarget ?? 40);
    return Number.isFinite(h) ? bulatkanHarga(h) : 0;
  }
  const d = dataHPP(db, idRef);
  if (!d) return 0;
  if (d.target && d.target.hargaJual > 0) return d.target.hargaJual;
  const h = hargaMinimum(d.hppJual, (d.target && d.target.marginTarget) ?? 40);
  return Number.isFinite(h) ? bulatkanHarga(h) : 0;
}

/** Foto menu: foto eksperimen juara / foto acuan resep (hanya yang sudah di server, supaya tampil di kasir dan link). */
export function fotoMenu(db, jenis, idRef) {
  const resep = jenis === 'resep' ? db.ambil('Resep', idRef) : db.ambil('Resep', (isiPaket(db, idRef)[0] || {}).idResep);
  if (!resep) return '';
  const juara = db.ambil('Eksperimen', resep.idJuara);
  return (juara && juara.fotoHasilUrl) || resep.fotoAcuanUrl || '';
}

export function tambahMenu(db, jenis, idRef) {
  const sumber = db.ambil(jenis === 'paket' ? 'Paket' : 'Resep', idRef);
  if (!sumber) return null;
  return db.simpan('Menu', {
    jenis,
    idRef,
    nama: sumber.nama,
    harga: hargaSaranMenu(db, jenis, idRef),
    fotoUrl: fotoMenu(db, jenis, idRef),
    keterangan: '',
    aktif: true,
    online: true,
    urutan: db.semua('Menu').length,
  });
}

// ---------- Pelanggan ----------

/** Nomor WhatsApp -> hanya angka diawali 62 ("0812..." -> "62812..."). '' bila tidak sah. */
export function normalHp(teks) {
  let d = String(teks || '').replace(/\D/g, '');
  if (d.startsWith('0')) d = '62' + d.slice(1);
  else if (d.startsWith('8')) d = '62' + d;
  return /^62\d{8,13}$/.test(d) ? d : '';
}

/** "62812345678" -> "0812-3456-78" */
export function tampilHp(hp) {
  const d = String(hp || '');
  if (!d.startsWith('62')) return d;
  return ('0' + d.slice(2)).replace(/(\d{4})(\d{4})(\d+)/, '$1-$2-$3');
}

export function idPelanggan(hp) {
  return 'plg_' + hp;
}

/** Catat / perbarui pelanggan dari nomor WhatsApp. Mengembalikan baris pelanggan, atau null bila nomor kosong. */
export function simpanPelanggan(db, { nama = '', hp = '' }) {
  const n = normalHp(hp);
  if (!n) return null;
  const id = idPelanggan(n);
  const lama = db.ambil('Pelanggan', id);
  if (lama && (lama.nama || !nama.trim())) return lama;
  return db.simpan('Pelanggan', { ...(lama || { catatan: '', dibuat: Date.now() }), id, hp: n, nama: nama.trim() || (lama && lama.nama) || '' });
}

/** Pesanan yang dihitung sebagai belanja: bukan batal dan bukan pesanan online yang belum dibayar. */
const pesananSah = (p) => p.status !== 'batal' && p.status !== 'menunggu';

export function daftarPelanggan(db) {
  const pesanan = db.semua('Pesanan', pesananSah);
  return db
    .semua('Pelanggan')
    .map((pelanggan) => {
      const milik = pesanan.filter((p) => p.idPelanggan === pelanggan.id);
      return {
        pelanggan,
        jumlahPesanan: milik.length,
        totalBelanja: milik.reduce((j, p) => j + (Number(p.total) || 0), 0),
        terakhir: Math.max(0, ...milik.map((p) => p.waktu || 0)),
      };
    })
    .sort((a, b) => b.terakhir - a.terakhir || (a.pelanggan.nama || '').localeCompare(b.pelanggan.nama || ''));
}

// ---------- Promo ----------

/**
 * Diskon dari satu promo (aturan sama dengan Penjualan::promo di server).
 * lama = pelanggan sudah pernah memesan; dipakai = berapa kali kode ini sudah dipakai.
 */
export function hitungPromo(promo, { subtotal, lama = false, dipakai = 0, online = false, sekarang = Date.now() }) {
  const gagal = (galat) => ({ diskon: 0, galat });
  if (!promo || !promo.aktif) return gagal('Kode promo tidak ditemukan.');
  if (online && !promo.online) return gagal('Kode promo ini hanya berlaku di toko.');
  if (promo.mulai && sekarang < promo.mulai) return gagal('Promo ini belum dimulai.');
  if (promo.sampai && sekarang > promo.sampai) return gagal('Promo ini sudah berakhir.');
  if (promo.minBelanja > 0 && subtotal < promo.minBelanja) return gagal(`Minimal belanja untuk promo ini Rp ${Math.round(promo.minBelanja).toLocaleString('id-ID')}.`);
  if (promo.untuk === 'baru' && lama) return gagal('Promo ini khusus pelanggan baru.');
  if (promo.untuk === 'lama' && !lama) return gagal('Promo ini khusus pelanggan yang sudah pernah memesan.');
  if (promo.kuota > 0 && dipakai >= promo.kuota) return gagal('Kuota promo ini sudah habis.');
  let diskon = promo.jenis === 'persen' ? Math.floor((subtotal * (Number(promo.nilai) || 0)) / 100) : Number(promo.nilai) || 0;
  if (promo.jenis === 'persen' && promo.maksDiskon > 0) diskon = Math.min(diskon, promo.maksDiskon);
  return { diskon: Math.max(0, Math.min(subtotal, diskon)), galat: '' };
}

export function cariPromo(db, kode) {
  const k = String(kode || '').trim().toUpperCase();
  return k ? db.semua('Promo', (p) => String(p.kode || '').trim().toUpperCase() === k)[0] || null : null;
}

/** Cek kode promo untuk pesanan kasir. */
export function cekPromo(db, kode, { subtotal, idPelanggan = '', kecuali = '' }) {
  const k = String(kode || '').trim().toUpperCase();
  if (!k) return { diskon: 0, galat: '', promo: null };
  const promo = cariPromo(db, k);
  const sah = db.semua('Pesanan', (p) => pesananSah(p) && p.id !== kecuali);
  const lama = !!idPelanggan && sah.some((p) => p.idPelanggan === idPelanggan);
  const dipakai = sah.filter((p) => String(p.kodePromo || '').toUpperCase() === k).length;
  return { ...hitungPromo(promo, { subtotal, lama, dipakai }), promo };
}

export function daftarPromo(db) {
  const sah = db.semua('Pesanan', pesananSah);
  return db
    .semua('Promo')
    .map((promo) => ({ promo, dipakai: sah.filter((p) => String(p.kodePromo || '').toUpperCase() === String(promo.kode || '').toUpperCase()).length }))
    .sort((a, b) => Number(b.promo.aktif) - Number(a.promo.aktif) || (a.promo.kode || '').localeCompare(b.promo.kode || ''));
}

// ---------- Pesanan ----------

export const STATUS_PESANAN = {
  menunggu: 'Menunggu bayar',
  baru: 'Baru',
  diproses: 'Diproses',
  siap: 'Siap diambil',
  selesai: 'Selesai',
  batal: 'Batal',
};
export const ALUR_STATUS = ['baru', 'diproses', 'siap', 'selesai'];

/** Nomor pendek, mis. "2810-K7Q" (tanggal-bulan + 3 huruf acak). Sama dengan Penjualan::nomorPesanan. */
export function nomorPesanan(sekarang = Date.now()) {
  const d = new Date(sekarang);
  const huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const b = new Uint8Array(3);
  globalThis.crypto.getRandomValues(b);
  const acak = Array.from(b, (x) => huruf[x % huruf.length]).join('');
  return String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0') + '-' + acak;
}

/** Saluran pesanan manual (pesanan yang masuk lewat chat, telepon, dll.). */
export const SALURAN_PESANAN = ['WhatsApp', 'Telepon', 'Instagram', 'Datang langsung', 'Lainnya'];

/**
 * keranjang = [{idMenu, jumlah}] -> item pesanan dengan nama dan harga menu saat ini.
 * Item di luar menu: {nama, harga, jumlah} tanpa idMenu (tidak memotong stok).
 * Baris yang membawa harga sendiri (mis. saat mengubah pesanan lama) memakai harga itu.
 */
export function itemKeranjang(db, keranjang) {
  const item = [];
  for (const k of keranjang) {
    const jumlah = Number(k.jumlah) || 0;
    if (jumlah <= 0) continue;
    if (!k.idMenu) {
      const nama = String(k.nama || '').trim();
      if (nama) item.push({ idMenu: '', nama: nama.slice(0, 80), harga: Math.max(0, Number(k.harga) || 0), jumlah });
      continue;
    }
    const m = db.ambil('Menu', k.idMenu);
    if (!m && k.nama === undefined) continue;
    const harga = k.harga !== undefined ? Number(k.harga) || 0 : Number(m.harga) || 0;
    item.push({ idMenu: k.idMenu, nama: m ? m.nama : k.nama, harga, jumlah });
  }
  return { item, subtotal: item.reduce((j, i) => j + i.harga * i.jumlah, 0) };
}

/** Kebutuhan stok makanan untuk item pesanan: Map idResep -> jumlah. */
export function kebutuhanPesanan(db, item) {
  const butuh = new Map();
  for (const i of item || []) {
    for (const [idResep, per] of Object.entries(isiMenu(db, db.ambil('Menu', i.idMenu)))) {
      butuh.set(idResep, (butuh.get(idResep) || 0) + per * (Number(i.jumlah) || 0));
    }
  }
  return butuh;
}

/** Resep yang stoknya tidak cukup: [{resep, butuh, stok}]. */
export function kurangStok(db, item) {
  const stok = stokMakanan(db);
  return [...kebutuhanPesanan(db, item)]
    .filter(([id, butuh]) => (stok.get(id) || 0) + 1e-9 < butuh)
    .map(([id, butuh]) => ({ resep: db.ambil('Resep', id), butuh, stok: stok.get(id) || 0 }));
}

const idMutasiJual = (idPesanan, idResep) => `mmk_${idPesanan}_${idResep}`;

/** Potong stok makanan untuk pesanan. Id baris tetap, jadi aman dipanggil berkali-kali / di perangkat lain. */
export function potongStokPesanan(db, pesanan) {
  for (const [idResep, jumlah] of kebutuhanPesanan(db, pesanan.item)) {
    const id = idMutasiJual(pesanan.id, idResep);
    if (db.ambil('MutasiMakanan', id)) continue;
    db.simpan('MutasiMakanan', { id, idResep, jumlah: -jumlah, jenis: 'jual', idRef: pesanan.id, catatan: `Pesanan #${pesanan.nomor}`, waktu: Date.now() });
  }
}

/** Kembalikan stok pesanan yang dibatalkan. */
export function kembalikanStokPesanan(db, pesanan) {
  db.semua('MutasiMakanan', (m) => m.jenis === 'jual' && m.idRef === pesanan.id).forEach((m) => db.hapus('MutasiMakanan', m.id));
}

/** Isi pesanan dari keranjang + pembeli + promo. Dipakai saat membuat dan mengubah pesanan. */
function isiPesanan(db, { keranjang, nama = '', hp = '', catatan = '', kodePromo = '', ongkir = 0, kecuali = '' }) {
  const { item, subtotal } = itemKeranjang(db, keranjang);
  if (!item.length) throw new Error('Keranjang masih kosong.');
  const nomorHp = hp ? normalHp(hp) : '';
  if (hp && !nomorHp) throw new Error('Nomor WhatsApp tidak valid, mis. 0812xxxxxxx.');
  const promo = cekPromo(db, kodePromo, { subtotal, idPelanggan: nomorHp ? idPelanggan(nomorHp) : '', kecuali });
  if (promo.galat) throw new Error(promo.galat);
  const biaya = Math.max(0, Math.round(Number(ongkir) || 0));
  const pelanggan = nomorHp ? simpanPelanggan(db, { nama, hp: nomorHp }) : null;
  return {
    idPelanggan: pelanggan ? pelanggan.id : '',
    nama: nama.trim() || (pelanggan && pelanggan.nama) || '',
    hp: pelanggan ? pelanggan.hp : '',
    catatan: catatan.trim(),
    item,
    subtotal,
    diskon: promo.diskon,
    kodePromo: promo.promo ? String(promo.promo.kode).trim().toUpperCase() : '',
    ongkir: biaya,
    total: subtotal - promo.diskon + biaya,
  };
}

/** Data tambahan pesanan manual. */
function infoManual({ saluran = '', jadwal = 0, alamat = '' }) {
  return { saluran: String(saluran || '').slice(0, 40), jadwal: Number(jadwal) || 0, alamat: String(alamat || '').trim().slice(0, 300) };
}

/**
 * Buat pesanan dari kasir (sumber 'kasir') atau catatan manual (sumber 'manual': saluran, jadwal, alamat, ongkir).
 * Stok makanan langsung dipotong. Lempar Error bila keranjang kosong atau promo tidak berlaku.
 */
export function buatPesanan(db, { keranjang, nama = '', hp = '', catatan = '', kodePromo = '', oleh = '', sumber = 'kasir', saluran = '', jadwal = 0, alamat = '', ongkir = 0, sekarang = Date.now() }) {
  const manual = sumber === 'manual';
  const isi = isiPesanan(db, { keranjang, nama, hp, catatan, kodePromo, ongkir: manual ? ongkir : 0 });
  const pesanan = db.simpan('Pesanan', {
    nomor: nomorPesanan(sekarang),
    sumber: manual ? 'manual' : 'kasir',
    ...isi,
    ...(manual ? infoManual({ saluran, jadwal, alamat }) : {}),
    status: 'baru',
    oleh,
    waktu: sekarang,
  });
  potongStokPesanan(db, pesanan);
  return pesanan;
}

/** Pesanan boleh diubah selama belum lunas, belum selesai/batal, dan bukan pesanan online. */
export function bisaDiubah(db, pesanan) {
  return !!pesanan && pesanan.sumber !== 'online' && ['baru', 'diproses', 'siap'].includes(pesanan.status) && !statusBayar(db, pesanan.id).lunas;
}

/** Ubah isi pesanan yang belum dibayar. Stok makanan dihitung ulang. */
export function ubahPesanan(db, idPesanan, { keranjang, nama = '', hp = '', catatan = '', kodePromo = '', saluran = '', jadwal = 0, alamat = '', ongkir = 0 }) {
  const lama = db.ambil('Pesanan', idPesanan);
  if (!bisaDiubah(db, lama)) throw new Error('Pesanan ini tidak bisa diubah lagi.');
  const manual = lama.sumber === 'manual';
  const isi = isiPesanan(db, { keranjang, nama, hp, catatan, kodePromo, ongkir: manual ? ongkir : 0, kecuali: idPesanan });
  kembalikanStokPesanan(db, lama);
  const baru = db.simpan('Pesanan', { ...lama, ...isi, ...(manual ? infoManual({ saluran, jadwal, alamat }) : {}) });
  potongStokPesanan(db, baru);
  // Link Mayar lama memakai total lama: batalkan supaya dibuat ulang.
  if (baru.total !== lama.total) {
    pembayaranPesanan(db, idPesanan)
      .filter((b) => b.status === 'menunggu')
      .forEach((b) => db.simpan('Pembayaran', { ...b, status: 'batal' }));
  }
  return baru;
}

export function pembayaranPesanan(db, idPesanan) {
  return db.semua('Pembayaran', (b) => b.idPesanan === idPesanan).sort((a, b) => (a.waktu || 0) - (b.waktu || 0));
}

/** Status bayar: lunas bila ada pembayaran lunas. menunggu = link Mayar yang belum dibayar. */
export function statusBayar(db, idPesanan) {
  const daftar = pembayaranPesanan(db, idPesanan);
  const lunas = daftar.find((b) => b.status === 'lunas') || null;
  const tunggu = (metode) => (lunas ? null : daftar.find((b) => b.metode === metode && b.status === 'menunggu') || null);
  return { lunas: !!lunas, bayar: lunas, menunggu: tunggu('mayar'), menungguTransfer: tunggu('transfer'), daftar };
}

/** Ubah status pesanan. Batal mengembalikan stok; keluar dari batal / menunggu memotong stok lagi. */
export function ubahStatusPesanan(db, idPesanan, status) {
  const p = db.ambil('Pesanan', idPesanan);
  if (!p || p.status === status) return p;
  const baru = db.simpan('Pesanan', { ...p, status });
  if (status === 'batal') {
    kembalikanStokPesanan(db, p);
    pembayaranPesanan(db, idPesanan)
      .filter((b) => b.status === 'menunggu')
      .forEach((b) => db.simpan('Pembayaran', { ...b, status: 'batal' }));
  } else if (p.status === 'batal' || p.status === 'menunggu') {
    potongStokPesanan(db, baru);
  }
  return baru;
}

export const LABEL_METODE = { tunai: 'Tunai', transfer: 'Transfer/QRIS', mayar: 'Online' };

/**
 * Setelah lunas: tagihan lain yang masih menunggu ditutup, dan pesanan dari link pemesanan
 * yang masih "menunggu" diterima (status baru) sehingga stoknya dipotong.
 */
function setelahLunas(db, pesanan, idLunas) {
  pembayaranPesanan(db, pesanan.id)
    .filter((b) => b.id !== idLunas && b.status === 'menunggu')
    .forEach((b) => db.simpan('Pembayaran', { ...b, status: 'batal' }));
  const kini = db.ambil('Pesanan', pesanan.id);
  if (kini && kini.status === 'menunggu') ubahStatusPesanan(db, kini.id, 'baru');
}

/** Catat pembayaran transfer bank / QRIS langsung ke rekening toko (dicek manual). */
export function bayarTransfer(db, pesanan) {
  const sekarang = Date.now();
  const tunggu = statusBayar(db, pesanan.id).menungguTransfer;
  const b = db.simpan('Pembayaran', {
    ...(tunggu || {}),
    idPesanan: pesanan.id,
    metode: 'transfer',
    jumlah: pesanan.total,
    diterima: pesanan.total,
    kembalian: 0,
    status: 'lunas',
    idMayar: '',
    linkMayar: '',
    waktu: tunggu ? tunggu.waktu : sekarang,
    lunasPada: sekarang,
  });
  setelahLunas(db, pesanan, b.id);
  return b;
}

/** Bayar tunai: lunas, dengan uang diterima dan kembalian. */
export function bayarTunai(db, pesanan, diterima) {
  const uang = Number(diterima) || 0;
  if (uang < pesanan.total) throw new Error('Uang yang diterima kurang dari total.');
  const sekarang = Date.now();
  const b = db.simpan('Pembayaran', {
    idPesanan: pesanan.id,
    metode: 'tunai',
    jumlah: pesanan.total,
    diterima: uang,
    kembalian: uang - pesanan.total,
    status: 'lunas',
    idMayar: '',
    linkMayar: '',
    waktu: sekarang,
    lunasPada: sekarang,
  });
  setelahLunas(db, pesanan, b.id);
  return b;
}

/** Saran uang pas untuk tombol cepat kasir. */
export function saranUang(total) {
  const saran = new Set([total]);
  for (const k of [5000, 10000, 50000, 100000]) {
    const atas = Math.ceil(total / k) * k;
    if (atas > total) saran.add(atas);
  }
  return [...saran].sort((a, b) => a - b).slice(0, 4);
}

export function daftarPesanan(db, { status = '' } = {}) {
  return db.semua('Pesanan', (p) => !status || p.status === status).sort((a, b) => (b.waktu || 0) - (a.waktu || 0));
}

function awalHari(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Ringkasan penjualan sejak awal hari (pembayaran lunas). */
export function ringkasPenjualan(db, { sejak = awalHari() } = {}) {
  const bayar = db.semua('Pembayaran', (b) => b.status === 'lunas' && (b.lunasPada || b.waktu || 0) >= sejak);
  const pesanan = db.semua('Pesanan', (p) => (p.waktu || 0) >= sejak && pesananSah(p));
  const perMetode = { tunai: 0, transfer: 0, mayar: 0 };
  for (const b of bayar) perMetode[b.metode in perMetode ? b.metode : 'tunai'] += Number(b.jumlah) || 0;
  return {
    omzet: perMetode.tunai + perMetode.transfer + perMetode.mayar,
    perMetode,
    jumlahPesanan: pesanan.length,
    belumBayar: pesanan.filter((p) => !statusBayar(db, p.id).lunas).length,
    aktif: db.semua('Pesanan', (p) => ['baru', 'diproses', 'siap'].includes(p.status)).length,
  };
}

// ---------- Toko online (link pemesanan) ----------

export const ID_TOKO = 'stl_toko';

/** Rekening bank yang lengkap saja: [{bank, nomor, atasNama}]. */
export function rekeningToko(db) {
  const r = (ambilToko(db).rekening || []);
  return (Array.isArray(r) ? r : [])
    .map((x) => ({ bank: String((x && x.bank) || '').trim(), nomor: String((x && x.nomor) || '').trim(), atasNama: String((x && x.atasNama) || '').trim() }))
    .filter((x) => x.bank && x.nomor);
}

/** Foto QRIS toko (data lokal sebelum terunggah, lalu tautan di server). */
export function qrisToko(db) {
  const t = ambilToko(db);
  return t.qrisLokal || t.qrisUrl || '';
}

/** Mayar dipakai bila diaktifkan admin. Tanpa itu pembayaran non-tunai = transfer/QRIS manual. */
export function pakaiMayar(db) {
  return !!ambilToko(db).pakaiMayar;
}

/** Simpan rekening dan foto QRIS. qris: data URL baru, '' = hapus, undefined = tidak berubah. */
export function simpanPembayaranManual(db, { rekening, qris }) {
  const patch = {};
  if (rekening !== undefined) {
    patch.rekening = rekening
      .map((x) => ({ bank: String(x.bank || '').trim().slice(0, 40), nomor: String(x.nomor || '').replace(/[^\d\- ]/g, '').trim().slice(0, 40), atasNama: String(x.atasNama || '').trim().slice(0, 60) }))
      .filter((x) => x.bank && x.nomor)
      .slice(0, 5);
  }
  if (qris !== undefined && qris !== qrisToko(db)) {
    patch.qrisLokal = qris || '';
    patch.qrisUrl = '';
  }
  return simpanToko(db, patch);
}

export function ambilToko(db) {
  return db.ambil('Setelan', ID_TOKO) || { id: ID_TOKO, namaToko: '', tokenToko: '', tokoBuka: false, alamatToko: '', waToko: '', catatanToko: '' };
}

export function simpanToko(db, patch) {
  return db.simpan('Setelan', { ...ambilToko(db), ...patch, id: ID_TOKO });
}

/** Buat token link pemesanan bila belum ada (atau ganti dengan yang baru). */
export function aturTokenToko(db, { ganti = false } = {}) {
  const t = ambilToko(db);
  if (t.tokenToko && !ganti) return t;
  const b = new Uint8Array(12);
  globalThis.crypto.getRandomValues(b);
  return simpanToko(db, { tokenToko: Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('') });
}

/** Tautan pemesanan untuk pembeli. Alamat server ikut hanya saat uji (config.js menetapkannya di versi jual). */
export function tautanToko(token, scriptUrl = '') {
  const tetap = (globalThis.window && window.APP_CONFIG && window.APP_CONFIG.scriptUrl) || '';
  const dasar = (location.origin + location.pathname).replace(/index\.html$/, '').replace(/admin\/?$/, ''); // link publik selalu ke halaman utama
  return `${dasar}#/pesan/${token}` + (tetap || !scriptUrl ? '' : `?u=${encodeURIComponent(scriptUrl)}`);
}

// ---------- Permintaan ke server ----------

const kirim = (db, isi, opsi) => panggilApi(alamatServer(db), { ...isi, kunci: db.pengaturan.kunci }, opsi);

/** Kasir memilih bayar online: server membuat link Mayar dan baris Pembayaran. */
export async function mintaBayarMayar(db, pesanan, opsi) {
  const j = await kirim(db, { aksi: 'bayarMayar', idPesanan: pesanan.id, jumlah: pesanan.total, nomor: pesanan.nomor, nama: pesanan.nama, hp: pesanan.hp }, opsi);
  const baris = dariBaris('Pembayaran', j.pembayaran);
  db.terapkanDariServer('Pembayaran', [baris]);
  return db.ambil('Pembayaran', baris.id) || baris;
}

/** Tanyakan status pembayaran Mayar ke server (server menanyakan ke Mayar). */
export async function cekBayarMayar(db, idPembayaran, opsi) {
  const j = await kirim(db, { aksi: 'cekBayar', idPembayaran }, opsi);
  const baris = dariBaris('Pembayaran', j.pembayaran);
  db.terapkanDariServer('Pembayaran', [baris]);
  return db.ambil('Pembayaran', baris.id) || baris;
}

export const akunToko = {
  daftar: (db, opsi) => kirim(db, { aksi: 'akunToko' }, opsi).then((j) => j.akun),
  buat: (db, isi, opsi) => kirim(db, { aksi: 'buatAkunToko', ...isi }, opsi).then((j) => j.akun),
  ubah: (db, id, isi, opsi) => kirim(db, { aksi: 'ubahAkunToko', id, ...isi }, opsi).then((j) => j.akun),
  hapus: (db, id, opsi) => kirim(db, { aksi: 'hapusAkunToko', id }, opsi),
};

export const pengaturanMayar = {
  info: (db, opsi) => kirim(db, { aksi: 'infoMayar' }, opsi),
  simpan: (db, { kunciApi, sandbox }, opsi) => kirim(db, { aksi: 'aturMayar', kunciApi, sandbox }, opsi),
  matikan: (db, opsi) => kirim(db, { aksi: 'aturMayar', hapus: true }, opsi),
};

/** Halaman pemesanan pembeli (tanpa login). */
export const pesanOnline = {
  info: (url, token, opsi) => panggilApi(url, { aksi: 'infoToko', token }, opsi),
  kirim: (url, token, isi, opsi) => panggilApi(url, { aksi: 'pesanOnline', token, ...isi }, opsi),
  status: (url, token, idPesanan, opsi) => panggilApi(url, { aksi: 'statusPesanan', token, idPesanan }, opsi),
};

// ---------- Testimoni pembeli ----------

/** Semua testimoni untuk admin: menunggu persetujuan dulu, lalu terbaru. */
export function daftarTestimoni(db) {
  return db.semua('Testimoni').sort((a, b) => Number(!!a.tampil) - Number(!!b.tampil) || (b.waktu || 0) - (a.waktu || 0));
}

/** Testimoni yang tayang di halaman pemesanan. */
export function testimoniTampil(db) {
  return db.semua('Testimoni', (t) => t.tampil && String(t.isi || '').trim()).sort((a, b) => (b.waktu || 0) - (a.waktu || 0));
}

/** Admin menulis atau mengubah testimoni (mis. dari chat WhatsApp pembeli). */
export function simpanTestimoni(db, { id, nama, isi, bintang = 5, tampil = true }) {
  const teks = String(isi || '').trim().slice(0, 500);
  if (teks.length < 5) throw new Error('Tulis isi testimoni minimal beberapa kata.');
  const lama = id ? db.ambil('Testimoni', id) : null;
  return db.simpan('Testimoni', {
    ...(lama || { idPesanan: '', sumber: 'admin', waktu: Date.now() }),
    ...(id ? { id } : {}),
    nama: String(nama || '').trim().slice(0, 60) || 'Pembeli',
    isi: teks,
    bintang: Math.max(1, Math.min(5, Math.round(Number(bintang) || 5))),
    tampil: !!tampil,
  });
}

export const kirimTestimoni = (url, token, isi, opsi) => panggilApi(url, { aksi: 'kirimTestimoni', token, ...isi }, opsi);
