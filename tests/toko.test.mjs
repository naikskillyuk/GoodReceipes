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

test('produksi memotong bahan; hasil dikirim ke stok setelah dicek (lolos + reject); dibatalkan kembali', async () => {
  const { db, brownies } = await dbContoh();
  const r = toko.rencanaProduksi(db, brownies, 2);
  assert.equal(r.porsi, 16);
  assert.equal(r.hasil, 32);
  assert.ok(r.bahan.length > 0);
  assert.equal(r.kurang.length, r.bahan.length, 'stok kosong: semua kurang');

  const prd = toko.catatProduksi(db, { idResep: brownies, kali: 2, hasil: 30 });
  assert.ok(prd.hppPorsi > 0);
  assert.equal(toko.stokMakanan(db).get(brownies) || 0, 0, 'hasil produksi tidak otomatis masuk stok');
  assert.deepEqual(toko.statusKirimProduksi(db, prd), { hasil: 30, terkirim: 0, reject: 0, sisa: 30 });
  // Dicek: 27 lolos, 2 reject, 1 masih menunggu.
  toko.kirimProduksiKeStok(db, prd.id, { kirim: 27, reject: 2, catatan: 'gosong' });
  assert.equal(toko.stokMakanan(db).get(brownies), 27);
  assert.deepEqual(toko.statusKirimProduksi(db, db.ambil('Produksi', prd.id)), { hasil: 30, terkirim: 27, reject: 2, sisa: 1 });
  assert.throws(() => toko.kirimProduksiKeStok(db, prd.id, { kirim: 2 }), /Paling banyak 1/);
  assert.throws(() => toko.kirimProduksiKeStok(db, prd.id, {}), /Isi jumlah/);
  toko.kirimProduksiKeStok(db, prd.id, { reject: 1 });
  assert.equal(toko.produksiBelumMasuk(db).length, 0, 'semua sudah dikirim / reject');
  assert.equal(toko.stokMakanan(db).get(brownies), 27);
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

test('promo khusus produk: potongan Rp / persen, berlaku kelipatan atau sekali per pesanan', async () => {
  const { db, brownies } = await dbContoh();
  const mix = toko.tambahMenu(db, 'resep', brownies, { nama: 'Paket MIX', harga: 25000 });
  const lain = toko.tambahMenu(db, 'resep', brownies, { nama: 'Kue lain', harga: 10000 });
  const item = (n, m = 0) => [{ idMenu: mix.id, harga: 25000, jumlah: n }, ...(m ? [{ idMenu: lain.id, harga: 10000, jumlah: m }] : [])];
  const hitung = (promo, n, m = 0) => toko.hitungPromo({ aktif: true, idMenu: mix.id, ...promo }, { subtotal: n * 25000 + m * 10000, item: item(n, m), namaProduk: 'Paket MIX' });

  // Rupiah, kelipatan tiap 2: beli 2 -> 1x, beli 5 -> 2x.
  const rp = { jenis: 'nominal', nilai: 5000, minJumlah: 2, berlaku: 'kelipatan' };
  assert.match(hitung(rp, 1).galat, /minimal 2 Paket MIX/);
  assert.equal(hitung(rp, 2).diskon, 5000);
  assert.equal(hitung(rp, 5, 3).diskon, 10000, 'produk lain tidak dihitung');
  assert.match(hitung(rp, 0, 3).galat, /khusus untuk Paket MIX/);
  // Rupiah, sekali per pesanan.
  assert.equal(hitung({ ...rp, berlaku: 'sekali' }, 6).diskon, 5000);
  // Persen, kelipatan per item: semua item produk itu.
  assert.equal(hitung({ jenis: 'persen', nilai: 10, minJumlah: 1 }, 3, 2).diskon, 7500);
  // Persen, kelipatan tiap 2: beli 5 -> diskon untuk 4 item.
  assert.equal(hitung({ jenis: 'persen', nilai: 10, minJumlah: 2 }, 5).diskon, 10000);
  // Persen, sekali per pesanan: hanya untuk minJumlah item, dan tetap kena batas maks.
  assert.equal(hitung({ jenis: 'persen', nilai: 10, minJumlah: 2, berlaku: 'sekali' }, 5).diskon, 5000);
  assert.equal(hitung({ jenis: 'persen', nilai: 50, minJumlah: 1, maksDiskon: 20000 }, 4).diskon, 20000);
  // Potongan tidak melebihi nilai produk itu.
  assert.equal(hitung({ jenis: 'nominal', nilai: 40000, minJumlah: 1 }, 1, 5).diskon, 25000);

  // Lewat kasir: varian dengan pilihan tambahan tetap dihitung satu produk.
  db.simpan('Promo', { kode: 'MIX5', jenis: 'nominal', nilai: 5000, idMenu: mix.id, minJumlah: 2, berlaku: 'kelipatan', aktif: true, online: true });
  const p = toko.buatPesanan(db, { keranjang: [{ idMenu: mix.id, jumlah: 3 }, { idMenu: lain.id, jumlah: 1 }, { idMenu: mix.id, jumlah: 1, harga: 27000 }], kodePromo: 'mix5' });
  assert.equal(p.subtotal, 3 * 25000 + 10000 + 27000);
  assert.equal(p.diskon, 10000);
  assert.equal(p.total, p.subtotal - 10000);
  assert.throws(() => toko.buatPesanan(db, { keranjang: [{ idMenu: lain.id, jumlah: 4 }], kodePromo: 'MIX5' }), /khusus untuk Paket MIX/);
  assert.equal(toko.syaratPromoProduk('Paket MIX', { minJumlah: 2, berlaku: 'kelipatan' }), 'Paket MIX · tiap beli 2 (kelipatan)');
  assert.equal(toko.syaratPromoProduk('Paket MIX', { minJumlah: 1, berlaku: 'sekali' }), 'Paket MIX · sekali per pesanan');
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

test('transfer/QRIS manual: info rekening + QRIS, pesanan online menunggu jadi baru saat ditandai lunas', async () => {
  const { db, brownies } = await dbContoh();
  const menu = toko.tambahMenu(db, 'resep', brownies);
  db.simpan('Menu', { ...menu, harga: 10000 });
  toko.ubahStokMakanan(db, brownies, { jenis: 'koreksi', nilai: 10 });

  assert.equal(toko.pakaiMayar(db), false, 'Mayar mati bila belum diaktifkan');
  toko.simpanPembayaranManual(db, {
    rekening: [{ bank: ' BCA ', nomor: '123-456 789x', atasNama: 'Rasa Teras' }, { bank: '', nomor: '999' }],
    qris: 'data:image/png;base64,AAAA',
  });
  assert.deepEqual(toko.rekeningToko(db), [{ bank: 'BCA', nomor: '123-456 789', atasNama: 'Rasa Teras' }]);
  assert.equal(toko.qrisToko(db), 'data:image/png;base64,AAAA');
  toko.simpanPembayaranManual(db, { qris: '' });
  assert.equal(toko.qrisToko(db), '');

  // Pesanan dari link pemesanan (dibuat server): menunggu + tagihan transfer menunggu, stok belum dipotong.
  const p = db.simpan('Pesanan', { nomor: '2910-ABC', sumber: 'online', item: [{ idMenu: menu.id, nama: 'Brownies', harga: 10000, jumlah: 3 }], subtotal: 30000, diskon: 0, total: 30000, status: 'menunggu', waktu: Date.now() });
  db.simpan('Pembayaran', { idPesanan: p.id, metode: 'transfer', jumlah: 30000, status: 'menunggu', waktu: Date.now() });
  const s = toko.statusBayar(db, p.id);
  assert.ok(s.menungguTransfer && !s.menunggu && !s.lunas);
  assert.equal(toko.stokMakanan(db).get(brownies), 10);

  toko.bayarTransfer(db, p);
  const sesudah = toko.statusBayar(db, p.id);
  assert.equal(sesudah.lunas, true);
  assert.equal(sesudah.daftar.length, 1, 'tagihan yang menunggu dipakai, bukan baris baru');
  assert.equal(db.ambil('Pesanan', p.id).status, 'baru');
  assert.equal(toko.stokMakanan(db).get(brownies), 7, 'stok dipotong saat lunas');
});

test('testimoni: admin menulis, sembunyikan, dan hanya yang tayang ikut ditampilkan', async () => {
  const { db } = await dbContoh();
  assert.throws(() => toko.simpanTestimoni(db, { nama: 'A', isi: 'ok' }), /minimal/);
  const a = toko.simpanTestimoni(db, { nama: 'Sari', isi: 'Browniesnya lembut banget!', bintang: 9 });
  assert.equal(a.bintang, 5);
  assert.equal(a.sumber, 'admin');
  db.simpan('Testimoni', { nama: 'Budi', isi: 'Enak, pengiriman cepat', bintang: 4, tampil: false, sumber: 'pembeli', waktu: Date.now() + 1 });
  assert.equal(toko.testimoniTampil(db).length, 1);
  assert.equal(toko.daftarTestimoni(db)[0].nama, 'Budi', 'yang menunggu persetujuan tampil paling atas');
  toko.simpanTestimoni(db, { id: a.id, nama: 'Sari', isi: 'Browniesnya lembut banget!', bintang: 5, tampil: false });
  assert.equal(toko.testimoniTampil(db).length, 0);
});

test('diskon produk: harga jual dibulatkan, kedaluwarsa, dan dipakai di keranjang kasir', async () => {
  const { db, brownies } = await dbContoh();
  const menu = toko.tambahMenu(db, 'resep', brownies);
  const m = db.simpan('Menu', { ...menu, harga: 12500, diskon: 15 });
  assert.equal(toko.diskonBerlaku(m), 15);
  assert.equal(toko.hargaJual(m), 10600, '12.500 - 15% = 10.625, dibulatkan ke Rp 100');
  assert.equal(toko.itemKeranjang(db, [{ idMenu: m.id, jumlah: 2 }]).subtotal, 21200);
  assert.equal(toko.hargaJual({ ...m, diskon: 150 }), 1300, 'diskon dibatasi 90%');
  const lewat = { ...m, diskonSampai: Date.now() - 1000 };
  assert.equal(toko.diskonBerlaku(lewat), 0);
  assert.equal(toko.hargaJual(lewat), 12500);
  assert.equal(toko.hargaJual({ ...m, diskon: 0 }), 12500);
  assert.equal(toko.labelDiskon(m), '-15%');
});

test('diskon produk potongan Rupiah: dikurangkan langsung, tidak melebihi harga', async () => {
  const { db, brownies } = await dbContoh();
  const menu = toko.tambahMenu(db, 'resep', brownies);
  const m = db.simpan('Menu', { ...menu, harga: 12500, diskon: 2050, diskonJenis: 'nominal' });
  assert.equal(toko.diskonBerlaku(m), 2050);
  assert.equal(toko.hargaJual(m), 10450, 'tanpa pembulatan');
  assert.equal(toko.labelDiskon(m), '-Rp 2.050');
  assert.equal(toko.itemKeranjang(db, [{ idMenu: m.id, jumlah: 2 }]).subtotal, 20900);
  assert.equal(toko.hargaJual({ ...m, diskon: 99999 }), 0, 'potongan dibatasi harga');
  assert.equal(toko.hargaJual({ ...m, diskonSampai: Date.now() - 1000 }), 12500, 'kedaluwarsa');
});

test('pilihan tambahan (varian): harga ditambahkan, hanya pilihan yang ada, nama item lengkap', async () => {
  const { db, brownies } = await dbContoh();
  const menu = toko.tambahMenu(db, 'resep', brownies);
  const m = db.simpan('Menu', { ...menu, harga: 10000, diskon: 10, opsi: [{ nama: 'Digoreng', harga: 2000 }, { nama: 'Tambah keju', harga: 3000.4 }, { nama: 'digoreng', harga: 9 }, { nama: '', harga: 1 }] });
  assert.deepEqual(toko.opsiMenu(m), [{ nama: 'Digoreng', harga: 2000 }, { nama: 'Tambah keju', harga: 3000 }], 'nama kosong dan dobel dibuang');
  const { item, subtotal } = toko.itemKeranjang(db, [
    { idMenu: m.id, jumlah: 2, opsi: ['tambah keju', 'Digoreng', 'Palsu'] },
    { idMenu: m.id, jumlah: 1 },
  ]);
  assert.deepEqual(item[0].opsi, ['Digoreng', 'Tambah keju'], 'urutan seperti di menu, pilihan palsu dibuang');
  assert.equal(item[0].harga, 9000 + 5000, 'harga setelah diskon + pilihan');
  assert.equal(item[1].opsi, undefined);
  assert.equal(subtotal, 14000 * 2 + 9000);
  assert.equal(toko.namaItem(item[0]), 'Brownies Fudgy (Digoreng, Tambah keju)');
  assert.notEqual(toko.kunciBaris(m.id, ['Digoreng']), toko.kunciBaris(m.id));
  assert.equal(toko.kunciBaris(m.id, ['B', 'a']), toko.kunciBaris(m.id, ['A', 'b']));
  const p = toko.buatPesanan(db, { keranjang: [{ idMenu: m.id, jumlah: 1, opsi: ['Digoreng'] }] });
  assert.deepEqual(p.item[0].opsi, ['Digoreng']);
  assert.equal(p.total, 11000);
});

test('produksi ke stok produk: sebagian, impor nanti, dan tambah stok tanpa produksi', async () => {
  const { db, brownies } = await dbContoh();
  // Hasil 16, hanya 14 yang masuk stok (2 untuk icip).
  const p = toko.catatProduksi(db, { idResep: brownies, kali: 1, hasil: 16, masukStok: 14 });
  assert.equal(toko.stokMakanan(db).get(brownies), 14);
  assert.equal(toko.sudahMasukStok(db, p), 14);
  assert.deepEqual(toko.produksiBelumMasuk(db).map((x) => x.sisa), [2]);
  assert.throws(() => toko.masukkanProduksiKeStok(db, p.id, 5), /Paling banyak 2/);
  toko.masukkanProduksiKeStok(db, p.id);
  assert.equal(toko.stokMakanan(db).get(brownies), 16);
  assert.equal(toko.produksiBelumMasuk(db).length, 0);

  // Dicatat tanpa masuk stok, lalu diimpor sebagian.
  const q = toko.catatProduksi(db, { idResep: brownies, kali: 1, hasil: 10, masukStok: 0 });
  assert.equal(toko.stokMakanan(db).get(brownies), 16);
  toko.masukkanProduksiKeStok(db, q.id, 4);
  assert.equal(toko.stokMakanan(db).get(brownies), 20);
  assert.equal(toko.produksiBelumMasuk(db)[0].sisa, 6);

  // Tambah stok langsung.
  toko.ubahStokMakanan(db, brownies, { jenis: 'masuk', nilai: 5, catatan: 'stok awal' });
  assert.equal(toko.stokMakanan(db).get(brownies), 25);
  assert.ok(toko.riwayatMakanan(db, brownies).some((m) => m.jenis === 'masuk' && m.jumlah === 5 && m.catatan === 'stok awal'));

  // Membatalkan produksi menghapus juga stok yang sudah diimpor darinya.
  toko.hapusProduksi(db, q.id);
  assert.equal(toko.stokMakanan(db).get(brownies), 21);
});

test('banner & header: simpan, urutan, tampil di etalase/kasir, foto header', async () => {
  const { db } = await dbContoh();
  assert.throws(() => toko.simpanBanner(db, { judul: '  ' }), /judul/);
  const a = toko.simpanBanner(db, { judul: 'Pre-order Lebaran', teks: 'Pesan sebelum 20 Maret', aksi: 'promo', nilai: 'LEBARAN', tombol: 'Pakai kode', warna: 'kuning', tampilDi: 'etalase' });
  const b = toko.simpanBanner(db, { judul: 'Jam buka', warna: 'ungu', aksi: 'aneh', tampilDi: 'kasir' });
  const c = toko.simpanBanner(db, { judul: 'Follow IG', tampilDi: 'semua', foto: 'data:image/png;base64,AAAA' });
  assert.equal(b.warna, 'hijau', 'warna tak dikenal jadi hijau');
  assert.equal(b.aksi, '');
  assert.equal(c.fotoLokal, 'data:image/png;base64,AAAA');
  assert.deepEqual(toko.daftarBanner(db).map((x) => x.judul), ['Pre-order Lebaran', 'Jam buka', 'Follow IG']);
  assert.deepEqual(toko.daftarBanner(db, { tampilDi: 'etalase' }).map((x) => x.judul), ['Pre-order Lebaran', 'Follow IG']);
  assert.deepEqual(toko.daftarBanner(db, { tampilDi: 'kasir' }).map((x) => x.judul), ['Jam buka', 'Follow IG']);
  toko.geserBanner(db, c.id, -1);
  assert.deepEqual(toko.daftarBanner(db).map((x) => x.judul), ['Pre-order Lebaran', 'Follow IG', 'Jam buka']);
  db.simpan('Banner', { ...db.ambil('Banner', a.id), aktif: false });
  assert.deepEqual(toko.daftarBanner(db, { tampilDi: 'etalase', hanyaAktif: true }).map((x) => x.judul), ['Follow IG']);
  toko.simpanBanner(db, { id: a.id, judul: 'Pre-order Lebaran!', aktif: true });
  assert.equal(db.ambil('Banner', a.id).judul, 'Pre-order Lebaran!');
  assert.equal(db.ambil('Banner', a.id).urutan, 0, 'urutan tetap saat diubah');

  toko.simpanFotoHeader(db, 'etalase', 'data:image/jpeg;base64,BBBB');
  toko.simpanFotoHeader(db, 'kasir', 'data:image/jpeg;base64,CCCC');
  assert.equal(toko.fotoHeader(db, 'etalase'), 'data:image/jpeg;base64,BBBB');
  assert.equal(toko.fotoHeader(db, 'kasir'), 'data:image/jpeg;base64,CCCC');
  toko.simpanFotoHeader(db, 'kasir', '');
  assert.equal(toko.fotoHeader(db, 'kasir'), '');
});
