import type { APIGatewayProxyStructuredResultV2, APIGatewayProxyEventV2WithJWTAuthorizer } from 'aws-lambda';

export class HttpError extends Error {
  public constructor(message: string, public readonly statusCode: number) { super(message); }
}

export function ownerId(event: APIGatewayProxyEventV2WithJWTAuthorizer): string {
  const id = event.requestContext.authorizer.jwt.claims.sub;
  if (typeof id !== 'string' || !id) throw new HttpError('Unauthorized', 401);
  return id;
}

export function response(statusCode: number, body: unknown): APIGatewayProxyStructuredResultV2 {
  return { statusCode, headers: { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store' }, body: JSON.stringify(body) };
}

export function handleError(error: unknown): APIGatewayProxyStructuredResultV2 {
  if (error instanceof HttpError) return response(error.statusCode, { error: error.message });
  console.error(JSON.stringify({ level: 'ERROR', code: error instanceof Error ? error.name : 'UnknownError' }));
  return response(500, { error: 'Internal server error' });
}
