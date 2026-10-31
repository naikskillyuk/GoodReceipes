// Stok bahan, produksi, stok makanan, menu jual, pesanan, pembayaran, pelanggan, dan promo.
//
// Stok selalu dihitung dari jumlah baris mutasi (tidak ada angka stok yang ditimpa), supaya kasir dan dapur
// di perangkat berbeda tidak saling menimpa. Aturan yang juga dipakai server (backend/app/Services/Penjualan.php):
// - menu paket memotong stok setiap resep isinya
// - mutasi penjualan memakai id tetap "mmk_{idPesanan}_{idResep}" sehingga tidak pernah terpotong dua kali
// - pelanggan memakai id tetap "plg_{nomor WhatsApp}"

import { buatId, rupiah } from './util.js';
import { panggilApi } from './sync.js';
import { dariBaris } from './schema.js';
import { alamatServer } from './akun.js';
import { keDasar, hargaPerDasar, labelDasar, infoSatuanBeli } from './units.js';
import { hargaMinimum, bulatkanHarga } from './hpp.js';
import { bahanEksperimen, konversiBahan, eksperimenUntukHitung, targetResep, hppResep, dataHPP, dataPaket, fotoSrc, isiPaket, denganLogResep, resepPemakaiBahan } from './repo.js';

// ---------- Peran akun ----------

/** 'dapur' (pemilik, semua menu) atau 'toko' (kasir: menu, stok makanan, pesanan, pembayaran). */
export function peranAkun(db) {
  return db.pengaturan.akun && db.pengaturan.akun.peran === 'toko' ? 'toko' : 'dapur';
}

/** Halaman yang boleh dibuka akun toko / kasir (bagian pertama alamat, di /admin). */
export const RUTE_TOKO = ['', 'kasir', 'catat-pesanan', 'pesanan', 'laporan', 'stok-makanan', 'pelanggan', 'pengaturan'];

// Situs punya dua pintu: "/" = etalase toko untuk pembeli (tanpa login), "/admin" = login admin dan kasir.
export const ALAMAT_TOKO = '/';
export const ALAMAT_ADMIN = '/admin';

/** Sedang dibuka di /admin? */
export function halamanAdmin(jalur = globalThis.location?.pathname || '/') {
  return /^\/admin\/?$/.test(jalur);
}

