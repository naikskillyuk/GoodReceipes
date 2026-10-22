// Uji ujung ke ujung untuk halaman masuk (kata sandi) serta nama dan logo aplikasi.
//
//   npm run e2e:masuk        (SS=/folder/gambar untuk menyimpan tangkapan layar)

import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const { chromium } = await import('playwright-core');
const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const PORT = 8800 + Math.floor(Math.random() * 500);
const BASE = `http://localhost:${PORT}`;
const DATA = path.join(os.tmpdir(), `e2e-masuk-${PORT}.json`);
const SS = process.env.SS || '';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
const KATA_SANDI = 'rahasia-123';

const server = spawn(process.execPath, ['tools/dev-server.mjs', '--reset'], { cwd: AKAR, env: { ...process.env, PORT: String(PORT), DATA }, stdio: 'ignore' });
const galat = [];
let langkah = 0;
const tahap = (nama) => console.log(`  ${++langkah}. ${nama}`);
if (SS) fs.mkdirSync(SS, { recursive: true });
const foto = async (page, nama) => SS && (await page.screenshot({ path: path.join(SS, nama + '.png') }));

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
    if (m.type() === 'error' && !/favicon|manifest|icon|sw\.js|404|drive\.google/.test(m.text())) galat.push(`[${nama}] console: ${m.text()}`);
  });
}

const sisaLebar = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

