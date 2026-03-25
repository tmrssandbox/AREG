import { APIGatewayProxyResultV2 } from 'aws-lambda';

export function ok(body: unknown): APIGatewayProxyResultV2 {
  return json(200, body);
}

export function created(body: unknown): APIGatewayProxyResultV2 {
  return json(201, body);
}

export function noContent(): APIGatewayProxyResultV2 {
  return { statusCode: 204, body: '' };
}

export function badRequest(message: string, details?: unknown): APIGatewayProxyResultV2 {
  return json(400, { message, ...(details ? { details } : {}) });
}

export function forbidden(message = 'Forbidden'): APIGatewayProxyResultV2 {
  return json(403, { message });
}

export function notFound(message = 'Not found'): APIGatewayProxyResultV2 {
  return json(404, { message });
}

export function serverError(message = 'Internal server error'): APIGatewayProxyResultV2 {
  return json(500, { message });
}

function json(statusCode: number, body: unknown): APIGatewayProxyResultV2 {
  return {
    statusCode,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  };
}
