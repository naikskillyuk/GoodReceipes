<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;
use Illuminate\Support\Str;

/**
 * Tabel-tabel data aplikasi, dibuat dari config/goodrecipes.php.
 * Setiap baris milik satu akun (id_pengguna); kunci utamanya (id_pengguna, id).
 * Jalan di MySQL (Laragon) maupun PostgreSQL (Supabase).
 */
return new class extends Migration
{
    /** Kolom angka yang berisi waktu (ms) disimpan sebagai bilangan bulat besar. */
    private const KOLOM_WAKTU = ['dibuat', 'waktu', 'hargaDiperbarui'];

    public function up(): void
    {
        foreach (config('goodrecipes.tabel') as $def) {
            Schema::create($def['db'], function (Blueprint $t) use ($def) {
                $t->foreignId('id_pengguna')->constrained('users')->cascadeOnDelete();
                $t->string('id', 100);
                foreach ($def['kolom'] as $nama => $tipe) {
                    if ($nama === 'id') {
                        continue;
                    }
                    $kolom = Str::snake($nama);
                    if (str_starts_with($nama, 'id') || $nama === 'tokenNilai') {
                        $t->string($kolom, 100)->nullable()->index();
                    } elseif ($tipe === 'n') {
                        in_array($nama, self::KOLOM_WAKTU, true) ? $t->bigInteger($kolom)->nullable() : $t->double($kolom)->nullable();
                    } elseif ($tipe === 'b') {
                        $t->boolean($kolom)->nullable();
                    } elseif ($tipe === 'j') {
                        $t->json($kolom)->nullable();
                    } else {
                        $t->text($kolom)->nullable();
                    }
                }
                $t->bigInteger('diubah')->default(0);
                $t->boolean('dihapus')->default(false);
                $t->primary(['id_pengguna', 'id']);
                $t->index(['id_pengguna', 'diubah']);
            });

            // Di Supabase, tabel di skema public bisa diakses lewat API otomatis Supabase.
            // RLS tanpa kebijakan menutup akses itu; Laravel tetap bisa karena masuk sebagai pemilik tabel.
            if (DB::getDriverName() === 'pgsql') {
                DB::statement('alter table "'.$def['db'].'" enable row level security');
            }
        }
    }

    public function down(): void
    {
        foreach (array_reverse(config('goodrecipes.tabel')) as $def) {
            Schema::dropIfExists($def['db']);
        }
    }
};
