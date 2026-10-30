// Laporan toko per rentang tanggal: ringkasan + grafik, pesanan, produk terlaris, pelanggan teratas, dan stok produk.
// Bisa dicetak / disimpan PDF (seluruh laporan) dan diunduh per tabel sebagai CSV (Excel / Google Sheets).

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Kosong } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tautan, pergi } from '../ui/router.js';
import { buatLaporan, rentangPreset, PRESET_RENTANG, keIsoTanggal, dariIsoTanggal, keCsv, tabelCsv, awalHari, SARING_STATUS, saringPesanan } from '../lib/laporan.js';
import { statusBayar, STATUS_PESANAN, LABEL_METODE, namaItem, ambilToko, tampilHp, hapusPesanan, peranAkun, AKSI_MASSAL, prosesMassal } from '../lib/toko.js';
import { tanya, tampilToast } from '../ui/pesan.js';
import { ambilMerek } from '../lib/repo.js';
import { rupiah, angka, tanggal, tampilJumlah } from '../lib/util.js';
import { GrafikPemasukan } from './beranda-kasir.js';
import { jam } from './pesanan.js';

const BAGIAN = [
  { kunci: 'ringkasan', label: 'Ringkasan' },
  { kunci: 'pesanan', label: 'Pesanan' },
  { kunci: 'produk', label: 'Top produk' },
  { kunci: 'pelanggan', label: 'Top pelanggan' },
  { kunci: 'stok', label: 'Stok produk' },
];
const BATAS_BARIS = 50;

/** Rentang dari alamat (?dari=2026-10-01&sampai=2026-10-30); bawaan bulan ini. */
function rentangDariKueri(kueri) {
  const dari = dariIsoTanggal(kueri.dari);
  const sampai = dariIsoTanggal(kueri.sampai);
  if (Number.isFinite(dari) && Number.isFinite(sampai)) return { dari: Math.min(dari, sampai), sampai: Math.max(dari, sampai) };
  return rentangPreset(kueri.preset || 'bulan-ini');
}

const alamatRentang = (dari, sampai) => `/laporan?dari=${keIsoTanggal(dari)}&sampai=${keIsoTanggal(sampai)}`;

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

function Bagian({ kunci, judul, sub, onCsv, children }) {
  return html`<section class="kartu kolom laporan-bagian" id=${'lap-' + kunci} aria-labelledby=${'h-lap-' + kunci}>
    <div class="baris-pisah">
      <div><h2 class="judul-kecil" id=${'h-lap-' + kunci}>${judul}</h2>${sub && html`<p class="teks-kecil">${sub}</p>`}</div>
      ${onCsv && html`<button type="button" class="btn kecil tak-cetak" onClick=${onCsv}><${Ikon} nama="unduh" ukuran=${16} />CSV</button>`}
    </div>
    ${children}
  </section>`;
}

function Tabel({ kepala, children, kosong }) {
  if (kosong) return html`<p class="bantu">${kosong}</p>`;
  return html`<div class="tabel-gulir"><table class="tabel-data tabel-laporan">
    <thead><tr>${kepala.map((k) => (typeof k === 'string' ? html`<th>${k}</th>` : k && k.angka !== undefined ? html`<th class="angka">${k.angka}</th>` : html`<th class="tak-cetak">${k}</th>`))}</tr></thead>
    <tbody>${children}</tbody>
  </table></div>`;
}

function Lebih({ total, semua, setSemua }) {
  if (total <= BATAS_BARIS) return null;
  return html`<button type="button" class="btn abu lebar tak-cetak" onClick=${() => setSemua(!semua)}>${semua ? 'Tampilkan lebih sedikit' : `Tampilkan semua (${angka(total)})`}</button>`;
}

