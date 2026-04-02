import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_APPS } from '../lib/dynamo';
import { writeAudit, Diff } from '../lib/auditLog';
import { getCaller } from '../lib/auth';
import { ok, badRequest, forbidden, notFound } from '../lib/response';

const UPDATABLE = [
  'name', 'description', 'vendorName', 'tmrsBusinessOwner', 'tmrsTechnicalContact',
  'tmrsBusinessContact', 'vendorBusinessContact', 'vendorTechnicalContact',
  'serviceHours', 'serviceLevel', 'department', 'businessCriticality',
  'targetFeatureUtilization', 'featureUtilizationStatus',
  'renewalDate', 'notes',
] as const;

export async function updateApp(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  appId: string,
): Promise<APIGatewayProxyResultV2> {
  let body: Record<string, unknown>;
  try {
    body = JSON.parse(event.body ?? '{}');
  } catch {
    return badRequest('Invalid JSON body');
  }

  const result = await ddb.send(new GetCommand({
    TableName: TABLE_APPS,
    Key: { PK: `APP#${appId}`, SK: 'META' },
  }));

  if (!result.Item || result.Item['status'] === 'deleted') {
    return notFound();
  }

  const existing = result.Item as Record<string, unknown>;
  const caller   = getCaller(event);

  if (caller.role === 'viewer') return forbidden('Viewers cannot update records');
  if (caller.role === 'editor') {
    const isOwner = existing['tmrsTechnicalContact'] === caller.email ||
                    existing['tmrsBusinessOwner'] === caller.email;
    if (!isOwner) return forbidden('Editors may only update their own records');
  }

  // Validate optional percentage fields
  for (const pctField of ['targetFeatureUtilization', 'featureUtilizationStatus']) {
    const val = body[pctField];
    if (val !== undefined && val !== null && val !== '') {
      const n = Number(val);
      if (isNaN(n) || n < 0 || n > 100) return badRequest(`${pctField} must be a number between 0 and 100`);
    }
  }

  const diff: Diff = {};
  const updated: Record<string, unknown> = { ...existing };

  for (const field of UPDATABLE) {
    if (!(field in body)) continue;

    // Normalize percentage fields to number or undefined
    let newVal: unknown = body[field];
    if (field === 'targetFeatureUtilization' || field === 'featureUtilizationStatus') {
      newVal = (newVal !== undefined && newVal !== null && newVal !== '') ? Number(newVal) : undefined;
    }

    if (newVal !== existing[field]) {
      diff[field] = { old: existing[field], new: newVal };
      if (newVal !== undefined) {
        updated[field] = newVal;
      } else {
        delete updated[field];
      }
    }
  }

  const now = new Date().toISOString();
  updated['modifiedBy'] = caller.email;
  updated['modifiedAt'] = now;

  const clean = Object.fromEntries(Object.entries(updated).filter(([, v]) => v !== undefined));
  await ddb.send(new PutCommand({ TableName: TABLE_APPS, Item: clean }));
  if (Object.keys(diff).length > 0) {
    await writeAudit(appId, 'UPDATE', caller.email, diff);
  }

  const { PK, SK, GSI1PK, GSI1SK, ...out } = updated;
  return ok(out);
}
