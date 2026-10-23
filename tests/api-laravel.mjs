// Uji backend Laravel sungguhan (bukan tiruan) memakai kode sinkron aplikasi yang sama.
//
//   cd backend && php artisan serve          (terminal 1)
//   API_URL=http://localhost:8000/api npm run test:api
//
// Tes membuat dua akun uji lewat `php artisan resep:buat-akun` (atur PHP=/jalur/php bila perlu),
// jadi jalankan dengan variabel lingkungan database yang SAMA dengan server.
// PERINGATAN: menulis data contoh. Pakai database lokal/uji, bukan database produksi Supabase.

import test from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { buatDB, penyimpananMemori } from '../js/lib/db.js';
import { buatPenyinkron, panggilApi, ambilInfoNilai, kirimNilai, tesKoneksi, GalatSinkron } from '../js/lib/sync.js';
import { masukAkun, keluarAkun } from '../js/lib/akun.js';
import * as repo from '../js/lib/repo.js';
import { muatContoh } from '../js/lib/seed.js';

const API = process.env.API_URL || 'http://localhost:8000/api';
const SANDI = 'sandi-uji-12345';
const acak = Math.random().toString(36).slice(2, 8);

function buatAkun(nama, email) {
  const r = spawnSync(process.env.PHP || 'php', ['backend/artisan', 'resep:buat-akun', nama, email, '--sandi=' + SANDI], { encoding: 'utf8' });
  assert.equal(r.status, 0, r.stdout + r.stderr);
  return /Username\s*:\s*(\S+)/.exec(r.stdout)[1];
}
const AKUN_A = { email: `a-${acak}@uji.test`, username: buatAkun('Chef A', `a-${acak}@uji.test`) };
const AKUN_B = { email: `b-${acak}@uji.test`, username: buatAkun('Chef B', `b-${acak}@uji.test`) };

async function perangkat(akun, login = akun.username) {
  const db = buatDB(penyimpananMemori());
  await db.muat();
  repo.pastikanKategoriAwal(db);
  await masukAkun(db, API, { login, kataSandi: SANDI });
  return { db, sinkron: buatPenyinkron(db) };
}

// PNG 1x1 yang sah.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

test('akun: masuk dengan username atau email, sesi dicek, keluar mencabut sesi', async () => {
  const a = await perangkat(AKUN_A);
  assert.equal(a.db.pengaturan.akun.email, AKUN_A.email);
  const ping = await tesKoneksi(a.db.pengaturan);
  assert.equal(ping.pengguna.username, AKUN_A.username);
  const lewatEmail = await perangkat(AKUN_A, AKUN_A.email.toUpperCase());
  assert.equal(lewatEmail.db.pengaturan.akun.username, AKUN_A.username);

  await assert.rejects(() => masukAkun(a.db, API, { login: AKUN_A.username, kataSandi: 'salah' }), /salah/);
  await assert.rejects(() => tesKoneksi({ scriptUrl: API, kunci: 'token-palsu-yang-cukup-panjang' }), (e) => e instanceof GalatSinkron && e.kode === 'SESI');
  await assert.rejects(() => panggilApi(API, { aksi: 'sinkron', sejak: 0, baris: {} }), (e) => e.kode === 'SESI');

  const kunciLama = lewatEmail.db.pengaturan.kunci;
  await keluarAkun(lewatEmail.db);
  await new Promise((r) => setTimeout(r, 1500));
  await assert.rejects(() => tesKoneksi({ scriptUrl: API, kunci: kunciLama }), (e) => e.kode === 'SESI');
  assert.equal((await tesKoneksi(a.db.pengaturan)).ok, true, 'sesi perangkat lain tetap berlaku');

  const lupa = await panggilApi(API, { aksi: 'lupaSandi', login: 'tidak-ada-' + acak });
  assert.equal(lupa.ok, true, 'jawaban sama walau akun tidak ada');
  await assert.rejects(() => panggilApi(API, { aksi: 'aturSandi', email: AKUN_A.email, tokenReset: 'palsu', kataSandi: 'baru-12345' }), /tidak berlaku/);
});