function Ringkasan({ lap }) {
  const r = lap.ringkasan;
  const jamRamai = [...lap.perJam].filter((j) => j.pesanan).sort((a, b) => b.pesanan - a.pesanan || a.jam - b.jam).slice(0, 5);
  const maksJam = jamRamai.length ? jamRamai[0].pesanan : 1;
  return html`
    <div class="ubin-tren ubin-laporan">
      <div class="ubin"><small>Penjualan</small><b>${rupiah(r.penjualan)}</b><small class="teks-kecil">${angka(r.jumlahPesanan)} pesanan</small></div>
      <div class="ubin"><small>Uang masuk</small><b>${rupiah(r.pemasukan)}</b><small class="teks-kecil">pembayaran lunas</small></div>
      <div class="ubin"><small>Rata-rata per pesanan</small><b>${rupiah(r.rataRata)}</b></div>
      <div class="ubin"><small>Item terjual</small><b>${angka(r.itemTerjual)}</b></div>
      <div class="ubin"><small>Belum dibayar</small><b>${rupiah(r.belumBayar.nilai)}</b><small class="teks-kecil">${r.belumBayar.jumlah} pesanan</small></div>
      <div class="ubin"><small>Pelanggan</small><b>${angka(r.pelanggan)}</b><small class="teks-kecil">${r.pelangganBaru} baru${r.pembeliUmum ? ` · ${r.pembeliUmum} pesanan tanpa nama` : ''}</small></div>
      <div class="ubin"><small>Diskon diberikan</small><b>${rupiah(r.diskon)}</b></div>
      <div class="ubin"><small>Pesanan batal</small><b>${angka(r.batal)}</b>${r.menunggu > 0 && html`<small class="teks-kecil">${r.menunggu} menunggu bayar</small>`}</div>
    </div>
    <p class="bantu">Penjualan = total pesanan yang dibuat di rentang ini (tanpa yang batal / belum dibayar online). Uang masuk = pembayaran yang lunas di rentang ini.</p>
    <h3 class="judul-sub">Uang masuk per ${lap.grafik.satuan}</h3>
    <${GrafikPemasukan} perHari=${lap.grafik.ember} satuan=${lap.grafik.satuan} />
    <div class="kolom-2 laporan-dua">
      <div class="kolom">
        <h3 class="judul-sub">Metode bayar</h3>
        <${Tabel} kepala=${['Metode', { angka: 'Transaksi' }, { angka: 'Nilai' }]}>
          ${lap.metode.map((m) => html`<tr key=${m.metode}><td>${m.label}</td><td class="angka">${angka(m.jumlah)}</td><td class="angka">${rupiah(m.nilai)}</td></tr>`)}
        <//>
        <h3 class="judul-sub">Sumber pesanan</h3>
        <${Tabel} kepala=${['Sumber', { angka: 'Pesanan' }, { angka: 'Penjualan' }]} kosong=${lap.sumber.length ? '' : 'Belum ada pesanan.'}>
          ${lap.sumber.map((s) => html`<tr key=${s.sumber}><td>${s.sumber}</td><td class="angka">${angka(s.pesanan)}</td><td class="angka">${rupiah(s.penjualan)}</td></tr>`)}
        <//>
      </div>
      <div class="kolom">
        <h3 class="judul-sub">Jam ramai</h3>
        ${jamRamai.length === 0
          ? html`<p class="bantu">Belum ada pesanan.</p>`
          : html`<ol class="daftar-favorit">
              ${jamRamai.map(
                (j, i) => html`<li key=${j.jam}>
                  <span class="peringkat">${i + 1}</span>
                  <div class="favorit-isi">
                    <div class="baris-pisah"><b>${String(j.jam).padStart(2, '0')}.00–${String(j.jam).padStart(2, '0')}.59</b><span class="teks-kecil">${angka(j.pesanan)} pesanan</span></div>
                    <span class="batang-favorit" aria-hidden="true"><span style=${`width:${(j.pesanan / maksJam) * 100}%`}></span></span>
                    <small class="teks-kecil">${rupiah(j.penjualan)}</small>
                  </div>
                </li>`,
              )}
            </ol>`}
      </div>
    </div>`;
}

/** Chip saring status pesanan (tersimpan di alamat, jadi ikut saat dicetak / dibagikan). */
function SaringStatus({ db, lap, status, alamat }) {
  return html`<div class="chips tak-cetak laporan-status" role="group" aria-label="Saring status pesanan">
    ${SARING_STATUS.map((s) => {
      const n = saringPesanan(db, lap.pesanan, s.kunci).length;
      const aktif = s.kunci === status;
      if (!n && !aktif && s.kunci) return null;
      return html`<a key=${s.kunci || 'semua'} class=${'chip' + (aktif ? ' aktif' : '')} aria-current=${aktif ? 'true' : null} href=${tautan(alamat + (s.kunci ? '&status=' + s.kunci : ''))}>${s.label} (${angka(n)})</a>`;
    })}
  </div>`;
}

