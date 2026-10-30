// Struk pesanan: cetak ke printer kasir (58 / 80 mm) atau printer biasa / PDF, dan struk digital
// (kirim ke WhatsApp pembeli, bagikan, atau salin teks).

import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { Kosong } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tautan } from '../ui/router.js';
import { tampilToast } from '../ui/pesan.js';
import { salin } from './bagikan.js';
import { dataStruk, teksStruk, pesanStrukWa, waktuStruk } from '../lib/struk.js';
import { rupiah, angka } from '../lib/util.js';

const KERTAS = [
  { kunci: '58', label: '58 mm', kolom: 32 },
  { kunci: '80', label: '80 mm', kolom: 42 },
  { kunci: 'a4', label: 'A4 / PDF', kolom: 42 },
];
const KUNCI_KERTAS = 'struk-kertas';

function bacaKertas() {
  try {
    const k = localStorage.getItem(KUNCI_KERTAS);
    return KERTAS.some((x) => x.kunci === k) ? k : '58';
  } catch {
    return '58';
  }
}

function Baris({ kiri, kanan, tebal, kelas = '' }) {
  return html`<div class=${'struk-baris ' + kelas}><span>${tebal ? html`<b>${kiri}</b>` : kiri}</span><span>${tebal ? html`<b>${kanan}</b>` : kanan}</span></div>`;
}

/** Kertas struk (tampil di layar dan saat dicetak). */
export function KertasStruk({ d, kertas = '58' }) {
  return html`<article class=${'struk-kertas k-' + kertas} aria-label=${'Struk pesanan #' + d.nomor}>
    <header class="struk-kepala">
      ${d.toko.logo && html`<img class="struk-logo" src=${d.toko.logo} alt="" />`}
      <b class="struk-toko">${d.toko.nama}</b>
      ${d.toko.alamat && html`<small>${d.toko.alamat}</small>`}
      ${d.toko.wa && html`<small>WA ${d.toko.wa}</small>`}
    </header>
    <hr />
    <${Baris} kiri="No" kanan=${'#' + d.nomor} />
    <${Baris} kiri="Tanggal" kanan=${waktuStruk(d.waktu)} />
    ${d.kasir && html`<${Baris} kiri="Kasir" kanan=${d.kasir} />`}
    ${d.pembeli && html`<${Baris} kiri="Pembeli" kanan=${d.pembeli} />`}
    <hr />
    ${d.item.map(
      (i, n) => html`<div class="struk-item" key=${n}>
        <div>${i.nama}</div>
        ${i.opsi.length > 0 && html`<small>+ ${i.opsi.join(', ')}</small>`}
        <${Baris} kiri=${`${angka(i.jumlah)} × ${angka(i.harga)}`} kanan=${angka(i.total)} kelas="redup" />
      </div>`,
    )}
    <hr />
    ${(d.diskon > 0 || d.ongkir > 0) && html`<${Baris} kiri=${`Subtotal (${angka(d.jumlahItem)} item)`} kanan=${angka(d.subtotal)} />`}
    ${d.diskon > 0 && html`<${Baris} kiri=${'Diskon' + (d.kodePromo ? ` (${d.kodePromo})` : '')} kanan=${'-' + angka(d.diskon)} />`}
    ${d.ongkir > 0 && html`<${Baris} kiri="Ongkir" kanan=${angka(d.ongkir)} />`}
    <${Baris} kiri="TOTAL" kanan=${rupiah(d.total)} tebal kelas="struk-total" />
    ${d.lunas && html`<${Baris} kiri=${d.metode} kanan=${angka(d.diterima || d.total)} />`}
    ${d.lunas && d.diterima > 0 && html`<${Baris} kiri="Kembali" kanan=${angka(d.kembalian)} />`}
    <hr />
    ${d.caraAmbil && html`<${Baris} kiri="Ambil" kanan=${d.caraAmbil + (d.jadwal ? ', ' + waktuStruk(d.jadwal) : '')} />`}
    ${d.alamat && html`<${Baris} kiri="Alamat" kanan=${d.alamat} />`}
    ${d.catatan && html`<${Baris} kiri="Catatan" kanan=${d.catatan} />`}
    <p class=${'struk-status' + (d.lunas && !d.batal ? '' : ' belum')}>${d.batal ? 'PESANAN DIBATALKAN' : d.lunas ? `LUNAS · ${waktuStruk(d.lunasPada)}` : 'BELUM DIBAYAR'}</p>
    <p class="struk-kaki">Terima kasih!</p>
  </article>`;
}

