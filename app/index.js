import Lambda from "@carson.key/lambdawrapper"
import fetch from 'node-fetch'
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QueryCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";

const run = async (lambda) => {
    const body = JSON.parse(lambda.event.body)
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);

    const command = new QueryCommand({
        TableName: "loot_table",
        KeyConditionExpression: "PK = :campaignId AND begins_with(SK, :type)",
        ExpressionAttributeValues: {
            ":campaignId": `campaign#${body.campaignId}`,
            ":type": "rates#"
        },
        ConsistentRead: true,
    });

    const response = await docClient.send(command);
    lambda.addToLog({ name: "dynamoResponse", body: response })

    const rates = JSON.parse(response.Items[0].attributes)
    const ratesToPullFrom = rates[body.cr]
    const arrayOfRarityRates = Object.keys(ratesToPullFrom)

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

    return lambda.success({ 
        body: { 
            "rarity": randomRarityValue, 
            isScroll, ratesToPullFrom,
            randomNumberForScroll, randomNumberForRarity 
        }, 
        message: "Success" 
    })
}

export const lambdaHandler = async (event, context) => {
    const lambdaObject = new Lambda({ event, context, run })

    await lambdaObject.main()

    return lambdaObject.response
};