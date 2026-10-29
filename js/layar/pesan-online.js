// Etalase toko untuk pembeli (link pemesanan, tanpa login): beranda dengan banner, pilihan populer, kategori,
// dan testimoni; daftar menu; detail produk; keranjang; lalu status pesanan dan cara bayar.
// Bayar: transfer / QRIS toko (dicek manual oleh toko) atau Mayar bila diaktifkan admin.
// Layar dipilih dari kueri ?l= (beranda | menu | produk | keranjang | pesanan) supaya tombol kembali HP bekerja.

import { html, useState, useEffect } from '../../vendor/preact-htm.js';
import { Kosong, Foto, LogoMerek } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tampilToast } from '../ui/pesan.js';
import { pergi } from '../ui/router.js';
import { terapkanMerekDokumen } from '../ui/merek.js';
import { scriptUrlAman } from './penilai.js';
import { InfoTransfer } from './pesanan.js';
import { Bintang } from './pelanggan.js';
import { pesanOnline, kirimTestimoni, normalHp } from '../lib/toko.js';
import { panggilApi } from '../lib/sync.js';
import { LOGO_BAWAAN } from '../lib/repo.js';
import { rupiah, tanggal } from '../lib/util.js';

const CEK_TIAP_MS = 5000;

function alamatServer(k) {
  const tetap = (window.APP_CONFIG && window.APP_CONFIG.scriptUrl) || '';
  const dariTautan = k.rute.kueri.u || '';
  return tetap || (scriptUrlAman(dariTautan) ? dariTautan : '') || k.db.pengaturan.scriptUrl || '';
}

// Ingatan di perangkat pembeli: pesanan terakhir dan isi keranjang (per toko).
function baca(kunci, bawaan) {
  try {
    const v = localStorage.getItem(kunci);
    return v ? JSON.parse(v) : bawaan;
  } catch {
    return bawaan;
  }
}
function tulis(kunci, nilai) {
  try {
    localStorage.setItem(kunci, JSON.stringify(nilai));
  } catch {
    /* tidak apa-apa */
  }
}
const kunciPesanan = (token) => 'pesanan-terakhir-' + token;
const kunciKeranjang = (token) => 'keranjang-' + token;
function ingatan(token) {
  const v = baca(kunciPesanan(token), '');
  return typeof v === 'string' ? v : '';
}

/** Pindah layar etalase, tetap membawa ?u= (alamat server untuk server uji). */
function keLayar(k, token, l, extra = {}) {
  const q = new URLSearchParams();
  if (k.rute.kueri.u) q.set('u', k.rute.kueri.u);
  if (l) q.set('l', l);
  for (const [a, b] of Object.entries(extra)) if (b) q.set(a, b);
  const s = q.toString();
  pergi('/pesan/' + token + (s ? '?' + s : ''));
}

function waTautan(wa, teks) {
  const hp = normalHp(wa || '');
  return hp ? `https://wa.me/${hp}?text=${encodeURIComponent(teks)}` : '';
}

// ---------- Bagian kecil ----------

function TombolTambah({ m, n, atur }) {
  const habis = m.sisa !== null && m.sisa <= 0;
  if (habis) return html`<span class="et-habis">Habis</span>`;
  if (!n) return html`<button type="button" class="et-plus" aria-label=${'Tambah ' + m.nama} onClick=${(e) => (e.stopPropagation(), atur(m, 1))}><${Ikon} nama="plus" ukuran=${18} /></button>`;
  return html`<span class="et-stepper" onClick=${(e) => e.stopPropagation()}>
    <button type="button" aria-label=${'Kurangi ' + m.nama} onClick=${() => atur(m, n - 1)}><${Ikon} nama="minus" ukuran=${14} /></button>
    <output>${n}</output>
    <button type="button" aria-label=${'Tambah ' + m.nama} onClick=${() => atur(m, n + 1)}><${Ikon} nama="plus" ukuran=${14} /></button>
  </span>`;
}

