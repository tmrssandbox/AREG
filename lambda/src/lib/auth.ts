import { APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

export type Role = 'admin' | 'editor' | 'viewer';

export interface CallerInfo {
  sub: string;
  email: string;
  role: Role;
}

export function getCaller(event: APIGatewayProxyEventV2WithJWTAuthorizer): CallerInfo {
  const claims = event.requestContext.authorizer.jwt.claims;
  const role = (claims['custom:role'] as string | undefined) ?? 'viewer';
  return {
    sub:   claims['sub'] as string,
    email: (claims['email'] as string | undefined) ?? claims['sub'] as string,
    role:  role as Role,
  };
}

export function requireAdmin(caller: CallerInfo): boolean {
  return caller.role === 'admin';
}
