// Layar penilai (tanpa login) dan formulir nilai yang dipakai juga oleh pemilik.

import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { Hero, Foto, Kosong, LogoMerek } from '../ui/komponen.js';
import { terapkanMerekDokumen } from '../ui/merek.js';
import { NAMA_APLIKASI_BAWAAN, LOGO_BAWAAN } from '../lib/repo.js';
import { Ikon } from '../ui/ikon.js';
import { ASPEK } from '../lib/skor.js';
import { ambilInfoNilai, kirimNilai } from '../lib/sync.js';

export const NILAI_AWAL = () => ({ rasa: 5, tekstur: 5, tampilan: 5, aroma: 5, minatBeli: 5 });

/** Lima penggeser 1-10. Nilai baru dianggap terisi setelah disentuh, agar angka bawaan tidak ikut terhitung. */
export function PenggeserNilai({ nilai, disentuh, onUbah }) {
  return html`<div class="kolom" style="gap:18px">
    ${ASPEK.map((a) => {
      const sudah = !!disentuh[a.kunci];
      return html`<div class="geser" key=${a.kunci}>
        <div class="geser-kepala">
          <label class="label" for=${'geser-' + a.kunci}>${a.label}</label>
          <output for=${'geser-' + a.kunci} aria-live="off">${sudah ? nilai[a.kunci] : '–'}</output>
        </div>
        <input
          id=${'geser-' + a.kunci}
          type="range"
          min="1"
          max="10"
          step="1"
          value=${nilai[a.kunci]}
          aria-valuetext=${sudah ? `${nilai[a.kunci]} dari 10` : 'belum diisi'}
          onPointerDown=${() => onUbah(a.kunci, nilai[a.kunci])}
          onKeyDown=${() => onUbah(a.kunci, nilai[a.kunci])}
          onInput=${(e) => onUbah(a.kunci, Number(e.target.value))}
        />
        <div class="geser-skala" aria-hidden="true"><span>1 · kurang</span><span>10 · sangat baik</span></div>
      </div>`;
    })}
  </div>`;
}

/** Alamat Apps Script yang boleh dipakai penilai: milik Google, atau localhost untuk uji. */
export function scriptUrlAman(u) {
  try {
    const url = new URL(u);
    if (url.protocol === 'https:' && (url.hostname === 'script.google.com' || url.hostname.endsWith('.googleusercontent.com'))) return true;
    return (url.hostname === 'localhost' || url.hostname === '127.0.0.1') && (url.protocol === 'http:' || url.protocol === 'https:');
  } catch {
    return false;
  }
}

