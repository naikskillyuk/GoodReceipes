// Etalase toko untuk pembeli (halaman depan situs "/" atau link #/pesan/token, tanpa login): beranda dengan banner, pilihan populer, kategori,
// dan testimoni; daftar menu; detail produk; keranjang; lalu status pesanan dan cara bayar.
// Bayar: transfer / QRIS toko (dicek manual oleh toko) atau Mayar bila diaktifkan admin.
// Layar dipilih dari kueri ?l= (beranda | menu | produk | keranjang | pesanan) supaya tombol kembali HP bekerja.

import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import { Kosong, Foto, LogoMerek } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tampilToast } from '../ui/pesan.js';
import { pergi } from '../ui/router.js';
import { terapkanMerekDokumen } from '../ui/merek.js';
import { scriptUrlAman } from './penilai.js';
import { InfoTransfer, teksJadwal } from './pesanan.js';
import { keInputWaktu, dariInputWaktu } from './catat-pesanan.js';
import { KartuBanner } from '../ui/banner.js';
import { Bintang } from './pelanggan.js';
import { pesanOnline, kirimTestimoni, normalHp, namaItem, kunciBaris, LABEL_AMBIL, teksDiskon, syaratPromoProduk } from '../lib/toko.js';
import { panggilApi } from '../lib/sync.js';
import { LOGO_BAWAAN, ambilMerek } from '../lib/repo.js';
import { rupiah, tanggal } from '../lib/util.js';

const CEK_TIAP_MS = 5000;

function alamatServer(k) {
  const tetap = (window.APP_CONFIG && window.APP_CONFIG.scriptUrl) || '';
  const dariTautan = k.rute.kueri.u || '';
  // Server uji (npm run dev) menyajikan /api di alamat yang sama.
  return tetap || (scriptUrlAman(dariTautan) ? dariTautan : '') || k.db.pengaturan.scriptUrl || location.origin + '/api';
}

// Ingatan di perangkat pembeli: pesanan terakhir dan isi keranjang (per toko).
function baca(kunci, bawaan) {
  try {
    const v = localStorage.getItem(kunci);
    return v ? JSON.parse(v) : bawaan;
  } catch {
    return bawaan;
  }
}
function tulis(kunci, nilai) {
  try {
    localStorage.setItem(kunci, JSON.stringify(nilai));
  } catch {
    /* tidak apa-apa */
  }
}
const kunciPesanan = (token) => 'pesanan-terakhir-' + token;
const kunciKeranjang = (token) => 'keranjang-' + token;
const kunciKode = (token) => 'kode-promo-' + token;
// Data toko terakhir (menu, harga, logo) supaya etalase langsung tampil saat dibuka lagi,
// sambil data terbaru diambil dari server di belakang.
const kunciInfo = (token) => 'info-toko-' + token;
const kunciSambut = (token) => 'sambut-' + token;
function sudahDisambut(token) {
  try {
    return sessionStorage.getItem(kunciSambut(token)) === '1';
  } catch {
    return false;
  }
}
function ingatan(token) {
  const v = baca(kunciPesanan(token), '');
  return typeof v === 'string' ? v : '';
}

// Semua pesanan dari perangkat ini (terbaru dulu, maks. 20). Pesanan terakhir versi lama ikut terbaca.
const kunciDaftarPesanan = (token) => 'pesanan-saya-' + token;
const MAKS_PESANAN_SAYA = 20;
function pesananSaya(token) {
  const v = baca(kunciDaftarPesanan(token), []);
  let ids = Array.isArray(v) ? v.filter((x) => typeof x === 'string' && x) : [];
  const lama = ingatan(token);
  if (lama && !ids.includes(lama)) ids = [lama, ...ids];
  return ids.slice(0, MAKS_PESANAN_SAYA);
}
function ingatPesanan(token, id) {
  if (!id) return;
  tulis(kunciDaftarPesanan(token), [id, ...pesananSaya(token).filter((x) => x !== id)].slice(0, MAKS_PESANAN_SAYA));
  tulis(kunciPesanan(token), id);
}
function lupakanPesanan(token, id) {
  tulis(kunciDaftarPesanan(token), pesananSaya(token).filter((x) => x !== id));
  if (ingatan(token) === id) tulis(kunciPesanan(token), '');
}

/** Pindah layar etalase, tetap membawa ?u= (alamat server untuk server uji). */
function keLayar(k, token, l, extra = {}) {
  const q = new URLSearchParams();
  if (k.rute.kueri.u) q.set('u', k.rute.kueri.u);
  if (l) q.set('l', l);
  for (const [a, b] of Object.entries(extra)) if (b) q.set(a, b);
  const s = q.toString();
  pergi((token ? '/pesan/' + token : '/') + (s ? '?' + s : ''));
}

function waTautan(wa, teks) {
  const hp = normalHp(wa || '');
  return hp ? `https://wa.me/${hp}?text=${encodeURIComponent(teks)}` : '';
}

// ---------- Bagian kecil ----------

function TombolTambah({ m, n, atur }) {
  const habis = m.sisa !== null && m.sisa <= 0;
  if (habis) return html`<span class="et-habis">Habis</span>`;
  if (!n) return html`<button type="button" class="et-plus" aria-label=${'Tambah ' + m.nama} onClick=${(e) => (e.stopPropagation(), atur(m, 1))}><${Ikon} nama="plus" ukuran=${18} /></button>`;
  return html`<span class="et-stepper" onClick=${(e) => e.stopPropagation()}>
    <button type="button" aria-label=${'Kurangi ' + m.nama} onClick=${() => atur(m, n - 1)}><${Ikon} nama="minus" ukuran=${14} /></button>
    <output>${n}</output>
    <button type="button" aria-label=${'Tambah ' + m.nama} onClick=${() => atur(m, n + 1)}><${Ikon} nama="plus" ukuran=${14} /></button>
  </span>`;
}

/** Harga untuk pembeli; menu "Coming soon" tidak menampilkan harga. */
const tampilHarga = (m, nilai) => (m.segera ? 'Coming soon' : rupiah(nilai));

function KartuProduk({ m, n, atur, buka, lebar, terjual = false }) {
  const berpilihan = (m.opsi || []).length > 0;
  return html`<article class=${'et-kartu' + (lebar ? ' lebar' : '') + (m.sisa !== null && m.sisa <= 0 ? ' mati' : '')}>
    <button type="button" class="et-kartu-foto" onClick=${() => buka(m)} aria-label=${'Lihat ' + m.nama}>
      <${Foto} src=${m.fotoUrl} ikon="kue" ukuranIkon=${36} />
      ${m.diskon > 0 && !m.segera && html`<span class="et-diskon">${teksDiskon(m.diskonJenis, m.diskon)}</span>`}
      ${m.segera && html`<span class="et-segera">Coming soon</span>`}
      ${m.sisa !== null && m.sisa > 0 && m.sisa <= 5 && html`<span class="et-pita">Sisa ${m.sisa}</span>`}
    </button>
    <div class="et-kartu-isi">
      <button type="button" class="et-kartu-nama" onClick=${() => buka(m)}>${m.nama}</button>
      <div class="et-kartu-bawah"><span class="et-harga-blok">${m.segera ? html`<b class="et-harga segera">Coming soon</b>` : html`<b class="et-harga">${rupiah(m.harga)}</b>${m.diskon > 0 && html`<s>${rupiah(m.hargaAsli)}</s>`}`}</span><${TombolTambah} m=${m} n=${berpilihan ? 0 : n} atur=${berpilihan ? () => buka(m) : atur} /></div>
      ${berpilihan && html`<small class="et-ada-pilihan">Ada pilihan tambahan</small>`}
      ${terjual && m.terjual > 0 && html`<small class="et-terjual">${m.terjual} terjual</small>`}
    </div>
  </article>`;
}

