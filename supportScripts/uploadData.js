import fs from "fs";
import { parse } from "csv-parse";
import { getStreamAsArray } from 'get-stream';
import { v4 as uuidv4 } from 'uuid';
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { BatchWriteCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const loadCsv = async (path) => {
    const parseStream = parse({ delimiter: ',', from_line: 2 });
    const items = await getStreamAsArray(fs.createReadStream(path).pipe(parseStream));

    fs.writeFile(`../csvs/arrayOfItemsArrays.json`, JSON.stringify({ data: items }), (error) => {
        if (error) throw error;
    });
}

const createArrayOfItemObjects = async () => {
    let arrayOfItems = []
    const data = fs.readFileSync(`../csvs/arrayOfItemsArrays.json`)
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

    fs.writeFile(`../csvs/arrayOfItemObjects.json`, JSON.stringify({ data: arrayOfItems }), (error) => {
        if (error) throw error;
    });
}

const createDynamoObjects = async () => {
    let arrayOfPutObjects = []
    let numberOfItems = {}
    const data = fs.readFileSync(`../csvs/arrayOfItemObjects.json`)
    let itemObjects = JSON.parse(data).data

    for (let i = 0; i < itemObjects.length; i += 1) {
        const id = numberOfItems[itemObjects[i].rarity] ? numberOfItems[itemObjects[i].rarity] + 1 : 1

        arrayOfPutObjects.push({
            "PutRequest": {
                "Item": {
                    "PK": itemObjects[i].rarity,
                    "SK": id.toString(),
                    "id": `item_${id}`,
                    "type": "item",
                    "attributes": JSON.stringify(itemObjects[i])
                }
            }
        })

        numberOfItems[itemObjects[i].rarity] = id
    }

    arrayOfPutObjects.push({
        "PutRequest": {
            "Item": {
                "PK": "items",
                "SK": "dc9b4ff8-e370-4d40-bf05-3ee9390ec256",
                "id": 'items_dc9b4ff8-e370-4d40-bf05-3ee9390ec256',
                "type": "items",
                "attributes": JSON.stringify({ numberOf: numberOfItems })
            }
        }
    })

    fs.writeFile(`../csvs/arrayOfPutObjects.json`, JSON.stringify({ data: arrayOfPutObjects }), (error) => {
        if (error) throw error;
    });
}

const chunkData = async () => {
    const data = fs.readFileSync(`../csvs/arrayOfPutObjects.json`)
    let dataJson = JSON.parse(data).data

    let chunkedEntries = []

    const chunkSize = 25;
    for (let i = 0; i < dataJson.length; i += chunkSize) {
        const chunk = dataJson.slice(i, i + chunkSize);
        chunkedEntries.push(chunk)
    }

    fs.writeFile(`../csvs/arrayOfChunkedPutObjects.json`, JSON.stringify({ data: chunkedEntries }), (error) => {
        if (error) throw error;
    });
}

const uploadToDynamo = async () => {
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);
    const data = fs.readFileSync(`../csvs/arrayOfChunkedPutObjects.json`)
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

main('../csvs/DnD Loot - Sheet1.csv', 5)