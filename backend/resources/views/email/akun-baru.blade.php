<x-mail::message>
# Halo, {{ $nama }}

@if ($reset)
Kata sandi akun **{{ config('app.name') }}** Anda sudah diatur ulang oleh pengelola. Semua perangkat yang sedang masuk sudah dikeluarkan. Gunakan data berikut untuk masuk lagi:
@else
Terima kasih sudah membeli **{{ config('app.name') }}**. Akun Anda sudah siap. Gunakan data berikut untuk masuk:
@endif

<x-mail::panel>
**Username:** {{ $username }}<br>
**Email:** {{ $email }}<br>
**Kata sandi:** {{ $sandi }}
</x-mail::panel>

@if ($url)
<x-mail::button :url="$url">
Buka aplikasi
</x-mail::button>
@endif

Anda boleh masuk dengan username **atau** email. Setelah masuk, ganti kata sandi ini di **Pengaturan > Akun > Ganti kata sandi akun**.

Bila Anda merasa tidak membeli aplikasi ini, abaikan email ini.

Salam,<br>
{{ config('app.name') }}
</x-mail::message>
