/**
 * ============================================================
 * DAILY BIBLE VERSE IMAGE CARD AUTOMATION
 * ============================================================
 * Ministry: Kimangu Youth Ministry
 * Features:
 *   - Fetches dynamic daily Bible verse (NKJV).
 *   - Generates custom dark-mode image card with SDA logo.
 *   - Fixes whatsapp-web.js media memoization bug.
 *   - Robust connection handling and clean exit.
 * ============================================================
 */

const { Client, LocalAuth, MessageMedia } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');
const axios = require('axios');
const path = require('path');
const fs = require('fs');
const puppeteer = require('puppeteer');

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
    // The target WhatsApp Group ID
    groupId: '120363413687066419@g.us',
    // Local Timezone for date formatting
    timezone: 'Africa/Nairobi',
    chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
};

// ============================================================
// SDA LOGO - BASE64 PNG
// ============================================================

const SDA_LOGO_BASE64 =
    'data:image/png;base64,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';

// ============================================================
// WHATSAPP CLIENT
// ============================================================

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: path.join(__dirname, '.wwebjs_auth') }),
    puppeteer: {
        headless: true,
        args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu']
    }
});

// ============================================================
// GET CURRENT KENYA DATE
// ============================================================

function getFormattedKenyaDate() {
    return new Intl.DateTimeFormat('en-KE', {
        timeZone: CONFIG.timezone,
        weekday: 'long',
        day: 'numeric',
        month: 'long',
        year: 'numeric'
    }).format(new Date());
}

// ============================================================
// FETCH DAILY BIBLE VERSE
// ============================================================

async function fetchBibleVerse() {
    const url =
        'https://beta.ourmanna.com/api/v1/get?format=json&order=daily&version=nkjv';

    const response = await axios.get(url, {
        timeout: 20000
    });

    const details = response.data.verse.details;

    return {
        reference: details.reference,
        text: details.text.trim(),
        translation: details.version || 'NKJV'
    };
}

// ============================================================
// GENERATE VERSE CARD IMAGE
// ============================================================

