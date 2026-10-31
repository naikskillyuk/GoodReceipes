<?php

namespace Tests\Feature;

use App\Models\User;
use App\Services\Akun;
use Illuminate\Foundation\Testing\RefreshDatabase;
use Illuminate\Support\Facades\Http;
use Tests\TestCase;

/** Akun toko, sinkron per peran, link pemesanan, pembayaran Mayar (dipalsukan), dan potong stok. */
class TokoTest extends TestCase
{
    use RefreshDatabase;

    private function api(array $isi): array
    {
        return $this->call('POST', '/api', [], [], [], ['CONTENT_TYPE' => 'text/plain'], json_encode($isi))->json();
    }

    private function dapur(): array
    {
        $u = app(Akun::class)->buat('Chef Dapur', 'dapur@uji.test', 'sandi-dapur-123', ['lunas' => true]);
        $j = $this->api(['aksi' => 'masuk', 'login' => 'dapur@uji.test', 'kataSandi' => 'sandi-dapur-123']);
        $this->assertTrue($j['ok'], json_encode($j));

        return [$u, $j['sesi']];
    }

    private function baris(array $r): array
    {
        return $r + ['diubah' => 1000, 'dihapus' => false];
    }

    public function test_akun_toko_sinkron_terbatas(): void
    {
        [$dapur, $kunci] = $this->dapur();
        $this->assertSame('dapur', $this->api(['aksi' => 'ping', 'kunci' => $kunci])['pengguna']['peran']);

        $buat = $this->api(['aksi' => 'buatAkunToko', 'kunci' => $kunci, 'nama' => 'Kasir 1', 'username' => 'kasir.satu', 'kataSandi' => 'sandi-kasir-1']);
        $this->assertTrue($buat['ok'], json_encode($buat));
        $this->assertFalse($this->api(['aksi' => 'buatAkunToko', 'kunci' => $kunci, 'nama' => 'X', 'username' => 'kasir.satu', 'kataSandi' => 'sandi-kasir-1'])['ok']);

        // Dapur menyimpan resep + bahan + menu.
        $this->api(['aksi' => 'sinkron', 'kunci' => $kunci, 'sejak' => 0, 'baris' => [
            'Resep' => [$this->baris(['id' => 'res_a', 'nama' => 'Brownies'])],
            'Bahan' => [$this->baris(['id' => 'bhn_a', 'nama' => 'Cokelat', 'hargaBeli' => 1000])],
            'Menu' => [$this->baris(['id' => 'mnu_a', 'jenis' => 'resep', 'idRef' => 'res_a', 'nama' => 'Brownies', 'harga' => 8000, 'aktif' => true, 'online' => true])],
        ]]);

        $masuk = $this->api(['aksi' => 'masuk', 'login' => 'kasir.satu', 'kataSandi' => 'sandi-kasir-1']);
        $this->assertTrue($masuk['ok'], json_encode($masuk));
        $this->assertSame('toko', $masuk['pengguna']['peran']);
        $this->assertSame($dapur->id, $masuk['pengguna']['idData']);
        $kt = $masuk['sesi'];

        // Toko: menulis pesanan boleh, menulis bahan/menu diabaikan, bahan tidak terbaca.
        $s = $this->api(['aksi' => 'sinkron', 'kunci' => $kt, 'sejak' => 0, 'baris' => [
            'Pesanan' => [$this->baris(['id' => 'psn_1', 'nomor' => '0101-AAA', 'sumber' => 'kasir', 'status' => 'baru', 'total' => 8000, 'item' => '[]'])],
            'Menu' => [$this->baris(['id' => 'mnu_a', 'harga' => 1, 'diubah' => 99999])],
            'Bahan' => [$this->baris(['id' => 'bhn_b', 'nama' => 'Palsu'])],
        ]]);
        $this->assertTrue($s['ok']);
        $this->assertArrayNotHasKey('Bahan', $s['baris']);
        $this->assertSame(8000, (int) $s['baris']['Menu'][0]['harga']);
        $this->assertSame(1, \DB::table('bahan')->where('id_pengguna', $dapur->id)->count());
        $this->assertSame(1, \DB::table('pesanan')->where('id_pengguna', $dapur->id)->count());
        $this->assertFalse($this->api(['aksi' => 'akunToko', 'kunci' => $kt])['ok']);

        // Dapur menonaktifkan akun toko: sesinya berakhir.
        $id = $buat['akun']['id'];
        $this->assertTrue($this->api(['aksi' => 'ubahAkunToko', 'kunci' => $kunci, 'id' => $id, 'aktif' => false])['ok']);
        $this->assertSame('SESI', $this->api(['aksi' => 'ping', 'kunci' => $kt])['kode']);
        $this->assertFalse($this->api(['aksi' => 'masuk', 'login' => 'kasir.satu', 'kataSandi' => 'sandi-kasir-1'])['ok']);
    }

