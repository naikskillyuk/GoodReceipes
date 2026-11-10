// Laporan toko untuk rentang tanggal: ringkasan, pesanan, produk terlaris, pelanggan teratas,
// mutasi stok produk, metode bayar, sumber pesanan, dan jam ramai. Juga ekspor CSV.

import { statusBayar, daftarStokMakanan, normalHp, namaItem, LABEL_METODE, indeksRiwayatHpp, hppPadaWaktu } from './toko.js';

const SEHARI_MS = 24 * 60 * 60 * 1000;

/** Jenis penjualan: menu dari resep = satuan, menu dari paket = paket, selain itu (item di luar menu / menu dihapus) = lain. */
export const JENIS_JUAL = [
  { kunci: 'satuan', label: 'Satuan' },
  { kunci: 'paket', label: 'Paket' },
  { kunci: 'lain', label: 'Lainnya' },
];
export const LABEL_JENIS_JUAL = Object.fromEntries(JENIS_JUAL.map((j) => [j.kunci, j.label]));
function jenisJual(db, idMenu) {
  const m = idMenu ? db.ambil('Menu', idMenu) : null;
  if (!m) return 'lain';
  return m.jenis === 'paket' ? 'paket' : 'satuan';
}
const BATAS_HARIAN = 62; // lebih panjang dari ini, grafik dikelompokkan per bulan

export function awalHari(ts = Date.now()) {
  const d = new Date(ts);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Awal hari berikutnya (batas akhir rentang, tidak termasuk). */
function besok(ts) {
  const d = new Date(awalHari(ts));
  d.setDate(d.getDate() + 1);
  return d.getTime();
}

/** "2026-10-30" <-> awal hari setempat. */
export function keIsoTanggal(ts) {
  const d = new Date(ts);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
export function dariIsoTanggal(teks) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(String(teks || ''));
  if (!m) return NaN;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])).getTime();
}

export const PRESET_RENTANG = [
  { kunci: 'hari-ini', label: 'Hari ini' },
  { kunci: 'kemarin', label: 'Kemarin' },
  { kunci: '7-hari', label: '7 hari' },
  { kunci: '30-hari', label: '30 hari' },
  { kunci: 'bulan-ini', label: 'Bulan ini' },
  { kunci: 'bulan-lalu', label: 'Bulan lalu' },
];

/** Rentang tanggal preset: { dari, sampai } dengan `sampai` = hari terakhir (termasuk), keduanya awal hari. */
export function rentangPreset(kunci, sekarang = Date.now()) {
  const hari = awalHari(sekarang);
  const geser = (n) => {
    const d = new Date(hari);
    d.setDate(d.getDate() + n);
    return d.getTime();
  };
  const d = new Date(hari);
  if (kunci === 'kemarin') return { dari: geser(-1), sampai: geser(-1) };
  if (kunci === '7-hari') return { dari: geser(-6), sampai: hari };
  if (kunci === '30-hari') return { dari: geser(-29), sampai: hari };
  if (kunci === 'bulan-ini') return { dari: new Date(d.getFullYear(), d.getMonth(), 1).getTime(), sampai: hari };
  if (kunci === 'bulan-lalu') return { dari: new Date(d.getFullYear(), d.getMonth() - 1, 1).getTime(), sampai: new Date(d.getFullYear(), d.getMonth(), 0).getTime() };
  return { dari: hari, sampai: hari };
}

/** Pesanan yang dihitung sebagai penjualan: bukan batal dan bukan pesanan online yang belum dibayar. */
const sah = (p) => p.status !== 'batal' && p.status !== 'menunggu';

/** Kunci pelanggan: id pelanggan, lalu nomor WhatsApp, lalu nama. '' = pembeli umum (tanpa nama & nomor). */
function kunciPelanggan(p) {
  if (p.idPelanggan) return p.idPelanggan;
  const hp = normalHp(p.hp || '');
  if (hp) return 'plg_' + hp;
  const nama = String(p.nama || '').trim().toLowerCase();
  return nama ? 'nama:' + nama : '';
}

