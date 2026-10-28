// Ekspor satu resep sebagai dokumen siap cetak / simpan PDF: data resep, HPP, dan setiap
// eksperimen (bahan, biaya, langkah, catatan, foto, skor, penilaian). Memakai dialog cetak browser.

import { html, useEffect } from '../../vendor/preact-htm.js';
import { Kosong } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tautan } from '../ui/router.js';
import { dataEksporResep, ambilMerek } from '../lib/repo.js';
import { ASPEK, skorPenilaian } from '../lib/skor.js';
import { angka, rupiah, desimal1, tampilJumlah, tanggal, persen } from '../lib/util.js';

const nilai = (n) => (Number.isFinite(n) ? desimal1(n) : '–');

function Eksperimen({ d }) {
  const { eksperimen: e, juara, foto, biaya, hpp, skor, penilaian } = d;
  const info = [];
  if (e.porsi) info.push(['Hasil', `${angka(e.porsi, e.porsi % 1 ? 1 : 0)} ${e.satuanPorsi || 'porsi'}`]);
  if (e.suhuC) info.push(['Suhu', `${e.suhuC}°C`]);
  if (e.waktuMenit) info.push(['Waktu', `${e.waktuMenit} menit`]);
  info.push(['Biaya bahan', rupiah(biaya.total)], ['HPP per porsi', rupiah(hpp.hppPorsi)]);
  if (e.dibuat) info.push(['Tanggal', tanggal(e.dibuat)]);

  return html`<section class="cetak-eks">
    <h2>Eksperimen ${e.nomor}${juara ? html` <span class="cetak-juara">Juara</span>` : ''}</h2>
    <div class="cetak-dua">
      <dl class="cetak-info">${info.map(([a, b]) => html`<dt>${a}</dt><dd>${b}</dd>`)}</dl>
      ${foto && html`<img class="cetak-foto" src=${foto} alt=${'Hasil eksperimen ' + e.nomor} />`}
    </div>

    <h3>Bahan</h3>
    ${biaya.rincian.length === 0
      ? html`<p class="cetak-redup">Belum ada bahan tercatat.</p>`
      : html`<div class="cetak-gulir"><table>
          <thead><tr><th>Bahan</th><th class="kanan">Jumlah</th><th class="kanan">Biaya</th></tr></thead>
          <tbody>
            ${biaya.rincian.map((b) => html`<tr><td>${b.bahan ? b.bahan.nama : 'Bahan terhapus'}</td><td class="kanan">${tampilJumlah(b.jumlah)} ${b.satuan}</td><td class="kanan">${Number.isFinite(b.biaya) ? rupiah(b.biaya) : '?'}</td></tr>`)}
          </tbody>
          <tfoot><tr><td colspan="2">Total biaya bahan</td><td class="kanan">${rupiah(biaya.total)}</td></tr></tfoot>
        </table></div>`}

    <h3>Langkah</h3>
    ${(e.langkah || []).length === 0 ? html`<p class="cetak-redup">Belum ada langkah tercatat.</p>` : html`<ol>${e.langkah.map((l) => html`<li>${l}</li>`)}</ol>`}

    ${e.catatanKegagalan && html`<h3>Catatan</h3><p class="cetak-teks">${e.catatanKegagalan}</p>`}
    ${e.catatanChef && html`<h3>Catatan chef</h3><p class="cetak-teks">${e.catatanChef}</p>`}

    <h3>Penilaian ${skor.jumlah ? `(${skor.jumlah} penilai, rata-rata ${nilai(skor.rata)})` : ''}</h3>
    ${skor.jumlah === 0
      ? html`<p class="cetak-redup">Belum ada penilaian.</p>`
      : html`<div class="cetak-gulir"><table>
          <thead><tr><th>Penilai</th>${ASPEK.map((a) => html`<th class="kanan">${a.label}</th>`)}<th class="kanan">Rata-rata</th></tr></thead>
          <tbody>
            ${penilaian.map((p) => html`<tr>
              <td>${p.namaPenilai || (p.dariPemilik ? 'Pemilik' : 'Tanpa nama')}${p.komentar ? html`<div class="cetak-komentar">“${p.komentar}”</div>` : ''}</td>
              ${ASPEK.map((a) => html`<td class="kanan">${p[a.kunci] ?? '–'}</td>`)}
              <td class="kanan"><b>${nilai(skorPenilaian(p))}</b></td>
            </tr>`)}
          </tbody>
          <tfoot><tr><td>Rata-rata</td>${ASPEK.map((a) => html`<td class="kanan">${nilai(skor.perAspek[a.kunci])}</td>`)}<td class="kanan">${nilai(skor.rata)}</td></tr></tfoot>
        </table></div>`}
  </section>`;
}

