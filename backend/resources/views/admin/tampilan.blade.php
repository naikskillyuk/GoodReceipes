@extends('admin.layout')
@section('judul', 'Tampilan')
@section('isi')
@php($frontend = rtrim((string) config('goodrecipes.frontend_url'), '/'))
<div class="baris antara">
  <div>
    <h1>Tampilan <em>aplikasi</em></h1>
    <p class="redup" style="margin:4px 0 0">Berlaku untuk semua pengguna. Pengguna yang memasang logo sendiri di Pengaturan tetap memakai logonya.</p>
  </div>
</div>

<div class="kisi-2">
  @foreach ([
    'logo' => ['judul' => 'Logo aplikasi', 'bantu' => 'Tampil di halaman Login, beranda, menu, ikon tab, dan halaman penilai. Gambar persegi, PNG transparan paling bagus. Diperkecil otomatis ke 512 piksel.', 'bawaan' => $frontend.'/icons/icon.svg', 'maks' => 512, 'tipe' => 'image/png'],
    'latar' => ['judul' => 'Foto latar halaman Login', 'bantu' => 'Foto cemilan atau masakan yang memenuhi layar di belakang tombol Login. Foto tegak (portrait) paling pas di HP. Diperkecil otomatis ke 1600 piksel.', 'bawaan' => $frontend.'/gambar/latar-masuk.jpg', 'maks' => 1600, 'tipe' => 'image/jpeg'],
  ] as $jenis => $c)
  @php($sekarang = $situs[$jenis === 'logo' ? 'logoUrl' : 'latarUrl'])
  <section class="kartu">
    <div class="baris antara">
      <h2>{{ $c['judul'] }}</h2>
      <span class="lencana {{ $sekarang ? 'ok' : 'belum' }}">{{ $sekarang ? 'Gambar sendiri' : 'Bawaan' }}</span>
    </div>
    <p class="redup" style="margin:0">{{ $c['bantu'] }}</p>
    <div class="pratinjau-{{ $jenis }}">
      <img src="{{ $sekarang ?: $c['bawaan'] }}" alt="{{ $c['judul'] }} saat ini" id="pratinjau-{{ $jenis }}">
    </div>
    <form method="post" action="/admin/tampilan/{{ $jenis }}" class="unggah-gambar" data-maks="{{ $c['maks'] }}" data-tipe="{{ $c['tipe'] }}" data-pratinjau="pratinjau-{{ $jenis }}" style="display:flex;flex-direction:column;gap:10px">
      @csrf
      <input type="hidden" name="gambar">
      <label>Pilih gambar baru
        <input type="file" accept="image/png,image/jpeg,image/webp">
      </label>
      <p class="galat-teks" role="alert" hidden></p>
      <div class="baris">
        <button class="btn utama" type="submit" disabled>Simpan {{ strtolower($c['judul']) }}</button>
      </div>
    </form>
    @if ($sekarang)
    <form method="post" action="/admin/tampilan/{{ $jenis }}/hapus" onsubmit="return confirm('Kembalikan ke gambar bawaan?')">
      @csrf<button class="btn bahaya kecil" type="submit">Kembalikan bawaan</button>
    </form>
    @endif
  </section>
  @endforeach
</div>

<script>
  // Perkecil gambar di browser sebelum dikirim (batas permintaan Vercel 4,5 MB).
  document.querySelectorAll('form.unggah-gambar').forEach((form) => {
    const masukan = form.querySelector('input[type=file]');
    const tersembunyi = form.querySelector('input[name=gambar]');
    const tombol = form.querySelector('button[type=submit]');
    const galat = form.querySelector('.galat-teks');
    const pratinjau = document.getElementById(form.dataset.pratinjau);
    masukan.addEventListener('change', () => {
      const berkas = masukan.files && masukan.files[0];
      tombol.disabled = true;
      galat.hidden = true;
      if (!berkas) return;
      if (!/^image\/(png|jpeg|webp)$/.test(berkas.type)) {
        galat.textContent = 'Pilih gambar PNG, JPG, atau WebP.';
        galat.hidden = false;
        return;
      }
      const gambar = new Image();
      gambar.onload = () => {
        const maks = Number(form.dataset.maks);
        const skala = Math.min(1, maks / Math.max(gambar.naturalWidth, gambar.naturalHeight));
        const kanvas = document.createElement('canvas');
        kanvas.width = Math.round(gambar.naturalWidth * skala);
        kanvas.height = Math.round(gambar.naturalHeight * skala);
        kanvas.getContext('2d').drawImage(gambar, 0, 0, kanvas.width, kanvas.height);
        const data = kanvas.toDataURL(form.dataset.tipe, 0.85);
        URL.revokeObjectURL(gambar.src);
        if (data.length > 3800000) {
          galat.textContent = 'Gambar masih terlalu besar setelah diperkecil. Coba gambar lain.';
          galat.hidden = false;
          return;
        }
        tersembunyi.value = data;
        pratinjau.src = data;
        tombol.disabled = false;
      };
      gambar.onerror = () => {
        galat.textContent = 'Gambar tidak bisa dibaca.';
        galat.hidden = false;
      };
      gambar.src = URL.createObjectURL(berkas);
    });
  });
</script>
@endsection
