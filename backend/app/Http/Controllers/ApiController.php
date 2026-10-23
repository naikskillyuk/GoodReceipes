<?php

namespace App\Http\Controllers;

use App\Services\Akun;
use App\Services\Foto;
use App\Services\Penilai;
use App\Services\Sinkron;
use Illuminate\Http\JsonResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Facades\Storage;
use Illuminate\Support\Str;
use Symfony\Component\HttpFoundation\StreamedResponse;
use Throwable;

/**
 * Satu alamat /api. Isi permintaan: JSON {aksi, kunci?, ...}, dikirim sebagai text/plain agar
 * browser tidak mengirim preflight CORS.
 *
 * - Tanpa login : masuk, lupaSandi, aturSandi (akun) dan infoNilai, kirimNilai (penilai QR).
 *   Akun dibuat oleh admin di /admin; tidak ada pendaftaran sendiri.
 * - Dengan login: `kunci` berisi token sesi dari aksi `masuk`.
 */
class ApiController extends Controller
{
    /** Pemeriksaan cepat lewat browser: tidak mengembalikan data apa pun. */
    public function info(): JsonResponse
    {
        return response()->json(['ok' => true, 'nama' => 'Good Receipes', 'versi' => config('goodrecipes.versi'), 'akun' => true]);
    }

    public function handle(Request $request, Akun $akun, Sinkron $sinkron, Foto $foto, Penilai $penilai): JsonResponse
    {
        $req = json_decode($request->getContent(), true);
        if (! is_array($req)) {
            return $this->keluar(['ok' => false, 'galat' => 'Permintaan tidak valid.']);
        }

        try {
            $aksi = is_string($req['aksi'] ?? null) ? $req['aksi'] : '';

            // Penilai lewat QR: hanya butuh token tautan.
            if ($aksi === 'infoNilai') {
                return $this->keluar($penilai->info($req['token'] ?? null));
            }
            if ($aksi === 'kirimNilai') {
                return $this->keluar($penilai->kirim($req));
            }

            // Akun tanpa login, dengan batas percobaan per alamat IP (dan per akun untuk masuk).
            if (in_array($aksi, ['masuk', 'lupaSandi', 'aturSandi'], true)) {
                $kunciBatas = $this->kunciBatas($request, $aksi, $req);
                if ($tolak = $this->periksaBatas($aksi, $kunciBatas)) {
                    return $this->keluar($tolak);
                }
                $hasil = match ($aksi) {
                    'masuk' => $akun->masuk($req['login'] ?? '', $req['kataSandi'] ?? '', $req['perangkat'] ?? ''),
                    'lupaSandi' => $akun->lupaSandi($req['login'] ?? ''),
                    'aturSandi' => $akun->aturSandi($req['email'] ?? '', $req['tokenReset'] ?? '', $req['kataSandi'] ?? ''),
                };
                // Masuk: hanya percobaan gagal yang dihitung. Aksi lain: setiap permintaan dihitung.
                if ($aksi !== 'masuk' || ! $hasil['ok']) {
                    foreach ($kunciBatas as $k) {
                        RateLimiter::hit($k, $aksi === 'masuk' ? 300 : 600);
                    }
                }

                return $this->keluar($hasil);
            }

            // Sisanya wajib login.
            $token = is_string($req['kunci'] ?? null) ? $req['kunci'] : '';
            $user = $akun->dariSesi($token);
            if (! $user) {
                return $this->keluar(['ok' => false, 'kode' => 'SESI', 'galat' => 'Sesi Anda sudah berakhir. Silakan masuk lagi.']);
            }

            return $this->keluar(match ($aksi) {
                'ping' => ['ok' => true, 'versi' => config('goodrecipes.versi'), 'pengguna' => $user->untukAplikasi()],
                'sinkron' => $sinkron->jalankan($user->id, is_array($req['baris'] ?? null) ? $req['baris'] : [], (int) ($req['sejak'] ?? 0)),
                'unggahFoto' => ['ok' => true, 'url' => $foto->unggah(
                    $user->id,
                    (string) ($req['mime'] ?? ''),
                    (string) ($req['base64'] ?? ''),
                    (string) ($req['nama'] ?? 'foto'),
                )],
                'ubahProfil' => $akun->ubahProfil($user, $req['nama'] ?? ''),
                'gantiSandi' => $akun->gantiSandi($user, $token, $req['lama'] ?? '', $req['baru'] ?? ''),
                'keluar' => (function () use ($akun, $token) {
                    $akun->keluar($token);

                    return ['ok' => true];
                })(),
                default => ['ok' => false, 'galat' => 'Aksi tidak dikenal.'],
            });
        } catch (Throwable $e) {
            report($e);
            $pesan = $e instanceof \RuntimeException ? $e->getMessage() : 'Terjadi kesalahan di server.';

            return $this->keluar(['ok' => false, 'galat' => $pesan]);
        }
    }

    private const BATAS = ['masuk' => 10, 'lupaSandi' => 5, 'aturSandi' => 10];

    /** Kunci penghitung percobaan: per alamat IP, dan untuk masuk juga per akun. */
    private function kunciBatas(Request $request, string $aksi, array $req): array
    {
        $kunci = ['akun:'.$aksi.':'.$request->ip()];
        if ($aksi === 'masuk' && is_scalar($req['login'] ?? null)) {
            // Supaya tebak-tebakan kata sandi dari banyak IP tetap tertahan.
            $kunci[] = 'akun:masuk:'.Str::lower(trim((string) $req['login']));
        }

        return $kunci;
    }

    private function periksaBatas(string $aksi, array $kunci): ?array
    {
        foreach ($kunci as $k) {
            if (RateLimiter::tooManyAttempts($k, self::BATAS[$aksi])) {
                $detik = RateLimiter::availableIn($k);

                return ['ok' => false, 'galat' => "Terlalu banyak percobaan. Coba lagi dalam {$detik} detik."];
            }
        }

        return null;
    }

    /** Foto yang disimpan di disk server (bila Supabase Storage tidak dipakai). */
    public function foto(string $nama): StreamedResponse
    {
        abort_unless(preg_match('/^[A-Za-z0-9_-]+\.(jpg|png|webp)$/', $nama) === 1, 404);
        $jalur = 'foto/'.$nama;
        abort_unless(Storage::disk('local')->exists($jalur), 404);

        return Storage::disk('local')->response($jalur, null, ['Cache-Control' => 'public, max-age=31536000, immutable']);
    }

    private function keluar(array $isi): JsonResponse
    {
        // Selalu 200; keberhasilan dibaca dari `ok`.
        return response()->json($isi, 200, [], JSON_UNESCAPED_UNICODE | JSON_UNESCAPED_SLASHES);
    }
}
