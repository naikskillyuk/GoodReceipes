// Konversi satuan bahan.
//
// Bahan dibeli dalam satu satuan (mis. 1 kg), tetapi dipakai di resep dalam satuan
// lain (gram, sdm, sdt, butir). Semua hitungan memakai "satuan dasar":
//   g   -> bahan padat (dibeli kg/g)
//   ml  -> bahan cair  (dibeli liter/ml)
//   pcs -> bahan hitungan (dibeli butir/buah/lembar/...)
// Harga disimpan sebagai harga per satuan dasar, lalu dikalikan jumlah resep.

export const SATUAN_BELI = [
  { kode: 'kg', label: 'kg', dasar: 'g', faktor: 1000 },
  { kode: 'g', label: 'gram', dasar: 'g', faktor: 1 },
  { kode: 'l', label: 'liter', dasar: 'ml', faktor: 1000 },
  { kode: 'ml', label: 'ml', dasar: 'ml', faktor: 1 },
  { kode: 'butir', label: 'butir', dasar: 'pcs', faktor: 1 },
  { kode: 'buah', label: 'buah', dasar: 'pcs', faktor: 1 },
  { kode: 'lembar', label: 'lembar', dasar: 'pcs', faktor: 1 },
  { kode: 'bungkus', label: 'bungkus', dasar: 'pcs', faktor: 1 },
  { kode: 'siung', label: 'siung', dasar: 'pcs', faktor: 1 },
  { kode: 'batang', label: 'batang', dasar: 'pcs', faktor: 1 },
];

// Satuan resep standar untuk tiap satuan dasar (nilai = berapa satuan dasar).
const STANDAR = {
  g: { g: 1, kg: 1000 },
  ml: { ml: 1, l: 1000, sdm: 15, sdt: 5, cup: 240 },
  pcs: {},
};

export function infoSatuanBeli(kode) {
  return SATUAN_BELI.find((s) => s.kode === kode) || SATUAN_BELI[1];
}

/** 'g' | 'ml' | 'pcs' */
export function satuanDasar(bahan) {
  return infoSatuanBeli(bahan.satuanBeli).dasar;
}

/** Teks satuan dasar untuk tampilan: "g", "ml", atau nama hitungan ("butir"). */
export function labelDasar(bahan) {
  const d = satuanDasar(bahan);
  return d === 'pcs' ? bahan.satuanBeli : d;
}

/** Harga untuk 1 satuan dasar (mis. Rp per gram). */
export function hargaPerDasar(bahan) {
  const info = infoSatuanBeli(bahan.satuanBeli);
  const isi = Number(bahan.isiKemasan) * info.faktor;
  const harga = Number(bahan.hargaBeli);
  if (!(isi > 0) || !Number.isFinite(harga)) return NaN;
  return harga / isi;
}

/**
 * Tabel satuan resep -> jumlah satuan dasar, untuk satu bahan.
 * `konversi` = [{ satuan: 'sdm', nilai: 6 }] artinya 1 sdm = 6 satuan dasar.
 * Konversi buatan sendiri menimpa yang standar.
 */
export function tabelKonversi(bahan, konversi = []) {
  const dasar = satuanDasar(bahan);
  const tabel = { ...STANDAR[dasar] };
  if (dasar === 'pcs') tabel[bahan.satuanBeli] = 1;
  for (const k of konversi) {
    const nilai = Number(k.nilai);
    if (k.satuan && nilai > 0) tabel[String(k.satuan).trim().toLowerCase()] = nilai;
  }
  return tabel;
}

/** Daftar satuan yang bisa dipilih di resep, urut: satuan dasar, standar, lalu buatan sendiri. */
export function satuanResep(bahan, konversi = []) {
  return Object.keys(tabelKonversi(bahan, konversi));
}

/** Jumlah resep -> satuan dasar. NaN bila satuan tidak dikenal. */
export function keDasar(bahan, konversi, jumlah, satuan) {
  const faktor = tabelKonversi(bahan, konversi)[String(satuan).trim().toLowerCase()];
  if (!(faktor > 0)) return NaN;
  return Number(jumlah) * faktor;
}

/** Biaya sejumlah takaran resep. NaN bila harga/satuan tidak valid. */
export function biayaTakaran(bahan, konversi, jumlah, satuan) {
  return keDasar(bahan, konversi, jumlah, satuan) * hargaPerDasar(bahan);
}

/** Harga untuk 1 satuan resep (mis. 1 butir telur = Rp 1.650). */
export function hargaPerSatuanResep(bahan, konversi, satuan) {
  return biayaTakaran(bahan, konversi, 1, satuan);
}

/** Contoh tampilan: "1 sdm = 6 g". */
export function teksKonversi(bahan, satuan, nilai) {
  return `1 ${satuan} = ${String(Math.round(nilai * 100) / 100).replace('.', ',')} ${labelDasar(bahan)}`;
}
