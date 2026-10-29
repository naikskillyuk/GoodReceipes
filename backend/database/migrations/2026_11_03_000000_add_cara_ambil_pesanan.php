<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Cara ambil pesanan online: 'ambil' (diambil sendiri) atau 'ojol' (ojek online dipesan pembeli sendiri).
 * Jam ambilnya memakai kolom pesanan.jadwal yang sudah ada.
 */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('pesanan', 'cara_ambil')) {
            Schema::table('pesanan', fn (Blueprint $t) => $t->text('cara_ambil')->nullable());
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('pesanan', 'cara_ambil')) {
            Schema::table('pesanan', fn (Blueprint $t) => $t->dropColumn('cara_ambil'));
        }
    }
};
