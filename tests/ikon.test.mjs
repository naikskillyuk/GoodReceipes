// Ikon kategori dipilih dari nama kategori, juga untuk kategori buatan pengguna.

import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { kunciIkonKategori, srcIkonKategori, IKON_UMUM } from '../js/ui/ikon-kategori.js';
import { KATEGORI_AWAL } from '../js/lib/repo.js';

test('kategori bawaan dan buatan pengguna mendapat ikon yang cocok', () => {
  const harapan = {
    Kue: 'kue', Minuman: 'minuman', Lauk: 'lauk', Camilan: 'camilan', Roti: 'roti',
    'Kue Basah': 'kue', 'Es Krim': 'eskrim', 'Es Kopi': 'eskrim', 'Kopi & Teh': 'kopi', 'Jus Buah': 'jus',
    'Nasi Box': 'nasi', 'Mie Ayam': 'mie', Soto: 'sup', 'Seafood': 'seafood', Sambal: 'sambal',
    'Ayam Goreng': 'lauk', Pizza: 'pizza', 'Frozen Food': 'eskrim', Brownies: 'kue', 'Salad Sehat': 'salad',
    Hampers: IKON_UMUM, '': IKON_UMUM,
  };
  for (const [nama, kunci] of Object.entries(harapan)) assert.equal(kunciIkonKategori(nama), kunci, nama);
});

test('setiap ikon yang bisa dipilih ada berkasnya, termasuk semua kategori bawaan', () => {
  const kunci = new Set([IKON_UMUM, ...KATEGORI_AWAL.map((k) => kunciIkonKategori(k.nama ?? k))]);
  for (const k of ['kue', 'minuman', 'lauk', 'camilan', 'roti', 'nasi', 'salad', 'sup', 'mie', 'kopi', 'eskrim', 'donat', 'pizza', 'burger', 'seafood', 'sambal', 'cokelat', 'jus']) kunci.add(k);
  for (const k of kunci) assert.ok(fs.existsSync(new URL('../' + srcIkonKategori(k, { kunci: true }), import.meta.url)), k);
});