function KartuProduk({ m, n, atur, buka, lebar }) {
  return html`<article class=${'et-kartu' + (lebar ? ' lebar' : '') + (m.sisa !== null && m.sisa <= 0 ? ' mati' : '')}>
    <button type="button" class="et-kartu-foto" onClick=${() => buka(m)} aria-label=${'Lihat ' + m.nama}>
      <${Foto} src=${m.fotoUrl} ikon="kue" ukuranIkon=${36} />
      ${m.sisa !== null && m.sisa > 0 && m.sisa <= 5 && html`<span class="et-pita">Sisa ${m.sisa}</span>`}
    </button>
    <div class="et-kartu-isi">
      <button type="button" class="et-kartu-nama" onClick=${() => buka(m)}>${m.nama}</button>
      <div class="et-kartu-bawah"><b class="et-harga">${rupiah(m.harga)}</b><${TombolTambah} m=${m} n=${n} atur=${atur} /></div>
    </div>
  </article>`;
}

function Testimoni({ daftar }) {
  if (!daftar || !daftar.length) return null;
  const rata = daftar.reduce((j, t) => j + (Number(t.bintang) || 5), 0) / daftar.length;
  return html`<section class="et-bagian" aria-labelledby="et-h-testi">
    <div class="et-judul-bagian">
      <h2 id="et-h-testi">Kata pembeli</h2>
      <span class="et-rata"><${Bintang} nilai=${rata} /> ${rata.toFixed(1).replace('.', ',')} · ${daftar.length} ulasan</span>
    </div>
    <div class="et-geser">
      ${daftar.map(
        (t, i) => html`<figure class="et-testi" key=${i}>
          <${Bintang} nilai=${t.bintang} />
          <blockquote>“${t.isi}”</blockquote>
          <figcaption><span class="et-avatar" aria-hidden="true">${(t.nama || 'P').trim().charAt(0).toUpperCase()}</span><span><b>${t.nama || 'Pembeli'}</b>${t.waktu ? html`<small>${tanggal(t.waktu)}</small>` : ''}</span></figcaption>
        </figure>`,
      )}
    </div>
  </section>`;
}

// ---------- Layar ----------

function Beranda({ info, jumlah, atur, buka, keMenu }) {
  const menu = info.menu || [];
  const fotoHero = (menu.find((m) => m.fotoUrl) || {}).fotoUrl || '';
  const kategori = [];
  for (const m of menu) {
    const ada = kategori.find((c) => c.nama === m.kategori);
    if (ada) ada.jumlah++;
    else kategori.push({ nama: m.kategori || 'Lainnya', foto: m.fotoUrl, jumlah: 1 });
  }
  kategori.forEach((c) => (c.foto = c.foto || (menu.find((m) => m.kategori === c.nama && m.fotoUrl) || {}).fotoUrl || ''));
  const populer = menu.slice(0, 8);
  return html`
    <section class="et-hero">
      ${fotoHero && html`<img src=${fotoHero} alt="" aria-hidden="true" />`}
      <div class="et-hero-isi">
        <span class=${'et-buka ' + (info.buka ? 'ya' : 'tidak')}>${info.buka ? 'Buka · terima pesanan' : 'Sedang tutup'}</span>
        <h1>Dibuat hangat dari dapur rumah</h1>
        <p>${info.catatan || 'Kue dan camilan rumahan, dibuat dengan bahan pilihan. Pesan sekarang, ambil atau diantar.'}</p>
        <button type="button" class="et-tombol" onClick=${() => keMenu('')}>Pesan sekarang</button>
      </div>
    </section>

    ${populer.length > 0 &&
    html`<section class="et-bagian" aria-labelledby="et-h-populer">
      <div class="et-judul-bagian"><h2 id="et-h-populer">Pilihan populer</h2><button type="button" class="et-lihat" onClick=${() => keMenu('')}>Lihat semua</button></div>
      <div class="et-geser">${populer.map((m) => html`<${KartuProduk} key=${m.id} m=${m} n=${jumlah[m.id] || 0} atur=${atur} buka=${buka} />`)}</div>
    </section>`}

    ${kategori.length > 1 &&
    html`<section class="et-bagian" aria-labelledby="et-h-kategori">
      <div class="et-judul-bagian"><h2 id="et-h-kategori">Kategori</h2></div>
      <div class="et-grid-kategori">
        ${kategori.map(
          (c) => html`<button type="button" class="et-kategori" key=${c.nama} onClick=${() => keMenu(c.nama)}>
            <span class="et-kategori-foto"><${Foto} src=${c.foto} ikon=${c.nama === 'Paket' ? 'kotak' : 'kue'} ukuranIkon=${32} /></span>
            <b>${c.nama}</b><small>${c.jumlah} menu</small>
          </button>`,
        )}
      </div>
    </section>`}

    ${menu.length === 0 && html`<${Kosong} judul="Menu belum tersedia" teks="Silakan kembali lagi nanti." />`}

    <${Testimoni} daftar=${info.testimoni} />

    <section class="et-bagian et-info-toko">
      <div class="et-ciri">
        <span><${Ikon} nama="kue" ukuran=${20} />Bahan pilihan</span>
        <span><${Ikon} nama="panci" ukuran=${20} />Dibuat saat dipesan</span>
        <span><${Ikon} nama="toko" ukuran=${20} />Ambil atau diantar</span>
      </div>
      ${info.alamat && html`<p><b>Alamat:</b> ${info.alamat}</p>`}
      ${info.wa && html`<a class="et-tombol garis" href=${waTautan(info.wa, 'Halo ' + info.namaToko + ', saya mau tanya.')} target="_blank" rel="noopener"><${Ikon} nama="kirim" ukuran=${18} />Tanya lewat WhatsApp</a>`}
    </section>
  `;
}

