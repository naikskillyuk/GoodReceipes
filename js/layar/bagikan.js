// Bagikan kode QR supaya orang lain bisa menilai eksperimen tanpa login.

import { html, useEffect, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Kosong, unduhBerkas, LogoMerek } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tampilToast } from '../ui/pesan.js';
import { tautan } from '../ui/router.js';
import { pastikanToken, skorDariDB, penilaianEksperimen, ambilMerek } from '../lib/repo.js';
import { desimal1 } from '../lib/util.js';
import { ASPEK, CONTOH_PANDUAN, BATAS_PANDUAN } from '../lib/skor.js';

/** Tautan yang dibuka penilai. Alamat server ikut di tautan kecuali sudah ditetapkan di config.js. */
export function buatTautanNilai(token, scriptUrl) {
  const tetap = (window.APP_CONFIG && window.APP_CONFIG.scriptUrl) || '';
  const dasar = (location.origin + location.pathname).replace(/index\.html$/, '');
  return `${dasar}#/nilai/${token}` + (tetap || !scriptUrl ? '' : `?u=${encodeURIComponent(scriptUrl)}`);
}

function buatQR(teks, opsi) {
  const qr = window.qrcode(0, 'M');
  qr.addData(teks);
  qr.make();
  return qr.createSvgTag(opsi);
}

async function salin(teks) {
  try {
    await navigator.clipboard.writeText(teks);
    return true;
  } catch {
    const t = document.createElement('textarea');
    t.value = teks;
    t.style.position = 'fixed';
    t.style.opacity = '0';
    document.body.appendChild(t);
    t.select();
    let ok = false;
    try {
      ok = document.execCommand('copy');
    } catch {
      ok = false;
    }
    t.remove();
    return ok;
  }
}

function svgKePng(svg, ukuran) {
  return new Promise((ok, gagal) => {
    const img = new Image();
    img.onload = () => {
      const kanvas = document.createElement('canvas');
      kanvas.width = kanvas.height = ukuran;
      const ctx = kanvas.getContext('2d');
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, ukuran, ukuran);
      ctx.imageSmoothingEnabled = false;
      ctx.drawImage(img, 0, 0, ukuran, ukuran);
      kanvas.toBlob((b) => (b ? ok(b) : gagal(new Error('Gagal membuat gambar.'))), 'image/png');
    };
    img.onerror = () => gagal(new Error('Gagal membuat gambar.'));
    img.src = 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
  });
}

