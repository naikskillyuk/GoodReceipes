<?php

namespace App\Http\Controllers;

use App\Models\Admin;
use App\Models\User;
use App\Services\Akun;
use App\Services\Foto;
use App\Services\Situs;
use Illuminate\Http\RedirectResponse;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\DB;
use Illuminate\Support\Facades\Hash;
use Illuminate\Support\Facades\RateLimiter;
use Illuminate\Support\Str;
use Illuminate\Validation\Rule;
use Illuminate\View\View;

/**
 * Halaman admin: daftar akun pembeli, membuat akun (kata sandi dikirim ke email), mencatat
 * pembelian, mengaktifkan/menonaktifkan, mengatur ulang kata sandi, dan mengeluarkan perangkat.
 */
class AdminController extends Controller
{
    private const BATAS_MASUK = 5; // percobaan gagal per 10 menit

    public function formMasuk(Request $request): View|RedirectResponse
    {
        if (Admin::find($request->session()->get('admin_id'))) {
            return redirect('/admin');
        }

        return view('admin.masuk');
    }

    public function masuk(Request $request): RedirectResponse
    {
        $data = $request->validate(['email' => 'required|string|max:190', 'password' => 'required|string|max:100']);
        $email = Str::lower(trim($data['email']));
        $kunci = ['admin:masuk:'.$request->ip(), 'admin:masuk:'.$email];
        foreach ($kunci as $k) {
            if (RateLimiter::tooManyAttempts($k, self::BATAS_MASUK)) {
                $menit = (int) ceil(RateLimiter::availableIn($k) / 60);

                return back()->withInput(['email' => $email])->withErrors(['email' => "Terlalu banyak percobaan. Coba lagi dalam {$menit} menit."]);
            }
        }
        $admin = Admin::where('email', $email)->first();
        if (! $admin || ! Hash::check($data['password'], $admin->password)) {
            foreach ($kunci as $k) {
                RateLimiter::hit($k, 600);
            }

            return back()->withInput(['email' => $email])->withErrors(['email' => 'Email atau kata sandi admin salah.']);
        }
        foreach ($kunci as $k) {
            RateLimiter::clear($k);
        }
        $request->session()->regenerate();
        $request->session()->put('admin_id', $admin->id);
        $admin->update(['terakhir_masuk' => now()]);

        return redirect('/admin');
    }

    public function keluar(Request $request): RedirectResponse
    {
        $request->session()->invalidate();
        $request->session()->regenerateToken();

        return redirect('/admin/masuk');
    }

    public function index(Request $request): View
    {
        $q = trim((string) $request->query('q', ''));
        $status = (string) $request->query('status', 'semua');
        // Akun toko (dibuat akun dapur) bukan pembeli aplikasi, jadi tidak ditampilkan di sini.
        $akun = User::query()
            ->whereNull('id_pemilik')
            ->with('pembelian')
            ->withCount('sesi')
            ->when($q !== '', fn ($b) => $b->where(fn ($w) => $w
                ->whereRaw('lower(name) like ?', ['%'.Str::lower($q).'%'])
                ->orWhere('username', 'like', '%'.Str::lower($q).'%')
                ->orWhere('email', 'like', '%'.Str::lower($q).'%')))
            ->when($status === 'lunas', fn ($b) => $b->where('aktif', true)->whereHas('pembelian', fn ($p) => $p->where('lunas', true)))
            ->when($status === 'belum', fn ($b) => $b->whereDoesntHave('pembelian', fn ($p) => $p->where('lunas', true)))
            ->when($status === 'nonaktif', fn ($b) => $b->where('aktif', false))
            ->orderByDesc('id')
            ->paginate(50)
            ->withQueryString();

        $ringkas = [
            'akun' => User::whereNull('id_pemilik')->count(),
            'lunas' => DB::table('pembelian')->where('lunas', true)->count(),
            'belum' => User::whereNull('id_pemilik')->whereDoesntHave('pembelian', fn ($p) => $p->where('lunas', true))->count(),
            'nonaktif' => User::whereNull('id_pemilik')->where('aktif', false)->count(),
            'pendapatan' => (int) DB::table('pembelian')->where('lunas', true)->sum('jumlah'),
        ];

        return view('admin.index', compact('akun', 'ringkas', 'q', 'status'));
    }

    public function formBaru(): View
    {
        return view('admin.akun-baru');
    }

    public function simpanBaru(Request $request, Akun $akun): RedirectResponse
    {
        $data = $request->validate([
            'nama' => 'required|string|min:2|max:60',
            'email' => ['required', 'email', 'max:190', Rule::unique('users', 'email')],
            ...$this->aturanPembelian(),
        ], ['email.unique' => 'Email ini sudah punya akun.']);
        $sandi = $akun->sandiAcak();
        $user = $akun->buat(trim($data['nama']), $data['email'], $sandi, $this->pembelianDari($request, $data));

        if ($request->boolean('kirim_email') && $akun->kirimDataAkun($user, $sandi)) {
            return redirect("/admin/akun/{$user->id}")->with('berhasil', "Akun dibuat. Username dan kata sandi sudah dikirim ke {$user->email}.");
        }

        return redirect("/admin/akun/{$user->id}")
            ->with('sandi_sekali', $sandi)
            ->with($request->boolean('kirim_email') ? 'gagal' : 'berhasil', $request->boolean('kirim_email')
                ? 'Akun dibuat, tetapi email gagal dikirim. Sampaikan kata sandi di bawah ini ke pembeli secara langsung.'
                : 'Akun dibuat. Sampaikan kata sandi di bawah ini ke pembeli.');
    }

