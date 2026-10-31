// Kasir: pilih menu ke keranjang, isi pembeli (opsional) dan kode promo, buat pesanan, lalu langsung bayar.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Kosong, Foto } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tanya, Modal } from '../ui/pesan.js';
import { tautan, pergi } from '../ui/router.js';
import { daftarMenu, itemKeranjang, cekPromo, buatPesanan, kurangStok, normalHp, idPelanggan, peranAkun, tampilanToko, hargaJual, diskonBerlaku, labelDiskon, opsiMenu, kunciBaris, namaItem, fotoTampilMenu, fotoHeader, daftarBanner, ambilToko } from '../lib/toko.js';
import { KartuBanner } from '../ui/banner.js';
import { rupiah } from '../lib/util.js';
import { ambilMerek } from '../lib/repo.js';

const STRUK_TERAKHIR_MS = 15 * 60 * 1000;

/** Pesanan kasir yang baru saja lunas (15 menit terakhir): pintasan cetak / kirim struk. */
function StrukTerakhir({ db }) {
  const batas = Date.now() - STRUK_TERAKHIR_MS;
  const bayar = db
    .semua('Pembayaran', (b) => b.status === 'lunas' && (b.lunasPada || b.waktu || 0) >= batas)
    .sort((a, b) => (b.lunasPada || b.waktu || 0) - (a.lunasPada || a.waktu || 0))
    .map((b) => db.ambil('Pesanan', b.idPesanan))
    .find((p) => p && p.sumber === 'kasir');
  if (!bayar) return null;
  return html`<div class="struk-terakhir" role="status">
    <span><${Ikon} nama="centang" ukuran=${18} />Pesanan <b>#${bayar.nomor}</b> lunas · ${rupiah(bayar.total)}</span>
    <a class="btn solid kecil" href=${tautan('/pesanan/' + bayar.id + '/struk?dari=kasir')}><${Ikon} nama="struk" ukuran=${16} />Struk</a>
  </div>`;
}

/** Pilih pilihan tambahan (varian) dan jumlah sebelum masuk keranjang. */
export function DialogOpsi({ m, onTutup, onTambah }) {
  const opsi = opsiMenu(m);
  const [dipilih, setDipilih] = useState([]);
  const [n, setN] = useState(1);
  const harga = hargaJual(m) + opsi.filter((o) => dipilih.includes(o.nama)).reduce((j, o) => j + o.harga, 0);
  const balik = (nama) => setDipilih((d) => (d.includes(nama) ? d.filter((x) => x !== nama) : [...d, nama]));
  return html`<${Modal} judul=${m.nama} onTutup=${onTutup}>
    <div class="kolom" style="gap:12px">
      <p class="bantu">Harga dasar ${rupiah(hargaJual(m))}. Centang pilihan tambahan:</p>
      <div class="daftar-opsi">
        ${opsi.map(
          (o) => html`<label class="pilih-opsi" key=${o.nama}>
            <input type="checkbox" checked=${dipilih.includes(o.nama)} onChange=${() => balik(o.nama)} />
            <span>${o.nama}</span><b>${o.harga ? '+' + rupiah(o.harga) : 'gratis'}</b>
          </label>`,
        )}
      </div>
      <div class="baris-pisah">
        <span class="stepper">
          <button aria-label="Kurangi jumlah" onClick=${() => setN(Math.max(1, n - 1))}><${Ikon} nama="minus" ukuran=${16} /></button>
          <output aria-label="Jumlah">${n}</output>
          <button aria-label="Tambah jumlah" onClick=${() => setN(Math.min(999, n + 1))}><${Ikon} nama="plus" ukuran=${16} /></button>
        </span>
        <b class="total-kasir">${rupiah(harga * n)}</b>
      </div>
      <button class="btn solid lebar" onClick=${() => onTambah(dipilih, n)}><${Ikon} nama="plus" ukuran=${18} />Masukkan ke keranjang</button>
    </div>
  <//>`;
}

