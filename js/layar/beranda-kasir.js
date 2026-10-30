// Beranda akun kasir (toko): pesanan yang perlu ditindaklanjuti dan tren penjualan
// (pemasukan per hari, jumlah pesanan, rata-rata, belum dibayar, menu favorit).

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Stat } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tautan } from '../ui/router.js';
import { pesananFollowUp, trenPenjualan, ringkasPenjualan, ubahStatusPesanan, namaItem, ambilToko, caraAmbil, statusBayar } from '../lib/toko.js';
import { ambilMerek } from '../lib/repo.js';
import { rupiah, angka } from '../lib/util.js';
import { teksJadwal } from './pesanan.js';

const GRUP = [
  { kunci: 'konfirmasi', judul: 'Bukti bayar masuk', bantu: 'Cek WhatsApp toko, lalu tandai lunas.' },
  { kunci: 'tagih', judul: 'Belum dibayar', bantu: 'Ingatkan pembeli untuk membayar.' },
  { kunci: 'baru', judul: 'Pesanan baru', bantu: 'Mulai proses di dapur.' },
  { kunci: 'diproses', judul: 'Sedang diproses', bantu: 'Tandai siap bila sudah jadi.' },
  { kunci: 'siap', judul: 'Siap diambil', bantu: 'Kabari pembeli, lalu tandai selesai.' },
];

const PERIODE = [
  { hari: 7, label: '7 hari' },
  { hari: 30, label: '30 hari' },
];

const HARI = ['Min', 'Sen', 'Sel', 'Rab', 'Kam', 'Jum', 'Sab'];

/** Rp 1,2 jt / Rp 350 rb untuk label sumbu yang ringkas. */
export function rupiahRingkas(n) {
  if (n >= 1e6) return 'Rp ' + (n / 1e6).toLocaleString('id-ID', { maximumFractionDigits: 1 }) + ' jt';
  if (n >= 1e3) return 'Rp ' + Math.round(n / 1e3).toLocaleString('id-ID') + ' rb';
  return rupiah(n);
}

function tautanWa(p, teks) {
  return p.hp ? `https://wa.me/${p.hp}?text=${encodeURIComponent(teks)}` : '';
}

/** Tombol tindak lanjut sesuai kelompok pesanan. */
function AksiFollowUp({ db, p, grup }) {
  const ojol = caraAmbil(p) === 'ojol';
  if (grup === 'konfirmasi') return html`<a class="btn solid kecil" href=${tautan('/pesanan/' + p.id + '?bayar=1')}>Cek & tandai lunas</a>`;
  if (grup === 'tagih') {
    const wa = tautanWa(p, `Halo ${p.nama || ''}, pesanan #${p.nomor} sebesar ${rupiah(p.total)} masih menunggu pembayaran. Bila sudah transfer, mohon kirim bukti bayarnya ya. Terima kasih!`);
    return wa ? html`<a class="btn kecil" href=${wa} target="_blank" rel="noopener"><${Ikon} nama="kirim" ukuran=${16} />Ingatkan</a>` : html`<a class="btn kecil" href=${tautan('/pesanan/' + p.id)}>Buka</a>`;
  }
  if (grup === 'baru') return html`<button class="btn solid kecil" onClick=${() => ubahStatusPesanan(db, p.id, 'diproses')}>Mulai proses</button>`;
  if (grup === 'diproses') return html`<button class="btn solid kecil" onClick=${() => ubahStatusPesanan(db, p.id, 'siap')}>Tandai siap</button>`;
  const wa = tautanWa(p, `Halo ${p.nama || ''}, pesanan #${p.nomor} ${ojol ? 'sudah siap. Silakan pesan Gojek / Grab ke toko sekarang' : 'sudah siap diambil'}. Terima kasih!`);
  return html`${wa && html`<a class="btn kecil" href=${wa} target="_blank" rel="noopener"><${Ikon} nama="kirim" ukuran=${16} />Kabari</a>`}
    <button class="btn solid kecil" onClick=${() => ubahStatusPesanan(db, p.id, 'selesai')}>Selesai</button>`;
}

