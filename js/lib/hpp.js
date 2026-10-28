// Hitungan biaya (HPP), harga jual, margin, titik impas (BEP), dan target penjualan.

import { biayaTakaran } from './units.js';

/**
 * Biaya bahan satu eksperimen.
 * @param {Array} baris   baris BahanEksperimen {idBahan, jumlah, satuan}
 * @param {Object} bahanById   {idBahan: bahan}
 * @param {Object} konversiByBahan   {idBahan: [{satuan, nilai}]}
 */
export function biayaEksperimen(baris, bahanById, konversiByBahan = {}) {
  const rincian = baris.map((b) => {
    const bahan = bahanById[b.idBahan];
    const biaya = bahan ? biayaTakaran(bahan, konversiByBahan[b.idBahan] || [], b.jumlah, b.satuan) : NaN;
    return { ...b, bahan, biaya };
  });
  const total = rincian.reduce((jml, r) => jml + (Number.isFinite(r.biaya) ? r.biaya : 0), 0);
  const bermasalah = rincian.filter((r) => !Number.isFinite(r.biaya));
  return { rincian, total, bermasalah };
}

/**
 * HPP resep per porsi (tab "HPP Resep"). Semua dibawa ke per 1 porsi:
 *   1. bahan resep ÷ jumlah porsi
 *   2. biaya sekali masak (dihitungPer 'resep': gas, tenaga) ÷ jumlah porsi
 *   3. biaya per porsi (dihitungPer 'porsi': seasoning, label)
 *   4. packing (dihitungPer 'packing', per porsi). Dipisah supaya tidak terhitung dua kali
 *      saat resep ini dipakai di resep lain atau di paket.
 * HPP per porsi = 1 + 2 + 3 + 4; tanpaPacking = 1 + 2 + 3.
 * biayaResepLain (opsional): biaya resep lain untuk satu kali masak, ikut dibagi porsi (dipakai data lama).
 */
export function hitungHPP({ biayaBahan = 0, biayaResepLain = 0, biayaLain = [], porsi = 1 }) {
  const lain = biayaLain.map((b) => {
    const nilai = Number(b.nilai);
    const perPorsi = b.dihitungPer === 'porsi' || b.dihitungPer === 'packing';
    return { ...b, total: perPorsi ? nilai * porsi : nilai, perPorsi: perPorsi ? nilai : porsi > 0 ? nilai / porsi : NaN };
  });
  const jumlah = (daftar, kunci = 'total') => daftar.reduce((jml, b) => jml + (Number.isFinite(b[kunci]) ? b[kunci] : 0), 0);
  const per = (jenis) => lain.filter((b) => (b.dihitungPer === 'porsi' || b.dihitungPer === 'packing' ? b.dihitungPer : 'resep') === jenis);
  const totalLain = jumlah(lain);
  const totalLainResep = jumlah(per('resep'));
  const totalResep = biayaBahan + biayaResepLain + totalLain;
  const bagi = (n) => (porsi > 0 ? n / porsi : NaN);
  const adaPorsi = (n) => (porsi > 0 ? n : NaN);
  const alur = {
    bahan: bagi(biayaBahan + biayaResepLain),
    biayaResep: bagi(totalLainResep),
    biayaPorsi: adaPorsi(jumlah(per('porsi'), 'perPorsi')),
    packing: adaPorsi(jumlah(per('packing'), 'perPorsi')),
  };
  const tanpaPacking = alur.bahan + alur.biayaResep + alur.biayaPorsi;
  const hppPorsi = bagi(totalResep);
  return { biayaBahan, biayaResepLain, lain, totalLain, totalLainResep, totalResep, hppPorsi, tanpaPacking, packingPorsi: alur.packing, alur, porsi };
}

/**
 * HPP satu paket (mis. nasi + minuman + kue dalam satu kotak).
 * isi: [{biayaProduksi, jumlah}]  HPP per porsi tiap resep tanpa packing, dan jumlah porsinya.
 * biayaPaket: [{jenis, nilai}]    biaya sekali per paket (kotak, label, ongkir), dihitung satu kali saja.
 */
export function hitungPaket({ isi = [], biayaPaket = [] }) {
  const rincian = isi.map((i) => {
    const jumlah = Number(i.jumlah) || 0;
    return { ...i, jumlah, total: Number(i.biayaProduksi) * jumlah };
  });
  const totalIsi = rincian.reduce((jml, i) => jml + (Number.isFinite(i.total) ? i.total : 0), 0);
  const totalBiaya = biayaPaket.reduce((jml, b) => jml + (Number.isFinite(Number(b.nilai)) ? Number(b.nilai) : 0), 0);
  return { rincian, totalIsi, totalBiaya, hppPaket: totalIsi + totalBiaya, bermasalah: rincian.filter((i) => !Number.isFinite(i.total)) };
}

/** Harga jual minimum agar margin tercapai: HPP / (1 - margin). */
export function hargaMinimum(hppPorsi, marginPersen) {
  if (!(marginPersen >= 0 && marginPersen < 100)) return NaN;
  return hppPorsi / (1 - marginPersen / 100);
}

/**
 * Dari harga yang Anda inginkan: margin (laba ÷ harga jual) dan markup (laba ÷ HPP).
 * Contoh HPP 5.000, harga 7.000: laba 2.000, margin 28,6%, markup 40%.
 */
export function marginDariHarga(hpp, hargaJual) {
  const laba = hargaJual - hpp;
  return {
    laba,
    marginPersen: hargaJual > 0 ? (laba / hargaJual) * 100 : NaN,
    markupPersen: hpp > 0 && hargaJual > 0 ? (laba / hpp) * 100 : NaN,
  };
}

/** Bulatkan ke atas ke kelipatan harga yang rapi (default Rp 500). */
export function bulatkanHarga(harga, kelipatan = 500) {
  if (!Number.isFinite(harga)) return NaN;
  return Math.ceil(harga / kelipatan - 1e-9) * kelipatan;
}

/**
 * Margin nyata, laba, BEP, dan target penjualan.
 * - margin = (harga - HPP) / harga
 * - BEP    = modal awal / laba per porsi (dibulatkan ke atas)
 * - target = laba bulanan yang diinginkan / laba per porsi
 */
export function analisisPenjualan({
  hppPorsi,
  hargaJual,
  porsiPerResep = 1,
  modalAwal = 0,
  labaTargetBulanan = 0,
  hariPerBulan = 30,
}) {
  const labaPorsi = hargaJual - hppPorsi;
  const untung = hargaJual > 0 && labaPorsi > 0;
  const marginPersen = hargaJual > 0 ? (labaPorsi / hargaJual) * 100 : NaN;
  const bepPorsi = untung && modalAwal > 0 ? Math.ceil(modalAwal / labaPorsi - 1e-9) : null;
  const porsiBulan = untung && labaTargetBulanan > 0 ? Math.ceil(labaTargetBulanan / labaPorsi - 1e-9) : null;
  return {
    labaPorsi,
    untung,
    marginPersen,
    bepPorsi,
    bepResep: bepPorsi && porsiPerResep > 0 ? Math.ceil(bepPorsi / porsiPerResep - 1e-9) : null,
    porsiBulan,
    resepBulan: porsiBulan && porsiPerResep > 0 ? Math.ceil(porsiBulan / porsiPerResep - 1e-9) : null,
    porsiHari: porsiBulan ? Math.ceil(porsiBulan / hariPerBulan - 1e-9) : null,
    omzetBulan: porsiBulan ? porsiBulan * hargaJual : null,
  };
}
