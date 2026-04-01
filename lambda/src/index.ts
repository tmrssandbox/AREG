import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2, ScheduledEvent } from 'aws-lambda';
import { listApps }      from './handlers/listApps';
import { getApp }        from './handlers/getApp';
import { createApp }     from './handlers/createApp';
import { updateApp }     from './handlers/updateApp';
import { deleteApp, restoreApp } from './handlers/deleteApp';
import { getAudit }      from './handlers/getAudit';
import { importApps }    from './handlers/importApps';
import { recordSignIn, deleteMe } from './handlers/users';
import { preSignUp } from './handlers/preSignUp';

// Cognito trigger event shape (pre-signup and post-authentication)
export interface CognitoTriggerEvent {
  triggerSource: string;
  userName: string;
  request: { userAttributes: Record<string, string> };
  response: Record<string, unknown>;
  [key: string]: unknown;
}

// Keep alias for existing usage
type CognitoPostAuthEvent = CognitoTriggerEvent;

type LambdaEvent = APIGatewayProxyEventV2WithJWTAuthorizer | ScheduledEvent | CognitoPostAuthEvent;

function isKeepWarm(event: LambdaEvent): boolean {
  return 'source' in event && (event as ScheduledEvent).source === 'aws.events';
}

function isCognitoTrigger(event: LambdaEvent): event is CognitoPostAuthEvent {
  return 'triggerSource' in event;
}

function isApiEvent(event: LambdaEvent): event is APIGatewayProxyEventV2WithJWTAuthorizer {
  return 'requestContext' in event;
}

function resp(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return { statusCode, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
}

export async function handler(event: LambdaEvent): Promise<APIGatewayProxyResultV2 | LambdaEvent | void> {
  // Cognito triggers
  if (isCognitoTrigger(event)) {
    if (event.triggerSource === 'PreSignUp_SignUp') {
      return preSignUp(event);
    }
    if (event.triggerSource === 'PostAuthentication_Authentication') {
      try {
        await recordSignIn(event.userName, event.request.userAttributes['email'] ?? '');
      } catch (e) {
        console.error('Failed to record sign-in:', e);
      }
    }
    return event;
  }

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

  // Version — no auth required
  if (method === 'GET' && path === '/version') {
    return resp(200, { version: process.env.DEPLOY_VERSION ?? 'unknown' });
  }

  // Users routes
  if (method === 'DELETE' && path === '/users/me') return deleteMe(event);

  // Apps routes
  if (method === 'GET'  && path === '/apps')           return listApps(event);
  if (method === 'GET'  && path === '/apps/archived')  return listApps({ ...event, queryStringParameters: { ...event.queryStringParameters, status: 'deleted' } });
  if (method === 'POST' && path === '/apps/import')    return importApps(event);
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
