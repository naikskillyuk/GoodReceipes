// Banner & header (akun admin): foto header etalase dan kasir, serta banner informasi yang tampil di etalase / kasir.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Stat, Kosong, FotoInput, LogoMerek } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { Modal, tanya, tampilToast } from '../ui/pesan.js';
import { kompres } from '../ui/gambar.js';
import { KartuBanner } from '../ui/banner.js';
import { ambilMerek } from '../lib/repo.js';
import {
  daftarBanner, simpanBanner, geserBanner, fotoHeader, simpanFotoHeader, WARNA_BANNER, AKSI_BANNER, daftarPromo, ambilToko,
} from '../lib/toko.js';

const kompresHeader = (file) => kompres(file, 1600, 0.82);
const kompresBanner = (file) => kompres(file, 900, 0.85);
const TAMPIL = { etalase: 'Etalase pembeli', kasir: 'Kasir', semua: 'Etalase & kasir' };
const fotoBanner = (b) => b.fotoLokal || b.fotoUrl || '';

/** Pratinjau header etalase seperti yang dilihat pembeli. */
function PratinjauHeader({ db, foto }) {
  const merek = ambilMerek(db);
  const nama = ambilToko(db).namaToko || merek.nama;
  return html`<div class="pratinjau-header">
    ${foto ? html`<img src=${foto} alt="" aria-hidden="true" />` : html`<span class="ph-kosong">Belum ada foto header</span>`}
    <div class="ph-isi">
      <small>Halo, selamat datang di</small>
      <b>${nama}</b>
    </div>
    <div class="ph-cari"><${Ikon} nama="cari" ukuran=${16} />Cari kue, camilan…</div>
  </div>`;
}

function KartuHeader({ db, untuk, judul, bantu }) {
  const sekarang = fotoHeader(db, untuk);
  const [foto, setFoto] = useState('');
  const tampil = foto || sekarang;
  const simpan = (isi) => {
    simpanFotoHeader(db, untuk, isi);
    setFoto('');
    tampilToast(isi ? `${judul} disimpan.` : `${judul} dihapus.`);
  };
  return html`<section class="kartu kolom" aria-label=${judul}>
    <h2 class="judul-kecil">${judul}</h2>
    <p class="bantu">${bantu}</p>
    ${untuk === 'etalase' ? html`<${PratinjauHeader} db=${db} foto=${tampil} />` : tampil && html`<img class="pratinjau-login pl-latar" src=${tampil} alt=${'Pratinjau ' + judul.toLowerCase()} />`}
    <${FotoInput} nilai=${foto} onUbah=${setFoto} judul=${sekarang ? 'Ganti foto' : 'Pilih foto'} bantu="Foto mendatar (landscape) paling bagus." aksen="var(--hijau)" ikon="gambar" kompresFn=${kompresHeader} />
    <div class="baris-btn">
      ${foto && html`<button class="btn solid" onClick=${() => simpan(foto)}>Simpan ${judul.toLowerCase()}</button>`}
      ${foto && html`<button class="btn abu" onClick=${() => setFoto('')}>Batal</button>`}
      ${!foto && sekarang && html`<button class="btn" onClick=${() => simpan('')}>Hapus foto</button>`}
    </div>
  </section>`;
}

