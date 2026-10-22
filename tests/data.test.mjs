// Tes lapisan data: penyimpanan, resep, eksperimen, dan data contoh.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buatDB, penyimpananMemori } from '../js/lib/db.js';
import * as repo from '../js/lib/repo.js';
import { muatContoh } from '../js/lib/seed.js';
import { angka, desimal1 } from '../js/lib/util.js';
import { hargaMinimum, analisisPenjualan } from '../js/lib/hpp.js';
import { keBaris, dariBaris } from '../js/lib/schema.js';

async function dbBaru() {
  const db = buatDB(penyimpananMemori());
  await db.muat();
  repo.pastikanKategoriAwal(db);
  return db;
}

test('kategori awal dibuat sekali', async () => {
  const db = await dbBaru();
  assert.deepEqual(repo.daftarKategori(db).map((k) => k.nama), ['Kue', 'Minuman', 'Lauk', 'Camilan', 'Roti']);
  repo.pastikanKategoriAwal(db);
  assert.equal(db.semua('Kategori').length, 5);
});

test('data contoh cocok dengan angka mockup', async () => {
  const db = await dbBaru();
  const { brownies } = muatContoh(db);
  const hasil = repo.dataHPP(db, brownies);
  assert.equal(hasil.eksperimen.nomor, 3);
  assert.equal(Math.round(hasil.biaya.total), 38960);
  assert.equal(hasil.biaya.bermasalah.length, 0);
  assert.equal(Math.round(hasil.hpp.totalResep), 73660);
  assert.equal(angka(hasil.hpp.hppPorsi), '4.604');
  assert.equal(angka(hargaMinimum(hasil.hpp.hppPorsi, hasil.target.marginTarget)), '7.673');
  const a = analisisPenjualan({
    hppPorsi: hasil.hpp.hppPorsi,
    hargaJual: hasil.target.hargaJual,
    porsiPerResep: hasil.porsi,
    modalAwal: hasil.target.modalAwal,
    labaTargetBulanan: hasil.target.labaTargetBulanan,
  });
  assert.equal(a.bepPorsi, 442);
  assert.equal(a.porsiBulan, 884);

  const ringkas = repo.ringkasResep(db, db.ambil('Resep', brownies));
  assert.equal(desimal1(ringkas.skor), '8,4');
  assert.equal(ringkas.eksperimen.length, 4);
  assert.equal(ringkas.jumlahPenilai, 6);
  assert.equal(repo.daftarJuara(db).length, 3);
});

test('duplikat eksperimen menyalin bahan dan menaikkan nomor', async () => {
  const db = await dbBaru();
  const { brownies } = muatContoh(db);
  const eks3 = repo.eksperimenResep(db, brownies)[2];
  const draf = repo.draftEksperimen(db, brownies, eks3.id);
  assert.equal(draf.eksperimen.nomor, 5);
  assert.equal(draf.eksperimen.idAsalDuplikat, eks3.id);
  assert.equal(draf.baris.length, 6);
  assert.equal(Math.round(draf.biayaSumber), 38960);
  // ubah gula 150 g -> 130 g seperti di mockup: biaya turun Rp 360
  draf.baris.find((b) => b.jumlah === 150 && b.satuan === 'g' && db.ambil('Bahan', b.idBahan).nama === 'Gula pasir').jumlah = 130;
  const baru = repo.simpanEksperimen(db, draf);
  assert.equal(Math.round(repo.biayaBahanEksperimen(db, baru.id).total), 38600);
  assert.equal(repo.bahanEksperimen(db, baru.id).length, 6);
});

test('menyimpan ulang eksperimen mengganti daftar bahan tanpa menggandakan', async () => {
  const db = await dbBaru();
  const { brownies } = muatContoh(db);
  const eks = repo.eksperimenResep(db, brownies)[0];
  const baris = repo.bahanEksperimen(db, eks.id).slice(0, 3).map((b) => ({ idBahan: b.idBahan, jumlah: b.jumlah, satuan: b.satuan }));
  repo.simpanEksperimen(db, { eksperimen: { ...eks }, baris });
  assert.equal(repo.bahanEksperimen(db, eks.id).length, 3);
});

