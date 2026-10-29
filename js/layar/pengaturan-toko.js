// Pengaturan khusus akun dapur: akun toko (kasir), pembayaran (rekening + QRIS, atau Mayar), dan toko + link pemesanan.

import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { Ikon } from '../ui/ikon.js';
import { Modal, tanya, tampilToast } from '../ui/pesan.js';
import { buatQR, salin } from './bagikan.js';
import { akunToko, pengaturanMayar, ambilToko, simpanToko, aturTokenToko, tautanToko, rekeningToko, qrisToko, simpanPembayaranManual, pakaiMayar } from '../lib/toko.js';
import { FotoInput } from '../ui/komponen.js';
import { kompres } from '../ui/gambar.js';

// QRIS disimpan sebagai PNG tajam supaya tetap bisa dipindai.
const kompresQris = (file) => kompres(file, 900, 1, { png: true });

const barisKosong = () => ({ bank: '', nomor: '', atasNama: '' });

/** Pembayaran tanpa Mayar: nomor rekening dan foto QRIS toko. Pembeli transfer, toko menandai lunas. */
export function KartuPembayaran({ k }) {
  const { db } = k;
  const t = ambilToko(db);
  const awal = () => {
    const r = rekeningToko(db);
    return r.length ? r : [barisKosong()];
  };
  const [rekening, setRekening] = useState(awal);
  const [qris, setQris] = useState(() => qrisToko(db));
  useEffect(() => {
    setRekening(awal());
    setQris(qrisToko(db));
  }, [t.diubah]);
  const lengkap = (r) => r.filter((x) => x.bank.trim() && x.nomor.trim());
  const berubah = JSON.stringify(lengkap(rekening)) !== JSON.stringify(rekeningToko(db)) || qris !== qrisToko(db);
  const ubahBaris = (i, patch) => setRekening(rekening.map((x, j) => (j === i ? { ...x, ...patch } : x)));
  const simpan = () => {
    simpanPembayaranManual(db, { rekening, qris });
    tampilToast('Info pembayaran disimpan.');
  };
  return html`<section class="kartu kolom" aria-labelledby="h-bayar-manual">
    <h2 class="judul-kecil" id="h-bayar-manual">Pembayaran transfer & QRIS</h2>
    <p class="bantu">Ditampilkan ke pembeli di kasir dan di link pemesanan${pakaiMayar(db) ? ' (saat Mayar dimatikan)' : ''}. Pembeli transfer atau scan QRIS, lalu toko mengecek mutasi dan menandai pesanan lunas.</p>
    ${rekening.map(
      (r, i) => html`<div class="baris-belanja" key=${i}>
        <div class="dua-kolom">
          <label class="bidang"><span>Bank / e-wallet</span><input class="input kecil" maxlength="40" placeholder="mis. BCA" aria-label=${'Bank rekening ' + (i + 1)} value=${r.bank} onInput=${(e) => ubahBaris(i, { bank: e.target.value })} /></label>
          <label class="bidang"><span>Nomor rekening</span><input class="input kecil" inputmode="numeric" maxlength="40" aria-label=${'Nomor rekening ' + (i + 1)} value=${r.nomor} onInput=${(e) => ubahBaris(i, { nomor: e.target.value })} /></label>
        </div>
        <label class="bidang"><span>Atas nama</span><input class="input kecil" maxlength="60" aria-label=${'Atas nama rekening ' + (i + 1)} value=${r.atasNama} onInput=${(e) => ubahBaris(i, { atasNama: e.target.value })} /></label>
        ${rekening.length > 1 && html`<button class="btn kecil bahaya" style="align-self:flex-start" onClick=${() => setRekening(rekening.filter((_, j) => j !== i))}>Hapus rekening ini</button>`}
      </div>`,
    )}
    ${rekening.length < 5 && html`<button class="btn" onClick=${() => setRekening([...rekening, barisKosong()])}><${Ikon} nama="plus" ukuran=${18} />Tambah rekening</button>`}
    <div class="bidang"><span>Foto QRIS</span>
      <div class="qris-pilih"><${FotoInput} nilai=${qris} onUbah=${setQris} judul=${qris ? 'Ganti foto QRIS' : 'Unggah foto QRIS'} bantu="Foto / tangkapan layar QRIS toko Anda." aksen="var(--hijau)" ikon="qr" kompresFn=${kompresQris} kelas="qris" /></div>
      ${qris && html`<button class="btn kecil" style="align-self:flex-start" onClick=${() => setQris('')}>Hapus foto QRIS</button>`}
    </div>
    ${berubah && html`<button class="btn solid" onClick=${simpan}>Simpan info pembayaran</button>`}
  </section>`;
}
import { MIN_SANDI } from '../lib/akun.js';
import { tanggal } from '../lib/util.js';