/**
 * Daftar pesanan laporan. Pesanan yang dicentang bisa diubah statusnya / ditandai lunas sekaligus;
 * admin juga bisa menghapusnya (mis. pesanan uji coba / salah catat).
 */
function TabelPesanan({ db, pesanan, status }) {
  const [semua, setSemua] = useState(false);
  const [pilih, setPilih] = useState(() => new Set());
  const [aksi, setAksi] = useState('');
  const admin = peranAkun(db) === 'dapur';
  const daftar = semua ? pesanan : pesanan.slice(0, BATAS_BARIS);
  const ada = pesanan.filter((p) => pilih.has(p.id));
  const semuaDipilih = pesanan.length > 0 && ada.length === pesanan.length;
  const balik = (id) => setPilih((x) => {
    const baru = new Set(x);
    if (baru.has(id)) baru.delete(id);
    else baru.add(id);
    return baru;
  });
  const hapus = async () => {
    const lunas = ada.filter((p) => statusBayar(db, p.id).lunas);
    const ya = await tanya({
      judul: `Hapus ${ada.length} pesanan?`,
      teks: `Pesanan dan pembayarannya dihapus dari semua perangkat dan laporan${lunas.length ? `, termasuk ${lunas.length} yang sudah lunas (${rupiah(lunas.reduce((j, p) => j + (Number(p.total) || 0), 0))})` : ''}. Stok yang terpotong dikembalikan. Tidak bisa dibatalkan.`,
      ya: `Hapus ${ada.length} pesanan`,
      bahaya: true,
    });
    if (!ya) return;
    ada.forEach((p) => hapusPesanan(db, p.id));
    setPilih(new Set());
    tampilToast(`${ada.length} pesanan dihapus.`);
  };
  const terapkan = async () => {
    const a = AKSI_MASSAL.find((x) => x.kunci === aksi);
    if (!a) return;
    const lunas = aksi.startsWith('lunas');
    const ya = await tanya({
      judul: `${a.label}: ${ada.length} pesanan?`,
      teks: aksi === 'batal'
        ? 'Stok produk dikembalikan. Pesanan yang sudah dibayar perlu dikembalikan uangnya secara manual.'
        : lunas
          ? 'Pembayaran dicatat lunas sebesar total tiap pesanan. Pesanan yang sudah lunas atau batal dilewati.'
          : 'Pesanan yang sudah berstatus ini dilewati.',
      ya: a.label,
      bahaya: aksi === 'batal',
    });
    if (!ya) return;
    const n = prosesMassal(db, ada.map((p) => p.id), aksi);
    setPilih(new Set());
    setAksi('');
    tampilToast(n ? `${n} pesanan diperbarui: ${a.label.toLowerCase()}.` : 'Tidak ada pesanan yang perlu diubah.');
  };
  const kepala = [...(pesanan.length ? [html`<input type="checkbox" aria-label="Pilih semua pesanan" checked=${semuaDipilih} onChange=${() => setPilih(semuaDipilih ? new Set() : new Set(pesanan.map((p) => p.id)))} />`] : []), 'Nomor', 'Waktu', 'Pembeli', 'Isi', 'Status', 'Bayar', { angka: 'Total' }, ''];
  return html`${ada.length > 0 && html`<div class="laporan-pilih tak-cetak" role="group" aria-label="Aksi pesanan terpilih">
      <span><b>${ada.length}</b> pesanan dipilih: ${ada.slice(0, 3).map((p) => p.nama || '#' + p.nomor).join(', ')}${ada.length > 3 ? ` +${ada.length - 3}` : ''}</span>
      <span class="baris-btn">
        <select class="input kecil" aria-label="Ubah pesanan terpilih" value=${aksi} onChange=${(e) => setAksi(e.target.value)}>
          <option value="">Ubah jadi…</option>
          ${AKSI_MASSAL.map((x) => html`<option key=${x.kunci} value=${x.kunci}>${x.label}</option>`)}
        </select>
        <button type="button" class="btn kecil solid" disabled=${!aksi} onClick=${terapkan}>Terapkan</button>
        <button type="button" class="btn kecil abu" onClick=${() => setPilih(new Set())}>Batal pilih</button>
        ${admin && html`<button type="button" class="btn kecil bahaya" onClick=${hapus}><${Ikon} nama="sampah" ukuran=${16} />Hapus ${ada.length} pesanan</button>`}
      </span>
    </div>`}
    <${Tabel} kepala=${kepala} kosong=${pesanan.length ? '' : status ? 'Tidak ada pesanan dengan status ini di rentang ini.' : 'Tidak ada pesanan di rentang ini.'}>
      ${daftar.map((p) => {
        const s = statusBayar(db, p.id);
        return html`<tr key=${p.id} class=${p.status === 'batal' ? 'mati' : ''}>
          ${html`<td class="tak-cetak"><input type="checkbox" aria-label=${'Pilih pesanan #' + p.nomor} checked=${pilih.has(p.id)} onChange=${() => balik(p.id)} /></td>`}
          <td><a href=${tautan('/pesanan/' + p.id)}><b>#${p.nomor}</b></a></td>
          <td class="nowrap">${tanggal(p.waktu)}<br /><small class="teks-kecil">${jam(p.waktu)}</small></td>
          <td>${p.nama || html`<span class="teks-kecil">–</span>`}</td>
          <td class="sel-isi"><small>${(Array.isArray(p.item) ? p.item : []).map((i) => `${i.jumlah}× ${namaItem(i)}`).join(', ')}</small></td>
          <td><span class=${'lencana-status s-' + p.status}>${STATUS_PESANAN[p.status] || p.status}</span></td>
          <td>${s.lunas ? LABEL_METODE[s.bayar.metode] || 'Lunas' : html`<span class="teks-buruk">Belum</span>`}</td>
          <td class="angka"><b>${rupiah(p.total)}</b></td>
          <td class="aksi tak-cetak"><a class="btn kecil" href=${tautan('/pesanan/' + p.id + '/struk')} aria-label=${'Struk pesanan #' + p.nomor}><${Ikon} nama="struk" ukuran=${16} /></a></td>
        </tr>`;
      })}
    <//>
    <${Lebih} total=${pesanan.length} semua=${semua} setSemua=${setSemua} />`;
}

