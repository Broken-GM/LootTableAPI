import Lambda from "@carson.key/lambdawrapper"
import fetch from 'node-fetch'
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { QueryCommand, DynamoDBDocumentClient } from "@aws-sdk/lib-dynamodb";
import { getRates, determineRarity, getItems, getItem, randomNumber } from './helpers.js'

const run = async (lambda) => {
    const body = JSON.parse(lambda.event.body)
    const client = new DynamoDBClient({});
    const docClient = DynamoDBDocumentClient.from(client);

    const cr = body.cr
    const campaignId = body.campaignId

    if (!cr) {
        return lambda.badRequestError({ body: {}, message: "Payload body requires cr" })
    } else if (!campaignId) {
        return lambda.badRequestError({ body: {}, message: "Payload body requires campaignId" })
    } else {
        const { rates, ratesToPullFrom, arrayOfRarityRates } = await getRates({ lambda, docClient, cr, campaignId })

        const randomNumberForScroll = randomNumber({ maxNumber: 10000 })
        const randomNumberForRarity = randomNumber({ maxNumber: 10000 })

        const { randomRarityValue, isScroll } = await determineRarity({ 
            lambda, arrayOfRarityRates, 
            ratesToPullFrom, randomNumberForScroll, 
            randomNumberForRarity
        })

        const { items, numberOfItemsInRarity } = await getItems({ lambda, docClient, randomRarityValue })

        let item = null
        let itemsGenerated = []

        if (!body.noCursedItems && !body.excludeSources && !body.adventureSpecificThreshold) {
            item = await getItem({ 
                lambda, docClient, 
                randomRarityValue, 
                randomNumberForItem: randomNumber({ maxNumber: numberOfItemsInRarity }) 
            })
            item = item.item
            itemsGenerated.push(item)
        } else {
            let breakWhileLoop = true

            while (breakWhileLoop) {
                item = await getItem({ 
                    lambda, docClient, 
                    randomRarityValue, 
                    randomNumberForItem: randomNumber({ maxNumber: numberOfItemsInRarity }) 
                })
                item = item.item
                itemsGenerated.push(item)

                if (body.noCursedItems && item.isCursed) {
                    continue
                } else if (body.excludeSources?.length) {
                    if (body.excludeSources.includes(item.source)) {
                        continue
                    } else {
                        breakWhileLoop = false
                    }
                } else if (body.adventureSpecificThreshold && item.isAdventureSpecific >= body.adventureSpecificThreshold) {
                    continue
                } else {
                    breakWhileLoop = false
                }

                if (itemsGenerated.length > 15) {
                    breakWhileLoop = false
                }
            }
        }

        lambda.addToLog({ name: "itemGenerationData", body: { itemsGenerated } })

        return lambda.success({ 
            body: item, 
            message: "Success" 
        })
    }
}

export const lambdaHandler = async (event, context) => {
    const lambdaObject = new Lambda({ event, context, run })

    await lambdaObject.main()

    return lambdaObject.response
};