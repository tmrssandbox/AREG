import { handler } from '../../src/index';
import { APIGatewayProxyEventV2WithJWTAuthorizer, ScheduledEvent } from 'aws-lambda';

function makeApiEvent(method: string, path: string): APIGatewayProxyEventV2WithJWTAuthorizer {
  return {
    version: '2.0',
    routeKey: `${method} ${path}`,
    rawPath: path,
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123',
      apiId: 'test',
      authorizer: { jwt: { claims: { sub: 'user1' }, scopes: [] }, principalId: 'user1', integrationLatency: 0 },
      domainName: 'test.execute-api.us-east-2.amazonaws.com',
      domainPrefix: 'test',
      http: { method, path, protocol: 'HTTP/1.1', sourceIp: '1.2.3.4', userAgent: 'test' },
      requestId: 'req-1',
      routeKey: `${method} ${path}`,
      stage: '$default',
      time: '01/Jan/2026:00:00:00 +0000',
      timeEpoch: 1735689600000,
    },
    isBase64Encoded: false,
  } as APIGatewayProxyEventV2WithJWTAuthorizer;
}

function makeScheduledEvent(): ScheduledEvent {
  return {
    version: '0',
    id: 'abc123',
    'detail-type': 'Scheduled Event',
    source: 'aws.events',
    account: '123',
    time: '2026-01-01T00:00:00Z',
    region: 'us-east-2',
    resources: ['arn:aws:events:us-east-2:123:rule/areg-keep-warm'],
    detail: {},
  };
}

describe('handler', () => {
  test('GET /health returns 200', async () => {
    const result = await handler(makeApiEvent('GET', '/health')) as { statusCode: number; body: string };
    expect(result.statusCode).toBe(200);
    expect(JSON.parse(result.body)).toEqual({ status: 'ok' });
  });

  test('unknown route returns 404', async () => {
    const result = await handler(makeApiEvent('GET', '/unknown')) as { statusCode: number; body: string };
    expect(result.statusCode).toBe(404);
  });

  test('keep-warm event returns undefined', async () => {
    const result = await handler(makeScheduledEvent());
    expect(result).toBeUndefined();
  });
});
