const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ====== KONFIG ======
const REF_CODE = 'P9WXSL';
const PASSWORD = 'qwertyui';

// ====== HELPER ======
async function wait(ms) { return new Promise(r => setTimeout(r, ms)); }
async function exists(page, selector, timeout = 0) {
  try {
    if (timeout > 0) await page.waitForSelector(selector, { timeout });
    return (await page.locator(selector).count()) > 0;
  } catch { return false; }
}

// ====== PROSES 1 EMAIL (flow login tidak diubah, hanya dibuat aman) ======
async function processEmailInBrowser(browser, email) {
  console.log(`\n=== Processing email: ${email} ===`);
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // Buka halaman
    await page.goto(`https://app.piggycell.io/?ref=${REF_CODE}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
    await page.waitForLoadState('networkidle', { timeout: 60000 });
    await wait(2500);

    // Connect Wallet (aman: cek dulu)
    if (!(await exists(page, 'button:has-text("Connect Wallet")', 40000))) {
      console.log('⚠️ Connect Wallet button not found');
      return false;
    }
    await page.getByRole('button', { name: /connect wallet/i }).first().click({ timeout: 40000 });
    await wait(1500);

    // Continue with Google → popup
    let googlePopup;
    try {
      [googlePopup] = await Promise.all([
        page.waitForEvent('popup', { timeout: 60000 }),
        page.getByRole('button', { name: /continue with google/i }).first().click({ timeout: 60000 })
      ]);
    } catch (e) {
      console.log('⚠️ Failed opening Google popup:', e.message);
      return false;
    }

    // Pastikan popup siap
    if (googlePopup.isClosed()) return false;
    await googlePopup.waitForLoadState('domcontentloaded', { timeout: 60000 }).catch(()=>{});
    await wait(2000);

    // Isi email (hanya jika field ada; kalau langsung account picker, step ini dilewati)
    if (!googlePopup.isClosed() && await exists(googlePopup, 'input[type="email"], input[name="identifier"]', 30000)) {
      await googlePopup.fill('input[type="email"], input[name="identifier"]', email, { timeout: 40000 }).catch(()=>{});
      await wait(1200);
      if (!googlePopup.isClosed() && await exists(googlePopup, 'button:has-text("Next"), #identifierNext', 10000)) {
        await googlePopup.click('button:has-text("Next"), #identifierNext', { timeout: 30000 }).catch(()=>{});
      }
    }

    // Tunggu password field jika ada
    if (!googlePopup.isClosed() && await exists(googlePopup, 'input[type="password"], input[name="password"]', 40000)) {
      await googlePopup.fill('input[type="password"], input[name="password"]', PASSWORD, { timeout: 40000 }).catch(()=>{});
      await wait(1200);
      if (!googlePopup.isClosed() && await exists(googlePopup, 'button:has-text("Next"), #passwordNext', 10000)) {
        await googlePopup.click('button:has-text("Next"), #passwordNext', { timeout: 30000 }).catch(()=>{});
      }
    }

    // Scroll + "Saya mengerti" (aman dari detachment)
    if (!googlePopup.isClosed()) {
      await googlePopup.evaluate(() => { try { window.scrollTo(0, document.body.scrollHeight); } catch(_){} }).catch(()=>{});
      await wait(1000);
      const sayaMengertiSelector = 'input[value="Saya mengerti"], button:has-text("Saya mengerti")';
      if (!googlePopup.isClosed() && await exists(googlePopup, sayaMengertiSelector)) {
        await googlePopup.click(sayaMengertiSelector, { timeout: 30000 }).catch(()=>{});
        console.log("✅ Klik 'Saya Mengerti'");
        await wait(800);
      }
    }

    // Continue (kalau ada)
    if (!googlePopup.isClosed() && await exists(googlePopup, 'button:has-text("Continue")', 20000)) {
      await googlePopup.click('button:has-text("Continue")', { timeout: 40000 }).catch(()=>{});
    }

    // Tunggu popup menutup, lalu JANGAN sentuh lagi googlePopup
    if (!googlePopup.isClosed()) {
      await googlePopup.waitForEvent('close', { timeout: 60000 }).catch(()=>{});
    }

    // Kembali ke main page
    await wait(3000);
    await page.waitForLoadState('networkidle', { timeout: 60000 }).catch(()=>{});
    await wait(1500);

    // Cek tombol Register sekali saja (sesuai opsi A: tanpa BACK/attempt-2)
    const hasRegister = await exists(page, 'button:has-text("Register")', 8000);
    if (hasRegister) {
      await page.click('button:has-text("Register")', { timeout: 40000 }).catch(()=>{});
      await wait(2000);
      console.log(`✅ SUCCESS: ${email}`);
      return true;
    }

    console.log('❌ FAILED: Register button not found after login');
    return false;

  } catch (err) {
    console.log(`❌ ERROR: ${email} - ${err.message || err}`);
    return false;
  } finally {
    await context.close().catch(()=>{});
  }
}

// Jalankan 1 email = 1 browser (anti-crash)
async function runOneEmail(email) {
  let browser;
  try {
    browser = await chromium.launch({ headless: false });
    return await processEmailInBrowser(browser, email);
  } catch (e) {
    console.log(`❌ BROWSER ERROR for ${email}: ${e.message || e}`);
    return false;
  } finally {
    if (browser) { try { await browser.close(); } catch {} }
  }
}

// Hapus satu kemunculan email dari file (rapi & FIFO)
function removeEmailLine(filePath, target) {
  try {
    const lines = fs.readFileSync(filePath, 'utf8').split('\n');
    const idx = lines.findIndex(l => l.trim() === target.trim());
    if (idx >= 0) {
      lines.splice(idx, 1);
      fs.writeFileSync(filePath, lines.join('\n'));
    }
  } catch (e) {
    console.log('⚠️ Unable to update email.txt:', e.message || e);
  }
}

// ====== MAIN: FIFO, retry 1x, log NORMAL ======
async function main() {
  const emailPath = path.join(__dirname, 'email.txt');
  const suksesPath = path.join(__dirname, 'sukses.txt');
  const gagalPath = path.join(__dirname, 'gagal.txt');

  if (!fs.existsSync(emailPath)) {
    console.log('email.txt not found!');
    return;
  }

  const emails = fs.readFileSync(emailPath, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
  const total = emails.length;
  console.log(`\nTotal Emails: ${total}`);

  for (let i = 0; i < total; i++) {
    const email = emails[i];
    console.log(`\n[${i + 1}/${total}] START: ${email}`);

    let ok = await runOneEmail(email);

    if (!ok) {
      console.log(`[${i + 1}/${total}] RETRY 1x: ${email}`);
      await wait(10000);
      ok = await runOneEmail(email);
    }

    if (ok) {
      console.log(`[${i + 1}/${total}] RESULT: SUCCESS → ${email}`);
      fs.appendFileSync(suksesPath, email + '\n');
      removeEmailLine(emailPath, email);
    } else {
      console.log(`[${i + 1}/${total}] RESULT: FAILED  → ${email}`);
      fs.appendFileSync(gagalPath, email + '\n');
    }

    await wait(4000);
  }

  console.log('\n🎉 ALL EMAILS FINISHED (ORDER PRESERVED)');
}

main();
