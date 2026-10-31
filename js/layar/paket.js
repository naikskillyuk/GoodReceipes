// HPP paket: beberapa resep dijual bersama dalam satu kemasan.
// HPP paket = Σ (biaya produksi per porsi tiap resep × jumlah porsi) + biaya paket (dihitung sekali).
// Biaya per porsi tiap resep (kemasan, label, ongkir) tidak ikut, karena paket punya kemasannya sendiri.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Kosong, Stat, InputRupiah, InputAngka, FotoInput } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tautan, pergi } from '../ui/router.js';
import { tanya, tampilToast } from '../ui/pesan.js';
import { KartuHarga } from '../ui/harga.js';
import { Langkah } from './hpp.js';
import { daftarPaket, buatPaket, hapusPaket, dataPaket, tambahIsiPaket, biayaPaketList, simpanHPPPaket } from '../lib/repo.js';
import { tambahMenu } from '../lib/toko.js';
import { marginDariHarga } from '../lib/hpp.js';
import { rupiah, angka, persen, tampilJumlah, tanggal } from '../lib/util.js';

const PRESET_PAKET = ['Kotak / dus', 'Kantong', 'Label dan stiker', 'Sendok dan tisu', 'Ongkos kirim'];

export function DaftarPaket({ k }) {
  const { db } = k;
  const [nama, setNama] = useState('');
  const semua = daftarPaket(db).map((p) => dataPaket(db, p.id));
  const buat = (e) => {
    e.preventDefault();
    const p = buatPaket(db, nama);
    setNama('');
    pergi('/paket/' + p.id);
  };

  return html`<${Kerangka} k=${k} aktif="paket">
    <${Hero} warna="var(--navy)" label="HPP & Harga" judul="Paket" kembali="/resep?tujuan=hpp" stat=${html`<${Stat} nilai=${semua.length} label="paket" />`} />
    <div class="isi">
      <div class="kartu">
        <p class="bantu" style="margin:0 0 10px">Gabungkan beberapa resep dalam satu paket (mis. nasi ayam + es kopi + brownies). Biaya kemasan paket dihitung <b>satu kali</b>, bukan per resep.</p>
        <form class="baris-btn" style="flex-wrap:nowrap" onSubmit=${buat}>
          <input class="input" style="flex:1;min-width:0" aria-label="Nama paket" placeholder="Nama paket, mis. Paket Hemat A" value=${nama} onInput=${(e) => setNama(e.target.value)} />
          <button class="btn solid" type="submit"><${Ikon} nama="plus" ukuran=${18} />Buat</button>
        </form>
      </div>
      ${semua.length === 0
        ? html`<${Kosong} judul="Belum ada paket" teks="Buat paket pertama, lalu pilih resep yang masuk ke dalamnya." />`
        : html`<div class="daftar daftar-lebar">
            ${semua.map((d) => {
              const m = marginDariHarga(d.hppPaket, Number(d.paket.hargaJual) || 0);
              return html`<a class="baris-eks" key=${d.paket.id} href=${tautan('/paket/' + d.paket.id)}>
                <span class="nomor"><${Ikon} nama="kalkulator" /></span>
                <span class="teks">
                  <b>${d.paket.nama}</b>
                  <small>${d.isi.length} resep · HPP ${rupiah(d.hppPaket)}${!d.tersimpan ? ' · belum disimpan' : d.berubah ? ' · hitungan berubah' : ''}</small>
                  <small>${d.paket.hargaJual > 0 ? `Dijual ${rupiah(d.paket.hargaJual)} · margin ${persen(m.marginPersen)}` : 'Harga jual belum diisi'}</small>
                </span>
              </a>`;
            })}
          </div>`}
    </div>
  <//>`;
}

