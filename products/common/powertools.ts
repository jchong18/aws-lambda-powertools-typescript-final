import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';

const awsLambdaPowertoolsVersion = '1.11.1';
const serviceName = 'productsService';

const defaultValues = {
    awsAccountId: process.env.AWS_ACCOUNT_ID || 'N/A',
    environment: process.env.ENVIRONMENT || 'N/A',
};

const logger = new Logger({
    serviceName,
    persistentLogAttributes: {
        ...defaultValues,
        logger: {
            name: '@aws-lambda-powertools/logger',
            version: awsLambdaPowertoolsVersion,
        },
    },
});

const metrics = new Metrics({
    serviceName,
    defaultDimensions: {
        ...defaultValues,
        commitHash: 'abcdefg12', // This can be a dynamic value that represents the current commit hash of your app
        appName: 'products-app',
        awsRegion: process.env.AWS_REGION || 'N/A',
        appVersion: 'v0.0.1', // This can be a dynamic value that represents the semantic version of your app
        runtime: process.env.AWS_EXECUTION_ENV || 'N/A',
    },
});

const tracer = new Tracer({
    serviceName,
});

export { logger, metrics, tracer };
