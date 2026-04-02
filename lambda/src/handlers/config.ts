import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { QueryCommand, PutCommand, DeleteCommand, ScanCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ddb, TABLE_CONFIG, TABLE_APPS } from '../lib/dynamo';
import { getCaller, requireAdmin } from '../lib/auth';
import { ok, created, noContent, badRequest, forbidden, notFound } from '../lib/response';

// Valid categories and which app field they map to for in-use checks
const CATEGORIES: Record<string, string> = {
  serviceHours:  'serviceHours',
  serviceLevel:  'serviceLevel',
  department:    'department',
};

function configPK(category: string): string {
  return `CONFIG#${category}`;
}

function stripPK(item: Record<string, unknown>): Record<string, unknown> {
  const { PK, SK, ...rest } = item;
  return rest;
}

// Check whether a config value ID is referenced by any active app
async function isValueInUse(appField: string, valueId: string): Promise<boolean> {
  const result = await ddb.send(new ScanCommand({
    TableName: TABLE_APPS,
    FilterExpression: '#f = :val AND SK = :meta AND #s <> :del',
    ExpressionAttributeNames: { '#f': appField, '#s': 'status' },
    ExpressionAttributeValues: { ':val': valueId, ':meta': 'META', ':del': 'deleted' },
    Select: 'COUNT',
  }));
  return (result.Count ?? 0) > 0;
}

// GET /config/:category
export async function getConfig(
  _event: APIGatewayProxyEventV2WithJWTAuthorizer,
  category: string,
): Promise<APIGatewayProxyResultV2> {
  if (!CATEGORIES[category]) return notFound(`Unknown config category: ${category}`);

  const result = await ddb.send(new QueryCommand({
    TableName: TABLE_CONFIG,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': configPK(category) },
  }));

  const items = (result.Items ?? [])
    .map(i => stripPK(i as Record<string, unknown>))
    .sort((a, b) => ((a['sortOrder'] as number) ?? 0) - ((b['sortOrder'] as number) ?? 0));

  return ok(items);
}

// POST /config/:category/values
export async function addConfigValue(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  category: string,
): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (!requireAdmin(caller)) return forbidden();
  if (!CATEGORIES[category]) return notFound(`Unknown config category: ${category}`);

  let body: Record<string, unknown>;
  try { body = JSON.parse(event.body ?? '{}'); } catch { return badRequest('Invalid JSON'); }

  if (!body['label'] || typeof body['label'] !== 'string') {
    return badRequest('label is required');
  }
  if (category === 'serviceHours') {
    if (!body['definition'] || typeof body['definition'] !== 'string') return badRequest('definition is required for serviceHours');
    if (typeof body['weeklyHours'] !== 'number' || (body['weeklyHours'] as number) <= 0) return badRequest('weeklyHours must be a positive number');
  }
  if (category === 'serviceLevel') {
    if (typeof body['percentage'] !== 'number' || (body['percentage'] as number) <= 0 || (body['percentage'] as number) >= 100) {
      return badRequest('percentage must be a number between 0 and 100 (exclusive)');
    }
  }

  // Determine sortOrder: max existing + 1
  const existing = await ddb.send(new QueryCommand({
    TableName: TABLE_CONFIG,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': configPK(category) },
    Select: 'ALL_ATTRIBUTES',
  }));
  const maxOrder = (existing.Items ?? []).reduce((max, i) => Math.max(max, (i['sortOrder'] as number) ?? 0), 0);

  const id = randomUUID();
  const item: Record<string, unknown> = {
    PK: configPK(category),
    SK: `VALUE#${id}`,
    id,
    label: body['label'],
    sortOrder: maxOrder + 1,
    ...(category === 'serviceHours' ? { definition: body['definition'], weeklyHours: body['weeklyHours'] } : {}),
    ...(category === 'serviceLevel' ? { percentage: body['percentage'] } : {}),
  };

  await ddb.send(new PutCommand({ TableName: TABLE_CONFIG, Item: item }));
  return created(stripPK(item));
}

