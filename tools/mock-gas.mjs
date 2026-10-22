// Tiruan Google Apps Script di Node, supaya apps-script/Code.gs yang sama bisa
// dijalankan dan diuji tanpa akun Google (dipakai dev-server dan tes).

import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const FOLDER = path.dirname(fileURLToPath(import.meta.url));
const KODE = fs.readFileSync(path.join(FOLDER, '..', 'apps-script', 'Code.gs'), 'utf8');

/**
 * @param {{lembar: Object, foto: Object}} keadaan  data tiruan (bisa disimpan sebagai JSON)
 * @param {{kunci?: string, setelahUbah?: Function}} opsi
 */
export function buatServer(keadaan = { lembar: {}, foto: {} }, opsi = {}) {
  keadaan.lembar ||= {};
  keadaan.foto ||= {};
  const kabari = () => opsi.setelahUbah && opsi.setelahUbah(keadaan);

  class Lembar {
    constructor(nama) {
      this.nama = nama;
      this.maxKolom = 26;
      this.maxBaris = 1000;
      keadaan.lembar[nama] ||= { data: [], format: {} };
    }
    get s() {
      return keadaan.lembar[this.nama];
    }
    getLastRow() {
      return this.s.data.length;
    }
    getLastColumn() {
      return this.s.data.reduce((m, r) => Math.max(m, r.length), 0);
    }
    getMaxColumns() {
      return Math.max(this.maxKolom, this.getLastColumn());
    }
    getMaxRows() {
      return Math.max(this.maxBaris, this.getLastRow());
    }
    insertColumnsAfter(_, n) {
      this.maxKolom += n;
    }
    insertRowsAfter(_, n) {
      this.maxBaris += n;
    }
    setFrozenRows() {}
    getRange(baris, kolom, nBaris = 1, nKolom = 1) {
      const lembar = this;
      return {
        getValues() {
          const hasil = [];
          for (let i = 0; i < nBaris; i++) {
            const r = lembar.s.data[baris - 1 + i] || [];
            hasil.push(Array.from({ length: nKolom }, (_, j) => (r[kolom - 1 + j] === undefined ? '' : r[kolom - 1 + j])));
          }
          return hasil;
        },
        setValues(nilai) {
          nilai.forEach((baru, i) => {
            const idx = baris - 1 + i;
            while (lembar.s.data.length <= idx) lembar.s.data.push([]);
            const r = lembar.s.data[idx];
            baru.forEach((v, j) => {
              // Sel berformat teks tidak pernah menjadi rumus; angka tetap disimpan apa adanya.
              r[kolom - 1 + j] = v;
            });
          });
          kabari();
          return this;
        },
        setNumberFormat(f) {
          lembar.s.format[kolom] = f;
          return this;
        },
      };
    }
  }

  const lembarCache = {};
  const spreadsheet = {
    getSheetByName: (n) => (keadaan.lembar[n] ? (lembarCache[n] ||= new Lembar(n)) : null),
    insertSheet: (n) => (lembarCache[n] = new Lembar(n)),
  };

  const folderAda = { nilai: false };
  const folder = {
    createFile(blob) {
      const id = 'FILE' + (Object.keys(keadaan.foto).length + 1) + Math.random().toString(36).slice(2, 8);
      keadaan.foto[id] = { mime: blob.mime, nama: blob.nama, base64: Buffer.from(blob.bytes).toString('base64') };
      kabari();
      return { getId: () => id, setSharing() {} };
    },
  };

  const konteks = {
    console,
    Date,
    JSON,
    Math,
    Number,
    String,
    Object,
    Array,
    SpreadsheetApp: { getActiveSpreadsheet: () => spreadsheet },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (s) => ({ isi: s, setMimeType() { return this; }, getContent() { return s; } }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: {
      base64Decode: (b64) => [...Buffer.from(b64, 'base64')],
      newBlob: (bytes, mime, nama) => ({ bytes, mime, nama }),
      getUuid: () => crypto.randomUUID(),
    },
    DriveApp: {
      Access: { ANYONE_WITH_LINK: 'ANYONE_WITH_LINK' },
      Permission: { VIEW: 'VIEW' },
      getFoldersByName: () => ({ hasNext: () => folderAda.nilai, next: () => folder }),
      createFolder: () => ((folderAda.nilai = true), folder),
    },
  };
  vm.createContext(konteks);
  const kode = opsi.kunci ? KODE.replace(/const KUNCI = '[^']*';/, `const KUNCI = '${opsi.kunci}';`) : KODE;
  vm.runInContext(kode, konteks, { filename: 'Code.gs' });

  return {
    keadaan,
    /** Kirim permintaan seperti POST ke Web App; mengembalikan objek jawaban. */
    panggil(isi) {
      const teks = typeof isi === 'string' ? isi : JSON.stringify(isi);
      const keluar = konteks.doPost({ postData: { contents: teks } });
      return JSON.parse(keluar.getContent());
    },
    get() {
      return JSON.parse(konteks.doGet().getContent());
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
