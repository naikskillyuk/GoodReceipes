<?php

namespace App\Http\Controllers;

use App\Services\Akun;
use App\Services\Foto;
use App\Services\Mayar;
use App\Services\Penilai;
use App\Services\Penjualan;
use App\Services\Sinkron;
use App\Services\Situs;
use App\Models\User;
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
 * - Tanpa login : masuk, lupaSandi, aturSandi (akun), infoNilai, kirimNilai (penilai QR), infoSitus,
 *   dan infoToko, pesanOnline, statusPesanan, kirimTestimoni (link pemesanan pembeli).
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

    public function handle(Request $request, Akun $akun, Sinkron $sinkron, Foto $foto, Penilai $penilai, Situs $situs, Penjualan $jual, Mayar $mayar): JsonResponse
    {
        $req = json_decode($request->getContent(), true);
        if (! is_array($req)) {
            return $this->keluar(['ok' => false, 'galat' => 'Permintaan tidak valid.']);
        }

        try {
            $aksi = is_string($req['aksi'] ?? null) ? $req['aksi'] : '';

            // Tampilan situs dari admin (logo, foto latar Login): terbuka, dipakai sebelum masuk.
            if ($aksi === 'infoSitus') {
                return $this->keluar(['ok' => true, ...$situs->tampilan()]);
            }

            // Penilai lewat QR: hanya butuh token tautan.
            if ($aksi === 'infoNilai') {
                return $this->keluar($penilai->info($req['token'] ?? null));
            }
            if ($aksi === 'kirimNilai') {
                return $this->keluar($penilai->kirim($req));
            }

            // Link pemesanan pembeli: hanya butuh token toko.
            if ($aksi === 'infoToko') {
                return $this->keluar($jual->infoToko($req['token'] ?? null));
            }
            if (in_array($aksi, ['pesanOnline', 'statusPesanan', 'kirimTestimoni'], true)) {
                $k = 'toko:'.$aksi.':'.$request->ip();
                $maks = match ($aksi) {
                    'pesanOnline' => (int) config('goodrecipes.pesanan_online_per_jam_per_ip'),
                    'kirimTestimoni' => 10,
                    default => 120,
                };
                if (RateLimiter::tooManyAttempts($k, $maks)) {
                    return $this->keluar(['ok' => false, 'galat' => 'Terlalu banyak permintaan. Coba lagi beberapa saat lagi.']);
                }
                RateLimiter::hit($k, 3600);

                return $this->keluar(match ($aksi) {
                    'pesanOnline' => $jual->pesanOnline($req),
                    'kirimTestimoni' => $jual->kirimTestimoni($req),
                    default => $jual->statusPesanan($req['token'] ?? null, $req['idPesanan'] ?? null),
                });
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

            // Aksi khusus akun dapur (pemilik usaha).
            $khususDapur = ['akunToko', 'buatAkunToko', 'ubahAkunToko', 'hapusAkunToko', 'infoMayar', 'aturMayar'];
            if ($user->adalahToko() && in_array($aksi, $khususDapur, true)) {
                return $this->keluar(['ok' => false, 'galat' => 'Hanya akun dapur yang bisa melakukan ini.']);
            }
            $toko = $user->adalahToko();

            return $this->keluar(match ($aksi) {
                'ping' => ['ok' => true, 'versi' => config('goodrecipes.versi'), 'pengguna' => $user->untukAplikasi()],
                'sinkron' => $sinkron->jalankan(
                    $user->idData(),
                    is_array($req['baris'] ?? null) ? $req['baris'] : [],
                    (int) ($req['sejak'] ?? 0),
                    $toko ? config('goodrecipes.tabel_toko_tulis') : null,
                    $toko ? config('goodrecipes.tabel_toko_baca') : null,
                ),
                'akunToko' => $akun->daftarToko($user),
                'buatAkunToko' => $akun->buatToko($user, $req['nama'] ?? '', $req['username'] ?? '', $req['kataSandi'] ?? ''),
                'ubahAkunToko' => $akun->ubahToko($user, $req['id'] ?? null, array_intersect_key($req, array_flip(['nama', 'aktif', 'kataSandi']))),
                'hapusAkunToko' => $akun->hapusToko($user, $req['id'] ?? null),
                'infoMayar' => $this->infoMayar($request, $user),
                'aturMayar' => $this->aturMayar($request, $user, $mayar, $req),
                'bayarMayar' => $jual->bayarMayarKasir($user, $req),
                'cekBayar' => $jual->cekBayar($user, $req['idPembayaran'] ?? null),
                'unggahFoto' => $toko ? ['ok' => false, 'galat' => 'Akun toko tidak bisa mengunggah foto.'] : ['ok' => true, 'url' => $foto->unggah(
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

    /** Webhook Mayar. Selalu menjawab 200 supaya Mayar tidak mengulang terus; status dicek ulang ke API Mayar. */
    public function webhookMayar(Request $request, string $token, Penjualan $jual): JsonResponse
    {
        try {
            $isi = json_decode($request->getContent(), true);
            $jual->webhook($token, is_array($isi) ? $isi : []);
        } catch (Throwable $e) {
            report($e);
        }

        return response()->json(['ok' => true]);
    }

    private function alamatWebhook(Request $request, User $user): string
    {
        return $user->token_webhook ? rtrim($request->getSchemeAndHttpHost(), '/').'/api/mayar/'.$user->token_webhook : '';
    }

    private function infoMayar(Request $request, User $user): array
    {
        return [
            'ok' => true,
            'aktif' => (string) $user->mayar_kunci !== '',
            'sandbox' => (bool) $user->mayar_sandbox,
            'webhook' => $this->alamatWebhook($request, $user),
        ];
    }

    /** Simpan / hapus kunci API Mayar akun dapur, lalu daftarkan alamat webhook ke Mayar. */
    private function aturMayar(Request $request, User $user, Mayar $mayar, array $req): array
    {
        if (! empty($req['hapus'])) {
            $user->forceFill(['mayar_kunci' => null])->save();

            return $this->infoMayar($request, $user) + ['pesan' => 'Pembayaran online dimatikan.'];
        }
        $kunci = is_string($req['kunciApi'] ?? null) ? trim($req['kunciApi']) : '';
        if (strlen($kunci) < 20 || strlen($kunci) > 2000 || preg_match('/\s/', $kunci)) {
            return ['ok' => false, 'galat' => 'Kunci API Mayar tidak valid. Salin dari menu Integrasi > API Key di dashboard Mayar.'];
        }
        $user->forceFill([
            'mayar_kunci' => $kunci,
            'mayar_sandbox' => ! empty($req['sandbox']),
            'token_webhook' => $user->token_webhook ?: Str::random(40),
        ])->save();
        $webhook = $this->alamatWebhook($request, $user);
        $terdaftar = $mayar->daftarWebhook($user, $webhook);

        return $this->infoMayar($request, $user) + [
            'webhookTerdaftar' => $terdaftar,
            'pesan' => $terdaftar
                ? 'Kunci Mayar tersimpan dan alamat webhook sudah didaftarkan.'
                : 'Kunci Mayar tersimpan, tetapi alamat webhook belum bisa didaftarkan otomatis. Tempel alamat webhook di dashboard Mayar (Integrasi > Webhook).',
        ];
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