    public function detail(User $user): View
    {
        $user->load('pembelian');
        $sesi = DB::table('sesi_masuk')->where('user_id', $user->id)->orderByDesc('terakhir_dipakai')->get();
        $jumlahData = DB::table('resep')->where('id_pengguna', $user->id)->where('dihapus', false)->count();

        return view('admin.akun-detail', compact('user', 'sesi', 'jumlahData'));
    }

    public function simpanProfil(Request $request, User $user): RedirectResponse
    {
        $data = $request->validate([
            'nama' => 'required|string|min:2|max:60',
            'email' => ['required', 'email', 'max:190', Rule::unique('users', 'email')->ignore($user->id)],
        ], ['email.unique' => 'Email ini sudah dipakai akun lain.']);
        $user->update(['name' => trim($data['nama']), 'email' => Str::lower(trim($data['email']))]);

        return back()->with('berhasil', 'Data akun disimpan.');
    }

    public function simpanPembelian(Request $request, User $user): RedirectResponse
    {
        $data = $request->validate($this->aturanPembelian());
        $user->pembelian()->updateOrCreate(['user_id' => $user->id], $this->pembelianDari($request, $data));
        if (! $request->boolean('lunas')) {
            DB::table('sesi_masuk')->where('user_id', $user->id)->delete();
        }

        return back()->with('berhasil', $request->boolean('lunas')
            ? 'Pembelian disimpan.'
            : 'Pembelian disimpan sebagai belum lunas. Akun ini tidak bisa masuk dan semua perangkatnya dikeluarkan.');
    }

    public function ubahAktif(Request $request, User $user): RedirectResponse
    {
        $aktif = $request->boolean('aktif');
        $user->update(['aktif' => $aktif]);
        if (! $aktif) {
            DB::table('sesi_masuk')->where('user_id', $user->id)->delete();
        }

        return back()->with('berhasil', $aktif ? 'Akun diaktifkan.' : 'Akun dinonaktifkan. Semua perangkatnya dikeluarkan.');
    }

    public function aturUlangSandi(User $user, Akun $akun): RedirectResponse
    {
        $sandi = $akun->sandiAcak();
        $user->update(['password' => $sandi]);
        DB::table('sesi_masuk')->where('user_id', $user->id)->delete();
        if ($akun->kirimDataAkun($user, $sandi, reset: true)) {
            return back()->with('berhasil', "Kata sandi baru sudah dikirim ke {$user->email}. Semua perangkat dikeluarkan.");
        }

        return back()->with('sandi_sekali', $sandi)->with('gagal', 'Kata sandi diganti, tetapi email gagal dikirim. Sampaikan kata sandi di bawah ini ke pembeli secara langsung.');
    }

    public function keluarkanPerangkat(User $user): RedirectResponse
    {
        $n = DB::table('sesi_masuk')->where('user_id', $user->id)->delete();

        return back()->with('berhasil', "{$n} perangkat dikeluarkan.");
    }

    public function tampilan(Situs $situs): View
    {
        return view('admin.tampilan', ['situs' => $situs->tampilan()]);
    }

    /**
     * Simpan logo atau foto latar Login. Gambar sudah diperkecil di browser (data URL di `gambar`),
     * supaya permintaan tetap di bawah batas 4,5 MB Vercel.
     */
    public function simpanTampilan(Request $request, string $jenis, Situs $situs, Foto $foto): RedirectResponse
    {
        abort_unless(isset(Situs::KUNCI[$jenis]), 404);
        $data = (string) $request->input('gambar', '');
        if (! preg_match('/^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+\/=]+)$/', $data, $m)) {
            return back()->with('gagal', 'Pilih gambar PNG, JPG, atau WebP dulu.');
        }
        try {
            $url = $foto->unggah(0, $m[1], $m[2], 'situs_'.$jenis);
        } catch (\RuntimeException $e) {
            return back()->with('gagal', $e->getMessage());
        }
        $situs->atur($jenis, $url);

        return back()->with('berhasil', $jenis === 'logo' ? 'Logo aplikasi diganti.' : 'Foto latar halaman Login diganti.');
    }

    public function hapusTampilan(string $jenis, Situs $situs): RedirectResponse
    {
        abort_unless(isset(Situs::KUNCI[$jenis]), 404);
        $situs->atur($jenis, '');

        return back()->with('berhasil', $jenis === 'logo' ? 'Logo kembali ke bawaan.' : 'Foto latar kembali ke bawaan.');
    }

    private function aturanPembelian(): array
    {
        return [
            'tanggal' => 'required|date',
            'jumlah' => 'required|integer|min:0|max:1000000000',
            'metode' => 'nullable|string|max:40',
            'catatan' => 'nullable|string|max:500',
        ];
    }

    private function pembelianDari(Request $request, array $data): array
    {
        return [
            'tanggal' => $data['tanggal'],
            'jumlah' => (int) $data['jumlah'],
            'metode' => trim((string) ($data['metode'] ?? '')),
            'lunas' => $request->boolean('lunas'),
            'catatan' => trim((string) ($data['catatan'] ?? '')),
        ];
    }
}
