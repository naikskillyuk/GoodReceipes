// Tes logika inti memakai angka contoh yang sama dengan mockup.
// Jalankan: node --test tests/

import test from 'node:test';
import assert from 'node:assert/strict';
import { hargaPerDasar, biayaTakaran, hargaPerSatuanResep, satuanResep, tabelKonversi, keDasar } from '../js/lib/units.js';
import { biayaEksperimen, hitungHPP, hitungPaket, hargaMinimum, marginDariHarga, bulatkanHarga, analisisPenjualan } from '../js/lib/hpp.js';
import { skorPenilaian, skorEksperimen, sahkanNilai } from '../js/lib/skor.js';
import { angka, rupiah, desimal1, persen, bacaRupiah, bacaJumlah, tampilJumlah } from '../js/lib/util.js';

const kakao = { id: 'b1', nama: 'Cokelat bubuk', hargaBeli: 45000, isiKemasan: 500, satuanBeli: 'g' };
const gula = { id: 'b2', nama: 'Gula pasir', hargaBeli: 18000, isiKemasan: 1, satuanBeli: 'kg' };
const telur = { id: 'b3', nama: 'Telur', hargaBeli: 30000, isiKemasan: 1, satuanBeli: 'kg' };
const terigu = { id: 'b4', nama: 'Tepung terigu', hargaBeli: 13000, isiKemasan: 1, satuanBeli: 'kg' };
const susu = { id: 'b5', nama: 'Susu cair', hargaBeli: 18000, isiKemasan: 1, satuanBeli: 'l' };
const roti = { id: 'b6', nama: 'Roti tawar', hargaBeli: 15000, isiKemasan: 10, satuanBeli: 'lembar' };

const konversiKakao = [{ satuan: 'sdm', nilai: 6 }, { satuan: 'sdt', nilai: 2 }];
const konversiTelur = [{ satuan: 'butir', nilai: 55 }];

test('harga per satuan dasar', () => {
  assert.equal(hargaPerDasar(kakao), 90); // Rp 90 per gram
  assert.equal(hargaPerDasar(gula), 18);
  assert.equal(hargaPerDasar(telur), 30);
  assert.equal(hargaPerDasar(susu), 18); // per ml
  assert.equal(hargaPerDasar(roti), 1500); // per lembar
});

test('konversi sendok ke gram dan biayanya', () => {
  assert.equal(keDasar(kakao, konversiKakao, 3, 'sdm'), 18);
  assert.equal(biayaTakaran(kakao, konversiKakao, 3, 'sdm'), 1620);
  assert.equal(biayaTakaran(kakao, konversiKakao, 2, 'sdt'), 360);
});

test('telur: dibeli per kg, dipakai per butir', () => {
  assert.equal(hargaPerSatuanResep(telur, konversiTelur, 'butir'), 1650);
  assert.equal(biayaTakaran(telur, konversiTelur, 3, 'butir'), 4950);
  assert.equal(biayaTakaran(telur, konversiTelur, 165, 'g'), 4950);
});

test('satuan standar: kg, liter, sdm cair', () => {
  assert.equal(biayaTakaran(gula, [], 0.13, 'kg'), 2340);
  assert.equal(biayaTakaran(susu, [], 2, 'sdm'), 540); // 30 ml * 18
  assert.deepEqual(satuanResep(roti, []), ['lembar']);
  assert.ok(satuanResep(kakao, konversiKakao).includes('sdm'));
});

test('konversi buatan sendiri menimpa standar', () => {
  const t = tabelKonversi(susu, [{ satuan: 'sdm', nilai: 14 }]);
  assert.equal(t.sdm, 14);
});

test('satuan tak dikenal menghasilkan NaN, bukan nol', () => {
  assert.ok(Number.isNaN(biayaTakaran(kakao, [], 1, 'sdm')));
  assert.ok(Number.isNaN(biayaTakaran({ ...kakao, isiKemasan: 0 }, [], 1, 'g')));
});

test('biaya bahan satu eksperimen', () => {
  const bahanById = { b2: gula, b3: telur, b4: terigu, b1: kakao };
  const konv = { b1: konversiKakao, b3: konversiTelur };
  const hasil = biayaEksperimen(
    [
      { idBahan: 'b2', jumlah: 130, satuan: 'g' },
      { idBahan: 'b3', jumlah: 3, satuan: 'butir' },
      { idBahan: 'b4', jumlah: 80, satuan: 'g' },
      { idBahan: 'b1', jumlah: 3, satuan: 'sdm' },
    ],
    bahanById,
    konv,
  );
  assert.equal(hasil.total, 2340 + 4950 + 1040 + 1620);
  assert.equal(hasil.bermasalah.length, 0);
  const rusak = biayaEksperimen([{ idBahan: 'tidak-ada', jumlah: 1, satuan: 'g' }], bahanById);
  assert.equal(rusak.bermasalah.length, 1);
  assert.equal(rusak.total, 0);
});

