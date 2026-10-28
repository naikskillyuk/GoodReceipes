// Link pemesanan untuk pembeli (tanpa login): pilih menu, isi nama dan WhatsApp, lalu bayar lewat Mayar.
// Setelah membayar, Mayar mengarahkan kembali ke halaman ini (?pesanan=...) untuk melihat status pesanan.

import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { Hero, Kosong, Foto, LogoMerek } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { terapkanMerekDokumen } from '../ui/merek.js';
import { scriptUrlAman } from './penilai.js';
import { pesanOnline } from '../lib/toko.js';
import { panggilApi } from '../lib/sync.js';
import { LOGO_BAWAAN } from '../lib/repo.js';
import { rupiah } from '../lib/util.js';

const CEK_TIAP_MS = 5000;

function alamatServer(k) {
  const tetap = (window.APP_CONFIG && window.APP_CONFIG.scriptUrl) || '';
  const dariTautan = k.rute.kueri.u || '';
  return tetap || (scriptUrlAman(dariTautan) ? dariTautan : '') || k.db.pengaturan.scriptUrl || '';
}

const kunciSimpan = (token) => 'pesanan-terakhir-' + token;
function ingat(token, id) {
  try {
    localStorage.setItem(kunciSimpan(token), id);
  } catch {
    /* tidak apa-apa */
  }
}
function ingatan(token) {
  try {
    return localStorage.getItem(kunciSimpan(token)) || '';
  } catch {
    return '';
  }
}

