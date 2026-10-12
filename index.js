/**
 * ============================================================
 * DAILY BIBLE VERSE IMAGE CARD AUTOMATION
 * KIMANGU YOUTH MINISTRY
 * ============================================================
 *
 * WhatsApp: Baileys
 * Bible API: OurManna (NKJV)
 * Image generation: SVG + Sharp
 * Schedule: 5:00 AM Africa/Nairobi
 *
 * FEATURES:
 * 1. Fetches the daily Bible verse.
 * 2. Generates a professional Bible verse image.
 * 3. Displays the SDA logo properly positioned at the top.
 * 4. Automatically adjusts text size, fonts, and spacing.
 * 5. Saves the generated image as daily-verse.png.
 * 6. Automatically finds and sends to "KIMANGU ADVENTIST YOUTHS FORUM".
 * 7. Schedules delivery every day at 5:00 AM Kenya time.
 * 8. Reconnects automatically after connection interruptions.
 *
 * ============================================================
 */

const {
    makeWASocket,
    useMultiFileAuthState,
    DisconnectReason
} = require('@whiskeysockets/baileys');

const { Boom } = require('@hapi/boom');
const pino = require('pino');
const cron = require('node-cron');
const axios = require('axios');
const qrcode = require('qrcode-terminal');
const sharp = require('sharp');

const fs = require('fs');
const path = require('path');

// ============================================================
// CONFIGURATION
// ============================================================

const CONFIG = {
    // Target WhatsApp group name
    groupName: 'KIMANGU ADVENTIST YOUTHS FORUM',

    // Kenya timezone.
    timezone: 'Africa/Nairobi',

    // Daily delivery at 5:00 AM.
    schedule: '0 5 * * *',

    // Bible translation.
    bibleVersion: 'nkjv',

    // Generated image.
    imagePath: path.join(__dirname, 'daily-verse.png'),

    // Official SDA logo. Upload this file to your project.
    logoPath: path.join(__dirname, 'sda-logo.png'),

    // Persistent WhatsApp authentication.
    authDirectory: path.join(__dirname, 'auth_info_baileys'),

    // Request timeout.
    requestTimeout: 30000
};

// ============================================================
// GLOBAL STATE
// ============================================================

let sock = null;
let resolvedGroupId = null;
let reconnectTimer = null;
let isConnecting = false;
let isSending = false;
let isShuttingDown = false;
let cronTask = null;
let lastScheduledDate = null;
let initialTestStarted = false;

// ============================================================
// LOGGING
// ============================================================

function log(message) {
    console.log(
        `[${new Date().toLocaleString('en-KE', {
            timeZone: CONFIG.timezone
        })}] ${message}`
    );
}

// ============================================================
// DATE HELPERS
// ============================================================

function getKenyaDateParts() {
    const parts = new Intl.DateTimeFormat('en-CA', {
        timeZone: CONFIG.timezone,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit'
    }).formatToParts(new Date());

    const result = {};

    for (const part of parts) {
        if (part.type !== 'literal') {
            result[part.type] = part.value;
        }
    }

    return result;
}

function getKenyaDateKey() {
    const date = getKenyaDateParts();

    return `${date.year}-${date.month}-${date.day}`;
}

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
// TEXT HELPERS
// ============================================================

