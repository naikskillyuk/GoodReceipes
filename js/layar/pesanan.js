// Pesanan: daftar per status, detail, ubah status, dan pembayaran (tunai atau online lewat Mayar).

import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Stat, Kosong, Tab, InputRupiah } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { Modal, tanya, tampilToast } from '../ui/pesan.js';
import { tautan, pergi } from '../ui/router.js';
import { buatQR, salin } from './bagikan.js';
import {
  daftarPesanan, statusBayar, ubahStatusPesanan, bayarTunai, bayarTransfer, saranUang, mintaBayarMayar, cekBayarMayar,
  STATUS_PESANAN, ALUR_STATUS, LABEL_METODE, LABEL_AMBIL, caraAmbil, namaItem, tampilHp, ringkasPenjualan, bisaDiubah, rekeningToko, qrisToko, pakaiMayar,
} from '../lib/toko.js';
import { rupiah, angka, tanggal } from '../lib/util.js';

const CEK_TIAP_MS = 4000;

export function jam(ts) {
  const d = new Date(ts || 0);
  return String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0');
}

const LABEL_SUMBER = { online: 'Link pemesanan', manual: 'Pesanan manual', kasir: 'Kasir' };
export const labelSumber = (p) => (p.sumber === 'manual' && p.saluran ? p.saluran : LABEL_SUMBER[p.sumber] || 'Kasir');

/** "Sab, 1 Nov 10.00" untuk jadwal ambil/antar. */
export function teksJadwal(ts) {
  const d = new Date(ts);
  return d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' }) + ' ' + jam(ts);
}

export function LencanaBayar({ db, p }) {
  const s = statusBayar(db, p.id);
  if (s.lunas) return html`<span class="lencana-status lunas">Lunas · ${LABEL_METODE[s.bayar.metode] || 'Tunai'}</span>`;
  if (s.menunggu) return html`<span class="lencana-status tunggu">Menunggu bayar</span>`;
  if (s.menungguTransfer) return html`<span class="lencana-status tunggu">Menunggu transfer</span>`;
  return html`<span class="lencana-status belum">Belum bayar</span>`;
}

/** Rekening dan foto QRIS toko untuk ditunjukkan ke pembeli. */
export function InfoTransfer({ rekening, qris, total }) {
  if (!rekening.length && !qris) return html`<p class="bantu">Rekening dan QRIS belum diatur. Admin bisa mengisinya di Pengaturan → Pembayaran transfer & QRIS.</p>`;
  return html`<div class="kolom info-transfer">
    ${qris && html`<img class="qris-gambar" src=${qris} alt="Kode QRIS toko" />`}
    ${rekening.map(
      (r) => html`<div class="baris-rekening" key=${r.bank + r.nomor}>
        <span class="teks"><small>${r.bank}${r.atasNama ? ' · a.n. ' + r.atasNama : ''}</small><b>${r.nomor}</b></span>
        <button type="button" class="btn kecil" onClick=${async () => tampilToast((await salin(r.nomor.replace(/\D/g, ''))) ? 'Nomor rekening disalin.' : 'Gagal menyalin.')}><${Ikon} nama="salin" ukuran=${16} />Salin</button>
      </div>`,
    )}
    ${total > 0 && html`<p class="bantu" style="text-align:center">Transfer tepat ${rupiah(total)}.</p>`}
  </div>`;
}

