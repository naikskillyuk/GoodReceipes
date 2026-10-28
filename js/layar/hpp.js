// HPP & Harga: semua biaya dibawa ke "per 1 porsi", lalu harga jual, margin, BEP, dan target.
//   1. Bahan resep ÷ jumlah porsi
//   2. Resep tambahan (takaran per porsi, atau per satu kali masak ÷ jumlah porsi)
//   3. Biaya per resep (gas, tenaga, sewa) ÷ jumlah porsi
//   4. Biaya per porsi (kemasan, label, ongkir)
//   HPP per porsi = 1 + 2 + 3 + 4

import { html } from '../../vendor/preact-htm.js';
import { Kosong, InputRupiah, InputAngka } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tautan } from '../ui/router.js';
import { KartuHarga } from '../ui/harga.js';
import {
  dataHPP, eksperimenResep, targetResep, biayaLainResep, pilihanResepTambahan, tambahResepTambahan,
} from '../lib/repo.js';
import { analisisPenjualan } from '../lib/hpp.js';
import { rupiah, angka, tampilJumlah } from '../lib/util.js';

const PRESET = [
  { jenis: 'Kemasan', per: 'porsi' },
  { jenis: 'Gas dan listrik', per: 'resep' },
  { jenis: 'Tenaga kerja', per: 'resep' },
  { jenis: 'Sewa tempat', per: 'resep' },
  { jenis: 'Ongkos kirim', per: 'porsi' },
  { jenis: 'Label dan stiker', per: 'porsi' },
];

const TARGET_AWAL = { marginTarget: 40, hargaJual: 0, modalAwal: 0, labaTargetBulanan: 0 };