/** Status pesanan setelah membayar. Dicek berkala sampai lunas. */
function StatusPesanan({ url, token, idPesanan, onBaru }) {
  const [s, setS] = useState(null);
  const [galat, setGalat] = useState('');
  useEffect(() => {
    let hidup = true;
    let t = null;
    const cek = async () => {
      try {
        const j = await pesanOnline.status(url, token, idPesanan);
        if (!hidup) return;
        setS(j);
        setGalat('');
        if (!j.lunas && j.status !== 'batal') t = setTimeout(cek, CEK_TIAP_MS);
      } catch (e) {
        if (hidup) setGalat(e.message);
      }
    };
    cek();
    return () => {
      hidup = false;
      clearTimeout(t);
    };
  }, [idPesanan]);
  if (galat) return html`<${Kosong} judul="Pesanan tidak ditemukan" teks=${galat}><button class="btn solid" onClick=${onBaru}>Pesan lagi</button><//>`;
  if (!s) return html`<p role="status">Memeriksa pesanan…</p>`;
  const LABEL = { baru: 'Pesanan diterima toko', diproses: 'Sedang disiapkan', siap: 'Siap diambil / dikirim', selesai: 'Selesai', batal: 'Pesanan dibatalkan', menunggu: 'Menunggu pembayaran' };
  return html`<div class="kolom" style="gap:16px">
    <div class="kosong" role="status">
      <span class="skor-bulat" style=${`background:${s.lunas ? 'var(--hijau)' : 'var(--kuning)'};color:#fff`}><${Ikon} nama=${s.lunas ? 'centang' : 'jam'} ukuran=${34} /></span>
      <h3>${s.lunas ? 'Pembayaran diterima' : s.status === 'batal' ? 'Pesanan dibatalkan' : 'Menunggu pembayaran'}</h3>
      <p>Pesanan #${s.nomor} · ${LABEL[s.status] || s.status}</p>
    </div>
    <section class="kartu kolom">
      ${(s.item || []).map((i) => html`<div class="hasil-baris" key=${i.idMenu}><span>${i.jumlah}× ${i.nama}</span><b class="biasa">${rupiah(i.harga * i.jumlah)}</b></div>`)}
      <div class="hasil-baris"><span><b class="biasa">Total</b></span><b>${rupiah(s.total)}</b></div>
    </section>
    ${s.link && html`<a class="pil" href=${s.link}>Bayar sekarang<span class="ujung"><${Ikon} nama="panah" /></span></a>`}
    <button class="btn" onClick=${onBaru}>Buat pesanan lain</button>
  </div>`;
}

export function PesanOnline({ k, token }) {
  const url = alamatServer(k);
  const [info, setInfo] = useState(null);
  const [galat, setGalat] = useState('');
  const [idPesanan, setIdPesanan] = useState(() => k.rute.kueri.pesanan || '');
  const [jumlah, setJumlah] = useState({});
  const [nama, setNama] = useState('');
  const [hp, setHp] = useState('');
  const [catatan, setCatatan] = useState('');
  const [kode, setKode] = useState('');
  const [kirimGalat, setKirimGalat] = useState('');
  const [mengirim, setMengirim] = useState(false);
  const terakhir = ingatan(token);

  useEffect(() => {
    if (!url) return setGalat('Link ini tidak lengkap. Minta toko mengirim ulang link pemesanannya.');
    pesanOnline
      .info(url, token)
      .then(setInfo)
      .catch((e) => setGalat(e.message || 'Link tidak bisa dibuka.'));
  }, [token, url]);
  useEffect(() => {
    if (k.rute.kueri.pesanan) setIdPesanan(k.rute.kueri.pesanan);
  }, [k.rute.kueri.pesanan]);

  const namaToko = (info && info.namaToko) || 'Pesan online';
  const logo = (info && info.logoUrl) || LOGO_BAWAAN;
  useEffect(() => terapkanMerekDokumen({ nama: namaToko, logo }), [namaToko, logo]);

  const menu = (info && info.menu) || [];
  const item = menu.filter((m) => jumlah[m.id] > 0).map((m) => ({ ...m, jumlah: jumlah[m.id] }));
  const total = item.reduce((j, m) => j + m.harga * m.jumlah, 0);
  const atur = (m, n) => {
    const maks = m.sisa === null ? 100 : Math.min(100, m.sisa);
    setJumlah((j) => ({ ...j, [m.id]: Math.max(0, Math.min(maks, n)) }));
    setKirimGalat('');
  };

  const kirim = async (e) => {
    e.preventDefault();
    if (!item.length) return setKirimGalat('Pilih menu dulu.');
    if (nama.trim().length < 2) return setKirimGalat('Isi nama Anda.');
    if (!hp.trim()) return setKirimGalat('Isi nomor WhatsApp untuk kabar pesanan.');
    setMengirim(true);
    try {
      const j = await pesanOnline.kirim(url, token, { nama: nama.trim(), hp, catatan: catatan.trim(), kodePromo: kode.trim(), item: item.map((m) => ({ idMenu: m.id, jumlah: m.jumlah })) });
      ingat(token, j.idPesanan);
      location.href = j.link;
    } catch (err) {
      setKirimGalat(err.message || 'Pesanan gagal dikirim. Coba lagi.');
      setMengirim(false);
    }
  };

  const baru = () => {
    setIdPesanan('');
    setJumlah({});
    history.replaceState(null, '', location.pathname + location.search + '#/pesan/' + token + (k.rute.kueri.u ? '?u=' + encodeURIComponent(k.rute.kueri.u) : ''));
  };

  return html`<div class="penilai pesan-online">
    <${Hero} terang label=${html`<span class="merek-hero"><${LogoMerek} src=${logo} ukuran=${32} /><span>${namaToko}</span></span>`} judul=${idPesanan ? 'Pesanan Anda' : 'Pesan online'} panjang=${true}>
      ${info && !idPesanan && html`<div class="info-toko">${info.alamat && html`<span>${info.alamat}</span>`}<span class=${info.buka ? 'teks-baik' : 'teks-buruk'}>${info.buka ? 'Buka' : 'Tutup'}</span></div>`}
    <//>
    <div class="isi">
      ${galat && html`<${Kosong} judul="Link tidak bisa dibuka" teks=${galat} />`}
      ${!galat && idPesanan && html`<${StatusPesanan} url=${url} token=${token} idPesanan=${idPesanan} onBaru=${baru} />`}
      ${!galat && !idPesanan && !info && html`<p role="status">Membuka menu…</p>`}
      ${!galat && !idPesanan && info && !info.buka && html`<${Kosong} judul="Toko sedang tutup" teks=${info.catatan || 'Silakan kembali lagi nanti.'} />`}
      ${!galat && !idPesanan && info && info.buka &&
      html`<form class="kolom" onSubmit=${kirim} novalidate style="gap:16px">
        ${terakhir && html`<button type="button" class="btn" onClick=${() => setIdPesanan(terakhir)}><${Ikon} nama="jam" ukuran=${18} />Lihat pesanan terakhir saya</button>`}
        ${info.catatan && html`<div class="info">${info.catatan}</div>`}
        ${!info.bayarOnline && html`<div class="info">Toko ini belum menerima pembayaran online. Hubungi toko${info.wa ? ' di WhatsApp' : ''} untuk memesan.</div>`}
        ${menu.length === 0 && html`<${Kosong} judul="Menu belum tersedia" />`}
        <div class="daftar daftar-lebar">
          ${menu.map((m) => {
            const n = jumlah[m.id] || 0;
            const habis = m.sisa !== null && m.sisa <= 0;
            return html`<div class=${'kartu-menu' + (habis ? ' mati' : '')} key=${m.id}>
              <span class="foto-menu"><${Foto} src=${m.fotoUrl} ikon="kue" /></span>
              <div class="kolom" style="gap:4px;flex:1;min-width:0">
                <b>${m.nama}</b>
                ${m.keterangan && html`<small class="teks-kecil">${m.keterangan}</small>`}
                <span class="baris-pisah">
                  <b class="harga-menu">${rupiah(m.harga)}</b>
                  ${habis
                    ? html`<small class="teks-buruk">Habis</small>`
                    : n === 0
                      ? html`<button type="button" class="btn kecil solid" onClick=${() => atur(m, 1)} aria-label=${'Tambah ' + m.nama}>Tambah</button>`
                      : html`<span class="stepper">
                          <button type="button" aria-label=${'Kurangi ' + m.nama} onClick=${() => atur(m, n - 1)}><${Ikon} nama="minus" ukuran=${16} /></button>
                          <output>${n}</output>
                          <button type="button" aria-label=${'Tambah ' + m.nama} onClick=${() => atur(m, n + 1)}><${Ikon} nama="plus" ukuran=${16} /></button>
                        </span>`}
                </span>
              </div>
            </div>`;
          })}
        </div>
        ${item.length > 0 &&
        html`<section class="kartu kolom" aria-labelledby="h-data-pembeli">
          <h2 class="judul-kecil" id="h-data-pembeli">Data pemesan</h2>
          <label class="bidang"><span>Nama</span><input class="input" maxlength="60" autocomplete="name" value=${nama} onInput=${(e) => setNama(e.target.value)} /></label>
          <label class="bidang"><span>Nomor WhatsApp</span><input class="input" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="0812…" value=${hp} onInput=${(e) => setHp(e.target.value)} /><span class="bantu">Untuk kabar pesanan dan promo dari toko.</span></label>
          <label class="bidang"><span>Catatan (opsional)</span><input class="input" maxlength="300" value=${catatan} onInput=${(e) => setCatatan(e.target.value)} placeholder="mis. diambil jam 4 sore" /></label>
          <label class="bidang"><span>Kode promo (opsional)</span><input class="input" maxlength="30" style="text-transform:uppercase" value=${kode} onInput=${(e) => setKode(e.target.value)} /></label>
          ${item.map((m) => html`<div class="hasil-baris" key=${m.id}><span>${m.jumlah}× ${m.nama}</span><b class="biasa">${rupiah(m.harga * m.jumlah)}</b></div>`)}
          <div class="hasil-baris"><span><b class="biasa">Total</b>${kode.trim() ? html`<br /><small class="teks-kecil">Diskon promo dihitung di langkah berikutnya</small>` : ''}</span><b>${rupiah(total)}</b></div>
          ${kirimGalat && html`<p class="galat-teks" role="alert">${kirimGalat}</p>`}
          <button class="pil" type="submit" disabled=${mengirim || !info.bayarOnline}>${mengirim ? 'Membuat pembayaran…' : 'Pesan & bayar'}<span class="ujung"><${Ikon} nama="dompet" /></span></button>
          <p class="bantu" style="text-align:center">Pembayaran lewat Mayar: QRIS, e-wallet, atau transfer bank.</p>
        </section>`}
      </form>`}
    </div>
  </div>`;
}

/** Halaman bayar tiruan untuk server uji (pengganti halaman Mayar). */
export function TiruanMayar({ k, id }) {
  // Server uji menyajikan aplikasi dan /api di alamat yang sama.
  const url = alamatServer(k) || location.origin + '/api';
  const [hasil, setHasil] = useState(null);
  const [galat, setGalat] = useState('');
  const bayar = async () => {
    try {
      setHasil(await panggilApi(url, { aksi: 'tiruanLunas', idMayar: id }));
    } catch (e) {
      setGalat(e.message);
    }
  };
  return html`<div class="penilai"><div class="isi">
    <${Kosong} judul="Mayar (tiruan)" teks=${hasil ? `Pembayaran ${rupiah(hasil.jumlah)} berhasil.` : 'Halaman ini hanya ada di server uji, menggantikan halaman pembayaran Mayar.'}>
      ${!hasil && html`<button class="btn solid" onClick=${bayar}>Bayar (tiruan)</button>`}
      ${hasil && html`<button class="btn" onClick=${() => history.back()}>Kembali</button>`}
      ${galat && html`<p class="galat-teks">${galat}</p>`}
    <//>
  </div></div>`;
}
