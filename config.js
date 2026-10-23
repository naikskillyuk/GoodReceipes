// Pengaturan bawaan aplikasi. Boleh dikosongkan; semua bisa diatur dari menu Pengaturan.
//
// scriptUrl : alamat API backend Laravel Anda, mis. https://backend-anda.vercel.app/api (lihat README).
//             WAJIB diisi sebelum aplikasi dijual: semua pembeli masuk ke server ini.
//             Tanpa ini, layar Masuk meminta alamat server (hanya untuk uji).
//             Backend Apps Script lama tidak mendukung akun, jadi tidak bisa dipakai lagi.
// Kunci rahasia JANGAN ditaruh di sini (berkas ini ikut tampil di GitHub).
window.APP_CONFIG = {
  scriptUrl: 'https://goodreceipes-api.vercel.app/api',
};