/** Satu baris tabel alur: nama, biaya satu kali masak, biaya per porsi. */
function BarisAlur({ nama, ket, resep, porsi, utama }) {
  return html`<tr class=${utama ? 'utama' : ''}>
    <td>${nama}${ket && html`<small class="teks-kecil"> · ${ket}</small>`}</td>
    <td>${rupiah(resep)}</td>
    <td>${rupiah(porsi)}</td>
  </tr>`;
}

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
  const satuan = dipakai && dipakai.satuanPorsi ? dipakai.satuanPorsi : 'porsi';
  const pilihan = pilihanResepTambahan(db, resep.id);
  const ubahTambahan = (rt, patch) => {
    const { id, idResep, idResepKomponen, jumlah, satuan, dipakaiPer, urutan } = rt;
    db.simpan('ResepTambahan', { id, idResep, idResepKomponen, jumlah, satuan, dipakaiPer, urutan, ...patch });
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

  const analisis = analisisPenjualan({
    hppPorsi,
    hargaJual: target.hargaJual,
    porsiPerResep: porsi,
    modalAwal: target.modalAwal,
    labaTargetBulanan: target.labaTargetBulanan,
  });
  const adaHarga = target.hargaJual > 0;
  const sudahDipakai = new Set(hpp.lain.map((b) => b.jenis.toLowerCase()));
  const lainResep = hpp.lain.filter((b) => b.dihitungPer !== 'porsi');
  const lainPorsi = hpp.lain.filter((b) => b.dihitungPer === 'porsi');
  const jumlahPorsi = `${angka(porsi, porsi % 1 ? 1 : 0)} ${satuan}`;

  const alur = html`<div class="kartu">
    <div class="label-kecil" style="margin-bottom:4px">Alur hitung HPP</div>
    <p class="bantu" style="margin:0 0 8px">Satu kali masak Eksperimen ${dipakai ? dipakai.nomor : '–'} menghasilkan <b>${jumlahPorsi}</b>. Semua biaya dibawa ke per ${satuan}, lalu dijumlahkan.</p>
    <div class="tabel-gulir">
      <table class="tabel-biaya tabel-alur">
        <thead>
          <tr><th></th><th>1 kali masak</th><th>Per ${satuan}</th></tr>
        </thead>
        <tbody>
          <tr class="kepala-langkah"><td colspan="3"><span class="no-langkah">1</span>Bahan resep <small class="teks-kecil">(÷ ${jumlahPorsi})</small></td></tr>
          <${BarisAlur} nama=${`Bahan Eksperimen ${dipakai ? dipakai.nomor : '–'}`} resep=${hpp.biayaBahan} porsi=${hpp.alur.bahan} />

          <tr class="kepala-langkah"><td colspan="3"><span class="no-langkah">2</span>Resep tambahan</td></tr>
          ${tambahan.rincian.length === 0
            ? html`<tr><td colspan="3" class="teks-kecil">Tidak ada</td></tr>`
            : tambahan.rincian.map(
                (t) => html`<${BarisAlur}
                  key=${t.id}
                  nama=${t.resep ? t.resep.nama : 'Resep terhapus'}
                  ket=${`${tampilJumlah(Number(t.jumlah) || 0)} ${t.satuan === 'resep' ? 'resep' : t.satuanPorsi || 'porsi'} ${t.dipakaiPer === 'porsi' ? `tiap ${satuan}` : 'tiap masak'}`}
                  resep=${t.biayaResep}
                  porsi=${t.biayaPorsi}
                />`,
              )}

          <tr class="kepala-langkah"><td colspan="3"><span class="no-langkah">3</span>Biaya per resep <small class="teks-kecil">(÷ ${jumlahPorsi})</small></td></tr>
          ${lainResep.length === 0
            ? html`<tr><td colspan="3" class="teks-kecil">Tidak ada</td></tr>`
            : lainResep.map((b) => html`<${BarisAlur} key=${b.id} nama=${b.jenis} resep=${b.total} porsi=${b.perPorsi} />`)}

          <tr class="kepala-langkah"><td colspan="3"><span class="no-langkah">4</span>Biaya per porsi <small class="teks-kecil">(× ${jumlahPorsi})</small></td></tr>
          ${lainPorsi.length === 0
            ? html`<tr><td colspan="3" class="teks-kecil">Tidak ada</td></tr>`
            : lainPorsi.map((b) => html`<${BarisAlur} key=${b.id} nama=${b.jenis} resep=${b.total} porsi=${b.perPorsi} />`)}
        </tbody>
        <tfoot>
          <tr><td>HPP (1 + 2 + 3 + 4)</td><td>${rupiah(hpp.totalResep)}</td><td>${rupiah(hppPorsi)}</td></tr>
        </tfoot>
      </table>
    </div>
  </div>`;

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

    ${alur}

    <div class="kartu">
      <div class="label-kecil" style="margin-bottom:4px"><span class="no-langkah">2</span>Resep tambahan</div>
      <p class="bantu" style="margin:0 0 10px">Resep lain yang ikut dipakai, mis. saus atau isian. Isi takarannya, lalu pilih takaran itu untuk <b>tiap ${satuan}</b> (mis. 30 gram saus per piring) atau untuk <b>1 kali masak</b> resep ini (mis. 1 resep saus untuk ${jumlahPorsi}).</p>
      ${tambahan.bermasalah.length > 0 &&
      html`<div class="peringatan" role="alert" style="margin-bottom:10px">
        <b>Ada resep tambahan yang biayanya belum lengkap:</b>
        ${tambahan.bermasalah.map((t) => `${t.resep ? t.resep.nama : 'resep terhapus'} (${t.alasan})`).join(', ')}.
      </div>`}
      <div class="kolom">
        ${tambahan.rincian.map((t) => {
          const nama = t.resep ? t.resep.nama : '';
          return html`<div class="biaya-lain-baris tambahan-baris" key=${t.id}>
            ${t.resep
              ? html`<a class="bl-nama" href=${tautan(`/resep/${t.resep.id}/hpp`)} style="font-weight:700;text-decoration:underline">${t.resep.nama}</a>`
              : html`<span class="bl-nama">Resep terhapus</span>`}
            <button class="ikon-btn" aria-label=${'Hapus ' + (nama || 'resep tambahan')} onClick=${() => db.hapus('ResepTambahan', t.id)}><${Ikon} nama="sampah" ukuran=${20} /></button>
            <div class="tambahan-isian">
              <${InputAngka} kelas="input kecil bl-nilai" nilai=${t.jumlah} aria-label=${'Jumlah ' + nama} onUbah=${(n) => Number.isFinite(n) && ubahTambahan(t, { jumlah: n })} />
              <select class="pilih kecil bl-per" aria-label=${'Satuan ' + nama} value=${t.satuan} onChange=${(e) => ubahTambahan(t, { satuan: e.target.value })}>
                <option value="porsi" selected=${t.satuan !== 'resep'}>${t.satuanPorsi || 'porsi'}</option>
                <option value="resep" selected=${t.satuan === 'resep'}>resep penuh</option>
              </select>
              <select class="pilih kecil bl-per" aria-label=${'Dipakai untuk ' + nama} value=${t.dipakaiPer} onChange=${(e) => ubahTambahan(t, { dipakaiPer: e.target.value })}>
                <option value="porsi" selected=${t.dipakaiPer === 'porsi'}>untuk tiap ${satuan}</option>
                <option value="resep" selected=${t.dipakaiPer !== 'porsi'}>untuk 1 kali masak</option>
              </select>
            </div>
            ${t.resep && Number.isFinite(t.perPorsi) &&
            html`<small class="teks-kecil" style="flex-basis:100%">
              ${rupiah(t.perPorsi)} per ${t.satuanPorsi || 'porsi'} (Eksperimen ${t.eksperimen.nomor}) → <b>${rupiah(t.biayaPorsi)} per ${satuan}</b> ${resep.nama}
            </small>`}
          </div>`;
        })}
        ${pilihan.length > 0
          ? html`<select class="pilih kecil" aria-label="Tambah resep tambahan" value="" onChange=${(e) => e.target.value && tambahResepTambahan(db, resep.id, e.target.value)}>
              <option value="" selected>+ Tambah resep lain…</option>
              ${pilihan.map((r) => html`<option value=${r.id}>${r.nama}</option>`)}
            </select>`
          : tambahan.rincian.length === 0 && html`<p class="bantu" style="margin:0">Belum ada resep lain yang bisa ditambahkan.</p>`}
      </div>
    </div>

    <div class="kartu">
      <div class="label-kecil" style="margin-bottom:4px"><span class="no-langkah">3</span><span class="no-langkah">4</span>Biaya lain</div>
      <p class="bantu" style="margin:0 0 10px"><b>Per resep</b>: dibayar sekali tiap masak lalu dibagi ${jumlahPorsi} (gas, tenaga, sewa). <b>Per porsi</b>: setiap ${satuan} kena biaya ini (kemasan, label, ongkir).</p>
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
      <div class="label-kecil">HPP per ${satuan}</div>
      <div class="besar">${rupiah(hppPorsi)}</div>
      <small>${rupiah(hpp.totalResep)} ÷ ${jumlahPorsi}</small>
      <div class="hpp-pecah">
        <span>Biaya produksi (1 + 2 + 3)</span><b>${rupiah(hpp.produksiPorsi)}</b>
        <span>Biaya per porsi (4)</span><b>${rupiah(hpp.alur.biayaPorsi)}</b>
      </div>
    </div>

    <${KartuHarga} key=${resep.id} hpp=${hppPorsi} marginTarget=${target.marginTarget} hargaJual=${target.hargaJual} onUbah=${aturTarget} unit=${satuan} />

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

    <a class="pil navy" href=${tautan('/paket')}>Hitung HPP paket<span class="ujung"><${Ikon} nama="kalkulator" /></span></a>
  </div>`;

  return html`<div class="isi"><div class="kolom-2">${kiri}${kanan}</div></div>`;
}
