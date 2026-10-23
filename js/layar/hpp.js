// HPP & Harga: biaya bahan dari eksperimen + biaya lain -> HPP per porsi, harga jual, margin, BEP, target.

import { html } from '../../vendor/preact-htm.js';
import { Kosong, InputRupiah, InputAngka } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tautan } from '../ui/router.js';
import {
  dataHPP, eksperimenResep, targetResep, biayaLainResep, pilihanResepTambahan, tambahResepTambahan,
} from '../lib/repo.js';
import { hargaMinimum, bulatkanHarga, analisisPenjualan } from '../lib/hpp.js';
import { rupiah, angka, persen, tampilJumlah } from '../lib/util.js';

const PRESET = [
  { jenis: 'Kemasan', per: 'porsi' },
  { jenis: 'Gas dan listrik', per: 'resep' },
  { jenis: 'Tenaga kerja', per: 'resep' },
  { jenis: 'Sewa tempat', per: 'resep' },
  { jenis: 'Ongkos kirim', per: 'porsi' },
  { jenis: 'Label dan stiker', per: 'porsi' },
];

const TARGET_AWAL = { marginTarget: 40, hargaJual: 0, modalAwal: 0, labaTargetBulanan: 0 };

export function PanelHPP({ k, resep }) {
  const { db } = k;
  const eksperimen = eksperimenResep(db, resep.id);
  if (eksperimen.length === 0) {
    return html`<div class="isi">
      <${Kosong} judul="Belum bisa menghitung HPP" teks="HPP dihitung dari bahan dan takaran sebuah eksperimen. Catat eksperimen dulu.">
        <a class="btn solid" href=${tautan(`/resep/${resep.id}/eksperimen/baru`)}>Catat eksperimen</a>
      <//>
    </div>`;
  }

  const data = dataHPP(db, resep.id);
  const target = { ...TARGET_AWAL, ...(data.target || {}) };
  const { hpp, biaya, tambahan, eksperimen: dipakai, porsi } = data;
  const pilihan = pilihanResepTambahan(db, resep.id);
  const ubahTambahan = (rt, patch) => {
    const { id, idResep, idResepKomponen, jumlah, satuan, urutan } = rt;
    db.simpan('ResepTambahan', { id, idResep, idResepKomponen, jumlah, satuan, urutan, ...patch });
  };
  const hppPorsi = hpp.hppPorsi;

  const aturTarget = (patch) => {
    const ada = targetResep(db, resep.id);
    db.simpan('Target', { ...TARGET_AWAL, ...(ada || { idResep: resep.id }), ...patch });
  };
  const tambahBiaya = (jenis, per) => {
    const urutan = biayaLainResep(db, resep.id).length;
    db.simpan('BiayaLain', { idResep: resep.id, jenis, nilai: 0, dihitungPer: per, urutan });
  };
  const ubahBiaya = (b, patch) => db.simpan('BiayaLain', { ...b, ...patch });

  const minimum = hargaMinimum(hppPorsi, target.marginTarget);
  const disarankan = bulatkanHarga(minimum);
  const analisis = analisisPenjualan({
    hppPorsi,
    hargaJual: target.hargaJual,
    porsiPerResep: porsi,
    modalAwal: target.modalAwal,
    labaTargetBulanan: target.labaTargetBulanan,
  });
  const adaHarga = target.hargaJual > 0;
  const sudahDipakai = new Set(hpp.lain.map((b) => b.jenis.toLowerCase()));

  const kiri = html`<div class="kolom">
    <label class="bidang">
      <span>Eksperimen yang dihitung</span>
      <select class="pilih" value=${dipakai ? dipakai.id : ''} onChange=${(e) => aturTarget({ idEksperimenHitung: e.target.value })}>
        ${eksperimen.map((e) => html`<option value=${e.id} selected=${dipakai && dipakai.id === e.id}>Eksperimen ${e.nomor}${resep.idJuara === e.id ? ' (juara)' : ''}</option>`)}
      </select>
      <span class="bantu">Secara bawaan memakai eksperimen juara. Harga bahan selalu mengikuti Daftar Bahan terbaru.</span>
    </label>

    ${biaya.bermasalah.length > 0 &&
    html`<div class="peringatan" role="alert">
      <b>Ada bahan yang biayanya belum bisa dihitung:</b>
      ${biaya.bermasalah.map((b) => (b.bahan ? b.bahan.nama : 'bahan terhapus') + ` (${b.jumlah} ${b.satuan})`).join(', ')}.
      Periksa harga, isi kemasan, atau konversi satuannya di <a href=${tautan('/bahan')} style="text-decoration:underline">Daftar Bahan</a>.
    </div>`}

    <div class="kartu">
      <div class="label-kecil" style="margin-bottom:6px">Rincian biaya per resep</div>
      <table class="tabel-biaya">
        <tbody>
          <tr>
            <td>Bahan (Eksperimen ${dipakai ? dipakai.nomor : '–'})</td>
            <td>${rupiah(hpp.biayaBahan)}</td>
          </tr>
          ${tambahan.rincian.map((t) => html`<tr key=${t.id}>
            <td>${t.resep ? t.resep.nama : 'Resep terhapus'}<small class="teks-kecil"> · ${tampilJumlah(Number(t.jumlah) || 0)} ${t.satuan === 'resep' ? 'resep' : t.satuanPorsi || 'porsi'}</small></td>
            <td>${rupiah(t.biaya)}</td>
          </tr>`)}
          ${hpp.lain.map((b) => html`<tr key=${b.id}>
            <td>${b.jenis}${b.dihitungPer === 'porsi' ? html`<small class="teks-kecil"> · ${rupiah(Number(b.nilai))} × ${angka(porsi)}</small>` : ''}</td>
            <td>${rupiah(b.total)}</td>
          </tr>`)}
        </tbody>
        <tfoot>
          <tr><td>Total per resep</td><td>${rupiah(hpp.totalResep)}</td></tr>
        </tfoot>
      </table>
    </div>

    <div class="kartu">
      <div class="label-kecil" style="margin-bottom:4px">Resep tambahan</div>
      <p class="bantu" style="margin:0 0 10px">Resep lain yang ikut dipakai di resep ini, mis. saus atau isian. Biayanya diambil dari bahan eksperimen yang dihitung di resep itu (tanpa biaya lainnya).</p>
      ${tambahan.bermasalah.length > 0 &&
      html`<div class="peringatan" role="alert" style="margin-bottom:10px">
        <b>Ada resep tambahan yang biayanya belum lengkap:</b>
        ${tambahan.bermasalah.map((t) => `${t.resep ? t.resep.nama : 'resep terhapus'} (${t.alasan})`).join(', ')}.
      </div>`}
      <div class="kolom">
        ${tambahan.rincian.map(
          (t) => html`<div class="biaya-lain-baris" key=${t.id}>
            ${t.resep
              ? html`<a class="bl-nama" href=${tautan(`/resep/${t.resep.id}/hpp`)} style="font-weight:700;text-decoration:underline">${t.resep.nama}</a>`
              : html`<span class="bl-nama">Resep terhapus</span>`}
            <${InputAngka} kelas="input kecil bl-nilai" nilai=${t.jumlah} aria-label=${'Jumlah ' + (t.resep ? t.resep.nama : '')} onUbah=${(n) => Number.isFinite(n) && ubahTambahan(t, { jumlah: n })} />
            <select class="pilih kecil bl-per" aria-label=${'Satuan ' + (t.resep ? t.resep.nama : '')} value=${t.satuan} onChange=${(e) => ubahTambahan(t, { satuan: e.target.value })}>
              <option value="porsi" selected=${t.satuan !== 'resep'}>${t.satuanPorsi || 'porsi'}</option>
              <option value="resep" selected=${t.satuan === 'resep'}>resep penuh</option>
            </select>
            <span style="min-width:84px;text-align:right;font-weight:700">${rupiah(t.biaya)}</span>
            <button class="ikon-btn" aria-label=${'Hapus ' + (t.resep ? t.resep.nama : 'resep tambahan')} onClick=${() => db.hapus('ResepTambahan', t.id)}><${Ikon} nama="sampah" ukuran=${20} /></button>
            ${t.resep && Number.isFinite(t.perPorsi) &&
            html`<small class="teks-kecil" style="flex-basis:100%">${rupiah(t.perPorsi)} per ${t.satuanPorsi || 'porsi'} · ${rupiah(t.perResep)} per resep (Eksperimen ${t.eksperimen.nomor})</small>`}
          </div>`,
        )}
        ${pilihan.length > 0
          ? html`<select class="pilih kecil" aria-label="Tambah resep tambahan" value="" onChange=${(e) => e.target.value && tambahResepTambahan(db, resep.id, e.target.value)}>
              <option value="" selected>+ Tambah resep lain…</option>
              ${pilihan.map((r) => html`<option value=${r.id}>${r.nama}</option>`)}
            </select>`
          : tambahan.rincian.length === 0 && html`<p class="bantu" style="margin:0">Belum ada resep lain yang bisa ditambahkan.</p>`}
      </div>
    </div>

    <div class="kartu">
      <div class="label-kecil" style="margin-bottom:10px">Biaya lain</div>
      <div class="kolom">
        ${biayaLainResep(db, resep.id).map(
          (b) => html`<div class="biaya-lain-baris" key=${b.id}>
            <input class="input kecil bl-nama" aria-label="Jenis biaya" value=${b.jenis} onInput=${(e) => ubahBiaya(b, { jenis: e.target.value })} />
            <${InputRupiah} kelas="input kecil bl-nilai" nilai=${b.nilai} aria-label=${'Nilai ' + b.jenis} onUbah=${(n) => ubahBiaya(b, { nilai: n })} />
            <select class="pilih kecil bl-per" aria-label=${'Dihitung per untuk ' + b.jenis} value=${b.dihitungPer} onChange=${(e) => ubahBiaya(b, { dihitungPer: e.target.value })}>
              <option value="resep" selected=${b.dihitungPer === 'resep'}>per resep</option>
              <option value="porsi" selected=${b.dihitungPer === 'porsi'}>per porsi</option>
            </select>
            <button class="ikon-btn" aria-label=${'Hapus ' + b.jenis} onClick=${() => db.hapus('BiayaLain', b.id)}><${Ikon} nama="sampah" ukuran=${20} /></button>
          </div>`,
        )}
        <div class="chips">
          ${PRESET.filter((p) => !sudahDipakai.has(p.jenis.toLowerCase())).map(
            (p) => html`<button type="button" class="chip putus" onClick=${() => tambahBiaya(p.jenis, p.per)}><${Ikon} nama="plus" ukuran=${16} />${p.jenis}</button>`,
          )}
          <button type="button" class="chip putus" onClick=${() => tambahBiaya('Biaya lain', 'resep')}><${Ikon} nama="plus" ukuran=${16} />Lainnya</button>
        </div>
      </div>
    </div>
  </div>`;

  const kanan = html`<div class="kolom">
    <div class="kartu-hpp">
      <div class="label-kecil">HPP per porsi</div>
      <div class="besar">${rupiah(hppPorsi)}</div>
      <small>${rupiah(hpp.totalResep)} ÷ ${angka(porsi)} ${dipakai && dipakai.satuanPorsi ? dipakai.satuanPorsi : 'porsi'}</small>
    </div>

    <div class="kartu">
      <div class="label-kecil" style="margin-bottom:10px">Harga jual</div>
      <div class="baris-pisah">
        <span>Margin yang diinginkan</span>
        <div class="stepper">
          <button aria-label="Kurangi margin" onClick=${() => aturTarget({ marginTarget: Math.max(5, target.marginTarget - 5) })}><${Ikon} nama="minus" /></button>
          <output aria-live="polite">${target.marginTarget}%</output>
          <button aria-label="Tambah margin" onClick=${() => aturTarget({ marginTarget: Math.min(90, target.marginTarget + 5) })}><${Ikon} nama="plus" /></button>
        </div>
      </div>
      <div class="hasil-baris">
        <span>Harga jual minimum</span>
        <b>${rupiah(minimum)}</b>
      </div>
      <div style="display:flex;flex-direction:column;gap:6px;margin-top:4px">
        ${Number.isFinite(disarankan) && html`<button class="btn" onClick=${() => aturTarget({ hargaJual: disarankan })}>Pakai ${rupiah(disarankan)} (dibulatkan)</button>`}
        <label class="bidang">
          <span>Harga jual per porsi</span>
          <${InputRupiah} kelas="input" nilai=${target.hargaJual} onUbah=${(n) => aturTarget({ hargaJual: n })} placeholder="mis. 8.000" />
        </label>
      </div>
    </div>

    ${adaHarga && !analisis.untung &&
    html`<div class="peringatan" role="alert"><b>Harga jual di bawah atau sama dengan HPP.</b>Setiap porsi yang terjual merugi ${rupiah(Math.abs(analisis.labaPorsi))}.</div>`}

    <div class="kartu">
      <div class="label-kecil" style="margin-bottom:4px">Untung per porsi</div>
      <div class="hasil-baris">
        <span>Laba per porsi</span>
        <b class=${adaHarga ? (analisis.untung ? 'baik' : 'buruk') : ''}>${adaHarga ? rupiah(analisis.labaPorsi) : '–'}</b>
      </div>
      <div class="hasil-baris">
        <span>Margin sebenarnya</span>
        <b class=${adaHarga ? (analisis.marginPersen >= target.marginTarget ? 'baik' : 'buruk') : ''}>${adaHarga ? persen(analisis.marginPersen) : '–'}</b>
      </div>
    </div>

    <div class="kartu">
      <div class="label-kecil" style="margin-bottom:10px">Titik impas dan target</div>
      <div class="dua-kolom">
        <label class="bidang"><span>Modal awal</span><${InputRupiah} kelas="input" nilai=${target.modalAwal} onUbah=${(n) => aturTarget({ modalAwal: n })} placeholder="mis. 1.500.000" /></label>
        <label class="bidang"><span>Laba yang diinginkan per bulan</span><${InputRupiah} kelas="input" nilai=${target.labaTargetBulanan} onUbah=${(n) => aturTarget({ labaTargetBulanan: n })} placeholder="mis. 3.000.000" /></label>
      </div>
      <div style="margin-top:6px">
        <div class="hasil-baris">
          <span>Balik modal (BEP)</span>
          <b>${analisis.bepPorsi ? `${angka(analisis.bepPorsi)} porsi` : '–'}</b>
        </div>
        ${analisis.bepResep && html`<div class="teks-kecil" style="text-align:right">≈ ${angka(analisis.bepResep)} kali membuat resep</div>`}
        <div class="hasil-baris">
          <span>Target jual per bulan</span>
          <b>${analisis.porsiBulan ? `${angka(analisis.porsiBulan)} porsi` : '–'}</b>
        </div>
        ${analisis.porsiBulan &&
        html`<div class="teks-kecil" style="text-align:right">${angka(analisis.porsiHari)} porsi/hari · ${angka(analisis.resepBulan)} resep/bulan</div>
          <div class="hasil-baris"><span>Omzet per bulan</span><b>${rupiah(analisis.omzetBulan)}</b></div>`}
        ${!adaHarga && html`<p class="bantu" style="margin-top:6px">Isi harga jual untuk melihat BEP dan target penjualan.</p>`}
      </div>
    </div>
  </div>`;

  return html`<div class="isi"><div class="kolom-2">${kiri}${kanan}</div></div>`;
}