function TabelProduk({ lap }) {
  const [semua, setSemua] = useState(false);
  const daftar = semua ? lap.produk : lap.produk.slice(0, BATAS_BARIS);
  const maks = lap.produk.length ? lap.produk[0].jumlah || 1 : 1;
  return html`<${Tabel} kepala=${['#', 'Produk', { angka: 'Terjual' }, { angka: 'Pesanan' }, { angka: 'Penjualan' }]} kosong=${lap.produk.length ? '' : 'Belum ada produk terjual di rentang ini.'}>
      ${daftar.map(
        (x, i) => html`<tr key=${x.nama + i}>
          <td><span class="peringkat">${i + 1}</span></td>
          <td><b>${x.nama}</b><span class="batang-favorit" aria-hidden="true"><span style=${`width:${(x.jumlah / maks) * 100}%`}></span></span></td>
          <td class="angka"><b>${angka(x.jumlah)}</b></td>
          <td class="angka">${angka(x.pesanan)}</td>
          <td class="angka">${rupiah(x.penjualan)}</td>
        </tr>`,
      )}
    <//>
    <${Lebih} total=${lap.produk.length} semua=${semua} setSemua=${setSemua} />`;
}

function TabelPelanggan({ lap }) {
  const [semua, setSemua] = useState(false);
  const daftar = semua ? lap.pelanggan : lap.pelanggan.slice(0, BATAS_BARIS);
  return html`<${Tabel} kepala=${['#', 'Pelanggan', 'WhatsApp', { angka: 'Pesanan' }, { angka: 'Belanja' }, 'Terakhir']} kosong=${lap.pelanggan.length ? '' : 'Belum ada pesanan dengan nama / nomor pembeli di rentang ini.'}>
      ${daftar.map(
        (c, i) => html`<tr key=${c.kunci}>
          <td><span class="peringkat">${i + 1}</span></td>
          <td><b>${c.nama}</b>${c.baru && html` <span class="tanda baru">Baru</span>`}</td>
          <td class="nowrap">${c.hp ? tampilHp(c.hp) : html`<span class="teks-kecil">–</span>`}</td>
          <td class="angka">${angka(c.pesanan)}</td>
          <td class="angka"><b>${rupiah(c.belanja)}</b></td>
          <td class="nowrap">${tanggal(c.terakhir)}</td>
        </tr>`,
      )}
    <//>
    <${Lebih} total=${lap.pelanggan.length} semua=${semua} setSemua=${setSemua} />`;
}

