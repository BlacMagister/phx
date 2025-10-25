const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// === PROSES SATU EMAIL ===
async function processEmail(browser, email) {
	console.log(`\n=== Processing email: ${email} ===`);

	const context = await browser.newContext();
	const page = await context.newPage();

	try {
		// Buka halaman utama
		await page.goto('https://app.piggycell.io/?ref=P9WXSL', { waitUntil: 'domcontentloaded', timeout: 60000 });
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
		await googlePopup.fill('input[type="password"], input[name="password"]', 'qwertyui', { timeout: 50000 });
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
		await googlePopup.waitForEvent('close', { timeout: 60000 });

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
		await secondGooglePopup.waitForEvent('close', { timeout: 50000 });

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
		await context.close();
	}
}

// === MAIN LOOP ===
async function main() {
	const browser = await chromium.launch({ headless: false });

	try {
		const emailPath = path.join(__dirname, 'email.txt');
		const suksesPath = path.join(__dirname, 'sukses.txt');

		if (!fs.existsSync(emailPath)) {
			console.log('email.txt not found!');
			return;
		}

		let emails = fs.readFileSync(emailPath, 'utf8').trim().split('\n').filter(email => email.trim());
		console.log(`Found ${emails.length} emails to process`);

		for (let i = 0; i < emails.length; i++) {
			const email = emails[i].trim();
			if (!email) continue;

			console.log(`\n[${i + 1}/${emails.length}] Processing: ${email}`);

			const result = await processEmail(browser, email);

			if (result === 'retry') {
				console.log(`⏳ Too many requests, waiting 5 minutes...`);
				await new Promise(resolve => setTimeout(resolve, 300000));
				i--;
				continue;
			} else if (result === true) {
				fs.appendFileSync(suksesPath, email + '\n');
				emails = emails.filter(e => e.trim() !== email.trim());
				fs.writeFileSync(emailPath, emails.join('\n'));
			}

			console.log('⏳ Waiting 4 seconds before next email...');
			await new Promise(resolve => setTimeout(resolve, 4000));
		}

		console.log('\n🎉 All emails processed!');

	} catch (error) {
		console.error('Error:', error);
	} finally {
		await browser.close();
	}
}

main();
