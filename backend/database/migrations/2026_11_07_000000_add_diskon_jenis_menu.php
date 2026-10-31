<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Jenis diskon produk (menu.diskon_jenis): 'persen' (bawaan, juga bila kosong) atau 'nominal' (potongan Rupiah). */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('menu', 'diskon_jenis')) {
            Schema::table('menu', fn (Blueprint $t) => $t->text('diskon_jenis')->nullable());
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('menu', 'diskon_jenis')) {
            Schema::table('menu', fn (Blueprint $t) => $t->dropColumn('diskon_jenis'));
        }
    }
};
