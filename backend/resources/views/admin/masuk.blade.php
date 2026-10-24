@extends('admin.layout')
@section('judul', 'Masuk admin')
@section('isi')
<div style="min-height:80vh;display:grid;place-items:center">
  <form method="post" action="/admin/masuk" class="kartu" style="width:100%;max-width:380px">
    @csrf
    <h1>Good <em>Receipes</em></h1>
    <p class="redup" style="margin:0">Halaman admin. Khusus pengelola aplikasi.</p>
    <label>Email admin
      <input type="email" name="email" value="{{ old('email') }}" autocomplete="username" required autofocus>
    </label>
    <label>Kata sandi
      <input type="password" name="password" autocomplete="current-password" required>
    </label>
    @error('email')<p class="galat-teks" role="alert">{{ $message }}</p>@enderror
    <button type="submit" class="btn utama">Masuk</button>
  </form>
</div>
@endsection
