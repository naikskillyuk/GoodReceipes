// Dua tab HPP di halaman resep.
//
// HPP Resep: tetapkan HPP per porsi resep ini, lalu tekan "Simpan HPP".
//   1. Bahan resep ÷ jumlah porsi
//   2. Biaya sekali masak (gas, tenaga kerja) ÷ jumlah porsi
//   3. Biaya per porsi (seasoning, minyak, label)
//   4. Packing per porsi (dicatat terpisah, supaya tidak terhitung dua kali di resep lain atau paket)
//
// HPP Jual: HPP resep tersimpan + HPP resep lain (tanpa packing) -> margin -> harga jual, untung, BEP.

import { html } from '../../vendor/preact-htm.js';
import { Kosong, InputRupiah, InputAngka } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tautan } from '../ui/router.js';
import { tampilToast } from '../ui/pesan.js';
import { KartuHarga } from '../ui/harga.js';
import {
  dataHPP, eksperimenResep, targetResep, biayaLainResep, pilihanResepTambahan, tambahResepTambahan, simpanHPPResep, denganLogResep,
} from '../lib/repo.js';
import { analisisPenjualan, marginDariHarga } from '../lib/hpp.js';
import { rupiah, angka, persen, tanggal } from '../lib/util.js';

const PRESET = {
  resep: ['Gas dan listrik', 'Tenaga kerja', 'Sewa tempat'],
  porsi: ['Seasoning', 'Minyak goreng', 'Label dan stiker'],
  packing: ['Packing', 'Kantong', 'Sendok dan tisu'],
};
const MIRIP_PACKING = /kemasan|packing|kotak|dus|kantong|cup|plastik/i;

const TARGET_AWAL = { marginTarget: 40, hargaJual: 0, modalAwal: 0, labaTargetBulanan: 0 };

function aturTargetResep(db, idResep, patch) {
  const ada = targetResep(db, idResep);
  db.simpan('Target', { ...TARGET_AWAL, ...(ada || { idResep }), ...patch });
}

function BelumAdaEksperimen({ resep }) {
  return html`<div class="isi">
    <${Kosong} judul="Belum bisa menghitung HPP" teks="HPP dihitung dari bahan dan takaran sebuah eksperimen. Catat eksperimen dulu.">
      <a class="btn solid" href=${tautan(`/resep/${resep.id}/eksperimen/baru`)}>Catat eksperimen</a>
    <//>
  </div>`;
}

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
function DaftarBiaya({ db, idResep, daftar, per, sudah }) {
  const tambah = (jenis) => db.simpan('BiayaLain', { idResep, jenis, nilai: 0, dihitungPer: per, urutan: biayaLainResep(db, idResep).length });
  const ubah = (b, patch) => db.simpan('BiayaLain', { ...b, ...patch });
  return html`<div class="kolom">
    ${daftar.map(
      (b) => html`<div key=${b.id}>
        <div class="baris-biaya">
          <input class="input kecil" aria-label="Jenis biaya" value=${b.jenis} onInput=${(e) => ubah(b, { jenis: e.target.value })} />
          <${InputRupiah} kelas="input kecil" nilai=${b.nilai} aria-label=${'Nilai ' + b.jenis} onUbah=${(n) => ubah(b, { nilai: n })} />
          <button class="ikon-btn" aria-label=${'Hapus ' + b.jenis} onClick=${() => db.hapus('BiayaLain', b.id)}><${Ikon} nama="sampah" ukuran=${20} /></button>
        </div>
        ${per === 'porsi' && MIRIP_PACKING.test(b.jenis || '') &&
        html`<button type="button" class="tautan-kecil" onClick=${() => ubah(b, { dihitungPer: 'packing' })}>Ini packing? Pindahkan ke langkah 4</button>`}
      </div>`,
    )}
    <div class="chips">
      ${PRESET[per].filter((j) => !sudah.has(j.toLowerCase())).map(
        (j) => html`<button type="button" class="chip putus" onClick=${() => tambah(j)}><${Ikon} nama="plus" ukuran=${16} />${j}</button>`,
      )}
      <button type="button" class="chip putus" onClick=${() => tambah(per === 'packing' ? 'Packing lain' : 'Biaya lain')}><${Ikon} nama="plus" ukuran=${16} />Lainnya</button>
    </div>
  </div>`;
}

