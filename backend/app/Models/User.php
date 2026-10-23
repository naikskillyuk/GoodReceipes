<?php

namespace App\Models;

use Database\Factories\UserFactory;
use Illuminate\Database\Eloquent\Attributes\Fillable;
use Illuminate\Database\Eloquent\Attributes\Hidden;
use Illuminate\Database\Eloquent\Factories\HasFactory;
use Illuminate\Foundation\Auth\User as Authenticatable;
use Illuminate\Notifications\Notifiable;

/**
 * Akun pembeli aplikasi. Data resep milik akun ini ada di tabel data dengan id_pengguna = id.
 */
#[Fillable(['name', 'username', 'email', 'password', 'aktif'])]
#[Hidden(['password', 'remember_token'])]
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
        ];
    }

    /** Data akun yang boleh dikirim ke aplikasi. */
    public function untukAplikasi(): array
    {
        return ['id' => $this->id, 'nama' => $this->name, 'username' => $this->username, 'email' => $this->email];
    }
}
