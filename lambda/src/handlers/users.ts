import { PutCommand, DeleteCommand } from '@aws-sdk/lib-dynamodb';
import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import { ddb, TABLE_APPS } from '../lib/dynamo';
import { getCaller } from '../lib/auth';

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

// Deletes all backend data for the calling user — called before Cognito deleteUser().
export async function deleteMe(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  await ddb.send(new DeleteCommand({
    TableName: TABLE_APPS,
    Key: { PK: `SIGNIN#${caller.sub}`, SK: 'LASTSIGNIN' },
  }));
  return { statusCode: 204, body: '' };
}
