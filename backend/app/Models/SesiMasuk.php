<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Model;

/** Sesi login satu perangkat (token hanya disimpan sebagai hash). Ditulis oleh App\Services\Akun. */
class SesiMasuk extends Model
{
    protected $table = 'sesi_masuk';
}