function DialogAkunToko({ k, akun, onTutup, onSimpan }) {
  const baru = !akun;
  const [nama, setNama] = useState(akun ? akun.nama : '');
  const [username, setUsername] = useState(akun ? akun.username : '');
  const [sandi, setSandi] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const kirim = async (e) => {
    e.preventDefault();
    if (nama.trim().length < 2) return setGalat('Isi nama, mis. Kasir Pagi.');
    if (baru && !/^[a-z0-9._]{4,40}$/.test(username.trim().toLowerCase())) return setGalat('Username 4-40 karakter: huruf kecil, angka, titik, atau garis bawah.');
    if ((baru || sandi) && sandi.length < MIN_SANDI) return setGalat(`Kata sandi minimal ${MIN_SANDI} karakter.`);
    setSibuk(true);
    try {
      const hasil = baru
        ? await akunToko.buat(k.db, { nama: nama.trim(), username: username.trim().toLowerCase(), kataSandi: sandi })
        : await akunToko.ubah(k.db, akun.id, { nama: nama.trim(), ...(sandi ? { kataSandi: sandi } : {}) });
      tampilToast(baru ? `Akun toko ${hasil.username} dibuat.` : 'Akun toko disimpan.');
      onSimpan();
    } catch (err) {
      setGalat(err.message);
      setSibuk(false);
    }
  };
  return html`<${Modal} judul=${baru ? 'Akun toko baru' : 'Ubah akun toko'} onTutup=${onTutup}>
    <form class="kolom" style="gap:12px" onSubmit=${kirim} novalidate>
      <label class="bidang"><span>Nama</span><input class="input" maxlength="60" value=${nama} placeholder="mis. Kasir Pagi" onInput=${(e) => setNama(e.target.value)} /></label>
      <label class="bidang"><span>Username untuk masuk</span><input class="input" maxlength="40" autocapitalize="none" disabled=${!baru} value=${username} placeholder="mis. kasir.pagi" onInput=${(e) => setUsername(e.target.value)} /></label>
      <label class="bidang"><span>${baru ? 'Kata sandi' : 'Kata sandi baru (kosongkan bila tetap)'}</span><input class="input" type="text" autocomplete="off" maxlength="100" value=${sandi} onInput=${(e) => setSandi(e.target.value)} /><span class="bantu">Minimal ${MIN_SANDI} karakter. Berikan ke kasir; ${baru ? '' : 'mengganti kata sandi membuat kasir keluar dari semua perangkat.'}</span></label>
      ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
      <div class="baris-btn">
        <button class="btn abu lebar" type="button" onClick=${onTutup}>Batal</button>
        <button class="btn solid lebar" type="submit" disabled=${sibuk}>${sibuk ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </form>
  <//>`;
}

/** Akun toko: kasir yang hanya bisa membuka menu, stok makanan, pesanan, dan pembayaran. */
export function KartuAkunToko({ k }) {
  const { db } = k;
  const [daftar, setDaftar] = useState(null);
  const [galat, setGalat] = useState('');
  const [dialog, setDialog] = useState(null);
  const muat = () =>
    akunToko
      .daftar(db)
      .then((d) => (setDaftar(d), setGalat('')))
      .catch((e) => setGalat(e.message));
  useEffect(() => void muat(), []);
  const aktifkan = async (a) => {
    try {
      await akunToko.ubah(db, a.id, { aktif: !a.aktif });
      tampilToast(a.aktif ? `${a.nama} dinonaktifkan dan keluar dari semua perangkat.` : `${a.nama} aktif lagi.`);
      muat();
    } catch (e) {
      tampilToast(e.message);
    }
  };
  const hapus = async (a) => {
    if (!(await tanya({ judul: `Hapus akun ${a.username}?`, teks: 'Kasir ini tidak bisa masuk lagi. Pesanan yang pernah dibuatnya tetap tersimpan.', ya: 'Hapus akun', bahaya: true }))) return;
    try {
      await akunToko.hapus(db, a.id);
      muat();
    } catch (e) {
      tampilToast(e.message);
    }
  };
  return html`<section class="kartu kolom" aria-labelledby="h-akun-toko">
    <h2 class="judul-kecil" id="h-akun-toko">Akun toko (kasir)</h2>
    <p class="bantu">Akun toko masuk di halaman Masuk dengan username dan kata sandinya. Akun ini hanya bisa membuka Kasir, Pesanan, Stok makanan, Menu, dan Pelanggan; resep, bahan, dan HPP tidak terlihat.</p>
    ${galat && html`<p class="galat-teks">${galat} <button class="tautan-kecil" onClick=${muat}>Coba lagi</button></p>`}
    ${daftar && daftar.length === 0 && html`<p class="bantu">Belum ada akun toko.</p>`}
    ${(daftar || []).map(
      (a) => html`<div class="hasil-baris" key=${a.id}>
        <span><b class="biasa">${a.nama}</b> ${!a.aktif && html`<small class="teks-buruk">nonaktif</small>`}<br /><small class="teks-kecil">${a.username}${a.terakhirDipakai ? ' · terakhir dipakai ' + tanggal(a.terakhirDipakai) : ''}</small></span>
        <span class="baris-aksi">
          <button class="btn kecil" onClick=${() => setDialog(a)}>Ubah</button>
          <button class="btn kecil" onClick=${() => aktifkan(a)}>${a.aktif ? 'Nonaktifkan' : 'Aktifkan'}</button>
          <button class="ikon-btn kecil" aria-label=${'Hapus akun ' + a.username} onClick=${() => hapus(a)}><${Ikon} nama="sampah" ukuran=${16} /></button>
        </span>
      </div>`,
    )}
    <button class="btn solid" onClick=${() => setDialog('baru')}><${Ikon} nama="plus" ukuran=${18} />Buat akun toko</button>
    ${dialog && html`<${DialogAkunToko} k=${k} akun=${dialog === 'baru' ? null : dialog} onTutup=${() => setDialog(null)} onSimpan=${() => (setDialog(null), muat())} />`}
  </section>`;
}

