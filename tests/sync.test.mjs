// Tes sinkronisasi terhadap tiruan backend Laravel (tools/server-tiruan.mjs) di memori.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buatServer, fetchKeServer } from '../tools/server-tiruan.mjs';
import { buatDB, penyimpananMemori } from '../js/lib/db.js';
import { buatPenyinkron, panggilApi, ambilInfoNilai, kirimNilai, tesKoneksi, GalatSinkron } from '../js/lib/sync.js';
import * as repo from '../js/lib/repo.js';
import { muatContoh } from '../js/lib/seed.js';
import { skorDariDB } from '../js/lib/repo.js';

const KUNCI = 'kunci-uji-123';
const URL_UJI = 'https://server-uji.test/api';

async function perangkat(server, nama = 'A') {
  const db = buatDB(penyimpananMemori());
  await db.muat();
  repo.pastikanKategoriAwal(db);
  db.aturPengaturan({ scriptUrl: URL_UJI, kunci: KUNCI, namaPemilik: nama });
  const fetchFn = fetchKeServer(server);
  return { db, sinkron: buatPenyinkron(db, { fetchFn }), fetchFn };
}

const baruServer = () => buatServer({ tabel: {}, foto: {} }, { kunci: KUNCI });

test('ping: sesi benar diterima, salah ditolak', async () => {
  const server = baruServer();
  const { fetchFn } = await perangkat(server);
  assert.equal((await tesKoneksi({ scriptUrl: URL_UJI, kunci: KUNCI }, { fetchFn })).ok, true);
  await assert.rejects(() => tesKoneksi({ scriptUrl: URL_UJI, kunci: 'salah' }, { fetchFn }), (e) => e instanceof GalatSinkron && e.kode === 'SESI');
  await assert.rejects(() => tesKoneksi({ scriptUrl: URL_UJI, kunci: '' }, { fetchFn }), /Sesi Anda sudah berakhir/);
  assert.equal(server.get().ok, true);
});

test('data dari perangkat A sampai ke perangkat B', async () => {
  const server = baruServer();
  const a = await perangkat(server, 'A');
  const b = await perangkat(server, 'B');
  const { brownies } = muatContoh(a.db);
  const hasilA = await a.sinkron.sinkronkan();
  assert.ok(hasilA.terkirim > 50);
  assert.equal(a.db.jumlahKotor(), 0);

  await b.sinkron.sinkronkan();
  assert.equal(b.db.semua('Resep').length, 4);
  assert.equal(b.db.semua('Bahan').length, a.db.semua('Bahan').length);
  const eksB = repo.eksperimenResep(b.db, brownies);
  assert.equal(eksB.length, 4);
  assert.deepEqual(eksB[2].langkah, a.db.ambil('Eksperimen', eksB[2].id).langkah);
  assert.equal(Math.round(repo.dataHPP(b.db, brownies).biaya.total), 38960);
  assert.equal(b.db.ambil('Resep', brownies).idJuara, eksB[2].id);
  assert.equal(typeof eksB[2].terimaNilai, 'boolean');
});

test('sinkron kedua hanya mengirim yang berubah', async () => {
  const server = baruServer();
  const a = await perangkat(server);
  muatContoh(a.db);
  await a.sinkron.sinkronkan();
  const hasil = await a.sinkron.sinkronkan();
  assert.equal(hasil.terkirim, 0);
  const bahan = a.db.semua('Bahan')[0];
  a.db.simpan('Bahan', { ...bahan, merek: 'Merek baru' });
  const lagi = await a.sinkron.sinkronkan();
  assert.equal(lagi.terkirim, 1);
});

test('konflik: perubahan yang lebih baru menang, hapus ikut menyebar', async () => {
  const server = baruServer();
  const a = await perangkat(server, 'A');
  const b = await perangkat(server, 'B');
  const kat = a.db.semua('Kategori')[0];
  await a.sinkron.sinkronkan();
  await b.sinkron.sinkronkan();

  a.db.simpan('Kategori', { ...kat, nama: 'Dari A' }, { sekarang: Date.now() + 1000 });
  b.db.simpan('Kategori', { ...b.db.ambil('Kategori', kat.id), nama: 'Dari B' }, { sekarang: Date.now() + 5000 });
  await a.sinkron.sinkronkan();
  await b.sinkron.sinkronkan();
  await a.sinkron.sinkronkan();
  assert.equal(a.db.ambil('Kategori', kat.id).nama, 'Dari B');
  assert.equal(b.db.ambil('Kategori', kat.id).nama, 'Dari B');

  const lain = a.db.semua('Kategori')[1];
  a.db.hapus('Kategori', lain.id, { sekarang: Date.now() + 9000 });
  await a.sinkron.sinkronkan();
  await b.sinkron.sinkronkan();
  assert.equal(b.db.ambil('Kategori', lain.id), null);
});

