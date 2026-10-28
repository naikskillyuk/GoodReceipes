<?php

namespace App\Services;

use Illuminate\Support\Facades\Cache;
use Illuminate\Support\Facades\DB;
use RuntimeException;

/**
 * Sinkronisasi baris dengan aplikasi.
 *
 * Aturan: baris hanya menimpa bila `diubah`-nya lebih baru
 * daripada yang tersimpan; jawaban berisi semua baris yang `diubah`-nya lewat dari `sejak`.
 */
class Sinkron
{
    /** Hanya satu sinkron/penilaian yang menulis ke data satu akun pada satu waktu. */
    public static function denganKunci(int $idPengguna, callable $fn): mixed
    {
        return Cache::lock('goodrecipes-tulis-'.$idPengguna, 30)->block(25, $fn);
    }

    /**
     * Semua baca/tulis dibatasi pada data milik akun $idPengguna (pemilik data usaha).
     * $tulis / $baca: daftar tabel yang boleh (akun toko), null = semua tabel (akun dapur).
     */
    public function jalankan(int $idPengguna, array $masuk, int $sejak, ?array $tulis = null, ?array $baca = null): array
    {
        $semua = array_keys(Skema::tabel());
        $tabelTulis = $tulis === null ? $semua : array_values(array_intersect($semua, $tulis));
        $tabelBaca = $baca === null ? $semua : array_values(array_intersect($semua, $baca));
        $jumlah = 0;
        foreach ($semua as $tabel) {
            $jumlah += is_array($masuk[$tabel] ?? null) ? count($masuk[$tabel]) : 0;
        }
        if ($jumlah > config('goodrecipes.maks_baris_per_permintaan')) {
            throw new RuntimeException('Terlalu banyak baris dalam satu permintaan.');
        }

        return self::denganKunci($idPengguna, function () use ($idPengguna, $masuk, $sejak, $tabelTulis, $tabelBaca) {
            DB::transaction(function () use ($idPengguna, $masuk, $tabelTulis) {
                foreach ($tabelTulis as $tabel) {
                    if (! empty($masuk[$tabel]) && is_array($masuk[$tabel])) {
                        $this->tulis($idPengguna, $tabel, $masuk[$tabel]);
                    }
                }
            });

            $keluar = [];
            foreach ($tabelBaca as $tabel) {
                $baru = DB::table(Skema::namaDb($tabel))->where('id_pengguna', $idPengguna)->where('diubah', '>', $sejak)->get()
                    ->map(fn ($r) => Skema::dariDb($tabel, $r))->all();
                if ($baru) {
                    $keluar[$tabel] = $baru;
                }
            }

            return ['ok' => true, 'waktuServer' => (int) floor(microtime(true) * 1000), 'baris' => (object) $keluar];
        });
    }

    /** Tambah atau perbarui baris (yang lebih baru menang). */
    public function tulis(int $idPengguna, string $tabel, array $daftar): void
    {
        $namaDb = Skema::namaDb($tabel);
        $bersih = [];
        foreach ($daftar as $r) {
            if (! is_array($r)) {
                continue;
            }
            $id = isset($r['id']) && is_scalar($r['id']) ? (string) $r['id'] : '';
            if ($id === '' || strlen($id) > 100) {
                continue;
            }
            $r['id'] = $id;
            // Bila id sama muncul dua kali, ambil yang paling baru.
            if (! isset($bersih[$id]) || (int) ($r['diubah'] ?? 0) > (int) ($bersih[$id]['diubah'] ?? 0)) {
                $bersih[$id] = $r;
            }
        }
        if (! $bersih) {
            return;
        }

        $ada = [];
        foreach (array_chunk(array_keys($bersih), 500) as $potong) {
            $ada += DB::table($namaDb)->where('id_pengguna', $idPengguna)->whereIn('id', $potong)->lockForUpdate()->pluck('diubah', 'id')->all();
        }

        $sisipan = [];
        foreach ($bersih as $id => $r) {
            $data = Skema::keDb($tabel, $r);
            if (array_key_exists($id, $ada)) {
                if ((int) ($r['diubah'] ?? 0) > (int) $ada[$id]) {
                    unset($data['id']);
                    DB::table($namaDb)->where('id_pengguna', $idPengguna)->where('id', $id)->update($data);
                }
            } else {
                $sisipan[] = ['id_pengguna' => $idPengguna] + $data;
            }
        }

        // Baris baru disisipkan berkelompok menurut susunan kolomnya.
        $kelompok = [];
        foreach ($sisipan as $data) {
            $kelompok[implode(',', array_keys($data))][] = $data;
        }
        foreach ($kelompok as $baris) {
            foreach (array_chunk($baris, 200) as $potong) {
                DB::table($namaDb)->insert($potong);
            }
        }
    }
}
