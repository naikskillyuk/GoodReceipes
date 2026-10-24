// Uji ujung ke ujung di browser nyata: dari data kosong sampai penilaian lewat QR.
//
//   npm i -D playwright-core      (sekali saja)
//   npm run e2e
//
// Memakai Chromium yang sudah ada (CHROMIUM=/jalur/ke/chromium bila perlu) dan menjalankan
// dev-server sendiri dengan data sementara.

import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright-core');
const { masukUji, cariBrowser } = await import('./bantu.mjs');
const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8300 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
const DATA = path.join(os.tmpdir(), `e2e-resep-${PORT}.json`);
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

const server = spawn(process.execPath, ['tools/dev-server.mjs', '--reset'], { cwd: AKAR, env: { ...process.env, PORT: String(PORT), DATA }, stdio: 'ignore' });
const galat = [];
let langkah = 0;
const tahap = (nama) => console.log(`  ${++langkah}. ${nama}`);

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
    // Sebelum memilih server uji, aplikasi mencoba Laravel lokal (localhost:8000) yang tidak dijalankan di tes ini.
    const keLaravelLokal = /localhost:8000\//.test((m.location() && m.location().url) || '');
    if (m.type() === 'error' && !keLaravelLokal && !/favicon|manifest|icon|sw\.js|404/.test(m.text())) galat.push(`[${nama}] console: ${m.text()}`);
  });
}

const teks = (page, sel) => page.locator(sel).first().innerText();

