// Kartu harga jual. Satu harga jual saja:
// - ketik harga yang Anda inginkan -> langsung terlihat untung, margin (untung ÷ harga), dan markup (untung ÷ modal);
// - atau minta saran: pilih margin yang diinginkan -> harga minimum = modal ÷ (1 − margin), lalu "Pakai".

import { html } from '../../vendor/preact-htm.js';
import { InputRupiah } from './komponen.js';
import { Ikon } from './ikon.js';
import { hargaMinimum, bulatkanHarga, marginDariHarga } from '../lib/hpp.js';
import { rupiah, persen } from '../lib/util.js';

/**
 * @param {number} hpp          modal (HPP) per unit yang dijual
 * @param {number} marginTarget margin yang diinginkan (%)
 * @param {number} hargaJual    harga jual tersimpan
 * @param {Function} onUbah     dipanggil dengan {marginTarget} atau {hargaJual}
 * @param {string} unit         mis. 'porsi', 'potong', 'paket'
 */
export function KartuHarga({ hpp, marginTarget, hargaJual, onUbah, unit = 'porsi' }) {
  const minimum = hargaMinimum(hpp, marginTarget);
  const disarankan = bulatkanHarga(minimum);
  const hasil = marginDariHarga(hpp, hargaJual);
  const adaHarga = hargaJual > 0;
  const rugi = adaHarga && hasil.laba <= 0;
  const bagianModal = adaHarga ? Math.min(100, Math.max(0, (hpp / hargaJual) * 100)) : 0;

  return html`<div class="kartu kartu-harga">
    <label class="bidang">
      <span class="label-kecil">Harga jual per ${unit}</span>
      <${InputRupiah} kelas="input input-besar" nilai=${hargaJual} onUbah=${(n) => onUbah({ hargaJual: n })} placeholder="mis. 8.000" />
    </label>

    ${adaHarga
      ? html`<div class="pecah-harga">
          <div class=${'bilah-harga' + (rugi ? ' rugi' : '')} role="img" aria-label=${`Dari ${rupiah(hargaJual)}: modal ${rupiah(hpp)}, untung ${rupiah(hasil.laba)}`}>
            <span class="bilah-modal" style=${`width:${bagianModal}%`}></span>
            <span class="bilah-untung"></span>
          </div>
          <div class="legenda-harga">
            <span><i class="titik-modal"></i>Modal ${rupiah(hpp)}</span>
            <span class=${rugi ? 'buruk' : 'baik'}><i class="titik-untung"></i>${rugi ? 'Rugi' : 'Untung'} ${rupiah(Math.abs(hasil.laba))}</span>
          </div>
          <div class="angka-margin">
            <div><b class=${rugi ? 'buruk' : hasil.marginPersen >= marginTarget ? 'baik' : ''}>${persen(hasil.marginPersen)}</b><small>Margin<br />untung ÷ harga jual</small></div>
            <div><b>${persen(hasil.markupPersen)}</b><small>Markup<br />untung ÷ modal</small></div>
          </div>
          ${rugi && html`<div class="peringatan" role="alert"><b>Harga jual di bawah atau sama dengan modal.</b>Setiap ${unit} yang terjual merugi ${rupiah(Math.abs(hasil.laba))}.</div>`}
        </div>`
      : html`<p class="bantu" style="margin:8px 0 0">Ketik harga yang Anda inginkan, atau pakai saran di bawah.</p>`}

    <div class="saran-harga">
      <div class="label-kecil">Saran harga dari margin</div>
      <div class="baris-pisah">
        <span>Margin yang diinginkan</span>
        <div class="stepper">
          <button aria-label="Kurangi margin" onClick=${() => onUbah({ marginTarget: Math.max(5, marginTarget - 5) })}><${Ikon} nama="minus" /></button>
          <output aria-live="polite">${marginTarget}%</output>
          <button aria-label="Tambah margin" onClick=${() => onUbah({ marginTarget: Math.min(90, marginTarget + 5) })}><${Ikon} nama="plus" /></button>
        </div>
      </div>
      <div class="hasil-baris">
        <span>Harga minimum</span>
        <b>${rupiah(minimum)}</b>
      </div>
      <p class="rumus">${rupiah(hpp)} ÷ (100% − ${marginTarget}%) = ${rupiah(minimum)}</p>
      ${Number.isFinite(disarankan) && disarankan !== hargaJual &&
      html`<button class="btn" style="width:100%;margin-top:8px" onClick=${() => onUbah({ hargaJual: disarankan })}>Pakai ${rupiah(disarankan)} (dibulatkan)</button>`}
    </div>

    <details class="catatan-margin">
      <summary>Margin dan markup, apa bedanya?</summary>
      <p><b>Margin</b> = untung ÷ harga jual. <b>Markup</b> = untung ÷ modal. Keduanya dari untung yang sama, hanya pembaginya berbeda.</p>
      <p>Contoh modal Rp 5.000: margin 40% → Rp 5.000 ÷ 0,6 = Rp 8.333. Kalau dihitung Rp 5.000 × 1,4 = Rp 7.000, itu markup 40% (marginnya hanya 28,6%).</p>
    </details>
  </div>`;
}
