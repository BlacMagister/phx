const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// CONFIG
const REF_CODE = 'P9WXSL';
const PASSWORD = 'qwertyui';
const MAX_RETRIES = 3; // percobaan per email sebelum dipindahkan ke gagal.txt
const WAIT_SMALL = 2000;
const WAIT_MED = 4000;
const WAIT_LONG = 60000;

// helper: safe click (cek existence & visibility dulu)
async function safeClick(locatorOrPage, selectorOrOptions = {}, fallbackTimeout = 30000) {
	try {
		// locatorOrPage can be a Page or Locator
		if (typeof locatorOrPage.click === 'function' && typeof selectorOrOptions === 'object' && selectorOrOptions.selector) {
			// page + { selector: '...' } style
			const { selector, timeout } = selectorOrOptions;
			const t = timeout ?? fallbackTimeout;
			await locatorOrPage.waitForSelector(selector, { timeout: t });
			await locatorOrPage.click(selector, { timeout: t });
		} else if (typeof locatorOrPage.click === 'function' && typeof selectorOrOptions === 'string') {
			// page.click(selector)
			await locatorOrPage.waitForSelector(selectorOrOptions, { timeout: fallbackTimeout });
			await locatorOrPage.click(selectorOrOptions, { timeout: fallbackTimeout });
		} else {
			// assume locator (Locator)
			await locatorOrPage.click();
		}
		return true;
	} catch (e) {
		return false;
	}
}

// helper: safe fill
async function safeFill(pageOrLocator, selector, value, timeout = 40000) {
	try {
		if (typeof pageOrLocator.fill === 'function') {
			// locator
			await pageOrLocator.fill(value, { timeout });
		} else {
			// page + selector
			await pageOrLocator.waitForSelector(selector, { timeout });
			await pageOrLocator.fill(selector, value, { timeout });
		}
		return true;
	} catch (e) {
		return false;
	}
}

// human-like wait
async function humanWait(msMin = 2000, msMax = 5000) {
	const ms = msMin + Math.floor(Math.random() * (msMax - msMin + 1));
	return new Promise(r => setTimeout(r, ms));
}

