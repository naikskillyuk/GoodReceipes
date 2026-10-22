// Penilaian eksperimen: skala 1-10 untuk lima aspek.

export const ASPEK = [
  { kunci: 'rasa', label: 'Rasa' },
  { kunci: 'tekstur', label: 'Tekstur' },
  { kunci: 'tampilan', label: 'Tampilan' },
  { kunci: 'aroma', label: 'Aroma' },
  { kunci: 'minatBeli', label: 'Minat beli' },
];

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
