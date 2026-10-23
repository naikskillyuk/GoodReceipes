<?php

namespace App\Models;

use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Model;
use Illuminate\Database\Eloquent\Relations\BelongsTo;

/** Pembelian aplikasi oleh satu akun (sekali bayar). Akun bisa masuk hanya bila lunas. */
#[Fillable(['user_id', 'tanggal', 'jumlah', 'metode', 'lunas', 'catatan'])]
class Pembelian extends Model
{
    protected $table = 'pembelian';

    protected function casts(): array
    {
        return [
            'tanggal' => 'date',
            'jumlah' => 'integer',
            'lunas' => 'boolean',
        ];
    }

    public function user(): BelongsTo
    {
        return $this->belongsTo(User::class);
    }
}
