import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_AUDIT } from './dynamo';
import { randomUUID } from 'crypto';

export type AuditAction = 'CREATE' | 'UPDATE' | 'DELETE' | 'RESTORE';

export interface Diff {
  [field: string]: { old?: unknown; new?: unknown };
}

export async function writeAudit(
  appId: string,
  action: AuditAction,
  userEmail: string,
  diff?: Diff,
): Promise<void> {
  const timestamp = new Date().toISOString();
  const sk = `AUDIT#${timestamp}#${randomUUID()}`;

  // Strip undefined values from diff entries (DynamoDB rejects undefined)
  const cleanDiff: Diff | undefined = diff
    ? Object.fromEntries(
        Object.entries(diff).map(([k, v]) => [
          k,
          {
            ...(v.old !== undefined ? { old: v.old } : {}),
            ...(v.new !== undefined ? { new: v.new } : {}),
          },
        ]),
      )
    : undefined;

  await ddb.send(new PutCommand({
    TableName: TABLE_AUDIT,
    Item: {
      PK:        `APP#${appId}`,
      SK:        sk,
      action,
      userEmail,
      timestamp,
      ...(cleanDiff ? { diff: cleanDiff } : {}),
    },
  }));
}
