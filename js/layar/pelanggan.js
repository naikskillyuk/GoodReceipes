// Pelanggan (tercatat otomatis dari nomor WhatsApp di setiap pesanan), kode promo, dan testimoni pembeli.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Stat, Kosong, Tab, InputRupiah, InputAngka, unduhBerkas } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tanya, tampilToast } from '../ui/pesan.js';
import {
  daftarPelanggan, daftarPromo, cariPromo, tampilHp, tampilanToko, daftarTestimoni, simpanTestimoni, daftarMenu, namaProdukPromo, syaratPromoProduk,
} from '../lib/toko.js';
import { rupiah, tanggal, tampilJumlah } from '../lib/util.js';

const UNTUK = { semua: 'Semua pembeli', baru: 'Pelanggan baru (pesanan pertama)', lama: 'Pelanggan lama (pernah memesan)' };

function csv(daftar) {
  const sel = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;
  const baris = [['Nama', 'WhatsApp', 'Jumlah pesanan', 'Total belanja', 'Pesanan terakhir', 'Terdaftar']];
  for (const d of daftar) baris.push([d.pelanggan.nama, tampilHp(d.pelanggan.hp), d.jumlahPesanan, Math.round(d.totalBelanja), d.terakhir ? tanggal(d.terakhir) : '', tanggal(d.pelanggan.dibuat)]);
  return '﻿' + baris.map((b) => b.map(sel).join(',')).join('\n');
}

function Pelanggan({ db }) {
  const [cari, setCari] = useState('');
  const semua = daftarPelanggan(db);
  const q = cari.trim().toLowerCase();
  const daftar = semua.filter((d) => !q || `${d.pelanggan.nama} ${d.pelanggan.hp} ${tampilHp(d.pelanggan.hp)}`.toLowerCase().includes(q));
  return html`<div class="kolom">
    <p class="bantu">Pelanggan tercatat otomatis dari nomor WhatsApp yang diisi di kasir atau di link pemesanan. Pakai untuk mengirim promo lewat WhatsApp.</p>
    <div class="cari-baris">
      <input class="input" type="search" placeholder="Cari nama atau nomor…" aria-label="Cari pelanggan" value=${cari} onInput=${(e) => setCari(e.target.value)} />
      <button class="btn" disabled=${!semua.length} onClick=${() => unduhBerkas('pelanggan.csv', csv(semua), 'text/csv;charset=utf-8')}><${Ikon} nama="unduh" ukuran=${18} />CSV</button>
    </div>
    ${semua.length === 0 && html`<${Kosong} judul="Belum ada pelanggan" teks="Isi nomor WhatsApp pembeli saat membuat pesanan." />`}
    <div class="daftar daftar-lebar">
      ${daftar.map(
        (d) => html`<div class="baris-stok" key=${d.pelanggan.id}>
          <span class="teks"><b>${d.pelanggan.nama || 'Tanpa nama'}</b><small>${tampilHp(d.pelanggan.hp)} · ${d.jumlahPesanan} pesanan${d.terakhir ? ' · terakhir ' + tanggal(d.terakhir) : ''}</small></span>
          <span class="baris-aksi">
            <b>${rupiah(d.totalBelanja)}</b>
            <a class="ikon-btn kecil" href=${`https://wa.me/${d.pelanggan.hp}`} target="_blank" rel="noopener" aria-label=${'WhatsApp ' + (d.pelanggan.nama || d.pelanggan.hp)}><${Ikon} nama="kirim" ukuran=${16} /></a>
          </span>
        </div>`,
      )}
    </div>
  </div>`;
}

const PROMO_BARU = {
  kode: '', nama: '', jenis: 'persen', nilai: 10, maksDiskon: 0, minBelanja: 0, untuk: 'semua', mulai: null, sampai: null, kuota: 0, aktif: true, online: true,
  idMenu: '', minJumlah: 1, berlaku: 'kelipatan',
};