function TabelStok({ lap, hariIni }) {
  const j = (n) => (n ? tampilJumlah(n) : html`<span class="teks-kecil">–</span>`);
  return html`<${Tabel} kepala=${['Produk', { angka: 'Awal' }, { angka: 'Produksi' }, { angka: 'Tambah' }, { angka: 'Terjual' }, { angka: 'Rusak' }, { angka: 'Koreksi' }, { angka: 'Akhir' }, ...(hariIni ? [] : [{ angka: 'Sekarang' }])]} kosong=${lap.stok.length ? '' : 'Belum ada stok produk.'}>
    ${lap.stok.map(
      (s) => html`<tr key=${s.idResep}>
        <td><b>${s.nama}</b><br /><small class="teks-kecil">${s.satuan}</small></td>
        <td class="angka">${tampilJumlah(s.awal)}</td>
        <td class="angka">${j(s.produksi)}</td>
        <td class="angka">${j(s.masuk)}</td>
        <td class="angka">${j(s.terjual)}</td>
        <td class="angka">${j(s.rusak)}</td>
        <td class="angka">${s.koreksi ? (s.koreksi > 0 ? '+' : '') + tampilJumlah(s.koreksi) : j(0)}</td>
        <td class=${'angka' + (s.akhir <= 0 ? ' teks-buruk' : '')}><b>${tampilJumlah(s.akhir)}</b></td>
        ${!hariIni && html`<td class="angka">${tampilJumlah(s.sekarang)}</td>`}
      </tr>`,
    )}
  <//>`;
}

