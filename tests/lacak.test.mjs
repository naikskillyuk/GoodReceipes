// Tes lacak pesanan (riwayat status, kendala, timeline pembeli), beranda kasir (follow-up, tren), dan banner gambar saja.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buatDB, penyimpananMemori } from '../js/lib/db.js';
import * as repo from '../js/lib/repo.js';
import * as toko from '../js/lib/toko.js';
import { muatContoh } from '../js/lib/seed.js';
import { langkahPesanan } from '../js/layar/pesan-online.js';

async function siapkan() {
  const db = buatDB(penyimpananMemori());
  await db.muat();
  repo.pastikanKategoriAwal(db);
  const { brownies } = muatContoh(db);
  const menu = toko.tambahMenu(db, 'resep', brownies);
  db.simpan('Menu', { ...menu, harga: 10000 });
  toko.ubahStokMakanan(db, brownies, { jenis: 'koreksi', nilai: 100 });
  return { db, menu: db.ambil('Menu', menu.id) };
}

test('ubah status mencatat riwayat; selesai / batal menghapus kendala', async () => {
  const { db, menu } = await siapkan();
  const p = toko.buatPesanan(db, { keranjang: [{ idMenu: menu.id, jumlah: 1 }], nama: 'Ani' });
  toko.aturKendala(db, p.id, '  Oven bermasalah, mundur 1 jam  ');
  assert.equal(db.ambil('Pesanan', p.id).kendala, 'Oven bermasalah, mundur 1 jam');
  toko.ubahStatusPesanan(db, p.id, 'diproses');
  toko.ubahStatusPesanan(db, p.id, 'siap');
  const q = db.ambil('Pesanan', p.id);
  assert.deepEqual(q.riwayat.map((r) => r.status), ['diproses', 'siap']);
  assert.ok(q.riwayat.every((r) => r.waktu > 0));
  assert.equal(q.kendala, 'Oven bermasalah, mundur 1 jam', 'kendala tetap selama pesanan berjalan');
  toko.ubahStatusPesanan(db, p.id, 'selesai');
  assert.equal(db.ambil('Pesanan', p.id).kendala, '');
});

test('timeline pembeli: transfer punya langkah bukti, Mayar tidak; langkah selesai sesuai status', () => {
  const dasar = { waktu: 1, status: 'menunggu', lunas: false, metodeBayar: 'transfer', riwayat: [] };
  const awal = langkahPesanan(dasar);
  assert.deepEqual(awal.map((l) => l.kunci), ['dibuat', 'bukti', 'bayar', 'diproses', 'siap', 'selesai']);
  assert.deepEqual(awal.map((l) => l.selesai), [true, false, false, false, false, false]);
  const bukti = langkahPesanan({ ...dasar, buktiPada: 5 });
  assert.equal(bukti.find((l) => l.kunci === 'bukti').selesai, true);
  assert.equal(bukti.find((l) => l.kunci === 'bayar').selesai, false);
  const siap = langkahPesanan({ ...dasar, buktiPada: 5, lunas: true, lunasPada: 6, status: 'siap', caraAmbil: 'ojol', riwayat: [{ status: 'diproses', waktu: 7 }, { status: 'siap', waktu: 8 }] });
  assert.deepEqual(siap.map((l) => l.selesai), [true, true, true, true, true, false]);
  assert.equal(siap.find((l) => l.kunci === 'siap').judul, 'Siap dijemput driver');
  assert.equal(siap.find((l) => l.kunci === 'siap').waktu, 8);
  const mayar = langkahPesanan({ ...dasar, metodeBayar: 'mayar' });
  assert.ok(!mayar.some((l) => l.kunci === 'bukti'));
});

test('follow-up kasir: bukti masuk, belum bayar, baru, diproses, siap; selesai/batal tidak masuk', async () => {
  const { db, menu } = await siapkan();
  const online = (nama, extra = {}) => {
    const p = db.simpan('Pesanan', { nomor: nama, sumber: 'online', nama, item: [{ idMenu: menu.id, nama: 'Brownies', harga: 10000, jumlah: 1 }], total: 10000, status: 'menunggu', waktu: Date.now(), ...extra });
    db.simpan('Pembayaran', { idPesanan: p.id, metode: 'transfer', jumlah: 10000, status: 'menunggu', waktu: Date.now() });
    return p;
  };
  online('Bukti', { buktiPada: Date.now() });
  online('Tagih');
  const kasir = (nama) => toko.buatPesanan(db, { keranjang: [{ idMenu: menu.id, jumlah: 1 }], nama });
  kasir('Baru');
  toko.ubahStatusPesanan(db, kasir('Proses').id, 'diproses');
  const siapNanti = kasir('Siap nanti');
  const siapDulu = kasir('Siap dulu');
  db.simpan('Pesanan', { ...db.ambil('Pesanan', siapNanti.id), jadwal: Date.now() + 7200e3 });
  db.simpan('Pesanan', { ...db.ambil('Pesanan', siapDulu.id), jadwal: Date.now() + 3600e3 });
  toko.ubahStatusPesanan(db, siapNanti.id, 'siap');
  toko.ubahStatusPesanan(db, siapDulu.id, 'siap');
  toko.ubahStatusPesanan(db, kasir('Selesai').id, 'selesai');
  toko.ubahStatusPesanan(db, kasir('Batal').id, 'batal');

  const g = toko.pesananFollowUp(db);
  const nama = (daftar) => daftar.map((p) => p.nama);
  assert.deepEqual(nama(g.konfirmasi), ['Bukti']);
  assert.deepEqual(nama(g.tagih), ['Tagih']);
  assert.deepEqual(nama(g.baru), ['Baru']);
  assert.deepEqual(nama(g.diproses), ['Proses']);
  assert.deepEqual(nama(g.siap), ['Siap dulu', 'Siap nanti'], 'jadwal ambil terdekat dulu');
});

