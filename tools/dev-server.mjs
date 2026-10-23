// Server lokal untuk mencoba aplikasi tanpa backend Laravel.
//
//   npm run dev        (atau: node tools/dev-server.mjs)
//
// Menyajikan berkas aplikasi dan menjalankan apps-script/Code.gs di memori
// (disimpan di .dev-data.json), ditambah tiruan akun sederhana:
//   Server   : http://localhost:8080/api   (di halaman Masuk, "ganti" server)
//   Login    : apa saja, mis. chef@uji.test
//   Sandi    : kunci-dev
// Untuk uji akun sungguhan (email, banyak akun), pakai backend Laravel.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buatServer } from './mock-gas.mjs';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.PORT) || 8080;
const KUNCI = process.env.KUNCI || 'kunci-dev';
const BERKAS_DATA = process.env.DATA || path.join(AKAR, '.dev-data.json');

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.ico': 'image/x-icon',
};

let keadaan = { lembar: {}, foto: {} };
if (process.argv.includes('--reset')) fs.rmSync(BERKAS_DATA, { force: true });
try {
  keadaan = JSON.parse(fs.readFileSync(BERKAS_DATA, 'utf8'));
} catch {
  /* mulai kosong */
}
let jadwalTulis = null;
const server = buatServer(keadaan, {
  kunci: KUNCI,
  setelahUbah: () => {
    clearTimeout(jadwalTulis);
    jadwalTulis = setTimeout(() => fs.writeFileSync(BERKAS_DATA, JSON.stringify(keadaan)), 200);
  },
});

/** Tiruan aksi akun. Sesi = kunci Code.gs, jadi sinkron tetap memakai tiruan Apps Script. */
function tiruanAkun(teks) {
  let req;
  try {
    req = JSON.parse(teks);
  } catch {
    return null;
  }
  const pengguna = (login = 'chef@uji.test') => ({ id: 1, nama: req.nama || 'Chef Uji', username: 'chefuji', email: login.includes('@') ? login : 'chef@uji.test' });
  switch (req.aksi) {
    case 'masuk':
      return req.kataSandi === KUNCI ? { ok: true, sesi: KUNCI, pengguna: pengguna(req.login) } : { ok: false, galat: 'Username/email atau kata sandi salah.' };
    case 'daftar':
      return { ok: true, pesan: `(uji) Akun dibuat. Masuk dengan ${req.email} dan kata sandi ${KUNCI}.` };
    case 'lupaSandi':
      return { ok: true, pesan: `(uji) Tidak ada email terkirim. Kata sandinya ${KUNCI}.` };
    case 'aturSandi':
      return { ok: true, pesan: '(uji) Kata sandi tidak berubah di server uji.' };
    case 'ubahProfil':
      return req.kunci === KUNCI ? { ok: true, pengguna: pengguna() } : { ok: false, kode: 'SESI', galat: 'Sesi berakhir.' };
    case 'gantiSandi':
    case 'keluar':
      return { ok: true };
    default:
      return null;
  }
}

function kirim(res, kode, tipe, isi, tambahan = {}) {
  res.writeHead(kode, { 'Content-Type': tipe, 'Cache-Control': 'no-store', ...tambahan });
  res.end(isi);
}

const http_ = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);

  if (url.pathname === '/api') {
    if (req.method === 'OPTIONS') return kirim(res, 204, 'text/plain', '', { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Headers': '*' });
    let jawab;
    if (req.method === 'POST') {
      const potongan = [];
      for await (const p of req) potongan.push(p);
      const isi = Buffer.concat(potongan).toString('utf8');
      jawab = tiruanAkun(isi) || server.panggil(isi);
      // Di Google, foto menjadi tautan Drive. Di sini dilayani dari /foto/.
      if (jawab.url && jawab.id) jawab.url = `/foto/${jawab.id}`;
    } else {
      jawab = server.get();
    }
    return kirim(res, 200, 'application/json; charset=utf-8', JSON.stringify(jawab), { 'Access-Control-Allow-Origin': '*' });
  }

  if (url.pathname.startsWith('/foto/')) {
    const f = keadaan.foto[decodeURIComponent(url.pathname.slice(6))];
    if (!f) return kirim(res, 404, 'text/plain', 'Tidak ada');
    return kirim(res, 200, f.mime, Buffer.from(f.base64, 'base64'));
  }

  let jalur = decodeURIComponent(url.pathname);
  if (jalur.endsWith('/')) jalur += 'index.html';
  const berkas = path.normalize(path.join(AKAR, jalur));
  const bagian = path.relative(AKAR, berkas).split(path.sep);
  const terlarang = !berkas.startsWith(AKAR) || bagian.some((b) => b.startsWith('.') || b === 'node_modules' || b === 'tools' || b === 'tests' || b === 'apps-script');
  if (terlarang || !fs.existsSync(berkas) || !fs.statSync(berkas).isFile()) return kirim(res, 404, 'text/plain; charset=utf-8', 'Tidak ditemukan');
  kirim(res, 200, MIME[path.extname(berkas)] || 'application/octet-stream', fs.readFileSync(berkas));
});

http_.on('error', (e) => {
  if (e.code !== 'EADDRINUSE') throw e;
  console.error(`Port ${PORT} sudah dipakai program lain (mungkin "npm run dev" yang masih jalan di terminal lain).`);
  console.error(`Tutup program itu, atau pakai port lain:  PORT=8081 npm run dev   (PowerShell: $env:PORT=8081; npm run dev)`);
  process.exit(1);
});

http_.listen(PORT, () => {
  console.log(`Aplikasi        : http://localhost:${PORT}`);
  console.log(`Server (uji)    : http://localhost:${PORT}/api`);
  console.log(`Masuk (uji)     : email apa saja, kata sandi ${KUNCI}`);
});
