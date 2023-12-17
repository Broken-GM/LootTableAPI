import Lambda from "@carson.key/lambdawrapper"
import fetch from 'node-fetch'
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QueryCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { getRates, determineRarity, getItems, getItem } from './helpers.js'

const run = async (lambda) => {
    const body = JSON.parse(lambda.event.body)
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);

    const cr = body.cr
    const campaignId = body.campaignId

    const { rates, ratesToPullFrom, arrayOfRarityRates } = await getRates({ lambda, docClient, cr, campaignId })

    const randomNumberForScroll = Math.floor(Math.random() * 10000) + 1
    const randomNumberForRarity = Math.floor(Math.random() * 10000) + 1
    let randomRarityValue = null
    let isScroll = null

    for (let i = 0; i < arrayOfRarityRates.length; i++) {
        if (
            arrayOfRarityRates[i] === "spellScrollChance" || 
            ratesToPullFrom[arrayOfRarityRates[i]] === 0 || 
            arrayOfRarityRates[i] === "displayName"
        ) {
            continue
        } else if (randomNumberForRarity <= ratesToPullFrom[arrayOfRarityRates[i]]) {
            console.log(`Checked: `)
            randomRarityValue = arrayOfRarityRates[i]
            break
        }
    }

    if (randomNumberForScroll <= ratesToPullFrom.spellScrollChance) {
        isScroll = true
    } else {
        isScroll = false
    }

    lambda.addToLog({ name: "dataFromRandomGeneration", body: { 
        "rarity": randomRarityValue, 
        isScroll, ratesToPullFrom,
        randomNumberForScroll, randomNumberForRarity 
    }})

    const commandItems = new QueryCommand({
        TableName: "loot_table",
        KeyConditionExpression: "PK = :items",
        ExpressionAttributeValues: {
            ":items": `items`
        },
        ConsistentRead: true,
    });
    const responseItems = await docClient.send(commandItems);
    lambda.addToLog({ name: "dynamoResponseForItems", body: responseItems })

    const items = JSON.parse(responseItems.Items[0].attributes)
    const numberOfItemsInRarity = items.numberOf[randomRarityValue]
    const randomNumberForItem = Math.floor(Math.random() * numberOfItemsInRarity) + 1
    lambda.addToLog({ name: "itemsData", body: { items, numberOfItemsInRarity, randomNumberForItem } })

    const commandItem = new QueryCommand({
        TableName: "loot_table",
        KeyConditionExpression: "PK = :rarity AND SK = :id",
        ExpressionAttributeValues: {
            ":rarity": randomRarityValue,
            ":id": randomNumberForItem.toString()
        },
        ConsistentRead: true,
    });
    const responseItem = await docClient.send(commandItem);
    lambda.addToLog({ name: "dynamoResponseForItem", body: responseItem })

    const item = JSON.parse(responseItem.Items[0].attributes)
    lambda.addToLog({ name: "itemData", body: { item } })

    return lambda.success({ 
        body: item, 
        message: "Success" 
    })
}

export const lambdaHandler = async (event, context) => {
    const lambdaObject = new Lambda({ event, context, run })

    await lambdaObject.main()

    return lambdaObject.response
};