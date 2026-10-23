// Tes aturan akun di perangkat: masuk, ganti akun, sesi berakhir, keluar.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buatDB, penyimpananMemori } from '../js/lib/db.js';
import * as repo from '../js/lib/repo.js';
import { muatContoh } from '../js/lib/seed.js';
import { masukAkun, keluarAkun, sesiBerakhir, sudahMasuk } from '../js/lib/akun.js';

const URL_UJI = 'https://api.uji/api';

/** Server tiruan: dua akun, mencatat aksi yang diterima. */
function serverTiruan() {
  const akun = { siti: { id: 7, nama: 'Siti', username: 'siti1234', email: 'siti@uji.test' }, budi: { id: 9, nama: 'Budi', username: 'budi5678', email: 'budi@uji.test' } };
  const diterima = [];
  const fetchFn = async (_url, { body }) => {
    const req = JSON.parse(body);
    diterima.push(req);
    let jawab = { ok: false, galat: 'Aksi tidak dikenal.' };
    if (req.aksi === 'masuk') {
      const a = akun[req.login];
      jawab = a && req.kataSandi === 'rahasia123' ? { ok: true, sesi: 'sesi-' + a.id, pengguna: a } : { ok: false, galat: 'Username/email atau kata sandi salah.' };
    } else if (req.aksi === 'keluar' || req.aksi === 'sinkron') jawab = { ok: true, waktuServer: 1, baris: {} };
    return { json: async () => jawab };
  };
  return { fetchFn, diterima };
}

async function dbBaru() {
  const db = buatDB(penyimpananMemori());
  await db.muat();
  repo.pastikanKategoriAwal(db);
  return db;
}

test('masuk menyimpan sesi dan akun; kata sandi salah ditolak', async () => {
  const db = await dbBaru();
  const { fetchFn } = serverTiruan();
  assert.equal(sudahMasuk(db), false);
  await assert.rejects(() => masukAkun(db, URL_UJI, { login: 'siti', kataSandi: 'salah' }, { fetchFn }), /salah/);
  assert.equal(sudahMasuk(db), false);
  const p = await masukAkun(db, URL_UJI, { login: 'siti', kataSandi: 'rahasia123' }, { fetchFn });
  assert.equal(p.id, 7);
  assert.equal(sudahMasuk(db), true);
  assert.equal(db.pengaturan.kunci, 'sesi-7');
  assert.equal(db.pengaturan.namaPemilik, 'Siti');
  assert.equal(db.meta.idPengguna, 7);
});

test('data lama tanpa akun dan data akun lain dikosongkan; akun yang sama tetap', async () => {
  const db = await dbBaru();
  const { fetchFn } = serverTiruan();
  muatContoh(db); // data dari versi tanpa akun
  await masukAkun(db, URL_UJI, { login: 'siti', kataSandi: 'rahasia123' }, { fetchFn });
  assert.equal(db.semua('Resep').length, 0, 'mulai dari kosong');
  assert.equal(repo.daftarKategori(db).length, 5, 'kategori bawaan dibuat lagi');

  muatContoh(db);
  sesiBerakhir(db);
  assert.equal(sudahMasuk(db), false);
  await masukAkun(db, URL_UJI, { login: 'siti', kataSandi: 'rahasia123' }, { fetchFn });
  assert.equal(db.semua('Resep').length, 4, 'masuk lagi dengan akun yang sama: data tetap');

  // Mengosongkan data perangkat (Pengaturan) tidak mengubah pemilik.
  await db.hapusSemua();
  assert.equal(db.meta.idPengguna, 7);

  muatContoh(db);
  sesiBerakhir(db);
  await masukAkun(db, URL_UJI, { login: 'budi', kataSandi: 'rahasia123' }, { fetchFn });
  assert.equal(db.semua('Resep').length, 0, 'akun lain tidak melihat data Siti');
  assert.equal(db.meta.idPengguna, 9);
});

test('keluar: kirim dulu, cabut sesi di server, lalu kosongkan perangkat', async () => {
  const db = await dbBaru();
  const { fetchFn, diterima } = serverTiruan();
  await masukAkun(db, URL_UJI, { login: 'siti', kataSandi: 'rahasia123' }, { fetchFn });
  muatContoh(db);
  let terkirim = false;
  const hasil = await keluarAkun(db, {
    fetchFn,
    sinkronkan: async () => {
      terkirim = true;
      for (const [t, baris] of Object.entries(db.ambilKotor())) for (const r of baris) db.tandaiBersih(t, r.id, r.diubah);
    },
  });
  assert.equal(terkirim, true);
  assert.equal(hasil.hilang, 0);
  assert.equal(sudahMasuk(db), false);
  assert.equal(db.pengaturan.kunci, '');
  assert.equal(db.semua('Resep').length, 0);
  assert.equal(db.meta.idPengguna, undefined);
  await new Promise((r) => setTimeout(r, 0));
  assert.ok(diterima.some((r) => r.aksi === 'keluar' && r.kunci === 'sesi-7'));
});