/** Pembayaran satu pesanan: tunai, transfer/QRIS manual (ditandai lunas), atau Mayar bila diaktifkan admin. */
export function DialogBayar({ k, pesanan, onTutup }) {
  const { db } = k;
  const s = statusBayar(db, pesanan.id);
  const mayar = pakaiMayar(db) || !!s.menunggu;
  const [cara, setCara] = useState(s.menunggu ? 'online' : s.menungguTransfer ? 'transfer' : 'tunai');
  const [diterima, setDiterima] = useState(0);
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const selesai = useRef(false);

  // Begitu lunas (dari tunai, cek otomatis, atau sinkron dari perangkat lain): beri tahu dan tutup.
  useEffect(() => {
    if (s.lunas && !selesai.current) {
      selesai.current = true;
      tampilToast(`Pesanan #${pesanan.nomor} lunas.`);
      onTutup(true);
    }
  }, [s.lunas]);

  // Link Mayar menunggu dibayar: tanyakan statusnya berkala selama dialog terbuka.
  const idTunggu = s.menunggu ? s.menunggu.id : '';
  useEffect(() => {
    if (!idTunggu) return;
    let hidup = true;
    const cek = () => cekBayarMayar(db, idTunggu).catch(() => {});
    const t = setInterval(() => hidup && cek(), CEK_TIAP_MS);
    return () => {
      hidup = false;
      clearInterval(t);
    };
  }, [idTunggu]);

  const terimaTunai = () => {
    try {
      bayarTunai(db, pesanan, diterima);
    } catch (e) {
      setGalat(e.message);
    }
  };
  const buatLink = async () => {
    setSibuk(true);
    setGalat('');
    try {
      // Pesanan dikirim ke server dulu supaya webhook bisa menemukannya.
      await k.sinkronSekarang().catch(() => {});
      await mintaBayarMayar(db, pesanan);
    } catch (e) {
      setGalat(e.message || 'Link pembayaran gagal dibuat.');
    } finally {
      setSibuk(false);
    }
  };
  const cekSekarang = async () => {
    setSibuk(true);
    try {
      const b = await cekBayarMayar(db, idTunggu);
      if (b.status !== 'lunas') tampilToast('Belum ada pembayaran masuk.');
    } catch (e) {
      tampilToast(e.message);
    } finally {
      setSibuk(false);
    }
  };
  const link = s.menunggu ? s.menunggu.linkMayar : '';
  const linkPenuh = link.startsWith('/') ? location.origin + link : link;
  const wa = pesanan.hp && link ? `https://wa.me/${pesanan.hp}?text=${encodeURIComponent(`Halo ${pesanan.nama || ''}, ini link pembayaran pesanan #${pesanan.nomor} sebesar ${rupiah(pesanan.total)}: ${linkPenuh}`)}` : '';
  const kembalian = diterima - pesanan.total;

  return html`<${Modal} judul=${`Bayar pesanan #${pesanan.nomor}`} onTutup=${() => onTutup(false)}>
    <div class="kolom" style="gap:14px">
      <div class="total-bayar"><small>Total</small><b>${rupiah(pesanan.total)}</b></div>
      <${Tab} item=${[
        { label: 'Tunai', aktif: cara === 'tunai', onKlik: () => setCara('tunai') },
        { label: 'Transfer / QRIS', aktif: cara === 'transfer', onKlik: () => setCara('transfer') },
        ...(mayar ? [{ label: 'Mayar', aktif: cara === 'online', onKlik: () => setCara('online') }] : []),
      ]} />
      ${cara === 'transfer' &&
      html`<${InfoTransfer} rekening=${rekeningToko(db)} qris=${qrisToko(db)} total=${pesanan.total} />
        <p class="bantu">Tunjukkan QRIS / rekening ke pembeli. Setelah uang masuk (cek mutasi atau bukti transfer), tandai lunas.</p>
        <button class="btn solid lebar" onClick=${() => bayarTransfer(db, pesanan)}><${Ikon} nama="centang" ukuran=${18} />Tandai lunas transfer ${rupiah(pesanan.total)}</button>`}
      ${cara === 'tunai' &&
      html`<label class="bidang"><span>Uang diterima</span><${InputRupiah} kelas="input input-besar" aria-label="Uang diterima" nilai=${diterima} onUbah=${(n) => (setDiterima(n), setGalat(''))} placeholder=${angka(pesanan.total)} /></label>
        <div class="chips">${saranUang(pesanan.total).map((u) => html`<button type="button" class=${'chip' + (diterima === u ? ' aktif' : '')} onClick=${() => setDiterima(u)}>${u === pesanan.total ? 'Uang pas' : rupiah(u)}</button>`)}</div>
        <div class="hasil-baris"><span>Kembalian</span><b class=${kembalian < 0 ? 'buruk' : 'baik'}>${diterima ? rupiah(kembalian) : '–'}</b></div>
        <button class="btn solid lebar" disabled=${diterima < pesanan.total} onClick=${terimaTunai}><${Ikon} nama="centang" ukuran=${18} />Terima ${rupiah(pesanan.total)}</button>`}
      ${cara === 'online' &&
      (link
        ? html`<div class="qr-bayar" role="img" aria-label="Kode QR pembayaran" dangerouslySetInnerHTML=${{ __html: buatQR(linkPenuh, { cellSize: 4, margin: 2, scalable: true }) }}></div>
            <p class="bantu" style="text-align:center">Minta pembeli memindai kode ini lalu membayar (QRIS, e-wallet, atau transfer). Status lunas dicek otomatis.</p>
            <div class="baris-btn">
              <a class="btn" href=${linkPenuh} target="_blank" rel="noopener">Buka link</a>
              <button class="btn" onClick=${async () => tampilToast((await salin(linkPenuh)) ? 'Link disalin.' : 'Gagal menyalin.')}><${Ikon} nama="salin" ukuran=${18} />Salin</button>
              ${wa && html`<a class="btn" href=${wa} target="_blank" rel="noopener"><${Ikon} nama="kirim" ukuran=${18} />WhatsApp</a>`}
            </div>
            <button class="btn solid lebar" disabled=${sibuk} onClick=${cekSekarang}>${sibuk ? 'Mengecek…' : 'Cek pembayaran sekarang'}</button>`
        : html`<p class="bantu">Membuat link pembayaran Mayar untuk ${rupiah(pesanan.total)}. Pembeli bisa membayar lewat QRIS, e-wallet, atau transfer bank; uang masuk ke akun Mayar toko.</p>
            <button class="btn solid lebar" disabled=${sibuk} onClick=${buatLink}>${sibuk ? 'Membuat link…' : 'Buat QR pembayaran'}</button>`)}
      ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
      <button class="btn abu lebar" onClick=${() => onTutup(false)}>Bayar nanti</button>
    </div>
  <//>`;
}

