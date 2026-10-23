import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { daftarFile, perbarui } from '../tools/perbarui-sw.mjs';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const baca = (f) => fs.readFileSync(path.join(AKAR, f), 'utf8');

test('manifest sah dan semua ikonnya ada', () => {
  const m = JSON.parse(baca('manifest.webmanifest'));
  assert.ok(m.name && m.short_name && m.start_url && m.display === 'standalone');
  for (const ikon of m.icons) assert.ok(fs.existsSync(path.join(AKAR, ikon.src)), ikon.src);
  assert.ok(m.icons.some((i) => i.purpose === 'maskable'));
  assert.ok(m.icons.some((i) => i.sizes === '512x512'));
});

test('index.html merujuk berkas yang ada', () => {
  const html = baca('index.html');
  for (const [, ref] of html.matchAll(/(?:href|src)="([^"#]+)"/g)) {
    if (/^https?:|^data:/.test(ref)) continue;
    assert.ok(fs.existsSync(path.join(AKAR, ref)), `index.html merujuk ${ref} yang tidak ada`);
  }
});

test('sw.js: semua berkas di daftar ada, dan berkas inti ikut tersimpan', () => {
  perbarui(); // jaga daftar tetap mutakhir
  const isi = baca('sw.js');
  const daftar = [...isi.matchAll(/^\s+'([^']+)',$/gm)].map((m) => m[1]);
  assert.deepEqual(daftar, daftarFile());
  for (const f of daftar) assert.ok(fs.existsSync(path.join(AKAR, f)), f);
  for (const wajib of ['index.html', 'js/main.js', 'css/app.css', 'vendor/preact-htm.js', 'vendor/qrcode.js', 'manifest.webmanifest']) {
    assert.ok(daftar.includes(wajib), wajib + ' belum ikut di-cache');
  }
  assert.ok(!daftar.some((f) => f.startsWith('tests/') || f.startsWith('tools/') ), 'berkas pengembangan tidak boleh ikut');
});

test('semua modul JS yang diimpor ada', () => {
  const dir = path.join(AKAR, 'js');
  const semua = [];
  (function jalan(d) {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) (e.isDirectory() ? jalan(path.join(d, e.name)) : semua.push(path.join(d, e.name)));
  })(dir);
  for (const f of semua) {
    for (const [, ref] of fs.readFileSync(f, 'utf8').matchAll(/from '(\.[^']+)'/g)) {
      assert.ok(fs.existsSync(path.resolve(path.dirname(f), ref)), `${path.relative(AKAR, f)} mengimpor ${ref} yang tidak ada`);
    }
  }
});
