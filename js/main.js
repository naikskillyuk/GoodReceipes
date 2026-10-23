// Titik masuk aplikasi: memuat data, menyimpan setiap perubahan ke server, dan memilih layar dari alamat.

import { html, render, useState, useEffect, useRef, useErrorBoundary } from '../vendor/preact-htm.js';
import { buatDB, penyimpananIndexedDB, penyimpananMemori } from './lib/db.js';
import { buatPenyinkron } from './lib/sync.js';
import { pastikanKategoriAwal, ambilMerek } from './lib/repo.js';
import { bacaHash } from './ui/router.js';
import { PesanHost, tampilToast } from './ui/pesan.js';
import { Kosong } from './ui/komponen.js';
import { terapkanMerekDokumen } from './ui/merek.js';
import { LayarAkun, AturSandi } from './layar/akun.js';
import { CetakResep } from './layar/cetak-resep.js';
import { sudahMasuk, sesiBerakhir } from './lib/akun.js';
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

// Data utama ada di database server. Perangkat hanya menyimpan salinan supaya cepat dan tetap
// terbuka saat sinyal putus; setiap perubahan dikirim ke server sesaat setelah disimpan.
const KIRIM_SETELAH_MS = 1000;
const AMBIL_TIAP_MS = 20 * 1000; // penilaian QR dan perubahan dari perangkat lain
const JEDA_PESAN_GAGAL_MS = 60 * 1000;

function Layar({ k }) {
  const [a, b, c, d] = k.rute.bagian;
  if (!a) return html`<${Beranda} k=${k} />`;
  if (a === 'nilai' && b) return html`<${LayarPenilai} key=${b} k=${k} token=${b} />`;
  if (a === 'resep') {
    if (!b) return html`<${DaftarResep} k=${k} />`;
    if (b === 'baru') return html`<${FormResep} k=${k} />`;
    if (c === 'ubah') return html`<${FormResep} key=${b} k=${k} id=${b} />`;
    if (c === 'bandingkan') return html`<${Bandingkan} k=${k} id=${b} />`;
    if (c === 'cetak') return html`<${CetakResep} k=${k} id=${b} />`;
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

  const rutePenilai = rute.bagian[0] === 'nilai';
  const ruteAturSandi = rute.bagian[0] === 'atur-sandi';
  // Penilai dan tautan atur kata sandi selalu terbuka; selain itu wajib masuk akun.
  const perluAkun = !rutePenilai && !ruteAturSandi && !sudahMasuk(db);

  // Nama dan logo aplikasi di judul dan ikon tab (layar penilai memakai merek dari server, bukan dari perangkat ini).
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
    // Alamat bisa sudah berubah sebelum pendengar ini terpasang (efek berjalan setelah tampilan pertama).
    setRute(bacaHash());
    return () => window.removeEventListener('hashchange', berubah);
  }, []);

  // Simpan ke server. Gagal (mis. sinyal putus) diberitahukan paling sering sekali per menit,
  // dan perubahan tetap menunggu di perangkat sampai berhasil terkirim.
  const gagalTerakhir = useRef({ waktu: 0 }).current;
  const sinkronSekarang = async () => {
    try {
      return await penyinkron.sinkronkan();
    } catch (e) {
      if (e.kode === 'SESI') {
        sesiBerakhir(db);
        tampilToast(e.message);
      } else if (db.jumlahKotor() > 0 && Date.now() - gagalTerakhir.waktu > JEDA_PESAN_GAGAL_MS) {
        gagalTerakhir.waktu = Date.now();
        tampilToast('Belum tersimpan ke server (periksa internet). Akan dicoba lagi otomatis.');
      }
      throw e;
    }
  };

  // Kirim sesaat setelah ada perubahan; ambil data baru saat dibuka, berkala, dan saat kembali online/tampil.
  useEffect(() => {
    const otomatis = () => {
      const p = db.pengaturan;
      if (!p.scriptUrl || !p.kunci) return;
      if (navigator.onLine === false) return;
      if (bacaHash().bagian[0] === 'nilai') return;
      sinkronSekarang().catch(() => {});
    };
    let tunda = null;
    const lepas = db.ubah(() => {
      if (db.jumlahKotor() === 0) return;
      clearTimeout(tunda);
      tunda = setTimeout(otomatis, KIRIM_SETELAH_MS);
    });
    const saatTampil = () => {
      if (document.visibilityState === 'visible') otomatis();
      else db.tulis();
    };
    const awal = setTimeout(otomatis, 1500);
    const jam = setInterval(otomatis, AMBIL_TIAP_MS);
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

  const k = { db, penyinkron, status, rute, sinkronSekarang, bisaPasang: pasangan.bisa(), pasang: pasangan.pasang };

  if (galat) {
    return html`<div class="penilai"><div class="isi">
      <${Kosong} judul="Terjadi kesalahan" teks="Data Anda aman. Coba muat ulang halaman.">
        <div class="baris-btn"><button class="btn solid" onClick=${() => location.reload()}>Muat ulang</button><button class="btn" onClick=${() => (location.hash = '#/', ulangi())}>Ke Beranda</button></div>
      <//>
    </div></div>`;
  }
  return html`
    ${peringatan && html`<div class="peringatan" style="margin:8px;border-radius:16px" role="alert">${peringatan}</div>`}
    ${ruteAturSandi
      ? html`<${AturSandi} k=${k} />`
      : perluAkun
        ? html`<${LayarAkun} k=${k} />`
        : html`<${Layar} k=${k} />`}
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
    peringatan = 'Browser ini tidak menyimpan salinan di perangkat (mungkin mode pribadi). Data tetap tersimpan ke server selama ada internet.';
  }
  if (bacaHash().bagian[0] !== 'nilai') pastikanKategoriAwal(db);
  const tetap = window.APP_CONFIG && window.APP_CONFIG.scriptUrl;
  // Alamat server dari config.js berlaku selama belum masuk (alamat manual hanya untuk uji).
  if (tetap && db.pengaturan.scriptUrl !== tetap && !(db.pengaturan.akun && db.pengaturan.kunci)) db.aturPengaturan({ scriptUrl: tetap });
  // Versi tanpa akun menyimpan kunci rahasia server di sini; tanpa data akun, itu bukan sesi yang sah.
  if (db.pengaturan.kunci && !(db.pengaturan.akun && db.pengaturan.akun.id)) db.aturPengaturan({ kunci: '' });
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
