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
 * Akun pengguna: dibuat oleh admin (username + kata sandi dikirim ke email), masuk, sesi per
 * perangkat, ganti kata sandi, dan lupa kata sandi lewat tautan email.
 */
class Akun
{
    public const MIN_SANDI = 8;

    // Tanpa huruf/angka yang mirip (0/O, 1/l/I) supaya mudah diketik dari email.
    private const HURUF_SANDI = 'abcdefghjkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789';

    /**
     * Buat akun beserta catatan pembeliannya (dipakai halaman admin dan perintah artisan).
     *
     * @param  array{tanggal?: string, jumlah?: int, metode?: string, lunas?: bool, catatan?: string}  $pembelian
     */
    public function buat(string $nama, string $email, string $sandi, array $pembelian = []): User
    {
        return DB::transaction(function () use ($nama, $email, $sandi, $pembelian) {
            $user = User::create([
                'name' => $nama,
                'username' => $this->usernameBaru($nama),
                'email' => Str::lower($email),
                'password' => $sandi,
                'aktif' => true,
            ]);
            $user->pembelian()->create([
                'tanggal' => $pembelian['tanggal'] ?? now()->toDateString(),
                'jumlah' => (int) ($pembelian['jumlah'] ?? 0),
                'metode' => (string) ($pembelian['metode'] ?? ''),
                'lunas' => (bool) ($pembelian['lunas'] ?? true),
                'catatan' => (string) ($pembelian['catatan'] ?? ''),
            ]);

            return $user;
        });
    }

    /** Kirim username dan kata sandi ke email akun. Mengembalikan false bila email gagal dikirim. */
    public function kirimDataAkun(User $user, string $sandi, bool $reset = false): bool
    {
        try {
            Mail::to($user->email)->send(new AkunBaru($user, $sandi, $reset));

            return true;
        } catch (Throwable $e) {
            report($e);

            return false;
        }
    }

    /** Pesan untuk akun yang tidak boleh masuk, atau null bila boleh. */
    public function alasanDitolak(User $user): ?string
    {
        if ($user->adalahToko()) {
            if (! $user->aktif) {
                return 'Akun toko ini sedang dinonaktifkan oleh akun dapur.';
            }
            if (! $user->pemilik || ! $user->pemilik->bolehMasuk()) {
                return 'Akun dapur pemilik toko ini sedang tidak aktif.';
            }

            return null;
        }
        if (! $user->aktif) {
            return 'Akun ini sedang tidak aktif. Hubungi penjual aplikasi.';
        }
        if (! $user->pembelian?->lunas) {
            return 'Pembayaran akun ini belum lunas. Hubungi penjual aplikasi.';
        }

        return null;
    }

