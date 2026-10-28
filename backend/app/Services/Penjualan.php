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

    // ---------- Link pemesanan pembeli (tanpa login) ----------

    /** Baris setelan toko dari token link, beserta id pemilik data. */
    private function tokoDariToken(mixed $token): ?array
    {
        $t = is_string($token) ? $token : '';
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

    public function infoToko(mixed $token): array
    {
        $toko = $this->tokoDariToken($token);
        if (! $toko) {
            return ['ok' => false, 'galat' => 'Link pemesanan tidak ditemukan atau sudah diganti.'];
        }
        $id = $toko['idData'];
        $s = $toko['setelan'];
        $stok = $this->stokMakanan($id);
        $isiPaket = $this->petaIsiPaket($id);
        $menu = [];
        foreach ($this->semua($id, 'Menu', fn ($m) => $m['aktif'] && $m['online']) as $m) {
            $menu[] = [
                'id' => $m['id'],
                'nama' => (string) $m['nama'],
                'harga' => (float) $m['harga'],
                'fotoUrl' => (string) $m['fotoUrl'],
                'keterangan' => mb_substr((string) $m['keterangan'], 0, 300),
                'sisa' => $this->sisaMenu($this->isiMenu($id, $m, $isiPaket), $stok),
                'urutan' => (float) ($m['urutan'] ?? 0),
            ];
        }
        usort($menu, fn ($a, $b) => $a['urutan'] <=> $b['urutan']);
        $merek = $this->ambil($id, 'Setelan', 'stl_merek');

        return [
            'ok' => true,
            'namaToko' => (string) ($s['namaToko'] ?: ($merek['namaAplikasi'] ?? '') ?: 'Toko'),
            'logoUrl' => (string) (($merek['logoUrl'] ?? '') ?: app(Situs::class)->tampilan()['logoUrl']),
            'buka' => (bool) $s['tokoBuka'],
            'alamat' => (string) $s['alamatToko'],
            'wa' => (string) $s['waToko'],
            'catatan' => mb_substr((string) $s['catatanToko'], 0, 500),
            'bayarOnline' => $this->mayar->siap($this->dapur($id)),
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
        if (! $this->mayar->siap($dapur)) {
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
            $item[] = ['idMenu' => $m['id'], 'nama' => (string) $m['nama'], 'harga' => (float) $m['harga'], 'jumlah' => $jumlah];
            $subtotal += (float) $m['harga'] * $jumlah;
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
        $link = $this->mayar->buat($dapur, [
            'nama' => $nama,
            'jumlah' => (int) round($total),
            'hp' => $hp,
            'keterangan' => 'Pesanan #'.$nomor.' - '.($s['namaToko'] ?: 'Toko'),
            'kembaliKe' => $kembaliKe ? $kembaliKe.'/#/pesan/'.$s['tokenToko'].'?pesanan='.$idPesanan : '',
        ]);

        return Sinkron::denganKunci($id, fn () => DB::transaction(function () use ($id, $idPesanan, $nomor, $nama, $hp, $idPelanggan, $item, $subtotal, $diskon, $promo, $total, $sekarang, $req, $link) {
            if (! $this->ambil($id, 'Pelanggan', $idPelanggan)) {
                $this->simpan($id, 'Pelanggan', ['id' => $idPelanggan, 'nama' => $nama, 'hp' => $hp, 'catatan' => '', 'dibuat' => $sekarang]);
            }
            $this->simpan($id, 'Pesanan', [
                'id' => $idPesanan, 'nomor' => $nomor, 'sumber' => 'online', 'idPelanggan' => $idPelanggan, 'nama' => $nama, 'hp' => $hp,
                'catatan' => $this->teks($req['catatan'] ?? '', 300), 'item' => json_encode($item), 'subtotal' => $subtotal,
                'diskon' => $diskon, 'kodePromo' => $promo ? Str::upper(trim((string) $promo['kode'])) : '', 'total' => $total,
                'status' => 'menunggu', 'oleh' => 'Link pemesanan', 'waktu' => $sekarang,
            ]);
            $this->simpan($id, 'Pembayaran', [
                'id' => 'byr_'.base_convert((string) $sekarang, 10, 36).Str::lower(Str::random(8)), 'idPesanan' => $idPesanan,
                'metode' => 'mayar', 'jumlah' => $total, 'status' => 'menunggu', 'idMayar' => $link['id'], 'linkMayar' => $link['link'],
                'waktu' => $sekarang,
            ]);

            return ['ok' => true, 'idPesanan' => $idPesanan, 'nomor' => $nomor, 'total' => $total, 'link' => $link['link']];
        }));
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

        return [
            'ok' => true, 'nomor' => $p['nomor'], 'status' => $p['status'], 'lunas' => $lunas, 'total' => (float) $p['total'],
            'item' => $p['item'] ?: [], 'nama' => $p['nama'], 'link' => $lunas ? '' : $link,
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
