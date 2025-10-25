const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');

// Random Delay Helper
async function humanWait(page, min = 2000, max = 5000) {
	const delay = min + Math.random() * (max - min);
	await page.waitForTimeout(delay);
}

// Process Single Email
async function processEmail(browser, email) {
	console.log(`\n=== Processing email: ${email} ===`);

	const context = await browser.newContext();
	const page = await context.newPage();

	try {
		// Open Page
		await page.goto('https://app.piggycell.io/?ref=LEBQ9I', {
			waitUntil: 'domcontentloaded',
			timeout: 45000
		});
		await page.waitForLoadState('networkidle', { timeout: 45000 });
		await humanWait(page);

		// Click Connect Wallet
		await page.getByRole('button', { name: /connect wallet/i })
			.first().click({ timeout: 30000 });
		await humanWait(page);

		// Open Google Popup
		let googlePopup;
		[googlePopup] = await Promise.all([
			page.waitForEvent('popup', { timeout: 35000 }),
			page.getByRole('button', { name: /continue with google/i })
				.first().click({ timeout: 35000 })
		]);

		// Load Google Login
		await googlePopup.waitForLoadState('domcontentloaded', { timeout: 35000 });
		await humanWait(googlePopup);

		// Fill Email
		await googlePopup.fill('input[type="email"], input[name="identifier"]', email, { timeout: 35000 });
		await humanWait(googlePopup);
		await googlePopup.click('button:has-text("Next"), #identifierNext', { timeout: 35000 });

		// Fill Password
		await googlePopup.waitForSelector('input[type="password"], input[name="password"]', { timeout: 40000 });
		await humanWait(googlePopup);
		await googlePopup.fill('input[type="password"], input[name="password"]', 'qwertyui', { timeout: 35000 });
		await humanWait(googlePopup);
		await googlePopup.click('button:has-text("Next"), #passwordNext', { timeout: 35000 });

		// Click Continue if needed
		await humanWait(googlePopup);
		await googlePopup.click('button:has-text("Continue")', { timeout: 40000 }).catch(() => {});
		await googlePopup.waitForEvent('close', { timeout: 40000 });

		// Wait after login
		await page.waitForLoadState('networkidle', { timeout: 45000 });
		await humanWait(page);

		// Check Register Button
		const hasRegisterButton = await page.locator('button:has-text("Register")')
			.isVisible().catch(() => false);

		if (hasRegisterButton) {
			await page.click('button:has-text("Register")', { timeout: 35000 });
			await humanWait(page);
			console.log(`✅ SUCCESS: ${email}`);
			return true;
		} else {
			console.log(`❌ FAILED (No Register Button): ${email}`);
			return false;
		}

	} catch (error) {
		console.log(`❌ ERROR: ${email} - ${error.message}`);
		return false;
	} finally {
		await context.close();
	}
}

// Main Runner
async function main() {
	const browser = await chromium.launch({ headless: false });
	try {
		const emailPath = path.join(__dirname, 'email.txt');
		const successPath = path.join(__dirname, 'sukses.txt');

		if (!fs.existsSync(emailPath)) {
			console.log('email.txt not found!');
			return;
		}

		let emails = fs.readFileSync(emailPath, 'utf8')
			.trim().split('\n').filter(e => e.trim());

		console.log(`Found ${emails.length} emails.`);

		for (let i = 0; i < emails.length; i++) {
			const email = emails[i];
			console.log(`\n[${i + 1}/${emails.length}] Processing: ${email}`);

			const result = await processEmail(browser, email);

			if (result === true) {
				fs.appendFileSync(successPath, email + '\n');
				emails = emails.filter(e => e !== email);
				fs.writeFileSync(emailPath, emails.join('\n'));
			}

			await new Promise(r => setTimeout(r, 4000));
		}

		console.log('\n🎉 ALL EMAILS DONE!');
	} catch (err) {
		console.error(err);
	} finally {
		await browser.close();
	}
}

