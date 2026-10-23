<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Model;

/** Pengelola aplikasi yang masuk ke /admin. Terpisah dari akun pembeli (tabel users). */
#[Fillable(['nama', 'email', 'password', 'terakhir_masuk'])]
#[Hidden(['password'])]
class Admin extends Model
{
    protected $table = 'admin';

    protected function casts(): array
    {
        return [
            'password' => 'hashed',
            'terakhir_masuk' => 'datetime',
        ];
    }
}
