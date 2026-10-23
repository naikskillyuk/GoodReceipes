<x-mail::message>
# Halo, {{ $nama }}

Terima kasih sudah mendaftar di **{{ config('app.name') }}**. Akun Anda sudah siap. Gunakan data berikut untuk masuk:

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

Anda boleh masuk dengan username **atau** email. Setelah masuk, ganti kata sandi ini di **Pengaturan > Akun > Ganti kata sandi**.

Bila Anda tidak merasa mendaftar, abaikan email ini.

Salam,<br>
{{ config('app.name') }}
</x-mail::message>
