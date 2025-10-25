const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

async function processEmail(browser, email) {
	console.log(`\n=== Processing email: ${email} ===`);

	const context = await browser.newContext();
	const page = await context.newPage();

	try {
		await page.goto('https://app.piggycell.io/?ref=P9WXSL', { waitUntil: 'domcontentloaded', timeout: 90000 });
		await page.waitForLoadState('networkidle', { timeout: 90000 });
		await page.waitForTimeout(3000);

		await page.getByRole('button', { name: /connect wallet/i }).first().click({ timeout: 60000 });
		await page.waitForTimeout(2000);

		let googlePopup;
		[googlePopup] = await Promise.all([
			page.waitForEvent('popup', { timeout: 90000 }),
			page.getByRole('button', { name: /continue with google/i }).first().click({ timeout: 90000 })
		]);

		await googlePopup.waitForLoadState('domcontentloaded', { timeout: 90000 });
		await googlePopup.waitForTimeout(2500);

		if (await googlePopup.locator('input[type="email"], input[name="identifier"]').count() > 0) {
			await googlePopup.fill('input[type="email"], input[name="identifier"]', email, { timeout: 90000 });
			await googlePopup.waitForTimeout(1500);
			await googlePopup.click('button:has-text("Next"), #identifierNext', { timeout: 60000 }).catch(()=>{});
		}

		if (await googlePopup.locator('input[type="password"], input[name="password"]').count() > 0) {
			await googlePopup.waitForTimeout(2000);
			await googlePopup.fill('input[type="password"], input[name="password"]', 'qwertyui', { timeout: 90000 });
			await googlePopup.waitForTimeout(1500);
			await googlePopup.click('button:has-text("Next"), #passwordNext', { timeout: 60000 }).catch(()=>{});
		}

		// === AUTO SCROLL & SAYA MENGERTI FIX ===
		for (let i = 0; i < 3; i++) {
			if (!googlePopup.isClosed()) {
				await googlePopup.evaluate(() => { try { window.scrollTo(0, document.body.scrollHeight); } catch(_){} }).catch(()=>{});
				await googlePopup.waitForTimeout(1200);
			}
		}

		const sayaMengertiSelectors = [
			'input[value="Saya mengerti"]',
			'button:has-text("Saya mengerti")',
			'text="Saya mengerti"',
			'text=Saya mengerti'
		];

		for (const sel of sayaMengertiSelectors) {
			if (!googlePopup.isClosed() && await googlePopup.locator(sel).count() > 0) {
				await googlePopup.click(sel, { timeout: 60000 }).catch(()=>{});
				await googlePopup.waitForTimeout(1200);
			}
		}
		// === END FIX ===

		if (!googlePopup.isClosed() && await googlePopup.locator('button:has-text("Continue")').count() > 0) {
			await googlePopup.click('button:has-text("Continue")', { timeout: 90000 }).catch(()=>{});
		}

		if (!googlePopup.isClosed()) {
			await googlePopup.waitForEvent('close', { timeout: 90000 }).catch(()=>{});
		}

		await page.waitForTimeout(4000);
		await page.waitForLoadState('networkidle', { timeout: 90000 });
		await page.waitForTimeout(2000);

		const hasRegisterButton = await page.locator('button:has-text("Register")').count();
		if (hasRegisterButton > 0) {
			await page.click('button:has-text("Register")', { timeout: 90000 }).catch(()=>{});
			await page.waitForTimeout(2000);
			console.log(`✅ SUCCESS: ${email}`);
			return true;
		}

		console.log(`❌ FAILED (NO REGISTER): ${email}`);
		return false;

	} catch (err) {
		console.log(`❌ ERROR: ${email} - ${err.message}`);
		return false;
	} finally {
		await context.close().catch(()=>{});
	}
}

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

		let ok = false;
		let browser = await chromium.launch({ headless: false });
		ok = await processEmail(browser, email);
		await browser.close().catch(()=>{});

		if (!ok) {
			console.log(`[${i + 1}/${total}] RETRY 1x: ${email}`);
			await new Promise(r => setTimeout(r, 8000));
			browser = await chromium.launch({ headless: false });
			ok = await processEmail(browser, email);
			await browser.close().catch(()=>{});
		}

		if (ok) fs.appendFileSync(suksesPath, email + '\n');
		else fs.appendFileSync(gagalPath, email + '\n');

		await new Promise(r => setTimeout(r, 4000));
	}

	console.log('\n🎉 ALL DONE — ORDER PRESERVED');
}

main();
