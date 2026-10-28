// HPP & Harga, disusun sebagai langkah. Setiap langkah langsung menampilkan hasilnya per porsi:
//   1. Bahan resep ÷ jumlah porsi
//   2. Resep tambahan (takaran untuk tiap porsi, atau untuk 1 kali masak ÷ jumlah porsi)
//   3. Biaya sekali masak (gas, tenaga, sewa) ÷ jumlah porsi
//   4. Biaya tiap porsi (kemasan, label, ongkir)
//   HPP per porsi = 1 + 2 + 3 + 4, lalu harga jual, untung, BEP, dan target.

import { html } from '../../vendor/preact-htm.js';
import { Kosong, InputRupiah, InputAngka } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tautan } from '../ui/router.js';
import { KartuHarga } from '../ui/harga.js';
import {
  dataHPP, eksperimenResep, targetResep, biayaLainResep, pilihanResepTambahan, tambahResepTambahan,
} from '../lib/repo.js';
import { analisisPenjualan, marginDariHarga } from '../lib/hpp.js';
import { rupiah, angka, persen } from '../lib/util.js';

const PRESET_MASAK = ['Gas dan listrik', 'Tenaga kerja', 'Sewa tempat'];
const PRESET_PORSI = ['Kemasan', 'Label dan stiker', 'Ongkos kirim'];

const TARGET_AWAL = { marginTarget: 40, hargaJual: 0, modalAwal: 0, labaTargetBulanan: 0 };

/** Kartu satu langkah: nomor, judul, penjelasan singkat, isian, dan hasil per porsi di bawahnya. */
export function Langkah({ no, judul, bantu, hasil, rumus, unit, children }) {
  return html`<section class="kartu langkah">
    <header class="langkah-kepala">
      <span class="no-langkah">${no}</span>
      <div>
        <h3>${judul}</h3>
        ${bantu && html`<p class="bantu">${bantu}</p>`}
      </div>
    </header>
    ${children}
    <div class="langkah-hasil">
      <span>${rumus || ''}</span>
      <b>${rupiah(hasil)}<small> / ${unit}</small></b>
    </div>
  </section>`;
}