function FormBanner({ db, awal, onTutup }) {
  const [d, setD] = useState(() => ({
    judul: '', teks: '', warna: 'hijau', tombol: '', aksi: '', nilai: '', tampilDi: 'etalase', aktif: true,
    ...(awal || {}),
    foto: awal ? fotoBanner(awal) : '',
  }));
  const [galat, setGalat] = useState('');
  const atur = (patch) => (setGalat(''), setD((x) => ({ ...x, ...patch })));
  const promo = daftarPromo(db).filter((p) => p.promo.aktif).map((p) => p.promo.kode);
  const kategori = [...new Set(db.semua('Kategori').map((k) => k.nama)), 'Paket'];
  const simpan = () => {
    try {
      if (d.aksi && !d.tombol.trim()) return setGalat('Isi tulisan tombol, atau pilih "Tanpa tombol".');
      if (['kategori', 'promo', 'link'].includes(d.aksi) && !String(d.nilai || '').trim()) return setGalat('Lengkapi tujuan tombol.');
      simpanBanner(db, { ...d, id: awal && awal.id });
      tampilToast(awal ? 'Banner disimpan.' : 'Banner ditambahkan.');
      onTutup();
    } catch (e) {
      setGalat(e.message);
    }
  };
  return html`<${Modal} judul=${awal ? 'Ubah banner' : 'Banner baru'} onTutup=${onTutup}>
    <div class="kolom" style="gap:12px">
      <${KartuBanner} b=${d} foto=${d.foto} />
      <label class="bidang"><span>Judul</span><input class="input" maxlength="60" value=${d.judul} onInput=${(e) => atur({ judul: e.target.value })} placeholder="mis. Pre-order Lebaran dibuka" /></label>
      <label class="bidang"><span>Teks</span><input class="input" maxlength="160" value=${d.teks} onInput=${(e) => atur({ teks: e.target.value })} placeholder="mis. Pesan kue kering sebelum 20 Maret" /></label>
      <div class="bidang"><span>Gambar (kanan, opsional)</span>
        <${FotoInput} nilai=${d.foto} onUbah=${(f) => atur({ foto: f })} judul=${d.foto ? 'Ganti gambar' : 'Pilih gambar'} bantu="PNG / foto produk; tampil di sisi kanan banner." aksen="var(--hijau)" ikon="gambar" kompresFn=${kompresBanner} />
        ${d.foto && html`<button type="button" class="btn kecil" style="align-self:flex-start" onClick=${() => atur({ foto: '' })}>Hapus gambar</button>`}
      </div>
      <div class="bidang"><span>Warna</span>
        <div class="chips" role="group" aria-label="Warna banner">
          ${Object.entries(WARNA_BANNER).map(([k, w]) => html`<button type="button" class=${'chip chip-warna' + (d.warna === k ? ' aktif' : '')} aria-pressed=${d.warna === k} style=${`--warna-chip:${w.latar};--tinta-chip:${w.tinta}`} onClick=${() => atur({ warna: k })}>${k}</button>`)}
        </div>
      </div>
      <div class="dua-kolom">
        <label class="bidang"><span>Tombol</span>
          <select class="pilih" aria-label="Aksi tombol" value=${d.aksi} onChange=${(e) => atur({ aksi: e.target.value, nilai: '', tombol: d.tombol || (e.target.value ? { menu: 'Lihat menu', kategori: 'Lihat', promo: 'Pakai kode', wa: 'Chat kami', link: 'Buka' }[e.target.value] : '') })}>
            ${Object.entries(AKSI_BANNER).map(([k, l]) => html`<option value=${k} selected=${d.aksi === k}>${l}</option>`)}
          </select>
        </label>
        ${d.aksi && html`<label class="bidang"><span>Tulisan tombol</span><input class="input" maxlength="30" aria-label="Tulisan tombol" value=${d.tombol} onInput=${(e) => atur({ tombol: e.target.value })} /></label>`}
      </div>
      ${d.aksi === 'kategori' &&
      html`<label class="bidang"><span>Kategori</span><select class="pilih" aria-label="Kategori tujuan" value=${d.nilai} onChange=${(e) => atur({ nilai: e.target.value })}>
        <option value="">Pilih kategori…</option>${kategori.map((k) => html`<option value=${k} selected=${d.nilai === k}>${k}</option>`)}
      </select></label>`}
      ${d.aksi === 'promo' &&
      html`<label class="bidang"><span>Kode promo</span><select class="pilih" aria-label="Kode promo tujuan" value=${d.nilai} onChange=${(e) => atur({ nilai: e.target.value })}>
        <option value="">${promo.length ? 'Pilih kode…' : 'Belum ada kode promo aktif'}</option>${promo.map((k) => html`<option value=${k} selected=${d.nilai === k}>${k}</option>`)}
      </select></label>`}
      ${d.aksi === 'link' && html`<label class="bidang"><span>Alamat link</span><input class="input" inputmode="url" maxlength="300" aria-label="Alamat link" value=${d.nilai} onInput=${(e) => atur({ nilai: e.target.value })} placeholder="https://instagram.com/…" /></label>`}
      <div class="bidang"><span>Tampil di</span>
        <div class="chips" role="group" aria-label="Tampil di">
          ${Object.entries(TAMPIL).map(([k, l]) => html`<button type="button" class=${'chip' + (d.tampilDi === k ? ' aktif' : '')} aria-pressed=${d.tampilDi === k} onClick=${() => atur({ tampilDi: k })}>${l}</button>`)}
        </div>
      </div>
      <label class="saklar"><input type="checkbox" checked=${!!d.aktif} onChange=${(e) => atur({ aktif: e.target.checked })} /><span>Tampilkan banner ini</span></label>
      ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
      <div class="baris-btn">
        <button class="btn solid" onClick=${simpan}><${Ikon} nama="centang" ukuran=${18} />Simpan banner</button>
        <button class="btn abu" onClick=${onTutup}>Batal</button>
      </div>
    </div>
  <//>`;
}