function DaftarMenu({ info, jumlah, atur, buka, kat, keMenu }) {
  const [cari, setCari] = useState('');
  const menu = info.menu || [];
  const kategori = [...new Set(menu.map((m) => m.kategori || 'Lainnya'))];
  const q = cari.trim().toLowerCase();
  const tampil = menu.filter((m) => (!kat || m.kategori === kat) && (!q || m.nama.toLowerCase().includes(q)));
  return html`
    <h1 class="et-judul-layar">${kat || 'Semua menu'}</h1>
    <p class="et-sub">Pilih yang Anda suka, lalu buka keranjang untuk memesan.</p>
    <label class="et-cari"><${Ikon} nama="cari" ukuran=${18} /><input type="search" placeholder="Cari kue, camilan…" aria-label="Cari menu" value=${cari} onInput=${(e) => setCari(e.target.value)} /></label>
    ${kategori.length > 1 &&
    html`<div class="et-chips" role="group" aria-label="Kategori">
      <button type="button" class=${!kat ? 'aktif' : ''} aria-pressed=${!kat} onClick=${() => keMenu('')}>Semua</button>
      ${kategori.map((c) => html`<button type="button" key=${c} class=${kat === c ? 'aktif' : ''} aria-pressed=${kat === c} onClick=${() => keMenu(c)}>${c}</button>`)}
    </div>`}
    ${tampil.length === 0 && html`<${Kosong} judul="Tidak ada menu" teks=${q ? 'Coba kata lain.' : 'Belum ada menu di kategori ini.'} />`}
    <div class="et-grid">${tampil.map((m) => html`<${KartuProduk} key=${m.id} m=${m} n=${jumlah[m.id] || 0} atur=${atur} buka=${buka} lebar />`)}</div>
  `;
}

