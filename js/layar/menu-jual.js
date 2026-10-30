// Menu & Harga Jual: resep dan paket yang dijual di kasir dan etalase, dalam bentuk tabel.
// Akun dapur menambah / mengubah menu lewat formulir (harga, potensi keuntungan, diskon, varian); toko hanya melihat.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Stat, Kosong, Foto, InputRupiah, InputAngka } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { Modal, tanya, tampilToast } from '../ui/pesan.js';
import { tautan } from '../ui/router.js';
import {
  daftarMenu, pilihanMenu, tambahMenu, peranAkun, fotoTampilMenu, hargaJual, diskonBerlaku, opsiMenu, hargaSaranMenu,
  sisaMenu, stokIsiMenu, stokMakanan,
} from '../lib/toko.js';
import { keInputWaktu, dariInputWaktu } from './catat-pesanan.js';
import { dataHPP, dataPaket } from '../lib/repo.js';
import { marginDariHarga } from '../lib/hpp.js';
import { rupiah, persen, tampilJumlah } from '../lib/util.js';

/** HPP satu menu (hanya akun dapur yang punya datanya). */
function hppMenu(db, menu) {
  if (menu.jenis === 'paket') {
    const p = dataPaket(db, menu.idRef);
    return p ? p.hppPaket : NaN;
  }
  const d = dataHPP(db, menu.idRef);
  return d ? d.hppJual : NaN;
}

/** Sisa stok menu. Paket: isi yang paling sedikit menentukan; disebutkan isi yang kosong. */
function TeksSisa({ db, m, sisa }) {
  if (sisa === null) return html`<span class="teks-kecil">tidak dilacak</span>`;
  if (sisa > 0) return html`<b>${sisa}</b>`;
  const kosong = m.jenis === 'paket' ? stokIsiMenu(db, m).filter((x) => !x.cukup && x.resep).map((x) => x.resep.nama) : [];
  return html`<span class="lencana-status belum">Habis</span>${kosong.length ? html`<br /><small class="teks-buruk">${kosong.join(', ')} kosong</small>` : ''}`;
}

/** Pilihan tambahan berbayar (varian), mis. "Digoreng" +2.000, "Tambah keju" +3.000. */
function EditorOpsi({ m, ubah }) {
  const [baris, setBaris] = useState(() => opsiMenu(m));
  const simpan = (daftar) => ubah({ opsi: daftar.filter((o) => String(o.nama || '').trim()).map((o) => ({ nama: String(o.nama).trim().slice(0, 40), harga: Math.max(0, Math.round(Number(o.harga) || 0)) })) });
  const atur = (i, patch) => {
    const baru = baris.map((o, j) => (j === i ? { ...o, ...patch } : o));
    setBaris(baru);
    simpan(baru);
  };
  const hapus = (i) => {
    const baru = baris.filter((_, j) => j !== i);
    setBaris(baru);
    simpan(baru);
  };
  return html`<div class="kolom" style="gap:8px">
    <span class="label-kecil">Pilihan tambahan / varian (opsional)</span>
    ${baris.map(
      (o, i) => html`<div class="baris-opsi" key=${i}>
        <input class="input kecil" maxlength="40" placeholder="mis. Digoreng / Tambah keju" aria-label=${`Nama pilihan ${i + 1}`} value=${o.nama} onInput=${(e) => atur(i, { nama: e.target.value })} />
        <${InputRupiah} kelas="input kecil" aria-label=${`Harga pilihan ${i + 1}`} placeholder="+ Rp" nilai=${o.harga} onUbah=${(n) => atur(i, { harga: n })} />
        <button type="button" class="ikon-btn kecil" aria-label=${'Hapus pilihan ' + (o.nama || i + 1)} onClick=${() => hapus(i)}><${Ikon} nama="sampah" ukuran=${16} /></button>
      </div>`,
    )}
    ${baris.length < 12 && html`<button type="button" class="btn kecil" style="align-self:flex-start" onClick=${() => setBaris([...baris, { nama: '', harga: 0 }])}><${Ikon} nama="plus" ukuran=${16} />Tambah pilihan</button>`}
  </div>`;
}

const KOSONG = { jenis: '', idRef: '', nama: '', harga: 0, keterangan: '', aktif: true, online: true, diskon: 0, diskonSampai: 0, opsi: [], segera: false };

