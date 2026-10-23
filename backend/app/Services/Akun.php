<?php

namespace App\Services;

use App\Mail\AkunBaru;
use App\Mail\AturUlangSandi;
use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\Mail;
use Illuminate\Support\Facades\Password;
use Illuminate\Support\Str;
use RuntimeException;
use Throwable;

/**
 * Akun pengguna: daftar (username + kata sandi dikirim ke email), masuk, sesi per perangkat,
 * ganti kata sandi, dan lupa kata sandi lewat tautan email.
 */
class Akun
{
    public const MIN_SANDI = 8;

    // Tanpa huruf/angka yang mirip (0/O, 1/l/I) supaya mudah diketik dari email.
    private const HURUF_SANDI = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    /** Buat akun dan kirim username + kata sandi ke emailnya. */
    public function daftar(mixed $nama, mixed $email): array
    {
        $nama = $this->teks($nama, 60);
        $email = Str::lower($this->teks($email, 190));
        if (mb_strlen($nama) < 2) {
            return ['ok' => false, 'galat' => 'Isi nama Anda (minimal 2 huruf).'];
        }
        if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
            return ['ok' => false, 'galat' => 'Alamat email tidak valid.'];
        }
        if (User::where('email', $email)->exists()) {
            return ['ok' => false, 'galat' => 'Email ini sudah terdaftar. Silakan masuk, atau pakai "Lupa kata sandi".'];
        }

        $sandi = $this->sandiAcak();
        $user = $this->buat($nama, $email, $sandi);
        try {
            Mail::to($email)->send(new AkunBaru($user, $sandi));
        } catch (Throwable $e) {
            report($e);
            $user->delete();
            throw new RuntimeException('Email belum bisa dikirim. Periksa alamat email Anda atau coba lagi nanti.');
        }