    public function test_pesanan_online_mayar_dan_potong_stok(): void
    {
        [$dapur, $kunci] = $this->dapur();
        Http::fake([
            '*/webhooks/update' => Http::response(['statusCode' => 200, 'messages' => 'success']),
            '*/payments/create' => Http::response(['statusCode' => 200, 'messages' => 'success', 'data' => ['id' => 'mayar-uji-0001', 'transactionId' => 't', 'link' => 'https://uji.myr.id/pl/abc']]),
            '*/payments/mayar-uji-0001' => Http::sequence()
                ->push(['statusCode' => 200, 'data' => ['id' => 'mayar-uji-0001', 'status' => 'unpaid']])
                ->push(['statusCode' => 200, 'data' => ['id' => 'mayar-uji-0001', 'status' => 'paid']]),
        ]);
        $atur = $this->api(['aksi' => 'aturMayar', 'kunci' => $kunci, 'kunciApi' => str_repeat('k', 40), 'sandbox' => true]);
        $this->assertTrue($atur['ok'] && $atur['aktif'] && $atur['webhookTerdaftar'], json_encode($atur));
        $this->assertStringContainsString('/api/mayar/', $atur['webhook']);
        $this->assertNotSame(str_repeat('k', 40), \DB::table('users')->where('id', $dapur->id)->value('mayar_kunci'), 'kunci terenkripsi');

        $this->api(['aksi' => 'sinkron', 'kunci' => $kunci, 'sejak' => 0, 'baris' => [
            'Resep' => [$this->baris(['id' => 'res_a', 'nama' => 'Brownies']), $this->baris(['id' => 'res_b', 'nama' => 'Saus'])],
            'Paket' => [$this->baris(['id' => 'pkt_a', 'nama' => 'Paket'])],
            'IsiPaket' => [$this->baris(['id' => 'ipk_1', 'idPaket' => 'pkt_a', 'idResep' => 'res_a', 'jumlah' => 2]), $this->baris(['id' => 'ipk_2', 'idPaket' => 'pkt_a', 'idResep' => 'res_b', 'jumlah' => 1])],
            'MutasiMakanan' => [$this->baris(['id' => 'mmk_p1', 'idResep' => 'res_a', 'jumlah' => 10, 'jenis' => 'produksi']), $this->baris(['id' => 'mmk_p2', 'idResep' => 'res_b', 'jumlah' => 3, 'jenis' => 'produksi'])],
            'Menu' => [
                $this->baris(['id' => 'mnu_a', 'jenis' => 'resep', 'idRef' => 'res_a', 'nama' => 'Brownies', 'harga' => 8000, 'aktif' => true, 'online' => true]),
                $this->baris(['id' => 'mnu_p', 'jenis' => 'paket', 'idRef' => 'pkt_a', 'nama' => 'Paket', 'harga' => 20000, 'aktif' => true, 'online' => true]),
                $this->baris(['id' => 'mnu_x', 'jenis' => 'resep', 'idRef' => 'res_b', 'nama' => 'Rahasia', 'harga' => 1, 'aktif' => true, 'online' => false]),
            ],
            'Promo' => [$this->baris(['id' => 'prm_1', 'kode' => 'HEMAT10', 'jenis' => 'persen', 'nilai' => 10, 'untuk' => 'baru', 'aktif' => true, 'online' => true])],
            'Setelan' => [$this->baris(['id' => 'stl_toko', 'namaToko' => 'Toko Uji', 'tokenToko' => 'token-toko-uji-123', 'tokoBuka' => true, 'pakaiMayar' => true])],
        ]]);

        $info = $this->api(['aksi' => 'infoToko', 'token' => 'token-toko-uji-123']);
        $this->assertTrue($info['ok'] && $info['buka'] && $info['bayarOnline'] && $info['mayar']);
        $this->assertSame(['mnu_a', 'mnu_p'], array_column($info['menu'], 'id'), 'menu tidak online disembunyikan');
        $this->assertEquals([10, 3], array_column($info['menu'], 'sisa'), 'paket: min(10/2, 3/1)');

        $terlalu = $this->api(['aksi' => 'pesanOnline', 'token' => 'token-toko-uji-123', 'nama' => 'Budi', 'hp' => '0812345678',
            'item' => [['idMenu' => 'mnu_p', 'jumlah' => 4]]]);
        $this->assertFalse($terlalu['ok']);
        $this->assertStringContainsString('stok', $terlalu['galat']);

        $pesan = $this->api(['aksi' => 'pesanOnline', 'token' => 'token-toko-uji-123', 'nama' => 'Budi', 'hp' => '0812345678', 'kodePromo' => 'hemat10',
            'item' => [['idMenu' => 'mnu_p', 'jumlah' => 1, 'harga' => 1], ['idMenu' => 'mnu_a', 'jumlah' => 2]]]);
        $this->assertTrue($pesan['ok'], json_encode($pesan));
        $this->assertEquals(32400, $pesan['total'], '(20000 + 16000) - 10%');
        $this->assertSame('https://uji.myr.id/pl/abc', $pesan['link']);
        $this->assertSame(1, \DB::table('pelanggan')->where('id', 'plg_62812345678')->count());

        // Belum dibayar: stok utuh.
        $st = $this->api(['aksi' => 'statusPesanan', 'token' => 'token-toko-uji-123', 'idPesanan' => $pesan['idPesanan']]);
        $this->assertFalse($st['lunas']);
        $this->assertSame('menunggu', $st['status']);
        $this->assertSame(2, \DB::table('mutasi_makanan')->count());

        // Webhook (isi apa pun yang memuat id Mayar) -> cek ulang ke Mayar -> lunas, pesanan baru, stok dipotong.
        $token = \DB::table('users')->where('id', $dapur->id)->value('token_webhook');
        $this->postJson('/api/mayar/'.$token, ['event' => 'payment.received', 'data' => ['id' => 'mayar-uji-0001', 'status' => true]])->assertOk();
        $st = $this->api(['aksi' => 'statusPesanan', 'token' => 'token-toko-uji-123', 'idPesanan' => $pesan['idPesanan']]);
        $this->assertTrue($st['lunas']);
        $this->assertSame('baru', $st['status']);
        $stok = \DB::table('mutasi_makanan')->groupBy('id_resep')->selectRaw('id_resep, sum(jumlah) as t')->pluck('t', 'id_resep');
        $this->assertEquals(10 - 2 - 2, (float) $stok['res_a']);
        $this->assertEquals(3 - 1, (float) $stok['res_b']);

        // Webhook palsu (token salah) tidak berpengaruh; webhook ulang tidak memotong dua kali.
        $this->postJson('/api/mayar/token-salah-yang-panjang-sekali-1234', ['data' => ['id' => 'mayar-uji-0001']])->assertOk();
        $this->postJson('/api/mayar/'.$token, ['data' => ['id' => 'mayar-uji-0001']])->assertOk();
        $this->assertSame(4, \DB::table('mutasi_makanan')->count());

        // Promo khusus pelanggan baru tidak berlaku lagi untuk Budi.
        $lagi = $this->api(['aksi' => 'pesanOnline', 'token' => 'token-toko-uji-123', 'nama' => 'Budi', 'hp' => '+62 812-345-678', 'kodePromo' => 'HEMAT10',
            'item' => [['idMenu' => 'mnu_a', 'jumlah' => 1]]]);
        $this->assertFalse($lagi['ok']);
        $this->assertStringContainsString('pelanggan baru', $lagi['galat']);

        // Kode promo khusus produk: potongan Rp 3.000 tiap beli 2 Brownies (kelipatan), produk lain tidak ikut.
        $this->api(['aksi' => 'sinkron', 'kunci' => $kunci, 'sejak' => 0, 'baris' => ['Promo' => [
            $this->baris(['id' => 'prm_2', 'kode' => 'BROWNIES2', 'jenis' => 'nominal', 'nilai' => 3000, 'untuk' => 'semua', 'aktif' => true, 'online' => true,
                'idMenu' => 'mnu_a', 'minJumlah' => 2, 'berlaku' => 'kelipatan']),
            $this->baris(['id' => 'prm_3', 'kode' => 'SEKALI', 'jenis' => 'persen', 'nilai' => 50, 'untuk' => 'semua', 'aktif' => true, 'online' => true,
                'idMenu' => 'mnu_a', 'minJumlah' => 2, 'berlaku' => 'sekali']),
        ]]]);
        $info = $this->api(['aksi' => 'infoToko', 'token' => 'token-toko-uji-123']);
        $p2 = collect($info['promo'])->firstWhere('kode', 'BROWNIES2');
        $this->assertSame(['Brownies', 2, 'kelipatan'], [$p2['produk'], $p2['minJumlah'], $p2['berlaku']]);
        $kurang = $this->api(['aksi' => 'pesanOnline', 'token' => 'token-toko-uji-123', 'nama' => 'Sari', 'hp' => '0812999888', 'kodePromo' => 'brownies2',
            'item' => [['idMenu' => 'mnu_a', 'jumlah' => 1], ['idMenu' => 'mnu_p', 'jumlah' => 1]]]);
        $this->assertFalse($kurang['ok']);
        $this->assertStringContainsString('minimal 2 Brownies', $kurang['galat']);
        $promo = $this->api(['aksi' => 'pesanOnline', 'token' => 'token-toko-uji-123', 'nama' => 'Sari', 'hp' => '0812999888', 'kodePromo' => 'brownies2',
            'item' => [['idMenu' => 'mnu_a', 'jumlah' => 5]]]);
        $this->assertTrue($promo['ok'], json_encode($promo));
        $this->assertEquals(40000 - 2 * 3000, $promo['total'], 'beli 5 = 2 kelipatan');
        $sekali = $this->api(['aksi' => 'pesanOnline', 'token' => 'token-toko-uji-123', 'nama' => 'Sari', 'hp' => '0812999888', 'kodePromo' => 'SEKALI',
            'caraAmbil' => 'ambil', 'item' => [['idMenu' => 'mnu_a', 'jumlah' => 4]]]);
        $this->assertTrue($sekali['ok'], 'jam ambil opsional: '.json_encode($sekali));
        $this->assertEquals(32000 - 8000, $sekali['total'], '50% dari 2 Brownies saja, sekali per pesanan');
        $this->assertEquals(['ambil', 0], array_values((array) \DB::table('pesanan')->where('id', $sekali['idPesanan'])->first(['cara_ambil', 'jadwal'])));
        $lewat = $this->api(['aksi' => 'pesanOnline', 'token' => 'token-toko-uji-123', 'nama' => 'Sari', 'hp' => '0812999888',
            'caraAmbil' => 'ambil', 'jadwal' => 1000, 'item' => [['idMenu' => 'mnu_a', 'jumlah' => 1]]]);
        $this->assertStringContainsString('belum lewat', $lewat['galat'], 'jam yang diisi tetap dicek');
    }

