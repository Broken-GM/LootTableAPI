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

    const { 
        randomRarityValue, isScroll,
        randomNumberForScroll, randomNumberForRarity 
    } = await determineRarity({ lambda, arrayOfRarityRates, ratesToPullFrom })

    const { items, numberOfItemsInRarity, randomNumberForItem } = await getItems({ lambda, docClient, randomRarityValue })

    const { item } = await getItem({ lambda, docClient, randomRarityValue, randomNumberForItem })

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