/**
 * Geser otomatis isi wadah horizontal (banner, testimoni) setiap `ms` milidetik, berputar ke awal.
 * Berhenti sebentar saat disentuh, dan tidak bergerak bila pengguna memilih "kurangi gerakan".
 * Mengembalikan [ref, indeks aktif].
 */
function useGeserOtomatis(jumlah, ms) {
  const ref = useRef(null);
  const [aktif, setAktif] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el || jumlah < 2) return;
    let jedaSampai = 0;
    const jeda = () => (jedaSampai = Date.now() + 8000);
    const indeks = () => {
      const anak = [...el.children];
      let terdekat = 0;
      anak.forEach((c, i) => {
        if (Math.abs(c.offsetLeft - el.offsetLeft - el.scrollLeft) < Math.abs(anak[terdekat].offsetLeft - el.offsetLeft - el.scrollLeft)) terdekat = i;
      });
      return terdekat;
    };
    const saatGeser = () => setAktif(indeks());
    el.addEventListener('scroll', saatGeser, { passive: true });
    el.addEventListener('pointerdown', jeda);
    el.addEventListener('touchstart', jeda, { passive: true });
    const diam = globalThis.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const t = diam
      ? null
      : setInterval(() => {
          if (Date.now() < jedaSampai || document.hidden) return;
          const anak = [...el.children];
          const berikut = anak[(indeks() + 1) % anak.length];
          const ujung = el.scrollLeft + el.clientWidth >= el.scrollWidth - 4;
          el.scrollTo({ left: ujung ? 0 : berikut.offsetLeft - el.offsetLeft, behavior: 'smooth' });
        }, ms);
    return () => {
      clearInterval(t);
      el.removeEventListener('scroll', saatGeser);
      el.removeEventListener('pointerdown', jeda);
      el.removeEventListener('touchstart', jeda);
    };
  }, [jumlah, ms]);
  return [ref, aktif];
}

function Titik({ jumlah, aktif }) {
  if (jumlah < 2) return null;
  return html`<div class="et-titik" aria-hidden="true">${Array.from({ length: jumlah }, (_, i) => html`<i class=${i === aktif ? 'aktif' : ''}></i>`)}</div>`;
}

function Testimoni({ daftar }) {
  const ada = daftar && daftar.length > 0;
  const [ref, aktif] = useGeserOtomatis(ada ? daftar.length : 0, 4000);
  if (!ada) return null;
  const rata = daftar.reduce((j, t) => j + (Number(t.bintang) || 5), 0) / daftar.length;
  return html`<section class="et-bagian" aria-labelledby="et-h-testi">
    <div class="et-judul-bagian">
      <h2 id="et-h-testi">Kata pembeli</h2>
      <span class="et-rata"><${Bintang} nilai=${rata} /> ${rata.toFixed(1).replace('.', ',')} · ${daftar.length} ulasan</span>
    </div>
    <div class="et-geser et-geser-testi" ref=${ref}>
      ${daftar.map(
        (t, i) => html`<figure class="et-testi" key=${i}>
          <${Bintang} nilai=${t.bintang} />
          <blockquote>“${t.isi}”</blockquote>
          <figcaption><span class="et-avatar" aria-hidden="true">${(t.nama || 'P').trim().charAt(0).toUpperCase()}</span><span><b>${t.nama || 'Pembeli'}</b>${t.waktu ? html`<small>${tanggal(t.waktu)}</small>` : ''}</span></figcaption>
        </figure>`,
      )}
    </div>
    <${Titik} jumlah=${daftar.length} aktif=${aktif} />
  </section>`;
}

// ---------- Layar ----------

/** Layar sambutan sebelum etalase: foto latar, logo, dan salam. Muncul sekali per kunjungan. */
function Sambutan({ info, logo, onMulai }) {
  const latar = info.latarUrl || ((info.menu || []).find((m) => m.fotoUrl) || {}).fotoUrl || 'gambar/latar-masuk.jpg';
  return html`<div class="etalase et-sambut" role="dialog" aria-label="Selamat datang">
    <img class="et-sambut-latar" src=${latar} alt="" aria-hidden="true" />
    <div class="et-sambut-isi">
      <span class="et-sambut-logo"><${LogoMerek} src=${logo} ukuran=${84} kelas="polos" /></span>
      <p class="et-sambut-salam">Selamat datang di</p>
      <h1>${info.namaToko}</h1>
      <p class="et-sambut-teks">${info.catatan || 'Kue dan camilan rumahan, dibuat hangat dari dapur kami. Pesan sekarang, ambil atau diantar.'}</p>
      <button type="button" class="et-tombol lebar" onClick=${onMulai}>Mulai pesan<${Ikon} nama="panah" ukuran=${18} /></button>
      ${!info.buka && html`<p class="et-sambut-tutup">Toko sedang tutup, Anda tetap bisa melihat menu.</p>`}
    </div>
  </div>`;
}

/** Header beranda etalase: foto header, logo + keranjang, sapaan, nama toko, dan kolom cari. */
function HeaderEtalase({ info, logo, jumlahKeranjang, ke, cariMenu }) {
  const [cari, setCari] = useState('');
  const foto = info.headerUrl || info.latarUrl || ((info.menu || []).find((m) => m.fotoUrl) || {}).fotoUrl || '';
  return html`<header class="et-header">
    ${foto ? html`<img class="et-header-foto" src=${foto} alt="" aria-hidden="true" />` : ''}
    <div class="et-header-atas">
      <button type="button" class="et-ikon-keranjang" aria-label=${`Keranjang (${jumlahKeranjang})`} onClick=${() => ke('keranjang')}>
        <${Ikon} nama="keranjang" ukuran=${22} />${jumlahKeranjang > 0 && html`<i>${jumlahKeranjang}</i>`}
      </button>
    </div>
    <div class="et-header-teks">
      <span class="et-header-logo"><${LogoMerek} src=${logo} ukuran=${84} /></span>
      <small>Halo, selamat datang di</small>
      <h1>${info.namaToko}</h1>
    </div>
    <form class="et-header-cari" role="search" onSubmit=${(e) => (e.preventDefault(), cariMenu(cari.trim()))}>
      <${Ikon} nama="cari" ukuran=${20} />
      <input type="search" placeholder="Cari kue, camilan…" aria-label="Cari di toko" value=${cari} onInput=${(e) => setCari(e.target.value)} />
      <button type="submit" aria-label="Cari"><${Ikon} nama="panah" ukuran=${18} /></button>
    </form>
  </header>`;
}

const teksPromo = (p) => (p.jenis === 'persen' ? `Diskon ${p.nilai.toLocaleString('id-ID')}%` : `Hemat ${rupiah(p.nilai)}`);

