const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function processEmail(browser, email) {
	console.log(`\n=== Processing email: ${email} ===`);
	
	const context = await browser.newContext();
	const page = await context.newPage();

	try {
		await page.goto('https://app.piggycell.io/?ref=P9WXSL', { waitUntil: 'domcontentloaded', timeout: 60000 });
		await page.waitForLoadState('networkidle', { timeout: 60000 });
		await page.waitForTimeout(3000);

		const connectButton = page.getByRole('button', { name: /connect wallet/i });
		await connectButton.first().click({ timeout: 40000 });
		await page.waitForTimeout(2000);

		let googlePopup;
		try {
			[googlePopup] = await Promise.all([
				page.waitForEvent('popup', { timeout: 50000 }),
				page.getByRole('button', { name: /continue with google/i }).first().click({ timeout: 50000 })
			]);
		} catch (e) {
			const mainPageContent = await page.textContent('body').catch(() => null);
			const currentUrl = page.url();
			
			if (currentUrl.includes('auth.web3auth.io') && mainPageContent && mainPageContent.includes('Too many requests')) {
				console.log(`⚠️ Too many requests for ${email}. Retry later`);
				return 'retry';
			}
			throw e;
		}

		await googlePopup.waitForLoadState('domcontentloaded', { timeout: 60000 });
		await page.waitForTimeout(3000);

		const popupContent = await googlePopup.textContent('body').catch(() => null);
		const popupUrl = googlePopup.url();
		if (popupUrl.includes('auth.web3auth.io') && popupContent && popupContent.includes('Too many requests')) {
			console.log(`⚠️ Too many requests (popup)`);
			await googlePopup.close().catch(() => {});
			return 'retry';
		}

		await googlePopup.fill('input[type="email"], input[name="identifier"]', email, { timeout: 50000 });
		await googlePopup.waitForTimeout(2000);
		await googlePopup.click('button:has-text("Next"), #identifierNext', { timeout: 50000 });

		await googlePopup.waitForSelector('input[type="password"], input[name="password"]', { timeout: 60000 });
		await googlePopup.waitForTimeout(2000);

		await googlePopup.fill('input[type="password"], input[name="password"]', 'qwertyui', { timeout: 50000 });
		await googlePopup.waitForTimeout(2000);
		await googlePopup.click('button:has-text("Next"), #passwordNext', { timeout: 50000 });

		await googlePopup.waitForTimeout(4000);
		await googlePopup.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
		await googlePopup.waitForTimeout(2000);

		await googlePopup.click('button:has-text("Continue")', { timeout: 60000 }).catch(() => {});
		await googlePopup.waitForEvent('close', { timeout: 60000 });

		console.log('Waiting after login...');
		await page.waitForTimeout(5000);
		await page.waitForLoadState('networkidle', { timeout: 60000 });

		let hasRegisterButton = await page.locator('button:has-text("Register")').isVisible().catch(() => false);

		if (hasRegisterButton) {
			await page.click('button:has-text("Register")', { timeout: 60000 });
			await page.waitForTimeout(3000);
			console.log(`✅ SUCCESS: ${email}`);
			return true;
		}

		console.log('No Register button, going back...');
		await page.goBack({ timeout: 60000 });
		await page.waitForTimeout(4000);
		await page.waitForLoadState('networkidle', { timeout: 60000 });

		const [secondGooglePopup] = await Promise.all([
			page.waitForEvent('popup', { timeout: 60000 }),
			page.getByRole('button', { name: /continue with google/i }).first().click({ timeout: 60000 })
		]);

		await secondGooglePopup.waitForLoadState('domcontentloaded', { timeout: 60000 });
		await secondGooglePopup.waitForTimeout(3000);

		await secondGooglePopup.click(`div[role="button"]`, { timeout: 50000 }).catch(() => {});
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
