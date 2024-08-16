const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');
const ftp = require('basic-ftp');

// Function to get folders from FTP based on dates
async function getFilteredDateFoldersFromFTP(client, basePath, specificDate) {
    const resultDates = [];

    const date = new Date(specificDate);

    // Format the date as YYYYMMDD
    const folderName = date.toISOString().slice(0, 10).replace(/-/g, '').slice(0, 8);

    const folderPath = path.join(basePath, folderName);

    // Check if the directory exists on the FTP server
    try {
        await client.cd(folderPath);
        resultDates.push(folderPath);
        await client.cd('..'); // Move back to the parent directory
    } catch (err) {
        console.log(`Folder ${folderPath} does not exist on FTP server.`);
    }
    return resultDates;
}

// Function to create directories if they do not exist
function createDirectories(folderPath) {
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
}

function processCsvDataToJson(data, fileName, jsonOutputBasePath, matchCriteria, defaultDate) {
    Papa.parse(data, {
        header: false,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
            const ltrRows = results.data.filter(row => row[0] === 'LTR');
            const jsonArray = [];

            // Extract the date from the first row of column F
            const csvDate = results.data[0][5]; // Assuming the date is in the first row of column F

            ltrRows.forEach(row => {
                jsonArray.push({
                    location: row[2], // Column "C"
                    count: row[3], // Column "D"
                    gross_amt: row[4], // Column "E"
                    fees: row[6], // Column "G"
                    net_amt: row[15], // Column "P"
                });
            });

            if (jsonArray.length > 0) {
                Object.keys(matchCriteria).forEach(category => {
                    Object.keys(matchCriteria[category]).forEach(type => {
                        const identifiers = matchCriteria[category][type];

                        const matches = results.data.some(record =>
                            record.some(field =>
                                typeof field === 'string' && identifiers.some(identifier => field.includes(identifier))
                            )
                        );

                        if (matches) {
                            const jsonFolder = path.join(jsonOutputBasePath, category.toLowerCase());
                            createDirectories(jsonFolder);

                            const jsonFileName = `${category.toLowerCase()}_${type.toLowerCase()}_${defaultDate}.json`;
                            const jsonFilePath = path.join(jsonFolder, jsonFileName);

                            let jsonObject = {};
                            if (fs.existsSync(jsonFilePath)) {
                                const existingData = fs.readFileSync(jsonFilePath, 'utf8');
                                jsonObject = JSON.parse(existingData);
                            }

                            const key = `${category.toLowerCase()}_${type.toLowerCase()}`;
                            if (!jsonObject[key]) {
                                jsonObject[key] = [];
                            }

                            jsonObject[key].push(...jsonArray);

                            // Add the date key to the JSON object
                            jsonObject.date = csvDate;

                            fs.writeFileSync(jsonFilePath, JSON.stringify(jsonObject, null, 2));
                            console.log(`JSON file updated: ${jsonFilePath}`);
                        }
                    });
                });
            } else {
                console.log('No matching LTR rows found in the CSV:', fileName);
            }
        },
        error: (parseError) => {
            console.error('Error parsing CSV with PapaParse:', parseError);
        }
    });
}

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

        const filteredFolders = await getFilteredDateFoldersFromFTP(client, ftpConfig.basePath, specificDate);

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
const outputDir = 'D:/fenil/Update-Output'; // Directory where the CSV files will be stored
const jsonOutputDir = 'D:/fenil/Update-JSON-store'; // Directory where the JSON files will be stored
const specificDate = "2024-08-15"; // Number of days to look back

// Define the match criteria
const matchCriteria = {
    "Citigo": {
        "CCM": ["CIT1-PPD", "CIT1-CCM"],
    },
    "Exxonmobil": {
        "CCM": ["MOB3-CCM"],
    }
};

// Start processing the files from FTP
processCsvFilesFromFTP(ftpConfig, specificDate, outputDir, jsonOutputDir, matchCriteria);