const LABEL_AMBIL_PENDEK = { ambil: 'Ambil', ojol: 'Ojol dipesan pembeli', antar: 'Antar' };
const LABEL_JADWAL = { ambil: 'Jam ambil', ojol: 'Jam driver datang', antar: 'Jadwal antar' };

function KartuPesanan({ db, p }) {
  const item = Array.isArray(p.item) ? p.item : [];
  return html`<a class="kartu-pesanan" href=${tautan('/pesanan/' + p.id)}>
    <div class="baris-pisah">
      <b>#${p.nomor}${p.nama ? ' · ' + p.nama : ''}</b>
      <span class=${'lencana-status s-' + p.status}>${STATUS_PESANAN[p.status] || p.status}</span>
    </div>
    <small class="teks-kecil">${item.map((i) => `${i.jumlah}× ${namaItem(i)}`).join(', ')}</small>
    ${p.jadwal > 0 && html`<small class="jadwal-pesanan"><${Ikon} nama="jam" ukuran=${14} />${LABEL_AMBIL_PENDEK[caraAmbil(p)] || 'Ambil'} ${teksJadwal(p.jadwal)}</small>`}
    <div class="baris-pisah">
      <span class="teks-kecil">${tanggal(p.waktu)} ${jam(p.waktu)} · ${labelSumber(p)}</span>
      <span class="baris-aksi"><${LencanaBayar} db=${db} p=${p} /><b>${rupiah(p.total)}</b></span>
    </div>
  </a>`;
}

const TAB = [
  { kunci: 'aktif', label: 'Aktif', cocok: (p) => ['baru', 'diproses', 'siap'].includes(p.status) },
  { kunci: 'menunggu', label: 'Menunggu bayar', cocok: (p) => p.status === 'menunggu' },
  { kunci: 'selesai', label: 'Selesai', cocok: (p) => p.status === 'selesai' },
  { kunci: 'batal', label: 'Batal', cocok: (p) => p.status === 'batal' },
];

export function DaftarPesanan({ k }) {
  const { db, rute } = k;
  const tab = TAB.find((t) => t.kunci === rute.kueri.tab) || TAB[0];
  const [cari, setCari] = useState('');
  const q = cari.trim().toLowerCase();
  const semua = daftarPesanan(db);
  const daftar = semua.filter(tab.cocok).filter((p) => !q || `${p.nomor} ${p.nama} ${p.hp}`.toLowerCase().includes(q));
  // Pesanan aktif berjadwal (pesanan manual) tampil paling atas, jadwal terdekat dulu.
  if (tab.kunci === 'aktif') daftar.sort((a, b) => (a.jadwal > 0 ? a.jadwal : Infinity) - (b.jadwal > 0 ? b.jadwal : Infinity));
  const r = ringkasPenjualan(db);
  return html`<${Kerangka} k=${k} aktif="pesanan" plus=${{ href: '/kasir', label: 'Pesanan baru' }}>
    <${Hero} warna="var(--tomat)" label="Toko" judul="Pesanan" kembali="/" stat=${html`<${Stat} nilai=${r.aktif} label="aktif" />`}>
      <p class="hero-sub">Hari ini ${r.jumlahPesanan} pesanan · ${rupiah(r.omzet)} masuk${r.belumBayar ? ` · ${r.belumBayar} belum bayar` : ''}.</p>
    <//>
    <div class="isi">
      <${Tab} item=${TAB.map((t) => ({ label: `${t.label} (${semua.filter(t.cocok).length})`, href: '/pesanan?tab=' + t.kunci, aktif: t === tab }))} />
      <div class="baris-cari">
        <input class="input" type="search" placeholder="Cari nomor, nama, atau WhatsApp…" aria-label="Cari pesanan" value=${cari} onInput=${(e) => setCari(e.target.value)} />
        <a class="btn" href=${tautan('/catat-pesanan')}><${Ikon} nama="ubah" ukuran=${18} />Catat pesanan</a>
      </div>
      ${daftar.length === 0 && html`<${Kosong} judul="Tidak ada pesanan" teks=${tab.kunci === 'aktif' ? 'Pesanan baru dari kasir dan link pemesanan muncul di sini.' : 'Belum ada pesanan di bagian ini.'}><a class="btn solid" href=${tautan('/kasir')}>Buka kasir</a><//>`}
      <div class="daftar daftar-lebar">${daftar.slice(0, 100).map((p) => html`<${KartuPesanan} key=${p.id} db=${db} p=${p} />`)}</div>
    </div>
  <//>`;
}