function DetailProduk({ info, m, jumlah, atur, kembali, keKeranjang }) {
  const [n, setN] = useState(Math.max(1, jumlah[m.id] || 1));
  const habis = m.sisa !== null && m.sisa <= 0;
  const maks = m.sisa === null ? 100 : Math.min(100, m.sisa);
  const rata = (info.testimoni || []).length ? info.testimoni.reduce((j, t) => j + (Number(t.bintang) || 5), 0) / info.testimoni.length : 0;
  const tambah = () => {
    atur(m, n);
    tampilToast(`${m.nama} masuk keranjang.`);
    kembali();
  };
  return html`
    <div class="et-detail-foto">
      <button type="button" class="et-bulat" aria-label="Kembali" onClick=${kembali}><${Ikon} nama="kembali" /></button>
      <${Foto} src=${m.fotoUrl} ikon=${m.kategori === 'Paket' ? 'kotak' : 'kue'} ukuranIkon=${64} />
    </div>
    <div class="et-detail-isi">
      <span class="et-label-kat">${m.kategori}</span>
      <h1>${m.nama}</h1>
      <div class="et-detail-harga">
        <b>${rupiah(m.harga)}</b>
        ${rata > 0 && html`<span class="et-rata"><${Bintang} nilai=${rata} /> (${info.testimoni.length} ulasan toko)</span>`}
      </div>
      ${m.keterangan ? html`<p class="et-deskripsi">${m.keterangan}</p>` : html`<p class="et-deskripsi">Dibuat dari resep andalan ${info.namaToko}.</p>`}
      <p class=${'et-stok' + (habis ? ' habis' : '')}>${habis ? 'Stok sedang habis' : m.sisa === null ? 'Tersedia' : `Tersedia ${m.sisa}`}</p>
      ${!habis &&
      html`<div class="et-detail-aksi">
        <span class="et-stepper besar">
          <button type="button" aria-label="Kurangi jumlah" onClick=${() => setN(Math.max(1, n - 1))}><${Ikon} nama="minus" ukuran=${18} /></button>
          <output aria-label="Jumlah">${n}</output>
          <button type="button" aria-label="Tambah jumlah" onClick=${() => setN(Math.min(maks, n + 1))}><${Ikon} nama="plus" ukuran=${18} /></button>
        </span>
        <button type="button" class="et-tombol lebar" aria-label=${'Tambah ke keranjang, ' + rupiah(m.harga * n)} onClick=${tambah}><${Ikon} nama="keranjang" ukuran=${18} />${rupiah(m.harga * n)}</button>
      </div>`}
      ${(jumlah[m.id] || 0) > 0 && html`<button type="button" class="et-lihat" onClick=${keKeranjang}>Sudah ${jumlah[m.id]} di keranjang · buka keranjang</button>`}
      <div class="et-ciri">
        <span><${Ikon} nama="kue" ukuran=${20} />Bahan pilihan</span>
        <span><${Ikon} nama="panci" ukuran=${20} />Dibuat saat dipesan</span>
        <span><${Ikon} nama="toko" ukuran=${20} />Ambil / antar</span>
      </div>
    </div>
  `;
}

