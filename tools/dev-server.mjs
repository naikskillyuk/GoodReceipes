// Server lokal untuk mencoba aplikasi tanpa backend Laravel.
//
//   npm run dev        (atau: node tools/dev-server.mjs)
//
// Menyajikan berkas aplikasi dan tiruan backend Laravel di memori
// (tools/server-tiruan.mjs, disimpan di .dev-data.json) dengan satu akun uji:
//   Server   : http://localhost:8080/api   (di halaman Masuk, "ganti" server)
//   Login    : apa saja, mis. chef@uji.test
//   Sandi    : kunci-dev
// Untuk uji akun sungguhan (email, banyak akun), pakai backend Laravel.

import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { buatServer } from './server-tiruan.mjs';

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

let keadaan = { tabel: {}, foto: {} };
if (process.argv.includes('--reset')) fs.rmSync(BERKAS_DATA, { force: true });
try {
  const tersimpan = JSON.parse(fs.readFileSync(BERKAS_DATA, 'utf8'));
  if (tersimpan.tabel) keadaan = tersimpan; // berkas format lama diabaikan
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
      jawab = server.panggil(isi);
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

  // Halaman admin memakai index.html yang sama (sama seperti rewrite di vercel.json).
  if (url.pathname === '/admin/') return kirim(res, 308, 'text/plain', '', { Location: '/admin' + url.search });
  let jalur = url.pathname === '/admin' ? '/index.html' : decodeURIComponent(url.pathname);
  if (jalur.endsWith('/')) jalur += 'index.html';
  const berkas = path.normalize(path.join(AKAR, jalur));
  const bagian = path.relative(AKAR, berkas).split(path.sep);
  const terlarang = !berkas.startsWith(AKAR) || bagian.some((b) => b.startsWith('.') || b === 'node_modules' || b === 'tools' || b === 'tests' || b === 'backend');
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
