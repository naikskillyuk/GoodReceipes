<?php

namespace App\Services;

use App\Models\User;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Str;
use RuntimeException;

/**
 * Penjualan di server: link pemesanan pembeli (tanpa login), pembayaran Mayar, dan pemotongan stok
 * makanan saat pesanan online lunas. Aturan hitungnya sama dengan js/lib/toko.js:
 * - stok makanan = jumlah mutasi_makanan per resep
 * - menu paket memotong stok setiap resep isinya
 * - baris mutasi penjualan memakai id tetap "mmk_{idPesanan}_{idResep}" sehingga tidak pernah terpotong dua kali
 * - pelanggan memakai id tetap "plg_{nomor WhatsApp}"
 */
class Penjualan
{
    public function __construct(private Mayar $mayar) {}

    // ---------- Bantu baca/tulis baris data akun ----------

    private function semua(int $id, string $tabel, ?callable $saring = null): array
    {
        $baris = DB::table(Skema::namaDb($tabel))->where('id_pengguna', $id)->where('dihapus', false)->get()
            ->map(fn ($r) => Skema::dariDb($tabel, $r))->all();

        return $saring ? array_values(array_filter($baris, $saring)) : $baris;
    }

    private function ambil(int $id, string $tabel, string $idBaris): ?array
    {
        $r = DB::table(Skema::namaDb($tabel))->where('id_pengguna', $id)->where('id', $idBaris)->first();

        return $r ? Skema::dariDb($tabel, $r) : null;
    }

    /** Simpan baris dari server (diubah = sekarang) supaya ikut terkirim ke semua perangkat. */
    private function simpan(int $id, string $tabel, array $baris): array
    {
        $lama = DB::table(Skema::namaDb($tabel))->where('id_pengguna', $id)->where('id', $baris['id'])->first();
        $baris['diubah'] = max(self::sekarang(), $lama ? (int) $lama->diubah + 1 : 0);
        $baris['dihapus'] = $baris['dihapus'] ?? false;
        $data = Skema::keDb($tabel, $baris);
        if ($lama) {
            unset($data['id']);
            DB::table(Skema::namaDb($tabel))->where('id_pengguna', $id)->where('id', $baris['id'])->update($data);
        } else {
            DB::table(Skema::namaDb($tabel))->insert(['id_pengguna' => $id] + $data);
        }

        return $this->ambil($id, $tabel, $baris['id']);
    }

    public static function sekarang(): int
    {
        return (int) floor(microtime(true) * 1000);
    }

    // ---------- Stok ----------

    /** Stok makanan per resep: [idResep => jumlah]. */
    public function stokMakanan(int $id): array
    {
        return DB::table('mutasi_makanan')->where('id_pengguna', $id)->where('dihapus', false)
            ->groupBy('id_resep')->selectRaw('id_resep, sum(jumlah) as total')->pluck('total', 'id_resep')
            ->map(fn ($v) => (float) $v)->all();
    }

    /** Resep yang terpakai oleh sebuah menu: [idResep => jumlah per 1 menu]. */
    private function isiMenu(int $id, array $menu, array $isiPaket): array
    {
        if (($menu['jenis'] ?? '') === 'paket') {
            $hasil = [];
            foreach ($isiPaket[$menu['idRef']] ?? [] as $i) {
                $hasil[$i['idResep']] = ($hasil[$i['idResep']] ?? 0) + (float) ($i['jumlah'] ?: 1);
            }

            return $hasil;
        }

        return $menu['idRef'] ? [$menu['idRef'] => 1.0] : [];
    }

    private function petaIsiPaket(int $id): array
    {
        $peta = [];
        foreach ($this->semua($id, 'IsiPaket') as $i) {
            $peta[$i['idPaket']][] = $i;
        }

        return $peta;
    }

    /** Berapa porsi/paket menu ini yang masih bisa dijual dari stok. null = tidak dilacak. */
    private function sisaMenu(array $isi, array $stok): ?float
    {
        if (! $isi) {
            return null;
        }
        $sisa = INF;
        foreach ($isi as $idResep => $per) {
            $sisa = min($sisa, floor(max(0, $stok[$idResep] ?? 0) / max($per, 0.0001)));
        }

        return $sisa;
    }

    /** Kebutuhan resep untuk daftar item pesanan: [idResep => jumlah]. */
    private function kebutuhan(int $id, array $item): array
    {
        $menu = [];
        foreach ($this->semua($id, 'Menu') as $m) {
            $menu[$m['id']] = $m;
        }
        $isiPaket = $this->petaIsiPaket($id);
        $butuh = [];
        foreach ($item as $it) {
            $m = $menu[$it['idMenu'] ?? ''] ?? null;
            if (! $m) {
                continue;
            }
            foreach ($this->isiMenu($id, $m, $isiPaket) as $idResep => $per) {
                $butuh[$idResep] = ($butuh[$idResep] ?? 0) + $per * (float) $it['jumlah'];
            }
        }

        return $butuh;
    }

