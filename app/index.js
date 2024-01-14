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

        const { items } = await getItems({ lambda, docClient })

        let itemsReturned = []
        let arrayOfItemsGenerated = []
        let numberOfItemsToGenerate = body.numberOfItemsToGenerate ? body.numberOfItemsToGenerate : 1

        for (let i = 0; i < numberOfItemsToGenerate; i++) {
            const randomNumberForScroll = randomNumber({ maxNumber: 10000 })
            const randomNumberForRarity = randomNumber({ maxNumber: 10000 })

            const { randomRarityValue, isScroll } = await determineRarity({ 
                lambda, arrayOfRarityRates, 
                ratesToPullFrom, randomNumberForScroll, 
                randomNumberForRarity
            })

            let numberOfItemsInRarity = items.numberOf[randomRarityValue]

            if (isScroll) {
                numberOfItemsInRarity = items.numberOfScrolls[randomRarityValue]
            }

            let item = null
            let itemsGenerated = []

            if (isScroll) {
                item = await getItem({ 
                    lambda, docClient, 
                    randomRarityValue: `spell#${randomRarityValue}`, 
                    randomNumberForItem: randomNumber({ maxNumber: numberOfItemsInRarity }) 
                })
                item = item.item
                itemsGenerated.push(item)
            } else if (!body.noCursedItems && !body.excludeSources && !body.adventureSpecificThreshold) {
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

            itemsReturned.push(item)
            arrayOfItemsGenerated.push(itemsGenerated)
        }

        lambda.addToLog({ name: "itemGenerationData", body: { itemsReturned, arrayOfItemsGenerated } })

        return lambda.success({ 
            body: { items: itemsReturned }, 
            message: "Success" 
        })
    }
}

export const lambdaHandler = async (event, context) => {
    const lambdaObject = new Lambda({ event, context, run })

    await lambdaObject.main()

    return lambdaObject.response
};