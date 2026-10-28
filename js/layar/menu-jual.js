// Menu jual: resep dan paket yang dijual di kasir dan di link pemesanan. Akun dapur mengatur harga; toko hanya melihat.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Stat, Kosong, Foto, InputRupiah } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tanya, tampilToast } from '../ui/pesan.js';
import { tautan } from '../ui/router.js';
import { daftarMenu, pilihanMenu, tambahMenu, peranAkun, fotoMenu } from '../lib/toko.js';
import { dataHPP, dataPaket } from '../lib/repo.js';
import { marginDariHarga } from '../lib/hpp.js';
import { rupiah, persen } from '../lib/util.js';

/** HPP satu menu (hanya akun dapur yang punya datanya). */
function hppMenu(db, menu) {
  if (menu.jenis === 'paket') {
    const p = dataPaket(db, menu.idRef);
    return p ? p.hppPaket : NaN;
  }
  const d = dataHPP(db, menu.idRef);
  return d ? d.hppJual : NaN;
}

function TeksSisa({ sisa }) {
  if (sisa === null) return html`<small>stok tidak dilacak</small>`;
  return html`<small class=${sisa <= 0 ? 'teks-buruk' : ''}>${sisa <= 0 ? 'stok habis' : `sisa ${sisa}`}</small>`;
}

function BarisMenuDapur({ k, m, sisa }) {
  const { db } = k;
  const hpp = hppMenu(db, m);
  const mg = Number.isFinite(hpp) && m.harga > 0 ? marginDariHarga(hpp, m.harga) : null;
  const ubah = (patch) => db.simpan('Menu', { ...db.ambil('Menu', m.id), ...patch });
  const hapus = async () => {
    const ya = await tanya({ judul: `Keluarkan “${m.nama}” dari menu?`, teks: 'Resep/paketnya tidak terhapus. Pesanan lama tetap tersimpan.', ya: 'Keluarkan', bahaya: true });
    if (ya) db.hapus('Menu', m.id);
  };
  return html`<div class=${'kartu-menu' + (m.aktif ? '' : ' mati')}>
    <span class="foto-menu"><${Foto} src=${m.fotoUrl} ikon=${m.jenis === 'paket' ? 'kotak' : 'kue'} /></span>
    <div class="kolom" style="gap:8px;min-width:0;flex:1">
      <div class="baris-pisah">
        <input class="input kecil" style="font-weight:700" aria-label=${'Nama menu ' + m.nama} maxlength="60" value=${m.nama} onChange=${(e) => e.target.value.trim() && ubah({ nama: e.target.value.trim() })} />
        <button class="ikon-btn kecil" aria-label=${'Keluarkan ' + m.nama + ' dari menu'} onClick=${hapus}><${Ikon} nama="sampah" ukuran=${16} /></button>
      </div>
      <div class="cari-baris">
        <label class="bidang" style="flex:1"><span>Harga jual</span><${InputRupiah} kelas="input kecil" aria-label=${'Harga ' + m.nama} nilai=${m.harga} onUbah=${(n) => ubah({ harga: n })} /></label>
        <div class="info-menu">
          ${m.jenis === 'paket' ? html`<small class="lencana-jenis">Paket</small>` : ''}
          <${TeksSisa} sisa=${sisa} />
          ${Number.isFinite(hpp) && html`<small>HPP ${rupiah(hpp)}${mg ? html` · margin <b class=${mg.marginPersen < 0 ? 'teks-buruk' : ''}>${persen(mg.marginPersen)}</b>` : ''}</small>`}
        </div>
      </div>
      <input class="input kecil" aria-label=${'Keterangan ' + m.nama} maxlength="200" placeholder="Keterangan singkat untuk pembeli (opsional)" value=${m.keterangan || ''} onChange=${(e) => ubah({ keterangan: e.target.value.trim() })} />
      <div class="baris-saklar">
        <label class="saklar"><input type="checkbox" checked=${!!m.aktif} onChange=${(e) => ubah({ aktif: e.target.checked })} /><span>Dijual</span></label>
        <label class="saklar"><input type="checkbox" checked=${!!m.online} disabled=${!m.aktif} onChange=${(e) => ubah({ online: e.target.checked })} /><span>Tampil di link pemesanan</span></label>
        ${!m.fotoUrl && fotoMenu(db, m.jenis, m.idRef) && html`<button class="btn kecil" onClick=${() => ubah({ fotoUrl: fotoMenu(db, m.jenis, m.idRef) })}>Pakai foto resep</button>`}
      </div>
    </div>
  </div>`;
}

export function MenuJual({ k }) {
  const { db } = k;
  const dapur = peranAkun(db) === 'dapur';
  const daftar = daftarMenu(db);
  const pilihan = dapur ? pilihanMenu(db) : [];
  const [pilih, setPilih] = useState('');
  const tambah = () => {
    const [jenis, id] = pilih.split(':');
    const m = tambahMenu(db, jenis, id);
    setPilih('');
    if (m) tampilToast(m.harga > 0 ? `${m.nama} masuk menu, harga ${rupiah(m.harga)}.` : `${m.nama} masuk menu. Isi harganya.`);
  };

  return html`<${Kerangka} k=${k} aktif="menu">
    <${Hero} warna="var(--hijau)" label="Toko" judul="Menu jual" kembali="/" stat=${html`<${Stat} nilai=${daftar.filter((d) => d.menu.aktif).length} label="dijual" />`}>
      <p class="hero-sub">${dapur ? 'Harga saran diambil dari HPP Jual / paket. Menu yang dijual muncul di Kasir; yang ditandai online muncul di link pemesanan.' : 'Harga diatur oleh akun dapur.'}</p>
    <//>
    <div class="isi">
      ${dapur &&
      html`<div class="kartu kolom">
        <label class="bidang"><span>Tambah ke menu</span>
          <select class="pilih" value=${pilih} onChange=${(e) => setPilih(e.target.value)}>
            <option value="">Pilih resep atau paket…</option>
            ${pilihan.map((p) => html`<option value=${p.jenis + ':' + p.id}>${p.jenis === 'paket' ? 'Paket · ' : ''}${p.nama}</option>`)}
          </select>
        </label>
        <div class="baris-btn">
          <button class="btn solid" disabled=${!pilih} onClick=${tambah}><${Ikon} nama="plus" ukuran=${18} />Masukkan ke menu</button>
          <a class="btn" href=${tautan('/paket')}>Buat paket</a>
        </div>
      </div>`}
      ${daftar.length === 0 && html`<${Kosong} judul="Menu masih kosong" teks=${dapur ? 'Masukkan resep atau paket yang mau dijual.' : 'Akun dapur belum memasukkan menu.'} />`}
      <div class="daftar daftar-lebar">
        ${daftar.map(({ menu: m, sisa }) =>
          dapur
            ? html`<${BarisMenuDapur} key=${m.id} k=${k} m=${m} sisa=${sisa} />`
            : html`<div class=${'kartu-menu' + (m.aktif ? '' : ' mati')} key=${m.id}>
                <span class="foto-menu"><${Foto} src=${m.fotoUrl} ikon=${m.jenis === 'paket' ? 'kotak' : 'kue'} /></span>
                <div class="kolom" style="gap:4px;flex:1;min-width:0"><b>${m.nama}</b><span class="teks-kecil">${m.aktif ? (m.online ? 'Dijual · online' : 'Dijual di toko') : 'Tidak dijual'}</span><${TeksSisa} sisa=${sisa} /></div>
                <b class="harga-menu">${rupiah(m.harga)}</b>
              </div>`,
        )}
      </div>
    </div>
  <//>`;
}