/** Formulir tambah / ubah menu: pilih dari daftar, harga jual, potensi keuntungan, diskon, varian, dan status. */
function FormMenu({ db, awal, onTutup }) {
  const baru = !awal;
  const [d, setD] = useState(() => (awal ? { ...KOSONG, ...awal, opsi: opsiMenu(awal) } : { ...KOSONG }));
  const [galat, setGalat] = useState('');
  const atur = (patch) => (setGalat(''), setD((x) => ({ ...x, ...patch })));
  const pilihan = baru ? pilihanMenu(db) : [];
  const pilih = (nilai) => {
    const [jenis, idRef] = nilai.split(':');
    if (!idRef) return atur({ jenis: '', idRef: '', nama: '', harga: 0 });
    const sumber = db.ambil(jenis === 'paket' ? 'Paket' : 'Resep', idRef);
    atur({ jenis, idRef, nama: sumber ? sumber.nama : '', harga: hargaSaranMenu(db, jenis, idRef) });
  };

  const ada = !!d.idRef;
  const hpp = ada ? hppMenu(db, d) : NaN;
  const saran = ada ? hargaSaranMenu(db, d.jenis, d.idRef) : 0;
  const harga = hargaJual(d);
  const diskon = diskonBerlaku(d);
  const laba = Number.isFinite(hpp) && harga > 0 ? harga - hpp : NaN;
  const mg = Number.isFinite(hpp) && harga > 0 ? marginDariHarga(hpp, harga) : null;
  const sisa = ada ? sisaMenu(db, d) : null;
  const isi = ada && d.jenis === 'paket' ? stokIsiMenu(db, d) : [];

  const simpan = () => {
    if (!ada) return setGalat('Pilih resep atau paket dulu.');
    if (!String(d.nama || '').trim()) return setGalat('Isi nama menu.');
    if (!(d.harga > 0)) return setGalat('Isi harga jual.');
    const isian = {
      nama: d.nama.trim().slice(0, 60),
      harga: d.harga,
      keterangan: String(d.keterangan || '').trim().slice(0, 200),
      aktif: !!d.aktif,
      online: !!d.aktif && !!d.online,
      diskon: Math.max(0, Math.min(90, Math.round(Number(d.diskon) || 0))),
      diskonSampai: Number(d.diskonSampai) || 0,
      opsi: opsiMenu(d),
      segera: !!d.segera,
    };
    if (baru) tambahMenu(db, d.jenis, d.idRef, isian);
    else db.simpan('Menu', { ...db.ambil('Menu', awal.id), ...isian });
    tampilToast(baru ? `${isian.nama} masuk menu jual.` : `${isian.nama} disimpan.`);
    onTutup();
  };

  return html`<${Modal} judul=${baru ? 'Tambah menu' : 'Ubah menu'} onTutup=${onTutup}>
    <div class="kolom form-menu" style="gap:12px">
      ${baru
        ? html`<label class="bidang"><span>Pilih dari daftar</span>
            <select class="pilih" aria-label="Pilih resep atau paket" value=${ada ? d.jenis + ':' + d.idRef : ''} onChange=${(e) => pilih(e.target.value)}>
              <option value="">Pilih resep atau paket…</option>
              ${pilihan.map((p) => html`<option value=${p.jenis + ':' + p.id}>${p.jenis === 'paket' ? 'Paket · ' : ''}${p.nama}</option>`)}
            </select>
            ${pilihan.length === 0 && html`<small class="bantu">Semua resep dan paket sudah ada di menu. <a href=${tautan('/paket')}>Buat paket baru</a></small>`}
          </label>`
        : html`<div class="hasil-baris"><span>${d.jenis === 'paket' ? 'Paket' : 'Resep'}</span><b class="biasa">${(db.ambil(d.jenis === 'paket' ? 'Paket' : 'Resep', d.idRef) || {}).nama || '–'}</b></div>`}

      ${ada &&
      html`<div class="pratinjau-menu">
          <span class="foto-menu"><${Foto} src=${fotoTampilMenu(db, d)} ikon=${d.jenis === 'paket' ? 'kotak' : 'kue'} /></span>
          <label class="bidang" style="flex:1"><span>Nama di menu</span><input class="input kecil" maxlength="60" aria-label="Nama di menu" value=${d.nama} onInput=${(e) => atur({ nama: e.target.value })} /></label>
        </div>
        <div class="dua-kolom">
          <label class="bidang"><span>Harga jual</span><${InputRupiah} kelas="input" aria-label="Harga jual" nilai=${d.harga} onUbah=${(n) => atur({ harga: n })} /></label>
          <div class="bidang"><span>Harga saran</span>
            <button type="button" class="btn" disabled=${!saran || saran === d.harga} onClick=${() => atur({ harga: saran })}>${saran ? 'Pakai ' + rupiah(saran) : 'Belum ada HPP'}</button>
          </div>
        </div>

        <div class="ringkas-laba" aria-label="Potensi keuntungan">
          <div><small>HPP</small><b>${Number.isFinite(hpp) ? rupiah(hpp) : '–'}</b></div>
          <div><small>Harga jual${diskon ? ` (−${diskon}%)` : ''}</small><b>${rupiah(harga)}</b></div>
          <div class=${Number.isFinite(laba) && laba < 0 ? 'rugi' : 'untung'}><small>Untung per jual</small><b>${Number.isFinite(laba) ? rupiah(laba) : '–'}</b></div>
          <div><small>Margin</small><b>${mg ? persen(mg.marginPersen) : '–'}</b></div>
        </div>
        ${Number.isFinite(laba) && laba < 0 && html`<p class="galat-teks">Harga di bawah HPP: rugi ${rupiah(-laba)} per jual.</p>`}
        <p class="bantu">Stok: ${sisa === null ? 'tidak dilacak' : sisa > 0 ? `bisa dijual ${sisa}` : 'habis'}${isi.length ? ` · isi paket: ${isi.map((x) => `${x.resep ? x.resep.nama : '?'} ${tampilJumlah(x.stok)}${x.per !== 1 ? `/${tampilJumlah(x.per)}` : ''}`).join(', ')}` : ''}</p>

        <div class="baris-diskon">
          <label class="bidang"><span>Diskon (%)</span><${InputAngka} kelas="input kecil" aria-label="Diskon persen" nilai=${d.diskon || 0} onUbah=${(n) => atur({ diskon: Math.max(0, Math.min(90, Math.round(n) || 0)) })} placeholder="0" /></label>
          <label class="bidang"><span>Diskon sampai (opsional)</span><input class="input kecil" type="date" aria-label="Diskon sampai" value=${d.diskonSampai ? keInputWaktu(d.diskonSampai).slice(0, 10) : ''} onChange=${(e) => atur({ diskonSampai: e.target.value ? dariInputWaktu(e.target.value + 'T23:59') : 0 })} /></label>
        </div>
        <${EditorOpsi} m=${d} ubah=${atur} />
        <label class="bidang"><span>Keterangan untuk pembeli (opsional)</span><input class="input kecil" maxlength="200" value=${d.keterangan || ''} onInput=${(e) => atur({ keterangan: e.target.value })} placeholder="mis. isi 6 potong, tahan 2 hari" /></label>
        <div class="baris-saklar">
          <label class="saklar"><input type="checkbox" checked=${!!d.aktif} onChange=${(e) => atur({ aktif: e.target.checked })} /><span>Dijual</span></label>
          <label class="saklar"><input type="checkbox" checked=${!!d.online} disabled=${!d.aktif} onChange=${(e) => atur({ online: e.target.checked })} /><span>Tampil di etalase</span></label>
          <label class="saklar"><input type="checkbox" checked=${!!d.segera} onChange=${(e) => atur({ segera: e.target.checked })} /><span>Coming soon</span></label>
        </div>
        ${d.segera && html`<p class="bantu">Coming soon: harga tidak tampil di etalase, tetapi pembeli tetap bisa memesan seperti biasa (untuk uji coba). Total di keranjang tetap memakai harga jual di atas.</p>`}`}
      ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
      <div class="baris-btn">
        <button class="btn solid" disabled=${!ada} onClick=${simpan}><${Ikon} nama="centang" ukuran=${18} />${baru ? 'Masukkan ke menu' : 'Simpan'}</button>
        <button class="btn abu" onClick=${onTutup}>Batal</button>
      </div>
    </div>
  <//>`;
}

