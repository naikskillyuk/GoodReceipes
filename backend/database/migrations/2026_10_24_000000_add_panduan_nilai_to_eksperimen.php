<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Petunjuk penilaian per aspek dan catatan chef, tampil di halaman penilai.
 * Database baru sudah mendapat kolom ini dari migrasi pertama (dibaca dari config), jadi dicek dulu.
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('eksperimen', function (Blueprint $t) {
            if (! Schema::hasColumn('eksperimen', 'panduan_nilai')) {
                $t->json('panduan_nilai')->nullable();
            }
            if (! Schema::hasColumn('eksperimen', 'catatan_chef')) {
                $t->text('catatan_chef')->nullable();
            }
        });
    }

    public function down(): void
    {
        Schema::table('eksperimen', function (Blueprint $t) {
            $t->dropColumn(['panduan_nilai', 'catatan_chef']);
        });
    }
};
