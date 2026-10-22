// Titik masuk aplikasi: memuat data, mengatur sinkronisasi otomatis, dan memilih layar dari alamat.

import { html, render, useState, useEffect, useRef, useMemo, useErrorBoundary } from '../vendor/preact-htm.js';
import { buatDB, penyimpananIndexedDB, penyimpananMemori } from './lib/db.js';
import { buatPenyinkron } from './lib/sync.js';
import { pastikanKategoriAwal, ambilMerek } from './lib/repo.js';
import { buatSesi, sesiMasihBerlaku } from './lib/kunci.js';
import { bacaHash } from './ui/router.js';
import { PesanHost, tampilToast } from './ui/pesan.js';
import { Kosong } from './ui/komponen.js';
import { terapkanMerekDokumen } from './ui/merek.js';
import { Masuk } from './layar/masuk.js';
import { Beranda } from './layar/beranda.js';
import { DaftarResep } from './layar/daftar-resep.js';
import { FormResep } from './layar/form-resep.js';
import { DetailResep } from './layar/detail-resep.js';
import { DetailEksperimen, Bandingkan } from './layar/detail-eksperimen.js';
import { FormEksperimen } from './layar/form-eksperimen.js';
import { DaftarBahan } from './layar/bahan.js';
import { Bagikan } from './layar/bagikan.js';
import { LayarPenilai } from './layar/penilai.js';
import { Ulasan } from './layar/ulasan.js';
import { Pengaturan } from './layar/pengaturan.js';

const SINKRON_TIAP_MS = 60 * 1000;
const PERIKSA_KUNCI_MS = 10 * 1000;

function sessionStorageAman() {
  try {
    return window.sessionStorage;
  } catch {
    return { getItem: () => null, setItem() {}, removeItem() {} };
  }
}

function Layar({ k }) {
  const [a, b, c, d] = k.rute.bagian;
  if (!a) return html`<${Beranda} k=${k} />`;
  if (a === 'nilai' && b) return html`<${LayarPenilai} key=${b} k=${k} token=${b} />`;
  if (a === 'resep') {
    if (!b) return html`<${DaftarResep} k=${k} />`;
    if (b === 'baru') return html`<${FormResep} k=${k} />`;
    if (c === 'ubah') return html`<${FormResep} key=${b} k=${k} id=${b} />`;
    if (c === 'bandingkan') return html`<${Bandingkan} k=${k} id=${b} />`;
    if (c === 'eksperimen' && d === 'baru') return html`<${FormEksperimen} k=${k} idResep=${b} />`;
    return html`<${DetailResep} k=${k} id=${b} tab=${c} />`;
  }
  if (a === 'eksperimen' && b) {
    if (c === 'ubah') return html`<${FormEksperimen} k=${k} idEksperimen=${b} />`;
    if (c === 'bagikan') return html`<${Bagikan} k=${k} id=${b} />`;
    return html`<${DetailEksperimen} k=${k} id=${b} />`;
  }
  if (a === 'bahan') return html`<${DaftarBahan} k=${k} />`;
  if (a === 'ulasan') return html`<${Ulasan} k=${k} />`;
  if (a === 'pengaturan') return html`<${Pengaturan} k=${k} />`;
  return html`<div class="penilai"><div class="isi"><${Kosong} judul="Halaman tidak ditemukan" teks="Alamat ini tidak dikenal."><a class="btn solid" href="#/">Ke Beranda</a><//></div></div>`;
}