    /** Potong stok makanan untuk pesanan (id baris tetap, jadi aman bila dipanggil lagi). */
    public function potongStok(int $id, array $pesanan): void
    {
        foreach ($this->kebutuhan($id, $pesanan['item'] ?? []) as $idResep => $jumlah) {
            $idMutasi = 'mmk_'.$pesanan['id'].'_'.$idResep;
            if (DB::table('mutasi_makanan')->where('id_pengguna', $id)->where('id', $idMutasi)->exists()) {
                continue;
            }
            $this->simpan($id, 'MutasiMakanan', [
                'id' => $idMutasi, 'idResep' => $idResep, 'jumlah' => -$jumlah, 'jenis' => 'jual',
                'idRef' => $pesanan['id'], 'catatan' => 'Pesanan #'.$pesanan['nomor'], 'waktu' => self::sekarang(),
            ]);
        }
    }

    // ---------- Pelanggan dan promo ----------

    /** Nomor WhatsApp -> hanya angka diawali 62, atau '' bila tidak sah. */
    public static function hp(mixed $v): string
    {
        $d = preg_replace('/\D/', '', is_scalar($v) ? (string) $v : '') ?? '';
        if (str_starts_with($d, '0')) {
            $d = '62'.substr($d, 1);
        } elseif (str_starts_with($d, '8')) {
            $d = '62'.$d;
        }

        return preg_match('/^62\d{8,13}$/', $d) ? $d : '';
    }

    /** Pelanggan "lama" = sudah pernah punya pesanan yang tidak batal dan bukan sekadar menunggu bayar. */
    private function pelangganLama(int $id, string $idPelanggan, string $kecuali = ''): bool
    {
        return DB::table('pesanan')->where('id_pengguna', $id)->where('dihapus', false)->where('id_pelanggan', $idPelanggan)
            ->where('id', '!=', $kecuali)->whereNotIn('status', ['batal', 'menunggu'])->exists();
    }

    /**
     * Diskon dari kode promo. Mengembalikan [diskon, promo|null, galat].
     * Aturan sama dengan hitungPromo() di js/lib/toko.js.
     */
    public function promo(int $id, string $kode, float $subtotal, string $idPelanggan, bool $online): array
    {
        $kode = Str::upper(trim($kode));
        if ($kode === '') {
            return [0, null, ''];
        }
        $p = $this->semua($id, 'Promo', fn ($r) => Str::upper(trim((string) $r['kode'])) === $kode)[0] ?? null;
        $sekarang = self::sekarang();
        $galat = match (true) {
            ! $p || ! $p['aktif'] => 'Kode promo tidak ditemukan.',
            $online && ! $p['online'] => 'Kode promo ini hanya berlaku di toko.',
            $p['mulai'] && $sekarang < $p['mulai'] => 'Promo ini belum dimulai.',
            $p['sampai'] && $sekarang > $p['sampai'] => 'Promo ini sudah berakhir.',
            $p['minBelanja'] > 0 && $subtotal < $p['minBelanja'] => 'Minimal belanja untuk promo ini Rp '.number_format($p['minBelanja'], 0, ',', '.').'.',
            default => '',
        };
        if (! $galat && in_array($p['untuk'], ['baru', 'lama'], true)) {
            $lama = $idPelanggan !== '' && $this->pelangganLama($id, $idPelanggan);
            if ($p['untuk'] === 'baru' && $lama) {
                $galat = 'Promo ini khusus pelanggan baru.';
            } elseif ($p['untuk'] === 'lama' && ! $lama) {
                $galat = 'Promo ini khusus pelanggan yang sudah pernah memesan.';
            }
        }
        if (! $galat && $p['kuota'] > 0) {
            $dipakai = DB::table('pesanan')->where('id_pengguna', $id)->where('dihapus', false)
                ->whereRaw('upper(kode_promo) = ?', [$kode])->whereNotIn('status', ['batal', 'menunggu'])->count();
            if ($dipakai >= $p['kuota']) {
                $galat = 'Kuota promo ini sudah habis.';
            }
        }
        if ($galat) {
            return [0, null, $galat];
        }
        $diskon = $p['jenis'] === 'persen' ? floor($subtotal * (float) $p['nilai'] / 100) : (float) $p['nilai'];
        if ($p['jenis'] === 'persen' && $p['maksDiskon'] > 0) {
            $diskon = min($diskon, (float) $p['maksDiskon']);
        }

        return [max(0, min($subtotal, $diskon)), $p, ''];
    }

    /** Diskon produk yang berlaku (persen). Sama dengan diskonBerlaku di js/lib/toko.js. */
    public static function diskonBerlaku(array $m): float
    {
        $d = max(0.0, min(90.0, (float) ($m['diskon'] ?? 0)));
        $sampai = (int) ($m['diskonSampai'] ?? 0);

        return $d > 0 && (! $sampai || self::sekarang() <= $sampai) ? $d : 0.0;
    }

    /** Harga jual setelah diskon produk, dibulatkan ke Rp 100. */
    public static function hargaJual(array $m): float
    {
        $harga = (float) ($m['harga'] ?? 0);
        $d = self::diskonBerlaku($m);

        return $d > 0 ? max(0.0, round($harga * (100 - $d) / 100 / 100) * 100) : $harga;
    }