/** Contoh hitungan promo khusus produk, supaya admin paham arti "kelipatan" dan "sekali per pesanan". */
function contohPromoProduk(d, nama) {
  const min = Math.max(1, Math.floor(Number(d.minJumlah) || 1));
  const besar = d.jenis === 'persen' ? `${tampilJumlah(d.nilai || 0)}%` : rupiah(d.nilai || 0);
  const beli = (n) => `beli ${n} ${nama}`;
  if (d.berlaku === 'sekali') return `Contoh: ${beli(min)} hemat ${besar}${d.jenis === 'persen' ? ` dari ${min} item` : ''}; ${beli(min * 3)} tetap hemat ${besar}${d.jenis === 'persen' ? ` dari ${min} item saja` : ''}.`;
  if (d.jenis === 'persen') return `Contoh: ${beli(min)} hemat ${besar} dari ${min} item; ${beli(min * 2 + (min > 1 ? 1 : 0))} hemat ${besar} dari ${min * 2} item.`;
  const nilai = Number(d.nilai) || 0;
  return `Contoh: ${beli(min)} hemat ${rupiah(nilai)}; ${beli(min * 2)} hemat ${rupiah(nilai * 2)}; ${beli(min * 3)} hemat ${rupiah(nilai * 3)}.`;
}
const keTanggal = (ts) => (ts ? new Date(ts - new Date(ts).getTimezoneOffset() * 60000).toISOString().slice(0, 10) : '');
const dariTanggal = (teks, akhir = false) => (teks ? new Date(teks + (akhir ? 'T23:59:59' : 'T00:00:00')).getTime() : null);

