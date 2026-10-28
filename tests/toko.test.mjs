// Tes stok bahan, produksi, stok makanan, menu, pesanan, pembayaran, pelanggan, dan promo.

import test from 'node:test';
import assert from 'node:assert/strict';
import { buatDB, penyimpananMemori } from '../js/lib/db.js';
import * as repo from '../js/lib/repo.js';
import * as toko from '../js/lib/toko.js';
import { muatContoh } from '../js/lib/seed.js';

async function dbContoh() {
  const db = buatDB(penyimpananMemori());
  await db.muat();
  repo.pastikanKategoriAwal(db);
  const { brownies } = muatContoh(db);
  return { db, brownies };
}

test('belanja menambah stok bahan (satuan dasar) dan bisa memperbarui harga', async () => {
  const { db } = await dbContoh();
  const bahan = db.semua('Bahan')[0];
  const isi = toko.isiKemasanDasar(bahan);
  toko.catatBelanja(db, [{ idBahan: bahan.id, jumlahKemasan: 3, hargaTotal: bahan.hargaBeli * 3 + 3000, perbaruiHarga: true }], { tempat: 'Pasar' });
  assert.equal(toko.stokBahan(db).get(bahan.id), 3 * isi);
  assert.equal(db.ambil('Bahan', bahan.id).hargaBeli, bahan.hargaBeli + 1000, 'harga per kemasan dari belanja');
  assert.equal(db.ambil('Bahan', bahan.id).beliDi, 'Pasar');

  toko.koreksiStokBahan(db, bahan.id, 10);
  assert.equal(toko.stokBahan(db).get(bahan.id), 10);
  const s = toko.daftarStokBahan(db).find((x) => x.bahan.id === bahan.id);
  assert.equal(s.stok, 10);
  db.simpan('Bahan', { ...db.ambil('Bahan', bahan.id), stokMinimum: 50 });
  assert.equal(toko.daftarStokBahan(db).find((x) => x.bahan.id === bahan.id).menipis, true);
});

test('produksi memotong bahan sesuai resep dan menambah stok makanan; dibatalkan kembali', async () => {
  const { db, brownies } = await dbContoh();
  const r = toko.rencanaProduksi(db, brownies, 2);
  assert.equal(r.porsi, 16);
  assert.equal(r.hasil, 32);
  assert.ok(r.bahan.length > 0);
  assert.equal(r.kurang.length, r.bahan.length, 'stok kosong: semua kurang');

  const prd = toko.catatProduksi(db, { idResep: brownies, kali: 2, hasil: 30 });
  assert.ok(prd.hppPorsi > 0);
  assert.equal(toko.stokMakanan(db).get(brownies), 30);
  const stok = toko.stokBahan(db);
  for (const b of r.bahan) assert.equal(Math.round(stok.get(b.bahan.id) * 1000) / 1000, -b.butuh);

  toko.hapusProduksi(db, prd.id);
  assert.equal(toko.stokMakanan(db).get(brownies) || 0, 0);
  assert.equal(db.semua('MutasiBahan').length, 0);
});

