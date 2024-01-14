import { QueryCommand } from "@aws-sdk/lib-dynamodb";

export const randomNumber = ({ maxNumber }) => {
    return Math.floor(Math.random() * maxNumber) + 1
}

export const getRates = async ({ lambda, docClient, cr, campaignId }) => {
    const commandRates = new QueryCommand({
        TableName: "loot_table",
        KeyConditionExpression: "PK = :campaignId AND begins_with(SK, :type)",
        ExpressionAttributeValues: {
            ":campaignId": `campaign#${campaignId}`,
            ":type": "rates#"
        },
        ConsistentRead: true,
    });

    const responseRates = await docClient.send(commandRates);
    lambda.addToLog({ name: "dynamoResponseForRates", body: responseRates })

    const rates = JSON.parse(responseRates.Items[0].attributes)
    const ratesToPullFrom = rates[cr]
    const arrayOfRarityRates = Object.keys(ratesToPullFrom)

    return { rates, ratesToPullFrom, arrayOfRarityRates }
}

export const determineRarity = async ({ 
    lambda, randomNumberForScroll, 
    randomNumberForRarity, arrayOfRarityRates, 
    ratesToPullFrom 
}) => {
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

    return { randomRarityValue, isScroll, randomNumberForScroll, randomNumberForRarity }
}

export const getPossibilities = async ({ lambda, docClient }) => {
    const commandItems = new QueryCommand({
        TableName: "loot_table",
        KeyConditionExpression: "PK = :possibilities",
        ExpressionAttributeValues: {
            ":possibilities": `possibilities`
        },
        ConsistentRead: true,
    });
    const responseItems = await docClient.send(commandItems);
    lambda.addToLog({ name: "dynamoResponseForPossibilities", body: responseItems })

    const possibilities = JSON.parse(responseItems.Items[0].attributes)
    lambda.addToLog({ name: "possibilitiesData", body: { items } })

    return { possibilities }
}

export const getItem = async ({ lambda, docClient, hash, randomNumberForItem }) => {
    const commandItem = new QueryCommand({
        TableName: "loot_table",
        KeyConditionExpression: "PK = :hash AND SK = :id",
        ExpressionAttributeValues: {
            ":hash": hash,
            ":id": randomNumberForItem.toString()
        },
        ConsistentRead: true,
    });
    const responseItem = await docClient.send(commandItem);
    lambda.addToLog({ name: "dynamoResponseForItem", body: responseItem })

    const item = JSON.parse(responseItem.Items[0].attributes)
    lambda.addToLog({ name: "itemData", body: { item } })

    return { item }
}