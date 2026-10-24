@extends('admin.layout')
@section('judul', 'Akun')
@section('isi')
@php($rp = fn ($n) => 'Rp '.number_format((int) $n, 0, ',', '.'))
<div class="baris antara">
  <h1>Akun <em>pembeli</em></h1>
  <a class="btn utama" href="/admin/akun/baru">+ Buat akun</a>
</div>

<div class="kisi">
  <div class="angka"><small>Semua akun</small><b>{{ $ringkas['akun'] }}</b></div>
  <div class="angka"><small>Lunas</small><b>{{ $ringkas['lunas'] }}</b></div>
  <div class="angka"><small>Belum lunas</small><b>{{ $ringkas['belum'] }}</b></div>
  <div class="angka"><small>Nonaktif</small><b>{{ $ringkas['nonaktif'] }}</b></div>
  <div class="angka sorot"><small>Pendapatan (lunas)</small><b>{{ $rp($ringkas['pendapatan']) }}</b></div>
</div>

<section class="kartu">
  <form method="get" action="/admin" class="baris">
    <input type="search" name="q" value="{{ $q }}" placeholder="Cari nama, username, atau email" style="flex:1;min-width:200px" aria-label="Cari akun">
    <select name="status" aria-label="Saring status">
      @foreach (['semua' => 'Semua', 'lunas' => 'Lunas & aktif', 'belum' => 'Belum lunas', 'nonaktif' => 'Nonaktif'] as $nilai => $teks)
        <option value="{{ $nilai }}" @selected($status === $nilai)>{{ $teks }}</option>
      @endforeach
    </select>
    <button class="btn" type="submit">Cari</button>
  </form>

  @if ($akun->isEmpty())
    <p class="redup">Belum ada akun{{ $q !== '' || $status !== 'semua' ? ' yang cocok' : '' }}.</p>
  @else
  <div class="gulir">
    <table>
      <thead><tr><th>Nama</th><th>Email</th><th>Pembelian</th><th>Jumlah</th><th>Tanggal beli</th><th>Status</th><th>Perangkat</th><th></th></tr></thead>
      <tbody>
      @foreach ($akun as $u)
        <tr>
          <td><b>{{ $u->name }}</b><br><span class="redup">{{ $u->username }}</span></td>
          <td>{{ $u->email }}</td>
          <td>
            @if ($u->pembelian?->lunas)<span class="lencana ok">Lunas</span>
            @else<span class="lencana belum">Belum lunas</span>@endif
          </td>
          <td style="white-space:nowrap">{{ $u->pembelian ? $rp($u->pembelian->jumlah) : '–' }}</td>
          <td style="white-space:nowrap">{{ $u->pembelian?->tanggal?->format('d M Y') ?? '–' }}</td>
          <td>@if ($u->aktif)<span class="lencana ok">Aktif</span>@else<span class="lencana mati">Nonaktif</span>@endif</td>
          <td>{{ $u->sesi_count }}</td>
          <td><a class="btn kecil" href="/admin/akun/{{ $u->id }}">Kelola</a></td>
        </tr>
      @endforeach
      </tbody>
    </table>
  </div>
  @if ($akun->hasPages())
  <nav class="baris antara" aria-label="Halaman">
    @if ($akun->onFirstPage())<span class="redup">← Sebelumnya</span>@else<a class="btn kecil" href="{{ $akun->previousPageUrl() }}">← Sebelumnya</a>@endif
    <span class="redup">Halaman {{ $akun->currentPage() }} dari {{ $akun->lastPage() }}</span>
    @if ($akun->hasMorePages())<a class="btn kecil" href="{{ $akun->nextPageUrl() }}">Berikutnya →</a>@else<span class="redup">Berikutnya →</span>@endif
  </nav>
  @endif
  @endif
</section>
@endsection