try {
  await tungguServer();
  const browser = await chromium.launch({ executablePath: await cariBrowser(), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  pantau(page, 'pemilik');
  console.log('Alur pemilik:');

  tahap('tanpa akun: layar sambutan dengan tombol Login; formulir muncul setelah ditekan; kata sandi salah ditolak');
  await page.goto(BASE + '/');
  await page.getByRole('heading', { name: 'Good Receipes', level: 1 }).waitFor();
  assert.equal(await page.locator('#login-akun').count(), 0, 'formulir belum tampil sebelum Login ditekan');
  assert.equal(await page.locator('.sisi').count(), 0, 'menu aplikasi belum tampil sebelum masuk');
  assert.equal(await page.getByText(/Daftar/).count(), 0, 'tidak ada pendaftaran sendiri');
  await page.getByRole('button', { name: 'Login', exact: true }).click();
  await page.locator('#login-akun').waitFor();
  await page.getByRole('button', { name: 'Lupa password?' }).waitFor();
  await page.getByText('Mode uji · server: localhost:8000').waitFor(); // tanpa config.js: Laravel lokal
  await page.getByRole('button', { name: 'ganti', exact: true }).click();
  await page.getByLabel('Alamat server (API)').fill(BASE + '/api');
  await page.getByRole('button', { name: 'Pakai server ini' }).click();
  await page.locator('#login-akun').fill('chef@uji.test');
  await page.locator('#sandi-akun').fill('salah-sekali');
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.getByText('Username/email atau kata sandi salah.').waitFor();
  await page.getByRole('button', { name: 'Lupa password?' }).click();
  await page.locator('#login-lupa').fill('chef@uji.test');
  await page.getByRole('button', { name: 'Kirim tautan' }).click();
  await page.getByText(/Tidak ada email terkirim/).waitFor();
  assert.equal(await page.locator('#login-akun').inputValue(), 'chef@uji.test', 'setelah lupa sandi kembali ke Login dengan login terisi');
  await page.getByRole('button', { name: 'Tutup' }).click();
  await page.getByRole('button', { name: 'Login', exact: true }).waitFor();

  tahap('masuk dengan akun uji');
  await masukUji(page, BASE);

  tahap('data kosong menampilkan ajakan membuat resep');
  await page.goto(BASE + '/');
  await page.getByText('Belum ada resep').first().waitFor();

  tahap('tambah tiga bahan dengan konversi satuan');
  await page.goto(BASE + '/#/bahan?baru=1');
  const tambahBahan = async (nama, merek, harga, isi, satuan, konversi) => {
    await page.getByPlaceholder('mis. Dark chocolate').fill(nama);
    await page.locator('input.input').nth(2).fill(merek); // setelah pencarian dan nama: merek
    await page.getByPlaceholder('mis. 95.000').fill(String(harga));
    await page.locator('label:has-text("Isi kemasan") input').fill(String(isi));
    await page.locator('label:has-text("Satuan kemasan") select').selectOption(satuan);
    for (const [s, n] of konversi) {
      await page.getByLabel('Nama satuan').fill(s);
      await page.getByLabel('Nilai konversi').fill(String(n));
      await page.getByRole('button', { name: 'Tambah', exact: true }).click();
    }
    await page.getByRole('button', { name: 'Simpan', exact: true }).click();
    await page.getByText('Bahan disimpan.').waitFor();
  };
  await tambahBahan('Tepung terigu', 'Segitiga Biru', 13000, 1, 'kg', [['sdm', 8]]);
  await page.getByRole('button', { name: 'Bahan baru' }).click();
  await tambahBahan('Telur ayam', 'Peternak lokal', 30000, 1, 'kg', [['butir', 55]]);
  await page.getByRole('button', { name: 'Bahan baru' }).click();
  await tambahBahan('Cokelat bubuk', 'Van Houten', 45000, 500, 'g', [['sdm', 6]]);
  const jumlahBahan = await page.evaluate(() => window.__app.db.semua('Bahan').length);
  assert.equal(jumlahBahan, 3);
  const harga = await page.evaluate(async () => {
    const u = await import('/js/lib/units.js');
    const b = window.__app.db.semua('Bahan').find((x) => x.nama === 'Telur ayam');
    const k = window.__app.db.semua('KonversiSatuan', (x) => x.idBahan === b.id);
    return u.hargaPerSatuanResep(b, k, 'butir');
  });
  assert.equal(Math.round(harga), 1650, '1 butir telur = 55 g x Rp 30/g');

  tahap('buat resep dengan gambar acuan, kategori, dan target');
  await page.goto(BASE + '/#/resep/baru');
  await page.locator('#nama-resep').fill('Kue Uji');
  await page.getByRole('button', { name: 'Kue', exact: true }).click();
  await page.locator('#target-resep').fill('Lembut dan harga di bawah Rp 5.000.');
  await page.setInputFiles('input[type=file]', { name: 'acuan.png', mimeType: 'image/png', buffer: PNG });
  await page.locator('.foto-terpasang').waitFor();
  await page.getByRole('button', { name: /Simpan resep/ }).click();
  await page.getByRole('heading', { name: 'Kue Uji' }).waitFor();
  const idResep = await page.evaluate(() => window.__app.db.semua('Resep')[0].id);
  assert.ok((await page.evaluate(() => window.__app.db.semua('Resep')[0].fotoAcuanLokal)).startsWith('data:image/jpeg'));
  await page.getByText('Lembut dan harga di bawah').waitFor();

  tahap('validasi: nama resep wajib');
  await page.goto(BASE + '/#/resep/baru');
  await page.getByRole('button', { name: /Simpan resep/ }).click();
  await page.getByText('Nama resep wajib diisi.').waitFor();

  tahap('catat eksperimen 1: bahan, takaran, langkah, foto');
  await page.goto(BASE + `/#/resep/${idResep}/eksperimen/baru`);
  await page.getByLabel('Jumlah hasil jadi').fill('10');
  await page.locator('input[list=daftar-satuan-porsi]').fill('potong');
  const pilih = async (nama, jumlah, satuan) => {
    await page.getByRole('button', { name: 'Tambah bahan' }).first().click();
    await page.locator('.pilih-item', { hasText: nama }).click();
    await page.getByLabel(`Jumlah ${nama}`).fill(String(jumlah));
    if (satuan) await page.getByLabel(`Satuan ${nama}`).selectOption(satuan);
  };
  await pilih('Tepung terigu', 100, 'g');
  await pilih('Telur ayam', 2, 'butir');
  await page.getByLabel('Langkah 1', { exact: true }).fill('Kocok telur, campur tepung.');
  await page.setInputFiles('input[type=file]', { name: 'hasil.png', mimeType: 'image/png', buffer: PNG });
  await page.locator('.foto-terpasang').waitFor();
  await page.getByText('Rp 4.600').first().waitFor(); // 100 g x 13 + 2 x 1.650
  await page.getByRole('button', { name: /Simpan eksperimen/ }).click();
  await page.getByRole('heading', { name: 'Eksperimen 1' }).waitFor();
  const idEks1 = await page.evaluate(() => window.__app.db.semua('Eksperimen')[0].id);

  tahap('validasi: jumlah bahan wajib diisi');
  await page.goto(BASE + `/#/resep/${idResep}/eksperimen/baru`);
  await page.getByRole('button', { name: 'Tambah bahan' }).first().click();
  await page.locator('.pilih-item', { hasText: 'Cokelat bubuk' }).click();
  await page.getByRole('button', { name: /Simpan eksperimen/ }).click();
  await page.getByText('Jumlah Cokelat bubuk belum diisi.').waitFor();

  tahap('duplikat eksperimen 1, ubah takaran, selisih biaya tampil');
  await page.goto(BASE + `/#/resep/${idResep}/eksperimen/baru?dari=${idEks1}`);
  await page.getByText('Salinan dari Eksperimen 1').waitFor();
  await page.getByLabel('Jumlah Tepung terigu').fill('150');
  await page.locator('.bahan-form.berubah').waitFor();
  await page.getByText('▲ Rp 650 dari Eks. 1').waitFor();
  await pilih('Cokelat bubuk', 2, 'sdm'); // 2 sdm x 6 g x Rp 90/g = 1.080
  await page.getByRole('button', { name: /Simpan eksperimen/ }).click();
  await page.getByRole('heading', { name: 'Eksperimen 2' }).waitFor();
  const idEks2 = await page.evaluate(() => window.__app.db.semua('Eksperimen').find((e) => e.nomor === 2).id);

  tahap('sebelum ada juara, resep tampil di banner "Sedang dikembangkan" beranda');
  const urlEks2 = page.url();
  await page.goto(BASE + '/#/');
  await page.locator('.banner-kembang', { hasText: 'Kue Uji' }).waitFor();
  assert.equal(await page.locator('.kartu-juara').count(), 0);

  tahap('tandai eksperimen 2 sebagai juara: pindah ke slider resep juara di beranda');
  await page.goto(urlEks2);
  await page.getByRole('button', { name: 'Tandai' }).click();
  await page.getByText('Eksperimen juara').first().waitFor();
  await page.goto(BASE + '/#/');
  await page.locator('.kartu-juara', { hasText: 'Kue Uji' }).waitFor();
  assert.match(await teks(page, '.kartu-juara'), /Eksperimen 2/);
  assert.equal(await page.locator('.banner-kembang', { hasText: 'Kue Uji' }).count(), 0, 'tidak lagi di banner dikembangkan');

  tahap('HPP: biaya lain, harga jual, margin, BEP, target');
  await page.goto(BASE + `/#/resep/${idResep}/hpp`);
  await page.getByRole('button', { name: /Kemasan/ }).click();
  await page.getByLabel('Nilai Kemasan').fill('500');
  await page.getByLabel('Dihitung per untuk Kemasan').selectOption('porsi');
  // bahan eks. 2 = 150 g x 13 + 2 x 1.650 + 1.080 = 1.950 + 3.300 + 1.080 = 6.330; + kemasan 500 x 10
  await page.getByText('Rp 11.330').first().waitFor();
  await page.getByText('Rp 1.133').first().waitFor(); // HPP per porsi
  await page.getByRole('button', { name: /Pakai Rp/ }).click();
  const hargaJual = await page.evaluate(() => window.__app.db.semua('Target')[0].hargaJual);
  assert.equal(hargaJual, 2000, '1.133 / 0,6 = 1.888,9 -> dibulatkan ke 2.000');
  await page.getByPlaceholder('mis. 1.500.000').fill('500000');
  await page.getByPlaceholder('mis. 3.000.000').fill('1000000');
  await page.getByText('577 porsi').first().waitFor(); // 500.000 / (2.000 - 1.133) = 576,6 -> 577
  await page.getByText('1.154 porsi').first().waitFor(); // 1.000.000 / 867 = 1.153,4 -> 1.154
  assert.match(await teks(page, '.kartu-hpp'), /1\.133/);

  tahap('HPP: resep lain sebagai resep tambahan menambah HPP');
  const hppSebelum = await page.evaluate(async (id) => (await import('/js/lib/repo.js')).dataHPP(window.__app.db, id).hpp.totalResep, idResep);
  const idSaus = await page.evaluate(async (id) => {
    const repo = await import('/js/lib/repo.js');
    const db = window.__app.db;
    const saus = repo.buatResep(db, { nama: 'Saus Uji', idKategori: db.ambil('Resep', id).idKategori });
    const bahan = db.semua('Bahan')[0];
    repo.simpanEksperimen(db, { eksperimen: { ...repo.draftEksperimen(db, saus.id).eksperimen, porsi: 100, satuanPorsi: 'gram' }, baris: [{ idBahan: bahan.id, jumlah: 100, satuan: 'g' }] });
    return saus.id;
  }, idResep);
  await page.goto(BASE + `/#/resep/${idResep}/hpp`);
  await page.getByLabel('Tambah resep tambahan').selectOption(idSaus);
  await page.getByRole('link', { name: 'Saus Uji' }).waitFor();
  await page.getByLabel('Jumlah Saus Uji').fill('50');
  await page.getByRole('cell', { name: /Saus Uji/ }).waitFor();
  const hppSesudah = await page.evaluate(async (id) => (await import('/js/lib/repo.js')).dataHPP(window.__app.db, id), idResep);
  assert.equal(hppSesudah.tambahan.rincian.length, 1);
  assert.ok(hppSesudah.hpp.totalResep > hppSebelum, 'HPP bertambah');
  assert.equal(Math.round(hppSesudah.hpp.totalResep - hppSebelum), Math.round(hppSesudah.tambahan.total));
  assert.equal(await page.locator('select[aria-label="Tambah resep tambahan"]').count(), 0, 'tidak ada resep lain yang bisa ditambahkan lagi');

  tahap('semua perubahan tersimpan ke server sendiri (tanpa tombol), foto ikut terunggah');
  await page.goto(BASE + '/#/pengaturan');
  await page.getByRole('heading', { name: 'Akun' }).waitFor();
  assert.equal(await page.getByText('chefuji').count(), 1, 'username tampil');
  assert.equal(await page.getByRole('button', { name: /Sinkron/ }).count(), 0, 'tidak ada tombol sinkron');
  await page.waitForFunction(() => window.__app.db.jumlahKotor() === 0, null, { timeout: 15000 });
  const fotoUrl = await page.evaluate(() => window.__app.db.semua('Eksperimen')[0].fotoHasilUrl);
  assert.match(fotoUrl, /^\/foto\//);

  tahap('halaman bagikan QR aktif, petunjuk penilaian dan catatan chef diisi');
  await page.goto(BASE + `/#/eksperimen/${idEks2}/bagikan`);
  await page.locator('.qr-kotak svg').waitFor();
  await page.getByLabel(/^Catatan chef/).fill('Gula saya kurangi 20 g dari eksperimen 1.');
  await page.getByLabel('Tekstur', { exact: true }).fill('Harus kriuk dan kering');
  await page.getByLabel('Rasa', { exact: true }).fill('Jangan terlalu asin');
  await page.waitForFunction(() => window.__app.db.jumlahKotor() === 0, null, { timeout: 15000 });
  await page.getByText('Kode QR aktif.').waitFor();
  assert.equal(await page.locator('.qr-kotak.mati').count(), 0);
  const tautan = (await teks(page, '.tautan-teks')).trim();
  assert.match(tautan, /#\/nilai\/[a-z0-9]{16}\?u=/);

  console.log('Alur penilai (tanpa login, perangkat lain):');
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const rater = await ctx2.newPage();
  pantau(rater, 'penilai');

  tahap('token palsu ditolak');
  await rater.goto(tautan.replace(/\/nilai\/[a-z0-9]{16}/, '/nilai/tokenpalsu123456'));
  await rater.getByText('Penilaian tidak bisa dibuka').waitFor();

  tahap('penilai mengisi lewat tautan, nilai wajib disentuh dulu');
  await rater.goto(tautan);
  await rater.getByRole('heading', { name: 'Kue Uji' }).waitFor();
  await rater.getByText('Eksperimen 2').first().waitFor();
  assert.equal(await rater.locator('.sisi').count(), 0, 'penilai tidak melihat menu pemilik');
  assert.equal(await rater.locator('#login-akun').count(), 0, 'penilai tidak diminta masuk akun');
  await rater.getByText('Gula saya kurangi 20 g dari eksperimen 1.').waitFor();
  assert.equal((await rater.locator('#petunjuk-tekstur').innerText()).trim(), 'Harus kriuk dan kering');
  assert.equal((await rater.locator('#petunjuk-rasa').innerText()).trim(), 'Jangan terlalu asin');
  assert.equal(await rater.locator('#petunjuk-aroma').count(), 0, 'aspek tanpa petunjuk tidak menampilkan apa pun');
  await rater.getByLabel('Nama Anda').fill('Tamu Uji');
  await rater.getByRole('button', { name: /Kirim penilaian/ }).click();
  await rater.getByText('Geser kelima penggeser dulu').waitFor();
  for (const [aspek, nilai] of [['rasa', 9], ['tekstur', 8], ['tampilan', 7], ['aroma', 10], ['minatBeli', 9]]) await rater.locator(`#geser-${aspek}`).fill(String(nilai));
  await rater.getByLabel(/Komentar/).fill('Enak sekali, tidak terlalu manis.');
  await rater.getByRole('button', { name: /Kirim penilaian/ }).click();
  await rater.getByText('Terima kasih!').waitFor();

  tahap('penilaian dari QR masuk ke aplikasi pemilik dan skor dihitung ulang');
  await page.evaluate(() => window.__app.penyinkron.sinkronkan());
  const nilaiMasuk = await page.evaluate((id) => window.__app.db.semua('Penilaian', (p) => p.idEksperimen === id && !p.dariPemilik).map((p) => ({ n: p.namaPenilai, r: p.rasa, a: p.aroma, k: p.komentar })), idEks2);
  assert.deepEqual(nilaiMasuk, [{ n: 'Tamu Uji', r: 9, a: 10, k: 'Enak sekali, tidak terlalu manis.' }]);
  await page.goto(BASE + `/#/eksperimen/${idEks2}`);
  await page.getByText('Enak sekali, tidak terlalu manis.').waitFor();
  assert.match(await teks(page, '.bulat-skor'), /9,0/); // rasa 9
  await page.goto(BASE + '/#/ulasan');
  await page.getByText('Tamu Uji').waitFor();

  tahap('pemilik menutup penilaian, penilai melihat pesan ditutup');
  await page.goto(BASE + `/#/eksperimen/${idEks2}/bagikan`);
  await page.getByText('Terima penilaian').click(); // matikan
  await page.evaluate(() => window.__app.penyinkron.sinkronkan());
  await rater.reload();
  await rater.getByText('Penilaian sudah ditutup').waitFor();

  tahap('pemilik menghapus ulasan dengan konfirmasi');
  await page.goto(BASE + '/#/ulasan');
  await page.getByRole('button', { name: 'Hapus ulasan' }).first().click();
  await page.getByRole('button', { name: 'Hapus', exact: true }).click();
  await page.getByText('Belum ada ulasan').waitFor();

  tahap('tidak ada layar yang melebar keluar di HP, tablet, dan laptop');
  const rute = ['/', '/resep', '/resep?tujuan=hpp', '/resep/baru', '/bahan', '/ulasan', '/pengaturan', `/resep/${idResep}`, `/resep/${idResep}/hpp`, `/resep/${idResep}/marketing`, `/resep/${idResep}/bandingkan`, `/resep/${idResep}/ubah`, `/eksperimen/${idEks2}`, `/eksperimen/${idEks2}/ubah`, `/eksperimen/${idEks2}/bagikan`, `/resep/${idResep}/eksperimen/baru?dari=${idEks2}`];
  for (const [lebar, tinggi] of [[360, 740], [390, 844], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width: lebar, height: tinggi });
    for (const r of rute) {
      await page.goto(BASE + '/#' + r);
      await page.waitForTimeout(120);
      const lebarIsi = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      assert.ok(lebarIsi <= 1, `${r} melebar ${lebarIsi}px pada lebar ${lebar}`);
    }
  }

  tahap('offline: aplikasi tetap terbuka dari cache dan data lokal');
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/#/resep');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForFunction(async () => {
    const nama = await caches.keys();
    return nama.length > 0 && (await (await caches.open(nama[0])).keys()).length > 20;
  }, null, { timeout: 15000 });
  await ctx.setOffline(true);
  await page.reload();
  await page.getByText('Kue Uji').first().waitFor();
  await page.goto(BASE + `/#/resep/${idResep}`);
  await page.getByRole('heading', { name: 'Kue Uji' }).waitFor();
  await ctx.setOffline(false);
  await browser.close();
} catch (e) {
  galat.push('GAGAL: ' + (e.stack || e));
} finally {
  server.kill();
  fs.rmSync(DATA, { force: true });
}

if (galat.length) {
  console.error('\nGALAT:\n' + galat.join('\n'));
  process.exit(1);
}
console.log('\nSemua alur lolos.');
process.exit(0);