export function Bagikan({ k, id }) {
  const { db } = k;
  const e = db.ambil('Eksperimen', id);
  const resep = e && db.ambil('Resep', e.idResep);
  const [sibuk, setSibuk] = useState(false);

  useEffect(() => {
    if (e && !e.tokenNilai) pastikanToken(db, id);
  }, [id, e && e.tokenNilai]);

  if (!e || !resep) {
    return html`<${Kerangka} k=${k} aktif="resep">
      <${Hero} label="Bagikan" judul="Tidak ada" kembali="/resep" />
      <div class="isi"><${Kosong} judul="Eksperimen tidak ditemukan"><a class="btn solid" href=${tautan('/resep')}>Ke daftar resep</a><//></div>
    <//>`;
  }

  const kat = db.ambil('Kategori', resep.idKategori);
  const p = db.pengaturan;
  const tersambung = !!(p.scriptUrl && p.kunci);
  const kotor = db.ambilKotor();
  const belumSinkron = (kotor.Eksperimen || []).some((r) => r.id === e.id) || (kotor.Resep || []).some((r) => r.id === e.idResep);
  const aktif = tersambung && !belumSinkron && !!e.tokenNilai;
  const tautanNilai = e.tokenNilai ? buatTautanNilai(e.tokenNilai, p.scriptUrl) : '';
  const skor = skorDariDB(db, id);
  const dariOrangLain = penilaianEksperimen(db, id).filter((n) => !n.dariPemilik).length;
  const svg = tautanNilai ? buatQR(tautanNilai, { cellSize: 4, margin: 2, scalable: true, alt: `Kode QR penilaian ${resep.nama} eksperimen ${e.nomor}` }) : '';

  const ubah = (patch) => db.simpan('Eksperimen', { ...e, ...patch });
  const panduan = e.panduanNilai && typeof e.panduanNilai === 'object' ? e.panduanNilai : {};
  const ubahPanduan = (kunci, teks) => ubah({ panduanNilai: { ...panduan, [kunci]: teks } });
  const simpanSekarang = async () => {
    setSibuk(true);
    await k.sinkronSekarang().catch(() => {});
    setSibuk(false);
  };
  const bagikanSistem = async () => {
    try {
      await navigator.share({ title: `Nilai ${resep.nama}`, text: `Tolong beri nilai untuk ${resep.nama} (Eksperimen ${e.nomor}):`, url: tautanNilai });
    } catch {
      /* dibatalkan */
    }
  };
  const unduhQR = async () => {
    try {
      const png = await svgKePng(buatQR(tautanNilai, { cellSize: 10, margin: 4 }), 600);
      unduhBerkas(`qr-${resep.nama.replace(/[^\w]+/g, '-').toLowerCase()}-eks-${e.nomor}.png`, png);
    } catch (err) {
      tampilToast(err.message);
    }
  };

  return html`<${Kerangka} k=${k} aktif="resep">
    <${Hero} warna=${kat ? kat.warna : 'var(--tomat)'} label=${resep.nama} judul="Bagikan QR" kembali=${'/eksperimen/' + id} />
    <div class="isi">
      <div class="kolom-2">
        <div class="kolom">
          <div class="kartu-qr">
            <div class="merek-qr"><${LogoMerek} src=${ambilMerek(db).logo} ukuran=${32} /><span>${ambilMerek(db).nama}</span></div>
            <div class="label-kecil">${resep.nama} · Eksperimen ${e.nomor}</div>
            <div class=${'qr-kotak' + (aktif ? '' : ' mati')} role="img" aria-label="Kode QR penilaian" dangerouslySetInnerHTML=${{ __html: svg }}></div>
            <p style="font-weight:700">Pindai untuk memberi nilai</p>
            <p class="tautan-teks">${tautanNilai || 'Menyiapkan tautan…'}</p>
          </div>
          <div class="baris-btn">
            <button class="btn solid" disabled=${!tautanNilai} onClick=${async () => tampilToast((await salin(tautanNilai)) ? 'Tautan disalin.' : 'Gagal menyalin. Salin manual dari teks tautan.')}><${Ikon} nama="salin" ukuran=${18} />Salin tautan</button>
            ${navigator.share && html`<button class="btn" disabled=${!tautanNilai} onClick=${bagikanSistem}><${Ikon} nama="bagikan" ukuran=${18} />Kirim</button>`}
            <button class="btn" disabled=${!tautanNilai} onClick=${unduhQR}><${Ikon} nama="unduh" ukuran=${18} />Unduh QR</button>
          </div>
        </div>

        <div class="kolom">
          ${!tersambung &&
          html`<div class="peringatan" role="alert"><b>Belum tersambung ke server.</b>Penilai membuka tautan lewat server milik Anda. Sambungkan dulu di <a href=${tautan('/pengaturan')} style="text-decoration:underline">Pengaturan</a>, baru kode QR ini berfungsi.</div>`}
          ${tersambung && belumSinkron &&
          html`<div class="peringatan" role="alert"><b>Menyimpan ke server…</b>Kode QR aktif begitu eksperimen ini tersimpan. Bila lama, periksa internet lalu coba lagi.
            <div style="margin-top:10px"><button class="btn solid" onClick=${simpanSekarang} disabled=${sibuk || k.status.sedang}><${Ikon} nama="sinkron" ukuran=${18} />Coba lagi</button></div></div>`}
          ${aktif && html`<div class="info"><b>Kode QR aktif.</b>Siapa pun yang punya tautan ini bisa menilai tanpa login. Penilaian langsung tersimpan di database dan muncul di sini dalam beberapa detik.</div>`}

          <div class="kartu">
            <div class="label-kecil" style="margin-bottom:4px">Pengaturan penilaian</div>
            <label class="sakelar">
              <span><b>Terima penilaian</b><small>Matikan untuk menutup penilaian.</small></span>
              <input type="checkbox" checked=${e.terimaNilai !== false} onChange=${(ev) => ubah({ terimaNilai: ev.target.checked })} />
            </label>
            <label class="sakelar">
              <span><b>Nama wajib diisi</b><small>Jika mati, penilai boleh anonim.</small></span>
              <input type="checkbox" checked=${!!e.wajibNama} onChange=${(ev) => ubah({ wajibNama: ev.target.checked })} />
            </label>
            <p class="bantu">Perubahan langsung berlaku bagi penilai.</p>
          </div>

          <section class="kartu kolom" aria-labelledby="h-petunjuk">
            <div>
              <h2 class="label-kecil" id="h-petunjuk" style="margin:0 0 4px">Petunjuk untuk penilai</h2>
              <p class="bantu" style="margin:0">Jelaskan hasil yang Anda inginkan supaya penilai paham apa yang dinilai. Semua boleh dikosongkan. Eksperimen baru dan duplikat resep ini ikut memakai petunjuk yang sama.</p>
            </div>
            <label class="bidang">
              <span>Catatan chef <small class="teks-kecil">(tampil paling atas, boleh dikosongkan)</small></span>
              <textarea class="area" rows="3" maxlength=${BATAS_PANDUAN.catatanChef} placeholder="mis. Eksperimen ini gulanya saya kurangi 20 g. Menurut saya teksturnya sudah pas, tapi rasanya masih kurang gurih." value=${e.catatanChef || ''} onInput=${(ev) => ubah({ catatanChef: ev.target.value })}></textarea>
            </label>
            <label class="bidang">
              <span>Petunjuk umum</span>
              <textarea class="area" rows="2" maxlength=${BATAS_PANDUAN.umum} placeholder=${CONTOH_PANDUAN.umum} value=${panduan.umum || ''} onInput=${(ev) => ubahPanduan('umum', ev.target.value)}></textarea>
            </label>
            ${ASPEK.map(
              (a) => html`<label class="bidang" key=${a.kunci}>
                <span>${a.label}</span>
                <input class="input" maxlength=${BATAS_PANDUAN.aspek} placeholder=${CONTOH_PANDUAN[a.kunci]} value=${panduan[a.kunci] || ''} onInput=${(ev) => ubahPanduan(a.kunci, ev.target.value)} />
              </label>`,
            )}
            ${tautanNilai && html`<a class="btn" href=${tautanNilai} target="_blank" rel="noopener"><${Ikon} nama="mata" ukuran=${18} />Lihat seperti penilai</a>`}
          </section>

          <a class="kartu" href=${tautan('/eksperimen/' + id)} style="display:flex;align-items:center;justify-content:space-between;gap:12px">
            <span><b style="display:block">${dariOrangLain} penilai dari tautan</b><span class="teks-kecil">${skor.jumlah ? `Skor rata-rata ${desimal1(skor.rata)} dari ${skor.jumlah} penilaian` : 'Belum ada penilaian masuk'}</span></span>
            <${Ikon} nama="maju" />
          </a>
        </div>
      </div>
    </div>
  <//>`;
}
