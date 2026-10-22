// Memperkecil foto dari kamera/galeri agar hemat penyimpanan dan cepat diunggah.

const SISI_MAKS = 900;
const MUTU = 0.78;

function muatGambar(file) {
  return new Promise((ok, gagal) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => {
      URL.revokeObjectURL(url);
      ok(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      gagal(new Error('Berkas ini bukan gambar yang bisa dibuka.'));
    };
    img.src = url;
  });
}

/** File gambar -> data URL JPEG dengan sisi terpanjang <= 900 px. Dengan { png: true } hasilnya PNG transparan. */
export async function kompres(file, sisiMaks = SISI_MAKS, mutu = MUTU, { png = false } = {}) {
  if (!file || !String(file.type).startsWith('image/')) throw new Error('Pilih berkas gambar (JPG, PNG, atau HEIC dari kamera).');
  let sumber;
  try {
    sumber = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    sumber = await muatGambar(file);
  }
  const lebar = sumber.width || sumber.naturalWidth || sisiMaks; // SVG tanpa ukuran bawaan
  const tinggi = sumber.height || sumber.naturalHeight || sisiMaks;
  const skala = Math.min(1, sisiMaks / Math.max(lebar, tinggi));
  const kanvas = document.createElement('canvas');
  kanvas.width = Math.max(1, Math.round(lebar * skala));
  kanvas.height = Math.max(1, Math.round(tinggi * skala));
  const ctx = kanvas.getContext('2d');
  if (!png) {
    ctx.fillStyle = '#fff'; // PNG transparan -> latar putih
    ctx.fillRect(0, 0, kanvas.width, kanvas.height);
  }
  ctx.drawImage(sumber, 0, 0, kanvas.width, kanvas.height);
  if (sumber.close) sumber.close();
  return png ? kanvas.toDataURL('image/png') : kanvas.toDataURL('image/jpeg', mutu);
}

/** Logo aplikasi: PNG transparan, sisi terpanjang <= 256 px. */
export const kompresLogo = (file) => kompres(file, 256, 1, { png: true });

/** Perubahan kolom foto saat disimpan: kosong bila foto tidak berubah. */
export function patchFoto(awal, baru, kolomLokal, kolomUrl) {
  if ((awal || '') === (baru || '')) return {};
  return { [kolomLokal]: baru || '', [kolomUrl]: '' };
}
