<?php

namespace App\Services;

use Illuminate\Support\Facades\DB;

/**
 * Aksi untuk penilai yang membuka kode QR (tanpa login, hanya dengan token).
 * Penilai hanya bisa membaca nama resep, nomor eksperimen, dan foto hasil, serta mengirim penilaian.
 */
class Penilai
{
    private const ASPEK = ['rasa', 'tekstur', 'tampilan', 'aroma', 'minatBeli'];

    public function info(mixed $token): array
    {
        $e = $this->eksperimenDariToken($token);
        if (! $e) {
            return ['ok' => false, 'galat' => 'Tautan penilaian tidak ditemukan atau sudah tidak berlaku.'];
        }
        // Resep dan merek diambil dari akun pemilik eksperimen itu saja.
        $resep = DB::table('resep')->where('id_pengguna', $e->id_pengguna)->where('id', $e->id_resep)->where('dihapus', false)->first();
        $merek = DB::table('setelan')->where('id_pengguna', $e->id_pengguna)->where('id', 'stl_merek')->where('dihapus', false)->first();

        return [
            'ok' => true,
            'namaResep' => $resep ? (string) $resep->nama : 'Resep',
            'nomor' => (int) ($e->nomor ?? 0),
            'fotoUrl' => (string) ($e->foto_hasil_url ?? ''),
            'terima' => $this->benar($e->terima_nilai, true),
            'wajibNama' => $this->benar($e->wajib_nama, false),
            'namaAplikasi' => $merek ? (string) ($merek->nama_aplikasi ?? '') : '',
            // Logo pemilik, atau logo situs dari admin bila pemilik belum memasang logo sendiri.
            'logoUrl' => ($merek ? (string) ($merek->logo_url ?? '') : '') ?: app(Situs::class)->tampilan()['logoUrl'],
            'panduan' => (object) $this->panduan($e->panduan_nilai ?? null),
            'catatanChef' => mb_substr(trim((string) ($e->catatan_chef ?? '')), 0, 1000),
        ];
    }

    /** Petunjuk penilaian dari pemilik: hanya kunci yang dikenal, berupa teks, dipotong. */
    private function panduan(mixed $v): array
    {
        $o = is_string($v) ? json_decode($v, true) : (array) $v;
        $keluar = [];
        foreach (['umum', ...self::ASPEK] as $k) {
            $teks = is_array($o) && is_string($o[$k] ?? null) ? trim($o[$k]) : '';
            if ($teks !== '') {
                $keluar[$k] = mb_substr($teks, 0, $k === 'umum' ? 500 : 200);
            }
        }

        return $keluar;
    }

    public function kirim(array $req): array
    {
        $e = $this->eksperimenDariToken($req['token'] ?? null);
        if (! $e) {
            return ['ok' => false, 'galat' => 'Tautan penilaian tidak ditemukan atau sudah tidak berlaku.'];
        }
        if (! $this->benar($e->terima_nilai, true)) {
            return ['ok' => false, 'galat' => 'Penilaian untuk eksperimen ini sudah ditutup.'];
        }
        $nama = $this->bersihkan($req['nama'] ?? '', 60);
        if ($this->benar($e->wajib_nama, false) && $nama === '') {
            return ['ok' => false, 'galat' => 'Nama wajib diisi.'];
        }
        $nilai = [];
        foreach (self::ASPEK as $a) {
            $n = $req[$a] ?? null;
            if (! is_numeric($n) || (float) $n != (int) $n || $n < 1 || $n > 10) {
                return ['ok' => false, 'galat' => 'Nilai harus bilangan bulat 1 sampai 10.'];
            }
            $nilai[$a] = (int) $n;
        }
        $komentar = $this->bersihkan($req['komentar'] ?? '', 1000);

        return Sinkron::denganKunci((int) $e->id_pengguna, function () use ($e, $nama, $nilai, $komentar) {
            $sudah = DB::table('penilaian')->where('id_pengguna', $e->id_pengguna)->where('id_eksperimen', $e->id)->count();
            if ($sudah >= config('goodrecipes.maks_nilai_per_eksperimen')) {
                return ['ok' => false, 'galat' => 'Batas jumlah penilaian tercapai.'];
            }
            $sekarang = (int) floor(microtime(true) * 1000);
            DB::table('penilaian')->insert(['id_pengguna' => $e->id_pengguna] + Skema::keDb('Penilaian', [
                'id' => 'nil_'.bin2hex(random_bytes(7)),
                'idEksperimen' => $e->id,
                'namaPenilai' => $nama,
                ...$nilai,
                'komentar' => $komentar,
                'waktu' => $sekarang,
                'dariPemilik' => false,
                'diubah' => $sekarang,
                'dihapus' => false,
            ]));

            return ['ok' => true];
        });
    }

    private function eksperimenDariToken(mixed $token): ?object
    {
        $t = is_scalar($token) ? (string) $token : '';
        if (strlen($t) < 10 || strlen($t) > 100) {
            return null;
        }
        $baris = DB::table('eksperimen')->where('token_nilai', $t)->where('dihapus', false)->first();
        if (! $baris || ! hash_equals((string) $baris->token_nilai, $t)) {
            return null;
        }

        return $baris;
    }

    /** Kosong -> bawaan. */
    private function benar(mixed $v, bool $bawaan): bool
    {
        return $v === null || $v === '' ? $bawaan : Skema::bool($v);
    }

    /** Teks dari orang lain: potong dan buang karakter kontrol. */
    private function bersihkan(mixed $v, int $maks): string
    {
        $t = is_scalar($v) ? (string) $v : '';
        $t = preg_replace('/[\x00-\x08\x0B\x0C\x0E-\x1F]/u', '', $t) ?? '';

        return mb_substr(trim($t), 0, $maks);
    }
}
