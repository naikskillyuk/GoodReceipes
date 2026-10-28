<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Stok bahan, produksi, stok makanan, menu, pesanan, pembayaran, pelanggan, dan promo.
 *
 * - Tabel data dan kolom yang belum ada dibuat dari config/goodrecipes.php (aturan sama dengan migrasi pertama),
 *   jadi aman dijalankan pada database lama maupun baru.
 * - users: akun toko (id_pemilik = akun dapur pemilik data, peran 'toko'), kunci Mayar (terenkripsi),
 *   dan token webhook Mayar.
 */
return new class extends Migration
{
    private array $dibuat = [];

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
                $this->dibuat[] = $nama;
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

        Schema::table('users', function (Blueprint $t) {
            if (! Schema::hasColumn('users', 'peran')) {
                $t->string('peran', 20)->default('dapur');
            }
            if (! Schema::hasColumn('users', 'id_pemilik')) {
                $t->foreignId('id_pemilik')->nullable()->constrained('users')->cascadeOnDelete();
            }
            if (! Schema::hasColumn('users', 'mayar_kunci')) {
                $t->text('mayar_kunci')->nullable();
            }
            if (! Schema::hasColumn('users', 'mayar_sandbox')) {
                $t->boolean('mayar_sandbox')->default(false);
            }
            if (! Schema::hasColumn('users', 'token_webhook')) {
                $t->string('token_webhook', 64)->nullable()->unique();
            }
        });
    }

    public function down(): void
    {
        Schema::table('users', function (Blueprint $t) {
            $t->dropConstrainedForeignId('id_pemilik');
            $t->dropUnique(['token_webhook']);
            $t->dropColumn(['peran', 'mayar_kunci', 'mayar_sandbox', 'token_webhook']);
        });
        foreach (['mutasi_bahan', 'produksi', 'mutasi_makanan', 'menu', 'pesanan', 'pembayaran', 'pelanggan', 'promo'] as $tabel) {
            Schema::dropIfExists($tabel);
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
