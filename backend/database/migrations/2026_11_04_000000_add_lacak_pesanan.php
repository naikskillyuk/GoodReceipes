<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/**
 * Lacak pesanan untuk pembeli: waktu bukti bayar dikirim (bukti_pada), pesan kendala dari dapur (kendala),
 * dan riwayat perubahan status untuk timeline (riwayat).
 */
return new class extends Migration
{
    private const KOLOM = ['bukti_pada', 'kendala', 'riwayat'];

    public function up(): void
    {
        Schema::table('pesanan', function (Blueprint $t) {
            if (! Schema::hasColumn('pesanan', 'bukti_pada')) {
                $t->bigInteger('bukti_pada')->nullable();
            }
            if (! Schema::hasColumn('pesanan', 'kendala')) {
                $t->text('kendala')->nullable();
            }
            if (! Schema::hasColumn('pesanan', 'riwayat')) {
                $t->json('riwayat')->nullable();
            }
        });
    }

    public function down(): void
    {
        foreach (self::KOLOM as $kol) {
            if (Schema::hasColumn('pesanan', $kol)) {
                Schema::table('pesanan', fn (Blueprint $t) => $t->dropColumn($kol));
            }
        }
    }
};