// PUT /config/:category/values/:id
export async function updateConfigValue(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  category: string,
  id: string,
): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (!requireAdmin(caller)) return forbidden();
  if (!CATEGORIES[category]) return notFound(`Unknown config category: ${category}`);

  let body: Record<string, unknown>;
  try { body = JSON.parse(event.body ?? '{}'); } catch { return badRequest('Invalid JSON'); }

  const result = await ddb.send(new QueryCommand({
    TableName: TABLE_CONFIG,
    KeyConditionExpression: 'PK = :pk AND SK = :sk',
    ExpressionAttributeValues: { ':pk': configPK(category), ':sk': `VALUE#${id}` },
  }));

  if (!result.Items || result.Items.length === 0) return notFound();

  const existing = result.Items[0] as Record<string, unknown>;
  const updated: Record<string, unknown> = { ...existing };

  if (body['label'] !== undefined) updated['label'] = body['label'];
  if (category === 'serviceHours') {
    if (body['definition'] !== undefined) updated['definition'] = body['definition'];
    if (body['weeklyHours'] !== undefined) {
      if (typeof body['weeklyHours'] !== 'number' || (body['weeklyHours'] as number) <= 0) return badRequest('weeklyHours must be a positive number');
      updated['weeklyHours'] = body['weeklyHours'];
    }
  }
  if (category === 'serviceLevel' && body['percentage'] !== undefined) {
    if (typeof body['percentage'] !== 'number' || (body['percentage'] as number) <= 0 || (body['percentage'] as number) >= 100) {
      return badRequest('percentage must be between 0 and 100 (exclusive)');
    }
    updated['percentage'] = body['percentage'];
  }
  if (body['sortOrder'] !== undefined) updated['sortOrder'] = body['sortOrder'];

  await ddb.send(new PutCommand({ TableName: TABLE_CONFIG, Item: updated }));
  return ok(stripPK(updated));
}

// DELETE /config/:category/values/:id
export async function deleteConfigValue(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  category: string,
  id: string,
): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (!requireAdmin(caller)) return forbidden();
  if (!CATEGORIES[category]) return notFound(`Unknown config category: ${category}`);

  // Verify item exists
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE_CONFIG,
    KeyConditionExpression: 'PK = :pk AND SK = :sk',
    ExpressionAttributeValues: { ':pk': configPK(category), ':sk': `VALUE#${id}` },
  }));
  if (!result.Items || result.Items.length === 0) return notFound();

  // Block delete if any app references this value
  const inUse = await isValueInUse(CATEGORIES[category], id);
  if (inUse) {
    return { statusCode: 409, headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ message: 'This value is in use by one or more applications and cannot be deleted.' }) };
  }

  await ddb.send(new DeleteCommand({
    TableName: TABLE_CONFIG,
    Key: { PK: configPK(category), SK: `VALUE#${id}` },
  }));
  return noContent();
}

// POST /config/seed — check-before-write, admin only
const SEED_DATA: Record<string, Array<Record<string, unknown>>> = {
  serviceHours: [
    { label: 'Business Hours',  definition: 'Mon-Fri 7a-7p',     weeklyHours: 60  },
    { label: 'Extended Hours',  definition: 'Sun-Sat 5a-midnight', weeklyHours: 133 },
    { label: '24x7',            definition: '24 hours, 7 days',   weeklyHours: 168 },
  ],
  serviceLevel: [
    { label: '99.0%',  percentage: 99.0  },
    { label: '99.9%',  percentage: 99.9  },
    { label: '99.99%', percentage: 99.99 },
  ],
  department: [
    { label: 'IS' },
    { label: 'HR' },
    { label: 'Investments' },
    { label: 'Accounting' },
    { label: 'Legal' },
  ],
};

export async function seedConfig(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (!requireAdmin(caller)) return forbidden();

  const seeded: string[] = [];
  const skipped: string[] = [];

  for (const [category, values] of Object.entries(SEED_DATA)) {
    // Check if category already has values
    const existing = await ddb.send(new QueryCommand({
      TableName: TABLE_CONFIG,
      KeyConditionExpression: 'PK = :pk',
      ExpressionAttributeValues: { ':pk': configPK(category) },
      Select: 'COUNT',
    }));

    if ((existing.Count ?? 0) > 0) {
      skipped.push(category);
      continue;
    }

    for (let i = 0; i < values.length; i++) {
      const id = randomUUID();
      const item: Record<string, unknown> = {
        PK: configPK(category),
        SK: `VALUE#${id}`,
        id,
        sortOrder: i + 1,
        ...values[i],
      };
      await ddb.send(new PutCommand({ TableName: TABLE_CONFIG, Item: item }));
    }
    seeded.push(category);
  }

  return ok({ seeded, skipped });
}
