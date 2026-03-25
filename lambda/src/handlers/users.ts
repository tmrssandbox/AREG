import { APIGatewayProxyEventV2WithJWTAuthorizer, APIGatewayProxyResultV2 } from 'aws-lambda';
import {
  CognitoIdentityProviderClient,
  ListUsersCommand,
  AdminCreateUserCommand,
  AdminUpdateUserAttributesCommand,
  AdminDisableUserCommand,
  AdminEnableUserCommand,
} from '@aws-sdk/client-cognito-identity-provider';
import { getCaller, requireAdmin } from '../lib/auth';
import { ok, created, forbidden, badRequest } from '../lib/response';

const cognitoClient = new CognitoIdentityProviderClient({ region: process.env.REGION ?? 'us-east-2' });
const USER_POOL_ID  = process.env.USER_POOL_ID ?? '';

function mapUser(u: { Username?: string; Enabled?: boolean; UserStatus?: string; UserCreateDate?: Date; Attributes?: { Name?: string; Value?: string }[] }) {
  const attrs = Object.fromEntries((u.Attributes ?? []).map(a => [a.Name ?? '', a.Value ?? '']));
  return {
    sub:       u.Username ?? '',           // Cognito Username — used for admin operations
    email:     attrs['email'] ?? u.Username ?? '',
    role:      attrs['custom:role'] ?? 'viewer',
    status:    u.UserStatus,
    enabled:   u.Enabled ?? true,
    createdAt: u.UserCreateDate?.toISOString() ?? '',
  };
}

export async function listUsers(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (!requireAdmin(caller)) return forbidden();

  const result = await cognitoClient.send(new ListUsersCommand({ UserPoolId: USER_POOL_ID }));
  return ok({ users: (result.Users ?? []).map(mapUser) });
}

export async function inviteUser(event: APIGatewayProxyEventV2WithJWTAuthorizer): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (!requireAdmin(caller)) return forbidden();

  let body: { email?: string; role?: string };
  try { body = JSON.parse(event.body ?? '{}'); } catch { return badRequest('Invalid JSON'); }
  if (!body.email) return badRequest('email is required');
  const role = body.role ?? 'viewer';

  await cognitoClient.send(new AdminCreateUserCommand({
    UserPoolId:        USER_POOL_ID,
    Username:          body.email,
    UserAttributes: [
      { Name: 'email',          Value: body.email },
      { Name: 'email_verified', Value: 'true' },
      { Name: 'custom:role',    Value: role },
    ],
    DesiredDeliveryMediums: ['EMAIL'],
  }));

  return created({ email: body.email, role });
}

export async function updateUserRole(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  username: string,
): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (!requireAdmin(caller)) return forbidden();

  let body: { role?: string };
  try { body = JSON.parse(event.body ?? '{}'); } catch { return badRequest('Invalid JSON'); }
  if (!body.role) return badRequest('role is required');

  await cognitoClient.send(new AdminUpdateUserAttributesCommand({
    UserPoolId: USER_POOL_ID,
    Username:   username,
    UserAttributes: [{ Name: 'custom:role', Value: body.role }],
  }));

  return ok({ username, role: body.role });
}

export async function deactivateUser(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  username: string,
): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (!requireAdmin(caller)) return forbidden();

  await cognitoClient.send(new AdminDisableUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
  return ok({ username, enabled: false });
}

export async function enableUser(
  event: APIGatewayProxyEventV2WithJWTAuthorizer,
  username: string,
): Promise<APIGatewayProxyResultV2> {
  const caller = getCaller(event);
  if (!requireAdmin(caller)) return forbidden();

  await cognitoClient.send(new AdminEnableUserCommand({ UserPoolId: USER_POOL_ID, Username: username }));
  return ok({ username, enabled: true });
}