    /** Pilihan tambahan berbayar menu: [{nama, harga}]. Sama dengan opsiMenu di js/lib/toko.js. */
    public static function opsiMenu(array $m): array
    {
        $hasil = [];
        $lihat = [];
        foreach (is_array($m['opsi'] ?? null) ? $m['opsi'] : [] as $o) {
            $nama = is_array($o) ? mb_substr(trim((string) ($o['nama'] ?? '')), 0, 40) : '';
            if ($nama === '' || isset($lihat[mb_strtolower($nama)])) {
                continue;
            }
            $lihat[mb_strtolower($nama)] = true;
            $hasil[] = ['nama' => $nama, 'harga' => max(0, (int) round((float) ($o['harga'] ?? 0)))];
        }

        return array_slice($hasil, 0, 12);
    }

    /** Banner informasi aktif untuk etalase, urut tampil. */
    private function bannerEtalase(int $id): array
    {
        // Banner berjudul, atau banner gambar saja (tanpa judul) yang gambarnya sudah terunggah.
        $daftar = $this->semua($id, 'Banner', fn ($b) => $b['aktif'] && in_array($b['tampilDi'] ?: 'etalase', ['etalase', 'semua'], true)
            && (trim((string) $b['judul']) !== '' || str_starts_with((string) $b['fotoUrl'], 'http')));
        usort($daftar, fn ($a, $b) => ((float) $a['urutan']) <=> ((float) $b['urutan']));

        return array_map(fn ($b) => [
            'judul' => mb_substr((string) $b['judul'], 0, 60),
            'teks' => mb_substr((string) $b['teks'], 0, 160),
            'fotoUrl' => str_starts_with((string) $b['fotoUrl'], 'http') ? (string) $b['fotoUrl'] : '',
            'warna' => (string) ($b['warna'] ?: 'hijau'),
            'tombol' => mb_substr((string) $b['tombol'], 0, 30),
            'aksi' => (string) $b['aksi'],
            'nilai' => mb_substr((string) $b['nilai'], 0, 300),
        ], array_slice($daftar, 0, 8));
    }

    /** Promo yang sedang berlaku di link pemesanan, untuk banner etalase (tanpa info kuota). */
    private function promoTampil(int $id): array
    {
        $sekarang = self::sekarang();
        $daftar = $this->semua($id, 'Promo', fn ($p) => $p['aktif'] && $p['online'] && trim((string) $p['kode']) !== ''
            && (! $p['mulai'] || $p['mulai'] <= $sekarang) && (! $p['sampai'] || $p['sampai'] >= $sekarang));

        return array_map(fn ($p) => [
            'kode' => Str::upper(trim((string) $p['kode'])),
            'nama' => mb_substr((string) $p['nama'], 0, 60),
            'jenis' => $p['jenis'] === 'persen' ? 'persen' : 'rupiah',
            'nilai' => (float) $p['nilai'],
            'minBelanja' => (float) $p['minBelanja'],
            'maksDiskon' => (float) $p['maksDiskon'],
            'untuk' => (string) ($p['untuk'] ?: 'semua'),
            'sampai' => (int) ($p['sampai'] ?: 0),
        ], array_slice($daftar, 0, 6));
    }

    // ---------- Link pemesanan pembeli (tanpa login) ----------

    /** Baris setelan toko dari token link, beserta id pemilik data. */
    /**
     * Toko dari token link pemesanan. Tanpa token = toko utama di halaman depan situs:
     * akun dengan email TOKO_UTAMA_EMAIL bila diisi, selain itu toko pertama yang sudah mengaktifkan toko online.
     */
    /** Id akun admin pemilik toko utama (yang tampil di halaman depan), atau null bila belum ada. */
    public function idTokoUtama(): ?int
    {
        return $this->tokoDariToken('')['idData'] ?? null;
    }

    private function tokoDariToken(mixed $token): ?array
    {
        $t = is_string($token) ? $token : '';
        if ($t === '') {
            $q = DB::table('setelan')->where('id', 'stl_toko')->where('dihapus', false)->whereNotNull('token_toko')->where('token_toko', '!=', '');
            $email = (string) config('goodrecipes.toko_utama_email');
            if ($email !== '') {
                $q->whereIn('id_pengguna', User::where('email', $email)->select('id'));
            }
            $r = $q->orderByDesc('toko_buka')->orderBy('id_pengguna')->first();

            return $r ? ['idData' => (int) $r->id_pengguna, 'setelan' => Skema::dariDb('Setelan', $r)] : null;
        }
        if (strlen($t) < 10 || strlen($t) > 100) {
            return null;
        }
        $r = DB::table('setelan')->where('token_toko', $t)->where('dihapus', false)->first();

        return $r ? ['idData' => (int) $r->id_pengguna, 'setelan' => Skema::dariDb('Setelan', $r)] : null;
    }

    private function dapur(int $idData): User
    {
        return User::findOrFail($idData);
    }

