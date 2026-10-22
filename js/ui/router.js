// Router berbasis hash (#/jalur?kueri) supaya jalan di GitHub Pages tanpa pengaturan server.

export function bacaHash(hash = globalThis.location?.hash || '') {
  const mentah = hash.replace(/^#/, '') || '/';
  const [jalur, kueri = ''] = mentah.split('?');
  const bagian = jalur.split('/').filter(Boolean).map((b) => {
    try {
      return decodeURIComponent(b);
    } catch {
      return b;
    }
  });
  return { jalur: '/' + bagian.join('/'), bagian, kueri: Object.fromEntries(new URLSearchParams(kueri)) };
}

/** Pindah halaman. `ganti` menggantikan halaman sekarang di riwayat (mis. setelah menyimpan formulir). */
export function pergi(jalur, { ganti = false } = {}) {
  const tujuan = '#' + jalur;
  if (location.hash === tujuan) {
    window.dispatchEvent(new HashChangeEvent('hashchange'));
    return;
  }
  if (ganti) location.replace(tujuan);
  else location.hash = jalur;
}

export const tautan = (jalur) => '#' + jalur;
export const q = encodeURIComponent;
