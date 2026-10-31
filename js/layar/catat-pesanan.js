// Catat pesanan manual: pesanan yang masuk lewat WhatsApp, telepon, DM, dll.
// Bisa berisi menu jual dan item di luar menu, jadwal ambil/antar, alamat + ongkir, dan langsung dicatat bayarnya.
// Dipakai akun dapur dan akun toko. Dengan ?id=psn_x, form mengubah pesanan yang belum dibayar.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Kosong, InputRupiah } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tanya, tampilToast } from '../ui/pesan.js';
import { tautan, pergi } from '../ui/router.js';
import {
  daftarMenu, itemKeranjang, cekPromo, buatPesanan, ubahPesanan, bisaDiubah, kurangStok, normalHp, idPelanggan,
  bayarTunai, bayarTransfer, SALURAN_PESANAN, pakaiMayar, hargaJual, labelDiskon, opsiMenu,
} from '../lib/toko.js';
import { rupiah } from '../lib/util.js';

let urut = 0;
const kunciBaru = () => 'b' + ++urut;

/** ms -> nilai input datetime-local (waktu setempat). */
export function keInputWaktu(ts) {
  if (!ts) return '';
  const d = new Date(ts);
  const dua = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${dua(d.getMonth() + 1)}-${dua(d.getDate())}T${dua(d.getHours())}:${dua(d.getMinutes())}`;
}

/** Nilai input datetime-local -> ms (0 bila kosong / tidak valid). */
export function dariInputWaktu(teks) {
  const t = teks ? new Date(teks).getTime() : 0;
  return Number.isFinite(t) ? t : 0;
}

const BAYAR = [
  { kunci: 'nanti', label: 'Belum bayar' },
  { kunci: 'tunai', label: 'Lunas tunai' },
  { kunci: 'transfer', label: 'Lunas transfer/QRIS' },
  { kunci: 'online', label: 'Kirim link online' },
];

function keadaanAwal(lama) {
  if (!lama) {
    return { baris: [], nama: '', hp: '', saluran: 'WhatsApp', antar: false, jadwal: '', alamat: '', ongkir: 0, catatan: '', kode: '' };
  }
  return {
    // Harga lama ikut dibawa supaya mengubah pesanan tidak diam-diam memakai harga menu yang baru.
    baris: (lama.item || []).map((i) => ({ kunci: kunciBaru(), idMenu: i.idMenu || '', nama: i.nama, harga: Number(i.harga) || 0, jumlah: Number(i.jumlah) || 1, opsi: Array.isArray(i.opsi) ? i.opsi : [] })),
    nama: lama.nama || '',
    hp: lama.hp ? '0' + String(lama.hp).replace(/^62/, '') : '',
    saluran: lama.saluran || '',
    antar: !!(lama.alamat || lama.ongkir),
    jadwal: keInputWaktu(lama.jadwal),
    alamat: lama.alamat || '',
    ongkir: Number(lama.ongkir) || 0,
    catatan: lama.catatan || '',
    kode: lama.kodePromo || '',
  };
}

export function CatatPesanan({ k }) {
  const { db, rute } = k;
  const idUbah = rute.kueri.id || '';
  const lama = idUbah ? db.ambil('Pesanan', idUbah) : null;
  const [f, setF] = useState(() => keadaanAwal(lama));
  const [bayar, setBayar] = useState('nanti');
  const [pilihMenu, setPilihMenu] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  const atur = (patch) => (setGalat(''), setF((x) => ({ ...x, ...patch })));
  const aturBaris = (kunci, patch) => atur({ baris: f.baris.map((b) => (b.kunci === kunci ? { ...b, ...patch } : b)) });
  const buangBaris = (kunci) => atur({ baris: f.baris.filter((b) => b.kunci !== kunci) });

  if (idUbah && !bisaDiubah(db, lama)) {
    return html`<${Kerangka} k=${k} aktif="pesanan">
      <${Hero} warna="var(--tomat)" label="Pesanan" judul="Tidak bisa diubah" kembali=${lama ? '/pesanan/' + lama.id : '/pesanan'} />
      <div class="isi"><${Kosong} judul="Pesanan ini tidak bisa diubah" teks="Pesanan yang sudah dibayar, selesai, batal, atau dari link pemesanan tidak bisa diubah."><a class="btn solid" href=${tautan('/pesanan')}>Ke daftar pesanan</a><//></div>
    <//>`;
  }

  const menu = daftarMenu(db, { hanyaAktif: true });
  const tambahMenu = (idMenu) => {
    if (!idMenu) return;
    // Menu berpilihan selalu jadi baris baru, supaya tiap baris bisa punya pilihan sendiri.
    const berpilihan = opsiMenu(db.ambil('Menu', idMenu)).length > 0;
    const ada = !berpilihan && f.baris.find((b) => b.idMenu === idMenu && !(b.opsi || []).length);
    if (ada) aturBaris(ada.kunci, { jumlah: ada.jumlah + 1 });
    else atur({ baris: [...f.baris, { kunci: kunciBaru(), idMenu, jumlah: 1, opsi: [] }] });
    setPilihMenu('');
  };
  const tambahLain = () => atur({ baris: [...f.baris, { kunci: kunciBaru(), idMenu: '', nama: '', harga: 0, jumlah: 1 }] });

  // Baris menu tanpa harga sendiri memakai harga menu saat ini.
  const keKeranjang = (b) => (b.idMenu ? { idMenu: b.idMenu, jumlah: b.jumlah, opsi: b.opsi || [], ...(b.harga !== undefined ? { harga: b.harga, nama: b.nama } : {}) } : { nama: b.nama, harga: b.harga, jumlah: b.jumlah });
  const keranjang = f.baris.map(keKeranjang);
  const { item, subtotal } = itemKeranjang(db, keranjang);
  const nomorHp = normalHp(f.hp);
  const promo = f.kode.trim() ? cekPromo(db, f.kode, { subtotal, idPelanggan: nomorHp ? idPelanggan(nomorHp) : '', kecuali: idUbah }) : { diskon: 0, galat: '' };
  const ongkir = f.antar ? f.ongkir : 0;
  const total = subtotal - (promo.galat ? 0 : promo.diskon) + ongkir;
  const pelanggan = nomorHp ? db.ambil('Pelanggan', idPelanggan(nomorHp)) : null;
  const hargaBaris = (b) => (b.harga !== undefined ? b.harga : (itemKeranjang(db, [{ ...keKeranjang(b), jumlah: 1 }]).item[0] || {}).harga || 0);
  // Mengubah pilihan = hitung ulang harga dari menu (harga lama pesanan tidak dipakai lagi untuk baris ini).
  const balikOpsi = (b, nama) => {
    const opsi = (b.opsi || []).includes(nama) ? b.opsi.filter((x) => x !== nama) : [...(b.opsi || []), nama];
    aturBaris(b.kunci, { opsi, harga: undefined, nama: undefined });
  };

  const simpan = async () => {
    if (!f.nama.trim()) return setGalat('Isi nama pembeli.');
    if (f.hp.trim() && !nomorHp) return setGalat('Nomor WhatsApp tidak valid, mis. 0812xxxxxxx.');
    if (f.baris.some((b) => !b.idMenu && !String(b.nama || '').trim())) return setGalat('Isi nama untuk item di luar menu, atau hapus barisnya.');
    if (!item.length) return setGalat('Tambahkan minimal satu item.');
    if (f.antar && !f.alamat.trim()) return setGalat('Isi alamat antar.');
    if (f.kode.trim() && promo.galat) return setGalat(promo.galat);
    if (!lama) {
      const kurang = kurangStok(db, item);
      if (kurang.length) {
        const ya = await tanya({ judul: 'Stok tidak cukup', teks: `Stok ${kurang.map((x) => (x.resep ? x.resep.nama : '?')).join(', ')} tercatat kurang. Tetap catat pesanan? Stoknya akan minus sampai produksi dicatat.`, ya: 'Tetap catat' });
        if (!ya) return;
      }
    }
    const data = {
      keranjang, nama: f.nama, hp: nomorHp, catatan: f.catatan, kodePromo: f.kode,
      saluran: f.saluran, jadwal: dariInputWaktu(f.jadwal), alamat: f.antar ? f.alamat : '', ongkir,
    };
    setSibuk(true);
    try {
      if (lama) {
        ubahPesanan(db, lama.id, data);
        tampilToast('Pesanan diperbarui.');
        return pergi('/pesanan/' + lama.id, { ganti: true });
      }
      const p = buatPesanan(db, { ...data, sumber: 'manual', oleh: (db.pengaturan.akun && db.pengaturan.akun.nama) || '' });
      if (bayar === 'tunai') bayarTunai(db, p, p.total);
      if (bayar === 'transfer') bayarTransfer(db, p);
      tampilToast(`Pesanan #${p.nomor} dicatat.`);
      pergi('/pesanan/' + p.id + (bayar === 'online' ? '?bayar=1' : ''), { ganti: true });
    } catch (e) {
      setGalat(e.message);
    } finally {
      setSibuk(false);
    }
  };

  return html`<${Kerangka} k=${k} aktif="catat-pesanan">
    <${Hero} warna="var(--tomat)" label=${lama ? 'Ubah pesanan #' + lama.nomor : 'Pesanan manual'} judul=${lama ? 'Ubah pesanan' : 'Catat pesanan'} kembali=${lama ? '/pesanan/' + lama.id : '/pesanan'}>
      ${!lama && html`<p class="hero-sub">Untuk pesanan dari WhatsApp, telepon, atau DM. Bisa pakai menu jual atau item di luar menu, dengan jadwal ambil atau antar.</p>`}
    <//>
    <div class="isi">
      <div class="kolom-2">
        <div class="kolom">
          <section class="kartu kolom" aria-labelledby="h-pembeli">
            <h2 class="judul-kecil" id="h-pembeli">Pembeli</h2>
            <div class="dua-kolom">
              <label class="bidang"><span>Nama</span><input class="input kecil" maxlength="60" value=${f.nama} onInput=${(e) => atur({ nama: e.target.value })} /></label>
              <label class="bidang"><span>WhatsApp</span><input class="input kecil" inputmode="tel" maxlength="20" placeholder="0812…" value=${f.hp} onInput=${(e) => atur({ hp: e.target.value })} /></label>
            </div>
            ${pelanggan && html`<p class="bantu">Pelanggan lama: ${pelanggan.nama || 'tanpa nama'}.${!f.nama && pelanggan.nama ? html` <button class="tautan-kecil" onClick=${() => atur({ nama: pelanggan.nama })}>Pakai nama ini</button>` : ''}</p>`}
            ${(!lama || lama.sumber === 'manual') &&
            html`<div class="bidang"><span>Pesan lewat</span>
              <div class="chips" role="group" aria-label="Pesan lewat">
                ${SALURAN_PESANAN.map((s) => html`<button type="button" class=${'chip' + (f.saluran === s ? ' aktif' : '')} aria-pressed=${f.saluran === s} onClick=${() => atur({ saluran: f.saluran === s ? '' : s })}>${s}</button>`)}
              </div>
            </div>`}
          </section>

          <section class="kartu kolom" aria-labelledby="h-item">
            <h2 class="judul-kecil" id="h-item">Item pesanan</h2>
            ${f.baris.length === 0 && html`<p class="bantu">Pilih dari menu jual, atau tambahkan item di luar menu (mis. kue custom).</p>`}
            ${f.baris.map((b) => {
              const harga = hargaBaris(b);
              return html`<div class="baris-keranjang" key=${b.kunci}>
                ${b.idMenu
                  ? html`<span class="teks"><b>${(db.ambil('Menu', b.idMenu) || {}).nama || b.nama}</b><small>${rupiah(harga)}</small>
                      ${opsiMenu(db.ambil('Menu', b.idMenu)).length > 0 &&
                      html`<span class="chips chips-opsi" role="group" aria-label=${'Pilihan ' + ((db.ambil('Menu', b.idMenu) || {}).nama || '')}>
                        ${opsiMenu(db.ambil('Menu', b.idMenu)).map((o) => html`<button type="button" key=${o.nama} class=${'chip' + ((b.opsi || []).includes(o.nama) ? ' aktif' : '')} aria-pressed=${(b.opsi || []).includes(o.nama)} onClick=${() => balikOpsi(b, o.nama)}>${o.nama} +${rupiah(o.harga)}</button>`)}
                      </span>`}
                    </span>`
                  : html`<span class="teks kolom" style="gap:6px">
                      <input class="input kecil" maxlength="80" placeholder="Nama item, mis. Kue ulang tahun 20 cm" aria-label="Nama item lain" value=${b.nama} onInput=${(e) => aturBaris(b.kunci, { nama: e.target.value })} />
                      <${InputRupiah} aria-label="Harga item lain" placeholder="Harga satuan" nilai=${b.harga} onUbah=${(n) => aturBaris(b.kunci, { harga: n })} />
                    </span>`}
                <span class="stepper">
                  <button aria-label=${'Kurangi ' + (b.nama || 'item')} onClick=${() => (b.jumlah <= 1 ? buangBaris(b.kunci) : aturBaris(b.kunci, { jumlah: b.jumlah - 1 }))}><${Ikon} nama=${b.jumlah <= 1 ? 'sampah' : 'minus'} ukuran=${16} /></button>
                  <output aria-label=${'Jumlah ' + (b.nama || 'item')}>${b.jumlah}</output>
                  <button aria-label=${'Tambah ' + (b.nama || 'item')} onClick=${() => aturBaris(b.kunci, { jumlah: Math.min(999, b.jumlah + 1) })}><${Ikon} nama="plus" ukuran=${16} /></button>
                </span>
                <b class="subtotal">${rupiah(harga * b.jumlah)}</b>
              </div>`;
            })}
            <div class="kolom" style="gap:8px">
              <select class="input kecil" aria-label="Tambah dari menu" value=${pilihMenu} onChange=${(e) => tambahMenu(e.target.value)} disabled=${!menu.length}>
                <option value="">${menu.length ? '+ Tambah dari menu…' : 'Menu jual masih kosong'}</option>
                ${menu.map(({ menu: m, sisa }) => html`<option value=${m.id}>${m.nama} · ${rupiah(hargaJual(m))}${labelDiskon(m) ? ` (diskon ${labelDiskon(m).slice(1)})` : ''}${sisa === null ? '' : sisa <= 0 ? ' · stok habis' : ` · sisa ${sisa}`}</option>`)}
              </select>
              <button class="btn" onClick=${tambahLain}><${Ikon} nama="plus" ukuran=${18} />Item di luar menu</button>
            </div>
          </section>
        </div>

        <div class="kolom">
          <section class="kartu kolom" aria-labelledby="h-ambil">
            <h2 class="judul-kecil" id="h-ambil">Ambil atau antar</h2>
            <div class="chips" role="group" aria-label="Cara terima">
              <button type="button" class=${'chip' + (!f.antar ? ' aktif' : '')} aria-pressed=${!f.antar} onClick=${() => atur({ antar: false })}>Diambil</button>
              <button type="button" class=${'chip' + (f.antar ? ' aktif' : '')} aria-pressed=${f.antar} onClick=${() => atur({ antar: true })}>Diantar</button>
            </div>
            <label class="bidang"><span>${f.antar ? 'Jadwal antar' : 'Jadwal ambil'} (opsional)</span><input class="input kecil" type="datetime-local" value=${f.jadwal} onInput=${(e) => atur({ jadwal: e.target.value })} /></label>
            ${f.antar &&
            html`<label class="bidang"><span>Alamat antar</span><textarea class="input kecil" rows="2" maxlength="300" value=${f.alamat} onInput=${(e) => atur({ alamat: e.target.value })}></textarea></label>
              <label class="bidang"><span>Ongkir</span><${InputRupiah} aria-label="Ongkir" placeholder="0" nilai=${f.ongkir} onUbah=${(n) => atur({ ongkir: n })} /></label>`}
            <label class="bidang"><span>Catatan</span><input class="input kecil" maxlength="200" placeholder="mis. tulisan di kue: Happy Birthday Sari" value=${f.catatan} onInput=${(e) => atur({ catatan: e.target.value })} /></label>
            <label class="bidang"><span>Kode promo</span><input class="input kecil" maxlength="30" style="text-transform:uppercase" value=${f.kode} onInput=${(e) => atur({ kode: e.target.value })} /></label>
            ${f.kode.trim() && html`<p class=${promo.galat ? 'galat-teks' : 'bantu teks-baik'}>${promo.galat || `Hemat ${rupiah(promo.diskon)}`}</p>`}
          </section>

          <section class="kartu kolom" aria-labelledby="h-total">
            <h2 class="judul-kecil" id="h-total">Total</h2>
            <div class="hasil-baris"><span>Subtotal</span><b class="biasa">${rupiah(subtotal)}</b></div>
            ${!promo.galat && promo.diskon > 0 && html`<div class="hasil-baris"><span>Diskon</span><b class="baik">−${rupiah(promo.diskon)}</b></div>`}
            ${ongkir > 0 && html`<div class="hasil-baris"><span>Ongkir</span><b class="biasa">${rupiah(ongkir)}</b></div>`}
            <div class="hasil-baris"><span><b class="biasa">Total</b></span><b class="total-kasir">${rupiah(total)}</b></div>
            ${!lama &&
            html`<div class="bidang"><span>Pembayaran</span>
              <div class="chips" role="group" aria-label="Pembayaran">
                ${BAYAR.filter((b) => b.kunci !== 'online' || pakaiMayar(db)).map((b) => html`<button type="button" class=${'chip' + (bayar === b.kunci ? ' aktif' : '')} aria-pressed=${bayar === b.kunci} onClick=${() => setBayar(b.kunci)}>${b.label}</button>`)}
              </div>
              ${bayar === 'online' && html`<small class="bantu">Setelah disimpan, QR dan link Mayar dibuat untuk dikirim ke pembeli.</small>`}
            </div>`}
            ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
            <button class="btn solid lebar" disabled=${sibuk} onClick=${simpan}><${Ikon} nama="centang" ukuran=${18} />${lama ? 'Simpan perubahan' : 'Simpan pesanan'}</button>
          </section>
        </div>
      </div>
    </div>
  <//>`;
}
