// Komponen bersama: kerangka halaman, hero, foto, kolom isian.

import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import { Ikon } from './ikon.js';
import { tautan } from './router.js';
import { kompres } from './gambar.js';
import { tampilToast } from './pesan.js';
import { angka, tampilJumlah, bacaJumlah, bacaRupiah } from '../lib/util.js';
import { daftarKategori, pakaiKategori, ambilMerek, LOGO_BAWAAN } from '../lib/repo.js';

/** Logo aplikasi di dalam ubin putih; kembali ke logo bawaan bila gambarnya gagal dimuat. */
export function LogoMerek({ src, ukuran = 40, kelas = '' }) {
  const [gagal, setGagal] = useState(false);
  useEffect(() => setGagal(false), [src]);
  return html`<img
    class=${'logo-merek ' + kelas}
    src=${gagal || !src ? LOGO_BAWAAN : src}
    alt=""
    width=${ukuran}
    height=${ukuran}
    style=${`width:${ukuran}px;height:${ukuran}px`}
    referrerpolicy="no-referrer"
    onError=${() => setGagal(true)}
  />`;
}

const MENU = [
  { kunci: 'rumah', jalur: '/', label: 'Beranda', ikon: 'rumah' },
  { kunci: 'resep', jalur: '/resep', label: 'Daftar Resep', ikon: 'resep' },
  { kunci: 'bahan', jalur: '/bahan', label: 'Daftar Bahan', ikon: 'keranjang' },
  { kunci: 'ulasan', jalur: '/ulasan', label: 'Ulasan', ikon: 'obrolan' },
  { kunci: 'pengaturan', jalur: '/pengaturan', label: 'Pengaturan', ikon: 'gerigi' },
];

/**
 * Kerangka halaman pemilik.
 * HP: navigasi pil hijau di bawah + tombol "+". Laptop (>= 960px): sisi kiri hijau, isi memenuhi layar.
 * plus = { href, label } atau { onKlik, label }.
 */
export function Kerangka({ k, aktif, plus, children }) {
  const { db } = k;
  const kategori = daftarKategori(db);
  const kategoriAktif = k.rute.kueri.kat || '';
  const merek = ambilMerek(db);
  return html`<div class="app">
    <aside class="sisi" aria-label="Menu utama">
      <div class="merek"><${LogoMerek} src=${merek.logo} ukuran=${44} /><span>${merek.nama}</span></div>
      <nav>
        ${MENU.map(
          (m) => html`<a href=${tautan(m.jalur)} class=${aktif === m.kunci && !(m.kunci === 'resep' && kategoriAktif) ? 'aktif' : ''} aria-current=${aktif === m.kunci ? 'page' : null}>
            <${Ikon} nama=${m.ikon} ukuran=${20} />${m.label}
          </a>`,
        )}
      </nav>
      ${kategori.length > 0 &&
      html`<div>
        <div class="judul-sisi">Kategori</div>
        <div class="kategori-sisi">
          ${kategori.map(
            (c) => html`<a href=${tautan('/resep?kat=' + c.id)} style=${`--warna:${c.warna}`} class=${aktif === 'resep' && kategoriAktif === c.id ? 'aktif' : ''}>
              <span class="titik"></span>${c.nama}<em>${pakaiKategori(db, c.id)}</em>
            </a>`,
          )}
        </div>
      </div>`}
    </aside>
    <main class="utama">
      <div class="halaman">${children}</div>
      <div class="bawah">
        <nav class="nav-pil" aria-label="Navigasi">
          ${MENU.map(
            (m) => html`<a href=${tautan(m.jalur)} class=${aktif === m.kunci ? 'aktif' : ''} aria-label=${m.label} aria-current=${aktif === m.kunci ? 'page' : null}>
              <${Ikon} nama=${m.ikon} />
            </a>`,
          )}
        </nav>
        ${plus &&
        (plus.href
          ? html`<a class="plus" href=${tautan(plus.href)} aria-label=${plus.label}><${Ikon} nama="plus" ukuran=${30} /><span class="plus-label">${plus.label}</span></a>`
          : html`<button class="plus" onClick=${plus.onKlik} aria-label=${plus.label}><${Ikon} nama="plus" ukuran=${30} /><span class="plus-label">${plus.label}</span></button>`)}
      </div>
    </main>
  </div>`;
}

