<?php

namespace App\Http\Middleware;

use App\Models\Admin;
use Closure;
use Illuminate\Http\Request;
use Illuminate\Support\Facades\View;
use Symfony\Component\HttpFoundation\Response;

/** Halaman /admin hanya untuk admin yang sudah masuk (sesi berisi admin_id). */
class HarusAdmin
{
    public function handle(Request $request, Closure $next): Response
    {
        $admin = Admin::find($request->session()->get('admin_id'));
        if (! $admin) {
            $request->session()->forget('admin_id');

            return redirect('/admin/masuk');
        }
        $request->attributes->set('admin', $admin);
        View::share('admin', $admin);

        return $next($request);
    }
}
