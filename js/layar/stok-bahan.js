// Stok bahan (akun dapur): stok setiap bahan, catat belanja, hitung ulang stok, dan batas stok menipis.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Stat, Kosong, InputAngka, InputRupiah } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tampilToast } from '../ui/pesan.js';
import { tautan } from '../ui/router.js';
import { daftarStokBahan, catatBelanja, koreksiStokBahan, riwayatBahan, isiKemasanDasar } from '../lib/toko.js';
import { infoSatuanBeli, labelDasar } from '../lib/units.js';
import { rupiah, tampilJumlah, tanggal } from '../lib/util.js';

/** 1250 g -> "1,25 kg"; 300 ml -> "300 ml"; 12 butir -> "12 butir". */
export function teksStok(jumlah, satuan) {
  const n = Number(jumlah) || 0;
  if ((satuan === 'g' || satuan === 'ml') && Math.abs(n) >= 1000) return `${tampilJumlah(n / 1000)} ${satuan === 'g' ? 'kg' : 'liter'}`;
  return `${tampilJumlah(n)} ${satuan}`;
}

const JENIS = { beli: 'Belanja', produksi: 'Produksi', koreksi: 'Hitung ulang' };

function FormBelanja({ k, onSelesai }) {
  const { db } = k;
  const bahan = db.semua('Bahan').sort((a, b) => a.nama.localeCompare(b.nama));
  const barisBaru = () => ({ kunci: Math.random(), idBahan: '', jumlahKemasan: 1, hargaTotal: 0, perbaruiHarga: true });
  const [baris, setBaris] = useState(() => [barisBaru()]);
  const [tempat, setTempat] = useState('');
  const [galat, setGalat] = useState('');
  const ubah = (i, patch) => setBaris((arr) => arr.map((b, j) => (j === i ? { ...b, ...patch } : b)));
  const pilihBahan = (i, idBahan) => {
    const b = db.ambil('Bahan', idBahan);
    ubah(i, { idBahan, hargaTotal: b ? (b.hargaBeli || 0) * (baris[i].jumlahKemasan || 1) : 0 });
  };
  const total = baris.reduce((j, b) => j + (Number(b.hargaTotal) || 0), 0);

  const simpan = () => {
    const sah = baris.filter((b) => b.idBahan && b.jumlahKemasan > 0);
    if (!sah.length) return setGalat('Pilih bahan dan jumlahnya.');
    catatBelanja(db, sah, { tempat });
    tampilToast(`Belanja ${sah.length} bahan dicatat. Stok bertambah.`);
    onSelesai();
  };

  if (!bahan.length) {
    return html`<div class="kartu kolom"><p class="bantu">Belum ada bahan. Tambahkan bahan dulu di Daftar Bahan.</p><a class="btn solid" href=${tautan('/bahan?baru=1')}>Tambah bahan</a></div>`;
  }
  return html`<section class="kartu aktif-hijau kolom" aria-labelledby="h-belanja">
    <h2 class="judul-kecil" id="h-belanja">Catat belanja bahan</h2>
    <label class="bidang"><span>Beli di (opsional)</span><input class="input" maxlength="60" value=${tempat} placeholder="mis. Toko Bahan Kue Sinar" onInput=${(e) => setTempat(e.target.value)} /></label>
    ${baris.map((b, i) => {
      const bhn = db.ambil('Bahan', b.idBahan);
      const info = bhn ? `${tampilJumlah(bhn.isiKemasan)} ${infoSatuanBeli(bhn.satuanBeli).label} per kemasan` : '';
      return html`<div class="baris-belanja" key=${b.kunci}>
        <label class="bidang"><span>Bahan</span>
          <select class="pilih" aria-label=${'Bahan baris ' + (i + 1)} value=${b.idBahan} onChange=${(e) => pilihBahan(i, e.target.value)}>
            <option value="">Pilih bahan…</option>
            ${bahan.map((x) => html`<option value=${x.id} selected=${x.id === b.idBahan}>${x.nama}${x.merek ? ' · ' + x.merek : ''}</option>`)}
          </select>
        </label>
        <div class="dua-kolom">
          <label class="bidang"><span>Jumlah kemasan</span><${InputAngka} kelas="input" aria-label=${'Jumlah kemasan baris ' + (i + 1)} nilai=${b.jumlahKemasan} onUbah=${(n) => ubah(i, { jumlahKemasan: n, hargaTotal: bhn && n > 0 ? Math.round((bhn.hargaBeli || 0) * n) : b.hargaTotal })} /></label>
          <label class="bidang"><span>Harga total</span><${InputRupiah} kelas="input" aria-label=${'Harga total baris ' + (i + 1)} nilai=${b.hargaTotal} onUbah=${(n) => ubah(i, { hargaTotal: n })} /></label>
        </div>
        ${info && html`<p class="bantu">${info}${b.jumlahKemasan > 0 && bhn ? ` · stok bertambah ${teksStok(b.jumlahKemasan * isiKemasanDasar(bhn), labelDasar(bhn))}` : ''}</p>`}
        <div class="baris-pisah">
          <label class="centang-kecil"><input type="checkbox" checked=${b.perbaruiHarga} onChange=${(e) => ubah(i, { perbaruiHarga: e.target.checked })} /> Perbarui harga bahan (HPP)</label>
          ${baris.length > 1 && html`<button class="ikon-btn kecil" aria-label=${'Hapus baris ' + (i + 1)} onClick=${() => setBaris((arr) => arr.filter((_, j) => j !== i))}><${Ikon} nama="sampah" ukuran=${18} /></button>`}
        </div>
      </div>`;
    })}
    <button class="btn putus" onClick=${() => setBaris((arr) => [...arr, barisBaru()])}><${Ikon} nama="plus" ukuran=${18} />Tambah bahan lain</button>
    <div class="hasil-baris"><span>Total belanja</span><b>${rupiah(total)}</b></div>
    ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
    <div class="baris-btn">
      <button class="btn solid lebar" onClick=${simpan}>Simpan belanja</button>
      <button class="btn abu lebar" onClick=${onSelesai}>Batal</button>
    </div>
  </section>`;
}

