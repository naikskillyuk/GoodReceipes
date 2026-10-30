// Tes struk pesanan (data + teks) dan laporan per rentang tanggal.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buatDB, penyimpananMemori } from '../js/lib/db.js';
import * as repo from '../js/lib/repo.js';
import * as toko from '../js/lib/toko.js';
import { muatContoh } from '../js/lib/seed.js';
import { dataStruk, teksStruk, pesanStrukWa } from '../js/lib/struk.js';
import { buatLaporan, rentangPreset, keCsv, tabelCsv, keIsoTanggal, dariIsoTanggal } from '../js/lib/laporan.js';

async function siapkan() {
  const db = buatDB(penyimpananMemori());
  await db.muat();
  repo.pastikanKategoriAwal(db);
  const { brownies } = muatContoh(db);
  const menu = toko.tambahMenu(db, 'resep', brownies);
  db.simpan('Menu', { ...menu, harga: 10000 });
  toko.simpanToko(db, { namaToko: 'Dapur Ani', alamatToko: 'Jl. Melati 5', waToko: '6281200001111' });
  return { db, brownies, menu: db.ambil('Menu', menu.id) };
}

test('struk: data toko, item, diskon, tunai + kembalian, teks rata 32 kolom', async () => {
  const { db, brownies, menu } = await siapkan();
  toko.ubahStokMakanan(db, brownies, { jenis: 'koreksi', nilai: 50 });
  const p = toko.buatPesanan(db, { keranjang: [{ idMenu: menu.id, jumlah: 3 }], nama: 'Budi', hp: '0812 3456 7890', oleh: 'Sari' });
  toko.bayarTunai(db, p, 50000);
  const d = dataStruk(db, p.id);
  assert.equal(d.toko.nama, 'Dapur Ani');
  assert.equal(d.toko.alamat, 'Jl. Melati 5');
  assert.equal(d.kasir, 'Sari');
  assert.equal(d.total, 30000);
  assert.equal(d.lunas, true);
  assert.equal(d.metode, 'Tunai');
  assert.equal(d.diterima, 50000);
  assert.equal(d.kembalian, 20000);

  const teks = teksStruk(d, 32);
  const baris = teks.split('\n');
  assert.ok(baris.every((b) => b.length <= 32), 'tidak ada baris lebih dari 32 karakter');
  assert.ok(baris.some((b) => /^TOTAL\s+Rp 30\.000$/.test(b) && b.length === 32), 'TOTAL rata kanan');
  assert.ok(baris.some((b) => /^Kembali\s+20\.000$/.test(b)));
  assert.ok(teks.includes('DAPUR ANI'));
  assert.ok(/LUNAS/.test(teks));
  assert.match(pesanStrukWa(d), /^Halo Budi, berikut struk pesanan #.+ dari Dapur Ani:\n\n```\n/);
  assert.equal(dataStruk(db, 'tidak-ada'), null);
});

test('struk: belum dibayar dan nama item panjang dibungkus', async () => {
  const { db } = await siapkan();
  const p = db.simpan('Pesanan', { nomor: 'X1', sumber: 'kasir', status: 'baru', waktu: Date.now(), item: [{ nama: 'Risol mayones keju jumbo spesial pedas level lima', opsi: ['Saus extra'], harga: 12500, jumlah: 2 }], total: 25000, diskon: 0, ongkir: 0 });
  const teks = teksStruk(dataStruk(db, p.id), 32);
  assert.ok(teks.split('\n').every((b) => b.length <= 32));
  assert.match(teks, /BELUM DIBAYAR/);
  assert.match(teks, /\+ Saus extra/);
  assert.match(teks, /2 x 12\.500\s+25\.000/);
});

test('rentang preset: bulan lalu, 7 hari, iso tanggal', () => {
  const sekarang = new Date(2026, 9, 30, 15, 0).getTime();
  const b = rentangPreset('bulan-lalu', sekarang);
  assert.equal(keIsoTanggal(b.dari), '2026-09-01');
  assert.equal(keIsoTanggal(b.sampai), '2026-09-30');
  const t = rentangPreset('7-hari', sekarang);
  assert.equal(keIsoTanggal(t.dari), '2026-10-24');
  assert.equal(keIsoTanggal(t.sampai), '2026-10-30');
  assert.equal(dariIsoTanggal('2026-10-24'), t.dari);
  assert.ok(Number.isNaN(dariIsoTanggal('kemarin')));
});

test('laporan: ringkasan, produk terlaris, pelanggan teratas, metode, stok per rentang', async () => {
  const { db, brownies, menu } = await siapkan();
  const hari = (tgl, j = 10) => new Date(2026, 9, tgl, j, 0).getTime();
  db.simpan('MutasiMakanan', { idResep: brownies, jumlah: 40, jenis: 'produksi', idRef: '', catatan: '', waktu: hari(1) });
  db.simpan('MutasiMakanan', { idResep: brownies, jumlah: 20, jenis: 'produksi', idRef: '', catatan: '', waktu: hari(12) });
  db.simpan('MutasiMakanan', { idResep: brownies, jumlah: -2, jenis: 'rusak', idRef: '', catatan: '', waktu: hari(13) });
  const pesan = (tgl, jam, item, { nama = '', hp = '', status = 'selesai', bayar = 'tunai' } = {}) => {
    const total = item.reduce((j, i) => j + i.harga * i.jumlah, 0);
    const p = db.simpan('Pesanan', { nomor: 'N' + tgl + jam, sumber: 'kasir', nama, hp, idPelanggan: hp ? 'plg_' + hp : '', item, total, diskon: 0, ongkir: 0, status, waktu: hari(tgl, jam) });
    if (bayar) db.simpan('Pembayaran', { idPesanan: p.id, metode: bayar, jumlah: total, status: 'lunas', waktu: hari(tgl, jam), lunasPada: hari(tgl, jam) });
    for (const i of item) if (i.idMenu === menu.id) db.simpan('MutasiMakanan', { idResep: brownies, jumlah: -i.jumlah, jenis: 'jual', idRef: p.id, catatan: '', waktu: hari(tgl, jam) });
    return p;
  };
  const br = (n) => ({ idMenu: menu.id, nama: 'Brownies', harga: 10000, jumlah: n });
  const kopi = (n) => ({ idMenu: 'mnu_kopi', nama: 'Es Kopi', harga: 15000, jumlah: n });
  pesan(5, 9, [br(5)], { nama: 'Ani', hp: '628111' }); // sebelum rentang: Ani pelanggan lama
  pesan(10, 9, [br(2)], { nama: 'Ani', hp: '628111' });
  pesan(11, 14, [br(1), kopi(2)], { nama: 'Budi', hp: '628222', bayar: 'transfer' });
  pesan(12, 14, [kopi(1)], { nama: 'Budi', hp: '628222' });
  pesan(12, 15, [br(3)]); // pembeli umum
  pesan(13, 16, [br(1)], { nama: 'Cici', bayar: '' }); // belum bayar
  pesan(13, 17, [br(9)], { nama: 'Dodi', status: 'batal', bayar: '' });
  pesan(20, 9, [br(4)], { nama: 'Eko' }); // setelah rentang

  const lap = buatLaporan(db, { dari: new Date(2026, 9, 10).getTime(), sampai: new Date(2026, 9, 13).getTime() });
  const r = lap.ringkasan;
  assert.equal(lap.hari, 4);
  assert.equal(lap.grafik.satuan, 'hari');
  assert.equal(lap.grafik.ember.length, 4);
  assert.equal(r.jumlahPesanan, 5, 'batal tidak dihitung');
  assert.equal(r.batal, 1);
  assert.equal(r.penjualan, 20000 + 40000 + 15000 + 30000 + 10000);
  assert.equal(r.pemasukan, 20000 + 40000 + 15000 + 30000);
  assert.deepEqual(r.belumBayar, { jumlah: 1, nilai: 10000 });
  assert.equal(r.itemTerjual, 2 + 3 + 1 + 3 + 1);
  assert.equal(r.pembeliUmum, 1);
  assert.equal(r.pelanggan, 3);
  assert.equal(r.pelangganBaru, 2, 'Budi dan Cici baru; Ani sudah pernah pesan');
  assert.equal(lap.pesanan.length, 6, 'semua pesanan di rentang, termasuk batal');
  assert.equal(lap.pesanan[0].nama, 'Dodi', 'terbaru dulu');

  assert.deepEqual(lap.produk.map((x) => [x.nama, x.jumlah, x.penjualan]), [['Brownies', 7, 70000], ['Es Kopi', 3, 45000]]);
  assert.deepEqual(lap.pelanggan.map((c) => [c.nama, c.pesanan, c.belanja, c.baru]), [['Budi', 2, 55000, true], ['Ani', 1, 20000, false], ['Cici', 1, 10000, true]]);
  assert.deepEqual(lap.metode.map((m) => [m.metode, m.jumlah, m.nilai]), [['tunai', 3, 65000], ['transfer', 1, 40000], ['mayar', 0, 0]]);
  assert.equal(lap.perJam[14].pesanan, 2);

  const s = lap.stok.find((x) => x.idResep === brownies);
  assert.equal(s.awal, 35, '40 produksi - 5 terjual sebelum rentang');
  assert.equal(s.produksi, 20);
  assert.equal(s.terjual, 2 + 1 + 3 + 1 + 9, 'mutasi jual pesanan batal masih tercatat di contoh ini');
  assert.equal(s.rusak, 2);
  assert.equal(s.akhir, 35 + 20 - 16 - 2);

  const panjang = buatLaporan(db, { dari: new Date(2026, 0, 1).getTime(), sampai: new Date(2026, 9, 30).getTime() });
  assert.equal(panjang.grafik.satuan, 'bulan');
  assert.equal(panjang.grafik.ember.length, 10);

  const csv = keCsv(tabelCsv(db, lap, 'produk'));
  assert.ok(csv.startsWith('﻿Peringkat;Produk;Terjual'));
  assert.ok(csv.includes('1;Brownies;7;4;70000'));
  assert.equal(keCsv([['a;b', 'c"d']]), '﻿"a;b";"c""d"');
  for (const bagian of ['ringkasan', 'pesanan', 'pelanggan', 'stok']) assert.ok(tabelCsv(db, lap, bagian).length > 1, bagian);
});

test('saring pesanan per status (termasuk belum dibayar) dan CSV ikut tersaring', async () => {
  const { db, menu } = await siapkan();
  const { saringPesanan } = await import('../js/lib/laporan.js');
  const buat = (nama, status, lunas) => {
    const p = db.simpan('Pesanan', { nomor: nama, sumber: 'kasir', nama, status, item: [{ idMenu: menu.id, nama: 'Brownies', harga: 10000, jumlah: 1 }], total: 10000, waktu: Date.now() });
    if (lunas) db.simpan('Pembayaran', { idPesanan: p.id, metode: 'tunai', jumlah: 10000, status: 'lunas', waktu: Date.now(), lunasPada: Date.now() });
  };
  buat('A', 'selesai', true);
  buat('B', 'baru', false);
  buat('C', 'batal', false);
  buat('D', 'menunggu', false);
  const lap = buatLaporan(db, rentangPreset('hari-ini'));
  const nama = (st) => saringPesanan(db, lap.pesanan, st).map((p) => p.nama).sort();
  assert.deepEqual(nama(''), ['A', 'B', 'C', 'D']);
  assert.deepEqual(nama('batal'), ['C']);
  assert.deepEqual(nama('belum-bayar'), ['B', 'D'], 'batal tidak dihitung belum dibayar');
  const csv = tabelCsv(db, lap, 'pesanan', { status: 'selesai' });
  assert.equal(csv.length, 2);
  assert.equal(csv[1][0], 'A');
});

test('hapus pesanan: pembayaran ikut terhapus, stok kembali, hanya admin', async () => {
  const { db, brownies, menu } = await siapkan();
  toko.ubahStokMakanan(db, brownies, { jenis: 'koreksi', nilai: 10 });
  const p = toko.buatPesanan(db, { keranjang: [{ idMenu: menu.id, jumlah: 3 }], nama: 'Uji' });
  toko.bayarTunai(db, p, 30000);
  assert.equal(toko.stokMakanan(db).get(brownies), 7);
  db.pengaturan.akun = { peran: 'toko' };
  assert.throws(() => toko.hapusPesanan(db, p.id), /admin/);
  db.pengaturan.akun = { peran: 'dapur' };
  assert.equal(toko.hapusPesanan(db, p.id), true);
  assert.equal(db.ambil('Pesanan', p.id), null);
  assert.equal(toko.pembayaranPesanan(db, p.id).length, 0);
  assert.equal(toko.stokMakanan(db).get(brownies), 10);
  assert.equal(toko.hapusPesanan(db, p.id), false);
});
