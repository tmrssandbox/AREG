import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ddb, TABLE_APPS, TABLE_CONFIG } from '../lib/dynamo';
import { writeAudit } from '../lib/auditLog';
import { getCaller, requireAdmin } from '../lib/auth';
import { ok, badRequest, forbidden } from '../lib/response';

const REQUIRED_COLS = ['name', 'description', 'Vendor Name', 'TMRS Business Owner', 'TMRS Technical Contact', 'Service Hours', 'Service Level'] as const;
const OPTIONAL_COLS = ['TMRS Business Contact', 'Vendor Business Contact', 'Vendor Technical Contact', 'Department', 'Business Criticality', 'Renewal Date', 'Notes', 'Target Feature Utilization', 'Feature Utilization Status'] as const;
const ALL_COLS = [...REQUIRED_COLS, ...OPTIONAL_COLS];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

// Maps CSV column header to DynamoDB field name
const COL_TO_FIELD: Record<string, string> = {
  'name':                       'name',
  'description':                'description',
  'Vendor Name':                'vendorName',
  'TMRS Business Owner':        'tmrsBusinessOwner',
  'TMRS Technical Contact':     'tmrsTechnicalContact',
  'TMRS Business Contact':      'tmrsBusinessContact',
  'Vendor Business Contact':    'vendorBusinessContact',
  'Vendor Technical Contact':   'vendorTechnicalContact',
  'Service Hours':              'serviceHours',
  'Service Level':              'serviceLevel',
  'Department':                 'department',
  'Business Criticality':       'businessCriticality',
  'Renewal Date':               'renewalDate',
  'Notes':                      'notes',
  'Target Feature Utilization': 'targetFeatureUtilization',
  'Feature Utilization Status': 'featureUtilizationStatus',
};

interface ParsedRow {
  row: number;
  data: Record<string, string>;
  errors: string[];
}

function parseCSV(text: string): { headers: string[]; rows: string[][] } {
  const lines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n').filter(l => l.trim());
  if (lines.length === 0) return { headers: [], rows: [] };
  const parse = (line: string): string[] => {
    const result: string[] = [];
    let cur = '';
    let inQuote = false;
    for (let i = 0; i < line.length; i++) {
      if (line[i] === '"') {
        if (inQuote && line[i + 1] === '"') { cur += '"'; i++; }
        else inQuote = !inQuote;
      } else if (line[i] === ',' && !inQuote) {
        result.push(cur.trim()); cur = '';
      } else {
        cur += line[i];
      }
    }
    result.push(cur.trim());
    return result;
  };
  return { headers: parse(lines[0]), rows: lines.slice(1).map(parse) };
}

// Load config values for a category, returning label→id map
async function loadConfigLabelMap(category: string): Promise<Map<string, string>> {
  const result = await ddb.send(new QueryCommand({
    TableName: TABLE_CONFIG,
    KeyConditionExpression: 'PK = :pk',
    ExpressionAttributeValues: { ':pk': `CONFIG#${category}` },
  }));
  const map = new Map<string, string>();
  for (const item of result.Items ?? []) {
    map.set((item['label'] as string).toLowerCase(), item['id'] as string);
  }
  return map;
}

async function validateAndParse(
  headers: string[],
  rows: string[][],
  serviceHoursMap: Map<string, string>,
  serviceLevelMap: Map<string, string>,
  departmentMap: Map<string, string>,
): Promise<ParsedRow[]> {
  return rows.map((cols, idx) => {
    const row = idx + 2;
    const data: Record<string, string> = {};
    const errors: string[] = [];

    for (let i = 0; i < headers.length; i++) {
      const col = headers[i].trim();
      if (ALL_COLS.includes(col as typeof ALL_COLS[number])) {
        data[col] = (cols[i] ?? '').trim();
      }
    }

    for (const req of REQUIRED_COLS) {
      if (!data[req]) errors.push(`${req} is required`);
    }
    if (data['Renewal Date'] && !DATE_RE.test(data['Renewal Date'])) {
      errors.push('Renewal Date must be YYYY-MM-DD');
    }

    // Resolve Service Hours label to ID
    if (data['Service Hours']) {
      const id = serviceHoursMap.get(data['Service Hours'].toLowerCase());
      if (!id) errors.push(`Unrecognized Service Hours value: "${data['Service Hours']}"`);
      else data['Service Hours'] = id; // replace label with ID
    }

    // Resolve Service Level label to ID
    if (data['Service Level']) {
      const id = serviceLevelMap.get(data['Service Level'].toLowerCase());
      if (!id) errors.push(`Unrecognized Service Level value: "${data['Service Level']}"`);
      else data['Service Level'] = id;
    }

    // Resolve Department label to ID (optional)
    if (data['Department']) {
      const id = departmentMap.get(data['Department'].toLowerCase());
      if (!id) errors.push(`Unrecognized Department value: "${data['Department']}"`);
      else data['Department'] = id;
    }

    // Validate percentage fields
    for (const pctCol of ['Target Feature Utilization', 'Feature Utilization Status']) {
      if (data[pctCol]) {
        const n = Number(data[pctCol]);
        if (isNaN(n) || n < 0 || n > 100) errors.push(`${pctCol} must be a number between 0 and 100`);
      }
    }

    return { row, data, errors };
  });
}