test('HPP, harga minimum, margin, BEP, dan target (angka mockup)', () => {
  const hpp = hitungHPP({
    biayaBahan: 38960,
    porsi: 16,
    biayaLain: [
      { jenis: 'Kemasan', nilai: 1200, dihitungPer: 'packing' }, // 19.200 per resep
      { jenis: 'Gas dan listrik', nilai: 3500, dihitungPer: 'resep' },
      { jenis: 'Tenaga kerja', nilai: 12000, dihitungPer: 'resep' },
    ],
  });
  assert.equal(hpp.totalResep, 73660);
  assert.equal(angka(hpp.hppPorsi), '4.604');
  // Alur per porsi: bahan 38.960/16 + (3.500 + 12.000)/16 + kemasan 1.200 = 2.435 + 968,75 + 1.200
  assert.equal(hpp.alur.bahan, 2435);
  assert.equal(hpp.alur.biayaResep, 968.75);
  assert.equal(hpp.alur.biayaPorsi, 0);
  assert.equal(hpp.alur.packing, 1200);
  assert.equal(hpp.tanpaPacking, 3403.75);
  assert.equal(hpp.alur.bahan + hpp.alur.biayaResep + hpp.alur.biayaPorsi + hpp.alur.packing, hpp.hppPorsi);
  // Biaya per porsi biasa (mis. seasoning) ikut "tanpa packing".
  const dgnSeasoning = hitungHPP({ biayaBahan: 1000, porsi: 10, biayaLain: [{ nilai: 50, dihitungPer: 'porsi' }, { nilai: 300, dihitungPer: 'packing' }] });
  assert.equal(dgnSeasoning.tanpaPacking, 150);
  assert.equal(dgnSeasoning.hppPorsi, 450);

  const min = hargaMinimum(hpp.hppPorsi, 40);
  assert.equal(angka(min), '7.673');
  assert.equal(bulatkanHarga(min), 8000);

  const a = analisisPenjualan({
    hppPorsi: hpp.hppPorsi,
    hargaJual: 8000,
    porsiPerResep: 16,
    modalAwal: 1500000,
    labaTargetBulanan: 3000000,
  });
  assert.equal(persen(a.marginPersen), '42,5%');
  assert.equal(angka(a.labaPorsi), '3.396');
  assert.equal(a.bepPorsi, 442);
  assert.equal(a.bepResep, 28);
  assert.equal(a.porsiBulan, 884);
  assert.equal(a.porsiHari, 30);
  assert.equal(a.omzetBulan, 7072000);
});

test('harga jual di bawah HPP tidak menghasilkan BEP palsu', () => {
  const a = analisisPenjualan({ hppPorsi: 5000, hargaJual: 4000, porsiPerResep: 10, modalAwal: 100000, labaTargetBulanan: 100000 });
  assert.equal(a.untung, false);
  assert.equal(a.bepPorsi, null);
  assert.equal(a.porsiBulan, null);
  assert.ok(a.marginPersen < 0);
});

test('margin 100% atau lebih tidak valid', () => {
  assert.ok(Number.isNaN(hargaMinimum(1000, 100)));
  assert.ok(Number.isNaN(hargaMinimum(1000, -5)));
});

test('skor penilaian dan eksperimen', () => {
  const a = { rasa: 9, tekstur: 8, tampilan: 9, aroma: 8, minatBeli: 9 };
  const b = { rasa: 8, tekstur: 8, tampilan: 8, aroma: 8, minatBeli: 8 };
  assert.equal(skorPenilaian(a), 8.6);
  assert.equal(skorPenilaian(b), 8);
  const s = skorEksperimen([a, b]);
  assert.equal(s.jumlah, 2);
  assert.equal(desimal1(s.rata), '8,3');
  assert.equal(s.perAspek.rasa, 8.5);
  assert.ok(Number.isNaN(skorEksperimen([]).rata));
  assert.equal(sahkanNilai(11), 10);
  assert.equal(sahkanNilai(0), 1);
  assert.equal(sahkanNilai(6.4), 6);
  assert.ok(Number.isNaN(sahkanNilai('abc')));
});

test('format angka Indonesia', () => {
  assert.equal(angka(1234567), '1.234.567');
  assert.equal(angka(8.44, 1), '8,4');
  assert.equal(rupiah(4603.75), 'Rp 4.604');
  assert.equal(rupiah(-360), '−Rp 360');
  assert.equal(rupiah(0), 'Rp 0');
  assert.equal(angka(NaN), '–');
  assert.equal(bacaRupiah('Rp 45.000'), 45000);
  assert.equal(bacaRupiah(''), 0);
  assert.equal(bacaJumlah('1,5'), 1.5);
  assert.equal(bacaJumlah('1.5'), 1.5);
  assert.ok(Number.isNaN(bacaJumlah('abc')));
  assert.ok(Number.isNaN(bacaJumlah('')));
  assert.equal(tampilJumlah(1.5), '1,5');
  assert.equal(tampilJumlah(80), '80');
});

test('margin dari harga yang diinginkan, dan bedanya dengan markup', () => {
  const m = marginDariHarga(5000, 7000);
  assert.equal(m.laba, 2000);
  assert.equal(persen(m.marginPersen), '28,6%');
  assert.equal(persen(m.markupPersen), '40,0%');
  // Margin 40% berarti harga 8.333, bukan 7.000 (itu markup 40%).
  assert.equal(angka(hargaMinimum(5000, 40)), '8.333');
  assert.equal(persen(marginDariHarga(5000, hargaMinimum(5000, 40)).marginPersen), '40,0%');
  assert.ok(Number.isNaN(marginDariHarga(5000, 0).marginPersen));
});

test('HPP paket: biaya paket dihitung sekali', () => {
  const p = hitungPaket({
    isi: [{ biayaProduksi: 6000, jumlah: 1 }, { biayaProduksi: 3000, jumlah: 2 }],
    biayaPaket: [{ nilai: 2500 }, { nilai: 500 }],
  });
  assert.equal(p.totalIsi, 12000);
  assert.equal(p.totalBiaya, 3000);
  assert.equal(p.hppPaket, 15000);
  assert.equal(hitungPaket({ isi: [{ biayaProduksi: NaN, jumlah: 1 }] }).bermasalah.length, 1);
});
