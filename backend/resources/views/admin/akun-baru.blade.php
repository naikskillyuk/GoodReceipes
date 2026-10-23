@extends('admin.layout')
@section('judul', 'Buat akun')
@section('isi')
<div class="baris antara">
  <h1>Buat akun pembeli</h1>
  <a href="/admin">← Kembali</a>
</div>
<form method="post" action="/admin/akun" class="kartu" style="max-width:720px">
  @csrf
  <h2>Pembeli</h2>
  <div class="kisi" style="grid-template-columns:repeat(auto-fit,minmax(220px,1fr))">
    <label>Nama
      <input name="nama" value="{{ old('nama') }}" minlength="2" maxlength="60" required autofocus>
    </label>
    <label>Email
      <input type="email" name="email" value="{{ old('email') }}" maxlength="190" required>
    </label>
  </div>
  @error('nama')<p class="galat-teks" role="alert">{{ $message }}</p>@enderror
  @error('email')<p class="galat-teks" role="alert">{{ $message }}</p>@enderror

  <h2>Pembelian</h2>
  @include('admin._pembelian', ['p' => null])

  <label class="centang">
    <input type="checkbox" name="kirim_email" value="1" @checked(old('kirim_email', '1'))>
    Kirim username dan kata sandi ke email pembeli
  </label>
  <p class="redup" style="margin:0">Username dibuat dari nama, kata sandi dibuat acak. Bila tidak dikirim lewat email (atau email gagal), kata sandi ditampilkan sekali di halaman berikutnya.</p>
  <div class="baris"><button class="btn utama" type="submit">Buat akun</button></div>
</form>
@endsection
