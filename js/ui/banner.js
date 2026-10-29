// Kartu banner informasi, ukuran tampil 250 x 100 (rasio 5:2). Dipakai di etalase, kasir, dan pratinjau admin.
// Ada judul: judul, teks, tombol, dan gambar opsional di kanan. Judul dan teks kosong + ada gambar: gambar penuh saja.

import { html } from '../../vendor/preact-htm.js';
import { WARNA_BANNER, bannerGambarSaja } from '../lib/toko.js';

/**
 * b: {judul, teks, warna, tombol, aksi}. foto: alamat gambar (boleh kosong).
 * onAksi: dipanggil saat tombol (atau banner gambar saja) ditekan; tanpa onAksi tombol tetap tampil (pratinjau).
 */
export function KartuBanner({ b, foto, onAksi, kecil = false }) {
  const w = WARNA_BANNER[b.warna] || WARNA_BANNER.hijau;
  const adaTombol = !!(b.tombol && b.aksi);
  if (foto && bannerGambarSaja(b)) {
    const alt = b.tombol || 'Banner';
    const gambar = html`<img class="kb-gambar" src=${foto} alt=${alt} />`;
    return html`<article class=${'kartu-banner gambar-saja' + (kecil ? ' kecil' : '')}>
      ${b.aksi && onAksi ? html`<button type="button" class="kb-penuh" aria-label=${alt} onClick=${onAksi}>${gambar}</button>` : gambar}
    </article>`;
  }
  return html`<article class=${'kartu-banner' + (kecil ? ' kecil' : '') + (foto ? ' berfoto' : '')} style=${`--b-latar:${w.latar};--b-tinta:${w.tinta}`}>
    <div class="kb-isi">
      <b class="kb-judul">${b.judul || 'Judul banner'}</b>
      ${b.teks && html`<span class="kb-teks">${b.teks}</span>`}
      ${adaTombol && html`<button type="button" class="kb-tombol" onClick=${onAksi}>${b.tombol}</button>`}
    </div>
    ${foto && html`<img class="kb-foto" src=${foto} alt="" aria-hidden="true" />`}
  </article>`;
}
