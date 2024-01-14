import fs from "fs";
import { parse } from "csv-parse";
import { getStreamAsArray } from 'get-stream';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import util from 'util'
import 'lodash.combinations';
import _ from 'lodash';
import upath from 'upath'
import CryptoJS from "crypto-js"

const loadCsv = async (path) => {
    const parseStream = parse({ delimiter: ',', from_line: 2 });
    const items = await getStreamAsArray(fs.createReadStream(upath.normalize(path)).pipe(parseStream));

    fs.writeFile(upath.normalize(`./csvs/arrayOfItemsArrays.json`), JSON.stringify({ data: items }), (error) => {
        if (error) throw error;
    });
}

const createArrayOfItemObjects = async () => {
    let arrayOfItems = []
    const data = fs.readFileSync(upath.normalize(`./csvs/arrayOfItemsArrays.json`))
    let items = JSON.parse(data).data

    items.forEach((item) => {
        let itemObject = {
            name: item[0],
            link: item[1],
            rarity: item[2],
            isCursed: item[3].toLowerCase() === 'true',
            type: item[4],
            source: item[5],
            isAdventureSpecific: Number(item[6])
        }

        arrayOfItems.push(itemObject)
    })

    fs.writeFile(upath.normalize(`./csvs/arrayOfItemObjects.json`), JSON.stringify({ data: arrayOfItems }), (error) => {
        if (error) throw error;
    });
}