function BannerPromo({ info, pakaiKode, keMenu }) {
  const foto = (info.menu || []).filter((m) => m.fotoUrl).map((m) => m.fotoUrl);
  const aksiBanner = (b) => {
    if (b.aksi === 'menu') keMenu('');
    else if (b.aksi === 'kategori') keMenu(b.nilai);
    else if (b.aksi === 'promo') pakaiKode(b.nilai);
    else if (b.aksi === 'wa') window.open(waTautan(info.wa, 'Halo ' + info.namaToko + ', saya mau tanya.'), '_blank', 'noopener');
    else if (b.aksi === 'link' && /^https?:\/\//i.test(b.nilai)) window.open(b.nilai, '_blank', 'noopener');
  };
  const admin = (info.banner || []).map((b, i) => ({ kunci: 'b' + i, banner: b }));
  const slide = [
    ...(info.promo || []).map((p, i) => ({
      kunci: 'p' + p.kode,
      label: 'Promo',
      judul: teksPromo(p),
      teks: [p.nama, p.produk ? syaratPromoProduk(p.produk, p) : '', p.minBelanja > 0 ? `min. belanja ${rupiah(p.minBelanja)}` : '', p.untuk === 'baru' ? 'khusus pelanggan baru' : '', p.sampai ? `s/d ${tanggal(p.sampai)}` : ''].filter(Boolean).join(' · '),
      foto: foto[i % Math.max(1, foto.length)] || '',
      aksi: html`<button type="button" class="et-banner-kode" onClick=${() => pakaiKode(p.kode)}>Pakai kode <b>${p.kode}</b></button>`,
    })),
    { kunci: 'menu', label: info.namaToko, judul: 'Fresh dari dapur kami', teks: 'Pilih kue dan camilan favorit, ambil atau diantar.', foto: foto[0] || '', aksi: html`<button type="button" class="et-banner-kode" onClick=${() => keMenu('')}>Lihat menu</button>` },
  ];
  // Bila admin sudah membuat banner, slide "Fresh dari dapur kami" bawaan tidak perlu ditampilkan.
  const otomatis = admin.length ? slide.filter((x) => x.kunci !== 'menu') : slide;
  const jumlah = admin.length + otomatis.length;
  const [ref, aktif] = useGeserOtomatis(jumlah, 5000);
  return html`<section class="et-bagian" aria-label="Promo dan info">
    <div class="et-geser et-geser-banner" ref=${ref}>
      ${admin.map((x) => html`<div class="et-banner-admin" key=${x.kunci}><${KartuBanner} b=${x.banner} foto=${x.banner.fotoUrl} onAksi=${() => aksiBanner(x.banner)} /></div>`)}
      ${otomatis.map(
        (s) => html`<article class="et-banner" key=${s.kunci}>
          ${s.foto && html`<img src=${s.foto} alt="" aria-hidden="true" />`}
          <div class="et-banner-isi">
            <small>${s.label}</small>
            <b>${s.judul}</b>
            <span>${s.teks}</span>
            ${s.aksi}
          </div>
        </article>`,
      )}
    </div>
    <${Titik} jumlah=${jumlah} aktif=${aktif} />
  </section>`;
}

/** Menu terlaris untuk beranda: paling banyak terjual dulu, lalu urutan menu. */
export function topSelling(menu, jumlah = 6) {
  return menu
    .map((m, i) => ({ m, i }))
    .sort((a, b) => (b.m.terjual || 0) - (a.m.terjual || 0) || a.i - b.i)
    .slice(0, jumlah)
    .map((x) => x.m);
}

const IKON_KAT = { Paket: 'kotak', Minuman: 'gelas', Kue: 'kue', Lauk: 'panci', Camilan: 'kue', Cemilan: 'kue', Roti: 'kue' };

function Beranda({ info, jumlah, atur, buka, keMenu, ke, logo, jumlahKeranjang, cariMenu }) {
  const menu = info.menu || [];
  const kategori = [...new Set(menu.map((m) => m.kategori || 'Lainnya'))];
  const top = topSelling(menu);
  const pakaiKode = (kode) => {
    tulis(kunciKode(info.token), kode);
    tampilToast(`Kode ${kode} dipasang di keranjang.`);
  };
  const waToko = info.wa ? waTautan(info.wa, 'Halo ' + info.namaToko + ', saya mau tanya.') : '';
  return html`
    <${HeaderEtalase} info=${info} logo=${logo} jumlahKeranjang=${jumlahKeranjang} ke=${ke} cariMenu=${cariMenu} />
    ${!info.buka && html`<div class="et-tutup" role="status"><${Ikon} nama="jam" ukuran=${18} />Toko sedang tutup. ${info.catatan ? '' : 'Anda tetap bisa melihat menu.'}</div>`}
    <${BannerPromo} info=${info} pakaiKode=${pakaiKode} keMenu=${keMenu} />

    ${kategori.length > 0 &&
    html`<section class="et-bagian" aria-labelledby="et-h-kategori">
      <div class="et-judul-bagian"><h2 id="et-h-kategori">Kategori</h2></div>
      <nav class="et-pintas et-kategori" aria-label="Kategori menu">
        ${kategori.map((c) => {
          const n = menu.filter((m) => (m.kategori || 'Lainnya') === c).length;
          return html`<button type="button" key=${c} class="et-pintas-item" aria-label=${`${c}, ${n} produk`} onClick=${() => keMenu(c)}>
            <span><${Ikon} nama=${IKON_KAT[c] || 'kue'} ukuran=${24} /></span>${c}<small class="et-jumlah-kat">${n} produk</small>
          </button>`;
        })}
      </nav>
    </section>`}

    <section class="et-bagian" aria-labelledby="et-h-top">
      <div class="et-judul-bagian"><h2 id="et-h-top">Top Selling</h2>${menu.length > top.length && html`<button type="button" class="et-lihat" onClick=${() => keMenu('')}>Lihat semua</button>`}</div>
      ${menu.length === 0 ? html`<${Kosong} judul="Menu belum tersedia" teks="Silakan kembali lagi nanti." />` : html`<div class="et-grid et-grid-top">${top.map((m) => html`<${KartuProduk} key=${m.id} m=${m} n=${jumlah[m.id] || 0} atur=${atur} buka=${buka} lebar terjual />`)}</div>`}
    </section>

    <${Testimoni} daftar=${info.testimoni} />

    <section class="et-bagian et-info-toko">
      <div class="et-ciri">
        <span><${Ikon} nama="kue" ukuran=${20} />Bahan pilihan</span>
        <span><${Ikon} nama="panci" ukuran=${20} />Dibuat saat dipesan</span>
        <span><${Ikon} nama="toko" ukuran=${20} />Ambil atau diantar</span>
      </div>
      ${info.alamat && html`<p><b>Alamat:</b> ${info.alamat}</p>`}
      ${waToko && html`<a class="et-lihat" href=${waToko} target="_blank" rel="noopener">Chat toko via WhatsApp</a>`}
    </section>
  `;
}

function DaftarMenu({ info, jumlah, atur, buka, kat, keMenu, cariAwal = '' }) {
  const [cari, setCari] = useState(cariAwal);
  const menu = info.menu || [];
  const kategori = [...new Set(menu.map((m) => m.kategori || 'Lainnya'))];
  const q = cari.trim().toLowerCase();
  const tampil = menu.filter((m) => (!kat || m.kategori === kat) && (!q || m.nama.toLowerCase().includes(q)));
  return html`
    <h1 class="et-judul-layar">${kat || 'Semua menu'}</h1>
    <p class="et-sub">Pilih yang Anda suka, lalu buka keranjang untuk memesan.</p>
    <label class="et-cari"><${Ikon} nama="cari" ukuran=${18} /><input type="search" placeholder="Cari kue, camilan…" aria-label="Cari menu" value=${cari} onInput=${(e) => setCari(e.target.value)} /></label>
    ${kategori.length > 1 &&
    html`<div class="et-chips" role="group" aria-label="Kategori">
      <button type="button" class=${!kat ? 'aktif' : ''} aria-pressed=${!kat} onClick=${() => keMenu('')}>Semua (${menu.length})</button>
      ${kategori.map((c) => html`<button type="button" key=${c} class=${kat === c ? 'aktif' : ''} aria-pressed=${kat === c} onClick=${() => keMenu(c)}>${c} (${menu.filter((m) => (m.kategori || 'Lainnya') === c).length})</button>`)}
    </div>`}
    ${tampil.length === 0 && html`<${Kosong} judul="Tidak ada menu" teks=${q ? 'Coba kata lain.' : 'Belum ada menu di kategori ini.'} />`}
    <div class="et-grid">${tampil.map((m) => html`<${KartuProduk} key=${m.id} m=${m} n=${jumlah[m.id] || 0} atur=${atur} buka=${buka} lebar />`)}</div>
  `;
}

function DetailProduk({ info, m, diKeranjang, tambah: tambahKe, kembali, keKeranjang }) {
  const [n, setN] = useState(1);
  const [dipilih, setDipilih] = useState([]);
  const opsi = m.opsi || [];
  const habis = m.sisa !== null && m.sisa <= 0;
  const maks = Math.max(1, (m.sisa === null ? 100 : Math.min(100, m.sisa)) - diKeranjang);
  const harga = m.harga + opsi.filter((o) => dipilih.includes(o.nama)).reduce((j, o) => j + o.harga, 0);
  const rata = (info.testimoni || []).length ? info.testimoni.reduce((j, t) => j + (Number(t.bintang) || 5), 0) / info.testimoni.length : 0;
  const balik = (nama) => setDipilih((d) => (d.includes(nama) ? d.filter((x) => x !== nama) : [...d, nama]));
  const tambah = () => {
    tambahKe(m, opsi.filter((o) => dipilih.includes(o.nama)).map((o) => o.nama), n);
    tampilToast(`${m.nama} masuk keranjang.`);
    kembali();
  };
  return html`
    <div class="et-detail-foto">
      <button type="button" class="et-bulat" aria-label="Kembali" onClick=${kembali}><${Ikon} nama="kembali" /></button>
      <${Foto} src=${m.fotoUrl} ikon=${m.kategori === 'Paket' ? 'kotak' : 'kue'} ukuranIkon=${64} />
    </div>
    <div class="et-detail-isi">
      <span class="et-label-kat">${m.kategori}</span>
      <h1>${m.nama}</h1>
      <div class="et-detail-harga">
        <b class=${m.segera ? 'segera' : ''}>${tampilHarga(m, m.harga)}</b>
        ${m.diskon > 0 && !m.segera && html`<s class="et-harga-coret">${rupiah(m.hargaAsli)}</s><span class="et-diskon statis">Hemat ${m.diskonJenis === 'nominal' ? rupiah(m.diskon) : m.diskon + '%'}</span>`}
        ${rata > 0 && html`<span class="et-rata"><${Bintang} nilai=${rata} /> (${info.testimoni.length} ulasan toko)</span>`}
      </div>
      ${m.keterangan ? html`<p class="et-deskripsi">${m.keterangan}</p>` : html`<p class="et-deskripsi">Dibuat dari resep andalan ${info.namaToko}.</p>`}
      <p class=${'et-stok' + (habis ? ' habis' : '')}>${habis ? 'Stok sedang habis' : m.sisa === null ? 'Tersedia' : `Tersedia ${m.sisa}`}</p>
      ${opsi.length > 0 &&
      html`<section class="et-opsi" aria-labelledby="h-opsi">
        <h2 class="et-h2" id="h-opsi">Pilihan tambahan</h2>
        ${opsi.map(
          (o) => html`<label class=${'et-opsi-item' + (dipilih.includes(o.nama) ? ' aktif' : '')} key=${o.nama}>
            <input type="checkbox" checked=${dipilih.includes(o.nama)} onChange=${() => balik(o.nama)} />
            <span>${o.nama}</span>${!m.segera && html`<b>${o.harga ? '+' + rupiah(o.harga) : 'gratis'}</b>`}
          </label>`,
        )}
      </section>`}
      ${!habis &&
      html`<div class="et-detail-aksi">
        <span class="et-stepper besar">
          <button type="button" aria-label="Kurangi jumlah" onClick=${() => setN(Math.max(1, n - 1))}><${Ikon} nama="minus" ukuran=${18} /></button>
          <output aria-label="Jumlah">${n}</output>
          <button type="button" aria-label="Tambah jumlah" onClick=${() => setN(Math.min(maks, n + 1))}><${Ikon} nama="plus" ukuran=${18} /></button>
        </span>
        <button type="button" class="et-tombol lebar" aria-label=${m.segera ? 'Tambah ke keranjang' : 'Tambah ke keranjang, ' + rupiah(harga * n)} onClick=${tambah}><${Ikon} nama="keranjang" ukuran=${18} />${m.segera ? 'Tambah ke keranjang' : rupiah(harga * n)}</button>
      </div>`}
      ${diKeranjang > 0 && html`<button type="button" class="et-lihat" onClick=${keKeranjang}>Sudah ${diKeranjang} di keranjang · buka keranjang</button>`}
      <div class="et-ciri">
        <span><${Ikon} nama="kue" ukuran=${20} />Bahan pilihan</span>
        <span><${Ikon} nama="panci" ukuran=${20} />Dibuat saat dipesan</span>
        <span><${Ikon} nama="toko" ukuran=${20} />Ambil / antar</span>
      </div>
    </div>
  `;
}

function Keranjang({ k, info, url, token, baris, aturBaris, kosongkan, keMenu, selesai }) {
  const [nama, setNama] = useState('');
  const [hp, setHp] = useState('');
  const [catatan, setCatatan] = useState('');
  const [cara, setCara] = useState('');
  const [jam, setJam] = useState('');
  const [kode, setKode] = useState(() => baca(kunciKode(token), '') || '');
  const [galat, setGalat] = useState('');
  const [mengirim, setMengirim] = useState(false);
  useEffect(() => tulis(kunciKode(token), kode.trim()), [kode]);
  const item = baris;
  const total = item.reduce((j, b) => j + b.harga * b.jumlah, 0);

  const kirim = async (e) => {
    e.preventDefault();
    if (!item.length) return setGalat('Keranjang masih kosong.');
    if (nama.trim().length < 2) return setGalat('Isi nama Anda.');
    if (!hp.trim()) return setGalat('Isi nomor WhatsApp untuk kabar pesanan.');
    if (!cara) return setGalat('Pilih cara ambil pesanan: ambil sendiri atau ojek online.');
    const jadwal = dariInputWaktu(jam);
    if (!jadwal) return setGalat('Isi jam pesanan akan diambil.');
    if (jadwal < Date.now() - 5 * 60 * 1000) return setGalat('Jam ambil sudah lewat. Pilih jam lain.');
    setMengirim(true);
    setGalat('');
    try {
      const j = await pesanOnline.kirim(url, token, { nama: nama.trim(), hp, caraAmbil: cara, jadwal, catatan: catatan.trim(), kodePromo: kode.trim(), item: item.map((b) => ({ idMenu: b.m.id, jumlah: b.jumlah, opsi: b.opsi })) });
      ingatPesanan(token, j.idPesanan);
      tulis(kunciKode(token), '');
      kosongkan();
      if (j.link) location.href = j.link;
      else selesai(j.idPesanan);
    } catch (err) {
      setGalat(err.message || 'Pesanan gagal dikirim. Coba lagi.');
      setMengirim(false);
    }
  };

  if (!item.length) {
    return html`<h1 class="et-judul-layar">Keranjang</h1>
      <${Kosong} judul="Keranjang masih kosong" teks="Yuk pilih kue atau camilan favorit Anda."><button type="button" class="et-tombol" onClick=${() => keMenu('')}>Lihat menu</button><//>`;
  }
  return html`
    <h1 class="et-judul-layar">Keranjang</h1>
    <section class="et-panel">
      ${item.map(
        (b) => html`<div class="et-baris-keranjang" key=${b.kunci}>
          <span class="et-mini-foto"><${Foto} src=${b.m.fotoUrl} ikon="kue" ukuranIkon=${22} /></span>
          <span class="et-baris-teks"><b>${b.m.nama}</b>${b.opsi.length ? html`<small class="et-opsi-teks">+ ${b.opsi.join(', ')}</small>` : ''}<small>${tampilHarga(b.m, b.harga)}</small></span>
          <span class="et-baris-kanan"><b>${b.m.segera ? '' : rupiah(b.harga * b.jumlah)}</b><${TombolTambah} m=${{ ...b.m, nama: namaItem({ nama: b.m.nama, opsi: b.opsi }) }} n=${b.jumlah} atur=${(_, n) => aturBaris(b.kunci, n)} /></span>
        </div>`,
      )}
      <button type="button" class="et-lihat" onClick=${() => keMenu('')}>+ Tambah menu lain</button>
    </section>
    <form class="et-panel kolom" onSubmit=${kirim} novalidate aria-labelledby="h-data-pembeli">
      <h2 class="et-h2" id="h-data-pembeli">Data pemesan</h2>
      <label class="bidang"><span>Nama</span><input class="input" maxlength="60" autocomplete="name" value=${nama} onInput=${(e) => setNama(e.target.value)} /></label>
      <label class="bidang"><span>Nomor WhatsApp</span><input class="input" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="0812…" value=${hp} onInput=${(e) => setHp(e.target.value)} /><span class="bantu">Untuk kabar pesanan dan promo dari toko.</span></label>
      <fieldset class="bidang et-cara-ambil">
        <legend>Cara ambil pesanan</legend>
        <div class="et-opsi">
          ${[
            { kunci: 'ambil', teks: 'Datang ke toko dan ambil sendiri.' },
            { kunci: 'ojol', teks: 'Anda yang memesan Gojek / Grab ke toko. Toko tidak memesankan ojek.' },
          ].map(
            (o) => html`<label class=${'et-opsi-item' + (cara === o.kunci ? ' aktif' : '')} key=${o.kunci}>
              <input type="radio" name="cara-ambil" value=${o.kunci} checked=${cara === o.kunci} onChange=${() => (setCara(o.kunci), setGalat(''))} />
              <span><strong>${LABEL_AMBIL[o.kunci]}</strong><small>${o.teks}</small></span>
            </label>`,
          )}
        </div>
      </fieldset>
      ${cara && html`<label class="bidang"><span>${cara === 'ojol' ? 'Jam driver ojek datang ke toko' : 'Jam Anda datang mengambil'}</span><input class="input" type="datetime-local" min=${keInputWaktu(Date.now())} value=${jam} onInput=${(e) => (setJam(e.target.value), setGalat(''))} /></label>`}
      ${cara === 'ojol' && html`<div class="info">Pesan ojeknya sendiri lewat aplikasi Gojek / Grab sesuai jam di atas${info.alamat ? html`, dengan titik jemput <b>${info.alamat}</b>` : ' ke alamat toko'}. Ongkir dibayar langsung ke driver dan tidak termasuk total di bawah.</div>`}
      <label class="bidang"><span>Catatan (opsional)</span><input class="input" maxlength="300" value=${catatan} onInput=${(e) => setCatatan(e.target.value)} placeholder="mis. tanpa kacang" /></label>
      <label class="bidang"><span>Kode promo (opsional)</span><input class="input" maxlength="30" style="text-transform:uppercase" value=${kode} onInput=${(e) => setKode(e.target.value)} /></label>
      <div class="hasil-baris"><span><b class="biasa">Total</b>${kode.trim() ? html`<br /><small class="teks-kecil">Diskon promo dihitung saat dipesan</small>` : ''}</span><b class="et-total">${rupiah(total)}</b></div>
      ${!info.buka && html`<div class="info">Toko sedang tutup. ${info.catatan || 'Silakan kembali lagi nanti.'}</div>`}
      ${info.buka && !info.bayarOnline && html`<div class="info">Toko ini belum menerima pesanan online. Hubungi toko${info.wa ? ' di WhatsApp' : ''} untuk memesan.</div>`}
      ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
      <button class="et-tombol lebar" type="submit" disabled=${mengirim || !info.buka || !info.bayarOnline}>${mengirim ? 'Mengirim pesanan…' : info.mayar ? 'Pesan & bayar' : 'Pesan sekarang'}</button>
      <p class="bantu" style="text-align:center">${info.mayar ? 'Pembayaran lewat Mayar: QRIS, e-wallet, atau transfer bank.' : 'Setelah memesan, bayar lewat transfer bank atau scan QRIS toko.'}</p>
    </form>
  `;
}

function FormTestimoni({ url, token, idPesanan, nama }) {
  const [bintang, setBintang] = useState(5);
  const [isi, setIsi] = useState('');
  const [hasil, setHasil] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  if (hasil) return html`<div class="info" role="status">${hasil}</div>`;
  const kirim = async (e) => {
    e.preventDefault();
    setSibuk(true);
    setGalat('');
    try {
      const j = await kirimTestimoni(url, token, { idPesanan, nama, isi: isi.trim(), bintang });
      setHasil(j.pesan || 'Terima kasih atas testimoninya!');
    } catch (err) {
      setGalat(err.message);
    } finally {
      setSibuk(false);
    }
  };
  return html`<form class="et-panel kolom" onSubmit=${kirim} novalidate aria-labelledby="h-testi-kirim">
    <h2 class="et-h2" id="h-testi-kirim">Bagikan pengalaman Anda</h2>
    <div class="et-pilih-bintang" role="group" aria-label="Beri bintang">
      ${[1, 2, 3, 4, 5].map((n) => html`<button type="button" class=${n <= bintang ? 'nyala' : ''} aria-label=${n + ' bintang'} aria-pressed=${n === bintang} onClick=${() => setBintang(n)}>★</button>`)}
    </div>
    <label class="bidang"><span>Testimoni</span><textarea class="input" rows="3" maxlength="500" value=${isi} onInput=${(e) => setIsi(e.target.value)} placeholder="Bagaimana rasanya? Apa yang paling Anda suka?"></textarea></label>
    ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
    <button class="et-tombol lebar" type="submit" disabled=${sibuk || isi.trim().length < 5}>${sibuk ? 'Mengirim…' : 'Kirim testimoni'}</button>
  </form>`;
}

const CEK_SETELAH_LUNAS_MS = 30000;

function waktuSingkat(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const hariIni = new Date().toDateString() === d.toDateString();
  const jamMenit = String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0');
  return hariIni ? 'Hari ini ' + jamMenit : d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }) + ' ' + jamMenit;
}