/** Ember grafik: per hari, atau per bulan bila rentang panjang. */
function buatEmber(dari, sampaiAkhir) {
  const hari = Math.round((sampaiAkhir - dari) / SEHARI_MS);
  const ember = [];
  if (hari <= BATAS_HARIAN) {
    for (let t = dari; t < sampaiAkhir; t = besok(t)) ember.push({ mulai: t, pemasukan: 0, penjualan: 0, pesanan: 0 });
    return { satuan: 'hari', ember };
  }
  const d = new Date(dari);
  let t = new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  while (t < sampaiAkhir) {
    ember.push({ mulai: t, pemasukan: 0, penjualan: 0, pesanan: 0 });
    const x = new Date(t);
    t = new Date(x.getFullYear(), x.getMonth() + 1, 1).getTime();
  }
  return { satuan: 'bulan', ember };
}

/** Penampung HPP dan laba kotor (lihat buatLaporan). */
const labaKosong = () => ({ penjualan: 0, hpp: 0, item: 0, tanpaHpp: { item: 0, penjualan: 0 } });
function tambahLaba(x, { n, bersih, hpp }) {
  if (Number.isFinite(hpp)) {
    x.penjualan += bersih;
    x.hpp += hpp * n;
    x.item += n;
  } else {
    x.tanpaHpp.item += n;
    x.tanpaHpp.penjualan += bersih;
  }
}
function akhiriLaba(x) {
  const laba = x.penjualan - x.hpp;
  return { ...x, laba, marginPersen: x.penjualan > 0 ? (laba / x.penjualan) * 100 : NaN };
}

/**
 * Laporan untuk rentang tanggal [dari, sampai] (keduanya tanggal, `sampai` termasuk).
 * Penjualan = total pesanan sah yang dibuat di rentang ini; pemasukan = pembayaran yang lunas di rentang ini.
 *
 * HPP dan laba kotor (hanya akun dapur yang punya riwayat HPP): tiap item memakai HPP menu yang berlaku saat
 * pesanan dibuat (tabel RiwayatHpp), jadi laporan lama tidak berubah walau harga bahan naik. Nilai item dikurangi
 * bagian diskon promo pesanan (dibagi sesuai nilai item). Item tanpa HPP tercatat (pesanan sebelum riwayat ada,
 * item di luar menu) tidak ikut dihitung dan disebutkan terpisah.
 */
