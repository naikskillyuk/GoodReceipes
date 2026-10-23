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
 * HPP per resep dan per porsi.
 * biayaLain: [{jenis, nilai, dihitungPer: 'resep' | 'porsi'}]
 * biayaResepLain: total biaya resep tambahan (resep lain yang dipakai sebagai komponen), per resep.
 */
export function hitungHPP({ biayaBahan = 0, biayaResepLain = 0, biayaLain = [], porsi = 1 }) {
  const lain = biayaLain.map((b) => ({
    ...b,
    total: b.dihitungPer === 'porsi' ? Number(b.nilai) * porsi : Number(b.nilai),
  }));
  const totalLain = lain.reduce((jml, b) => jml + (Number.isFinite(b.total) ? b.total : 0), 0);
  const totalResep = biayaBahan + biayaResepLain + totalLain;
  const hppPorsi = porsi > 0 ? totalResep / porsi : NaN;
  return { biayaBahan, biayaResepLain, lain, totalLain, totalResep, hppPorsi, porsi };
}

/** Harga jual minimum agar margin tercapai: HPP / (1 - margin). */
export function hargaMinimum(hppPorsi, marginPersen) {
  if (!(marginPersen >= 0 && marginPersen < 100)) return NaN;
  return hppPorsi / (1 - marginPersen / 100);
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
