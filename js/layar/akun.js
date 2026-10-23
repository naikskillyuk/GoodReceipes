// Layar akun sebelum aplikasi terbuka: Masuk, Daftar, Lupa kata sandi,
// dan Buat kata sandi baru (dibuka dari tautan di email).

import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import { LogoMerek } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tampilToast } from '../ui/pesan.js';
import { pergi } from '../ui/router.js';
import { ambilMerek } from '../lib/repo.js';
import { alamatServer, serverTetap, masukAkun, daftarAkun, mintaAturUlang, aturSandiBaru, MIN_SANDI } from '../lib/akun.js';

function IsianSandi({ id, label, nilai, onUbah, autocomplete, inputRef, galat }) {
  const [lihat, setLihat] = useState(false);
  return html`<div class="bidang">
    <label class="label" for=${id}>${label}</label>
    <span class="cari-baris">
      <input id=${id} ref=${inputRef} class="input" type=${lihat ? 'text' : 'password'} autocomplete=${autocomplete} autocapitalize="off" spellcheck=${false} maxlength="100" value=${nilai} aria-invalid=${galat ? 'true' : null} onInput=${(e) => onUbah(e.target.value)} />
      <button type="button" class="ikon-btn" style="border:1.5px solid var(--garis-input);flex:none;background:#fff" aria-label=${lihat ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} aria-pressed=${lihat} onClick=${() => setLihat(!lihat)}><${Ikon} nama="mata" /></button>
    </span>
  </div>`;
}

/**
 * Pilihan server, HANYA untuk uji: tidak tampil sama sekali bila scriptUrl di config.js diisi
 * (versi yang dijual), sehingga pembeli tidak pernah melihatnya.
 */
function PilihServer({ db }) {
  if (serverTetap()) return null;
  return html`<${PilihServerUji} db=${db} />`;
}

function PilihServerUji({ db }) {
  const [buka, setBuka] = useState(!alamatServer(db));
  const [url, setUrl] = useState(alamatServer(db));
  const sekarang = alamatServer(db);
  let host = '';
  try {
    host = sekarang ? new URL(sekarang).host : '';
  } catch {
    host = sekarang;
  }
  if (!buka) {
    return html`<p class="teks-kecil" style="text-align:center">Mode uji · server: ${host} · <button type="button" class="tautan-hijau" style="font-size:inherit" onClick=${() => setBuka(true)}>ganti</button></p>`;
  }
  return html`<form class="kolom" style="gap:8px" onSubmit=${(e) => (e.preventDefault(), db.aturPengaturan({ scriptUrl: url.trim() }), setBuka(false))}>
    <label class="bidang"><span>Alamat server (API)</span>
      <input class="input" inputmode="url" autocapitalize="off" autocomplete="off" spellcheck=${false} placeholder="https://server-anda.com/api" value=${url} onInput=${(e) => setUrl(e.target.value)} />
    </label>
    <button class="btn" type="submit" disabled=${!url.trim()}>Pakai server ini</button>
  </form>`;
}

