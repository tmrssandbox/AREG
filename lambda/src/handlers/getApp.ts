import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_APPS } from '../lib/dynamo';
import { ok, notFound } from '../lib/response';

export async function getApp(
  _event: APIGatewayProxyEventV2WithJWTAuthorizer,
  appId: string,
): Promise<APIGatewayProxyResultV2> {
  const result = await ddb.send(new GetCommand({
    TableName: TABLE_APPS,
    Key: { PK: `APP#${appId}`, SK: 'META' },
  }));

  if (!result.Item || result.Item['status'] === 'deleted') {
    return notFound();
  }

  const { PK, SK, GSI1PK, GSI1SK, ...item } = result.Item as Record<string, unknown>;
  return ok(item);
}
