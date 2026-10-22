import test from 'node:test';
import assert from 'node:assert/strict';
import { buatKataSandi, cocokKataSandi, validasiKataSandi, sesiMasihBerlaku, buatPembatas, buatSesi } from '../js/lib/kunci.js';
import { buatDB, penyimpananMemori } from '../js/lib/db.js';

test('kata sandi: hash tidak memuat teks aslinya, garam acak, hanya yang benar cocok', async () => {
  const a = await buatKataSandi('rahasia-saya', 1000);
  const b = await buatKataSandi('rahasia-saya', 1000);
  assert.notEqual(a.garam, b.garam);
  assert.notEqual(a.hash, b.hash, 'garam berbeda menghasilkan hash berbeda');
  assert.ok(!JSON.stringify(a).includes('rahasia'));
  assert.equal(a.hash.length, 64);
  assert.equal(await cocokKataSandi('rahasia-saya', a), true);
  assert.equal(await cocokKataSandi('rahasia-sayA', a), false);
  assert.equal(await cocokKataSandi('', a), false);
  assert.equal(await cocokKataSandi('rahasia-saya', null), false);
  assert.equal(await cocokKataSandi('rahasia-saya', { ...a, hash: a.hash.slice(2) }), false);
  assert.equal(await cocokKataSandi('rahasia-saya', { ...a, iterasi: 0 }), false);
});

test('kata sandi: aturan panjang dan huruf non-Latin', async () => {
  assert.match(validasiKataSandi('abc'), /minimal 6/);
  assert.match(validasiKataSandi('      '), /spasi/);
  assert.match(validasiKataSandi('x'.repeat(101)), /maksimal/);
  assert.equal(validasiKataSandi('abcdef'), '');
  await assert.rejects(() => buatKataSandi('abc'), /minimal 6/);
  const c = await buatKataSandi('kata-sandi-ñ-日本', 1000);
  assert.equal(await cocokKataSandi('kata-sandi-ñ-日本', c), true);
});

test('sesi: berlaku selama belum lewat batas idle; 0 berarti tanpa batas', () => {
  const t = 1_000_000;
  assert.equal(sesiMasihBerlaku({ terakhir: 0, batasMenit: 5, sekarang: t }), false);
  assert.equal(sesiMasihBerlaku({ terakhir: t - 4 * 60000, batasMenit: 5, sekarang: t }), true);
  assert.equal(sesiMasihBerlaku({ terakhir: t - 6 * 60000, batasMenit: 5, sekarang: t }), false);
  assert.equal(sesiMasihBerlaku({ terakhir: t - 99 * 3600000, batasMenit: 0, sekarang: t }), true);
});

test('pembatas: dua salah pertama bebas, lalu jeda menggandakan sampai 30 detik, berhasil mengulang', () => {
  const isi = {};
  const penyimpanan = { getItem: (k) => isi[k] ?? null, setItem: (k, v) => (isi[k] = v), removeItem: (k) => delete isi[k] };
  let waktu = 0;
  const p = buatPembatas(penyimpanan, { sekarang: () => waktu });
  assert.equal(p.gagal(), 0);
  assert.equal(p.gagal(), 0);
  assert.equal(p.sisaMs(), 0);
  assert.equal(p.gagal(), 1000);
  assert.equal(p.sisaMs(), 1000);
  waktu += 1500;
  assert.equal(p.sisaMs(), 0);
  assert.equal(p.gagal(), 2000);
  assert.equal(p.gagal(), 4000);
  for (let i = 0; i < 10; i++) p.gagal();
  assert.equal(p.gagal(), 30000);
  // tetap berlaku setelah memuat ulang (objek pembatas baru, penyimpanan sama)
  assert.equal(buatPembatas(penyimpanan, { sekarang: () => waktu }).sisaMs(), 30000);
  p.berhasil();
  assert.equal(p.sisaMs(), 0);
  assert.equal(p.gagal(), 0);
});

test('pembatas tetap jalan bila penyimpanan browser ditolak', () => {
  const rusak = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
  const p = buatPembatas(rusak, { sekarang: () => 0 });
  p.gagal(); p.gagal();
  assert.equal(p.gagal(), 1000);
  assert.equal(p.sisaMs(), 1000);
});

test('cadangan tidak memuat kata sandi maupun kunci; hapus semua bisa ikut membuang kata sandi', async () => {
  const db = buatDB(penyimpananMemori());
  await db.muat();
  const rec = await buatKataSandi('rahasia-saya', 1000);
  db.aturPengaturan({ kunci: 'k-rahasia', kunciAplikasi: rec, scriptUrl: 'https://x/exec' });
  const ekspor = JSON.parse(db.ekspor());
  assert.equal(ekspor.pengaturan.kunci, '');
  assert.equal(ekspor.pengaturan.kunciAplikasi, null);
  assert.ok(!db.ekspor().includes(rec.hash));
  await db.impor(db.ekspor());
  assert.deepEqual(db.pengaturan.kunciAplikasi, rec, 'memulihkan cadangan tidak menghapus kata sandi perangkat');
  await db.hapusSemua();
  assert.deepEqual(db.pengaturan.kunciAplikasi, rec);
  assert.equal(db.pengaturan.kunci, 'k-rahasia', 'hapus biasa mempertahankan sambungan');
  await db.hapusSemua({ hapusKataSandi: true });
  assert.equal(db.pengaturan.kunciAplikasi, null);
  assert.equal(db.pengaturan.kunci, '', 'jalur lupa kata sandi juga membuang kunci Apps Script');
  assert.equal(db.pengaturan.scriptUrl, 'https://x/exec');
});

test('sesi: dicatat, dibatasi penulisannya, dan berakhir; tetap jalan tanpa penyimpanan browser', () => {
  const isi = {};
  const penyimpanan = { getItem: (k) => isi[k] ?? null, setItem: (k, v) => (isi[k] = v), removeItem: (k) => delete isi[k] };
  let waktu = 1000;
  const s = buatSesi(penyimpanan, { sekarang: () => waktu });
  assert.equal(s.terakhir(), 0);
  s.sentuh();
  assert.equal(s.terakhir(), 1000);
  waktu = 3000;
  s.sentuh(); // terlalu dekat: tidak menulis ulang
  assert.equal(s.terakhir(), 1000);
  s.sentuh({ paksa: true });
  assert.equal(s.terakhir(), 3000);
  waktu = 9000;
  s.sentuh();
  assert.equal(s.terakhir(), 9000);
  // halaman dimuat ulang: sesi lain membaca catatan yang sama
  assert.equal(buatSesi(penyimpanan).terakhir(), 9000);
  s.akhiri();
  assert.equal(s.terakhir(), 0);
  assert.equal(buatSesi(penyimpanan).terakhir(), 0);

  const rusak = { getItem: () => { throw new Error('x'); }, setItem: () => { throw new Error('x'); }, removeItem: () => { throw new Error('x'); } };
  const r = buatSesi(rusak, { sekarang: () => 5000 });
  r.sentuh();
  assert.equal(r.terakhir(), 5000);
  r.akhiri();
  assert.equal(r.terakhir(), 0);
});
