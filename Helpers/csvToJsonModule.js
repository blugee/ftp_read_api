// // csvToJsonModule.js
// const fs = require('fs');
// const path = require('path');
// const Papa = require('papaparse');

// function processCsvDataToJson(data, jsonOutputBasePath, matchCriteria, defaultDate) {
//     const jsonArray = [];

//     Papa.parse(data, {
//         header: false,
//         skipEmptyLines: true,
//         dynamicTyping: true,
//         complete: (results) => {
//             const ltrRows = results.data.filter(row => row[0] === 'LTR');

//             // Extract the date from the first row of column F
//             const csvDate = results.data[0][5]; // Assuming the date is in the first row of column F

//             ltrRows.forEach(row => {
//                 jsonArray.push({
//                     location: row[2], // Column "C"
//                     count: row[3], // Column "D"
//                     gross_amt: row[4], // Column "E"
//                     fees: row[6], // Column "G"
//                     net_amt: row[15], // Column "P"
//                 });
//             });

//             if (jsonArray.length > 0) {
//                 Object.keys(matchCriteria).forEach(category => {
//                     Object.keys(matchCriteria[category]).forEach(type => {
//                         const identifiers = matchCriteria[category][type];

//                         const matches = results.data.some(record =>
//                             record.some(field =>
//                                 typeof field === 'string' && identifiers.some(identifier => field.includes(identifier))
//                             )
//                         );

//                         if (matches) {
//                             const jsonFolder = path.join(jsonOutputBasePath, category.toLowerCase());
//                             createDirectories(jsonFolder);

//                             const jsonFileName = `${category.toLowerCase()}_${type.toLowerCase()}_${defaultDate}.json`;
//                             const jsonFilePath = path.join(jsonFolder, jsonFileName);

//                             let jsonObject = {};
//                             if (fs.existsSync(jsonFilePath)) {
//                                 const existingData = fs.readFileSync(jsonFilePath, 'utf8');
//                                 jsonObject = JSON.parse(existingData);
//                             }

//                             const key = `${category.toLowerCase()}_${type.toLowerCase()}`;
//                             if (!jsonObject[key]) {
//                                 jsonObject[key] = [];
//                             }

//                             jsonObject[key].push(...jsonArray);

//                             // Add the date key to the JSON object
//                             jsonObject.date = csvDate;

//                             fs.writeFileSync(jsonFilePath, JSON.stringify(jsonObject, null, 2));
//                             console.log(`JSON file updated: ${jsonFilePath}`);
//                         }
//                     });
//                 });
//             } else {
//                 console.log('No matching LTR rows found in the CSV.');
//             }
//         },
//         error: (parseError) => {
//             console.error('Error parsing CSV with PapaParse:', parseError);
//         }
//     });

//     return jsonArray;
// }

// function createDirectories(folderPath) {
//     if (!fs.existsSync(folderPath)) {
//         fs.mkdirSync(folderPath, { recursive: true });
//     }
// }

// module.exports = {
//     processCsvDataToJson,
//     createDirectories
// };
///////////////////////////////////////////////////////////////////////////////////////

// const fs = require('fs');
// const path = require('path');
// const Papa = require('papaparse');

// function processCsvDataToJson(data, jsonOutputBasePath, matchCriteria, defaultDate) {
//     const jsonObject = {}; // Object to hold arrays of data

//     Papa.parse(data, {
//         header: false,
//         skipEmptyLines: true,
//         dynamicTyping: true,
//         complete: (results) => {
//             const ltrRows = results.data.filter(row => row[0] === 'LTR');

//             // Extract the date from the first row of column F
//             const csvDate = results.data[0][5]; // Assuming the date is in the first row of column F

//             ltrRows.forEach(row => {
//                 const jsonRow = {
//                     location: row[2], // Column "C"
//                     count: row[3], // Column "D"
//                     gross_amt: row[4], // Column "E"
//                     fees: row[6], // Column "G"
//                     net_amt: row[15], // Column "P"
//                 };

//                 Object.keys(matchCriteria).forEach(category => {
//                     Object.keys(matchCriteria[category]).forEach(type => {
//                         const identifiers = matchCriteria[category][type];
//                         const key = `${category.toLowerCase()}_${type.toLowerCase()}`;

//                         const matches = results.data.some(record =>
//                             record.some(field =>
//                                 typeof field === 'string' && identifiers.some(identifier => field.includes(identifier))
//                             )
//                         );

//                         if (matches) {
//                             if (!jsonObject[key]) {
//                                 jsonObject[key] = []; // Initialize the array if it doesn't exist
//                             }

//                             jsonObject[key].push(jsonRow);
//                         }
//                     });
//                 });
//             });

