// Daftar bahan: foto, nama, merek, tempat beli, harga, kemasan, dan konversi satuan.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Stat, Foto, FotoInput, Kosong, InputRupiah, InputAngka } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tanya, tampilToast } from '../ui/pesan.js';
import { patchFoto } from '../ui/gambar.js';
import { simpanBahan, hapusBahan, konversiBahan, pemakaianBahan, fotoSrc } from '../lib/repo.js';
import { SATUAN_BELI, infoSatuanBeli, hargaPerDasar, labelDasar, satuanResep, teksKonversi } from '../lib/units.js';
import { rupiah, angka, tampilJumlah, tanggal } from '../lib/util.js';

const TINT = [
  ['#F6D9D2', '#CF3520'],
  ['#D8DDF0', '#1D2757'],
  ['#D5E8DC', '#0F5B3C'],
  ['#F7E6BD', '#8A5A00'],
  ['#EBD8CB', '#7A3E1D'],
];
const tintDari = (nama) => TINT[[...nama].reduce((j, c) => j + c.charCodeAt(0), 0) % TINT.length];
const SARAN_SATUAN = ['sdm', 'sdt', 'cup', 'butir', 'siung', 'lembar', 'ruas', 'genggam'];

const KOSONG = { nama: '', merek: '', beliDi: '', hargaBeli: 0, isiKemasan: 1, satuanBeli: 'kg' };

function Editor({ k, bahan, onSelesai }) {
  const { db } = k;
  const fotoAwal = bahan ? fotoSrc(bahan, 'fotoLokal', 'fotoUrl') : '';
  const [d, setD] = useState(() => ({ ...KOSONG, ...(bahan || {}) }));
  const [foto, setFoto] = useState(fotoAwal);
  const [konv, setKonv] = useState(() => (bahan ? konversiBahan(db, bahan.id).map((x) => ({ satuan: x.satuan, nilai: x.nilai })) : []));
  const [kvSatuan, setKvSatuan] = useState('');
  const [kvNilai, setKvNilai] = useState(null);
  const [galat, setGalat] = useState('');

  const contoh = { ...d };
  const perDasar = hargaPerDasar(contoh);
  const hargaDasarTeks = Number.isFinite(perDasar) ? 'Rp ' + (perDasar >= 100 ? angka(Math.round(perDasar)) : tampilJumlah(Math.round(perDasar * 100) / 100)) : '–';
  const standar = satuanResep(contoh, []).join(', ');

  const tambahKonv = () => {
    const satuan = kvSatuan.trim().toLowerCase();
    if (!satuan || !(kvNilai > 0)) {
      setGalat('Isi nama satuan dan nilainya, mis. sdm = 6.');
      return;
    }
    setKonv((arr) => [...arr.filter((x) => x.satuan !== satuan), { satuan, nilai: kvNilai }]);
    setKvSatuan('');
    setKvNilai(null);
    setGalat('');
  };

  const simpan = () => {
    if (!d.nama.trim()) return setGalat('Nama bahan wajib diisi.');
    if (!(d.hargaBeli > 0)) return setGalat('Isi harga beli.');
    if (!(d.isiKemasan > 0)) return setGalat('Isi kemasan harus lebih dari 0.');
    const dasar = { ...d, ...patchFoto(fotoAwal, foto, 'fotoLokal', 'fotoUrl') };
    simpanBahan(db, dasar, konv);
    tampilToast('Bahan disimpan.');
    onSelesai();
  };

  const hapus = async () => {
    const dipakai = pemakaianBahan(db, bahan.id);
    const ya = await tanya({
      judul: `Hapus “${bahan.nama}”?`,
      teks: dipakai ? `Bahan ini dipakai di ${dipakai} eksperimen dan akan hilang dari takarannya, sehingga biaya eksperimen itu berkurang.` : 'Bahan ini akan dihapus dari daftar.',
      ya: 'Hapus bahan',
      bahaya: true,
    });
    if (!ya) return;
    hapusBahan(db, bahan.id);
    tampilToast('Bahan dihapus.');
    onSelesai();
  };

  return html`<div class="kartu aktif-hijau kolom" style="border-radius:32px">
    <div class="bidang">
      <span>Foto bahan</span>
      <${FotoInput} nilai=${foto} onUbah=${setFoto} judul="Tambah foto bahan" bantu="Membantu mengenali merek dan kemasan." aksen="var(--hijau)" />
    </div>
    <label class="bidang"><span>Nama bahan</span><input class="input" maxlength="60" value=${d.nama} placeholder="mis. Dark chocolate" onInput=${(e) => (setD({ ...d, nama: e.target.value }), setGalat(''))} /></label>
    <div class="dua-kolom">
      <label class="bidang"><span>Merek</span><input class="input" maxlength="60" value=${d.merek} onInput=${(e) => setD({ ...d, merek: e.target.value })} /></label>
      <label class="bidang"><span>Beli di</span><input class="input" maxlength="60" value=${d.beliDi} onInput=${(e) => setD({ ...d, beliDi: e.target.value })} /></label>
    </div>
    <div class="dua-kolom">
      <label class="bidang"><span>Harga beli</span><${InputRupiah} kelas="input" nilai=${d.hargaBeli} onUbah=${(n) => setD({ ...d, hargaBeli: n })} placeholder="mis. 95.000" /></label>
      <label class="bidang"><span>Isi kemasan</span><${InputAngka} kelas="input" nilai=${d.isiKemasan} onUbah=${(n) => setD({ ...d, isiKemasan: n })} /></label>
    </div>
    <label class="bidang"><span>Satuan kemasan</span>
      <select class="pilih" value=${d.satuanBeli} onChange=${(e) => setD({ ...d, satuanBeli: e.target.value })}>
        ${SATUAN_BELI.map((s) => html`<option value=${s.kode} selected=${d.satuanBeli === s.kode}>${s.label}</option>`)}
      </select>
    </label>
    <div class="baris-pisah">
      <span class="teks-kecil">Harga per ${labelDasar(contoh)}</span>
      <span class="otomatis" aria-live="polite">${hargaDasarTeks}</span>
    </div>

    <div class="kolom" style="gap:8px">
      <div class="label-kecil">Konversi satuan resep</div>
      <p class="bantu">Satuan bawaan: ${standar}. Tambahkan takaran rumah tangga yang Anda pakai, misalnya 1 sdm = 6 ${labelDasar(contoh)}.</p>
      <div class="chips">
        ${konv.map(
          (x) => html`<span class="konversi-chip" key=${x.satuan}>
            ${teksKonversi(contoh, x.satuan, x.nilai)}
            <button type="button" aria-label=${'Hapus konversi ' + x.satuan} onClick=${() => setKonv((arr) => arr.filter((y) => y.satuan !== x.satuan))}><${Ikon} nama="tutup" ukuran=${14} /></button>
          </span>`,
        )}
      </div>
      <div class="konversi-baru">
        <span>1</span>
        <input class="input" list="saran-satuan" aria-label="Nama satuan" placeholder="sdm" maxlength="12" value=${kvSatuan} onInput=${(e) => setKvSatuan(e.target.value)} />
        <datalist id="saran-satuan">${SARAN_SATUAN.map((s) => html`<option value=${s}></option>`)}</datalist>
        <span>=</span>
        <${InputAngka} kelas="input" aria-label="Nilai konversi" nilai=${kvNilai} onUbah=${setKvNilai} placeholder="6" />
        <span>${labelDasar(contoh)}</span>
        <button type="button" class="btn" onClick=${tambahKonv}>Tambah</button>
      </div>
    </div>

    ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
    <div class="baris-btn">
      <button class="btn solid lebar" onClick=${simpan}>Simpan</button>
      <button class="btn abu lebar" onClick=${onSelesai}>Batal</button>
    </div>
    ${bahan && html`<button class="btn bahaya lebar" onClick=${hapus}><${Ikon} nama="sampah" ukuran=${18} />Hapus bahan</button>`}
  </div>`;
}