// function untuk menangani satu email (lebih robust)
async function processEmail(browser, email) {
	console.log(`\n=== Processing: ${email} ===`);
	const context = await browser.newContext();
	const page = await context.newPage();

	try {
		// buka halaman
		await page.goto(`https://app.piggycell.io/?ref=${REF_CODE}`, { waitUntil: 'domcontentloaded', timeout: WAIT_LONG });
		await page.waitForLoadState('networkidle', { timeout: WAIT_LONG });
		await humanWait(WAIT_SMALL, WAIT_MED);

		// klik connect wallet (cek dulu ada)
		const connectLocator = page.getByRole('button', { name: /connect wallet/i }).first();
		const canConnect = await connectLocator.count().then(c => c > 0).catch(() => false);
		if (!canConnect) {
			console.log(' ⚠️ Connect Wallet button not found');
			return { status: 'fail', reason: 'connect_not_found' };
		}
		await connectLocator.click({ timeout: 40000 });
		await humanWait(WAIT_SMALL, WAIT_MED);

		// klik Continue with Google & tunggu popup (lebih aman: tunggu event popup dengan timeout panjang)
		let googlePopup;
		try {
			[googlePopup] = await Promise.all([
				page.waitForEvent('popup', { timeout: 60000 }),
				// klik tombol (cek ketersediaan)
				page.getByRole('button', { name: /continue with google/i }).first().click({ timeout: 60000 })
			]);
		} catch (e) {
			// bisa saja bukan popup tapi redirect; periksa pesan Too many requests
			const body = await page.textContent('body').catch(() => '');
			const curUrl = page.url();
			if (curUrl.includes('auth.web3auth.io') && body && body.includes('Too many requests')) {
				console.log(' ⚠️ Too many requests detected on main page');
				return { status: 'retry', reason: 'too_many_requests' };
			}
			console.log(' ❌ Failed to open Google popup:', e.message);
			return { status: 'fail', reason: 'no_popup' };
		}

		// pastikan popup loaded
		await googlePopup.waitForLoadState('domcontentloaded', { timeout: WAIT_LONG }).catch(() => {});
		await humanWait(WAIT_SMALL, WAIT_MED);

		// periksa too many requests di popup
		const popupBody = await googlePopup.textContent('body').catch(() => '');
		const popupUrl = googlePopup.url();
		if (popupUrl.includes('auth.web3auth.io') && popupBody && popupBody.includes('Too many requests')) {
			console.log(' ⚠️ Too many requests in popup');
			await googlePopup.close().catch(() => {});
			return { status: 'retry', reason: 'too_many_requests_popup' };
		}

		// isi email (cek selector ada)
		const emailFilled = await safeFill(googlePopup, 'input[type="email"], input[name="identifier"]', email, 50000);
		if (!emailFilled) {
			console.log(' ❌ Gagal fill email (selector tidak ditemukan)');
			// coba cek apakah ada account selection langsung (skip)
		} else {
			await humanWait(WAIT_SMALL, WAIT_MED);
			// klik next
			await googlePopup.click('button:has-text("Next"), #identifierNext', { timeout: 50000 }).catch(() => {});
		}

		// tunggu input password
		await googlePopup.waitForSelector('input[type="password"], input[name="password"]', { timeout: WAIT_LONG }).catch(() => {});
		await humanWait(WAIT_SMALL, WAIT_MED);

		// isi password
		const passFilled = await safeFill(googlePopup, 'input[type="password"], input[name="password"]', PASSWORD, 50000);
		if (!passFilled) {
			console.log(' ❌ Gagal fill password (selector mungkin berbeda)');
			// tetap lanjut mencoba klik next jika ada
		}
		await humanWait(WAIT_SMALL, WAIT_MED);
		await googlePopup.click('button:has-text("Next"), #passwordNext', { timeout: 50000 }).catch(() => {});

		// Setelah login, kadang muncul privacy notice "Saya mengerti"
		await humanWait(2500, 4000);
		await googlePopup.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); }).catch(()=>{});
		await humanWait(1200, 1800);

		const sayaMengertiSelector = 'input[value="Saya mengerti"], button:has-text("Saya mengerti"), text=Saya mengerti';
		const hasSayaMengerti = await googlePopup.locator(sayaMengertiSelector).count().then(c => c > 0).catch(() => false);
		if (hasSayaMengerti) {
			await googlePopup.click(sayaMengertiSelector, { timeout: 40000 }).catch(() => {});
			console.log(' ✅ Klik "Saya mengerti"');
			await humanWait(800, 1600);
		}

		// klik Continue jika ada
		await googlePopup.click('button:has-text("Continue")', { timeout: 60000 }).catch(() => {});
		// tunggu popup close (jika popup ditutup setelah persetujuan)
		await googlePopup.waitForEvent('close', { timeout: 60000 }).catch(() => {});

		// kembali ke halaman utama, tunggu load
		await page.waitForLoadState('networkidle', { timeout: WAIT_LONG }).catch(() => {});
		await humanWait(WAIT_SMALL, WAIT_MED);

		// cek tombol Register
		const hasRegister = await page.locator('button:has-text("Register")').isVisible().catch(() => false);
		if (hasRegister) {
			await page.click('button:has-text("Register")', { timeout: 60000 }).catch(() => {});
			await humanWait(2000, 3000);
			console.log(` ✅ Registered: ${email}`);
			return { status: 'success' };
		}

		// kalau belum ada register, coba back -> ulangi flow satu kali (lebih deterministik)
		console.log(' ℹ️ Register not found, trying fallback: back + second flow');
		await page.goBack({ timeout: 60000 }).catch(() => {});
		await page.waitForLoadState('networkidle', { timeout: WAIT_LONG }).catch(() => {});
		await humanWait(2000, 3000);

		// second attempt: klik continue with google again
		try {
			const [secondPopup] = await Promise.all([
				page.waitForEvent('popup', { timeout: 60000 }),
				page.getByRole('button', { name: /continue with google/i }).first().click({ timeout: 60000 })
			]);

			await secondPopup.waitForLoadState('domcontentloaded', { timeout: WAIT_LONG }).catch(() => {});
			await humanWait(2000, 3000);

			// coba klik account selection (first one)
			await secondPopup.click('div[role="button"]', { timeout: 40000 }).catch(() => {});
			await humanWait(1000, 2000);
			await secondPopup.click('button:has-text("Continue")', { timeout: 40000 }).catch(() => {});
			await secondPopup.waitForEvent('close', { timeout: 60000 }).catch(() => {});

			// tunggu halaman utama lagi
			await page.waitForLoadState('networkidle', { timeout: WAIT_LONG }).catch(() => {});
			await humanWait(2000, 3000);

			const hasRegister2 = await page.locator('button:has-text("Register")').isVisible().catch(() => false);
			if (hasRegister2) {
				await page.click('button:has-text("Register")', { timeout: 60000 }).catch(() => {});
				await humanWait(2000, 3000);
				console.log(` ✅ Registered on second attempt: ${email}`);
				return { status: 'success' };
			}
		} catch (e) {
			// jika second popup gagal, lanjutkan
			console.log(' ℹ️ Second popup attempt failed or timed out.');
		}

		// jika sampai sini belum success
		console.log(' ❌ Register not found after attempts');
		return { status: 'fail', reason: 'no_register' };

	} catch (err) {
		console.log(' ❌ ERROR during processEmail:', err.message || err);
		return { status: 'fail', reason: 'exception', error: err.message || String(err) };
	} finally {
		await context.close().catch(() => {});
	}
}