test('penilaian lewat tautan QR: info, kirim, lalu masuk ke aplikasi pemilik', async () => {
  const server = baruServer();
  const a = await perangkat(server);
  const { brownies } = muatContoh(a.db);
  const eks = repo.eksperimenResep(a.db, brownies)[2];
  const sebelum = skorDariDB(a.db, eks.id).jumlah;
  const dengan = repo.pastikanToken(a.db, eks.id);
  assert.ok(dengan.tokenNilai.length >= 14);
  await a.sinkron.sinkronkan();

  const { fetchFn } = a;
  const info = await ambilInfoNilai(URL_UJI, dengan.tokenNilai, { fetchFn });
  assert.equal(info.namaResep, 'Brownies Fudgy');
  assert.equal(info.nomor, 3);
  assert.equal(info.terima, true);
  assert.equal(info.wajibNama, false);
  assert.deepEqual(Object.keys(info).sort(), ['catatanChef', 'fotoUrl', 'logoUrl', 'namaAplikasi', 'namaResep', 'nomor', 'ok', 'panduan', 'terima', 'wajibNama']); // tidak membocorkan id/kunci
  assert.deepEqual(info.panduan, {});
  assert.equal(info.catatanChef, '');

  await kirimNilai(URL_UJI, dengan.tokenNilai, { nama: 'Tamu', rasa: 9, tekstur: 8, tampilan: 7, aroma: 10, minatBeli: 9, komentar: 'Enak sekali' }, { fetchFn });
  await a.sinkron.sinkronkan();
  const daftar = repo.penilaianEksperimen(a.db, eks.id);
  assert.equal(daftar.length, sebelum + 1);
  const baru = daftar.find((p) => p.namaPenilai === 'Tamu');
  assert.equal(baru.rasa, 9);
  assert.equal(baru.komentar, 'Enak sekali');
  assert.equal(baru.dariPemilik, false);
});

test('penilaian: token salah, nilai tidak sah, ditutup, nama wajib', async () => {
  const server = baruServer();
  const a = await perangkat(server);
  const { brownies } = muatContoh(a.db);
  const eks = repo.eksperimenResep(a.db, brownies)[2];
  const { tokenNilai } = repo.pastikanToken(a.db, eks.id);
  await a.sinkron.sinkronkan();
  const { fetchFn } = a;
  const baik = { nama: 'X', rasa: 8, tekstur: 8, tampilan: 8, aroma: 8, minatBeli: 8, komentar: '' };

  await assert.rejects(() => ambilInfoNilai(URL_UJI, 'tokenasal12345678', { fetchFn }), /tidak ditemukan/);
  await assert.rejects(() => ambilInfoNilai(URL_UJI, '', { fetchFn }), /tidak ditemukan/);
  await assert.rejects(() => kirimNilai(URL_UJI, 'pendek', baik, { fetchFn }), /tidak ditemukan/);
  await assert.rejects(() => kirimNilai(URL_UJI, tokenNilai, { ...baik, rasa: 11 }, { fetchFn }), /bilangan bulat 1 sampai 10/);
  await assert.rejects(() => kirimNilai(URL_UJI, tokenNilai, { ...baik, aroma: 0 }, { fetchFn }), /bilangan bulat/);
  await assert.rejects(() => kirimNilai(URL_UJI, tokenNilai, { ...baik, tekstur: 7.5 }, { fetchFn }), /bilangan bulat/);
  await assert.rejects(() => kirimNilai(URL_UJI, tokenNilai, { ...baik, minatBeli: 'abc' }, { fetchFn }), /bilangan bulat/);

  // tutup penilaian
  a.db.simpan('Eksperimen', { ...a.db.ambil('Eksperimen', eks.id), terimaNilai: false });
  await a.sinkron.sinkronkan();
  assert.equal((await ambilInfoNilai(URL_UJI, tokenNilai, { fetchFn })).terima, false);
  await assert.rejects(() => kirimNilai(URL_UJI, tokenNilai, baik, { fetchFn }), /ditutup/);

  // buka lagi, nama wajib
  a.db.simpan('Eksperimen', { ...a.db.ambil('Eksperimen', eks.id), terimaNilai: true, wajibNama: true });
  await a.sinkron.sinkronkan();
  await assert.rejects(() => kirimNilai(URL_UJI, tokenNilai, { ...baik, nama: '  ' }, { fetchFn }), /Nama wajib/);
  await kirimNilai(URL_UJI, tokenNilai, baik, { fetchFn });
});