test('juara bisa ditandai, dipindah, dan dilepas', async () => {
  const db = await dbBaru();
  const { brownies } = muatContoh(db);
  const [e1, , e3] = repo.eksperimenResep(db, brownies);
  assert.equal(db.ambil('Resep', brownies).idJuara, e3.id);
  assert.equal(repo.ubahJuara(db, e1.id), true);
  assert.equal(db.ambil('Resep', brownies).idJuara, e1.id);
  assert.equal(repo.ubahJuara(db, e1.id), false);
  assert.equal(db.ambil('Resep', brownies).idJuara, '');
});

test('hapus eksperimen juara melepas juara dan menghapus bahan serta ulasannya', async () => {
  const db = await dbBaru();
  const { brownies } = muatContoh(db);
  const e3 = repo.eksperimenResep(db, brownies)[2];
  repo.hapusEksperimen(db, e3.id);
  assert.equal(db.ambil('Resep', brownies).idJuara, '');
  assert.equal(repo.bahanEksperimen(db, e3.id).length, 0);
  assert.equal(repo.penilaianEksperimen(db, e3.id).length, 0);
  assert.equal(repo.eksperimenResep(db, brownies).length, 3);
});

test('hapus resep menghapus semua turunannya', async () => {
  const db = await dbBaru();
  const { brownies } = muatContoh(db);
  repo.hapusResep(db, brownies);
  assert.equal(db.ambil('Resep', brownies), null);
  assert.equal(db.semua('Eksperimen', (e) => e.idResep === brownies).length, 0);
  assert.equal(db.semua('BiayaLain', (e) => e.idResep === brownies).length, 0);
  assert.equal(db.semua('Target', (e) => e.idResep === brownies).length, 0);
  assert.equal(db.semua('Marketing', (e) => e.idResep === brownies).length, 0);
  assert.equal(repo.daftarJuara(db).length, 2);
});

test('hapus bahan membersihkan konversi dan pemakaian', async () => {
  const db = await dbBaru();
  muatContoh(db);
  const telur = db.semua('Bahan').find((b) => b.nama === 'Telur ayam');
  assert.ok(repo.pemakaianBahan(db, telur.id) >= 4);
  assert.equal(repo.konversiBahan(db, telur.id).length, 1);
  repo.hapusBahan(db, telur.id);
  assert.equal(repo.pemakaianBahan(db, telur.id), 0);
  assert.equal(repo.konversiBahan(db, telur.id).length, 0);
});

test('simpan bahan: harga diperbarui hanya saat harga berubah', async () => {
  const db = await dbBaru();
  const b = repo.simpanBahan(db, { nama: 'Garam', hargaBeli: 5000, isiKemasan: 250, satuanBeli: 'g' });
  const t1 = b.hargaDiperbarui;
  await new Promise((r) => setTimeout(r, 5));
  const b2 = repo.simpanBahan(db, { ...b, merek: 'Refina' });
  assert.equal(b2.hargaDiperbarui, t1);
  await new Promise((r) => setTimeout(r, 5));
  const b3 = repo.simpanBahan(db, { ...b2, hargaBeli: 6000 });
  assert.ok(b3.hargaDiperbarui > t1);
});

test('baris kotor tercatat, dan bersih hanya bila tidak berubah lagi', async () => {
  const db = await dbBaru();
  const r = db.simpan('Kategori', { nama: 'Tes', warna: '#000', urutan: 9 });
  assert.ok(db.jumlahKotor() >= 1);
  db.tandaiBersih('Kategori', r.id, r.diubah - 1); // sudah berubah sejak dikirim
  assert.ok(db.ambilKotor().Kategori.some((x) => x.id === r.id));
  db.tandaiBersih('Kategori', r.id, db.ambil('Kategori', r.id).diubah);
  assert.ok(!(db.ambilKotor().Kategori || []).some((x) => x.id === r.id));
});

test('gabung dari server: yang lebih baru menang, kolom foto lokal dipertahankan', async () => {
  const db = await dbBaru();
  const res = db.simpan('Resep', { nama: 'Lama', idKategori: '', fotoAcuanLokal: 'data:foto', diubah: 100 }, { sekarang: 100 });
  db.tandaiBersih('Resep', res.id, res.diubah);
  assert.equal(db.terapkanDariServer('Resep', [{ id: res.id, nama: 'Server lebih lama', diubah: 50 }]), 0);
  assert.equal(db.terapkanDariServer('Resep', [{ id: res.id, nama: 'Server baru', diubah: res.diubah + 1000, dihapus: false }]), 1);
  const sesudah = db.ambil('Resep', res.id);
  assert.equal(sesudah.nama, 'Server baru');
  assert.equal(sesudah.fotoAcuanLokal, 'data:foto');
  assert.equal(db.terapkanDariServer('Resep', [{ id: res.id, diubah: res.diubah + 2000, dihapus: true }]), 1);
  assert.equal(db.ambil('Resep', res.id), null);
});

