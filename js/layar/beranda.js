// Beranda: resep juara selebar HP, lalu menu ikon.

import { html } from '../../vendor/preact-htm.js';
import { Kerangka, Foto, Kosong, LogoMerek } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tautan, pergi } from '../ui/router.js';
import { daftarJuara, ambilMerek } from '../lib/repo.js';
import { desimal1 } from '../lib/util.js';
import { muatContoh } from '../lib/seed.js';
import { tampilToast } from '../ui/pesan.js';

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
  const tersambung = !!(db.pengaturan.scriptUrl && db.pengaturan.kunci);
  const merek = ambilMerek(db);

  const menu = [
    { href: '/resep', label: 'Daftar resep', ikon: 'resep', warna: 'var(--tomat)', lencana: jumlahResep },
    { href: '/bahan', label: 'Daftar bahan', ikon: 'keranjang', warna: 'var(--hijau)', lencana: jumlahBahan },
    { href: '/resep?tujuan=hpp', label: 'HPP & harga', ikon: 'kalkulator', warna: 'var(--navy)' },
    { href: '/resep?tujuan=marketing', label: 'Marketing', ikon: 'corong', warna: 'var(--kuning-tua)' },
    { href: '/ulasan', label: 'Ulasan', ikon: 'obrolan', warna: 'var(--coklat)', lencana: jumlahUlasan },
    { href: '/pengaturan', label: 'Pengaturan', ikon: 'gerigi', warna: 'var(--ink2)' },
  ];

  return html`<${Kerangka} k=${k} aktif="rumah" plus=${{ href: '/resep/baru', label: 'Resep baru' }}>
    <div class="sapa">
      <div class="sapa-merek">
        <${LogoMerek} src=${merek.logo} ukuran=${52} />
        <div>
          <div class="hero-label">${sapaan()}${nama ? ', ' + nama : ''}</div>
          <h1>${merek.nama}</h1>
        </div>
      </div>
      <div class="sapa-aksi">
        ${db.pengaturan.kunciAplikasi && html`<button class="bulat putih" onClick=${k.kunciSekarang} aria-label="Kunci aplikasi"><${Ikon} nama="gembok" /></button>`}
        <a class="bulat putih" href=${tautan('/pengaturan')} aria-label=${tersambung ? 'Pengaturan sinkronisasi' : 'Sambungkan ke Google'}>
          <${Ikon} nama=${tersambung ? 'awan' : 'awanMati'} />
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
            const warna = r.kategori ? r.kategori.warna : 'var(--tomat)';
            return html`<div class="slide" role="listitem" key=${r.resep.id}>
              <a class="juara-kartu" style=${`--warna:${warna}`} href=${tautan('/resep/' + r.resep.id)}>
                <div class="kiri">
                  <span class="chip-hero" style="align-self:flex-start">${r.kategori ? r.kategori.nama : 'Resep'}</span>
                  <h3>${r.resep.nama}</h3>
                  <div class="meta">Eksperimen ${e.nomor} juara · ${r.eksperimen.length} percobaan</div>
                  <div class="skor">
                    <b>${Number.isFinite(r.skor) ? desimal1(r.skor) : '–'}</b>
                    <span>${r.jumlahPenilai > 0 ? `dari ${r.jumlahPenilai} penilai` : 'belum ada penilai'}</span>
                  </div>
                  <div class="titik" aria-hidden="true">
                    ${juara.map((_, j) => html`<i class=${j === i ? 'on' : ''}></i>`)}
                    <span>${i + 1}/${juara.length}</span>
                  </div>
                </div>
                <div class="busur-foto" aria-hidden="true">
                  <${Foto} src=${r.foto} ikon="kamera" ukuranIkon=${32} />
                </div>
              </a>
            </div>`;
          })}
        </div>`
      : html`<div style="padding:0 20px">
          ${jumlahResep === 0
            ? html`<${Kosong} judul="Belum ada resep" teks="Mulai dengan membuat resep pertama, atau lihat dulu cara kerjanya memakai data contoh.">
                <div class="baris-btn" style="width:100%;justify-content:center">
                  <a class="btn solid" href=${tautan('/resep/baru')}>Buat resep pertama</a>
                  <button class="btn" onClick=${() => {
                    muatContoh(db);
                    tampilToast('Data contoh dimuat. Hapus kapan saja di Pengaturan.');
                  }}>Muat data contoh</button>
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
        (m) => html`<a class="menu-item" role="listitem" href=${tautan(m.href)} style=${`--warna:${m.warna}`}>
          <span class="lingkar"><${Ikon} nama=${m.ikon} ukuran=${28} /></span>
          ${m.label}
          ${m.lencana > 0 && html`<span class="lencana" aria-label=${m.lencana + ' item'}>${m.lencana}</span>`}
        </a>`,
      )}
    </div>
    <div style="height:12px"></div>
  <//>`;
}
