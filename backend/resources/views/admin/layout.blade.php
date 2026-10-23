<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>@yield('judul', 'Admin') · {{ config('app.name') }}</title>
<style>
  :root {
    --bg: #f4eee5; --kartu: #fffdf9; --ink: #1c2621; --ink2: #3f4a44; --muted: #646b65;
    --hijau: #1f3b32; --hijau-2: #2f5445; --hijau-muda: #e3ebe3; --garis: #ebe3d7; --garis-input: #ddd2c2;
    --bahaya: #a3321e; --bahaya-muda: #f7e3dd; --kuning-muda: #f6ecd3; --kuning-tua: #8a5a00;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif; }
  a { color: var(--hijau-2); }
  h1, h2 { font-family: Georgia, 'Times New Roman', serif; color: var(--hijau); margin: 0; }
  h1 { font-size: 28px; font-style: italic; }
  h2 { font-size: 19px; }
  .atas { background: var(--hijau); color: #fff; }
  .atas-isi { max-width: 1100px; margin: 0 auto; padding: 12px 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; }
  .atas b { font-family: Georgia, serif; font-style: italic; font-size: 19px; margin-right: auto; }
  .atas a { color: #fff; text-decoration: none; font-weight: 600; }
  .atas form { margin: 0; }
  .atas button { background: none; border: 1px solid rgba(255,255,255,.4); color: #fff; border-radius: 999px; padding: 4px 12px; font: inherit; cursor: pointer; }
  main { max-width: 1100px; margin: 0 auto; padding: 20px 16px 48px; display: flex; flex-direction: column; gap: 16px; }
  .kartu { background: var(--kartu); border-radius: 20px; padding: 18px; box-shadow: 0 1px 2px rgba(58,44,28,.05), 0 10px 28px -18px rgba(58,44,28,.3); display: flex; flex-direction: column; gap: 12px; }
  .baris { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .antara { justify-content: space-between; }
  .kisi { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
  .kisi-2 { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start; }
  .angka { background: var(--kartu); border-radius: 16px; padding: 14px 16px; box-shadow: 0 1px 2px rgba(58,44,28,.05); }
  .angka small { display: block; color: var(--muted); font-size: 12px; font-weight: 600; text-transform: uppercase; letter-spacing: .06em; }
  .angka b { font-size: 24px; color: var(--hijau); }
  label { display: flex; flex-direction: column; gap: 4px; font-size: 13px; font-weight: 600; color: var(--ink2); }
  label.centang { flex-direction: row; align-items: center; gap: 8px; font-weight: 500; font-size: 14px; }
  input, select, textarea { font: inherit; padding: 9px 12px; border: 1.5px solid var(--garis-input); border-radius: 12px; background: #fff; color: var(--ink); min-width: 0; }
  input[type=checkbox] { width: 18px; height: 18px; padding: 0; }
  textarea { min-height: 70px; resize: vertical; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 9px 18px; border-radius: 999px; border: 1.5px solid var(--garis-input); background: #fff; color: var(--ink); font: inherit; font-weight: 600; text-decoration: none; cursor: pointer; }
  .btn.utama { background: var(--hijau); border-color: var(--hijau); color: #fff; }
  .btn.bahaya { color: var(--bahaya); border-color: #e6bfb5; }
  .btn.kecil { padding: 5px 12px; font-size: 13px; }
  .gulir { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); padding: 8px 10px; border-bottom: 1px solid var(--garis); white-space: nowrap; }
  td { padding: 10px; border-bottom: 1px solid var(--garis); vertical-align: middle; }
  tr:last-child td { border-bottom: 0; }
  .lencana { display: inline-block; padding: 2px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; white-space: nowrap; }
  .lencana.ok { background: var(--hijau-muda); color: var(--hijau); }
  .lencana.belum { background: var(--kuning-muda); color: var(--kuning-tua); }
  .lencana.mati { background: var(--bahaya-muda); color: var(--bahaya); }
  .redup { color: var(--muted); font-size: 13px; }
  .pesan { padding: 12px 16px; border-radius: 14px; font-weight: 500; }
  .pesan.ok { background: var(--hijau-muda); color: var(--hijau); }
  .pesan.galat { background: var(--bahaya-muda); color: var(--bahaya); }
  .sandi { font: 600 22px/1.3 ui-monospace, Consolas, monospace; letter-spacing: .08em; background: #fff; border: 2px dashed var(--hijau-2); border-radius: 12px; padding: 10px 14px; user-select: all; }
  .galat-teks { color: var(--bahaya); font-size: 13px; margin: 0; }
  form { margin: 0; }
  dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; font-size: 14px; }
  dt { color: var(--muted); }
  dd { margin: 0; overflow-wrap: anywhere; }
</style>
</head>
<body>
@isset($admin)
<header class="atas"><div class="atas-isi">
  <b>{{ config('app.name') }} · Admin</b>
  <a href="/admin">Akun</a>
  <a href="/admin/akun/baru">+ Buat akun</a>
  <form method="post" action="/admin/keluar">@csrf<button type="submit">Keluar ({{ $admin->nama }})</button></form>
</div></header>
@endisset
<main>
  @if (session('berhasil'))<div class="pesan ok" role="status">{{ session('berhasil') }}</div>@endif
  @if (session('gagal'))<div class="pesan galat" role="alert">{{ session('gagal') }}</div>@endif
  @yield('isi')
</main>
</body>
</html>
