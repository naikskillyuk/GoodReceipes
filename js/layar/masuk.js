// Layar Masuk: dibuka bila pemilik memasang kata sandi. Penilai lewat kode QR tidak pernah melihatnya.

import { html, useState, useEffect, useRef, useMemo } from '../../vendor/preact-htm.js';
import { LogoMerek } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { Modal, tanya, tampilToast } from '../ui/pesan.js';
import { ambilMerek } from '../lib/repo.js';
import { cocokKataSandi, buatPembatas, tersedia } from '../lib/kunci.js';
import { tesKoneksi } from '../lib/sync.js';

function penyimpananAman() {
  try {
    const p = window.localStorage;
    p.getItem('resep-uji');
    return p;
  } catch {
    return { getItem: () => null, setItem() {}, removeItem() {} };
  }
}

/** Jalur darurat bila kata sandi lupa: buktikan dengan kunci Apps Script, atau kosongkan data perangkat ini. */
function LupaKataSandi({ db, onTutup, onSelesai }) {
  const p = db.pengaturan;
  const scriptUrl = p.scriptUrl || (window.APP_CONFIG && window.APP_CONFIG.scriptUrl) || '';
  const [kunci, setKunci] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const [galat, setGalat] = useState('');

  const pakaiKunci = async (e) => {
    e.preventDefault();
    if (!kunci.trim() || sibuk) return;
    setSibuk(true);
    setGalat('');
    try {
      await tesKoneksi({ scriptUrl, kunci: kunci.trim() });
      db.aturPengaturan({ kunciAplikasi: null });
      tampilToast('Kata sandi dihapus. Buat yang baru di Pengaturan > Keamanan.');
      onSelesai();
    } catch (err) {
      setGalat(err.message || 'Kunci tidak diterima.');
    } finally {
      setSibuk(false);
    }
  };

  const kosongkan = async () => {
    const ya = await tanya({
      judul: 'Kosongkan data perangkat ini?',
      teks: 'Semua resep di perangkat ini dihapus, begitu juga kata sandi dan kunci Apps Script yang tersimpan di sini. Data di Google Spreadsheet tetap aman dan bisa dipulihkan setelah Anda memasukkan kunci itu lagi di Pengaturan.',
      ya: 'Kosongkan',
      bahaya: true,
    });
    if (!ya) return;
    await db.hapusSemua({ hapusKataSandi: true });
    tampilToast('Data perangkat ini dikosongkan.');
    onSelesai();
  };

  return html`<${Modal} judul="Lupa kata sandi" onTutup=${onTutup}>
    ${scriptUrl
      ? html`<form class="kolom" onSubmit=${pakaiKunci} style="gap:10px">
          <p class="bantu" style="font-size:13px;line-height:18px">Buktikan bahwa Anda pemilik dengan <b>kunci rahasia</b> yang sama dengan KUNCI di Code.gs. Data Anda tetap utuh dan kata sandi dihapus.</p>
          <label class="bidang"><span>Kunci rahasia Apps Script</span>
            <input class="input" type="password" autocomplete="off" autocapitalize="off" spellcheck=${false} value=${kunci} onInput=${(e) => setKunci(e.target.value)} aria-invalid=${galat ? 'true' : null} />
          </label>
          ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
          <button class="btn solid lebar" type="submit" disabled=${!kunci.trim() || sibuk}>${sibuk ? 'Memeriksa…' : 'Hapus kata sandi'}</button>
        </form>`
      : html`<p class="bantu" style="font-size:13px;line-height:18px">Perangkat ini belum tersambung ke Google, jadi tidak ada kunci untuk membuktikan pemilik.</p>`}
    <div class="pemisah-atau"><span>atau</span></div>
    <p class="bantu" style="font-size:13px;line-height:18px">Mulai dari awal di perangkat ini. Data yang sudah sempat dikirim ke Spreadsheet tidak ikut hilang.</p>
    <button class="btn bahaya lebar" type="button" onClick=${kosongkan}>Kosongkan data perangkat ini</button>
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
