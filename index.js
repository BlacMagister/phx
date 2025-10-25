const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// === KONFIGURASI ===
const REF_CODE = 'P9WXSL';
const PASSWORD = 'qwertyui';

// === PROSES SATU EMAIL (FLOW LOGIN TIDAK DIUBAH) ===
async function processEmailInBrowser(browser, email) {
	console.log(`\n=== Processing email: ${email} ===`);

	const context = await browser.newContext();
	const page = await context.newPage();

	try {
		// Buka halaman utama
		await page.goto(`https://app.piggycell.io/?ref=${REF_CODE}`, { waitUntil: 'domcontentloaded', timeout: 60000 });
		await page.waitForLoadState('networkidle', { timeout: 60000 });
		await page.waitForTimeout(3000);

		// Klik Connect Wallet
		await page.getByRole('button', { name: /connect wallet/i })
			.first().click({ timeout: 40000 });
		await page.waitForTimeout(2000);

		// Munculkan popup Google
		let googlePopup;
		[googlePopup] = await Promise.all([
			page.waitForEvent('popup', { timeout: 60000 }),
			page.getByRole('button', { name: /continue with google/i }).first().click({ timeout: 60000 })
		]);

		// Tunggu popup login
		await googlePopup.waitForLoadState('domcontentloaded', { timeout: 60000 });
		await googlePopup.waitForTimeout(2500);

		// Isi Email
		await googlePopup.fill('input[type="email"], input[name="identifier"]', email, { timeout: 50000 });
		await googlePopup.waitForTimeout(2000);
		await googlePopup.click('button:has-text("Next"), #identifierNext', { timeout: 50000 });

		// Tunggu password
		await googlePopup.waitForSelector('input[type="password"], input[name="password"]', { timeout: 60000 });
		await googlePopup.waitForTimeout(2000);

		// Isi password
		await googlePopup.fill('input[type="password"], input[name="password"]', PASSWORD, { timeout: 50000 });
		await googlePopup.waitForTimeout(2000);
		await googlePopup.click('button:has-text("Next"), #passwordNext', { timeout: 50000 });

		// Scroll → cek "Saya mengerti"
		await googlePopup.waitForTimeout(3000);
		await googlePopup.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
		await googlePopup.waitForTimeout(2000);

		const sayaMengertiSelector = 'input[value="Saya mengerti"], button:has-text("Saya mengerti")';
		const hasSayaMengerti = await googlePopup.locator(sayaMengertiSelector).count()
			.then(c => c > 0).catch(() => false);

		if (hasSayaMengerti) {
			await googlePopup.click(sayaMengertiSelector, { timeout: 30000 }).catch(() => {});
			console.log("✅ Klik tombol 'Saya Mengerti'");
			await googlePopup.waitForTimeout(2000);
		}

		// Klik Continue
		await googlePopup.click('button:has-text("Continue")', { timeout: 60000 }).catch(() => {});
		await googlePopup.waitForEvent('close', { timeout: 60000 }).catch(() => {});

		// Tunggu loading selesai
		await page.waitForTimeout(5000);
		await page.waitForLoadState('networkidle', { timeout: 60000 });

		// Cek tombol Register
		let hasRegisterButton = await page.locator('button:has-text("Register")').isVisible().catch(() => false);
		if (hasRegisterButton) {
			await page.click('button:has-text("Register")', { timeout: 60000 });
			await page.waitForTimeout(3000);
			console.log(`✅ SUCCESS: ${email}`);
			return true;
		}

		// Jika tombol Register tidak muncul → BACK → klik Continue with Google lagi
		console.log('No Register button, trying 2nd Google click...');
		await page.goBack({ timeout: 60000 });
		await page.waitForTimeout(4000);
		await page.waitForLoadState('networkidle', { timeout: 60000 });

		const [secondGooglePopup] = await Promise.all([
			page.waitForEvent('popup', { timeout: 60000 }),
			page.getByRole('button', { name: /continue with google/i }).first().click({ timeout: 60000 })
		]);

		await secondGooglePopup.waitForLoadState('domcontentloaded', { timeout: 60000 });
		await secondGooglePopup.waitForTimeout(3000);
		await secondGooglePopup.click('div[role="button"]', { timeout: 50000 }).catch(() => {});
		await secondGooglePopup.waitForTimeout(2000);
		await secondGooglePopup.click('button:has-text("Continue")', { timeout: 50000 });
		await secondGooglePopup.waitForEvent('close', { timeout: 50000 }).catch(() => {});

		await page.waitForTimeout(5000);
		await page.waitForLoadState('networkidle', { timeout: 60000 });

		hasRegisterButton = await page.locator('button:has-text("Register")').isVisible().catch(() => false);

		if (hasRegisterButton) {
			await page.click('button:has-text("Register")', { timeout: 60000 });
			await page.waitForTimeout(3000);
			console.log(`✅ SUCCESS: ${email}`);
			return true;
		} else {
			console.log(`❌ FAILED: ${email} - No Register button`);
			return false;
		}

	} catch (error) {
		console.log(`❌ ERROR: ${email} - ${error.message}`);
		return false;
	} finally {
		await context.close().catch(() => {});
	}
}

// === JALANKAN 1 EMAIL DENGAN 1 BROWSER (ANTI-CRASH) ===
async function runOneEmail(email) {
	let browser;
	try {
		browser = await chromium.launch({ headless: false });
		const ok = await processEmailInBrowser(browser, email);
		return ok === true;
	} catch (e) {
		console.log(`❌ BROWSER ERROR for ${email}: ${e.message || e}`);
		return false;
	} finally {
		if (browser) {
			try { await browser.close(); } catch {}
		}
	}
}

// === MAIN LOOP: FIFO, RETRY 1x, LOG NORMAL ===
async function main() {
	const emailPath = path.join(__dirname, 'email.txt');
	const suksesPath = path.join(__dirname, 'sukses.txt');
	const gagalPath = path.join(__dirname, 'gagal.txt');

	if (!fs.existsSync(emailPath)) {
		console.log('email.txt not found!');
		return;
	}

	// Muat urutan email (FIFO) tanpa diubah-ubah selama iterasi
	const emails = fs.readFileSync(emailPath, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
	const total = emails.length;
	console.log(`\nTotal Emails: ${total}`);

	for (let i = 0; i < total; i++) {
		const email = emails[i];
		console.log(`\n[${i + 1}/${total}] START: ${email}`);

		// Attempt #1
		let ok = await runOneEmail(email);

		// Retry 1x bila gagal
		if (!ok) {
			console.log(`[${i + 1}/${total}] RETRY 1x: ${email}`);
			await new Promise(r => setTimeout(r, 10000));
			ok = await runOneEmail(email);
		}

		// Hasil final
		if (ok) {
			console.log(`[${i + 1}/${total}] RESULT: SUCCESS → ${email}`);
			fs.appendFileSync(suksesPath, email + '\n');
			// Hapus 1x kemunculan email dari email.txt (supaya rapi)
			safelyRemoveEmailFromFile(emailPath, email);
		} else {
			console.log(`[${i + 1}/${total}] RESULT: FAILED  → ${email}`);
			fs.appendFileSync(gagalPath, email + '\n');
		}

		// Jeda antar email (normal)
		await new Promise(r => setTimeout(r, 4000));
	}

	console.log('\n🎉 ALL EMAILS FINISHED (ORDER PRESERVED)');
}

// Hapus satu kemunculan pertama dari email.txt (agar tidak acak & tetap sinkron)
function safelyRemoveEmailFromFile(filePath, target) {
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

main();
