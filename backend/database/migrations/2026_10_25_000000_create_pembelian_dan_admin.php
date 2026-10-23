<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pembelian aplikasi (sekali bayar, satu per akun) dan akun admin untuk halaman /admin.
 * Akun pembeli hanya bisa masuk bila aktif DAN pembeliannya lunas.
 * Admin disimpan terpisah dari akun pembeli, jadi tidak pernah ikut daftar pembeli.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pembelian', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->unique()->constrained('users')->cascadeOnDelete();
            $t->date('tanggal');
            $t->unsignedBigInteger('jumlah')->default(0); // rupiah
            $t->string('metode', 40)->default('');
            $t->boolean('lunas')->default(false);
            $t->string('catatan', 500)->default('');
            $t->timestamps();
        });

        Schema::create('admin', function (Blueprint $t) {
            $t->id();
            $t->string('nama', 60);
            $t->string('email', 190)->unique();
            $t->string('password');
            $t->timestamp('terakhir_masuk')->nullable();
            $t->timestamps();
        });

        // Akun yang sudah ada sebelum pencatatan pembelian tetap bisa masuk.
        $sekarang = now();
        foreach (DB::table('users')->select('id', 'created_at')->get() as $u) {
            DB::table('pembelian')->insert([
                'user_id' => $u->id,
                'tanggal' => ($u->created_at ? substr((string) $u->created_at, 0, 10) : $sekarang->toDateString()),
                'jumlah' => 0,
                'metode' => '',
                'lunas' => true,
                'catatan' => 'Akun dibuat sebelum pencatatan pembelian.',
                'created_at' => $sekarang,
                'updated_at' => $sekarang,
            ]);
        }

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('alter table "pembelian" enable row level security');
            DB::statement('alter table "admin" enable row level security');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('admin');
        Schema::dropIfExists('pembelian');
    }
};
