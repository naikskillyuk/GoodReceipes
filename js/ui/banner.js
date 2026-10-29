// Kartu banner informasi (judul, teks, tombol, gambar di kanan). Dipakai di etalase, kasir, dan pratinjau admin.

import { html } from '../../vendor/preact-htm.js';
import { WARNA_BANNER } from '../lib/toko.js';

/**
 * b: {judul, teks, warna, tombol, aksi}. foto: alamat gambar (boleh kosong).
 * onAksi: dipanggil saat tombol ditekan; tanpa onAksi tombol tetap tampil (pratinjau).
 */
export function KartuBanner({ b, foto, onAksi, kecil = false }) {
  const w = WARNA_BANNER[b.warna] || WARNA_BANNER.hijau;
  const adaTombol = !!(b.tombol && b.aksi);
  return html`<article class=${'kartu-banner' + (kecil ? ' kecil' : '') + (foto ? ' berfoto' : '')} style=${`--b-latar:${w.latar};--b-tinta:${w.tinta}`}>
    <div class="kb-isi">
      <b class="kb-judul">${b.judul || 'Judul banner'}</b>
      ${b.teks && html`<span class="kb-teks">${b.teks}</span>`}
      ${adaTombol && html`<button type="button" class="kb-tombol" onClick=${onAksi}>${b.tombol}</button>`}
    </div>
    ${foto && html`<img class="kb-foto" src=${foto} alt="" aria-hidden="true" />`}
  </article>`;
}
