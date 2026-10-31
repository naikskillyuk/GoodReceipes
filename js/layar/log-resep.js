// Tab "Log" di halaman resep: riwayat perubahan bahan dan dampaknya ke HPP per porsi.
// Hanya bahan yang berubah yang ditampilkan (takaran, harga, ditambah, dihapus).

import { html } from '../../vendor/preact-htm.js';
import { Kosong } from '../ui/komponen.js';
import { logResep, hppResep } from '../lib/repo.js';
import { rupiah, tanggal, tampilJumlah } from '../lib/util.js';

const LABEL = { tambah: 'Ditambah', hapus: 'Dihapus', takaran: 'Takaran', harga: 'Harga' };
const WARNA = { tambah: 'var(--hijau)', hapus: 'var(--bahaya)', takaran: 'var(--navy)', harga: 'var(--kuning-tua)' };

const jam = (ts) => {
  const d = new Date(ts);
  return `${tanggal(ts)}, ${String(d.getHours()).padStart(2, '0')}.${String(d.getMinutes()).padStart(2, '0')}`;
};
const takaran = (b) => `${tampilJumlah(b.jumlah)} ${b.satuan}`.trim();
const biaya = (b) => (Number.isFinite(b.biaya) ? rupiah(b.biaya) : 'harga belum lengkap');

function Selisih({ lama, baru }) {
  if (!Number.isFinite(lama) || !Number.isFinite(baru)) return html`<b>${Number.isFinite(baru) ? rupiah(baru) : '–'}</b>`;
  const beda = Math.round(baru) - Math.round(lama);
  const warna = beda > 0 ? 'var(--bahaya)' : beda < 0 ? 'var(--hijau)' : 'var(--muted)';
  return html`<span>${rupiah(lama)} → <b>${rupiah(baru)}</b>
    <span style=${`color:${warna};font-weight:700;margin-left:6px`}>${beda > 0 ? '+' : beda < 0 ? '−' : '±'}${rupiah(Math.abs(beda))}</span></span>`;
}

function BarisBahan({ p }) {
  let isi;
  if (p.jenis === 'tambah') isi = `${takaran(p.baru)} · ${biaya(p.baru)}`;
  else if (p.jenis === 'hapus') isi = `${takaran(p.lama)} · ${biaya(p.lama)}`;
  else if (p.jenis === 'takaran') isi = `${takaran(p.lama)} → ${takaran(p.baru)} · ${biaya(p.lama)} → ${biaya(p.baru)}`;
  else isi = `${takaran(p.baru)} · ${biaya(p.lama)} → ${biaya(p.baru)}`;
  return html`<li style="display:flex;gap:8px;align-items:baseline;flex-wrap:wrap;padding:6px 0;border-top:1px solid var(--garis)">
    <span style=${`font-size:12px;font-weight:700;color:${WARNA[p.jenis]};min-width:62px`}>${LABEL[p.jenis]}</span>
    <b style="min-width:0;overflow-wrap:anywhere">${p.nama}</b>
    <span class="teks-kecil" style="flex-basis:100%;padding-left:70px">${isi}</span>
  </li>`;
}

export function PanelLogResep({ k, resep }) {
  const { db } = k;
  const log = logResep(db, resep.id);
  const satuan = (hppResep(db, resep.id) || {}).satuanPorsi || 'porsi';
  const perubahan = log.filter((l) => (l.perubahan || []).length);
  const awal = log.find((l) => !(l.perubahan || []).length);

  if (!log.length) {
    return html`<div class="isi">
      <${Kosong} judul="Belum ada perubahan" teks="Setiap kali takaran bahan, harga bahan, atau eksperimen yang dihitung HPP-nya berubah, catatannya muncul di sini." />
    </div>`;
  }
  return html`<div class="isi">
    <p class="bantu" style="margin:0">Bahan yang berubah pada eksperimen yang dihitung HPP-nya, dan HPP per ${satuan} sebelum → sesudah. Bahan yang tidak berubah tidak ditampilkan.</p>
    ${perubahan.map((l) => html`<div class="kartu" key=${l.id}>
      <div style="display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:baseline">
        <b>${l.sebab}</b>
        <span class="teks-kecil">${jam(l.waktu)}</span>
      </div>
      <div style="margin-top:6px">HPP per ${satuan}: <${Selisih} lama=${l.hppLama} baru=${l.hppBaru} /></div>
      <ul style="list-style:none;margin:8px 0 0;padding:0">
        ${l.perubahan.map((p, i) => html`<${BarisBahan} key=${i} p=${p} />`)}
      </ul>
      ${l.nomorEksperimen ? html`<small class="teks-kecil">Eksperimen ${l.nomorEksperimen}</small>` : ''}
    </div>`)}
    ${awal &&
    html`<p class="teks-kecil" style="margin:0">Catatan awal ${jam(awal.waktu)}: Eksperimen ${awal.nomorEksperimen}, ${(awal.bahan || []).length} bahan, HPP ${Number.isFinite(awal.hppBaru) ? rupiah(awal.hppBaru) : '–'} per ${satuan}.</p>`}
  </div>`;
}