async function generateVerseCardImage(verse) {
    const dateStr = getFormattedKenyaDate();

    const tempHtmlPath = path.resolve(__dirname, 'temp-card.html');
    const tempImagePath = path.resolve(__dirname, 'verse-card.png');

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">

    <style>
        @import url('https://fonts.googleapis.com/css2?family=Merriweather:ital,wght@0,300;0,400;1,300;1,400&family=Inter:wght@500;700&display=swap');

        * {
            box-sizing: border-box;
            margin: 0;
            padding: 0;
        }

        body {
            width: 650px;
            background-color: #101c2c;
            padding: 40px;
            font-family: 'Inter', sans-serif;
        }

        .header {
            display: flex;
            align-items: center;
            color: #f59e0b;
            font-weight: 700;
            font-size: 16px;
            margin-bottom: 20px;
            letter-spacing: 0.5px;
        }

        .date {
            font-size: 13px;
            color: #94a3b8;
            margin-bottom: 15px;
            text-transform: uppercase;
            letter-spacing: 1px;
        }

        .verse-text {
            font-family: 'Merriweather', serif;
            font-style: italic;
            font-size: 20px;
            line-height: 1.6;
            color: #f8fafc;
            margin-bottom: 25px;
            overflow-wrap: break-word;
        }

        .reference {
            font-family: 'Inter', sans-serif;
            font-weight: 700;
            color: #f59e0b;
            font-size: 15px;
        }

        .footer {
            margin-top: 30px;
            border-top: 1px solid #1e293b;
            padding-top: 20px;
            display: flex;
            align-items: center;
            justify-content: center;
            gap: 12px;
        }

        .sda-logo {
            width: 40px;
            height: 40px;
            object-fit: contain;
            display: block;
            flex-shrink: 0;
        }

        .footer span {
            font-size: 13px;
            color: #94a3b8;
            font-weight: 500;
            letter-spacing: 0.5px;
        }
    </style>
</head>

<body>
    <div class="header">📖 Verse of the Day</div>

    <div class="date">${escapeHtml(dateStr)}</div>

    <div class="verse-text">“${escapeHtml(verse.text)}”</div>

    <div class="reference">
        ${escapeHtml(verse.reference)} (${escapeHtml(verse.translation)})
    </div>

    <div class="footer">
        <img
            class="sda-logo"
            src="${SDA_LOGO_BASE64}"
            alt="Seventh-day Adventist Church Logo"
        >

        <span>Kimangu Youth Ministry</span>
    </div>
</body>
</html>
`;

    fs.writeFileSync(tempHtmlPath, htmlContent, 'utf8');

    let browser;

    try {
        browser = await puppeteer.launch({
            headless: true,
            executablePath: CONFIG.chromePath,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage'
            ]
        });

        const page = await browser.newPage();

        await page.setViewport({
            width: 650,
            height: 700,
            deviceScaleFactor: 2
        });

        await page.goto(
            'file://' + tempHtmlPath.replace(/\\/g, '/'),
            { waitUntil: 'networkidle0', timeout: 60000 }
        );

        await page.waitForFunction(() => {
            const logo = document.querySelector('.sda-logo');
            return logo && logo.complete && logo.naturalWidth > 0;
        }, { timeout: 15000 });

        const bodyElement = await page.$('body');

        await bodyElement.screenshot({
            path: tempImagePath,
            type: 'png',
            captureBeyondViewport: true
        });

        return tempImagePath;

    } finally {
        if (browser) {
            await browser.close();
        }

        if (fs.existsSync(tempHtmlPath)) {
            fs.unlinkSync(tempHtmlPath);
        }
    }
}

// ============================================================
// ESCAPE HTML SPECIAL CHARACTERS
// ============================================================

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ============================================================
// WHATSAPP QR CODE
// ============================================================

client.on('qr', qr => {
    console.log('\nScan this QR code with your WhatsApp:');
    qrcode.generate(qr, { small: true });
});

// ============================================================
// WHATSAPP READY: GENERATE AND SEND VERSE CARD
// ============================================================

client.on('ready', async () => {
    console.log('\n========================================');
    console.log('WHATSAPP CLIENT READY');
    console.log('DAILY BIBLE VERSE AUTOMATION');
    console.log('========================================');

    let imagePath;

    try {
        console.log('Fetching the daily Bible verse...');

        const verse = await fetchBibleVerse();

        console.log(`Verse: ${verse.reference}`);
        console.log('Generating verse card with SDA logo...');

        imagePath = await generateVerseCardImage(verse);

        const fileBuffer = fs.readFileSync(imagePath);

        const media = new MessageMedia(
            'image/png',
            fileBuffer.toString('base64'),
            'verse-card.png'
        );

        console.log(`Sending verse card to group: ${CONFIG.groupId}`);

        await client.sendMessage(CONFIG.groupId, media, {
            caption: '🌅 *Kimangu Youth Ministry - Daily Verse*'
        });

        console.log(
            `Successfully sent the verse card for ${verse.reference}!`
        );

    } catch (error) {
        console.error('Failed to send the verse card:', error.message);

    } finally {
        if (imagePath && fs.existsSync(imagePath)) {
            fs.unlinkSync(imagePath);
        }

        console.log('Waiting for the WhatsApp operation to finish...');

        await new Promise(resolve => setTimeout(resolve, 6000));

        console.log('Closing WhatsApp client...');

        try {
            await client.destroy();
        } catch (error) {
            console.error('Error closing WhatsApp client:', error.message);
        }


    }
});

// ============================================================
// HANDLE AUTHENTICATION AND CONNECTION ERRORS
// ============================================================

client.on('authenticated', () => {
    console.log('WhatsApp authenticated successfully.');
});

client.on('auth_failure', message => {
    console.error('WhatsApp authentication failed:', message);
});

client.on('disconnected', reason => {
    console.log('WhatsApp disconnected:', reason);
});

// ============================================================
// START AUTOMATION
// ============================================================

console.log('Starting Daily Bible Verse Automation...');
console.log('Timezone: ' + CONFIG.timezone);
console.log('Destination group: ' + CONFIG.groupId);

client.initialize();