/**
 * Langkah timeline pesanan pembeli. Tiap langkah: {kunci, judul, teks, waktu, selesai}.
 * Transfer/QRIS: dibuat -> bukti dikirim -> pembayaran dikonfirmasi -> diterima & disiapkan -> siap -> selesai.
 * Mayar: tanpa langkah bukti (pembayaran tercatat otomatis).
 */
export function langkahPesanan(s) {
  const kapan = (status) => {
    const r = (s.riwayat || []).filter((x) => x.status === status);
    return r.length ? r[r.length - 1].waktu : 0;
  };
  const urutan = ['baru', 'diproses', 'siap', 'selesai'];
  const sampai = (status) => urutan.indexOf(s.status) >= urutan.indexOf(status);
  const ojol = s.caraAmbil === 'ojol';
  const mayar = s.metodeBayar === 'mayar';
  const langkah = [{ kunci: 'dibuat', judul: 'Pesanan dibuat', teks: '', waktu: s.waktu, selesai: true }];
  if (!mayar) {
    langkah.push({ kunci: 'bukti', judul: 'Bukti bayar dikirim', teks: 'Transfer / scan QRIS, lalu kirim bukti lewat tombol WhatsApp di bawah.', waktu: s.buktiPada, selesai: !!(s.buktiPada || s.lunas) });
  }
  langkah.push(
    { kunci: 'bayar', judul: mayar ? 'Pembayaran diterima' : 'Pembayaran dikonfirmasi toko', teks: mayar ? 'Selesaikan pembayaran lewat tombol Bayar sekarang.' : 'Toko sedang mengecek pembayaran Anda.', waktu: s.lunasPada, selesai: !!s.lunas },
    { kunci: 'diproses', judul: 'Pesanan diterima & disiapkan', teks: s.status === 'diproses' ? 'Dapur sedang menyiapkan pesanan Anda.' : 'Pesanan akan segera disiapkan dapur.', waktu: kapan('diproses'), selesai: sampai('diproses') },
    { kunci: 'siap', judul: ojol ? 'Siap dijemput driver' : 'Siap diambil', teks: ojol ? 'Pesan Gojek / Grab ke toko sekarang.' : 'Silakan datang ke toko.', waktu: kapan('siap'), selesai: sampai('siap') },
    { kunci: 'selesai', judul: 'Selesai', teks: 'Terima kasih sudah berbelanja!', waktu: kapan('selesai'), selesai: s.status === 'selesai' },
  );
  return langkah;
}

