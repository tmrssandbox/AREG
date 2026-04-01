import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_APPS } from '../lib/dynamo';
import { writeAudit, Diff } from '../lib/auditLog';
import { getCaller } from '../lib/auth';
import { ok, badRequest, forbidden, notFound } from '../lib/response';

const UPDATABLE = ['name', 'description', 'vendor', 'itContact', 'businessOwner',
                   'hoursOfOperation', 'department', 'renewalDate', 'notes'] as const;

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

  // Viewers cannot write; editors may only update records they own
  if (caller.role === 'viewer') return forbidden('Viewers cannot update records');
  if (caller.role === 'editor') {
    const isOwner = existing['itContact'] === caller.email ||
                    existing['businessOwner'] === caller.email;
    if (!isOwner) return forbidden('Editors may only update their own records');
  }

  // Build diff and updated item
  const diff: Diff = {};
  const updated: Record<string, unknown> = { ...existing };

  for (const field of UPDATABLE) {
    if (field in body && body[field] !== existing[field]) {
      diff[field] = { old: existing[field], new: body[field] };
      updated[field] = body[field];
    }
  }

  const now = new Date().toISOString();
  updated['modifiedBy'] = caller.email;
  updated['modifiedAt'] = now;

  // Strip undefined values before writing (DynamoDB lib rejects them)
  const clean = Object.fromEntries(Object.entries(updated).filter(([, v]) => v !== undefined));
  await ddb.send(new PutCommand({ TableName: TABLE_APPS, Item: clean }));
  if (Object.keys(diff).length > 0) {
    await writeAudit(appId, 'UPDATE', caller.email, diff);
  }

  const { PK, SK, GSI1PK, GSI1SK, ...out } = updated;
  return ok(out);
}