/** Kunci API Mayar milik usaha (disimpan terenkripsi di server, tidak pernah dikirim balik ke aplikasi). */
export function KartuMayar({ k }) {
  const { db } = k;
  const [info, setInfo] = useState(null);
  const [kunci, setKunci] = useState('');
  const [sandbox, setSandbox] = useState(false);
  const [galat, setGalat] = useState('');
  const [pesan, setPesan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  useEffect(() => {
    pengaturanMayar
      .info(db)
      .then((i) => (setInfo(i), setSandbox(!!i.sandbox)))
      .catch((e) => setGalat(e.message));
  }, []);
  const simpan = async () => {
    setSibuk(true);
    setGalat('');
    try {
      const i = await pengaturanMayar.simpan(db, { kunciApi: kunci.trim(), sandbox });
      setInfo(i);
      simpanToko(db, { pakaiMayar: true });
      setKunci('');
      setPesan(i.pesan || '');
    } catch (e) {
      setGalat(e.message);
    } finally {
      setSibuk(false);
    }
  };
  const matikan = async () => {
    if (!(await tanya({ judul: 'Hapus kunci Mayar?', teks: 'Pembayaran non-tunai kembali memakai transfer & QRIS manual sampai kunci diisi lagi.', ya: 'Hapus kunci', bahaya: true }))) return;
    try {
      setInfo(await pengaturanMayar.matikan(db));
      simpanToko(db, { pakaiMayar: false });
      setPesan('');
    } catch (e) {
      setGalat(e.message);
    }
  };
  return html`<section class="kartu kolom" aria-labelledby="h-mayar">
    <h2 class="judul-kecil" id="h-mayar">Pembayaran otomatis Mayar (opsional)</h2>
    ${info && html`<div class="hasil-baris"><span>Status</span><b class=${info.aktif ? 'baik' : 'biasa'}>${info.aktif ? `Aktif${info.sandbox ? ' · mode uji (sandbox)' : ''}` : 'Belum aktif'}</b></div>`}
    <p class="bantu">Pembeli membayar lewat QRIS, e-wallet, atau transfer bank; uang masuk ke akun Mayar Anda. Ambil kunci API (Read & Write) di dashboard Mayar: Integrasi → API Key.</p>
    <label class="bidang"><span>${info && info.aktif ? 'Ganti kunci API' : 'Kunci API Mayar'}</span><input class="input" type="password" autocomplete="off" value=${kunci} onInput=${(e) => setKunci(e.target.value)} placeholder="Tempel kunci API di sini" /></label>
    <label class="saklar"><input type="checkbox" checked=${sandbox} onChange=${(e) => setSandbox(e.target.checked)} /><span>Kunci dari web.mayar.club / mayar.io (mode uji / sandbox)</span></label>
    ${info && info.webhook && html`<div class="bidang"><span>Alamat webhook</span>
      <div class="cari-baris"><input class="input kecil" readonly value=${info.webhook} aria-label="Alamat webhook" /><button class="btn" onClick=${async () => tampilToast((await salin(info.webhook)) ? 'Alamat disalin.' : 'Gagal menyalin.')}>Salin</button></div>
      <span class="bantu">Didaftarkan otomatis saat kunci disimpan. Bila gagal, tempel di dashboard Mayar: Integrasi → Webhook.</span></div>`}
    ${info && info.aktif && html`<label class="saklar"><input type="checkbox" checked=${pakaiMayar(db)} onChange=${(e) => simpanToko(db, { pakaiMayar: e.target.checked })} /><span>Pakai Mayar untuk kasir dan link pemesanan (bila mati: transfer & QRIS manual)</span></label>`}
    ${pesan && html`<p class="bantu teks-baik" role="status">${pesan}</p>`}
    ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
    <div class="baris-btn">
      <button class="btn solid" disabled=${sibuk || kunci.trim().length < 20} onClick=${simpan}>${sibuk ? 'Menyimpan…' : 'Simpan kunci'}</button>
      ${info && info.aktif && html`<button class="btn bahaya" onClick=${matikan}>Matikan</button>`}
    </div>
  </section>`;
}

/** Nama toko, buka/tutup, dan link pemesanan untuk pembeli. */
export function KartuTokoOnline({ k }) {
  const { db } = k;
  const t = ambilToko(db);
  const [d, setD] = useState(t);
  const [qr, setQr] = useState(false);
  useEffect(() => setD(ambilToko(db)), [t.diubah]);
  const berubah = ['namaToko', 'alamatToko', 'waToko', 'catatanToko'].some((x) => (d[x] || '') !== (t[x] || ''));
  // Alamat toko = halaman depan situs. Token hanya menandai bahwa toko online sudah diaktifkan.
  const tautan = t.tokenToko ? tautanToko('', db.pengaturan.scriptUrl) : '';
  const buatLink = () => {
    aturTokenToko(db);
    tampilToast('Toko online diaktifkan.');
  };
  return html`<section class="kartu kolom" aria-labelledby="h-toko-online">
    <h2 class="judul-kecil" id="h-toko-online">Toko online</h2>
    <label class="bidang"><span>Nama toko</span><input class="input" maxlength="60" value=${d.namaToko || ''} onInput=${(e) => setD({ ...d, namaToko: e.target.value })} /></label>
    <div class="dua-kolom">
      <label class="bidang"><span>Alamat / area</span><input class="input" maxlength="120" value=${d.alamatToko || ''} onInput=${(e) => setD({ ...d, alamatToko: e.target.value })} /></label>
      <label class="bidang"><span>WhatsApp toko</span><input class="input" inputmode="tel" maxlength="20" value=${d.waToko || ''} onInput=${(e) => setD({ ...d, waToko: e.target.value })} /></label>
    </div>
    <label class="bidang"><span>Pengumuman untuk pembeli (opsional)</span><input class="input" maxlength="300" value=${d.catatanToko || ''} placeholder="mis. Pesanan diambil H+1, gratis ongkir area kota" onInput=${(e) => setD({ ...d, catatanToko: e.target.value })} /></label>
    ${berubah && html`<button class="btn solid" onClick=${() => (simpanToko(db, d), tampilToast('Data toko disimpan.'))}>Simpan data toko</button>`}
    <label class="saklar"><input type="checkbox" checked=${!!t.tokoBuka} onChange=${(e) => simpanToko(db, { tokoBuka: e.target.checked })} /><span>Toko buka: etalase menerima pesanan</span></label>
    ${tautan
      ? html`<div class="bidang"><span>Alamat toko untuk pembeli</span>
          <div class="cari-baris"><input class="input kecil" readonly value=${tautan} aria-label="Alamat toko" /><button class="btn" onClick=${async () => tampilToast((await salin(tautan)) ? 'Alamat disalin.' : 'Gagal menyalin.')}>Salin</button></div>
          <div class="baris-btn">
            <button class="btn" onClick=${() => setQr(!qr)}><${Ikon} nama="qr" ukuran=${18} />${qr ? 'Sembunyikan QR' : 'Tampilkan QR'}</button>
            <a class="btn" href=${tautan} target="_blank" rel="noopener">Buka etalase</a>
          </div>
          ${qr && html`<div class="qr-bayar" role="img" aria-label="Kode QR alamat toko" dangerouslySetInnerHTML=${{ __html: buatQR(tautan, { cellSize: 4, margin: 2, scalable: true }) }}></div>`}
        </div>`
      : html`<button class="btn solid" onClick=${buatLink}><${Ikon} nama="toko" ukuran=${18} />Aktifkan toko online</button>`}
    <p class="bantu">${pakaiMayar(db) ? 'Pembeli memesan dan langsung membayar lewat Mayar. Pesanan masuk setelah lunas.' : 'Pembeli memesan lalu transfer / scan QRIS toko. Pesanan masuk ke tab "Menunggu bayar"; tandai lunas setelah uang masuk.'} Hanya menu yang ditandai "Tampil di link pemesanan" yang muncul. Testimoni pembeli yang disetujui tampil di bawah halaman ini.</p>
  </section>`;
}
