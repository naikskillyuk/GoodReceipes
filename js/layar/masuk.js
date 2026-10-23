// Kunci layar perangkat: dibuka bila pemilik memasang kata sandi perangkat (di luar login akun).
// Penilai lewat kode QR tidak pernah melihatnya.

import { html, useState, useEffect, useRef, useMemo } from '../../vendor/preact-htm.js';
import { LogoMerek } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { Modal, tanya, tampilToast } from '../ui/pesan.js';
import { ambilMerek } from '../lib/repo.js';
import { cocokKataSandi, buatPembatas, tersedia } from '../lib/kunci.js';
import { masukAkun, keluarAkun, alamatServer } from '../lib/akun.js';

function penyimpananAman() {
  try {
    const p = window.localStorage;
    p.getItem('resep-uji');
    return p;
  } catch {
    return { getItem: () => null, setItem() {}, removeItem() {} };
  }
}

/** Jalur darurat bila kata sandi perangkat lupa: buktikan dengan kata sandi akun, atau keluar dari akun. */
function LupaKataSandi({ db, onTutup, onSelesai }) {
  const akun = db.pengaturan.akun || {};
  const [sandi, setSandi] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');

  const pakaiAkun = async (e) => {
    e.preventDefault();
    if (!sandi || sibuk) return;
    setSibuk(true);
    setGalat('');
    try {
      await masukAkun(db, alamatServer(db), { login: akun.username || akun.email || '', kataSandi: sandi });
      db.aturPengaturan({ kunciAplikasi: null });
      tampilToast('Kata sandi perangkat dihapus. Buat yang baru di Pengaturan > Kunci perangkat.');
      onSelesai();
    } catch (err) {
      setGalat(err.message || 'Kata sandi akun tidak diterima.');
    } finally {
      setSibuk(false);
    }
  };

  const keluar = async () => {
    const ya = await tanya({
      judul: 'Keluar dari akun di perangkat ini?',
      teks: 'Data di perangkat ini dan kata sandi perangkat dihapus. Data yang sudah tersinkron tetap aman di akun Anda dan kembali saat Anda masuk lagi.',
      ya: 'Keluar',
      bahaya: true,
    });
    if (!ya) return;
    await keluarAkun(db);
    tampilToast('Anda sudah keluar.');
    onSelesai();
  };

  return html`<${Modal} judul="Lupa kata sandi" onTutup=${onTutup}>
    <form class="kolom" onSubmit=${pakaiAkun} style="gap:10px">
      <p class="bantu" style="font-size:13px;line-height:18px">Masukkan <b>kata sandi akun</b> ${akun.username ? html`<b>${akun.username}</b>` : ''} (yang dipakai saat masuk). Data Anda tetap utuh dan kata sandi perangkat dihapus.</p>
      <label class="bidang"><span>Kata sandi akun</span>
        <input class="input" type="password" autocomplete="current-password" autocapitalize="off" spellcheck=${false} value=${sandi} onInput=${(e) => setSandi(e.target.value)} aria-invalid=${galat ? 'true' : null} />
      </label>
      ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
      <button class="btn solid lebar" type="submit" disabled=${!sandi || sibuk}>${sibuk ? 'Memeriksa…' : 'Hapus kata sandi perangkat'}</button>
    </form>
    <div class="pemisah-atau"><span>atau</span></div>
    <p class="bantu" style="font-size:13px;line-height:18px">Lupa juga kata sandi akun? Keluar dulu, lalu pakai "Lupa kata sandi" di halaman Masuk.</p>
    <button class="btn bahaya lebar" type="button" onClick=${keluar}>Keluar dari akun</button>
  <//>`;
}