function DetailStok({ k, s, onTutup }) {
  const { db } = k;
  const [nyata, setNyata] = useState(null);
  const [minimum, setMinimum] = useState(s.minimum || null);
  const riwayat = riwayatBahan(db, s.bahan.id).slice(0, 8);
  const simpanNyata = () => {
    if (!(nyata >= 0)) return;
    koreksiStokBahan(db, s.bahan.id, nyata);
    setNyata(null);
    tampilToast('Stok disamakan dengan hitungan nyata.');
  };
  const simpanMinimum = () => {
    db.simpan('Bahan', { ...db.ambil('Bahan', s.bahan.id), stokMinimum: minimum || 0 });
    tampilToast('Batas stok menipis disimpan.');
  };
  return html`<div class="kartu aktif-hijau kolom" style="grid-column:1/-1">
    <div class="baris-pisah"><h2 class="judul-kecil">${s.bahan.nama}</h2><button class="ikon-btn kecil" aria-label="Tutup" onClick=${onTutup}><${Ikon} nama="tutup" ukuran=${18} /></button></div>
    <div class="hasil-baris"><span>Stok sekarang</span><b>${teksStok(s.stok, s.satuan)}</b></div>
    <div class="cari-baris">
      <label class="bidang" style="flex:1"><span>Hitung ulang: stok nyata (${s.satuan})</span><${InputAngka} kelas="input" nilai=${nyata} onUbah=${setNyata} placeholder=${tampilJumlah(s.stok)} /></label>
      <button class="btn solid" style="align-self:flex-end" disabled=${!(nyata >= 0)} onClick=${simpanNyata}>Samakan</button>
    </div>
    <div class="cari-baris">
      <label class="bidang" style="flex:1"><span>Ingatkan bila stok di bawah (${s.satuan})</span><${InputAngka} kelas="input" nilai=${minimum} onUbah=${setMinimum} placeholder="mis. 500" /></label>
      <button class="btn" style="align-self:flex-end" onClick=${simpanMinimum}>Simpan</button>
    </div>
    <div class="label-kecil">Riwayat</div>
    ${riwayat.length
      ? riwayat.map(
          (m) => html`<div class="hasil-baris" key=${m.id}>
            <span>${JENIS[m.jenis] || m.jenis} · ${tanggal(m.waktu)}${m.catatan ? html`<br /><small class="teks-kecil">${m.catatan}</small>` : ''}</span>
            <b class=${m.jumlah >= 0 ? 'baik' : 'buruk'}>${m.jumlah >= 0 ? '+' : ''}${teksStok(m.jumlah, s.satuan)}</b>
          </div>`,
        )
      : html`<p class="bantu">Belum ada riwayat stok.</p>`}
  </div>`;
}

