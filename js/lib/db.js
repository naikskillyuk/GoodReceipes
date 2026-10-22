// Penyimpanan lokal (di perangkat) dengan pelacak perubahan untuk sinkronisasi.
//
// Semua data disimpan sebagai satu dokumen. Di browser dokumen ini ditulis ke IndexedDB;
// di tes dipakai penyimpanan memori. Setiap baris punya `diubah` (waktu ubah) sehingga
// sinkronisasi memakai aturan "yang terbaru menang".

import { TABEL, NAMA_TABEL, KOLOM_FOTO } from './schema.js';
import { buatId } from './util.js';

const PENGATURAN_AWAL = {
  namaPemilik: '',
  scriptUrl: '',
  kunci: '',
  sinkronOtomatis: true,
  kunciAplikasi: null, // {garam, hash, iterasi}; null = aplikasi tidak dikunci
  kunciOtomatisMenit: 15, // 0 = hanya terkunci saat aplikasi ditutup
};

function keadaanKosong() {
  const tabel = {};
  const kotor = {};
  for (const n of NAMA_TABEL) {
    tabel[n] = {};
    kotor[n] = [];
  }
  return {
    versi: 1,
    tabel,
    kotor,
    meta: { sinkronTerakhir: 0, idPerangkat: buatId('dev'), resepTerakhir: '', kategoriAwalDibuat: false },
    pengaturan: { ...PENGATURAN_AWAL },
  };
}

/** Penyimpanan di memori, untuk tes. */
export function penyimpananMemori(awal = null) {
  let isi = awal;
  return { baca: async () => isi, tulis: async (teks) => void (isi = teks) };
}

/**
 * Penyimpanan IndexedDB untuk browser.
 * Sambungan dibuka sekali dan dipakai ulang supaya penulisan saat halaman ditutup (pagehide)
 * langsung diajukan tanpa menunggu pembukaan database yang bisa keburu terputus.
 */
export function penyimpananIndexedDB(namaDb = 'eksperimen-resep') {
  let sambungan = null;
  const buka = () => {
    if (!sambungan) {
      sambungan = new Promise((ok, gagal) => {
        const req = indexedDB.open(namaDb, 1);
        req.onupgradeneeded = () => req.result.createObjectStore('kv');
        req.onsuccess = () => {
          const db = req.result;
          const lepas = () => (sambungan = null);
          db.onclose = lepas;
          db.onversionchange = () => (db.close(), lepas());
          ok(db);
        };
        req.onerror = () => {
          sambungan = null;
          gagal(req.error);
        };
      });
    }
    return sambungan;
  };
  const jalankan = async (mode, fn) => {
    const db = await buka();
    return new Promise((ok, gagal) => {
      const tx = db.transaction('kv', mode);
      const hasil = fn(tx.objectStore('kv'));
      tx.oncomplete = () => ok(hasil.result);
      tx.onerror = () => gagal(tx.error);
      tx.onabort = () => gagal(tx.error || new Error('Penyimpanan dibatalkan.'));
    });
  };
  return {
    baca: () => jalankan('readonly', (s) => s.get('keadaan')),
    tulis: (teks) => jalankan('readwrite', (s) => s.put(teks, 'keadaan')),
  };
}

