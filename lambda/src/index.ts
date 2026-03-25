import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2, ScheduledEvent } from 'aws-lambda';

type LambdaEvent = APIGatewayProxyEventV2WithJWTAuthorizer | ScheduledEvent;

// Keep-warm: EventBridge scheduled events have 'source' === 'aws.events'
function isKeepWarm(event: LambdaEvent): boolean {
  return 'source' in event && event.source === 'aws.events';
}

function isApiEvent(event: LambdaEvent): event is APIGatewayProxyEventV2WithJWTAuthorizer {
  return 'requestContext' in event;
}

function response(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export async function handler(event: LambdaEvent): Promise<APIGatewayProxyResultV2 | void> {
  if (isKeepWarm(event)) {
    console.log('Keep-warm ping received');
    return;
  }

  if (!isApiEvent(event)) {
    console.warn('Unknown event type', JSON.stringify(event));
    return;
  }

  const method = event.requestContext.http.method;
  const path   = event.requestContext.http.path;

  console.log(`${method} ${path}`);

  if (method === 'GET' && path === '/health') {
    return response(200, { status: 'ok' });
  }

  // Placeholder for future routes (Sprint 2)
  return response(404, { message: 'Not found' });
}