export function LayarAkun({ k }) {
  const { db } = k;
  const merek = ambilMerek(db);
  const [mode, setMode] = useState('masuk'); // masuk | daftar | lupa
  const [login, setLogin] = useState((db.pengaturan.akun && db.pengaturan.akun.username) || '');
  const [sandi, setSandi] = useState('');
  const [nama, setNama] = useState('');
  const [email, setEmail] = useState('');
  const [galat, setGalat] = useState('');
  const [pesan, setPesan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ref = useRef(null);
  const url = alamatServer(db);
  const sesiHabis = !!(db.pengaturan.akun && db.pengaturan.akun.id);

  useEffect(() => {
    if (ref.current) ref.current.focus();
  }, [mode]);

  const ganti = (m) => {
    setMode(m);
    setGalat('');
    setPesan('');
  };

  const jalankan = async (fn) => {
    if (sibuk) return;
    if (!url) {
      setGalat('Alamat server belum diisi.');
      return;
    }
    setSibuk(true);
    setGalat('');
    try {
      await fn();
    } catch (e) {
      setGalat(e.message || 'Gagal. Coba lagi.');
    } finally {
      setSibuk(false);
    }
  };

  const masuk = (e) => {
    e.preventDefault();
    if (!login.trim() || !sandi) return setGalat('Isi username/email dan kata sandi.');
    jalankan(async () => {
      const p = await masukAkun(db, url, { login, kataSandi: sandi });
      setSandi('');
      tampilToast(`Selamat datang, ${p.nama}.`);
      k.sinkronSekarang(false);
    });
  };

  const daftar = (e) => {
    e.preventDefault();
    if (nama.trim().length < 2) return setGalat('Isi nama Anda.');
    if (!/^\S+@\S+\.\S+$/.test(email.trim())) return setGalat('Alamat email tidak valid.');
    jalankan(async () => {
      const j = await daftarAkun(url, { nama, email });
      setLogin(email.trim());
      setMode('masuk');
      setPesan(j.pesan + ' Periksa juga folder Spam.');
    });
  };

  const lupa = (e) => {
    e.preventDefault();
    if (!login.trim()) return setGalat('Isi username atau email akun Anda.');
    jalankan(async () => {
      const j = await mintaAturUlang(url, login);
      setMode('masuk');
      setPesan(j.pesan);
    });
  };

  return html`<main class="masuk">
    <div class="masuk-kartu">
      <${LogoMerek} src=${merek.logo} ukuran=${84} kelas="besar" />
      <div class="masuk-judul">
        <span class="hero-label">${mode === 'daftar' ? 'Buat akun baru' : mode === 'lupa' ? 'Lupa kata sandi' : sesiHabis ? 'Masuk lagi' : 'Selamat datang'}</span>
        <h1>${merek.nama}</h1>
      </div>

      ${pesan && html`<div class="info" role="status">${pesan}</div>`}
      ${sesiHabis && mode === 'masuk' && !pesan && html`<p class="bantu" style="text-align:center">Sesi Anda berakhir. Masuk lagi untuk melanjutkan; data di perangkat ini tetap ada.</p>`}

      ${mode === 'masuk' &&
      html`<form class="kolom" onSubmit=${masuk} style="gap:14px" novalidate>
        <label class="bidang" for="login-akun"><span>Username atau email</span>
          <input id="login-akun" ref=${ref} class="input" autocomplete="username" autocapitalize="off" spellcheck=${false} maxlength="190" value=${login} onInput=${(e) => setLogin(e.target.value)} />
        </label>
        <${IsianSandi} id="sandi-akun" label="Kata sandi" nilai=${sandi} onUbah=${setSandi} autocomplete="current-password" galat=${galat} />
        ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
        <button class="pil" type="submit" disabled=${sibuk}>${sibuk ? 'Memeriksa…' : 'Masuk'}<span class="ujung"><${Ikon} nama="panah" /></span></button>
        <div class="baris-pisah" style="justify-content:space-between">
          <button type="button" class="tautan-hijau" onClick=${() => ganti('lupa')}>Lupa kata sandi?</button>
          <button type="button" class="tautan-hijau" onClick=${() => ganti('daftar')}>Daftar akun baru</button>
        </div>
      </form>`}

      ${mode === 'daftar' &&
      html`<form class="kolom" onSubmit=${daftar} style="gap:14px" novalidate>
        <label class="bidang" for="nama-daftar"><span>Nama Anda</span>
          <input id="nama-daftar" ref=${ref} class="input" autocomplete="name" maxlength="60" value=${nama} onInput=${(e) => setNama(e.target.value)} />
        </label>
        <label class="bidang" for="email-daftar"><span>Email</span>
          <input id="email-daftar" class="input" type="email" inputmode="email" autocomplete="email" autocapitalize="off" spellcheck=${false} maxlength="190" value=${email} onInput=${(e) => setEmail(e.target.value)} />
          <span class="bantu">Username dan kata sandi akan dikirim ke email ini.</span>
        </label>
        ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
        <button class="pil" type="submit" disabled=${sibuk}>${sibuk ? 'Mendaftarkan…' : 'Daftar'}<span class="ujung"><${Ikon} nama="kirim" /></span></button>
        <button type="button" class="tautan-hijau" style="align-self:center" onClick=${() => ganti('masuk')}>Sudah punya akun? Masuk</button>
      </form>`}

      ${mode === 'lupa' &&
      html`<form class="kolom" onSubmit=${lupa} style="gap:14px" novalidate>
        <label class="bidang" for="login-lupa"><span>Username atau email</span>
          <input id="login-lupa" ref=${ref} class="input" autocomplete="username" autocapitalize="off" spellcheck=${false} maxlength="190" value=${login} onInput=${(e) => setLogin(e.target.value)} />
          <span class="bantu">Kami kirim tautan untuk membuat kata sandi baru ke email akun Anda.</span>
        </label>
        ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
        <button class="pil" type="submit" disabled=${sibuk}>${sibuk ? 'Mengirim…' : 'Kirim tautan'}<span class="ujung"><${Ikon} nama="kirim" /></span></button>
        <button type="button" class="tautan-hijau" style="align-self:center" onClick=${() => ganti('masuk')}>Kembali ke Masuk</button>
      </form>`}

      <${PilihServer} db=${db} />
    </div>
  </main>`;
}

/** #/atur-sandi?email=…&t=… dari email "Buat kata sandi baru". */
export function AturSandi({ k }) {
  const { db } = k;
  const merek = ambilMerek(db);
  const { email = '', t = '' } = k.rute.kueri;
  const [baru, setBaru] = useState('');
  const [ulang, setUlang] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [selesai, setSelesai] = useState('');

  const kirim = async (e) => {
    e.preventDefault();
    if (baru.length < MIN_SANDI) return setGalat(`Kata sandi minimal ${MIN_SANDI} karakter.`);
    if (baru !== ulang) return setGalat('Kedua kata sandi tidak sama.');
    setSibuk(true);
    setGalat('');
    try {
      const j = await aturSandiBaru(alamatServer(db), { email, tokenReset: t, kataSandi: baru });
      setSelesai(j.pesan || 'Kata sandi baru tersimpan.');
    } catch (err) {
      setGalat(err.message || 'Gagal menyimpan kata sandi.');
    } finally {
      setSibuk(false);
    }
  };

  return html`<main class="masuk">
    <div class="masuk-kartu">
      <${LogoMerek} src=${merek.logo} ukuran=${84} kelas="besar" />
      <div class="masuk-judul">
        <span class="hero-label">Buat kata sandi baru</span>
        <h1>${merek.nama}</h1>
      </div>
      ${!email || !t
        ? html`<p class="peringatan" role="alert"><b>Tautan tidak lengkap.</b>Buka tautan langsung dari email, atau minta tautan baru lewat "Lupa kata sandi".</p>`
        : selesai
          ? html`<div class="info" role="status">${selesai}</div>
              <button class="pil" onClick=${() => (db.pengaturan.kunci && db.aturPengaturan({ kunci: '' }), pergi('/', { ganti: true }))}>Ke halaman Masuk<span class="ujung"><${Ikon} nama="panah" /></span></button>`
          : html`<form class="kolom" onSubmit=${kirim} style="gap:14px" novalidate>
              <p class="bantu">Untuk akun <b>${email}</b>.</p>
              <${IsianSandi} id="sandi-baru" label=${`Kata sandi baru (minimal ${MIN_SANDI} karakter)`} nilai=${baru} onUbah=${setBaru} autocomplete="new-password" />
              <${IsianSandi} id="sandi-ulang" label="Ulangi kata sandi baru" nilai=${ulang} onUbah=${setUlang} autocomplete="new-password" />
              ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
              <button class="pil" type="submit" disabled=${sibuk}>${sibuk ? 'Menyimpan…' : 'Simpan kata sandi'}<span class="ujung"><${Ikon} nama="centang" /></span></button>
            </form>`}
    </div>
  </main>`;
}
