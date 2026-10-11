const { Client, LocalAuth } = require('whatsapp-web.js');

const client = new Client({
    authStrategy: new LocalAuth({ dataPath: './.wwebjs_auth' }),
    puppeteer: {
        headless: false,
        executablePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
    }
});

client.on('ready', () => {
    console.log('\n====================================================');
    console.log('BOT IS READY! Go to your phone and send a quick');
    console.log('message inside the "Automatically" group right now.');
    console.log('====================================================\n');
});

client.on('message', message => {
    console.log('----------------------------------------------------');
    console.log('MESSAGE RECEIVED FROM CHAT/GROUP ID:', message.from);
    console.log('----------------------------------------------------');
});

client.initialize();