import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_APPS } from '../lib/dynamo';
import { getCaller, requireAdmin } from '../lib/auth';
import { ok, badRequest, forbidden } from '../lib/response';

const SETTING_KEYS = ['allowed_domains'] as const;

export async function getSettings(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (!requireAdmin(caller)) return forbidden();

  const settings: Record<string, string> = {};
  for (const key of SETTING_KEYS) {
    const result = await ddb.send(new GetCommand({
      TableName: TABLE_APPS,
      Key: { PK: `SETTING#${key}`, SK: 'CONFIG' },
    }));
    if (result.Item) settings[key] = result.Item['value'] as string;
  }
  return ok(settings);
}

export async function putSettings(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (!requireAdmin(caller)) return forbidden();

  let body: Record<string, unknown>;
  try { body = JSON.parse(event.body ?? '{}'); } catch { return badRequest('Invalid JSON'); }

  for (const key of SETTING_KEYS) {
    if (key in body) {
      await ddb.send(new PutCommand({
        TableName: TABLE_APPS,
        Item: {
          PK:        `SETTING#${key}`,
          SK:        'CONFIG',
          value:     String(body[key]),
          updatedAt: new Date().toISOString(),
        },
      }));
    }
  }
  return ok({ saved: true });
}