function cleanText(value) {
    return String(value ?? '')
        .replace(/[\u0000-\u001F\u007F]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function escapeXml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&apos;');
}

// ============================================================
// FIND GROUP JID BY NAME
// ============================================================

async function resolveGroupId() {
    if (resolvedGroupId) return resolvedGroupId;

    try {
        log(`Searching for group: "${CONFIG.groupName}"...`);
        const groups = await sock.groupFetchAllParticipating();

        for (const [jid, group] of Object.entries(groups)) {
            if (group.subject && group.subject.trim().toLowerCase() === CONFIG.groupName.toLowerCase()) {
                resolvedGroupId = jid;
                log(`Successfully found group JID: ${resolvedGroupId} (${group.subject})`);
                return resolvedGroupId;
            }
        }

        throw new Error(`Could not find a joined group named "${CONFIG.groupName}". Please ensure the bot is added to this group.`);
    } catch (error) {
        log(`Error resolving group ID: ${error.message}`);
        throw error;
    }
}

// ============================================================
// FETCH DAILY BIBLE VERSE
// ============================================================

async function fetchBibleVerse() {
    const url =
        'https://beta.ourmanna.com/api/v1/get' +
        '?format=json&order=daily&version=' +
        encodeURIComponent(CONFIG.bibleVersion);

    log('Fetching the daily Bible verse...');

    const response = await axios.get(url, {
        timeout: CONFIG.requestTimeout
    });

    const details = response.data?.verse?.details;

    if (!details || !details.reference || !details.text) {
        throw new Error(
            'The Bible API returned incomplete verse information.'
        );
    }

    const verse = {
        reference: cleanText(details.reference),
        text: cleanText(details.text),
        translation: cleanText(details.version || 'NKJV')
    };

    log(`Bible verse retrieved: ${verse.reference}`);

    return verse;
}

// ============================================================
// TEXT WRAPPING
// ============================================================

function wrapText(text, maxChars) {
    const words = String(text).trim().split(/\s+/);
    const lines = [];
    let line = '';

    for (const word of words) {
        const candidate = line
            ? `${line} ${word}`
            : word;

        if (candidate.length > maxChars && line) {
            lines.push(line);
            line = word;
        } else {
            line = candidate;
        }
    }

    if (line) {
        lines.push(line);
    }

    return lines;
}

// ============================================================
// GENERATE BIBLE VERSE IMAGE
// ============================================================

async function generateVerseCardBuffer(verse) {
    const width = 1080;
    const height = 1350;

    let logoBuffer = null;

    if (fs.existsSync(CONFIG.logoPath)) {
        try {
            logoBuffer = await sharp(CONFIG.logoPath)
                .resize(130, 130, {
                    fit: 'contain',
                    background: {
                        r: 0,
                        g: 0,
                        b: 0,
                        alpha: 0
                    }
                })
                .png()
                .toBuffer();

            log('Official SDA logo loaded successfully.');
        } catch (error) {
            log(`Could not load SDA logo: ${error.message}`);
        }
    } else {
        log('SDA logo not found. Upload sda-logo.png to display it.');
    }

    let fontSize = 38;
    let maxChars = 34;
    let lines = wrapText(verse.text, maxChars);

    while (lines.length > 11 && fontSize > 26) {
        fontSize -= 2;
        maxChars += 3;
        lines = wrapText(verse.text, maxChars);
    }

    const lineHeight = fontSize * 1.45;

    const verseStartY = 510;
    const verseBottomY =
        verseStartY + (lines.length - 1) * lineHeight;

    const referenceY = verseBottomY + lineHeight + 35;
    const translationY = referenceY + 40;
    const dateY = Math.max(translationY + 60, 1180);
    const footerY = 1245;

    const verseSvg = lines.map((line, index) => `
        <text
            x="540"
            y="${verseStartY + (index * lineHeight)}"
            text-anchor="middle"
            font-family="Georgia, serif"
            font-style="italic"
            font-weight="normal"
            font-size="${fontSize}"
            fill="#F8FAFC">${escapeXml(line)}</text>
    `).join('');

    const logoPlaceholder = logoBuffer
        ? ''
        : `
            <circle cx="540" cy="115" r="45"
                    fill="#FFFFFF" opacity="0.08"/>
            <text x="540" y="132"
                  text-anchor="middle"
                  font-size="52"
                  fill="#FFE6A0">✦</text>
        `;

    const svg = `
    <svg xmlns="http://www.w3.org/2000/svg"
         width="${width}"
         height="${height}"
         viewBox="0 0 ${width} ${height}">

        <defs>
            <linearGradient id="background"
                            x1="0" y1="0" x2="1" y2="1">
                <stop offset="0%" stop-color="#071B16"/>
                <stop offset="55%" stop-color="#123B2D"/>
                <stop offset="100%" stop-color="#07111F"/>
            </linearGradient>

            <linearGradient id="gold"
                            x1="0" y1="0" x2="1" y2="0">
                <stop offset="0%" stop-color="#D6A84F"/>
                <stop offset="50%" stop-color="#FFE6A0"/>
                <stop offset="100%" stop-color="#D6A84F"/>
            </linearGradient>
        </defs>

        <rect width="${width}"
              height="${height}"
              fill="url(#background)"/>

        <rect x="35"
              y="35"
              width="1010"
              height="1280"
              rx="30"
              fill="none"
              stroke="url(#gold)"
              stroke-width="3"/>

        ${logoPlaceholder}

        <text x="540"
              y="230"
              text-anchor="middle"
              font-family="DejaVu Sans, sans-serif"
              font-size="38"
              font-weight="bold"
              letter-spacing="5"
              fill="#FFE6A0">KIMANGU</text>

        <text x="540"
              y="270"
              text-anchor="middle"
              font-family="DejaVu Sans, sans-serif"
              font-size="24"
              letter-spacing="4"
              fill="#FFFFFF">YOUTH MINISTRY</text>

        <rect x="230"
              y="310"
              width="620"
              height="60"
              rx="18"
              fill="url(#gold)"/>

        <text x="540"
              y="350"
              text-anchor="middle"
              font-family="DejaVu Sans, sans-serif"
              font-size="26"
              font-weight="bold"
              letter-spacing="2"
              fill="#10261F">DAILY BIBLE VERSE</text>

        <line x1="150"
              y1="415"
              x2="930"
              y2="415"
              stroke="#D6A84F"
              stroke-width="2"/>

        ${verseSvg}

        <text x="540"
              y="${referenceY}"
              text-anchor="middle"
              font-family="DejaVu Sans, sans-serif"
              font-size="34"
              font-weight="bold"
              fill="#FFE6A0">${escapeXml(verse.reference)}</text>

        <text x="540"
              y="${translationY}"
              text-anchor="middle"
              font-family="DejaVu Sans, sans-serif"
              font-size="22"
              fill="#CBD5E1">${escapeXml(verse.translation || 'NKJV')}</text>

        <text x="540"
              y="${dateY}"
              text-anchor="middle"
              font-family="DejaVu Sans, sans-serif"
              font-size="24"
              fill="#D8E8DD">${escapeXml(getFormattedKenyaDate())}</text>

        <text x="540"
              y="${footerY}"
              text-anchor="middle"
              font-family="DejaVu Sans, sans-serif"
              font-size="20"
              fill="#FFFFFF">May the Word of God guide your steps today.</text>

    </svg>`;

    let image = sharp(Buffer.from(svg));

    if (logoBuffer) {
        image = image.composite([
            {
                input: logoBuffer,
                left: 475,
                top: 50
            }
        ]);
    }

    const imageBuffer = await image
        .png()
        .toBuffer();

    await fs.promises.writeFile(
        CONFIG.imagePath,
        imageBuffer
    );

    log(`Bible verse image generated: ${imageBuffer.length} bytes`);

    return imageBuffer;
}

// ============================================================
// SEND VERSE TO WHATSAPP GROUP
// ============================================================

async function sendDailyVerse(options = {}) {
    const { scheduled = false } = options;

    if (!sock) {
        throw new Error('WhatsApp is not connected.');
    }

    if (isSending) {
        log('Another send is already in progress. Skipping.');
        return;
    }

    isSending = true;

    try {
        log(
            scheduled
                ? 'Sending scheduled daily Bible verse...'
                : 'Sending immediate group test...'
        );

        const targetGroupId = await resolveGroupId();
        const verse = await fetchBibleVerse();
        const imageBuffer = await generateVerseCardBuffer(verse);

        await sock.sendMessage(targetGroupId, {
            image: imageBuffer,
            mimetype: 'image/png',
            caption:
                '🙏'
        });

        log(`SUCCESS: Image sent to "${CONFIG.groupName}". Verse: ${verse.reference}`);

        if (scheduled) {
            lastScheduledDate = getKenyaDateKey();
        }
    } catch (error) {
        log(`FAILED TO SEND VERSE: ${error.message}`);
    } finally {
        isSending = false;
    }
}

// ============================================================
// SCHEDULE DAILY VERSE
// ============================================================

function startDailySchedule() {
    if (cronTask) {
        return;
    }

    cronTask = cron.schedule(
        CONFIG.schedule,
        async () => {
            const today = getKenyaDateKey();

            if (lastScheduledDate === today) {
                log('The scheduled verse has already been sent today.');
                return;
            }

            if (!sock) {
                log('WhatsApp is disconnected. Cannot send the scheduled verse.');
                return;
            }

            await sendDailyVerse({ scheduled: true });
        },
        { timezone: CONFIG.timezone }
    );

    log('Daily schedule activated: 5:00 AM Kenya time.');
}

// ============================================================
// CONNECT TO WHATSAPP
// ============================================================

async function startBot() {
    if (isConnecting || isShuttingDown) {
        return;
    }

    isConnecting = true;

    try {
        const { state, saveCreds } = await useMultiFileAuthState(CONFIG.authDirectory);

        sock = makeWASocket({
            auth: state,
            logger: pino({ level: 'silent' }),
            browser: ['Kimangu Youth Ministry', 'Chrome', '1.0.0'],
            syncFullHistory: false,
            markOnlineOnConnect: false,
            retryRequestDelayMs: 2000
        });

        sock.ev.on('creds.update', saveCreds);

        sock.ev.on('connection.update', async update => {
            const { connection, lastDisconnect, qr } = update;

            if (qr) {
                console.log('\n====================================');
                console.log('SCAN WHATSAPP QR CODE');
                console.log('====================================');
                qrcode.generate(qr, { small: true });
                console.log('\nOpen WhatsApp > Linked devices > Link a device.');
            }

            if (connection === 'connecting') {
                log('Connecting to WhatsApp...');
            }

            if (connection === 'open') {
                log('WhatsApp connected successfully.');
                isConnecting = false;
                startDailySchedule();

                if (!initialTestStarted) {
                    initialTestStarted = true;
                    await sendDailyVerse({ scheduled: false });
                }
            }

            if (connection === 'close') {
                isConnecting = false;
                const statusCode =
                    lastDisconnect?.error instanceof Boom
                        ? lastDisconnect.error.output.statusCode
                        : undefined;

                const loggedOut = statusCode === DisconnectReason.loggedOut;
                log(`WhatsApp connection closed. Status: ${statusCode ?? 'unknown'}`);
                sock = null;

                if (loggedOut) {
                    log('WhatsApp logged out. Relink your account by scanning the QR code again.');
                    return;
                }

                if (!isShuttingDown && !reconnectTimer) {
                    reconnectTimer = setTimeout(() => {
                        reconnectTimer = null;
                        startBot().catch(error => {
                            log(`Reconnect failed: ${error.message}`);
                        });
                    }, 5000);
                }
            }
        });
    } catch (error) {
        isConnecting = false;
        log(`BOT STARTUP ERROR: ${error.message}`);

        if (!isShuttingDown && !reconnectTimer) {
            reconnectTimer = setTimeout(() => {
                reconnectTimer = null;
                startBot().catch(err => {
                    log(`Restart error: ${err.message}`);
                });
            }, 10000);
        }
    }
}

// ============================================================
// SHUTDOWN HANDLING
// ============================================================

async function shutdown(signal) {
    if (isShuttingDown) {
        return;
    }

    isShuttingDown = true;
    log(`Received ${signal}. Shutting down...`);

    if (cronTask) {
        cronTask.stop();
        cronTask = null;
    }

    if (reconnectTimer) {
        clearTimeout(reconnectTimer);
        reconnectTimer = null;
    }

    try {
        if (sock) {
            sock.end(undefined);
            sock = null;
        }
    } catch (error) {
        log(`Shutdown error: ${error.message}`);
    }

    process.exit(0);
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));

// ============================================================
// START APPLICATION
// ============================================================

console.log('');
console.log('============================================');
console.log('KIMANGU YOUTH MINISTRY');
console.log('DAILY BIBLE VERSE IMAGE AUTOMATION');
console.log('============================================');
console.log('WhatsApp: Baileys');
console.log('Bible translation: NKJV');
console.log('Timezone: Africa/Nairobi');
console.log('Schedule: Every day at 5:00 AM');
console.log(`Destination: ${CONFIG.groupName}`);
console.log('Image generation: SVG + Sharp');
console.log('SDA logo:', fs.existsSync(CONFIG.logoPath) ? 'Found' : 'Not found - upload sda-logo.png');
console.log('============================================');
console.log('');

startBot().catch(error => {
    log(`Fatal startup error: ${error.message}`);
});