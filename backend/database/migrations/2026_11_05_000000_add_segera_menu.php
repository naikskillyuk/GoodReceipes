<?php

use Illuminate\Database\Migrations\Migration;
use Illuminate\Database\Schema\Blueprint;
use Illuminate\Support\Facades\Schema;

/** Menu "Coming soon" (menu.segera): harga disembunyikan di etalase, tetap bisa dipesan untuk uji coba. */
return new class extends Migration
{
    public function up(): void
    {
        if (! Schema::hasColumn('menu', 'segera')) {
            Schema::table('menu', fn (Blueprint $t) => $t->boolean('segera')->nullable());
        }
    }

    public function down(): void
    {
        if (Schema::hasColumn('menu', 'segera')) {
            Schema::table('menu', fn (Blueprint $t) => $t->dropColumn('segera'));
        }
    }
};
