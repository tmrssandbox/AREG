import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, QueryCommand } from '@aws-sdk/lib-dynamodb';
import { SESClient, SendEmailCommand } from '@aws-sdk/client-ses';

const TABLE_APPS  = process.env.TABLE_APPS  ?? 'areg-ddb-apps';
const SENDER      = process.env.ALERT_SENDER ?? 'noreply@tmrs.studio';
const APP_URL     = 'https://areg.tmrs.studio';

const ddb = DynamoDBDocumentClient.from(new DynamoDBClient({ region: process.env.REGION ?? 'us-east-2' }));
const ses = new SESClient({ region: 'us-east-1' }); // SES in us-east-1

const WINDOWS = [30, 60, 90];

function addDays(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export async function handler(): Promise<void> {
  // Query all active apps
  const result = await ddb.send(new QueryCommand({
    TableName:              TABLE_APPS,
    IndexName:              'GSI1',
    KeyConditionExpression: 'GSI1PK = :pk',
    ExpressionAttributeValues: { ':pk': 'STATUS#active' },
  }));

  const apps = (result.Items ?? []) as Record<string, string>[];
  const targetDates = new Set(WINDOWS.map(addDays));

  let sent = 0;
  for (const app of apps) {
    if (!app['renewalDate'] || !targetDates.has(app['renewalDate'])) continue;

    const daysOut = WINDOWS.find(w => addDays(w) === app['renewalDate']) ?? 0;
    const recipient = app['itContact'];
    if (!recipient) continue;

    const subject = `[Application Registry] Renewal Alert — ${app['name']} renews in ${daysOut} days`;
    const body = [
      `Application: ${app['name']}`,
      `Vendor: ${app['vendor']}`,
      `Renewal Date: ${app['renewalDate']}`,
      `IT Contact: ${app['itContact']}`,
      `Business Owner: ${app['businessOwner']}`,
      ``,
      `View record: ${APP_URL}/catalog?id=${app['appId']}`,
    ].join('\n');

    try {
      await ses.send(new SendEmailCommand({
        Source: SENDER,
        Destination: { ToAddresses: [recipient] },
        Message: {
          Subject: { Data: subject },
          Body:    { Text: { Data: body } },
        },
      }));
      console.log(`Alert sent: ${app['name']} → ${recipient} (${daysOut}d)`);
      sent++;
    } catch (err) {
      console.error(`Failed to send alert for ${app['name']}: ${(err as Error).message}`);
    }
  }

  console.log(`Renewal alerts complete. Sent: ${sent}`);
}
