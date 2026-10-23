<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** Email berisi username dan kata sandi: akun baru dari admin, atau kata sandi yang diatur ulang admin. */
class AkunBaru extends Mailable
{
    public function __construct(public User $user, public string $sandi, public bool $reset = false) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: $this->reset
            ? 'Kata sandi baru akun '.config('app.name').' Anda'
            : 'Akun '.config('app.name').' Anda sudah siap');
    }

    public function content(): Content
    {
        return new Content(markdown: 'email.akun-baru', with: [
            'nama' => $this->user->name,
            'username' => $this->user->username,
            'email' => $this->user->email,
            'sandi' => $this->sandi,
            'reset' => $this->reset,
            'url' => config('goodrecipes.frontend_url'),
        ]);
    }
}