export function StokBahan({ k }) {
  const { db, rute } = k;
  const [belanja, setBelanja] = useState(!!rute.kueri.belanja);
  const [buka, setBuka] = useState('');
  const [cari, setCari] = useState('');
  const semua = daftarStokBahan(db);
  const menipis = semua.filter((s) => s.menipis).length;
  const nilai = semua.reduce((j, s) => j + s.nilai, 0);
  const cocok = semua.filter((s) => s.bahan.nama.toLowerCase().includes(cari.trim().toLowerCase()));

  return html`<${Kerangka} k=${k} aktif="stok-bahan" plus=${{ onKlik: () => (setBelanja(true), window.scrollTo({ top: 0, behavior: 'smooth' })), label: 'Catat belanja' }}>
    <${Hero} warna="var(--hijau)" label="Dapur" judul="Stok bahan" kembali="/" stat=${html`<${Stat} nilai=${menipis} label="menipis" />`}>
      <p class="hero-sub">Nilai stok sekitar ${rupiah(nilai)}. Stok bertambah saat belanja dicatat dan berkurang saat produksi.</p>
    <//>
    <div class="isi">
      ${belanja && html`<${FormBelanja} k=${k} onSelesai=${() => setBelanja(false)} />`}
      ${!belanja && html`<div class="baris-btn"><button class="btn solid" onClick=${() => setBelanja(true)}><${Ikon} nama="keranjang" ukuran=${18} />Catat belanja</button><a class="btn" href=${tautan('/produksi')}><${Ikon} nama="panci" ukuran=${18} />Catat produksi</a></div>`}
      ${semua.length > 0 && html`<input class="input" type="search" placeholder="Cari bahan…" aria-label="Cari bahan" value=${cari} onInput=${(e) => setCari(e.target.value)} />`}
      ${semua.length === 0 && html`<${Kosong} judul="Belum ada bahan" teks="Tambahkan bahan di Daftar Bahan, lalu catat belanja supaya stoknya terhitung."><a class="btn solid" href=${tautan('/bahan?baru=1')}>Tambah bahan</a><//>`}
      <div class="daftar daftar-lebar">
        ${cocok.map((s) =>
          buka === s.bahan.id
            ? html`<${DetailStok} key=${s.bahan.id} k=${k} s=${s} onTutup=${() => setBuka('')} />`
            : html`<button class=${'baris-stok' + (s.menipis ? ' menipis' : '')} key=${s.bahan.id} onClick=${() => setBuka(s.bahan.id)} aria-label=${'Stok ' + s.bahan.nama}>
                <span class="teks"><b>${s.bahan.nama}</b><small>${s.menipis ? (s.stok <= 0 ? 'Stok habis' : 'Stok menipis') : s.minimum ? 'Batas ' + teksStok(s.minimum, s.satuan) : 'Ketuk untuk hitung ulang / atur batas'}</small></span>
                <span class="angka-stok"><b>${teksStok(s.stok, s.satuan)}</b>${isiKemasanDasar(s.bahan) > 0 && html`<small>≈ ${tampilJumlah(Math.max(0, s.stok) / isiKemasanDasar(s.bahan))} kemasan</small>`}</span>
              </button>`,
        )}
      </div>
    </div>
  <//>`;
}
