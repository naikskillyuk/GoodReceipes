<?php

use Illuminate\Foundation\Application;
use Illuminate\Foundation\Configuration\Exceptions;
use Illuminate\Foundation\Configuration\Middleware;
use Illuminate\Http\Request;

return Application::configure(basePath: dirname(__DIR__))
    ->withRouting(
        api: __DIR__.'/../routes/api.php',
        commands: __DIR__.'/../routes/console.php',
        health: '/up',
        // Halaman lain tanpa sesi/cookie; hanya /admin yang memakai sesi web (cookie + CSRF).
        then: function () {
            Illuminate\Support\Facades\Route::group([], __DIR__.'/../routes/web.php');
            Illuminate\Support\Facades\Route::middleware('web')->group(__DIR__.'/../routes/admin.php');
        },
    )
    ->withMiddleware(function (Middleware $middleware): void {
        // Di Vercel, PHP hanya melihat proksi (127.0.0.1). IP pengunjung ada di X-Forwarded-For,
        // yang ditimpa Vercel sehingga tidak bisa dipalsukan. Tanpa ini, batas percobaan masuk
        // dan daftar berlaku untuk semua pengunjung sekaligus.
        $middleware->trustProxies(at: '*');
    })
    ->withExceptions(function (Exceptions $exceptions): void {
        // Galat di /api (mis. database mati, batas permintaan) dijawab dengan format yang dipahami aplikasi.
        $exceptions->render(function (Throwable $e, Request $request) {
            if (! $request->is('api', 'api/*')) {
                return null;
            }
            $galat = match (true) {
                $e instanceof \Illuminate\Http\Exceptions\ThrottleRequestsException => 'Terlalu banyak permintaan. Coba lagi sebentar lagi.',
                $e instanceof \Illuminate\Database\QueryException, $e instanceof PDOException => 'Server tidak bisa menghubungi database.',
                default => 'Terjadi kesalahan di server.',
            };

            return response()->json(['ok' => false, 'galat' => $galat], 200);
        });
        $exceptions->shouldRenderJsonWhen(
            fn (Request $request) => $request->is('api', 'api/*') || $request->expectsJson(),
        );
    })->create();