// ====================== Tab HPP Resep ======================

export function PanelHPPResep({ k, resep }) {
  const { db } = k;
  const eksperimen = eksperimenResep(db, resep.id);
  if (eksperimen.length === 0) return html`<${BelumAdaEksperimen} resep=${resep} />`;

  const d = dataHPP(db, resep.id);
  const { hpp, biaya, eksperimen: dipakai, porsi } = d;
  const unit = d.satuanPorsi;
  const jumlahPorsi = `${angka(porsi, porsi % 1 ? 1 : 0)} ${unit}`;
  const semua = biayaLainResep(db, resep.id);
  const kelompok = (per) => semua.filter((b) => (b.dihitungPer === 'porsi' || b.dihitungPer === 'packing' ? b.dihitungPer : 'resep') === per);
  const sudah = new Set(semua.map((b) => (b.jenis || '').toLowerCase()));
  const bisaSimpan = Number.isFinite(hpp.hppPorsi);

  const simpan = () => {
    if (!simpanHPPResep(db, resep.id)) return;
    tampilToast(`HPP ${resep.nama} disimpan: ${rupiah(hpp.hppPorsi)} per ${unit}.`);
  };

  const kiri = html`<div class="kolom">
    <${Langkah} no="1" judul="Bahan resep" unit=${unit}
      bantu=${`Satu kali masak menghasilkan ${jumlahPorsi}. Harga bahan mengikuti Daftar Bahan terbaru.`}
      hasil=${hpp.alur.bahan} rumus=${`${rupiah(hpp.biayaBahan)} ÷ ${jumlahPorsi}`}>
      <label class="bidang">
        <span>Eksperimen yang dihitung</span>
        <select class="pilih" value=${dipakai ? dipakai.id : ''} onChange=${(e) => { const pilih = eksperimen.find((x) => x.id === e.target.value); denganLogResep(db, resep.id, `HPP dihitung dari Eksperimen ${pilih ? pilih.nomor : ''}`, () => aturTargetResep(db, resep.id, { idEksperimenHitung: e.target.value })); }}>
          ${eksperimen.map((e) => html`<option value=${e.id} selected=${dipakai && dipakai.id === e.id}>Eksperimen ${e.nomor}${resep.idJuara === e.id ? ' (juara)' : ''} · ${angka(Number(e.porsi) || 0)} ${e.satuanPorsi || 'porsi'}</option>`)}
        </select>
      </label>
      ${biaya.bermasalah.length > 0 &&
      html`<div class="peringatan" role="alert">
        <b>Ada bahan yang biayanya belum bisa dihitung:</b>
        ${biaya.bermasalah.map((b) => (b.bahan ? b.bahan.nama : 'bahan terhapus') + ` (${b.jumlah} ${b.satuan})`).join(', ')}.
        Periksa harga, isi kemasan, atau konversi satuannya di <a href=${tautan('/bahan')} style="text-decoration:underline">Daftar Bahan</a>.
      </div>`}
    <//>

    <${Langkah} no="2" judul="Biaya sekali masak" unit=${unit}
      bantu=${`Isi biaya untuk satu kali masak; otomatis dibagi ${jumlahPorsi}. Mis. gas, listrik, tenaga kerja.`}
      hasil=${hpp.alur.biayaResep} rumus=${`${rupiah(hpp.totalLainResep)} ÷ ${jumlahPorsi}`}>
      <${DaftarBiaya} db=${db} idResep=${resep.id} daftar=${kelompok('resep')} per="resep" sudah=${sudah} />
    <//>

    <${Langkah} no="3" judul=${`Biaya per ${unit}`} unit=${unit}
      bantu=${`Isi biaya untuk satu ${unit}. Mis. seasoning, minyak, label.`}
      hasil=${hpp.alur.biayaPorsi} rumus=${kelompok('porsi').length ? 'Jumlah biaya' : 'Tidak ada'}>
      <${DaftarBiaya} db=${db} idResep=${resep.id} daftar=${kelompok('porsi')} per="porsi" sudah=${sudah} />
    <//>

    <${Langkah} no="4" judul="Packing" unit=${unit}
      bantu=${`Kemasan untuk satu ${unit}. Dicatat terpisah: saat resep ini dipakai di resep lain atau di paket, packing-nya tidak ikut.`}
      hasil=${hpp.alur.packing} rumus=${kelompok('packing').length ? 'Jumlah packing' : 'Tidak ada'}>
      <${DaftarBiaya} db=${db} idResep=${resep.id} daftar=${kelompok('packing')} per="packing" sudah=${sudah} />
    <//>
  </div>`;

  const baris = [
    ['1', 'Bahan resep', hpp.alur.bahan],
    ['2', 'Biaya sekali masak', hpp.alur.biayaResep],
    ['3', `Biaya per ${unit}`, hpp.alur.biayaPorsi],
    ['4', 'Packing', hpp.alur.packing],
  ];

  let status;
  if (!d.tersimpan) {
    status = html`<div class="status-simpan belum"><b>Belum disimpan.</b> Simpan supaya angka ini dipakai di HPP Jual, resep lain, dan paket.</div>`;
  } else if (d.berubah) {
    status = html`<div class="status-simpan berubah"><b>Hitungan berubah.</b> Tersimpan ${rupiah(d.hppPorsi)}, sekarang ${rupiah(hpp.hppPorsi)} (mis. harga bahan berubah). Simpan ulang untuk memakai angka baru.</div>`;
  } else {
    status = html`<div class="status-simpan sudah"><${Ikon} nama="centang" ukuran=${18} /><span><b>Tersimpan</b>${d.disimpanPada ? ` · ${tanggal(d.disimpanPada)}` : ''}</span></div>`;
  }

  const kanan = html`<div class="kolom">
    <div class="kartu-hpp">
      <div class="label-kecil">HPP resep per ${unit}</div>
      <div class="besar">${rupiah(hpp.hppPorsi)}</div>
      <div class="hpp-pecah">
        ${baris.map(([no, nama, nilai]) => html`<span><i class="no-mini">${no}</i>${nama}</span><b>${rupiah(nilai)}</b>`)}
      </div>
      <small class="hpp-catatan">Tanpa packing: ${rupiah(hpp.tanpaPacking)} · Sekali masak: ${rupiah(hpp.totalResep)}</small>
    </div>
    <div class="kartu kolom">
      ${status}
      ${(!d.tersimpan || d.berubah) &&
      html`<button class="btn solid" disabled=${!bisaSimpan} onClick=${simpan}><${Ikon} nama="centang" ukuran=${18} />${d.tersimpan ? 'Simpan ulang' : 'Simpan HPP'} ${rupiah(hpp.hppPorsi)}</button>`}
      <a class="pil navy" href=${tautan(`/resep/${resep.id}/jual`)}>Lanjut ke HPP Jual<span class="ujung"><${Ikon} nama="kalkulator" /></span></a>
    </div>
  </div>`;

  return html`<div class="isi"><div class="kolom-2">${kiri}${kanan}</div></div>`;
}

