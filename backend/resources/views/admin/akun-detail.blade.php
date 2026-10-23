@extends('admin.layout')
@section('judul', $user->name)
@section('isi')
@php($wib = fn ($t) => $t ? \Illuminate\Support\Carbon::parse($t)->timezone('Asia/Jakarta')->format('d M Y, H:i').' WIB' : '–')
<div class="baris antara">
  <div>
    <h1>{{ $user->name }}</h1>
    <div class="baris" style="margin-top:6px">
      @if ($user->pembelian?->lunas)<span class="lencana ok">Lunas</span>@else<span class="lencana belum">Belum lunas</span>@endif
      @if ($user->aktif)<span class="lencana ok">Aktif</span>@else<span class="lencana mati">Nonaktif</span>@endif
      <span class="redup">{{ $user->bolehMasuk() ? 'Bisa masuk ke aplikasi' : 'Tidak bisa masuk ke aplikasi' }}</span>
    </div>
  </div>
  <a href="/admin">← Semua akun</a>
</div>

@if (session('sandi_sekali'))
<section class="kartu" style="border:2px solid var(--hijau-2)">
  <h2>Kata sandi untuk pembeli</h2>
  <p style="margin:0">Hanya ditampilkan sekali. Sampaikan bersama username <b>{{ $user->username }}</b>.</p>
  <div class="sandi">{{ session('sandi_sekali') }}</div>
</section>
@endif

<div class="kisi-2">
  <section class="kartu">
    <h2>Data akun</h2>
    <dl>
      <dt>Username</dt><dd><b>{{ $user->username }}</b></dd>
      <dt>Dibuat</dt><dd>{{ $wib($user->created_at) }}</dd>
      <dt>Email terbukti</dt><dd>{{ $user->email_verified_at ? 'Ya (sudah pernah masuk)' : 'Belum pernah masuk' }}</dd>
      <dt>Resep tersimpan</dt><dd>{{ $jumlahData }}</dd>
    </dl>
    <form method="post" action="/admin/akun/{{ $user->id }}/profil" style="display:flex;flex-direction:column;gap:10px">
      @csrf
      <label>Nama <input name="nama" value="{{ old('nama', $user->name) }}" minlength="2" maxlength="60" required></label>
      <label>Email <input type="email" name="email" value="{{ old('email', $user->email) }}" maxlength="190" required></label>
      @error('nama')<p class="galat-teks" role="alert">{{ $message }}</p>@enderror
      @error('email')<p class="galat-teks" role="alert">{{ $message }}</p>@enderror
      <div class="baris"><button class="btn" type="submit">Simpan data akun</button></div>
    </form>
  </section>

  <section class="kartu">
    <h2>Pembelian</h2>
    <form method="post" action="/admin/akun/{{ $user->id }}/pembelian" style="display:flex;flex-direction:column;gap:10px">
      @csrf
      @include('admin._pembelian', ['p' => $user->pembelian])
      <div class="baris"><button class="btn utama" type="submit">Simpan pembelian</button></div>
    </form>
  </section>

  <section class="kartu">
    <h2>Akses</h2>
    <form method="post" action="/admin/akun/{{ $user->id }}/aktif" onsubmit="return {{ $user->aktif ? "confirm('Nonaktifkan akun ini? Semua perangkatnya akan dikeluarkan. Data tetap tersimpan.')" : 'true' }}">
      @csrf
      <input type="hidden" name="aktif" value="{{ $user->aktif ? 0 : 1 }}">
      <p class="redup" style="margin:0 0 8px">Akun nonaktif tidak bisa masuk atau sinkron, tetapi datanya tetap tersimpan.</p>
      <button class="btn {{ $user->aktif ? 'bahaya' : 'utama' }}" type="submit">{{ $user->aktif ? 'Nonaktifkan akun' : 'Aktifkan akun' }}</button>
    </form>
    <form method="post" action="/admin/akun/{{ $user->id }}/sandi" onsubmit="return confirm('Buat kata sandi baru untuk akun ini? Kata sandi lama tidak berlaku dan semua perangkat dikeluarkan.')">
      @csrf
      <p class="redup" style="margin:8px 0">Atur ulang kata sandi: kata sandi baru dibuat acak dan dikirim ke {{ $user->email }}.</p>
      <button class="btn" type="submit">Atur ulang kata sandi</button>
    </form>
  </section>

  <section class="kartu">
    <div class="baris antara">
      <h2>Perangkat yang masuk ({{ $sesi->count() }})</h2>
      @if ($sesi->isNotEmpty())
      <form method="post" action="/admin/akun/{{ $user->id }}/keluarkan" onsubmit="return confirm('Keluarkan semua perangkat akun ini?')">
        @csrf<button class="btn kecil bahaya" type="submit">Keluarkan semua</button>
      </form>
      @endif
    </div>
    @forelse ($sesi as $s)
      <div class="baris antara" style="border-top:1px solid var(--garis);padding-top:8px">
        <span>{{ $s->perangkat ?: 'Perangkat' }}</span>
        <span class="redup">terakhir {{ $wib($s->terakhir_dipakai ?? $s->created_at) }}</span>
      </div>
    @empty
      <p class="redup" style="margin:0">Tidak ada perangkat yang sedang masuk.</p>
    @endforelse
  </section>
</div>
@endsection
