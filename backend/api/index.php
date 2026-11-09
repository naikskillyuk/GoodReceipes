<?php

// Titik masuk untuk Vercel (runtime vercel-php). Semua permintaan diarahkan ke sini oleh vercel.json.
// Vercel hanya bisa menulis ke /tmp, jadi folder storage Laravel dipindah ke sana.

$storage = '/tmp/storage';
foreach (['framework/cache/data', 'framework/views', 'framework/sessions', 'logs', 'app'] as $dir) {
    if (! is_dir($storage.'/'.$dir)) {
        @mkdir($storage.'/'.$dir, 0755, true);
    }
}
$_ENV['LARAVEL_STORAGE_PATH'] = $_SERVER['LARAVEL_STORAGE_PATH'] = $storage;

// Skrip ini ada di /api/index.php, sehingga Laravel mengira "/api" adalah folder aplikasi dan
// /api/cetak dibaca sebagai /cetak (404). Anggap skripnya di akar agar semua alamat /api/... cocok.
$_SERVER['SCRIPT_NAME'] = $_SERVER['PHP_SELF'] = '/index.php';

require __DIR__.'/../public/index.php';
