// Beranda: sapaan, resep juara dengan foto besar, lalu menu ubin.

import { html } from '../../vendor/preact-htm.js';
import { Kerangka, Foto, Kosong, LogoMerek } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tautan, pergi } from '../ui/router.js';
import { daftarJuara, ambilMerek } from '../lib/repo.js';
import { desimal1 } from '../lib/util.js';

function sapaan() {
  const j = new Date().getHours();
  if (j < 11) return 'Selamat pagi';
  if (j < 15) return 'Selamat siang';
  if (j < 18) return 'Selamat sore';
  return 'Selamat malam';
}

export function Beranda({ k }) {
  const { db } = k;
  const juara = daftarJuara(db);
  const jumlahResep = db.semua('Resep').length;
  const jumlahBahan = db.semua('Bahan').length;
  const jumlahUlasan = db.semua('Penilaian').length;
  const nama = (db.pengaturan.namaPemilik || '').trim();
  const merek = ambilMerek(db);

  const menu = [
    { href: '/resep', label: 'Daftar resep', ikon: 'resep', lencana: jumlahResep },
    { href: '/bahan', label: 'Daftar bahan', ikon: 'keranjang', lencana: jumlahBahan },
    { href: '/resep?tujuan=hpp', label: 'HPP & harga', ikon: 'kalkulator' },
    { href: '/resep?tujuan=marketing', label: 'Marketing', ikon: 'corong' },
    { href: '/ulasan', label: 'Ulasan', ikon: 'obrolan', lencana: jumlahUlasan },
    { href: '/pengaturan', label: 'Pengaturan', ikon: 'gerigi' },
  ];

  return html`<${Kerangka} k=${k} aktif="rumah" plus=${{ href: '/resep/baru', label: 'Resep baru' }}>
    <div class="sapa">
      <div class="sapa-merek">
        <${LogoMerek} src=${merek.logo} ukuran=${52} />
        <div>
          <div class="sapa-teks">${sapaan()}${nama ? ', ' + nama : ''}</div>
          <h1>${merek.nama}</h1>
        </div>
      </div>
      <div class="sapa-aksi">
        <a class="bulat putih" href=${tautan('/pengaturan')} aria-label="Pengaturan">
          <${Ikon} nama="gerigi" />
        </a>
      </div>
    </div>

    <div class="judul-bagian" style="margin-top:16px">
      <h2>Resep juara</h2>
      ${jumlahResep > 0 && html`<a class="tautan-hijau" href=${tautan('/resep')}>Lihat semua</a>`}
    </div>

    ${juara.length > 0
      ? html`<div class="karusel" role="list" aria-label="Resep juara">
          ${juara.map((r, i) => {
            const e = r.juara;
            const warna = r.kategori ? r.kategori.warna : 'var(--hijau)';
            return html`<div class="slide" role="listitem" key=${r.resep.id}>
              <a class="juara-kartu" href=${tautan('/resep/' + r.resep.id)}>
                <div class="juara-foto" aria-hidden="true">
                  <${Foto} src=${r.foto} ikon="kamera" ukuranIkon=${40} />
                  <span class="kaca kiri-atas"><i class="titik-warna" style=${`--warna:${warna}`}></i>${r.kategori ? r.kategori.nama : 'Resep'}</span>
                  <span class="kaca kanan-atas"><${Ikon} nama="bintang" ukuran=${14} />${Number.isFinite(r.skor) ? desimal1(r.skor) : '–'}</span>
                </div>
                <div class="juara-badan">
                  <div style="min-width:0">
                    <h3>${r.resep.nama}</h3>
                    <div class="meta">Eksperimen ${e.nomor} juara · ${r.eksperimen.length} percobaan · ${r.jumlahPenilai > 0 ? `${r.jumlahPenilai} penilai` : 'belum ada penilai'}</div>
                  </div>
                  <span class="panah-bulat" aria-hidden="true"><${Ikon} nama="panah" /></span>
                </div>
                ${juara.length > 1 &&
                html`<div class="titik" aria-hidden="true">
                  ${juara.map((_, j) => html`<i class=${j === i ? 'on' : ''}></i>`)}
                </div>`}
              </a>
            </div>`;
          })}
        </div>`
      : html`<div style="padding:0 20px">
          ${jumlahResep === 0
            ? html`<${Kosong} judul="Belum ada resep" teks="Mulai dengan membuat resep pertama.">
                <div class="baris-btn" style="width:100%;justify-content:center">
                  <a class="btn solid" href=${tautan('/resep/baru')}>Buat resep pertama</a>
                </div>
              <//>`
            : html`<div class="kosong kosong-juara" style="background:var(--krem);border-style:solid;border-color:var(--garis)">
                <h3>Belum ada resep juara</h3>
                <p>Buka sebuah eksperimen yang hasilnya paling bagus, lalu tekan “Tandai sebagai juara”.</p>
                <a class="btn solid" href=${tautan('/resep')}>Buka daftar resep</a>
              </div>`}
        </div>`}

    <div class="menu-grid" role="list">
      ${menu.map(
        (m) => html`<a class="menu-item" role="listitem" href=${tautan(m.href)}>
          <span class="lingkar"><${Ikon} nama=${m.ikon} ukuran=${24} /></span>
          ${m.label}
          ${m.lencana > 0 && html`<span class="lencana" aria-label=${m.lencana + ' item'}>${m.lencana}</span>`}
        </a>`,
      )}
    </div>
    <div style="height:12px"></div>
  <//>`;
}