main();			const mainPageContent = await page.textContent('body').catch(() => null);

			if (currentUrl.includes('auth.web3auth.io') && mainPageContent && mainPageContent.includes('Too many requests')) {
				console.log(`⚠️ Too many requests for ${email}. Retry after 5 mins.`);
				return 'retry';
			}

			throw e;
		}

		await googlePopup.waitForLoadState('domcontentloaded', { timeout: 35000 });
		await humanWait(googlePopup);

		// Too many request check
		const popupContent = await googlePopup.textContent('body').catch(() => null);
		const popupUrl = googlePopup.url();
		if (popupUrl.includes('auth.web3auth.io') && popupContent && popupContent.includes('Too many requests')) {
			console.log(`⚠️ Too many requests popup. Retry later.`);
			await googlePopup.close().catch(() => {});
			return 'retry';
		}

		// Fill Email
		await googlePopup.fill('input[type="email"], input[name="identifier"]', email, { timeout: 30000 });
		await humanWait(googlePopup);
		await googlePopup.click('button:has-text("Next"), #identifierNext', { timeout: 30000 });

		// Wait Password Page
		await googlePopup.waitForSelector('input[type="password"], input[name="password"]', { timeout: 35000 });
		await humanWait(googlePopup);

		// Fill Password
		await googlePopup.fill('input[type="password"], input[name="password"]', 'qwertyui', { timeout: 35000 });
		await humanWait(googlePopup);
		await googlePopup.click('button:has-text("Next"), #passwordNext', { timeout: 35000 });

		// Privacy + Continue
		await humanWait(googlePopup);
		await googlePopup.evaluate(() => { window.scrollTo(0, document.body.scrollHeight); });
		await googlePopup.waitForTimeout(1000);
		await googlePopup.click('button:has-text("Continue")', { timeout: 35000 }).catch(() => {});
		await googlePopup.waitForEvent('close', { timeout: 35000 });

		// After Login
		console.log('⏳ Checking register button...');
		await page.waitForTimeout(4000);
		await page.waitForLoadState('networkidle', { timeout: 35000 });

		let hasRegisterButton = await page.locator('button:has-text("Register")').isVisible().catch(() => false);
		if (hasRegisterButton) {
			await page.click('button:has-text("Register")', { timeout: 35000 });
			await humanWait(page);
			console.log(`✅ SUCCESS: ${email}`);
			return true;
		}

		console.log(`❌ FAILED: ${email} no register button`);
		return false;

	} catch (error) {
		console.log(`❌ ERROR: ${email} - ${error.message}`);
		return false;
	} finally {
		await context.close();
	}
}

// Main
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
		console.log(`Found ${emails.length} emails`);

		for (let i = 0; i < emails.length; i++) {
			const email = emails[i];
			console.log(`\n[${i + 1}/${emails.length}] ${email}`);

			const result = await processEmail(browser, email);

			if (result === 'retry') {
				console.log(`⏳ Waiting 5 mins because too many requests...`);
				await new Promise(resolve => setTimeout(resolve, 300000)); // 5 mins
				i--;
				continue;
			}

			if (result === true) {
				fs.appendFileSync(suksesPath, email + '\n');
				emails = emails.filter(e => e !== email);
				fs.writeFileSync(emailPath, emails.join('\n'));
			}

			await new Promise(resolve => setTimeout(resolve, 4000));
		}

		console.log('\n🎉 ALL DONE');

	} catch (error) {
		console.error('Error:', error);
	} finally {
		await browser.close();
	}
}

main();			}
			throw e;
		}

		// Check if popup shows "Too many requests" error
		await googlePopup.waitForLoadState('domcontentloaded');
		
		const popupContent = await googlePopup.textContent('body').catch(() => null);
		const popupUrl = googlePopup.url();
		
		if (popupUrl.includes('auth.web3auth.io') && popupContent && popupContent.includes('Too many requests')) {
			console.log(`⚠️ Too many requests detected in popup for ${email}. Waiting 5 minutes before retry...`);
			await googlePopup.close().catch(() => {});
			return 'retry';
		}

		// Fill email field
		await googlePopup.fill('input[type="email"], input[name="identifier"]', email);
		await googlePopup.click('button:has-text("Next"), #identifierNext');
		
		// Wait for password page
		await googlePopup.waitForSelector('input[type="password"], input[name="password"]', { timeout: 10000 });
		
		// Fill password
		await googlePopup.fill('input[type="password"], input[name="password"]', 'qwertyui');
		await googlePopup.click('button:has-text("Next"), #passwordNext');

		// Optional privacy notice → sometimes shows "Saya mengerti", sometimes jumps to "Continue"
		await googlePopup.waitForTimeout(1500);
		
		// Scroll first to reveal the consent button, then try clicking if it exists
		await googlePopup.evaluate(() => { if (document.body) window.scrollTo(0, document.body.scrollHeight); });
		await googlePopup.waitForTimeout(600);
		const sayaMengertiSelector = 'input[value="Saya mengerti"]';
		const hasSayaMengerti = await googlePopup.locator(sayaMengertiSelector).count().then(c => c > 0).catch(() => false);
		if (hasSayaMengerti) {
			await googlePopup.click(sayaMengertiSelector, { timeout: 10000 }).catch(() => {});
		}

		// Click Continue (exists whether or not the privacy notice appeared)
		await googlePopup.click('button:has-text("Continue")', { timeout: 15000 });

		// Wait for popup to close
		await googlePopup.waitForEvent('close', { timeout: 10000 });

		
		// Wait for page to fully load after first Google connection
		console.log('Waiting for page to load after first Google connection...');
		await page.waitForTimeout(2000);
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(2000);

		// Check if Register button appears after first connection
		console.log('Looking for Register button after first connection...');
		await page.waitForTimeout(3000);
		let hasRegisterButton = await page.locator('button:has-text("Register")').isVisible().catch(() => false);
		
		if (hasRegisterButton) {
			console.log('Register button found after first connection, clicking it...');
			await page.click('button:has-text("Register")', { timeout: 10000 });
			await page.waitForTimeout(2000);
			console.log(`✅ SUCCESS: ${email} completed registration`);
			return true; // Success
		}

		// If no Register button, use browser's back button and Continue with Google again
		console.log('No Register button found, using browser back button...');
		
		// Use browser's native back button
		await page.goBack();
		await page.waitForTimeout(3000);
		await page.waitForLoadState('networkidle');

		// Click Continue with Google again (should be available after back button)
		console.log('Clicking Continue with Google again...');
		const [secondGooglePopup] = await Promise.all([
			page.waitForEvent('popup', { timeout: 15000 }),
			page.getByRole('button', { name: /continue with google/i }).first().click({ timeout: 15000 })
		]);

		// Wait for account selection screen
		await secondGooglePopup.waitForLoadState('domcontentloaded');
		await secondGooglePopup.waitForTimeout(2000);

		// Click on the Google account (should be the same email)
		await secondGooglePopup.click(`text=${email.split('@')[0]}`, { timeout: 10000 }).catch(() => {
			// If specific account not found, try clicking any account
			return secondGooglePopup.click('div[role="button"]', { timeout: 10000 });
		});
		await secondGooglePopup.waitForTimeout(2000);

		// Click Continue button
		await secondGooglePopup.click('button:has-text("Continue")', { timeout: 10000 });
		await secondGooglePopup.waitForEvent('close', { timeout: 10000 });

		// Wait for page to load after second connection
		console.log('Waiting for page to load after second Google connection...');
		await page.waitForTimeout(2000);
		await page.waitForLoadState('networkidle');
		await page.waitForTimeout(2000);

		// Check if Register button appears after second connection
		console.log('Looking for Register button after second connection...');
		await page.waitForTimeout(3000);
		hasRegisterButton = await page.locator('button:has-text("Register")').isVisible().catch(() => false);
		
		if (hasRegisterButton) {
			console.log('Register button found, clicking it...');
			await page.click('button:has-text("Register")', { timeout: 10000 });
			await page.waitForTimeout(2000);
			console.log(`✅ SUCCESS: ${email} completed registration`);
			return true; // Success
		} else {
			console.log(`❌ FAILED: ${email} - No Register button found after second attempt`);
			return false; // Failed
		}

	} catch (error) {
		console.log(`❌ ERROR: ${email} - ${error.message}`);
		return false; // Failed
	} finally {
		await context.close();
	}
}

