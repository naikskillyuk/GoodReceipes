// Struk pesanan: data struk (toko, item, total, pembayaran) dan versi teks untuk WhatsApp / printer kasir.

import { ambilToko, statusBayar, LABEL_METODE, LABEL_AMBIL, caraAmbil, tampilHp } from './toko.js';
import { ambilMerek } from './repo.js';
import { angka, tanggal } from './util.js';

const jamMenit = (ts) => {
  const d = new Date(ts || 0);
  return String(d.getHours()).padStart(2, '0') + '.' + String(d.getMinutes()).padStart(2, '0');
};

/** Tanggal + jam: "30 Okt 2026 14.05". */
export const waktuStruk = (ts) => (ts ? `${tanggal(ts)} ${jamMenit(ts)}` : '');

/** Semua isi struk satu pesanan. null bila pesanan tidak ada. */
export function dataStruk(db, idPesanan) {
  const p = db.ambil('Pesanan', idPesanan);
  if (!p) return null;
  const toko = ambilToko(db);
  const merek = ambilMerek(db);
  const item = (Array.isArray(p.item) ? p.item : []).map((i) => {
    const jumlah = Number(i.jumlah) || 0;
    const harga = Number(i.harga) || 0;
    return { nama: i.nama || 'Item', opsi: Array.isArray(i.opsi) ? i.opsi : [], jumlah, harga, total: jumlah * harga };
  });
  const s = statusBayar(db, p.id);
  const bayar = s.bayar;
  const cara = caraAmbil(p);
  return {
    toko: { nama: toko.namaToko || merek.nama, alamat: toko.alamatToko || '', wa: toko.waToko ? tampilHp(toko.waToko) : '', logo: merek.logo || '' },
    nomor: p.nomor,
    waktu: p.waktu || 0,
    kasir: p.sumber === 'online' ? 'Pesanan online' : p.oleh || '',
    pembeli: p.nama || '',
    hp: p.hp || '',
    item,
    jumlahItem: item.reduce((j, i) => j + i.jumlah, 0),
    subtotal: Number(p.subtotal) || item.reduce((j, i) => j + i.total, 0),
    diskon: Number(p.diskon) || 0,
    kodePromo: p.kodePromo || '',
    ongkir: Number(p.ongkir) || 0,
    total: Number(p.total) || 0,
    lunas: s.lunas,
    metode: bayar ? (bayar.metode === 'mayar' ? 'Online (Mayar)' : LABEL_METODE[bayar.metode] || 'Tunai') : '',
    diterima: bayar && bayar.metode === 'tunai' ? Number(bayar.diterima) || 0 : 0,
    kembalian: bayar && bayar.metode === 'tunai' ? Number(bayar.kembalian) || 0 : 0,
    lunasPada: bayar ? bayar.lunasPada || bayar.waktu || 0 : 0,
    caraAmbil: p.caraAmbil && LABEL_AMBIL[cara] ? LABEL_AMBIL[cara] : '',
    jadwal: p.jadwal > 0 ? p.jadwal : 0,
    alamat: p.alamat || '',
    catatan: p.catatan || '',
    batal: p.status === 'batal',
  };
}

const uang = (n) => (n < 0 ? '-' : '') + angka(Math.abs(Math.round(n)));

/** Pecah teks panjang menjadi baris selebar `lebar` (pisah di spasi bila bisa). */
function pecah(teks, lebar) {
  const hasil = [];
  for (const paragraf of String(teks).split('\n')) {
    let baris = '';
    for (const kata of paragraf.split(/\s+/).filter(Boolean)) {
      let k = kata;
      while (k.length > lebar) {
        if (baris) hasil.push(baris), (baris = '');
        hasil.push(k.slice(0, lebar));
        k = k.slice(lebar);
      }
      if (!baris) baris = k;
      else if (baris.length + 1 + k.length <= lebar) baris += ' ' + k;
      else hasil.push(baris), (baris = k);
    }
    if (baris) hasil.push(baris);
  }
  return hasil;
}

/**
 * Struk sebagai teks rata kolom (lebar 32 karakter = kertas 58 mm, 42-48 = 80 mm).
 * Dipakai untuk WhatsApp (dibungkus blok monospace) dan bagikan / salin.
 */
export function teksStruk(d, lebar = 32) {
  const garis = '-'.repeat(lebar);
  const tengah = (t) => pecah(t, lebar).map((b) => ' '.repeat(Math.max(0, Math.floor((lebar - b.length) / 2))) + b);
  const kiriKanan = (kiri, kanan) => {
    const ruang = lebar - kanan.length - 1;
    const baris = pecah(kiri, Math.max(8, ruang));
    const akhir = baris.pop() || '';
    return [...baris, akhir + ' '.repeat(Math.max(1, lebar - akhir.length - kanan.length)) + kanan];
  };
  const info = (label, isi) => pecah(`${label.padEnd(7)}: ${isi}`, lebar);
  const out = [];
  out.push(...tengah(d.toko.nama.toUpperCase()));
  if (d.toko.alamat) out.push(...tengah(d.toko.alamat));
  if (d.toko.wa) out.push(...tengah('WA ' + d.toko.wa));
  out.push(garis);
  out.push(...info('No', '#' + d.nomor));
  out.push(...info('Tanggal', waktuStruk(d.waktu)));
  if (d.kasir) out.push(...info('Kasir', d.kasir));
  if (d.pembeli) out.push(...info('Pembeli', d.pembeli));
  out.push(garis);
  for (const i of d.item) {
    out.push(...pecah(i.nama, lebar));
    if (i.opsi.length) out.push(...pecah('+ ' + i.opsi.join(', '), lebar - 2).map((b) => '  ' + b));
    out.push(...kiriKanan(`  ${angka(i.jumlah)} x ${uang(i.harga)}`, uang(i.total)));
  }
  out.push(garis);
  if (d.diskon > 0 || d.ongkir > 0) out.push(...kiriKanan(`Subtotal (${angka(d.jumlahItem)} item)`, uang(d.subtotal)));
  if (d.diskon > 0) out.push(...kiriKanan('Diskon' + (d.kodePromo ? ` (${d.kodePromo})` : ''), uang(-d.diskon)));
  if (d.ongkir > 0) out.push(...kiriKanan('Ongkir', uang(d.ongkir)));
  out.push(...kiriKanan('TOTAL', 'Rp ' + uang(d.total)));
  if (d.lunas) {
    out.push(...kiriKanan(d.metode, uang(d.diterima || d.total)));
    if (d.diterima) out.push(...kiriKanan('Kembali', uang(d.kembalian)));
  }
  out.push(garis);
  if (d.caraAmbil) out.push(...info('Ambil', d.caraAmbil + (d.jadwal ? ', ' + waktuStruk(d.jadwal) : '')));
  if (d.alamat) out.push(...info('Alamat', d.alamat));
  if (d.catatan) out.push(...info('Catatan', d.catatan));
  out.push(...tengah(d.batal ? '*** PESANAN DIBATALKAN ***' : d.lunas ? `LUNAS ${waktuStruk(d.lunasPada)}` : '*** BELUM DIBAYAR ***'));
  out.push('', ...tengah('Terima kasih!'));
  return out.join('\n');
}

/** Pesan WhatsApp berisi struk (blok monospace supaya kolom tetap rata). */
export function pesanStrukWa(d) {
  return `Halo${d.pembeli ? ' ' + d.pembeli : ''}, berikut struk pesanan #${d.nomor} dari ${d.toko.nama}:\n\n\`\`\`\n${teksStruk(d, 32)}\n\`\`\``;
}
