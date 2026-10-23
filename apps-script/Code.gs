/**
 * Eksperimen Resep — backend Google Apps Script.
 *
 * Fungsi:
 *  - Menyimpan data aplikasi di tab-tab Spreadsheet ini (satu tab per tabel).
 *  - Menyimpan foto di Google Drive (folder "Foto Eksperimen Resep").
 *  - Menerima penilaian dari orang lain lewat QR (tanpa login, hanya dengan token).
 *
 * Cara pasang: lihat README.md bagian "Menyambungkan Google Spreadsheet".
 * Ubah KUNCI di bawah sebelum Deploy, lalu isi kunci yang sama di aplikasi
 * (Pengaturan > Sambungan ke Google Spreadsheet).
 */

const KUNCI = 'GANTI-DENGAN-KUNCI-RAHASIA-ANDA';

const VERSI = 1;
const NAMA_TABEL = [
  'Kategori', 'Resep', 'Eksperimen', 'Bahan', 'KonversiSatuan',
  'BahanEksperimen', 'Penilaian', 'BiayaLain', 'ResepTambahan', 'Target', 'Marketing', 'Setelan',
];
const NAMA_FOLDER_FOTO = 'Foto Eksperimen Resep';
const KOLOM_WAJIB = ['id', 'diubah', 'dihapus'];
const MAKS_BARIS_PER_PERMINTAAN = 3000;
const MAKS_PANJANG_FOTO = 6 * 1024 * 1024; // karakter base64 (sekitar 4,5 MB)
const MAKS_NILAI_PER_EKSPERIMEN = 500;
const POLA_KOLOM = /^[A-Za-z][A-Za-z0-9]{0,40}$/;

/** Pemeriksaan cepat lewat browser: tidak mengembalikan data apa pun. */
function doGet() {
  return keluar_({ ok: true, nama: 'Eksperimen Resep', versi: VERSI });
}

function doPost(e) {
  let req;
  try {
    req = JSON.parse(e.postData.contents);
  } catch (err) {
    return keluar_({ ok: false, galat: 'Permintaan tidak valid.' });
  }
  try {
    // Aksi untuk penilai (tanpa login): hanya butuh token tautan.
    if (req.aksi === 'infoNilai') return keluar_(infoNilai_(req));
    if (req.aksi === 'kirimNilai') return keluar_(kirimNilai_(req));

    // Aksi pemilik: wajib memakai kunci.
    if (!samaAman_(req.kunci, KUNCI)) return keluar_({ ok: false, kode: 'KUNCI', galat: 'Kunci salah.' });
    if (req.aksi === 'ping') return keluar_({ ok: true, versi: VERSI });
    if (req.aksi === 'sinkron') return keluar_(sinkron_(req));
    if (req.aksi === 'unggahFoto') return keluar_(unggahFoto_(req));
    return keluar_({ ok: false, galat: 'Aksi tidak dikenal.' });
  } catch (err) {
    return keluar_({ ok: false, galat: String((err && err.message) || err) });
  }
}

// ---------------------------------------------------------------- pemilik

function sinkron_(req) {
  const masuk = req.baris || {};
  let jumlah = 0;
  NAMA_TABEL.forEach(function (nama) {
    jumlah += (masuk[nama] || []).length;
  });
  if (jumlah > MAKS_BARIS_PER_PERMINTAAN) throw new Error('Terlalu banyak baris dalam satu permintaan.');
  const sejak = Number(req.sejak) || 0;

  return denganKunci_(function () {
    NAMA_TABEL.forEach(function (nama) {
      if (masuk[nama] && masuk[nama].length) tulisBaris_(nama, masuk[nama]);
    });
    const keluarBaris = {};
    NAMA_TABEL.forEach(function (nama) {
      const baru = bacaSemua_(nama).filter(function (r) {
        return Number(r.diubah) > sejak;
      });
      if (baru.length) keluarBaris[nama] = baru;
    });
    return { ok: true, waktuServer: Date.now(), baris: keluarBaris };
  });
}

function unggahFoto_(req) {
  const mime = String(req.mime || '');
  if (['image/jpeg', 'image/png', 'image/webp'].indexOf(mime) < 0) throw new Error('Jenis gambar tidak didukung.');
  const b64 = String(req.base64 || '');
  if (!b64 || b64.length > MAKS_PANJANG_FOTO) throw new Error('Ukuran foto tidak valid.');
  const nama = String(req.nama || 'foto').replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 80);
  const blob = Utilities.newBlob(Utilities.base64Decode(b64), mime, nama);
  const berkas = folderFoto_().createFile(blob);
  berkas.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
  const id = berkas.getId();
  return { ok: true, id: id, url: 'https://drive.google.com/thumbnail?id=' + id + '&sz=w1000' };
}

function folderFoto_() {
  const ada = DriveApp.getFoldersByName(NAMA_FOLDER_FOTO);
  return ada.hasNext() ? ada.next() : DriveApp.createFolder(NAMA_FOLDER_FOTO);
}