export function Masuk({ k, onBuka }) {
  const { db } = k;
  const merek = ambilMerek(db);
  const sapaan = (db.pengaturan.namaPemilik || '').trim();
  const pembatas = useMemo(() => buatPembatas(penyimpananAman()), []);
  const [teks, setTeks] = useState('');
  const [lihat, setLihat] = useState(false);
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [sisa, setSisa] = useState(() => Math.ceil(pembatas.sisaMs() / 1000));
  const [lupa, setLupa] = useState(false);
  const ref = useRef(null);
  const mampu = tersedia();

  useEffect(() => {
    if (!sisa) return;
    const t = setInterval(() => {
      const s = Math.ceil(pembatas.sisaMs() / 1000);
      setSisa(s);
      if (!s) clearInterval(t);
    }, 250);
    return () => clearInterval(t);
  }, [sisa > 0]);

  useEffect(() => {
    if (ref.current && !lupa) ref.current.focus();
  }, [lupa]);

  const kirim = async (e) => {
    e.preventDefault();
    if (sibuk || pembatas.sisaMs() > 0 || !teks) return;
    setSibuk(true);
    setGalat('');
    let cocok = false;
    try {
      cocok = await cocokKataSandi(teks, db.pengaturan.kunciAplikasi);
    } catch {
      cocok = false;
    }
    setSibuk(false);
    if (cocok) {
      pembatas.berhasil();
      setTeks('');
      onBuka();
      return;
    }
    pembatas.gagal();
    setSisa(Math.ceil(pembatas.sisaMs() / 1000));
    setGalat('Kata sandi salah.');
    setTeks('');
    if (ref.current) ref.current.focus();
  };

  return html`<main class="masuk">
    <div class="masuk-kartu">
      <${LogoMerek} src=${merek.logo} ukuran=${84} kelas="besar" />
      <div class="masuk-judul">
        <span class="hero-label">${sapaan ? 'Halo, ' + sapaan : 'Selamat datang'}</span>
        <h1>${merek.nama}</h1>
      </div>
      <form class="kolom" onSubmit=${kirim} style="gap:14px" novalidate>
        ${mampu
          ? html`<div class="bidang">
              <label class="label" for="kata-sandi">Kata sandi</label>
              <span class="cari-baris">
                <input
                  id="kata-sandi"
                  ref=${ref}
                  class="input"
                  type=${lihat ? 'text' : 'password'}
                  autocomplete="current-password"
                  autocapitalize="off"
                  spellcheck=${false}
                  maxlength="100"
                  value=${teks}
                  aria-invalid=${galat ? 'true' : null}
                  aria-describedby="masuk-galat"
                  onInput=${(e) => (setTeks(e.target.value), galat && setGalat(''))}
                />
                <button type="button" class="ikon-btn" style="border:1.5px solid var(--garis-input);flex:none;background:#fff" aria-label=${lihat ? 'Sembunyikan kata sandi' : 'Tampilkan kata sandi'} aria-pressed=${lihat} onClick=${() => setLihat(!lihat)}><${Ikon} nama="mata" /></button>
              </span>
            </div>`
          : html`<p class="peringatan" role="alert"><b>Kata sandi tidak bisa diperiksa di sini.</b>Browser ini hanya mengizinkannya lewat koneksi aman (HTTPS). Buka aplikasi lewat alamat https, atau pakai "Lupa kata sandi".</p>`}
        <p id="masuk-galat" class="galat-teks" role="alert" aria-live="assertive">${galat}${sisa > 0 ? ` Coba lagi dalam ${sisa} detik.` : ''}</p>
        ${mampu && html`<button class="pil" type="submit" disabled=${sibuk || sisa > 0 || !teks}>${sibuk ? 'Memeriksa…' : 'Masuk'}<span class="ujung"><${Ikon} nama="panah" /></span></button>`}
      </form>
      <button class="tautan-hijau" type="button" style="align-self:center" onClick=${() => setLupa(true)}>Lupa kata sandi?</button>
      <p class="teks-kecil" style="text-align:center">Kata sandi hanya mengunci tampilan di perangkat ini.</p>
    </div>
    ${lupa && html`<${LupaKataSandi} db=${db} onTutup=${() => setLupa(false)} onSelesai=${() => (setLupa(false), onBuka())} />`}
  </main>`;
}