/** Tampilan kasir/POS terbatas: untuk akun toko. Akun admin (dapur) melihat semua menu. */
export function tampilanToko(db) {
  return peranAkun(db) === 'toko';
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
      denganLogResep(db, resepPemakaiBahan(db, bahan.id), `Harga ${bahan.nama} diperbarui dari belanja`, () =>
        db.simpan('Bahan', {
          ...bahan,
          hargaBeli: perKemasan,
          beliDi: tempat.trim() || bahan.beliDi,
          hargaDiperbarui: perKemasan !== bahan.hargaBeli ? sekarang : bahan.hargaDiperbarui || sekarang,
        }),
      );
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
/**
 * Catat produksi: stok bahan dipotong sesuai takaran. Hasilnya TIDAK langsung masuk stok produk:
 * menunggu dikirim lewat kirimProduksiKeStok (setelah dicek, ada yang mungkin reject).
 * `masukStok` (opsional) langsung mengirim sebagian/semua, dipakai untuk impor data lama dan uji.
 */
export function catatProduksi(db, { idResep, kali = 1, hasil, catatan = '', masukStok, sekarang = Date.now() }) {
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
  const masuk = Math.max(0, Math.min(jadi, Number(masukStok) || 0));
  if (masuk > 0) db.simpan('MutasiMakanan', { idResep, jumlah: masuk, jenis: 'produksi', idRef: prd.id, catatan: `Produksi ${kali}x resep`, waktu: sekarang });
  return prd;
}

/** Jumlah hasil produksi yang sudah masuk ke stok produk. */
export function sudahMasukStok(db, prd) {
  return bulat(db.semua('MutasiMakanan', (m) => m.idRef === prd.id && m.jenis === 'produksi').reduce((j, m) => j + (Number(m.jumlah) || 0), 0));
}

/** Status kirim satu produksi: hasil, sudah dikirim ke stok, reject, dan sisa yang menunggu. */
export function statusKirimProduksi(db, prd) {
  const hasil = Number(prd.hasil) || 0;
  const terkirim = sudahMasukStok(db, prd);
  const reject = bulat(Number(prd.reject) || 0);
  return { hasil, terkirim, reject, sisa: bulat(Math.max(0, hasil - terkirim - reject)) };
}

/** Produksi yang hasilnya masih menunggu dikirim ke stok: [{produksi, resep, ...status}]. */
export function produksiBelumMasuk(db) {
  return daftarProduksi(db)
    .map((p) => ({ produksi: p, resep: db.ambil('Resep', p.idResep), ...statusKirimProduksi(db, p) }))
    .filter((x) => x.resep && x.sisa > 0);
}

/**
 * Kirim hasil produksi ke stok produk setelah dicek: `kirim` masuk stok, `reject` dicatat tidak lolos.
 * Boleh sebagian; sisanya tetap menunggu.
 */
export function kirimProduksiKeStok(db, idProduksi, { kirim = 0, reject = 0, catatan = '' } = {}) {
  const p = db.ambil('Produksi', idProduksi);
  if (!p) throw new Error('Catatan produksi tidak ditemukan.');
  const { sisa } = statusKirimProduksi(db, p);
  const k = Math.max(0, Number(kirim) || 0);
  const r = Math.max(0, Number(reject) || 0);
  if (!(k + r > 0)) throw new Error('Isi jumlah yang dikirim ke stok atau jumlah reject.');
  if (k + r > sisa + 1e-9) throw new Error(`Paling banyak ${sisa} (hasil produksi yang belum dikirim).`);
  if (r > 0) db.simpan('Produksi', { ...p, reject: bulat((Number(p.reject) || 0) + r) });
  if (k > 0) {
    const ket = `Dari produksi ${new Date(p.waktu).toLocaleDateString('id-ID')}${r > 0 ? ` (reject ${r})` : ''}${catatan.trim() ? ' · ' + catatan.trim() : ''}`;
    return db.simpan('MutasiMakanan', { idResep: p.idResep, jumlah: k, jenis: 'produksi', idRef: p.id, catatan: ket, waktu: Date.now() });
  }
  return null;
}

/** Kirim semua sisa (atau `jumlah`) ke stok tanpa reject. */
export function masukkanProduksiKeStok(db, idProduksi, jumlah) {
  const p = db.ambil('Produksi', idProduksi);
  if (!p) throw new Error('Catatan produksi tidak ditemukan.');
  return kirimProduksiKeStok(db, idProduksi, { kirim: jumlah === undefined ? statusKirimProduksi(db, p).sisa : jumlah });
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

const CATATAN_MUTASI = { rusak: 'Rusak / basi', masuk: 'Tambah stok', koreksi: 'Hitung ulang stok' };

/**
 * jenis 'koreksi' (nilai = hitungan nyata), 'rusak' (nilai = yang dibuang),
 * atau 'masuk' (nilai = tambahan stok tanpa produksi, mis. titipan, beli jadi, stok awal).
 */
export function ubahStokMakanan(db, idResep, { jenis, nilai, catatan = '' }) {
  const kini = stokMakanan(db).get(idResep) || 0;
  const n = Number(nilai);
  const jumlah = jenis === 'rusak' ? -Math.abs(n) : jenis === 'masuk' ? Math.abs(n) : bulat(n - kini);
  if (!Number.isFinite(jumlah) || jumlah === 0) return null;
  return db.simpan('MutasiMakanan', { idResep, jumlah, jenis, idRef: '', catatan: catatan.trim() || CATATAN_MUTASI[jenis] || '', waktu: Date.now() });
}

export function riwayatMakanan(db, idResep) {
  return db.semua('MutasiMakanan', (m) => m.idResep === idResep).sort((a, b) => (b.waktu || 0) - (a.waktu || 0));
}

// ---------- Menu jual ----------

/**
 * Diskon produk yang sedang berlaku, 0 bila tidak ada / sudah lewat batas.
 * diskonJenis 'nominal' = potongan Rupiah (maks. harga), selain itu persen (maks. 90%).
 */
export function diskonBerlaku(menu, sekarang = Date.now()) {
  const nilai = Number(menu && menu.diskon) || 0;
  const d = menu && menu.diskonJenis === 'nominal'
    ? Math.max(0, Math.min(Number(menu.harga) || 0, Math.round(nilai)))
    : Math.max(0, Math.min(90, nilai));
  if (!d) return 0;
  const sampai = Number(menu.diskonSampai) || 0;
  return sampai && sekarang > sampai ? 0 : d;
}

/** Label diskon untuk ditampilkan: "-20%" atau "-Rp 2.000". */
export const teksDiskon = (jenis, nilai) => (!(nilai > 0) ? '' : jenis === 'nominal' ? '-' + rupiah(nilai) : `-${nilai}%`);

/** Label diskon produk yang sedang berlaku ('' bila tidak ada). */
export const labelDiskon = (menu, sekarang = Date.now()) => teksDiskon(menu && menu.diskonJenis, diskonBerlaku(menu, sekarang));

/** Pilihan tambahan berbayar sebuah menu: [{nama, harga}] (maks. 12, nama unik). */
export function opsiMenu(menu) {
  const daftar = Array.isArray(menu && menu.opsi) ? menu.opsi : [];
  const lihat = new Set();
  const hasil = [];
  for (const o of daftar) {
    const nama = String((o && o.nama) || '').trim().slice(0, 40);
    if (!nama || lihat.has(nama.toLowerCase())) continue;
    lihat.add(nama.toLowerCase());
    hasil.push({ nama, harga: Math.max(0, Math.round(Number(o.harga) || 0)) });
  }
  return hasil.slice(0, 12);
}

/** Pilihan yang dipilih (hanya yang ada di menu, urutan seperti di menu) dan tambahan harganya. */
export function pilihOpsi(menu, nama = []) {
  const mau = new Set((Array.isArray(nama) ? nama : []).map((x) => String(x).trim().toLowerCase()));
  const opsi = opsiMenu(menu).filter((o) => mau.has(o.nama.toLowerCase()));
  return { opsi: opsi.map((o) => o.nama), tambah: opsi.reduce((j, o) => j + o.harga, 0) };
}

/** Nama item pesanan beserta pilihannya, mis. "Risol (Digoreng, Tambah keju)". */
export const namaItem = (i) => (i ? i.nama + (Array.isArray(i.opsi) && i.opsi.length ? ` (${i.opsi.join(', ')})` : '') : '');

/** Kunci baris keranjang: menu yang sama dengan pilihan berbeda = baris berbeda. */
export const kunciBaris = (idMenu, opsi = []) => idMenu + (opsi.length ? '|' + [...opsi].map((x) => String(x).toLowerCase()).sort().join('|') : '');

/**
 * Harga jual setelah diskon produk. Sama dengan Penjualan::hargaJual.
 * Diskon persen dibulatkan ke Rp 100; potongan Rupiah dikurangkan apa adanya.
 */
export function hargaJual(menu, sekarang = Date.now()) {
  const harga = Number(menu && menu.harga) || 0;
  const d = diskonBerlaku(menu, sekarang);
  if (!d) return harga;
  if (menu.diskonJenis === 'nominal') return Math.max(0, harga - d);
  return Math.max(0, Math.round((harga * (100 - d)) / 100 / 100) * 100);
}

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
  if (jenis === 'paket') {
    const p = db.ambil('Paket', idRef);
    if (p && (p.fotoLokal || p.fotoUrl)) return p.fotoLokal || p.fotoUrl;
  }
  const resep = jenis === 'resep' ? db.ambil('Resep', idRef) : db.ambil('Resep', (isiPaket(db, idRef)[0] || {}).idResep);
  if (!resep) return '';
  const juara = db.ambil('Eksperimen', resep.idJuara);
  return (juara && juara.fotoHasilUrl) || resep.fotoAcuanUrl || '';
}

/** Foto yang tampil untuk menu: foto menu sendiri, atau foto paket / resep. */
export function fotoTampilMenu(db, m) {
  return (m && m.fotoUrl) || (m ? fotoMenu(db, m.jenis, m.idRef) : '');
}

/** Isi paket/menu beserta stok tiap isinya: [{resep, per, stok, cukup}] (untuk melihat isi yang membuat paket habis). */
export function stokIsiMenu(db, m, stok = stokMakanan(db)) {
  return Object.entries(isiMenu(db, m)).map(([idResep, per]) => {
    const s = bulat(stok.get(idResep) || 0);
    return { resep: db.ambil('Resep', idResep), per, stok: s, cukup: s >= per };
  });
}

export function tambahMenu(db, jenis, idRef, isian = {}) {
  const sumber = db.ambil(jenis === 'paket' ? 'Paket' : 'Resep', idRef);
  if (!sumber) return null;
  return db.simpan('Menu', {
    jenis,
    idRef,
    nama: sumber.nama,
    harga: hargaSaranMenu(db, jenis, idRef),
    // Paket memakai fotonya sendiri (bisa diganti kapan saja di halaman paket); resep memakai foto juara/acuan.
    fotoUrl: jenis === 'paket' ? '' : fotoMenu(db, jenis, idRef),
    keterangan: '',
    aktif: true,
    online: true,
    urutan: db.semua('Menu').length,
    ...isian,
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

/** Cara promo khusus produk dihitung (promo.berlaku). */
export const BERLAKU_PROMO = { kelipatan: 'Berlaku kelipatan', sekali: 'Sekali per pesanan' };

/**
 * Promo khusus produk (promo.idMenu terisi): hitung dari item menu itu saja.
 * Mengembalikan {galat} atau {dasar, jumlah, kali, kena}: dasar = nilai belanja produk itu (termasuk pilihan
 * tambahan), kali = berapa kali potongan diberikan, kena = jumlah item yang mendapat diskon persen.
 * Kelipatan: tiap minJumlah item dapat potongan (min. 2: beli 2 -> 1x, beli 5 -> 2x). Sekali: 1x per pesanan.
 * Sama dengan Penjualan::dasarPromo di server.
 */
export function dasarPromo(promo, item = [], namaProduk = 'produk promo') {
  const milik = (Array.isArray(item) ? item : []).filter((i) => i && i.idMenu && i.idMenu === promo.idMenu);
  const jumlah = milik.reduce((j, i) => j + (Number(i.jumlah) || 0), 0);
  const dasar = milik.reduce((j, i) => j + (Number(i.harga) || 0) * (Number(i.jumlah) || 0), 0);
  const min = Math.max(1, Math.floor(Number(promo.minJumlah) || 1));
  if (!jumlah) return { galat: `Kode promo ini khusus untuk ${namaProduk}.` };
  if (jumlah < min) return { galat: `Promo ini berlaku untuk pembelian minimal ${min} ${namaProduk}.` };
  const kali = promo.berlaku === 'sekali' ? 1 : Math.floor(jumlah / min);
  return { dasar, jumlah, kali, kena: Math.min(jumlah, kali * min) };
}

/**
 * Diskon dari satu promo (aturan sama dengan Penjualan::promo di server).
 * lama = pelanggan sudah pernah memesan; dipakai = berapa kali kode ini sudah dipakai.
 * item = isi pesanan (untuk promo khusus produk); namaProduk = nama menu promo itu (untuk pesan galat).
 */
export function hitungPromo(promo, { subtotal, item = [], namaProduk = '', lama = false, dipakai = 0, online = false, sekarang = Date.now() }) {
  const gagal = (galat) => ({ diskon: 0, galat });
  if (!promo || !promo.aktif) return gagal('Kode promo tidak ditemukan.');
  if (online && !promo.online) return gagal('Kode promo ini hanya berlaku di toko.');
  if (promo.mulai && sekarang < promo.mulai) return gagal('Promo ini belum dimulai.');
  if (promo.sampai && sekarang > promo.sampai) return gagal('Promo ini sudah berakhir.');
  if (promo.minBelanja > 0 && subtotal < promo.minBelanja) return gagal(`Minimal belanja untuk promo ini Rp ${Math.round(promo.minBelanja).toLocaleString('id-ID')}.`);
  if (promo.untuk === 'baru' && lama) return gagal('Promo ini khusus pelanggan baru.');
  if (promo.untuk === 'lama' && !lama) return gagal('Promo ini khusus pelanggan yang sudah pernah memesan.');
  if (promo.kuota > 0 && dipakai >= promo.kuota) return gagal('Kuota promo ini sudah habis.');
  const nilai = Number(promo.nilai) || 0;
  let batas = subtotal;
  let diskon;
  if (promo.idMenu) {
    const d = dasarPromo(promo, item, namaProduk || 'produk promo');
    if (d.galat) return gagal(d.galat);
    batas = Math.min(subtotal, d.dasar);
    // Persen: dari harga item yang kena promo. Rupiah: potongan dikali berapa kali promo berlaku.
    diskon = promo.jenis === 'persen' ? Math.floor(((d.dasar / d.jumlah) * d.kena * nilai) / 100) : nilai * d.kali;
  } else {
    diskon = promo.jenis === 'persen' ? Math.floor((subtotal * nilai) / 100) : nilai;
  }
  if (promo.jenis === 'persen' && promo.maksDiskon > 0) diskon = Math.min(diskon, promo.maksDiskon);
  return { diskon: Math.max(0, Math.min(batas, diskon)), galat: '' };
}

export function cariPromo(db, kode) {
  const k = String(kode || '').trim().toUpperCase();
  return k ? db.semua('Promo', (p) => String(p.kode || '').trim().toUpperCase() === k)[0] || null : null;
}

/**
 * Syarat promo khusus produk untuk ditampilkan, mis. "Paket MIX · tiap beli 2 (kelipatan)" atau
 * "Paket MIX · min. beli 2, sekali per pesanan". '' bila promo untuk seluruh belanja.
 */
export function syaratPromoProduk(produk, { minJumlah = 1, berlaku = 'kelipatan' } = {}) {
  if (!produk) return '';
  const min = Math.max(1, Math.floor(Number(minJumlah) || 1));
  if (berlaku === 'sekali') return `${produk} · ${min > 1 ? `min. beli ${min}, ` : ''}sekali per pesanan`;
  return `${produk} · ${min > 1 ? `tiap beli ${min} (kelipatan)` : 'per item'}`;
}

/** Nama menu sasaran promo khusus produk ('' bila promo untuk seluruh belanja). */
export function namaProdukPromo(db, promo) {
  if (!promo || !promo.idMenu) return '';
  const m = db.ambil('Menu', promo.idMenu);
  return m ? m.nama : 'produk yang sudah dihapus';
}

/** Cek kode promo untuk pesanan kasir. item = isi pesanan (dipakai promo khusus produk). */
export function cekPromo(db, kode, { subtotal, item = [], idPelanggan = '', kecuali = '' }) {
  const k = String(kode || '').trim().toUpperCase();
  if (!k) return { diskon: 0, galat: '', promo: null };
  const promo = cariPromo(db, k);
  const sah = db.semua('Pesanan', (p) => pesananSah(p) && p.id !== kecuali);
  const lama = !!idPelanggan && sah.some((p) => p.idPelanggan === idPelanggan);
  const dipakai = sah.filter((p) => String(p.kodePromo || '').toUpperCase() === k).length;
  return { ...hitungPromo(promo, { subtotal, item, namaProduk: namaProdukPromo(db, promo), lama, dipakai }), promo };
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

/** Cara pesanan sampai ke pembeli. 'ojol' = ojek online (Gojek/Grab) yang dipesan pembeli sendiri, bukan oleh toko. */
export const LABEL_AMBIL = { ambil: 'Ambil sendiri', ojol: 'Ojek online (dipesan pembeli)', antar: 'Diantar toko' };

/** Cara ambil satu pesanan; pesanan manual lama ditebak dari alamat/ongkir. '' = tidak diketahui. */
export function caraAmbil(p) {
  if (p.caraAmbil && LABEL_AMBIL[p.caraAmbil]) return p.caraAmbil;
  if (p.alamat || p.ongkir) return 'antar';
  return p.jadwal > 0 ? 'ambil' : '';
}

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
 * keranjang = [{idMenu, jumlah, opsi?}] -> item pesanan dengan nama dan harga menu saat ini
 * (harga setelah diskon + pilihan tambahan).
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
    const pilih = m ? pilihOpsi(m, k.opsi) : { opsi: Array.isArray(k.opsi) ? k.opsi : [], tambah: 0 };
    const harga = k.harga !== undefined ? Number(k.harga) || 0 : hargaJual(m) + pilih.tambah;
    item.push({ idMenu: k.idMenu, nama: m ? m.nama : k.nama, harga, jumlah, ...(pilih.opsi.length ? { opsi: pilih.opsi } : {}) });
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
  const promo = cekPromo(db, kodePromo, { subtotal, item, idPelanggan: nomorHp ? idPelanggan(nomorHp) : '', kecuali });
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
  // Riwayat status untuk timeline pembeli dan kasir. Kendala dari dapur hilang saat pesanan selesai / batal.
  const riwayat = [...(Array.isArray(p.riwayat) ? p.riwayat : []), { status, waktu: Date.now() }].slice(-30);
  const baru = db.simpan('Pesanan', { ...p, status, riwayat, ...(status === 'selesai' || status === 'batal' ? { kendala: '' } : {}) });
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

/**
 * Hapus pesanan beserta pembayarannya. Stok yang terpotong pesanan ini dikembalikan.
 * Hanya admin (akun dapur) yang boleh; dipakai untuk pesanan uji coba / salah catat.
 */
export function hapusPesanan(db, idPesanan) {
  const p = db.ambil('Pesanan', idPesanan);
  if (!p) return false;
  if (peranAkun(db) !== 'dapur') throw new Error('Hanya admin yang bisa menghapus pesanan.');
  kembalikanStokPesanan(db, p);
  pembayaranPesanan(db, idPesanan).forEach((b) => db.hapus('Pembayaran', b.id));
  db.hapus('Pesanan', idPesanan);
  return true;
}

/** Aksi untuk banyak pesanan sekaligus (laporan): ubah status atau tandai lunas. */
export const AKSI_MASSAL = [
  { kunci: 'baru', label: 'Terima (Baru)' },
  { kunci: 'diproses', label: 'Diproses' },
  { kunci: 'siap', label: 'Siap diambil' },
  { kunci: 'selesai', label: 'Selesai' },
  { kunci: 'lunas-tunai', label: 'Tandai lunas · Tunai' },
  { kunci: 'lunas-transfer', label: 'Tandai lunas · Transfer/QRIS' },
  { kunci: 'batal', label: 'Batalkan' },
];

/**
 * Jalankan satu aksi untuk banyak pesanan. Pesanan yang sudah berstatus itu, sudah lunas,
 * atau batal (untuk tandai lunas) dilewati. Mengembalikan jumlah pesanan yang berubah.
 */
export function prosesMassal(db, ids, aksi) {
  let berubah = 0;
  for (const id of ids) {
    const p = db.ambil('Pesanan', id);
    if (!p) continue;
    if (aksi === 'lunas-tunai' || aksi === 'lunas-transfer') {
      if (p.status === 'batal' || statusBayar(db, id).lunas) continue;
      if (aksi === 'lunas-tunai') bayarTunai(db, p, p.total);
      else bayarTransfer(db, p);
      berubah += 1;
    } else if (STATUS_PESANAN[aksi] && aksi !== 'menunggu' && p.status !== aksi) {
      ubahStatusPesanan(db, id, aksi);
      berubah += 1;
    }
  }
  return berubah;
}

/** Pesan kendala dari dapur untuk pembeli (mis. bahan habis, pesanan mundur). '' = kendala selesai. */
export function aturKendala(db, idPesanan, teks) {
  const p = db.ambil('Pesanan', idPesanan);
  if (!p) return null;
  return db.simpan('Pesanan', { ...p, kendala: String(teks || '').trim().slice(0, 300) });
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

const SEHARI_MS = 24 * 60 * 60 * 1000;

/** Awal hari ke-n dari hari ini (n negatif = hari sebelumnya), waktu setempat. */
function awalHariKe(n, sekarang = Date.now()) {
  const d = new Date(awalHari(sekarang));
  d.setDate(d.getDate() + n);
  return d.getTime();
}

/**
 * Tren penjualan `hari` hari terakhir (termasuk hari ini) untuk beranda kasir:
 * pemasukan per hari (pembayaran lunas), jumlah pesanan, rata-rata per pesanan, menu favorit,
 * dan pembanding periode sebelumnya yang sama panjang.
 */
export function trenPenjualan(db, { hari = 7, sekarang = Date.now() } = {}) {
  const perHari = Array.from({ length: hari }, (_, i) => ({ mulai: awalHariKe(i - hari + 1, sekarang), pemasukan: 0, pesanan: 0 }));
  const mulai = perHari[0].mulai;
  const mulaiSebelum = awalHariKe(-2 * hari + 1, sekarang);
  const indeks = (ts) => {
    for (let i = perHari.length - 1; i >= 0; i--) if (ts >= perHari[i].mulai) return i;
    return -1;
  };
  let pemasukanSebelum = 0;
  for (const b of db.semua('Pembayaran', (x) => x.status === 'lunas')) {
    const t = b.lunasPada || b.waktu || 0;
    const n = Number(b.jumlah) || 0;
    if (t >= mulai) perHari[indeks(t)].pemasukan += n;
    else if (t >= mulaiSebelum) pemasukanSebelum += n;
  }
  const favorit = new Map();
  let jumlahPesanan = 0;
  let pesananSebelum = 0;
  for (const p of db.semua('Pesanan', pesananSah)) {
    const t = p.waktu || 0;
    if (t < mulai) {
      if (t >= mulaiSebelum) pesananSebelum += 1;
      continue;
    }
    jumlahPesanan += 1;
    perHari[indeks(t)].pesanan += 1;
    for (const i of Array.isArray(p.item) ? p.item : []) {
      const kunci = i.idMenu || 'lain:' + i.nama;
      const x = favorit.get(kunci) || { nama: i.nama || 'Tanpa nama', jumlah: 0, omzet: 0 };
      x.jumlah += Number(i.jumlah) || 0;
      x.omzet += (Number(i.harga) || 0) * (Number(i.jumlah) || 0);
      favorit.set(kunci, x);
    }
  }
  const pemasukan = perHari.reduce((j, h) => j + h.pemasukan, 0);
  const belum = db.semua('Pesanan', (p) => p.status !== 'batal' && (p.waktu || 0) >= mulai && !statusBayar(db, p.id).lunas);
  return {
    perHari,
    pemasukan,
    pemasukanSebelum,
    jumlahPesanan,
    pesananSebelum,
    rataRata: jumlahPesanan ? Math.round(pemasukan / jumlahPesanan) : 0,
    favorit: [...favorit.values()].sort((a, b) => b.jumlah - a.jumlah || b.omzet - a.omzet).slice(0, 5),
    belumBayar: { jumlah: belum.length, nilai: belum.reduce((j, p) => j + (Number(p.total) || 0), 0) },
  };
}

/**
 * Pesanan yang perlu ditindaklanjuti kasir, dikelompokkan dan diurutkan (jadwal ambil terdekat dulu).
 * konfirmasi: pembeli sudah kirim bukti bayar, belum ditandai lunas. tagih: belum bayar.
 * baru: diterima, belum diproses. diproses. siap: siap diambil, belum selesai.
 */
export function pesananFollowUp(db) {
  const grup = { konfirmasi: [], tagih: [], baru: [], diproses: [], siap: [] };
  for (const p of db.semua('Pesanan', (x) => !['selesai', 'batal'].includes(x.status))) {
    const lunas = statusBayar(db, p.id).lunas;
    if (p.status === 'menunggu') grup[p.buktiPada && !lunas ? 'konfirmasi' : 'tagih'].push(p);
    else if (grup[p.status]) grup[p.status].push(p);
  }
  const urut = (a, b) => (a.jadwal > 0 ? a.jadwal : Infinity) - (b.jadwal > 0 ? b.jadwal : Infinity) || (a.waktu || 0) - (b.waktu || 0);
  for (const daftar of Object.values(grup)) daftar.sort(urut);
  return grup;
}

// ---------- Toko online (link pemesanan) ----------

export const ID_TOKO = 'stl_toko';

// ---------- Banner & header ----------

export const WARNA_BANNER = {
  hijau: { latar: '#e8f4df', tinta: '#1f4d14' },
  kuning: { latar: '#fff3cf', tinta: '#5c4300' },
  krem: { latar: '#f7efe3', tinta: '#4a3523' },
  putih: { latar: '#ffffff', tinta: '#1f2d1a' },
  tua: { latar: '#2f5d22', tinta: '#ffffff' },
};
export const AKSI_BANNER = { '': 'Tanpa tombol', menu: 'Buka menu', kategori: 'Buka kategori', promo: 'Pakai kode promo', wa: 'Chat WhatsApp toko', link: 'Buka link' };

/** Banner urut tampil. tampilDi: 'etalase' | 'kasir' | '' (semua, untuk admin). */
export function daftarBanner(db, { tampilDi = '', hanyaAktif = false } = {}) {
  return db
    .semua('Banner', (b) => (!hanyaAktif || b.aktif) && (!tampilDi || !b.tampilDi || b.tampilDi === 'semua' || b.tampilDi === tampilDi))
    .sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || String(a.judul || '').localeCompare(String(b.judul || '')));
}

/** Banner tanpa judul dan teks = gambar saja (gambar penuh, tanpa tulisan). */
export const bannerGambarSaja = (b) => !String(b.judul || '').trim() && !String(b.teks || '').trim();

/** Simpan banner: berjudul, atau tanpa judul dan teks sama sekali tetapi ada gambarnya (gambar saja). */
export function simpanBanner(db, data) {
  const judul = String(data.judul || '').trim().slice(0, 60);
  const teks = String(data.teks || '').trim();
  const lama = data.id ? db.ambil('Banner', data.id) : null;
  const foto = data.foto;
  const adaFoto = foto !== undefined ? !!foto : !!(lama && (lama.fotoLokal || lama.fotoUrl));
  if (!judul && teks) throw new Error('Isi judul banner, atau kosongkan teks untuk banner gambar saja.');
  if (!judul && !adaFoto) throw new Error('Isi judul banner, atau pilih gambar (900 × 360 px) untuk banner gambar saja.');
  return db.simpan('Banner', {
    ...(lama || { urutan: daftarBanner(db).length, aktif: true }),
    ...(data.id ? { id: data.id } : {}),
    judul,
    teks: String(data.teks || '').trim().slice(0, 160),
    warna: WARNA_BANNER[data.warna] ? data.warna : 'hijau',
    tombol: String(data.tombol || '').trim().slice(0, 30),
    aksi: data.aksi in AKSI_BANNER ? data.aksi : '',
    nilai: String(data.nilai || '').trim().slice(0, 300),
    tampilDi: ['etalase', 'kasir', 'semua'].includes(data.tampilDi) ? data.tampilDi : 'etalase',
    aktif: data.aktif === undefined ? (lama ? !!lama.aktif : true) : !!data.aktif,
    ...(foto !== undefined && foto !== ((lama && (lama.fotoLokal || lama.fotoUrl)) || '') ? { fotoLokal: foto || '', fotoUrl: '' } : {}),
  });
}

/** Geser urutan banner (arah -1 naik, +1 turun). */
export function geserBanner(db, id, arah) {
  const daftar = daftarBanner(db);
  const i = daftar.findIndex((b) => b.id === id);
  const j = i + arah;
  if (i < 0 || j < 0 || j >= daftar.length) return;
  [daftar[i], daftar[j]] = [daftar[j], daftar[i]];
  daftar.forEach((b, n) => Number(b.urutan) !== n && db.simpan('Banner', { ...b, urutan: n }));
}

/** Foto header: 'etalase' atau 'kasir' (data lokal sebelum terunggah, lalu tautan di server). */
export function fotoHeader(db, untuk = 'etalase') {
  const t = ambilToko(db);
  return untuk === 'kasir' ? t.headerKasirLokal || t.headerKasirUrl || '' : t.headerLokal || t.headerUrl || '';
}

export function simpanFotoHeader(db, untuk, foto) {
  return simpanToko(db, untuk === 'kasir' ? { headerKasirLokal: foto || '', headerKasirUrl: '' } : { headerLokal: foto || '', headerUrl: '' });
}

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
/**
 * Alamat toko untuk pembeli = halaman depan situs. Tanpa token: toko utama (halaman depan).
 * Dengan token: link khusus toko ini (tetap berlaku walau ada toko lain di server yang sama).
 */
export function tautanToko(token = '', scriptUrl = '') {
  const tetap = (globalThis.window && window.APP_CONFIG && window.APP_CONFIG.scriptUrl) || '';
  const dasar = (location.origin + location.pathname).replace(/index\.html$/, '').replace(/admin\/?$/, '');
  const u = tetap || !scriptUrl ? '' : `?u=${encodeURIComponent(scriptUrl)}`;
  if (!token) return dasar + (u ? '#/' + u : '');
  return `${dasar}#/pesan/${token}` + u;
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
  cekPromo: (url, token, isi, opsi) => panggilApi(url, { aksi: 'cekPromo', token, ...isi }, opsi),
  status: (url, token, idPesanan, opsi) => panggilApi(url, { aksi: 'statusPesanan', token, idPesanan }, opsi),
  bukti: (url, token, idPesanan, opsi) => panggilApi(url, { aksi: 'kirimBukti', token, idPesanan }, opsi),
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