function TimelinePesanan({ s }) {
  const langkah = langkahPesanan(s);
  const iAktif = langkah.findIndex((l) => !l.selesai);
  return html`<ol class="et-timeline" aria-label="Status pesanan">
    ${langkah.map((l, i) => {
      const kelas = l.selesai ? 'selesai' : i === iAktif ? 'aktif' : 'nanti';
      return html`<li class=${'et-langkah ' + kelas} key=${l.kunci} aria-current=${i === iAktif ? 'step' : null}>
        <span class="et-langkah-titik" aria-hidden="true">${l.selesai ? html`<${Ikon} nama="centang" ukuran=${14} />` : ''}</span>
        <div class="et-langkah-isi">
          <b>${l.judul}</b>
          ${l.selesai && l.waktu ? html`<small>${waktuSingkat(l.waktu)}</small>` : ''}
          ${i === iAktif && l.teks ? html`<span>${l.teks}</span>` : ''}
        </div>
      </li>`;
    })}
  </ol>`;
}

/** Status ringkas untuk baris daftar pesanan pembeli: [label, kelas warna]. */
function labelStatus(s) {
  const ojol = s.caraAmbil === 'ojol';
  if (s.status === 'menunggu') return s.buktiPada ? ['Bukti terkirim', 'tunggu'] : ['Menunggu bayar', 'tunggu'];
  return (
    {
      baru: ['Diterima', 'proses'],
      diproses: ['Disiapkan', 'proses'],
      siap: [ojol ? 'Siap dijemput' : 'Siap diambil', 'siap'],
      selesai: ['Selesai', 'selesai'],
      batal: ['Dibatalkan', 'batal'],
    }[s.status] || [s.status, 'proses']
  );
}