function FormPromo({ db, promo, onSelesai }) {
  const [d, setD] = useState(() => ({ ...PROMO_BARU, ...(promo || {}) }));
  const [galat, setGalat] = useState('');
  const ubah = (patch) => (setD({ ...d, ...patch }), setGalat(''));
  const menu = daftarMenu(db);
  const namaProduk = namaProdukPromo(db, d);
  const simpan = () => {
    const kode = d.kode.trim().toUpperCase().replace(/\s+/g, '');
    if (!/^[A-Z0-9_-]{3,20}$/.test(kode)) return setGalat('Kode 3-20 huruf/angka tanpa spasi, mis. HEMAT10.');
    const lain = cariPromo(db, kode);
    if (lain && lain.id !== d.id) return setGalat('Kode itu sudah dipakai promo lain.');
    if (!(d.nilai > 0)) return setGalat('Isi besar diskon.');
    if (d.jenis === 'persen' && d.nilai > 100) return setGalat('Diskon persen maksimal 100.');
    const minJumlah = Math.max(1, Math.min(100, Math.floor(Number(d.minJumlah) || 1)));
    db.simpan('Promo', {
      ...d, kode, nama: d.nama.trim(), maksDiskon: d.maksDiskon || 0, minBelanja: d.minBelanja || 0, kuota: d.kuota || 0,
      idMenu: d.idMenu || '', minJumlah: d.idMenu ? minJumlah : 1, berlaku: d.idMenu && d.berlaku === 'sekali' ? 'sekali' : 'kelipatan',
    });
    tampilToast(`Promo ${kode} disimpan.`);
    onSelesai();
  };
  const hapus = async () => {
    if (await tanya({ judul: `Hapus promo ${d.kode}?`, teks: 'Pesanan yang sudah memakai kode ini tidak berubah.', ya: 'Hapus', bahaya: true })) {
      db.hapus('Promo', d.id);
      onSelesai();
    }
  };
  return html`<section class="kartu aktif-hijau kolom">
    <div class="dua-kolom">
      <label class="bidang"><span>Kode promo</span><input class="input" maxlength="20" style="text-transform:uppercase" value=${d.kode} placeholder="HEMAT10" onInput=${(e) => ubah({ kode: e.target.value })} /></label>
      <label class="bidang"><span>Nama (opsional)</span><input class="input" maxlength="60" value=${d.nama} placeholder="Promo pembukaan" onInput=${(e) => ubah({ nama: e.target.value })} /></label>
    </div>
    <label class="bidang"><span>Berlaku untuk</span>
      <select class="pilih" aria-label="Berlaku untuk" value=${d.idMenu || ''} onChange=${(e) => ubah({ idMenu: e.target.value })}>
        <option value="" selected=${!d.idMenu}>Seluruh belanja</option>
        ${menu.map(({ menu: m }) => html`<option value=${m.id} selected=${d.idMenu === m.id}>Hanya ${m.nama}${m.aktif ? '' : ' (nonaktif)'}</option>`)}
        ${d.idMenu && !menu.some(({ menu: m }) => m.id === d.idMenu) && html`<option value=${d.idMenu} selected>Produk yang sudah dihapus</option>`}
      </select>
    </label>
    ${d.idMenu && html`<div class="kolom" style="gap:10px">
      <div class="dua-kolom">
        <label class="bidang"><span>Minimal beli (item)</span><${InputAngka} kelas="input" aria-label="Minimal beli" nilai=${d.minJumlah || 1} onUbah=${(n) => ubah({ minJumlah: Math.max(1, Math.min(100, Math.floor(n) || 1)) })} /></label>
        <div class="bidang"><span>Cara berlaku</span>
          <div class="chips" role="group" aria-label="Cara berlaku">
            <button type="button" class=${'chip' + (d.berlaku !== 'sekali' ? ' aktif' : '')} onClick=${() => ubah({ berlaku: 'kelipatan' })}>Kelipatan</button>
            <button type="button" class=${'chip' + (d.berlaku === 'sekali' ? ' aktif' : '')} onClick=${() => ubah({ berlaku: 'sekali' })}>Sekali per pesanan</button>
          </div>
        </div>
      </div>
      <p class="bantu">${contohPromoProduk(d, namaProduk)}</p>
    </div>`}
    <div class="chips" role="group" aria-label="Jenis diskon">
      <button type="button" class=${'chip' + (d.jenis === 'persen' ? ' aktif' : '')} onClick=${() => ubah({ jenis: 'persen' })}>Persen (%)</button>
      <button type="button" class=${'chip' + (d.jenis === 'nominal' ? ' aktif' : '')} onClick=${() => ubah({ jenis: 'nominal' })}>Potongan (Rp)</button>
    </div>
    <div class="dua-kolom">
      ${d.jenis === 'persen'
        ? html`<label class="bidang"><span>Diskon (%)</span><${InputAngka} kelas="input" nilai=${d.nilai} onUbah=${(n) => ubah({ nilai: n })} /></label>
            <label class="bidang"><span>Maks. potongan (Rp, opsional)</span><${InputRupiah} kelas="input" nilai=${d.maksDiskon} onUbah=${(n) => ubah({ maksDiskon: n })} /></label>`
        : html`<label class="bidang"><span>Potongan (Rp)</span><${InputRupiah} kelas="input" nilai=${d.nilai} onUbah=${(n) => ubah({ nilai: n })} /></label>`}
    </div>
    <div class="dua-kolom">
      <label class="bidang"><span>Minimal belanja (Rp)</span><${InputRupiah} kelas="input" nilai=${d.minBelanja} onUbah=${(n) => ubah({ minBelanja: n })} /></label>
      <label class="bidang"><span>Kuota pemakaian (0 = tanpa batas)</span><${InputAngka} kelas="input" nilai=${d.kuota} onUbah=${(n) => ubah({ kuota: n })} /></label>
    </div>
    <label class="bidang"><span>Untuk siapa</span>
      <select class="pilih" value=${d.untuk} onChange=${(e) => ubah({ untuk: e.target.value })}>
        ${Object.entries(UNTUK).map(([k, v]) => html`<option value=${k} selected=${d.untuk === k}>${v}</option>`)}
      </select>
    </label>
    <div class="dua-kolom">
      <label class="bidang"><span>Mulai (opsional)</span><input class="input" type="date" value=${keTanggal(d.mulai)} onInput=${(e) => ubah({ mulai: dariTanggal(e.target.value) })} /></label>
      <label class="bidang"><span>Sampai (opsional)</span><input class="input" type="date" value=${keTanggal(d.sampai)} onInput=${(e) => ubah({ sampai: dariTanggal(e.target.value, true) })} /></label>
    </div>
    <div class="baris-saklar">
      <label class="saklar"><input type="checkbox" checked=${!!d.aktif} onChange=${(e) => ubah({ aktif: e.target.checked })} /><span>Aktif</span></label>
      <label class="saklar"><input type="checkbox" checked=${!!d.online} onChange=${(e) => ubah({ online: e.target.checked })} /><span>Berlaku di link pemesanan</span></label>
    </div>
    ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
    <div class="baris-btn">
      <button class="btn solid lebar" onClick=${simpan}>Simpan promo</button>
      <button class="btn abu lebar" onClick=${onSelesai}>Batal</button>
    </div>
    ${d.id && html`<button class="btn bahaya lebar" onClick=${hapus}><${Ikon} nama="sampah" ukuran=${18} />Hapus promo</button>`}
  </section>`;
}

