import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2, ScheduledEvent } from 'aws-lambda';
import { listApps }   from './handlers/listApps';
import { getApp }     from './handlers/getApp';
import { createApp }  from './handlers/createApp';
import { updateApp }  from './handlers/updateApp';
import { deleteApp, restoreApp } from './handlers/deleteApp';
import { getAudit }   from './handlers/getAudit';

type LambdaEvent = APIGatewayProxyEventV2WithJWTAuthorizer | ScheduledEvent;

function isKeepWarm(event: LambdaEvent): boolean {
  return 'source' in event && (event as ScheduledEvent).source === 'aws.events';
}

function isApiEvent(event: LambdaEvent): event is APIGatewayProxyEventV2WithJWTAuthorizer {
  return 'requestContext' in event;
}

function resp(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event: LambdaEvent): Promise<APIGatewayProxyResultV2 | void> {
  if (isKeepWarm(event)) {
    console.log('Keep-warm ping received');
    return;
  }
  if (!isApiEvent(event)) return;

  const method = event.requestContext.http.method;
  const path   = event.requestContext.http.path;

  console.log(`${method} ${path}`);

  // Health — no auth required
  if (method === 'GET' && path === '/health') {
    return resp(200, { status: 'ok' });
  }

  // Apps routes
  if (method === 'GET'  && path === '/apps')           return listApps(event);
  if (method === 'GET'  && path === '/apps/archived')  return listApps({ ...event, queryStringParameters: { ...event.queryStringParameters, status: 'deleted' } });
  if (method === 'POST' && path === '/apps')           return createApp(event);

  // /apps/{id}
  const appMatch = path.match(/^\/apps\/([^/]+)$/);
  if (appMatch) {
    const appId = appMatch[1];
    if (method === 'GET')    return getApp(event, appId);
    if (method === 'PUT')    return updateApp(event, appId);
    if (method === 'DELETE') return deleteApp(event, appId);
  }

  // /apps/{id}/restore
  const restoreMatch = path.match(/^\/apps\/([^/]+)\/restore$/);
  if (restoreMatch && method === 'POST') return restoreApp(event, restoreMatch[1]);

  // /audit/{appId}
  const auditMatch = path.match(/^\/audit\/([^/]+)$/);
  if (auditMatch && method === 'GET') return getAudit(event, auditMatch[1]);

  return resp(404, { message: 'Not found' });
}
