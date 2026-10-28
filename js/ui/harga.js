// Kartu harga jual: dua arah hitung.
// - Dari margin: isi margin yang diinginkan -> harga jual minimum = HPP ÷ (1 − margin).
// - Dari harga: isi harga yang Anda inginkan -> margin (laba ÷ harga) dan markup (laba ÷ HPP).

import { html, useState } from '../../vendor/preact-htm.js';
import { InputRupiah } from './komponen.js';
import { Ikon } from './ikon.js';
import { hargaMinimum, bulatkanHarga, marginDariHarga } from '../lib/hpp.js';
import { rupiah, persen } from '../lib/util.js';

/**
 * @param {number} hpp          HPP per unit yang dijual (per porsi atau per paket)
 * @param {number} marginTarget margin yang diinginkan (%)
 * @param {number} hargaJual    harga jual tersimpan
 * @param {Function} onUbah     dipanggil dengan {marginTarget} atau {hargaJual}
 * @param {string} unit         'porsi' atau 'paket'
 */
export function KartuHarga({ hpp, marginTarget, hargaJual, onUbah, unit = 'porsi' }) {
  const [mode, setMode] = useState(hargaJual > 0 ? 'harga' : 'margin');
  const minimum = hargaMinimum(hpp, marginTarget);
  const disarankan = bulatkanHarga(minimum);
  const hasil = marginDariHarga(hpp, hargaJual);
  const adaHarga = hargaJual > 0;
  const pakai = (harga) => {
    onUbah({ hargaJual: harga });
    setMode('harga');
  };

  return html`<div class="kartu">
    <div class="label-kecil" style="margin-bottom:10px">Harga jual</div>
    <div class="tab dalam" role="group" aria-label="Cara menentukan harga">
      <button type="button" class=${mode === 'margin' ? 'aktif' : ''} aria-pressed=${mode === 'margin'} onClick=${() => setMode('margin')}>Dari margin</button>
      <button type="button" class=${mode === 'harga' ? 'aktif' : ''} aria-pressed=${mode === 'harga'} onClick=${() => setMode('harga')}>Dari harga saya</button>
    </div>

    ${mode === 'margin'
      ? html`<div style="margin-top:10px">
          <div class="baris-pisah">
            <span>Margin yang diinginkan</span>
            <div class="stepper">
              <button aria-label="Kurangi margin" onClick=${() => onUbah({ marginTarget: Math.max(5, marginTarget - 5) })}><${Ikon} nama="minus" /></button>
              <output aria-live="polite">${marginTarget}%</output>
              <button aria-label="Tambah margin" onClick=${() => onUbah({ marginTarget: Math.min(90, marginTarget + 5) })}><${Ikon} nama="plus" /></button>
            </div>
          </div>
          <div class="hasil-baris">
            <span>Harga jual minimum</span>
            <b>${rupiah(minimum)}</b>
          </div>
          <p class="rumus">${rupiah(hpp)} ÷ (100% − ${marginTarget}%) = ${rupiah(minimum)}</p>
          ${Number.isFinite(disarankan) && html`<button class="btn" style="width:100%;margin-top:8px" onClick=${() => pakai(disarankan)}>Pakai ${rupiah(disarankan)} (dibulatkan)</button>`}
          ${adaHarga && html`<p class="bantu" style="margin-top:8px">Harga jual tersimpan: <b>${rupiah(hargaJual)}</b> (margin ${persen(hasil.marginPersen)}).</p>`}
        </div>`
      : html`<div style="margin-top:10px">
          <label class="bidang">
            <span>Harga jual yang Anda inginkan per ${unit}</span>
            <${InputRupiah} kelas="input" nilai=${hargaJual} onUbah=${(n) => onUbah({ hargaJual: n })} placeholder="mis. 8.000" />
          </label>
          <div class="hasil-baris">
            <span>Margin<small class="teks-kecil"> (laba ÷ harga jual)</small></span>
            <b class=${adaHarga ? (hasil.marginPersen >= marginTarget ? 'baik' : hasil.laba > 0 ? '' : 'buruk') : ''}>${adaHarga ? persen(hasil.marginPersen) : '–'}</b>
          </div>
          <div class="hasil-baris">
            <span>Markup<small class="teks-kecil"> (laba ÷ HPP)</small></span>
            <b class="biasa">${adaHarga ? persen(hasil.markupPersen) : '–'}</b>
          </div>
          <div class="hasil-baris">
            <span>Laba per ${unit}</span>
            <b class=${adaHarga ? (hasil.laba > 0 ? 'baik' : 'buruk') : ''}>${adaHarga ? rupiah(hasil.laba) : '–'}</b>
          </div>
          ${adaHarga &&
          html`<p class="rumus">${rupiah(hargaJual)} − ${rupiah(hpp)} = ${rupiah(hasil.laba)} → ${rupiah(hasil.laba)} ÷ ${rupiah(hargaJual)} = ${persen(hasil.marginPersen)}</p>`}
        </div>`}

    ${adaHarga && hasil.laba <= 0 &&
    html`<div class="peringatan" role="alert" style="margin-top:10px"><b>Harga jual di bawah atau sama dengan HPP.</b>Setiap ${unit} yang terjual merugi ${rupiah(Math.abs(hasil.laba))}.</div>`}

    <details class="catatan-margin">
      <summary>Kenapa beda dengan hitungan manual?</summary>
      <p>Aplikasi memakai <b>margin</b> = laba ÷ harga jual. Kalau Anda menghitung HPP × (1 + 40%), itu <b>markup</b> 40%, hasilnya lebih murah dan marginnya hanya 28,6%.</p>
      <p>Contoh HPP Rp 5.000: margin 40% → Rp 5.000 ÷ 0,6 = Rp 8.333. Markup 40% → Rp 5.000 × 1,4 = Rp 7.000.</p>
    </details>
  </div>`;
}
