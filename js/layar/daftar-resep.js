// Daftar resep dalam bentuk grid, dengan tab kategori dan pencarian.
// Dengan ?tujuan=hpp atau ?tujuan=marketing layar ini menjadi pemilih resep.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Foto, Kosong, Stat } from '../ui/komponen.js';
import { IkonKategori, IKON_UMUM } from '../ui/ikon-kategori.js';
import { Ikon } from '../ui/ikon.js';
import { tautan, q } from '../ui/router.js';
import { daftarKategori, ringkasResep } from '../lib/repo.js';
import { desimal1 } from '../lib/util.js';

const TUJUAN = {
  hpp: { judul: 'HPP & Harga', label: 'Pilih resep', warna: 'var(--navy)' },
  marketing: { judul: 'Marketing', label: 'Pilih resep', warna: 'var(--kuning-tua)' },
};

export function DaftarResep({ k }) {
  const { db, rute } = k;
  const [cari, setCari] = useState('');
  const tujuan = TUJUAN[rute.kueri.tujuan] ? rute.kueri.tujuan : '';
  const info = TUJUAN[tujuan];
  const kat = rute.kueri.kat || '';
  const kategori = daftarKategori(db);

  const semua = db
    .semua('Resep')
    .map((r) => ringkasResep(db, r))
    .sort((a, b) => (b.resep.dibuat || 0) - (a.resep.dibuat || 0));
  const cocok = semua.filter((r) => (!kat || r.resep.idKategori === kat) && r.resep.nama.toLowerCase().includes(cari.trim().toLowerCase()));

  const href = (idKat) => {
    const p = [];
    if (tujuan) p.push('tujuan=' + tujuan);
    if (idKat) p.push('kat=' + q(idKat));
    return '/resep' + (p.length ? '?' + p.join('&') : '');
  };
  const hitung = (idKat) => semua.filter((r) => !idKat || r.resep.idKategori === idKat).length;
  const pilihan = [{ id: '', nama: 'Semua', kunci: IKON_UMUM }, ...kategori];

  return html`<${Kerangka} k=${k} aktif="resep" plus=${tujuan ? null : { href: '/resep/baru', label: 'Resep baru' }}>
    <${Hero}
      warna=${info ? info.warna : 'var(--tomat)'}
      label=${info ? info.label : 'Daftar resep'}
      judul=${info ? info.judul : 'Resep'}
      kembali="/"
      stat=${html`<${Stat} nilai=${semua.length} label="resep" />`}
    />
    <nav class="kategori-bulat" aria-label="Kategori">
      ${pilihan.map(
        (c) => html`<a key=${c.id || 'semua'} href=${tautan(href(c.id))} class=${(c.id ? kat === c.id : !kat) ? 'aktif' : ''} aria-current=${(c.id ? kat === c.id : !kat) ? 'page' : null}>
          <span class="kategori-gambar" style=${c.warna ? `--warna:${c.warna}` : ''}><${IkonKategori} nama=${c.nama} kunci=${c.kunci} ukuran=${40} /></span>
          <span class="kategori-nama">${c.nama}</span>
          <small>${hitung(c.id)}</small>
        </a>`,
      )}
    </nav>
    ${tujuan === 'hpp' &&
    html`<div style="padding:12px 20px 0">
      <a class="pil navy" href=${tautan('/paket')}>Hitung HPP paket (beberapa resep, satu kemasan)<span class="ujung"><${Ikon} nama="kalkulator" /></span></a>
    </div>`}
    <div style="padding:12px 20px 0">
      <input class="input" type="search" placeholder="Cari nama resep…" aria-label="Cari resep" value=${cari} onInput=${(e) => setCari(e.target.value)} />
    </div>
    ${cocok.length > 0
      ? html`<div class="grid-resep">
          ${cocok.map((r) => {
            const warna = r.kategori ? r.kategori.warna : 'var(--tomat)';
            const tujuanHref = tujuan ? `/resep/${r.resep.id}/${tujuan}` : `/resep/${r.resep.id}`;
            return html`<a class="kartu-resep" key=${r.resep.id} href=${tautan(tujuanHref)} style=${`--warna:${warna}`}>
              <span class="foto"><${Foto} src=${r.foto} ikon="resep" ukuranIkon=${32} /></span>
              <span class="kat"><${IkonKategori} nama=${r.kategori ? r.kategori.nama : ''} ukuran=${18} />${r.kategori ? r.kategori.nama : 'Tanpa kategori'}</span>
              <span class="nama">${r.resep.nama}</span>
              <span class="meta">${r.eksperimen.length} eksperimen</span>
              <span class="skor-baris">
                ${r.juara ? html`<span class="lencana-juara" title="Sudah ada juara"><img src="gambar/menu/piala.svg" alt="" width="20" height="20" /></span>` : null}
                <span class=${'angka-skor' + (r.juara ? ' juara' : '')}>${Number.isFinite(r.skor) ? desimal1(r.skor) : '–'}</span>
              </span>
            </a>`;
          })}
          ${!tujuan &&
          html`<a class="kartu-resep tambah" href=${tautan('/resep/baru')}>
            <${Ikon} nama="plus" ukuran=${32} />
            Resep baru
          </a>`}
        </div>`
      : html`<div style="padding:16px 20px">
          ${semua.length === 0
            ? html`<${Kosong} judul="Belum ada resep" teks="Buat resep pertama Anda, lalu catat eksperimen demi eksperimen.">
                <a class="btn solid" href=${tautan('/resep/baru')}>Buat resep</a>
              <//>`
            : html`<${Kosong} judul="Tidak ada yang cocok" teks="Coba kata kunci lain atau pilih kategori Semua." />`}
        </div>`}
    <div style="height:16px"></div>
  <//>`;
}
