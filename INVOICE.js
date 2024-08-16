const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const ftp = require('basic-ftp');
const moment = require('moment');

// Function to create directories if they do not exist
function createDirectories(folderPath) {
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
}

async function getFilteredDateFoldersFromFTP(client, basePath, specifiedDate) {
    const folders = await client.list(basePath);
    const dateFolders = [];

    // Convert the specified date to a moment object
    const specifiedDateMoment = moment(specifiedDate, 'YYYY-MM-DD', true);

    for (const folder of folders) {
        if (folder.isDirectory) {
            const folderDate = moment(folder.name, 'YYYYMMDD', true);
            if (folderDate.isValid()) {
                // Include folders that match the specified date
                if (folderDate.isSame(specifiedDateMoment, 'day')) {
                    dateFolders.push(path.join(basePath, folder.name));
                }
            }
        }
    }

    return dateFolders;
}

// Function to process CSV data to JSON with the specified structure
function processCsvDataToJson(data, fileName, jsonOutputBasePath, matchCriteria, defaultDate) {
    Papa.parse(data, {
        header: false,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
            const mob3Rows = results.data.filter(row => row.includes('MOB3') && row.includes('P1.4'));
            const jsonArray = [];

            if (mob3Rows.length > 0) {
                const firstRow = results.data[0];

                // Collect payment terms dynamically
                const paymentsTerms = [];
                for (let i = 12; i < firstRow.length; i += 6) {
                    if (firstRow[i] && firstRow[i + 2] && firstRow[i + 3] && firstRow[i + 4]) {
                        paymentsTerms.push({
                            date: firstRow[i + 2] || '', // Column O for due date
                            amount_due: firstRow[i + 4] || '', // Column S for amount due
                            discount_base: firstRow[i + 3] || '', // Column R for discount base
                            discount_allowed: firstRow[i + 5] || '' // Column T for discount allowed
                        });
                    }
                }

                const jsonObject = {
                    original_invoice: firstRow[5] || '', // Column F, first row value
                    date: firstRow[3] || '', // Column D, first row value
                    bill_to_address: firstRow[10] || '', // Column K, first row value
                    bol_no: mob3Rows[0][2] || '', // Column C, first row with "ITM" or "ITMTAX"
                    product: [],
                    tax_summary: [],
                    payments_terms: {
                        terms: firstRow[12] || '', // Column M, first row value
                        due_dates: paymentsTerms
                    },
                    total_amount: {
                        total_net: '', // To be calculated
                        total_taxes: '', // To be calculated
                        total: '' // To be calculated
                    }
                };

                // Process ITM rows
                const itmRows = results.data.filter(row => row[0] === 'ITM');
                // Process ITMTAX rows
                // const itmTaxRows = results.data.filter(row => row[0] === 'ITMTAX');

                itmRows.forEach(itmRow => {
                    // Find the corresponding ITMTAX row for the current ITM row
                    const itmTaxRow = results.data.filter(row => row[0] === 'ITMTAX');
                    itmTaxRow.forEach(itmTaxsRow => {

                        jsonObject.product.push({
                            prodId: itmRow[5] || '', // Column F, ITM row value
                            product_description: {
                                item: itmRow[3] || '', // Column D, ITM row value
                                item_tax: itmTaxsRow ? itmTaxsRow[3] || '' : '', // Column D, ITMTAX row value
                                item_quantity: itmRow[8] || '', // Column I, ITM row value
                                item_tax_quantity: itmTaxsRow ? itmTaxsRow[8] || '' : '', // Column I, ITMTAX row value
                                item_price: itmRow[11] || '', // Column L, ITM row value
                                item_tax_price: itmTaxsRow ? itmTaxsRow[6] || '' : '', // Column H, ITMTAX row value
                                item_amount: itmRow[13] || '', // Column M, ITM row value
                                item_tax_amount: itmTaxsRow ? itmTaxsRow[7] || '' : '', // Column I, ITMTAX row value
                                total: itmRow[13] || '' // Column M, ITM row value
                            }
                        })
                    });
                });

                // Process SUMTAX rows for the tax_summary section
                const sumtaxRows = results.data.filter(row => row[0] === 'SUMTAX');

                sumtaxRows.forEach(sumtaxRow => {
                    jsonObject.tax_summary.push({
                        sub_tax: sumtaxRow[2] || '', // Column C, SUMTAX row value
                        volume_unit: sumtaxRow[3] || '', // Column D, SUMTAX row value
                        price: sumtaxRow[6] || '', // Column G, SUMTAX row value
                        amount: sumtaxRow[7] || '' // Column H, SUMTAX row value
                    });
                });

                // Save JSON to file
                const jsonFolder = path.join(jsonOutputBasePath, "exxonmobil");
                createDirectories(jsonFolder);

                const jsonFileName = `exxonmobil_invoice_${defaultDate}.json`;
                const jsonFilePath = path.join(jsonFolder, jsonFileName);

                // Append data to existing file or create a new file
                let existingData = [];
                if (fs.existsSync(jsonFilePath)) {
                    existingData = JSON.parse(fs.readFileSync(jsonFilePath, 'utf8'));
                }
                existingData.push(jsonObject);
                fs.writeFileSync(jsonFilePath, JSON.stringify(existingData, null, 2));
                console.log(`JSON file updated: ${jsonFilePath}`);
            } else {
                console.log('No matching MOB3 rows found in the CSV:', fileName);
            }
        },
        error: (parseError) => {
            console.error('Error parsing CSV with PapaParse:', parseError);
        }
    });
}

