// Tiruan backend Laravel di memori, dengan protokol /api yang sama (dipakai dev-server dan tes).
// Satu akun uji saja: masuk dengan login apa pun dan kata sandi = `kunci`; token sesinya juga `kunci`.

import crypto from 'node:crypto';
import { NAMA_TABEL } from '../js/lib/schema.js';

const MAKS_BARIS_PER_PERMINTAAN = 3000;
const MAKS_PANJANG_FOTO = 6 * 1024 * 1024; // karakter base64
const MAKS_NILAI_PER_EKSPERIMEN = 500;
const ASPEK = ['rasa', 'tekstur', 'tampilan', 'aroma', 'minatBeli'];
const MIME_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
const GALAT_TOKEN = 'Tautan penilaian tidak ditemukan atau sudah tidak berlaku.';
const GALAT_SESI = { ok: false, kode: 'SESI', galat: 'Sesi Anda sudah berakhir. Silakan masuk lagi.' };

/** Kosong -> bawaan; selain itu true/1/"true"/"ya" berarti ya. */
function benar(v, bawaan) {
  if (v === '' || v === undefined || v === null) return bawaan;
  return v === true || v === 1 || /^(true|1|ya)$/i.test(String(v));
}

/** Teks dari orang lain: potong dan buang karakter kontrol. */
function bersihkan(v, maks) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maks);
}

function bacaPanduan(v) {
  let o = {};
  try {
    o = typeof v === 'string' ? JSON.parse(v || '{}') : v || {};
  } catch {
    o = {};
  }
  const keluar = {};
  for (const k of ['umum', ...ASPEK]) {
    if (o && typeof o[k] === 'string' && o[k].trim()) keluar[k] = o[k].trim().slice(0, k === 'umum' ? 500 : 200);
  }
  return keluar;
}

/**
 * @param {{tabel: Object, foto: Object}} keadaan  data tiruan (bisa disimpan sebagai JSON)
 * @param {{kunci?: string, setelahUbah?: Function}} opsi
 */