export function BannerHeader({ k }) {
  const { db } = k;
  const daftar = daftarBanner(db);
  const [form, setForm] = useState(null); // null | 'baru' | banner
  const hapus = async (b) => {
    if (await tanya({ judul: `Hapus banner “${b.judul}”?`, ya: 'Hapus', bahaya: true })) db.hapus('Banner', b.id);
  };
  return html`<${Kerangka} k=${k} aktif="banner">
    <${Hero} warna="var(--kuning)" label="Tampilan" judul="Banner & header" kembali="/" stat=${html`<${Stat} nilai=${daftar.filter((b) => b.aktif).length} label="banner aktif" />`}>
      <p class="hero-sub">Foto header di beranda pembeli dan kasir, serta banner informasi (promo, pengumuman, pre-order) yang bisa ditekan.</p>
    <//>
    <div class="isi">
      <div class="kolom-2">
        <div class="kolom">
          <${KartuHeader} db=${db} untuk="etalase" judul="Foto header etalase" bantu="Tampil besar di atas beranda pembeli, dengan sapaan, nama toko, dan kolom cari." />
          <${KartuHeader} db=${db} untuk="kasir" judul="Foto header kasir" bantu="Tampil di atas katalog kasir." />
        </div>
        <div class="kolom">
          <section class="kartu kolom" aria-labelledby="h-banner">
            <div class="baris-pisah"><h2 class="judul-kecil" id="h-banner">Banner informasi</h2><button class="btn solid kecil" onClick=${() => setForm('baru')}><${Ikon} nama="plus" ukuran=${16} />Tambah banner</button></div>
            <p class="bantu">Tampil bergeser di etalase dan/atau kasir, sebelum banner promo otomatis. Urutan bisa diatur.</p>
            ${daftar.length === 0 && html`<${Kosong} judul="Belum ada banner" teks="Mis. pre-order hari raya, jam buka, atau ajakan follow Instagram." />`}
            ${daftar.map(
              (b, i) => html`<div class=${'baris-banner' + (b.aktif ? '' : ' mati')} key=${b.id}>
                <${KartuBanner} b=${b} foto=${fotoBanner(b)} kecil />
                <div class="baris-pisah">
                  <small class="teks-kecil">${TAMPIL[b.tampilDi] || TAMPIL.etalase}${b.aktif ? '' : ' · disembunyikan'}${b.aksi ? ' · ' + AKSI_BANNER[b.aksi] + (b.nilai ? ': ' + b.nilai : '') : ''}</small>
                  <span class="baris-aksi">
                    <button class="ikon-btn kecil" aria-label=${'Naikkan ' + b.judul} disabled=${i === 0} onClick=${() => geserBanner(db, b.id, -1)}><span style="display:inline-flex;transform:rotate(180deg)"><${Ikon} nama="bawah" ukuran=${16} /></span></button>
                    <button class="ikon-btn kecil" aria-label=${'Turunkan ' + b.judul} disabled=${i === daftar.length - 1} onClick=${() => geserBanner(db, b.id, 1)}><${Ikon} nama="bawah" ukuran=${16} /></button>
                    <button class="btn kecil" onClick=${() => db.simpan('Banner', { ...b, aktif: !b.aktif })}>${b.aktif ? 'Sembunyikan' : 'Tampilkan'}</button>
                    <button class="btn kecil" aria-label=${'Ubah banner ' + b.judul} onClick=${() => setForm(b)}>Ubah</button>
                    <button class="ikon-btn kecil" aria-label=${'Hapus banner ' + b.judul} onClick=${() => hapus(b)}><${Ikon} nama="sampah" ukuran=${16} /></button>
                  </span>
                </div>
              </div>`,
            )}
          </section>
        </div>
      </div>
    </div>
    ${form && html`<${FormBanner} key=${form === 'baru' ? 'baru' : form.id} db=${db} awal=${form === 'baru' ? null : form} onTutup=${() => setForm(null)} />`}
  <//>`;
}