export function MenuJual({ k }) {
  const { db } = k;
  const dapur = peranAkun(db) === 'dapur';
  const daftar = daftarMenu(db);
  const stok = stokMakanan(db);
  const [form, setForm] = useState(null); // null | 'baru' | menu
  const [cari, setCari] = useState('');
  const q = cari.trim().toLowerCase();
  const tampil = daftar.filter(({ menu: m }) => !q || m.nama.toLowerCase().includes(q));
  const hapus = async (m) => {
    const ya = await tanya({ judul: `Keluarkan “${m.nama}” dari menu?`, teks: 'Resep/paketnya tidak terhapus. Pesanan lama tetap tersimpan.', ya: 'Keluarkan', bahaya: true });
    if (ya) db.hapus('Menu', m.id);
  };

  return html`<${Kerangka} k=${k} aktif="menu">
    <${Hero} warna="var(--hijau)" label="Toko" judul="Menu & harga jual" kembali="/" stat=${html`<${Stat} nilai=${daftar.filter((x) => x.menu.aktif).length} label="dijual" />`}>
      <p class="hero-sub">${dapur ? 'Menu yang dijual muncul di Kasir; yang tampil di etalase muncul untuk pembeli. Paket habis bila salah satu isinya kosong.' : 'Harga diatur oleh admin.'}</p>
    <//>
    <div class="isi">
      <div class="baris-cari">
        <input class="input" type="search" placeholder="Cari menu…" aria-label="Cari menu" value=${cari} onInput=${(e) => setCari(e.target.value)} />
        ${dapur && html`<button class="btn solid" onClick=${() => setForm('baru')}><${Ikon} nama="plus" ukuran=${18} />Tambah menu</button>`}
      </div>
      ${daftar.length === 0
        ? html`<${Kosong} judul="Menu masih kosong" teks=${dapur ? 'Tekan Tambah menu, lalu pilih resep atau paket yang mau dijual.' : 'Admin belum memasukkan menu.'} />`
        : html`<div class="tabel-gulir kartu tabel-kartu">
            <table class="tabel-data">
              <thead>
                <tr>
                  <th>Menu</th>
                  ${dapur && html`<th class="angka">HPP</th>`}
                  <th class="angka">Harga jual</th>
                  ${dapur && html`<th class="angka">Untung / jual</th>`}
                  ${dapur && html`<th class="angka">Margin</th>`}
                  <th class="angka">Stok</th>
                  <th>Status</th>
                  ${dapur && html`<th aria-label="Aksi"></th>`}
                </tr>
              </thead>
              <tbody>
                ${tampil.map(({ menu: m, sisa }) => {
                  const hpp = dapur ? hppMenu(db, m) : NaN;
                  const harga = hargaJual(m);
                  const laba = Number.isFinite(hpp) && harga > 0 ? harga - hpp : NaN;
                  const mg = Number.isFinite(hpp) && harga > 0 ? marginDariHarga(hpp, harga) : null;
                  const opsi = opsiMenu(m);
                  return html`<tr key=${m.id} class=${m.aktif ? '' : 'mati'}>
                    <td>
                      <span class="sel-menu">
                        <span class="foto-mini"><${Foto} src=${fotoTampilMenu(db, m)} ikon=${m.jenis === 'paket' ? 'kotak' : 'kue'} ukuranIkon=${18} /></span>
                        <span><b>${m.nama}</b><small>${m.jenis === 'paket' ? 'Paket' : 'Resep'}${opsi.length ? ` · ${opsi.length} varian` : ''}${diskonBerlaku(m) ? ` · diskon ${diskonBerlaku(m)}%` : ''}</small></span>
                      </span>
                    </td>
                    ${dapur && html`<td class="angka">${Number.isFinite(hpp) ? rupiah(hpp) : '–'}</td>`}
                    <td class="angka"><b>${rupiah(harga)}</b>${diskonBerlaku(m) ? html`<br /><s class="teks-kecil">${rupiah(m.harga)}</s>` : ''}</td>
                    ${dapur && html`<td class=${'angka ' + (laba < 0 ? 'teks-buruk' : 'teks-baik')}>${Number.isFinite(laba) ? rupiah(laba) : '–'}</td>`}
                    ${dapur && html`<td class=${'angka' + (mg && mg.marginPersen < 0 ? ' teks-buruk' : '')}>${mg ? persen(mg.marginPersen) : '–'}</td>`}
                    <td class="angka"><${TeksSisa} db=${db} m=${m} sisa=${sisaMenu(db, m, stok) ?? sisa} /></td>
                    <td><span class=${'lencana-status ' + (m.aktif ? 'lunas' : 'belum')}>${m.aktif ? 'Dijual' : 'Tidak dijual'}</span>${m.aktif && m.online ? html`<br /><small class="teks-kecil">+ etalase</small>` : ''}${m.segera ? html`<br /><span class="label-segera">Coming soon</span>` : ''}</td>
                    ${dapur &&
                    html`<td class="aksi">
                      <button class="btn kecil" aria-label=${'Ubah ' + m.nama} onClick=${() => setForm(m)}>Ubah</button>
                      <button class="ikon-btn kecil" aria-label=${'Keluarkan ' + m.nama + ' dari menu'} onClick=${() => hapus(m)}><${Ikon} nama="sampah" ukuran=${16} /></button>
                    </td>`}
                  </tr>`;
                })}
              </tbody>
            </table>
          </div>`}
    </div>
    ${form && html`<${FormMenu} key=${form === 'baru' ? 'baru' : form.id} db=${db} awal=${form === 'baru' ? null : form} onTutup=${() => setForm(null)} />`}
  <//>`;
}
