// Tiruan backend Laravel di memori, dengan protokol /api yang sama (dipakai dev-server dan tes).
// Akun uji: masuk dengan login apa pun dan kata sandi = `kunci`; token sesinya juga `kunci` (akun dapur).
// Login yang diawali "toko" masuk sebagai akun toko (token `kunci` + "-toko"), memakai data yang sama.
// Mayar ditiru: link bayar menunjuk ke /#/tiruan-mayar, dan aksi `tiruanLunas` berperan sebagai webhook.

import crypto from 'node:crypto';
import { NAMA_TABEL, TABEL_TOKO_BACA, TABEL_TOKO_TULIS } from '../js/lib/schema.js';

const MAKS_BARIS_PER_PERMINTAAN = 3000;
const MAKS_PANJANG_FOTO = 6 * 1024 * 1024; // karakter base64
const MAKS_NILAI_PER_EKSPERIMEN = 500;
const ASPEK = ['rasa', 'tekstur', 'tampilan', 'aroma', 'minatBeli'];
const MIME_FOTO = ['image/jpeg', 'image/png', 'image/webp'];
const GALAT_TOKEN = 'Tautan penilaian tidak ditemukan atau sudah tidak berlaku.';
const GALAT_SESI = { ok: false, kode: 'SESI', galat: 'Sesi Anda sudah berakhir. Silakan masuk lagi.' };

/** Kosong -> bawaan; selain itu true/1/"true"/"ya" berarti ya. */
function benar(v, bawaan) {
  if (v === '' || v === undefined || v === null) return bawaan;
  return v === true || v === 1 || /^(true|1|ya)$/i.test(String(v));
}

/** Teks dari orang lain: potong dan buang karakter kontrol. */
function bersihkan(v, maks) {
  return String(v == null ? '' : v).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maks);
}

function bacaPanduan(v) {
  let o = {};
  try {
    o = typeof v === 'string' ? JSON.parse(v || '{}') : v || {};
  } catch {
    o = {};
  }
  const keluar = {};
  for (const k of ['umum', ...ASPEK]) {
    if (o && typeof o[k] === 'string' && o[k].trim()) keluar[k] = o[k].trim().slice(0, k === 'umum' ? 500 : 200);
  }
  return keluar;
}

/**
 * @param {{tabel: Object, foto: Object}} keadaan  data tiruan (bisa disimpan sebagai JSON)
 * @param {{kunci?: string, setelahUbah?: Function}} opsi
 */
