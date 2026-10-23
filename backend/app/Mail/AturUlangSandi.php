<?php

namespace App\Mail;

use App\Models\User;
use Illuminate\Mail\Mailable;
use Illuminate\Mail\Mailables\Content;
use Illuminate\Mail\Mailables\Envelope;

/** Email lupa kata sandi: tautan untuk membuat kata sandi baru (berlaku 60 menit). */
class AturUlangSandi extends Mailable
{
    public function __construct(public User $user, public string $url) {}

    public function envelope(): Envelope
    {
        return new Envelope(subject: 'Buat kata sandi baru '.config('app.name'));
    }

    public function content(): Content
    {
        return new Content(markdown: 'email.atur-ulang-sandi', with: [
            'nama' => $this->user->name,
            'username' => $this->user->username,
            'url' => $this->url,
        ]);
    }
}