    public function test_pesanan_online_transfer_qris_manual_dan_testimoni(): void
    {
        [, $kunci] = $this->dapur();
        $this->api(['aksi' => 'sinkron', 'kunci' => $kunci, 'sejak' => 0, 'baris' => [
            'Resep' => [$this->baris(['id' => 'res_a', 'nama' => 'Brownies', 'idKategori' => 'kat_kue'])],
            'Kategori' => [$this->baris(['id' => 'kat_kue', 'nama' => 'Kue'])],
            'MutasiMakanan' => [$this->baris(['id' => 'mmk_p1', 'idResep' => 'res_a', 'jumlah' => 10, 'jenis' => 'produksi'])],
            'Menu' => [$this->baris(['id' => 'mnu_a', 'jenis' => 'resep', 'idRef' => 'res_a', 'nama' => 'Brownies', 'harga' => 8000, 'aktif' => true, 'online' => true, 'diskon' => 25,
                'opsi' => [['nama' => 'Digoreng', 'harga' => 2000], ['nama' => 'Tambah keju', 'harga' => 3000]]])],
            'Setelan' => [$this->baris(['id' => 'stl_toko', 'namaToko' => 'Toko Uji', 'tokenToko' => 'token-toko-manual-1', 'tokoBuka' => true, 'waToko' => '0812 1111 2222',
                'rekening' => [['bank' => 'BCA', 'nomor' => '1234567890', 'atasNama' => 'Rasa'], ['bank' => '', 'nomor' => '']], 'qrisUrl' => 'https://contoh.test/qris.png', 'headerUrl' => 'https://contoh.test/header.jpg'])],
            'Banner' => [
                $this->baris(['id' => 'bnr_1', 'judul' => 'Pre-order', 'teks' => 'Buka', 'aksi' => 'menu', 'tombol' => 'Lihat', 'tampilDi' => 'etalase', 'aktif' => true, 'urutan' => 1]),
                $this->baris(['id' => 'bnr_2', 'judul' => 'Khusus kasir', 'tampilDi' => 'kasir', 'aktif' => true, 'urutan' => 0]),
                $this->baris(['id' => 'bnr_3', 'judul' => 'Tersembunyi', 'tampilDi' => 'semua', 'aktif' => false, 'urutan' => 2]),
            ],
            'Testimoni' => [
                $this->baris(['id' => 'tst_a', 'nama' => 'Sari', 'isi' => 'Enak sekali!', 'bintang' => 5, 'tampil' => true, 'sumber' => 'admin', 'waktu' => 1]),
                $this->baris(['id' => 'tst_b', 'nama' => 'Rahasia', 'isi' => 'Belum disetujui', 'bintang' => 3, 'tampil' => false, 'sumber' => 'pembeli', 'waktu' => 2]),
            ],
        ]]);

        // Tanpa Mayar: tetap bisa pesan, bayar lewat rekening / QRIS.
        $info = $this->api(['aksi' => 'infoToko', 'token' => 'token-toko-manual-1']);
        $this->assertTrue($info['ok'] && $info['bayarOnline'], json_encode($info));
        $this->assertFalse($info['mayar']);
        $this->assertSame([['bank' => 'BCA', 'nomor' => '1234567890', 'atasNama' => 'Rasa']], $info['bayarManual']['rekening']);
        $this->assertSame('https://contoh.test/qris.png', $info['bayarManual']['qrisUrl']);
        $this->assertSame('Kue', $info['menu'][0]['kategori']);
        $this->assertEquals([6000, 8000, 25, 'persen'], [$info['menu'][0]['harga'], $info['menu'][0]['hargaAsli'], $info['menu'][0]['diskon'], $info['menu'][0]['diskonJenis']], 'diskon produk 25%');
        $this->assertSame(6500.0, \App\Services\Penjualan::hargaJual(['harga' => 8000, 'diskon' => 1500, 'diskonJenis' => 'nominal']), 'potongan Rupiah');
        $this->assertSame(0.0, \App\Services\Penjualan::hargaJual(['harga' => 8000, 'diskon' => 9000, 'diskonJenis' => 'nominal']), 'potongan dibatasi harga');
        $this->assertSame(['Sari'], array_column($info['testimoni'], 'nama'), 'hanya testimoni yang tayang');
        $this->assertSame(['Pre-order'], array_column($info['banner'], 'judul'), 'hanya banner etalase yang aktif');
        $this->assertSame('https://contoh.test/header.jpg', $info['headerUrl']);

        // Halaman depan situs (tanpa token) = toko utama yang sudah aktif.
        $depan = $this->api(['aksi' => 'infoToko', 'token' => '']);
        $this->assertTrue($depan['ok'], json_encode($depan));
        $this->assertSame('Toko Uji', $depan['namaToko']);

        $this->assertSame([['nama' => 'Digoreng', 'harga' => 2000], ['nama' => 'Tambah keju', 'harga' => 3000]], $info['menu'][0]['opsi']);
        $palsu = $this->api(['aksi' => 'pesanOnline', 'token' => 'token-toko-manual-1', 'nama' => 'Budi', 'hp' => '0812345678', 'item' => [['idMenu' => 'mnu_a', 'jumlah' => 1, 'opsi' => ['Emas']]]]);
        $this->assertFalse($palsu['ok'], 'pilihan yang tidak ada ditolak');
        $pesan = $this->api(['aksi' => 'pesanOnline', 'token' => 'token-toko-manual-1', 'nama' => 'Budi', 'hp' => '0812345678',
            'item' => [['idMenu' => 'mnu_a', 'jumlah' => 2], ['idMenu' => 'mnu_a', 'jumlah' => 1, 'opsi' => ['digoreng']]]]);
        $this->assertTrue($pesan['ok'], json_encode($pesan));
        $this->assertSame('', $pesan['link']);
        $this->assertEquals(12000 + 8000, $pesan['total'], 'harga diskon dari server: 2 x 6000 + 1 x (6000 + digoreng 2000)');
        $item = json_decode(\DB::table('pesanan')->where('id', $pesan['idPesanan'])->value('item'), true);
        $this->assertSame(['Digoreng'], $item[1]['opsi']);
        $this->assertSame('transfer', \DB::table('pembayaran')->where('id_pesanan', $pesan['idPesanan'])->value('metode'));
        $st = $this->api(['aksi' => 'statusPesanan', 'token' => 'token-toko-manual-1', 'idPesanan' => $pesan['idPesanan']]);
        $this->assertFalse($st['lunas']);
        $this->assertSame('1234567890', $st['bayarManual']['rekening'][0]['nomor']);
        $this->assertSame('0812 1111 2222', $st['wa']);
        $this->assertFalse($st['bisaTestimoni']);
        $belum = $this->api(['aksi' => 'kirimTestimoni', 'token' => 'token-toko-manual-1', 'idPesanan' => $pesan['idPesanan'], 'isi' => 'Mantap sekali']);
        $this->assertFalse($belum['ok'], 'testimoni hanya setelah lunas');

        // Toko menandai lunas (dari aplikasi, lewat sinkron).
        $byr = \DB::table('pembayaran')->where('id_pesanan', $pesan['idPesanan'])->value('id');
        $this->api(['aksi' => 'sinkron', 'kunci' => $kunci, 'sejak' => 0, 'baris' => [
            'Pembayaran' => [$this->baris(['id' => $byr, 'idPesanan' => $pesan['idPesanan'], 'metode' => 'transfer', 'jumlah' => 16000, 'status' => 'lunas', 'lunasPada' => 5, 'diubah' => \App\Services\Penjualan::sekarang() + 1000])],
        ]]);
        $st = $this->api(['aksi' => 'statusPesanan', 'token' => 'token-toko-manual-1', 'idPesanan' => $pesan['idPesanan']]);
        $this->assertTrue($st['lunas']);
        $this->assertNull($st['bayarManual']);
        $this->assertTrue($st['bisaTestimoni']);

        $kirim = $this->api(['aksi' => 'kirimTestimoni', 'token' => 'token-toko-manual-1', 'idPesanan' => $pesan['idPesanan'], 'isi' => 'Browniesnya lembut!', 'bintang' => 9]);
        $this->assertTrue($kirim['ok'], json_encode($kirim));
        $t = \DB::table('testimoni')->where('id_pesanan', $pesan['idPesanan'])->first();
        $this->assertSame('Budi', $t->nama);
        $this->assertEquals(5, $t->bintang);
        $this->assertFalse((bool) $t->tampil, 'menunggu persetujuan admin');
        $this->api(['aksi' => 'kirimTestimoni', 'token' => 'token-toko-manual-1', 'idPesanan' => $pesan['idPesanan'], 'isi' => 'Diperbarui ya']);
        $this->assertSame(1, \DB::table('testimoni')->where('id_pesanan', $pesan['idPesanan'])->count(), 'satu testimoni per pesanan');
        $this->assertCount(1, $this->api(['aksi' => 'infoToko', 'token' => 'token-toko-manual-1'])['testimoni']);
    }

