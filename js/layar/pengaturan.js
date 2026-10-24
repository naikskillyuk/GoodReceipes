// Pengaturan: akun, nama dan logo aplikasi, dan kategori.

import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, LogoMerek, FotoInput } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { IkonKategori } from '../ui/ikon-kategori.js';
import { Modal, tanya, tampilToast } from '../ui/pesan.js';
import { kompresLogo } from '../ui/gambar.js';
import { ubahNamaAkun, gantiSandiAkun, keluarAkun, MIN_SANDI } from '../lib/akun.js';
import { daftarKategori, tambahKategori, pakaiKategori, WARNA_KATEGORI, ambilMerek, simpanMerek, NAMA_APLIKASI_BAWAAN, LOGO_BAWAAN } from '../lib/repo.js';

function BarisKategori({ db, kat }) {
  const [warnaBuka, setWarnaBuka] = useState(false);
  const dipakai = pakaiKategori(db, kat.id);
  return html`<div class="kolom" style="gap:8px">
    <div class="kategori-baris">
      <button class="titik-warna" style=${`--warna:${kat.warna};border:0`} aria-label=${'Ganti warna ' + kat.nama} aria-expanded=${warnaBuka} onClick=${() => setWarnaBuka(!warnaBuka)}></button>
      <${IkonKategori} nama=${kat.nama} ukuran=${30} />
      <input class="input kecil" style="flex:1" aria-label=${'Nama kategori ' + kat.nama} maxlength="30" value=${kat.nama} onChange=${(e) => e.target.value.trim() && db.simpan('Kategori', { ...kat, nama: e.target.value.trim() })} />
      <span class="teks-kecil" style="min-width:56px;text-align:right">${dipakai} resep</span>
      <button class="ikon-btn kecil" disabled=${dipakai > 0} title=${dipakai > 0 ? 'Masih dipakai resep' : 'Hapus kategori'} aria-label=${'Hapus kategori ' + kat.nama} onClick=${() => db.hapus('Kategori', kat.id)}><${Ikon} nama="sampah" ukuran=${18} /></button>
    </div>
    ${warnaBuka &&
    html`<div class="warna-pilihan">
      ${WARNA_KATEGORI.map((w) => html`<button type="button" style=${`--warna:${w}`} aria-label=${'Warna ' + w} aria-pressed=${kat.warna === w} onClick=${() => (db.simpan('Kategori', { ...kat, warna: w }), setWarnaBuka(false))}></button>`)}
    </div>`}
  </div>`;
}

/** Nama dan logo aplikasi. Disimpan ke server sehingga ikut tampil di perangkat lain dan di halaman penilai. */
function KartuTampilan({ k }) {
  const { db } = k;
  const merek = ambilMerek(db);
  const [nama, setNama] = useState(merek.namaSendiri);
  const [logo, setLogo] = useState(merek.logoSendiri);
  useEffect(() => {
    setNama(merek.namaSendiri);
    setLogo(merek.logoSendiri);
  }, [merek.namaSendiri, merek.logoSendiri]);
  const berubah = nama.trim() !== merek.namaSendiri || logo !== merek.logoSendiri;
  const bawaan = !merek.namaSendiri && !merek.logoSendiri && !berubah;

  const simpan = () => {
    simpanMerek(db, { nama, logo });
    tampilToast('Tampilan aplikasi disimpan.');
  };
  const kembalikan = async () => {
    const ya = await tanya({ judul: 'Kembalikan nama dan logo bawaan?', teks: `Nama menjadi "${NAMA_APLIKASI_BAWAAN}" dan logo kembali ke logo bawaan, juga di perangkat lain.`, ya: 'Kembalikan' });
    if (!ya) return;
    simpanMerek(db, { nama: '', logo: '' });
    setNama('');
    setLogo('');
    tampilToast('Kembali ke tampilan bawaan.');
  };

  return html`<section class="kartu kolom" aria-labelledby="h-tampilan">
    <h2 class="judul-kecil" id="h-tampilan">Nama dan logo aplikasi</h2>
    <div class="pratinjau-merek" aria-label="Pratinjau">
      <${LogoMerek} src=${logo || LOGO_BAWAAN} ukuran=${64} />
      <b>${nama.trim() || NAMA_APLIKASI_BAWAAN}</b>
    </div>
    <label class="bidang"><span>Nama aplikasi</span>
      <input class="input" maxlength="40" placeholder=${NAMA_APLIKASI_BAWAAN} value=${nama} onInput=${(e) => setNama(e.target.value)} />
    </label>
    <div class="bidang"><span>Logo</span>
      <${FotoInput} nilai=${logo} onUbah=${setLogo} judul="Pilih logo" bantu="Gambar persegi paling bagus. PNG transparan boleh." aksen="var(--hijau)" ikon="gambar" kompresFn=${kompresLogo} kelas="logo" />
    </div>
    <div class="baris-btn">
      <button class="btn solid" onClick=${simpan} disabled=${!berubah}>Simpan tampilan</button>
      <button class="btn" onClick=${kembalikan} disabled=${bawaan}>Kembalikan bawaan</button>
    </div>
    <p class="bantu">Tampil di halaman masuk, beranda, kode QR, dan halaman penilai, serta ikut ke perangkat lain lewat server. Ikon dan nama di layar utama HP tidak berubah dari sini; caranya ada di README.</p>
  </section>`;
}

