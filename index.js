const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// === PROSES SATU EMAIL (TIDAK DIUBAH) ===
async function processEmail(browser, email) {
	console.log(`\n=== Processing email: ${email} ===`);

	const context = await browser.newContext();
	const page = await context.newPage();

	try {
		await page.goto('https://app.piggycell.io/?ref=P9WXSL', { waitUntil: 'domcontentloaded', timeout: 60000 });
		await page.waitForLoadState('networkidle', { timeout: 60000 });
		await page.waitForTimeout(3000);

		await page.getByRole('button', { name: /connect wallet/i })
			.first().click({ timeout: 40000 });
		await page.waitForTimeout(2000);

		let googlePopup;
		[googlePopup] = await Promise.all([
			page.waitForEvent('popup', { timeout: 60000 }),
			page.getByRole('button', { name: /continue with google/i }).first().click({ timeout: 60000 })
		]);

		await googlePopup.waitForLoadState('domcontentloaded', { timeout: 60000 });
		await googlePopup.waitForTimeout(2500);

		await googlePopup.fill('input[type="email"], input[name="identifier"]', email, { timeout: 50000 });
		await googlePopup.waitForTimeout(2000);
		await googlePopup.click('button:has-text("Next"), #identifierNext', { timeout: 50000 });

		await googlePopup.waitForSelector('input[type="password"], input[name="password"]', { timeout: 60000 });
		await googlePopup.waitForTimeout(2000);

		await googlePopup.fill('input[type="password"], input[name="password"]', 'qwertyui', { timeout: 50000 });
		await googlePopup.waitForTimeout(2000);
		await googlePopup.click('button:has-text("Next"), #passwordNext', { timeout: 50000 });

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

		await googlePopup.click('button:has-text("Continue")', { timeout: 60000 }).catch(() => {});
		await googlePopup.waitForEvent('close', { timeout: 60000 });

		await page.waitForTimeout(5000);
		await page.waitForLoadState('networkidle', { timeout: 60000 });

		let hasRegisterButton = await page.locator('button:has-text("Register")').isVisible().catch(() => false);
		if (hasRegisterButton) {
			await page.click('button:has-text("Register")', { timeout: 60000 });
			await page.waitForTimeout(3000);
			console.log(`✅ SUCCESS: ${email}`);
			return true;
		}

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

// === MAIN LOOP (DIPERBAIKI) ===
async function main() {
	const browser = await chromium.launch({ headless: false });

	try {
		const emailPath = path.join(__dirname, 'email.txt');
		const suksesPath = path.join(__dirname, 'sukses.txt');
		const gagalPath = path.join(__dirname, 'gagal.txt');

		if (!fs.existsSync(emailPath)) {
			console.log('email.txt not found!');
			return;
		}

		let emails = fs.readFileSync(emailPath, 'utf8').trim().split('\n').filter(email => email.trim());
		console.log(`\nTotal Emails: ${emails.length}`);

		let index = 0;
		while (index < emails.length) {
			const email = emails[index];
			console.log(`\n[${index + 1}/${emails.length}] START: ${email}`);

			let result = await processEmail(browser, email);

			// Retry satu kali jika gagal
			if (result !== true) {
				console.log(`🔁 RETRY 1x: ${email}`);
				await new Promise(resolve => setTimeout(resolve, 10000));
				result = await processEmail(browser, email);
			}

			// hasil final
			if (result === true) {
				console.log(`✅ FINAL SUCCESS: ${email}`);
				fs.appendFileSync(suksesPath, email + '\n');
			} else {
				console.log(`❌ FINAL FAILED: ${email}`);
				fs.appendFileSync(gagalPath, email + '\n');
			}

			index++;
			console.log(`⏳ Delay before next email...`);
			await new Promise(resolve => setTimeout(resolve, 4000));
		}

		console.log('\n🎉 ALL EMAILS FINISHED (ORDER OK)');
	} catch (error) {
		console.error('Error Main:', error);
	} finally {
		await browser.close();
	}
}

main();