test('teks dari penilai dibersihkan dari karakter kontrol dan dipotong', async () => {
  const server = baruServer();
  const a = await perangkat(server);
  const { brownies } = muatContoh(a.db);
  const eks = repo.eksperimenResep(a.db, brownies)[0];
  const { tokenNilai } = repo.pastikanToken(a.db, eks.id);
  await a.sinkron.sinkronkan();
  const { fetchFn } = a;
  await kirimNilai(URL_UJI, tokenNilai, { nama: ' Tamu\u0007' + 'n'.repeat(100), rasa: 5, tekstur: 5, tampilan: 5, aroma: 5, minatBeli: 5, komentar: 'ok\u0000' + 'a'.repeat(5000) }, { fetchFn });
  const baris = Object.values(server.keadaan.tabel.Penilaian).at(-1);
  assert.ok(baris.namaPenilai.startsWith('Tamu'));
  assert.equal(baris.namaPenilai.length, 60);
  assert.ok(!/[\u0000-\u0008]/.test(baris.namaPenilai + baris.komentar));
  assert.equal(baris.komentar.length, 1000);
});

test('aksi pemilik tanpa sesi ditolak, termasuk membaca data', async () => {
  const server = baruServer();
  const a = await perangkat(server);
  muatContoh(a.db);
  await a.sinkron.sinkronkan();
  const { fetchFn } = a;
  await assert.rejects(() => panggilApi(URL_UJI, { aksi: 'sinkron', sejak: 0, baris: {} }, { fetchFn }), /Sesi Anda sudah berakhir/);
  await assert.rejects(() => panggilApi(URL_UJI, { aksi: 'sinkron', kunci: 'x', sejak: 0, baris: {} }, { fetchFn }), /Sesi Anda sudah berakhir/);
  await assert.rejects(() => panggilApi(URL_UJI, { aksi: 'unggahFoto', mime: 'image/png', base64: 'AAAA' }, { fetchFn }), /Sesi Anda sudah berakhir/);
  await assert.rejects(() => panggilApi(URL_UJI, { aksi: 'apa-saja' }, { fetchFn }), /Sesi Anda sudah berakhir/);
});