/** Ganti kata sandi akun (di server). Perangkat lain yang sedang masuk ikut keluar. */
function DialogSandiAkun({ k, onTutup }) {
  const [lama, setLama] = useState('');
  const [baru, setBaru] = useState('');
  const [ulang, setUlang] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const kirim = async (e) => {
    e.preventDefault();
    if (baru.length < MIN_SANDI) return setGalat(`Kata sandi baru minimal ${MIN_SANDI} karakter.`);
    if (baru !== ulang) return setGalat('Pengulangan kata sandi tidak sama.');
    setSibuk(true);
    setGalat('');
    try {
      await gantiSandiAkun(k.db, { lama, baru });
      tampilToast('Kata sandi akun diganti. Perangkat lain perlu masuk lagi.');
      onTutup();
    } catch (err) {
      setGalat(err.message || 'Gagal mengganti kata sandi.');
    } finally {
      setSibuk(false);
    }
  };
  return html`<${Modal} judul="Ganti kata sandi akun" onTutup=${onTutup}>
    <form class="kolom" onSubmit=${kirim} style="gap:12px" novalidate>
      <label class="bidang"><span>Kata sandi saat ini</span><input class="input" type="password" autocomplete="current-password" maxlength="100" value=${lama} onInput=${(e) => setLama(e.target.value)} /></label>
      <label class="bidang"><span>Kata sandi baru</span><input class="input" type="password" autocomplete="new-password" maxlength="100" value=${baru} onInput=${(e) => setBaru(e.target.value)} /><span class="bantu">Minimal ${MIN_SANDI} karakter.</span></label>
      <label class="bidang"><span>Ulangi kata sandi baru</span><input class="input" type="password" autocomplete="new-password" maxlength="100" value=${ulang} onInput=${(e) => setUlang(e.target.value)} /></label>
      ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
      <p class="bantu" style="font-size:13px;line-height:18px">Ini kata sandi untuk masuk ke akun, di semua perangkat. Lupa kata sandi saat ini? Keluar dari akun, lalu pakai "Lupa kata sandi?" di halaman Masuk.</p>
      <div class="baris-btn">
        <button class="btn abu lebar" type="button" onClick=${onTutup}>Batal</button>
        <button class="btn solid lebar" type="submit" disabled=${sibuk || !lama}>${sibuk ? 'Menyimpan…' : 'Simpan'}</button>
      </div>
    </form>
  <//>`;
}

