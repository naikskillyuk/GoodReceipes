// Sinkronisasi dengan server Laravel + Supabase.
//
// Aturan: data utama ada di perangkat. Saat sinkron, baris yang berubah dikirim,
// lalu baris baru dari server (mis. penilaian dari QR) diterima. Jika dua perangkat
// mengubah baris yang sama, yang `diubah`-nya paling baru menang.

import { NAMA_TABEL, keBaris, dariBaris, KOLOM_FOTO } from './schema.js';

export class GalatSinkron extends Error {}

const TUMPANG_TINDIH_MS = 2 * 60 * 1000; // ambil ulang 2 menit ke belakang, aman untuk selisih jam
const BARIS_PER_KIRIM = 600;

/** POST ke Web App. `text/plain` dipakai agar browser tidak mengirim preflight CORS. */
export async function panggilApi(scriptUrl, isi, { fetchFn = globalThis.fetch, batasWaktu = 45000 } = {}) {
  if (!scriptUrl) throw new GalatSinkron('Alamat server belum diisi.');
  const kendali = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = kendali ? setTimeout(() => kendali.abort(), batasWaktu) : null;
  let res;
  try {
    res = await fetchFn(scriptUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(isi),
      redirect: 'follow',
      signal: kendali?.signal,
    });
  } catch (e) {
    throw new GalatSinkron(e?.name === 'AbortError' ? 'Server tidak menjawab (waktu habis).' : 'Tidak bisa terhubung. Periksa internet dan alamat server.');
  } finally {
    if (timer) clearTimeout(timer);
  }
  let data;
  try {
    data = await res.json();
  } catch {
    throw new GalatSinkron('Jawaban server tidak dikenali. Pastikan alamat server benar (berakhiran /api).');
  }
  if (!data || data.ok !== true) {
    const galat = new GalatSinkron(data?.galat || 'Permintaan ditolak server.');
    galat.kode = data?.kode;
    throw galat;
  }
  return data;
}

export function tesKoneksi(pengaturan, opsi) {
  return panggilApi(pengaturan.scriptUrl, { aksi: 'ping', kunci: pengaturan.kunci }, opsi);
}

/** Untuk layar penilai (tanpa login). */
export function ambilInfoNilai(scriptUrl, token, opsi) {
  return panggilApi(scriptUrl, { aksi: 'infoNilai', token }, opsi);
}

export function kirimNilai(scriptUrl, token, isi, opsi) {
  return panggilApi(scriptUrl, { aksi: 'kirimNilai', token, ...isi }, opsi);
}

function bagi(daftar, ukuran) {
  const hasil = [];
  for (let i = 0; i < daftar.length; i += ukuran) hasil.push(daftar.slice(i, i + ukuran));
  return hasil;
}

/** Penyinkron dengan status yang bisa didengarkan layar. */
export function buatPenyinkron(db, { fetchFn } = {}) {
  const status = { sedang: false, galat: '', berhasilTerakhir: 0, ringkas: null };
  const pendengar = new Set();
  let berjalan = null;

  const atur = (patch) => {
    Object.assign(status, patch);
    pendengar.forEach((fn) => fn({ ...status }));
  };

  async function unggahFoto(p) {
    let jumlah = 0;
    for (const [tabel, pasangan] of Object.entries(KOLOM_FOTO)) {
      for (const baris of db.semua(tabel)) {
        for (const [lokal, url] of pasangan) {
          const data = baris[lokal];
          if (!data || baris[url] || !String(data).startsWith('data:')) continue;
          const cocok = /^data:([^;]+);base64,(.+)$/s.exec(data);
          if (!cocok) continue;
          const hasil = await panggilApi(
            p.scriptUrl,
            { aksi: 'unggahFoto', kunci: p.kunci, nama: `${tabel}_${baris.id}`, mime: cocok[1], base64: cocok[2] },
            { fetchFn },
          );
          const saatIni = db.ambil(tabel, baris.id);
          // Hanya simpan bila foto belum diganti selama proses unggah.
          if (saatIni && saatIni[lokal] === data) {
            db.simpan(tabel, { ...saatIni, [url]: hasil.url });
            jumlah += 1;
          }
        }
      }
    }
    return jumlah;
  }

  async function jalankan() {
    const p = db.pengaturan;
    if (!p.scriptUrl || !p.kunci) throw new GalatSinkron('Alamat server dan kunci belum diisi.');
    const foto = await unggahFoto(p);

    const kotor = db.ambilKotor();
    const rata = [];
    for (const [tabel, baris] of Object.entries(kotor)) for (const r of baris) rata.push([tabel, r]);

    const kelompok = rata.length ? bagi(rata, BARIS_PER_KIRIM) : [[]];
    const sejak = db.meta.sinkronTerakhir ? Math.max(0, db.meta.sinkronTerakhir - TUMPANG_TINDIH_MS) : 0;
    let terkirim = 0;
    let diterima = 0;
    let waktuServer = db.meta.sinkronTerakhir;

    for (const isi of kelompok) {
      const baris = {};
      for (const [tabel, r] of isi) (baris[tabel] ||= []).push(keBaris(tabel, r));
      const jawab = await panggilApi(p.scriptUrl, { aksi: 'sinkron', kunci: p.kunci, sejak, baris }, { fetchFn });
      for (const [tabel, r] of isi) db.tandaiBersih(tabel, r.id, r.diubah);
      terkirim += isi.length;
      for (const tabel of NAMA_TABEL) {
        const masuk = (jawab.baris?.[tabel] || []).map((m) => dariBaris(tabel, m));
        diterima += db.terapkanDariServer(tabel, masuk);
      }
      waktuServer = jawab.waktuServer;
    }
    db.aturMeta({ sinkronTerakhir: waktuServer });
    return { terkirim, diterima, foto };
  }

  return {
    get status() {
      return { ...status };
    },
    ubah(fn) {
      pendengar.add(fn);
      return () => pendengar.delete(fn);
    },
    /** Hanya satu sinkron berjalan pada satu waktu. */
    sinkronkan() {
      if (berjalan) return berjalan;
      atur({ sedang: true, galat: '' });
      berjalan = jalankan()
        .then((ringkas) => {
          atur({ sedang: false, galat: '', berhasilTerakhir: Date.now(), ringkas });
          return ringkas;
        })
        .catch((e) => {
          atur({ sedang: false, galat: e.message || 'Sinkronisasi gagal.' });
          throw e;
        })
        .finally(() => {
          berjalan = null;
        });
      return berjalan;
    },
  };
}
