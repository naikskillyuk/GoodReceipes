<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Tampilan seluruh situs yang diatur admin: logo aplikasi dan foto latar halaman Login.
 * Kosong berarti aplikasi memakai gambar bawaannya sendiri.
 */
class Situs
{
    public const KUNCI = ['logo' => 'logo_url', 'latar' => 'latar_url'];

    /** @return array{logoUrl: string, latarUrl: string} */
    public function tampilan(): array
    {
        $nilai = DB::table('pengaturan_situs')->whereIn('kunci', array_values(self::KUNCI))->pluck('nilai', 'kunci');

        return [
            'logoUrl' => (string) ($nilai[self::KUNCI['logo']] ?? ''),
            'latarUrl' => (string) ($nilai[self::KUNCI['latar']] ?? ''),
        ];
    }

    public function atur(string $jenis, string $url): void
    {
        $kunci = self::KUNCI[$jenis];
        if ($url === '') {
            DB::table('pengaturan_situs')->where('kunci', $kunci)->delete();

            return;
        }
        DB::table('pengaturan_situs')->updateOrInsert(['kunci' => $kunci], ['nilai' => $url, 'updated_at' => now(), 'created_at' => now()]);
    }
}
