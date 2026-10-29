// Beranda admin: sapaan, banner resep yang masih dikembangkan, menu 4 kotak, lalu slider resep juara.

import { html, useEffect, useRef, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Foto, Kosong } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { IkonKategori } from '../ui/ikon-kategori.js';
import { tautan } from '../ui/router.js';
import { daftarJuara, ambilMerek, ringkasResep } from '../lib/repo.js';
import { desimal1, rupiah } from '../lib/util.js';
import { ringkasPenjualan, daftarStokBahan } from '../lib/toko.js';

function sapaan() {
  const j = new Date().getHours();
  if (j < 11) return 'Selamat pagi';
  if (j < 15) return 'Selamat siang';
  if (j < 18) return 'Selamat sore';
  return 'Selamat malam';
}

/** Resep yang belum punya juara, yang paling baru diutak-atik lebih dulu. */
function resepDikembangkan(db) {
  const terakhir = (r) => Math.max(r.resep.diubah || 0, ...r.eksperimen.map((e) => e.diubah || 0));
  return db
    .semua('Resep')
    .map((r) => ringkasResep(db, r))
    .filter((r) => !r.juara)
    .sort((a, b) => terakhir(b) - terakhir(a));
}

/** Cincin kemajuan: skor terbaik dari 10. */
function Cincin({ skor }) {
  const ada = Number.isFinite(skor);
  const persen = ada ? Math.max(0, Math.min(100, skor * 10)) : 0;
  return html`<span class="cincin" style=${`--persen:${persen}`} role="img" aria-label=${ada ? `Skor terbaik ${desimal1(skor)} dari 10` : 'Belum dinilai'}>
    <b>${ada ? desimal1(skor) : '–'}</b>
  </span>`;
}

function BannerDikembangkan({ r }) {
  const jumlah = r.eksperimen.length;
  return html`<a class="banner-kembang" href=${tautan('/resep/' + r.resep.id)}>
    <span class="banner-teks">
      <span class="banner-label">Sedang dikembangkan</span>
      <b>${r.resep.nama}</b>
      <small>${jumlah ? `${jumlah} eksperimen · belum ada juara` : 'Belum ada eksperimen'}</small>
      <span class="banner-aksi">${jumlah ? 'Lanjutkan' : 'Catat eksperimen'}<${Ikon} nama="panah" ukuran=${16} /></span>
    </span>
    <${Cincin} skor=${r.skor} />
    <span class="banner-foto" aria-hidden="true"><${Foto} src=${r.foto} ikon="kamera" ukuranIkon=${32} /></span>
  </a>`;
}

/** Resep juara: satu kartu foto besar per geseran, teks di atas gradasi, titik penanda di bawah. */
function SliderJuara({ juara }) {
  const ref = useRef(null);
  const [aktif, setAktif] = useState(0);
  // Daftar berubah (mis. data baru datang dari server): kembali ke kartu pertama, jangan ikut
  // "terkunci" pada kartu lama yang posisinya bergeser.
  const ids = juara.map((r) => r.resep.id).join(',');
  useEffect(() => {
    if (ref.current) ref.current.scrollLeft = 0;
    setAktif(0);
  }, [ids]);
  const saatGulir = () => {
    const el = ref.current;
    if (el) setAktif(Math.round(el.scrollLeft / Math.max(1, el.clientWidth)));
  };
  const ke = (i) => {
    const el = ref.current;
    if (el) el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
  };
  return html`<div class="juara-wadah">
    <div class="slider-juara" ref=${ref} onScroll=${saatGulir} role="list" aria-label="Resep juara">
      ${juara.map(
        (r) => html`<a class="kartu-juara" role="listitem" key=${r.resep.id} href=${tautan('/resep/' + r.resep.id)}>
          <${Foto} src=${r.foto} ikon="kamera" ukuranIkon=${40} />
          <span class="kartu-juara-atas" aria-hidden="true">
            <img class="piala-juara" src="gambar/menu/piala.svg" alt="" width="32" height="32" />
            <span class="skor-bintang"><${Ikon} nama="bintang" ukuran=${15} />${Number.isFinite(r.skor) ? desimal1(r.skor) : '–'}</span>
          </span>
          <span class="kartu-juara-teks">
            <span class="kartu-juara-kat"><${IkonKategori} nama=${r.kategori ? r.kategori.nama : ''} ukuran=${18} />${r.kategori ? r.kategori.nama : 'Resep'}</span>
            <b>${r.resep.nama}</b>
            <small>Eksperimen ${r.juara.nomor} juara · ${r.eksperimen.length} percobaan · ${r.jumlahPenilai > 0 ? `${r.jumlahPenilai} penilai` : 'belum ada penilai'}</small>
          </span>
        </a>`,
      )}
    </div>
    ${juara.length > 1 &&
    html`<div class="titik-slider">
      ${juara.map((r, i) => html`<button type="button" key=${r.resep.id} class=${i === aktif ? 'on' : ''} aria-label=${`Lihat ${r.resep.nama}`} aria-current=${i === aktif ? 'true' : null} onClick=${() => ke(i)}></button>`)}
    </div>`}
  </div>`;
}

const MENU = [
  { href: '/resep', label: 'Daftar resep', gambar: 'resep' },
  { href: '/bahan', label: 'Daftar bahan', gambar: 'bahan' },
  { href: '/resep?tujuan=hpp', label: 'HPP & harga', gambar: 'hpp' },
  { href: '/resep?tujuan=marketing', label: 'Marketing', gambar: 'marketing' },
];