test('unggah foto: data lokal menjadi tautan server dan tersimpan di baris', async () => {
  const server = baruServer();
  const a = await perangkat(server);
  const { brownies } = muatContoh(a.db);
  const eks = repo.eksperimenResep(a.db, brownies)[2];
  const png = 'data:image/png;base64,' + Buffer.from('gambar-uji').toString('base64');
  // Seperti patchFoto di aplikasi: foto baru mengosongkan tautan foto lama.
  a.db.simpan('Eksperimen', { ...a.db.ambil('Eksperimen', eks.id), fotoHasilLokal: png, fotoHasilUrl: '' });
  const hasil = await a.sinkron.sinkronkan();
  assert.equal(hasil.foto, 1);
  const sesudah = a.db.ambil('Eksperimen', eks.id);
  assert.match(sesudah.fotoHasilUrl, /^\/foto\//);
  assert.equal(sesudah.fotoHasilLokal, png); // salinan lokal tetap ada
  assert.equal(Object.keys(server.keadaan.foto).length, 1);
  assert.equal(Buffer.from(Object.values(server.keadaan.foto)[0].base64, 'base64').toString(), 'gambar-uji');

  // foto tidak diunggah ulang
  const lagi = await a.sinkron.sinkronkan();
  assert.equal(lagi.foto, 0);

  // perangkat lain hanya mendapat tautan
  const b = await perangkat(server, 'B');
  await b.sinkron.sinkronkan();
  const diB = b.db.ambil('Eksperimen', eks.id);
  assert.equal(diB.fotoHasilUrl, sesudah.fotoHasilUrl);
  assert.ok(!diB.fotoHasilLokal);
});

test('jenis gambar tidak didukung ditolak', async () => {
  const server = baruServer();
  const { fetchFn } = await perangkat(server);
  await assert.rejects(() => panggilApi(URL_UJI, { aksi: 'unggahFoto', kunci: KUNCI, mime: 'text/html', base64: 'AAAA' }, { fetchFn }), /tidak didukung/);
});

test('sinkron tanpa pengaturan memberi pesan yang jelas', async () => {
  const db = buatDB(penyimpananMemori());
  await db.muat();
  const s = buatPenyinkron(db, { fetchFn: async () => assert.fail('tidak boleh memanggil jaringan') });
  await assert.rejects(() => s.sinkronkan(), /belum diisi/);
  assert.match(s.status.galat, /belum diisi/);
});

test('galat jaringan dan jawaban bukan JSON menjadi pesan ramah', async () => {
  const db = buatDB(penyimpananMemori());
  await db.muat();
  db.aturPengaturan({ scriptUrl: URL_UJI, kunci: KUNCI });
  const putus = buatPenyinkron(db, { fetchFn: async () => { throw new TypeError('network'); } });
  await assert.rejects(() => putus.sinkronkan(), /Tidak bisa terhubung/);
  const html = buatPenyinkron(db, { fetchFn: async () => ({ ok: true, json: async () => { throw new SyntaxError('bukan json'); } }) });
  await assert.rejects(() => html.sinkronkan(), /tidak dikenali/);
});

test('sinkron bersamaan hanya berjalan sekali', async () => {
  const server = baruServer();
  let panggilan = 0;
  const a = await perangkat(server);
  const dasar = a.fetchFn;
  const s = buatPenyinkron(a.db, { fetchFn: async (...x) => { panggilan += 1; return dasar(...x); } });
  const [p, q] = [s.sinkronkan(), s.sinkronkan()];
  assert.equal(p, q);
  await p;
  assert.equal(panggilan, 1);
});

test('banyak baris dikirim bertahap dan tetap utuh', async () => {
  const server = baruServer();
  const a = await perangkat(server);
  for (let i = 0; i < 1300; i++) a.db.simpan('Bahan', { nama: `Bahan ${i}`, hargaBeli: 1000 + i, isiKemasan: 1, satuanBeli: 'kg' });
  const hasil = await a.sinkron.sinkronkan();
  assert.equal(hasil.terkirim, 1300 + a.db.semua('Kategori').length);
  const b = await perangkat(server, 'B');
  await b.sinkron.sinkronkan();
  assert.equal(b.db.semua('Bahan').length, 1300);
});

test('kategori bawaan di perangkat baru tidak ganda dan tidak menimpa perubahan pemilik', async () => {
  const server = baruServer();
  const a = await perangkat(server, 'A');
  const kue = repo.daftarKategori(a.db).find((k) => k.nama === 'Kue');
  a.db.simpan('Kategori', { ...kue, nama: 'Kue Basah' });
  await a.sinkron.sinkronkan();

  const b = await perangkat(server, 'B'); // perangkat baru, membuat kategori bawaannya sendiri
  await b.sinkron.sinkronkan();
  assert.deepEqual(repo.daftarKategori(b.db).map((k) => k.nama).sort(), ['Camilan', 'Kue Basah', 'Lauk', 'Minuman', 'Roti']);
  await a.sinkron.sinkronkan();
  assert.equal(repo.daftarKategori(a.db).length, 5);
  assert.equal(Object.keys(server.keadaan.tabel.Kategori).length, 5, 'tidak ada baris ganda di server');
});

test('merek: nama dan logo tersinkron ke perangkat lain dan tampil bagi penilai', async () => {
  const server = baruServer();
  const a = await perangkat(server, 'A');
  const { brownies } = muatContoh(a.db);
  const eks = repo.eksperimenResep(a.db, brownies)[2];
  const { tokenNilai } = repo.pastikanToken(a.db, eks.id);
  const png = 'data:image/png;base64,' + Buffer.from('logo-uji').toString('base64');
  repo.simpanMerek(a.db, { nama: 'Dapur Agam', logo: png });
  const hasil = await a.sinkron.sinkronkan();
  assert.ok(hasil.foto >= 1);

  const merekA = repo.ambilMerek(a.db);
  assert.equal(merekA.logo, png, 'perangkat sendiri tetap memakai salinan lokal');
  const baris = a.db.ambil('Setelan', repo.ID_MEREK);
  assert.match(baris.logoUrl, /^\/foto\//);

  // penilai (tanpa login) melihat nama dan logo
  const info = await ambilInfoNilai(URL_UJI, tokenNilai, { fetchFn: a.fetchFn });
  assert.equal(info.namaAplikasi, 'Dapur Agam');
  assert.equal(info.logoUrl, baris.logoUrl);

  // perangkat lain mendapat merek yang sama (tanpa salinan lokal, memakai tautan)
  const b = await perangkat(server, 'B');
  await b.sinkron.sinkronkan();
  const merekB = repo.ambilMerek(b.db);
  assert.equal(merekB.nama, 'Dapur Agam');
  assert.equal(merekB.logo, baris.logoUrl);

  // hapus logo di B, A ikut
  repo.simpanMerek(b.db, { logo: '' });
  await b.sinkron.sinkronkan();
  await a.sinkron.sinkronkan();
  assert.equal(repo.ambilMerek(a.db).logo, 'icons/icon.svg');
  assert.equal(repo.ambilMerek(a.db).nama, 'Dapur Agam');
});

test('merek belum diatur: penilai menerima nilai kosong, bukan galat', async () => {
  const server = baruServer();
  const a = await perangkat(server, 'A');
  const { brownies } = muatContoh(a.db);
  const eks = repo.eksperimenResep(a.db, brownies)[0];
  const { tokenNilai } = repo.pastikanToken(a.db, eks.id);
  await a.sinkron.sinkronkan();
  const info = await ambilInfoNilai(URL_UJI, tokenNilai, { fetchFn: a.fetchFn });
  assert.equal(info.namaAplikasi, '');
  assert.equal(info.logoUrl, '');
});

test('foto diganti atau dihapus di perangkat lain: salinan lokal lama tidak menimpa', async () => {
  const server = baruServer();
  const a = await perangkat(server, 'A');
  const { brownies } = muatContoh(a.db);
  const eks = repo.eksperimenResep(a.db, brownies)[2];
  const foto = (t) => 'data:image/png;base64,' + Buffer.from(t).toString('base64');
  a.db.simpan('Eksperimen', { ...a.db.ambil('Eksperimen', eks.id), fotoHasilLokal: foto('lama') });
  await a.sinkron.sinkronkan();
  const b = await perangkat(server, 'B');
  await b.sinkron.sinkronkan();
  const urlLama = b.db.ambil('Eksperimen', eks.id).fotoHasilUrl;
  assert.ok(urlLama);

  // B mengganti foto
  b.db.simpan('Eksperimen', { ...b.db.ambil('Eksperimen', eks.id), fotoHasilLokal: foto('baru'), fotoHasilUrl: '' });
  await b.sinkron.sinkronkan();
  await a.sinkron.sinkronkan();
  const diA = a.db.ambil('Eksperimen', eks.id);
  assert.notEqual(diA.fotoHasilUrl, urlLama);
  assert.ok(!diA.fotoHasilLokal, 'foto lama di A dibuang, A memakai tautan foto baru');

  // B menghapus foto
  b.db.simpan('Eksperimen', { ...b.db.ambil('Eksperimen', eks.id), fotoHasilLokal: '', fotoHasilUrl: '' });
  await b.sinkron.sinkronkan();
  await a.sinkron.sinkronkan();
  assert.equal(repo.fotoSrc(a.db.ambil('Eksperimen', eks.id), 'fotoHasilLokal', 'fotoHasilUrl'), '');
});

test('petunjuk penilaian dan catatan chef sampai ke penilai', async () => {
  const server = baruServer();
  const a = await perangkat(server);
  const { brownies } = muatContoh(a.db);
  const eks = repo.pastikanToken(a.db, repo.eksperimenResep(a.db, brownies)[2].id);
  a.db.simpan('Eksperimen', {
    ...eks,
    panduanNilai: { tekstur: 'Harus kriuk kering', rasa: 'Jangan terlalu asin', umum: '', lain: 'diabaikan' },
    catatanChef: 'Gula dikurangi 20 g.',
  });
  await a.sinkron.sinkronkan();
  const info = await ambilInfoNilai(URL_UJI, eks.tokenNilai, { fetchFn: a.fetchFn });
  assert.deepEqual(info.panduan, { rasa: 'Jangan terlalu asin', tekstur: 'Harus kriuk kering' });
  assert.equal(info.catatanChef, 'Gula dikurangi 20 g.');
});