test('menu resep dan paket: sisa stok, pesanan kasir memotong stok, batal mengembalikan', async () => {
  const { db, brownies } = await dbContoh();
  const saus = repo.buatResep(db, { nama: 'Saus', idKategori: repo.daftarKategori(db)[0].id });
  db.simpan('MutasiMakanan', { idResep: brownies, jumlah: 10, jenis: 'produksi', waktu: 1 });
  db.simpan('MutasiMakanan', { idResep: saus.id, jumlah: 3, jenis: 'produksi', waktu: 1 });
  const paket = repo.buatPaket(db, 'Paket Berdua');
  db.simpan('IsiPaket', { ...repo.tambahIsiPaket(db, paket.id, brownies), jumlah: 2 });
  repo.tambahIsiPaket(db, paket.id, saus.id);

  const mBrownies = toko.tambahMenu(db, 'resep', brownies);
  assert.equal(mBrownies.harga, 8000, 'harga jual dari HPP Jual');
  assert.ok(mBrownies.fotoUrl);
  const mPaket = toko.tambahMenu(db, 'paket', paket.id);
  assert.ok(mPaket.harga > 0, 'harga saran paket dari margin target');
  const pilihan = toko.pilihanMenu(db).map((p) => p.id);
  assert.ok(pilihan.includes(saus.id) && !pilihan.includes(brownies) && !pilihan.includes(paket.id));
  assert.equal(toko.sisaMenu(db, mPaket), 3, 'min(10/2, 3/1)');

  const p = toko.buatPesanan(db, { keranjang: [{ idMenu: mPaket.id, jumlah: 2 }, { idMenu: mBrownies.id, jumlah: 1 }], nama: 'Ani', hp: '0812-1111-2222' });
  assert.equal(p.subtotal, mPaket.harga * 2 + 8000);
  assert.equal(p.status, 'baru');
  assert.equal(p.idPelanggan, 'plg_6281211112222');
  assert.equal(toko.stokMakanan(db).get(brownies), 10 - 4 - 1);
  assert.equal(toko.stokMakanan(db).get(saus.id), 1);
  toko.potongStokPesanan(db, p);
  assert.equal(toko.stokMakanan(db).get(brownies), 5, 'tidak terpotong dua kali');
  assert.deepEqual(toko.kurangStok(db, [{ idMenu: mPaket.id, jumlah: 2 }]).map((k) => k.resep.id), [saus.id]);

  assert.equal(toko.statusBayar(db, p.id).lunas, false);
  assert.throws(() => toko.bayarTunai(db, p, p.total - 1), /kurang/);
  const bayar = toko.bayarTunai(db, p, 100000);
  assert.equal(bayar.kembalian, 100000 - p.total);
  assert.equal(toko.statusBayar(db, p.id).lunas, true);
  const r = toko.ringkasPenjualan(db, { sejak: 0 });
  assert.equal(r.omzet, p.total);
  assert.equal(r.jumlahPesanan, 1);

  toko.ubahStatusPesanan(db, p.id, 'batal');
  assert.equal(toko.stokMakanan(db).get(brownies), 10);
  assert.equal(toko.ringkasPenjualan(db, { sejak: 0 }).jumlahPesanan, 0);
  toko.ubahStatusPesanan(db, p.id, 'baru');
  assert.equal(toko.stokMakanan(db).get(brownies), 5, 'dibuka lagi: stok dipotong lagi');

  // Menghapus resep melepasnya dari menu.
  repo.hapusResep(db, brownies);
  assert.equal(db.ambil('Menu', mBrownies.id), null);
});

test('promo: persen dengan batas, minimal belanja, pelanggan baru/lama, kuota, online', async () => {
  const { db, brownies } = await dbContoh();
  const menu = toko.tambahMenu(db, 'resep', brownies);
  const promo = { kode: 'hemat', jenis: 'persen', nilai: 20, maksDiskon: 5000, minBelanja: 10000, untuk: 'baru', kuota: 2, aktif: true, online: false };
  db.simpan('Promo', promo);
  assert.equal(toko.hitungPromo(promo, { subtotal: 40000 }).diskon, 5000, 'dibatasi maks');
  assert.equal(toko.hitungPromo(promo, { subtotal: 20000 }).diskon, 4000);
  assert.match(toko.hitungPromo(promo, { subtotal: 8000 }).galat, /Minimal/);
  assert.match(toko.hitungPromo(promo, { subtotal: 20000, online: true }).galat, /hanya berlaku di toko/);
  assert.match(toko.hitungPromo({ ...promo, sampai: 5 }, { subtotal: 20000, sekarang: 10 }).galat, /berakhir/);
  assert.equal(toko.hitungPromo({ jenis: 'nominal', nilai: 50000, aktif: true }, { subtotal: 16000 }).diskon, 16000, 'tidak melebihi subtotal');

  const p1 = toko.buatPesanan(db, { keranjang: [{ idMenu: menu.id, jumlah: 2 }], hp: '081200000001', kodePromo: 'HEMAT' });
  assert.equal(p1.diskon, 3200);
  assert.equal(p1.total, 12800);
  assert.equal(p1.kodePromo, 'HEMAT');
  assert.throws(() => toko.buatPesanan(db, { keranjang: [{ idMenu: menu.id, jumlah: 2 }], hp: '081200000001', kodePromo: 'hemat' }), /pelanggan baru/);
  toko.buatPesanan(db, { keranjang: [{ idMenu: menu.id, jumlah: 2 }], hp: '081200000002', kodePromo: 'hemat' });
  assert.throws(() => toko.buatPesanan(db, { keranjang: [{ idMenu: menu.id, jumlah: 2 }], hp: '081200000003', kodePromo: 'hemat' }), /Kuota/);
  assert.throws(() => toko.buatPesanan(db, { keranjang: [{ idMenu: menu.id, jumlah: 1 }], kodePromo: 'TIDAKADA' }), /tidak ditemukan/);
  assert.throws(() => toko.buatPesanan(db, { keranjang: [{ idMenu: menu.id, jumlah: 1 }], hp: '123' }), /WhatsApp/);
  assert.equal(toko.daftarPromo(db)[0].dipakai, 2);

  const pel = toko.daftarPelanggan(db);
  assert.equal(pel.length, 2);
  assert.equal(pel.find((x) => x.pelanggan.hp === '6281200000001').totalBelanja, 12800);
});