const CEK_TERTUTUP_MS = 60000;

/**
 * Ambil status satu pesanan dan perbarui berkala sampai selesai / batal.
 * Terbuka: tiap 5 detik sebelum lunas, 30 detik sesudahnya. Tertutup: tiap menit.
 */
function useStatusPesanan(url, token, idPesanan, terbuka) {
  const [s, setS] = useState(null);
  const [galat, setGalat] = useState('');
  useEffect(() => {
    let hidup = true;
    let t = null;
    let terakhir = null;
    const cek = async () => {
      if (document.visibilityState === 'hidden' && terakhir) {
        t = setTimeout(cek, CEK_TIAP_MS);
        return;
      }
      try {
        const j = await pesanOnline.status(url, token, idPesanan);
        if (!hidup) return;
        terakhir = j;
        setS(j);
        setGalat('');
      } catch (e) {
        // Gagal sesaat (sinyal / batas permintaan) tidak menghapus tampilan yang sudah ada.
        if (!hidup) return;
        if (!terakhir) return setGalat(e.message || 'Pesanan tidak bisa dibuka.');
      }
      if (!hidup || terakhir.status === 'batal' || terakhir.status === 'selesai') return;
      t = setTimeout(cek, !terbuka ? CEK_TERTUTUP_MS : terakhir.lunas ? CEK_SETELAH_LUNAS_MS : CEK_TIAP_MS);
    };
    cek();
    return () => {
      hidup = false;
      clearTimeout(t);
    };
  }, [idPesanan, terbuka]);
  return [s, setS, galat];
}

/** Isi detail satu pesanan: kendala dari dapur, timeline, cara bayar, rincian, dan testimoni. */
function DetailPesananSaya({ s, setS, url, token, idPesanan }) {
  const manual = !s.lunas && s.bayarManual;
  const ojol = s.caraAmbil === 'ojol';
  const ambil = s.caraAmbil && LABEL_AMBIL[s.caraAmbil] ? `${LABEL_AMBIL[s.caraAmbil]}${s.jadwal > 0 ? ', ' + teksJadwal(s.jadwal) : ''}` : '';
  const waBukti = manual ? waTautan(s.wa, `Halo, saya sudah bayar pesanan #${s.nomor} sebesar ${rupiah(s.total)} atas nama ${s.nama}.${ambil ? ` Cara ambil: ${ambil}.` : ''} Berikut bukti transfernya.`) : '';
  const waToko = waTautan(s.wa, `Halo, saya mau tanya tentang pesanan #${s.nomor} atas nama ${s.nama}.`);
  // Catat bahwa bukti dikirim (toko melihatnya di kasir); tautan WhatsApp tetap terbuka seperti biasa.
  const catatBukti = () => {
    if (!s.buktiPada) setS({ ...s, buktiPada: Date.now() });
    pesanOnline.bukti(url, token, idPesanan).catch(() => {});
  };
  return html`<div class="et-pesanan-detail">
    ${s.kendala &&
    html`<div class="et-kendala" role="alert">
      <${Ikon} nama="info" ukuran=${20} />
      <div><b>Info dari dapur</b><p>${s.kendala}</p>${waToko && html`<a href=${waToko} target="_blank" rel="noopener">Tanya toko via WhatsApp</a>`}</div>
    </div>`}
    ${s.status === 'batal'
      ? html`<div class="et-kendala batal" role="alert">
          <${Ikon} nama="info" ukuran=${20} />
          <div><b>Pesanan dibatalkan</b><p>Hubungi toko bila ada pertanyaan${s.lunas ? ' atau untuk pengembalian dana' : ''}.</p>${waToko && html`<a href=${waToko} target="_blank" rel="noopener">Chat toko via WhatsApp</a>`}</div>
        </div>`
      : html`<${TimelinePesanan} s=${s} />`}
    ${manual &&
    html`<section class="et-pesanan-bagian kolom" aria-labelledby=${'h-bayar-' + idPesanan}>
      <h3 class="et-h3" id=${'h-bayar-' + idPesanan}>Cara bayar</h3>
      <div class="total-bayar"><small>Total yang dibayar</small><b>${rupiah(s.total)}</b></div>
      <${InfoTransfer} rekening=${s.bayarManual.rekening || []} qris=${s.bayarManual.qrisUrl || ''} total=${0} />
      <p class="bantu">Scan QRIS atau transfer ke rekening di atas, lalu kirim bukti bayar ke WhatsApp toko. Pesanan diproses setelah toko mengonfirmasi; halaman ini berubah otomatis.</p>
      ${waBukti && html`<a class="et-tombol lebar" href=${waBukti} target="_blank" rel="noopener" onClick=${catatBukti}><${Ikon} nama="kirim" ukuran=${18} />${s.buktiPada ? 'Kirim ulang bukti bayar via WhatsApp' : 'Kirim bukti bayar via WhatsApp'}</a>`}
    </section>`}
    ${s.link && html`<a class="et-tombol lebar" href=${s.link}>Bayar sekarang</a>`}
    <section class="et-pesanan-bagian kolom" aria-labelledby=${'h-rincian-' + idPesanan}>
      <h3 class="et-h3" id=${'h-rincian-' + idPesanan}>Rincian pesanan</h3>
      ${(s.item || []).map((i, n) => html`<div class="hasil-baris" key=${n}><span>${i.jumlah}× ${namaItem(i)}</span><b class="biasa">${rupiah(i.harga * i.jumlah)}</b></div>`)}
      <div class="hasil-baris"><span><b class="biasa">Total</b></span><b>${rupiah(s.total)}</b></div>
      ${ambil && html`<div class="hasil-baris"><span>Cara ambil</span><b class="biasa">${ambil}</b></div>`}
      ${ojol && s.status !== 'batal' && s.status !== 'selesai' && html`<p class="bantu">Jangan lupa pesan Gojek / Grab sendiri ke ${s.alamatToko || 'alamat toko'} sesuai jam di atas. Toko tidak memesankan ojek.</p>`}
    </section>
    ${s.bisaTestimoni && html`<${FormTestimoni} url=${url} token=${token} idPesanan=${idPesanan} nama=${s.nama} />`}
  </div>`;
}