// Main function to process all emails
async function main() {
	const browser = await chromium.launch({ headless: false });
	
	try {
		// Read emails from email.txt
		const emailPath = path.join(__dirname, 'email.txt');
		const suksesPath = path.join(__dirname, 'sukses.txt');
		
		if (!fs.existsSync(emailPath)) {
			console.log('email.txt not found!');
			return;
		}

		let emails = fs.readFileSync(emailPath, 'utf8').trim().split('\n').filter(email => email.trim());
		console.log(`Found ${emails.length} emails to process`);

		const successfulEmails = [];

		for (let i = 0; i < emails.length; i++) {
			const email = emails[i].trim();
			if (!email) continue;

			console.log(`\n[${i + 1}/${emails.length}] Processing: ${email}`);
			
			const result = await processEmail(browser, email);
			
			if (result === 'retry') {
				console.log(`⏳ Too many requests detected for ${email}. Waiting 3 minutes before retry...`);
				console.log('⏰ Waiting 3 minutes (180 seconds)...');
				await new Promise(resolve => setTimeout(resolve, 180000)); // 3 minutes = 180000ms
				console.log('✅ 3 minutes wait completed. Retrying same email...');
				
				// Retry the same email (don't increment i)
				i--; // This will make the loop retry the same email
				continue;
			} else if (result === true) {
				successfulEmails.push(email);
				console.log(`✅ ${email} - SUCCESS`);
				
				// Immediately move successful email to sukses.txt
				console.log(`📝 Moving ${email} to sukses.txt...`);
				
				// Add to sukses.txt
				const existingSukses = fs.existsSync(suksesPath) ? fs.readFileSync(suksesPath, 'utf8') : '';
				const newSukses = existingSukses + email + '\n';
				fs.writeFileSync(suksesPath, newSukses);

				// Remove successful email from email.txt
				const remainingEmails = emails.filter(e => e.trim() !== email.trim());
				fs.writeFileSync(emailPath, remainingEmails.join('\n'));
				
				// Update emails array for next iteration
				emails = remainingEmails;
				
				console.log(`✅ Moved ${email} to sukses.txt`);
				console.log(`📋 Remaining emails: ${remainingEmails.length}`);
			} else {
				console.log(`❌ ${email} - FAILED`);
			}

			// Wait between emails
			if (i < emails.length - 1) {
				console.log('Waiting 3 seconds before next email...');
				await new Promise(resolve => setTimeout(resolve, 3000));
			}
		}

		console.log('\n🎉 All emails processed!');

	} catch (error) {
		console.error('Error:', error);
	} finally {
		await browser.close();
	}
}

// Run the main function
main();
