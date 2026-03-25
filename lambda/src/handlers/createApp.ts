import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ddb, TABLE_APPS } from '../lib/dynamo';
import { writeAudit } from '../lib/auditLog';
import { getCaller } from '../lib/auth';
import { created, badRequest } from '../lib/response';

const REQUIRED = ['name', 'description', 'vendor', 'itContact', 'businessOwner', 'hoursOfOperation'] as const;

export async function createApp(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return badRequest('Invalid JSON body');
  }

  const missing = REQUIRED.filter(f => !body[f]);
  if (missing.length > 0) {
    return badRequest('Missing required fields', missing);
  }

  const caller  = getCaller(event);
  const appId   = randomUUID();
  const now     = new Date().toISOString();

  const item = {
    PK:               `APP#${appId}`,
    SK:               'META',
    GSI1PK:           'STATUS#active',
    GSI1SK:           `APP#${appId}`,
    appId,
    status:           'active',
    createdBy:        caller.email,
    createdAt:        now,
    name:             body['name'],
    description:      body['description'],
    vendor:           body['vendor'],
    itContact:        body['itContact'],
    businessOwner:    body['businessOwner'],
    hoursOfOperation: body['hoursOfOperation'],
    ...(body['department']   ? { department:   body['department'] }   : {}),
    ...(body['renewalDate']  ? { renewalDate:  body['renewalDate'] }  : {}),
    ...(body['notes']        ? { notes:        body['notes'] }        : {}),
  };

  await ddb.send(new PutCommand({ TableName: TABLE_APPS, Item: item }));
  await writeAudit(appId, 'CREATE', caller.email);

  const { PK, SK, GSI1PK, GSI1SK, ...out } = item;
  return created(out);
}