    /** Rekening bank dan foto QRIS untuk pembayaran manual. */
    private function bayarManual(array $s): array
    {
        $rekening = [];
        foreach (is_array($s['rekening'] ?? null) ? $s['rekening'] : [] as $r) {
            if (is_array($r) && trim((string) ($r['bank'] ?? '')) !== '' && trim((string) ($r['nomor'] ?? '')) !== '') {
                $rekening[] = [
                    'bank' => mb_substr(trim((string) $r['bank']), 0, 40),
                    'nomor' => mb_substr(trim((string) $r['nomor']), 0, 40),
                    'atasNama' => mb_substr(trim((string) ($r['atasNama'] ?? '')), 0, 60),
                ];
            }
        }
        $qris = (string) ($s['qrisUrl'] ?? '');

        return ['rekening' => array_slice($rekening, 0, 5), 'qrisUrl' => str_starts_with($qris, 'http') ? $qris : ''];
    }

    private function adaBayarManual(array $manual): bool
    {
        return $manual['rekening'] !== [] || $manual['qrisUrl'] !== '';
    }

    /** Mayar dipakai bila diaktifkan admin dan kuncinya sudah diisi. */
    private function pakaiMayar(array $s, User $dapur): bool
    {
        return (bool) ($s['pakaiMayar'] ?? false) && $this->mayar->siap($dapur);
    }

    public function infoToko(mixed $token): array
    {
        $toko = $this->tokoDariToken($token);
        if (! $toko) {
            return ['ok' => false, 'galat' => is_string($token) && $token !== '' ? 'Link pemesanan tidak ditemukan atau sudah diganti.' : 'Toko online belum diaktifkan. Admin bisa mengaktifkannya di Pengaturan → Toko online.'];
        }
        $id = $toko['idData'];
        $s = $toko['setelan'];
        $stok = $this->stokMakanan($id);
        $isiPaket = $this->petaIsiPaket($id);
        // Kategori etalase: paket = "Paket", resep = nama kategori resepnya.
        $namaKat = [];
        foreach ($this->semua($id, 'Kategori') as $kat) {
            $namaKat[$kat['id']] = (string) $kat['nama'];
        }
        $katResep = [];
        $fotoResep = [];
        foreach ($this->semua($id, 'Resep') as $r) {
            $katResep[$r['id']] = $namaKat[$r['idKategori']] ?? '';
            $fotoResep[$r['id']] = (string) ($r['fotoAcuanUrl'] ?? '');
        }
        // Foto paket: foto paket sendiri, atau foto resep isi pertamanya.
        $fotoPaket = [];
        foreach ($this->semua($id, 'Paket') as $p) {
            $isiPertama = $isiPaket[$p['id']][0]['idResep'] ?? '';
            $fotoPaket[$p['id']] = (string) (($p['fotoUrl'] ?? '') ?: ($fotoResep[$isiPertama] ?? ''));
        }
        $menu = [];
        foreach ($this->semua($id, 'Menu', fn ($m) => $m['aktif'] && $m['online']) as $m) {
            $menu[] = [
                'kategori' => $m['jenis'] === 'paket' ? 'Paket' : (($katResep[$m['idRef']] ?? '') ?: 'Lainnya'),
                'id' => $m['id'],
                'nama' => (string) $m['nama'],
                'harga' => self::hargaJual($m),
                'hargaAsli' => (float) $m['harga'],
                'diskon' => self::diskonBerlaku($m),
                'opsi' => self::opsiMenu($m),
                // Foto menu sendiri, atau foto paket / foto acuan resep.
                'fotoUrl' => (string) ($m['fotoUrl'] ?: ($m['jenis'] === 'paket' ? ($fotoPaket[$m['idRef']] ?? '') : ($fotoResep[$m['idRef']] ?? ''))),
                'keterangan' => mb_substr((string) $m['keterangan'], 0, 300),
                'sisa' => $this->sisaMenu($this->isiMenu($id, $m, $isiPaket), $stok),
                'urutan' => (float) ($m['urutan'] ?? 0),
            ];
        }
        usort($menu, fn ($a, $b) => $a['urutan'] <=> $b['urutan']);
        $merek = $this->ambil($id, 'Setelan', 'stl_merek');
        $mayar = $this->pakaiMayar($s, $this->dapur($id));
        $manual = $this->bayarManual($s);

        return [
            'ok' => true,
            'namaToko' => (string) ($s['namaToko'] ?: ($merek['namaAplikasi'] ?? '') ?: config('app.name', 'Toko')),
            'logoUrl' => (string) (($merek['logoUrl'] ?? '') ?: app(Situs::class)->tampilan()['logoUrl']),
            'buka' => (bool) $s['tokoBuka'],
            'alamat' => (string) $s['alamatToko'],
            'wa' => (string) $s['waToko'],
            'catatan' => mb_substr((string) $s['catatanToko'], 0, 500),
            'bayarOnline' => $mayar || $this->adaBayarManual($manual),
            'mayar' => $mayar,
            'bayarManual' => $mayar ? null : $manual,
            'testimoni' => $this->testimoniTampil($id),
            'promo' => $this->promoTampil($id),
            'banner' => $this->bannerEtalase($id),
            'headerUrl' => str_starts_with((string) ($s['headerUrl'] ?? ''), 'http') ? (string) $s['headerUrl'] : '',
            'latarUrl' => app(Situs::class)->tampilan()['latarUrl'],
            'menu' => $menu,
        ];
    }

