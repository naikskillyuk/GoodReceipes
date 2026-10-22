// Marketing: ide konten dan ide pemasaran per resep, dengan status dan rencana pekan ini.

import { html, useState } from '../../vendor/preact-htm.js';
import { Ikon } from '../ui/ikon.js';

const STATUS = ['ide', 'dijadwalkan', 'selesai'];
const LABEL_STATUS = { ide: 'Ide', dijadwalkan: 'Dijadwalkan', selesai: 'Selesai' };

const JENIS = [
  { kunci: 'konten', judul: 'Ide konten', petunjuk: 'Apa yang akan diposting?' },
  { kunci: 'pemasaran', judul: 'Ide pemasaran', petunjuk: 'Bagaimana produk ini sampai ke pembeli?' },
];

const TEMPLAT = (nama, n) => ({
  konten: [
    [`Reels: proses membuat ${nama}`, 'Video singkat dari bahan sampai jadi, paling mudah ditonton sampai habis.'],
    [`Foto close-up ${nama} dekat jendela`, 'Cahaya alami membuat tekstur terlihat jelas.'],
    [`Story polling: pilih varian ${nama}`, 'Murah, cepat, dan memancing interaksi.'],
    [`Carousel: ${n || 'beberapa'} eksperimen sampai resep juara`, 'Cerita proses membangun kepercayaan pembeli.'],
  ],
  pemasaran: [
    ['Tes pasar: 10 porsi ke teman dan komunitas', 'Dapat ulasan dan harga yang diterima sebelum produksi besar.'],
    ['Pre-order batch pertama', 'Produksi sesuai pesanan, risiko bahan terbuang kecil.'],
    ['Paket bundling atau hampers akhir pekan', 'Menaikkan nilai per pesanan.'],
    ['Titip jual di kafe atau warung terdekat', 'Menjangkau pembeli tanpa biaya iklan.'],
  ],
});

function Ide({ ide, db }) {
  const berikut = STATUS[(STATUS.indexOf(ide.status) + 1) % STATUS.length];
  return html`<div class=${'ide' + (ide.status === 'selesai' ? ' selesai' : '')}>
    <div class="baris-pisah" style="align-items:flex-start">
      <b>${ide.judul}</b>
      <button class="ikon-btn kecil" aria-label=${'Hapus ide ' + ide.judul} onClick=${() => db.hapus('Marketing', ide.id)}><${Ikon} nama="sampah" ukuran=${18} /></button>
    </div>
    ${ide.alasan && html`<p>${ide.alasan}</p>`}
    <div>
      <button class=${'status ' + ide.status} onClick=${() => db.simpan('Marketing', { ...ide, status: berikut })} title=${'Ubah menjadi ' + LABEL_STATUS[berikut]}>
        ${LABEL_STATUS[ide.status] || 'Ide'}
      </button>
    </div>
  </div>`;
}

function Bagian({ k, resep, jenis, daftar }) {
  const { db } = k;
  const [teks, setTeks] = useState('');
  const jumlahEks = db.semua('Eksperimen', (e) => e.idResep === resep.id).length;
  const saran = TEMPLAT(resep.nama, jumlahEks)[jenis.kunci].filter(([judul]) => !daftar.some((d) => d.judul === judul));
  const tambah = (judul, alasan = '') => {
    const bersih = judul.trim();
    if (!bersih) return;
    db.simpan('Marketing', { idResep: resep.id, jenis: jenis.kunci, judul: bersih, alasan, status: 'ide', dibuat: Date.now() });
    setTeks('');
  };
  return html`<section class="kolom" aria-label=${jenis.judul}>
    <h2 class="judul-kecil">${jenis.judul}</h2>
    ${daftar.map((ide) => html`<${Ide} key=${ide.id} ide=${ide} db=${db} />`)}
    <form class="cari-baris" onSubmit=${(e) => (e.preventDefault(), tambah(teks))}>
      <input class="input" placeholder=${jenis.petunjuk} aria-label=${'Tambah ' + jenis.judul.toLowerCase()} maxlength="140" value=${teks} onInput=${(e) => setTeks(e.target.value)} />
      <button class="btn solid" type="submit" disabled=${!teks.trim()}>Tambah</button>
    </form>
    ${saran.length > 0 &&
    html`<div>
      <div class="teks-kecil" style="margin-bottom:6px">Saran cepat</div>
      <div class="chips">
        ${saran.map(([judul, alasan]) => html`<button type="button" class="chip putus" style="min-height:40px;padding:0 14px;text-align:left" onClick=${() => tambah(judul, alasan)}><${Ikon} nama="plus" ukuran=${16} />${judul}</button>`)}
      </div>
    </div>`}
  </section>`;
}

export function PanelMarketing({ k, resep }) {
  const { db } = k;
  const semua = db.semua('Marketing', (m) => m.idResep === resep.id).sort((a, b) => (a.dibuat || 0) - (b.dibuat || 0));
  const rencana = semua.filter((m) => m.status === 'dijadwalkan');
  return html`<div class="isi">
    <div class="kartu sorot">
      <div class="label-kecil" style="margin-bottom:6px">Rencana pekan ini</div>
      ${rencana.length === 0
        ? html`<p style="font-size:14px;line-height:1.5">Belum ada yang dijadwalkan. Ketuk status sebuah ide sampai menjadi “Dijadwalkan”, dan ide itu muncul di sini.</p>`
        : rencana.map(
            (m) => html`<label class="centang-baris" key=${m.id}>
              <input type="checkbox" onChange=${() => db.simpan('Marketing', { ...m, status: 'selesai' })} />
              <span>${m.judul}</span>
            </label>`,
          )}
    </div>
    <div class="kolom-2">
      ${JENIS.map((j) => html`<${Bagian} key=${j.kunci} k=${k} resep=${resep} jenis=${j} daftar=${semua.filter((m) => m.jenis === j.kunci)} />`)}
    </div>
  </div>`;
}
