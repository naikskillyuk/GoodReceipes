// Pengaturan bawaan aplikasi. Boleh dikosongkan; semua bisa diatur dari menu Pengaturan.
//
// scriptUrl : alamat API backend Laravel, mis. https://backend-anda.vercel.app/api (lihat README).
//             WAJIB diisi sebelum aplikasi dijual: semua pembeli masuk ke server ini.
//             Di localhost dikosongkan, supaya uji di komputer memakai server lokal
//             (Laravel di http://localhost:8000/api, atau server uji "npm run dev"), bukan produksi.
// Kunci rahasia JANGAN ditaruh di sini (berkas ini ikut tampil di GitHub).
window.APP_CONFIG = {
  scriptUrl: /^(localhost|127\.0\.0\.1)$/.test(location.hostname) ? '' : 'https://goodreceipes-api.vercel.app/api',
};
