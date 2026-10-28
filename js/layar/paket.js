// HPP paket: beberapa resep dijual bersama dalam satu kemasan.
// HPP paket = Σ (biaya produksi per porsi tiap resep × jumlah porsi) + biaya paket (dihitung sekali).
// Biaya per porsi tiap resep (kemasan, label, ongkir) tidak ikut, karena paket punya kemasannya sendiri.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Kosong, Stat, InputRupiah, InputAngka } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tautan, pergi } from '../ui/router.js';
import { tanya, tampilToast } from '../ui/pesan.js';
import { KartuHarga } from '../ui/harga.js';
import { daftarPaket, buatPaket, hapusPaket, dataPaket, tambahIsiPaket, biayaPaketList } from '../lib/repo.js';
import { marginDariHarga } from '../lib/hpp.js';
import { rupiah, angka, persen, tampilJumlah } from '../lib/util.js';

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

  return html`<${Kerangka} k=${k} aktif="resep">
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
                  <small>${d.isi.length} resep · HPP ${rupiah(d.hppPaket)}</small>
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
    return html`<${Kerangka} k=${k} aktif="resep">
      <${Hero} label="Paket" judul="Tidak ada" kembali="/paket" />
      <div class="isi"><${Kosong} judul="Paket tidak ditemukan" teks="Mungkin sudah dihapus."><a class="btn solid" href=${tautan('/paket')}>Ke daftar paket</a><//></div>
    <//>`;
  }
  const { paket } = d;
  const ubahPaket = (patch) => db.simpan('Paket', { ...db.ambil('Paket', id), ...patch });
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

    <div class="kartu">
      <div class="label-kecil" style="margin-bottom:4px"><span class="no-langkah">1</span>Isi paket</div>
      <p class="bantu" style="margin:0 0 10px">Setiap resep memakai <b>biaya produksi per porsi</b> (bahan + resep tambahan + biaya per resep). Kemasan per porsi resep itu tidak ikut dihitung.</p>
      ${d.bermasalah.length > 0 &&
      html`<div class="peringatan" role="alert" style="margin-bottom:10px">
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
            html`<small class="teks-kecil" style="flex-basis:100%">${rupiah(i.biayaProduksi)} per ${i.satuanPorsi} × ${tampilJumlah(i.jumlah)}${i.biayaPorsiResep > 0 ? ` · kemasan per porsi resep ini (${rupiah(i.biayaPorsiResep)}) tidak ikut` : ''}</small>`}
          </div>`;
        })}
        ${pilihan.length > 0
          ? html`<select class="pilih kecil" aria-label="Tambah resep ke paket" value="" onChange=${(e) => e.target.value && tambahIsiPaket(db, id, e.target.value)}>
              <option value="" selected>+ Tambah resep…</option>
              ${pilihan.map((r) => html`<option value=${r.id}>${r.nama}</option>`)}
            </select>`
          : d.isi.length === 0 && html`<p class="bantu" style="margin:0">Belum ada resep. Buat resep dulu di Daftar resep.</p>`}
      </div>
    </div>

    <div class="kartu">
      <div class="label-kecil" style="margin-bottom:4px"><span class="no-langkah">2</span>Biaya paket (sekali per paket)</div>
      <p class="bantu" style="margin:0 0 10px">Kotak, kantong, label, ongkir: dihitung satu kali untuk satu paket.</p>
      <div class="kolom">
        ${d.biaya.map(
          (b) => html`<div class="biaya-lain-baris" key=${b.id}>
            <input class="input kecil bl-nama" aria-label="Jenis biaya paket" value=${b.jenis} onInput=${(e) => db.simpan('BiayaPaket', { ...b, jenis: e.target.value })} />
            <${InputRupiah} kelas="input kecil bl-nilai" nilai=${b.nilai} aria-label=${'Nilai ' + b.jenis} onUbah=${(n) => db.simpan('BiayaPaket', { ...b, nilai: n })} />
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
    </div>

    <button class="btn bahaya" onClick=${hapus}><${Ikon} nama="sampah" ukuran=${18} />Hapus paket</button>
  </div>`;

  const kanan = html`<div class="kolom">
    <div class="kartu-hpp">
      <div class="label-kecil">HPP per paket</div>
      <div class="besar">${rupiah(d.hppPaket)}</div>
      <div class="hpp-pecah">
        <span>Isi paket (1)</span><b>${rupiah(d.totalIsi)}</b>
        <span>Biaya paket (2)</span><b>${rupiah(d.totalBiaya)}</b>
      </div>
    </div>
    <${KartuHarga} key=${id} hpp=${d.hppPaket} marginTarget=${Number(paket.marginTarget) || 40} hargaJual=${Number(paket.hargaJual) || 0} onUbah=${ubahPaket} unit="paket" />
  </div>`;

  return html`<${Kerangka} k=${k} aktif="resep">
    <${Hero} warna="var(--navy)" label="Paket" judul=${paket.nama || 'Paket'} kembali="/paket" stat=${html`<${Stat} nilai=${angka(d.isi.length)} label="resep" />`} />
    <div class="isi"><div class="kolom-2">${kiri}${kanan}</div></div>
  <//>`;
}
