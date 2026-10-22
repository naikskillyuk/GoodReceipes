// Fungsi bantu umum: id, format angka Indonesia, tanggal.

const ALFABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

export function acak(panjang = 8) {
  const b = new Uint8Array(panjang);
  globalThis.crypto.getRandomValues(b);
  return Array.from(b, (x) => ALFABET[x % ALFABET.length]).join('');
}

/** Id unik, contoh: "res_lq3k9a1x7f2b9c4d". */
export function buatId(awalan) {
  return `${awalan}_${Date.now().toString(36)}${acak(8)}`;
}

/** Token acak untuk tautan penilaian (sulit ditebak). */
export function buatToken() {
  return acak(16);
}

/** 12345.6 -> "12.346" (pemisah ribuan titik, desimal koma). */
export function angka(n, desimal = 0) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '–';
  const neg = n < 0 && Number(Math.abs(n).toFixed(desimal)) !== 0;
  const [bulat, pecah] = Math.abs(n).toFixed(desimal).split('.');
  const ribuan = bulat.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (neg ? '−' : '') + ribuan + (pecah ? ',' + pecah : '');
}

/** 4603.75 -> "Rp 4.604"; -360 -> "−Rp 360". */
export function rupiah(n) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '–';
  const bulat = Math.round(n);
  const teks = angka(Math.abs(bulat));
  return (bulat < 0 ? '−' : '') + 'Rp ' + teks;
}

/** 8.4 -> "8,4" */
export function desimal1(n) {
  return angka(n, 1);
}

export function persen(n, desimal = 1) {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '–';
  return angka(n, desimal) + '%';
}

const BULAN = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];

/** 1760000000000 -> "9 Okt 2025" */
export function tanggal(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  return `${d.getDate()} ${BULAN[d.getMonth()]} ${d.getFullYear()}`;
}

/** Hanya angka bulat: "Rp 45.000" -> 45000. Kosong -> 0. */
export function bacaRupiah(teks) {
  const digit = String(teks ?? '').replace(/[^\d]/g, '');
  return digit ? Number(digit) : 0;
}

/** Jumlah takaran, boleh koma atau titik desimal: "1,5" / "1.5" -> 1.5. Salah -> NaN. */
export function bacaJumlah(teks) {
  const t = String(teks ?? '').trim().replace(',', '.');
  if (t === '') return NaN;
  return /^\d*\.?\d*$/.test(t) ? Number(t) : NaN;
}

/** Tampilkan jumlah tanpa nol berlebih: 1.5 -> "1,5", 80 -> "80". */
export function tampilJumlah(n) {
  if (!Number.isFinite(n)) return '';
  return String(Math.round(n * 100) / 100).replace('.', ',');
}

export function batasi(n, min, maks) {
  return Math.min(maks, Math.max(min, n));
}
