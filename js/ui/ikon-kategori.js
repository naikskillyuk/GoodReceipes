// Ikon kategori berupa gambar 3D berwarna (Microsoft Fluent Emoji, lisensi MIT; lihat vendor/LISENSI.md).
// Ikon dipilih otomatis dari nama kategori, jadi kategori buatan pengguna juga mendapat ikon yang cocok.

import { html } from '../../vendor/preact-htm.js';

// Urutan penting: aturan yang lebih khusus lebih dulu (mis. "es krim" sebelum minuman, "kopi" sebelum minuman).
const ATURAN = [
  ['eskrim', /es ?krim|ice ?cream|gelato|frozen|\bes\b/],
  ['kopi', /kopi|coffee|\bteh\b|\btea\b|latte|hangat/],
  ['jus', /\bjus\b|juice|smoothie|segar|buah/],
  ['minuman', /minum|drink|boba|susu|milk/],
  ['cokelat', /cokelat|coklat|choco/],
  ['donat', /donat|donut|doughnut|dessert|pencuci mulut|manis/],
  ['kue', /kue|cake|bolu|tart|brownies?|cupcake|pastry|puding|pudding/],
  ['roti', /roti|bread|bakery|toast|bagel/],
  ['camilan', /camil|cemil|snack|jajan|keripik|kering|cookie|biskuit/],
  ['salad', /salad|sayur|vegan|vegetarian|sehat|diet/],
  ['sup', /\bsup\b|soup|soto|kuah|rawon|gulai|kari|curry/],
  ['mie', /\bmie\b|\bmi\b|noodle|bakso|pasta|ramen|spageti|spaghetti/],
  ['nasi', /nasi|rice|bento|lontong|ketupat/],
  ['seafood', /ikan|udang|seafood|cumi|kepiting|fish|shrimp/],
  ['sambal', /sambal|saus|sauce|bumbu|pedas|spicy/],
  ['pizza', /pizza/],
  ['burger', /burger|sandwich|hot ?dog|fast ?food/],
  ['lauk', /lauk|ayam|daging|bebek|sapi|kambing|meat|chicken|goreng|bakar|sate/],
];

export const IKON_UMUM = 'umum';

/** Kunci ikon untuk nama kategori ("Kue Basah" -> "kue"); tidak cocok -> ikon piring umum. */
export function kunciIkonKategori(nama) {
  const t = String(nama || '').toLowerCase();
  const cocok = ATURAN.find(([, pola]) => pola.test(t));
  return cocok ? cocok[0] : IKON_UMUM;
}

export const srcIkonKategori = (namaAtauKunci, { kunci = false } = {}) => `gambar/kategori/${kunci ? namaAtauKunci : kunciIkonKategori(namaAtauKunci)}.png`;

/** Gambar ikon kategori (dekoratif: nama kategori selalu ditulis di sebelahnya). */
export function IkonKategori({ nama, ukuran = 24, kunci }) {
  const src = kunci ? srcIkonKategori(kunci, { kunci: true }) : srcIkonKategori(nama);
  return html`<img class="ikon-kategori" src=${src} alt="" aria-hidden="true" width=${ukuran} height=${ukuran} loading="lazy" decoding="async" />`;
}
