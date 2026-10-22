// Resep baru / ubah resep: nama, gambar acuan, kategori, target yang ingin dicapai.

import { html, useState } from '../../vendor/preact-htm.js';
import { Kerangka, Hero, FotoInput, ChipKategori, Kosong } from '../ui/komponen.js';
import { Ikon } from '../ui/ikon.js';
import { pergi, tautan } from '../ui/router.js';
import { patchFoto } from '../ui/gambar.js';
import { tanya, tampilToast } from '../ui/pesan.js';
import { daftarKategori, tambahKategori, buatResep, hapusResep, fotoSrc } from '../lib/repo.js';

const fokuskan = (el) => el && el.focus();

export function FormResep({ k, id }) {
  const { db, rute } = k;
  const resep = id ? db.ambil('Resep', id) : null;
  const kategori = daftarKategori(db);
  const fotoAwal = resep ? fotoSrc(resep, 'fotoAcuanLokal', 'fotoAcuanUrl') : '';

  const [nama, setNama] = useState(resep ? resep.nama : '');
  const [idKategori, setIdKategori] = useState(resep ? resep.idKategori : rute.kueri.kat || (kategori[0] && kategori[0].id) || '');
  const [target, setTarget] = useState(resep ? resep.targetDicapai : '');
  const [foto, setFoto] = useState(fotoAwal);
  const [kategoriBaru, setKategoriBaru] = useState(null);
  const [galat, setGalat] = useState('');

  if (id && !resep) {
    return html`<${Kerangka} k=${k} aktif="resep">
      <${Hero} label="Ubah resep" judul="Tidak ada" kembali="/resep" />
      <div class="isi"><${Kosong} judul="Resep tidak ditemukan" teks="Mungkin sudah dihapus dari perangkat lain."><a class="btn solid" href=${tautan('/resep')}>Ke daftar resep</a><//></div>
    <//>`;
  }

  const tambahKat = () => {
    const baru = tambahKategori(db, kategoriBaru);
    if (baru) setIdKategori(baru.id);
    setKategoriBaru(null);
  };

  const simpan = () => {
    if (!nama.trim()) {
      setGalat('Nama resep wajib diisi.');
      document.getElementById('nama-resep')?.focus();
      return;
    }
    if (!idKategori) {
      setGalat('Pilih satu kategori.');
      return;
    }
    let tersimpan;
    if (resep) {
      tersimpan = db.simpan('Resep', {
        ...resep,
        nama: nama.trim(),
        idKategori,
        targetDicapai: target.trim(),
        ...patchFoto(fotoAwal, foto, 'fotoAcuanLokal', 'fotoAcuanUrl'),
      });
    } else {
      tersimpan = buatResep(db, { nama, idKategori, targetDicapai: target, fotoAcuanLokal: foto });
      db.aturMeta({ resepTerakhir: tersimpan.id });
    }
    tampilToast(resep ? 'Resep disimpan.' : 'Resep dibuat. Sekarang catat eksperimen pertamanya.');
    pergi('/resep/' + tersimpan.id, { ganti: true });
  };

  const hapus = async () => {
    const jumlah = db.semua('Eksperimen', (e) => e.idResep === resep.id).length;
    const ya = await tanya({
      judul: `Hapus “${resep.nama}”?`,
      teks: jumlah ? `${jumlah} eksperimen beserta penilaiannya ikut terhapus. Ini tidak bisa dibatalkan.` : 'Resep ini akan dihapus.',
      ya: 'Hapus resep',
      bahaya: true,
    });
    if (!ya) return;
    hapusResep(db, resep.id);
    tampilToast('Resep dihapus.');
    pergi('/resep', { ganti: true });
  };

  return html`<${Kerangka} k=${k} aktif="resep">
    <${Hero} label=${resep ? 'Ubah resep' : 'Resep baru'} judul=${resep ? 'Ubah resep' : 'Resep baru'} kembali=${resep ? '/resep/' + resep.id : '/resep'} />
    <form class="isi" onSubmit=${(e) => (e.preventDefault(), simpan())} novalidate>
      <div class="kolom-2">
        <div class="kolom">
          <label class="bidang" for="nama-resep">
            <span>Nama resep</span>
            <input id="nama-resep" class="input" placeholder="mis. Brownies Fudgy" maxlength="80" autocomplete="off" value=${nama} aria-invalid=${galat && !nama.trim() ? 'true' : 'false'} onInput=${(e) => (setNama(e.target.value), setGalat(''))} />
          </label>

          <div class="bidang">
            <span>Kategori</span>
            <${ChipKategori}
              daftar=${kategori}
              dipilih=${idKategori}
              onPilih=${setIdKategori}
              tambah=${kategoriBaru === null
                ? html`<button type="button" class="chip putus" onClick=${() => setKategoriBaru('')}><${Ikon} nama="plus" ukuran=${16} />Kategori baru</button>`
                : html`<span class="cari-baris" style="flex:1 1 260px">
                    <input class="input kecil" placeholder="Nama kategori" aria-label="Nama kategori baru" maxlength="30" ref=${fokuskan} value=${kategoriBaru} onInput=${(e) => setKategoriBaru(e.target.value)} onKeyDown=${(e) => e.key === 'Enter' && (e.preventDefault(), tambahKat())} />
                    <button type="button" class="btn solid" onClick=${tambahKat}>Tambah</button>
                    <button type="button" class="btn abu" onClick=${() => setKategoriBaru(null)}>Batal</button>
                  </span>`}
            />
          </div>

          <label class="bidang" for="target-resep">
            <span>Target yang ingin dicapai</span>
            <textarea id="target-resep" class="area" rows="4" maxlength="500" placeholder="mis. Brownies fudgy dengan tepi renyah, HPP di bawah Rp 5.000 per potong." value=${target} onInput=${(e) => setTarget(e.target.value)}></textarea>
            <span class="bantu">Rasa, tekstur, harga, atau apa pun yang ingin Anda capai lewat eksperimen.</span>
          </label>
        </div>

        <div class="kolom">
          <div class="bidang">
            <span>Gambar acuan masakan</span>
            <${FotoInput} nilai=${foto} onUbah=${setFoto} judul="Tambah gambar acuan" bantu="Foto atau gambar model masakan yang dituju, supaya jelas tampilan akhirnya." aksen="var(--tomat)" ikon="gambar" />
          </div>
        </div>
      </div>

      ${galat && html`<p class="galat-teks" role="alert">${galat}</p>`}
      <button class="pil" type="submit">Simpan resep<span class="ujung"><${Ikon} nama="panah" /></span></button>
      ${resep && html`<button type="button" class="btn bahaya lebar" onClick=${hapus}><${Ikon} nama="sampah" ukuran=${18} />Hapus resep</button>`}
    </form>
  <//>`;
}
