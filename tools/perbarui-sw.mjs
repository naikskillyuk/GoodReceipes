// Memperbarui daftar berkas dan nomor versi di sw.js.   npm run sw
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const AKAR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SERTAKAN = ['index.html', 'config.js', 'manifest.webmanifest'];
const FOLDER = ['css', 'js', 'vendor', 'icons', 'gambar'];

function kumpulkan(dir) {
  return fs.readdirSync(path.join(AKAR, dir), { withFileTypes: true }).flatMap((d) => {
    const rel = path.posix.join(dir, d.name);
    return d.isDirectory() ? kumpulkan(rel) : [rel];
  });
}

export function daftarFile() {
  return [...SERTAKAN, ...FOLDER.flatMap(kumpulkan)].filter((f) => !f.endsWith('.map')).sort();
}

export function perbarui() {
  const file = daftarFile();
  const hash = crypto.createHash('sha1');
  for (const f of file) hash.update(f).update(fs.readFileSync(path.join(AKAR, f)));
  const versi = 'resep-' + hash.digest('hex').slice(0, 10);
  const jalur = path.join(AKAR, 'sw.js');
  let isi = fs.readFileSync(jalur, 'utf8');
  isi = isi.replace(/const VERSI = '[^']*';/, `const VERSI = '${versi}';`);
  isi = isi.replace(/(\/\/ <daftar-file>)[\s\S]*?(\n\s*\/\/ <\/daftar-file>)/, `$1\n${file.map((f) => `  '${f}',`).join('\n')}$2`);
  fs.writeFileSync(jalur, isi);
  return { versi, jumlah: file.length };
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { versi, jumlah } = perbarui();
  console.log(`sw.js diperbarui: ${jumlah} berkas, versi ${versi}`);
}