    public function test_tampilan_login_hanya_pemilik_toko_utama(): void
    {
        [, $kunci] = $this->dapur();
        $lain = app(Akun::class)->buat('Toko Lain', 'lain@uji.test', 'sandi-lain-12345', ['lunas' => true]);
        $kunciLain = $this->api(['aksi' => 'masuk', 'login' => 'lain@uji.test', 'kataSandi' => 'sandi-lain-12345'])['sesi'];
        \DB::table('pengaturan_situs')->insert(['kunci' => 'latar_url', 'nilai' => 'https://contoh.test/latar.jpg', 'created_at' => now(), 'updated_at' => now()]);

        // Belum ada toko aktif: akun admin pertama yang boleh.
        $this->assertTrue($this->api(['aksi' => 'infoTampilanSitus', 'kunci' => $kunci])['bolehUbah']);
        $this->assertFalse($this->api(['aksi' => 'infoTampilanSitus', 'kunci' => $kunciLain])['bolehUbah']);
        $tolak = $this->api(['aksi' => 'aturTampilanSitus', 'kunci' => $kunciLain, 'jenis' => 'latar', 'gambar' => '']);
        $this->assertFalse($tolak['ok']);
        $this->assertSame('https://contoh.test/latar.jpg', $this->api(['aksi' => 'infoSitus'])['latarUrl']);

        // Toko lain mengaktifkan toko online: dia pemilik toko utama sekarang.
        $this->api(['aksi' => 'sinkron', 'kunci' => $kunciLain, 'sejak' => 0, 'baris' => [
            'Setelan' => [$this->baris(['id' => 'stl_toko', 'tokenToko' => 'token-toko-lain-123', 'tokoBuka' => true])],
        ]]);
        $this->assertFalse($this->api(['aksi' => 'infoTampilanSitus', 'kunci' => $kunci])['bolehUbah']);
        $hapus = $this->api(['aksi' => 'aturTampilanSitus', 'kunci' => $kunciLain, 'jenis' => 'latar', 'gambar' => '']);
        $this->assertTrue($hapus['ok'], json_encode($hapus));
        $this->assertSame('', $this->api(['aksi' => 'infoSitus'])['latarUrl']);
        $this->assertFalse($this->api(['aksi' => 'aturTampilanSitus', 'kunci' => $kunciLain, 'jenis' => 'latar', 'gambar' => 'bukan-gambar'])['ok']);

        // TOKO_UTAMA_EMAIL menentukan pemiliknya.
        config(['goodrecipes.toko_utama_email' => 'dapur@uji.test']);
        $this->assertTrue($this->api(['aksi' => 'infoTampilanSitus', 'kunci' => $kunci])['bolehUbah']);
        $this->assertFalse($this->api(['aksi' => 'infoTampilanSitus', 'kunci' => $kunciLain])['bolehUbah']);
    }
}
