import { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

export type Role = 'admin' | 'editor' | 'viewer';

export interface CallerInfo {
  sub: string;
  email: string;
  role: Role;
}

export function getCaller(event: APIGatewayProxyEventV2WithJWTAuthorizer): CallerInfo {
  const claims = event.requestContext.authorizer.jwt.claims;
  // Groups are serialized by API GW v2 as "[group1 group2]" — strip brackets, split on space
  const groupsRaw = (claims['cognito:groups'] as string | undefined) ?? '';
  const groups = groupsRaw.replace(/^\[|\]$/g, '').split(' ').filter(Boolean);
  const role = (groups[0] as Role | undefined) ?? 'viewer';
  return {
    sub:   claims['sub'] as string,
    email: (claims['email'] as string | undefined) ?? claims['sub'] as string,
    role,
  };
}

export function requireAdmin(caller: CallerInfo): boolean {
  return caller.role === 'admin';
}
