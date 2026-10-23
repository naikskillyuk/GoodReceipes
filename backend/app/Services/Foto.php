<?php

namespace App\Services;

use Illuminate\Support\Facades\Http;
use Illuminate\Support\Facades\Storage;
use RuntimeException;

/**
 * Simpan foto: ke Supabase Storage bila diatur, atau ke disk server ini.
 */
class Foto
{
    private const EKSTENSI = ['image/jpeg' => 'jpg', 'image/png' => 'png', 'image/webp' => 'webp'];

    public function unggah(int $idPengguna, string $mime, string $base64, string $nama): string
    {
        if (! isset(self::EKSTENSI[$mime])) {
            throw new RuntimeException('Jenis gambar tidak didukung.');
        }
        if ($base64 === '' || strlen($base64) > config('goodrecipes.maks_panjang_foto')) {
            throw new RuntimeException('Ukuran foto tidak valid.');
        }
        $isi = base64_decode($base64, true);
        $info = $isi === false ? false : @getimagesizefromstring($isi);
        if (! $info || ($info['mime'] ?? '') !== $mime) {
            throw new RuntimeException('Berkas bukan gambar yang valid.');
        }

        $dasar = substr(preg_replace('/[^A-Za-z0-9_-]/', '_', $nama) ?: 'foto', 0, 80);
        // Satu folder per akun; nama acak supaya tautan foto tidak bisa ditebak.
        $berkas = 'u'.$idPengguna.'_'.$dasar.'_'.bin2hex(random_bytes(8)).'.'.self::EKSTENSI[$mime];

        $sb = config('goodrecipes.supabase');
        if ($sb['url'] && $sb['service_key']) {
            return $this->keSupabase($sb, $berkas, $isi, $mime);
        }

        // Di Vercel disk server hilang setiap kali fungsi selesai, jadi Supabase Storage wajib.
        if (config('goodrecipes.di_vercel')) {
            throw new RuntimeException('Penyimpanan foto belum diatur: isi SUPABASE_URL dan SUPABASE_SERVICE_KEY di Vercel.');
        }
        Storage::disk('local')->put('foto/'.$berkas, $isi);

        return url('/foto/'.$berkas);
    }

    private function keSupabase(array $sb, string $berkas, string $isi, string $mime): string
    {
        $jalur = rawurlencode($sb['bucket']).'/'.rawurlencode($berkas);
        $jawab = Http::withHeaders([
            'Authorization' => 'Bearer '.$sb['service_key'],
            'apikey' => $sb['service_key'],
            'x-upsert' => 'true',
            'Cache-Control' => 'max-age=31536000',
        ])->withBody($isi, $mime)->timeout(40)->post($sb['url'].'/storage/v1/object/'.$jalur);

        if (! $jawab->successful()) {
            report(new RuntimeException('Supabase Storage: '.$jawab->status().' '.$jawab->body()));
            throw new RuntimeException('Foto gagal disimpan ke Supabase Storage.');
        }

        return $sb['url'].'/storage/v1/object/public/'.$jalur;
    }
}
