import { APIGatewayProxyEvent, APIGatewayProxyResult } from 'aws-lambda';
import { Product } from './types';
import { DynamoDB } from 'aws-sdk';
import { v4 as uuidv4 } from 'uuid';
import { DeleteItemInput, GetItemInput, PutItemInput, ScanInput } from 'aws-sdk/clients/dynamodb';
import { logger, metrics, tracer } from './common/powertools';
import { injectLambdaContext } from '@aws-lambda-powertools/logger';
import { logMetrics, MetricUnits } from '@aws-lambda-powertools/metrics';
import { captureLambdaHandler } from '@aws-lambda-powertools/tracer';
import middy from '@middy/core';

const dbClient = tracer.captureAWSClient(new DynamoDB.DocumentClient());
const dynamoDBTableName = process.env.PRODUCT_TABLE_NAME || '';

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export const handler = middy<APIGatewayProxyEvent, APIGatewayProxyResult>(
    async (event: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
        // Log the incoming event
        logger.info('Starting to invoke Lambda handler');
        if (event.httpMethod === 'PUT') {
            return addResponseHeaders(await processPutEvent(event));
        }
        if (event.httpMethod === 'POST') {
            return addResponseHeaders(await processPostEvent(event));
        }
        if (event.httpMethod === 'GET') {
            if (!event.pathParameters) {
                return addResponseHeaders(await processGetAllEvent());
            } else {
                return addResponseHeaders(await processGetByIdEvent(event));
            }
        }
        if (event.httpMethod === 'DELETE') {
            return addResponseHeaders(await processDeleteEvent(event));
        }

        const response = {
            statusCode: 500,
            body: JSON.stringify({
                message: 'some error happened',
            }),
        };
        logger.error('Error happened while processing the request');
        return addResponseHeaders(response);
    },
)
    .use(injectLambdaContext(logger, { logEvent: true }))
    .use(logMetrics(metrics, { captureColdStartMetric: true }))
    .use(captureLambdaHandler(tracer));

const processPutEvent = async (input: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    logger.info('Processing Put Event');
    try {
        const id = input.pathParameters?.id;
        const product: Product = JSON.parse(input.body || '') || {};

        if (product.id !== id) {
            return {
                statusCode: 400,
                body: JSON.stringify({
                    error: 'Product ID in the body does not match path parameter',
                }),
            };
        }

        const params: PutItemInput = {
            TableName: dynamoDBTableName,
            Item: {
                PK: product.id,
                name: product.name,
                price: product.price,
            },
        };

        await dbClient.put(params).promise();
        const successMessage = `Product with id = ${id} edited(created)`;
        logger.info(successMessage);
        return {
            statusCode: 201,
            body: JSON.stringify({
                message: successMessage,
            }),
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        const errorMessage = `Internal Server Error for Put :: ${err.message}`;
        logger.error(errorMessage);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: errorMessage,
            }),
        };
    }
};

const processPostEvent = async (input: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    logger.info('Processing Post Event');
    try {
        const product: Product = JSON.parse(input.body || '') || {};
        const productId = uuidv4();
        const params: PutItemInput = {
            TableName: dynamoDBTableName,
            Item: {
                PK: productId,
                name: product.name,
                price: product.price,
            },
        };

        await dbClient.put(params).promise();

        const successMessage = `Product with id = ${productId} created`;
        logger.info(successMessage);
        return {
            statusCode: 201,
            body: JSON.stringify({
                message: successMessage,
            }),
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        const errorMessage = `Internal Server Error for Post :: ${err.message}`;
        logger.error(errorMessage);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: errorMessage,
            }),
        };
    }
};

const processGetAllEvent = async (): Promise<APIGatewayProxyResult> => {
    logger.info('Processing Get All Event');
    try {
        const params: ScanInput = {
            TableName: dynamoDBTableName,
            Limit: 20,
        };
        const products = await dbClient.scan(params).promise();

        const successMessage = `Successfully retrieved all products: ${products.Items}`;
        metrics.addMetric('getAllCount', MetricUnits.Count, products.Items?.length || 0);
        logger.info(successMessage);
        return {
            statusCode: 200,
            body: JSON.stringify(products.Items),
        };
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        const errorMessage = `Internal Server Error for GetAll :: ${err.message}`;
        logger.error(errorMessage);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: errorMessage,
            }),
        };
    }
};

const processGetByIdEvent = async (input: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    logger.info('Processing Get By Id Event');
    try {
        const id = input.pathParameters?.id;

        if (id === 'ForceError') {
            throw Error('BOOM');
        }

        const params: GetItemInput = {
            TableName: dynamoDBTableName,
            Key: {
                PK: id,
            },
        };
        const product = await dbClient.get(params).promise();

        if (product?.Item) {
            const successMessage = `Product with id = ${id} found`;
            logger.info(successMessage);
            return {
                statusCode: 200,
                body: JSON.stringify(product.Item),
            };
        } else {
            const notFoundMessage = `Product with id = ${id} NOT found`;
            logger.info(notFoundMessage);
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: notFoundMessage,
                }),
            };
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        const errorMessage = `Internal Server Error for GetById :: ${err.message}`;
        logger.error(errorMessage);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: errorMessage,
            }),
        };
    }
};

const processDeleteEvent = async (input: APIGatewayProxyEvent): Promise<APIGatewayProxyResult> => {
    logger.info('Processing Delete Event');
    try {
        const id = input.pathParameters?.id;
        const getParams: GetItemInput = {
            TableName: dynamoDBTableName,
            Key: {
                PK: id,
            },
        };
        const product = await dbClient.get(getParams).promise();

        if (product?.Item) {
            const deleteParams: DeleteItemInput = {
                TableName: dynamoDBTableName,
                Key: {
                    PK: id,
                },
            };
            await dbClient.delete(deleteParams).promise();
            const successMessage = `Product with id = ${id} was deleted`;
            logger.info(successMessage);
            return {
                statusCode: 200,
                body: JSON.stringify({
                    message: successMessage,
                }),
            };
        } else {
            const notFoundMessage = `Product with id = ${id} was deleted`;
            logger.info(notFoundMessage);
            return {
                statusCode: 404,
                body: JSON.stringify({
                    error: notFoundMessage,
                }),
            };
        }
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
    } catch (err: any) {
        const errorMessage = `Internal Server Error for Delete :: ${err.message}`;
        logger.error(errorMessage);
        return {
            statusCode: 500,
            body: JSON.stringify({
                error: errorMessage,
            }),
        };
    }
};

const addResponseHeaders = (response: APIGatewayProxyResult): APIGatewayProxyResult => {
    logger.info('Adding Response Headers');
    response.headers = {
        'Content-Type': 'application/json',
        'X-Custom-Header': 'application/json',
    };
    return response;
};