export function buatDB(penyimpanan = penyimpananMemori()) {
  let k = keadaanKosong();
  const pendengar = new Set();
  let versi = 0;
  let jadwalSimpan = null;
  let jadwalKabar = null;
  let sedangMenulis = Promise.resolve();

  const kabari = () => {
    versi += 1;
    if (jadwalKabar) return;
    jadwalKabar = setTimeout(() => {
      jadwalKabar = null;
      pendengar.forEach((fn) => fn(versi));
    }, 0);
  };

  // Penulisan tidak saling menunggu: urutannya dijaga penyimpanan (transaksi IndexedDB berurutan),
  // sehingga penulisan terakhir saat halaman ditutup tetap langsung diajukan.
  const tulisSekarang = () => {
    jadwalSimpan = null;
    const teks = JSON.stringify(k);
    const ini = Promise.resolve()
      .then(() => penyimpanan.tulis(teks))
      .catch((e) => console.error('Gagal menyimpan', e));
    sedangMenulis = Promise.all([sedangMenulis, ini]).then(() => {});
    return ini;
  };

  const jadwalkanTulis = () => {
    if (jadwalSimpan) return;
    jadwalSimpan = setTimeout(tulisSekarang, 120);
  };

  const tandaiKotor = (tabel, id) => {
    if (!k.kotor[tabel].includes(id)) k.kotor[tabel].push(id);
  };

  const db = {
    /** Ambil data dari penyimpanan. Panggil sekali saat aplikasi mulai. */
    async muat() {
      const teks = await penyimpanan.baca();
      if (teks) {
        try {
          const dibaca = JSON.parse(teks);
          const dasar = keadaanKosong();
          k = {
            ...dasar,
            ...dibaca,
            tabel: { ...dasar.tabel, ...dibaca.tabel },
            kotor: { ...dasar.kotor, ...dibaca.kotor },
            meta: { ...dasar.meta, ...dibaca.meta },
            pengaturan: { ...dasar.pengaturan, ...dibaca.pengaturan },
          };
        } catch (e) {
          console.error('Data lokal rusak, memulai kosong.', e);
          k = keadaanKosong();
        }
      }
      kabari();
      return db;
    },

    get versi() {
      return versi;
    },

    /** Berlangganan perubahan. Mengembalikan fungsi untuk berhenti. */
    ubah(fn) {
      pendengar.add(fn);
      return () => pendengar.delete(fn);
    },

    semua(tabel, saring) {
      const isi = Object.values(k.tabel[tabel]).filter((r) => !r.dihapus);
      return saring ? isi.filter(saring) : isi;
    },

    ambil(tabel, id) {
      const r = k.tabel[tabel][id];
      return r && !r.dihapus ? r : null;
    },

    /** Simpan (tambah atau perbarui) satu baris. Mengembalikan baris tersimpan. */
    simpan(tabel, data, { sekarang = Date.now() } = {}) {
      const def = TABEL[tabel];
      if (!def) throw new Error(`Tabel tidak dikenal: ${tabel}`);
      const id = data.id || buatId(def.awalan);
      const lama = k.tabel[tabel][id] || {};
      const baris = { ...lama, ...data, id, dihapus: false, diubah: Math.max(sekarang, (lama.diubah || 0) + 1) };
      k.tabel[tabel][id] = baris;
      tandaiKotor(tabel, id);
      jadwalkanTulis();
      kabari();
      return baris;
    },

    /** Hapus baris (ditandai dihapus supaya perangkat lain ikut menghapus). */
    hapus(tabel, id, { sekarang = Date.now() } = {}) {
      const lama = k.tabel[tabel][id];
      if (!lama || lama.dihapus) return;
      k.tabel[tabel][id] = { ...lama, dihapus: true, diubah: Math.max(sekarang, (lama.diubah || 0) + 1) };
      tandaiKotor(tabel, id);
      jadwalkanTulis();
      kabari();
    },

    /** Baris yang belum terkirim ke Spreadsheet. */
    ambilKotor() {
      const keluar = {};
      for (const n of NAMA_TABEL) {
        const baris = k.kotor[n].map((id) => k.tabel[n][id]).filter(Boolean);
        if (baris.length) keluar[n] = baris;
      }
      return keluar;
    },

    jumlahKotor() {
      return NAMA_TABEL.reduce((j, n) => j + k.kotor[n].length, 0);
    },

    /** Tandai bersih hanya bila baris tidak berubah sejak dikirim. */
    tandaiBersih(tabel, id, diubahSaatKirim) {
      const r = k.tabel[tabel][id];
      if (!r || r.diubah === diubahSaatKirim) {
        k.kotor[tabel] = k.kotor[tabel].filter((x) => x !== id);
        jadwalkanTulis();
      }
    },

    /** Gabungkan baris dari server. Yang lebih baru menang; kolom lokal dipertahankan. */
    terapkanDariServer(tabel, daftar) {
      let berubah = 0;
      for (const baru of daftar) {
        const lama = k.tabel[tabel][baru.id];
        if (lama && (lama.diubah || 0) >= (baru.diubah || 0)) continue;
        const lokal = {};
        for (const kol of TABEL[tabel].lokal || []) if (lama && lama[kol] !== undefined) lokal[kol] = lama[kol];
        // Salinan foto lokal hanya dipertahankan bila fotonya tidak diganti atau dihapus di perangkat lain.
        for (const [kolLokal, kolUrl] of KOLOM_FOTO[tabel] || []) {
          if (lama && (lama[kolUrl] || '') !== (baru[kolUrl] || '')) delete lokal[kolLokal];
        }
        k.tabel[tabel][baru.id] = { ...baru, ...lokal };
        k.kotor[tabel] = k.kotor[tabel].filter((x) => x !== baru.id);
        berubah += 1;
      }
      if (berubah) {
        jadwalkanTulis();
        kabari();
      }
      return berubah;
    },

    get pengaturan() {
      return k.pengaturan;
    },
    aturPengaturan(patch) {
      k.pengaturan = { ...k.pengaturan, ...patch };
      jadwalkanTulis();
      kabari();
    },

    get meta() {
      return k.meta;
    },
    aturMeta(patch) {
      k.meta = { ...k.meta, ...patch };
      jadwalkanTulis();
      kabari();
    },

    /** Cadangan lengkap sebagai teks JSON (tanpa kunci rahasia). */
    ekspor() {
      const salin = JSON.parse(JSON.stringify(k));
      salin.pengaturan.kunci = '';
      salin.pengaturan.kunciAplikasi = null;
      return JSON.stringify(salin, null, 1);
    },

    /** Pulihkan dari cadangan. Pengaturan koneksi perangkat ini dipertahankan. */
    async impor(teks) {
      const dibaca = JSON.parse(teks);
      if (!dibaca || typeof dibaca !== 'object' || !dibaca.tabel) throw new Error('Berkas cadangan tidak dikenali.');
      const dasar = keadaanKosong();
      const pengaturanLama = k.pengaturan;
      k = {
        ...dasar,
        tabel: { ...dasar.tabel, ...dibaca.tabel },
        kotor: { ...dasar.kotor },
        meta: { ...dasar.meta, ...k.meta, sinkronTerakhir: 0 },
        pengaturan: pengaturanLama,
      };
      // Semua baris dianggap belum terkirim agar ikut ke Spreadsheet.
      for (const n of NAMA_TABEL) k.kotor[n] = Object.keys(k.tabel[n]);
      await tulisSekarang();
      kabari();
    },

    /**
     * Kosongkan data di perangkat. Pengaturan koneksi dipertahankan.
     * Dengan hapusKataSandi (jalur "lupa kata sandi"), kata sandi aplikasi dan kunci rahasia Apps Script
     * ikut dihapus supaya data tidak bisa dipulihkan lewat sinkron tanpa mengetahui kunci itu.
     */
    async hapusSemua({ hapusKataSandi = false } = {}) {
      const pengaturanLama = hapusKataSandi ? { ...k.pengaturan, kunciAplikasi: null, kunci: '' } : k.pengaturan;
      k = keadaanKosong();
      k.pengaturan = pengaturanLama;
      await tulisSekarang();
      kabari();
    },

    /** Paksa tulis ke penyimpanan (mis. saat halaman ditutup). */
    async tulis() {
      if (jadwalSimpan) clearTimeout(jadwalSimpan);
      return tulisSekarang();
    },
  };
  return db;
}