test('simpan ke penyimpanan lalu muat ulang', async () => {
  const simpan = penyimpananMemori();
  const a = buatDB(simpan);
  await a.muat();
  repo.pastikanKategoriAwal(a);
  muatContoh(a);
  a.aturPengaturan({ namaPemilik: 'Agam' });
  await a.tulis();
  const b = buatDB(simpan);
  await b.muat();
  assert.equal(b.semua('Resep').length, 4);
  assert.equal(b.pengaturan.namaPemilik, 'Agam');
  assert.equal(b.semua('Bahan').length, a.semua('Bahan').length);
});

test('cadangan: ekspor tanpa kunci, impor menandai semua baris untuk dikirim', async () => {
  const a = await dbBaru();
  muatContoh(a);
  a.aturPengaturan({ kunci: 'rahasia', scriptUrl: 'https://x' });
  const teks = a.ekspor();
  assert.ok(!teks.includes('rahasia'));
  const b = await dbBaru();
  b.aturPengaturan({ kunci: 'milik-b' });
  await b.impor(teks);
  assert.equal(b.semua('Resep').length, 4);
  assert.equal(b.pengaturan.kunci, 'milik-b');
  assert.ok(b.jumlahKotor() > 50);
  await assert.rejects(() => b.impor('{"bukan":"cadangan"}'));
});

test('serialisasi baris untuk Spreadsheet: JSON, boolean, dan kolom lokal', async () => {
  const baris = keBaris('Eksperimen', {
    id: 'e1', idResep: 'r1', nomor: 3, langkah: ['a', 'b'], terimaNilai: true, fotoHasilLokal: 'data:besar', fotoHasilUrl: 'https://x', diubah: 5, dihapus: false,
  });
  assert.equal(baris.langkah, '["a","b"]');
  assert.equal(baris.fotoHasilLokal, undefined);
  assert.equal(baris.fotoHasilUrl, 'https://x');
  const balik = dariBaris('Eksperimen', { ...baris, nomor: '3', terimaNilai: 'TRUE', diubah: '5', dihapus: 'FALSE', suhuC: '' });
  assert.deepEqual(balik.langkah, ['a', 'b']);
  assert.equal(balik.nomor, 3);
  assert.equal(balik.terimaNilai, true);
  assert.equal(balik.dihapus, false);
  assert.equal(balik.suhuC, null);
});

test('merek: bawaan, nama sendiri, logo sendiri, dan kembali ke bawaan', async () => {
  const db = await dbBaru();
  assert.deepEqual(repo.ambilMerek(db), { nama: 'Eksperimen Resep', logo: 'icons/icon.svg', logoSendiri: '', namaSendiri: '' });

  repo.simpanMerek(db, { nama: '  Dapur Agam  ' });
  let m = repo.ambilMerek(db);
  assert.equal(m.nama, 'Dapur Agam');
  assert.equal(m.logo, 'icons/icon.svg');

  repo.simpanMerek(db, { logo: 'data:image/png;base64,AAAA' }); // nama tidak berubah
  m = repo.ambilMerek(db);
  assert.equal(m.nama, 'Dapur Agam');
  assert.equal(m.logo, 'data:image/png;base64,AAAA');

  repo.simpanMerek(db, { nama: 'Dapur Agam' }); // logo tidak berubah bila tidak dikirim
  assert.equal(repo.ambilMerek(db).logo, 'data:image/png;base64,AAAA');

  repo.simpanMerek(db, { logo: '' }); // hapus logo
  assert.equal(repo.ambilMerek(db).logo, 'icons/icon.svg');

  repo.simpanMerek(db, { nama: '   ' }); // nama kosong -> bawaan
  assert.equal(repo.ambilMerek(db).nama, 'Eksperimen Resep');

  repo.simpanMerek(db, { nama: 'x'.repeat(100) });
  assert.equal(repo.ambilMerek(db).nama.length, 40);
  assert.equal(db.semua('Setelan').length, 1, 'selalu satu baris');
});
