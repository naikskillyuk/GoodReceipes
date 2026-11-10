// Sampling: produk yang dikirim gratis untuk dicoba (calon pelanggan, reseller, kafe, acara).
// Setiap catatan memotong stok produk dan menyimpan biayanya (HPP) supaya pengeluaran promosi terdokumentasi.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Stat, Kosong, InputAngka, FotoInput } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tampilToast, tanya, Modal } from '../ui/pesan.js';
import { daftarStokMakanan, simpanSampling, hapusSampling, daftarSampling, ringkasSampling, biayaItemSampling, stokMakanan, tampilanToko, tampilHp } from '../lib/toko.js';
import { rentangPreset, keCsv, keIsoTanggal } from '../lib/laporan.js';
import { fotoSrc } from '../lib/repo.js';
import { rupiah, angka, tanggal, tampilJumlah } from '../lib/util.js';
import { keInputWaktu, dariInputWaktu } from './catat-pesanan.js';

const RENTANG = [
  { kunci: 'bulan-ini', label: 'Bulan ini' },
  { kunci: 'bulan-lalu', label: 'Bulan lalu' },
  { kunci: '30-hari', label: '30 hari' },
  { kunci: 'semua', label: 'Semua' },
];
const SARAN_TUJUAN = ['Calon pelanggan', 'Calon reseller', 'Kafe / toko', 'Acara / bazar', 'Endorse / konten', 'Tes produk baru'];

function batasRentang(kunci) {
  if (kunci === 'semua') return { sejak: 0, sampai: Infinity };
  const r = rentangPreset(kunci);
  const akhir = new Date(r.sampai);
  akhir.setDate(akhir.getDate() + 1);
  return { sejak: r.dari, sampai: akhir.getTime() };
}

