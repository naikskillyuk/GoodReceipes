<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Pengaturan tampilan seluruh situs yang diatur admin (mis. logo dan foto latar halaman Login).
 * Satu baris per kunci; berlaku untuk semua pengguna.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::create('pengaturan_situs', function (Blueprint $t) {
            $t->string('kunci', 40)->primary();
            $t->text('nilai');
            $t->timestamps();
        });

        if (DB::getDriverName() === 'pgsql') {
            DB::statement('alter table "pengaturan_situs" enable row level security');
        }
    }

    public function down(): void
    {
        Schema::dropIfExists('pengaturan_situs');
    }
};