const createDynamoObjects = async () => {
    let arrayOfPutObjects = []
    let numberOfItems = {}
    let numberOfItemsBySource = {}
    let numberOfItemsBySourceInt = {}
    let numberOfItemsInt = 0
    let numberOfItemsByRarity = {}
    let numberOfItemsByIsCursed = {}
    let numberOfItemsByType = {}
    let numberOfItemsByIsAdventureSpecific = {}
    const data = fs.readFileSync(upath.normalize(`./csvs/arrayOfItemObjects.json`))
    let itemObjects = JSON.parse(data).data

    for (let i = 0; i < itemObjects.length; i += 1) {
        const type = itemObjects[i].type.replace(/ *\([^)]*\) */g, "")
        const pkHash = CryptoJS.SHA256(`${itemObjects[i].rarity}${itemObjects[i].isCursed}${type}${itemObjects[i].source}${itemObjects[i].isAdventureSpecific}`).toString();
        const id = numberOfItems[pkHash] ? numberOfItems[pkHash] + 1 : 1

        arrayOfPutObjects.push({
            "PutRequest": {
                "Item": {
                    "PK": pkHash,
                    "SK": id.toString(),
                    "id": `item_${id}`,
                    "type": "item",
                    "attributes": JSON.stringify(itemObjects[i])
                }
            }
        })

        numberOfItems[pkHash] = id
        numberOfItemsInt += 1

        if (!numberOfItemsBySource[itemObjects[i].source]) {
            numberOfItemsBySource[itemObjects[i].source] = {}
            numberOfItemsBySourceInt[itemObjects[i].source] = 0
        }
        if (!numberOfItemsBySource[itemObjects[i].source][itemObjects[i].rarity]) {
            numberOfItemsBySource[itemObjects[i].source][itemObjects[i].rarity] = 0
        }
        if (!numberOfItemsByRarity[itemObjects[i].rarity]) {
            numberOfItemsByRarity[itemObjects[i].rarity] = 0
        }
        if (!numberOfItemsByIsCursed[itemObjects[i].isCursed]) {
            numberOfItemsByIsCursed[itemObjects[i].isCursed] = 0
        }
        if (!numberOfItemsByType[type]) {
            numberOfItemsByType[type] = 0
        }
        if (!numberOfItemsByIsAdventureSpecific[itemObjects[i].isAdventureSpecific]) {
            numberOfItemsByIsAdventureSpecific[itemObjects[i].isAdventureSpecific] = 0
        }

        numberOfItemsByIsAdventureSpecific[itemObjects[i].isAdventureSpecific] += 1
        numberOfItemsByType[type] += 1
        numberOfItemsByIsCursed[itemObjects[i].isCursed] += 1
        numberOfItemsBySource[itemObjects[i].source][itemObjects[i].rarity] += 1
        numberOfItemsBySourceInt[itemObjects[i].source] += 1
        numberOfItemsByRarity[itemObjects[i].rarity] += 1
    }

    const arrayOfHashes = Object.keys(numberOfItems)

    for (let i = 0; i < arrayOfHashes.length; i++) {
        arrayOfPutObjects.push({
            "PutRequest": {
                "Item": {
                    "PK": "items",
                    "SK": arrayOfHashes[i],
                    "id": `items_${arrayOfHashes[i]}`,
                    "type": "items",
                    "attributes": JSON.stringify({ 
                        numberOf: numberOfItems[arrayOfHashes[i]], 
                    })
                }
            }
        })
    }

    delete numberOfItemsBySource["Spell Scroll"]

    arrayOfPutObjects.push({
        "PutRequest": {
            "Item": {
                "PK": "metaData",
                "SK": "31a6974e-00fa-44a1-b1ff-c3298be4ed7f",
                "id": 'metaData_31a6974e-00fa-44a1-b1ff-c3298be4ed7f',
                "type": "metaData",
                "attributes": JSON.stringify({ 
                    numberOfItemsByRarity, 
                    numberOfItems: numberOfItemsInt,
                    numberOfItemsBySourceAndRarity: numberOfItemsBySource,
                    numberOfItemsBySource: numberOfItemsBySourceInt,
                    numberOfItemsByIsAdventureSpecific,
                    numberOfItemsByType,
                    numberOfItemsByIsCursed
                })
            }
        }
    })
    arrayOfPutObjects.push({
        "PutRequest": {
            "Item": {
                "PK": "sources",
                "SK": "1ebd5ec0-9a4c-40b0-afd6-fe104e75192a",
                "id": 'sources_1ebd5ec0-9a4c-40b0-afd6-fe104e75192a',
                "type": "sources",
                "attributes": JSON.stringify({ 
                    sources: Object.keys(numberOfItemsBySource)
                })
            }
        }
    })
    arrayOfPutObjects.push({
        "PutRequest": {
            "Item": {
                "PK": "possibilities",
                "SK": "c19ad1f1-d5f7-4319-8971-7ca5281faf67",
                "id": 'possibilities_1ebd5ec0-9a4c-40b0-afd6-fe104e75192a',
                "type": "possibilities",
                "attributes": JSON.stringify({ 
                    sources: Object.keys(numberOfItemsBySource),
                    rarities: Object.keys(numberOfItemsByRarity),
                    isAdventureSpecific: Object.keys(numberOfItemsByIsAdventureSpecific),
                    types: Object.keys(numberOfItemsByType),
                    isCursed: Object.keys(numberOfItemsByIsCursed)
                })
            }
        }
    })
    arrayOfPutObjects.push({
        "PutRequest": {
            "Item": {
                "PK": "rates",
                "SK": "74e3e7da-af1d-474a-ad40-7da5f0939922",
                "id": 'rates_74e3e7da-af1d-474a-ad40-7da5f0939922',
                "type": "rates",
                "attributes": JSON.stringify({
                    "cr0to4": {
                        "displayName": "CR 0 to 4",
                        "common": 3200,
                        "uncommon": (3200)+4800,
                        "rare": (3200+4800)+2000,
                        "veryRare": 0,
                        "legendary": 0,
                        "artifact": 0,
                        "spellScrollChance": 1278
                    },
                    "cr5to10": {
                        "displayName": "CR 5 to 10",
                        "common": 2580,
                        "uncommon": (2580)+4000,
                        "rare": (2580+4000)+2236,
                        "veryRare": (2580+4000+2236)+1184,
                        "legendary": 0,
                        "artifact": 0,
                        "spellScrollChance": 1513
                    },
                    "cr11to16": {
                        "displayName": "CR 11 to 16",
                        "common": 740,
                        "uncommon": (740)+1560,
                        "rare": (740+1560)+3220,
                        "veryRare": (740+1560+3220)+3400,
                        "legendary": (740+1560+3220+3400)+1080,
                        "artifact": 0,
                        "spellScrollChance": 1612
                    },
                    "cr17up": {
                        "displayName": "CR 17 up",
                        "common": 0,
                        "uncommon": 72,
                        "rare": (72)+1814,
                        "veryRare": (72+1814)+5134,
                        "legendary": (72+1814+5134)+2880,
                        "artifact": (72+1814+5134+2880)+100,
                        "spellScrollChance": 2267
                    }
                })
            }
        }
    })
    arrayOfPutObjects.push({
        "PutRequest": {
            "Item": {
                "PK": "campaign#9bb45f68-85c1-4e71-b64f-040712d88488",
                "SK": "rates#74e3e7da-af1d-474a-ad40-7da5f0939922",
                "id": 'rates_74e3e7da-af1d-474a-ad40-7da5f0939922',
                "type": "rates",
                "attributes": JSON.stringify({
                    "cr0to4": {
                        "displayName": "CR 0 to 4",
                        "common": 3200,
                        "uncommon": (3200)+4800,
                        "rare": (3200+4800)+2000,
                        "veryRare": 0,
                        "legendary": 0,
                        "artifact": 0,
                        "spellScrollChance": 1278
                    },
                    "cr5to10": {
                        "displayName": "CR 5 to 10",
                        "common": 2580,
                        "uncommon": (2580)+4000,
                        "rare": (2580+4000)+2236,
                        "veryRare": (2580+4000+2236)+1184,
                        "legendary": 0,
                        "artifact": 0,
                        "spellScrollChance": 1513
                    },
                    "cr11to16": {
                        "displayName": "CR 11 to 16",
                        "common": 740,
                        "uncommon": (740)+1560,
                        "rare": (740+1560)+3220,
                        "veryRare": (740+1560+3220)+3400,
                        "legendary": (740+1560+3220+3400)+1080,
                        "artifact": 0,
                        "spellScrollChance": 1612
                    },
                    "cr17up": {
                        "displayName": "CR 17 up",
                        "common": 0,
                        "uncommon": 72,
                        "rare": (72)+1814,
                        "veryRare": (72+1814)+5134,
                        "legendary": (72+1814+5134)+2880,
                        "artifact": (72+1814+5134+2880)+100,
                        "spellScrollChance": 2267
                    }
                })
            }
        }
    })
    arrayOfPutObjects.push({
        "PutRequest": {
            "Item": {
                "PK": "campaign",
                "SK": "9bb45f68-85c1-4e71-b64f-040712d88488",
                "id": 'campaign_9bb45f68-85c1-4e71-b64f-040712d88488',
                "type": "campaign",
                "attributes": JSON.stringify({
                    name: "The Hiers"
                })
            }
        }
    })

    fs.writeFile(upath.normalize(`./csvs/arrayOfPutObjects.json`), JSON.stringify({ data: arrayOfPutObjects }), (error) => {
        if (error) throw error;
    });
}

