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
const ADMIN = BASE + '/admin'; // halaman admin (resep, HPP, harga, stok)
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

// Nilai input datetime-local untuk N jam dari sekarang (waktu setempat).
const jamNanti = (n) => {
  const d = new Date(Date.now() + n * 3600 * 1000);
  const dua = (x) => String(x).padStart(2, '0');
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}T${dua(d.getHours())}:${dua(d.getMinutes())}`;
};
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
  await masukUji(page, BASE, { jalur: '/admin' });
  const ids = await page.evaluate(async () => {
    const seed = await import('/js/lib/seed.js');
    const repo = await import('/js/lib/repo.js');
    const db = window.__app.db;
    const c = seed.muatContoh(db);
    const paket = repo.buatPaket(db, 'Paket Hemat');
    repo.tambahIsiPaket(db, paket.id, c.brownies);
    return { brownies: c.brownies, paket: paket.id };
  });
  await page.goto(ADMIN + '#/');
  await page.getByRole('link', { name: 'Stok & belanja' }).waitFor();

  tahap('catat belanja: stok bahan bertambah');
  await page.goto(ADMIN + '#/stok-bahan');
  await page.getByRole('button', { name: 'Catat belanja' }).first().click();
  await page.getByLabel('Bahan baris 1').selectOption({ index: 1 });
  await page.getByRole('button', { name: 'Simpan belanja' }).click();
  await page.getByText('Belanja 1 bahan dicatat').waitFor();
  assert.equal(await evalDb(page, 'return db.semua("MutasiBahan").length'), 1);
  await foto(page, '01-stok-bahan');
  assert.ok((await sisaLebar(page)) <= 0, 'stok bahan tidak melebar di HP');

  tahap('produksi 1x brownies: bahan terpotong, hasil dicek lalu dikirim ke stok (15 lolos, 1 reject)');
  await page.goto(ADMIN + '#/produksi?resep=' + ids.brownies);
  await page.getByRole('button', { name: 'Catat produksi' }).click();
  await page.getByRole('button', { name: 'Tetap catat' }).click();
  await page.getByText(/Produksi dicatat: 16 potong .* kirim ke stok/).waitFor();
  assert.equal(await evalDb(page, 'return toko.stokMakanan(db).get(a) || 0', ids.brownies), 0, 'belum masuk stok sebelum dikirim');
  await page.getByRole('button', { name: 'Kirim ke stok' }).first().click();
  const dialogKirim = page.getByRole('dialog');
  await dialogKirim.getByLabel('Jumlah dikirim ke stok').fill('15');
  await dialogKirim.getByLabel('Jumlah reject').fill('1');
  await dialogKirim.getByLabel('Jumlah reject').blur();
  await foto(page, '02a-kirim-stok');
  await dialogKirim.getByRole('button', { name: 'Kirim ke stok' }).click();
  await page.getByText('15 di stok · 1 reject · selesai dikirim').waitFor();
  // Stok produk dipakai uji berikutnya: tambah 1 lagi lewat Tambah stok (tanpa produksi) supaya genap 16.
  await evalDb(page, 'toko.ubahStokMakanan(db, a, { jenis: "masuk", nilai: 1, catatan: "uji" })', ids.brownies);
  assert.equal(await evalDb(page, 'return toko.stokMakanan(db).get(a)', ids.brownies), 16);
  await foto(page, '02-produksi');

  tahap('menu jual (tabel): tambah brownies (harga saran dari HPP Jual) dan paket dengan diskon 50% + varian');
  await page.goto(ADMIN + '#/menu');
  await page.getByRole('button', { name: 'Tambah menu' }).click();
  await page.getByLabel('Pilih resep atau paket').selectOption('resep:' + ids.brownies);
  assert.equal(await page.getByLabel('Harga jual').inputValue(), '8.000', 'harga saran dari HPP Jual');
  await page.getByLabel('Potensi keuntungan').getByText('Untung per jual').waitFor();
  await foto(page, '03a-form-menu');
  await page.getByRole('button', { name: 'Masukkan ke menu' }).click();
  await page.getByText('Brownies Fudgy masuk menu jual.').waitFor();
  await page.getByRole('button', { name: 'Tambah menu' }).click();
  await page.getByLabel('Pilih resep atau paket').selectOption('paket:' + ids.paket);
  await page.getByLabel('Diskon persen').fill('50');
  await page.getByLabel('Diskon persen').blur();
  await page.getByText('Harga jual (−50%)').waitFor();
  await page.getByRole('button', { name: 'Tambah pilihan' }).click();
  await page.getByLabel('Nama pilihan 1').fill('Tambah keju');
  await page.getByLabel('Harga pilihan 1').fill('1000');
  await page.getByLabel('Harga pilihan 1').blur();
  await page.getByRole('button', { name: 'Masukkan ke menu' }).click();
  await page.getByRole('row', { name: /Paket Hemat/ }).waitFor();
  const paketMenu = await evalDb(page, "const m = db.semua('Menu').find((x) => x.nama === 'Paket Hemat'); return { harga: toko.hargaJual(m), opsi: toko.opsiMenu(m) }");
  assert.deepEqual(paketMenu, { harga: 3000, opsi: [{ nama: 'Tambah keju', harga: 1000 }] });
  assert.equal(await page.locator('table.tabel-data tbody tr').count(), 2);
  await foto(page, '03-menu');

  tahap('promo HEMAT10 (10%)');
  await page.goto(ADMIN + '#/pelanggan?tab=promo');
  await page.getByRole('button', { name: 'Promo baru' }).click();
  await page.getByPlaceholder('HEMAT10').fill('hemat10');
  await page.getByRole('button', { name: 'Simpan promo' }).click();
  await page.getByText('Promo HEMAT10 disimpan.').waitFor();

  tahap('kasir: 2 brownies + promo, bayar tunai dengan kembalian');
  // Dari /admin ke halaman toko (POS) = muat ulang halaman: simpan dulu, seperti tombol "Buka Halaman Toko".
  await page.evaluate(() => window.__app.db.tulis());
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

  tahap('struk: pintasan setelah lunas, cetak 58/80 mm, kirim WhatsApp pembeli, kembali ke kasir');
  await page.locator('.struk-terakhir').getByRole('link', { name: 'Struk' }).click();
  await page.locator('.struk-kertas').waitFor();
  const isiStruk = await page.locator('.struk-kertas').innerText();
  assert.match(isiStruk, /TOTAL\s+Rp 14\.400/);
  assert.match(isiStruk, /Kembali\s+5\.600/);
  assert.match(isiStruk, /Budi/);
  assert.match(isiStruk, /LUNAS/);
  const waStruk = decodeURIComponent(await page.getByRole('link', { name: 'Kirim ke WhatsApp pembeli' }).getAttribute('href'));
  assert.ok(waStruk.startsWith('https://wa.me/6281234567890?text=Halo Budi, berikut struk pesanan'), waStruk);
  assert.ok(waStruk.includes('```'), 'struk WhatsApp dalam blok monospace');
  assert.ok((await sisaLebar(page)) <= 0, 'struk tidak melebar di HP');
  await foto(page, '04b-struk-58');
  await page.getByRole('button', { name: '80 mm' }).click();
  assert.ok((await page.locator('.struk-kertas.k-80').count()) === 1);
  await page.getByRole('link', { name: 'Kembali' }).click();
  await page.waitForURL(/#\/kasir$/);

  tahap('bayar non-tunai tanpa Mayar: tab Transfer / QRIS, rekening belum diatur, tidak ada tab Mayar');
  await tambahBrownies.click();
  await page.getByRole('button', { name: 'Buat pesanan & bayar' }).click();
  await page.getByRole('button', { name: 'Transfer / QRIS' }).click();
  await page.getByText('Rekening dan QRIS belum diatur').waitFor();
  assert.equal(await page.getByRole('button', { name: 'Mayar', exact: true }).count(), 0, 'Mayar belum diaktifkan');
  await page.getByRole('button', { name: 'Bayar nanti' }).click();
  const urlPesananKasir = page.url().replace('?bayar=1', '');

  tahap('pengaturan: rekening + foto QRIS, kunci Mayar, link pemesanan, toko buka, akun toko');
  await page.evaluate(() => window.__app.db.tulis());
  await page.goto(ADMIN + '#/pengaturan');
  await page.getByLabel('Bank rekening 1').fill('BCA');
  await page.getByLabel('Nomor rekening 1').fill('1234567890');
  await page.getByLabel('Atas nama rekening 1').fill('Rasa Teras Rumah');
  await page.locator('.qris-pilih input[type=file]').setInputFiles(path.join(AKAR, 'icons/icon-192.png'));
  await page.getByRole('button', { name: 'Simpan info pembayaran' }).click();
  await page.getByText('Info pembayaran disimpan.').waitFor();
  // Tampilan halaman Login (logo + foto latar) diatur dari Pengaturan, bukan panel server.
  const kartuLogin = page.getByRole('region', { name: 'Tampilan halaman Login' });
  await kartuLogin.locator('input[type=file]').nth(1).setInputFiles(path.join(AKAR, 'gambar/latar-masuk.jpg'));
  await kartuLogin.getByRole('button', { name: 'Simpan foto latar' }).click();
  await page.getByText('Foto latar diganti.').waitFor();
  const situs = await (await fetch(BASE + '/api', { method: 'POST', body: JSON.stringify({ aksi: 'infoSitus' }) })).json();
  assert.match(situs.latarUrl, /\/foto\/situs_latar/, 'foto latar Login tersimpan di server untuk semua perangkat');
  assert.match(await evalDb(page, 'return db.pengaturan.situs.latarUrl'), /\/foto\/situs_latar/);
  await page.getByLabel('WhatsApp toko').fill('0812 7777 8888');
  await page.getByRole('button', { name: 'Simpan data toko' }).click();
  await page.getByPlaceholder('Tempel kunci API di sini').fill('kunci-mayar-uji-yang-panjang-12345');
  await page.getByRole('button', { name: 'Simpan kunci' }).click();
  await page.getByText('Aktif', { exact: true }).waitFor();
  await page.getByRole('button', { name: 'Aktifkan toko online' }).click();
  await page.getByText('Toko buka: etalase menerima pesanan').click();
  await page.getByRole('button', { name: 'Buat akun toko' }).click();
  await page.getByPlaceholder('mis. Kasir Pagi').fill('Kasir Pagi');
  await page.getByPlaceholder('mis. kasir.pagi').fill('toko.pagi');
  await page.locator('[role=dialog] input[type=text]').last().fill('sandi-kasir-1');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await page.getByText('Akun toko toko.pagi dibuat.').waitFor();
  const link = await page.getByRole('textbox', { name: 'Alamat toko', exact: true }).inputValue();
  assert.ok(link.startsWith(BASE + '/') && !link.includes('/admin') && !link.includes('/pesan/'), 'alamat toko = halaman depan: ' + link);
  await foto(page, '05-pengaturan');

  tahap('kasir bayar online: QR Mayar, dibayar, lunas otomatis');
  await page.goto(urlPesananKasir);
  await page.getByRole('button', { name: 'Terima pembayaran' }).click();
  await page.getByRole('button', { name: 'Mayar', exact: true }).click();
  await page.getByRole('button', { name: 'Buat QR pembayaran' }).click();
  await page.locator('.qr-bayar svg').waitFor();
  const linkBayar = await page.getByRole('link', { name: 'Buka link' }).getAttribute('href');
  await foto(page, '06-qr-mayar');
  const idMayar = linkBayar.split('/').pop();
  await fetch(BASE + '/api', { method: 'POST', body: JSON.stringify({ aksi: 'tiruanLunas', idMayar }) });
  await page.getByText(/lunas\.$/).waitFor({ timeout: 15000 });
  await page.getByText('Lunas · Online').waitFor();

  tahap('admin: foto header etalase dan banner informasi');
  await page.goto(ADMIN + '#/banner');
  const kartuHeader = page.getByRole('region', { name: 'Foto header etalase' });
  await kartuHeader.locator('input[type=file]').setInputFiles(path.join(AKAR, 'gambar/latar-masuk.jpg'));
  await kartuHeader.getByRole('button', { name: 'Simpan foto header etalase' }).click();
  await page.getByText('Foto header etalase disimpan.').waitFor();
  await page.getByRole('button', { name: 'Tambah banner' }).click();
  const dlgBanner = page.getByRole('dialog');
  await dlgBanner.getByPlaceholder('mis. Pre-order Lebaran dibuka').fill('Pre-order Lebaran');
  await dlgBanner.getByPlaceholder('mis. Pesan kue kering sebelum 20 Maret').fill('Pesan kue kering sebelum 20 Maret');
  await dlgBanner.getByLabel('Aksi tombol').selectOption('menu');
  await dlgBanner.getByRole('button', { name: 'kuning' }).click();
  await foto(page, '09a-form-banner');
  await dlgBanner.getByRole('button', { name: 'Simpan banner' }).click();
  await page.getByText('Banner ditambahkan.').waitFor();
  // Banner gambar saja: judul dan teks dikosongkan, cukup gambar.
  await page.getByRole('button', { name: 'Tambah banner' }).click();
  await dlgBanner.getByRole('button', { name: 'Simpan banner' }).click();
  await dlgBanner.getByText('pilih gambar (900 × 360 px)').waitFor();
  await dlgBanner.locator('input[type=file]').setInputFiles(path.join(AKAR, 'gambar/latar-masuk.jpg'));
  await dlgBanner.locator('.kartu-banner.gambar-saja img').waitFor();
  await dlgBanner.getByText('Panduan gambar').waitFor();
  await dlgBanner.getByText('Rasio gambar ini tidak 5:2').waitFor(); // foto latar-masuk tidak 5:2
  await foto(page, '09a2-form-banner-gambar');
  await dlgBanner.getByLabel('Aksi tombol').selectOption('menu');
  await dlgBanner.getByLabel('Keterangan (dibaca pembaca layar)').fill('Lihat menu baru');
  await dlgBanner.getByRole('button', { name: 'Simpan banner' }).click();
  await page.getByText('Banner ditambahkan.').waitFor();
  const ukuran = await page.locator('.baris-banner .kartu-banner.gambar-saja').boundingBox();
  assert.ok(Math.abs(ukuran.width / ukuran.height - 2.5) < 0.05, 'banner berukuran 250 x 100 (5:2)');
  await foto(page, '09b-banner-admin');

  tahap('pembeli memesan lewat link, membayar, pesanan masuk dan stok terpotong');
  await page.evaluate(() => window.__app.penyinkron.sinkronkan());
  const pembeli = await browser.newPage({ viewport: { width: 390, height: 844 } });
  pantau(pembeli, 'pembeli');
  await pembeli.goto(link);
  // Sambutan (sekali per kunjungan), lalu beranda etalase.
  await pembeli.getByRole('dialog', { name: 'Selamat datang' }).waitFor();
  await pembeli.waitForTimeout(900); // animasi masuk
  await foto(pembeli, '07-sambutan');
  await pembeli.getByRole('button', { name: 'Mulai pesan' }).click();
  await pembeli.getByRole('heading', { name: 'Top Selling' }).waitFor();
  await pembeli.getByRole('heading', { name: 'Kategori' }).waitFor();
  // Deretan kategori tidak mengulang isi navigasi bawah (Menu, Pesanan) dan menyebut jumlah produknya.
  await pembeli.locator('.et-kategori .et-pintas-item', { hasText: 'produk' }).first().waitFor();
  assert.equal(await pembeli.locator('.et-kategori').getByText(/Semua menu|Pesanan saya/).count(), 0);
  assert.ok((await pembeli.locator('.et-grid-top .et-kartu').count()) <= 6, 'top selling maks. 2 x 3');
  assert.equal(await pembeli.getByText('Masuk admin & kasir').count(), 0, 'tanpa tautan admin di etalase');
  assert.equal(await pembeli.getByText('Info toko', { exact: true }).count(), 0, 'tanpa banner info toko');
  await pembeli.locator('.et-header-teks .et-header-logo').waitFor();
  await pembeli.getByRole('button', { name: 'Pakai kode HEMAT10' }).first().waitFor();
  await pembeli.getByText('Halo, selamat datang di').waitFor();
  await pembeli.locator('.et-header-foto[src*="/foto/"]').waitFor();
  await pembeli.getByText('Pre-order Lebaran').first().waitFor();
  await pembeli.getByRole('button', { name: 'Lihat menu baru' }).waitFor();
  await pembeli.locator('.et-diskon', { hasText: '-50%' }).first().waitFor();
  await foto(pembeli, '07a-etalase-beranda');
  assert.ok((await sisaLebar(pembeli)) <= 0, 'etalase tidak melebar');
  // Detail produk: tambah 2 paket ke keranjang.
  await pembeli.getByRole('button', { name: 'Lihat Paket Hemat' }).first().click();
  await pembeli.getByRole('heading', { name: 'Paket Hemat', level: 1 }).waitFor();
  await pembeli.getByRole('button', { name: 'Tambah jumlah' }).click();
  await pembeli.getByRole('checkbox', { name: /Tambah keju/ }).check();
  await pembeli.getByRole('button', { name: 'Tambah ke keranjang, Rp 8.000' }).waitFor();
  await foto(pembeli, '07b-etalase-produk');
  await pembeli.getByRole('button', { name: /^Tambah ke keranjang/ }).click();
  await pembeli.getByRole('button', { name: 'Keranjang (2)' }).click();
  await pembeli.getByLabel('Nama').fill('Sari');
  await pembeli.getByLabel('Nomor WhatsApp').fill('081299998888');
  // Cara ambil wajib dipilih, lengkap dengan jamnya.
  await pembeli.getByRole('button', { name: 'Pesan & bayar' }).click();
  await pembeli.getByText('Pilih cara ambil pesanan').waitFor();
  await pembeli.getByRole('radio', { name: /Ambil sendiri/ }).check();
  await pembeli.getByLabel('Jam Anda datang mengambil').fill(jamNanti(2));
  await foto(pembeli, '07c-etalase-keranjang');
  assert.ok((await sisaLebar(pembeli)) <= 0, 'halaman pembeli tidak melebar');
  await pembeli.getByRole('button', { name: 'Pesan & bayar' }).click();
  await pembeli.waitForURL(/tiruan-mayar/);
  await pembeli.getByRole('button', { name: 'Bayar (tiruan)' }).click();
  await pembeli.getByText(/berhasil/).waitFor();
  await pembeli.goBack();
  await pembeli.getByRole('button', { name: 'Pesanan', exact: true }).click();
  // Daftar pesanan: tertutup dulu (nomor, isi, status), dibuka lewat panah.
  const barisSari = pembeli.locator('.et-pesanan-saya', { hasText: 'Paket Hemat' });
  await barisSari.locator('.et-status-pil', { hasText: 'Diterima' }).waitFor();
  assert.equal(await barisSari.locator('.et-timeline').count(), 0, 'detail tertutup sebelum diketuk');
  await barisSari.locator('.et-pesanan-kepala').click();
  await barisSari.getByText('Pembayaran diterima').waitFor();
  await foto(pembeli, '08-status-pembeli');
  await page.evaluate(() => window.__app.penyinkron.sinkronkan());
  assert.equal(await evalDb(page, 'return toko.stokMakanan(db).get(a)', ids.brownies), 13 - 2, '2 paket = 2 brownies');
  assert.equal(await evalDb(page, 'return db.semua("Pesanan").filter((p) => p.sumber === "online" && p.status === "baru").length'), 1);
  const itemOnline = await evalDb(page, 'return db.semua("Pesanan").find((p) => p.sumber === "online" && p.status === "baru").item');
  assert.deepEqual(itemOnline[0].opsi, ['Tambah keju']);
  assert.equal(itemOnline[0].harga, 4000, 'paket diskon 3.000 + keju 1.000');

  tahap('tanpa Mayar: pembeli pesan, lihat rekening + QRIS, toko tandai lunas transfer, pembeli kirim testimoni, admin tayangkan');
  await page.goto(ADMIN + '#/pengaturan');
  await page.getByText('Pakai Mayar untuk kasir dan link pemesanan').click();
  await page.evaluate(() => window.__app.penyinkron.sinkronkan());
  await pembeli.goto(link);
  await pembeli.reload();
  await pembeli.getByRole('button', { name: 'Tambah Brownies Fudgy' }).first().click();
  await pembeli.getByRole('button', { name: 'Keranjang (1)' }).click();
  await pembeli.getByLabel('Nama').fill('Rudi');
  await pembeli.getByLabel('Nomor WhatsApp').fill('081355556666');
  await pembeli.getByRole('radio', { name: /Ojek online/ }).check();
  await pembeli.getByText('Pesan ojeknya sendiri lewat aplikasi Gojek / Grab').waitFor();
  await pembeli.getByLabel('Jam driver ojek datang ke toko').fill(jamNanti(3));
  await foto(pembeli, '07c2-etalase-ojol');
  await pembeli.getByRole('button', { name: 'Pesan sekarang' }).click();
  await pembeli.getByRole('heading', { name: 'Cara bayar' }).waitFor();
  await pembeli.getByText('1234567890').waitFor();
  await pembeli.getByRole('img', { name: 'Kode QRIS toko' }).waitFor();
  assert.match(await pembeli.getByRole('link', { name: 'Kirim bukti bayar via WhatsApp' }).getAttribute('href'), /wa\.me\/6281277778888/);
  assert.match(decodeURIComponent(await pembeli.getByRole('link', { name: 'Kirim bukti bayar via WhatsApp' }).getAttribute('href')), /Cara ambil: Ojek online \(dipesan pembeli\)/);
  await pembeli.getByText('Toko tidak memesankan ojek.').waitFor();
  await pembeli.locator('.et-langkah.aktif', { hasText: 'Bukti bayar dikirim' }).waitFor();
  await foto(pembeli, '07d-bayar-transfer');
  // Pembeli menekan "Kirim bukti bayar": WhatsApp terbuka di tab baru, timeline maju, toko melihatnya di kasir.
  await pembeli.context().route('https://wa.me/**', (r) => r.fulfill({ contentType: 'text/html', body: 'WhatsApp' }));
  const [tabWa] = await Promise.all([pembeli.waitForEvent('popup'), pembeli.getByRole('link', { name: 'Kirim bukti bayar via WhatsApp' }).click()]);
  await tabWa.close();
  await pembeli.locator('.et-langkah.selesai', { hasText: 'Bukti bayar dikirim' }).waitFor();
  await pembeli.locator('.et-status-pil', { hasText: 'Bukti terkirim' }).waitFor();
  assert.equal(await pembeli.locator('.et-pesanan-saya').count(), 2, 'kedua pesanan dari perangkat ini tampil');
  await page.evaluate(() => window.__app.penyinkron.sinkronkan());
  await page.goto(ADMIN + '#/pesanan?tab=menunggu');
  await page.locator('.kartu-pesanan', { hasText: 'Rudi' }).getByText(/Ojol dipesan pembeli/).waitFor();
  await page.locator('.kartu-pesanan', { hasText: 'Rudi' }).getByText('Bukti bayar dikirim').waitFor();
  await page.locator('.kartu-pesanan', { hasText: 'Rudi' }).click();
  await page.getByText('Pembeli sudah mengirim bukti bayar').waitFor();
  await page.getByText('Ojek online (dipesan pembeli)').waitFor();
  await page.getByText('Jam driver datang').waitFor();
  await page.getByRole('button', { name: 'Cek & tandai lunas' }).click();
  await page.getByRole('button', { name: /^Tandai lunas transfer/ }).click();
  await page.getByText('Lunas · Transfer/QRIS').first().waitFor();
  // Kendala dari dapur tampil di halaman pesanan pembeli.
  await page.getByLabel('Pesan kendala untuk pembeli').fill('Maaf, brownies baru siap jam 4 sore karena oven bermasalah.');
  await page.getByRole('button', { name: 'Simpan kendala' }).click();
  await page.getByRole('button', { name: 'Kendala selesai' }).waitFor();
  await page.evaluate(() => window.__app.penyinkron.sinkronkan());
  await pembeli.locator('.et-pesanan-saya.terbuka .et-status-pil', { hasText: 'Diterima' }).waitFor({ timeout: 15000 });
  await pembeli.reload();
  await pembeli.getByText('Info dari dapur').waitFor();
  await pembeli.getByText('brownies baru siap jam 4 sore').waitFor();
  await pembeli.locator('.et-langkah.selesai', { hasText: 'Pembayaran dikonfirmasi toko' }).waitFor();
  await pembeli.locator('.et-langkah.aktif', { hasText: 'Pesanan diterima & disiapkan' }).waitFor();
  await foto(pembeli, '08b-timeline-kendala');
  await page.getByRole('button', { name: 'Kendala selesai' }).click();
  await page.evaluate(() => window.__app.penyinkron.sinkronkan());
  await pembeli.getByRole('button', { name: '4 bintang' }).click();
  await pembeli.getByLabel('Testimoni').fill('Browniesnya lembut dan tidak terlalu manis!');
  await pembeli.getByRole('button', { name: 'Kirim testimoni' }).click();
  await pembeli.getByText('Testimoni Anda akan tampil setelah dicek toko').waitFor();
  await page.evaluate(() => window.__app.penyinkron.sinkronkan());
  await page.goto(ADMIN + '#/pelanggan?tab=testimoni');
  await page.locator('.kartu-testi-admin', { hasText: 'Rudi' }).getByRole('button', { name: 'Tayangkan' }).click();
  await page.getByText('Tayang', { exact: true }).waitFor();
  await page.evaluate(() => window.__app.penyinkron.sinkronkan());
  await pembeli.goto(link);
  await pembeli.reload();
  await pembeli.getByRole('heading', { name: 'Kata pembeli' }).waitFor();
  await pembeli.getByText('Browniesnya lembut dan tidak terlalu manis!').waitFor();
  await pembeli.getByRole('heading', { name: 'Kata pembeli' }).scrollIntoViewIfNeeded();
  await foto(pembeli, '07e-testimoni');

  // Coming soon: harga tidak tampil di etalase, tetap bisa dimasukkan keranjang.
  await evalDb(page, 'const m = db.semua("Menu").find((x) => x.nama === "Brownies Fudgy"); db.simpan("Menu", { ...m, segera: true });');
  await page.evaluate(() => window.__app.penyinkron.sinkronkan());
  await pembeli.goto(link);
  await pembeli.reload();
  const kartuSegera = pembeli.locator('.et-kartu', { hasText: 'Brownies Fudgy' }).first();
  await kartuSegera.locator('.et-harga.segera', { hasText: 'Coming soon' }).waitFor();
  assert.equal(await kartuSegera.getByText(/Rp /).count(), 0, 'harga coming soon tidak tampil');
  await kartuSegera.getByRole('button', { name: 'Lihat Brownies Fudgy' }).click();
  await pembeli.getByRole('button', { name: 'Tambah ke keranjang', exact: true }).click();
  await pembeli.getByRole('button', { name: /^Keranjang \(/ }).first().click();
  await pembeli.locator('.et-baris-keranjang', { hasText: 'Brownies Fudgy' }).getByText('Coming soon').waitFor();
  await foto(pembeli, '07f-coming-soon');
  await evalDb(page, 'const m = db.semua("Menu").find((x) => x.nama === "Brownies Fudgy"); db.simpan("Menu", { ...m, segera: false });');
  await page.evaluate(() => window.__app.penyinkron.sinkronkan());

  tahap('akun kasir: login di /admin ke beranda (follow-up + tren), katalog, tidak bisa membuka resep; halaman depan = etalase');
  const kasir = await browser.newPage({ viewport: { width: 390, height: 844 } });
  pantau(kasir, 'toko');
  await masukUji(kasir, BASE, { login: 'toko.pagi' });
  await kasir.getByRole('heading', { name: 'Beranda' }).waitFor();
  await kasir.getByRole('heading', { name: 'Perlu ditindaklanjuti' }).waitFor();
  await kasir.locator('.baris-follow', { hasText: 'Sari' }).waitFor({ timeout: 15000 });
  await kasir.getByRole('heading', { name: 'Tren penjualan' }).waitFor();
  await kasir.locator('.daftar-favorit li').first().waitFor();
  assert.ok((await kasir.locator('.grafik-area .kolom-batang').count()) === 7, 'grafik 7 hari');
  await kasir.getByRole('button', { name: '30 hari' }).click();
  assert.ok((await kasir.locator('.grafik-area .kolom-batang').count()) === 30, 'grafik 30 hari');
  assert.ok((await sisaLebar(kasir)) <= 0, 'beranda kasir tidak melebar');
  await foto(kasir, '09-beranda-kasir');
  await kasir.getByRole('link', { name: 'Buka katalog' }).click();
  await kasir.getByRole('heading', { name: 'Katalog' }).waitFor();
  await kasir.getByRole('button', { name: 'Tambah Brownies Fudgy ke keranjang' }).waitFor({ timeout: 15000 });
  await foto(kasir, '09a-katalog-toko');
  assert.equal(await kasir.evaluate(() => window.__app.db.semua('Bahan').length), 0, 'akun toko tidak menerima data bahan');
  await kasir.goto(BASE + '/#/resep');
  await kasir.getByText('Halaman tidak ditemukan').waitFor();
  // Halaman depan = etalase pembeli (tanpa login), walau sedang masuk sebagai kasir.
  await kasir.goto(BASE + '/');
  await kasir.getByRole('button', { name: 'Mulai pesan' }).click();
  await kasir.getByRole('heading', { name: 'Top Selling' }).waitFor();
  await kasir.goto(ADMIN);
  await kasir.getByRole('heading', { name: 'Beranda' }).waitFor();
  await kasir.goto(BASE + '/#/pesanan');
  await kasir.getByText('· Sari').waitFor({ timeout: 15000 });
  await kasir.locator('.kartu-pesanan').first().click();
  await kasir.getByRole('button', { name: 'Mulai proses' }).click();
  await kasir.getByRole('button', { name: 'Tandai siap' }).waitFor();

  tahap('akun kasir: laporan per rentang tanggal (ringkasan, pesanan, top produk, top pelanggan, stok) dan unduh CSV');
  await kasir.goto(ADMIN + '#/');
  await kasir.getByRole('link', { name: 'Laporan lengkap' }).click();
  await kasir.getByRole('heading', { name: 'Laporan', exact: true }).waitFor();
  assert.ok(await kasir.locator('a.chip.aktif', { hasText: '7 hari' }).count(), 'rentang dari beranda (7 hari)');
  await kasir.getByRole('heading', { name: 'Produk terlaris' }).waitFor();
  await kasir.locator('#lap-produk tbody tr', { hasText: 'Brownies Fudgy' }).first().waitFor();
  await kasir.locator('#lap-pelanggan tbody tr', { hasText: 'Budi' }).waitFor();
  await kasir.locator('#lap-stok tbody tr', { hasText: 'Brownies Fudgy' }).waitFor();
  assert.ok((await kasir.locator('#lap-pesanan tbody tr').count()) >= 3, 'daftar pesanan');
  const semuaPesanan = await kasir.locator('#lap-pesanan tbody tr').count();
  // Chip status yang ada isinya (chip berisi 0 disembunyikan); pilih status pertama selain "Semua".
  const chipStatus = kasir.locator('.laporan-status a.chip').nth(1);
  const labelStatus = (await chipStatus.innerText()).replace(/\s*\(\d+\)$/, '');
  await chipStatus.click();
  await kasir.waitForURL(/status=/);
  await kasir.getByRole('heading', { name: 'Pesanan · ' + labelStatus }).waitFor();
  const jumlahStatus = await kasir.locator('#lap-pesanan tbody tr').count();
  assert.ok(jumlahStatus >= 1 && jumlahStatus < semuaPesanan, 'saring status ' + labelStatus);
  for (const st of await kasir.locator('#lap-pesanan tbody .lencana-status').allInnerTexts()) assert.equal(st, labelStatus);
  await kasir.locator('.laporan-status a.chip', { hasText: 'Semua' }).click();
  // Centang pesanan lalu ubah statusnya sekaligus (kasir bisa; tombol hapus hanya untuk admin).
  await kasir.waitForURL(/laporan\?dari=[^&]+&sampai=[^&]+$/);
  const barisUbah = kasir.locator('#lap-pesanan tbody tr').filter({ hasNotText: 'Selesai' }).filter({ hasNotText: 'Batal' }).first();
  const nomorUbah = (await barisUbah.locator('td').nth(1).innerText()).trim();
  await barisUbah.locator('input[type=checkbox]').check();
  await kasir.locator('.laporan-pilih').waitFor();
  assert.equal(await kasir.locator('.laporan-pilih').getByRole('button', { name: /^Hapus/ }).count(), 0, 'kasir tidak bisa menghapus pesanan');
  await kasir.getByLabel('Ubah pesanan terpilih').selectOption('selesai');
  await kasir.locator('.laporan-pilih').getByRole('button', { name: 'Terapkan' }).click();
  await kasir.getByRole('dialog').getByRole('button', { name: 'Selesai' }).click();
  await kasir.getByText('1 pesanan diperbarui: selesai.').waitFor();
  await kasir.locator('#lap-pesanan tbody tr', { hasText: nomorUbah }).locator('.lencana-status', { hasText: 'Selesai' }).waitFor();
  assert.ok((await sisaLebar(kasir)) <= 0, 'laporan tidak melebar di HP');
  await foto(kasir, '09b-laporan');
  const unduhan = kasir.waitForEvent('download');
  await kasir.locator('#lap-produk').getByRole('button', { name: 'CSV' }).click();
  const berkas = await unduhan;
  assert.match(berkas.suggestedFilename(), /^laporan-produk-\d{4}-\d{2}-\d{2}_\d{4}-\d{2}-\d{2}\.csv$/);
  const csvProduk = fs.readFileSync(await berkas.path(), 'utf8');
  assert.match(csvProduk, /^\ufeffPeringkat;Produk;Terjual/);
  assert.match(csvProduk, /Brownies Fudgy/);
  await kasir.getByRole('link', { name: 'Kemarin' }).click();
  await kasir.waitForURL(/laporan\?dari=/);
  await kasir.getByText('Belum ada transaksi').waitFor();
  await kasir.getByLabel('Dari tanggal').fill('2020-01-01');
  await kasir.getByLabel('Sampai tanggal').fill(jamNanti(0).slice(0, 10));
  await kasir.locator('#lap-produk tbody tr', { hasText: 'Brownies Fudgy' }).first().waitFor();
  assert.equal(await kasir.locator('.grafik-batang').getAttribute('aria-label'), 'Pemasukan per bulan', 'rentang panjang per bulan');

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
  await kasir.getByRole('button', { name: 'Transfer / QRIS', exact: true }).click();
  await kasir.getByRole('button', { name: /^Tandai lunas transfer/ }).click();
  await kasir.getByText('Lunas · Transfer/QRIS').first().waitFor();
  assert.equal(await kasir.getByRole('link', { name: 'Ubah pesanan' }).count(), 0, 'pesanan lunas tidak bisa diubah');
  await foto(kasir, '12-pesanan-manual');

  // Kasir: menu berpilihan membuka jendela pilihan tambahan.
  await kasir.goto(BASE + '/admin#/kasir');
  await kasir.getByRole('button', { name: 'Tambah Paket Hemat ke keranjang' }).click();
  await kasir.getByRole('dialog').getByText('Tambah keju').click();
  await kasir.getByRole('button', { name: 'Tambah jumlah' }).click();
  await foto(kasir, '12b-kasir-pilihan');
  await kasir.getByRole('button', { name: 'Masukkan ke keranjang' }).click();
  await kasir.getByText('+ Tambah keju').waitFor();
  assert.equal(await kasir.locator('.total-kasir').innerText(), 'Rp 8.000', '2 x (3.000 + keju 1.000)');

  tahap('admin: hapus pesanan dari laporan (pilih lalu hapus)');
  await page.goto(ADMIN + '#/laporan?preset=7-hari');
  await page.locator('#lap-pesanan tbody tr').first().waitFor();
  const sebelumHapus = await page.locator('#lap-pesanan tbody tr').count();
  const nomorHapus = (await page.locator('#lap-pesanan tbody tr').first().locator('td').nth(1).innerText()).trim();
  await page.locator('#lap-pesanan tbody input[type=checkbox]').first().check();
  await page.locator('.laporan-pilih').getByRole('button', { name: 'Hapus 1 pesanan' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Hapus 1 pesanan' }).click();
  await page.getByText('1 pesanan dihapus.').waitFor();
  assert.equal(await page.locator('#lap-pesanan tbody tr').count(), sebelumHapus - 1);
  assert.equal(await page.locator('#lap-pesanan tbody tr', { hasText: nomorHapus }).count(), 0, 'pesanan ' + nomorHapus + ' hilang');

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
