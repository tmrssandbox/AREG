import { PutCommand } from '@aws-sdk/lib-dynamodb';
import { ddb, TABLE_APPS } from '../lib/dynamo';

// Records last sign-in time for a user — called by the PostAuthentication Cognito trigger.
export async function recordSignIn(sub: string, email: string): Promise<void> {
  await ddb.send(new PutCommand({
    TableName: TABLE_APPS,
    Item: {
      PK:        `SIGNIN#${sub}`,
      SK:        'LASTSIGNIN',
      email,
      timestamp: new Date().toISOString(),
    },
  }));
}