/** Daftar biaya (nama + nilai + hapus) dengan tombol cepat untuk menambah. */
function DaftarBiaya({ db, idResep, daftar, per, preset, sudah }) {
  const tambah = (jenis) => db.simpan('BiayaLain', { idResep, jenis, nilai: 0, dihitungPer: per, urutan: biayaLainResep(db, idResep).length });
  const ubah = (b, patch) => db.simpan('BiayaLain', { ...b, ...patch });
  return html`<div class="kolom">
    ${daftar.map(
      (b) => html`<div class="baris-biaya" key=${b.id}>
        <input class="input kecil" aria-label="Jenis biaya" value=${b.jenis} onInput=${(e) => ubah(b, { jenis: e.target.value })} />
        <${InputRupiah} kelas="input kecil" nilai=${b.nilai} aria-label=${'Nilai ' + b.jenis} onUbah=${(n) => ubah(b, { nilai: n })} />
        <button class="ikon-btn" aria-label=${'Hapus ' + b.jenis} onClick=${() => db.hapus('BiayaLain', b.id)}><${Ikon} nama="sampah" ukuran=${20} /></button>
      </div>`,
    )}
    <div class="chips">
      ${preset.filter((j) => !sudah.has(j.toLowerCase())).map(
        (j) => html`<button type="button" class="chip putus" onClick=${() => tambah(j)}><${Ikon} nama="plus" ukuran=${16} />${j}</button>`,
      )}
      <button type="button" class="chip putus" onClick=${() => tambah('Biaya lain')}><${Ikon} nama="plus" ukuran=${16} />Lainnya</button>
    </div>
  </div>`;
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
  const unit = dipakai && dipakai.satuanPorsi ? dipakai.satuanPorsi : 'porsi';
  const jumlahPorsi = `${angka(porsi, porsi % 1 ? 1 : 0)} ${unit}`;
  const hppPorsi = hpp.hppPorsi;
  const pilihan = pilihanResepTambahan(db, resep.id);
  const semuaBiaya = biayaLainResep(db, resep.id);
  const biayaMasak = semuaBiaya.filter((b) => b.dihitungPer !== 'porsi');
  const biayaPorsi = semuaBiaya.filter((b) => b.dihitungPer === 'porsi');
  const sudah = new Set(semuaBiaya.map((b) => (b.jenis || '').toLowerCase()));

  const ubahTambahan = (rt, patch) => {
    const { id, idResep, idResepKomponen, jumlah, satuan, dipakaiPer, urutan } = rt;
    db.simpan('ResepTambahan', { id, idResep, idResepKomponen, jumlah, satuan, dipakaiPer, urutan, ...patch });
  };
  const aturTarget = (patch) => {
    const ada = targetResep(db, resep.id);
    db.simpan('Target', { ...TARGET_AWAL, ...(ada || { idResep: resep.id }), ...patch });
  };

  const analisis = analisisPenjualan({
    hppPorsi,
    hargaJual: target.hargaJual,
    porsiPerResep: porsi,
    modalAwal: target.modalAwal,
    labaTargetBulanan: target.labaTargetBulanan,
  });
  const adaHarga = target.hargaJual > 0;
  const untung = marginDariHarga(hppPorsi, target.hargaJual);

  // ---------- Ringkasan di atas: jawaban dulu ----------
  const ringkas = html`<div class="ringkas-hpp" aria-label="Ringkasan">
    <div><small>Modal (HPP)</small><b>${rupiah(hppPorsi)}</b><small>per ${unit}</small></div>
    <div><small>Harga jual</small><b>${adaHarga ? rupiah(target.hargaJual) : '–'}</b><small>${adaHarga ? 'per ' + unit : 'belum diisi'}</small></div>
    <div class=${adaHarga ? (untung.laba > 0 ? 'baik' : 'buruk') : ''}>
      <small>Untung</small><b>${adaHarga ? rupiah(untung.laba) : '–'}</b><small>${adaHarga ? 'margin ' + persen(untung.marginPersen) : 'isi harga jual'}</small>
    </div>
  </div>`;

  // ---------- Langkah 1–4 ----------
  const langkah1 = html`<${Langkah}
    no="1"
    judul="Bahan resep"
    bantu=${`Satu kali masak menghasilkan ${jumlahPorsi}. Harga bahan mengikuti Daftar Bahan terbaru.`}
    hasil=${hpp.alur.bahan}
    rumus=${`${rupiah(hpp.biayaBahan)} ÷ ${jumlahPorsi}`}
    unit=${unit}
  >
    <label class="bidang">
      <span>Eksperimen yang dihitung</span>
      <select class="pilih" value=${dipakai ? dipakai.id : ''} onChange=${(e) => aturTarget({ idEksperimenHitung: e.target.value })}>
        ${eksperimen.map((e) => html`<option value=${e.id} selected=${dipakai && dipakai.id === e.id}>Eksperimen ${e.nomor}${resep.idJuara === e.id ? ' (juara)' : ''} · ${angka(Number(e.porsi) || 0)} ${e.satuanPorsi || 'porsi'}</option>`)}
      </select>
    </label>
    ${biaya.bermasalah.length > 0 &&
    html`<div class="peringatan" role="alert">
      <b>Ada bahan yang biayanya belum bisa dihitung:</b>
      ${biaya.bermasalah.map((b) => (b.bahan ? b.bahan.nama : 'bahan terhapus') + ` (${b.jumlah} ${b.satuan})`).join(', ')}.
      Periksa harga, isi kemasan, atau konversi satuannya di <a href=${tautan('/bahan')} style="text-decoration:underline">Daftar Bahan</a>.
    </div>`}
  <//>`;

  const langkah2 = html`<${Langkah}
    no="2"
    judul="Resep tambahan"
    bantu="Resep lain yang ikut dipakai, mis. saus, isian, atau topping. Lewati bila tidak ada."
    hasil=${hpp.alur.resepTambahan}
    rumus=${tambahan.rincian.length ? 'Jumlah resep tambahan' : 'Tidak ada'}
    unit=${unit}
  >
    ${tambahan.bermasalah.length > 0 &&
    html`<div class="peringatan" role="alert">
      <b>Ada resep tambahan yang biayanya belum lengkap:</b>
      ${tambahan.bermasalah.map((t) => `${t.resep ? t.resep.nama : 'resep terhapus'} (${t.alasan})`).join(', ')}.
    </div>`}
    ${tambahan.rincian.map((t) => {
      const nama = t.resep ? t.resep.nama : '';
      return html`<div class="baris-tambahan" key=${t.id}>
        <div class="baris-tambahan-atas">
          ${t.resep
            ? html`<a href=${tautan(`/resep/${t.resep.id}/hpp`)}>${t.resep.nama}</a>`
            : html`<span>Resep terhapus</span>`}
          <b>${rupiah(t.biayaPorsi)}<small> / ${unit}</small></b>
          <button class="ikon-btn" aria-label=${'Hapus ' + (nama || 'resep tambahan')} onClick=${() => db.hapus('ResepTambahan', t.id)}><${Ikon} nama="sampah" ukuran=${20} /></button>
        </div>
        <div class="kalimat-isian">
          <span>Pakai</span>
          <${InputAngka} kelas="input kecil" nilai=${t.jumlah} aria-label=${'Jumlah ' + nama} onUbah=${(n) => Number.isFinite(n) && ubahTambahan(t, { jumlah: n })} />
          <select class="pilih kecil" aria-label=${'Satuan ' + nama} value=${t.satuan} onChange=${(e) => ubahTambahan(t, { satuan: e.target.value })}>
            <option value="porsi" selected=${t.satuan !== 'resep'}>${t.satuanPorsi || 'porsi'}</option>
            <option value="resep" selected=${t.satuan === 'resep'}>resep penuh</option>
          </select>
          <select class="pilih kecil" aria-label=${'Dipakai untuk ' + nama} value=${t.dipakaiPer} onChange=${(e) => ubahTambahan(t, { dipakaiPer: e.target.value })}>
            <option value="porsi" selected=${t.dipakaiPer === 'porsi'}>untuk setiap ${unit}</option>
            <option value="resep" selected=${t.dipakaiPer !== 'porsi'}>untuk 1 kali masak (${jumlahPorsi})</option>
          </select>
        </div>
        ${t.resep && Number.isFinite(t.perPorsi) &&
        html`<small class="teks-kecil">Harga ${t.resep.nama}: ${rupiah(t.perPorsi)} per ${t.satuanPorsi || 'porsi'}${t.dipakaiPer === 'porsi' ? '' : ` · ${rupiah(t.biaya)} ÷ ${jumlahPorsi}`}</small>`}
      </div>`;
    })}
    ${pilihan.length > 0
      ? html`<select class="pilih kecil" aria-label="Tambah resep tambahan" value="" onChange=${(e) => e.target.value && tambahResepTambahan(db, resep.id, e.target.value)}>
          <option value="" selected>+ Tambah resep lain…</option>
          ${pilihan.map((r) => html`<option value=${r.id}>${r.nama}</option>`)}
        </select>`
      : tambahan.rincian.length === 0 && html`<p class="bantu" style="margin:0">Belum ada resep lain yang bisa ditambahkan.</p>`}
  <//>`;

  const langkah3 = html`<${Langkah}
    no="3"
    judul="Biaya sekali masak"
    bantu=${`Dibayar sekali setiap masak, lalu dibagi ${jumlahPorsi}. Mis. gas, listrik, tenaga kerja.`}
    hasil=${hpp.alur.biayaResep}
    rumus=${`${rupiah(hpp.totalLainResep)} ÷ ${jumlahPorsi}`}
    unit=${unit}
  >
    <${DaftarBiaya} db=${db} idResep=${resep.id} daftar=${biayaMasak} per="resep" preset=${PRESET_MASAK} sudah=${sudah} />
  <//>`;

  const langkah4 = html`<${Langkah}
    no="4"
    judul=${`Biaya setiap ${unit}`}
    bantu=${`Dikenakan pada setiap ${unit} yang dijual. Mis. kemasan, label, ongkir.`}
    hasil=${hpp.alur.biayaPorsi}
    rumus=${biayaPorsi.length ? 'Jumlah biaya' : 'Tidak ada'}
    unit=${unit}
  >
    <${DaftarBiaya} db=${db} idResep=${resep.id} daftar=${biayaPorsi} per="porsi" preset=${PRESET_PORSI} sudah=${sudah} />
  <//>`;

  // ---------- Hasil ----------
  const baris = [
    ['1', 'Bahan resep', hpp.alur.bahan],
    ['2', 'Resep tambahan', hpp.alur.resepTambahan],
    ['3', 'Biaya sekali masak', hpp.alur.biayaResep],
    ['4', `Biaya setiap ${unit}`, hpp.alur.biayaPorsi],
  ];
  const kartuHPP = html`<div class="kartu-hpp">
    <div class="label-kecil">HPP (modal) per ${unit}</div>
    <div class="besar">${rupiah(hppPorsi)}</div>
    <div class="hpp-pecah">
      ${baris.map(([no, nama, nilai]) => html`<span><i class="no-mini">${no}</i>${nama}</span><b>${rupiah(nilai)}</b>`)}
    </div>
    <small class="hpp-catatan">Sekali masak (${jumlahPorsi}): ${rupiah(hpp.totalResep)}</small>
  </div>`;

  const kartuTarget = html`<div class="kartu">
    <div class="label-kecil" style="margin-bottom:4px">Kapan balik modal?</div>
    <p class="bantu" style="margin:0 0 10px">Opsional. Isi modal awal dan untung yang Anda inginkan per bulan.</p>
    <div class="dua-kolom">
      <label class="bidang"><span>Modal awal</span><${InputRupiah} kelas="input" nilai=${target.modalAwal} onUbah=${(n) => aturTarget({ modalAwal: n })} placeholder="mis. 1.500.000" /></label>
      <label class="bidang"><span>Untung yang diinginkan per bulan</span><${InputRupiah} kelas="input" nilai=${target.labaTargetBulanan} onUbah=${(n) => aturTarget({ labaTargetBulanan: n })} placeholder="mis. 3.000.000" /></label>
    </div>
    ${adaHarga
      ? html`<div style="margin-top:6px">
          <div class="hasil-baris">
            <span>Balik modal setelah terjual</span>
            <b>${analisis.bepPorsi ? `${angka(analisis.bepPorsi)} porsi` : '–'}</b>
          </div>
          ${analisis.bepResep && html`<div class="teks-kecil" style="text-align:right">≈ ${angka(analisis.bepResep)} kali masak</div>`}
          <div class="hasil-baris">
            <span>Harus terjual per bulan</span>
            <b>${analisis.porsiBulan ? `${angka(analisis.porsiBulan)} porsi` : '–'}</b>
          </div>
          ${analisis.porsiBulan &&
          html`<div class="teks-kecil" style="text-align:right">${angka(analisis.porsiHari)} porsi/hari · ${angka(analisis.resepBulan)} kali masak/bulan</div>
            <div class="hasil-baris"><span>Omzet per bulan</span><b>${rupiah(analisis.omzetBulan)}</b></div>`}
        </div>`
      : html`<p class="bantu" style="margin-top:8px">Isi harga jual dulu untuk melihat hasilnya.</p>`}
  </div>`;

  return html`<div class="isi">
    ${ringkas}
    <div class="kolom-2">
      <div class="kolom">
        <h2 class="judul-langkah">Hitung modal per ${unit}</h2>
        ${langkah1}${langkah2}${langkah3}${langkah4}
      </div>
      <div class="kolom kolom-hasil">
        <h2 class="judul-langkah">Hasil</h2>
        ${kartuHPP}
        <${KartuHarga} key=${resep.id} hpp=${hppPorsi} marginTarget=${target.marginTarget} hargaJual=${target.hargaJual} onUbah=${aturTarget} unit=${unit} />
        ${kartuTarget}
        <a class="pil navy" href=${tautan('/paket')}>Hitung HPP paket<span class="ujung"><${Ikon} nama="kalkulator" /></span></a>
      </div>
    </div>
  </div>`;
}