test('tren penjualan: pemasukan per hari, pesanan, rata-rata, belum bayar, menu favorit, periode sebelumnya', async () => {
  const { db, menu } = await siapkan();
  const sekarang = new Date(2026, 9, 29, 15, 0).getTime();
  const hariLalu = (n, jam = 10) => new Date(2026, 9, 29 - n, jam, 0).getTime();
  const pesan = (waktu, item, lunas = true, status = 'baru') => {
    const p = db.simpan('Pesanan', { nomor: 'X', sumber: 'kasir', item, total: item.reduce((j, i) => j + i.harga * i.jumlah, 0), status, waktu });
    if (lunas) db.simpan('Pembayaran', { idPesanan: p.id, metode: 'tunai', jumlah: p.total, status: 'lunas', waktu, lunasPada: waktu });
    return p;
  };
  pesan(hariLalu(0), [{ idMenu: menu.id, nama: 'Brownies', harga: 10000, jumlah: 3 }]);
  pesan(hariLalu(0, 12), [{ idMenu: 'mnu_kopi', nama: 'Es Kopi', harga: 15000, jumlah: 1 }]);
  pesan(hariLalu(2), [{ idMenu: menu.id, nama: 'Brownies', harga: 10000, jumlah: 2 }, { idMenu: 'mnu_kopi', nama: 'Es Kopi', harga: 15000, jumlah: 1 }]);
  pesan(hariLalu(1), [{ idMenu: menu.id, nama: 'Brownies', harga: 10000, jumlah: 1 }], false);
  pesan(hariLalu(1), [{ idMenu: menu.id, nama: 'Brownies', harga: 10000, jumlah: 9 }], false, 'batal');
  pesan(hariLalu(9), [{ idMenu: menu.id, nama: 'Brownies', harga: 10000, jumlah: 2 }]); // periode sebelumnya
  pesan(hariLalu(20), [{ idMenu: menu.id, nama: 'Brownies', harga: 10000, jumlah: 5 }]); // di luar keduanya

  const t = toko.trenPenjualan(db, { hari: 7, sekarang });
  assert.equal(t.perHari.length, 7);
  assert.equal(new Date(t.perHari[6].mulai).getDate(), 29, 'hari terakhir = hari ini');
  assert.equal(t.perHari[6].pemasukan, 45000);
  assert.equal(t.perHari[6].pesanan, 2);
  assert.equal(t.perHari[4].pemasukan, 35000);
  assert.equal(t.pemasukan, 80000);
  assert.equal(t.jumlahPesanan, 4, 'pesanan batal tidak dihitung');
  assert.equal(t.rataRata, 20000);
  assert.deepEqual(t.belumBayar, { jumlah: 1, nilai: 10000 });
  assert.deepEqual(t.favorit.map((f) => [f.nama, f.jumlah]), [['Brownies', 6], ['Es Kopi', 2]]);
  assert.equal(t.pemasukanSebelum, 20000);
  assert.equal(t.pesananSebelum, 1);
});

test('banner gambar saja: judul dan teks kosong boleh bila ada gambar', async () => {
  const { db } = await siapkan();
  assert.throws(() => toko.simpanBanner(db, { judul: '', teks: '' }), /gambar/);
  assert.throws(() => toko.simpanBanner(db, { judul: '', teks: 'Ada teks', foto: 'data:image/png;base64,AAAA' }), /judul/);
  const b = toko.simpanBanner(db, { judul: '', teks: '', foto: 'data:image/png;base64,AAAA', aksi: 'menu', tombol: 'Lihat menu' });
  assert.equal(b.judul, '');
  assert.equal(toko.bannerGambarSaja(b), true);
  assert.equal(toko.bannerGambarSaja({ judul: 'Promo' }), false);
});