function App({ db, penyinkron, peringatan, pasangan }) {
  const [, paksa] = useState(0);
  const [rute, setRute] = useState(() => bacaHash());
  const [status, setStatus] = useState(() => penyinkron.status);
  const [galat, ulangi] = useErrorBoundary((e) => console.error(e));

  // Kunci aplikasi: terbuka selama sesi masih berlaku (dipakai dalam batas waktu diam). Penilai (#/nilai/…) tidak pernah dikunci.
  const sesi = useMemo(() => buatSesi(sessionStorageAman()), []);
  const [terbuka, setTerbuka] = useState(() => !db.pengaturan.kunciAplikasi || sesiMasihBerlaku({ terakhir: sesi.terakhir(), batasMenit: db.pengaturan.kunciOtomatisMenit }));
  const keadaanKunci = useRef({});
  keadaanKunci.current = { terbuka };
  const rutePenilai = rute.bagian[0] === 'nilai';
  const perluMasuk = !!db.pengaturan.kunciAplikasi && !terbuka && !rutePenilai;

  const bukaKunci = () => {
    sesi.sentuh({ paksa: true });
    setTerbuka(true);
  };
  const kunciSekarang = () => {
    sesi.akhiri();
    setTerbuka(false);
    window.scrollTo(0, 0);
  };

  useEffect(() => {
    if (terbuka) sesi.sentuh({ paksa: true });
    const catat = () => {
      if (keadaanKunci.current.terbuka) sesi.sentuh();
    };
    const periksa = () => {
      const p = db.pengaturan;
      if (!keadaanKunci.current.terbuka || !p.kunciAplikasi || bacaHash().bagian[0] === 'nilai') return;
      if (!sesiMasihBerlaku({ terakhir: sesi.terakhir(), batasMenit: p.kunciOtomatisMenit })) setTerbuka(false);
    };
    const saatTampil = () => document.visibilityState === 'visible' && periksa();
    const acara = ['pointerdown', 'keydown', 'touchstart', 'scroll'];
    acara.forEach((a) => window.addEventListener(a, catat, { passive: true, capture: true }));
    document.addEventListener('visibilitychange', saatTampil);
    const jamKunci = setInterval(periksa, PERIKSA_KUNCI_MS);
    return () => {
      acara.forEach((a) => window.removeEventListener(a, catat, { capture: true }));
      document.removeEventListener('visibilitychange', saatTampil);
      clearInterval(jamKunci);
    };
  }, []);

  // Nama dan logo aplikasi di judul dan ikon tab (layar penilai memakai merek dari Spreadsheet, bukan dari perangkat ini).
  const merek = ambilMerek(db);
  useEffect(() => {
    if (!rutePenilai) terapkanMerekDokumen({ nama: merek.nama, logo: merek.logo });
  }, [merek.nama, merek.logo, rutePenilai]);

  useEffect(() => db.ubah(() => paksa((n) => n + 1)), []);
  useEffect(() => penyinkron.ubah(setStatus), []);
  useEffect(() => {
    const berubah = () => {
      setRute(bacaHash());
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', berubah);
    return () => window.removeEventListener('hashchange', berubah);
  }, []);

  const sinkronSekarang = async (tampil = false) => {
    try {
      const r = await penyinkron.sinkronkan();
      if (tampil) tampilToast(r.terkirim || r.diterima || r.foto ? `Tersinkron: ${r.terkirim} dikirim, ${r.diterima} diterima.` : 'Sudah yang terbaru.');
    } catch (e) {
      if (tampil) tampilToast(e.message || 'Sinkronisasi gagal.');
    }
  };

  // Sinkron otomatis: saat dibuka, setelah ada perubahan (jeda 3 detik), tiap menit, saat kembali online/tampil.
  useEffect(() => {
    const otomatis = () => {
      const p = db.pengaturan;
      if (!p.sinkronOtomatis || !p.scriptUrl || !p.kunci) return;
      if (document.visibilityState !== 'visible' || navigator.onLine === false) return;
      if (bacaHash().bagian[0] === 'nilai') return;
      sinkronSekarang(false);
    };
    let tunda = null;
    const lepas = db.ubah(() => {
      if (db.jumlahKotor() === 0) return;
      clearTimeout(tunda);
      tunda = setTimeout(otomatis, 3000);
    });
    const saatTampil = () => {
      if (document.visibilityState === 'visible') otomatis();
      else db.tulis();
    };
    const awal = setTimeout(otomatis, 1500);
    const jam = setInterval(otomatis, SINKRON_TIAP_MS);
    document.addEventListener('visibilitychange', saatTampil);
    window.addEventListener('online', otomatis);
    window.addEventListener('pagehide', () => db.tulis());
    return () => {
      lepas();
      clearTimeout(tunda);
      clearTimeout(awal);
      clearInterval(jam);
      document.removeEventListener('visibilitychange', saatTampil);
      window.removeEventListener('online', otomatis);
    };
  }, []);

  const k = { db, penyinkron, status, rute, sinkronSekarang, bisaPasang: pasangan.bisa(), pasang: pasangan.pasang, kunciSekarang, tandaiAktif: bukaKunci };

  if (galat) {
    return html`<div class="penilai"><div class="isi">
      <${Kosong} judul="Terjadi kesalahan" teks="Data Anda aman di perangkat ini. Coba muat ulang halaman.">
        <div class="baris-btn"><button class="btn solid" onClick=${() => location.reload()}>Muat ulang</button><button class="btn" onClick=${() => (location.hash = '#/', ulangi())}>Ke Beranda</button></div>
      <//>
    </div></div>`;
  }
  return html`
    ${peringatan && html`<div class="peringatan" style="margin:8px;border-radius:16px" role="alert">${peringatan}</div>`}
    ${perluMasuk ? html`<${Masuk} k=${k} onBuka=${bukaKunci} />` : html`<${Layar} k=${k} />`}
    <${PesanHost} />
  `;
}

async function mulai() {
  const akar = document.getElementById('app');
  let db = buatDB(penyimpananIndexedDB());
  let peringatan = '';
  try {
    await db.muat();
  } catch (e) {
    console.error('IndexedDB tidak bisa dipakai', e);
    db = buatDB(penyimpananMemori());
    await db.muat();
    peringatan = 'Penyimpanan permanen di browser ini tidak tersedia (mungkin mode pribadi). Data hanya bertahan selama halaman terbuka. Unduh cadangan secara berkala.';
  }
  if (bacaHash().bagian[0] !== 'nilai') pastikanKategoriAwal(db);
  const tetap = window.APP_CONFIG && window.APP_CONFIG.scriptUrl;
  if (tetap && !db.pengaturan.scriptUrl) db.aturPengaturan({ scriptUrl: tetap });
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});

  let tawaran = null;
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    tawaran = e;
  });
  const pasangan = {
    bisa: () => !!tawaran,
    pasang: async () => {
      if (!tawaran) return;
      tawaran.prompt();
      await tawaran.userChoice.catch(() => {});
      tawaran = null;
    },
  };

  const penyinkron = buatPenyinkron(db);
  render(html`<${App} db=${db} penyinkron=${penyinkron} peringatan=${peringatan} pasangan=${pasangan} />`, akar);
  window.__app = { db, penyinkron };

  if ('serviceWorker' in navigator && (location.protocol === 'https:' || location.hostname === 'localhost')) {
    navigator.serviceWorker.register('sw.js').catch((e) => console.warn('Service worker gagal', e));
  }
}

mulai();
