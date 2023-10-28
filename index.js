const puppeteer = require('puppeteer');
const cliProgress = require('cli-progress');
const fs = require('node:fs/promises');


async function generateFancyNumbers(series, start, end, includeOthers=false) {
    if (start > end) {
        throw 'Start should be less than end';
    } else if (end > 9999) {
        throw 'End should not exceed 9999';
    } else if (start < 1) {
        throw 'Start should be above 0001';
    }

    let allNumbers = [];
    for (let i = start; i <= end; i++) {
        allNumbers.push(i);
    }

    allNumbers = allNumbers
        .map(x => x.toString())
        .map(x => '0'.repeat(4 - x.length) + x);


    const groups = {
        '4-same': [],
        '3-same': [],
        '2-pairs': [],
        '2-diff-pairs': [],
        'palindrome': [],
        'others': []
    };

    for (const i of allNumbers) {
        // Check if the number has all 4 digits the same.
        if (i == i[0].repeat(4)) {
            groups['4-same'].push(i);
            continue;
        }

        // Check if the number has 3 consecutive digits the same.
        if (i.includes(i[0].repeat(3)) || i.includes(i[1].repeat(3))) {
            groups['3-same'].push(i);
            continue;
        }

        // Check if the number has 2 pairs of 2 consecutive same digits.
        if (i[0] == i[1] && i[2] == i[3]) {
            groups['2-pairs'].push(i);
            continue;
        }

        // Check if the number has 2 pairs of 2 consecutive different digits.
        if (i[0] == i[2] && i[1] == i[3]) {
            groups['2-diff-pairs'].push(i);
            continue;
        }

        // Check if the number is a palindrome.
        if (i == i.split('').reverse().join('')) {
            groups['palindrome'].push(i);
            continue;
        }

        groups['others'].push(i);
    }

    const fancyNumbers = [
        ...groups['4-same'],
        ...groups['3-same'],
        ...groups['2-pairs'],
        ...groups['2-diff-pairs'],
        ...groups['palindrome'],
        ...(includeOthers ? groups['others'] : []),
    ];
    return fancyNumbers.map(x => series + x);
}

async function checkVehicleNumber(vehicleNumber) {
    const url = 'https://vahan.parivahan.gov.in/vahanservice/vahan/ui/statevalidation/homepage.xhtml';

    const notRegisteredContent = 'Registration Number is not available in Vahan4 database, Please contact the concern RTO';
    const registeredContent = 'Proceed';

    const browser = await puppeteer.launch({
        headless: 'new'
    });
    const page = await browser.newPage();
    await page.goto(url);

    await new Promise(r => setTimeout(r, 100));
    const inputElement = await page.waitForSelector('div#homepanelid input[placeholder="Enter Registration Number"]', { visible: true });
    await inputElement.type(vehicleNumber);
    
    await new Promise(r => setTimeout(r, 200));
    const checkboxElement = await page.waitForSelector('div#homepanelid span.ui-chkbox-icon.ui-icon', { visible: true });
    await checkboxElement.click();

    await new Promise(r => setTimeout(r, 300));
    const proceedButtonElement = await page.waitForSelector('div#homepanelid button', { visible: true });
    await proceedButtonElement.click();

    let isNotRegistered = null;
    try {
        const modalSpanElement = await page.waitForSelector('div#primefacesmessagedlg div.ui-dialog-content', { visible: true, timeout: 5000 });
        isNotRegistered = await page.evaluate(e => e.innerText, modalSpanElement) == notRegisteredContent;
    } catch (error) {}


    let isRegistered = null;
    if (isNotRegistered === null) {
        try {
            const modalButtonSpanElement = await page.waitForSelector('div#facelesslist  button>span.ui-button-text', { visible: true, timeout: 5000 });
            isRegistered = await page.evaluate(e => e.innerText, modalButtonSpanElement) == registeredContent;
        } catch (error) {}
    }

    await page.close();
    await browser.close();


    if (isNotRegistered === null && isRegistered === null) {
        console.error('Could not be found');
        return 'UNKNOWN';
    } else if (isNotRegistered  === true && isRegistered === null) {
        return 'AVAILABLE';
    } else if (isRegistered  === true && isNotRegistered === null) {
        return 'NOT_AVAILABLE';
    }
}

async function main(shouldRefresh=false) {
    console.log('Generating Fancy Numbers');
    const vehicleNumbers = await generateFancyNumbers('TN09DE', 1200, 2300, true);

    console.log('Loading DB');
    const db = JSON.parse(await fs.readFile('data.json'));

    console.log('Extracting Registration Details');
    const output = {};
    const progressBar = new cliProgress.SingleBar({}, cliProgress.Presets.shades_classic);
    progressBar.start(vehicleNumbers.length, 0);
    await fs.writeFile('output.csv', 'RegistrationNo.,Status\n');
    for (const vehicleNumber of vehicleNumbers) {
        progressBar.increment();
        if (!shouldRefresh && vehicleNumber in db) {
            output[vehicleNumber] = db[vehicleNumber];
        } else {
            try {
                output[vehicleNumber] = db[vehicleNumber] = await checkVehicleNumber(vehicleNumber);
            } catch (error) {
                console.error(error);
            }
        }

        await fs.appendFile('output.csv', `${vehicleNumber},${output[vehicleNumber]}\n`);
        await fs.writeFile('data.json', JSON.stringify(db, null, 2));
    }
    progressBar.stop();

}

main()
    .catch(console.error);
