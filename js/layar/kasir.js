// Kasir: pilih menu ke keranjang, isi pembeli (opsional) dan kode promo, buat pesanan, lalu langsung bayar.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Kosong, Foto } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tanya } from '../ui/pesan.js';
import { tautan, pergi } from '../ui/router.js';
import { daftarMenu, itemKeranjang, cekPromo, buatPesanan, kurangStok, normalHp, idPelanggan, peranAkun, tampilanToko, ALAMAT_ADMIN } from '../lib/toko.js';
import { rupiah } from '../lib/util.js';
import { ambilMerek } from '../lib/repo.js';

export function Kasir({ k }) {
  const { db } = k;
  const [keranjang, setKeranjang] = useState([]);
  const [nama, setNama] = useState('');
  const [hp, setHp] = useState('');
  const [catatan, setCatatan] = useState('');
  const [kode, setKode] = useState('');
  const [cari, setCari] = useState('');
  const [galat, setGalat] = useState('');
  const menu = daftarMenu(db, { hanyaAktif: true }).filter(({ menu: m }) => m.nama.toLowerCase().includes(cari.trim().toLowerCase()));

  const jumlahDi = (idMenu) => (keranjang.find((x) => x.idMenu === idMenu) || {}).jumlah || 0;
  const atur = (idMenu, jumlah) => {
    setGalat('');
    setKeranjang((arr) => (jumlah <= 0 ? arr.filter((x) => x.idMenu !== idMenu) : arr.some((x) => x.idMenu === idMenu) ? arr.map((x) => (x.idMenu === idMenu ? { ...x, jumlah } : x)) : [...arr, { idMenu, jumlah }]));
  };
  const { item, subtotal } = itemKeranjang(db, keranjang);
  const nomorHp = normalHp(hp);
  const promo = kode.trim() ? cekPromo(db, kode, { subtotal, idPelanggan: nomorHp ? idPelanggan(nomorHp) : '' }) : { diskon: 0, galat: '' };
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
    <${Hero} warna="var(--hijau)" label=${ambilMerek(db).nama} judul=${tampilanToko(db) ? 'Katalog' : 'Kasir'} kembali=${tampilanToko(db) ? undefined : '/'} />
    <div class="isi">
      ${kosong
        ? html`<${Kosong} judul="Menu masih kosong" teks=${peranAkun(db) === 'dapur' ? 'Masukkan resep atau paket ke menu jual di halaman admin.' : 'Minta admin memasukkan produk ke menu jual.'}>
            ${peranAkun(db) === 'dapur' && html`<a class="btn solid" href=${ALAMAT_ADMIN + '#/menu'}>Atur menu jual</a>`}
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
                  return html`<button class=${'ubin-menu' + (n ? ' dipilih' : '') + (sisa === 0 ? ' habis' : '')} key=${m.id} onClick=${() => atur(m.id, n + 1)} aria-label=${`Tambah ${m.nama} ke keranjang`}>
                    <span class="foto-ubin"><${Foto} src=${m.fotoUrl} ikon=${m.jenis === 'paket' ? 'kotak' : 'kue'} />${n > 0 && html`<i class="jumlah-ubin">${n}</i>`}</span>
                    <b>${m.nama}</b>
                    <span class="harga-ubin">${rupiah(m.harga)}</span>
                    <small>${sisa === null ? '' : sisa <= 0 ? 'Stok habis' : `Sisa ${sisa}`}</small>
                  </button>`;
                })}
              </div>
            </div>
            <section class="kartu kolom keranjang" aria-labelledby="h-keranjang">
              <h2 class="judul-kecil" id="h-keranjang">Keranjang</h2>
              ${item.length === 0 && html`<p class="bantu">Ketuk menu untuk menambahkan.</p>`}
              ${item.map(
                (i) => html`<div class="baris-keranjang" key=${i.idMenu}>
                  <span class="teks"><b>${i.nama}</b><small>${rupiah(i.harga)}</small></span>
                  <span class="stepper">
                    <button aria-label=${'Kurangi ' + i.nama} onClick=${() => atur(i.idMenu, i.jumlah - 1)}><${Ikon} nama="minus" ukuran=${16} /></button>
                    <output aria-label=${'Jumlah ' + i.nama}>${i.jumlah}</output>
                    <button aria-label=${'Tambah ' + i.nama} onClick=${() => atur(i.idMenu, i.jumlah + 1)}><${Ikon} nama="plus" ukuran=${16} /></button>
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
  <//>`;
}
