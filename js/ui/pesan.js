// Toast dan dialog konfirmasi yang bisa dipanggil dari mana saja.

import { html, useState, useEffect, useRef } from '../../vendor/preact-htm.js';

const pendengar = new Set();
let toastSaatIni = null;
let konfirmasiSaatIni = null;
let jadwalToast = null;

const kabari = () => pendengar.forEach((fn) => fn());

export function tampilToast(teks, ms = 3200) {
  toastSaatIni = { teks, id: Math.random() };
  clearTimeout(jadwalToast);
  jadwalToast = setTimeout(() => {
    toastSaatIni = null;
    kabari();
  }, ms);
  kabari();
}

/** Tanya ya/tidak. Mengembalikan Promise<boolean>. */
export function tanya({ judul, teks = '', ya = 'Ya', tidak = 'Batal', bahaya = false }) {
  return new Promise((selesai) => {
    konfirmasiSaatIni = { judul, teks, ya, tidak, bahaya, selesai };
    kabari();
  });
}

const tutupKonfirmasi = (hasil) => {
  const k = konfirmasiSaatIni;
  konfirmasiSaatIni = null;
  kabari();
  k?.selesai(hasil);
};

/** Kunci gulir halaman selama dialog terbuka dan kembalikan fokus setelah ditutup. */
export function useDialog(onTutup) {
  const ref = useRef(null);
  useEffect(() => {
    const sebelum = document.activeElement;
    const gulir = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    ref.current?.focus();
    const tombol = (e) => {
      if (e.key === 'Escape') {
        e.stopPropagation();
        onTutup();
      }
    };
    document.addEventListener('keydown', tombol);
    return () => {
      document.removeEventListener('keydown', tombol);
      document.body.style.overflow = gulir;
      if (sebelum && sebelum.focus) sebelum.focus();
    };
  }, []);
  return ref;
}

export function Modal({ judul, onTutup, children }) {
  const ref = useDialog(onTutup);
  return html`<div class="latar" onClick=${(e) => e.target === e.currentTarget && onTutup()}>
    <div class="lembar" role="dialog" aria-modal="true" aria-label=${judul} tabindex="-1" ref=${ref}>
      <h2>${judul}</h2>
      ${children}
    </div>
  </div>`;
}

export function PesanHost() {
  const [, paksa] = useState(0);
  useEffect(() => {
    const fn = () => paksa((n) => n + 1);
    pendengar.add(fn);
    return () => pendengar.delete(fn);
  }, []);
  const k = konfirmasiSaatIni;
  return html`<${Fragmen}>
    ${k &&
    html`<${Modal} judul=${k.judul} onTutup=${() => tutupKonfirmasi(false)}>
      ${k.teks && html`<p style="color:var(--ink2);line-height:1.5">${k.teks}</p>`}
      <div class="baris-btn">
        <button class="btn abu lebar" onClick=${() => tutupKonfirmasi(false)}>${k.tidak}</button>
        <button class=${'btn solid lebar' + (k.bahaya ? ' bahaya' : '')} onClick=${() => tutupKonfirmasi(true)}>${k.ya}</button>
      </div>
    <//>`}
    ${toastSaatIni && html`<div class="toast" role="status" key=${toastSaatIni.id}>${toastSaatIni.teks}</div>`}
  <//>`;
}

function Fragmen({ children }) {
  return children;
}
