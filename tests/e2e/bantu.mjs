// Bantuan bersama untuk uji e2e.

/** Masuk ke akun uji lewat layar Masuk, memakai tiruan akun dev-server (kata sandi kunci-dev). */
export async function masukUji(page, base, { login = 'chef@uji.test', sandi = 'kunci-dev' } = {}) {
  await page.goto(base + '/');
  await page.locator('#login-akun').waitFor();
  const ganti = page.getByRole('button', { name: 'ganti', exact: true });
  if (await ganti.count()) await ganti.click();
  await page.getByLabel('Alamat server (API)').fill(base + '/api');
  await page.getByRole('button', { name: 'Pakai server ini' }).click();
  await page.locator('#login-akun').fill(login);
  await page.locator('#sandi-akun').fill(sandi);
  await page.getByRole('button', { name: 'Masuk', exact: true }).click();
  await page.locator('#login-akun').waitFor({ state: 'detached' });
}

/** Chrome/Chromium yang ada di komputer: CHROMIUM=..., atau lokasi umum di Linux/Windows/Mac. */
export async function cariBrowser() {
  const fs = await import('node:fs');
  const calon = [
    process.env.CHROMIUM,
    '/opt/pw-browsers/chromium',
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/usr/bin/chromium',
    '/usr/bin/google-chrome',
  ].filter(Boolean);
  return calon.find((c) => fs.existsSync(c)) || calon[0];
}
