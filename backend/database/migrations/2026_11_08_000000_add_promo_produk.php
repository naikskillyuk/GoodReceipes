<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Kode promo khusus satu produk (promo.id_menu, kosong = seluruh belanja): minimal beli (min_jumlah) dan
 * cara berlaku (berlaku: 'kelipatan' | 'sekali' per pesanan).
 */
return new class extends Migration
{
    public function up(): void
    {
        Schema::table('promo', function (Blueprint $t) {
            if (! Schema::hasColumn('promo', 'id_menu')) {
                $t->string('id_menu', 100)->nullable();
            }
            if (! Schema::hasColumn('promo', 'min_jumlah')) {
                $t->double('min_jumlah')->nullable();
            }
            if (! Schema::hasColumn('promo', 'berlaku')) {
                $t->text('berlaku')->nullable();
            }
        });
    }

    public function down(): void
    {
        foreach (['id_menu', 'min_jumlah', 'berlaku'] as $kol) {
            if (Schema::hasColumn('promo', $kol)) {
                Schema::table('promo', fn (Blueprint $t) => $t->dropColumn($kol));
            }
        }
    }
};