// ====================== Tab HPP Jual ======================

export function PanelHPPJual({ k, resep }) {
  const { db } = k;
  const eksperimen = eksperimenResep(db, resep.id);
  if (eksperimen.length === 0) return html`<${BelumAdaEksperimen} resep=${resep} />`;

  const d = dataHPP(db, resep.id);
  const target = { ...TARGET_AWAL, ...(d.target || {}) };
  const { tambahan } = d;
  const unit = d.satuanPorsi;
  const hppJual = d.hppJual;
  const pilihan = pilihanResepTambahan(db, resep.id);
  const aturTarget = (patch) => aturTargetResep(db, resep.id, patch);
  const ubahTambahan = (rt, patch) => {
    const { id, idResep, idResepKomponen, jumlah, satuan, dipakaiPer, urutan } = rt;
    db.simpan('ResepTambahan', { id, idResep, idResepKomponen, jumlah, satuan, dipakaiPer, urutan, ...patch });
  };

  const analisis = analisisPenjualan({
    hppPorsi: hppJual,
    hargaJual: target.hargaJual,
    porsiPerResep: d.porsi,
    modalAwal: target.modalAwal,
    labaTargetBulanan: target.labaTargetBulanan,
  });
  const adaHarga = target.hargaJual > 0;
  const untung = marginDariHarga(hppJual, target.hargaJual);

  const ringkas = html`<div class="ringkas-hpp" aria-label="Ringkasan">
    <div><small>HPP jual</small><b>${rupiah(hppJual)}</b><small>per ${unit}</small></div>
    <div><small>Harga jual</small><b>${adaHarga ? rupiah(target.hargaJual) : '–'}</b><small>${adaHarga ? 'per ' + unit : 'belum diisi'}</small></div>
    <div class=${adaHarga ? (untung.laba > 0 ? 'baik' : 'buruk') : ''}>
      <small>Untung</small><b>${adaHarga ? rupiah(untung.laba) : '–'}</b><small>${adaHarga ? 'margin ' + persen(untung.marginPersen) : 'isi harga jual'}</small>
    </div>
  </div>`;

  const kiri = html`<div class="kolom">
    <${Langkah} no="1" judul="HPP resep ini" unit=${unit}
      bantu=${`HPP ${resep.nama} per ${unit} dari tab HPP Resep, sudah termasuk packing.`}
      hasil=${d.hppPorsi} rumus=${d.tersimpan ? 'Tersimpan' : 'Belum disimpan'}>
      ${!d.tersimpan &&
      html`<div class="status-simpan belum"><b>HPP resep belum disimpan.</b> Sementara memakai hitungan saat ini. <a href=${tautan(`/resep/${resep.id}/hpp`)}>Simpan di tab HPP Resep</a></div>`}
      ${d.berubah &&
      html`<div class="status-simpan berubah"><b>Hitungan HPP resep berubah</b> (sekarang ${rupiah(d.hpp.hppPorsi)}). <a href=${tautan(`/resep/${resep.id}/hpp`)}>Simpan ulang di tab HPP Resep</a></div>`}
      ${d.tersimpan && !d.berubah && html`<a class="tautan-kecil" href=${tautan(`/resep/${resep.id}/hpp`)}>Ubah di tab HPP Resep</a>`}
    <//>

    <${Langkah} no="2" judul="HPP resep lain" unit=${unit}
      bantu=${`Resep lain yang ikut dalam satu ${unit} yang dijual, mis. saus, sambal, topping. Dipakai HPP tersimpannya tanpa packing.`}
      hasil=${tambahan.totalPorsi} rumus=${tambahan.rincian.length ? 'Jumlah resep lain' : 'Tidak ada'}>
      ${tambahan.bermasalah.length > 0 &&
      html`<div class="peringatan" role="alert">
        <b>Ada resep yang HPP-nya belum bisa dihitung:</b>
        ${tambahan.bermasalah.map((t) => `${t.resep ? t.resep.nama : 'resep terhapus'} (${t.alasan})`).join(', ')}.
      </div>`}
      ${tambahan.rincian.map((t) => {
        const nama = t.resep ? t.resep.nama : '';
        const kp = t.komponen;
        return html`<div class="baris-tambahan" key=${t.id}>
          <div class="baris-tambahan-atas">
            ${t.resep ? html`<a href=${tautan(`/resep/${t.resep.id}/hpp`)}>${t.resep.nama}</a>` : html`<span>Resep terhapus</span>`}
            <b>${rupiah(t.biayaPorsi)}<small> / ${unit}</small></b>
            <button class="ikon-btn" aria-label=${'Hapus ' + (nama || 'resep lain')} onClick=${() => db.hapus('ResepTambahan', t.id)}><${Ikon} nama="sampah" ukuran=${20} /></button>
          </div>
          ${kp && kp.eksperimen &&
          html`<div class="kalimat-isian">
            <span>Pakai</span>
            <${InputAngka} kelas="input kecil" nilai=${t.jumlah} aria-label=${'Jumlah ' + nama} onUbah=${(n) => Number.isFinite(n) && ubahTambahan(t, { jumlah: n })} />
            <select class="pilih kecil" aria-label=${'Satuan ' + nama} value=${t.satuan} onChange=${(e) => ubahTambahan(t, { satuan: e.target.value })}>
              <option value="porsi" selected=${t.satuan !== 'resep'}>${kp.satuanPorsi}</option>
              <option value="resep" selected=${t.satuan === 'resep'}>resep penuh (${angka(kp.porsi)} ${kp.satuanPorsi})</option>
            </select>
            <span>untuk ${t.dipakaiPer === 'porsi' ? `setiap ${unit}` : `1 kali masak (${angka(d.porsi)} ${unit})`}</span>
          </div>`}
          ${kp && kp.eksperimen &&
          html`<small class="teks-kecil">HPP ${nama}: ${rupiah(t.perSatuan)} per ${kp.satuanPorsi} tanpa packing${kp.tersimpan ? '' : ' (belum disimpan, memakai hitungan saat ini)'}</small>`}
          ${t.dipakaiPer !== 'porsi' &&
          html`<button type="button" class="tautan-kecil" onClick=${() => ubahTambahan(t, { dipakaiPer: 'porsi' })}>Ubah jadi takaran untuk setiap ${unit}</button>`}
        </div>`;
      })}
      ${pilihan.length > 0
        ? html`<select class="pilih kecil" aria-label="Tambah resep lain" value="" onChange=${(e) => e.target.value && tambahResepTambahan(db, resep.id, e.target.value)}>
            <option value="" selected>+ Tambah resep lain…</option>
            ${pilihan.map((r) => html`<option value=${r.id}>${r.nama}</option>`)}
          </select>`
        : tambahan.rincian.length === 0 && html`<p class="bantu" style="margin:0">Belum ada resep lain yang bisa ditambahkan.</p>`}
    <//>
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
            <b>${analisis.bepPorsi ? `${angka(analisis.bepPorsi)} ${unit}` : '–'}</b>
          </div>
          ${analisis.bepResep && html`<div class="teks-kecil" style="text-align:right">≈ ${angka(analisis.bepResep)} kali masak</div>`}
          <div class="hasil-baris">
            <span>Harus terjual per bulan</span>
            <b>${analisis.porsiBulan ? `${angka(analisis.porsiBulan)} ${unit}` : '–'}</b>
          </div>
          ${analisis.porsiBulan &&
          html`<div class="teks-kecil" style="text-align:right">${angka(analisis.porsiHari)} ${unit}/hari · ${angka(analisis.resepBulan)} kali masak/bulan</div>
            <div class="hasil-baris"><span>Omzet per bulan</span><b>${rupiah(analisis.omzetBulan)}</b></div>`}
        </div>`
      : html`<p class="bantu" style="margin-top:8px">Isi harga jual dulu untuk melihat hasilnya.</p>`}
  </div>`;

  const kanan = html`<div class="kolom">
    <div class="kartu-hpp">
      <div class="label-kecil">HPP jual per ${unit}</div>
      <div class="besar">${rupiah(hppJual)}</div>
      <div class="hpp-pecah">
        <span><i class="no-mini">1</i>HPP resep ini</span><b>${rupiah(d.hppPorsi)}</b>
        <span><i class="no-mini">2</i>HPP resep lain</span><b>${rupiah(tambahan.totalPorsi)}</b>
      </div>
    </div>
    <${KartuHarga} key=${resep.id} hpp=${hppJual} marginTarget=${target.marginTarget} hargaJual=${target.hargaJual} onUbah=${aturTarget} unit=${unit} />
    ${kartuTarget}
    <a class="pil navy" href=${tautan('/paket')}>Hitung HPP paket<span class="ujung"><${Ikon} nama="kalkulator" /></span></a>
  </div>`;

  return html`<div class="isi">${ringkas}<div class="kolom-2">${kiri}${kanan}</div></div>`;
}