function ringkasPromo(db, p) {
  const besar = p.jenis === 'persen' ? `${tampilJumlah(p.nilai)}%${p.maksDiskon > 0 ? ' maks. ' + rupiah(p.maksDiskon) : ''}` : rupiah(p.nilai);
  return [
    besar,
    p.idMenu && syaratPromoProduk(namaProdukPromo(db, p), p),
    p.minBelanja > 0 && 'min. ' + rupiah(p.minBelanja),
    p.untuk !== 'semua' && (p.untuk === 'baru' ? 'pelanggan baru' : 'pelanggan lama'),
    p.sampai && 's.d. ' + tanggal(p.sampai),
    p.online ? 'kasir + online' : 'kasir saja',
  ]
    .filter(Boolean)
    .join(' · ');
}

function Promo({ db, bisaUbah }) {
  const [buka, setBuka] = useState('');
  const daftar = daftarPromo(db);
  return html`<div class="kolom">
    ${bisaUbah && buka !== 'baru' && html`<button class="btn solid" onClick=${() => setBuka('baru')}><${Ikon} nama="tag" ukuran=${18} />Promo baru</button>`}
    ${buka === 'baru' && html`<${FormPromo} db=${db} promo=${null} onSelesai=${() => setBuka('')} />`}
    ${daftar.length === 0 && buka !== 'baru' && html`<${Kosong} judul="Belum ada promo" teks=${bisaUbah ? 'Buat kode promo untuk pelanggan baru, pelanggan setia, atau momen tertentu.' : 'Akun dapur belum membuat promo.'} />`}
    <div class="daftar daftar-lebar">
      ${daftar.map(({ promo: p, dipakai }) =>
        buka === p.id
          ? html`<div style="grid-column:1/-1" key=${p.id}><${FormPromo} db=${db} promo=${p} onSelesai=${() => setBuka('')} /></div>`
          : html`<button class=${'baris-stok' + (p.aktif ? '' : ' mati')} key=${p.id} disabled=${!bisaUbah} onClick=${() => setBuka(p.id)}>
              <span class="teks"><b>${p.kode}${p.nama ? ' · ' + p.nama : ''}</b><small>${ringkasPromo(db, p)}</small></span>
              <span class="angka-stok"><b>${dipakai}${p.kuota > 0 ? '/' + p.kuota : ''}</b><small>${p.aktif ? 'dipakai' : 'nonaktif'}</small></span>
            </button>`,
      )}
    </div>
  </div>`;
}

export function Bintang({ nilai, ukuran = 14 }) {
  const n = Math.max(0, Math.min(5, Math.round(Number(nilai) || 0)));
  return html`<span class="bintang-baris" role="img" aria-label=${n + ' dari 5 bintang'}>${[1, 2, 3, 4, 5].map((i) => html`<span class=${i <= n ? 'nyala' : ''} style=${`font-size:${ukuran}px`} aria-hidden="true">★</span>`)}</span>`;
}

function FormTestimoni({ db, awal, onTutup }) {
  const [nama, setNama] = useState(awal ? awal.nama : '');
  const [isi, setIsi] = useState(awal ? awal.isi : '');
  const [bintang, setBintang] = useState(awal ? Number(awal.bintang) || 5 : 5);
  const [galat, setGalat] = useState('');
  const simpan = () => {
    try {
      simpanTestimoni(db, { id: awal && awal.id, nama, isi, bintang, tampil: awal ? !!awal.tampil : true });
      tampilToast('Testimoni disimpan.');
      onTutup();
    } catch (e) {
      setGalat(e.message);
    }
  };
  return html`<section class="kartu kolom" aria-label="Form testimoni">
    <label class="bidang"><span>Nama pembeli</span><input class="input kecil" maxlength="60" value=${nama} onInput=${(e) => setNama(e.target.value)} placeholder="mis. Sari, Bekasi" /></label>
    <label class="bidang"><span>Isi testimoni</span><textarea class="input kecil" rows="3" maxlength="500" value=${isi} onInput=${(e) => (setIsi(e.target.value), setGalat(''))} placeholder="Salin dari chat WhatsApp pembeli"></textarea></label>
    <div class="bidang"><span>Bintang</span>
      <div class="chips" role="group" aria-label="Bintang">${[5, 4, 3, 2, 1].map((n) => html`<button type="button" class=${'chip' + (bintang === n ? ' aktif' : '')} aria-pressed=${bintang === n} onClick=${() => setBintang(n)}>${n} ★</button>`)}</div>
    </div>
    ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
    <div class="baris-btn"><button class="btn solid" onClick=${simpan}>Simpan testimoni</button><button class="btn abu" onClick=${onTutup}>Batal</button></div>
  </section>`;
}