export function Laporan({ k }) {
  const { db, rute } = k;
  const { dari, sampai } = rentangDariKueri(rute.kueri);
  const lap = buatLaporan(db, { dari, sampai });
  const hariIni = awalHari();
  const sampaiHariIni = lap.sampai >= hariIni;
  const preset = PRESET_RENTANG.find((p) => {
    const r = rentangPreset(p.kunci);
    return r.dari === lap.dari && r.sampai === lap.sampai;
  });
  const namaToko = ambilToko(db).namaToko || ambilMerek(db).nama;
  const teksRentang = lap.dari === lap.sampai ? tanggal(lap.dari) : `${tanggal(lap.dari)} – ${tanggal(lap.sampai)}`;
  const status = SARING_STATUS.some((s) => s.kunci === rute.kueri.status) ? rute.kueri.status : '';
  const labelStatus = status ? SARING_STATUS.find((s) => s.kunci === status).label : '';
  const pesanan = saringPesanan(db, lap.pesanan, status);
  const nilaiPesanan = pesanan.reduce((j, p) => j + (Number(p.total) || 0), 0);
  const namaBerkas = (bagian) => `laporan-${bagian}${bagian === 'pesanan' && status ? '-' + status : ''}-${keIsoTanggal(lap.dari)}_${keIsoTanggal(lap.sampai)}.csv`;
  const csv = (bagian) => () => unduhCsv(namaBerkas(bagian), tabelCsv(db, lap, bagian, { status }));
  const ubahTanggal = (kunci, nilai) => {
    const t = dariIsoTanggal(nilai);
    if (!Number.isFinite(t)) return;
    pergi((kunci === 'dari' ? alamatRentang(t, Math.max(t, lap.sampai)) : alamatRentang(Math.min(lap.dari, t), t)) + (status ? '&status=' + status : ''), { ganti: true });
  };
  const keBagian = (kunci) => {
    const el = document.getElementById('lap-' + kunci);
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return html`<${Kerangka} k=${k} aktif="laporan">
    <${Hero} warna="var(--kuning)" label=${namaToko} judul="Laporan" kembali="/">
      <p class="hero-sub">${teksRentang} · ${angka(lap.ringkasan.jumlahPesanan)} pesanan · ${rupiah(lap.ringkasan.penjualan)}</p>
    <//>
    <div class="isi laporan">
      <header class="laporan-kepala-cetak">
        <b>${namaToko}</b>
        <h1>Laporan penjualan</h1>
        <p>${teksRentang} · dicetak ${tanggal(Date.now())} ${jam(Date.now())}</p>
      </header>

      <section class="kartu kolom tak-cetak laporan-filter" aria-label="Rentang tanggal">
        <div class="chips" role="group" aria-label="Pilihan cepat">
          ${PRESET_RENTANG.map((p) => {
            const r = rentangPreset(p.kunci);
            const aktif = preset && preset.kunci === p.kunci;
            return html`<a key=${p.kunci} class=${'chip' + (aktif ? ' aktif' : '')} aria-current=${aktif ? 'true' : null} href=${tautan(alamatRentang(r.dari, r.sampai) + (status ? '&status=' + status : ''))}>${p.label}</a>`;
          })}
        </div>
        <div class="laporan-tanggal">
          <label class="bidang"><span>Dari tanggal</span><input class="input" type="date" value=${keIsoTanggal(lap.dari)} max=${keIsoTanggal(hariIni)} onChange=${(e) => ubahTanggal('dari', e.target.value)} /></label>
          <label class="bidang"><span>Sampai tanggal</span><input class="input" type="date" value=${keIsoTanggal(lap.sampai)} onChange=${(e) => ubahTanggal('sampai', e.target.value)} /></label>
        </div>
        <div class="baris-btn">
          <button class="btn solid" onClick=${() => window.print()}><${Ikon} nama="unduh" ukuran=${18} />Cetak / simpan PDF</button>
          <button class="btn" onClick=${csv('ringkasan')}><${Ikon} nama="unduh" ukuran=${18} />Unduh ringkasan (CSV)</button>
        </div>
        <nav class="chips laporan-loncat" aria-label="Bagian laporan">
          ${BAGIAN.map((b) => html`<button type="button" key=${b.kunci} class="chip" onClick=${() => keBagian(b.kunci)}>${b.label}</button>`)}
        </nav>
      </section>

      ${lap.pesanan.length === 0 && lap.ringkasan.pemasukan === 0
        ? html`<${Kosong} judul="Belum ada transaksi" teks=${`Tidak ada pesanan atau pembayaran pada ${teksRentang}. Coba pilih rentang lain.`} />`
        : ''}

      <${Bagian} kunci="ringkasan" judul="Ringkasan">
        <${Ringkasan} lap=${lap} />
      <//>
      <${Bagian} kunci="pesanan" judul=${status ? `Pesanan · ${labelStatus}` : 'Pesanan'} sub=${`${angka(pesanan.length)} pesanan · ${rupiah(nilaiPesanan)}, terbaru di atas. Ikon struk untuk mencetak ulang.`} onCsv=${csv('pesanan')}>
        <${SaringStatus} db=${db} lap=${lap} status=${status} alamat=${alamatRentang(lap.dari, lap.sampai)} />
        <${TabelPesanan} key=${status} db=${db} pesanan=${pesanan} status=${status} />
      <//>
      <${Bagian} kunci="produk" judul="Produk terlaris" sub="Urut dari jumlah terjual." onCsv=${csv('produk')}>
        <${TabelProduk} lap=${lap} />
      <//>
      <${Bagian} kunci="pelanggan" judul="Pelanggan teratas" sub="Urut dari total belanja. Baru = pesanan pertamanya ada di rentang ini." onCsv=${csv('pelanggan')}>
        <${TabelPelanggan} lap=${lap} />
      <//>
      <${Bagian} kunci="stok" judul="Stok produk" sub=${`Pergerakan stok ${teksRentang}. Terjual dihitung saat pesanan dibuat.${sampaiHariIni ? '' : ' Kolom Sekarang = stok hari ini.'}`} onCsv=${csv('stok')}>
        <${TabelStok} lap=${lap} hariIni=${sampaiHariIni} />
      <//>
    </div>
  <//>`;
}
