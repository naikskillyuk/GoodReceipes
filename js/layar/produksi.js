// Produksi (akun dapur): masak X kali resep -> stok bahan berkurang sesuai resep; hasilnya dimasukkan ke stok produk
// (langsung saat dicatat, atau belakangan lewat tombol "Masukkan ke stok").

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Stat, Kosong, InputAngka } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tanya, tampilToast } from '../ui/pesan.js';
import { tautan } from '../ui/router.js';
import { rencanaProduksi, catatProduksi, hapusProduksi, daftarProduksi, stokMakanan, sudahMasukStok, masukkanProduksiKeStok } from '../lib/toko.js';
import { eksperimenResep } from '../lib/repo.js';
import { rupiah, tampilJumlah, tanggal } from '../lib/util.js';
import { teksStok } from './stok-bahan.js';

function FormProduksi({ k, idAwal }) {
  const { db } = k;
  const resepAda = db.semua('Resep', (r) => eksperimenResep(db, r.id).length > 0).sort((a, b) => a.nama.localeCompare(b.nama));
  const [idResep, setIdResep] = useState(idAwal && db.ambil('Resep', idAwal) ? idAwal : '');
  const [kali, setKali] = useState(1);
  const [hasil, setHasil] = useState(null);
  const [catatan, setCatatan] = useState('');
  const [keStok, setKeStok] = useState(true);
  const [jumlahStok, setJumlahStok] = useState(null);
  const r = idResep && kali > 0 ? rencanaProduksi(db, idResep, kali) : null;
  const hasilAkhir = hasil ?? (r ? r.hasil : 0);
  const masukAkhir = Math.min(hasilAkhir, jumlahStok ?? hasilAkhir);

  const simpan = async () => {
    if (!r) return;
    if (r.kurang.length) {
      const ya = await tanya({
        judul: 'Stok bahan kurang',
        teks: `${r.kurang.map((b) => b.bahan.nama).join(', ')} tercatat kurang. Produksi tetap dicatat dan stok bahan itu menjadi minus sampai belanjanya dicatat.`,
        ya: 'Tetap catat',
      });
      if (!ya) return;
    }
    try {
      catatProduksi(db, { idResep, kali, hasil: hasilAkhir, catatan, masukStok: keStok ? masukAkhir : 0 });
      tampilToast(keStok ? `Produksi dicatat, +${tampilJumlah(masukAkhir)} ${r.satuanPorsi} ${r.resep.nama} masuk stok produk.` : `Produksi dicatat. Hasilnya bisa dimasukkan ke stok nanti.`);
      setHasil(null);
      setJumlahStok(null);
      setCatatan('');
    } catch (e) {
      tampilToast(e.message);
    }
  };

  if (!resepAda.length) {
    return html`<${Kosong} judul="Belum ada resep siap produksi" teks="Produksi memakai takaran dari eksperimen resep. Buat resep dan eksperimennya dulu."><a class="btn solid" href=${tautan('/resep')}>Buka daftar resep</a><//>`;
  }
  return html`<section class="kartu kolom" aria-labelledby="h-produksi">
    <h2 class="judul-kecil" id="h-produksi">Catat produksi</h2>
    <label class="bidang"><span>Resep</span>
      <select class="pilih" value=${idResep} onChange=${(e) => (setIdResep(e.target.value), setHasil(null))}>
        <option value="">Pilih resep…</option>
        ${resepAda.map((x) => html`<option value=${x.id} selected=${x.id === idResep}>${x.nama}</option>`)}
      </select>
    </label>
    ${r &&
    html`<p class="bantu">Takaran dari Eksperimen ${r.eksperimen.nomor}${r.resep.idJuara === r.eksperimen.id ? ' (juara)' : ''}: 1 resep = ${tampilJumlah(r.porsi)} ${r.satuanPorsi}.</p>
      <div class="dua-kolom">
        <label class="bidang"><span>Berapa kali resep?</span><${InputAngka} kelas="input" nilai=${kali} onUbah=${(n) => (setKali(n), setHasil(null))} /></label>
        <label class="bidang"><span>Hasil jadi (${r.satuanPorsi})</span><${InputAngka} kelas="input" nilai=${hasilAkhir} onUbah=${setHasil} /></label>
      </div>
      <div class="label-kecil">Bahan yang terpakai</div>
      ${r.bahan.map(
        (b) => html`<div class="hasil-baris" key=${b.bahan.id}>
          <span>${b.bahan.nama}<br /><small class="teks-kecil">stok ${teksStok(b.stok, b.satuan)}</small></span>
          <b class=${b.kurang > 0 ? 'buruk' : 'biasa'}>${teksStok(b.butuh, b.satuan)}${b.kurang > 0 ? html`<br /><small>kurang ${teksStok(b.kurang, b.satuan)}</small>` : ''}</b>
        </div>`,
      )}
      ${r.bermasalah.length > 0 && html`<p class="galat-teks">Satuan ${r.bermasalah.join(', ')} belum bisa dihitung ke stok. Tambahkan konversinya di Daftar Bahan.</p>`}
      <label class="bidang"><span>Catatan (opsional)</span><input class="input" maxlength="120" value=${catatan} onInput=${(e) => setCatatan(e.target.value)} placeholder="mis. untuk pesanan arisan" /></label>
      <div class="kotak-stok">
        <label class="saklar"><input type="checkbox" checked=${keStok} onChange=${(e) => setKeStok(e.target.checked)} /><span>Masukkan hasilnya ke stok produk</span></label>
        ${keStok
          ? html`<label class="bidang"><span>Jumlah masuk stok (${r.satuanPorsi})</span><${InputAngka} kelas="input" aria-label="Jumlah masuk stok" nilai=${masukAkhir} onUbah=${setJumlahStok} />
              <small class="bantu">${masukAkhir < hasilAkhir ? `${tampilJumlah(hasilAkhir - masukAkhir)} ${r.satuanPorsi} tidak dijual (mis. icip, sampel); bisa dimasukkan nanti.` : 'Semua hasil siap dijual.'}</small></label>`
          : html`<small class="bantu">Hasil dicatat dulu; masukkan ke stok nanti dari riwayat produksi atau halaman Stok produk.</small>`}
      </div>
      <button class="btn solid lebar" disabled=${!(hasilAkhir > 0)} onClick=${simpan}><${Ikon} nama="panci" ukuran=${18} />Catat produksi</button>`}
  </section>`;
}

