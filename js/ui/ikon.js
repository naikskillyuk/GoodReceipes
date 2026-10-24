// Ikon garis (24x24). Dipakai lewat <${Ikon} nama="plus" />.
import { html } from '../../vendor/preact-htm.js';

const JALUR = {
  rumah: 'M3 11l9-8 9 8M5 10v10h5v-6h4v6h5V10',
  lonceng: 'M6 9a6 6 0 1112 0c0 6 2.5 8 2.5 8h-17S6 15 6 9zM10 20.5a2 2 0 004 0',
  resep: 'M5 4h11a3 3 0 013 3v13H8a3 3 0 01-3-3V4zM5 17a3 3 0 013-3h11M9 8h6',
  keranjang: 'M3 9h18l-2 11H5L3 9zM8 9l3-5M16 9l-3-5',
  obrolan: 'M4 5h16v11H9l-5 4V5zM8 10h8M8 13h5',
  gerigi: 'M12 15a3 3 0 100-6 3 3 0 000 6zM19 12l2-1-2-4-2 .7a7 7 0 00-2-1.2L14.5 4h-5L9 6.5a7 7 0 00-2 1.2L5 7l-2 4 2 1a7 7 0 000 2l-2 1 2 4 2-.7a7 7 0 002 1.2l.5 2.5h5l.5-2.5a7 7 0 002-1.2l2 .7 2-4-2-1a7 7 0 000-2z',
  plus: 'M12 5v14M5 12h14',
  minus: 'M5 12h14',
  kembali: 'M15 5l-7 7 7 7',
  maju: 'M9 5l7 7-7 7',
  panah: 'M5 12h14M13 6l6 6-6 6',
  bawah: 'M6 9l6 6 6-6',
  kamera: 'M4 8h3l2-3h6l2 3h3v11H4V8zM12 17a4 4 0 100-8 4 4 0 000 8z',
  gambar: 'M4 5h16v14H4V5zM4 16l5-5 4 4 3-3 4 4M9 9.5h.01',
  sampah: 'M5 7h14M10 7V4h4v3M7 7l1 13h8l1-13M10 11v6M14 11v6',
  salin: 'M9 9h11v11H9V9zM5 15V4h11',
  bagikan: 'M12 4v12M7 9l5-5 5 5M5 14v6h14v-6',
  qr: 'M4 4h6v6H4V4zM14 4h6v6h-6V4zM4 14h6v6H4v-6zM14 14h3v3h-3zM20 14v6h-3M14 20h.01',
  centang: 'M5 12.5l4.5 4.5L19 7',
  tutup: 'M6 6l12 12M18 6L6 18',
  cari: 'M11 18a7 7 0 100-14 7 7 0 000 14zM16 16l5 5',
  piala: 'M7 4h10v5a5 5 0 01-10 0V4zM7 6H4v1a3 3 0 003 3M17 6h3v1a3 3 0 01-3 3M12 14v4M8 20h8',
  bintang: 'M12 3l2.7 5.6 6.1.9-4.4 4.3 1 6.1L12 17l-5.4 2.9 1-6.1L3.2 9.5l6.1-.9L12 3z',
  sinkron: 'M20 11a8 8 0 00-14-4L4 9M4 4v5h5M4 13a8 8 0 0014 4l2-2M20 20v-5h-5',
  ubah: 'M4 20h4L19 9l-4-4L4 16v4zM13 7l4 4',
  kalkulator: 'M6 3h12v18H6V3zM9 7h6M9 11h.01M12 11h.01M15 11h.01M9 15h.01M12 15h.01M15 15h.01',
  corong: 'M4 10v4h3l7 4V6L7 10H4zM17 9a4 4 0 010 6',
  jam: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 7v5l3 2',
  api: 'M12 3c1 4 5 5 5 10a5 5 0 01-10 0c0-2 1-3 2-4 0 2 1 3 2 3 0-3 0-6 1-9z',
  orang: 'M12 12a4 4 0 100-8 4 4 0 000 8zM4 21a8 8 0 0116 0',
  tautan: 'M10 14a4 4 0 005.7 0l3-3a4 4 0 00-5.7-5.7l-1 1M14 10a4 4 0 00-5.7 0l-3 3a4 4 0 005.7 5.7l1-1',
  unduh: 'M12 4v12M7 11l5 5 5-5M5 20h14',
  unggah: 'M12 16V4M7 9l5-5 5 5M5 20h14',
  awan: 'M7 18a4 4 0 01-.5-8 6 6 0 0111.5 1.5A3.5 3.5 0 0117.5 18H7z',
  awanMati: 'M3 3l18 18M7 18a4 4 0 01-.5-8 6 6 0 012-2.8M17.5 18a3.5 3.5 0 001-6.8A6 6 0 0012 6',
  banding: 'M8 4v16M16 4v16M4 8l4-4 4 4M12 16l4 4 4-4',
  daftar: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  gelas: 'M6 4h12l-1.5 16h-9L6 4zM7 9h10',
  kue: 'M4 20h16v-6H4v6zM6 14v-3a6 6 0 0112 0v3M12 5V3',
  info: 'M12 21a9 9 0 100-18 9 9 0 000 18zM12 11v6M12 7.5h.01',
  gembok: 'M6 11h12v9H6v-9zM8.5 11V8a3.5 3.5 0 017 0v3M12 15v2',
  mata: 'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zM12 15a3 3 0 100-6 3 3 0 000 6z',
  gembok: 'M6 11h12v9H6v-9zM8 11V8a4 4 0 018 0v3',
  kirim: 'M21 3L10 14M21 3l-7 18-4-7-7-4 18-7z',
};

export function Ikon({ nama, ukuran = 24, tebal = 2.2, kelas = '' }) {
  const d = JALUR[nama] || JALUR.info;
  return html`<svg
    class=${kelas}
    width=${ukuran}
    height=${ukuran}
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    stroke-width=${tebal}
    stroke-linecap="round"
    stroke-linejoin="round"
    aria-hidden="true"
    focusable="false"
  ><path d=${d} /></svg>`;
}