export function DetailPesanan({ k, id }) {
  const { db, rute } = k;
  const p = db.ambil('Pesanan', id);
  const [bayar, setBayar] = useState(!!rute.kueri.bayar);
  if (!p) {
    return html`<${Kerangka} k=${k} aktif="pesanan">
      <${Hero} label="Pesanan" judul="Tidak ada" kembali="/pesanan" />
      <div class="isi"><${Kosong} judul="Pesanan tidak ditemukan"><a class="btn solid" href=${tautan('/pesanan')}>Ke daftar pesanan</a><//></div>
    <//>`;
  }
  const s = statusBayar(db, p.id);
  const item = Array.isArray(p.item) ? p.item : [];
  const iAlur = ALUR_STATUS.indexOf(p.status);
  const berikut = p.status === 'menunggu' ? 'baru' : iAlur >= 0 && iAlur < ALUR_STATUS.length - 1 ? ALUR_STATUS[iAlur + 1] : '';
  const LABEL_BERIKUT = { baru: 'Terima pesanan', diproses: 'Mulai proses', siap: 'Tandai siap', selesai: 'Selesai' };
  const ubah = async (status) => {
    if (status === 'batal') {
      const ya = await tanya({ judul: `Batalkan pesanan #${p.nomor}?`, teks: s.lunas ? 'Pesanan ini sudah dibayar. Stok produk dikembalikan; uang dikembalikan ke pembeli secara manual.' : 'Stok produk dikembalikan.', ya: 'Batalkan pesanan', bahaya: true });
      if (!ya) return;
    }
    if (p.status === 'menunggu' && status === 'baru' && !s.lunas) {
      const ya = await tanya({ judul: 'Terima sebelum dibayar?', teks: 'Pembayaran belum tercatat. Terima pesanan ini bila pembeli akan membayar nanti (bayar di tempat). Bila sudah transfer, pakai "Cek & tandai lunas".', ya: 'Terima pesanan' });
      if (!ya) return;
    }
    ubahStatusPesanan(db, p.id, status);
  };
  const cara = caraAmbil(p);
  const kabarSiap = cara === 'ojol' ? 'sudah siap. Silakan pesan Gojek / Grab ke toko sekarang' : 'sudah siap diambil';
  const waPembeli = p.hp ? `https://wa.me/${p.hp}?text=${encodeURIComponent(`Halo ${p.nama || ''}, pesanan #${p.nomor} ${p.status === 'siap' ? kabarSiap : 'sedang kami proses'}. Terima kasih!`)}` : '';

  return html`<${Kerangka} k=${k} aktif="pesanan">
    <${Hero} warna="var(--tomat)" label=${STATUS_PESANAN[p.status] || p.status} judul=${'#' + p.nomor} kembali="/pesanan" stat=${html`<${LencanaBayar} db=${db} p=${p} />`} />
    <div class="isi">
      <div class="kolom-2">
        <div class="kolom">
          <section class="kartu kolom">
            ${item.map((i, n) => html`<div class="hasil-baris" key=${n}><span>${i.jumlah}× ${i.nama}${i.opsi && i.opsi.length ? html`<br /><small class="teks-opsi">+ ${i.opsi.join(', ')}</small>` : ''}<br /><small class="teks-kecil">@ ${rupiah(i.harga)}</small></span><b class="biasa">${rupiah(i.harga * i.jumlah)}</b></div>`)}
            ${(p.diskon > 0 || p.ongkir > 0) && html`<div class="hasil-baris"><span>Subtotal</span><b class="biasa">${rupiah(p.subtotal)}</b></div>`}
            ${p.diskon > 0 && html`<div class="hasil-baris"><span>Diskon${p.kodePromo ? ' (' + p.kodePromo + ')' : ''}</span><b class="baik">−${rupiah(p.diskon)}</b></div>`}
            ${p.ongkir > 0 && html`<div class="hasil-baris"><span>Ongkir</span><b class="biasa">${rupiah(p.ongkir)}</b></div>`}
            <div class="hasil-baris"><span><b class="biasa">Total</b></span><b>${rupiah(p.total)}</b></div>
            ${s.lunas && html`<p class="bantu">Dibayar ${s.bayar.metode === 'mayar' ? 'online (Mayar)' : (LABEL_METODE[s.bayar.metode] || 'Tunai').toLowerCase()}${s.bayar.metode === 'tunai' && s.bayar.diterima ? ` · diterima ${rupiah(s.bayar.diterima)}, kembalian ${rupiah(s.bayar.kembalian)}` : ''} · ${tanggal(s.bayar.lunasPada || s.bayar.waktu)} ${jam(s.bayar.lunasPada || s.bayar.waktu)}</p>`}
            ${!s.lunas && p.status !== 'batal' && html`<button class="btn solid lebar" onClick=${() => setBayar(true)}><${Ikon} nama="dompet" ukuran=${18} />${s.menunggu ? 'Lihat QR pembayaran' : s.menungguTransfer ? 'Cek & tandai lunas' : 'Terima pembayaran'}</button>`}
          </section>
        </div>
        <div class="kolom">
          <section class="kartu kolom">
            <div class="hasil-baris"><span>Pembeli</span><b class="biasa">${p.nama || '–'}</b></div>
            ${p.hp && html`<div class="hasil-baris"><span>WhatsApp</span><b class="biasa">${tampilHp(p.hp)}</b></div>`}
            <div class="hasil-baris"><span>Dari</span><b class="biasa">${labelSumber(p)}${p.oleh && p.sumber !== 'online' ? ' · ' + p.oleh : ''}</b></div>
            <div class="hasil-baris"><span>Dicatat</span><b class="biasa">${tanggal(p.waktu)} ${jam(p.waktu)}</b></div>
            ${p.caraAmbil && LABEL_AMBIL[p.caraAmbil] && html`<div class="hasil-baris"><span>Cara ambil</span><b class="biasa">${LABEL_AMBIL[p.caraAmbil]}</b></div>`}
            ${p.jadwal > 0 && html`<div class="hasil-baris"><span>${LABEL_JADWAL[cara] || 'Jadwal ambil'}</span><b class="biasa">${teksJadwal(p.jadwal)}</b></div>`}
            ${cara === 'ojol' && html`<p class="bantu">Ojek dipesan sendiri oleh pembeli. Siapkan pesanan sebelum driver datang.</p>`}
            ${p.alamat && html`<div class="hasil-baris"><span>Alamat</span><b class="biasa">${p.alamat}</b></div>`}
            ${p.catatan && html`<div class="hasil-baris"><span>Catatan</span><b class="biasa">${p.catatan}</b></div>`}
            <div class="baris-btn">
              ${berikut && html`<button class="btn solid" onClick=${() => ubah(berikut)}>${LABEL_BERIKUT[berikut]}</button>`}
              ${waPembeli && html`<a class="btn" href=${waPembeli} target="_blank" rel="noopener"><${Ikon} nama="kirim" ukuran=${18} />Kabari pembeli</a>`}
              ${bisaDiubah(db, p) && html`<a class="btn" href=${tautan('/catat-pesanan?id=' + p.id)}><${Ikon} nama="ubah" ukuran=${18} />Ubah pesanan</a>`}
              ${p.status === 'batal' && html`<button class="btn" onClick=${() => ubah('baru')}>Buka lagi</button>`}
              ${p.status !== 'batal' && p.status !== 'selesai' && html`<button class="btn bahaya" onClick=${() => ubah('batal')}>Batalkan</button>`}
            </div>
          </section>
        </div>
      </div>
    </div>
    ${bayar && html`<${DialogBayar} k=${k} pesanan=${p} onTutup=${(lunas) => (setBayar(false), lunas && rute.kueri.bayar && pergi('/kasir', { ganti: true }))} />`}
  <//>`;
}
