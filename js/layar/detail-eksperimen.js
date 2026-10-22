// Detail eksperimen: foto, juara, skor, catatan kegagalan, bahan, langkah, ulasan, dan aksi.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Foto, Kosong } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { Modal, tanya, tampilToast } from '../ui/pesan.js';
import { tautan, pergi } from '../ui/router.js';
import { PenggeserNilai, NILAI_AWAL } from './penilai.js';
import {
  skorDariDB, penilaianEksperimen, biayaBahanEksperimen, biayaLainResep, fotoSrc, ubahJuara,
  hapusEksperimen, tambahPenilaianPemilik, eksperimenResep,
} from '../lib/repo.js';
import { hitungHPP } from '../lib/hpp.js';
import { ASPEK, skorPenilaian } from '../lib/skor.js';
import { desimal1, angka, rupiah, tampilJumlah, tanggal } from '../lib/util.js';

function ModalNilaiSendiri({ k, e, onTutup }) {
  const { db } = k;
  const [nilai, setNilai] = useState(NILAI_AWAL);
  const [disentuh, setDisentuh] = useState({});
  const [komentar, setKomentar] = useState('');
  const [galat, setGalat] = useState('');
  const simpan = () => {
    if (ASPEK.some((a) => !disentuh[a.kunci])) {
      setGalat('Geser kelima penggeser dulu.');
      return;
    }
    tambahPenilaianPemilik(db, e.id, nilai, komentar, (db.pengaturan.namaPemilik || '').trim());
    tampilToast('Penilaian Anda ditambahkan.');
    onTutup();
  };
  return html`<${Modal} judul=${`Nilai Eksperimen ${e.nomor}`} onTutup=${onTutup}>
    <${PenggeserNilai} nilai=${nilai} disentuh=${disentuh} onUbah=${(kunci, v) => (setNilai((n) => ({ ...n, [kunci]: v })), setDisentuh((d) => ({ ...d, [kunci]: true })), setGalat(''))} />
    <label class="bidang"><span>Catatan</span><textarea class="area" rows="3" maxlength="1000" value=${komentar} onInput=${(ev) => setKomentar(ev.target.value)}></textarea></label>
    ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
    <div class="baris-btn">
      <button class="btn abu lebar" onClick=${onTutup}>Batal</button>
      <button class="btn solid lebar" onClick=${simpan}>Simpan nilai</button>
    </div>
  <//>`;
}

