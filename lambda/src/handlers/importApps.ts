import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { GetCommand, PutCommand } from '@aws-sdk/lib-dynamodb';
import { randomUUID } from 'crypto';
import { ddb, TABLE_APPS } from '../lib/dynamo';
import { writeAudit } from '../lib/auditLog';
import { getCaller, requireAdmin } from '../lib/auth';
import { ok, badRequest, forbidden } from '../lib/response';

const REQUIRED_COLS = ['name', 'description', 'vendor', 'itContact', 'businessOwner', 'hoursOfOperation'] as const;
const OPTIONAL_COLS = ['department', 'renewalDate', 'notes'] as const;
const ALL_COLS = [...REQUIRED_COLS, ...OPTIONAL_COLS];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

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

function validateAndParse(headers: string[], rows: string[][]): ParsedRow[] {
  return rows.map((cols, idx) => {
    const row = idx + 2; // 1-based, header is row 1
    const data: Record<string, string> = {};
    const errors: string[] = [];

    for (let i = 0; i < headers.length; i++) {
      const key = headers[i].trim();
      if (ALL_COLS.includes(key as typeof ALL_COLS[number])) {
        data[key] = (cols[i] ?? '').trim();
      }
    }

    for (const req of REQUIRED_COLS) {
      if (!data[req]) errors.push(`${req} is required`);
    }
    if (data['renewalDate'] && !DATE_RE.test(data['renewalDate'])) {
      errors.push('renewalDate must be YYYY-MM-DD');
    }

    return { row, data, errors };
  });
}

export async function importApps(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (!requireAdmin(caller)) return forbidden();

  const qs          = event.queryStringParameters ?? {};
  const commit      = qs['commit'] === 'true';
  const duplicates  = (qs['duplicates'] ?? 'skip') as 'skip' | 'overwrite';

  // Accept raw CSV body (Content-Type: text/csv or text/plain)
  let csvText = event.body ?? '';
  if (event.isBase64Encoded) csvText = Buffer.from(csvText, 'base64').toString('utf-8');
  if (!csvText.trim()) return badRequest('Empty body');

  const { headers, rows } = parseCSV(csvText);
  if (headers.length === 0) return badRequest('Could not parse CSV headers');

  const missingHeaders = REQUIRED_COLS.filter(c => !headers.includes(c));
  if (missingHeaders.length > 0) return badRequest(`Missing required columns: ${missingHeaders.join(', ')}`);

  const parsed = validateAndParse(headers, rows);
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

  // Commit
  let created = 0, updated = 0, skipped = 0, errors = 0;

  for (const { data, errors: rowErrors } of parsed) {
    if (rowErrors.length > 0) { errors++; continue; }

    // Check for duplicate by name
    const existing = await findByName(data['name']);
    if (existing) {
      if (duplicates === 'skip') { skipped++; continue; }
      // overwrite
      const diff: Record<string, { old: unknown; new: unknown }> = {};
      const updated_item = { ...existing };
      for (const col of ALL_COLS) {
        if (data[col] && data[col] !== existing[col]) {
          diff[col] = { old: existing[col], new: data[col] };
          updated_item[col] = data[col];
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
      for (const col of ALL_COLS) { if (data[col]) item[col] = data[col]; }
      await ddb.send(new PutCommand({ TableName: TABLE_APPS, Item: item }));
      await writeAudit(appId, 'CREATE', caller.email);
      created++;
    }
  }

  return ok({ committed: true, created, updated, skipped, errors });
}

async function findByName(name: string): Promise<Record<string, unknown> | null> {
  // Scan active records for name match (small dataset)
  const { ScanCommand } = await import('@aws-sdk/lib-dynamodb');
  const result = await ddb.send(new ScanCommand({
    TableName: TABLE_APPS,
    FilterExpression: '#n = :name AND SK = :meta AND #s <> :del',
    ExpressionAttributeNames: { '#n': 'name', '#s': 'status' },
    ExpressionAttributeValues: { ':name': name, ':meta': 'META', ':del': 'deleted' },
  }));
  return (result.Items?.[0] as Record<string, unknown> | undefined) ?? null;
}
