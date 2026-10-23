<?php

namespace App\Providers;

use Illuminate\Cache\RateLimiting\Limit;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\ServiceProvider;

class AppServiceProvider extends ServiceProvider
{
    /**
     * Register any application services.
     */
    public function register(): void
    {
        //
    }

    /**
     * Bootstrap any application services.
     */
    public function boot(): void
    {
        // Batas permintaan per alamat IP: cukup longgar untuk sinkron + unggah foto,
        // tapi menahan pengiriman penilaian yang membanjir.
        RateLimiter::for('api-resep', fn (Request $request) => Limit::perMinute(180)->by($request->ip()));
    }
}