export function DetailEksperimen({ k, id }) {
  const { db } = k;
  const [nilaiTerbuka, setNilaiTerbuka] = useState(false);
  const e = db.ambil('Eksperimen', id);
  const resep = e && db.ambil('Resep', e.idResep);
  if (!e || !resep) {
    return html`<${Kerangka} k=${k} aktif="resep">
      <${Hero} label="Eksperimen" judul="Tidak ada" kembali="/resep" />
      <div class="isi"><${Kosong} judul="Eksperimen tidak ditemukan" teks="Mungkin sudah dihapus, atau belum tersinkron ke perangkat ini."><a class="btn solid" href=${tautan('/resep')}>Ke daftar resep</a><//></div>
    <//>`;
  }

  const kat = db.ambil('Kategori', resep.idKategori);
  const warna = kat ? kat.warna : 'var(--tomat)';
  const skor = skorDariDB(db, id);
  const ulasan = penilaianEksperimen(db, id);
  const biaya = biayaBahanEksperimen(db, id);
  const hpp = hitungHPP({ biayaBahan: biaya.total, biayaLain: biayaLainResep(db, resep.id), porsi: Number(e.porsi) || 0 });
  const juara = resep.idJuara === id;
  const juaraLain = resep.idJuara && !juara ? db.ambil('Eksperimen', resep.idJuara) : null;
  const foto = fotoSrc(e, 'fotoHasilLokal', 'fotoHasilUrl');
  const acuan = fotoSrc(resep, 'fotoAcuanLokal', 'fotoAcuanUrl');

  const tandai = () => {
    const jadi = ubahJuara(db, id);
    tampilToast(jadi ? `Eksperimen ${e.nomor} ditandai sebagai juara.` : 'Status juara dilepas.');
  };
  const hapus = async () => {
    const ya = await tanya({
      judul: `Hapus Eksperimen ${e.nomor}?`,
      teks: `Bahan, langkah, foto, dan ${ulasan.length} penilaian ikut terhapus. Ini tidak bisa dibatalkan.`,
      ya: 'Hapus eksperimen',
      bahaya: true,
    });
    if (!ya) return;
    hapusEksperimen(db, id);
    tampilToast('Eksperimen dihapus.');
    pergi('/resep/' + resep.id, { ganti: true });
  };

  const info = [];
  if (e.porsi) info.push(['Hasil', `${angka(e.porsi, e.porsi % 1 ? 1 : 0)} ${e.satuanPorsi || 'porsi'}`]);
  if (e.suhuC) info.push(['Suhu', `${e.suhuC}°C`]);
  if (e.waktuMenit) info.push(['Waktu', `${e.waktuMenit} menit`]);

  const kiri = html`<div class="kolom">
    <div class=${'kartu' + (juara ? ' sorot' : '')}>
      <div class="baris-pisah">
        <div style="min-width:0">
          <b style="display:block;font-size:16px">${juara ? 'Eksperimen juara' : 'Tandai sebagai juara'}</b>
          <span class="teks-kecil" style=${juara ? 'color:#4a4230' : ''}>
            ${juara ? 'Tampil di Beranda sebagai resep juara.' : juaraLain ? `Akan menggantikan Eksperimen ${juaraLain.nomor}.` : 'Pilih sendiri eksperimen terbaik untuk resep ini.'}
          </span>
        </div>
        <button class=${'btn' + (juara ? '' : ' solid')} onClick=${tandai}><${Ikon} nama="piala" ukuran=${18} />${juara ? 'Lepas' : 'Tandai'}</button>
      </div>
    </div>

    <div class="kartu">
      <div class="baris-pisah" style="margin-bottom:12px">
        <div>
          <div class="label-kecil">Penilaian</div>
          <div class="teks-kecil">${skor.jumlah ? `dari ${skor.jumlah} penilai` : 'Belum ada yang menilai'}</div>
        </div>
        <span class="skor-bulat" style="background:var(--krem)">${skor.jumlah ? desimal1(skor.rata) : '–'}</span>
      </div>
      <div class="bulat-skor">
        ${ASPEK.map((a) => html`<div class="aspek" key=${a.kunci}>
          <b class=${skor.jumlah ? '' : 'kosong'}>${skor.jumlah ? desimal1(skor.perAspek[a.kunci]) : '–'}</b>${a.label}
        </div>`)}
      </div>
      ${!skor.jumlah && html`<p class="bantu" style="margin-top:12px">Bagikan kode QR supaya orang lain bisa menilai, atau nilai sendiri dari tombol di bawah.</p>`}
    </div>

    ${e.catatanKegagalan &&
    html`<div class="kartu" style="background:#fdeae6;border-color:#e9a99b">
      <div class="label-kecil" style="color:#6d1b0e;margin-bottom:6px">Catatan kegagalan</div>
      <p style="line-height:1.5;overflow-wrap:anywhere;white-space:pre-wrap">${e.catatanKegagalan}</p>
    </div>`}

    <details class="lipat" open>
      <summary>Bahan (${biaya.rincian.length}) <${Ikon} nama="bawah" ukuran=${20} /></summary>
      <div class="badan">
        ${biaya.rincian.length === 0
          ? html`<p class="bantu">Belum ada bahan tercatat.</p>`
          : biaya.rincian.map((b) => html`<div class="bahan-baris" key=${b.id}>
              <span>${b.bahan ? b.bahan.nama : 'Bahan terhapus'}${b.bahan && b.bahan.merek ? html`<small class="teks-kecil"> · ${b.bahan.merek}</small>` : ''}</span>
              <span class="nilai">${tampilJumlah(b.jumlah)} ${b.satuan} · ${Number.isFinite(b.biaya) ? rupiah(b.biaya) : '–'}</span>
            </div>`)}
        ${biaya.rincian.length > 0 && html`<div class="bahan-baris" style="font-weight:800"><span>Total biaya bahan</span><span class="nilai">${rupiah(biaya.total)}</span></div>`}
        ${biaya.bermasalah.length > 0 && html`<p class="galat-teks" style="margin-top:6px">Ada bahan yang biayanya belum bisa dihitung. Periksa Daftar Bahan.</p>`}
      </div>
    </details>

    <details class="lipat" open>
      <summary>Langkah (${(e.langkah || []).length}) <${Ikon} nama="bawah" ukuran=${20} /></summary>
      <div class="badan">
        ${(e.langkah || []).length === 0
          ? html`<p class="bantu">Belum ada langkah tercatat.</p>`
          : e.langkah.map((l, i) => html`<div class="langkah-baris" key=${i}><span class="nomor-langkah">${i + 1}</span><span style="overflow-wrap:anywhere">${l}</span></div>`)}
      </div>
    </details>
  </div>`;

  const kanan = html`<div class="kolom">
    <div class="kartu">
      <div class="label-kecil" style="margin-bottom:4px">Ringkasan</div>
      ${info.map(([a, b]) => html`<div class="hasil-baris" key=${a}><span>${a}</span><b style="font-size:18px">${b}</b></div>`)}
      <div class="hasil-baris"><span>Biaya bahan</span><b style="font-size:18px">${rupiah(biaya.total)}</b></div>
      <div class="hasil-baris"><span>HPP per porsi</span><b style="font-size:18px">${rupiah(hpp.hppPorsi)}</b></div>
      <div class="teks-kecil">HPP termasuk biaya lain yang diisi di tab HPP & Harga.</div>
    </div>

    <div class="kolom" style="gap:10px">
      <a class="pil" href=${tautan(`/eksperimen/${id}/bagikan`)}>Bagikan kode QR<span class="ujung"><${Ikon} nama="qr" /></span></a>
      <div class="baris-btn">
        <button class="btn" onClick=${() => setNilaiTerbuka(true)}><${Ikon} nama="bintang" ukuran=${18} />Nilai sendiri</button>
        <a class="btn" href=${tautan(`/resep/${resep.id}/eksperimen/baru?dari=${id}`)}><${Ikon} nama="salin" ukuran=${18} />Duplikat</a>
        <a class="btn" href=${tautan(`/eksperimen/${id}/ubah`)}><${Ikon} nama="ubah" ukuran=${18} />Ubah</a>
        <button class="btn bahaya" onClick=${hapus}><${Ikon} nama="sampah" ukuran=${18} />Hapus</button>
      </div>
    </div>

    ${(acuan || resep.targetDicapai) &&
    html`<details class="lipat">
      <summary>Target dan gambar acuan <${Ikon} nama="bawah" ukuran=${20} /></summary>
      <div class="badan" style="display:flex;gap:12px;align-items:flex-start">
        ${acuan && html`<div class="foto-mini"><${Foto} src=${acuan} alt="Gambar acuan" /></div>`}
        <p style="line-height:1.5;overflow-wrap:anywhere">${resep.targetDicapai || 'Tidak ada target tertulis.'}</p>
      </div>
    </details>`}

    <details class="lipat" open>
      <summary>Ulasan (${ulasan.length}) <${Ikon} nama="bawah" ukuran=${20} /></summary>
      <div class="badan kolom">
        ${ulasan.length === 0
          ? html`<p class="bantu">Belum ada ulasan.</p>`
          : ulasan.map(
              (p) => html`<div class="ulasan" key=${p.id}>
                <div class="ulasan-kepala"><b>${p.namaPenilai || 'Tanpa nama'}</b><span class="ulasan-skor">${desimal1(skorPenilaian(p))}</span></div>
                ${p.komentar && html`<p>${p.komentar}</p>`}
                <small>${tanggal(p.waktu)}${p.dariPemilik ? ' · pemilik' : ''}</small>
              </div>`,
            )}
      </div>
    </details>
  </div>`;

  return html`<${Kerangka} k=${k} aktif="resep">
    <${Hero}
      warna=${warna}
      label=${resep.nama}
      judul=${`Eksperimen ${e.nomor}`}
      panjang=${true}
      kembali=${'/resep/' + resep.id}
      kanan=${html`<a class="bulat" href=${tautan(`/eksperimen/${id}/ubah`)} aria-label="Ubah eksperimen"><${Ikon} nama="ubah" /></a>`}
      stat=${html`<div class="foto-besar" role="img" aria-label=${foto ? 'Foto hasil akhir' : 'Belum ada foto'}><${Foto} src=${foto} ikon="kamera" ukuranIkon=${32} /></div>`}
    >
      ${juara && html`<div style="margin-top:12px"><span class="chip-hero"><${Ikon} nama="piala" ukuran=${14} />Juara</span></div>`}
    <//>
    <div class="isi"><div class="kolom-2">${kiri}${kanan}</div></div>
    ${nilaiTerbuka && html`<${ModalNilaiSendiri} k=${k} e=${e} onTutup=${() => setNilaiTerbuka(false)} />`}
  <//>`;
}

