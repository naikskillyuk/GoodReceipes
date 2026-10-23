<x-mail::message>
# Halo, {{ $nama }}

Ada permintaan untuk membuat kata sandi baru bagi akun **{{ $username }}**.

<x-mail::button :url="$url">
Buat kata sandi baru
</x-mail::button>

Tautan ini berlaku 60 menit dan hanya bisa dipakai sekali. Setelah kata sandi diganti, semua perangkat yang sedang masuk akan diminta masuk lagi.

Bila Anda tidak meminta ini, abaikan email ini; kata sandi Anda tidak berubah.

Salam,<br>
{{ config('app.name') }}
</x-mail::message>