export function DaftarBahan({ k }) {
  const { db, rute } = k;
  const [terbuka, setTerbuka] = useState(rute.kueri.baru ? 'baru' : '');
  const [cari, setCari] = useState('');
  const semua = db.semua('Bahan').sort((a, b) => a.nama.localeCompare(b.nama));
  const cocok = semua.filter((b) => (b.nama + ' ' + (b.merek || '') + ' ' + (b.beliDi || '')).toLowerCase().includes(cari.trim().toLowerCase()));

  return html`<${Kerangka} k=${k} aktif="bahan" plus=${{ onKlik: () => (setTerbuka('baru'), window.scrollTo({ top: 0, behavior: 'smooth' })), label: 'Bahan baru' }}>
    <${Hero} warna="var(--hijau)" label="Daftar bahan" judul="Bahan" kembali="/" stat=${html`<${Stat} nilai=${semua.length} label="bahan" />`} />
    <div class="isi">
      <input class="input" type="search" placeholder="Cari bahan, merek, atau toko…" aria-label="Cari bahan" value=${cari} onInput=${(e) => setCari(e.target.value)} />
      ${terbuka === 'baru' && html`<${Editor} k=${k} bahan=${null} onSelesai=${() => setTerbuka('')} />`}
      ${semua.length === 0 && terbuka !== 'baru' &&
      html`<${Kosong} judul="Belum ada bahan" teks="Catat bahan yang Anda beli beserta harganya. Biaya setiap eksperimen dihitung otomatis dari sini.">
        <button class="btn solid" onClick=${() => setTerbuka('baru')}>Tambah bahan pertama</button>
      <//>`}
      ${semua.length > 0 && cocok.length === 0 && html`<${Kosong} judul="Tidak ada yang cocok" teks="Coba kata kunci lain." />`}
      <div class="daftar daftar-lebar">
        ${cocok.map((b) => {
          const [tint, tintInk] = tintDari(b.nama);
          const foto = fotoSrc(b, 'fotoLokal', 'fotoUrl');
          if (terbuka === b.id) return html`<div key=${b.id} style="grid-column:1/-1"><${Editor} k=${k} bahan=${b} onSelesai=${() => setTerbuka('')} /></div>`;
          return html`<button class="baris-bahan" key=${b.id} style=${`--tint:${tint};--tint-ink:${tintInk}`} onClick=${() => setTerbuka(b.id)} aria-label=${'Ubah ' + b.nama}>
            <span class="foto-bahan">${foto ? html`<${Foto} src=${foto} />` : html`<b style="font-family:var(--judul);font-size:24px">${b.nama.charAt(0).toUpperCase()}</b>`}</span>
            <span class="teks">
              <b>${b.nama}</b>
              ${b.merek && html`<small class="merek">${b.merek}</small>`}
              <small>${[b.beliDi && 'Beli di ' + b.beliDi, b.hargaDiperbarui && 'Harga ' + tanggal(b.hargaDiperbarui)].filter(Boolean).join(' · ') || 'Belum ada keterangan'}</small>
            </span>
            <span class="harga"><b>${rupiah(b.hargaBeli)}</b><small>/ ${tampilJumlah(b.isiKemasan)} ${infoSatuanBeli(b.satuanBeli).label}</small></span>
          </button>`;
        })}
      </div>
    </div>
  <//>`;
}