export function Bandingkan({ k, id }) {
  const { db } = k;
  const resep = db.ambil('Resep', id);
  if (!resep) return html`<${Kerangka} k=${k} aktif="resep"><${Hero} label="Bandingkan" judul="Tidak ada" kembali="/resep" /><//>`;
  const kat = db.ambil('Kategori', resep.idKategori);
  const daftar = eksperimenResep(db, id);
  const lain = biayaLainResep(db, id);
  const kolom = daftar.map((e) => {
    const skor = skorDariDB(db, e.id);
    const biaya = biayaBahanEksperimen(db, e.id);
    const hpp = hitungHPP({ biayaBahan: biaya.total, biayaLain: lain, porsi: Number(e.porsi) || 0 });
    return { e, skor, biaya, hpp };
  });
  const baris = [
    { label: 'Skor rata-rata', nilai: (c) => (c.skor.jumlah ? c.skor.rata : NaN), fmt: desimal1, terbaik: 'maks' },
    ...ASPEK.map((a) => ({ label: a.label, nilai: (c) => (c.skor.jumlah ? c.skor.perAspek[a.kunci] : NaN), fmt: desimal1, terbaik: 'maks' })),
    { label: 'Jumlah penilai', nilai: (c) => c.skor.jumlah, fmt: (n) => angka(n) },
    { label: 'Hasil jadi', nilai: (c) => Number(c.e.porsi) || NaN, fmt: (n, c) => `${angka(n, n % 1 ? 1 : 0)} ${c.e.satuanPorsi || ''}` },
    { label: 'Biaya bahan', nilai: (c) => c.biaya.total, fmt: rupiah, terbaik: 'min' },
    { label: 'HPP per porsi', nilai: (c) => c.hpp.hppPorsi, fmt: rupiah, terbaik: 'min' },
    { label: 'Suhu', nilai: (c) => Number(c.e.suhuC) || NaN, fmt: (n) => n + '°C' },
    { label: 'Waktu', nilai: (c) => Number(c.e.waktuMenit) || NaN, fmt: (n) => n + ' mnt' },
  ];
  const sel = (b, c, terbaik) => {
    const n = b.nilai(c);
    const teks = Number.isFinite(n) ? b.fmt(n, c) : '–';
    return html`<td class=${terbaik === n && Number.isFinite(n) ? 'terbaik' : ''}>${teks}</td>`;
  };
  const targetTerbaik = (b) => {
    if (!b.terbaik) return null;
    const angkaSah = kolom.map((c) => b.nilai(c)).filter(Number.isFinite);
    if (angkaSah.length < 2 || angkaSah.every((x) => x === angkaSah[0])) return null;
    return b.terbaik === 'maks' ? Math.max(...angkaSah) : Math.min(...angkaSah);
  };

  // Bahan: gabungan semua bahan yang pernah dipakai
  const idBahan = [];
  const jumlahPer = {};
  for (const c of kolom) {
    for (const r of c.biaya.rincian) {
      if (!idBahan.includes(r.idBahan)) idBahan.push(r.idBahan);
      jumlahPer[c.e.id + '|' + r.idBahan] = `${tampilJumlah(r.jumlah)} ${r.satuan}`;
    }
  }

  return html`<${Kerangka} k=${k} aktif="resep">
    <${Hero} warna=${kat ? kat.warna : 'var(--navy)'} label="Bandingkan eksperimen" judul=${resep.nama} kembali=${'/resep/' + id} />
    <div class="isi">
      <div class="tabel-gulir">
        <table class="tabel-banding">
          <thead>
            <tr>
              <th scope="col"></th>
              ${kolom.map((c) => html`<th scope="col" class=${resep.idJuara === c.e.id ? 'juara' : ''}><a href=${tautan('/eksperimen/' + c.e.id)}>Eks. ${c.e.nomor}${resep.idJuara === c.e.id ? ' ★' : ''}</a></th>`)}
            </tr>
          </thead>
          <tbody>
            ${baris.map((b) => {
              const t = targetTerbaik(b);
              return html`<tr><th scope="row">${b.label}</th>${kolom.map((c) => sel(b, c, t))}</tr>`;
            })}
            ${idBahan.length > 0 && html`<tr class="sub"><th scope="colgroup" colspan=${kolom.length + 1}>Bahan yang dipakai</th></tr>`}
            ${idBahan.map((ib) => {
              const bahan = db.ambil('Bahan', ib);
              return html`<tr key=${ib}><th scope="row">${bahan ? bahan.nama : 'Bahan terhapus'}</th>${kolom.map((c) => html`<td>${jumlahPer[c.e.id + '|' + ib] || '–'}</td>`)}</tr>`;
            })}
          </tbody>
        </table>
      </div>
      <p class="bantu">Sorotan kuning menandai nilai terbaik pada barisnya (skor tertinggi, biaya terendah). ★ menandai eksperimen juara.</p>
    </div>
  <//>`;
}
