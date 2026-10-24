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

test('ekspor satu resep: semua eksperimen lengkap dengan bahan, biaya, HPP, dan penilaian', async () => {
  const db = await dbBaru();
  const { brownies } = muatContoh(db);
  const d = repo.dataEksporResep(db, brownies);
  assert.equal(d.resep.nama, 'Brownies Fudgy');
  assert.equal(d.eksperimen.length, 4);
  assert.deepEqual(d.eksperimen.map((x) => x.eksperimen.nomor), [1, 2, 3, 4]);
  const juara = d.eksperimen.find((x) => x.juara);
  assert.equal(juara.eksperimen.id, db.ambil('Resep', brownies).idJuara);
  assert.ok(juara.biaya.rincian.length > 0 && juara.biaya.total > 0);
  assert.ok(Number.isFinite(juara.hpp.hppPorsi));
  assert.ok(juara.skor.jumlah > 0 && juara.penilaian.length === juara.skor.jumlah);
  assert.equal(Math.round(d.hpp.biaya.total), 38960);
  assert.ok(d.hpp.hpp.totalResep > d.hpp.biaya.total, 'HPP per resep ikut biaya lain');
  assert.equal(repo.dataEksporResep(db, 'tidak-ada'), null);
});

test('hapus resep: eksperimen, bahan eksperimen, penilaian, HPP, dan marketing ikut terhapus', async () => {
  const db = await dbBaru();
  const { brownies } = muatContoh(db);
  const idEks = repo.eksperimenResep(db, brownies).map((e) => e.id);
  const resepLain = db.semua('Resep').length - 1;
  repo.hapusResep(db, brownies);
  assert.equal(db.ambil('Resep', brownies), null);
  assert.equal(db.semua('Resep').length, resepLain);
  assert.equal(db.semua('Eksperimen', (e) => e.idResep === brownies).length, 0);
  assert.equal(db.semua('BahanEksperimen', (b) => idEks.includes(b.idEksperimen)).length, 0);
  assert.equal(db.semua('Penilaian', (p) => idEks.includes(p.idEksperimen)).length, 0);
  for (const t of ['BiayaLain', 'Target', 'Marketing', 'ResepTambahan']) assert.equal(db.semua(t, (r) => r.idResep === brownies).length, 0, t);
  assert.ok(db.jumlahKotor() > 0, 'penghapusan ikut dikirim ke server');
});

test('serialisasi baris untuk server: JSON, boolean, dan kolom lokal', async () => {
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
  assert.deepEqual(repo.ambilMerek(db), { nama: 'Good Receipes', logo: 'icons/icon-192.png', logoSendiri: '', namaSendiri: '' });

  repo.simpanMerek(db, { nama: '  Dapur Agam  ' });
  let m = repo.ambilMerek(db);
  assert.equal(m.nama, 'Dapur Agam');
  assert.equal(m.logo, 'icons/icon-192.png');

  repo.simpanMerek(db, { logo: 'data:image/png;base64,AAAA' }); // nama tidak berubah
  m = repo.ambilMerek(db);
  assert.equal(m.nama, 'Dapur Agam');
  assert.equal(m.logo, 'data:image/png;base64,AAAA');

  repo.simpanMerek(db, { nama: 'Dapur Agam' }); // logo tidak berubah bila tidak dikirim
  assert.equal(repo.ambilMerek(db).logo, 'data:image/png;base64,AAAA');

  repo.simpanMerek(db, { logo: '' }); // hapus logo
  assert.equal(repo.ambilMerek(db).logo, 'icons/icon-192.png');

  repo.simpanMerek(db, { nama: '   ' }); // nama kosong -> bawaan
  assert.equal(repo.ambilMerek(db).nama, 'Good Receipes');

  repo.simpanMerek(db, { nama: 'x'.repeat(100) });
  assert.equal(repo.ambilMerek(db).nama.length, 40);
  assert.equal(db.semua('Setelan').length, 1, 'selalu satu baris');
});

