// Layar akun sebelum aplikasi terbuka: sambutan dengan tombol Login, Lupa kata sandi,
// dan Buat kata sandi baru (dibuka dari tautan di email).

import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';
import { LogoMerek, NamaMerek } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tampilToast } from '../ui/pesan.js';
import { pergi } from '../ui/router.js';
import { ambilMerek, LOGO_BAWAAN } from '../lib/repo.js';
import { alamatServer, serverTetap, masukAkun, mintaAturUlang, aturSandiBaru, MIN_SANDI } from '../lib/akun.js';

const LATAR_BAWAAN = 'gambar/latar-masuk.jpg';
// Logo bawaan tanpa kotak (ikon aplikasi berlatar hijau tetap dipakai untuk layar utama HP dan tab).
const LOGO_POLOS = 'icons/logo.svg';

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

/**
 * Layar sambutan: foto cemilan, nama aplikasi, dan tombol Login. Formulir masuk (dan lupa
 * kata sandi) muncul dari bawah setelah tombol ditekan. Akun dibuat oleh admin, tidak ada daftar sendiri.
 */
export function LayarAkun({ k }) {
  const { db } = k;
  const merek = ambilMerek(db);
  const sesiHabis = !!(db.pengaturan.akun && db.pengaturan.akun.id);
  const [mode, setMode] = useState(sesiHabis ? 'masuk' : 'sambut'); // sambut | masuk | lupa
  const [login, setLogin] = useState((db.pengaturan.akun && db.pengaturan.akun.username) || '');
  const [sandi, setSandi] = useState('');
  const [galat, setGalat] = useState('');
  const [pesan, setPesan] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const ref = useRef(null);
  const url = alamatServer(db);

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
      k.sinkronSekarang().catch(() => {});
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

  const terbuka = mode !== 'sambut';
  // Foto latar dari admin; tanpa itu memakai foto bawaan (yang wajib mencantumkan pembuatnya).
  const latarSitus = (db.pengaturan.situs && db.pengaturan.situs.latarUrl) || '';
  const [latarGagal, setLatarGagal] = useState(false);
  const latar = latarSitus && !latarGagal ? latarSitus : LATAR_BAWAAN;

  return html`<main class=${'sambut' + (terbuka ? ' terbuka' : '')}>
    <div class="sambut-foto">
      <img src=${latar} alt="" aria-hidden="true" onError=${() => setLatarGagal(true)} />
      ${latar === LATAR_BAWAAN && html`<span class="sambut-kredit">Foto: Stacy Spensley, CC BY 2.0</span>`}
    </div>
    <div class="sambut-isi">
      <header class="sambut-judul">
        <div class="sambut-merek"><${LogoMerek} src=${merek.logo === LOGO_BAWAAN ? LOGO_POLOS : merek.logo} ukuran=${terbuka ? 64 : 88} kelas="polos" /></div>
        <h1><${NamaMerek} nama=${merek.nama} /></h1>
        ${!terbuka && html`<p>Catat eksperimen resep, hitung HPP, dan temukan resep juara Anda.</p>`}
      </header>

      ${!terbuka &&
      html`<div class="sambut-bawah">
        <button class="pil sambut-login" onClick=${() => ganti('masuk')}>Login<span class="ujung"><${Ikon} nama="panah" /></span></button>
      </div>`}

      ${terbuka &&
      html`<section class="lembar-masuk" aria-labelledby="judul-lembar">
        <div class="lembar-kepala">
          <h2 id="judul-lembar">${mode === 'lupa' ? 'Lupa kata sandi' : sesiHabis ? 'Masuk lagi' : 'Login'}</h2>
          <button type="button" class="ikon-btn" aria-label="Tutup" onClick=${() => ganti('sambut')}><${Ikon} nama="tutup" /></button>
        </div>

        ${pesan && html`<div class="info" role="status">${pesan}</div>`}
        ${sesiHabis && mode === 'masuk' && !pesan && html`<p class="bantu">Sesi Anda berakhir. Masuk lagi untuk melanjutkan; data di perangkat ini tetap ada.</p>`}

        ${mode === 'masuk' &&
        html`<form class="kolom" onSubmit=${masuk} style="gap:14px" novalidate>
          <label class="bidang" for="login-akun"><span>Username atau email</span>
            <input id="login-akun" ref=${ref} class="input" autocomplete="username" autocapitalize="off" spellcheck=${false} maxlength="190" value=${login} onInput=${(e) => setLogin(e.target.value)} />
          </label>
          <${IsianSandi} id="sandi-akun" label="Kata sandi" nilai=${sandi} onUbah=${setSandi} autocomplete="current-password" galat=${galat} />
          <button type="button" class="tautan-kecil" onClick=${() => ganti('lupa')}>Lupa password?</button>
          ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
          <button class="pil" type="submit" disabled=${sibuk}>${sibuk ? 'Memeriksa…' : 'Masuk'}<span class="ujung"><${Ikon} nama="panah" /></span></button>
        </form>`}

        ${mode === 'lupa' &&
        html`<form class="kolom" onSubmit=${lupa} style="gap:14px" novalidate>
          <label class="bidang" for="login-lupa"><span>Username atau email</span>
            <input id="login-lupa" ref=${ref} class="input" autocomplete="username" autocapitalize="off" spellcheck=${false} maxlength="190" value=${login} onInput=${(e) => setLogin(e.target.value)} />
            <span class="bantu">Kami kirim tautan untuk membuat kata sandi baru ke email akun Anda.</span>
          </label>
          ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
          <button class="pil" type="submit" disabled=${sibuk}>${sibuk ? 'Mengirim…' : 'Kirim tautan'}<span class="ujung"><${Ikon} nama="kirim" /></span></button>
          <button type="button" class="tautan-kecil" style="align-self:center" onClick=${() => ganti('masuk')}>Kembali ke Login</button>
        </form>`}

        <${PilihServer} db=${db} />
      </section>`}
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
        <h1><${NamaMerek} nama=${merek.nama} /></h1>
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
