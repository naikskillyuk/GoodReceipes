// Penilaian eksperimen: skala 1-10 untuk lima aspek.

export const ASPEK = [
  { kunci: 'rasa', label: 'Rasa' },
  { kunci: 'tekstur', label: 'Tekstur' },
  { kunci: 'tampilan', label: 'Tampilan' },
  { kunci: 'aroma', label: 'Aroma' },
  { kunci: 'minatBeli', label: 'Minat beli' },
];

/** Contoh petunjuk per aspek, dipakai sebagai placeholder. */
export const CONTOH_PANDUAN = {
  umum: 'mis. Dicicipi selagi hangat. Ini untuk camilan anak sekolah.',
  rasa: 'mis. Jangan terlalu asin, manisnya pas',
  tekstur: 'mis. Harus kriuk dan kering, tidak berminyak',
  tampilan: 'mis. Warna cokelat keemasan merata',
  aroma: 'mis. Wangi mentega, tidak bau gosong',
  minatBeli: 'mis. Mau beli kalau harganya Rp 8.000?',
};

export const BATAS_PANDUAN = { umum: 500, aspek: 200, catatanChef: 1000 };

/** Petunjuk penilaian yang rapi: hanya kunci yang dikenal, berupa teks, dan dipotong sesuai batas. */
export function bacaPanduan(v) {
  const sumber = v && typeof v === 'object' ? v : {};
  const keluar = {};
  for (const kunci of ['umum', ...ASPEK.map((a) => a.kunci)]) {
    const teks = typeof sumber[kunci] === 'string' ? sumber[kunci].trim() : '';
    if (teks) keluar[kunci] = teks.slice(0, kunci === 'umum' ? BATAS_PANDUAN.umum : BATAS_PANDUAN.aspek);
  }
  return keluar;
}

function rata(angka) {
  const sah = angka.filter((x) => Number.isFinite(x));
  return sah.length ? sah.reduce((a, b) => a + b, 0) / sah.length : NaN;
}

/** Rata-rata satu orang penilai atas kelima aspek. */
export function skorPenilaian(p) {
  return rata(ASPEK.map((a) => Number(p[a.kunci])));
}

/**
 * Ringkasan satu eksperimen dari daftar penilaian.
 * rata = rata-rata semua penilai; perAspek = rata-rata tiap aspek.
 */
export function skorEksperimen(daftar) {
  const perAspek = {};
  for (const a of ASPEK) perAspek[a.kunci] = rata(daftar.map((p) => Number(p[a.kunci])));
  return {
    jumlah: daftar.length,
    rata: rata(daftar.map(skorPenilaian)),
    perAspek,
  };
}

/** Pastikan angka penilaian bulat 1-10. */
export function sahkanNilai(n) {
  const x = Math.round(Number(n));
  return Number.isFinite(x) ? Math.min(10, Math.max(1, x)) : NaN;
}
