import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_APPS } from '../lib/dynamo';
import { writeAudit } from '../lib/auditLog';
import { getCaller, requireAdmin } from '../lib/auth';
import { noContent, forbidden, notFound } from '../lib/response';

export async function deleteApp(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  appId: string,
): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (!requireAdmin(caller)) return forbidden();

  const result = await ddb.send(new GetCommand({
    TableName: TABLE_APPS,
    Key: { PK: `APP#${appId}`, SK: 'META' },
  }));

  if (!result.Item || result.Item['status'] === 'deleted') {
    return notFound();
  }

  const updated = {
    ...result.Item,
    status:     'deleted',
    GSI1PK:     'STATUS#deleted',
    modifiedBy: caller.email,
    modifiedAt: new Date().toISOString(),
  };

  await ddb.send(new PutCommand({ TableName: TABLE_APPS, Item: updated }));
  await writeAudit(appId, 'DELETE', caller.email);

  return noContent();
}

export async function restoreApp(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  appId: string,
): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (!requireAdmin(caller)) return forbidden();

  const result = await ddb.send(new GetCommand({
    TableName: TABLE_APPS,
    Key: { PK: `APP#${appId}`, SK: 'META' },
  }));

  if (!result.Item) return notFound();
  if (result.Item['status'] !== 'deleted') return notFound('Record is not archived');

  const updated = {
    ...result.Item,
    status:     'active',
    GSI1PK:     'STATUS#active',
    modifiedBy: caller.email,
    modifiedAt: new Date().toISOString(),
  };

  await ddb.send(new PutCommand({ TableName: TABLE_APPS, Item: updated }));
  await writeAudit(appId, 'RESTORE', caller.email);

  return noContent();
}