/** Satu baris daftar pesanan: nomor + isi pesanan (kiri), status + panah (kanan). Ditekan = buka detail. */
function BarisPesananSaya({ url, token, idPesanan, terbuka, onBalik, onHilang }) {
  const [s, setS, galat] = useStatusPesanan(url, token, idPesanan, terbuka);
  useEffect(() => {
    if (galat === 'Pesanan tidak ditemukan.') onHilang(idPesanan);
  }, [galat]);
  if (galat === 'Pesanan tidak ditemukan.') return null;
  const [label, kelas] = s ? labelStatus(s) : ['Memeriksa…', 'tunggu'];
  const ringkas = s ? (s.item || []).map((i) => `${i.jumlah}× ${namaItem(i)}`).join(', ') : '';
  const idPanel = 'pesanan-' + idPesanan;
  return html`<article class=${'et-pesanan-saya' + (terbuka ? ' terbuka' : '')}>
    <button type="button" class="et-pesanan-kepala" aria-expanded=${terbuka} aria-controls=${idPanel} onClick=${onBalik}>
      <span class="et-pesanan-kiri">
        <b>${s ? '#' + s.nomor : 'Pesanan'}</b>
        <small>${galat ? 'Belum bisa dimuat. Ketuk untuk coba lagi.' : ringkas || 'Memuat…'}</small>
      </span>
      <span class="et-pesanan-kanan">
        <span class=${'et-status-pil ' + kelas}>${label}</span>
        <span class="et-panah" aria-hidden="true"><${Ikon} nama="bawah" ukuran=${20} /></span>
      </span>
    </button>
    ${terbuka && html`<div id=${idPanel}>${s ? html`<${DetailPesananSaya} s=${s} setS=${setS} url=${url} token=${token} idPesanan=${idPesanan} />` : html`<p class="bantu et-pesanan-detail" role="status">${galat || 'Memeriksa pesanan…'}</p>`}</div>`}
  </article>`;
}

