// Form eksperimen: baru, duplikat dari eksperimen lain, atau ubah.
// Urutan: porsi, suhu/waktu, bahan, langkah, catatan kegagalan, foto hasil akhir, lalu tombol simpan.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, FotoInput, Kosong, InputRupiah, InputAngka } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { Modal, tampilToast } from '../ui/pesan.js';
import { pergi, tautan } from '../ui/router.js';
import { patchFoto } from '../ui/gambar.js';
import {
  draftEksperimen, bahanEksperimen, simpanEksperimen, petaBahan, petaKonversi, simpanBahan, fotoSrc,
} from '../lib/repo.js';
import { SATUAN_BELI, infoSatuanBeli, satuanResep, biayaTakaran, hargaPerDasar, keDasar } from '../lib/units.js';
import { rupiah, angka, bacaJumlah, tampilJumlah } from '../lib/util.js';

const SATUAN_PORSI = ['porsi', 'potong', 'gelas', 'bungkus', 'buah', 'kotak', 'loyang', 'botol'];
const fokuskan = (el) => el && el.focus();
let kunciBaris = 0;
const barisBaru = (b) => ({ kunci: ++kunciBaris, idBahan: b.idBahan, jumlah: b.jumlah === '' || b.jumlah == null ? '' : tampilJumlah(b.jumlah), satuan: b.satuan });

function PilihBahan({ k, sudah, onPilih, onTutup }) {
  const { db } = k;
  const [cari, setCari] = useState('');
  const [baru, setBaru] = useState(false);
  const [f, setF] = useState({ nama: '', hargaBeli: 0, isiKemasan: 1, satuanBeli: 'kg' });
  const [galat, setGalat] = useState('');
  const semua = db
    .semua('Bahan')
    .filter((b) => !sudah.has(b.id) && (b.nama + ' ' + (b.merek || '')).toLowerCase().includes(cari.trim().toLowerCase()))
    .sort((a, b) => a.nama.localeCompare(b.nama));

  const buat = () => {
    if (!f.nama.trim()) return setGalat('Nama bahan wajib diisi.');
    if (!(f.hargaBeli > 0) || !(f.isiKemasan > 0)) return setGalat('Isi harga beli dan isi kemasan.');
    const b = simpanBahan(db, { nama: f.nama, merek: '', beliDi: '', hargaBeli: f.hargaBeli, isiKemasan: f.isiKemasan, satuanBeli: f.satuanBeli });
    onPilih(b);
  };

  return html`<${Modal} judul="Tambah bahan" onTutup=${onTutup}>
    <input class="input" type="search" placeholder="Cari bahan…" aria-label="Cari bahan" value=${cari} onInput=${(e) => setCari(e.target.value)} ref=${fokuskan} />
    <div class="kolom" style="gap:8px">
      ${semua.map(
        (b) => html`<button type="button" class="pilih-item" key=${b.id} onClick=${() => onPilih(b)}>
          <span class="foto-bahan">${fotoSrc(b, 'fotoLokal', 'fotoUrl') ? html`<img src=${fotoSrc(b, 'fotoLokal', 'fotoUrl')} alt="" />` : html`<${Ikon} nama="keranjang" ukuran=${20} />`}</span>
          <span><b>${b.nama}</b><small>${[b.merek, `${rupiah(b.hargaBeli)} / ${tampilJumlah(b.isiKemasan)} ${infoSatuanBeli(b.satuanBeli).label}`].filter(Boolean).join(' · ')}</small></span>
        </button>`,
      )}
      ${semua.length === 0 && html`<p class="bantu" style="text-align:center;padding:8px">${db.semua('Bahan').length === 0 ? 'Daftar bahan masih kosong.' : 'Tidak ada bahan yang cocok.'}</p>`}
    </div>
    ${!baru
      ? html`<button type="button" class="btn lebar putus" onClick=${() => setBaru(true)}><${Ikon} nama="plus" ukuran=${18} />Bahan baru</button>`
      : html`<div class="kartu kolom">
          <div class="label-kecil">Bahan baru</div>
          <label class="bidang"><span>Nama bahan</span><input class="input kecil" maxlength="60" value=${f.nama} onInput=${(e) => setF({ ...f, nama: e.target.value })} /></label>
          <div class="dua-kolom">
            <label class="bidang"><span>Harga beli</span><${InputRupiah} nilai=${f.hargaBeli} onUbah=${(n) => setF({ ...f, hargaBeli: n })} placeholder="mis. 95.000" /></label>
            <label class="bidang"><span>Isi kemasan</span><${InputAngka} nilai=${f.isiKemasan} onUbah=${(n) => setF({ ...f, isiKemasan: n })} /></label>
          </div>
          <label class="bidang"><span>Satuan kemasan</span>
            <select class="pilih kecil" value=${f.satuanBeli} onChange=${(e) => setF({ ...f, satuanBeli: e.target.value })}>
              ${SATUAN_BELI.map((s) => html`<option value=${s.kode} selected=${f.satuanBeli === s.kode}>${s.label}</option>`)}
            </select>
          </label>
          <p class="bantu">Merek, foto, dan konversi sdm/sdt bisa dilengkapi nanti di Daftar Bahan.</p>
          ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
          <button type="button" class="btn solid lebar" onClick=${buat}>Simpan dan pakai</button>
        </div>`}
    <button type="button" class="btn abu lebar" onClick=${onTutup}>Tutup</button>
  <//>`;
}

