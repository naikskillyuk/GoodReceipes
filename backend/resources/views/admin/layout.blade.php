<!doctype html>
<html lang="id">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex, nofollow">
<title>@yield('judul', 'Admin') · {{ config('app.name') }}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
  :root {
    --bg: #f4f8f1; --kartu: #ffffff; --ink: #18261a; --ink2: #3d4c3f; --muted: #6c7a6d;
    --hijau: #4c9a2a; --hijau-tua: #2f6b18; --hijau-muda: #eaf5e1; --garis: #e4ecdd; --garis-input: #d6e2cd;
    --bahaya: #c2412d; --bahaya-muda: #fdece8; --kuning-muda: #fff4d9; --kuning-tua: #8a5a00;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--ink); font: 15px/1.55 'Plus Jakarta Sans', system-ui, -apple-system, 'Segoe UI', sans-serif; }
  a { color: var(--hijau-tua); }
  h1, h2 { margin: 0; color: var(--ink); letter-spacing: -0.02em; }
  h1 { font-size: 28px; font-weight: 800; }
  h1 em { font-style: normal; color: var(--hijau); }
  h2 { font-size: 18px; font-weight: 700; }
  .atas { background: #fff; border-bottom: 1px solid var(--garis); }
  .atas-isi { max-width: 1100px; margin: 0 auto; padding: 10px 16px; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 18px; }
  .merek { display: flex; align-items: center; gap: 10px; margin-right: auto; font-weight: 800; font-size: 18px; color: var(--ink); text-decoration: none; }
  .merek img { width: 36px; height: 36px; border-radius: 10px; object-fit: contain; }
  .merek small { font-weight: 700; font-size: 12px; color: var(--hijau-tua); background: var(--hijau-muda); padding: 2px 9px; border-radius: 999px; }
  .atas nav { display: flex; gap: 4px; flex-wrap: wrap; }
  .atas nav a { color: var(--ink2); text-decoration: none; font-weight: 600; padding: 7px 14px; border-radius: 999px; }
  .atas nav a.aktif { background: var(--hijau-muda); color: var(--hijau-tua); }
  .atas form { margin: 0; }
  .atas button { background: none; border: 1.5px solid var(--garis-input); color: var(--ink2); border-radius: 999px; padding: 6px 14px; font: inherit; font-weight: 600; cursor: pointer; }
  main { max-width: 1100px; margin: 0 auto; padding: 24px 16px 48px; display: flex; flex-direction: column; gap: 16px; }
  .kartu { background: var(--kartu); border-radius: 22px; padding: 20px; border: 1px solid var(--garis); box-shadow: 0 10px 30px -22px rgba(36, 74, 20, .35); display: flex; flex-direction: column; gap: 12px; }
  .baris { display: flex; flex-wrap: wrap; gap: 10px; align-items: center; }
  .antara { justify-content: space-between; }
  .kisi { display: grid; gap: 12px; grid-template-columns: repeat(auto-fit, minmax(170px, 1fr)); }
  .kisi-2 { display: grid; gap: 16px; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); align-items: start; }
  .angka { background: var(--kartu); border: 1px solid var(--garis); border-radius: 18px; padding: 14px 16px; }
  .angka small { display: block; color: var(--muted); font-size: 12px; font-weight: 600; }
  .angka b { font-size: 26px; font-weight: 800; color: var(--ink); }
  .angka.sorot { background: var(--hijau); border-color: var(--hijau); }
  .angka.sorot small, .angka.sorot b { color: #fff; }
  label { display: flex; flex-direction: column; gap: 5px; font-size: 13px; font-weight: 600; color: var(--ink2); }
  label.centang { flex-direction: row; align-items: center; gap: 8px; font-weight: 500; font-size: 14px; }
  input, select, textarea { font: inherit; padding: 10px 14px; border: 1.5px solid var(--garis-input); border-radius: 14px; background: #fff; color: var(--ink); min-width: 0; }
  input:focus, select:focus, textarea:focus { outline: none; border-color: var(--hijau); box-shadow: 0 0 0 3px var(--hijau-muda); }
  input[type=checkbox] { width: 18px; height: 18px; padding: 0; accent-color: var(--hijau); }
  textarea { min-height: 70px; resize: vertical; }
  .btn { display: inline-flex; align-items: center; justify-content: center; gap: 6px; padding: 10px 20px; border-radius: 999px; border: 1.5px solid var(--garis-input); background: #fff; color: var(--ink); font: inherit; font-weight: 700; text-decoration: none; cursor: pointer; }
  .btn.utama { background: var(--hijau); border-color: var(--hijau); color: #fff; }
  .btn.utama:hover { background: var(--hijau-tua); }
  .btn[disabled] { opacity: .5; cursor: not-allowed; }
  .btn.bahaya { color: var(--bahaya); border-color: #f1c6bd; }
  .btn.kecil { padding: 6px 14px; font-size: 13px; }
  .gulir { overflow-x: auto; }
  table { width: 100%; border-collapse: collapse; font-size: 14px; }
  th { text-align: left; font-size: 12px; font-weight: 700; color: var(--muted); padding: 8px 10px; border-bottom: 1px solid var(--garis); white-space: nowrap; }
  td { padding: 12px 10px; border-bottom: 1px solid var(--garis); vertical-align: middle; }
  tr:last-child td { border-bottom: 0; }
  .lencana { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 12px; font-weight: 700; white-space: nowrap; }
  .lencana.ok { background: var(--hijau-muda); color: var(--hijau-tua); }
  .lencana.belum { background: var(--kuning-muda); color: var(--kuning-tua); }
  .lencana.mati { background: var(--bahaya-muda); color: var(--bahaya); }
  .redup { color: var(--muted); font-size: 13px; }
  .pesan { padding: 12px 16px; border-radius: 16px; font-weight: 600; }
  .pesan.ok { background: var(--hijau-muda); color: var(--hijau-tua); }
  .pesan.galat { background: var(--bahaya-muda); color: var(--bahaya); }
  .sandi { font: 700 22px/1.3 ui-monospace, Consolas, monospace; letter-spacing: .08em; background: var(--hijau-muda); border: 2px dashed var(--hijau); border-radius: 14px; padding: 10px 14px; user-select: all; }
  .galat-teks { color: var(--bahaya); font-size: 13px; margin: 0; }
  form { margin: 0; }
  dl { margin: 0; display: grid; grid-template-columns: max-content 1fr; gap: 6px 14px; font-size: 14px; }
  dt { color: var(--muted); }
  dd { margin: 0; overflow-wrap: anywhere; }
  .pratinjau-logo, .pratinjau-latar { background: var(--hijau-muda); border-radius: 16px; display: grid; place-items: center; padding: 14px; }
  .pratinjau-logo img { width: 120px; height: 120px; object-fit: contain; border-radius: 22px; background: #fff; }
  .pratinjau-latar img { width: 100%; max-width: 260px; aspect-ratio: 9 / 16; object-fit: cover; border-radius: 18px; }
</style>
</head>
<body>
@isset($admin)
@php($logoSitus = app(\App\Services\Situs::class)->tampilan()['logoUrl'] ?: rtrim((string) config('goodrecipes.frontend_url'), '/').'/icons/icon.svg')
<header class="atas"><div class="atas-isi">
  <a class="merek" href="/admin"><img src="{{ $logoSitus }}" alt="">{{ config('app.name') }} <small>Admin</small></a>
  <nav>
    <a href="/admin" class="{{ request()->is('admin', 'admin/akun*') ? 'aktif' : '' }}">Akun</a>
    <a href="/admin/tampilan" class="{{ request()->is('admin/tampilan') ? 'aktif' : '' }}">Tampilan</a>
  </nav>
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