// Define the match criteria for invoices
const matchCriteria = {
    "Exxonmobil": {
        "INVOICE": ["MOB3"],
    }
};

// Function to process all CSV files in relevant folders from FTP and store results
async function processCsvFilesFromFTP(ftpConfig, daysBack, outputBasePath, jsonOutputBasePath, matchCriteria) {
    const client = new ftp.Client();
    client.ftp.verbose = true;

    try {
        await client.access({
            host: ftpConfig.host,
            user: ftpConfig.user,
            password: ftpConfig.password,
            secure: ftpConfig.secure
        });

        const filteredFolders = await getFilteredDateFoldersFromFTP(client, ftpConfig.basePath, daysBack);

        for (const folder of filteredFolders) {
            const list = await client.list(folder);

            for (const file of list) {
                if (file.isFile && path.extname(file.name) === '.csv') {
                    const localFolder = path.join(outputBasePath, path.basename(folder));
                    createDirectories(localFolder);

                    const remoteFilePath = path.join(folder, file.name);
                    const localFilePath = path.join(localFolder, file.name);

                    // Download the file to a local temporary file
                    await client.downloadTo(localFilePath, remoteFilePath);

                    // Read the downloaded file
                    const data = fs.readFileSync(localFilePath, 'utf8');

                    // Extract date from folder name
                    const date = path.basename(folder);

                    // Process the CSV data and generate JSON files
                    processCsvDataToJson(data, file.name, jsonOutputBasePath, matchCriteria, date);
                }
            }
        }
    } catch (err) {
        console.error('Error processing FTP files:', err);
    } finally {
        client.close();
    }
}

// Define FTP configuration
const ftpConfig = {
    host: "ftp.dtnenergy.com",
    user: "1445662.001",
    password: "ejyJhKmWrJ4ISLC",
    secure: false, // or true if using FTPS
    timeout: 10000,
    basePath: '/'
};

// Define the base output directories and number of days back
const outputDir = 'D:/fenil/Invoice-Update-Output'; // Directory where the CSV files will be stored
const jsonOutputDir = 'D:/fenil/Invoice-Update-JSON-store'; // Directory where the JSON files will be stored
const daysBack = "2024-08-15"; // Number of days to look back

// Start processing the files from FTP
processCsvFilesFromFTP(ftpConfig, daysBack, outputDir, jsonOutputDir, matchCriteria);