// ---------------------------------------------------------------- penilai

function infoNilai_(req) {
  const e = cariEksperimenDariToken_(req.token);
  if (!e) return { ok: false, galat: 'Tautan penilaian tidak ditemukan atau sudah tidak berlaku.' };
  const resep = bacaSemua_('Resep').filter(function (r) {
    return r.id === e.idResep && !benar_(r.dihapus, false);
  })[0];
  const merek = bacaSemua_('Setelan').filter(function (r) {
    return r.id === 'stl_merek' && !benar_(r.dihapus, false);
  })[0];
  return {
    ok: true,
    namaResep: resep ? String(resep.nama) : 'Resep',
    nomor: Number(e.nomor) || 0,
    fotoUrl: String(e.fotoHasilUrl || ''),
    terima: benar_(e.terimaNilai, true),
    wajibNama: benar_(e.wajibNama, false),
    namaAplikasi: merek ? String(merek.namaAplikasi || '') : '',
    logoUrl: merek ? String(merek.logoUrl || '') : '',
    panduan: bacaPanduan_(e.panduanNilai),
    catatanChef: String(e.catatanChef || '').slice(0, 1000),
  };
}

/** Petunjuk penilaian (teks JSON di sel) -> objek berisi teks saja. */
function bacaPanduan_(v) {
  let o = {};
  try {
    o = typeof v === 'string' ? JSON.parse(v || '{}') : v || {};
  } catch (err) {
    o = {};
  }
  const keluar = {};
  ['umum', 'rasa', 'tekstur', 'tampilan', 'aroma', 'minatBeli'].forEach(function (k) {
    if (o && typeof o[k] === 'string' && o[k].trim()) keluar[k] = o[k].trim().slice(0, k === 'umum' ? 500 : 200);
  });
  return keluar;
}

function kirimNilai_(req) {
  const e = cariEksperimenDariToken_(req.token);
  if (!e) return { ok: false, galat: 'Tautan penilaian tidak ditemukan atau sudah tidak berlaku.' };
  if (!benar_(e.terimaNilai, true)) return { ok: false, galat: 'Penilaian untuk eksperimen ini sudah ditutup.' };

  const nama = bersihkanTeks_(req.nama, 60);
  if (benar_(e.wajibNama, false) && !nama) return { ok: false, galat: 'Nama wajib diisi.' };
  const nilai = {};
  const aspek = ['rasa', 'tekstur', 'tampilan', 'aroma', 'minatBeli'];
  for (let i = 0; i < aspek.length; i++) {
    const n = Number(req[aspek[i]]);
    if (!(n >= 1 && n <= 10) || Math.round(n) !== n) return { ok: false, galat: 'Nilai harus bilangan bulat 1 sampai 10.' };
    nilai[aspek[i]] = n;
  }
  const komentar = bersihkanTeks_(req.komentar, 1000);

  return denganKunci_(function () {
    const sudah = bacaSemua_('Penilaian').filter(function (p) {
      return p.idEksperimen === e.id;
    }).length;
    if (sudah >= MAKS_NILAI_PER_EKSPERIMEN) return { ok: false, galat: 'Batas jumlah penilaian tercapai.' };
    const sekarang = Date.now();
    tulisBaris_('Penilaian', [{
      id: 'nil_' + Utilities.getUuid().replace(/-/g, '').slice(0, 14),
      idEksperimen: e.id,
      namaPenilai: nama,
      rasa: nilai.rasa,
      tekstur: nilai.tekstur,
      tampilan: nilai.tampilan,
      aroma: nilai.aroma,
      minatBeli: nilai.minatBeli,
      komentar: komentar,
      waktu: sekarang,
      dariPemilik: false,
      diubah: sekarang,
      dihapus: false,
    }]);
    return { ok: true };
  });
}

function cariEksperimenDariToken_(token) {
  const t = String(token || '');
  if (t.length < 10) return null;
  const semua = bacaSemua_('Eksperimen');
  for (let i = 0; i < semua.length; i++) {
    const e = semua[i];
    if (!benar_(e.dihapus, false) && samaAman_(e.tokenNilai, t)) return e;
  }
  return null;
}

/** Teks dari orang lain: potong, hapus karakter kontrol, dan cegah rumus Spreadsheet. */
function bersihkanTeks_(nilai, maks) {
  let t = String(nilai == null ? '' : nilai).replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').trim().slice(0, maks);
  if (/^[=+\-@]/.test(t)) t = ' ' + t;
  return t;
}

// ---------------------------------------------------------------- Spreadsheet

function lembar_(nama) {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sh = ss.getSheetByName(nama);
  if (!sh) {
    sh = ss.insertSheet(nama);
    sh.getRange(1, 1, 1, KOLOM_WAJIB.length).setValues([KOLOM_WAJIB]);
    sh.setFrozenRows(1);
  }
  return sh;
}