    /** Masuk dengan email atau username. Mengembalikan token sesi baru. */
    public function masuk(mixed $login, mixed $sandi, mixed $perangkat): array
    {
        $user = $this->cari($login);
        $sandi = is_string($sandi) ? $sandi : '';
        if (! $user || ! Hash::check($sandi, $user->password)) {
            return ['ok' => false, 'galat' => 'Username/email atau kata sandi salah.'];
        }
        if ($alasan = $this->alasanDitolak($user)) {
            return ['ok' => false, 'kode' => 'NONAKTIF', 'galat' => $alasan];
        }
        if (! $user->email_verified_at && ! $user->adalahToko()) {
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
        $user = User::with('pembelian')->find($sesi->user_id);
        if (! $user || ! $user->bolehMasuk()) {
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
        if ($user && $user->adalahToko()) {
            return ['ok' => true, 'pesan' => 'Kata sandi akun toko diatur oleh akun dapur. Minta akun dapur membuat kata sandi baru di Pengaturan.'];
        }
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

    // ---------- Akun toko (dikelola akun dapur) ----------

    /** Daftar akun toko milik akun dapur ini. */
    public function daftarToko(User $dapur): array
    {
        return ['ok' => true, 'akun' => $dapur->akunToko()->orderBy('id')->get()->map(fn (User $u) => $this->ringkasToko($u))->all()];
    }

    /** Buat akun toko. Username dipilih sendiri (huruf kecil, angka, titik, garis bawah). */
    public function buatToko(User $dapur, mixed $nama, mixed $username, mixed $sandi): array
    {
        $nama = $this->teks($nama, 60);
        $username = Str::lower($this->teks($username, 40));
        if (mb_strlen($nama) < 2) {
            return ['ok' => false, 'galat' => 'Nama akun toko minimal 2 huruf.'];
        }
        if (! preg_match('/^[a-z0-9._]{4,40}$/', $username)) {
            return ['ok' => false, 'galat' => 'Username 4-40 karakter: huruf kecil, angka, titik, atau garis bawah.'];
        }
        if (User::where('username', $username)->exists()) {
            return ['ok' => false, 'galat' => 'Username itu sudah dipakai. Pilih yang lain.'];
        }
        if ($galat = $this->periksaSandi($sandi)) {
            return ['ok' => false, 'galat' => str_replace('baru ', '', $galat)];
        }
        if ($dapur->akunToko()->count() >= 20) {
            return ['ok' => false, 'galat' => 'Maksimal 20 akun toko.'];
        }
        $u = User::create([
            'name' => $nama,
            'username' => $username,
            // Email wajib unik di tabel users; akun toko tidak memakai email.
            'email' => 'toko-'.bin2hex(random_bytes(6)).'@toko.invalid',
            'password' => $sandi,
            'aktif' => true,
            'peran' => 'toko',
            'id_pemilik' => $dapur->id,
        ]);

        return ['ok' => true, 'akun' => $this->ringkasToko($u)];
    }

    /** Ubah akun toko: nama, aktif, dan/atau kata sandi baru (semua sesinya keluar). */
    public function ubahToko(User $dapur, mixed $id, array $req): array
    {
        $u = $this->tokoMilik($dapur, $id);
        if (! $u) {
            return ['ok' => false, 'galat' => 'Akun toko tidak ditemukan.'];
        }
        if (array_key_exists('nama', $req)) {
            $nama = $this->teks($req['nama'], 60);
            if (mb_strlen($nama) < 2) {
                return ['ok' => false, 'galat' => 'Nama akun toko minimal 2 huruf.'];
            }
            $u->name = $nama;
        }
        $keluarkan = false;
        if (array_key_exists('aktif', $req)) {
            $u->aktif = (bool) $req['aktif'];
            $keluarkan = ! $u->aktif;
        }
        if (isset($req['kataSandi']) && $req['kataSandi'] !== '') {
            if ($galat = $this->periksaSandi($req['kataSandi'])) {
                return ['ok' => false, 'galat' => $galat];
            }
            $u->password = $req['kataSandi'];
            $keluarkan = true;
        }
        $u->save();
        if ($keluarkan) {
            DB::table('sesi_masuk')->where('user_id', $u->id)->delete();
        }

        return ['ok' => true, 'akun' => $this->ringkasToko($u)];
    }

    public function hapusToko(User $dapur, mixed $id): array
    {
        $u = $this->tokoMilik($dapur, $id);
        if (! $u) {
            return ['ok' => false, 'galat' => 'Akun toko tidak ditemukan.'];
        }
        $u->delete();

        return ['ok' => true];
    }

    private function tokoMilik(User $dapur, mixed $id): ?User
    {
        return is_numeric($id) ? $dapur->akunToko()->where('id', (int) $id)->first() : null;
    }

    private function ringkasToko(User $u): array
    {
        $terakhir = DB::table('sesi_masuk')->where('user_id', $u->id)->max('terakhir_dipakai');

        return [
            'id' => $u->id,
            'nama' => $u->name,
            'username' => $u->username,
            'aktif' => (bool) $u->aktif,
            'terakhirDipakai' => $terakhir ? strtotime((string) $terakhir) * 1000 : null,
        ];
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
