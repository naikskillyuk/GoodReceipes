// Produksi (akun dapur): masak X kali resep -> stok bahan berkurang sesuai resep. Hasilnya tidak otomatis masuk stok:
// setelah dicek, dikirim ke stok produk lewat "Kirim ke stok" (yang tidak lolos dicatat reject).

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Stat, Kosong, InputAngka } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tanya, tampilToast, Modal } from '../ui/pesan.js';
import { tautan } from '../ui/router.js';
import { rencanaProduksi, catatProduksi, hapusProduksi, daftarProduksi, stokMakanan, statusKirimProduksi, kirimProduksiKeStok } from '../lib/toko.js';
import { eksperimenResep } from '../lib/repo.js';
import { rupiah, tampilJumlah, tanggal } from '../lib/util.js';
import { teksStok } from './stok-bahan.js';

/** Kirim hasil produksi ke stok produk setelah dicek: jumlah yang lolos masuk stok, sisanya bisa dicatat reject. */
export function DialogKirimStok({ k, produksi, onTutup }) {
  const { db } = k;
  const resep = db.ambil('Resep', produksi.idResep);
  const st = statusKirimProduksi(db, produksi);
  const [kirim, setKirim] = useState(st.sisa);
  const [reject, setReject] = useState(0);
  const [catatan, setCatatan] = useState('');
  const [galat, setGalat] = useState('');
  const k1 = Number(kirim) || 0;
  const r1 = Number(reject) || 0;
  const tinggal = st.sisa - k1 - r1;
  const simpan = () => {
    try {
      kirimProduksiKeStok(db, produksi.id, { kirim: k1, reject: r1, catatan });
      tampilToast(`${k1 > 0 ? `+${tampilJumlah(k1)} ${resep ? resep.nama : ''} masuk stok produk` : 'Dicatat'}${r1 > 0 ? `, ${tampilJumlah(r1)} reject` : ''}.`);
      onTutup();
    } catch (e) {
      setGalat(e.message);
    }
  };
  return html`<${Modal} judul=${'Kirim ke stok · ' + (resep ? resep.nama : 'produksi')} onTutup=${onTutup}>
    <div class="kolom" style="gap:12px">
      <div class="ringkas-laba">
        <div><small>Hasil produksi</small><b>${tampilJumlah(st.hasil)}</b></div>
        <div><small>Sudah di stok</small><b>${tampilJumlah(st.terkirim)}</b></div>
        <div><small>Reject</small><b>${tampilJumlah(st.reject)}</b></div>
        <div class="untung"><small>Menunggu dikirim</small><b>${tampilJumlah(st.sisa)}</b></div>
      </div>
      <div class="dua-kolom">
        <label class="bidang"><span>Kirim ke stok (lolos)</span><${InputAngka} kelas="input" aria-label="Jumlah dikirim ke stok" nilai=${kirim} onUbah=${(n) => (setKirim(n), setGalat(''))} /></label>
        <label class="bidang"><span>Reject (tidak dijual)</span><${InputAngka} kelas="input" aria-label="Jumlah reject" nilai=${reject} onUbah=${(n) => (setReject(n), setGalat(''))} /></label>
      </div>
      ${tinggal > 0 && html`<div class="baris-btn"><button class="btn kecil" onClick=${() => setReject(r1 + tinggal)}>Sisanya (${tampilJumlah(tinggal)}) reject</button><span class="bantu">atau biarkan menunggu dikirim nanti.</span></div>`}
      <label class="bidang"><span>Catatan (opsional)</span><input class="input" maxlength="80" value=${catatan} onInput=${(e) => setCatatan(e.target.value)} placeholder="mis. 2 gosong, 1 pecah" /></label>
      ${tinggal < 0 && html`<p class="galat-teks">Jumlah kirim + reject melebihi yang menunggu (${tampilJumlah(st.sisa)}).</p>`}
      ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
      <div class="baris-btn">
        <button class="btn solid" disabled=${!(k1 + r1 > 0) || tinggal < 0} onClick=${simpan}><${Ikon} nama="kotak" ukuran=${18} />Kirim ke stok</button>
        <button class="btn abu" onClick=${onTutup}>Batal</button>
      </div>
    </div>
  <//>`;
}