/** Semua pesanan yang dibuat dari perangkat ini, terbaru di atas. `buka` = id yang langsung dibuka (setelah memesan / membayar). */
function DaftarPesananSaya({ url, token, ids, buka, info, keMenu, onHilang }) {
  const [terbuka, setTerbuka] = useState(buka || '');
  return html`<div class="kolom" style="gap:16px">
    <h1 class="et-judul-layar">Pesanan saya</h1>
    ${ids.length === 0
      ? html`<${Kosong} judul="Belum ada pesanan" teks="Pesanan yang Anda buat dari perangkat ini muncul di sini."><button type="button" class="et-tombol" onClick=${() => keMenu('')}>Lihat menu</button><//>`
      : html`<div class="et-daftar-pesanan">
          ${ids.map((id) => html`<${BarisPesananSaya} key=${id} url=${url} token=${token} idPesanan=${id} terbuka=${terbuka === id} onBalik=${() => setTerbuka((t) => (t === id ? '' : id))} onHilang=${onHilang} />`)}
        </div>`}
    ${ids.length > 0 && html`<button type="button" class="et-tombol garis" onClick=${() => keMenu('')}>Buat pesanan lain</button>`}
    <${Testimoni} daftar=${info && info.testimoni} />
  </div>`;
}

// ---------- Halaman utama etalase ----------

export function PesanOnline({ k, token }) {
  const url = alamatServer(k);
  const q = k.rute.kueri;
  const [info, setInfo] = useState(() => {
    const simpan = baca(kunciInfo(token), null);
    return simpan && simpan.ok && Array.isArray(simpan.menu) ? simpan : null;
  });
  const [galat, setGalat] = useState('');
  // Keranjang: {kunci: {idMenu, opsi, jumlah}}. Format lama {idMenu: jumlah} ikut dibaca.
  const [jumlah, setJumlah] = useState(() => {
    const lama = baca(kunciKeranjang(token), {}) || {};
    return Object.fromEntries(Object.entries(lama).map(([kunci, v]) => [kunci, typeof v === 'number' ? { idMenu: kunci, opsi: [], jumlah: v } : v]));
  });
  const [disambut, setDisambut] = useState(() => sudahDisambut(token));
  // Pesanan dari perangkat ini; ?pesanan= (kembali dari Mayar) / ?id= (baru dipesan) ikut diingat dan langsung dibuka.
  const idBuka = q.pesanan || q.id || '';
  const [idsPesanan, setIdsPesanan] = useState(() => {
    if (idBuka) ingatPesanan(token, idBuka);
    return pesananSaya(token);
  });
  const hilangkanPesanan = (id) => {
    lupakanPesanan(token, id);
    setIdsPesanan(pesananSaya(token));
  };

  useEffect(() => {
    if (!url) return setGalat('Link ini tidak lengkap. Minta toko mengirim ulang link pemesanannya.');
    pesanOnline
      .info(url, token)
      .then((j) => {
        setInfo(j);
        setGalat('');
        tulis(kunciInfo(token), j);
      })
      // Bila server sedang lambat/gagal tapi ada data terakhir, tetap pakai itu.
      .catch((e) => !baca(kunciInfo(token), null) && setGalat(e.message || 'Link tidak bisa dibuka.'));
  }, [token, url]);
  useEffect(() => tulis(kunciKeranjang(token), jumlah), [jumlah]);

  const namaToko = (info && info.namaToko) || ambilMerek(k.db).nama;
  const logo = (info && info.logoUrl) || LOGO_BAWAAN;
  useEffect(() => terapkanMerekDokumen({ nama: namaToko, logo }), [namaToko, logo]);

  const menu = (info && info.menu) || [];
  // Buang isi keranjang yang sudah tidak ada di menu.
  // Baris yang masih berlaku: menunya masih dijual, pilihannya masih ada; harga = harga menu + pilihan.
  const baris = [];
  for (const [kunci, b] of Object.entries(jumlah)) {
    const m = b && b.jumlah > 0 && menu.find((x) => x.id === b.idMenu);
    if (!m) continue;
    const opsi = (m.opsi || []).filter((o) => (b.opsi || []).includes(o.nama));
    baris.push({ kunci, m, opsi: opsi.map((o) => o.nama), jumlah: b.jumlah, harga: m.harga + opsi.reduce((j, o) => j + o.harga, 0) });
  }
  const perMenu = (idMenu) => baris.filter((b) => b.m.id === idMenu).reduce((j, b) => j + b.jumlah, 0);
  const isi = Object.fromEntries(baris.filter((b) => b.kunci === b.m.id).map((b) => [b.m.id, b.jumlah]));
  const jumlahKeranjang = baris.reduce((a, b) => a + b.jumlah, 0);
  const totalKeranjang = baris.reduce((a, b) => a + b.harga * b.jumlah, 0);
  const batas = (m, kunci) => (m.sisa === null ? 100 : Math.min(100, m.sisa)) - (perMenu(m.id) - ((jumlah[kunci] || {}).jumlah || 0));
  const aturBaris = (kunci, n) => {
    const b = jumlah[kunci];
    const m = b && menu.find((x) => x.id === b.idMenu);
    if (!m) return;
    setJumlah((j) => ({ ...j, [kunci]: { ...b, jumlah: Math.max(0, Math.min(batas(m, kunci), n)) } }));
  };
  const atur = (m, n) => {
    const kunci = kunciBaris(m.id);
    setJumlah((j) => ({ ...j, [kunci]: { idMenu: m.id, opsi: [], jumlah: Math.max(0, Math.min(batas(m, kunci), n)) } }));
  };
  const tambah = (m, opsi, n) => {
    const kunci = kunciBaris(m.id, opsi);
    const ada = (jumlah[kunci] || {}).jumlah || 0;
    setJumlah((j) => ({ ...j, [kunci]: { idMenu: m.id, opsi, jumlah: Math.max(0, Math.min(batas(m, kunci), ada + n)) } }));
  };

  // ?pesanan= dari Mayar (setelah membayar) juga membuka layar pesanan.
  const layar = q.pesanan ? 'pesanan' : q.l || '';
  const ke = (l, extra) => keLayar(k, token, l, extra);
  const keMenu = (kat) => ke('menu', { kat });
  const buka = (m) => ke('produk', { id: m.id });
  const produk = layar === 'produk' ? menu.find((m) => m.id === q.id) : null;

  let isiLayar;
  if (galat) isiLayar = html`<${Kosong} judul="Link tidak bisa dibuka" teks=${galat} />`;
  else if (layar === 'pesanan') {
    const ids = idBuka && !idsPesanan.includes(idBuka) ? [idBuka, ...idsPesanan] : idsPesanan;
    isiLayar = html`<${DaftarPesananSaya} key=${'daftar' + idBuka} url=${url} token=${token} ids=${ids} buka=${idBuka} info=${info} keMenu=${keMenu} onHilang=${hilangkanPesanan} />`;
  } else if (!info) isiLayar = html`<div class="et-kerangka" role="status" aria-label="Membuka toko"><i class="b1"></i><i class="b2"></i><i class="b3"></i><i class="b3"></i><i class="b3"></i><i class="b3"></i></div>`;
  else if (layar === 'menu') isiLayar = html`<${DaftarMenu} key=${'m' + (q.cari || '')} info=${info} jumlah=${isi} atur=${atur} buka=${buka} kat=${q.kat || ''} keMenu=${keMenu} cariAwal=${q.cari || ''} />`;
  else if (layar === 'produk') {
    isiLayar = produk
      ? html`<${DetailProduk} key=${produk.id} info=${info} m=${produk} diKeranjang=${perMenu(produk.id)} tambah=${tambah} kembali=${() => history.back()} keKeranjang=${() => ke('keranjang')} />`
      : html`<${Kosong} judul="Menu tidak ditemukan" teks="Mungkin sudah tidak dijual."><button type="button" class="et-tombol" onClick=${() => keMenu('')}>Lihat menu</button><//>`;
  } else if (layar === 'keranjang') {
    isiLayar = html`<${Keranjang} k=${k} info=${info} url=${url} token=${token} baris=${baris} aturBaris=${aturBaris} kosongkan=${() => (tulis(kunciKeranjang(token), {}), setJumlah({}))} keMenu=${keMenu} selesai=${(id) => (setIdsPesanan(pesananSaya(token)), ke('pesanan', { id }))} />`;
  } else isiLayar = html`<${Beranda} info=${{ ...info, token }} jumlah=${isi} atur=${atur} buka=${buka} keMenu=${keMenu} ke=${ke} logo=${logo} jumlahKeranjang=${jumlahKeranjang} cariMenu=${(c) => ke('menu', { cari: c })} />`;

  // Sambutan sekali per kunjungan, hanya saat membuka beranda etalase.
  const mulai = () => {
    try {
      sessionStorage.setItem(kunciSambut(token), '1');
    } catch {
      /* tetap lanjut */
    }
    setDisambut(true);
  };
  if (info && !disambut && !galat && !layar) return html`<${Sambutan} info=${info} logo=${logo} onMulai=${mulai} />`;

  const NAV = [
    { l: '', label: 'Beranda', ikon: 'rumah' },
    { l: 'menu', label: 'Menu', ikon: 'kue' },
    { l: 'keranjang', label: 'Keranjang', ikon: 'keranjang', lencana: jumlahKeranjang },
    { l: 'pesanan', label: 'Pesanan', ikon: 'struk' },
  ];
  const aktif = layar === 'produk' ? 'menu' : layar;

  return html`<div class="etalase">
    ${layar !== 'produk' && (layar || !info || galat) &&
    html`<header class="et-kepala">
      <button type="button" class="et-merek" onClick=${() => ke('')}><${LogoMerek} src=${logo} ukuran=${36} /><span>${namaToko}</span></button>
      <button type="button" class="et-ikon-keranjang" aria-label=${`Keranjang (${jumlahKeranjang})`} onClick=${() => ke('keranjang')}>
        <${Ikon} nama="keranjang" ukuran=${22} />${jumlahKeranjang > 0 && html`<i>${jumlahKeranjang}</i>`}
      </button>
    </header>`}
    <main class=${'et-isi' + (layar === 'produk' ? ' penuh' : '') + (!layar && info && !galat ? ' beranda' : '')}>${isiLayar}</main>
    ${jumlahKeranjang > 0 && layar !== 'keranjang' && layar !== 'pesanan' && layar !== 'produk' &&
    html`<button type="button" class="et-bar-keranjang" onClick=${() => ke('keranjang')}>
      <span>${jumlahKeranjang} item · ${rupiah(totalKeranjang)}</span><b>Buka keranjang</b>
    </button>`}
    <nav class="et-nav" aria-label="Navigasi toko">
      ${NAV.map(
        (n) => html`<button type="button" class=${aktif === n.l ? 'aktif' : ''} aria-current=${aktif === n.l ? 'page' : null} onClick=${() => ke(n.l)}>
          <span class="et-nav-ikon"><${Ikon} nama=${n.ikon} ukuran=${22} />${n.lencana > 0 && html`<i>${n.lencana}</i>`}</span>${n.label}
        </button>`,
      )}
    </nav>
  </div>`;
}

/** Halaman bayar tiruan untuk server uji (pengganti halaman Mayar). */
export function TiruanMayar({ k, id }) {
  // Server uji menyajikan aplikasi dan /api di alamat yang sama.
  const url = alamatServer(k) || location.origin + '/api';
  const [hasil, setHasil] = useState(null);
  const [galat, setGalat] = useState('');
  const bayar = async () => {
    try {
      setHasil(await panggilApi(url, { aksi: 'tiruanLunas', idMayar: id }));
    } catch (e) {
      setGalat(e.message);
    }
  };
  return html`<div class="penilai"><div class="isi">
    <${Kosong} judul="Mayar (tiruan)" teks=${hasil ? `Pembayaran ${rupiah(hasil.jumlah)} berhasil.` : 'Halaman ini hanya ada di server uji, menggantikan halaman pembayaran Mayar.'}>
      ${!hasil && html`<button class="btn solid" onClick=${bayar}>Bayar (tiruan)</button>`}
      ${hasil && html`<button class="btn" onClick=${() => history.back()}>Kembali</button>`}
      ${galat && html`<p class="galat-teks">${galat}</p>`}
    <//>
  </div></div>`;
}
