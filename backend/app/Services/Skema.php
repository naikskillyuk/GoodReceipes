<?php

namespace App\Services;

use Illuminate\Support\Str;

/**
 * Peta antara baris aplikasi (camelCase, seperti js/lib/schema.js) dan baris database (snake_case).
 */
class Skema
{
    /** @return array<string, array{db: string, kolom: array<string, string>}> */
    public static function tabel(): array
    {
        return config('goodrecipes.tabel');
    }

    public static function namaDb(string $tabel): string
    {
        return self::tabel()[$tabel]['db'];
    }

    /** Kolom aplikasi beserta tipenya, termasuk `diubah` dan `dihapus`. */
    public static function kolom(string $tabel): array
    {
        return self::tabel()[$tabel]['kolom'] + ['diubah' => 'n', 'dihapus' => 'b'];
    }

    /**
     * Baris dari aplikasi -> kolom database. Hanya kolom yang dikenal dan tidak kosong (null)
     * yang diambil: nilai yang tidak dikirim tidak menimpa.
     */
    public static function keDb(string $tabel, array $baris): array
    {
        $keluar = [];
        foreach (self::kolom($tabel) as $nama => $tipe) {
            if (! array_key_exists($nama, $baris) || $baris[$nama] === null) {
                continue;
            }
            $v = $baris[$nama];
            $kolom = Str::snake($nama);
            $keluar[$kolom] = match (true) {
                $nama === 'diubah' => (int) $v,
                $tipe === 'n' => is_numeric($v) ? $v + 0 : null,
                $tipe === 'b' => self::bool($v),
                $tipe === 'j' => self::json($v),
                default => is_scalar($v) ? (string) $v : json_encode($v),
            };
        }

        return $keluar;
    }

    /** Baris database -> baris aplikasi dengan tipe yang benar. */
    public static function dariDb(string $tabel, object|array $baris): array
    {
        $baris = (array) $baris;
        $keluar = [];
        foreach (self::kolom($tabel) as $nama => $tipe) {
            $v = $baris[Str::snake($nama)] ?? null;
            $keluar[$nama] = match (true) {
                $nama === 'diubah' => (int) $v,
                $v === null => $tipe === 'b' ? false : ($tipe === 't' ? '' : null),
                $tipe === 'n' => is_numeric($v) ? $v + 0 : null,
                $tipe === 'b' => self::bool($v),
                $tipe === 'j' => is_string($v) ? json_decode($v, true) : $v,
                default => (string) $v,
            };
        }

        return $keluar;
    }

    public static function bool(mixed $v): bool
    {
        return $v === true || $v === 1 || (is_string($v) && preg_match('/^(true|1|ya|t)$/i', $v) === 1);
    }

    /** Teks JSON yang sah, atau null. Aplikasi mengirim kolom JSON sebagai teks. */
    private static function json(mixed $v): ?string
    {
        if (is_string($v)) {
            json_decode($v);

            return json_last_error() === JSON_ERROR_NONE ? $v : null;
        }

        return json_encode($v);
    }
}
