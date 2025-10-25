const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// ====== KONFIG ======
const REF_CODE = 'P9WXSL';
const PASSWORD = 'qwertyui';

// ====== HELPER ======
const wait = (ms) => new Promise(r => setTimeout(r, ms));
async function exists(pageOrPopup, selector, timeout = 0) {
  try {
    if (timeout > 0) await pageOrPopup.waitForSelector(selector, { timeout });
    return (await pageOrPopup.locator(selector).count()) > 0;
  } catch { return false; }
}

// ====== PROSES 1 EMAIL (flow login dipertahankan, dibuat aman & sabar) ======
async function processEmailInBrowser(browser, email) {
  console.log(`\n=== Processing email: ${email} ===`);
  const context = await browser.newContext();
  const page = await context.newPage();

  try {
    // 1) Buka halaman
    await page.goto(`https://app.piggycell.io/?ref=${REF_CODE}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
    await page.waitForLoadState('networkidle', { timeout: 90000 });
    await wait(3000);

    // 2) Klik Connect Wallet (cek dulu)
    if (!(await exists(page, 'button:has-text("Connect Wallet")', 60000))) {
      console.log('⚠️ Connect Wallet button not found');
      return false;
    }
    await page.getByRole('button', { name: /connect wallet/i }).first().click({ timeout: 60000 });
    await wait(2000);

    // 3) Klik Continue with Google → tunggu popup
    let googlePopup;
    try {
      [googlePopup] = await Promise.all([
        page.waitForEvent('popup', { timeout: 90000 }),
        page.getByRole('button', { name: /continue with google/i }).first().click({ timeout: 90000 })
      ]);
    } catch (e) {
      console.log('⚠️ Failed to open Google popup:', e.message);
      return false;
    }

    // 4) Pastikan popup siap
    if (googlePopup.isClosed()) return false;
    await googlePopup.waitForLoadState('domcontentloaded', { timeout: 90000 }).catch(()=>{});
    await wait(2500);

    // 5) Isi email (bila ada field email; jika account picker langsung muncul, step ini dilewati)
    if (!googlePopup.isClosed() && await exists(googlePopup, 'input[type="email"], input[name="identifier"]', 60000)) {
      await googlePopup.fill('input[type="email"], input[name="identifier"]', email, { timeout: 90000 }).catch(()=>{});
      await wait(1500);
      if (!googlePopup.isClosed() && await exists(googlePopup, 'button:has-text("Next"), #identifierNext', 30000)) {
        await googlePopup.click('button:has-text("Next"), #identifierNext', { timeout: 60000 }).catch(()=>{});
      }
    }

    // 6) Tunggu & isi password (bila diminta)
    if (!googlePopup.isClosed() && await exists(googlePopup, 'input[type="password"], input[name="password"]', 90000)) {
      await googlePopup.fill('input[type="password"], input[name="password"]', PASSWORD, { timeout: 90000 }).catch(()=>{});
      await wait(1500);
      if (!googlePopup.isClosed() && await exists(googlePopup, 'button:has-text("Next"), #passwordNext', 30000)) {
        await googlePopup.click('button:has-text("Next"), #passwordNext', { timeout: 60000 }).catch(()=>{});
      }
    }

    // 7) Scroll ke bawah + klik "Saya mengerti" bila ada
    if (!googlePopup.isClosed()) {
      await googlePopup.evaluate(() => { try { window.scrollTo(0, document.body.scrollHeight); } catch(_){} }).catch(()=>{});
      await wait(1500);
      const sayaMengertiSelector = 'input[value="Saya mengerti"], button:has-text("Saya mengerti"), text=Saya mengerti';
      if (!googlePopup.isClosed() && await exists(googlePopup, sayaMengertiSelector)) {
        await googlePopup.click(sayaMengertiSelector, { timeout: 60000 }).catch(()=>{});
        console.log("✅ Klik 'Saya Mengerti'");
        await wait(1000);
      }
    }

    // 8) Klik Continue (kalau ada), lalu tunggu popup tertutup
    if (!googlePopup.isClosed() && await exists(googlePopup, 'button:has-text("Continue")', 60000)) {
      await googlePopup.click('button:has-text("Continue")', { timeout: 90000 }).catch(()=>{});
    }
    if (!googlePopup.isClosed()) {
      await googlePopup.waitForEvent('close', { timeout: 90000 }).catch(()=>{});
    }

    // 9) Kembali ke main page, sabar tunggu
    await wait(4000);
    await page.waitForLoadState('networkidle', { timeout: 90000 }).catch(()=>{});
    await wait(2000);

    // 10) Cek tombol Register sekali saja (tanpa BACK/attempt 2)
    if (await exists(page, 'button:has-text("Register")', 10000)) {
      await page.click('button:has-text("Register")', { timeout: 90000 }).catch(()=>{});
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

// ====== Jalankan 1 email = 1 browser (ANTI-CRASH) ======
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

// ====== Utilities ======
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

// ====== MAIN: FIFO, Retry 1x, LOG NORMAL ======
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
      await wait(10000); // jeda sebelum retry
      ok = await runOneEmail(email);
    }

    if (ok) {
      console.log(`[${i + 1}/${total}] RESULT: SUCCESS → ${email}`);
      fs.appendFileSync(suksesPath, email + '\n');
      removeEmailLine(emailPath, email);
    } else {
      console.log(`[${i + 1}/${total}] RESULT: FAILED  → ${email}`);
      fs.appendFileSync(gagalPath, email + '\n');
      // (tidak hapus dari email.txt agar bisa kamu review/ulang manual)
    }

    await wait(4000); // jeda antar email (tidak agresif)
  }

  console.log('\n🎉 ALL EMAILS FINISHED (ORDER PRESERVED)');
}

main();