test('perangkat A -> server -> perangkat B, termasuk resep tambahan, foto, dan penilaian QR', async () => {
  const a = await perangkat(AKUN_A);
  const { brownies } = muatContoh(a.db);

  // Resep tambahan: brownies memakai 50 gram saus cokelat.
  const kat = repo.daftarKategori(a.db)[0].id;
  const saus = repo.buatResep(a.db, { nama: 'Saus cokelat uji', idKategori: kat });
  const bahan = a.db.semua('Bahan')[0];
  repo.simpanEksperimen(a.db, {
    eksperimen: { ...repo.draftEksperimen(a.db, saus.id).eksperimen, porsi: 200, satuanPorsi: 'gram' },
    baris: [{ idBahan: bahan.id, jumlah: 1, satuan: bahan.satuanBeli }],
  });
  const rt = repo.tambahResepTambahan(a.db, brownies, saus.id);
  a.db.simpan('ResepTambahan', { ...rt, jumlah: 50 });

  const eks = repo.eksperimenResep(a.db, brownies)[2];
  a.db.simpan('Eksperimen', { ...a.db.ambil('Eksperimen', eks.id), fotoHasilLokal: PNG });
  repo.pastikanToken(a.db, eks.id);
  a.db.simpan('Eksperimen', { ...a.db.ambil('Eksperimen', eks.id), panduanNilai: { tekstur: 'Harus kriuk kering' }, catatanChef: 'Gula dikurangi.' });

  const hasilA = await a.sinkron.sinkronkan();
  assert.ok(hasilA.terkirim > 50);
  assert.equal(hasilA.foto, 1);
  assert.equal(a.db.jumlahKotor(), 0);
  const fotoUrl = a.db.ambil('Eksperimen', eks.id).fotoHasilUrl;
  assert.match(fotoUrl, /^https?:\/\//);
  const gambar = await fetch(fotoUrl);
  assert.equal(gambar.status, 200, 'foto bisa dibuka: ' + fotoUrl);

  const b = await perangkat(AKUN_A); // perangkat kedua, akun yang sama
  await b.sinkron.sinkronkan();
  assert.equal(b.db.ambil('Resep', brownies).nama, a.db.ambil('Resep', brownies).nama);
  const eksB = b.db.ambil('Eksperimen', eks.id);
  assert.deepEqual(eksB.langkah, a.db.ambil('Eksperimen', eks.id).langkah);
  assert.equal(typeof eksB.terimaNilai, 'boolean');
  assert.equal(eksB.fotoHasilUrl, fotoUrl);
  assert.equal(Math.round(repo.dataHPP(b.db, brownies).hpp.totalResep), Math.round(repo.dataHPP(a.db, brownies).hpp.totalResep));
  assert.equal(repo.dataHPP(b.db, brownies).tambahan.rincian.length, 1);

  // Penilai lewat QR (tanpa kunci).
  const token = a.db.ambil('Eksperimen', eks.id).tokenNilai;
  const info = await ambilInfoNilai(API, token);
  assert.equal(info.terima, true);
  assert.equal(info.nomor, eks.nomor);
  assert.deepEqual(info.panduan, { tekstur: 'Harus kriuk kering' });
  assert.equal(info.catatanChef, 'Gula dikurangi.');
  await kirimNilai(API, token, { nama: 'Penguji', rasa: 9, tekstur: 8, tampilan: 7, aroma: 8, minatBeli: 9, komentar: 'Enak' });
  await assert.rejects(() => kirimNilai(API, token, { rasa: 11, tekstur: 8, tampilan: 7, aroma: 8, minatBeli: 9 }), /bilangan bulat/);
  await assert.rejects(() => ambilInfoNilai(API, 'token-tidak-ada-xyz'), /tidak ditemukan/);

  const sebelum = repo.penilaianEksperimen(a.db, eks.id).length;
  await a.sinkron.sinkronkan();
  const nilaiBaru = repo.penilaianEksperimen(a.db, eks.id);
  assert.equal(nilaiBaru.length, sebelum + 1);
  assert.ok(nilaiBaru.some((p) => p.namaPenilai === 'Penguji' && p.rasa === 9 && p.dariPemilik === false));

  // Yang lebih baru menang; perubahan lama tidak menimpa.
  b.db.simpan('Resep', { ...b.db.ambil('Resep', brownies), nama: 'Brownies versi B' });
  await b.sinkron.sinkronkan();
  await a.sinkron.sinkronkan();
  assert.equal(a.db.ambil('Resep', brownies).nama, 'Brownies versi B');

  // Penghapusan ikut tersinkron.
  repo.hapusResep(a.db, saus.id);
  await a.sinkron.sinkronkan();
  await b.sinkron.sinkronkan();
  assert.equal(b.db.ambil('Resep', saus.id), null);
  assert.equal(repo.dataHPP(b.db, brownies).tambahan.rincian.length, 0);
});

test('data akun lain tidak terlihat dan tidak bisa ditimpa', async () => {
  const a = await perangkat(AKUN_A);
  await a.sinkron.sinkronkan();
  const milikA = a.db.semua('Resep');
  assert.ok(milikA.length > 0);

  const b = await perangkat(AKUN_B);
  await b.sinkron.sinkronkan();
  assert.equal(b.db.semua('Resep').length, 0, 'akun B mulai kosong');

  // B sengaja mengirim baris dengan id yang sama seperti milik A.
  const sasaran = milikA[0];
  b.db.simpan('Resep', { ...sasaran, nama: 'Diambil alih B', diubah: undefined });
  await b.sinkron.sinkronkan();
  await a.sinkron.sinkronkan();
  assert.equal(a.db.ambil('Resep', sasaran.id).nama, sasaran.nama, 'resep A tidak berubah');
  assert.equal(b.db.ambil('Resep', sasaran.id).nama, 'Diambil alih B', 'B hanya punya salinannya sendiri');
});
