<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Akun pengguna: username dan status aktif di tabel users, serta sesi login per perangkat.
 * Token sesi hanya disimpan sebagai hash SHA-256.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('users', function (Blueprint $t) {
            $t->string('username', 40)->nullable()->unique()->after('name');
            $t->boolean('aktif')->default(true)->after('password');
        });

        Schema::create('sesi_masuk', function (Blueprint $t) {
            $t->id();
            $t->foreignId('user_id')->constrained('users')->cascadeOnDelete();
            $t->char('token_hash', 64)->unique();
            $t->string('perangkat', 120)->nullable();
            $t->timestamp('terakhir_dipakai')->nullable();
            $t->timestamps();
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('alter table "sesi_masuk" enable row level security');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('sesi_masuk');
        Schema::table('users', function (Blueprint $t) {
            $t->dropUnique(['username']);
            $t->dropColumn(['username', 'aktif']);
        });
    }
};
