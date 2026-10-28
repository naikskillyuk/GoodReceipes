<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * HPP resep per porsi yang disimpan dengan tombol "Simpan HPP" (packing dicatat terpisah).
 * Database baru sudah mendapat kolom ini dari migrasi pertama (dibaca dari config), jadi dicek dulu.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('target', function (Blueprint $t) {
            if (! Schema::hasColumn('target', 'hpp_simpan')) {
                $t->double('hpp_simpan')->nullable();
            }
            if (! Schema::hasColumn('target', 'packing_simpan')) {
                $t->double('packing_simpan')->nullable();
            }
            if (! Schema::hasColumn('target', 'hpp_simpan_pada')) {
                $t->bigInteger('hpp_simpan_pada')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('target', function (Blueprint $t) {
            $t->dropColumn(['hpp_simpan', 'packing_simpan', 'hpp_simpan_pada']);
        });
    }
};
