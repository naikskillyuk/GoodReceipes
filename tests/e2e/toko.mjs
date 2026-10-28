// Uji ujung ke ujung: dapur -> belanja -> produksi -> menu -> promo -> kasir (tunai) -> Mayar tiruan
// -> link pemesanan pembeli -> akun toko.
//
//   npm run e2e:toko        (SS=/folder/gambar untuk menyimpan tangkapan layar)

import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright-core');
const { masukUji, cariBrowser } = await import('./bantu.mjs');
const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8800 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
const DATA = path.join(os.tmpdir(), `e2e-toko-${PORT}.json`);
const SS = process.env.SS || '';

const server = spawn(process.execPath, ['tools/dev-server.mjs', '--reset'], { cwd: AKAR, env: { ...process.env, PORT: String(PORT), DATA }, stdio: 'ignore' });
const galat = [];
let langkah = 0;
const tahap = (nama) => console.log(`  ${++langkah}. ${nama}`);
if (SS) fs.mkdirSync(SS, { recursive: true });
const foto = async (page, nama) => SS && (await page.screenshot({ path: path.join(SS, nama + '.png'), fullPage: true }));

async function tungguServer() {
  for (let i = 0; i < 50; i++) {
    try {
      if ((await fetch(BASE)).ok) return;
    } catch {
      /* belum siap */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error('dev-server tidak menyala');
}

function pantau(page, nama) {
  page.on('pageerror', (e) => galat.push(`[${nama}] pageerror: ${e.message}`));
  page.on('console', (m) => {
    const keLaravelLokal = /localhost:8000\//.test((m.location() && m.location().url) || '');
    if (m.type() === 'error' && !keLaravelLokal && !/favicon|manifest|icon|sw\.js|404/.test(m.text())) galat.push(`[${nama}] console: ${m.text()}`);
  });
}

const sisaLebar = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
const evalDb = (page, fn, arg) => page.evaluate(async ([kode, a]) => {
  const toko = await import('/js/lib/toko.js');
  return new Function('db', 'toko', 'a', kode)(window.__app.db, toko, a);
}, [fn, arg]);

let halaman = null;
try {
  await tungguServer();
  const browser = await chromium.launch({ executablePath: await cariBrowser(), args: ['--no-sandbox'] });
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  halaman = page;
  pantau(page, 'dapur');
  console.log('Stok, produksi, kasir, Mayar, link pemesanan, dan akun toko:');

  tahap('masuk sebagai akun dapur dengan data contoh + paket');
  await masukUji(page, BASE);
  const ids = await page.evaluate(async () => {
    const seed = await import('/js/lib/seed.js');
    const repo = await import('/js/lib/repo.js');
    const db = window.__app.db;
    const c = seed.muatContoh(db);
    const paket = repo.buatPaket(db, 'Paket Hemat');
    repo.tambahIsiPaket(db, paket.id, c.brownies);
    return { brownies: c.brownies, paket: paket.id };
  });
  await page.goto(BASE + '/#/');
  await page.getByRole('link', { name: 'Stok & belanja' }).waitFor();

  tahap('catat belanja: stok bahan bertambah');
  await page.goto(BASE + '/#/stok-bahan');
  await page.getByRole('button', { name: 'Catat belanja' }).first().click();
  await page.getByLabel('Bahan baris 1').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Simpan belanja' }).click();
  await page.getByText('Belanja 1 bahan dicatat').waitFor();
  assert.equal(await evalDb(page, 'return db.semua("MutasiBahan").length'), 1);
  await foto(page, '01-stok-bahan');
  assert.ok((await sisaLebar(page)) <= 0, 'stok bahan tidak melebar di HP');

  tahap('produksi 1x brownies: stok makanan +16, bahan terpotong');
  await page.goto(BASE + '/#/produksi?resep=' + ids.brownies);
  await page.getByRole('button', { name: 'Catat produksi' }).click();
  await page.getByRole('button', { name: 'Tetap catat' }).click();
  await page.getByText(/Produksi dicatat: \+16 potong/).waitFor();
  assert.equal(await evalDb(page, 'return toko.stokMakanan(db).get(a)', ids.brownies), 16);
  await foto(page, '02-produksi');

  tahap('menu jual: brownies (harga dari HPP Jual) dan paket');
  await page.goto(BASE + '/#/menu');
  await page.locator('select').first().selectOption('resep:' + ids.brownies);
  await page.getByRole('button', { name: 'Masukkan ke menu' }).click();
  await page.getByText('masuk menu, harga Rp 8.000').waitFor();
  await page.locator('select').first().selectOption('paket:' + ids.paket);
  await page.getByRole('button', { name: 'Masukkan ke menu' }).click();
  await page.getByLabel('Harga Paket Hemat').waitFor();
  await foto(page, '03-menu');

  tahap('promo HEMAT10 (10%)');
  await page.goto(BASE + '/#/pelanggan?tab=promo');
  await page.getByRole('button', { name: 'Promo baru' }).click();
  await page.getByPlaceholder('HEMAT10').fill('hemat10');
  await page.getByRole('button', { name: 'Simpan promo' }).click();
  await page.getByText('Promo HEMAT10 disimpan.').waitFor();

  tahap('kasir: 2 brownies + promo, bayar tunai dengan kembalian');
  await page.goto(BASE + '/#/kasir');
  const tambahBrownies = page.getByRole('button', { name: 'Tambah Brownies Fudgy ke keranjang' });
  await tambahBrownies.click();
  await tambahBrownies.click();
  await page.getByText('Pembeli dan promo (opsional)').click();
  await page.getByLabel('Nama').fill('Budi');
  await page.getByLabel('WhatsApp').fill('0812 3456 7890');
  await page.getByLabel('Kode promo').fill('hemat10');
  await page.getByText('Hemat Rp 1.600').waitFor();
  assert.equal(await page.locator('.total-kasir').innerText(), 'Rp 14.400');
  await foto(page, '04-kasir');
  await page.getByRole('button', { name: 'Buat pesanan & bayar' }).click();
  await page.getByRole('dialog').waitFor();
  await page.getByRole('button', { name: 'Rp 20.000' }).click();
  assert.match(await page.locator('[role=dialog] .hasil-baris b').innerText(), /Rp 5\.600/, 'kembalian');
  await page.getByRole('button', { name: 'Terima Rp 14.400' }).click();
  await page.waitForURL(/#\/kasir$/);
  assert.equal(await evalDb(page, 'return toko.stokMakanan(db).get(a)', ids.brownies), 14);
  assert.equal(await evalDb(page, 'return toko.daftarPelanggan(db)[0].pelanggan.hp'), '6281234567890');

  tahap('bayar online tanpa kunci Mayar: pesan jelas');
  await tambahBrownies.click();
  await page.getByRole('button', { name: 'Buat pesanan & bayar' }).click();
  await page.getByRole('button', { name: 'Online (QRIS / transfer)' }).click();
  await page.getByRole('button', { name: 'Buat QR pembayaran' }).click();
  await page.getByText('Pembayaran online belum diatur').waitFor();
  await page.getByRole('button', { name: 'Bayar nanti' }).click();
  const urlPesananKasir = page.url().replace('?bayar=1', '');

  tahap('pengaturan: kunci Mayar, link pemesanan, toko buka, akun toko');
  await page.goto(BASE + '/#/pengaturan');
  await page.getByPlaceholder('Tempel kunci API di sini').fill('kunci-mayar-uji-yang-panjang-12345');
  await page.getByRole('button', { name: 'Simpan kunci' }).click();
  await page.getByText('Aktif', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Buat link pemesanan' }).click();
  await page.getByText('Toko buka: link pemesanan menerima pesanan').click();
  await page.getByRole('button', { name: 'Buat akun toko' }).click();
  await page.getByPlaceholder('mis. Kasir Pagi').fill('Kasir Pagi');
  await page.getByPlaceholder('mis. kasir.pagi').fill('toko.pagi');
  await page.locator('[role=dialog] input[type=text]').last().fill('sandi-kasir-1');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await page.getByText('Akun toko toko.pagi dibuat.').waitFor();
  const link = await page.getByRole('textbox', { name: 'Link pemesanan', exact: true }).inputValue();
  await foto(page, '05-pengaturan');

  tahap('kasir bayar online: QR Mayar, dibayar, lunas otomatis');
  await page.goto(urlPesananKasir);
  await page.getByRole('button', { name: 'Terima pembayaran' }).click();
  await page.getByRole('button', { name: 'Online (QRIS / transfer)' }).click();
  await page.getByRole('button', { name: 'Buat QR pembayaran' }).click();
  await page.locator('.qr-bayar svg').waitFor();
  const linkBayar = await page.getByRole('link', { name: 'Buka link' }).getAttribute('href');
  await foto(page, '06-qr-mayar');
  const idMayar = linkBayar.split('/').pop();
  await fetch(BASE + '/api', { method: 'POST', body: JSON.stringify({ aksi: 'tiruanLunas', idMayar }) });
  await page.getByText(/lunas\.$/).waitFor({ timeout: 15000 });
  await page.getByText('Lunas · Online').waitFor();

  tahap('pembeli memesan lewat link, membayar, pesanan masuk dan stok terpotong');
  await page.evaluate(() => window.__app.penyinkron.sinkronkan());
  const pembeli = await browser.newPage({ viewport: { width: 390, height: 844 } });
  pantau(pembeli, 'pembeli');
  await pembeli.goto(link);
  await pembeli.getByRole('button', { name: 'Tambah Paket Hemat' }).click();
  await pembeli.getByRole('button', { name: 'Tambah Paket Hemat' }).click();
  await pembeli.getByLabel('Nama').fill('Sari');
  await pembeli.getByLabel('Nomor WhatsApp').fill('081299998888');
  await foto(pembeli, '07-pesan-online');
  assert.ok((await sisaLebar(pembeli)) <= 0, 'halaman pembeli tidak melebar');
  await pembeli.getByRole('button', { name: 'Pesan & bayar' }).click();
  await pembeli.waitForURL(/tiruan-mayar/);
  await pembeli.getByRole('button', { name: 'Bayar (tiruan)' }).click();
  await pembeli.getByText(/berhasil/).waitFor();
  await pembeli.goBack();
  await pembeli.getByRole('button', { name: 'Lihat pesanan terakhir saya' }).click();
  await pembeli.getByText('Pembayaran diterima').waitFor();
  await foto(pembeli, '08-status-pembeli');
  await page.evaluate(() => window.__app.penyinkron.sinkronkan());
  assert.equal(await evalDb(page, 'return toko.stokMakanan(db).get(a)', ids.brownies), 13 - 2, '2 paket = 2 brownies');
  assert.equal(await evalDb(page, 'return db.semua("Pesanan").filter((p) => p.sumber === "online" && p.status === "baru").length'), 1);

  tahap('akun toko: masuk, lihat pesanan, tidak bisa membuka resep');
  const kasir = await browser.newPage({ viewport: { width: 390, height: 844 } });
  pantau(kasir, 'toko');
  await masukUji(kasir, BASE, { login: 'toko.pagi' });
  await kasir.getByText('Pesanan aktif').waitFor();
  await kasir.getByText('· Sari').waitFor({ timeout: 15000 });
  await foto(kasir, '09-beranda-toko');
  assert.equal(await kasir.evaluate(() => window.__app.db.semua('Bahan').length), 0, 'akun toko tidak menerima data bahan');
  await kasir.goto(BASE + '/#/resep');
  await kasir.getByText('Halaman tidak ditemukan').waitFor();
  await kasir.goto(BASE + '/#/pesanan');
  await kasir.locator('.kartu-pesanan').first().click();
  await kasir.getByRole('button', { name: 'Mulai proses' }).click();
  await kasir.getByRole('button', { name: 'Tandai siap' }).waitFor();

  tahap('akun toko: catat pesanan manual (WhatsApp, item di luar menu, antar + ongkir), ubah, lalu lunas transfer');
  await kasir.goto(BASE + '/#/kasir');
  await kasir.getByRole('link', { name: 'Catat manual' }).click();
  await kasir.getByRole('heading', { name: 'Catat pesanan' }).waitFor();
  await kasir.getByLabel('Nama', { exact: true }).fill('Rina');
  await kasir.getByLabel('WhatsApp').fill('0813 1111 2222');
  await kasir.getByLabel('Tambah dari menu').selectOption({ index: 1 });
  await kasir.getByRole('button', { name: 'Item di luar menu' }).click();
  await kasir.getByLabel('Nama item lain').fill('Tumpeng mini');
  await kasir.getByLabel('Harga item lain').fill('50000');
  await kasir.getByRole('button', { name: 'Diantar' }).click();
  await kasir.getByLabel('Alamat antar').fill('Jl. Kenanga 7');
  await kasir.getByLabel('Ongkir').fill('10000');
  await kasir.getByLabel('Jadwal antar (opsional)').fill('2030-01-05T10:00');
  assert.equal(await sisaLebar(kasir), 0, 'form catat pesanan tidak melebar di HP');
  await foto(kasir, '11-catat-pesanan');
  await kasir.getByRole('button', { name: 'Simpan pesanan' }).click();
  await kasir.waitForURL(/#\/pesanan\/psn_/);
  await kasir.getByText('Jl. Kenanga 7').waitFor();
  await kasir.getByText('Belum bayar').first().waitFor();
  const manual = await evalDb(kasir, "return db.semua('Pesanan', (p) => p.sumber === 'manual')[0]");
  assert.equal(manual.saluran, 'WhatsApp');
  assert.equal(manual.ongkir, 10000);
  assert.equal(manual.item.length, 2);
  assert.equal(manual.total, manual.subtotal + 10000);
  assert.equal(new Date(manual.jadwal).getFullYear(), 2030);

  await kasir.getByRole('link', { name: 'Ubah pesanan' }).click();
  await kasir.getByRole('heading', { name: 'Ubah pesanan' }).waitFor();
  await kasir.getByRole('button', { name: 'Tambah Tumpeng mini' }).click();
  await kasir.getByRole('button', { name: 'Simpan perubahan' }).click();
  await kasir.waitForURL(new RegExp('#/pesanan/' + manual.id + '$'));
  const diubah = await evalDb(kasir, "return db.ambil('Pesanan', a)", manual.id);
  assert.equal(diubah.total, manual.total + 50000);
  await kasir.getByRole('button', { name: 'Terima pembayaran' }).click();
  await kasir.getByRole('button', { name: 'Transfer', exact: true }).click();
  await kasir.getByRole('button', { name: /^Tandai lunas transfer/ }).click();
  await kasir.getByText('Lunas · Transfer').first().waitFor();
  assert.equal(await kasir.getByRole('link', { name: 'Ubah pesanan' }).count(), 0, 'pesanan lunas tidak bisa diubah');
  await foto(kasir, '12-pesanan-manual');

  await kasir.setViewportSize({ width: 1280, height: 860 });
  await kasir.goto(BASE + '/#/kasir');
  await kasir.locator('.keranjang').waitFor();
  await foto(kasir, '10-kasir-laptop');
  await browser.close();
} catch (e) {
  galat.push('GAGAL: ' + (e.stack || e));
  if (halaman) {
    try {
      galat.push('Saat gagal: ' + halaman.url() + ' | h1: ' + JSON.stringify(await halaman.locator('h1').allInnerTexts()));
      if (SS) await halaman.screenshot({ path: path.join(SS, 'gagal.png') });
    } catch {
      /* abaikan */
    }
  }
} finally {
  server.kill();
  fs.rmSync(DATA, { force: true });
}

if (galat.length) {
  console.error('\nGALAT:\n' + galat.join('\n'));
  process.exit(1);
}
console.log('\nSemua alur toko lolos.');
process.exit(0);