function Keranjang({ k, info, url, token, jumlah, atur, kosongkan, keMenu, selesai }) {
  const [nama, setNama] = useState('');
  const [hp, setHp] = useState('');
  const [catatan, setCatatan] = useState('');
  const [kode, setKode] = useState('');
  const [galat, setGalat] = useState('');
  const [mengirim, setMengirim] = useState(false);
  const item = (info.menu || []).filter((m) => jumlah[m.id] > 0).map((m) => ({ ...m, jumlah: jumlah[m.id] }));
  const total = item.reduce((j, m) => j + m.harga * m.jumlah, 0);

  const kirim = async (e) => {
    e.preventDefault();
    if (!item.length) return setGalat('Keranjang masih kosong.');
    if (nama.trim().length < 2) return setGalat('Isi nama Anda.');
    if (!hp.trim()) return setGalat('Isi nomor WhatsApp untuk kabar pesanan.');
    setMengirim(true);
    setGalat('');
    try {
      const j = await pesanOnline.kirim(url, token, { nama: nama.trim(), hp, catatan: catatan.trim(), kodePromo: kode.trim(), item: item.map((m) => ({ idMenu: m.id, jumlah: m.jumlah })) });
      tulis(kunciPesanan(token), j.idPesanan);
      kosongkan();
      if (j.link) location.href = j.link;
      else selesai(j.idPesanan);
    } catch (err) {
      setGalat(err.message || 'Pesanan gagal dikirim. Coba lagi.');
      setMengirim(false);
    }
  };

  if (!item.length) {
    return html`<h1 class="et-judul-layar">Keranjang</h1>
      <${Kosong} judul="Keranjang masih kosong" teks="Yuk pilih kue atau camilan favorit Anda."><button type="button" class="et-tombol" onClick=${() => keMenu('')}>Lihat menu</button><//>`;
  }
  return html`
    <h1 class="et-judul-layar">Keranjang</h1>
    <section class="et-panel">
      ${item.map(
        (m) => html`<div class="et-baris-keranjang" key=${m.id}>
          <span class="et-mini-foto"><${Foto} src=${m.fotoUrl} ikon="kue" ukuranIkon=${22} /></span>
          <span class="et-baris-teks"><b>${m.nama}</b><small>${rupiah(m.harga)}</small></span>
          <span class="et-baris-kanan"><b>${rupiah(m.harga * m.jumlah)}</b><${TombolTambah} m=${m} n=${m.jumlah} atur=${atur} /></span>
        </div>`,
      )}
      <button type="button" class="et-lihat" onClick=${() => keMenu('')}>+ Tambah menu lain</button>
    </section>
    <form class="et-panel kolom" onSubmit=${kirim} novalidate aria-labelledby="h-data-pembeli">
      <h2 class="et-h2" id="h-data-pembeli">Data pemesan</h2>
      <label class="bidang"><span>Nama</span><input class="input" maxlength="60" autocomplete="name" value=${nama} onInput=${(e) => setNama(e.target.value)} /></label>
      <label class="bidang"><span>Nomor WhatsApp</span><input class="input" inputmode="tel" autocomplete="tel" maxlength="20" placeholder="0812…" value=${hp} onInput=${(e) => setHp(e.target.value)} /><span class="bantu">Untuk kabar pesanan dan promo dari toko.</span></label>
      <label class="bidang"><span>Catatan (opsional)</span><input class="input" maxlength="300" value=${catatan} onInput=${(e) => setCatatan(e.target.value)} placeholder="mis. diambil jam 4 sore / alamat antar" /></label>
      <label class="bidang"><span>Kode promo (opsional)</span><input class="input" maxlength="30" style="text-transform:uppercase" value=${kode} onInput=${(e) => setKode(e.target.value)} /></label>
      <div class="hasil-baris"><span><b class="biasa">Total</b>${kode.trim() ? html`<br /><small class="teks-kecil">Diskon promo dihitung saat dipesan</small>` : ''}</span><b class="et-total">${rupiah(total)}</b></div>
      ${!info.buka && html`<div class="info">Toko sedang tutup. ${info.catatan || 'Silakan kembali lagi nanti.'}</div>`}
      ${info.buka && !info.bayarOnline && html`<div class="info">Toko ini belum menerima pesanan online. Hubungi toko${info.wa ? ' di WhatsApp' : ''} untuk memesan.</div>`}
      ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
      <button class="et-tombol lebar" type="submit" disabled=${mengirim || !info.buka || !info.bayarOnline}>${mengirim ? 'Mengirim pesanan…' : info.mayar ? 'Pesan & bayar' : 'Pesan sekarang'}</button>
      <p class="bantu" style="text-align:center">${info.mayar ? 'Pembayaran lewat Mayar: QRIS, e-wallet, atau transfer bank.' : 'Setelah memesan, bayar lewat transfer bank atau scan QRIS toko.'}</p>
    </form>
  `;
}

function FormTestimoni({ url, token, idPesanan, nama }) {
  const [bintang, setBintang] = useState(5);
  const [isi, setIsi] = useState('');
  const [hasil, setHasil] = useState('');
  const [galat, setGalat] = useState('');
  const [sibuk, setSibuk] = useState(false);
  if (hasil) return html`<div class="info" role="status">${hasil}</div>`;
  const kirim = async (e) => {
    e.preventDefault();
    setSibuk(true);
    setGalat('');
    try {
      const j = await kirimTestimoni(url, token, { idPesanan, nama, isi: isi.trim(), bintang });
      setHasil(j.pesan || 'Terima kasih atas testimoninya!');
    } catch (err) {
      setGalat(err.message);
    } finally {
      setSibuk(false);
    }
  };
  return html`<form class="et-panel kolom" onSubmit=${kirim} novalidate aria-labelledby="h-testi-kirim">
    <h2 class="et-h2" id="h-testi-kirim">Bagikan pengalaman Anda</h2>
    <div class="et-pilih-bintang" role="group" aria-label="Beri bintang">
      ${[1, 2, 3, 4, 5].map((n) => html`<button type="button" class=${n <= bintang ? 'nyala' : ''} aria-label=${n + ' bintang'} aria-pressed=${n === bintang} onClick=${() => setBintang(n)}>★</button>`)}
    </div>
    <label class="bidang"><span>Testimoni</span><textarea class="input" rows="3" maxlength="500" value=${isi} onInput=${(e) => setIsi(e.target.value)} placeholder="Bagaimana rasanya? Apa yang paling Anda suka?"></textarea></label>
    ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
    <button class="et-tombol lebar" type="submit" disabled=${sibuk || isi.trim().length < 5}>${sibuk ? 'Mengirim…' : 'Kirim testimoni'}</button>
  </form>`;
}