// Baris kedua: dapur sampai penjualan.
const MENU_JUAL = [
  { href: '/stok-bahan', label: 'Stok & belanja', ikon: 'keranjang', warna: '#e8f4df', tinta: '#2f6e1c' },
  { href: '/produksi', label: 'Produksi', ikon: 'panci', warna: '#fde3d6', tinta: '#b4461b' },
  { href: '/menu', label: 'Menu & harga', ikon: 'tag', warna: '#fff1cc', tinta: '#8a5a00' },
  { href: '/paket', label: 'Paket produk', ikon: 'kotak', warna: '#e2e9f6', tinta: '#2a4170' },
];

function UbinIkon({ m, hitung }) {
  return html`<a class="menu-kotak" href=${tautan(m.href)}>
    <span class="menu-gambar" style=${`background:${m.warna};color:${m.tinta}`}><${Ikon} nama=${m.ikon} ukuran=${28} /></span>
    <span class="menu-label">${m.label}</span>
    ${hitung > 0 && html`<span class="lencana" aria-label=${hitung + ' perlu perhatian'}>${hitung}</span>`}
  </a>`;
}

/** Ringkasan penjualan hari ini (dapur dan toko). */
function RingkasHariIni({ db }) {
  const r = ringkasPenjualan(db);
  return html`<a class="ringkas-jual" href=${tautan('/pesanan')} aria-label="Penjualan hari ini">
    <div><small>Hari ini</small><b>${rupiah(r.omzet)}</b></div>
    <div><small>Pesanan</small><b>${r.jumlahPesanan}</b></div>
    <div class=${r.aktif ? 'sorot' : ''}><small>Perlu diproses</small><b>${r.aktif}</b></div>
  </a>`;
}

export function Beranda({ k }) {
  return html`<${BerandaDapur} k=${k} />`;
}

function BerandaDapur({ k }) {
  const { db } = k;
  const juara = daftarJuara(db);
  const kembang = resepDikembangkan(db);
  const jumlahResep = db.semua('Resep').length;
  const jumlahUlasan = db.semua('Penilaian', (p) => !p.dariPemilik).length;
  const nama = (db.pengaturan.namaPemilik || '').trim();
  const merek = ambilMerek(db);
  const hitung = { '/resep': jumlahResep, '/bahan': db.semua('Bahan').length };
  const adaJualan = db.semua('Menu').length > 0 || db.semua('Pesanan').length > 0;
  const hitungJual = { '/stok-bahan': daftarStokBahan(db).filter((x) => x.menipis && db.semua('MutasiBahan', (m) => m.idBahan === x.bahan.id).length).length };

  return html`<${Kerangka} k=${k} aktif="rumah" plus=${{ href: '/resep/baru', label: 'Resep baru' }}>
    <header class="sapa">
      <div class="sapa-isi">
        <h1>Halo${nama ? ', ' + nama.split(/\s+/)[0] : ''} <span aria-hidden="true">👋</span></h1>
        <p class="sapa-teks">${sapaan()} · <span class="sapa-merek-nama">${merek.nama}</span></p>
      </div>
      <a class="bulat putih lonceng" href=${tautan('/ulasan')} aria-label=${jumlahUlasan ? `Ulasan (${jumlahUlasan})` : 'Ulasan'}>
        <${Ikon} nama="lonceng" />
        ${jumlahUlasan > 0 && html`<i class="titik-lonceng" aria-hidden="true"></i>`}
      </a>
    </header>

    ${kembang.length > 0 &&
    html`<section class="bagian-beranda" aria-label="Resep yang sedang dikembangkan">
      <div class=${'gulir-banner' + (kembang.length > 1 ? ' banyak' : '')} role="list">
        ${kembang.slice(0, 6).map((r) => html`<div role="listitem" key=${r.resep.id}><${BannerDikembangkan} r=${r} /></div>`)}
      </div>
    </section>`}

    <nav class="menu-empat" aria-label="Menu">
      ${MENU.map(
        (m) => html`<a class="menu-kotak" href=${tautan(m.href)}>
          <span class="menu-gambar"><img src=${`gambar/menu/${m.gambar}.svg`} alt="" width="40" height="40" /></span>
          <span class="menu-label">${m.label}</span>
          ${hitung[m.href] > 0 && html`<span class="lencana" aria-label=${hitung[m.href] + ' item'}>${hitung[m.href]}</span>`}
        </a>`,
      )}
    </nav>
    <nav class="menu-empat" aria-label="Dapur dan penjualan">${MENU_JUAL.map((m) => html`<${UbinIkon} m=${m} hitung=${hitungJual[m.href]} />`)}</nav>
    ${adaJualan && html`<div style="padding:10px 20px 0"><${RingkasHariIni} db=${db} /></div>`}

    <div class="judul-bagian">
      <h2>Resep juara</h2>
      ${juara.length > 0 && html`<a class="tautan-hijau" href=${tautan('/resep')}>Lihat semua</a>`}
    </div>

    ${juara.length > 0
      ? html`<${SliderJuara} juara=${juara} />`
      : html`<div style="padding:0 20px">
          ${jumlahResep === 0
            ? html`<${Kosong} judul="Belum ada resep" teks="Mulai dengan membuat resep pertama.">
                <div class="baris-btn" style="width:100%;justify-content:center">
                  <a class="btn solid" href=${tautan('/resep/baru')}>Buat resep pertama</a>
                </div>
              <//>`
            : html`<div class="kosong kosong-juara">
                <h3>Belum ada resep juara</h3>
                <p>Buka eksperimen yang hasilnya paling bagus, lalu tekan “Tandai sebagai juara”.</p>
                <a class="btn solid" href=${tautan('/resep')}>Buka daftar resep</a>
              </div>`}
        </div>`}
    <div style="height:12px"></div>
  <//>`;
}
