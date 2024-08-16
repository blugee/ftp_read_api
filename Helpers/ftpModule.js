// ftpModule.js
const ftp = require('basic-ftp');
const path = require('path');

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

async function downloadCsvFilesFromFTP(client, filteredFolders, outputBasePath) {
    const csvFiles = [];

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

                csvFiles.push({ localFilePath, fileName: file.name, folderName: path.basename(folder) });
            }
        }
    }

    return csvFiles;
}

function createDirectories(folderPath) {
    const fs = require('fs');
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
}

module.exports = {
    getFilteredDateFoldersFromFTP,
    downloadCsvFilesFromFTP,
    createDirectories
};