export function LayarStruk({ k, id }) {
  const { db, rute } = k;
  const d = dataStruk(db, id);
  const [kertas, setKertas] = useState(bacaKertas);
  const kembali = rute.kueri.dari === 'kasir' ? '/kasir' : '/pesanan/' + id;

  // Ukuran kertas cetak mengikuti pilihan (printer kasir tanpa margin, A4 dengan margin biasa).
  useEffect(() => {
    const gaya = document.createElement('style');
    gaya.textContent = `@media print { @page { size: ${kertas === 'a4' ? 'A4' : 'auto'}; margin: ${kertas === 'a4' ? '14mm' : '0'}; } }`;
    document.head.appendChild(gaya);
    return () => gaya.remove();
  }, [kertas]);

  // Judul dokumen = nama berkas PDF yang disarankan browser.
  useEffect(() => {
    if (!d) return undefined;
    const lama = document.title;
    document.title = `Struk ${d.nomor} - ${d.toko.nama}`;
    return () => (document.title = lama);
  }, [d && d.nomor]);

  if (!d) {
    return html`<div class="penilai"><div class="isi"><${Kosong} judul="Pesanan tidak ditemukan"><a class="btn solid" href=${tautan('/pesanan')}>Ke daftar pesanan</a><//></div></div>`;
  }
  const pilih = (x) => {
    setKertas(x);
    try {
      localStorage.setItem(KUNCI_KERTAS, x);
    } catch {
      /* tidak tersimpan: tetap dipakai sampai halaman ditutup */
    }
  };
  const teks = teksStruk(d, (KERTAS.find((x) => x.kunci === kertas) || KERTAS[0]).kolom);
  const wa = `https://wa.me/${d.hp || ''}?text=${encodeURIComponent(pesanStrukWa(d))}`;
  const bisaBagikan = typeof navigator !== 'undefined' && !!navigator.share;
  const bagikan = async () => {
    try {
      await navigator.share({ title: `Struk #${d.nomor}`, text: teksStruk(d, 32) });
    } catch {
      /* dibatalkan pengguna */
    }
  };

  return html`<div class=${'cetak struk-halaman k-' + kertas}>
    <div class="cetak-alat struk-alat">
      <a class="btn" href=${tautan(kembali)}><${Ikon} nama="kembali" ukuran=${18} />Kembali</a>
      <div class="chips" role="group" aria-label="Ukuran kertas">
        ${KERTAS.map((x) => html`<button type="button" key=${x.kunci} class=${'chip' + (kertas === x.kunci ? ' aktif' : '')} aria-pressed=${kertas === x.kunci} onClick=${() => pilih(x.kunci)}>${x.label}</button>`)}
      </div>
      <div class="baris-btn">
        <button class="btn solid" onClick=${() => window.print()}><${Ikon} nama="struk" ukuran=${18} />Cetak struk</button>
        <a class="btn" href=${wa} target="_blank" rel="noopener"><${Ikon} nama="kirim" ukuran=${18} />${d.hp ? 'Kirim ke WhatsApp pembeli' : 'Kirim lewat WhatsApp'}</a>
        ${bisaBagikan && html`<button class="btn" onClick=${bagikan}><${Ikon} nama="bagikan" ukuran=${18} />Bagikan</button>`}
        <button class="btn" onClick=${async () => tampilToast((await salin(teks)) ? 'Teks struk disalin.' : 'Gagal menyalin.')}><${Ikon} nama="salin" ukuran=${18} />Salin teks</button>
      </div>
      <p class="teks-kecil">Printer kasir Bluetooth / USB: pilih printernya di jendela cetak. Untuk PDF, pilih <b>Simpan sebagai PDF</b>.</p>
    </div>
    <${KertasStruk} d=${d} kertas=${kertas} />
  </div>`;
}