export function Produksi({ k }) {
  const { db, rute } = k;
  const riwayat = daftarProduksi(db);
  const stok = stokMakanan(db);
  const hapus = async (p) => {
    const resep = db.ambil('Resep', p.idResep);
    const ya = await tanya({ judul: 'Batalkan catatan produksi?', teks: `Stok bahan dikembalikan dan stok ${resep ? resep.nama : 'makanan'} berkurang ${tampilJumlah(p.hasil)}.`, ya: 'Batalkan produksi', bahaya: true });
    if (!ya) return;
    hapusProduksi(db, p.id);
    tampilToast('Catatan produksi dibatalkan.');
  };
  return html`<${Kerangka} k=${k} aktif="produksi">
    <${Hero} warna="var(--tomat)" label="Dapur" judul="Produksi" kembali="/" stat=${html`<${Stat} nilai=${riwayat.length} label="catatan" />`}>
      <p class="hero-sub">Setiap produksi memotong stok bahan sesuai takaran resep. Hasilnya dimasukkan ke stok produk yang siap dijual, langsung atau belakangan.</p>
    <//>
    <div class="isi">
      <div class="kolom-2">
        <div class="kolom"><${FormProduksi} k=${k} idAwal=${rute.kueri.resep} /></div>
        <div class="kolom">
          <section class="kartu kolom" aria-labelledby="h-riwayat-produksi">
            <div class="baris-pisah"><h2 class="judul-kecil" id="h-riwayat-produksi">Riwayat produksi</h2><a class="tautan-hijau" href=${tautan('/stok-makanan')}>Stok produk</a></div>
            ${riwayat.length === 0 && html`<p class="bantu">Belum ada produksi.</p>`}
            ${riwayat.slice(0, 30).map((p) => {
              const resep = db.ambil('Resep', p.idResep);
              const masuk = sudahMasukStok(db, p);
              const sisa = (Number(p.hasil) || 0) - masuk;
              const impor = () => {
                try {
                  masukkanProduksiKeStok(db, p.id);
                  tampilToast(`+${tampilJumlah(sisa)} ${resep ? resep.nama : ''} masuk stok produk.`);
                } catch (e) {
                  tampilToast(e.message);
                }
              };
              return html`<div class="hasil-baris" key=${p.id}>
                <span><b class="biasa">${resep ? resep.nama : 'Resep dihapus'}</b><br /><small class="teks-kecil">${tanggal(p.waktu)} · ${tampilJumlah(p.kali)}x resep${p.hppPorsi ? ' · HPP ' + rupiah(p.hppPorsi) : ''}${p.catatan ? ' · ' + p.catatan : ''}</small>
                  <br /><small class=${sisa > 0 ? 'teks-buruk' : 'teks-baik'}>${sisa > 0 ? `${masuk > 0 ? tampilJumlah(masuk) + ' masuk stok · ' : ''}${tampilJumlah(sisa)} belum masuk stok` : 'Sudah masuk stok produk'}</small></span>
                <span class="baris-aksi"><b class="baik">+${tampilJumlah(p.hasil)}</b>${sisa > 0 && resep && html`<button class="btn kecil solid" onClick=${impor}>Masukkan ke stok</button>`}<button class="ikon-btn kecil" aria-label="Batalkan produksi" onClick=${() => hapus(p)}><${Ikon} nama="sampah" ukuran=${16} /></button></span>
              </div>`;
            })}
            ${stok.size > 0 && html`<p class="bantu">Stok produk dipotong otomatis saat ada pesanan.</p>`}
          </section>
        </div>
      </div>
    </div>
  <//>`;
}