export function LayarPenilai({ k, token }) {
  const tetap = (window.APP_CONFIG && window.APP_CONFIG.scriptUrl) || '';
  const dariTautan = k.rute.kueri.u || '';
  const scriptUrl = tetap || (scriptUrlAman(dariTautan) ? dariTautan : '') || k.db.pengaturan.scriptUrl || '';

  const [tahap, setTahap] = useState('memuat'); // memuat | siap | terkirim | galat
  const [info, setInfo] = useState(null);
  const [pesan, setPesan] = useState('');
  const [nama, setNama] = useState('');
  const [komentar, setKomentar] = useState('');
  const [nilai, setNilai] = useState(NILAI_AWAL);
  const [disentuh, setDisentuh] = useState({});
  const [mengirim, setMengirim] = useState(false);
  const [galatForm, setGalatForm] = useState('');

  useEffect(() => {
    let batal = false;
    if (!scriptUrl) {
      setPesan('Tautan ini tidak lengkap. Minta pemilik resep mengirim ulang kode QR-nya.');
      setTahap('galat');
      return;
    }
    ambilInfoNilai(scriptUrl, token)
      .then((d) => {
        if (batal) return;
        setInfo(d);
        setTahap('siap');
      })
      .catch((e) => {
        if (batal) return;
        setPesan(e.message || 'Tautan tidak bisa dibuka.');
        setTahap('galat');
      });
    return () => {
      batal = true;
    };
  }, [token, scriptUrl]);

  const ubah = (kunci, v) => {
    setNilai((n) => ({ ...n, [kunci]: v }));
    setDisentuh((d) => (d[kunci] ? d : { ...d, [kunci]: true }));
    setGalatForm('');
  };

  const kirim = async (e) => {
    e.preventDefault();
    if (mengirim) return;
    if (info.wajibNama && !nama.trim()) {
      setGalatForm('Nama wajib diisi.');
      return;
    }
    if (ASPEK.some((a) => !disentuh[a.kunci])) {
      setGalatForm('Geser kelima penggeser dulu supaya nilainya tercatat.');
      return;
    }
    setMengirim(true);
    try {
      await kirimNilai(scriptUrl, token, { nama: nama.trim(), komentar: komentar.trim(), ...nilai });
      setTahap('terkirim');
    } catch (err) {
      setGalatForm(err.message || 'Gagal mengirim. Coba lagi.');
    } finally {
      setMengirim(false);
    }
  };

  const ulang = () => {
    setNama('');
    setKomentar('');
    setNilai(NILAI_AWAL());
    setDisentuh({});
    setGalatForm('');
    setTahap('siap');
    window.scrollTo(0, 0);
  };

  // Merek dari Spreadsheet pemilik resep (bukan dari perangkat penilai).
  const namaMerek = (info && info.namaAplikasi) || NAMA_APLIKASI_BAWAAN;
  const logoMerek = (info && info.logoUrl) || LOGO_BAWAAN;
  useEffect(() => {
    terapkanMerekDokumen({ nama: info ? `Beri penilaian · ${namaMerek}` : namaMerek, logo: logoMerek });
  }, [info, namaMerek, logoMerek]);

  const judul = info ? `${info.namaResep}` : 'Penilaian';
  return html`<div class="penilai">
    <${Hero} terang label=${html`<span class="merek-hero"><${LogoMerek} src=${logoMerek} ukuran=${32} /><span>${namaMerek}</span></span>`} judul=${tahap === 'memuat' ? 'Memuat…' : judul} panjang=${true}>
      ${info && html`<div style="margin-top:8px;font-weight:700">Beri penilaian · Eksperimen ${info.nomor}</div>`}
    <//>
    <div class="isi">
      ${tahap === 'memuat' && html`<p role="status">Membuka penilaian…</p>`}
      ${tahap === 'galat' && html`<${Kosong} judul="Penilaian tidak bisa dibuka" teks=${pesan} />`}
      ${tahap === 'siap' && !info.terima && html`<${Kosong} judul="Penilaian sudah ditutup" teks="Pemilik resep tidak lagi menerima penilaian untuk eksperimen ini. Terima kasih sudah mampir." />`}
      ${tahap === 'siap' && info.terima &&
      html`<form class="kolom" onSubmit=${kirim} novalidate style="gap:20px">
        ${info.fotoUrl && html`<div class="foto-penilai" style="display:flex;align-items:center;justify-content:center;overflow:hidden"><${Foto} src=${info.fotoUrl} alt=${'Foto ' + info.namaResep} /></div>`}
        <p style="color:var(--ink2);line-height:1.5">Cicipi, lalu nilai dari 1 sampai 10. Jawaban jujur paling membantu pemilik resep.</p>
        <label class="bidang" for="nama-penilai">
          <span>Nama Anda ${info.wajibNama ? '' : html`<small class="teks-kecil">(boleh dikosongkan)</small>`}</span>
          <input id="nama-penilai" class="input" maxlength="60" autocomplete="name" value=${nama} onInput=${(e) => setNama(e.target.value)} />
        </label>
        <${PenggeserNilai} nilai=${nilai} disentuh=${disentuh} onUbah=${ubah} />
        <label class="bidang" for="komentar-penilai">
          <span>Komentar atau saran <small class="teks-kecil">(boleh dikosongkan)</small></span>
          <textarea id="komentar-penilai" class="area" rows="4" maxlength="1000" placeholder="Apa yang enak? Apa yang kurang?" value=${komentar} onInput=${(e) => setKomentar(e.target.value)}></textarea>
        </label>
        ${galatForm && html`<p class="galat-teks" role="alert">${galatForm}</p>`}
        <button class="pil" type="submit" disabled=${mengirim}>${mengirim ? 'Mengirim…' : 'Kirim penilaian'}<span class="ujung"><${Ikon} nama="kirim" /></span></button>
      </form>`}
      ${tahap === 'terkirim' &&
      html`<div class="kosong" role="status">
        <span class="skor-bulat" style="background:var(--hijau);color:#fff"><${Ikon} nama="centang" ukuran=${34} /></span>
        <h3>Terima kasih!</h3>
        <p>Penilaian Anda sudah terkirim ke pemilik resep.</p>
        <button class="btn" onClick=${ulang}>Isi untuk orang lain</button>
      </div>`}
    </div>
  </div>`;
}