export async function importApps(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (!requireAdmin(caller)) return forbidden();

  const qs         = event.queryStringParameters ?? {};
  const commit     = qs['commit'] === 'true';
  const duplicates = (qs['duplicates'] ?? 'skip') as 'skip' | 'overwrite';

  let csvText = event.body ?? '';
  if (event.isBase64Encoded) csvText = Buffer.from(csvText, 'base64').toString('utf-8');
  if (!csvText.trim()) return badRequest('Empty body');

  const { headers, rows } = parseCSV(csvText);
  if (headers.length === 0) return badRequest('Could not parse CSV headers');

  const missingHeaders = REQUIRED_COLS.filter(c => !headers.includes(c));
  if (missingHeaders.length > 0) return badRequest(`Missing required columns: ${missingHeaders.join(', ')}`);

  // Load config label maps for resolution
  const [serviceHoursMap, serviceLevelMap, departmentMap] = await Promise.all([
    loadConfigLabelMap('serviceHours'),
    loadConfigLabelMap('serviceLevel'),
    loadConfigLabelMap('department'),
  ]);

  const parsed = await validateAndParse(headers, rows, serviceHoursMap, serviceLevelMap, departmentMap);
  const validRows   = parsed.filter(r => r.errors.length === 0);
  const invalidRows = parsed.filter(r => r.errors.length > 0);

  if (!commit) {
    return ok({
      preview: true,
      total:   parsed.length,
      valid:   validRows.length,
      invalid: invalidRows.length,
      rows:    parsed.map(r => ({ row: r.row, data: r.data, errors: r.errors })),
    });
  }

  let created = 0, updated = 0, skipped = 0, errors = 0;

  for (const { data, errors: rowErrors } of parsed) {
    if (rowErrors.length > 0) { errors++; continue; }

    const existing = await findByName(data['name']);
    if (existing) {
      if (duplicates === 'skip') { skipped++; continue; }
      const diff: Record<string, { old: unknown; new: unknown }> = {};
      const updated_item = { ...existing };
      for (const col of ALL_COLS) {
        const field = COL_TO_FIELD[col];
        if (!field || !data[col]) continue;
        const newVal = (col === 'Target Feature Utilization' || col === 'Feature Utilization Status')
          ? Number(data[col])
          : data[col];
        if (newVal !== existing[field]) {
          diff[field] = { old: existing[field], new: newVal };
          updated_item[field] = newVal;
        }
      }
      updated_item['modifiedBy'] = caller.email;
      updated_item['modifiedAt'] = new Date().toISOString();
      await ddb.send(new PutCommand({ TableName: TABLE_APPS, Item: updated_item }));
      if (Object.keys(diff).length > 0) await writeAudit(existing['appId'] as string, 'UPDATE', caller.email, diff);
      updated++;
    } else {
      const appId = randomUUID();
      const now   = new Date().toISOString();
      const item: Record<string, unknown> = {
        PK: `APP#${appId}`, SK: 'META',
        GSI1PK: 'STATUS#active', GSI1SK: `APP#${appId}`,
        appId, status: 'active',
        createdBy: caller.email, createdAt: now,
      };
      for (const col of ALL_COLS) {
        const field = COL_TO_FIELD[col];
        if (!field || !data[col]) continue;
        item[field] = (col === 'Target Feature Utilization' || col === 'Feature Utilization Status')
          ? Number(data[col])
          : data[col];
      }
      await ddb.send(new PutCommand({ TableName: TABLE_APPS, Item: item }));
      await writeAudit(appId, 'CREATE', caller.email);
      created++;
    }
  }

  return ok({ committed: true, created, updated, skipped, errors });
}

async function findByName(name: string): Promise<Record<string, unknown> | null> {
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const result = await ddb.send(new ScanCommand({
    TableName: TABLE_APPS,
    FilterExpression: '#n = :name AND SK = :meta AND #s <> :del',
    ExpressionAttributeNames: { '#n': 'name', '#s': 'status' },
    ExpressionAttributeValues: { ':name': name, ':meta': 'META', ':del': 'deleted' },
  }));
  return (result.Items?.[0] as Record<string, unknown> | undefined) ?? null;
}

// Returns the CSV template as a string (for template download endpoint)
export function csvTemplate(): string {
  return ALL_COLS.map(c => `"${c}"`).join(',') + '\n';
}