/** Akun yang sedang masuk, ganti kata sandi, dan tombol keluar. */
function KartuAkun({ k }) {
  const { db } = k;
  const p = db.pengaturan;
  const akun = p.akun || {};
  const [nama, setNama] = useState(akun.nama || '');
  const [sibuk, setSibuk] = useState(false);
  const [dialog, setDialog] = useState(false);
  const namaBerubah = nama.trim() !== (akun.nama || '') && nama.trim().length >= 2;

  const simpanNama = async () => {
    setSibuk(true);
    try {
      await ubahNamaAkun(db, nama);
      tampilToast('Nama disimpan.');
    } catch (e) {
      tampilToast(e.message || 'Gagal menyimpan nama.');
    } finally {
      setSibuk(false);
    }
  };
  const keluar = async () => {
    const ya = await tanya({
      judul: 'Keluar dari akun?',
      teks: 'Perubahan terakhir dikirim ke server dulu, lalu salinan data di perangkat ini dihapus. Semua data tetap aman di akun Anda dan muncul lagi saat Anda masuk.',
      ya: 'Keluar',
      bahaya: true,
    });
    if (!ya) return;
    setSibuk(true);
    const { hilang } = await keluarAkun(db, { sinkronkan: () => k.penyinkron.sinkronkan() });
    setSibuk(false);
    tampilToast(hilang ? `Anda keluar. ${hilang} perubahan belum sempat terkirim.` : 'Anda sudah keluar.');
  };

  return html`<section class="kartu kolom" aria-labelledby="h-akun">
    <h2 class="judul-kecil" id="h-akun">Akun</h2>
    <div class="cari-baris">
      <label class="bidang" style="flex:1"><span>Nama</span><input class="input" maxlength="60" value=${nama} onInput=${(e) => setNama(e.target.value)} /></label>
      ${namaBerubah && html`<button class="btn solid" style="align-self:flex-end" disabled=${sibuk} onClick=${simpanNama}>Simpan</button>`}
    </div>
    <div class="hasil-baris"><span>Username</span><b class="biasa">${akun.username || '–'}</b></div>
    <div class="hasil-baris"><span>Email</span><b class="biasa" style="word-break:break-all">${akun.email || '–'}</b></div>
    <div class="baris-btn">
      <button class="btn" onClick=${() => setDialog(true)}><${Ikon} nama="gembok" ukuran=${18} />Ganti kata sandi akun</button>
      <button class="btn bahaya" disabled=${sibuk} onClick=${keluar}>Keluar</button>
    </div>
    ${dialog && html`<${DialogSandiAkun} k=${k} onTutup=${() => setDialog(false)} />`}
  </section>`;
}

export function Pengaturan({ k }) {
  const { db } = k;
  const [katBaru, setKatBaru] = useState('');
  const kategori = daftarKategori(db);

  return html`<${Kerangka} k=${k} aktif="pengaturan">
    <${Hero} warna="var(--navy)" label="Pengaturan" judul="Pengaturan" kembali="/" />
    <div class="isi">
      <div class="kolom-2">
        <div class="kolom">
          <${KartuAkun} k=${k} />

          <${KartuTampilan} k=${k} />

          ${k.bisaPasang &&
          html`<section class="kartu kolom"><h2 class="judul-kecil">Pasang aplikasi</h2>
            <p class="bantu">Pasang ke layar utama supaya terbuka seperti aplikasi biasa, dan tetap bisa dipakai tanpa internet.</p>
            <button class="btn solid" onClick=${k.pasang}>Pasang aplikasi</button></section>`}
        </div>

        <div class="kolom">
          <section class="kartu kolom" aria-labelledby="h-kategori">
            <h2 class="judul-kecil" id="h-kategori">Kategori resep</h2>
            ${kategori.map((c) => html`<${BarisKategori} key=${c.id} db=${db} kat=${c} />`)}
            <form class="cari-baris" onSubmit=${(e) => (e.preventDefault(), tambahKategori(db, katBaru), setKatBaru(''))}>
              <input class="input kecil" placeholder="Kategori baru" aria-label="Nama kategori baru" maxlength="30" value=${katBaru} onInput=${(e) => setKatBaru(e.target.value)} />
              <button class="btn solid" type="submit" disabled=${!katBaru.trim()}>Tambah</button>
            </form>
          </section>

          <p class="teks-kecil" style="padding:0 6px">${ambilMerek(db).nama} 1.0 · semua data tersimpan di akun Anda di server.</p>
        </div>
      </div>
    </div>
  <//>`;
}