let halaman = null;
try {
  await tungguServer();
  const browser = await chromium.launch({ executablePath: process.env.CHROMIUM || '/opt/pw-browsers/chromium', args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  halaman = page;
  pantau(page, 'pemilik');
  console.log('Nama, logo, dan kata sandi:');

  tahap('tampilan bawaan: nama dan logo bawaan di beranda dan judul tab');
  await page.goto(BASE + '/');
  await page.getByRole('heading', { name: 'Eksperimen Resep', level: 1 }).waitFor();
  assert.equal(await page.title(), 'Eksperimen Resep');
  assert.equal(await page.getByRole('button', { name: 'Kunci aplikasi' }).count(), 0, 'tanpa kata sandi tidak ada tombol kunci');

  tahap('sambungkan ke Google dan muat data contoh');
  await page.goto(BASE + '/#/pengaturan');
  await page.getByPlaceholder('https://script.google.com/macros/s/…/exec').fill(BASE + '/api');
  await page.locator('input[type=password]').fill('kunci-dev');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await page.getByRole('button', { name: 'Muat data contoh' }).click();
  const idEks = await page.evaluate(async () => {
    const repo = await import('/js/lib/repo.js');
    const e = window.__app.db.semua('Eksperimen')[0];
    return repo.pastikanToken(window.__app.db, e.id).id;
  });
  assert.ok(idEks);

  tahap('ganti nama dan unggah logo besar: logo diperkecil jadi PNG maksimal 256 px');
  const dataBesar = await page.evaluate(() => {
    const c = document.createElement('canvas');
    c.width = 800;
    c.height = 400;
    const x = c.getContext('2d');
    x.fillStyle = '#cf3520';
    x.fillRect(0, 0, 800, 400);
    x.fillStyle = '#fff';
    x.fillRect(300, 100, 200, 200);
    return c.toDataURL('image/png').split(',')[1];
  });
  await page.getByLabel('Nama aplikasi').fill('Dapur Bu Sari');
  await page.locator('input[type=file][accept="image/*"]').setInputFiles({ name: 'logo.png', mimeType: 'image/png', buffer: Buffer.from(dataBesar, 'base64') });
  await page.locator('.foto-terpasang.logo img').waitFor();
  await page.locator('.pratinjau-merek b', { hasText: 'Dapur Bu Sari' }).waitFor();
  await foto(page, '1-pengaturan-tampilan');
  await page.getByRole('button', { name: 'Simpan tampilan' }).click();
  await page.getByText('Tampilan aplikasi disimpan.').waitFor();
  const logoTersimpan = await page.evaluate(() => window.__app.db.ambil('Setelan', 'stl_merek').logoLokal);
  assert.match(logoTersimpan, /^data:image\/png;base64,/);
  const ukuran = await page.evaluate(
    (u) =>
      new Promise((ok) => {
        const i = new Image();
        i.onload = () => ok([i.naturalWidth, i.naturalHeight]);
        i.src = u;
      }),
    logoTersimpan,
  );
  assert.deepEqual(ukuran, [256, 128], 'rasio dipertahankan, sisi terpanjang 256');

  tahap('nama dan logo tampil di beranda, judul tab, dan ikon tab; bertahan setelah muat ulang');
  await page.goto(BASE + '/#/');
  await page.getByRole('heading', { name: 'Dapur Bu Sari', level: 1 }).waitFor();
  assert.equal(await page.title(), 'Dapur Bu Sari');
  assert.match(await page.locator('link[rel=icon]').getAttribute('href'), /^data:image\/png/);
  await page.waitForTimeout(400); // penyimpanan ditulis dengan jeda singkat setelah perubahan
  await page.reload();
  await page.getByRole('heading', { name: 'Dapur Bu Sari', level: 1 }).waitFor();
  await foto(page, '2-beranda');
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.getByRole('complementary', { name: 'Menu utama' }).getByText('Dapur Bu Sari').waitFor();
  await foto(page, '3-beranda-laptop');
  await page.setViewportSize({ width: 390, height: 844 });

  tahap('sinkron: merek dan logo sampai ke Spreadsheet');
  await page.evaluate(() => window.__app.penyinkron.sinkronkan());
  const tautan = await page.evaluate(async (id) => {
    const t = window.__app.db.ambil('Eksperimen', id).tokenNilai;
    return `${location.origin}/#/nilai/${t}?u=${encodeURIComponent(location.origin + '/api')}`;
  }, idEks);

  tahap('buat kata sandi: aturan panjang dan pengulangan diperiksa, lalu aplikasi tetap terbuka');
  await page.goto(BASE + '/#/pengaturan');
  await page.getByText('Aplikasi terbuka tanpa kata sandi').waitFor();
  await page.getByRole('button', { name: 'Buat kata sandi' }).click();
  const dialog = page.getByRole('dialog', { name: 'Buat kata sandi' });
  await dialog.getByLabel(/^Kata sandi/).fill('abc');
  await dialog.getByLabel('Ulangi kata sandi').fill('abc');
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await dialog.getByRole('alert').filter({ hasText: 'minimal 6 karakter' }).waitFor();
  await dialog.getByLabel(/^Kata sandi/).fill(KATA_SANDI);
  await dialog.getByLabel('Ulangi kata sandi').fill('beda-sekali');
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await dialog.getByRole('alert').filter({ hasText: 'tidak sama' }).waitFor();
  await dialog.getByLabel('Ulangi kata sandi').fill(KATA_SANDI);
  await dialog.getByRole('button', { name: 'Simpan' }).click();
  await page.getByText('Kata sandi aktif di perangkat ini').waitFor();
  const simpanan = await page.evaluate(() => JSON.stringify(window.__app.db.pengaturan.kunciAplikasi));
  assert.ok(!simpanan.includes('rahasia'), 'kata sandi tidak disimpan sebagai teks');
  const cadangan = await page.evaluate(() => window.__app.db.ekspor());
  assert.ok(!cadangan.includes('kunci-dev') && !cadangan.includes(JSON.parse(simpanan).hash), 'cadangan tidak memuat kunci dan kata sandi');

  tahap('kunci sekarang: halaman masuk menggantikan seluruh isi aplikasi');
  await page.getByRole('button', { name: 'Kunci sekarang' }).click();
  await page.getByRole('heading', { name: 'Dapur Bu Sari', level: 1 }).waitFor();
  await page.locator('#kata-sandi').waitFor();
  assert.equal(await page.locator('.bawah, .sisi, .halaman').count(), 0, 'isi aplikasi tidak ada di halaman');
  assert.ok(!(await page.content()).includes('Brownies'), 'data resep tidak ikut ada di halaman');
  await foto(page, '4-masuk');

  tahap('kata sandi salah ditolak; setelah beberapa kali salah ada jeda');
  const tombolMasuk = page.getByRole('button', { name: 'Masuk', exact: true });
  for (let i = 0; i < 2; i++) {
    await page.locator('#kata-sandi').fill('salah-banget');
    await tombolMasuk.click();
    await page.getByText('Kata sandi salah.').waitFor();
  }
  await page.locator('#kata-sandi').fill('salah-banget');
  await tombolMasuk.click();
  await page.getByText(/Coba lagi dalam \d+ detik/).waitFor();
  await page.locator('#kata-sandi').fill(KATA_SANDI);
  assert.equal(await tombolMasuk.isDisabled(), true, 'tombol mati selama jeda');
  await foto(page, '5-masuk-jeda');
  await page.waitForFunction(() => !document.querySelector('#masuk-galat').textContent.includes('Coba lagi'), null, { timeout: 5000 });

  tahap('kata sandi benar: masuk ke halaman yang tadi dibuka');
  await page.locator('#kata-sandi').fill(KATA_SANDI);
  await tombolMasuk.click();
  await page.getByRole('heading', { name: 'Pengaturan', level: 1 }).waitFor();
  assert.ok(page.url().endsWith('#/pengaturan'));

  tahap('muat ulang saat sesi masih baru tidak meminta masuk lagi');
  await page.reload();
  await page.getByRole('heading', { name: 'Pengaturan', level: 1 }).waitFor();

  tahap('kunci otomatis: sesi yang terlalu lama diam mengunci aplikasi');
  await page.evaluate(() => sessionStorage.setItem('resep-sesi', String(Date.now() - 20 * 60000)));
  await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange')));
  await page.locator('#kata-sandi').waitFor();
  await page.reload();
  await page.locator('#kata-sandi').waitFor();
  assert.equal(await page.locator('.bawah').count(), 0);

  tahap('penilai lewat QR tidak pernah diminta masuk, bahkan di perangkat yang sedang terkunci');
  await page.goto(tautan);
  await page.getByRole('button', { name: /Kirim penilaian/ }).waitFor();
  assert.equal(await page.locator('#kata-sandi').count(), 0);
  await page.goto(BASE + '/#/');
  await page.locator('#kata-sandi').waitFor();

  tahap('penilai di perangkat lain melihat nama dan logo dari Spreadsheet');
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  await ctx2.route('https://drive.google.com/**', (r) => r.fulfill({ contentType: 'image/png', body: PNG }));
  const rater = await ctx2.newPage();
  pantau(rater, 'penilai');
  await rater.goto(tautan);
  await rater.getByRole('button', { name: /Kirim penilaian/ }).waitFor();
  await rater.locator('.merek-hero', { hasText: 'Dapur Bu Sari' }).waitFor();
  await rater.getByText(/^Beri penilaian · Eksperimen/).waitFor();
  assert.equal(await rater.title(), 'Beri penilaian · Dapur Bu Sari');
  const srcLogo = await rater.locator('.merek-hero img').getAttribute('src');
  assert.match(srcLogo, /^(https:\/\/drive\.google\.com\/thumbnail|\/foto\/)/, 'logo memakai tautan dari Spreadsheet, bukan salinan lokal');
  assert.ok(await rater.locator('.merek-hero img').evaluate((i) => i.complete && i.naturalWidth > 0), 'logo penilai termuat');
  await foto(rater, '6-penilai');
  await ctx2.close();

  tahap('lupa kata sandi: kunci Apps Script yang salah ditolak, yang benar menghapus kata sandi tanpa menghapus data');
  await page.getByRole('button', { name: 'Lupa kata sandi?' }).click();
  const lupa = page.getByRole('dialog', { name: 'Lupa kata sandi' });
  await foto(page, '7-lupa');
  await lupa.getByLabel('Kunci rahasia Apps Script').fill('kunci-yang-salah');
  await lupa.getByRole('button', { name: 'Hapus kata sandi' }).click();
  await lupa.getByRole('alert').waitFor();
  await lupa.getByLabel('Kunci rahasia Apps Script').fill('kunci-dev');
  await lupa.getByRole('button', { name: 'Hapus kata sandi' }).click();
  await page.locator('#kata-sandi').waitFor({ state: 'detached' });
  await page.getByRole('heading', { name: 'Dapur Bu Sari', level: 1 }).waitFor();
  assert.equal(await page.evaluate(() => window.__app.db.pengaturan.kunciAplikasi), null);
  assert.ok((await page.evaluate(() => window.__app.db.semua('Resep').length)) > 0, 'data tetap ada');

  tahap('matikan kata sandi: butuh kata sandi saat ini');
  await page.goto(BASE + '/#/pengaturan');
  await page.getByRole('button', { name: 'Buat kata sandi' }).click();
  const d2 = page.getByRole('dialog', { name: 'Buat kata sandi' });
  await d2.getByLabel(/^Kata sandi/).fill(KATA_SANDI);
  await d2.getByLabel('Ulangi kata sandi').fill(KATA_SANDI);
  await d2.getByRole('button', { name: 'Simpan' }).click();
  await page.getByText('Kata sandi aktif di perangkat ini').waitFor();
  await page.getByLabel('Kunci otomatis').selectOption('1');
  assert.equal(await page.evaluate(() => window.__app.db.pengaturan.kunciOtomatisMenit), 1);
  await page.getByRole('button', { name: 'Matikan', exact: true }).click();
  const d3 = page.getByRole('dialog', { name: 'Matikan kata sandi' });
  await d3.getByLabel('Kata sandi saat ini').fill('salah-salah');
  await d3.getByRole('button', { name: 'Matikan' }).click();
  await d3.getByText('Kata sandi saat ini salah.').waitFor();
  await d3.getByLabel('Kata sandi saat ini').fill(KATA_SANDI);
  await d3.getByRole('button', { name: 'Matikan' }).click();
  await page.getByText('Aplikasi terbuka tanpa kata sandi').waitFor();

  tahap('ubah kata sandi lalu kosongkan data lewat "lupa": kata sandi dan kunci Apps Script ikut hilang, data kembali lewat sinkron');
  await page.getByRole('button', { name: 'Buat kata sandi' }).click();
  const d4 = page.getByRole('dialog', { name: 'Buat kata sandi' });
  await d4.getByLabel(/^Kata sandi/).fill(KATA_SANDI);
  await d4.getByLabel('Ulangi kata sandi').fill(KATA_SANDI);
  await d4.getByRole('button', { name: 'Simpan' }).click();
  await page.getByRole('button', { name: 'Ubah kata sandi' }).click();
  const d5 = page.getByRole('dialog', { name: 'Ubah kata sandi' });
  await d5.getByLabel('Kata sandi saat ini').fill(KATA_SANDI);
  await d5.getByLabel('Kata sandi baru').fill('kata-sandi-baru');
  await d5.getByLabel('Ulangi kata sandi').fill('kata-sandi-baru');
  await d5.getByRole('button', { name: 'Simpan' }).click();
  await page.getByText('Kata sandi diganti.').waitFor();
  await page.getByRole('button', { name: 'Kunci sekarang' }).click();
  await page.locator('#kata-sandi').fill(KATA_SANDI);
  await tombolMasuk.click();
  await page.getByText('Kata sandi salah.').waitFor();
  await page.getByRole('button', { name: 'Lupa kata sandi?' }).click();
  await page.getByRole('dialog', { name: 'Lupa kata sandi' }).getByRole('button', { name: 'Kosongkan data perangkat ini' }).click();
  await page.getByRole('dialog', { name: 'Kosongkan data perangkat ini?' }).getByRole('button', { name: 'Kosongkan' }).click();
  await page.getByRole('heading', { name: 'Pengaturan', level: 1 }).waitFor();
  const sisa = await page.evaluate(() => ({ resep: window.__app.db.semua('Resep').length, kunci: window.__app.db.pengaturan.kunci, kunciAplikasi: window.__app.db.pengaturan.kunciAplikasi }));
  assert.deepEqual(sisa, { resep: 0, kunci: '', kunciAplikasi: null });
  await page.goto(BASE + '/#/pengaturan');
  await page.locator('input[type=password]').first().fill('kunci-dev');
  await page.getByRole('button', { name: 'Simpan', exact: true }).click();
  await page.evaluate(() => window.__app.penyinkron.sinkronkan());
  await page.goto(BASE + '/#/');
  await page.getByRole('heading', { name: 'Dapur Bu Sari', level: 1 }).waitFor();
  assert.ok((await page.evaluate(() => window.__app.db.semua('Resep').length)) > 0, 'resep kembali dari Spreadsheet');
  assert.equal(await page.evaluate(() => /^(https:\/\/drive\.google\.com\/thumbnail|\/foto\/)/.test(window.__app.db.ambil('Setelan', 'stl_merek').logoUrl)), true, 'logo kembali lewat tautan Drive');

  tahap('kembalikan bawaan: nama dan logo kembali seperti semula');
  await page.goto(BASE + '/#/pengaturan');
  await page.getByRole('button', { name: 'Kembalikan bawaan' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Kembalikan' }).click();
  await page.getByText('Kembali ke tampilan bawaan.').waitFor();
  await page.goto(BASE + '/#/');
  await page.getByRole('heading', { name: 'Eksperimen Resep', level: 1 }).waitFor();
  assert.equal(await page.title(), 'Eksperimen Resep');
  assert.equal(await page.locator('link[rel=icon]').getAttribute('href'), 'icons/icon.svg');

  tahap('nama sangat panjang tidak merusak tata letak di halaman masuk, beranda, pengaturan, dan QR');
  await page.goto(BASE + '/#/pengaturan');
  await page.getByLabel('Nama aplikasi').fill('Dapur Keluarga Besar Sejahtera Bersama Selalu');
  assert.equal((await page.getByLabel('Nama aplikasi').inputValue()).length, 40, 'nama dibatasi 40 karakter');
  await page.getByLabel('Nama aplikasi').fill('Dapurkeluargabesarsejahterabersamaselalu1');
  await page.getByRole('button', { name: 'Simpan tampilan' }).click();
  await page.getByRole('button', { name: 'Buat kata sandi' }).click();
  const d6 = page.getByRole('dialog', { name: 'Buat kata sandi' });
  await d6.getByLabel(/^Kata sandi/).fill(KATA_SANDI);
  await d6.getByLabel('Ulangi kata sandi').fill(KATA_SANDI);
  await d6.getByRole('button', { name: 'Simpan' }).click();
  await page.getByText('Kata sandi aktif di perangkat ini').waitFor();
  const idE = await page.evaluate(() => window.__app.db.semua('Eksperimen')[0].id);
  for (const [lebar, tinggi] of [[360, 740], [390, 844], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width: lebar, height: tinggi });
    for (const r of ['/', '/pengaturan', `/eksperimen/${idE}/bagikan`]) {
      await page.goto(BASE + '/#' + r);
      await page.waitForTimeout(100);
      assert.ok((await sisaLebar(page)) <= 1, `${r} melebar pada lebar ${lebar}`);
    }
    await page.goto(BASE + '/#/');
    await page.getByRole('button', { name: 'Kunci aplikasi' }).first().click();
    await page.locator('#kata-sandi').waitFor();
    assert.ok((await sisaLebar(page)) <= 1, `halaman masuk melebar pada lebar ${lebar}`);
    if (lebar === 360) await foto(page, '8-masuk-nama-panjang-360');
    if (lebar === 1440) await foto(page, '9-masuk-laptop');
    await page.locator('#kata-sandi').fill(KATA_SANDI);
    await page.getByRole('button', { name: 'Masuk', exact: true }).click();
    await page.getByRole('button', { name: 'Kunci aplikasi' }).first().waitFor();
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(BASE + '/#/');
  await foto(page, '10-beranda-nama-panjang');
  await browser.close();
} catch (e) {
  galat.push('GAGAL: ' + (e.stack || e));
  if (halaman) {
    try {
      galat.push('Saat gagal: ' + halaman.url() + ' | h1: ' + JSON.stringify(await halaman.locator('h1').allInnerTexts()) + ' | dialog: ' + JSON.stringify(await halaman.locator('[role=dialog]').evaluateAll((d) => d.map((x) => x.getAttribute('aria-label')))));
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
console.log('\nSemua alur masuk dan merek lolos.');
process.exit(0);
