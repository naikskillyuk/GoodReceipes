<?php

use App\Services\Akun;
use Illuminate\Support\Facades\Artisan;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Mail;

// ---------------------------------------------------------------- akun pembeli

// php artisan resep:buat-akun "Nama Pembeli" email@contoh.com [--sandi=...] [--kirim-email] [--jumlah=150000] [--metode=QRIS] [--belum-lunas]
// Biasanya akun dibuat dari halaman /admin; perintah ini untuk keadaan darurat dan tes.
Artisan::command('resep:buat-akun {nama} {email} {--sandi= : Kata sandi (kosong = dibuat acak)} {--kirim-email : Kirim username dan kata sandi ke email pembeli} {--jumlah=0 : Jumlah pembelian (Rp)} {--metode= : Metode pembayaran} {--belum-lunas : Catat pembelian sebagai belum lunas (akun belum bisa masuk)}', function (Akun $akun) {
    $email = strtolower(trim($this->argument('email')));
    if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $this->error('Email tidak valid.');

        return 1;
    }
    if (App\Models\User::where('email', $email)->exists()) {
        $this->error('Email ini sudah terdaftar.');

        return 1;
    }
    $sandi = $this->option('sandi') ?: $akun->sandiAcak();
    $user = $akun->buat(trim($this->argument('nama')), $email, $sandi, [
        'jumlah' => max(0, (int) $this->option('jumlah')),
        'metode' => (string) $this->option('metode'),
        'lunas' => ! $this->option('belum-lunas'),
    ]);
    if ($this->option('kirim-email')) {
        Mail::to($email)->send(new App\Mail\AkunBaru($user, $sandi));
    }
    $this->info('Akun dibuat.');
    $this->line("Username   : {$user->username}");
    $this->line("Email      : {$user->email}");
    $this->line("Kata sandi : {$sandi}");

    return 0;
})->purpose('Buat akun pembeli secara manual');

// php artisan resep:akun-aktif <username|email> ya|tidak
Artisan::command('resep:akun-aktif {login} {status : ya atau tidak}', function (Akun $akun) {
    $user = $akun->cari($this->argument('login'));
    if (! $user) {
        $this->error('Akun tidak ditemukan.');

        return 1;
    }
    $aktif = in_array(strtolower($this->argument('status')), ['ya', 'y', '1', 'true', 'aktif'], true);
    $user->update(['aktif' => $aktif]);
    if (! $aktif) {
        DB::table('sesi_masuk')->where('user_id', $user->id)->delete();
    }
    $this->info("{$user->username} sekarang ".($aktif ? 'AKTIF' : 'TIDAK AKTIF (semua perangkat dikeluarkan)').'.');

    return 0;
})->purpose('Aktifkan atau nonaktifkan akun pembeli');

// php artisan resep:daftar-akun
Artisan::command('resep:daftar-akun', function () {
    $this->table(
        ['ID', 'Username', 'Nama', 'Email', 'Aktif', 'Lunas', 'Jumlah', 'Dibuat'],
        App\Models\User::with('pembelian')->orderBy('id')->get()->map(fn ($u) => [
            $u->id, $u->username, $u->name, $u->email, $u->aktif ? 'ya' : 'tidak',
            $u->pembelian?->lunas ? 'ya' : 'tidak', number_format((int) $u->pembelian?->jumlah, 0, ',', '.'),
            $u->created_at?->format('Y-m-d'),
        ])->all(),
    );
})->purpose('Tampilkan semua akun pembeli');

// ---------------------------------------------------------------- admin

// php artisan resep:buat-admin "Nama Admin" admin@contoh.com [--sandi=...]
// Membuat admin baru, atau mengganti kata sandi admin yang emailnya sudah ada.
Artisan::command('resep:buat-admin {nama} {email} {--sandi= : Kata sandi (kosong = ditanyakan)}', function () {
    $email = strtolower(trim($this->argument('email')));
    if (! filter_var($email, FILTER_VALIDATE_EMAIL)) {
        $this->error('Email tidak valid.');

        return 1;
    }
    $sandi = $this->option('sandi') ?: $this->secret('Kata sandi admin (minimal 10 karakter)');
    if (! is_string($sandi) || mb_strlen($sandi) < 10) {
        $this->error('Kata sandi admin minimal 10 karakter.');

        return 1;
    }
    $admin = App\Models\Admin::updateOrCreate(['email' => $email], ['nama' => trim($this->argument('nama')), 'password' => $sandi]);
    $this->info(($admin->wasRecentlyCreated ? 'Admin dibuat' : 'Kata sandi admin diganti').": {$admin->email}");
    $this->line('Masuk di: '.rtrim((string) config('app.url'), '/').'/admin');

    return 0;
})->purpose('Buat admin untuk halaman /admin, atau ganti kata sandinya');

// ---------------------------------------------------------------- Supabase Storage

// php artisan resep:siapkan-storage
// Membuat bucket foto publik di Supabase Storage (cukup sekali).
Artisan::command('resep:siapkan-storage', function () {
    $sb = config('goodrecipes.supabase');
    if (! $sb['url'] || ! $sb['service_key']) {
        $this->error('Isi SUPABASE_URL dan SUPABASE_SERVICE_KEY di .env dulu.');

        return 1;
    }
    $jawab = Http::withHeaders(['Authorization' => 'Bearer '.$sb['service_key'], 'apikey' => $sb['service_key']])
        ->post($sb['url'].'/storage/v1/bucket', [
            'id' => $sb['bucket'],
            'name' => $sb['bucket'],
            'public' => true,
            'file_size_limit' => 4 * 1024 * 1024,
            'allowed_mime_types' => ['image/jpeg', 'image/png', 'image/webp'],
        ]);
    if ($jawab->successful()) {
        $this->info("Bucket \"{$sb['bucket']}\" dibuat (publik).");

        return 0;
    }
    if (str_contains(strtolower($jawab->body()), 'already exists')) {
        $this->info("Bucket \"{$sb['bucket']}\" sudah ada.");

        return 0;
    }
    $this->error('Gagal: '.$jawab->status().' '.$jawab->body());

    return 1;
})->purpose('Buat bucket foto publik di Supabase Storage');