test('resep tambahan: HPP resep A ikut menghitung resep B, dan tidak bisa berputar', async () => {
  const db = await dbBaru();
  const { brownies } = muatContoh(db);
  const awal = repo.dataHPP(db, brownies);
  const kat = repo.daftarKategori(db)[0].id;
  const saus = repo.buatResep(db, { nama: 'Saus cokelat', idKategori: kat });
  const bahan = db.semua('Bahan')[0];
  repo.simpanEksperimen(db, {
    eksperimen: { ...repo.draftEksperimen(db, saus.id).eksperimen, porsi: 200, satuanPorsi: 'gram' },
    baris: [{ idBahan: bahan.id, jumlah: 1, satuan: bahan.satuanBeli }],
  });
  const biayaSaus = repo.biayaBahanEksperimen(db, repo.eksperimenResep(db, saus.id)[0].id).total;
  assert.ok(biayaSaus > 0);

  assert.ok(repo.pilihanResepTambahan(db, brownies).some((r) => r.id === saus.id));
  const rt = repo.tambahResepTambahan(db, brownies, saus.id);
  db.simpan('ResepTambahan', { ...rt, jumlah: 50 }); // 50 gram dari 200 gram
  let hasil = repo.dataHPP(db, brownies);
  assert.equal(Math.round(hasil.tambahan.total), Math.round(biayaSaus / 4));
  assert.equal(Math.round(hasil.hpp.totalResep), Math.round(awal.hpp.totalResep + biayaSaus / 4));
  assert.equal(hasil.tambahan.bermasalah.length, 0);

  db.simpan('ResepTambahan', { ...db.ambil('ResepTambahan', rt.id), jumlah: 2, satuan: 'resep' });
  hasil = repo.dataHPP(db, brownies);
  assert.equal(Math.round(hasil.tambahan.total), Math.round(biayaSaus * 2));

  // Saus tidak boleh memakai brownies (brownies sudah memakai saus).
  assert.equal(repo.pilihanResepTambahan(db, saus.id).some((r) => r.id === brownies), false);
  assert.equal(repo.pilihanResepTambahan(db, brownies).some((r) => r.id === saus.id), false, 'tidak ditawarkan dua kali');
  // Bila tetap terjadi (mis. dari dua perangkat), perhitungan tidak berputar selamanya.
  db.simpan('ResepTambahan', { idResep: saus.id, idResepKomponen: brownies, jumlah: 1, satuan: 'porsi', urutan: 0 });
  hasil = repo.dataHPP(db, brownies);
  assert.ok(Number.isFinite(hasil.hpp.totalResep));

  // Menghapus resep saus melepasnya dari HPP brownies.
  repo.hapusResep(db, saus.id);
  assert.equal(repo.dataHPP(db, brownies).tambahan.rincian.length, 0);
  assert.equal(Math.round(repo.dataHPP(db, brownies).hpp.totalResep), Math.round(awal.hpp.totalResep));
});

test('ganti server: semua baris dikirim ulang dan ditarik dari awal', async () => {
  const db = await dbBaru();
  muatContoh(db);
  for (const [t, baris] of Object.entries(db.ambilKotor())) for (const r of baris) db.tandaiBersih(t, r.id, r.diubah);
  db.aturMeta({ sinkronTerakhir: 123 });
  assert.equal(db.jumlahKotor(), 0);
  db.tandaiSemuaKotor();
  assert.ok(db.jumlahKotor() > 50);
  assert.equal(db.meta.sinkronTerakhir, 0);
});

test('petunjuk penilaian ikut ke eksperimen baru dan duplikat, catatan chef tidak', async () => {
  const db = await dbBaru();
  const { brownies } = muatContoh(db);
  const daftar = repo.eksperimenResep(db, brownies);
  const terakhir = daftar[daftar.length - 1];
  db.simpan('Eksperimen', { ...terakhir, panduanNilai: { tekstur: 'Kriuk' }, catatanChef: 'Catatan lama' });
  const baru = repo.draftEksperimen(db, brownies);
  assert.deepEqual(baru.eksperimen.panduanNilai, { tekstur: 'Kriuk' });
  assert.equal(baru.eksperimen.catatanChef, '');
  const dup = repo.draftEksperimen(db, brownies, terakhir.id);
  assert.deepEqual(dup.eksperimen.panduanNilai, { tekstur: 'Kriuk' });
  assert.equal(dup.eksperimen.catatanChef, '');
  // Kolom baru ikut terkirim dan terbaca kembali dengan tipe yang benar.
  const kirim = keBaris('Eksperimen', db.ambil('Eksperimen', terakhir.id));
  assert.equal(typeof kirim.panduanNilai, 'string');
  assert.deepEqual(dariBaris('Eksperimen', kirim).panduanNilai, { tekstur: 'Kriuk' });
  assert.equal(dariBaris('Eksperimen', kirim).catatanChef, 'Catatan lama');
});