test('nomor WhatsApp dan nomor pesanan', () => {
  assert.equal(toko.normalHp('0812-3456-789'), '628123456789');
  assert.equal(toko.normalHp('+62 812 3456 789'), '628123456789');
  assert.equal(toko.normalHp('812345678'), '62812345678');
  assert.equal(toko.normalHp('12'), '');
  assert.equal(toko.tampilHp('628123456789'), '0812-3456-789');
  assert.match(toko.nomorPesanan(new Date(2026, 9, 28).getTime()), /^2810-[A-Z2-9]{3}$/);
  assert.deepEqual(toko.saranUang(23500), [23500, 25000, 30000, 50000]);
});

test('pesanan manual: item di luar menu, ongkir, jadwal, transfer, dan ubah pesanan', async () => {
  const { db, brownies } = await dbContoh();
  const menu = toko.tambahMenu(db, 'resep', brownies);
  db.simpan('Menu', { ...menu, harga: 10000 });
  toko.ubahStokMakanan(db, brownies, { jenis: 'koreksi', nilai: 10 });
  const jadwal = Date.now() + 86400000;

  const p = toko.buatPesanan(db, {
    keranjang: [{ idMenu: menu.id, jumlah: 2 }, { nama: 'Kue ulang tahun 20 cm', harga: 150000, jumlah: 1 }, { nama: '  ', harga: 5000, jumlah: 1 }],
    nama: 'Sari', hp: '0812 9999 8888', sumber: 'manual', saluran: 'WhatsApp', jadwal, alamat: 'Jl. Melati 3', ongkir: 15000,
  });
  assert.equal(p.sumber, 'manual');
  assert.equal(p.item.length, 2, 'baris tanpa nama diabaikan');
  assert.equal(p.item[1].idMenu, '');
  assert.equal(p.subtotal, 170000);
  assert.equal(p.ongkir, 15000);
  assert.equal(p.total, 185000);
  assert.equal(p.jadwal, jadwal);
  assert.equal(p.saluran, 'WhatsApp');
  assert.equal(toko.stokMakanan(db).get(brownies), 8, 'hanya item menu yang memotong stok');
  assert.ok(db.ambil('Pelanggan', 'plg_6281299998888'));

  // Kasir tidak menyimpan ongkir / jadwal.
  const k = toko.buatPesanan(db, { keranjang: [{ idMenu: menu.id, jumlah: 1 }], ongkir: 9000, jadwal });
  assert.equal(k.sumber, 'kasir');
  assert.equal(k.total, 10000);
  assert.equal(k.jadwal, undefined);

  // Ubah: harga lama dipertahankan walau harga menu naik; stok dihitung ulang.
  db.simpan('Menu', { ...db.ambil('Menu', menu.id), harga: 12000 });
  assert.ok(toko.bisaDiubah(db, p));
  const u = toko.ubahPesanan(db, p.id, {
    keranjang: [{ idMenu: menu.id, nama: 'Brownies', harga: 10000, jumlah: 5 }],
    nama: 'Sari', hp: '6281299998888', saluran: 'Telepon', jadwal, alamat: '', ongkir: 0,
  });
  assert.equal(u.nomor, p.nomor);
  assert.equal(u.total, 50000);
  assert.equal(u.saluran, 'Telepon');
  assert.equal(toko.stokMakanan(db).get(brownies), 10 - 1 - 5);

  toko.bayarTransfer(db, u);
  assert.equal(toko.statusBayar(db, u.id).bayar.metode, 'transfer');
  assert.equal(toko.bisaDiubah(db, u), false, 'sudah lunas');
  assert.throws(() => toko.ubahPesanan(db, u.id, { keranjang: [{ idMenu: menu.id, jumlah: 1 }] }), /tidak bisa diubah/);
  assert.equal(toko.ringkasPenjualan(db).perMetode.transfer, 50000);
  assert.equal(toko.ringkasPenjualan(db).omzet, 50000);
});
