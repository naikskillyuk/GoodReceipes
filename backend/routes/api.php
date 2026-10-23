<?php

use App\Http\Controllers\ApiController;
use Illuminate\Support\Facades\Route;

// Alamat yang diisi di aplikasi: https://<server-anda>/api
Route::get('/', [ApiController::class, 'info']);
Route::post('/', [ApiController::class, 'handle'])->middleware('throttle:api-resep');
