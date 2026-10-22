// Semua ulasan dan penilaian dari semua eksperimen.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Stat, Kosong } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tautan } from '../ui/router.js';
import { tanya, tampilToast } from '../ui/pesan.js';
import { semuaUlasan } from '../lib/repo.js';
import { desimal1, tanggal } from '../lib/util.js';

export function Ulasan({ k }) {
  const { db } = k;
  const [filter, setFilter] = useState('');
  const semua = semuaUlasan(db);
  const resepAda = [...new Map(semua.map((u) => [u.r.id, u.r])).values()].sort((a, b) => a.nama.localeCompare(b.nama));
  const daftar = semua.filter((u) => !filter || u.r.id === filter);

  const hapus = async (u) => {
    const ya = await tanya({ judul: 'Hapus ulasan ini?', teks: `Penilaian dari ${u.p.namaPenilai || 'penilai tanpa nama'} akan dihapus dan skor eksperimen dihitung ulang.`, ya: 'Hapus', bahaya: true });
    if (!ya) return;
    db.hapus('Penilaian', u.p.id);
    tampilToast('Ulasan dihapus.');
  };

  return html`<${Kerangka} k=${k} aktif="ulasan">
    <${Hero} warna="var(--coklat)" label="Ulasan" judul="Ulasan" kembali="/" stat=${html`<${Stat} nilai=${semua.length} label="ulasan" />`} />
    <div class="isi">
      ${resepAda.length > 1 &&
      html`<label class="bidang"><span>Tampilkan resep</span>
        <select class="pilih" value=${filter} onChange=${(e) => setFilter(e.target.value)}>
          <option value="" selected=${!filter}>Semua resep</option>
          ${resepAda.map((r) => html`<option value=${r.id} selected=${filter === r.id}>${r.nama}</option>`)}
        </select>
      </label>`}
      ${semua.length === 0 &&
      html`<${Kosong} judul="Belum ada ulasan" teks="Bagikan kode QR sebuah eksperimen, dan komentar penilai muncul di sini.">
        <a class="btn solid" href=${tautan('/resep')}>Buka resep</a>
      <//>`}
      <div class="daftar-lebar" style="display:grid;gap:12px">
        ${daftar.map(
          (u) => html`<div class="kartu ulasan" key=${u.p.id}>
            <div class="ulasan-kepala">
              <b>${u.p.namaPenilai || 'Tanpa nama'}${u.p.dariPemilik ? html`<small class="teks-kecil"> · pemilik</small>` : ''}</b>
              <span class="ulasan-skor">${desimal1(u.skor)}</span>
            </div>
            ${u.p.komentar ? html`<p>${u.p.komentar}</p>` : html`<p class="teks-kecil">Tidak ada komentar.</p>`}
            <div class="baris-pisah">
              <a class="tautan-hijau" href=${tautan('/eksperimen/' + u.e.id)}>${u.r.nama} · Eksperimen ${u.e.nomor}</a>
              <span style="display:flex;align-items:center;gap:4px"><small>${tanggal(u.p.waktu)}</small>
                <button class="ikon-btn kecil" aria-label="Hapus ulasan" onClick=${() => hapus(u)}><${Ikon} nama="sampah" ukuran=${18} /></button></span>
            </div>
          </div>`,
        )}
      </div>
    </div>
  <//>`;
}
