// Stok produk jadi (dapur dan toko): bertambah dari produksi (diimpor) atau ditambah langsung, berkurang dari pesanan,
// bisa dihitung ulang atau dicatat rusak.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Stat, Kosong, InputAngka } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tampilToast, Modal } from '../ui/pesan.js';
import { tautan } from '../ui/router.js';
import { daftarStokMakanan, ubahStokMakanan, riwayatMakanan, tampilanToko, produksiBelumMasuk, masukkanProduksiKeStok } from '../lib/toko.js';
import { tampilJumlah, tanggal } from '../lib/util.js';

const JENIS = { produksi: 'Produksi', jual: 'Terjual', koreksi: 'Hitung ulang', rusak: 'Rusak / basi', masuk: 'Tambah stok' };

function Detail({ k, s, onTutup }) {
  const { db } = k;
  const [nyata, setNyata] = useState(null);
  const [rusak, setRusak] = useState(null);
  const [tambah, setTambah] = useState(null);
  const riwayat = riwayatMakanan(db, s.resep.id).slice(0, 10);
  const PESAN = { rusak: 'Dicatat sebagai rusak / basi.', koreksi: 'Stok disamakan.', masuk: 'Stok ditambahkan.' };
  const simpan = (jenis, nilai) => {
    if (ubahStokMakanan(db, s.resep.id, { jenis, nilai })) tampilToast(PESAN[jenis]);
    setNyata(null);
    setRusak(null);
    setTambah(null);
  };
  return html`<${Modal} judul=${s.resep.nama} onTutup=${onTutup}><div class="kolom" style="gap:12px">
    <div class="hasil-baris"><span>Stok sekarang</span><b>${tampilJumlah(s.stok)} ${s.satuan}</b></div>
    <div class="cari-baris">
      <label class="bidang" style="flex:1"><span>Tambah stok (tanpa produksi)</span><${InputAngka} kelas="input" aria-label=${'Tambah stok ' + s.resep.nama} nilai=${tambah} onUbah=${setTambah} placeholder="0" /></label>
      <button class="btn solid" style="align-self:flex-end" disabled=${!(tambah > 0)} onClick=${() => simpan('masuk', tambah)}>Tambah</button>
    </div>
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
    <button class="btn abu" onClick=${onTutup}>Tutup</button>
  </div><//>`;
}

/** Tambah stok langsung, tanpa lewat produksi (mis. titipan, beli jadi, stok awal). */
function FormTambahStok({ k, onTutup }) {
  const { db } = k;
  const resep = db.semua('Resep').sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
  const [idResep, setIdResep] = useState('');
  const [jumlah, setJumlah] = useState(null);
  const [catatan, setCatatan] = useState('');
  const simpan = () => {
    const r = db.ambil('Resep', idResep);
    if (ubahStokMakanan(db, idResep, { jenis: 'masuk', nilai: jumlah, catatan })) tampilToast(`+${tampilJumlah(jumlah)} ${r ? r.nama : ''} masuk stok.`);
    onTutup();
  };
  return html`<${Modal} judul="Tambah stok" onTutup=${onTutup}><div class="kolom" style="gap:12px">
    <p class="bantu">Untuk stok yang tidak lewat produksi di aplikasi, mis. stok awal, titipan, atau beli jadi.</p>
    <label class="bidang"><span>Produk</span>
      <select class="pilih" aria-label="Produk yang ditambah" value=${idResep} onChange=${(e) => setIdResep(e.target.value)}>
        <option value="">Pilih produk…</option>
        ${resep.map((r) => html`<option value=${r.id} selected=${r.id === idResep}>${r.nama}</option>`)}
      </select>
    </label>
    <div class="dua-kolom">
      <label class="bidang"><span>Jumlah</span><${InputAngka} kelas="input" aria-label="Jumlah tambah stok" nilai=${jumlah} onUbah=${setJumlah} placeholder="0" /></label>
      <label class="bidang"><span>Keterangan (opsional)</span><input class="input" maxlength="80" value=${catatan} onInput=${(e) => setCatatan(e.target.value)} placeholder="mis. stok awal" /></label>
    </div>
    <div class="baris-btn">
      <button class="btn solid" disabled=${!idResep || !(jumlah > 0)} onClick=${simpan}><${Ikon} nama="plus" ukuran=${18} />Tambah ke stok</button>
      <button class="btn abu" onClick=${onTutup}>Batal</button>
    </div>
  </div><//>`;
}