    /** Pembeli memesan lewat link: pesanan "menunggu" + link bayar Mayar. Stok dipotong setelah lunas. */
    public function pesanOnline(array $req): array
    {
        $toko = $this->tokoDariToken($req['token'] ?? null);
        if (! $toko) {
            return ['ok' => false, 'galat' => 'Link pemesanan tidak ditemukan atau sudah diganti.'];
        }
        $id = $toko['idData'];
        if (! $toko['setelan']['tokoBuka']) {
            return ['ok' => false, 'galat' => 'Maaf, toko sedang tutup.'];
        }
        $dapur = $this->dapur($id);
        $mayar = $this->pakaiMayar($toko['setelan'], $dapur);
        if (! $mayar && ! $this->adaBayarManual($this->bayarManual($toko['setelan']))) {
            return ['ok' => false, 'galat' => 'Toko ini belum bisa menerima pembayaran online.'];
        }
        $nama = $this->teks($req['nama'] ?? '', 60);
        $hp = self::hp($req['hp'] ?? '');
        if (mb_strlen($nama) < 2) {
            return ['ok' => false, 'galat' => 'Isi nama Anda.'];
        }
        if ($hp === '') {
            return ['ok' => false, 'galat' => 'Isi nomor WhatsApp yang benar, mis. 0812xxxxxxx.'];
        }
        // Cara ambil: diambil sendiri atau ojek online yang dipesan pembeli sendiri, beserta jam ambilnya.
        // Boleh kosong untuk halaman lama yang belum punya pilihan ini.
        $caraAmbil = in_array($req['caraAmbil'] ?? '', ['ambil', 'ojol'], true) ? $req['caraAmbil'] : '';
        $jadwal = is_numeric($req['jadwal'] ?? null) ? (int) $req['jadwal'] : 0;
        if ($caraAmbil !== '') {
            $kini = self::sekarang();
            if ($jadwal < $kini - 15 * 60 * 1000) {
                return ['ok' => false, 'galat' => 'Pilih jam ambil yang belum lewat.'];
            }
            if ($jadwal > $kini + 60 * 24 * 60 * 60 * 1000) {
                return ['ok' => false, 'galat' => 'Jam ambil paling lambat 60 hari dari sekarang.'];
            }
        } else {
            $jadwal = 0;
        }

        // Item: harga selalu dari menu di server, bukan dari pembeli.
        $menu = [];
        foreach ($this->semua($id, 'Menu', fn ($m) => $m['aktif'] && $m['online']) as $m) {
            $menu[$m['id']] = $m;
        }
        $masuk = is_array($req['item'] ?? null) ? $req['item'] : [];
        if (! $masuk || count($masuk) > config('goodrecipes.maks_item_pesanan')) {
            return ['ok' => false, 'galat' => 'Pilih menu yang ingin dipesan.'];
        }
        $item = [];
        $subtotal = 0;
        foreach ($masuk as $it) {
            $m = $menu[is_array($it) && is_string($it['idMenu'] ?? null) ? $it['idMenu'] : ''] ?? null;
            $jumlah = is_array($it) && is_numeric($it['jumlah'] ?? null) ? (int) $it['jumlah'] : 0;
            if (! $m || $jumlah < 1 || $jumlah > config('goodrecipes.maks_jumlah_per_item')) {
                return ['ok' => false, 'galat' => 'Ada menu yang sudah tidak tersedia. Muat ulang halaman.'];
            }
            // Pilihan tambahan: hanya yang memang ada di menu, harganya dari server.
            $mau = array_map(fn ($x) => mb_strtolower(trim((string) $x)), is_array($it['opsi'] ?? null) ? array_filter($it['opsi'], 'is_string') : []);
            $opsi = array_values(array_filter(self::opsiMenu($m), fn ($o) => in_array(mb_strtolower($o['nama']), $mau, true)));
            if (count($opsi) !== count(array_unique($mau))) {
                return ['ok' => false, 'galat' => 'Ada pilihan tambahan yang sudah tidak tersedia. Muat ulang halaman.'];
            }
            $harga = self::hargaJual($m) + array_sum(array_column($opsi, 'harga'));
            $item[] = ['idMenu' => $m['id'], 'nama' => (string) $m['nama'], 'harga' => $harga, 'jumlah' => $jumlah]
                + ($opsi ? ['opsi' => array_column($opsi, 'nama')] : []);
            $subtotal += $harga * $jumlah;
        }
        // Cek stok untuk semua item sekaligus (paket ikut dihitung).
        $stok = $this->stokMakanan($id);
        foreach ($this->kebutuhan($id, $item) as $idResep => $butuh) {
            if (($stok[$idResep] ?? 0) + 1e-9 < $butuh) {
                return ['ok' => false, 'galat' => 'Maaf, stok tidak cukup untuk jumlah pesanan ini. Kurangi jumlahnya.'];
            }
        }

        $idPelanggan = 'plg_'.$hp;
        [$diskon, $promo, $galatPromo] = $this->promo($id, (string) ($req['kodePromo'] ?? ''), $subtotal, $idPelanggan, true);
        if ($galatPromo) {
            return ['ok' => false, 'galat' => $galatPromo];
        }
        $total = $subtotal - $diskon;
        if ($total < 1) {
            return ['ok' => false, 'galat' => 'Total pesanan tidak valid.'];
        }

        $sekarang = self::sekarang();
        $idPesanan = 'psn_'.base_convert((string) $sekarang, 10, 36).Str::lower(Str::random(8));
        $nomor = self::nomorPesanan();
        $s = $toko['setelan'];
        $kembaliKe = rtrim((string) config('goodrecipes.frontend_url'), '/');
        // Tanpa Mayar: pembeli transfer / scan QRIS toko, lalu toko menandai lunas secara manual.
        $link = $mayar ? $this->mayar->buat($dapur, [
            'nama' => $nama,
            'jumlah' => (int) round($total),
            'hp' => $hp,
            'keterangan' => 'Pesanan #'.$nomor.' - '.($s['namaToko'] ?: 'Toko'),
            'kembaliKe' => $kembaliKe ? $kembaliKe.'/#/pesan/'.$s['tokenToko'].'?pesanan='.$idPesanan : '',
        ]) : ['id' => '', 'link' => ''];

        return Sinkron::denganKunci($id, fn () => DB::transaction(function () use ($id, $idPesanan, $nomor, $nama, $hp, $idPelanggan, $item, $subtotal, $diskon, $promo, $total, $sekarang, $req, $link, $caraAmbil, $jadwal) {
            if (! $this->ambil($id, 'Pelanggan', $idPelanggan)) {
                $this->simpan($id, 'Pelanggan', ['id' => $idPelanggan, 'nama' => $nama, 'hp' => $hp, 'catatan' => '', 'dibuat' => $sekarang]);
            }
            $this->simpan($id, 'Pesanan', [
                'id' => $idPesanan, 'nomor' => $nomor, 'sumber' => 'online', 'idPelanggan' => $idPelanggan, 'nama' => $nama, 'hp' => $hp,
                'catatan' => $this->teks($req['catatan'] ?? '', 300), 'item' => json_encode($item), 'subtotal' => $subtotal,
                'diskon' => $diskon, 'kodePromo' => $promo ? Str::upper(trim((string) $promo['kode'])) : '', 'total' => $total,
                'status' => 'menunggu', 'oleh' => 'Link pemesanan', 'waktu' => $sekarang,
                'caraAmbil' => $caraAmbil, 'jadwal' => $jadwal,
            ]);
            $this->simpan($id, 'Pembayaran', [
                'id' => 'byr_'.base_convert((string) $sekarang, 10, 36).Str::lower(Str::random(8)), 'idPesanan' => $idPesanan,
                'metode' => $link['id'] ? 'mayar' : 'transfer', 'jumlah' => $total, 'status' => 'menunggu', 'idMayar' => $link['id'], 'linkMayar' => $link['link'],
                'waktu' => $sekarang,
            ]);

            return ['ok' => true, 'idPesanan' => $idPesanan, 'nomor' => $nomor, 'total' => $total, 'link' => $link['link']];
        }));
    }