function BarisFollowUp({ db, p, grup }) {
  const item = Array.isArray(p.item) ? p.item : [];
  const lunas = statusBayar(db, p.id).lunas;
  return html`<div class="baris-follow">
    <a class="baris-follow-isi" href=${tautan('/pesanan/' + p.id)}>
      <b>#${p.nomor}${p.nama ? ' · ' + p.nama : ''}</b>
      <small class="teks-kecil">${item.map((i) => `${i.jumlah}× ${namaItem(i)}`).join(', ')}</small>
      <span class="baris-follow-info">
        <b>${rupiah(p.total)}</b>
        ${grup !== 'tagih' && grup !== 'konfirmasi' && !lunas && html`<span class="tanda kendala">Belum bayar</span>`}
        ${p.jadwal > 0 && html`<span class="jadwal-pesanan"><${Ikon} nama="jam" ukuran=${13} />${teksJadwal(p.jadwal)}</span>`}
        ${p.kendala && html`<span class="tanda kendala">Ada kendala</span>`}
      </span>
    </a>
    <span class="baris-follow-aksi"><${AksiFollowUp} db=${db} p=${p} grup=${grup} /></span>
  </div>`;
}

function FollowUp({ db }) {
  const grup = pesananFollowUp(db);
  const jumlah = GRUP.reduce((j, g) => j + grup[g.kunci].length, 0);
  return html`<section class="kartu kolom" aria-labelledby="h-follow">
    <div class="baris-pisah">
      <h2 class="judul-kecil" id="h-follow">Perlu ditindaklanjuti</h2>
      <a class="tautan-kecil" href=${tautan('/pesanan')}>Semua pesanan</a>
    </div>
    ${jumlah === 0 && html`<p class="bantu">Semua pesanan sudah ditangani. Pesanan baru dari kasir dan link pemesanan muncul di sini.</p>`}
    ${GRUP.filter((g) => grup[g.kunci].length).map(
      (g) => html`<div class="grup-follow" key=${g.kunci}>
        <div class="grup-follow-judul"><b>${g.judul}</b><span class="angka-bulat">${grup[g.kunci].length}</span><small>${g.bantu}</small></div>
        ${grup[g.kunci].slice(0, 6).map((p) => html`<${BarisFollowUp} key=${p.id} db=${db} p=${p} grup=${g.kunci} />`)}
        ${grup[g.kunci].length > 6 && html`<a class="tautan-kecil" href=${tautan('/pesanan?tab=' + (g.kunci === 'konfirmasi' || g.kunci === 'tagih' ? 'menunggu' : 'aktif'))}>+${grup[g.kunci].length - 6} lainnya</a>`}
      </div>`,
    )}
  </section>`;
}

/** Perubahan dibanding periode sebelumnya, mis. "+12% dari 7 hari sebelumnya". */
function Perubahan({ kini, lalu, hari }) {
  if (!lalu) return html`<small class="teks-kecil">${kini ? 'Belum ada data pembanding' : 'Belum ada transaksi'}</small>`;
  const persen = Math.round(((kini - lalu) / lalu) * 100);
  const naik = persen >= 0;
  return html`<small class=${'perubahan ' + (naik ? 'naik' : 'turun')}>${naik ? '▲' : '▼'} ${Math.abs(persen)}% dari ${hari} hari sebelumnya</small>`;
}

/**
 * Grafik batang pemasukan per hari (satu seri, satu warna). Arahkan / sentuh batang untuk melihat angkanya.
 * satuan 'bulan' = satu batang per bulan (laporan rentang panjang).
 */
export function GrafikPemasukan({ perHari, satuan = 'hari' }) {
  const maks = Math.max(...perHari.map((h) => h.pemasukan), 0);
  const iMaks = perHari.findIndex((h) => h.pemasukan === maks && maks > 0);
  const banyak = perHari.length > 10;
  const bulanan = satuan === 'bulan';
  const label = (h, i) => {
    const d = new Date(h.mulai);
    if (bulanan) return !banyak || i % 3 === 0 ? d.toLocaleDateString('id-ID', { month: 'short' }) : '';
    if (!banyak) return HARI[d.getDay()];
    return i % 5 === 0 || i === perHari.length - 1 ? `${d.getDate()}/${d.getMonth() + 1}` : '';
  };
  return html`<figure class="grafik-batang" aria-label=${bulanan ? 'Pemasukan per bulan' : 'Pemasukan per hari'}>
    <div class="grafik-area">
      ${perHari.map((h, i) => {
        const d = new Date(h.mulai);
        const tanggal = bulanan ? d.toLocaleDateString('id-ID', { month: 'long', year: 'numeric' }) : d.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short' });
        const teks = `${tanggal}: ${rupiah(h.pemasukan)} · ${h.pesanan} pesanan`;
        return html`<div class="kolom-batang" key=${h.mulai} tabindex="0" aria-label=${teks}>
          ${i === iMaks && html`<span class="label-batang">${rupiahRingkas(h.pemasukan)}</span>`}
          <span class="batang" style=${`height:${maks ? Math.max(h.pemasukan > 0 ? 3 : 0, (h.pemasukan / maks) * 100) : 0}%`}></span>
          <span class="tip-batang" role="tooltip"><b>${rupiah(h.pemasukan)}</b>${tanggal} · ${h.pesanan} pesanan</span>
        </div>`;
      })}
    </div>
    <div class="grafik-sumbu" aria-hidden="true">${perHari.map((h, i) => html`<span key=${h.mulai}>${label(h, i)}</span>`)}</div>
    <figcaption class="teks-kecil">${maks ? `Arahkan atau sentuh batang untuk melihat rincian per ${bulanan ? 'bulan' : 'hari'}.` : 'Belum ada pemasukan di periode ini.'}</figcaption>
  </figure>`;
}