/** Hasil produksi yang belum masuk ke stok produk: impor sebagian atau semua. */
function ImporProduksi({ k }) {
  const { db } = k;
  const daftar = produksiBelumMasuk(db);
  const [jumlah, setJumlah] = useState({});
  if (!daftar.length) return null;
  const impor = (x) => {
    const n = jumlah[x.produksi.id] ?? x.sisa;
    try {
      masukkanProduksiKeStok(db, x.produksi.id, n);
      tampilToast(`+${tampilJumlah(n)} ${x.resep.nama} masuk stok produk.`);
      setJumlah((j) => ({ ...j, [x.produksi.id]: undefined }));
    } catch (e) {
      tampilToast(e.message);
    }
  };
  return html`<section class="kartu kolom kartu-impor" aria-labelledby="h-impor">
    <h2 class="judul-kecil" id="h-impor">Hasil produksi belum masuk stok</h2>
    <p class="bantu">Impor hasil produksi ke stok produk supaya bisa dijual di kasir dan etalase.</p>
    ${daftar.map(
      (x) => html`<div class="baris-impor" key=${x.produksi.id}>
        <span class="teks"><b>${x.resep.nama}</b><small>${tanggal(x.produksi.waktu)} · hasil ${tampilJumlah(x.produksi.hasil)} · belum masuk ${tampilJumlah(x.sisa)}</small></span>
        <${InputAngka} kelas="input kecil" aria-label=${'Jumlah impor ' + x.resep.nama} nilai=${jumlah[x.produksi.id] ?? x.sisa} onUbah=${(n) => setJumlah((j) => ({ ...j, [x.produksi.id]: n }))} />
        <button class="btn kecil solid" disabled=${!((jumlah[x.produksi.id] ?? x.sisa) > 0)} onClick=${() => impor(x)}>Masukkan</button>
      </div>`,
    )}
  </section>`;
}

export function StokMakanan({ k }) {
  const { db } = k;
  const dapur = !tampilanToko(db); // produksi dicatat di halaman admin
  const [buka, setBuka] = useState('');
  const [tambahBuka, setTambahBuka] = useState(false);
  const [cari, setCari] = useState('');
  const semua = daftarStokMakanan(db);
  const habis = semua.filter((s) => s.stok <= 0).length;
  return html`<${Kerangka} k=${k} aktif="stok-makanan" plus=${dapur ? { href: '/produksi', label: 'Catat produksi' } : null}>
    <${Hero} warna="var(--kuning)" label="Siap jual" judul="Stok produk" kembali="/" stat=${html`<${Stat} nilai=${habis} label="habis" />`}>
      <p class="hero-sub">Bertambah dari hasil produksi atau tambah stok langsung, berkurang otomatis saat ada pesanan (paket ikut memotong isinya).</p>
    <//>
    <div class="isi">
      ${dapur && html`<${ImporProduksi} k=${k} />`}
      <div class="baris-cari">
        <input class="input" type="search" placeholder="Cari produk…" aria-label="Cari produk" value=${cari} onInput=${(e) => setCari(e.target.value)} />
        ${db.semua('Resep').length > 0 && html`<button class="btn solid" onClick=${() => setTambahBuka(true)}><${Ikon} nama="plus" ukuran=${18} />Tambah stok</button>`}
      </div>
      ${tambahBuka && html`<${FormTambahStok} k=${k} onTutup=${() => setTambahBuka(false)} />`}
      ${semua.length === 0 &&
      html`<${Kosong} judul="Belum ada stok produk" teks=${dapur ? 'Catat produksi atau tambah stok di atas.' : 'Tambah stok di atas, atau tunggu dapur mencatat produksi.'}>
        ${dapur && html`<a class="btn solid" href=${tautan('/produksi')}>Catat produksi</a>`}
      <//>`}
      ${semua.length > 0 &&
      html`<div class="tabel-gulir kartu tabel-kartu">
        <table class="tabel-data">
          <thead>
            <tr><th>Produk</th><th class="angka">Stok</th><th>Satuan</th><th>Status</th><th>Terakhir berubah</th><th aria-label="Aksi"></th></tr>
          </thead>
          <tbody>
            ${semua.filter((s) => !cari.trim() || s.resep.nama.toLowerCase().includes(cari.trim().toLowerCase())).map((s) => {
              const akhir = riwayatMakanan(db, s.resep.id)[0];
              return html`<tr key=${s.resep.id}>
                <td><b>${s.resep.nama}</b></td>
                <td class=${'angka ' + (s.stok <= 0 ? 'teks-buruk' : '')}><b>${tampilJumlah(s.stok)}</b></td>
                <td>${s.satuan}</td>
                <td><span class=${'lencana-status ' + (s.stok <= 0 ? 'belum' : s.stok <= 5 ? 'tunggu' : 'lunas')}>${s.stok <= 0 ? 'Habis' : s.stok <= 5 ? 'Menipis' : 'Tersedia'}</span></td>
                <td>${akhir ? html`${JENIS[akhir.jenis] || akhir.jenis} <b class=${akhir.jumlah >= 0 ? 'teks-baik' : 'teks-buruk'}>${akhir.jumlah >= 0 ? '+' : ''}${tampilJumlah(akhir.jumlah)}</b><br /><small class="teks-kecil">${tanggal(akhir.waktu)}</small>` : html`<span class="teks-kecil">–</span>`}</td>
                <td class="aksi"><button class="btn kecil" aria-label=${'Kelola stok ' + s.resep.nama} onClick=${() => setBuka(s.resep.id)}>Kelola</button></td>
              </tr>`;
            })}
          </tbody>
        </table>
      </div>`}
      ${buka && semua.find((x) => x.resep.id === buka) && html`<${Detail} key=${buka} k=${k} s=${semua.find((x) => x.resep.id === buka)} onTutup=${() => setBuka('')} />`}
    </div>
  <//>`;
}