    /** Testimoni yang disetujui admin, terbaru dulu (untuk halaman pemesanan). */
    private function testimoniTampil(int $id): array
    {
        $daftar = $this->semua($id, 'Testimoni', fn ($t) => (bool) $t['tampil'] && trim((string) $t['isi']) !== '');
        usort($daftar, fn ($a, $b) => (int) $b['waktu'] <=> (int) $a['waktu']);

        return array_map(fn ($t) => [
            'nama' => mb_substr((string) $t['nama'], 0, 60),
            'isi' => mb_substr((string) $t['isi'], 0, 500),
            'bintang' => max(1, min(5, (int) ($t['bintang'] ?: 5))),
            'waktu' => (int) $t['waktu'],
        ], array_slice($daftar, 0, 30));
    }

    /**
     * Pembeli mengirim testimoni dari halaman status pesanan (pesanan online yang sudah lunas, sekali per pesanan).
     * Tidak langsung tampil: admin menyetujuinya dulu.
     */
    public function kirimTestimoni(array $req): array
    {
        $toko = $this->tokoDariToken($req['token'] ?? null);
        $id = $toko['idData'] ?? 0;
        $idPesanan = is_string($req['idPesanan'] ?? null) && strlen($req['idPesanan']) <= 100 ? $req['idPesanan'] : '';
        $p = $toko && $idPesanan ? $this->ambil($id, 'Pesanan', $idPesanan) : null;
        if (! $p || $p['dihapus'] || $p['sumber'] !== 'online') {
            return ['ok' => false, 'galat' => 'Pesanan tidak ditemukan.'];
        }
        $lunas = (bool) $this->semua($id, 'Pembayaran', fn ($b) => $b['idPesanan'] === $p['id'] && $b['status'] === 'lunas');
        if (! $lunas || $p['status'] === 'batal') {
            return ['ok' => false, 'galat' => 'Testimoni bisa dikirim setelah pesanan dibayar.'];
        }
        $isi = $this->teks($req['isi'] ?? '', 500);
        if (mb_strlen($isi) < 5) {
            return ['ok' => false, 'galat' => 'Tulis testimoni minimal beberapa kata.'];
        }
        $bintang = is_numeric($req['bintang'] ?? null) ? max(1, min(5, (int) $req['bintang'])) : 5;
        $nama = $this->teks($req['nama'] ?? '', 60) ?: $p['nama'];
        // Id tetap per pesanan: kirim ulang hanya memperbarui, tidak menambah baris.
        $idTesti = 'tst_'.substr(preg_replace('/[^a-z0-9]/', '', strtolower($p['id'])), -40);

        return Sinkron::denganKunci($id, function () use ($id, $idTesti, $nama, $isi, $bintang, $p) {
            $lama = $this->ambil($id, 'Testimoni', $idTesti);
            if ($lama && ! $lama['dihapus'] && $lama['tampil']) {
                return ['ok' => false, 'galat' => 'Testimoni untuk pesanan ini sudah tayang. Terima kasih!'];
            }
            $this->simpan($id, 'Testimoni', [
                'id' => $idTesti, 'nama' => $nama, 'isi' => $isi, 'bintang' => $bintang, 'idPesanan' => $p['id'],
                'tampil' => false, 'sumber' => 'pembeli', 'waktu' => self::sekarang(), 'dihapus' => false,
            ]);

            return ['ok' => true, 'pesan' => 'Terima kasih! Testimoni Anda akan tampil setelah dicek toko.'];
        });
    }

