// Pengaturan: profil, nama dan logo, keamanan, koneksi Google, kategori, cadangan, dan data.

import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, StatusSinkron, unduhBerkas, LogoMerek, FotoInput } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { Modal, tanya, tampilToast } from '../ui/pesan.js';
import { kompresLogo } from '../ui/gambar.js';
import { tesKoneksi } from '../lib/sync.js';
import { daftarKategori, tambahKategori, pakaiKategori, WARNA_KATEGORI, ambilMerek, simpanMerek, NAMA_APLIKASI_BAWAAN, LOGO_BAWAAN } from '../lib/repo.js';
import { buatKataSandi, cocokKataSandi, validasiKataSandi, tersedia } from '../lib/kunci.js';
import { muatContoh } from '../lib/seed.js';

function BarisKategori({ db, kat }) {
  const [warnaBuka, setWarnaBuka] = useState(false);
  const dipakai = pakaiKategori(db, kat.id);
  return html`<div class="kolom" style="gap:8px">
    <div class="kategori-baris">
      <button class="titik-warna" style=${`--warna:${kat.warna};border:0`} aria-label=${'Ganti warna ' + kat.nama} aria-expanded=${warnaBuka} onClick=${() => setWarnaBuka(!warnaBuka)}></button>
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

/** Nama dan logo aplikasi. Disimpan ke Spreadsheet sehingga ikut tampil di perangkat lain dan di halaman penilai. */
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
    const ya = await tanya({ judul: 'Kembalikan nama dan logo bawaan?', teks: `Nama menjadi "${NAMA_APLIKASI_BAWAAN}" dan logo kembali ke logo bawaan, juga di perangkat lain setelah sinkron.`, ya: 'Kembalikan' });
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
    <p class="bantu">Tampil di halaman masuk, beranda, kode QR, dan halaman penilai, serta ikut ke perangkat lain lewat Spreadsheet. Ikon dan nama di layar utama HP tidak berubah dari sini; caranya ada di README.</p>
  </section>`;
}

const PILIHAN_KUNCI_OTOMATIS = [
  [1, '1 menit tidak dipakai'],
  [5, '5 menit tidak dipakai'],
  [15, '15 menit tidak dipakai'],
  [30, '30 menit tidak dipakai'],
  [60, '1 jam tidak dipakai'],
  [0, 'Hanya saat aplikasi ditutup'],
];

function DialogKataSandi({ mode, k, onTutup }) {
  const { db } = k;
  const [lama, setLama] = useState('');
  const [baru, setBaru] = useState('');
  const [ulang, setUlang] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const perluLama = mode !== 'buat';
  const perluBaru = mode !== 'matikan';
  const judul = { buat: 'Buat kata sandi', ubah: 'Ubah kata sandi', matikan: 'Matikan kata sandi' }[mode];

  const kirim = async (e) => {
    e.preventDefault();
    if (sibuk) return;
    setGalat('');
    if (perluBaru) {
      const salah = validasiKataSandi(baru);
      if (salah) return setGalat(salah);
      if (baru !== ulang) return setGalat('Pengulangan kata sandi tidak sama.');
    }
    setSibuk(true);
    try {
      if (perluLama && !(await cocokKataSandi(lama, db.pengaturan.kunciAplikasi))) {
        setGalat('Kata sandi saat ini salah.');
        return;
      }
      db.aturPengaturan({ kunciAplikasi: perluBaru ? await buatKataSandi(baru) : null });
      k.tandaiAktif();
      tampilToast(mode === 'matikan' ? 'Kata sandi dimatikan.' : mode === 'buat' ? 'Kata sandi dipasang.' : 'Kata sandi diganti.');
      onTutup();
    } catch (err) {
      setGalat(err.message || 'Gagal menyimpan kata sandi.');
    } finally {
      setSibuk(false);
    }
  };

  return html`<${Modal} judul=${judul} onTutup=${onTutup}>
    <form class="kolom" onSubmit=${kirim} style="gap:12px" novalidate>
      ${mode === 'matikan' && html`<p class="bantu" style="font-size:13px;line-height:18px">Aplikasi akan terbuka langsung tanpa halaman masuk di perangkat ini.</p>`}
      ${perluLama && html`<label class="bidang"><span>Kata sandi saat ini</span><input class="input" type="password" autocomplete="current-password" maxlength="100" value=${lama} onInput=${(e) => setLama(e.target.value)} /></label>`}
      ${perluBaru && html`<label class="bidang"><span>${mode === 'ubah' ? 'Kata sandi baru' : 'Kata sandi'}</span><input class="input" type="password" autocomplete="new-password" maxlength="100" value=${baru} onInput=${(e) => setBaru(e.target.value)} /><span class="bantu">Minimal 6 karakter.</span></label>`}
      ${perluBaru && html`<label class="bidang"><span>Ulangi kata sandi</span><input class="input" type="password" autocomplete="new-password" maxlength="100" value=${ulang} onInput=${(e) => setUlang(e.target.value)} /></label>`}
      ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
      <div class="baris-btn">
        <button class="btn abu lebar" type="button" onClick=${onTutup}>Batal</button>
        <button class=${'btn solid lebar' + (mode === 'matikan' ? ' bahaya' : '')} type="submit" disabled=${sibuk}>${sibuk ? 'Memproses…' : mode === 'matikan' ? 'Matikan' : 'Simpan'}</button>
      </div>
    </form>
  <//>`;
}