/**
 * Kepala halaman. `warna` (warna kategori) hanya jadi titik penanda di label.
 * Dengan `foto` (boleh kosong ''): foto besar membulat di atas, tombol melayang di atasnya.
 */
export function Hero({ warna, label, judul, kembali, kanan, stat, panjang, terang, foto, children }) {
  const adaFoto = foto !== undefined;
  const tombolKembali = kembali && html`<a class="bulat" href=${tautan(kembali)} aria-label="Kembali"><${Ikon} nama="kembali" /></a>`;
  const labelEl = html`<span class="hero-label">${warna && html`<i class="titik-warna" style=${`--warna:${warna}`} aria-hidden="true"></i>`}${label}</span>`;
  const judulEl = html`<div class="hero-judul-baris">
    <h1 class=${panjang || String(judul).length > 14 ? 'panjang' : ''}>${judul}</h1>
    ${stat}
  </div>`;
  if (adaFoto) {
    return html`<header class="hero ada-foto">
      <div class=${'hero-gambar' + (foto ? '' : ' kosong')} role="img" aria-label=${foto ? 'Foto ' + judul : 'Belum ada foto'}>
        <${Foto} src=${foto} alt="" ikon="kamera" ukuranIkon=${40} />
        <div class="hero-atas">
          ${tombolKembali || html`<span></span>`}
          ${kanan && html`<div style="display:flex;gap:8px">${kanan}</div>`}
        </div>
      </div>
      <div class="hero-badan">
        ${labelEl}
        ${judulEl}
        ${children}
      </div>
    </header>`;
  }
  return html`<header class=${'hero' + (terang ? ' terang' : '')}>
    <div class="hero-atas">
      <div style="display:flex;align-items:center;gap:12px;min-width:0">
        ${tombolKembali}
        ${labelEl}
      </div>
      ${kanan && html`<div style="display:flex;gap:8px">${kanan}</div>`}
    </div>
    ${judulEl}
    ${children}
  </header>`;
}

/** Ubin angka ringkas. Dengan `ikon`: ikon dalam lingkaran di kiri, seperti ubin gizi di kartu resep. */
export function Stat({ nilai, label, ikon }) {
  return html`<div class=${'stat' + (ikon ? ' berikon' : '')}>
    ${ikon && html`<span class="stat-ikon" aria-hidden="true"><${Ikon} nama=${ikon} ukuran=${18} /></span>`}
    <span class="stat-teks"><b>${nilai}</b><small>${label}</small></span>
  </div>`;
}

export function Tab({ item }) {
  return html`<nav class="tab" aria-label="Bagian">
    ${item.map((t) =>
      t.href
        ? html`<a href=${tautan(t.href)} class=${t.aktif ? 'aktif' : ''} aria-current=${t.aktif ? 'page' : null}>${t.label}</a>`
        : html`<button class=${t.aktif ? 'aktif' : ''} aria-pressed=${!!t.aktif} onClick=${t.onKlik}>${t.label}</button>`,
    )}
  </nav>`;
}

/** Gambar dengan cadangan ikon bila kosong atau gagal dimuat. */
export function Foto({ src, alt = '', ikon = 'gambar', ukuranIkon = 28 }) {
  const [gagal, setGagal] = useState(false);
  useEffect(() => setGagal(false), [src]);
  if (!src || gagal) return html`<${Ikon} nama=${ikon} ukuran=${ukuranIkon} />`;
  return html`<img src=${src} alt=${alt} loading="lazy" referrerpolicy="no-referrer" onError=${() => setGagal(true)} />`;
}

