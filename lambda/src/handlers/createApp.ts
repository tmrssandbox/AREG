import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ddb, TABLE_APPS } from '../lib/dynamo';
import { writeAudit } from '../lib/auditLog';
import { getCaller } from '../lib/auth';
import { created, badRequest, forbidden } from '../lib/response';

const REQUIRED = ['name', 'description', 'vendorName', 'tmrsBusinessOwner', 'tmrsTechnicalContact', 'serviceHours', 'serviceLevel'] as const;

export async function createApp(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return badRequest('Invalid JSON body');
  }

  const caller = getCaller(event);
  if (caller.role === 'viewer') return forbidden('Viewers cannot create records');

  const missing = REQUIRED.filter(f => !body[f]);
  if (missing.length > 0) {
    return badRequest('Missing required fields', missing);
  }

  // Validate optional percentage fields
  for (const pctField of ['targetFeatureUtilization', 'featureUtilizationStatus']) {
    const val = body[pctField];
    if (val !== undefined && val !== null && val !== '') {
      const n = Number(val);
      if (isNaN(n) || n < 0 || n > 100) return badRequest(`${pctField} must be a number between 0 and 100`);
    }
  }

  const appId = randomUUID();
  const now   = new Date().toISOString();

  const item: Record<string, unknown> = {
    PK:                  `APP#${appId}`,
    SK:                  'META',
    GSI1PK:              'STATUS#active',
    GSI1SK:              `APP#${appId}`,
    appId,
    status:              'active',
    createdBy:           caller.email,
    createdAt:           now,
    name:                body['name'],
    description:         body['description'],
    vendorName:          body['vendorName'],
    tmrsBusinessOwner:   body['tmrsBusinessOwner'],
    tmrsTechnicalContact: body['tmrsTechnicalContact'],
    serviceHours:        body['serviceHours'],
    serviceLevel:        body['serviceLevel'],
  };

  // Optional fields — only write if non-empty
  const optionals: Array<[string, unknown]> = [
    ['tmrsBusinessContact',      body['tmrsBusinessContact']],
    ['vendorBusinessContact',    body['vendorBusinessContact']],
    ['vendorTechnicalContact',   body['vendorTechnicalContact']],
    ['department',               body['department']],
    ['businessCriticality',      body['businessCriticality']],
    ['renewalDate',              body['renewalDate']],
    ['notes',                    body['notes']],
    ['targetFeatureUtilization', body['targetFeatureUtilization'] !== undefined && body['targetFeatureUtilization'] !== '' ? Number(body['targetFeatureUtilization']) : undefined],
    ['featureUtilizationStatus', body['featureUtilizationStatus'] !== undefined && body['featureUtilizationStatus'] !== '' ? Number(body['featureUtilizationStatus']) : undefined],
  ];
  for (const [key, val] of optionals) {
    if (val !== undefined && val !== null && val !== '') item[key] = val;
  }

  await ddb.send(new PutCommand({ TableName: TABLE_APPS, Item: item }));
  await writeAudit(appId, 'CREATE', caller.email);

  const { PK, SK, GSI1PK, GSI1SK, ...out } = item;
  return created(out);
}