export function buatServer(keadaan = { tabel: {}, foto: {} }, opsi = {}) {
  keadaan.tabel ||= {};
  keadaan.foto ||= {};
  const kunci = opsi.kunci || 'kunci-dev';
  const kabari = () => opsi.setelahUbah && opsi.setelahUbah(keadaan);
  const tabel = (nama) => (keadaan.tabel[nama] ||= {});
  const semua = (nama) => Object.values(tabel(nama));

  /** Baris hanya menimpa bila `diubah`-nya lebih baru daripada yang tersimpan. */
  function tulis(nama, daftar) {
    const t = tabel(nama);
    for (const r of daftar) {
      const id = String(r.id == null ? '' : r.id);
      if (!id || id.length > 100) continue;
      if (t[id] && !(Number(r.diubah) > Number(t[id].diubah))) continue;
      t[id] = { ...t[id], ...r };
    }
  }

  function sinkron(req, toko = false) {
    const masuk = req.baris || {};
    const jumlah = NAMA_TABEL.reduce((n, nama) => n + (masuk[nama] || []).length, 0);
    if (jumlah > MAKS_BARIS_PER_PERMINTAAN) return { ok: false, galat: 'Terlalu banyak baris dalam satu permintaan.' };
    for (const nama of toko ? TABEL_TOKO_TULIS : NAMA_TABEL) if (masuk[nama] && masuk[nama].length) tulis(nama, masuk[nama]);
    const sejak = Number(req.sejak) || 0;
    const baris = {};
    for (const nama of toko ? TABEL_TOKO_BACA : NAMA_TABEL) {
      const baru = semua(nama).filter((r) => Number(r.diubah) > sejak);
      if (baru.length) baris[nama] = baru;
    }
    kabari();
    return { ok: true, waktuServer: Date.now(), baris };
  }

  function unggahFoto(req) {
    const mime = String(req.mime || '');
    if (!MIME_FOTO.includes(mime)) return { ok: false, galat: 'Jenis gambar tidak didukung.' };
    const b64 = String(req.base64 || '');
    if (!b64 || b64.length > MAKS_PANJANG_FOTO) return { ok: false, galat: 'Ukuran foto tidak valid.' };
    const dasar = String(req.nama || 'foto').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80);
    const id = `${dasar}_${crypto.randomBytes(8).toString('hex')}`;
    keadaan.foto[id] = { mime, base64: b64 };
    kabari();
    return { ok: true, url: `/foto/${id}` };
  }

  function eksperimenDariToken(token) {
    const t = typeof token === 'string' ? token : '';
    if (t.length < 10 || t.length > 100) return null;
    return semua('Eksperimen').find((e) => !benar(e.dihapus, false) && e.tokenNilai === t) || null;
  }

  function infoNilai(req) {
    const e = eksperimenDariToken(req.token);
    if (!e) return { ok: false, galat: GALAT_TOKEN };
    const resep = semua('Resep').find((r) => r.id === e.idResep && !benar(r.dihapus, false));
    const merek = semua('Setelan').find((r) => r.id === 'stl_merek' && !benar(r.dihapus, false));
    return {
      ok: true,
      namaResep: resep ? String(resep.nama) : 'Resep',
      nomor: Number(e.nomor) || 0,
      fotoUrl: String(e.fotoHasilUrl || ''),
      terima: benar(e.terimaNilai, true),
      wajibNama: benar(e.wajibNama, false),
      namaAplikasi: merek ? String(merek.namaAplikasi || '') : '',
      logoUrl: merek ? String(merek.logoUrl || '') : '',
      panduan: bacaPanduan(e.panduanNilai),
      catatanChef: String(e.catatanChef || '').trim().slice(0, 1000),
    };
  }

  function kirimNilai(req) {
    const e = eksperimenDariToken(req.token);
    if (!e) return { ok: false, galat: GALAT_TOKEN };
    if (!benar(e.terimaNilai, true)) return { ok: false, galat: 'Penilaian untuk eksperimen ini sudah ditutup.' };
    const nama = bersihkan(req.nama, 60);
    if (benar(e.wajibNama, false) && !nama) return { ok: false, galat: 'Nama wajib diisi.' };
    const nilai = {};
    for (const a of ASPEK) {
      const n = Number(req[a]);
      if (!(n >= 1 && n <= 10) || Math.round(n) !== n) return { ok: false, galat: 'Nilai harus bilangan bulat 1 sampai 10.' };
      nilai[a] = n;
    }
    if (semua('Penilaian').filter((p) => p.idEksperimen === e.id).length >= MAKS_NILAI_PER_EKSPERIMEN) {
      return { ok: false, galat: 'Batas jumlah penilaian tercapai.' };
    }
    const sekarang = Date.now();
    const id = 'nil_' + crypto.randomBytes(7).toString('hex');
    tabel('Penilaian')[id] = { id, idEksperimen: e.id, namaPenilai: nama, ...nilai, komentar: bersihkan(req.komentar, 1000), waktu: sekarang, dariPemilik: false, diubah: sekarang, dihapus: false };
    kabari();
    return { ok: true };
  }

  const pengguna = (req, login = 'chef@uji.test') => ({ id: 1, nama: req.nama || 'Chef Uji', username: 'chefuji', email: login.includes('@') ? login : 'chef@uji.test', peran: 'dapur', idData: 1 });
  const penggunaToko = () => ({ id: 2, nama: 'Kasir Uji', username: 'tokouji', email: '', peran: 'toko', idData: 1 });
  const kunciToko = kunci + '-toko';

  // ---------- Penjualan (tiruan Penjualan.php) ----------
  const hidup = (nama, saring = () => true) => semua(nama).filter((r) => !benar(r.dihapus, false) && saring(r));
  const angka = (v) => Number(v) || 0;
  const simpanBaris = (nama, r) => {
    const t = tabel(nama);
    const lama = t[r.id];
    t[r.id] = { ...(lama || {}), ...r, dihapus: false, diubah: Math.max(Date.now(), lama ? Number(lama.diubah) + 1 : 0) };
    return t[r.id];
  };
  const idAcak = (awalan) => awalan + '_' + Date.now().toString(36) + crypto.randomBytes(4).toString('hex');
  const bacaItem = (v) => {
    try {
      return typeof v === 'string' ? JSON.parse(v || '[]') : v || [];
    } catch {
      return [];
    }
  };
  function stokMakanan() {
    const peta = {};
    for (const m of hidup('MutasiMakanan')) peta[m.idResep] = (peta[m.idResep] || 0) + angka(m.jumlah);
    return peta;
  }
  function isiMenu(m) {
    if (m.jenis === 'paket') {
      const h = {};
      for (const i of hidup('IsiPaket', (x) => x.idPaket === m.idRef)) h[i.idResep] = (h[i.idResep] || 0) + (angka(i.jumlah) || 1);
      return h;
    }
    return m.idRef ? { [m.idRef]: 1 } : {};
  }
  function kebutuhan(item) {
    const butuh = {};
    for (const it of item) {
      const m = tabel('Menu')[it.idMenu];
      if (!m) continue;
      for (const [r, per] of Object.entries(isiMenu(m))) butuh[r] = (butuh[r] || 0) + per * angka(it.jumlah);
    }
    return butuh;
  }
  function potongStok(p) {
    for (const [idResep, jumlah] of Object.entries(kebutuhan(bacaItem(p.item)))) {
      const id = `mmk_${p.id}_${idResep}`;
      if (tabel('MutasiMakanan')[id]) continue;
      simpanBaris('MutasiMakanan', { id, idResep, jumlah: -jumlah, jenis: 'jual', idRef: p.id, catatan: 'Pesanan #' + p.nomor, waktu: Date.now() });
    }
  }
  // Tanpa token = toko utama di halaman depan (toko pertama yang sudah mengaktifkan toko online).
  const tokoDariToken = (token) => {
    if (!token) return hidup('Setelan', (s) => s.id === 'stl_toko' && !!s.tokenToko)[0] || null;
    return typeof token === 'string' && token.length >= 10 ? hidup('Setelan', (s) => s.tokenToko === token)[0] || null : null;
  };
  function nomorPesanan() {
    const d = new Date();
    return String(d.getDate()).padStart(2, '0') + String(d.getMonth() + 1).padStart(2, '0') + '-' + crypto.randomBytes(2).toString('hex').toUpperCase().slice(0, 3);
  }
  function tandaiLunas(idPembayaran) {
    const b = tabel('Pembayaran')[idPembayaran];
    if (!b || b.status === 'lunas') return;
    simpanBaris('Pembayaran', { ...b, status: 'lunas', lunasPada: Date.now() });
    const p = tabel('Pesanan')[b.idPesanan];
    if (p && !benar(p.dihapus, false) && p.sumber === 'online' && p.status === 'menunggu') {
      simpanBaris('Pesanan', { ...p, status: 'baru', riwayat: JSON.stringify([...bacaItem(p.riwayat), { status: 'baru', waktu: Date.now() }]) });
      potongStok(p);
    }
  }
  function buatLinkMayar(jumlah) {
    const id = 'mayar-' + crypto.randomBytes(6).toString('hex');
    keadaan.mayarTagihan ||= {};
    keadaan.mayarTagihan[id] = { jumlah, status: 'unpaid' };
    return { id, link: `/#/tiruan-mayar/${id}` };
  }
  // Pembayaran manual (rekening + foto QRIS) dan Mayar, sama seperti Penjualan.php.
  function bayarManual(s) {
    let r = s.rekening;
    if (typeof r === 'string') {
      try {
        r = JSON.parse(r);
      } catch {
        r = [];
      }
    }
    const rekening = (Array.isArray(r) ? r : []).filter((x) => x && String(x.bank || '').trim() && String(x.nomor || '').trim()).slice(0, 5)
      .map((x) => ({ bank: String(x.bank).trim(), nomor: String(x.nomor).trim(), atasNama: String(x.atasNama || '').trim() }));
    const qris = String(s.qrisUrl || '');
    return { rekening, qrisUrl: /^(https?:|\/foto\/)/.test(qris) ? qris : '' };
  }
  const adaBayarManual = (m) => m.rekening.length > 0 || !!m.qrisUrl;
  const pakaiMayar = (s) => benar(s.pakaiMayar, false) && !!(keadaan.mayar && keadaan.mayar.aktif);
  function testimoniTampil() {
    return hidup('Testimoni', (t) => benar(t.tampil, false) && String(t.isi || '').trim())
      .sort((a, b) => angka(b.waktu) - angka(a.waktu))
      .slice(0, 30)
      .map((t) => ({ nama: String(t.nama || ''), isi: String(t.isi || ''), bintang: Math.max(1, Math.min(5, angka(t.bintang) || 5)), waktu: angka(t.waktu) }));
  }
  function kirimTestimoni(req) {
    const s = tokoDariToken(req.token);
    const p = s && tabel('Pesanan')[req.idPesanan];
    if (!p || benar(p.dihapus, false) || p.sumber !== 'online') return { ok: false, galat: 'Pesanan tidak ditemukan.' };
    const lunas = hidup('Pembayaran', (b) => b.idPesanan === p.id && b.status === 'lunas').length > 0;
    if (!lunas || p.status === 'batal') return { ok: false, galat: 'Testimoni bisa dikirim setelah pesanan dibayar.' };
    const isi = bersihkan(req.isi, 500);
    if (isi.length < 5) return { ok: false, galat: 'Tulis testimoni minimal beberapa kata.' };
    const id = 'tst_' + String(p.id).toLowerCase().replace(/[^a-z0-9]/g, '').slice(-40);
    const lama = tabel('Testimoni')[id];
    if (lama && !benar(lama.dihapus, false) && benar(lama.tampil, false)) return { ok: false, galat: 'Testimoni untuk pesanan ini sudah tayang. Terima kasih!' };
    const bintang = Math.max(1, Math.min(5, Math.floor(Number(req.bintang)) || 5));
    simpanBaris('Testimoni', { id, nama: bersihkan(req.nama, 60) || p.nama, isi, bintang, idPesanan: p.id, tampil: false, sumber: 'pembeli', waktu: Date.now() });
    kabari();
    return { ok: true, pesan: 'Terima kasih! Testimoni Anda akan tampil setelah dicek toko.' };
  }
  // Diskon produk, sama seperti Penjualan::hargaJual.
  const nominal = (m) => m.diskonJenis === 'nominal';
  function diskonMenu(m) {
    const d = nominal(m) ? Math.max(0, Math.min(angka(m.harga), Math.round(angka(m.diskon)))) : Math.max(0, Math.min(90, angka(m.diskon)));
    return d && (!angka(m.diskonSampai) || Date.now() <= angka(m.diskonSampai)) ? d : 0;
  }
  function opsiMenu(m) {
    let o = m.opsi;
    if (typeof o === 'string') {
      try {
        o = JSON.parse(o);
      } catch {
        o = [];
      }
    }
    const lihat = new Set();
    return (Array.isArray(o) ? o : [])
      .map((x) => ({ nama: String((x && x.nama) || '').trim().slice(0, 40), harga: Math.max(0, Math.round(Number(x && x.harga) || 0)) }))
      .filter((x) => x.nama && !lihat.has(x.nama.toLowerCase()) && lihat.add(x.nama.toLowerCase()))
      .slice(0, 12);
  }
  const hargaMenu = (m) => {
    const d = diskonMenu(m);
    if (!d) return angka(m.harga);
    return nominal(m) ? Math.max(0, angka(m.harga) - d) : Math.max(0, Math.round((angka(m.harga) * (100 - d)) / 100 / 100) * 100);
  };
  function infoToko(req) {
    const s = tokoDariToken(req.token);
    if (!s) return { ok: false, galat: 'Link pemesanan tidak ditemukan atau sudah diganti.' };
    const stok = stokMakanan();
    const merek = tabel('Setelan').stl_merek;
    const menu = hidup('Menu', (m) => benar(m.aktif, false) && benar(m.online, false))
      .sort((a, b) => angka(a.urutan) - angka(b.urutan))
      .map((m) => {
        const isi = Object.entries(isiMenu(m));
        const sisa = isi.length ? Math.min(...isi.map(([r, per]) => Math.floor(Math.max(0, stok[r] || 0) / per))) : null;
        const r = m.jenis === 'paket' ? null : tabel('Resep')[m.idRef];
        const kat = r && tabel('Kategori')[r.idKategori];
        const kategori = m.jenis === 'paket' ? 'Paket' : (kat && kat.nama) || 'Lainnya';
        const isiPertama = hidup('IsiPaket', (i) => i.idPaket === m.idRef).sort((a, b) => angka(a.urutan) - angka(b.urutan))[0];
        const fotoResep = (id) => (tabel('Resep')[id] || {}).fotoAcuanUrl;
        const fotoCadangan = m.jenis === 'paket' ? (tabel('Paket')[m.idRef] || {}).fotoUrl || (isiPertama && fotoResep(isiPertama.idResep)) : fotoResep(m.idRef);
        m = { ...m, fotoUrl: m.fotoUrl || fotoCadangan || '' };
        const terjual = hidup('Pesanan', (p) => !['batal', 'menunggu'].includes(p.status)).reduce((j, p) => j + bacaItem(p.item).filter((i) => i.idMenu === m.id).reduce((a, i) => a + angka(i.jumlah), 0), 0);
        return { id: m.id, nama: String(m.nama || ''), harga: hargaMenu(m), hargaAsli: angka(m.harga), diskon: diskonMenu(m), diskonJenis: nominal(m) ? 'nominal' : 'persen', opsi: opsiMenu(m), fotoUrl: String(m.fotoUrl || ''), keterangan: String(m.keterangan || ''), sisa, kategori, segera: benar(m.segera, false), terjual };
      });
    return {
      ok: true,
      namaToko: s.namaToko || (merek && merek.namaAplikasi) || 'rasa.terasrumah',
      logoUrl: (merek && merek.logoUrl) || '',
      buka: benar(s.tokoBuka, false),
      alamat: String(s.alamatToko || ''),
      wa: String(s.waToko || ''),
      catatan: String(s.catatanToko || ''),
      bayarOnline: pakaiMayar(s) || adaBayarManual(bayarManual(s)),
      mayar: pakaiMayar(s),
      bayarManual: pakaiMayar(s) ? null : bayarManual(s),
      testimoni: testimoniTampil(),
      promo: hidup('Promo', (p) => benar(p.aktif, false) && benar(p.online, false) && String(p.kode || '').trim() && (!angka(p.mulai) || angka(p.mulai) <= Date.now()) && (!angka(p.sampai) || angka(p.sampai) >= Date.now()))
        .filter((p) => !p.idMenu || menu.some((m) => m.id === p.idMenu))
        .slice(0, 6)
        .map((p) => ({ kode: String(p.kode).trim().toUpperCase(), nama: String(p.nama || ''), idMenu: String(p.idMenu || ''), produk: (menu.find((m) => m.id === p.idMenu) || {}).nama || '', minJumlah: Math.max(1, Math.floor(angka(p.minJumlah) || 1)), berlaku: p.berlaku === 'sekali' ? 'sekali' : 'kelipatan', jenis: p.jenis === 'persen' ? 'persen' : 'rupiah', nilai: angka(p.nilai), minBelanja: angka(p.minBelanja), maksDiskon: angka(p.maksDiskon), untuk: p.untuk || 'semua', sampai: angka(p.sampai) })),
      latarUrl: (keadaan.situs && keadaan.situs.latarUrl) || '',
      banner: hidup('Banner', (b) => benar(b.aktif, false) && ['etalase', 'semua'].includes(b.tampilDi || 'etalase') && (String(b.judul || '').trim() || /^(https?:|\/foto\/)/.test(String(b.fotoUrl || ''))))
        .sort((a, b) => angka(a.urutan) - angka(b.urutan))
        .slice(0, 8)
        .map((b) => ({ judul: String(b.judul), teks: String(b.teks || ''), fotoUrl: /^(https?:|\/foto\/)/.test(String(b.fotoUrl || '')) ? String(b.fotoUrl) : '', warna: b.warna || 'hijau', tombol: String(b.tombol || ''), aksi: String(b.aksi || ''), nilai: String(b.nilai || '') })),
      headerUrl: /^(https?:|\/foto\/)/.test(String(s.headerUrl || '')) ? String(s.headerUrl) : '',
      menu,
    };
  }
  function promoOnline(kode, subtotal, idPelanggan, item = []) {
    const k = String(kode || '').trim().toUpperCase();
    if (!k) return { diskon: 0, galat: '', kode: '' };
    const p = hidup('Promo', (x) => String(x.kode || '').trim().toUpperCase() === k)[0];
    const sah = hidup('Pesanan', (x) => x.status !== 'batal' && x.status !== 'menunggu');
    const lama = sah.some((x) => x.idPelanggan === idPelanggan);
    const dipakai = sah.filter((x) => String(x.kodePromo || '').toUpperCase() === k).length;
    const sekarang = Date.now();
    let galat = '';
    if (!p || !benar(p.aktif, false)) galat = 'Kode promo tidak ditemukan.';
    else if (!benar(p.online, false)) galat = 'Kode promo ini hanya berlaku di toko.';
    else if (angka(p.mulai) && sekarang < angka(p.mulai)) galat = 'Promo ini belum dimulai.';
    else if (angka(p.sampai) && sekarang > angka(p.sampai)) galat = 'Promo ini sudah berakhir.';
    else if (angka(p.minBelanja) > 0 && subtotal < angka(p.minBelanja)) galat = 'Minimal belanja belum tercapai.';
    else if (p.untuk === 'baru' && lama) galat = 'Promo ini khusus pelanggan baru.';
    else if (p.untuk === 'lama' && !lama) galat = 'Promo ini khusus pelanggan yang sudah pernah memesan.';
    else if (angka(p.kuota) > 0 && dipakai >= angka(p.kuota)) galat = 'Kuota promo ini sudah habis.';
    if (galat) return { diskon: 0, galat, kode: '' };
    let diskon;
    let batas = subtotal;
    if (p.idMenu) {
      // Promo khusus produk (sama dengan Penjualan::dasarPromo): kelipatan tiap minJumlah item, atau sekali per pesanan.
      const nama = (tabel('Menu')[p.idMenu] || {}).nama || 'produk yang sudah dihapus';
      const milik = item.filter((i) => i.idMenu === p.idMenu);
      const jumlah = milik.reduce((j, i) => j + i.jumlah, 0);
      const dasar = milik.reduce((j, i) => j + i.harga * i.jumlah, 0);
      const min = Math.max(1, Math.floor(angka(p.minJumlah) || 1));
      if (!jumlah) return { diskon: 0, galat: `Kode promo ini khusus untuk ${nama}.`, kode: '' };
      if (jumlah < min) return { diskon: 0, galat: `Promo ini berlaku untuk pembelian minimal ${min} ${nama}.`, kode: '' };
      const kali = p.berlaku === 'sekali' ? 1 : Math.floor(jumlah / min);
      batas = Math.min(subtotal, dasar);
      diskon = p.jenis === 'persen' ? Math.floor(((dasar / jumlah) * Math.min(jumlah, kali * min) * angka(p.nilai)) / 100) : angka(p.nilai) * kali;
    } else {
      diskon = p.jenis === 'persen' ? Math.floor((subtotal * angka(p.nilai)) / 100) : angka(p.nilai);
    }
    if (p.jenis === 'persen' && angka(p.maksDiskon) > 0) diskon = Math.min(diskon, angka(p.maksDiskon));
    return { diskon: Math.max(0, Math.min(batas, diskon)), galat: '', kode: k };
  }
  /** Item keranjang pembeli dengan harga dari menu (sama dengan Penjualan::itemOnline). */
  function itemOnline(daftar) {
    const menu = Object.fromEntries(hidup('Menu', (m) => benar(m.aktif, false) && benar(m.online, false)).map((m) => [m.id, m]));
    const masuk = Array.isArray(daftar) ? daftar : [];
    if (!masuk.length) return { galat: 'Pilih menu yang ingin dipesan.' };
    const item = [];
    let subtotal = 0;
    for (const it of masuk) {
      const m = menu[it && it.idMenu];
      const jumlah = Math.floor(Number(it && it.jumlah));
      if (!m || !(jumlah >= 1 && jumlah <= 100)) return { galat: 'Ada menu yang sudah tidak tersedia. Muat ulang halaman.' };
      const mau = new Set((Array.isArray(it.opsi) ? it.opsi : []).filter((x) => typeof x === 'string').map((x) => x.trim().toLowerCase()));
      const opsi = opsiMenu(m).filter((o) => mau.has(o.nama.toLowerCase()));
      if (opsi.length !== mau.size) return { galat: 'Ada pilihan tambahan yang sudah tidak tersedia. Muat ulang halaman.' };
      const harga = hargaMenu(m) + opsi.reduce((j, o) => j + o.harga, 0);
      item.push({ idMenu: m.id, nama: String(m.nama), harga, jumlah, ...(opsi.length ? { opsi: opsi.map((o) => o.nama) } : {}) });
      subtotal += harga * jumlah;
    }
    return { item, subtotal, galat: '' };
  }
  /** Tombol "Gunakan" kode promo di keranjang (sama dengan Penjualan::cekPromoOnline). */
  function cekPromo(req) {
    if (!tokoDariToken(req.token)) return { ok: false, galat: 'Link pemesanan tidak ditemukan atau sudah diganti.' };
    if (!String(req.kodePromo || '').trim()) return { ok: false, galat: 'Masukkan kode promo.' };
    const { item, subtotal, galat } = itemOnline(req.item);
    if (galat) return { ok: false, galat };
    let hp = String(req.hp || '').replace(/\D/g, '');
    if (hp.startsWith('0')) hp = '62' + hp.slice(1);
    else if (hp.startsWith('8')) hp = '62' + hp;
    const promo = promoOnline(req.kodePromo, subtotal, /^62\d{8,13}$/.test(hp) ? 'plg_' + hp : '', item);
    if (promo.galat) return { ok: false, galat: promo.galat };
    const p = hidup('Promo', (x) => String(x.kode || '').trim().toUpperCase() === promo.kode)[0];
    return {
      ok: true, kode: promo.kode, nama: String(p.nama || ''), jenis: p.jenis === 'persen' ? 'persen' : 'rupiah', nilai: angka(p.nilai), maksDiskon: angka(p.maksDiskon),
      produk: p.idMenu ? (tabel('Menu')[p.idMenu] || {}).nama || '' : '', minJumlah: Math.max(1, Math.floor(angka(p.minJumlah) || 1)), berlaku: p.berlaku === 'sekali' ? 'sekali' : 'kelipatan',
      subtotal, diskon: promo.diskon, total: subtotal - promo.diskon,
    };
  }
  function pesanOnline(req) {
    const s = tokoDariToken(req.token);
    if (!s) return { ok: false, galat: 'Link pemesanan tidak ditemukan atau sudah diganti.' };
    if (!benar(s.tokoBuka, false)) return { ok: false, galat: 'Maaf, toko sedang tutup.' };
    const mayar = pakaiMayar(s);
    if (!mayar && !adaBayarManual(bayarManual(s))) return { ok: false, galat: 'Toko ini belum bisa menerima pembayaran online.' };
    const nama = bersihkan(req.nama, 60);
    let hp = String(req.hp || '').replace(/\D/g, '');
    if (hp.startsWith('0')) hp = '62' + hp.slice(1);
    else if (hp.startsWith('8')) hp = '62' + hp;
    if (nama.length < 2) return { ok: false, galat: 'Isi nama Anda.' };
    if (!/^62\d{8,13}$/.test(hp)) return { ok: false, galat: 'Isi nomor WhatsApp yang benar, mis. 0812xxxxxxx.' };
    // Sama dengan Penjualan::pesanOnline: cara ambil + jam ambil (jam opsional; 0 = diambil saat pesanan siap).
    const caraAmbil = ['ambil', 'ojol'].includes(req.caraAmbil) ? req.caraAmbil : '';
    let jadwal = Math.max(0, Math.floor(Number(req.jadwal)) || 0);
    if (caraAmbil && jadwal) {
      if (jadwal < Date.now() - 15 * 60 * 1000) return { ok: false, galat: 'Pilih jam ambil yang belum lewat.' };
      if (jadwal > Date.now() + 60 * 24 * 60 * 60 * 1000) return { ok: false, galat: 'Jam ambil paling lambat 60 hari dari sekarang.' };
    } else jadwal = 0;
    const { item, subtotal, galat: galatItem } = itemOnline(req.item);
    if (galatItem) return { ok: false, galat: galatItem };
    const stok = stokMakanan();
    for (const [r, butuh] of Object.entries(kebutuhan(item))) {
      if ((stok[r] || 0) + 1e-9 < butuh) return { ok: false, galat: 'Maaf, stok tidak cukup untuk jumlah pesanan ini. Kurangi jumlahnya.' };
    }
    const idPelanggan = 'plg_' + hp;
    const promo = promoOnline(req.kodePromo, subtotal, idPelanggan, item);
    if (promo.galat) return { ok: false, galat: promo.galat };
    const total = subtotal - promo.diskon;
    const sekarang = Date.now();
    if (!tabel('Pelanggan')[idPelanggan]) simpanBaris('Pelanggan', { id: idPelanggan, nama, hp, catatan: '', dibuat: sekarang });
    const idPesanan = idAcak('psn');
    const nomor = nomorPesanan();
    simpanBaris('Pesanan', { id: idPesanan, nomor, sumber: 'online', idPelanggan, nama, hp, catatan: bersihkan(req.catatan, 300), item: JSON.stringify(item), subtotal, diskon: promo.diskon, kodePromo: promo.kode, total, status: 'menunggu', oleh: 'Link pemesanan', waktu: sekarang, caraAmbil, jadwal });
    const link = mayar ? buatLinkMayar(total) : { id: '', link: '' };
    simpanBaris('Pembayaran', { id: idAcak('byr'), idPesanan, metode: mayar ? 'mayar' : 'transfer', jumlah: total, status: 'menunggu', idMayar: link.id, linkMayar: link.link, waktu: sekarang });
    kabari();
    return { ok: true, idPesanan, nomor, total, link: link.link };
  }
  function cekMayar(b) {
    const t = keadaan.mayarTagihan && keadaan.mayarTagihan[b.idMayar];
    if (t && t.status === 'paid') tandaiLunas(b.id);
  }
  function statusPesanan(req) {
    const s = tokoDariToken(req.token);
    const p = s && tabel('Pesanan')[req.idPesanan];
    if (!p || benar(p.dihapus, false) || p.sumber !== 'online') return { ok: false, galat: 'Pesanan tidak ditemukan.' };
    const bayar = () => hidup('Pembayaran', (b) => b.idPesanan === p.id);
    bayar().filter((b) => b.metode === 'mayar' && b.status === 'menunggu').forEach(cekMayar);
    const kini = tabel('Pesanan')[p.id];
    const lunas = bayar().some((b) => b.status === 'lunas');
    const menunggu = bayar().find((b) => b.metode === 'mayar' && b.status === 'menunggu');
    kabari();
    const tungguTransfer = !lunas && kini.status === 'menunggu' && bayar().some((b) => b.metode === 'transfer' && b.status === 'menunggu');
    const adaTesti = hidup('Testimoni', (t) => t.idPesanan === p.id).length > 0;
    return {
      ok: true, nomor: kini.nomor, status: kini.status, lunas, total: angka(kini.total), item: bacaItem(kini.item), nama: kini.nama,
      link: lunas || !menunggu ? '' : menunggu.linkMayar,
      caraAmbil: String(kini.caraAmbil || ''), jadwal: angka(kini.jadwal), alamatToko: String(s.alamatToko || ''),
      bayarManual: tungguTransfer ? bayarManual(s) : null,
      wa: String(s.waToko || ''),
      bisaTestimoni: lunas && kini.status !== 'batal' && !adaTesti,
      waktu: angka(kini.waktu),
      buktiPada: angka(kini.buktiPada),
      lunasPada: bayar().filter((b) => b.status === 'lunas').reduce((m, b) => Math.max(m, angka(b.lunasPada) || angka(b.waktu)), 0),
      metodeBayar: bayar().some((b) => b.metode === 'mayar') ? 'mayar' : 'transfer',
      riwayat: bacaItem(kini.riwayat).filter((r) => r && r.status && r.waktu),
      kendala: ['batal', 'selesai'].includes(kini.status) ? '' : String(kini.kendala || '').slice(0, 300),
    };
  }
  function kirimBukti(req) {
    const s = tokoDariToken(req.token);
    const p = s && tabel('Pesanan')[req.idPesanan];
    if (!p || benar(p.dihapus, false) || p.sumber !== 'online') return { ok: false, galat: 'Pesanan tidak ditemukan.' };
    if (p.status === 'batal') return { ok: false, galat: 'Pesanan ini sudah dibatalkan.' };
    if (!angka(p.buktiPada)) {
      simpanBaris('Pesanan', { ...p, buktiPada: Date.now() });
      kabari();
    }
    return { ok: true };
  }

  function jawab(req) {
    switch (req.aksi) {
      case 'infoNilai':
        return infoNilai(req);
      case 'kirimNilai':
        return kirimNilai(req);
      case 'infoToko':
        return infoToko(req);
      case 'cekPromo':
        return cekPromo(req);
      case 'pesanOnline':
        return pesanOnline(req);
      case 'statusPesanan':
        return statusPesanan(req);
      case 'kirimTestimoni':
        return kirimTestimoni(req);
      case 'kirimBukti':
        return kirimBukti(req);
      case 'infoSitus':
        return { ok: true, logoUrl: (keadaan.situs && keadaan.situs.logoUrl) || '', latarUrl: (keadaan.situs && keadaan.situs.latarUrl) || '' };
      case 'tiruanLunas': {
        // Pengganti pembeli membayar di Mayar + webhook (hanya di server uji).
        const t = keadaan.mayarTagihan && keadaan.mayarTagihan[req.idMayar];
        if (!t) return { ok: false, galat: 'Tagihan tidak ada.' };
        t.status = 'paid';
        hidup('Pembayaran', (b) => b.idMayar === req.idMayar).forEach((b) => tandaiLunas(b.id));
        kabari();
        return { ok: true, jumlah: t.jumlah };
      }
      case 'masuk':
        if (req.kataSandi !== kunci) return { ok: false, galat: 'Username/email atau kata sandi salah.' };
        if (/^toko/i.test(String(req.login || ''))) return { ok: true, sesi: kunciToko, pengguna: penggunaToko() };
        return { ok: true, sesi: kunci, pengguna: pengguna(req, String(req.login || '')) };
      case 'lupaSandi':
        return { ok: true, pesan: `(uji) Tidak ada email terkirim. Kata sandinya ${kunci}.` };
      case 'aturSandi':
        return { ok: true, pesan: '(uji) Kata sandi tidak berubah di server uji.' };
    }
    // Sisanya wajib login.
    const toko = req.kunci === kunciToko;
    if (req.kunci !== kunci && !toko) return GALAT_SESI;
    const khususDapur = ['akunToko', 'buatAkunToko', 'ubahAkunToko', 'hapusAkunToko', 'infoMayar', 'aturMayar', 'unggahFoto', 'infoTampilanSitus', 'aturTampilanSitus'];
    if (toko && khususDapur.includes(req.aksi)) return { ok: false, galat: 'Hanya akun dapur yang bisa melakukan ini.' };
    keadaan.akunToko ||= [];
    switch (req.aksi) {
      case 'ping':
        return { ok: true, versi: 2, pengguna: toko ? penggunaToko() : pengguna(req) };
      case 'sinkron':
        return sinkron(req, toko);
      case 'akunToko':
        return { ok: true, akun: keadaan.akunToko };
      case 'buatAkunToko': {
        const username = String(req.username || '').toLowerCase();
        if (!/^[a-z0-9._]{4,40}$/.test(username)) return { ok: false, galat: 'Username 4-40 karakter: huruf kecil, angka, titik, atau garis bawah.' };
        if (keadaan.akunToko.some((a) => a.username === username)) return { ok: false, galat: 'Username itu sudah dipakai. Pilih yang lain.' };
        if (String(req.kataSandi || '').length < 8) return { ok: false, galat: 'Kata sandi minimal 8 karakter.' };
        const akun = { id: 100 + keadaan.akunToko.length, nama: bersihkan(req.nama, 60), username, aktif: true, terakhirDipakai: null };
        keadaan.akunToko.push(akun);
        kabari();
        return { ok: true, akun };
      }
      case 'ubahAkunToko': {
        const akun = keadaan.akunToko.find((a) => a.id === Number(req.id));
        if (!akun) return { ok: false, galat: 'Akun toko tidak ditemukan.' };
        if ('aktif' in req) akun.aktif = !!req.aktif;
        if (req.nama) akun.nama = bersihkan(req.nama, 60);
        kabari();
        return { ok: true, akun };
      }
      case 'hapusAkunToko':
        keadaan.akunToko = keadaan.akunToko.filter((a) => a.id !== Number(req.id));
        kabari();
        return { ok: true };
      case 'infoMayar':
        return { ok: true, aktif: !!(keadaan.mayar && keadaan.mayar.aktif), sandbox: !!(keadaan.mayar && keadaan.mayar.sandbox), webhook: keadaan.mayar ? 'http://localhost/api/mayar/tiruan' : '' };
      case 'aturMayar':
        if (req.hapus) {
          keadaan.mayar = { aktif: false };
          kabari();
          return { ok: true, aktif: false, sandbox: false, webhook: '', pesan: 'Pembayaran online dimatikan.' };
        }
        if (String(req.kunciApi || '').length < 20) return { ok: false, galat: 'Kunci API Mayar tidak valid. Salin dari menu Integrasi > API Key di dashboard Mayar.' };
        keadaan.mayar = { aktif: true, sandbox: !!req.sandbox };
        kabari();
        return { ok: true, aktif: true, sandbox: !!req.sandbox, webhook: 'http://localhost/api/mayar/tiruan', webhookTerdaftar: true, pesan: 'Kunci Mayar tersimpan dan alamat webhook sudah didaftarkan.' };
      case 'bayarMayar': {
        if (!(keadaan.mayar && keadaan.mayar.aktif)) return { ok: false, galat: 'Pembayaran online belum diatur. Isi kunci API Mayar di Pengaturan akun dapur.' };
        const jumlah = Math.round(Number(req.jumlah));
        if (!req.idPesanan || !(jumlah >= 1)) return { ok: false, galat: 'Pesanan tidak valid.' };
        const link = buatLinkMayar(jumlah);
        const pembayaran = simpanBaris('Pembayaran', { id: idAcak('byr'), idPesanan: req.idPesanan, metode: 'mayar', jumlah, status: 'menunggu', idMayar: link.id, linkMayar: link.link, waktu: Date.now() });
        kabari();
        return { ok: true, pembayaran };
      }
      case 'cekBayar': {
        const b = tabel('Pembayaran')[req.idPembayaran];
        if (!b) return { ok: false, galat: 'Pembayaran tidak ditemukan.' };
        if (b.metode === 'mayar' && b.status === 'menunggu') cekMayar(b);
        kabari();
        return { ok: true, pembayaran: tabel('Pembayaran')[b.id] };
      }
      case 'unggahFoto':
        return unggahFoto(req);
      case 'infoTampilanSitus':
        return { ok: true, bolehUbah: true, logoUrl: (keadaan.situs && keadaan.situs.logoUrl) || '', latarUrl: (keadaan.situs && keadaan.situs.latarUrl) || '' };
      case 'aturTampilanSitus': {
        const kunciSitus = { logo: 'logoUrl', latar: 'latarUrl' }[req.aksi === 'aturTampilanSitus' ? req.jenis : ''];
        if (!kunciSitus) return { ok: false, galat: 'Jenis gambar tidak dikenal.' };
        keadaan.situs ||= {};
        if (!req.gambar) keadaan.situs[kunciSitus] = '';
        else {
          const m = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(String(req.gambar));
          if (!m) return { ok: false, galat: 'Pilih gambar PNG, JPG, atau WebP.' };
          const f = unggahFoto({ mime: m[1], base64: m[2], nama: 'situs_' + req.jenis });
          if (!f.ok) return f;
          keadaan.situs[kunciSitus] = f.url;
        }
        kabari();
        return { ok: true, bolehUbah: true, logoUrl: keadaan.situs.logoUrl || '', latarUrl: keadaan.situs.latarUrl || '' };
      }
      case 'ubahProfil':
        return { ok: true, pengguna: pengguna(req) };
      case 'gantiSandi':
        // Seperti Laravel, tetapi kata sandi uji tidak benar-benar berubah.
        if (req.lama !== kunci) return { ok: false, galat: 'Kata sandi lama salah.' };
        if (typeof req.baru !== 'string' || req.baru.length < 8) return { ok: false, galat: 'Kata sandi baru minimal 8 karakter.' };
        return { ok: true };
      case 'keluar':
        return { ok: true };
      default:
        return { ok: false, galat: 'Aksi tidak dikenal.' };
    }
  }

  return {
    keadaan,
    /** Kirim permintaan seperti POST /api; mengembalikan objek jawaban. */
    panggil(isi) {
      let req;
      try {
        req = typeof isi === 'string' ? JSON.parse(isi) : isi;
      } catch {
        return { ok: false, galat: 'Permintaan tidak valid.' };
      }
      return jawab(req || {});
    },
    get() {
      return { ok: true, nama: 'Good Receipes (uji)', versi: 2, akun: true };
    },
  };
}

/** fetch tiruan yang mengarah ke server tiruan di atas. */
export function fetchKeServer(server) {
  return async (_url, init) => ({
    ok: true,
    status: 200,
    json: async () => server.panggil(init.body),
  });
}
