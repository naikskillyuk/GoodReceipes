// Stok makanan jadi (dapur dan toko): bertambah dari produksi, berkurang dari pesanan, bisa dihitung ulang atau dicatat rusak.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Stat, Kosong, InputAngka } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tampilToast } from '../ui/pesan.js';
import { tautan } from '../ui/router.js';
import { daftarStokMakanan, ubahStokMakanan, riwayatMakanan, tampilanToko } from '../lib/toko.js';
import { tampilJumlah, tanggal } from '../lib/util.js';

const JENIS = { produksi: 'Produksi', jual: 'Terjual', koreksi: 'Hitung ulang', rusak: 'Rusak / basi' };

function Detail({ k, s, onTutup }) {
  const { db } = k;
  const [nyata, setNyata] = useState(null);
  const [rusak, setRusak] = useState(null);
  const riwayat = riwayatMakanan(db, s.resep.id).slice(0, 10);
  const simpan = (jenis, nilai) => {
    if (ubahStokMakanan(db, s.resep.id, { jenis, nilai })) tampilToast(jenis === 'rusak' ? 'Dicatat sebagai rusak / basi.' : 'Stok disamakan.');
    setNyata(null);
    setRusak(null);
  };
  return html`<div class="kartu aktif-hijau kolom" style="grid-column:1/-1">
    <div class="baris-pisah"><h2 class="judul-kecil">${s.resep.nama}</h2><button class="ikon-btn kecil" aria-label="Tutup" onClick=${onTutup}><${Ikon} nama="tutup" ukuran=${18} /></button></div>
    <div class="hasil-baris"><span>Stok sekarang</span><b>${tampilJumlah(s.stok)} ${s.satuan}</b></div>
    <div class="cari-baris">
      <label class="bidang" style="flex:1"><span>Hitung ulang: jumlah nyata</span><${InputAngka} kelas="input" nilai=${nyata} onUbah=${setNyata} placeholder=${tampilJumlah(s.stok)} /></label>
      <button class="btn solid" style="align-self:flex-end" disabled=${!(nyata >= 0)} onClick=${() => simpan('koreksi', nyata)}>Samakan</button>
    </div>
    <div class="cari-baris">
      <label class="bidang" style="flex:1"><span>Rusak / basi / dibuang</span><${InputAngka} kelas="input" nilai=${rusak} onUbah=${setRusak} placeholder="0" /></label>
      <button class="btn bahaya" style="align-self:flex-end" disabled=${!(rusak > 0)} onClick=${() => simpan('rusak', rusak)}>Catat</button>
    </div>
    <div class="label-kecil">Riwayat</div>
    ${riwayat.length
      ? riwayat.map(
          (m) => html`<div class="hasil-baris" key=${m.id}>
            <span>${JENIS[m.jenis] || m.jenis} · ${tanggal(m.waktu)}${m.catatan ? html`<br /><small class="teks-kecil">${m.catatan}</small>` : ''}</span>
            <b class=${m.jumlah >= 0 ? 'baik' : 'buruk'}>${m.jumlah >= 0 ? '+' : ''}${tampilJumlah(m.jumlah)}</b>
          </div>`,
        )
      : html`<p class="bantu">Belum ada riwayat.</p>`}
  </div>`;
}

export function StokMakanan({ k }) {
  const { db } = k;
  const dapur = !tampilanToko(db); // produksi dicatat di halaman admin
  const [buka, setBuka] = useState('');
  const semua = daftarStokMakanan(db);
  const habis = semua.filter((s) => s.stok <= 0).length;
  return html`<${Kerangka} k=${k} aktif="stok-makanan" plus=${dapur ? { href: '/produksi', label: 'Catat produksi' } : null}>
    <${Hero} warna="var(--kuning)" label="Siap jual" judul="Stok produk" kembali="/" stat=${html`<${Stat} nilai=${habis} label="habis" />`}>
      <p class="hero-sub">Bertambah saat dapur mencatat produksi, berkurang otomatis saat ada pesanan (paket ikut memotong isinya).</p>
    <//>
    <div class="isi">
      ${semua.length === 0 &&
      html`<${Kosong} judul="Belum ada stok makanan" teks=${dapur ? 'Catat produksi supaya stok makanan bertambah.' : 'Stok bertambah setelah dapur mencatat produksi.'}>
        ${dapur && html`<a class="btn solid" href=${tautan('/produksi')}>Catat produksi</a>`}
      <//>`}
      <div class="daftar daftar-lebar">
        ${semua.map((s) =>
          buka === s.resep.id
            ? html`<${Detail} key=${s.resep.id} k=${k} s=${s} onTutup=${() => setBuka('')} />`
            : html`<button class=${'baris-stok' + (s.stok <= 0 ? ' menipis' : '')} key=${s.resep.id} onClick=${() => setBuka(s.resep.id)} aria-label=${'Stok ' + s.resep.nama}>
                <span class="teks"><b>${s.resep.nama}</b><small>${s.stok <= 0 ? 'Habis' : 'Ketuk untuk hitung ulang / catat rusak'}</small></span>
                <span class="angka-stok"><b>${tampilJumlah(s.stok)}</b><small>${s.satuan}</small></span>
              </button>`,
        )}
      </div>
    </div>
  <//>`;
}