export function buatLaporan(db, { dari, sampai }) {
  const mulai = awalHari(Math.min(dari, sampai));
  const akhir = besok(Math.max(dari, sampai));
  const dalam = (t) => t >= mulai && t < akhir;
  const { satuan, ember } = buatEmber(mulai, akhir);
  const indeks = (t) => {
    for (let i = ember.length - 1; i >= 0; i--) if (t >= ember[i].mulai) return i;
    return 0;
  };

  // Pembayaran lunas di rentang = pemasukan, per metode.
  const perMetode = { tunai: 0, transfer: 0, mayar: 0 };
  const jumlahMetode = { tunai: 0, transfer: 0, mayar: 0 };
  let pemasukan = 0;
  for (const b of db.semua('Pembayaran', (x) => x.status === 'lunas')) {
    const t = b.lunasPada || b.waktu || 0;
    if (!dalam(t)) continue;
    const n = Number(b.jumlah) || 0;
    const m = b.metode in perMetode ? b.metode : 'tunai';
    perMetode[m] += n;
    jumlahMetode[m] += 1;
    pemasukan += n;
    ember[indeks(t)].pemasukan += n;
  }

  const semuaPesanan = db.semua('Pesanan').sort((a, b) => (a.waktu || 0) - (b.waktu || 0));
  const pesanan = semuaPesanan.filter((p) => dalam(p.waktu || 0)).reverse();
  const pesananSah = pesanan.filter(sah);

  // Pesanan pertama tiap pelanggan (sepanjang waktu), untuk menandai pelanggan baru.
  const pertama = new Map();
  for (const p of semuaPesanan) {
    if (!sah(p)) continue;
    const k = kunciPelanggan(p);
    if (k && !pertama.has(k)) pertama.set(k, p.waktu || 0);
  }

  const produk = new Map();
  const perJenis = new Map(JENIS_JUAL.map((j) => [j.kunci, { jenis: j.kunci, label: j.label, item: 0, pesanan: 0, penjualan: 0, laba: labaKosong() }]));
  const riwayatHpp = indeksRiwayatHpp(db);
  const labaTotal = labaKosong();
  const pelanggan = new Map();
  const perSumber = new Map();
  const perJam = Array.from({ length: 24 }, (_, jam) => ({ jam, pesanan: 0, penjualan: 0 }));
  let penjualan = 0;
  let diskon = 0;
  let ongkir = 0;
  let itemTerjual = 0;
  let pembeliUmum = 0;
  const belum = { jumlah: 0, nilai: 0 };

  for (const p of pesananSah) {
    const total = Number(p.total) || 0;
    const t = p.waktu || 0;
    penjualan += total;
    diskon += Number(p.diskon) || 0;
    ongkir += Number(p.ongkir) || 0;
    const e = ember[indeks(t)];
    e.penjualan += total;
    e.pesanan += 1;
    const j = perJam[new Date(t).getHours()];
    j.pesanan += 1;
    j.penjualan += total;
    if (!statusBayar(db, p.id).lunas) {
      belum.jumlah += 1;
      belum.nilai += total;
    }

    const sumber = p.sumber === 'online' ? 'Link pemesanan' : p.sumber === 'manual' ? 'Pesanan manual' + (p.saluran ? ` (${p.saluran})` : '') : 'Kasir';
    const s = perSumber.get(sumber) || { sumber, pesanan: 0, penjualan: 0 };
    s.pesanan += 1;
    s.penjualan += total;
    perSumber.set(sumber, s);

    const jenisDiPesanan = new Set();
    const daftarItem = Array.isArray(p.item) ? p.item : [];
    const nilaiItem = daftarItem.reduce((j, i) => j + (Number(i.jumlah) || 0) * (Number(i.harga) || 0), 0);
    // Bagian nilai item yang tersisa setelah diskon promo pesanan.
    const sisaDiskon = nilaiItem > 0 ? Math.max(0, 1 - (Number(p.diskon) || 0) / nilaiItem) : 1;
    for (const i of daftarItem) {
      const n = Number(i.jumlah) || 0;
      const nilai = n * (Number(i.harga) || 0);
      const kunci = i.idMenu || 'lain:' + String(i.nama || '').toLowerCase();
      const jenis = jenisJual(db, i.idMenu);
      const x = produk.get(kunci) || { idMenu: i.idMenu || '', nama: i.nama || 'Tanpa nama', jenis, jumlah: 0, penjualan: 0, pesanan: 0, laba: labaKosong() };
      x.jumlah += n;
      x.penjualan += nilai;
      x.pesanan += 1;
      const isiLaba = { n, bersih: nilai * sisaDiskon, hpp: hppPadaWaktu(riwayatHpp, i.idMenu, t) };
      tambahLaba(x.laba, isiLaba);
      tambahLaba(labaTotal, isiLaba);
      tambahLaba(perJenis.get(jenis).laba, isiLaba);
      produk.set(kunci, x);
      itemTerjual += n;
      const pj = perJenis.get(jenis);
      pj.item += n;
      pj.penjualan += nilai;
      jenisDiPesanan.add(jenis);
    }
    for (const jenis of jenisDiPesanan) perJenis.get(jenis).pesanan += 1;

    const k = kunciPelanggan(p);
    if (!k) {
      pembeliUmum += 1;
      continue;
    }
    const c = pelanggan.get(k) || { kunci: k, nama: '', hp: '', pesanan: 0, belanja: 0, terakhir: 0, baru: dalam(pertama.get(k) || 0) };
    if (p.nama && !c.nama) c.nama = p.nama;
    if (p.hp && !c.hp) c.hp = normalHp(p.hp);
    c.pesanan += 1;
    c.belanja += total;
    c.terakhir = Math.max(c.terakhir, t);
    pelanggan.set(k, c);
  }
  // Nama dari data pelanggan bila pesanan tidak menyimpan nama.
  for (const c of pelanggan.values()) {
    const plg = db.ambil('Pelanggan', c.kunci);
    if (plg && !c.nama) c.nama = plg.nama || '';
    if (!c.nama) c.nama = c.hp ? '+' + c.hp : 'Tanpa nama';
  }

  // Stok produk: stok awal, masuk (produksi + tambah), terjual, sampling, rusak, koreksi, stok akhir.
  const stok = daftarStokMakanan(db).map(({ resep, stok: sekarang, satuan }) => ({ idResep: resep.id, nama: resep.nama, satuan, awal: 0, produksi: 0, masuk: 0, terjual: 0, sampling: 0, rusak: 0, koreksi: 0, akhir: 0, sekarang }));
  const perResep = new Map(stok.map((s) => [s.idResep, s]));
  for (const m of db.semua('MutasiMakanan')) {
    const s = perResep.get(m.idResep);
    if (!s) continue;
    const t = m.waktu || 0;
    const n = Number(m.jumlah) || 0;
    if (t >= akhir) continue;
    if (t < mulai) {
      s.awal += n;
      continue;
    }
    if (m.jenis === 'jual') s.terjual -= n;
    else if (m.jenis === 'sampling') s.sampling -= n;
    else if (m.jenis === 'rusak') s.rusak -= n;
    else if (m.jenis === 'produksi') s.produksi += n;
    else if (m.jenis === 'masuk') s.masuk += n;
    else s.koreksi += n;
  }
  const bulat = (n) => Math.round(n * 1000) / 1000;
  for (const s of stok) {
    s.akhir = bulat(s.awal + s.produksi + s.masuk - s.terjual - s.sampling - s.rusak + s.koreksi);
    for (const k of ['awal', 'produksi', 'masuk', 'terjual', 'sampling', 'rusak', 'koreksi']) s[k] = bulat(s[k]);
  }

  const jumlahPesanan = pesananSah.length;
  return {
    dari: mulai,
    sampai: besok(Math.max(dari, sampai)) - SEHARI_MS,
    hari: Math.round((akhir - mulai) / SEHARI_MS),
    ringkasan: {
      penjualan,
      pemasukan,
      jumlahPesanan,
      rataRata: jumlahPesanan ? Math.round(penjualan / jumlahPesanan) : 0,
      itemTerjual,
      diskon,
      ongkir,
      batal: pesanan.filter((p) => p.status === 'batal').length,
      menunggu: pesanan.filter((p) => p.status === 'menunggu').length,
      belumBayar: belum,
      pelanggan: pelanggan.size,
      pelangganBaru: [...pelanggan.values()].filter((c) => c.baru).length,
      pembeliUmum,
    },
    grafik: { satuan, ember },
    // ada = perangkat ini punya riwayat HPP (akun dapur) dan ada item yang HPP-nya tercatat.
    laba: { ...akhiriLaba(labaTotal), ada: riwayatHpp.size > 0 && labaTotal.item > 0 },
    pesanan,
    // Penjualan per jenis memakai harga item (sebelum diskon pesanan); "Lainnya" hanya tampil bila ada.
    perJenis: [...perJenis.values()].filter((j) => j.jenis !== 'lain' || j.item > 0).map((j) => ({ ...j, laba: akhiriLaba(j.laba) })),
    produk: [...produk.values()].map((x) => ({ ...x, laba: akhiriLaba(x.laba) })).sort((a, b) => b.jumlah - a.jumlah || b.penjualan - a.penjualan || a.nama.localeCompare(b.nama)),
    pelanggan: [...pelanggan.values()].sort((a, b) => b.belanja - a.belanja || b.pesanan - a.pesanan || a.nama.localeCompare(b.nama)),
    stok: stok.filter((s) => s.awal || s.produksi || s.masuk || s.terjual || s.sampling || s.rusak || s.koreksi || s.sekarang),
    metode: Object.keys(perMetode).map((m) => ({ metode: m, label: m === 'mayar' ? 'Online (Mayar)' : LABEL_METODE[m], jumlah: jumlahMetode[m], nilai: perMetode[m] })),
    sumber: [...perSumber.values()].sort((a, b) => b.penjualan - a.penjualan),
    perJam,
  };
}

