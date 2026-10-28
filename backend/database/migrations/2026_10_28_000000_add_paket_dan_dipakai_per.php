<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * - resep_tambahan.dipakai_per: takaran resep tambahan untuk tiap porsi atau untuk satu kali masak.
 * - paket, isi_paket, biaya_paket: HPP paket (beberapa resep dalam satu kemasan).
 * Database baru sudah mendapat semuanya dari migrasi pertama (dibaca dari config), jadi dicek dulu.
 */
return new class extends Migration
{
    private const TABEL_BARU = ['paket', 'isi_paket', 'biaya_paket'];

    public function up(): void
    {
        Schema::table('resep_tambahan', function (Blueprint $t) {
            if (! Schema::hasColumn('resep_tambahan', 'dipakai_per')) {
                $t->text('dipakai_per')->nullable();
            }
        });

        if (! Schema::hasTable('paket')) {
            Schema::create('paket', function (Blueprint $t) {
                $this->kolomDasar($t);
                $t->text('nama')->nullable();
                $t->double('margin_target')->nullable();
                $t->double('harga_jual')->nullable();
                $t->bigInteger('dibuat')->nullable();
                $this->kolomAkhir($t);
            });
        }
        if (! Schema::hasTable('isi_paket')) {
            Schema::create('isi_paket', function (Blueprint $t) {
                $this->kolomDasar($t);
                $t->string('id_paket', 100)->nullable()->index();
                $t->string('id_resep', 100)->nullable()->index();
                $t->double('jumlah')->nullable();
                $t->double('urutan')->nullable();
                $this->kolomAkhir($t);
            });
        }
        if (! Schema::hasTable('biaya_paket')) {
            Schema::create('biaya_paket', function (Blueprint $t) {
                $this->kolomDasar($t);
                $t->string('id_paket', 100)->nullable()->index();
                $t->text('jenis')->nullable();
                $t->double('nilai')->nullable();
                $t->double('urutan')->nullable();
                $this->kolomAkhir($t);
            });
        }

        if (DB::getDriverName() === 'pgsql') {
            foreach (self::TABEL_BARU as $tabel) {
                DB::statement('alter table "'.$tabel.'" enable row level security');
            }
        }
    }

    public function down(): void
    {
        foreach (array_reverse(self::TABEL_BARU) as $tabel) {
            Schema::dropIfExists($tabel);
        }
        if (Schema::hasColumn('resep_tambahan', 'dipakai_per')) {
            Schema::table('resep_tambahan', fn (Blueprint $t) => $t->dropColumn('dipakai_per'));
        }
    }

    private function kolomDasar(Blueprint $t): void
    {
        $t->foreignId('id_pengguna')->constrained('users')->cascadeOnDelete();
        $t->string('id', 100);
    }

    private function kolomAkhir(Blueprint $t): void
    {
        $t->bigInteger('diubah')->default(0);
        $t->boolean('dihapus')->default(false);
        $t->primary(['id_pengguna', 'id']);
        $t->index(['id_pengguna', 'diubah']);
    }
};