const chunkData = async () => {
    const data = fs.readFileSync(upath.normalize(`./csvs/arrayOfPutObjects.json`))
    let dataJson = JSON.parse(data).data

    let chunkedEntries = []

    const chunkSize = 25;
    for (let i = 0; i < dataJson.length; i += chunkSize) {
        const chunk = dataJson.slice(i, i + chunkSize);
        chunkedEntries.push(chunk)
    }

    fs.writeFile(upath.normalize(`./csvs/arrayOfChunkedPutObjects.json`), JSON.stringify({ data: chunkedEntries }), (error) => {
        if (error) throw error;
    });
}

const uploadToDynamo = async () => {
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);
    const data = fs.readFileSync(upath.normalize(`./csvs/arrayOfChunkedPutObjects.json`))
    let dataJson = JSON.parse(data).data

    for (let i = 0; i < dataJson.length; i += 1) {
        const putRequests = {
            "loot_table": dataJson[i],
        }

        const command = new BatchWriteCommand({
            RequestItems: putRequests
        });

        await docClient.send(command);
    }
}

const main = async (path, step) => {
    switch (step) {
        case 1:
            await loadCsv(path)
            break;
        case 2:
            await createArrayOfItemObjects()
            break;
        case 3:
            await createDynamoObjects()
            break;
        case 4:
            await chunkData()
            break;
        case 5:
            await uploadToDynamo()
            break;
        case "generateId":
            console.log(uuidv4())
            break;
        default:
            break;
    }
}

main(upath.normalize('./csvs/DnDLoot-items.csv'), 5)