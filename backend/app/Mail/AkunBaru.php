<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** Email setelah daftar: berisi username dan kata sandi pertama. */
class AkunBaru extends Mailable
{
    public function __construct(public User $user, public string $sandi) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Akun '.config('app.name').' Anda sudah siap');
    }

    public function content(): Content
    {
        return new Content(markdown: 'email.akun-baru', with: [
            'nama' => $this->user->name,
            'username' => $this->user->username,
            'email' => $this->user->email,
            'sandi' => $this->sandi,
            'url' => config('goodrecipes.frontend_url'),
        ]);
    }
}