// ---------- Saring pesanan per status ----------

/** Pilihan saring pesanan di laporan. 'belum-bayar' = belum lunas (tanpa yang batal). */
export const SARING_STATUS = [
  { kunci: '', label: 'Semua' },
  { kunci: 'menunggu', label: 'Menunggu bayar' },
  { kunci: 'baru', label: 'Baru' },
  { kunci: 'diproses', label: 'Diproses' },
  { kunci: 'siap', label: 'Siap diambil' },
  { kunci: 'selesai', label: 'Selesai' },
  { kunci: 'batal', label: 'Batal' },
  { kunci: 'belum-bayar', label: 'Belum dibayar' },
];

export function saringPesanan(db, daftar, status = '') {
  if (!status) return daftar;
  if (status === 'belum-bayar') return daftar.filter((p) => p.status !== 'batal' && !statusBayar(db, p.id).lunas);
  return daftar.filter((p) => p.status === status);
}

// ---------- CSV ----------

/** Baris (array of array) -> CSV dengan pemisah titik koma (Excel Indonesia) dan BOM supaya huruf tetap benar. */
export function keCsv(baris) {
  const sel = (v) => {
    const t = v === null || v === undefined ? '' : String(v);
    return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  };
  return '﻿' + baris.map((b) => b.map(sel).join(';')).join('\r\n');
}