export function Kosong({ judul, teks, children }) {
  return html`<div class="kosong">
    <h3>${judul}</h3>
    ${teks && html`<p>${teks}</p>`}
    ${children}
  </div>`;
}

/** Pilih foto dari kamera/galeri; hasilnya diperkecil dulu. */
export function FotoInput({ nilai, onUbah, judul = 'Tambah foto', bantu = '', aksen = 'var(--tomat)', ikon = 'kamera', kompresFn = kompres, kelas = '' }) {
  const ref = useRef(null);
  const [sibuk, setSibuk] = useState(false);
  const pilih = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    setSibuk(true);
    try {
      onUbah(await kompresFn(file));
    } catch (err) {
      tampilToast(err.message || 'Foto tidak bisa dibuka.');
    } finally {
      setSibuk(false);
    }
  };
  const buka = () => ref.current && ref.current.click();
  return html`<div>
    <input type="file" accept="image/*" hidden ref=${ref} onChange=${pilih} />
    ${nilai
      ? html`<div class=${'foto-terpasang ' + kelas}>
          <${Foto} src=${nilai} alt=${judul} />
          <div class="aksi">
            <button type="button" onClick=${buka}>Ganti</button>
            <button type="button" onClick=${() => onUbah('')}>Hapus</button>
          </div>
        </div>`
      : html`<button type="button" class="foto-input" style=${`--aksen:${aksen}`} onClick=${buka} disabled=${sibuk}>
          <span class="bulat-ikon"><${Ikon} nama=${ikon} ukuran=${28} /></span>
          <span>
            <b>${sibuk ? 'Memproses foto…' : judul}</b>
            ${bantu && html`<small>${bantu}</small>`}
          </span>
        </button>`}
  </div>`;
}

/** Isian angka yang menyimpan teks selama diketik dan melapor saat angkanya sah. */
export function InputAngka({ nilai, onUbah, kelas = 'input kecil', ...sisa }) {
  const [teks, setTeks] = useState(Number.isFinite(nilai) ? tampilJumlah(nilai) : '');
  const [fokus, setFokus] = useState(false);
  useEffect(() => {
    if (!fokus) setTeks(Number.isFinite(nilai) ? tampilJumlah(nilai) : '');
  }, [nilai, fokus]);
  return html`<input
    class=${kelas}
    inputmode="decimal"
    autocomplete="off"
    value=${teks}
    onFocus=${() => setFokus(true)}
    onBlur=${() => setFokus(false)}
    onInput=${(e) => {
      const t = e.target.value;
      setTeks(t);
      const n = bacaJumlah(t);
      onUbah(t.trim() === '' ? null : Number.isFinite(n) ? n : NaN);
    }}
    ...${sisa}
  />`;
}

/** Isian rupiah: tampil "45.000", melapor angka bulat. */
export function InputRupiah({ nilai, onUbah, kelas = 'input kecil', ...sisa }) {
  return html`<input
    class=${kelas}
    inputmode="numeric"
    autocomplete="off"
    value=${nilai ? angka(nilai) : ''}
    onInput=${(e) => {
      const n = bacaRupiah(e.target.value);
      onUbah(n);
      e.target.value = n ? angka(n) : '';
    }}
    ...${sisa}
  />`;
}

/** Kumpulan kategori sebagai chip yang bisa dipilih. */
export function ChipKategori({ daftar, dipilih, onPilih, tambah }) {
  return html`<div class="chips" role="group" aria-label="Kategori">
    ${daftar.map(
      (c) => html`<button type="button" class=${'chip' + (dipilih === c.id ? ' aktif' : '')} style=${`--warna:${c.warna}`} aria-pressed=${dipilih === c.id} onClick=${() => onPilih(c.id)}>
        ${dipilih === c.id && html`<${Ikon} nama="centang" ukuran=${16} />`}${c.nama}
      </button>`,
    )}
    ${tambah}
  </div>`;
}

export function unduhBerkas(nama, isi, tipe = 'application/json') {
  const blob = isi instanceof Blob ? isi : new Blob([isi], { type: tipe });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}
