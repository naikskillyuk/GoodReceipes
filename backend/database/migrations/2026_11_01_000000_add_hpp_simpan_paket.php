<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * HPP paket yang disimpan dengan tombol dan foto paket (paket: hpp_simpan, hpp_simpan_pada, foto_url).
 * Generik: tabel dan kolom yang belum ada dibuat dari config/goodrecipes.php.
 */
return new class extends Migration
{
    public function up(): void
    {
        $waktu = config('goodrecipes.kolom_waktu');
        foreach (config('goodrecipes.tabel') as $def) {
            $nama = $def['db'];
            if (! Schema::hasTable($nama)) {
                Schema::create($nama, function (Blueprint $t) use ($def, $waktu) {
                    $t->foreignId('id_pengguna')->constrained('users')->cascadeOnDelete();
                    $t->string('id', 100);
                    foreach ($def['kolom'] as $kol => $tipe) {
                        if ($kol !== 'id') {
                            $this->kolom($t, $kol, $tipe, $waktu);
                        }
                    }
                    $t->bigInteger('diubah')->default(0);
                    $t->boolean('dihapus')->default(false);
                    $t->primary(['id_pengguna', 'id']);
                    $t->index(['id_pengguna', 'diubah']);
                });
                if (DB::getDriverName() === 'pgsql') {
                    DB::statement('alter table "'.$nama.'" enable row level security');
                }

                continue;
            }
            $kurang = array_filter(array_keys($def['kolom']), fn ($kol) => $kol !== 'id' && ! Schema::hasColumn($nama, Str::snake($kol)));
            if ($kurang) {
                Schema::table($nama, function (Blueprint $t) use ($def, $kurang, $waktu) {
                    foreach ($kurang as $kol) {
                        $this->kolom($t, $kol, $def['kolom'][$kol], $waktu);
                    }
                });
            }
        }
    }

    public function down(): void
    {
        foreach (['hpp_simpan', 'hpp_simpan_pada', 'foto_url'] as $kol) {
            if (Schema::hasColumn('paket', $kol)) {
                Schema::table('paket', fn (Blueprint $t) => $t->dropColumn($kol));
            }
        }
    }

    private function kolom(Blueprint $t, string $nama, string $tipe, array $waktu): void
    {
        $kolom = Str::snake($nama);
        if (str_starts_with($nama, 'id') || in_array($nama, ['tokenNilai', 'tokenToko'], true)) {
            $t->string($kolom, 100)->nullable()->index();
        } elseif ($tipe === 'n') {
            in_array($nama, $waktu, true) ? $t->bigInteger($kolom)->nullable() : $t->double($kolom)->nullable();
        } elseif ($tipe === 'b') {
            $t->boolean($kolom)->nullable();
        } elseif ($tipe === 'j') {
            $t->json($kolom)->nullable();
        } else {
            $t->text($kolom)->nullable();
        }
    }
};