/** Kata sandi masuk dan kunci otomatis, khusus untuk perangkat ini. */
function KartuKeamanan({ k }) {
  const { db } = k;
  const p = db.pengaturan;
  const aktif = !!p.kunciAplikasi;
  const [dialog, setDialog] = useState('');
  const bisa = tersedia();
  return html`<section class="kartu kolom" aria-labelledby="h-keamanan">
    <h2 class="judul-kecil" id="h-keamanan">Keamanan</h2>
    <p role="status" class=${'status-sinkron ' + (aktif ? 'ok' : '')}><i></i>${aktif ? 'Kata sandi aktif di perangkat ini' : 'Aplikasi terbuka tanpa kata sandi'}</p>
    ${!bisa && html`<p class="peringatan" role="alert">Browser ini hanya mengizinkan kata sandi lewat koneksi aman (HTTPS).</p>`}
    <div class="baris-btn">
      ${aktif
        ? html`<button class="btn solid" onClick=${k.kunciSekarang}><${Ikon} nama="gembok" ukuran=${18} />Kunci sekarang</button>
            <button class="btn" onClick=${() => setDialog('ubah')}>Ubah kata sandi</button>
            <button class="btn bahaya" onClick=${() => setDialog('matikan')}>Matikan</button>`
        : html`<button class="btn solid" onClick=${() => setDialog('buat')} disabled=${!bisa}><${Ikon} nama="gembok" ukuran=${18} />Buat kata sandi</button>`}
    </div>
    ${aktif &&
    html`<label class="bidang"><span>Kunci otomatis</span>
      <select class="pilih kecil" value=${String(p.kunciOtomatisMenit ?? 15)} onChange=${(e) => db.aturPengaturan({ kunciOtomatisMenit: Number(e.target.value) })}>
        ${PILIHAN_KUNCI_OTOMATIS.map(([menit, teks]) => html`<option value=${String(menit)} selected=${(p.kunciOtomatisMenit ?? 15) === menit}>${teks}</option>`)}
      </select>
    </label>`}
    <p class="bantu">Kata sandi hanya mengunci tampilan aplikasi di perangkat ini; tidak ikut ke Spreadsheet atau berkas cadangan. Ini bukan enkripsi, jadi tetap kunci layar HP Anda. Penilai yang membuka kode QR tidak perlu masuk.</p>
    ${dialog && html`<${DialogKataSandi} mode=${dialog} k=${k} onTutup=${() => setDialog('')} />`}
  </section>`;
}