//             // Add the date key to each object in the arrays
//             for (const key in jsonObject) {
//                 jsonObject[key].forEach(obj => {
//                     obj.date = csvDate;
//                 });
//             }

//             // Optionally, save to a JSON file if needed
//             Object.keys(jsonObject).forEach(key => {
//                 const jsonFolder = path.join(jsonOutputBasePath, key);
//                 createDirectories(jsonFolder);

//                 const jsonFileName = `${key}_${defaultDate}.json`;
//                 const jsonFilePath = path.join(jsonFolder, jsonFileName);

//                 let jsonFileData = [];
//                 if (fs.existsSync(jsonFilePath)) {
//                     const existingData = fs.readFileSync(jsonFilePath, 'utf8');
//                     jsonFileData = JSON.parse(existingData);
//                 }

//                 // Append new data to the existing JSON data
//                 jsonFileData.push(...jsonObject[key]);

//                 fs.writeFileSync(jsonFilePath, JSON.stringify(jsonFileData, null, 2));
//                 console.log(`JSON file updated: ${jsonFilePath}`);
//             });
//         },
//         error: (parseError) => {
//             console.error('Error parsing CSV with PapaParse:', parseError);
//         }
//     });

//     return jsonObject;
// }

// function createDirectories(folderPath) {
//     if (!fs.existsSync(folderPath)) {
//         fs.mkdirSync(folderPath, { recursive: true });
//     }
// }

// module.exports = {
//     processCsvDataToJson,
//     createDirectories
// };




const fs = require('fs');
const path = require('path');
const Papa = require('papaparse');

function processCsvDataToJson(data, jsonOutputBasePath, matchCriteria, defaultDate) {
    const jsonObject = {}; // Object to hold key-value pairs

    Papa.parse(data, {
        header: false,
        skipEmptyLines: true,
        dynamicTyping: true,
        complete: (results) => {
            const ltrRows = results.data.filter(row => row[0] === 'LTR');

            // Extract the date from the first row of column F
            const csvDate = results.data[0][5]; // Assuming the date is in the first row of column F

            ltrRows.forEach(row => {
                const jsonRow = {
                    location: row[2], // Column "C"
                    count: row[3], // Column "D"
                    gross_amt: row[4], // Column "E"
                    fees: row[6], // Column "G"
                    net_amt: row[15], // Column "P"
                };

                Object.keys(matchCriteria).forEach(category => {
                    Object.keys(matchCriteria[category]).forEach(type => {
                        const identifiers = matchCriteria[category][type];

                        const matches = results.data.some(record =>
                            record.some(field =>
                                typeof field === 'string' && identifiers.some(identifier => field.includes(identifier))
                            )
                        );

                        if (matches) {
                            const key = `${category.toLowerCase()}_${type.toLowerCase()}`;

                            // Initialize the array for this key if it does not exist
                            if (!jsonObject[key]) {
                                jsonObject[key] = [];
                            }

                            // Add data to the array
                            jsonObject[key].push(jsonRow);
                        }
                    });
                });
            });

            // Clean up the jsonObject to remove empty objects
            Object.keys(jsonObject).forEach(key => {
                if (jsonObject[key].length === 0) {
                    delete jsonObject[key];
                }
            });

            // Optionally, save to a JSON file if needed
            Object.keys(jsonObject).forEach(key => {
                const jsonFolder = path.join(jsonOutputBasePath, key.split('_')[0]); // Create folder based on category
                createDirectories(jsonFolder);

                const jsonFileName = `${key}_${defaultDate}.json`;
                const jsonFilePath = path.join(jsonFolder, jsonFileName);

                let jsonFileData = [];
                if (fs.existsSync(jsonFilePath)) {
                    const existingData = fs.readFileSync(jsonFilePath, 'utf8');
                    jsonFileData = JSON.parse(existingData);
                }

                // Append new data to the existing JSON data
                jsonFileData = jsonFileData.concat(jsonObject[key]);

                // Add the date key to each object in the array
                jsonFileData.forEach(item => {
                    item.date = csvDate;
                });

                // fs.writeFileSync(jsonFilePath, JSON.stringify(jsonFileData, null, 2));
                // console.log(`JSON file updated: ${jsonFilePath}`);
            });
        },
        error: (parseError) => {
            console.error('Error parsing CSV with PapaParse:', parseError);
        }
    });

    return jsonObject;
}

function createDirectories(folderPath) {
    if (!fs.existsSync(folderPath)) {
        fs.mkdirSync(folderPath, { recursive: true });
    }
}

module.exports = {
    processCsvDataToJson,
    createDirectories
};
