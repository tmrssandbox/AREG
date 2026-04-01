import { GetCommand } from '@aws-sdk/lib-dynamodb';
import { ddb } from '../lib/dynamo';
import { CognitoTriggerEvent } from '../index';

const ADMIN_APPS_TABLE = process.env.ADMIN_APPS_TABLE ?? 'tmrs-admin-ddb-apps';

export async function preSignUp(event: CognitoTriggerEvent): Promise<CognitoTriggerEvent> {
  const email  = (event.request.userAttributes['email'] ?? '').toLowerCase();
  const domain = email.split('@')[1] ?? '';

  // Read allowedDomains from ADMIN app registry (tmrs-admin-ddb-apps, appId=areg)
  const result = await ddb.send(new GetCommand({
    TableName: ADMIN_APPS_TABLE,
    Key: { appId: 'areg' },
  }));

  const allowed: string[] = result.Item?.allowedDomains ?? [];

  // If no domains configured, fail closed — block all self-registration
  if (allowed.length === 0) {
    console.warn('AREG preSignUp: no allowedDomains in ADMIN registry — blocking sign-up');
    throw new Error('Self-registration is not currently enabled.');
  }

  if (!allowed.includes(domain)) {
    throw new Error(`Sign-up is restricted to: ${allowed.join(', ')}`);
  }

  return event;
}