        return ['ok' => true, 'pesan' => "Akun dibuat. Username dan kata sandi sudah dikirim ke {$email}."];
    }

    /** Dipakai juga oleh perintah artisan untuk membuat akun pembeli secara manual. */
    public function buat(string $nama, string $email, string $sandi): User
    {
        return DB::transaction(fn () => User::create([
            'name' => $nama,
            'username' => $this->usernameBaru($nama),
            'email' => Str::lower($email),
            'password' => $sandi,
            'aktif' => true,
        ]));
    }

    /** Masuk dengan email atau username. Mengembalikan token sesi baru. */
    public function masuk(mixed $login, mixed $sandi, mixed $perangkat): array
    {
        $user = $this->cari($login);
        $sandi = is_string($sandi) ? $sandi : '';
        if (! $user || ! Hash::check($sandi, $user->password)) {
            return ['ok' => false, 'galat' => 'Username/email atau kata sandi salah.'];
        }
        if (! $user->aktif) {
            return ['ok' => false, 'kode' => 'NONAKTIF', 'galat' => 'Akun ini sedang tidak aktif. Hubungi penjual aplikasi.'];
        }
        if (! $user->email_verified_at) {
            // Kata sandi pertama dikirim lewat email, jadi berhasil masuk = email terbukti miliknya.
            $user->forceFill(['email_verified_at' => now()])->save();
        }

        return ['ok' => true, 'sesi' => $this->buatSesi($user, $perangkat), 'pengguna' => $user->untukAplikasi()];
    }

    public function buatSesi(User $user, mixed $perangkat = ''): string
    {
        $token = rtrim(strtr(base64_encode(random_bytes(32)), '+/', '-_'), '=');
        DB::table('sesi_masuk')->insert([
            'user_id' => $user->id,
            'token_hash' => hash('sha256', $token),
            'perangkat' => $this->teks($perangkat, 120) ?: null,
            'terakhir_dipakai' => now(),
            'created_at' => now(),
            'updated_at' => now(),
        ]);

        return $token;
    }

    /** Akun pemilik token sesi, atau null bila token tidak berlaku / akun nonaktif. */
    public function dariSesi(mixed $token): ?User
    {
        if (! is_string($token) || strlen($token) < 20 || strlen($token) > 200) {
            return null;
        }
        $sesi = DB::table('sesi_masuk')->where('token_hash', hash('sha256', $token))->first();
        if (! $sesi) {
            return null;
        }
        $user = User::find($sesi->user_id);
        if (! $user || ! $user->aktif) {
            return null;
        }
        // Catat pemakaian paling sering tiap 10 menit, supaya tidak menulis di setiap sinkron.
        if (! $sesi->terakhir_dipakai || now()->diffInMinutes($sesi->terakhir_dipakai, true) >= 10) {
            DB::table('sesi_masuk')->where('id', $sesi->id)->update(['terakhir_dipakai' => now()]);
        }

        return $user;
    }

    public function keluar(string $token): void
    {
        DB::table('sesi_masuk')->where('token_hash', hash('sha256', $token))->delete();
    }

    public function ubahProfil(User $user, mixed $nama): array
    {
        $nama = $this->teks($nama, 60);
        if (mb_strlen($nama) < 2) {
            return ['ok' => false, 'galat' => 'Nama minimal 2 huruf.'];
        }
        $user->update(['name' => $nama]);

        return ['ok' => true, 'pengguna' => $user->untukAplikasi()];
    }

    /** Ganti kata sandi; sesi di perangkat lain ikut keluar. */
    public function gantiSandi(User $user, string $tokenSekarang, mixed $lama, mixed $baru): array
    {
        if (! is_string($lama) || ! Hash::check($lama, $user->password)) {
            return ['ok' => false, 'galat' => 'Kata sandi lama salah.'];
        }
        if ($galat = $this->periksaSandi($baru)) {
            return ['ok' => false, 'galat' => $galat];
        }
        $user->update(['password' => $baru]);
        DB::table('sesi_masuk')->where('user_id', $user->id)->where('token_hash', '!=', hash('sha256', $tokenSekarang))->delete();

        return ['ok' => true];
    }

    /** Kirim tautan atur ulang kata sandi. Jawaban selalu sama, agar tidak membocorkan email yang terdaftar. */
    public function lupaSandi(mixed $login): array
    {
        $user = $this->cari($login);
        if ($user && $user->aktif) {
            $token = Password::broker()->createToken($user);
            $url = rtrim((string) config('goodrecipes.frontend_url'), '/')
                .'/#/atur-sandi?email='.rawurlencode($user->email).'&t='.rawurlencode($token);
            try {
                Mail::to($user->email)->send(new AturUlangSandi($user, $url));
            } catch (Throwable $e) {
                report($e);
                throw new RuntimeException('Email belum bisa dikirim. Coba lagi nanti.');
            }
        }

        return ['ok' => true, 'pesan' => 'Bila akun itu terdaftar, tautan untuk membuat kata sandi baru sudah dikirim ke emailnya. Tautan berlaku 60 menit.'];
    }

    /** Kata sandi baru dari tautan email. Semua sesi lama keluar. */
    public function aturSandi(mixed $email, mixed $token, mixed $baru): array
    {
        $user = is_string($email) ? User::where('email', Str::lower(trim($email)))->first() : null;
        if (! $user || ! is_string($token) || ! Password::broker()->tokenExists($user, $token)) {
            return ['ok' => false, 'galat' => 'Tautan sudah tidak berlaku. Minta tautan baru lewat "Lupa kata sandi".'];
        }
        if ($galat = $this->periksaSandi($baru)) {
            return ['ok' => false, 'galat' => $galat];
        }
        $user->forceFill(['password' => $baru, 'email_verified_at' => $user->email_verified_at ?? now()])->save();
        Password::broker()->deleteToken($user);
        DB::table('sesi_masuk')->where('user_id', $user->id)->delete();

        return ['ok' => true, 'pesan' => 'Kata sandi baru tersimpan. Silakan masuk.', 'username' => $user->username];
    }

    public function cari(mixed $login): ?User
    {
        $login = Str::lower($this->teks($login, 190));
        if ($login === '') {
            return null;
        }

        return User::where(str_contains($login, '@') ? 'email' : 'username', $login)->first();
    }

    public function sandiAcak(int $panjang = 10): string
    {
        $hasil = '';
        for ($i = 0; $i < $panjang; $i++) {
            $hasil .= self::HURUF_SANDI[random_int(0, strlen(self::HURUF_SANDI) - 1)];
        }

        return $hasil;
    }

    private function periksaSandi(mixed $sandi): ?string
    {
        if (! is_string($sandi) || mb_strlen($sandi) < self::MIN_SANDI) {
            return 'Kata sandi baru minimal '.self::MIN_SANDI.' karakter.';
        }
        if (mb_strlen($sandi) > 100) {
            return 'Kata sandi terlalu panjang.';
        }

        return null;
    }

    /** Username dari nama, mis. "Siti Aminah" -> "sitiaminah4821". */
    private function usernameBaru(string $nama): string
    {
        $dasar = substr(preg_replace('/[^a-z0-9]/', '', Str::lower(Str::ascii($nama))) ?: 'chef', 0, 14);
        do {
            $u = $dasar.random_int(1000, 9999);
        } while (User::where('username', $u)->exists());

        return $u;
    }

    private function teks(mixed $v, int $maks): string
    {
        $t = is_scalar($v) ? (string) $v : '';
        $t = preg_replace('/[\x00-\x1F\x7F]/u', '', $t) ?? '';

        return mb_substr(trim($t), 0, $maks);
    }
}
