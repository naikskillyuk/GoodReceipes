// Service worker: aplikasi tetap terbuka tanpa internet.
//
// Strategi: ambil dari jaringan lebih dulu (supaya pembaruan langsung terlihat) dan jatuh ke
// salinan tersimpan bila offline atau lambat. Daftar berkas dan nomor versi di bawah ini
// diperbarui otomatis oleh `npm run sw` (juga dijalankan oleh workflow GitHub Pages).
// Permintaan ke server API tidak pernah dicegat: itu lintas-asal.

const VERSI = 'resep-4a5bfd09ad';
const FILE = [
  // <daftar-file>
  'config.js',
  'css/app.css',
  'gambar/kategori/burger.png',
  'gambar/kategori/camilan.png',
  'gambar/kategori/cokelat.png',
  'gambar/kategori/donat.png',
  'gambar/kategori/eskrim.png',
  'gambar/kategori/jus.png',
  'gambar/kategori/kopi.png',
  'gambar/kategori/kue.png',
  'gambar/kategori/lauk.png',
  'gambar/kategori/mie.png',
  'gambar/kategori/minuman.png',
  'gambar/kategori/nasi.png',
  'gambar/kategori/pizza.png',
  'gambar/kategori/roti.png',
  'gambar/kategori/salad.png',
  'gambar/kategori/sambal.png',
  'gambar/kategori/seafood.png',
  'gambar/kategori/sup.png',
  'gambar/kategori/umum.png',
  'gambar/latar-masuk.jpg',
  'gambar/menu/bahan.png',
  'gambar/menu/hpp.png',
  'gambar/menu/marketing.png',
  'gambar/menu/piala.png',
  'gambar/menu/resep.png',
  'gambar/menu/ulasan.png',
  'icons/icon-180.png',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/icon.svg',
  'icons/logo.svg',
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
