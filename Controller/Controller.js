// index.js
const ftpModule = require('../Helpers/ftpModule');
const csvToJsonModule = require('../Helpers/csvToJsonModule');
const ftp = require('basic-ftp');
const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const moment = require('moment');

// Define FTP configuration
const ftpConfig = {
    host: "ftp.dtnenergy.com",
    user: "1445662.001",
    password: "ejyJhKmWrJ4ISLC",
    secure: false, // or true if using FTPS
    timeout: 10000,
    basePath: '/'
};

async function processCsvFilesFromFTP(ftpConfig, specificDate, outputBasePath, jsonOutputBasePath, matchCriteria) {
    const client = new ftp.Client();
    client.ftp.verbose = true;

    try {
        await client.access({
            host: ftpConfig.host,
            user: ftpConfig.user,
            password: ftpConfig.password,
            secure: ftpConfig.secure
        });

        const filteredFolders = await ftpModule.getFilteredDateFoldersFromFTP(client, ftpConfig.basePath, specificDate);
        const csvFiles = await ftpModule.downloadCsvFilesFromFTP(client, filteredFolders, outputBasePath);

        let finalArray = [];
        for (const csvFile of csvFiles) {
            const data = fs.readFileSync(csvFile.localFilePath, 'utf8');
            const jsonArray = csvToJsonModule.processCsvDataToJson(data, jsonOutputBasePath, matchCriteria, csvFile.folderName);

            finalArray = finalArray.concat(jsonArray); // Combine all JSON data into one array
        }

        finalArray = finalArray.filter(item => Object.keys(item).length > 0)

        const merged = {};
        finalArray.forEach(item => {
            // Iterate over each key-value pair in the current object
            Object.keys(item).forEach(key => {
                if (merged[key]) {
                    // If the key already exists in the merged object, concatenate arrays
                    merged[key] = merged[key].concat(item[key]);
                } else {
                    // Otherwise, add the key and its array to the merged object
                    merged[key] = item[key];
                }
            });
        });

        return merged;

    } catch (err) {
        console.error('Error processing FTP files:', err);
    } finally {
        client.close();
    }
}

const getCreditData = async (req, res) => {
    try {
        let specificDate = req.query.date;
        if (!specificDate) {
            return res.status(400).json({ error: 'Date is required for this request.' });
        }

        // // Define FTP configuration
        // const ftpConfig = {
        //     host: "ftp.dtnenergy.com",
        //     user: "1445662.001",
        //     password: "ejyJhKmWrJ4ISLC",
        //     secure: false, // or true if using FTPS
        //     timeout: 10000,
        //     basePath: '/'
        // };

        // Define the base output directories and number of days back
        const outputDir = 'D:/Update-Output'; // Directory where the CSV files will be stored
        const jsonOutputDir = 'D:/Update-JSON-store'; // Directory where the JSON files will be stored
        // const specificDate = "2024-08-15"; // Date to look for

        // Define the match criteria
        const matchCriteria = {
            "Citigo": {
                "CCM": ["CIT1-PPD", "CIT1-CCM"],
            },
            "Exxonmobil": {
                "CCM": ["MOB3-CCM"],
            }
        };

        let data = await processCsvFilesFromFTP(ftpConfig, specificDate, outputDir, jsonOutputDir, matchCriteria)
        res.status(200).json(data); // Send the result as JSON response
    } catch (error) {
        res.status(500).json({ error: 'An error occurred while processing the request.' });
    }
}

const getInvoicesData = async (date) => {
    try {

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

        let existingData = [];

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
        const outputDir = 'D:/2Invoice-Update-Output'; // Directory where the CSV files will be stored
        const jsonOutputDir = 'D:/2Invoice-Update-JSON-store'; // Directory where the JSON files will be stored
        const daysBack = "2024-08-15"; // Number of days to look back

        // Start processing the files from FTP
        await processCsvFilesFromFTP(ftpConfig, daysBack, outputDir, jsonOutputDir, matchCriteria);
        return existingData;

    } catch (error) {
        console.log(error)
        res.status(500).json({ error: 'An error occurred while processing the request.' });
    }
}

const getInvoicesData2 = async (req, res) => {
    try {
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

        let existingData = [];

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
                        const jsonFolder = path.join(jsonOutputBasePath, "citigo");
                        createDirectories(jsonFolder);

                        const jsonFileName = `citigo_invoice_${defaultDate}.json`;
                        const jsonFilePath = path.join(jsonFolder, jsonFileName);

                        // Append data to existing file or create a new file
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
            "Citigo": {
                "INVOICE": ["CIT1"],
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
        const outputDir = 'D:/1Invoice-Update-Output'; // Directory where the CSV files will be stored
        const jsonOutputDir = 'D:/1Invoice-Update-JSON-store'; // Directory where the JSON files will be stored
        const daysBack = "2024-08-15"; // Number of days to look back

        // Start processing the files from FTP
        await processCsvFilesFromFTP(ftpConfig, daysBack, outputDir, jsonOutputDir, matchCriteria);

        return existingData;
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: 'An error occurred while processing the request.' });
    }
}

const getInvoices = async (req, res) => {
    try {

        let date = req.query.date;
        let exxonmobilData = await getInvoicesData(date);
        // let citigoData = await getInvoicesData2(date);

        res.status(200).json({ exxonmobil: exxonmobilData,/*  citigo: citigoData */ }); // Send the result as JSON response
    } catch (error) {
        console.log(error)
        res.status(500).json({ error: 'An error occurred while processing the request.' });
    }
}

module.exports = { getCreditData, getInvoices };