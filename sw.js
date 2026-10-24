// Service worker: aplikasi tetap terbuka tanpa internet.
//
// Strategi: ambil dari jaringan lebih dulu (supaya pembaruan langsung terlihat) dan jatuh ke
// salinan tersimpan bila offline atau lambat. Daftar berkas dan nomor versi di bawah ini
// diperbarui otomatis oleh `npm run sw` (juga dijalankan oleh workflow GitHub Pages).
// Permintaan ke server API tidak pernah dicegat: itu lintas-asal.

const VERSI = 'resep-36ee8e7e02';
const FILE = [
  // <daftar-file>
  'config.js',
  'css/app.css',
  'gambar/kategori/burger.svg',
  'gambar/kategori/camilan.svg',
  'gambar/kategori/cokelat.svg',
  'gambar/kategori/donat.svg',
  'gambar/kategori/eskrim.svg',
  'gambar/kategori/jus.svg',
  'gambar/kategori/kopi.svg',
  'gambar/kategori/kue.svg',
  'gambar/kategori/lauk.svg',
  'gambar/kategori/mie.svg',
  'gambar/kategori/minuman.svg',
  'gambar/kategori/nasi.svg',
  'gambar/kategori/pizza.svg',
  'gambar/kategori/roti.svg',
  'gambar/kategori/salad.svg',
  'gambar/kategori/sambal.svg',
  'gambar/kategori/seafood.svg',
  'gambar/kategori/sup.svg',
  'gambar/kategori/umum.svg',
  'gambar/latar-masuk.jpg',
  'gambar/menu/bahan.svg',
  'gambar/menu/hpp.svg',
  'gambar/menu/marketing.svg',
  'gambar/menu/piala.svg',
  'gambar/menu/resep.svg',
  'gambar/menu/ulasan.svg',
  'icons/bagikan.png',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/logo.png',
  'index.html',
  'js/layar/akun.js',
  'js/layar/bagikan.js',
  'js/layar/bahan.js',
  'js/layar/beranda.js',
  'js/layar/cetak-resep.js',
  'js/layar/daftar-resep.js',
  'js/layar/detail-eksperimen.js',
  'js/layar/detail-resep.js',
  'js/layar/form-eksperimen.js',
  'js/layar/form-resep.js',
  'js/layar/hpp.js',
  'js/layar/marketing.js',
  'js/layar/pengaturan.js',
  'js/layar/penilai.js',
  'js/layar/ulasan.js',
  'js/lib/akun.js',
  'js/lib/db.js',
  'js/lib/hpp.js',
  'js/lib/repo.js',
  'js/lib/schema.js',
  'js/lib/seed.js',
  'js/lib/skor.js',
  'js/lib/sync.js',
  'js/lib/units.js',
  'js/lib/util.js',
  'js/main.js',
  'js/ui/gambar.js',
  'js/ui/ikon-kategori.js',
  'js/ui/ikon.js',
  'js/ui/komponen.js',
  'js/ui/merek.js',
  'js/ui/pesan.js',
  'js/ui/router.js',
  'manifest.webmanifest',
  'vendor/LISENSI.md',
  'vendor/fonts/plus-jakarta-sans.woff2',
  'vendor/preact-htm.js',
  'vendor/qrcode.js',
  // </daftar-file>
];

const BATAS_WAKTU_JARINGAN_MS = 5000;

self.addEventListener('install', (e) => {
  e.waitUntil(
    (async () => {
      const cache = await caches.open(VERSI);
      // Satu berkas gagal tidak boleh menggagalkan pemasangan.
      await Promise.allSettled(FILE.map((f) => cache.add(new Request(f, { cache: 'reload' }))));
      await self.skipWaiting();
    })(),
  );
});

self.addEventListener('activate', (e) => {
  e.waitUntil(
    (async () => {
      const nama = await caches.keys();
      await Promise.all(nama.filter((n) => n !== VERSI).map((n) => caches.delete(n)));
      await self.clients.claim();
    })(),
  );
});

function dariJaringan(req) {
  return new Promise((ok, gagal) => {
    const timer = setTimeout(() => gagal(new Error('lambat')), BATAS_WAKTU_JARINGAN_MS);
    fetch(req)
      .then((res) => {
        clearTimeout(timer);
        ok(res);
      })
      .catch((err) => {
        clearTimeout(timer);
        gagal(err);
      });
  });
}

self.addEventListener('fetch', (e) => {
  const req = e.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;
  if (url.pathname.startsWith('/api') || url.pathname.startsWith('/foto/')) return; // dev-server

  e.respondWith(
    (async () => {
      const cache = await caches.open(VERSI);
      try {
        const res = await dariJaringan(req);
        if (res.ok) cache.put(req, res.clone());
        return res;
      } catch (err) {
        const ada = (await cache.match(req)) || (req.mode === 'navigate' ? await cache.match('index.html') || await cache.match('./') : null);
        if (ada) return ada;
        throw err;
      }
    })(),
  );
});