const tgl = (ts) => (ts ? keIsoTanggal(ts) : '');
const jam = (ts) => {
  if (!ts) return '';
  const d = new Date(ts);
  return String(d.getHours()).padStart(2, '0') + ':' + String(d.getMinutes()).padStart(2, '0');
};
const STATUS = { menunggu: 'Menunggu bayar', baru: 'Baru', diproses: 'Diproses', siap: 'Siap', selesai: 'Selesai', batal: 'Batal' };

/** Tabel laporan siap ekspor CSV (array baris). Pesanan bisa disaring per status. */
export function tabelCsv(db, lap, bagian, { status = '' } = {}) {
  if (bagian === 'pesanan') {
    return [
      ['Nomor', 'Tanggal', 'Jam', 'Pembeli', 'WhatsApp', 'Sumber', 'Status', 'Bayar', 'Item', 'Subtotal', 'Diskon', 'Ongkir', 'Total'],
      ...saringPesanan(db, lap.pesanan, status).map((p) => {
        const s = statusBayar(db, p.id);
        return [
          p.nomor, tgl(p.waktu), jam(p.waktu), p.nama || '', p.hp || '', p.sumber === 'online' ? 'Online' : p.sumber === 'manual' ? 'Manual' : 'Kasir', STATUS[p.status] || p.status,
          s.lunas ? LABEL_METODE[s.bayar.metode] || 'Lunas' : 'Belum',
          (Array.isArray(p.item) ? p.item : []).map((i) => `${i.jumlah}x ${namaItem(i)}`).join(', '),
          Number(p.subtotal) || '', Number(p.diskon) || 0, Number(p.ongkir) || 0, Number(p.total) || 0,
        ];
      }),
    ];
  }
  if (bagian === 'produk') {
    const laba = lap.laba.ada;
    const bulat = (n) => (Number.isFinite(n) ? Math.round(n) : '');
    return [
      ['Peringkat', 'Produk', 'Terjual', 'Jumlah pesanan', 'Penjualan (Rp)', 'Jenis', ...(laba ? ['Penjualan setelah promo (Rp)', 'HPP (Rp)', 'Laba kotor (Rp)', 'Margin (%)', 'Item tanpa HPP'] : [])],
      ...lap.produk.map((x, i) => [
        i + 1, x.nama, x.jumlah, x.pesanan, x.penjualan, LABEL_JENIS_JUAL[x.jenis] || '',
        ...(laba ? (x.laba.item ? [bulat(x.laba.penjualan), bulat(x.laba.hpp), bulat(x.laba.laba), Number.isFinite(x.laba.marginPersen) ? Math.round(x.laba.marginPersen * 10) / 10 : ''] : ['', '', '', '']).concat([x.laba.tanpaHpp.item || '']) : []),
      ]),
    ];
  }
  if (bagian === 'pelanggan') return [['Peringkat', 'Pelanggan', 'WhatsApp', 'Pesanan', 'Belanja (Rp)', 'Terakhir pesan', 'Pelanggan baru'], ...lap.pelanggan.map((c, i) => [i + 1, c.nama, c.hp, c.pesanan, c.belanja, tgl(c.terakhir), c.baru ? 'Ya' : ''])];
  if (bagian === 'stok') return [['Produk', 'Satuan', 'Stok awal', 'Produksi', 'Tambah stok', 'Terjual', 'Sampling', 'Rusak', 'Koreksi', 'Stok akhir', 'Stok sekarang'], ...lap.stok.map((s) => [s.nama, s.satuan, s.awal, s.produksi, s.masuk, s.terjual, s.sampling, s.rusak, s.koreksi, s.akhir, s.sekarang])];
  const r = lap.ringkasan;
  return [
    ['Laporan', `${tgl(lap.dari)} s.d. ${tgl(lap.sampai)}`],
    ['Penjualan (Rp)', r.penjualan],
    ['Pemasukan / uang masuk (Rp)', r.pemasukan],
    ['Jumlah pesanan', r.jumlahPesanan],
    ['Rata-rata per pesanan (Rp)', r.rataRata],
    ['Item terjual', r.itemTerjual],
    ['Diskon (Rp)', r.diskon],
    ['Ongkir (Rp)', r.ongkir],
    ['Belum dibayar (Rp)', r.belumBayar.nilai],
    ...(lap.laba.ada
      ? [
          ['Penjualan ber-HPP setelah promo (Rp)', Math.round(lap.laba.penjualan)],
          ['HPP terjual (Rp, saat pesanan dibuat)', Math.round(lap.laba.hpp)],
          ['Laba kotor (Rp)', Math.round(lap.laba.laba)],
          ['Margin kotor (%)', Math.round(lap.laba.marginPersen * 10) / 10],
          ['Item tanpa HPP tercatat', lap.laba.tanpaHpp.item],
        ]
      : []),
    ['Pesanan batal', r.batal],
    ['Pelanggan', r.pelanggan],
    ['Pelanggan baru', r.pelangganBaru],
    [],
    ['Metode bayar', 'Transaksi', 'Nilai (Rp)'],
    ...lap.metode.map((m) => [m.label, m.jumlah, m.nilai]),
    [],
    ['Jenis penjualan', 'Item terjual', 'Pesanan', 'Penjualan (Rp, sebelum diskon)'],
    ...lap.perJenis.map((j) => [j.label, j.item, j.pesanan, j.penjualan]),
    [],
    ['Sumber pesanan', 'Pesanan', 'Penjualan (Rp)'],
    ...lap.sumber.map((s) => [s.sumber, s.pesanan, s.penjualan]),
    [],
    ['Tanggal', 'Pesanan', 'Penjualan (Rp)', 'Pemasukan (Rp)'],
    ...lap.grafik.ember.map((e) => [lap.grafik.satuan === 'bulan' ? tgl(e.mulai).slice(0, 7) : tgl(e.mulai), e.pesanan, e.penjualan, e.pemasukan]),
  ];
}
