// Uji ujung ke ujung: nama dan logo aplikasi, data tersimpan di server, export PDF, dan hapus resep.
//
//   npm run e2e:masuk        (SS=/folder/gambar untuk menyimpan tangkapan layar)

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
const DATA = path.join(os.tmpdir(), `e2e-masuk-${PORT}.json`);
const SS = process.env.SS || '';
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');

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
    if (m.type() === 'error' && !/favicon|manifest|icon|sw\.js|404/.test(m.text())) galat.push(`[${nama}] console: ${m.text()}`);
  });
}

const sisaLebar = (page) => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);

let halaman = null;
try {
  await tungguServer();
  const browser = await chromium.launch({ executablePath: await cariBrowser(), args: ['--no-sandbox'] });
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const page = await ctx.newPage();
  halaman = page;
  pantau(page, 'pemilik');
  console.log('Nama, logo, data di server, ekspor, dan hapus resep:');

  tahap('masuk ke akun uji');
  await masukUji(page, BASE);

  tahap('tampilan bawaan; tidak ada kunci aplikasi, tombol sinkron, cadangan, atau data contoh');
  await page.goto(BASE + '/');
  await page.getByRole('heading', { name: 'Good Receipes', level: 1 }).waitFor();
  assert.equal(await page.title(), 'Good Receipes');
  await page.goto(BASE + '/#/pengaturan');
  await page.getByRole('heading', { name: 'Pengaturan', level: 1 }).waitFor();
  for (const teks of [/Kunci/, /Sinkron/, /cadangan/i, /Pulihkan/, /data contoh/i, /Kosongkan/]) {
    assert.equal(await page.getByRole('button', { name: teks }).count(), 0, `tidak ada tombol ${teks}`);
  }
  assert.equal(await page.getByText(/Sinkron otomatis|Kata sandi aktif|Kunci perangkat/).count(), 0);

  tahap('isi data (perlengkapan uji) lalu tersimpan ke server sendiri, tanpa tombol');
  const idEks = await page.evaluate(async () => {
    const { muatContoh } = await import('/js/lib/seed.js');
    const repo = await import('/js/lib/repo.js');
    muatContoh(window.__app.db);
    const e = repo.eksperimenResep(window.__app.db, window.__app.db.semua('Resep').find((r) => r.nama === 'Brownies Fudgy').id)[2];
    return repo.pastikanToken(window.__app.db, e.id).id;
  });
  await page.waitForFunction(() => window.__app.db.jumlahKotor() === 0, null, { timeout: 15000 });

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
  assert.equal(await page.getByRole('complementary', { name: 'Menu utama' }).getByText(/Sinkron|Tersinkron/).count(), 0, 'menu samping tanpa status sinkron');
  await foto(page, '3-beranda-laptop');
  await page.setViewportSize({ width: 390, height: 844 });

  tahap('merek dan logo tersimpan ke server sendiri');
  await page.waitForFunction(() => window.__app.db.jumlahKotor() === 0 && /^\/foto\//.test(window.__app.db.ambil('Setelan', 'stl_merek').logoUrl || ''), null, { timeout: 15000 });
  const tautan = await page.evaluate(async (id) => {
    const t = window.__app.db.ambil('Eksperimen', id).tokenNilai;
    return `${location.origin}/#/nilai/${t}?u=${encodeURIComponent(location.origin + '/api')}`;
  }, idEks);

  tahap('penilai di perangkat lain melihat nama dan logo; penilaiannya masuk ke database lalu tampil di aplikasi pemilik');
  const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const rater = await ctx2.newPage();
  pantau(rater, 'penilai');
  await rater.goto(tautan);
  await rater.getByRole('button', { name: /Kirim penilaian/ }).waitFor();
  await rater.locator('.merek-hero', { hasText: 'Dapur Bu Sari' }).waitFor();
  await rater.waitForFunction(() => document.title === 'Beri penilaian · Dapur Bu Sari');
  const srcLogo = await rater.locator('.merek-hero img').getAttribute('src');
  assert.match(srcLogo, /^\/foto\//, 'logo memakai tautan dari server, bukan salinan lokal');
  assert.ok(await rater.locator('.merek-hero img').evaluate((i) => i.complete && i.naturalWidth > 0), 'logo penilai termuat');
  await foto(rater, '6-penilai');
  const sebelum = await page.evaluate((id) => window.__app.db.semua('Penilaian', (p) => p.idEksperimen === id).length, idEks);
  await rater.getByLabel('Nama Anda').fill('Tamu QR');
  for (const aspek of ['rasa', 'tekstur', 'tampilan', 'aroma', 'minatBeli']) await rater.locator(`#geser-${aspek}`).fill('8');
  await rater.getByRole('button', { name: /Kirim penilaian/ }).click();
  await rater.getByText(/Terima kasih/).waitFor();
  await ctx2.close();
  await page.evaluate(() => window.dispatchEvent(new Event('online'))); // tanpa menunggu jadwal berkala
  await page.waitForFunction(([id, n]) => window.__app.db.semua('Penilaian', (p) => p.idEksperimen === id).length === n + 1, [idEks, sebelum], { timeout: 15000 });

  tahap('export PDF: satu resep lengkap dengan semua eksperimen, tombol tidak ikut tercetak');
  const idResep = await page.evaluate((id) => window.__app.db.ambil('Eksperimen', id).idResep, idEks);
  await page.goto(BASE + '/#/resep/' + idResep);
  await page.getByRole('link', { name: 'Export PDF' }).first().click();
  await page.locator('.cetak-kertas h1', { hasText: 'Brownies Fudgy' }).waitFor();
  assert.equal(await page.locator('.cetak-eks').count(), 4, 'keempat eksperimen ikut');
  await page.getByText('Tamu QR').first().waitFor();
  await page.waitForFunction(() => document.title === 'Resep Brownies Fudgy - Dapur Bu Sari');
  await foto(page, '4-export');
  await page.emulateMedia({ media: 'print' });
  assert.equal(await page.locator('.cetak-alat').isVisible(), false, 'tombol tidak ikut tercetak');
  const pdf = await page.pdf({ format: 'A4' });
  assert.ok(pdf.length > 20000 && pdf.subarray(0, 4).toString() === '%PDF', 'PDF terbentuk');
  if (SS) fs.writeFileSync(path.join(SS, 'resep-brownies.pdf'), pdf);
  await page.emulateMedia({ media: 'screen' });

  tahap('hapus resep dari halaman resep: konfirmasi, lalu hilang dari perangkat dan server');
  const jumlahResep = await page.evaluate(() => window.__app.db.semua('Resep').length);
  await page.goto(BASE + '/#/resep/' + idResep);
  await page.getByRole('button', { name: 'Hapus resep' }).click();
  await page.getByRole('dialog', { name: /Hapus “Brownies Fudgy”/ }).getByRole('button', { name: 'Batal' }).click();
  assert.ok(await page.evaluate((id) => !!window.__app.db.ambil('Resep', id), idResep), 'batal tidak menghapus');
  await page.getByRole('button', { name: 'Hapus resep' }).click();
  await page.getByRole('dialog', { name: /Hapus “Brownies Fudgy”/ }).getByRole('button', { name: 'Hapus resep' }).click();
  await page.getByText('Resep dihapus.').waitFor();
  assert.ok(page.url().endsWith('#/resep'));
  assert.equal(await page.evaluate(() => window.__app.db.semua('Resep').length), jumlahResep - 1);
  await page.waitForFunction(() => window.__app.db.jumlahKotor() === 0, null, { timeout: 15000 });

  tahap('keluar lalu masuk lagi: semua data kembali dari database server (resep yang dihapus tetap hilang)');
  await page.goto(BASE + '/#/pengaturan');
  await page.getByRole('button', { name: 'Keluar', exact: true }).click();
  await page.getByRole('dialog', { name: 'Keluar dari akun?' }).getByRole('button', { name: 'Keluar' }).click();
  await page.getByRole('button', { name: 'Login', exact: true }).waitFor();
  assert.equal(await page.evaluate(() => window.__app.db.semua('Resep').length), 0, 'salinan di perangkat dibuang');
  await masukUji(page, BASE);
  await page.waitForFunction((n) => window.__app.db.semua('Resep').length === n, jumlahResep - 1, { timeout: 15000 });
  assert.equal(await page.evaluate((id) => window.__app.db.ambil('Resep', id), idResep), null);
  await page.goto(BASE + '/#/');
  await page.getByRole('heading', { name: 'Dapur Bu Sari', level: 1 }).waitFor();

  tahap('ganti kata sandi akun: kata sandi saat ini yang salah ditolak');
  await page.goto(BASE + '/#/pengaturan');
  await page.getByRole('button', { name: 'Ganti kata sandi akun' }).click();
  const dAkun = page.getByRole('dialog', { name: 'Ganti kata sandi akun' });
  await dAkun.getByLabel('Kata sandi saat ini').fill('bukan-sandi-ini');
  await dAkun.getByLabel(/^Kata sandi baru/).fill('sandi-akun-baru');
  await dAkun.getByLabel('Ulangi kata sandi baru').fill('sandi-akun-beda');
  await dAkun.getByRole('button', { name: 'Simpan' }).click();
  await dAkun.getByText('Pengulangan kata sandi tidak sama.').waitFor();
  await dAkun.getByLabel('Ulangi kata sandi baru').fill('sandi-akun-baru');
  await dAkun.getByRole('button', { name: 'Simpan' }).click();
  await dAkun.getByText('Kata sandi lama salah.').waitFor();
  await dAkun.getByLabel('Kata sandi saat ini').fill('kunci-dev');
  await dAkun.getByRole('button', { name: 'Simpan' }).click();
  await page.getByText('Kata sandi akun diganti. Perangkat lain perlu masuk lagi.').waitFor();
  await dAkun.waitFor({ state: 'detached' });

  tahap('kembalikan bawaan: nama dan logo kembali seperti semula');
  await page.goto(BASE + '/#/pengaturan');
  await page.getByRole('button', { name: 'Kembalikan bawaan' }).click();
  await page.getByRole('dialog').getByRole('button', { name: 'Kembalikan' }).click();
  await page.getByText('Kembali ke tampilan bawaan.').waitFor();
  await page.goto(BASE + '/#/');
  await page.getByRole('heading', { name: 'Good Receipes', level: 1 }).waitFor();
  assert.equal(await page.title(), 'Good Receipes');
  assert.equal(await page.locator('link[rel=icon]').getAttribute('href'), 'icons/icon.svg');

  tahap('nama sangat panjang tidak merusak tata letak di beranda, pengaturan, QR, dan halaman export');
  await page.goto(BASE + '/#/pengaturan');
  // Tunggu penyimpanan ke server selesai, supaya formulir tidak diisi ulang saat sedang diketik.
  await page.waitForFunction(() => window.__app.db.jumlahKotor() === 0 && !window.__app.penyinkron.status.sedang, null, { timeout: 15000 });
  await page.getByLabel('Nama aplikasi').fill('Dapur Keluarga Besar Sejahtera Bersama Selalu');
  assert.equal((await page.getByLabel('Nama aplikasi').inputValue()).length, 40, 'nama dibatasi 40 karakter');
  await page.getByLabel('Nama aplikasi').fill('Dapurkeluargabesarsejahterabersamaselalu1');
  await page.getByRole('button', { name: 'Simpan tampilan' }).click();
  const [idE, idR] = await page.evaluate(() => {
    const e = window.__app.db.semua('Eksperimen')[0];
    return [e.id, e.idResep];
  });
  for (const [lebar, tinggi] of [[360, 740], [390, 844], [768, 1024], [1440, 900]]) {
    await page.setViewportSize({ width: lebar, height: tinggi });
    for (const r of ['/', '/pengaturan', `/eksperimen/${idE}/bagikan`, `/resep/${idR}`, `/resep/${idR}/cetak`]) {
      await page.goto(BASE + '/#' + r);
      await page.waitForTimeout(100);
      assert.ok((await sisaLebar(page)) <= 1, `${r} melebar pada lebar ${lebar}`);
    }
    if (lebar === 360) await foto(page, '8-export-360');
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
