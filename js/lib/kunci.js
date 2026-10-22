// Kunci aplikasi: kata sandi pemilik untuk membuka aplikasi di perangkat ini.
//
// Yang dilindungi adalah tampilan aplikasi (mis. saat HP dipinjam). Kata sandi hanya ada di perangkat
// dan tidak ikut ke Spreadsheet atau berkas cadangan. Data di perangkat tidak dienkripsi, dan
// perlindungan data di Google tetap kunci Apps Script.
// Kata sandi disimpan sebagai hash PBKDF2-SHA256 dengan garam acak, tidak pernah sebagai teks.

export const ITERASI_BAWAAN = 150000;
export const PANJANG_MINIMAL = 6;
export const PANJANG_MAKSIMAL = 100;

export function tersedia() {
  return !!(globalThis.crypto && globalThis.crypto.subtle);
}

const enc = new TextEncoder();
const keHex = (buf) => Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
const dariHex = (h) => Uint8Array.from((String(h).match(/../g) || []).map((x) => parseInt(x, 16)));

async function turunkan(teks, garam, iterasi) {
  const bahan = await globalThis.crypto.subtle.importKey('raw', enc.encode(String(teks).normalize('NFKC')), 'PBKDF2', false, ['deriveBits']);
  return new Uint8Array(await globalThis.crypto.subtle.deriveBits({ name: 'PBKDF2', hash: 'SHA-256', salt: garam, iterations: iterasi }, bahan, 256));
}

/** Pesan galat bila kata sandi tidak memenuhi syarat, atau '' bila sah. */
export function validasiKataSandi(teks) {
  const t = String(teks || '');
  if (t.length < PANJANG_MINIMAL) return `Kata sandi minimal ${PANJANG_MINIMAL} karakter.`;
  if (t.length > PANJANG_MAKSIMAL) return `Kata sandi maksimal ${PANJANG_MAKSIMAL} karakter.`;
  if (!t.trim()) return 'Kata sandi tidak boleh hanya spasi.';
  return '';
}

/** Buat catatan kata sandi {garam, hash, iterasi} untuk disimpan. */
export async function buatKataSandi(teks, iterasi = ITERASI_BAWAAN) {
  if (!tersedia()) throw new Error('Kata sandi membutuhkan koneksi aman (HTTPS) atau localhost.');
  const galat = validasiKataSandi(teks);
  if (galat) throw new Error(galat);
  const garam = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const hash = await turunkan(teks, garam, iterasi);
  return { garam: keHex(garam), hash: keHex(hash), iterasi };
}

/** Cocokkan kata sandi dengan catatan tersimpan. Pembandingan tidak berhenti di selisih pertama. */
export async function cocokKataSandi(teks, catatan) {
  if (!tersedia() || !catatan || !catatan.hash || !catatan.garam || !(catatan.iterasi > 0)) return false;
  const hasil = await turunkan(teks, dariHex(catatan.garam), catatan.iterasi);
  const target = dariHex(catatan.hash);
  if (hasil.length !== target.length) return false;
  let selisih = 0;
  for (let i = 0; i < hasil.length; i++) selisih |= hasil[i] ^ target[i];
  return selisih === 0;
}

/** Apakah sesi masuk masih berlaku? batasMenit 0 = tanpa batas waktu (berakhir saat sesi browser berakhir). */
export function sesiMasihBerlaku({ terakhir, batasMenit, sekarang = Date.now() }) {
  if (!terakhir) return false;
  if (!batasMenit) return true;
  return sekarang - terakhir < batasMenit * 60000;
}

/**
 * Pembatas percobaan salah: dua kali pertama tanpa jeda, lalu jeda 1, 2, 4, ... detik (maksimal 30 detik).
 * Disimpan di penyimpanan browser agar memuat ulang halaman tidak mengulang dari nol.
 */
export function buatPembatas(penyimpanan, { kunci = 'resep-percobaan', sekarang = () => Date.now() } = {}) {
  const baca = () => {
    try {
      const d = JSON.parse(penyimpanan.getItem(kunci) || 'null');
      return d && Number.isFinite(d.n) && Number.isFinite(d.sampai) ? d : { n: 0, sampai: 0 };
    } catch {
      return { n: 0, sampai: 0 };
    }
  };
  const tulis = (d) => {
    try {
      penyimpanan.setItem(kunci, JSON.stringify(d));
    } catch {
      /* penyimpanan penuh atau diblokir: pembatas tetap berlaku selama halaman terbuka */
      memori = d;
    }
  };
  let memori = null;
  const ambil = () => memori || baca();
  return {
    sisaMs() {
      return Math.max(0, ambil().sampai - sekarang());
    },
    gagal() {
      const d = ambil();
      const n = d.n + 1;
      const jeda = n < 3 ? 0 : Math.min(30000, 1000 * 2 ** (n - 3));
      tulis({ n, sampai: sekarang() + jeda });
      return jeda;
    },
    berhasil() {
      memori = null;
      try {
        penyimpanan.removeItem(kunci);
      } catch {
        /* abaikan */
      }
    },
  };
}

/**
 * Catatan sesi masuk: waktu terakhir aplikasi dipakai, disimpan di sessionStorage
 * (hilang saat tab atau aplikasi ditutup). Tetap jalan di memori bila penyimpanan browser ditolak.
 */
export function buatSesi(penyimpanan, { kunci = 'resep-sesi', sekarang = () => Date.now() } = {}) {
  let memori = 0;
  return {
    terakhir() {
      try {
        const n = Number(penyimpanan.getItem(kunci));
        return Number.isFinite(n) && n > 0 ? n : memori;
      } catch {
        return memori;
      }
    },
    /** Catat bahwa aplikasi baru saja dipakai. Penulisan dibatasi agar tidak berat saat menggulir. */
    sentuh({ paksa = false } = {}) {
      const t = sekarang();
      if (!paksa && memori && t - memori < 5000) return;
      memori = t;
      try {
        penyimpanan.setItem(kunci, String(t));
      } catch {
        /* abaikan */
      }
    },
    akhiri() {
      memori = 0;
      try {
        penyimpanan.removeItem(kunci);
      } catch {
        /* abaikan */
      }
    },
  };
}