function MenuFavorit({ favorit }) {
  if (!favorit.length) return html`<p class="bantu">Belum ada penjualan di periode ini.</p>`;
  const maks = favorit[0].jumlah || 1;
  return html`<ol class="daftar-favorit">
    ${favorit.map(
      (f, i) => html`<li key=${f.nama}>
        <span class="peringkat">${i + 1}</span>
        <div class="favorit-isi">
          <div class="baris-pisah"><b>${f.nama}</b><span class="teks-kecil">${angka(f.jumlah)} terjual</span></div>
          <span class="batang-favorit" aria-hidden="true"><span style=${`width:${(f.jumlah / maks) * 100}%`}></span></span>
          <small class="teks-kecil">${rupiah(f.omzet)}</small>
        </div>
      </li>`,
    )}
  </ol>`;
}

function Tren({ db }) {
  const [hari, setHari] = useState(7);
  const t = trenPenjualan(db, { hari });
  return html`<section class="kartu kolom" aria-labelledby="h-tren">
    <div class="baris-pisah">
      <h2 class="judul-kecil" id="h-tren">Tren penjualan</h2>
      <div class="chips" role="group" aria-label="Periode">
        ${PERIODE.map((p) => html`<button type="button" key=${p.hari} class=${'chip' + (p.hari === hari ? ' aktif' : '')} aria-pressed=${p.hari === hari} onClick=${() => setHari(p.hari)}>${p.label}</button>`)}
      </div>
    </div>
    <div class="ubin-tren">
      <div class="ubin"><small>Pemasukan</small><b>${rupiah(t.pemasukan)}</b><${Perubahan} kini=${t.pemasukan} lalu=${t.pemasukanSebelum} hari=${hari} /></div>
      <div class="ubin"><small>Pesanan</small><b>${angka(t.jumlahPesanan)}</b><${Perubahan} kini=${t.jumlahPesanan} lalu=${t.pesananSebelum} hari=${hari} /></div>
      <div class="ubin"><small>Rata-rata per pesanan</small><b>${rupiah(t.rataRata)}</b></div>
      <div class="ubin"><small>Belum dibayar</small><b>${rupiah(t.belumBayar.nilai)}</b><small class="teks-kecil">${t.belumBayar.jumlah} pesanan</small></div>
    </div>
    <h3 class="judul-sub">Pemasukan per hari</h3>
    <${GrafikPemasukan} perHari=${t.perHari} />
    <h3 class="judul-sub">Menu favorit</h3>
    <${MenuFavorit} favorit=${t.favorit} />
    <a class="btn lebar" href=${tautan(`/laporan?preset=${hari === 7 ? '7-hari' : '30-hari'}`)}><${Ikon} nama="daftar" ukuran=${18} />Laporan lengkap</a>
  </section>`;
}

export function BerandaKasir({ k }) {
  const { db } = k;
  const r = ringkasPenjualan(db);
  const nama = ambilToko(db).namaToko || ambilMerek(db).nama;
  return html`<${Kerangka} k=${k} aktif="rumah" plus=${{ href: '/kasir', label: 'Pesanan baru' }}>
    <${Hero} warna="var(--hijau)" label=${nama} judul="Beranda" stat=${html`<${Stat} nilai=${r.aktif} label="pesanan aktif" />`}>
      <p class="hero-sub">Hari ini ${r.jumlahPesanan} pesanan · ${rupiah(r.omzet)} masuk${r.belumBayar ? ` · ${r.belumBayar} belum bayar` : ''}.</p>
    <//>
    <div class="isi">
      <div class="baris-btn">
        <a class="btn solid" href=${tautan('/kasir')}><${Ikon} nama="struk" ukuran=${18} />Buka katalog</a>
        <a class="btn" href=${tautan('/catat-pesanan')}><${Ikon} nama="ubah" ukuran=${18} />Catat pesanan</a>
      </div>
      <div class="kolom-2">
        <div class="kolom"><${FollowUp} db=${db} /></div>
        <div class="kolom"><${Tren} db=${db} /></div>
      </div>
    </div>
  <//>`;
}