export function Pengaturan({ k }) {
  const { db } = k;
  const p = db.pengaturan;
  const [url, setUrl] = useState(p.scriptUrl || '');
  const [kunci, setKunci] = useState(p.kunci || '');
  const [lihat, setLihat] = useState(false);
  const [uji, setUji] = useState({ jenis: '', teks: '' });
  const [katBaru, setKatBaru] = useState('');
  const kategori = daftarKategori(db);
  const tersambung = !!(p.scriptUrl && p.kunci);
  const berubah = url.trim() !== (p.scriptUrl || '') || kunci.trim() !== (p.kunci || '');

  const simpanKoneksi = () => {
    db.aturPengaturan({ scriptUrl: url.trim(), kunci: kunci.trim() });
    tampilToast('Pengaturan koneksi disimpan.');
  };
  const tes = async () => {
    setUji({ jenis: 'jalan', teks: 'Menguji koneksi…' });
    try {
      await tesKoneksi({ scriptUrl: url.trim(), kunci: kunci.trim() });
      setUji({ jenis: 'ok', teks: 'Terhubung. Alamat dan kunci benar.' });
    } catch (e) {
      setUji({ jenis: 'gagal', teks: e.message || 'Gagal terhubung.' });
    }
  };
  const ekspor = () => {
    const tgl = new Date().toISOString().slice(0, 10);
    unduhBerkas(`cadangan-eksperimen-resep-${tgl}.json`, db.ekspor());
    tampilToast('Cadangan diunduh. Kunci rahasia tidak ikut disimpan.');
  };
  const impor = async (e) => {
    const file = e.target.files && e.target.files[0];
    e.target.value = '';
    if (!file) return;
    const ya = await tanya({ judul: 'Pulihkan dari cadangan?', teks: 'Seluruh data di perangkat ini diganti dengan isi berkas cadangan, lalu dikirim ke Spreadsheet saat sinkron.', ya: 'Pulihkan', bahaya: true });
    if (!ya) return;
    try {
      await db.impor(await file.text());
      tampilToast('Data dipulihkan.');
    } catch (err) {
      tampilToast('Gagal memulihkan: ' + (err.message || 'berkas tidak sah'));
    }
  };
  const contoh = () => {
    if (db.semua('Resep').some((r) => r.nama === 'Brownies Fudgy')) return tampilToast('Data contoh sudah ada.');
    muatContoh(db);
    tampilToast('Data contoh dimuat.');
  };
  const kosongkan = async () => {
    const ya = await tanya({
      judul: 'Kosongkan data di perangkat ini?',
      teks: 'Semua resep, bahan, dan penilaian di perangkat ini dihapus. Data yang sudah ada di Google Spreadsheet tidak ikut terhapus dan akan kembali saat sinkron berikutnya. Unduh cadangan dulu bila ragu.',
      ya: 'Kosongkan',
      bahaya: true,
    });
    if (!ya) return;
    await db.hapusSemua();
    tampilToast('Data perangkat ini dikosongkan.');
  };

  return html`<${Kerangka} k=${k} aktif="pengaturan">
    <${Hero} warna="var(--navy)" label="Pengaturan" judul="Pengaturan" kembali="/" />
    <div class="isi">
      <div class="kolom-2">
        <div class="kolom">
          <section class="kartu kolom" aria-labelledby="h-profil">
            <h2 class="judul-kecil" id="h-profil">Profil</h2>
            <label class="bidang"><span>Nama Anda</span><input class="input" maxlength="40" value=${p.namaPemilik || ''} placeholder="Dipakai untuk sapaan dan nama di penilaian Anda" onInput=${(e) => db.aturPengaturan({ namaPemilik: e.target.value })} /></label>
          </section>

          <${KartuTampilan} k=${k} />

          <section class="kartu kolom" aria-labelledby="h-koneksi">
            <h2 class="judul-kecil" id="h-koneksi">Sambungan ke Google Spreadsheet</h2>
            <p class="bantu">Data disimpan di perangkat ini lebih dulu, lalu dikirim ke Spreadsheet Anda lewat Google Apps Script. Langkah pemasangannya ada di README.</p>
            <label class="bidang"><span>Alamat Web App Apps Script</span><input class="input" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck=${false} placeholder="https://script.google.com/macros/s/…/exec" value=${url} onInput=${(e) => setUrl(e.target.value)} /></label>
            <div class="bidang"><label class="label" for="kunci-rahasia">Kunci rahasia</label>
              <span class="cari-baris">
                <input id="kunci-rahasia" class="input" type=${lihat ? 'text' : 'password'} autocomplete="off" autocapitalize="off" spellcheck=${false} value=${kunci} onInput=${(e) => setKunci(e.target.value)} />
                <button type="button" class="ikon-btn" style="border:1.5px solid var(--garis-input);flex:none" aria-label=${lihat ? 'Sembunyikan kunci' : 'Tampilkan kunci'} aria-pressed=${lihat} onClick=${() => setLihat(!lihat)}><${Ikon} nama="mata" /></button>
              </span>
              <span class="bantu">Sama dengan KUNCI di berkas Code.gs. Disimpan hanya di perangkat ini dan tidak ikut cadangan.</span>
            </div>
            <div class="baris-btn">
              <button class="btn solid" onClick=${simpanKoneksi} disabled=${!berubah}>Simpan</button>
              <button class="btn" onClick=${tes} disabled=${!url.trim() || !kunci.trim()}>Tes koneksi</button>
            </div>
            ${uji.teks && html`<p role="status" class=${'status-sinkron ' + uji.jenis}><i></i>${uji.teks}</p>`}
            <label class="sakelar">
              <span><b>Sinkron otomatis</b><small>Saat aplikasi dibuka, setelah ada perubahan, dan tiap menit.</small></span>
              <input type="checkbox" checked=${p.sinkronOtomatis !== false} onChange=${(e) => db.aturPengaturan({ sinkronOtomatis: e.target.checked })} />
            </label>
            <div class="baris-pisah">
              <${StatusSinkron} k=${k} />
              <button class="btn" disabled=${!tersambung || k.status.sedang || berubah} onClick=${() => k.sinkronSekarang(true)}><${Ikon} nama="sinkron" ukuran=${18} />Sinkron sekarang</button>
            </div>
          </section>

          ${k.bisaPasang &&
          html`<section class="kartu kolom"><h2 class="judul-kecil">Pasang aplikasi</h2>
            <p class="bantu">Pasang ke layar utama supaya terbuka seperti aplikasi biasa, dan tetap bisa dipakai tanpa internet.</p>
            <button class="btn solid" onClick=${k.pasang}>Pasang aplikasi</button></section>`}
        </div>

        <div class="kolom">
          <${KartuKeamanan} k=${k} />

          <section class="kartu kolom" aria-labelledby="h-kategori">
            <h2 class="judul-kecil" id="h-kategori">Kategori resep</h2>
            ${kategori.map((c) => html`<${BarisKategori} key=${c.id} db=${db} kat=${c} />`)}
            <form class="cari-baris" onSubmit=${(e) => (e.preventDefault(), tambahKategori(db, katBaru), setKatBaru(''))}>
              <input class="input kecil" placeholder="Kategori baru" aria-label="Nama kategori baru" maxlength="30" value=${katBaru} onInput=${(e) => setKatBaru(e.target.value)} />
              <button class="btn solid" type="submit" disabled=${!katBaru.trim()}>Tambah</button>
            </form>
          </section>

          <section class="kartu kolom" aria-labelledby="h-data">
            <h2 class="judul-kecil" id="h-data">Cadangan dan data</h2>
            <div class="baris-btn">
              <button class="btn" onClick=${ekspor}><${Ikon} nama="unduh" ukuran=${18} />Unduh cadangan</button>
              <label class="btn" style="cursor:pointer"><${Ikon} nama="unggah" ukuran=${18} />Pulihkan
                <input type="file" accept="application/json,.json" hidden onChange=${impor} /></label>
            </div>
            <div class="baris-btn">
              <button class="btn" onClick=${contoh}>Muat data contoh</button>
              <button class="btn bahaya" onClick=${kosongkan}><${Ikon} nama="sampah" ukuran=${18} />Kosongkan data perangkat ini</button>
            </div>
          </section>

          <p class="teks-kecil" style="padding:0 6px">${ambilMerek(db).nama} 1.0 · data tersimpan di perangkat ini dan disalin ke Spreadsheet Anda sendiri.</p>
        </div>
      </div>
    </div>
  <//>`;
}
