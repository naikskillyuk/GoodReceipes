// Menerapkan nama dan logo aplikasi ke halaman: judul tab, ikon tab, dan nama saat dipasang di iPhone.
// Ikon dan nama di layar utama HP ditentukan berkas manifest.webmanifest dan folder icons/ (lihat README).

import { LOGO_BAWAAN } from '../lib/repo.js';

function tautanIkon() {
  let el = document.querySelector('link[rel="icon"]');
  if (!el) {
    el = document.createElement('link');
    el.rel = 'icon';
    document.head.appendChild(el);
  }
  return el;
}

export function terapkanMerekDokumen({ nama, logo }) {
  document.title = nama;
  const judulApple = document.querySelector('meta[name="apple-mobile-web-app-title"]');
  if (judulApple) judulApple.setAttribute('content', nama.slice(0, 24));
  const ikon = tautanIkon();
  const bawaan = !logo || logo === LOGO_BAWAAN;
  ikon.setAttribute('href', bawaan ? LOGO_BAWAAN : logo);
  ikon.setAttribute('type', bawaan ? 'image/svg+xml' : /^data:(image\/[a-z+.-]+)/i.exec(logo)?.[1] || 'image/png');
}
