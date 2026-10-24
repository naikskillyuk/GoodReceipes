<?php

use App\Http\Controllers\AdminController;
use App\Http\Middleware\HarusAdmin;
use Illuminate\Support\Facades\Route;

// Halaman admin (sesi cookie + CSRF dari grup "web"). Akun admin dibuat dengan: php artisan resep:buat-admin
Route::prefix('admin')->group(function () {
    Route::get('/masuk', [AdminController::class, 'formMasuk']);
    Route::post('/masuk', [AdminController::class, 'masuk']);
    Route::post('/keluar', [AdminController::class, 'keluar']);

    Route::middleware(HarusAdmin::class)->group(function () {
        Route::get('/', [AdminController::class, 'index']);
        Route::get('/akun/baru', [AdminController::class, 'formBaru']);
        Route::post('/akun', [AdminController::class, 'simpanBaru']);
        Route::get('/akun/{user}', [AdminController::class, 'detail'])->whereNumber('user');
        Route::post('/akun/{user}/profil', [AdminController::class, 'simpanProfil'])->whereNumber('user');
        Route::post('/akun/{user}/pembelian', [AdminController::class, 'simpanPembelian'])->whereNumber('user');
        Route::post('/akun/{user}/aktif', [AdminController::class, 'ubahAktif'])->whereNumber('user');
        Route::post('/akun/{user}/sandi', [AdminController::class, 'aturUlangSandi'])->whereNumber('user');
        Route::post('/akun/{user}/keluarkan', [AdminController::class, 'keluarkanPerangkat'])->whereNumber('user');
        Route::get('/tampilan', [AdminController::class, 'tampilan']);
        Route::post('/tampilan/{jenis}', [AdminController::class, 'simpanTampilan'])->whereIn('jenis', ['logo', 'latar']);
        Route::post('/tampilan/{jenis}/hapus', [AdminController::class, 'hapusTampilan'])->whereIn('jenis', ['logo', 'latar']);
    });
});