// MAIN: proses FIFO (emails[0]) dengan retry dan pemindahan file
async function main() {
	const browser = await chromium.launch({ headless: false });
	const emailPath = path.join(__dirname, 'email.txt');
	const suksesPath = path.join(__dirname, 'sukses.txt');
	const gagalPath = path.join(__dirname, 'gagal.txt');

	try {
		if (!fs.existsSync(emailPath)) {
			console.log('email.txt not found!');
			return;
		}

		let emails = fs.readFileSync(emailPath, 'utf8').split('\n').map(s => s.trim()).filter(Boolean);
		console.log(`Starting. ${emails.length} emails loaded.`);

		// map untuk melacak berapa kali percobaan per email
		const attempts = {};

		while (emails.length > 0) {
			const email = emails[0];
			attempts[email] = (attempts[email] || 0) + 1;
			console.log(`\n[Queue] Processing first email (${attempts[email]}): ${email}`);

			const result = await processEmail(browser, email);

			if (result.status === 'success') {
				// catat sukses
				fs.appendFileSync(suksesPath, email + '\n');
				// hapus dari queue dan tulis ulang email.txt
				emails.shift();
				fs.writeFileSync(emailPath, emails.join('\n'));
				console.log(` -> Moved to sukses.txt, remaining: ${emails.length}`);
				// reset attempts counter just in case
				delete attempts[email];
			} else if (result.status === 'retry') {
				// kalau reason too_many_requests: tunggu lama dan coba lagi (jangan pop)
				console.log(` -> Retry requested (${result.reason || 'retry'}). Waiting 5 minutes before retrying this same email.`);
				await new Promise(r => setTimeout(r, 300000)); // 5 menit
				// jangan ubah queue, coba lagi same email
			} else {
				// gagal permanent untuk percobaan MAX_RETRIES -> pindah ke gagal.txt
				if (attempts[email] >= MAX_RETRIES) {
					fs.appendFileSync(gagalPath, `${email} | reason:${result.reason || 'unknown'} | err:${result.error || ''}\n`);
					emails.shift();
					fs.writeFileSync(emailPath, emails.join('\n'));
					console.log(` -> Moved to gagal.txt after ${attempts[email]} attempts. Remaining: ${emails.length}`);
					delete attempts[email];
				} else {
					// delay singkat sebelum retry same email
					const waitMs = 60000; // 1 menit
					console.log(` -> Attempt ${attempts[email]} failed (reason: ${result.reason || 'fail'}). Waiting ${waitMs/1000}s before retrying same email.`);
					await new Promise(r => setTimeout(r, waitMs));
				}
			}

			// jeda antar email agar tidak terlalu agresif
			await humanWait(WAIT_SMALL, WAIT_MED);
		}

		console.log('\nAll email queue processed.');
	} catch (err) {
		console.error('FATAL ERROR main:', err);
	} finally {
		await browser.close().catch(() => {});
	}
}

main();
