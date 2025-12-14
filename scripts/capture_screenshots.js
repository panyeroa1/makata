
import puppeteer from 'puppeteer';
import fs from 'fs';
import path from 'path';

const APP_URL = 'http://localhost:3000';
const ASSETS_DIR = 'public/assets';

if (!fs.existsSync(ASSETS_DIR)) {
    fs.mkdirSync(ASSETS_DIR, { recursive: true });
}

async function run() {
    console.log('Launching browser...');
    const browser = await puppeteer.launch({
        headless: "new",
        args: [
            '--use-fake-ui-for-media-stream',
            '--use-fake-device-for-media-stream',
            '--no-sandbox',
            '--disable-setuid-sandbox'
        ]
    });

    const page = await browser.newPage();
    await page.setViewport({ width: 1440, height: 900 });

    try {
        console.log(`Navigating to ${APP_URL}...`);
        await page.goto(APP_URL, { waitUntil: 'networkidle0' });
        await new Promise(r => setTimeout(r, 2000)); // Wait for animations

        // 1. Landing View
        console.log('Capturing Landing View...');
        await page.screenshot({ path: path.join(ASSETS_DIR, 'landing_view_mock.png') });

        // 2. pseudo-Auth (Join View / Secure Handshake)
        console.log('Navigating to Join View (Secure Handshake)...');
        // Find "Join" button. It contains text "Join" inside h3 or similar.
        const joinBtn = await page.$x("//button[contains(., 'Join')]");
        if (joinBtn.length > 0) {
            await joinBtn[0].click();
            await new Promise(r => setTimeout(r, 1000));
            console.log('Capturing Auth/Join View...');
            await page.screenshot({ path: path.join(ASSETS_DIR, 'auth_view_mock.png') });
            
            // Go back
            const backBtn = await page.$('button[aria-label="Back to Landing"]');
            if (backBtn) {
                await backBtn.click();
            } else {
                await page.reload();
            }
            await new Promise(r => setTimeout(r, 1000));
        } else {
            console.error('Could not find Join button');
        }

        // 3. Setup View (Host)
        console.log('Navigating to Host Setup...');
        const newMeetingBtn = await page.$x("//button[contains(., 'New Meeting')]");
        if (newMeetingBtn.length > 0) {
            await newMeetingBtn[0].click();
            await new Promise(r => setTimeout(r, 1000));

            // Consent Dialog
            console.log('Handling Consent Dialog...');
            const acceptBtn = await page.$x("//button[contains(., 'Accept & Continue')]");
            if (acceptBtn.length > 0) {
                await acceptBtn[0].click();
                await new Promise(r => setTimeout(r, 1000));
            }

            console.log('Capturing Setup View...');
            await page.screenshot({ path: path.join(ASSETS_DIR, 'setup_view_mock.png') });

            // 4. Active Call
            console.log('Starting Meeting...');
            const startBtn = await page.$x("//button[contains(., 'START MEETING')]");
            if (startBtn.length > 0) {
                await startBtn[0].click();
                // Wait for active call UI (Orbit Ring or similar)
                await new Promise(r => setTimeout(r, 3000)); 
                console.log('Capturing Active Call View...');
                await page.screenshot({ path: path.join(ASSETS_DIR, 'active_call_mock.png') });
            } else {
                console.error('Could not find Start Meeting button');
            }
        } else {
            console.error('Could not find New Meeting button');
        }

    } catch (error) {
        console.error('Error capturing screenshots:', error);
    } finally {
        await browser.close();
        console.log('Browser closed.');
    }
}

run();