export function CetakResep({ k, id }) {
  const { db } = k;
  const d = dataEksporResep(db, id);
  const merek = ambilMerek(db);

  // Judul dokumen menjadi nama berkas PDF yang disarankan browser.
  useEffect(() => {
    if (!d) return undefined;
    const lama = document.title;
    const pasang = () => (document.title = `Resep ${d.resep.nama} - ${merek.nama}`);
    pasang();
    const t = setTimeout(pasang, 50);
    return () => (clearTimeout(t), (document.title = lama));
  }, [d && d.resep.nama, merek.nama]);

  if (!d) {
    return html`<div class="penilai"><div class="isi"><${Kosong} judul="Resep tidak ditemukan" teks="Mungkin sudah dihapus."><a class="btn solid" href=${tautan('/resep')}>Ke daftar resep</a><//></div></div>`;
  }
  const { resep, kategori, fotoAcuan, hpp, eksperimen } = d;
  const target = hpp && hpp.target;

  return html`<div class="cetak">
    <div class="cetak-alat">
      <a class="btn" href=${tautan('/resep/' + id)}><${Ikon} nama="kembali" ukuran=${18} />Kembali</a>
      <button class="btn solid" onClick=${() => window.print()}><${Ikon} nama="unduh" ukuran=${18} />Simpan PDF / Cetak</button>
      <p class="teks-kecil">Pilih <b>Simpan sebagai PDF</b> di jendela cetak.</p>
    </div>

    <article class="cetak-kertas">
      <header class="cetak-kepala">
        <div>
          <div class="cetak-redup">${merek.nama} · ${kategori ? kategori.nama : 'Resep'}</div>
          <h1>${resep.nama}</h1>
          <div class="cetak-redup">Diekspor ${tanggal(Date.now())} · ${eksperimen.length} eksperimen</div>
        </div>
        ${fotoAcuan && html`<img class="cetak-foto kecil" src=${fotoAcuan} alt="Gambar acuan" />`}
      </header>

      ${resep.targetDicapai && html`<h3>Target yang ingin dicapai</h3><p class="cetak-teks">${resep.targetDicapai}</p>`}

      ${hpp && hpp.eksperimen &&
      html`<h3>HPP dan harga (dihitung dari Eksperimen ${hpp.eksperimen.nomor})</h3>
        <dl class="cetak-info">
          <dt>Biaya bahan</dt><dd>${rupiah(hpp.hpp.biayaBahan)}</dd>
          ${hpp.hpp.lain.map((b) => html`<dt>${b.jenis || 'Biaya lain'}</dt><dd>${rupiah(b.total)}</dd>`)}
          <dt>Total per resep</dt><dd>${rupiah(hpp.hpp.totalResep)}</dd>
          <dt>HPP resep per porsi${hpp.tersimpan ? ' (tersimpan)' : ''}</dt><dd><b>${rupiah(hpp.hppPorsi)}</b></dd>
          ${hpp.tambahan.rincian.map((t) => html`<dt>${t.resep ? t.resep.nama : 'Resep lain'} (resep lain)</dt><dd>${rupiah(t.biayaPorsi)}</dd>`)}
          ${hpp.tambahan.rincian.length > 0 && html`<dt>HPP jual per porsi</dt><dd><b>${rupiah(hpp.hppJual)}</b></dd>`}
          ${target && Number(target.hargaJual) > 0 && html`<dt>Harga jual</dt><dd>${rupiah(Number(target.hargaJual))}</dd>`}
          ${target && Number(target.marginTarget) > 0 && html`<dt>Target margin</dt><dd>${persen(Number(target.marginTarget), 0)}</dd>`}
        </dl>`}

      ${eksperimen.length === 0 ? html`<p class="cetak-redup">Belum ada eksperimen.</p>` : eksperimen.map((x) => html`<${Eksperimen} d=${x} />`)}
    </article>
  </div>`;
}