export function DetailPaket({ k, id }) {
  const { db } = k;
  const d = dataPaket(db, id);
  if (!d) {
    return html`<${Kerangka} k=${k} aktif="paket">
      <${Hero} label="Paket" judul="Tidak ada" kembali="/paket" />
      <div class="isi"><${Kosong} judul="Paket tidak ditemukan" teks="Mungkin sudah dihapus."><a class="btn solid" href=${tautan('/paket')}>Ke daftar paket</a><//></div>
    <//>`;
  }
  const { paket } = d;
  const ubahPaket = (patch) => db.simpan('Paket', { ...db.ambil('Paket', id), ...patch });
  // Foto paket: menu paket ini ikut memakai foto paket (foto menu lama dikosongkan).
  const gantiFoto = (data) => {
    ubahPaket({ fotoLokal: data || '', fotoUrl: '' });
    db.semua('Menu', (m) => m.jenis === 'paket' && m.idRef === id && m.fotoUrl).forEach((m) => db.simpan('Menu', { ...m, fotoUrl: '' }));
  };
  const sudah = new Set(d.isi.map((i) => i.idResep));
  const pilihan = db.semua('Resep', (r) => !sudah.has(r.id)).sort((a, b) => (a.nama || '').localeCompare(b.nama || ''));
  const jenisAda = new Set(d.biaya.map((b) => (b.jenis || '').toLowerCase()));
  const tambahBiaya = (jenis) => db.simpan('BiayaPaket', { idPaket: id, jenis, nilai: 0, urutan: biayaPaketList(db, id).length });
  const hapus = async () => {
    const ya = await tanya({ judul: `Hapus “${paket.nama}”?`, teks: 'Resep di dalamnya tidak ikut terhapus.', ya: 'Hapus paket', bahaya: true });
    if (!ya) return;
    hapusPaket(db, id);
    tampilToast('Paket dihapus.');
    pergi('/paket', { ganti: true });
  };

  const kiri = html`<div class="kolom">
    <label class="bidang">
      <span>Nama paket</span>
      <input class="input" value=${paket.nama} onInput=${(e) => ubahPaket({ nama: e.target.value })} />
    </label>
    <div class="bidang">
      <span>Foto paket</span>
      <${FotoInput} nilai=${paket.fotoLokal || paket.fotoUrl || ''} onUbah=${gantiFoto} judul=${paket.fotoLokal || paket.fotoUrl ? 'Ganti foto paket' : 'Tambah foto paket'} bantu="Tampil di menu jual, kasir, dan etalase." aksen="var(--hijau)" />
    </div>

    <${Langkah}
      no="1"
      judul="Isi paket"
      bantu="Pilih resep dan jumlahnya. Dipakai HPP Jual tiap resep tanpa packing-nya, karena paket punya packing sendiri. Centang “Tetap pakai packing” bila isi tertentu tetap dibungkus sendiri."
      hasil=${d.totalIsi}
      rumus="Jumlah isi paket"
      unit="paket"
    >
      ${d.bermasalah.length > 0 &&
      html`<div class="peringatan" role="alert">
        <b>Ada resep yang biayanya belum bisa dihitung:</b>
        ${d.isi.filter((i) => i.alasan).map((i) => `${i.resep ? i.resep.nama : 'resep terhapus'} (${i.alasan})`).join(', ')}.
      </div>`}
      <div class="kolom">
        ${d.isi.map((i) => {
          const nama = i.resep ? i.resep.nama : 'Resep terhapus';
          return html`<div class="biaya-lain-baris" key=${i.id}>
            ${i.resep
              ? html`<a class="bl-nama" href=${tautan(`/resep/${i.resep.id}/hpp`)} style="font-weight:700;text-decoration:underline">${nama}</a>`
              : html`<span class="bl-nama">${nama}</span>`}
            <${InputAngka} kelas="input kecil bl-nilai" nilai=${i.jumlah} aria-label=${'Jumlah ' + nama} onUbah=${(n) => Number.isFinite(n) && db.simpan('IsiPaket', { ...db.ambil('IsiPaket', i.id), jumlah: n })} />
            <span class="teks-kecil">${i.satuanPorsi}</span>
            <span style="min-width:84px;text-align:right;font-weight:700">${rupiah(i.total)}</span>
            <button class="ikon-btn" aria-label=${'Keluarkan ' + nama} onClick=${() => db.hapus('IsiPaket', i.id)}><${Ikon} nama="sampah" ukuran=${20} /></button>
            ${Number.isFinite(i.biayaProduksi) &&
            html`<small class="teks-kecil" style="flex-basis:100%">${rupiah(i.biayaProduksi)} per ${i.satuanPorsi} × ${tampilJumlah(i.jumlah)}${i.biayaPorsiResep > 0 ? (i.pakaiPacking ? ` · termasuk packing resep ${rupiah(i.biayaPorsiResep)}` : ` · packing resep ini (${rupiah(i.biayaPorsiResep)}) tidak ikut`) : ''}</small>`}
            ${i.resep &&
            html`<label class="centang-kecil" style="flex-basis:100%"><input type="checkbox" checked=${!!i.pakaiPacking} onChange=${(e) => db.simpan('IsiPaket', { ...db.ambil('IsiPaket', i.id), pakaiPacking: e.target.checked })} /><span>Tetap pakai packing ${nama.toLowerCase()}${i.biayaPorsiResep > 0 ? ` (${rupiah(i.biayaPorsiResep)}/${i.satuanPorsi})` : ' (belum ada packing di HPP resep ini)'}, mis. tetap diberi plastik</span></label>`}
          </div>`;
        })}
        ${pilihan.length > 0
          ? html`<select class="pilih kecil" aria-label="Tambah resep ke paket" value="" onChange=${(e) => e.target.value && tambahIsiPaket(db, id, e.target.value)}>
              <option value="" selected>+ Tambah resep…</option>
              ${pilihan.map((r) => html`<option value=${r.id}>${r.nama}</option>`)}
            </select>`
          : d.isi.length === 0 && html`<p class="bantu" style="margin:0">Belum ada resep. Buat resep dulu di Daftar resep.</p>`}
      </div>
    <//>

    <${Langkah}
      no="2"
      judul="Packing paket"
      bantu="Kotak, kantong, label, ongkir. Dihitung satu kali untuk satu paket."
      hasil=${d.totalBiaya}
      rumus="Jumlah biaya paket"
      unit="paket"
    >
      <div class="kolom">
        ${d.biaya.map(
          (b) => html`<div class="baris-biaya" key=${b.id}>
            <input class="input kecil" aria-label="Jenis biaya paket" value=${b.jenis} onInput=${(e) => db.simpan('BiayaPaket', { ...b, jenis: e.target.value })} />
            <${InputRupiah} kelas="input kecil" nilai=${b.nilai} aria-label=${'Nilai ' + b.jenis} onUbah=${(n) => db.simpan('BiayaPaket', { ...b, nilai: n })} />
            <button class="ikon-btn" aria-label=${'Hapus ' + b.jenis} onClick=${() => db.hapus('BiayaPaket', b.id)}><${Ikon} nama="sampah" ukuran=${20} /></button>
          </div>`,
        )}
        <div class="chips">
          ${PRESET_PAKET.filter((j) => !jenisAda.has(j.toLowerCase())).map(
            (j) => html`<button type="button" class="chip putus" onClick=${() => tambahBiaya(j)}><${Ikon} nama="plus" ukuran=${16} />${j}</button>`,
          )}
          <button type="button" class="chip putus" onClick=${() => tambahBiaya('Biaya lain')}><${Ikon} nama="plus" ukuran=${16} />Lainnya</button>
        </div>
      </div>
    <//>

    <button class="btn bahaya" onClick=${hapus}><${Ikon} nama="sampah" ukuran=${18} />Hapus paket</button>
  </div>`;

  const menuPaket = db.semua('Menu', (m) => m.jenis === 'paket' && m.idRef === id)[0] || null;
  const bisaSimpan = d.isi.length > 0 && d.bermasalah.length === 0 && Number.isFinite(d.hppHitung);
  const simpan = () => {
    if (!simpanHPPPaket(db, id)) return tampilToast('HPP paket belum bisa dihitung. Periksa isi paket.');
    tampilToast(`Paket “${paket.nama}” disimpan, HPP ${rupiah(d.hppHitung)}.`);
  };
  const keMenu = () => {
    const m = tambahMenu(db, 'paket', id);
    if (m) tampilToast(`${m.nama} masuk menu jual, harga ${rupiah(m.harga)}.`);
    pergi('/menu');
  };
  let status;
  if (!d.tersimpan) {
    status = html`<div class="status-simpan belum"><b>Belum disimpan.</b> Simpan supaya HPP paket ini dipakai di Menu & Harga Jual.</div>`;
  } else if (d.berubah) {
    status = html`<div class="status-simpan berubah"><b>Hitungan berubah.</b> Tersimpan ${rupiah(d.hppPaket)}, sekarang ${rupiah(d.hppHitung)}. Simpan ulang untuk memakai angka baru.</div>`;
  } else {
    status = html`<div class="status-simpan sudah"><${Ikon} nama="centang" ukuran=${18} /><span><b>Tersimpan</b>${d.disimpanPada ? ` · ${tanggal(d.disimpanPada)}` : ''}</span></div>`;
  }

  const kanan = html`<div class="kolom">
    <div class="kartu-hpp">
      <div class="label-kecil">HPP (modal) per paket</div>
      <div class="besar">${rupiah(d.hppHitung)}</div>
      <div class="hpp-pecah">
        <span><i class="no-mini">1</i>Isi paket</span><b>${rupiah(d.totalIsi)}</b>
        <span><i class="no-mini">2</i>Packing paket</span><b>${rupiah(d.totalBiaya)}</b>
      </div>
    </div>
    <div class="kartu kolom">
      ${status}
      ${(!d.tersimpan || d.berubah) &&
      html`<button class="btn solid" disabled=${!bisaSimpan} onClick=${simpan}><${Ikon} nama="centang" ukuran=${18} />${d.tersimpan ? 'Simpan ulang' : 'Simpan HPP paket'} ${rupiah(d.hppHitung)}</button>`}
      ${d.tersimpan && !menuPaket && html`<button class="btn" onClick=${keMenu}><${Ikon} nama="tag" ukuran=${18} />Masukkan ke Menu & Harga Jual</button>`}
      ${menuPaket && html`<a class="btn" href=${tautan('/menu')}><${Ikon} nama="tag" ukuran=${18} />Sudah di menu jual · ${rupiah(menuPaket.harga)}</a>`}
    </div>
    <${KartuHarga} key=${id} hpp=${d.hppHitung} marginTarget=${Number(paket.marginTarget) || 40} hargaJual=${Number(paket.hargaJual) || 0} onUbah=${ubahPaket} unit="paket" />
  </div>`;

  return html`<${Kerangka} k=${k} aktif="paket">
    <${Hero} warna="var(--navy)" label="Paket" judul=${paket.nama || 'Paket'} kembali="/paket" stat=${html`<${Stat} nilai=${angka(d.isi.length)} label="resep" />`} />
    <div class="isi"><div class="kolom-2">${kiri}${kanan}</div></div>
  <//>`;
}
