import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_APPS } from '../lib/dynamo';
import { CognitoTriggerEvent } from '../index';

export async function preSignUp(event: CognitoTriggerEvent): Promise<CognitoTriggerEvent> {
  const email  = (event.request.userAttributes['email'] ?? '').toLowerCase();
  const domain = email.split('@')[1] ?? '';

  // Read allowed_domains setting from DynamoDB
  const result = await ddb.send(new GetCommand({
    TableName: TABLE_APPS,
    Key: { PK: 'SETTING#allowed_domains', SK: 'CONFIG' },
  }));

  const raw = result.Item?.value as string | undefined;

  // If no domains configured, allow everyone
  if (!raw || !raw.trim()) return event;

  const allowed = raw.split(',').map(d => d.trim().toLowerCase()).filter(Boolean);
  if (allowed.length === 0) return event;

  if (!allowed.includes(domain)) {
    throw new Error(`Sign-up is restricted to: ${allowed.join(', ')}`);
  }

  return event;
}
