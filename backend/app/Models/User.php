<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Database\Eloquent\Relations\BelongsTo;
use Illuminate\Database\Eloquent\Relations\HasMany;
use Illuminate\Database\Eloquent\Relations\HasOne;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

/**
 * Akun aplikasi.
 *
 * - Akun dapur (peran 'dapur'): pembeli aplikasi. Data usahanya ada di tabel data dengan id_pengguna = id.
 * - Akun toko (peran 'toko'): dibuat oleh akun dapur, memakai data akun dapur itu (id_pemilik),
 *   tetapi hanya untuk menu, stok makanan, pesanan, dan pembayaran.
 */
#[Fillable(['name', 'username', 'email', 'password', 'aktif', 'peran', 'id_pemilik'])]
#[Hidden(['password', 'remember_token', 'mayar_kunci', 'token_webhook'])]
class User extends Authenticatable
{
    /** @use HasFactory<UserFactory> */
    use HasFactory, Notifiable;

    protected function casts(): array
    {
        return [
            'email_verified_at' => 'datetime',
            'password' => 'hashed',
            'aktif' => 'boolean',
            'mayar_kunci' => 'encrypted',
            'mayar_sandbox' => 'boolean',
        ];
    }

    public function pembelian(): HasOne
    {
        return $this->hasOne(Pembelian::class);
    }

    public function sesi(): HasMany
    {
        return $this->hasMany(SesiMasuk::class);
    }

    public function pemilik(): BelongsTo
    {
        return $this->belongsTo(User::class, 'id_pemilik');
    }

    public function akunToko(): HasMany
    {
        return $this->hasMany(User::class, 'id_pemilik');
    }

    public function adalahToko(): bool
    {
        return $this->peran === 'toko' && $this->id_pemilik;
    }

    /** Id pemilik data usaha: akun dapur itu sendiri, atau akun dapur yang membuat akun toko ini. */
    public function idData(): int
    {
        return (int) ($this->id_pemilik ?: $this->id);
    }

    /** Akun dapur pemilik data (dirinya sendiri untuk akun dapur). */
    public function akunDapur(): User
    {
        return $this->id_pemilik ? $this->pemilik : $this;
    }

    /** Akun hanya boleh dipakai bila aktif dan pembeliannya lunas (akun toko: pembelian akun dapurnya). */
    public function bolehMasuk(): bool
    {
        if (! $this->aktif) {
            return false;
        }
        if ($this->id_pemilik) {
            return (bool) $this->pemilik?->bolehMasuk();
        }

        return (bool) $this->pembelian?->lunas;
    }

    /** Data akun yang boleh dikirim ke aplikasi. */
    public function untukAplikasi(): array
    {
        return [
            'id' => $this->id,
            'nama' => $this->name,
            'username' => $this->username,
            'email' => $this->adalahToko() ? '' : $this->email,
            'peran' => $this->adalahToko() ? 'toko' : 'dapur',
            'idData' => $this->idData(),
        ];
    }
}