export function Kasir({ k }) {
  const { db } = k;
  const [keranjang, setKeranjang] = useState([]);
  const [nama, setNama] = useState('');
  const [hp, setHp] = useState('');
  const [catatan, setCatatan] = useState('');
  const [kode, setKode] = useState('');
  const [cari, setCari] = useState('');
  const [galat, setGalat] = useState('');
  const [pilihOpsi, setPilihOpsi] = useState(null);
  const menu = daftarMenu(db, { hanyaAktif: true }).filter(({ menu: m }) => m.nama.toLowerCase().includes(cari.trim().toLowerCase()));

  // Baris keranjang: {kunci, idMenu, opsi, jumlah}. Menu sama dengan pilihan berbeda = baris berbeda.
  const jumlahDi = (idMenu) => keranjang.filter((x) => x.idMenu === idMenu).reduce((j, x) => j + x.jumlah, 0);
  const aturBaris = (kunci, jumlah) => {
    setGalat('');
    setKeranjang((arr) => (jumlah <= 0 ? arr.filter((x) => x.kunci !== kunci) : arr.map((x) => (x.kunci === kunci ? { ...x, jumlah } : x))));
  };
  const tambahKe = (m, opsi = [], n = 1) => {
    setGalat('');
    const kunci = kunciBaris(m.id, opsi);
    setKeranjang((arr) => (arr.some((x) => x.kunci === kunci) ? arr.map((x) => (x.kunci === kunci ? { ...x, jumlah: x.jumlah + n } : x)) : [...arr, { kunci, idMenu: m.id, opsi, jumlah: n }]));
  };
  const ketukMenu = (m) => (opsiMenu(m).length ? setPilihOpsi(m) : tambahKe(m));
  const baris = keranjang.map((b) => ({ ...b, item: itemKeranjang(db, [b]).item[0] })).filter((b) => b.item);
  const { item, subtotal } = itemKeranjang(db, keranjang);
  const nomorHp = normalHp(hp);
  const promo = kode.trim() ? cekPromo(db, kode, { subtotal, item, idPelanggan: nomorHp ? idPelanggan(nomorHp) : '' }) : { diskon: 0, galat: '' };
  const total = subtotal - (promo.galat ? 0 : promo.diskon);
  const pelanggan = nomorHp ? db.ambil('Pelanggan', idPelanggan(nomorHp)) : null;

  const buat = async () => {
    if (hp.trim() && !nomorHp) return setGalat('Nomor WhatsApp tidak valid, mis. 0812xxxxxxx.');
    if (kode.trim() && promo.galat) return setGalat(promo.galat);
    const kurang = kurangStok(db, item);
    if (kurang.length) {
      const ya = await tanya({ judul: 'Stok tidak cukup', teks: `Stok ${kurang.map((x) => x.resep ? x.resep.nama : '?').join(', ')} tercatat kurang. Tetap buat pesanan? Stoknya akan minus.`, ya: 'Tetap buat' });
      if (!ya) return;
    }
    try {
      const p = buatPesanan(db, { keranjang, nama, hp: nomorHp, catatan, kodePromo: kode, oleh: (db.pengaturan.akun && db.pengaturan.akun.nama) || '' });
      setKeranjang([]);
      setNama('');
      setHp('');
      setCatatan('');
      setKode('');
      pergi('/pesanan/' + p.id + '?bayar=1');
    } catch (e) {
      setGalat(e.message);
    }
  };

  const kosong = daftarMenu(db).length === 0;
  return html`<${Kerangka} k=${k} aktif="kasir">
    ${fotoHeader(db, 'kasir')
      ? html`<header class="kasir-header">
          <img src=${fotoHeader(db, 'kasir')} alt="" aria-hidden="true" />
          <a class="bulat" href=${tautan('/')} aria-label="Kembali"><${Ikon} nama="kembali" /></a>
          <div><small>${ambilToko(db).namaToko || ambilMerek(db).nama}</small><h1>${tampilanToko(db) ? 'Katalog' : 'Kasir'}</h1></div>
        </header>`
      : html`<${Hero} warna="var(--hijau)" label=${ambilMerek(db).nama} judul=${tampilanToko(db) ? 'Katalog' : 'Kasir'} kembali="/" />`}
    ${daftarBanner(db, { tampilDi: 'kasir', hanyaAktif: true }).length > 0 &&
    html`<div class="kasir-banner">
      ${daftarBanner(db, { tampilDi: 'kasir', hanyaAktif: true }).map(
        (b) => html`<${KartuBanner} key=${b.id} b=${{ ...b, aksi: b.aksi === 'link' ? 'link' : '' }} foto=${b.fotoLokal || b.fotoUrl} kecil onAksi=${() => /^https?:\/\//i.test(b.nilai) && window.open(b.nilai, '_blank', 'noopener')} />`,
      )}
    </div>`}
    <div class="isi">
      <${StrukTerakhir} db=${db} />
      ${kosong
        ? html`<${Kosong} judul="Menu masih kosong" teks=${peranAkun(db) === 'dapur' ? 'Masukkan resep atau paket ke menu jual dulu.' : 'Minta admin memasukkan produk ke menu jual.'}>
            ${peranAkun(db) === 'dapur' && html`<a class="btn solid" href=${tautan('/menu')}>Atur menu jual</a>`}
          <//>`
        : html`<div class="kasir">
            <div class="kolom">
              <div class="baris-cari">
                <input class="input" type="search" placeholder="Cari menu…" aria-label="Cari menu" value=${cari} onInput=${(e) => setCari(e.target.value)} />
                <a class="btn" href=${tautan('/catat-pesanan')} title="Pesanan dari WhatsApp, telepon, atau pre-order"><${Ikon} nama="ubah" ukuran=${18} />Catat manual</a>
              </div>
              <div class="grid-menu">
                ${menu.map(({ menu: m, sisa }) => {
                  const n = jumlahDi(m.id);
                  return html`<button class=${'ubin-menu' + (n ? ' dipilih' : '') + (sisa === 0 ? ' habis' : '')} key=${m.id} onClick=${() => ketukMenu(m)} aria-label=${`Tambah ${m.nama} ke keranjang`}>
                    <span class="foto-ubin"><${Foto} src=${fotoTampilMenu(db, m)} ikon=${m.jenis === 'paket' ? 'kotak' : 'kue'} />${diskonBerlaku(m) ? html`<i class="label-diskon">${labelDiskon(m)}</i>` : ''}${n > 0 && html`<i class="jumlah-ubin">${n}</i>`}</span>
                    <b>${m.nama}</b>
                    <span class="harga-ubin">${rupiah(hargaJual(m))}${diskonBerlaku(m) ? html` <s>${rupiah(m.harga)}</s>` : ''}</span>
                    <small>${m.segera ? 'Coming soon · ' : ''}${opsiMenu(m).length ? 'Ada pilihan · ' : ''}${sisa === null ? '' : sisa <= 0 ? 'Stok habis' : `Sisa ${sisa}`}</small>
                  </button>`;
                })}
              </div>
            </div>
            <section class="kartu kolom keranjang" aria-labelledby="h-keranjang">
              <h2 class="judul-kecil" id="h-keranjang">Keranjang</h2>
              ${item.length === 0 && html`<p class="bantu">Ketuk menu untuk menambahkan.</p>`}
              ${baris.map(
                ({ kunci, item: i }) => html`<div class="baris-keranjang" key=${kunci}>
                  <span class="teks"><b>${i.nama}</b>${i.opsi && i.opsi.length ? html`<small class="teks-opsi">+ ${i.opsi.join(', ')}</small>` : ''}<small>${rupiah(i.harga)}</small></span>
                  <span class="stepper">
                    <button aria-label=${'Kurangi ' + namaItem(i)} onClick=${() => aturBaris(kunci, i.jumlah - 1)}><${Ikon} nama="minus" ukuran=${16} /></button>
                    <output aria-label=${'Jumlah ' + namaItem(i)}>${i.jumlah}</output>
                    <button aria-label=${'Tambah ' + namaItem(i)} onClick=${() => aturBaris(kunci, i.jumlah + 1)}><${Ikon} nama="plus" ukuran=${16} /></button>
                  </span>
                  <b class="subtotal">${rupiah(i.harga * i.jumlah)}</b>
                </div>`,
              )}
              <details class="pembeli" open=${!!(nama || hp)}>
                <summary>Pembeli dan promo (opsional)</summary>
                <div class="kolom" style="gap:10px;margin-top:10px">
                  <div class="dua-kolom">
                    <label class="bidang"><span>Nama</span><input class="input kecil" maxlength="60" value=${nama} onInput=${(e) => setNama(e.target.value)} /></label>
                    <label class="bidang"><span>WhatsApp</span><input class="input kecil" inputmode="tel" maxlength="20" placeholder="0812…" value=${hp} onInput=${(e) => (setHp(e.target.value), setGalat(''))} /></label>
                  </div>
                  ${pelanggan && html`<p class="bantu">Pelanggan lama: ${pelanggan.nama || 'tanpa nama'}.${!nama && pelanggan.nama ? html` <button class="tautan-kecil" onClick=${() => setNama(pelanggan.nama)}>Pakai nama ini</button>` : ''}</p>`}
                  <label class="bidang"><span>Catatan</span><input class="input kecil" maxlength="200" value=${catatan} onInput=${(e) => setCatatan(e.target.value)} placeholder="mis. tanpa kacang" /></label>
                  <label class="bidang"><span>Kode promo</span><input class="input kecil" maxlength="30" style="text-transform:uppercase" value=${kode} onInput=${(e) => (setKode(e.target.value), setGalat(''))} /></label>
                  ${kode.trim() && html`<p class=${promo.galat ? 'galat-teks' : 'bantu teks-baik'}>${promo.galat || `Hemat ${rupiah(promo.diskon)}`}</p>`}
                </div>
              </details>
              ${!promo.galat && promo.diskon > 0 && html`<div class="hasil-baris"><span>Diskon</span><b class="baik">−${rupiah(promo.diskon)}</b></div>`}
              <div class="hasil-baris"><span><b class="biasa">Total</b></span><b class="total-kasir">${rupiah(total)}</b></div>
              ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
              <button class="btn solid lebar" disabled=${!item.length} onClick=${buat}><${Ikon} nama="dompet" ukuran=${18} />Buat pesanan & bayar</button>
              ${item.length > 0 && html`<button class="btn abu lebar" onClick=${() => setKeranjang([])}>Kosongkan</button>`}
            </section>
          </div>`}
    </div>
    ${pilihOpsi && html`<${DialogOpsi} m=${pilihOpsi} onTutup=${() => setPilihOpsi(null)} onTambah=${(opsi, n) => (tambahKe(pilihOpsi, opsi, n), setPilihOpsi(null))} />`}
  <//>`;
}