    /** Status pesanan untuk pembeli (dibuka dari link setelah membayar). Menanyakan Mayar bila belum lunas. */
    public function statusPesanan(mixed $token, mixed $idPesanan): array
    {
        $toko = $this->tokoDariToken($token);
        $id = $toko['idData'] ?? 0;
        $p = $toko && is_string($idPesanan) && strlen($idPesanan) <= 100 ? $this->ambil($id, 'Pesanan', $idPesanan) : null;
        if (! $p || $p['dihapus'] || $p['sumber'] !== 'online') {
            return ['ok' => false, 'galat' => 'Pesanan tidak ditemukan.'];
        }
        $bayar = $this->semua($id, 'Pembayaran', fn ($b) => $b['idPesanan'] === $p['id']);
        $lunas = (bool) array_filter($bayar, fn ($b) => $b['status'] === 'lunas');
        if (! $lunas && $p['status'] !== 'batal') {
            foreach ($bayar as $b) {
                if ($b['metode'] === 'mayar' && $b['status'] === 'menunggu' && $this->periksaMayar($id, $b)) {
                    $lunas = true;
                }
            }
            $p = $this->ambil($id, 'Pesanan', $p['id']);
        }
        $link = '';
        foreach ($bayar as $b) {
            if ($b['metode'] === 'mayar' && $b['status'] === 'menunggu') {
                $link = (string) $b['linkMayar'];
            }
        }

        $tungguTransfer = ! $lunas && $p['status'] === 'menunggu' && (bool) array_filter($bayar, fn ($b) => $b['metode'] === 'transfer' && $b['status'] === 'menunggu');
        $testimoni = $this->semua($id, 'Testimoni', fn ($t) => $t['idPesanan'] === $p['id']);

        return [
            'ok' => true, 'nomor' => $p['nomor'], 'status' => $p['status'], 'lunas' => $lunas, 'total' => (float) $p['total'],
            'item' => $p['item'] ?: [], 'nama' => $p['nama'], 'link' => $lunas ? '' : $link,
            'caraAmbil' => (string) $p['caraAmbil'], 'jadwal' => (int) $p['jadwal'],
            'alamatToko' => (string) $toko['setelan']['alamatToko'],
            'bayarManual' => $tungguTransfer ? $this->bayarManual($toko['setelan']) : null,
            'wa' => (string) $toko['setelan']['waToko'],
            'bisaTestimoni' => $lunas && $p['status'] !== 'batal' && ! $testimoni,
        ];
    }

    // ---------- Pembayaran Mayar dari kasir ----------

