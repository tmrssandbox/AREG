import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_AUDIT } from '../lib/dynamo';
import { getCaller, requireAdmin } from '../lib/auth';
import { ok, forbidden } from '../lib/response';

export async function getAudit(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  appId: string,
): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (!requireAdmin(caller)) return forbidden();

  const result = await ddb.send(new QueryCommand({
    TableName:              TABLE_AUDIT,
    KeyConditionExpression: 'PK = :pk AND begins_with(SK, :prefix)',
    ExpressionAttributeValues: {
      ':pk':     `APP#${appId}`,
      ':prefix': 'AUDIT#',
    },
    ScanIndexForward: true,  // chronological (ascending SK)
  }));

  const entries = (result.Items ?? []).map(({ PK, SK, ...rest }) => rest);
  return ok({ entries });
}