function IsiForm({ k, resep, edit }) {
  const { db, rute } = k;
  const [awal] = useState(() =>
    edit
      ? { eksperimen: edit, baris: bahanEksperimen(db, edit.id).map((b) => ({ idBahan: b.idBahan, jumlah: b.jumlah, satuan: b.satuan })), biayaSumber: null, nomorSumber: null }
      : draftEksperimen(db, resep.id, rute.kueri.dari || ''),
  );
  const e0 = awal.eksperimen;
  const fotoAwal = fotoSrc(e0, 'fotoHasilLokal', 'fotoHasilUrl');

  const [porsi, setPorsi] = useState(e0.porsi ?? 1);
  const [satuanPorsi, setSatuanPorsi] = useState(e0.satuanPorsi || 'porsi');
  const [suhu, setSuhu] = useState(e0.suhuC ?? null);
  const [waktu, setWaktu] = useState(e0.waktuMenit ?? null);
  const [baris, setBaris] = useState(() => awal.baris.map(barisBaru));
  const [langkah, setLangkah] = useState(() => (e0.langkah && e0.langkah.length ? [...e0.langkah] : ['']));
  const [catatan, setCatatan] = useState(e0.catatanKegagalan || '');
  const [foto, setFoto] = useState(fotoAwal);
  const [pilihBahan, setPilihBahan] = useState(false);
  const [galat, setGalat] = useState([]);

  const bahanById = petaBahan(db);
  const konversi = petaKonversi(db);
  const sumberByBahan = {};
  awal.baris.forEach((b) => (sumberByBahan[b.idBahan] = b));
  const duplikat = !edit && !!e0.idAsalDuplikat;

  const hitung = baris.map((b) => {
    const bahan = bahanById[b.idBahan];
    const jumlah = bacaJumlah(b.jumlah);
    const biaya = bahan && jumlah > 0 ? biayaTakaran(bahan, konversi[bahan.id] || [], jumlah, b.satuan) : NaN;
    const s = sumberByBahan[b.idBahan];
    const berubah = duplikat && (!s || s.satuan !== b.satuan || Math.abs(Number(s.jumlah) - jumlah) > 1e-9);
    return { b, bahan, jumlah, biaya, berubah };
  });
  const total = hitung.reduce((j, h) => j + (Number.isFinite(h.biaya) ? h.biaya : 0), 0);
  const selisih = awal.biayaSumber != null ? total - awal.biayaSumber : null;

  const ubahBaris = (kunci, patch) => setBaris((arr) => arr.map((b) => (b.kunci === kunci ? { ...b, ...patch } : b)));
  const tambah = (bahan) => {
    const opsi = satuanResep(bahan, konversi[bahan.id] || []);
    setBaris((arr) => [...arr, barisBaru({ idBahan: bahan.id, jumlah: '', satuan: opsi[0] })]);
    setPilihBahan(false);
  };

  const simpan = () => {
    const masalah = [];
    const p = Number(porsi);
    if (!(p > 0)) masalah.push('Isi hasil jadi (porsi) dengan angka lebih dari 0.');
    if (baris.length === 0) masalah.push('Tambahkan minimal satu bahan.');
    hitung.forEach((h) => {
      const nama = h.bahan ? h.bahan.nama : 'Bahan';
      if (!h.bahan) masalah.push('Ada bahan yang sudah dihapus dari Daftar Bahan. Hapus barisnya.');
      else if (!(h.jumlah > 0)) masalah.push(`Jumlah ${nama} belum diisi.`);
      else if (!Number.isFinite(keDasar(h.bahan, konversi[h.bahan.id] || [], h.jumlah, h.b.satuan))) masalah.push(`Satuan “${h.b.satuan}” untuk ${nama} tidak dikenal.`);
    });
    if (suhu != null && Number.isNaN(suhu)) masalah.push('Suhu harus berupa angka.');
    if (waktu != null && Number.isNaN(waktu)) masalah.push('Waktu harus berupa angka.');
    if (masalah.length) {
      setGalat([...new Set(masalah)]);
      window.scrollTo({ top: 0, behavior: 'smooth' });
      return;
    }
    const tersimpan = simpanEksperimen(db, {
      eksperimen: {
        ...e0,
        porsi: p,
        satuanPorsi: satuanPorsi.trim() || 'porsi',
        suhuC: suhu == null ? null : suhu,
        waktuMenit: waktu == null ? null : waktu,
        langkah,
        catatanKegagalan: catatan,
        ...patchFoto(fotoAwal, foto, 'fotoHasilLokal', 'fotoHasilUrl'),
      },
      baris: hitung.map((h) => ({ idBahan: h.b.idBahan, jumlah: h.jumlah, satuan: h.b.satuan })),
    });
    tampilToast(edit ? 'Eksperimen disimpan.' : `Eksperimen ${tersimpan.nomor} tersimpan.`);
    pergi('/eksperimen/' + tersimpan.id, { ganti: true });
  };

  const kembali = edit ? '/eksperimen/' + edit.id : '/resep/' + resep.id;
  const kat = db.ambil('Kategori', resep.idKategori);

  const kiri = html`<div class="kolom">
    <div class="dua-kolom">
      <label class="bidang"><span>Hasil jadi</span><${InputAngka} kelas="input" nilai=${porsi} onUbah=${(n) => setPorsi(n)} aria-label="Jumlah hasil jadi" /></label>
      <label class="bidang"><span>Satuan porsi</span>
        <input class="input" list="daftar-satuan-porsi" maxlength="20" value=${satuanPorsi} onInput=${(ev) => setSatuanPorsi(ev.target.value)} />
        <datalist id="daftar-satuan-porsi">${SATUAN_PORSI.map((s) => html`<option value=${s}></option>`)}</datalist>
      </label>
    </div>
    <div class="dua-kolom">
      <label class="bidang"><span>Suhu (°C)</span><${InputAngka} kelas="input" nilai=${suhu} onUbah=${setSuhu} placeholder="opsional" /></label>
      <label class="bidang"><span>Waktu (menit)</span><${InputAngka} kelas="input" nilai=${waktu} onUbah=${setWaktu} placeholder="opsional" /></label>
    </div>

    <div class="kolom" style="gap:10px">
      <div class="baris-pisah"><div class="label-kecil">Bahan dan takaran</div><span class="teks-kecil">${baris.length} bahan</span></div>
      ${duplikat && html`<div class="info"><b>Salinan dari Eksperimen ${awal.nomorSumber}</b>Baris berwarna kuning adalah bahan yang Anda ubah atau tambah.</div>`}
      ${hitung.map(({ b, bahan, biaya, berubah }) => {
        const opsi = bahan ? satuanResep(bahan, konversi[bahan.id] || []) : [b.satuan];
        const daftarSatuan = opsi.includes(b.satuan) ? opsi : [...opsi, b.satuan];
        return html`<div class=${'bahan-form' + (berubah ? ' berubah' : '')} key=${b.kunci}>
          <div class="nama">
            <b>${bahan ? bahan.nama : 'Bahan terhapus'}</b>
            <small>${bahan && Number.isFinite(hargaPerDasar(bahan)) ? [bahan.merek, `${rupiah(bahan.hargaBeli)} / ${tampilJumlah(bahan.isiKemasan)} ${infoSatuanBeli(bahan.satuanBeli).label}`].filter(Boolean).join(' · ') : 'Harga belum lengkap'}</small>
          </div>
          <div class="takaran">
            <input inputmode="decimal" aria-label=${'Jumlah ' + (bahan ? bahan.nama : '')} value=${b.jumlah} placeholder="0" onInput=${(ev) => ubahBaris(b.kunci, { jumlah: ev.target.value })} />
            <select aria-label=${'Satuan ' + (bahan ? bahan.nama : '')} value=${b.satuan} onChange=${(ev) => ubahBaris(b.kunci, { satuan: ev.target.value })}>
              ${daftarSatuan.map((s) => html`<option value=${s} selected=${s === b.satuan}>${s}</option>`)}
            </select>
          </div>
          <span class="biaya-baris">${Number.isFinite(biaya) ? rupiah(biaya) : '–'}</span>
          <button type="button" class="ikon-btn kecil" aria-label=${'Hapus ' + (bahan ? bahan.nama : 'bahan')} onClick=${() => setBaris((arr) => arr.filter((x) => x.kunci !== b.kunci))}><${Ikon} nama="tutup" ukuran=${18} /></button>
        </div>`;
      })}
      <button type="button" class="btn lebar putus" onClick=${() => setPilihBahan(true)}><${Ikon} nama="plus" ukuran=${18} />Tambah bahan</button>
      <div class="total-biaya">
        <div><div class="label-kecil">Biaya bahan</div><div class="angka">${rupiah(total)}</div></div>
        ${selisih != null && Math.abs(selisih) >= 0.5 && html`<span class=${'selisih ' + (selisih < 0 ? 'turun' : 'naik')}>${selisih < 0 ? '▼' : '▲'} ${rupiah(Math.abs(selisih))} dari Eks. ${awal.nomorSumber}</span>`}
      </div>
    </div>
  </div>`;

  const kanan = html`<div class="kolom">
    <div class="kolom" style="gap:10px">
      <div class="label-kecil">Langkah</div>
      ${langkah.map(
        (l, i) => html`<div class="langkah-form" key=${i}>
          <span class="nomor-langkah">${i + 1}</span>
          <textarea class="area" rows="2" aria-label=${'Langkah ' + (i + 1)} placeholder=${i === 0 ? 'mis. Lelehkan cokelat dan mentega…' : ''} value=${l} onInput=${(ev) => setLangkah((arr) => arr.map((x, j) => (j === i ? ev.target.value : x)))}></textarea>
          <button type="button" class="ikon-btn kecil" style="margin-top:12px" aria-label=${'Hapus langkah ' + (i + 1)} onClick=${() => setLangkah((arr) => (arr.length > 1 ? arr.filter((_, j) => j !== i) : ['']))}><${Ikon} nama="tutup" ukuran=${18} /></button>
        </div>`,
      )}
      <button type="button" class="btn lebar putus" onClick=${() => setLangkah((arr) => [...arr, ''])}><${Ikon} nama="plus" ukuran=${18} />Tambah langkah</button>
    </div>

    <label class="bidang">
      <span>Catatan kegagalan</span>
      <textarea class="area" rows="3" maxlength="800" placeholder="Apa yang kurang? mis. terlalu manis, bagian tengah belum matang." value=${catatan} onInput=${(ev) => setCatatan(ev.target.value)}></textarea>
    </label>

    <div class="bidang">
      <span>Foto hasil akhir</span>
      <${FotoInput} nilai=${foto} onUbah=${setFoto} judul="Foto hasil akhir" bantu="Ambil dari kamera atau pilih dari galeri." aksen="var(--hijau)" />
    </div>
  </div>`;

  return html`<${Kerangka} k=${k} aktif="resep">
    <${Hero}
      warna=${kat ? kat.warna : 'var(--tomat)'}
      label=${resep.nama}
      judul=${edit ? `Ubah Eksperimen ${edit.nomor}` : `Eksperimen ${e0.nomor}`}
      panjang=${true}
      kembali=${kembali}
    />
    <form class="isi" onSubmit=${(ev) => (ev.preventDefault(), simpan())} novalidate>
      ${galat.length > 0 &&
      html`<div class="peringatan" role="alert"><b>Belum bisa disimpan:</b><ul style="margin:4px 0 0;padding-left:18px">${galat.map((g) => html`<li>${g}</li>`)}</ul></div>`}
      <div class="kolom-2">${kiri}${kanan}</div>
      <button class="pil" type="submit">Simpan eksperimen<span class="ujung"><${Ikon} nama="panah" /></span></button>
    </form>
    ${pilihBahan && html`<${PilihBahan} k=${k} sudah=${new Set(baris.map((b) => b.idBahan))} onPilih=${tambah} onTutup=${() => setPilihBahan(false)} />`}
  <//>`;
}

export function FormEksperimen({ k, idResep, idEksperimen }) {
  const { db } = k;
  const edit = idEksperimen ? db.ambil('Eksperimen', idEksperimen) : null;
  const resep = db.ambil('Resep', edit ? edit.idResep : idResep);
  if (!resep || (idEksperimen && !edit)) {
    return html`<${Kerangka} k=${k} aktif="resep">
      <${Hero} label="Eksperimen" judul="Tidak ada" kembali="/resep" />
      <div class="isi"><${Kosong} judul="Data tidak ditemukan" teks="Resep atau eksperimen ini mungkin sudah dihapus."><a class="btn solid" href=${tautan('/resep')}>Ke daftar resep</a><//></div>
    <//>`;
  }
  return html`<${IsiForm} key=${edit ? edit.id : resep.id + (k.rute.kueri.dari || '')} k=${k} resep=${resep} edit=${edit} />`;
}