function FormProduksi({ k, idAwal }) {
  const { db } = k;
  const resepAda = db.semua('Resep', (r) => eksperimenResep(db, r.id).length > 0).sort((a, b) => a.nama.localeCompare(b.nama));
  const [idResep, setIdResep] = useState(idAwal && db.ambil('Resep', idAwal) ? idAwal : '');
  const [kali, setKali] = useState(1);
  const [hasil, setHasil] = useState(null);
  const [catatan, setCatatan] = useState('');
  const r = idResep && kali > 0 ? rencanaProduksi(db, idResep, kali) : null;
  const hasilAkhir = hasil ?? (r ? r.hasil : 0);

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
      catatProduksi(db, { idResep, kali, hasil: hasilAkhir, catatan });
      tampilToast(`Produksi dicatat: ${tampilJumlah(hasilAkhir)} ${r.satuanPorsi} ${r.resep.nama}. Cek hasilnya, lalu kirim ke stok.`);
      setHasil(null);
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
      <div class="kotak-stok"><small class="bantu"><b>Hasil tidak langsung masuk stok.</b> Setelah dicek, tekan <b>Kirim ke stok</b> di riwayat produksi (yang tidak lolos dicatat reject).</small></div>
      <button class="btn solid lebar" disabled=${!(hasilAkhir > 0)} onClick=${simpan}><${Ikon} nama="panci" ukuran=${18} />Catat produksi</button>`}
  </section>`;
}

export function Produksi({ k }) {
  const { db, rute } = k;
  const [kirim, setKirim] = useState(null);
  const riwayat = daftarProduksi(db);
  const stok = stokMakanan(db);
  const hapus = async (p) => {
    const resep = db.ambil('Resep', p.idResep);
    const terkirim = statusKirimProduksi(db, p).terkirim;
    const ya = await tanya({ judul: 'Batalkan catatan produksi?', teks: `Stok bahan dikembalikan${terkirim > 0 ? ` dan stok ${resep ? resep.nama : 'produk'} berkurang ${tampilJumlah(terkirim)} (yang sudah dikirim)` : ''}.`, ya: 'Batalkan produksi', bahaya: true });
    if (!ya) return;
    hapusProduksi(db, p.id);
    tampilToast('Catatan produksi dibatalkan.');
  };
  return html`<${Kerangka} k=${k} aktif="produksi">
    <${Hero} warna="var(--tomat)" label="Dapur" judul="Produksi" kembali="/" stat=${html`<${Stat} nilai=${riwayat.length} label="catatan" />`}>
      <p class="hero-sub">Setiap produksi memotong stok bahan sesuai takaran resep. Hasilnya dicek dulu, lalu dikirim ke stok produk; yang tidak lolos dicatat reject.</p>
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
              const st = statusKirimProduksi(db, p);
              return html`<div class="hasil-baris" key=${p.id}>
                <span><b class="biasa">${resep ? resep.nama : 'Resep dihapus'}</b><br /><small class="teks-kecil">${tanggal(p.waktu)} · ${tampilJumlah(p.kali)}x resep${p.hppPorsi ? ' · HPP ' + rupiah(p.hppPorsi) : ''}${p.catatan ? ' · ' + p.catatan : ''}</small>
                  <br /><small class=${st.sisa > 0 ? 'teks-buruk' : 'teks-baik'}>${[st.terkirim > 0 ? `${tampilJumlah(st.terkirim)} di stok` : '', st.reject > 0 ? `${tampilJumlah(st.reject)} reject` : '', st.sisa > 0 ? `${tampilJumlah(st.sisa)} menunggu dikirim` : 'selesai dikirim'].filter(Boolean).join(' · ')}</small></span>
                <span class="baris-aksi"><b class="baik">${tampilJumlah(p.hasil)}</b>${st.sisa > 0 && resep && html`<button class="btn kecil solid" onClick=${() => setKirim(p)}>Kirim ke stok</button>`}<button class="ikon-btn kecil" aria-label="Batalkan produksi" onClick=${() => hapus(p)}><${Ikon} nama="sampah" ukuran=${16} /></button></span>
              </div>`;
            })}
            ${stok.size > 0 && html`<p class="bantu">Stok produk dipotong otomatis saat ada pesanan.</p>`}
          </section>
        </div>
      </div>
    </div>
    ${kirim && html`<${DialogKirimStok} k=${k} produksi=${kirim} onTutup=${() => setKirim(null)} />`}
  <//>`;
}
