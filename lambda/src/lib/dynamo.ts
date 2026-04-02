import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient } from '@aws-sdk/lib-dynamodb';

const client = new DynamoDBClient({ region: process.env.REGION ?? 'us-east-2' });
export const ddb = DynamoDBDocumentClient.from(client);

export const TABLE_APPS   = process.env.TABLE_APPS   ?? 'areg-ddb-apps';
export const TABLE_AUDIT  = process.env.TABLE_AUDIT  ?? 'areg-ddb-audit';
export const TABLE_CONFIG = process.env.TABLE_CONFIG ?? 'areg-ddb-config';