function unduhCsv(nama, baris) {
  const url = URL.createObjectURL(new Blob([keCsv(baris)], { type: 'text/csv;charset=utf-8' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nama;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Satu baris per produk yang dikirim, untuk Excel / Google Sheets. */
function barisCsv(db, daftar, dapur) {
  const biayaKolom = dapur ? ['HPP per porsi (Rp)', 'Biaya (Rp)'] : [];
  const baris = [['Tanggal', 'Penerima', 'WhatsApp', 'Lokasi', 'Tujuan', 'Produk', 'Jumlah', ...biayaKolom, 'Catatan', 'Tanggapan', 'Dicatat oleh']];
  for (const s of daftar) {
    for (const i of s.item || []) {
      const biaya = biayaItemSampling(db, i);
      const ada = Number.isFinite(biaya);
      const nilai = dapur ? [ada && i.jumlah ? Math.round(biaya / i.jumlah) : '', ada ? Math.round(biaya) : ''] : [];
      baris.push([keIsoTanggal(s.waktu), s.penerima, s.hp ? tampilHp(s.hp) : '', s.lokasi, s.tujuan, i.nama, i.jumlah, ...nilai, s.catatan, s.tanggapan, s.oleh]);
    }
  }
  return baris;
}

function FormSampling({ k, lama, onTutup }) {
  const { db } = k;
  const dapur = !tampilanToko(db);
  const produk = daftarStokMakanan(db);
  const stok = stokMakanan(db);
  // Saat mengubah, stok yang sudah terpotong oleh catatan ini dihitung tersedia lagi.
  const dariIni = new Map(((lama && lama.item) || []).map((i) => [i.idResep, Number(i.jumlah) || 0]));
  const tersedia = (idResep) => (stok.get(idResep) || 0) + (dariIni.get(idResep) || 0);
  const [f, setF] = useState(() => ({
    penerima: lama ? lama.penerima : '',
    hp: lama && lama.hp ? tampilHp(lama.hp) : '',
    lokasi: lama ? lama.lokasi : '',
    tujuan: lama ? lama.tujuan : '',
    catatan: lama ? lama.catatan : '',
    tanggapan: lama ? lama.tanggapan : '',
    waktu: keInputWaktu(lama ? lama.waktu : Date.now()),
    baris: lama ? lama.item.map((i) => ({ idResep: i.idResep, jumlah: i.jumlah })) : [{ idResep: '', jumlah: 1 }],
    foto: lama ? fotoSrc(lama, 'fotoLokal', 'fotoUrl') : '',
  }));
  const atur = (ubah) => setF((x) => ({ ...x, ...ubah }));
  const aturBaris = (i, ubah) => atur({ baris: f.baris.map((b, j) => (j === i ? { ...b, ...ubah } : b)) });
  const kurang = f.baris.filter((b) => b.idResep && b.jumlah > tersedia(b.idResep) + 1e-9);

  const simpan = () => {
    try {
      simpanSampling(db, {
        id: lama ? lama.id : '',
        penerima: f.penerima,
        hp: f.hp,
        lokasi: f.lokasi,
        tujuan: f.tujuan,
        catatan: f.catatan,
        tanggapan: f.tanggapan,
        item: f.baris,
        waktu: dariInputWaktu(f.waktu) || Date.now(),
        oleh: (db.pengaturan.akun && db.pengaturan.akun.nama) || '',
        ...(dapur ? { foto: f.foto } : {}),
      });
      tampilToast(lama ? 'Catatan sampling diperbarui.' : 'Sampling dicatat. Stok produk sudah dipotong.');
      onTutup();
    } catch (e) {
      tampilToast(e.message);
    }
  };

  return html`<${Modal} judul=${lama ? 'Ubah sampling' : 'Catat sampling'} onTutup=${onTutup}><div class="kolom" style="gap:12px">
    <div class="dua-kolom">
      <label class="bidang"><span>Penerima</span><input class="input" maxlength="80" value=${f.penerima} onInput=${(e) => atur({ penerima: e.target.value })} placeholder="mis. Kafe Senja / Bu Rina" /></label>
      <label class="bidang"><span>WhatsApp (opsional)</span><input class="input" inputmode="tel" value=${f.hp} onInput=${(e) => atur({ hp: e.target.value })} placeholder="0812…" /></label>
    </div>
    <div class="dua-kolom">
      <label class="bidang"><span>Lokasi (opsional)</span><input class="input" maxlength="120" value=${f.lokasi} onInput=${(e) => atur({ lokasi: e.target.value })} placeholder="mis. Jl. Merdeka 10, Bandung" /></label>
      <label class="bidang"><span>Tanggal kirim</span><input class="input" type="datetime-local" value=${f.waktu} onInput=${(e) => atur({ waktu: e.target.value })} /></label>
    </div>
    <label class="bidang"><span>Tujuan (opsional)</span>
      <input class="input" maxlength="120" list="saran-tujuan-sampling" value=${f.tujuan} onInput=${(e) => atur({ tujuan: e.target.value })} placeholder="mis. Calon reseller" />
      <datalist id="saran-tujuan-sampling">${SARAN_TUJUAN.map((t) => html`<option value=${t} />`)}</datalist>
    </label>

    <div class="label-kecil">Produk yang dikirim</div>
    ${produk.length === 0
      ? html`<p class="bantu">Belum ada produk di stok. Catat produksi atau tambah stok dulu.</p>`
      : f.baris.map(
          (b, i) => html`<div class="baris-sampling" key=${i}>
            <select class="pilih" aria-label=${'Produk ' + (i + 1)} value=${b.idResep} onChange=${(e) => aturBaris(i, { idResep: e.target.value })}>
              <option value="">Pilih produk…</option>
              ${produk.map((p) => html`<option value=${p.resep.id} selected=${p.resep.id === b.idResep}>${p.resep.nama} (stok ${tampilJumlah(tersedia(p.resep.id))})</option>`)}
            </select>
            <${InputAngka} kelas="input kecil" aria-label=${'Jumlah produk ' + (i + 1)} nilai=${b.jumlah} onUbah=${(n) => aturBaris(i, { jumlah: n })} placeholder="0" />
            <button type="button" class="btn kecil abu" aria-label=${'Hapus produk ' + (i + 1)} disabled=${f.baris.length === 1} onClick=${() => atur({ baris: f.baris.filter((_, j) => j !== i) })}><${Ikon} nama="sampah" ukuran=${16} /></button>
          </div>`,
        )}
    ${produk.length > 0 && html`<button type="button" class="btn kecil" style="align-self:flex-start" onClick=${() => atur({ baris: [...f.baris, { idResep: '', jumlah: 1 }] })}><${Ikon} nama="plus" ukuran=${16} />Tambah produk</button>`}
    ${kurang.length > 0 && html`<p class="bantu teks-buruk">Stok tidak cukup untuk ${kurang.map((b) => (produk.find((p) => p.resep.id === b.idResep) || { resep: { nama: '' } }).resep.nama).join(', ')}. Tetap bisa dicatat, stok jadi minus sampai dihitung ulang.</p>`}

    <label class="bidang"><span>Catatan (opsional)</span><textarea class="input kecil" rows="2" maxlength="500" value=${f.catatan} onInput=${(e) => atur({ catatan: e.target.value })} placeholder="mis. titip ke kasir, minta dicoba untuk menu kafe"></textarea></label>
    <label class="bidang"><span>Tanggapan penerima (bisa diisi nanti)</span><textarea class="input kecil" rows="2" maxlength="500" value=${f.tanggapan} onInput=${(e) => atur({ tanggapan: e.target.value })} placeholder="mis. suka, minta penawaran 50 pcs/minggu"></textarea></label>
    ${dapur && html`<${FotoInput} nilai=${f.foto} onUbah=${(x) => atur({ foto: x })} judul=${f.foto ? 'Ganti foto bukti' : 'Foto bukti (opsional)'} bantu="Foto saat serah terima atau produk yang dikirim." aksen="var(--hijau)" ikon="kamera" />`}

    <div class="baris-btn">
      <button class="btn solid" disabled=${!f.penerima.trim() || !f.baris.some((b) => b.idResep && b.jumlah > 0)} onClick=${simpan}><${Ikon} nama="centang" ukuran=${18} />${lama ? 'Simpan' : 'Catat sampling'}</button>
      <button class="btn abu" onClick=${onTutup}>Batal</button>
    </div>
  </div><//>`;
}

function KartuSampling({ k, s, onUbah, dapur }) {
  const { db } = k;
  const biaya = (s.item || []).map((i) => biayaItemSampling(db, i));
  const total = biaya.filter(Number.isFinite).reduce((j, n) => j + n, 0);
  const foto = fotoSrc(s, 'fotoLokal', 'fotoUrl');
  const hapus = async () => {
    const ok = await tanya({ judul: 'Hapus catatan sampling?', teks: `Catatan untuk ${s.penerima} dihapus dan stok produknya dikembalikan.`, ya: 'Hapus', bahaya: true });
    if (!ok) return;
    hapusSampling(db, s.id);
    tampilToast('Catatan sampling dihapus.');
  };
  return html`<article class="kartu kolom kartu-sampling">
    <div class="baris-pisah">
      <div>
        <b>${s.penerima}</b>
        <div class="teks-kecil">${tanggal(s.waktu)}${s.tujuan ? ` · ${s.tujuan}` : ''}${s.oleh ? ` · oleh ${s.oleh}` : ''}</div>
      </div>
      ${dapur && html`<b style="white-space:nowrap">${biaya.some(Number.isFinite) ? rupiah(total) : '–'}</b>`}
    </div>
    ${(s.lokasi || s.hp) && html`<div class="teks-kecil">${s.lokasi}${s.lokasi && s.hp ? ' · ' : ''}${s.hp && html`<a class="tautan-hijau" href=${'https://wa.me/' + s.hp} target="_blank" rel="noopener">${tampilHp(s.hp)}</a>`}</div>`}
    <ul class="isi-sampling">
      ${(s.item || []).map((i) => html`<li key=${i.idResep}><span>${i.nama}</span><b>${tampilJumlah(i.jumlah)}</b></li>`)}
    </ul>
    ${s.catatan && html`<p class="teks-kecil">${s.catatan}</p>`}
    ${s.tanggapan ? html`<p class="tanggapan-sampling"><b>Tanggapan:</b> ${s.tanggapan}</p>` : html`<p class="teks-kecil">Belum ada tanggapan.</p>`}
    ${foto && html`<img class="foto-sampling" src=${foto} alt=${'Foto sampling ' + s.penerima} loading="lazy" referrerpolicy="no-referrer" />`}
    <div class="baris-btn">
      <button class="btn kecil" onClick=${onUbah}><${Ikon} nama="ubah" ukuran=${16} />${s.tanggapan ? 'Ubah' : 'Ubah / isi tanggapan'}</button>
      <button class="btn kecil bahaya" onClick=${hapus}><${Ikon} nama="sampah" ukuran=${16} />Hapus</button>
    </div>
  </article>`;
}

export function Sampling({ k }) {
  const { db } = k;
  const dapur = !tampilanToko(db); // biaya (HPP) hanya untuk admin, seperti laba di laporan
  const [rentang, setRentang] = useState('bulan-ini');
  const [form, setForm] = useState(null); // null | 'baru' | catatan lama
  const [cari, setCari] = useState('');
  const daftar = daftarSampling(db, batasRentang(rentang));
  const q = cari.trim().toLowerCase();
  const tampil = q ? daftar.filter((s) => [s.penerima, s.lokasi, s.tujuan, s.catatan, s.tanggapan, ...(s.item || []).map((i) => i.nama)].join(' ').toLowerCase().includes(q)) : daftar;
  const r = ringkasSampling(db, tampil);
  const label = RENTANG.find((x) => x.kunci === rentang).label.toLowerCase();

  return html`<${Kerangka} k=${k} aktif="sampling" plus=${{ onKlik: () => setForm('baru'), label: 'Catat sampling' }}>
    <${Hero} warna="var(--kuning)" label="Promosi" judul="Sampling" kembali="/" stat=${html`<${Stat} nilai=${r.kiriman} label="kiriman" />`}>
      <p class="hero-sub">Catat produk yang dikirim gratis untuk dicoba. Stok produk otomatis berkurang${dapur ? ' dan biayanya (HPP) ikut tercatat' : ''}.</p>
    <//>
    <div class="isi">
      <div class="baris-cari">
        <input class="input" type="search" placeholder="Cari penerima, lokasi, produk…" aria-label="Cari sampling" value=${cari} onInput=${(e) => setCari(e.target.value)} />
        <button class="btn solid" onClick=${() => setForm('baru')}><${Ikon} nama="plus" ukuran=${18} />Catat sampling</button>
      </div>
      <div class="chips" role="group" aria-label="Rentang waktu">
        ${RENTANG.map((x) => html`<button type="button" key=${x.kunci} class=${'chip' + (x.kunci === rentang ? ' aktif' : '')} aria-pressed=${x.kunci === rentang} onClick=${() => setRentang(x.kunci)}>${x.label}</button>`)}
      </div>

      ${daftar.length === 0
        ? html`<${Kosong} judul="Belum ada sampling" teks=${rentang === 'semua' ? 'Catat produk yang dikirim untuk dicoba calon pelanggan, reseller, atau kafe.' : `Tidak ada sampling ${label}. Coba rentang lain atau catat yang baru.`}>
            <button class="btn solid" onClick=${() => setForm('baru')}>Catat sampling</button>
          <//>`
        : html`
          <section class="kartu kolom" aria-labelledby="h-ringkas-sampling">
            <div class="baris-pisah">
              <h2 class="judul-kecil" id="h-ringkas-sampling">Ringkasan ${label}</h2>
              <button type="button" class="btn kecil" onClick=${() => unduhCsv(`sampling-${rentang}.csv`, barisCsv(db, tampil, dapur))}><${Ikon} nama="unduh" ukuran=${16} />CSV</button>
            </div>
            <div class="ubin-tren">
              <div class="ubin"><small>Kiriman</small><b>${angka(r.kiriman)}</b></div>
              <div class="ubin"><small>Produk dikirim</small><b>${tampilJumlah(r.porsi)}</b></div>
              ${dapur && html`<div class="ubin"><small>Biaya (HPP)</small><b>${rupiah(r.biaya)}</b>${r.tanpaHpp && html`<small class="teks-kecil">sebagian tanpa HPP</small>`}</div>`}
            </div>
            ${r.produk.length > 0 && html`<ul class="isi-sampling">
              ${r.produk.map((p) => html`<li key=${p.idResep}><span>${p.nama}</span><b>${tampilJumlah(p.jumlah)}${dapur && p.biaya ? html` <small class="teks-kecil">· ${rupiah(p.biaya)}</small>` : ''}</b></li>`)}
            </ul>`}
            ${dapur && r.tanpaHpp && html`<p class="bantu">Biaya hanya menghitung produk yang sudah punya HPP. Simpan HPP resepnya di halaman Resep & HPP.</p>`}
          </section>
          ${tampil.length === 0 && html`<p class="bantu">Tidak ada yang cocok dengan "${cari}".</p>`}
          <div class="daftar-sampling">
            ${tampil.map((s) => html`<${KartuSampling} key=${s.id} k=${k} s=${s} dapur=${dapur} onUbah=${() => setForm(s)} />`)}
          </div>`}
      ${form && html`<${FormSampling} key=${form === 'baru' ? 'baru' : form.id} k=${k} lama=${form === 'baru' ? null : form} onTutup=${() => setForm(null)} />`}
    </div>
  <//>`;
}
