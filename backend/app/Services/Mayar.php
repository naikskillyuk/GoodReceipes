<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\Http;
use RuntimeException;
use Throwable;

/**
 * Payment gateway Mayar (API v2, https://docs.mayar.id/api-reference-v2).
 * Setiap akun dapur memakai kunci API Mayar miliknya sendiri; uang masuk ke akun Mayar pemilik usaha.
 *
 * Status lunas tidak pernah dipercaya dari isi webhook saja: server selalu menanyakan ulang ke Mayar
 * (GET /payments/{id}) sebelum menandai pembayaran lunas.
 */
class Mayar
{
    public function siap(User $dapur): bool
    {
        return (string) $dapur->mayar_kunci !== '';
    }

    private function dasar(User $dapur): string
    {
        return config('goodrecipes.mayar.'.($dapur->mayar_sandbox ? 'sandbox' : 'produksi'));
    }

    private function http(User $dapur)
    {
        if (! $this->siap($dapur)) {
            throw new RuntimeException('Pembayaran online belum diatur. Isi kunci API Mayar di Pengaturan akun dapur.');
        }

        return Http::withToken((string) $dapur->mayar_kunci)->acceptJson()->timeout(20);
    }

    /**
     * Buat link pembayaran. Mengembalikan ['id' => ..., 'link' => ...].
     *
     * @param  array{nama: string, jumlah: int, keterangan: string, hp?: string, email?: string, kembaliKe?: string}  $isi
     */
    public function buat(User $dapur, array $isi): array
    {
        $body = [
            'name' => mb_substr($isi['nama'] ?: 'Pembeli', 0, 100),
            'amount' => (int) $isi['jumlah'],
            'description' => mb_substr($isi['keterangan'], 0, 250),
            'expiredAt' => now()->addMinutes((int) config('goodrecipes.mayar.menit_berlaku'))->utc()->format('Y-m-d\TH:i:s.v\Z'),
        ];
        if (! empty($isi['hp'])) {
            $body['mobile'] = $isi['hp'];
        }
        if (! empty($isi['email'])) {
            $body['email'] = $isi['email'];
        }
        if (! empty($isi['kembaliKe'])) {
            $body['redirectUrl'] = $isi['kembaliKe'];
        }
        try {
            $res = $this->http($dapur)->post($this->dasar($dapur).'/payments/create', $body);
        } catch (RuntimeException $e) {
            throw $e;
        } catch (Throwable $e) {
            report($e);
            throw new RuntimeException('Mayar tidak bisa dihubungi. Coba lagi sebentar.');
        }
        $data = $res->json('data');
        if (! $res->successful() || ! is_array($data) || empty($data['id']) || empty($data['link'])) {
            $pesan = is_string($res->json('messages')) ? $res->json('messages') : 'HTTP '.$res->status();
            if ($res->status() === 401 || $res->status() === 403) {
                $pesan = 'kunci API Mayar ditolak. Periksa kunci di Pengaturan (Read & Write, dan mode sandbox/produksi yang sesuai)';
            }
            throw new RuntimeException('Link pembayaran Mayar gagal dibuat: '.$pesan.'.');
        }

        return ['id' => (string) $data['id'], 'link' => (string) $data['link']];
    }

    /** Status pembayaran di Mayar: 'paid' | 'unpaid' | 'closed' | ... , atau null bila gagal ditanyakan. */
    public function status(User $dapur, string $idMayar): ?string
    {
        if (! $this->siap($dapur) || ! preg_match('/^[A-Za-z0-9-]{8,100}$/', $idMayar)) {
            return null;
        }
        try {
            $res = $this->http($dapur)->get($this->dasar($dapur).'/payments/'.$idMayar);
        } catch (Throwable $e) {
            report($e);

            return null;
        }
        $status = $res->successful() ? $res->json('data.status') : null;

        return is_string($status) ? strtolower($status) : null;
    }

    /** Daftarkan alamat webhook ke akun Mayar. Mengembalikan true bila berhasil. */
    public function daftarWebhook(User $dapur, string $url): bool
    {
        try {
            return $this->http($dapur)->post($this->dasar($dapur).'/webhooks/update', ['urlHook' => $url])->successful();
        } catch (Throwable $e) {
            report($e);

            return false;
        }
    }
}
