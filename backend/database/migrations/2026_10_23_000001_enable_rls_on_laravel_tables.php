<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Schema;

/**
 * Supabase: tabel bawaan Laravel (users, sessions, cache, jobs, ...) juga ada di skema public,
 * jadi ikut ditutup dari API otomatis Supabase. Tidak berpengaruh di MySQL.
 */
return new class extends Migration
{
    private const TABEL = [
        'migrations', 'users', 'password_reset_tokens', 'sessions', 'cache', 'cache_locks',
        'jobs', 'job_batches', 'failed_jobs',
    ];

    public function up(): void
    {
        if (DB::getDriverName() !== 'pgsql') {
            return;
        }
        foreach (self::TABEL as $tabel) {
            if (Schema::hasTable($tabel)) {
                DB::statement('alter table "'.$tabel.'" enable row level security');
            }
        }
    }

    public function down(): void
    {
        //
    }
};