export function buatServer(keadaan = { tabel: {}, foto: {} }, opsi = {}) {
  keadaan.tabel ||= {};
  keadaan.foto ||= {};
  const kunci = opsi.kunci || 'kunci-dev';
  const kabari = () => opsi.setelahUbah && opsi.setelahUbah(keadaan);
  const tabel = (nama) => (keadaan.tabel[nama] ||= {});
  const semua = (nama) => Object.values(tabel(nama));

  /** Baris hanya menimpa bila `diubah`-nya lebih baru daripada yang tersimpan. */
  function tulis(nama, daftar) {
    const t = tabel(nama);
    for (const r of daftar) {
      const id = String(r.id == null ? '' : r.id);
      if (!id || id.length > 100) continue;
      if (t[id] && !(Number(r.diubah) > Number(t[id].diubah))) continue;
      t[id] = { ...t[id], ...r };
    }
  }

  function sinkron(req) {
    const masuk = req.baris || {};
    const jumlah = NAMA_TABEL.reduce((n, nama) => n + (masuk[nama] || []).length, 0);
    if (jumlah > MAKS_BARIS_PER_PERMINTAAN) return { ok: false, galat: 'Terlalu banyak baris dalam satu permintaan.' };
    for (const nama of NAMA_TABEL) if (masuk[nama] && masuk[nama].length) tulis(nama, masuk[nama]);
    const sejak = Number(req.sejak) || 0;
    const baris = {};
    for (const nama of NAMA_TABEL) {
      const baru = semua(nama).filter((r) => Number(r.diubah) > sejak);
      if (baru.length) baris[nama] = baru;
    }
    kabari();
    return { ok: true, waktuServer: Date.now(), baris };
  }

  function unggahFoto(req) {
    const mime = String(req.mime || '');
    if (!MIME_FOTO.includes(mime)) return { ok: false, galat: 'Jenis gambar tidak didukung.' };
    const b64 = String(req.base64 || '');
    if (!b64 || b64.length > MAKS_PANJANG_FOTO) return { ok: false, galat: 'Ukuran foto tidak valid.' };
    const dasar = String(req.nama || 'foto').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80);
    const id = `${dasar}_${crypto.randomBytes(8).toString('hex')}`;
    keadaan.foto[id] = { mime, base64: b64 };
    kabari();
    return { ok: true, url: `/foto/${id}` };
  }

  function eksperimenDariToken(token) {
    const t = typeof token === 'string' ? token : '';
    if (t.length < 10 || t.length > 100) return null;
    return semua('Eksperimen').find((e) => !benar(e.dihapus, false) && e.tokenNilai === t) || null;
  }

  function infoNilai(req) {
    const e = eksperimenDariToken(req.token);
    if (!e) return { ok: false, galat: GALAT_TOKEN };
    const resep = semua('Resep').find((r) => r.id === e.idResep && !benar(r.dihapus, false));
    const merek = semua('Setelan').find((r) => r.id === 'stl_merek' && !benar(r.dihapus, false));
    return {
      ok: true,
      namaResep: resep ? String(resep.nama) : 'Resep',
      nomor: Number(e.nomor) || 0,
      fotoUrl: String(e.fotoHasilUrl || ''),
      terima: benar(e.terimaNilai, true),
      wajibNama: benar(e.wajibNama, false),
      namaAplikasi: merek ? String(merek.namaAplikasi || '') : '',
      logoUrl: merek ? String(merek.logoUrl || '') : '',
      panduan: bacaPanduan(e.panduanNilai),
      catatanChef: String(e.catatanChef || '').trim().slice(0, 1000),
    };
  }

  function kirimNilai(req) {
    const e = eksperimenDariToken(req.token);
    if (!e) return { ok: false, galat: GALAT_TOKEN };
    if (!benar(e.terimaNilai, true)) return { ok: false, galat: 'Penilaian untuk eksperimen ini sudah ditutup.' };
    const nama = bersihkan(req.nama, 60);
    if (benar(e.wajibNama, false) && !nama) return { ok: false, galat: 'Nama wajib diisi.' };
    const nilai = {};
    for (const a of ASPEK) {
      const n = Number(req[a]);
      if (!(n >= 1 && n <= 10) || Math.round(n) !== n) return { ok: false, galat: 'Nilai harus bilangan bulat 1 sampai 10.' };
      nilai[a] = n;
    }
    if (semua('Penilaian').filter((p) => p.idEksperimen === e.id).length >= MAKS_NILAI_PER_EKSPERIMEN) {
      return { ok: false, galat: 'Batas jumlah penilaian tercapai.' };
    }
    const sekarang = Date.now();
    const id = 'nil_' + crypto.randomBytes(7).toString('hex');
    tabel('Penilaian')[id] = { id, idEksperimen: e.id, namaPenilai: nama, ...nilai, komentar: bersihkan(req.komentar, 1000), waktu: sekarang, dariPemilik: false, diubah: sekarang, dihapus: false };
    kabari();
    return { ok: true };
  }

  const pengguna = (req, login = 'chef@uji.test') => ({ id: 1, nama: req.nama || 'Chef Uji', username: 'chefuji', email: login.includes('@') ? login : 'chef@uji.test' });

  function jawab(req) {
    switch (req.aksi) {
      case 'infoNilai':
        return infoNilai(req);
      case 'kirimNilai':
        return kirimNilai(req);
      case 'masuk':
        return req.kataSandi === kunci ? { ok: true, sesi: kunci, pengguna: pengguna(req, String(req.login || '')) } : { ok: false, galat: 'Username/email atau kata sandi salah.' };
      case 'lupaSandi':
        return { ok: true, pesan: `(uji) Tidak ada email terkirim. Kata sandinya ${kunci}.` };
      case 'aturSandi':
        return { ok: true, pesan: '(uji) Kata sandi tidak berubah di server uji.' };
    }
    // Sisanya wajib login.
    if (req.kunci !== kunci) return GALAT_SESI;
    switch (req.aksi) {
      case 'ping':
        return { ok: true, versi: 2, pengguna: pengguna(req) };
      case 'sinkron':
        return sinkron(req);
      case 'unggahFoto':
        return unggahFoto(req);
      case 'ubahProfil':
        return { ok: true, pengguna: pengguna(req) };
      case 'gantiSandi':
        // Seperti Laravel, tetapi kata sandi uji tidak benar-benar berubah.
        if (req.lama !== kunci) return { ok: false, galat: 'Kata sandi lama salah.' };
        if (typeof req.baru !== 'string' || req.baru.length < 8) return { ok: false, galat: 'Kata sandi baru minimal 8 karakter.' };
        return { ok: true };
      case 'keluar':
        return { ok: true };
      default:
        return { ok: false, galat: 'Aksi tidak dikenal.' };
    }
  }

  return {
    keadaan,
    /** Kirim permintaan seperti POST /api; mengembalikan objek jawaban. */
    panggil(isi) {
      let req;
      try {
        req = typeof isi === 'string' ? JSON.parse(isi) : isi;
      } catch {
        return { ok: false, galat: 'Permintaan tidak valid.' };
      }
      return jawab(req || {});
    },
    get() {
      return { ok: true, nama: 'Good Receipes (uji)', versi: 2, akun: true };
    },
  };
}

/** fetch tiruan yang mengarah ke server tiruan di atas. */
export function fetchKeServer(server) {
  return async (_url, init) => ({
    ok: true,
    status: 200,
    json: async () => server.panggil(init.body),
  });
}
