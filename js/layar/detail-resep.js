// Detail resep: hero berwarna kategori, tiga tab (Eksperimen, HPP & Harga, Marketing).

import { html } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, Tab, Stat, Foto, Kosong } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { tautan, pergi } from '../ui/router.js';
import { tanya, tampilToast } from '../ui/pesan.js';
import { ringkasResep, dataHPP, skorDariDB, fotoSrc, penilaianEksperimen, hapusResep } from '../lib/repo.js';
import { desimal1, angka, rupiah } from '../lib/util.js';
import { PanelHPP } from './hpp.js';
import { PanelMarketing } from './marketing.js';

function ringkasEksperimen(e) {
  const bagian = [];
  if (e.porsi) bagian.push(`${angka(e.porsi, e.porsi % 1 ? 1 : 0)} ${e.satuanPorsi || 'porsi'}`);
  if (e.suhuC) bagian.push(`${e.suhuC}°C`);
  if (e.waktuMenit) bagian.push(`${e.waktuMenit} mnt`);
  return bagian.join(' · ') || 'Belum ada detail';
}

function PanelEksperimen({ k, r }) {
  const { db } = k;
  const { resep, eksperimen } = r;
  const acuan = fotoSrc(resep, 'fotoAcuanLokal', 'fotoAcuanUrl');
  return html`<div class="isi">
    ${(acuan || resep.targetDicapai) &&
    html`<div class="kartu" style="display:flex;gap:14px;align-items:flex-start">
      ${acuan && html`<div class="foto-mini"><${Foto} src=${acuan} alt=${'Gambar acuan ' + resep.nama} /></div>`}
      <div style="min-width:0;flex:1">
        <div class="label-kecil">Target yang ingin dicapai</div>
        <p style="margin-top:6px;line-height:1.5;overflow-wrap:anywhere">${resep.targetDicapai || 'Belum ada target tertulis.'}</p>
        ${acuan && html`<div class="teks-kecil" style="margin-top:6px">Gambar acuan masakan</div>`}
      </div>
    </div>`}

    ${eksperimen.length === 0
      ? html`<${Kosong} judul="Belum ada eksperimen" teks="Catat percobaan pertama: bahan, takaran, langkah, dan foto hasilnya.">
          <a class="btn solid" href=${tautan(`/resep/${resep.id}/eksperimen/baru`)}>Eksperimen pertama</a>
        <//>`
      : html`<div class="daftar daftar-lebar">
          ${eksperimen.map((e) => {
            const skor = skorDariDB(db, e.id);
            const juara = resep.idJuara === e.id;
            const foto = fotoSrc(e, 'fotoHasilLokal', 'fotoHasilUrl');
            return html`<a class=${'baris-eks' + (juara ? ' juara' : '')} key=${e.id} href=${tautan('/eksperimen/' + e.id)}>
              <span class="nomor">${foto ? html`<${Foto} src=${foto} />` : e.nomor}</span>
              <span class="teks">
                <b>Eksperimen ${e.nomor}${juara ? ' · Juara' : ''}</b>
                <small>${ringkasEksperimen(e)}</small>
                <small>${skor.jumlah ? skor.jumlah + ' penilai' : 'Belum dinilai'}${e.idAsalDuplikat ? '' : ''}</small>
              </span>
              <span class=${'skor-kecil' + (skor.jumlah ? '' : ' nol')}>${skor.jumlah ? desimal1(skor.rata) : '–'}</span>
            </a>`;
          })}
        </div>`}

    ${eksperimen.length >= 2 &&
    html`<a class="pil navy" href=${tautan(`/resep/${resep.id}/bandingkan`)}>Bandingkan eksperimen<span class="ujung"><${Ikon} nama="banding" /></span></a>`}

    <div class="baris-btn">
      <a class="btn" href=${tautan(`/resep/${resep.id}/cetak`)}><${Ikon} nama="unduh" ukuran=${18} />Export PDF</a>
      <button class="btn bahaya" onClick=${() => tanyaHapusResep(db, resep)}><${Ikon} nama="sampah" ukuran=${18} />Hapus resep</button>
    </div>
  </div>`;
}

/** Hapus resep beserta semua eksperimen, penilaian, HPP, dan marketing-nya (setelah konfirmasi). */
export async function tanyaHapusResep(db, resep) {
  const jumlah = db.semua('Eksperimen', (e) => e.idResep === resep.id).length;
  const ya = await tanya({
    judul: `Hapus “${resep.nama}”?`,
    teks: jumlah ? `${jumlah} eksperimen beserta bahan, foto, dan penilaiannya ikut terhapus dari akun Anda. Ini tidak bisa dibatalkan.` : 'Resep ini akan dihapus dari akun Anda.',
    ya: 'Hapus resep',
    bahaya: true,
  });
  if (!ya) return false;
  hapusResep(db, resep.id);
  tampilToast('Resep dihapus.');
  pergi('/resep', { ganti: true });
  return true;
}

export function DetailResep({ k, id, tab }) {
  const { db } = k;
  const resep = db.ambil('Resep', id);
  if (!resep) {
    return html`<${Kerangka} k=${k} aktif="resep">
      <${Hero} label="Resep" judul="Tidak ada" kembali="/resep" />
      <div class="isi"><${Kosong} judul="Resep tidak ditemukan" teks="Mungkin sudah dihapus, atau belum termuat dari server."><a class="btn solid" href=${tautan('/resep')}>Ke daftar resep</a><//></div>
    <//>`;
  }
  const r = ringkasResep(db, resep);
  const data = dataHPP(db, id);
  const warna = r.kategori ? r.kategori.warna : 'var(--tomat)';
  const hppPorsi = data && data.eksperimen && Number.isFinite(data.hpp.hppPorsi) ? angka(Math.round(data.hpp.hppPorsi)) : '–';
  const tabAktif = tab === 'hpp' || tab === 'marketing' ? tab : 'eksperimen';

  return html`<${Kerangka} k=${k} aktif="resep" plus=${tabAktif === 'eksperimen' ? { href: `/resep/${id}/eksperimen/baru`, label: 'Eksperimen baru' } : null}>
    <${Hero}
      warna=${warna}
      foto=${r.foto}
      label=${r.kategori ? r.kategori.nama : 'Resep'}
      judul=${resep.nama}
      kembali="/resep"
      kanan=${html`<a class="bulat" href=${tautan(`/resep/${id}/cetak`)} aria-label="Export PDF"><${Ikon} nama="unduh" /></a>
        <a class="bulat" href=${tautan(`/resep/${id}/ubah`)} aria-label="Ubah resep"><${Ikon} nama="ubah" /></a>`}
    >
      <div class="stat-baris">
        <${Stat} ikon="resep" nilai=${r.eksperimen.length} label="Eksperimen" />
        <${Stat} ikon="bintang" nilai=${Number.isFinite(r.skor) ? desimal1(r.skor) : '–'} label=${r.juara ? 'Skor juara' : 'Skor terbaik'} />
        <${Stat} ikon="kalkulator" nilai=${hppPorsi} label="HPP/porsi" />
      </div>
    <//>
    <${Tab}
      item=${[
        { label: 'Eksperimen', href: `/resep/${id}`, aktif: tabAktif === 'eksperimen' },
        { label: 'HPP & Harga', href: `/resep/${id}/hpp`, aktif: tabAktif === 'hpp' },
        { label: 'Marketing', href: `/resep/${id}/marketing`, aktif: tabAktif === 'marketing' },
      ]}
    />
    ${tabAktif === 'eksperimen' && html`<${PanelEksperimen} k=${k} r=${r} />`}
    ${tabAktif === 'hpp' && html`<${PanelHPP} k=${k} resep=${resep} />`}
    ${tabAktif === 'marketing' && html`<${PanelMarketing} k=${k} resep=${resep} />`}
  <//>`;
}