/** Semua baris tabel sebagai daftar objek {kolom: nilai}. */
function bacaSemua_(nama) {
  const sh = lembar_(nama);
  const lastRow = sh.getLastRow();
  if (lastRow < 2) return [];
  const nilai = sh.getRange(1, 1, lastRow, sh.getLastColumn()).getValues();
  const header = nilai[0];
  const hasil = [];
  for (let i = 1; i < nilai.length; i++) {
    if (nilai[i][0] === '' || nilai[i][0] == null) continue;
    const o = {};
    for (let c = 0; c < header.length; c++) if (header[c]) o[header[c]] = nilai[i][c];
    hasil.push(o);
  }
  return hasil;
}

/**
 * Tulis (tambah/perbarui) baris. Baris hanya menimpa bila `diubah`-nya lebih baru
 * daripada yang sudah ada. Kolom baru dibuat otomatis.
 */
function tulisBaris_(nama, daftar) {
  const sh = lembar_(nama);
  const lastRow = sh.getLastRow();
  const lastCol = Math.max(sh.getLastColumn(), KOLOM_WAJIB.length);
  const header = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String).filter(function (h) { return h !== ''; });

  // Kolom baru. Kolom berisi teks diformat sebagai teks biasa agar isinya tidak
  // diubah menjadi tanggal atau dianggap rumus oleh Spreadsheet.
  const kolomTeks = [];
  let adaKolomBaru = false;
  daftar.forEach(function (r) {
    Object.keys(r).forEach(function (k) {
      if (POLA_KOLOM.test(k) && header.indexOf(k) < 0) {
        header.push(k);
        adaKolomBaru = true;
        if (typeof r[k] === 'string') kolomTeks.push(header.length);
      }
    });
  });
  if (adaKolomBaru) {
    if (sh.getMaxColumns() < header.length) sh.insertColumnsAfter(sh.getMaxColumns(), header.length - sh.getMaxColumns());
    sh.getRange(1, 1, 1, header.length).setValues([header]);
    kolomTeks.forEach(function (nomor) { formatTeks_(sh, nomor); });
  }

  // Baris yang sudah ada
  const lebar = header.length;
  const baris = lastRow >= 2 ? sh.getRange(2, 1, lastRow - 1, lebar).getValues() : [];
  const indeksId = {};
  baris.forEach(function (b, i) {
    if (b[0] !== '') indeksId[String(b[0])] = i;
  });
  const iDiubah = header.indexOf('diubah');

  daftar.forEach(function (r) {
    const id = String(r.id == null ? '' : r.id);
    if (!id || id.length > 100) return;
    const ada = indeksId[id];
    if (ada !== undefined) {
      if (!(Number(r.diubah) > Number(baris[ada][iDiubah]))) return;
      header.forEach(function (h, c) {
        if (r[h] !== undefined && r[h] !== null) baris[ada][c] = r[h];
      });
    } else {
      baris.push(header.map(function (h) {
        return r[h] === undefined || r[h] === null ? '' : r[h];
      }));
      indeksId[id] = baris.length - 1;
    }
  });

  if (baris.length) {
    const perlu = baris.length + 1;
    if (sh.getMaxRows() < perlu) sh.insertRowsAfter(sh.getMaxRows(), perlu - sh.getMaxRows());
    sh.getRange(2, 1, baris.length, lebar).setValues(baris.map(function (b) {
      while (b.length < lebar) b.push('');
      return b;
    }));
  }
}

function formatTeks_(sh, nomorKolom) {
  sh.getRange(1, nomorKolom, Math.max(sh.getMaxRows(), 2), 1).setNumberFormat('@');
}

// ---------------------------------------------------------------- bantu

function keluar_(objek) {
  return ContentService.createTextOutput(JSON.stringify(objek)).setMimeType(ContentService.MimeType.JSON);
}

function denganKunci_(fn) {
  const kunci = LockService.getScriptLock();
  kunci.waitLock(25000);
  try {
    return fn();
  } finally {
    kunci.releaseLock();
  }
}

/** Perbandingan teks yang waktunya tidak bergantung pada kecocokan. */
function samaAman_(a, b) {
  a = String(a == null ? '' : a);
  b = String(b == null ? '' : b);
  let beda = a.length ^ b.length;
  const n = Math.max(a.length, b.length);
  for (let i = 0; i < n; i++) beda |= (a.charCodeAt(i) || 0) ^ (b.charCodeAt(i) || 0);
  return beda === 0 && b.length > 0;
}

/** Nilai ya/tidak dari sel (bisa TRUE, "TRUE", "true", 1). Kosong -> bawaan. */
function benar_(v, bawaan) {
  if (v === '' || v === undefined || v === null) return bawaan;
  return v === true || v === 1 || /^(true|1|ya)$/i.test(String(v));
}
