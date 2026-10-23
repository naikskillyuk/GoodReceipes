{{-- Isian pembelian (sekali bayar). $p = App\Models\Pembelian atau null. --}}
<div class="kisi" style="grid-template-columns:repeat(auto-fit,minmax(150px,1fr))">
  <label>Tanggal beli
    <input type="date" name="tanggal" value="{{ old('tanggal', $p?->tanggal?->format('Y-m-d') ?? now('Asia/Jakarta')->format('Y-m-d')) }}" required>
  </label>
  <label>Jumlah (Rp)
    <input type="number" name="jumlah" min="0" step="1" inputmode="numeric" value="{{ old('jumlah', $p?->jumlah ?? 0) }}" required>
  </label>
  <label>Metode
    <input name="metode" list="daftar-metode" maxlength="40" value="{{ old('metode', $p?->metode ?? '') }}" placeholder="mis. Transfer BCA">
  </label>
</div>
<datalist id="daftar-metode"><option value="Transfer bank"><option value="QRIS"><option value="E-wallet"><option value="Tunai"></datalist>
<label>Catatan
  <textarea name="catatan" maxlength="500" placeholder="mis. nomor pesanan, nama pengirim transfer">{{ old('catatan', $p?->catatan ?? '') }}</textarea>
</label>
<label class="centang">
  <input type="checkbox" name="lunas" value="1" @checked(old('lunas', $p ? ($p->lunas ? '1' : '') : '1'))>
  Lunas (akun hanya bisa masuk bila lunas)
</label>
@foreach (['tanggal', 'jumlah', 'metode', 'catatan'] as $f)
  @error($f)<p class="galat-teks" role="alert">{{ $message }}</p>@enderror
@endforeach
