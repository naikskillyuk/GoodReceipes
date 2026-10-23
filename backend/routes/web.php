<?php

use App\Http\Controllers\ApiController;
use Illuminate\Support\Facades\Route;

Route::get('/', fn () => response()->json(['ok' => true, 'nama' => 'Good Receipes API', 'api' => url('/api')]));

// Foto yang disimpan di disk server ini (dipakai bila Supabase Storage belum diatur).
Route::get('/foto/{nama}', [ApiController::class, 'foto']);