    /** Kasir memilih "Bayar online": buat link Mayar untuk pesanan yang sudah ada di perangkat kasir. */
    public function bayarMayarKasir(User $user, array $req): array
    {
        $id = $user->idData();
        $dapur = $user->akunDapur();
        $idPesanan = is_string($req['idPesanan'] ?? null) ? $req['idPesanan'] : '';
        $jumlah = is_numeric($req['jumlah'] ?? null) ? (int) round((float) $req['jumlah']) : 0;
        if ($idPesanan === '' || strlen($idPesanan) > 100 || $jumlah < 1) {
            return ['ok' => false, 'galat' => 'Pesanan tidak valid.'];
        }
        $nomor = $this->teks($req['nomor'] ?? '', 20);
        $link = $this->mayar->buat($dapur, [
            'nama' => $this->teks($req['nama'] ?? '', 60) ?: 'Pembeli',
            'jumlah' => $jumlah,
            'hp' => self::hp($req['hp'] ?? ''),
            'keterangan' => 'Pesanan #'.$nomor,
        ]);
        $sekarang = self::sekarang();
        $baris = Sinkron::denganKunci($id, fn () => $this->simpan($id, 'Pembayaran', [
            'id' => 'byr_'.base_convert((string) $sekarang, 10, 36).Str::lower(Str::random(8)), 'idPesanan' => $idPesanan,
            'metode' => 'mayar', 'jumlah' => $jumlah, 'status' => 'menunggu', 'idMayar' => $link['id'], 'linkMayar' => $link['link'],
            'waktu' => $sekarang,
        ]));

        return ['ok' => true, 'pembayaran' => $baris];
    }

    /** Kasir menanyakan status satu pembayaran Mayar. */
    public function cekBayar(User $user, mixed $idPembayaran): array
    {
        $id = $user->idData();
        $b = is_string($idPembayaran) && strlen($idPembayaran) <= 100 ? $this->ambil($id, 'Pembayaran', $idPembayaran) : null;
        if (! $b || $b['dihapus']) {
            return ['ok' => false, 'galat' => 'Pembayaran tidak ditemukan.'];
        }
        if ($b['metode'] === 'mayar' && $b['status'] === 'menunggu') {
            $this->periksaMayar($id, $b);
            $b = $this->ambil($id, 'Pembayaran', $b['id']);
        }

        return ['ok' => true, 'pembayaran' => $b];
    }

    /** Tanya Mayar; bila lunas, tandai lunas. Mengembalikan true bila lunas. */
    private function periksaMayar(int $id, array $b): bool
    {
        $status = $this->mayar->status($this->dapur($id), (string) $b['idMayar']);
        if ($status === 'paid' || $status === 'settled' || $status === 'success') {
            $this->tandaiLunas($id, $b['id']);

            return true;
        }

        return false;
    }

    /** Pembayaran lunas. Pesanan online yang menunggu menjadi "baru" dan stoknya dipotong. */
    public function tandaiLunas(int $id, string $idPembayaran): void
    {
        Sinkron::denganKunci($id, fn () => DB::transaction(function () use ($id, $idPembayaran) {
            $b = $this->ambil($id, 'Pembayaran', $idPembayaran);
            if (! $b || $b['status'] === 'lunas') {
                return;
            }
            $this->simpan($id, 'Pembayaran', ['id' => $b['id'], 'status' => 'lunas', 'lunasPada' => self::sekarang()]);
            $p = $this->ambil($id, 'Pesanan', (string) $b['idPesanan']);
            if ($p && ! $p['dihapus'] && $p['sumber'] === 'online' && $p['status'] === 'menunggu') {
                $this->simpan($id, 'Pesanan', ['id' => $p['id'], 'status' => 'baru']);
                $this->potongStok($id, $p);
            }
        }));
    }

    /**
     * Webhook Mayar: POST /api/mayar/{token}. Isi webhook hanya dipakai untuk mencari pembayaran;
     * status lunas selalu dicek ulang ke API Mayar.
     */
    public function webhook(string $token, array $isi): void
    {
        if (strlen($token) < 20) {
            return;
        }
        $dapur = User::where('token_webhook', $token)->first();
        if (! $dapur) {
            return;
        }
        $calon = [];
        array_walk_recursive($isi, function ($v) use (&$calon) {
            if (is_string($v) && preg_match('/^[A-Za-z0-9-]{8,100}$/', $v)) {
                $calon[] = $v;
            }
        });
        if (! $calon) {
            return;
        }
        $daftar = DB::table('pembayaran')->where('id_pengguna', $dapur->id)->where('dihapus', false)->where('status', 'menunggu')
            ->whereIn('id_mayar', array_slice(array_unique($calon), 0, 50))->get();
        foreach ($daftar as $r) {
            $this->periksaMayar($dapur->id, Skema::dariDb('Pembayaran', $r));
        }
    }

    // ---------- Lain-lain ----------

    /** Nomor pesanan pendek, mis. "2810-K7Q" (tanggal-bulan + 3 huruf acak). Sama dengan js/lib/toko.js. */
    public static function nomorPesanan(): string
    {
        $huruf = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
        $acak = '';
        for ($i = 0; $i < 3; $i++) {
            $acak .= $huruf[random_int(0, strlen($huruf) - 1)];
        }

        return now()->format('dm').'-'.$acak;
    }

    private function teks(mixed $v, int $maks): string
    {
        $t = is_scalar($v) ? (string) $v : '';
        $t = preg_replace('/[\x00-\x1F\x7F]/u', '', $t) ?? '';

        return mb_substr(trim($t), 0, $maks);
    }
}