/** Status pesanan: cara bayar (transfer/QRIS atau Mayar), lalu kabar pesanan. Dicek berkala sampai lunas. */
function StatusPesanan({ url, token, idPesanan, info, keMenu }) {
  const [s, setS] = useState(null);
  const [galat, setGalat] = useState('');
  useEffect(() => {
    let hidup = true;
    let t = null;
    const cek = async () => {
      try {
        const j = await pesanOnline.status(url, token, idPesanan);
        if (!hidup) return;
        setS(j);
        setGalat('');
        if (!j.lunas && j.status !== 'batal') t = setTimeout(cek, CEK_TIAP_MS);
      } catch (e) {
        if (hidup) setGalat(e.message);
      }
    };
    cek();
    return () => {
      hidup = false;
      clearTimeout(t);
    };
  }, [idPesanan]);
  if (galat) return html`<${Kosong} judul="Pesanan tidak ditemukan" teks=${galat}><button type="button" class="et-tombol" onClick=${() => keMenu('')}>Pesan lagi</button><//>`;
  if (!s) return html`<p role="status">Memeriksa pesanan…</p>`;
  const LABEL = { baru: 'Pesanan diterima toko', diproses: 'Sedang disiapkan', siap: 'Siap diambil / dikirim', selesai: 'Selesai', batal: 'Pesanan dibatalkan', menunggu: 'Menunggu pembayaran' };
  const manual = !s.lunas && s.bayarManual;
  const waBukti = manual ? waTautan(s.wa, `Halo, saya sudah bayar pesanan #${s.nomor} sebesar ${rupiah(s.total)} atas nama ${s.nama}. Berikut bukti transfernya.`) : '';
  return html`<div class="kolom" style="gap:16px">
    <h1 class="et-judul-layar">Pesanan Anda</h1>
    <div class="kosong et-status" role="status">
      <span class="skor-bulat" style=${`background:${s.lunas ? 'var(--hijau)' : s.status === 'batal' ? 'var(--bahaya)' : 'var(--kuning)'};color:#fff`}><${Ikon} nama=${s.lunas ? 'centang' : 'jam'} ukuran=${34} /></span>
      <h3>${s.lunas ? 'Pembayaran diterima' : s.status === 'batal' ? 'Pesanan dibatalkan' : manual ? 'Silakan lakukan pembayaran' : 'Menunggu pembayaran'}</h3>
      <p>Pesanan #${s.nomor} · ${LABEL[s.status] || s.status}</p>
    </div>
    ${manual &&
    html`<section class="et-panel kolom" aria-labelledby="h-cara-bayar">
      <h2 class="et-h2" id="h-cara-bayar">Cara bayar</h2>
      <div class="total-bayar"><small>Total yang dibayar</small><b>${rupiah(s.total)}</b></div>
      <${InfoTransfer} rekening=${s.bayarManual.rekening || []} qris=${s.bayarManual.qrisUrl || ''} total=${0} />
      <p class="bantu">Scan QRIS atau transfer ke rekening di atas, lalu kirim bukti bayar ke WhatsApp toko. Pesanan diproses setelah toko mengonfirmasi; halaman ini berubah otomatis.</p>
      ${waBukti && html`<a class="et-tombol lebar" href=${waBukti} target="_blank" rel="noopener"><${Ikon} nama="kirim" ukuran=${18} />Kirim bukti bayar via WhatsApp</a>`}
    </section>`}
    <section class="et-panel kolom">
      ${(s.item || []).map((i) => html`<div class="hasil-baris" key=${i.idMenu}><span>${i.jumlah}× ${i.nama}</span><b class="biasa">${rupiah(i.harga * i.jumlah)}</b></div>`)}
      <div class="hasil-baris"><span><b class="biasa">Total</b></span><b>${rupiah(s.total)}</b></div>
    </section>
    ${s.link && html`<a class="et-tombol lebar" href=${s.link}>Bayar sekarang</a>`}
    ${s.bisaTestimoni && html`<${FormTestimoni} url=${url} token=${token} idPesanan=${idPesanan} nama=${s.nama} />`}
    <button type="button" class="et-tombol garis" onClick=${() => keMenu('')}>Buat pesanan lain</button>
    <${Testimoni} daftar=${info && info.testimoni} />
  </div>`;
}

// ---------- Halaman utama etalase ----------

export function PesanOnline({ k, token }) {
  const url = alamatServer(k);
  const q = k.rute.kueri;
  const [info, setInfo] = useState(null);
  const [galat, setGalat] = useState('');
  const [jumlah, setJumlah] = useState(() => baca(kunciKeranjang(token), {}) || {});
  const terakhir = ingatan(token);

  useEffect(() => {
    if (!url) return setGalat('Link ini tidak lengkap. Minta toko mengirim ulang link pemesanannya.');
    pesanOnline
      .info(url, token)
      .then(setInfo)
      .catch((e) => setGalat(e.message || 'Link tidak bisa dibuka.'));
  }, [token, url]);
  useEffect(() => tulis(kunciKeranjang(token), jumlah), [jumlah]);

  const namaToko = (info && info.namaToko) || 'Pesan online';
  const logo = (info && info.logoUrl) || LOGO_BAWAAN;
  useEffect(() => terapkanMerekDokumen({ nama: namaToko, logo }), [namaToko, logo]);

  const menu = (info && info.menu) || [];
  // Buang isi keranjang yang sudah tidak ada di menu.
  const isi = Object.fromEntries(Object.entries(jumlah).filter(([id, n]) => n > 0 && menu.some((m) => m.id === id)));
  const jumlahKeranjang = Object.values(isi).reduce((a, b) => a + b, 0);
  const atur = (m, n) => {
    const maks = m.sisa === null ? 100 : Math.min(100, m.sisa);
    setJumlah((j) => ({ ...j, [m.id]: Math.max(0, Math.min(maks, n)) }));
  };

  // ?pesanan= dari Mayar (setelah membayar) juga membuka layar pesanan.
  const layar = q.pesanan ? 'pesanan' : q.l || '';
  const idPesanan = q.pesanan || q.id || terakhir;
  const ke = (l, extra) => keLayar(k, token, l, extra);
  const keMenu = (kat) => ke('menu', { kat });
  const buka = (m) => ke('produk', { id: m.id });
  const produk = layar === 'produk' ? menu.find((m) => m.id === q.id) : null;

  let isiLayar;
  if (galat) isiLayar = html`<${Kosong} judul="Link tidak bisa dibuka" teks=${galat} />`;
  else if (layar === 'pesanan') {
    isiLayar = idPesanan
      ? html`<${StatusPesanan} key=${idPesanan} url=${url} token=${token} idPesanan=${idPesanan} info=${info} keMenu=${keMenu} />`
      : html`<h1 class="et-judul-layar">Pesanan Anda</h1><${Kosong} judul="Belum ada pesanan" teks="Pesanan yang Anda buat dari perangkat ini muncul di sini."><button type="button" class="et-tombol" onClick=${() => keMenu('')}>Lihat menu</button><//>`;
  } else if (!info) isiLayar = html`<p role="status" class="et-memuat">Membuka toko…</p>`;
  else if (layar === 'menu') isiLayar = html`<${DaftarMenu} info=${info} jumlah=${isi} atur=${atur} buka=${buka} kat=${q.kat || ''} keMenu=${keMenu} />`;
  else if (layar === 'produk') {
    isiLayar = produk
      ? html`<${DetailProduk} key=${produk.id} info=${info} m=${produk} jumlah=${isi} atur=${atur} kembali=${() => history.back()} keKeranjang=${() => ke('keranjang')} />`
      : html`<${Kosong} judul="Menu tidak ditemukan" teks="Mungkin sudah tidak dijual."><button type="button" class="et-tombol" onClick=${() => keMenu('')}>Lihat menu</button><//>`;
  } else if (layar === 'keranjang') {
    isiLayar = html`<${Keranjang} k=${k} info=${info} url=${url} token=${token} jumlah=${isi} atur=${atur} kosongkan=${() => (tulis(kunciKeranjang(token), {}), setJumlah({}))} keMenu=${keMenu} selesai=${(id) => ke('pesanan', { id })} />`;
  } else isiLayar = html`<${Beranda} info=${info} jumlah=${isi} atur=${atur} buka=${buka} keMenu=${keMenu} />`;

  const NAV = [
    { l: '', label: 'Beranda', ikon: 'rumah' },
    { l: 'menu', label: 'Menu', ikon: 'kue' },
    { l: 'keranjang', label: 'Keranjang', ikon: 'keranjang', lencana: jumlahKeranjang },
    { l: 'pesanan', label: 'Pesanan', ikon: 'struk' },
  ];
  const aktif = layar === 'produk' ? 'menu' : layar;

  return html`<div class="etalase">
    ${layar !== 'produk' &&
    html`<header class="et-kepala">
      <button type="button" class="et-merek" onClick=${() => ke('')}><${LogoMerek} src=${logo} ukuran=${36} /><span>${namaToko}</span></button>
      <button type="button" class="et-ikon-keranjang" aria-label=${`Keranjang (${jumlahKeranjang})`} onClick=${() => ke('keranjang')}>
        <${Ikon} nama="keranjang" ukuran=${22} />${jumlahKeranjang > 0 && html`<i>${jumlahKeranjang}</i>`}
      </button>
    </header>`}
    <main class=${'et-isi' + (layar === 'produk' ? ' penuh' : '')}>${isiLayar}</main>
    ${jumlahKeranjang > 0 && layar !== 'keranjang' && layar !== 'pesanan' && layar !== 'produk' &&
    html`<button type="button" class="et-bar-keranjang" onClick=${() => ke('keranjang')}>
      <span>${jumlahKeranjang} item · ${rupiah(menu.reduce((j, m) => j + (isi[m.id] || 0) * m.harga, 0))}</span><b>Buka keranjang</b>
    </button>`}
    <nav class="et-nav" aria-label="Navigasi toko">
      ${NAV.map(
        (n) => html`<button type="button" class=${aktif === n.l ? 'aktif' : ''} aria-current=${aktif === n.l ? 'page' : null} onClick=${() => ke(n.l)}>
          <span class="et-nav-ikon"><${Ikon} nama=${n.ikon} ukuran=${22} />${n.lencana > 0 && html`<i>${n.lencana}</i>`}</span>${n.label}
        </button>`,
      )}
    </nav>
  </div>`;
}

/** Halaman bayar tiruan untuk server uji (pengganti halaman Mayar). */
export function TiruanMayar({ k, id }) {
  // Server uji menyajikan aplikasi dan /api di alamat yang sama.
  const url = alamatServer(k) || location.origin + '/api';
  const [hasil, setHasil] = useState(null);
  const [galat, setGalat] = useState('');
  const bayar = async () => {
    try {
      setHasil(await panggilApi(url, { aksi: 'tiruanLunas', idMayar: id }));
    } catch (e) {
      setGalat(e.message);
    }
  };
  return html`<div class="penilai"><div class="isi">
    <${Kosong} judul="Mayar (tiruan)" teks=${hasil ? `Pembayaran ${rupiah(hasil.jumlah)} berhasil.` : 'Halaman ini hanya ada di server uji, menggantikan halaman pembayaran Mayar.'}>
      ${!hasil && html`<button class="btn solid" onClick=${bayar}>Bayar (tiruan)</button>`}
      ${hasil && html`<button class="btn" onClick=${() => history.back()}>Kembali</button>`}
      ${galat && html`<p class="galat-teks">${galat}</p>`}
    <//>
  </div></div>`;
}