/** Testimoni: dari pembeli (perlu disetujui) atau ditulis admin. Yang tayang muncul di halaman pemesanan. */
function Testimoni({ db }) {
  const [form, setForm] = useState(null); // null | 'baru' | baris
  const daftar = daftarTestimoni(db);
  const menunggu = daftar.filter((t) => !t.tampil).length;
  const hapus = async (t) => {
    if (await tanya({ judul: 'Hapus testimoni?', teks: `Testimoni dari ${t.nama || 'pembeli'} dihapus.`, ya: 'Hapus', bahaya: true })) db.hapus('Testimoni', t.id);
  };
  return html`<div class="kolom">
    <p class="bantu">Testimoni yang <b>tayang</b> muncul di bawah halaman pemesanan pembeli. Pembeli bisa mengirim testimoni setelah pesanannya lunas${menunggu ? `; ${menunggu} menunggu persetujuan` : ''}.</p>
    ${form ? html`<${FormTestimoni} db=${db} awal=${form === 'baru' ? null : form} onTutup=${() => setForm(null)} />` : html`<button class="btn" style="align-self:flex-start" onClick=${() => setForm('baru')}><${Ikon} nama="plus" ukuran=${18} />Tulis testimoni</button>`}
    ${daftar.length === 0 && !form && html`<${Kosong} judul="Belum ada testimoni" teks="Tulis testimoni dari chat pembeli, atau tunggu kiriman dari halaman pemesanan." />`}
    <div class="daftar daftar-lebar">
      ${daftar.map(
        (t) => html`<div class=${'kartu-testi-admin' + (t.tampil ? '' : ' menunggu')} key=${t.id}>
          <div class="baris-pisah">
            <span class="kolom" style="gap:2px"><b>${t.nama || 'Pembeli'}</b><${Bintang} nilai=${t.bintang} /></span>
            <span class=${'lencana-status ' + (t.tampil ? 'lunas' : 'tunggu')}>${t.tampil ? 'Tayang' : 'Menunggu'}</span>
          </div>
          <p class="isi-testi">${t.isi}</p>
          <small class="teks-kecil">${tanggal(t.waktu)} · ${t.sumber === 'pembeli' ? 'dari pembeli' : 'ditulis admin'}</small>
          <div class="baris-btn">
            <button class=${'btn kecil' + (t.tampil ? '' : ' solid')} onClick=${() => db.simpan('Testimoni', { ...t, tampil: !t.tampil })}>${t.tampil ? 'Sembunyikan' : 'Tayangkan'}</button>
            <button class="btn kecil" onClick=${() => setForm(t)}>Ubah</button>
            <button class="btn kecil bahaya" onClick=${() => hapus(t)}>Hapus</button>
          </div>
        </div>`,
      )}
    </div>
  </div>`;
}

export function PelangganPromo({ k }) {
  const { db, rute } = k;
  const admin = !tampilanToko(db);
  const tab = rute.kueri.tab === 'promo' ? 'promo' : rute.kueri.tab === 'testimoni' && admin ? 'testimoni' : 'pelanggan';
  const tungguTesti = admin ? db.semua('Testimoni', (t) => !t.tampil).length : 0;
  return html`<${Kerangka} k=${k} aktif="pelanggan">
    <${Hero} warna="var(--navy)" label="Toko" judul="Pelanggan & promo" kembali="/" stat=${html`<${Stat} nilai=${db.semua('Pelanggan').length} label="pelanggan" />`} />
    <div class="isi">
      <${Tab} item=${[
        { label: 'Pelanggan', href: '/pelanggan', aktif: tab === 'pelanggan' },
        { label: 'Kode promo', href: '/pelanggan?tab=promo', aktif: tab === 'promo' },
        ...(admin ? [{ label: tungguTesti ? `Testimoni (${tungguTesti})` : 'Testimoni', href: '/pelanggan?tab=testimoni', aktif: tab === 'testimoni' }] : []),
      ]} />
      ${tab === 'pelanggan' ? html`<${Pelanggan} db=${db} />` : tab === 'promo' ? html`<${Promo} db=${db} bisaUbah=${admin} />` : html`<${Testimoni} db=${db} />`}
    </div>
  <//>`;
}
