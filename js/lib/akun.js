// Akun pengguna: daftar, masuk, keluar, ganti dan atur ulang kata sandi.
//
// Setelah masuk, token sesi disimpan di pengaturan.kunci (dipakai semua permintaan sinkron)
// dan data akun di pengaturan.akun. Data di perangkat selalu milik satu akun (meta.idPengguna):
// bila akun lain masuk di perangkat yang sama, data lama dikosongkan dulu.

import { panggilApi } from './sync.js';
import { pastikanKategoriAwal } from './repo.js';

export const MIN_SANDI = 8;

/** Alamat server tetap dari config.js (versi yang dijual). Kosong berarti mode uji. */
export function serverTetap() {
  return (globalThis.window && window.APP_CONFIG && window.APP_CONFIG.scriptUrl) || '';
}

/** Saat uji di komputer sendiri tanpa config.js: pakai backend Laravel lokal (php artisan serve). */
function serverLokal() {
  const host = globalThis.location && location.hostname;
  return host === 'localhost' || host === '127.0.0.1' ? 'http://localhost:8000/api' : '';
}

/** Alamat server: config.js, lalu yang diisi manual saat uji, lalu Laravel lokal. */
export function alamatServer(db) {
  return serverTetap() || db.pengaturan.scriptUrl || serverLokal();
}

export function sudahMasuk(db) {
  return !!(db.pengaturan.kunci && db.pengaturan.akun && db.pengaturan.akun.id);
}

function namaPerangkat() {
  const ua = (globalThis.navigator && navigator.userAgent) || '';
  const os = /Android/i.test(ua) ? 'Android' : /iPhone|iPad/i.test(ua) ? 'iPhone/iPad' : /Windows/i.test(ua) ? 'Windows' : /Mac/i.test(ua) ? 'Mac' : /Linux/i.test(ua) ? 'Linux' : 'Perangkat';
  const browser = /Edg\//.test(ua) ? 'Edge' : /Chrome\//.test(ua) ? 'Chrome' : /Firefox\//.test(ua) ? 'Firefox' : /Safari\//.test(ua) ? 'Safari' : 'Browser';
  return `${browser} di ${os}`;
}

/**
 * Logo dan foto latar Login yang diatur admin untuk seluruh situs. Disimpan di pengaturan perangkat
 * supaya halaman Login tetap tampil benar saat sinyal lemah. Gagal diam-diam (memakai yang lama/bawaan).
 */
export async function perbaruiTampilanSitus(db, opsi) {
  const url = alamatServer(db);
  if (!url || (globalThis.navigator && navigator.onLine === false)) return;
  try {
    const j = await panggilApi(url, { aksi: 'infoSitus' }, { batasWaktu: 15000, ...opsi });
    const baru = { logoUrl: String(j.logoUrl || ''), latarUrl: String(j.latarUrl || '') };
    const lama = db.pengaturan.situs || {};
    if (lama.logoUrl !== baru.logoUrl || lama.latarUrl !== baru.latarUrl) db.aturPengaturan({ situs: baru });
  } catch {
    /* tetap memakai tampilan terakhir yang diketahui */
  }
}

export function mintaAturUlang(url, login, opsi) {
  return panggilApi(url, { aksi: 'lupaSandi', login: login.trim() }, opsi);
}

export function aturSandiBaru(url, { email, tokenReset, kataSandi }, opsi) {
  return panggilApi(url, { aksi: 'aturSandi', email, tokenReset, kataSandi }, opsi);
}

/**
 * Masuk lalu siapkan perangkat untuk akun itu. Data perangkat dikosongkan bila sebelumnya
 * milik akun lain atau belum milik akun mana pun (data dari versi tanpa akun).
 */
export async function masukAkun(db, url, { login, kataSandi }, opsi) {
  const jawab = await panggilApi(url, { aksi: 'masuk', login: login.trim(), kataSandi, perangkat: namaPerangkat() }, opsi);
  const pengguna = jawab.pengguna;
  if (db.meta.idPengguna !== pengguna.id) {
    await db.hapusSemua();
    db.aturMeta({ idPengguna: pengguna.id });
    pastikanKategoriAwal(db);
  }
  db.aturPengaturan({ scriptUrl: url, kunci: jawab.sesi, akun: pengguna, namaPemilik: pengguna.nama });
  // Simpan sesi seketika (bukan menunggu jeda tulis), supaya tidak hilang bila halaman langsung dimuat ulang.
  await db.tulis();
  return pengguna;
}

/**
 * Keluar: coba kirim perubahan terakhir, cabut sesi di server, lalu kosongkan perangkat.
 * Data tetap aman di server dan kembali saat masuk lagi.
 */
export async function keluarAkun(db, { sinkronkan, fetchFn } = {}) {
  if (sinkronkan && db.jumlahKotor() > 0) {
    try {
      await sinkronkan();
    } catch {
      /* dicek di bawah */
    }
  }
  const sisa = db.jumlahKotor();
  const url = alamatServer(db);
  const kunci = db.pengaturan.kunci;
  if (url && kunci) panggilApi(url, { aksi: 'keluar', kunci }, { fetchFn }).catch(() => {});
  await db.hapusSemua({ keluar: true });
  db.aturPengaturan({ akun: null, kunci: '' });
  await db.tulis();
  return { hilang: sisa };
}

/** Sesi ditolak server (mis. kata sandi diganti di perangkat lain): minta masuk lagi, data tetap ada. */
export function sesiBerakhir(db) {
  db.aturPengaturan({ kunci: '' });
}

export async function ubahNamaAkun(db, nama, opsi) {
  const jawab = await panggilApi(alamatServer(db), { aksi: 'ubahProfil', kunci: db.pengaturan.kunci, nama: nama.trim() }, opsi);
  db.aturPengaturan({ akun: jawab.pengguna, namaPemilik: jawab.pengguna.nama });
  return jawab.pengguna;
}

export function gantiSandiAkun(db, { lama, baru }, opsi) {
  return panggilApi(alamatServer(db), { aksi: 'gantiSandi', kunci: db.pengaturan.kunci, lama, baru }, opsi);
}
