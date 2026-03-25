import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_APPS } from '../lib/dynamo';
import { ok } from '../lib/response';

const FILTERABLE = ['vendor', 'itContact', 'businessOwner', 'department', 'hoursOfOperation'] as const;

function stripKeys(item: Record<string, unknown>): Record<string, unknown> {
  const { PK, SK, GSI1PK, GSI1SK, ...rest } = item;
  return rest;
}

export async function listApps(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const qs = event.queryStringParameters ?? {};
  const statusFilter = qs['status'] ?? 'active';
  const limit = qs['limit'] ? parseInt(qs['limit'], 10) : 100;
  const nextToken = qs['nextToken'];

  // Build filter expressions for optional field filters
  const filterParts: string[] = [];
  const exprNames: Record<string, string> = {};
  const exprValues: Record<string, unknown> = {};

  for (const field of FILTERABLE) {
    if (qs[field]) {
      const nameKey = `#f_${field}`;
      const valKey  = `:v_${field}`;
      exprNames[nameKey] = field;
      exprValues[valKey] = qs[field];
      filterParts.push(`${nameKey} = ${valKey}`);
    }
  }

  const filterExpr = filterParts.length > 0 ? filterParts.join(' AND ') : undefined;

  // Query GSI1 by status
  const exclusiveStartKey = nextToken
    ? JSON.parse(Buffer.from(nextToken, 'base64').toString('utf8'))
    : undefined;

  const result = await ddb.send(new QueryCommand({
    TableName:                TABLE_APPS,
    IndexName:                'GSI1',
    KeyConditionExpression:   'GSI1PK = :pk',
    ExpressionAttributeValues: {
      ':pk': `STATUS#${statusFilter}`,
      ...exprValues,
    },
    ...(Object.keys(exprNames).length > 0 ? { ExpressionAttributeNames: exprNames } : {}),
    ...(filterExpr ? { FilterExpression: filterExpr } : {}),
    Limit:                    limit,
    ExclusiveStartKey:        exclusiveStartKey,
  }));

  const items = (result.Items ?? []).map(item => stripKeys(item as Record<string, unknown>));
  const newNextToken = result.LastEvaluatedKey
    ? Buffer.from(JSON.stringify(result.LastEvaluatedKey)).toString('base64')
    : undefined;

  return ok({ items, ...(newNextToken ? { nextToken: newNextToken } : {}) });
}
