import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand } from '@aws-sdk/lib-dynamodb';
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { actionItemSchema, type Meeting } from '../core/model.js';
import { handleError, HttpError, ownerId, response } from './shared.js';

const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const tableName = process.env.TABLE_NAME ?? '';
const key = (owner: string, meetingId: string) => ({ pk: `OWNER#${owner}`, sk: `MEETING#${meetingId}` });

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const owner = ownerId(event);
    const method = event.requestContext.http.method;
    const meetingId = event.pathParameters?.meetingId;
    const actionId = event.pathParameters?.actionId;
    if (method === 'GET' && !meetingId) {
      const result = await db.send(new QueryCommand({ TableName: tableName, KeyConditionExpression: 'pk = :pk', ExpressionAttributeValues: { ':pk': `OWNER#${owner}` }, ScanIndexForward: false }));
      return response(200, { meetings: (result.Items ?? []).map((item) => publicMeeting(item as Meeting & Record<string, unknown>)) });
    }
    if (!meetingId) throw new HttpError('Meeting id is required', 400);
    const found = await db.send(new GetCommand({ TableName: tableName, Key: key(owner, meetingId), ConsistentRead: true }));
    if (!found.Item) throw new HttpError('Meeting not found', 404);
    if (method === 'GET') return response(200, publicMeeting(found.Item as Meeting & Record<string, unknown>));
    if (method === 'PATCH' && actionId) {
      const input = JSON.parse(event.body ?? '{}') as { status?: unknown };
      const meeting = found.Item as Meeting & Record<string, unknown>;
      if (!meeting.analysis) throw new HttpError('Meeting analysis is not ready', 409);
      const index = meeting.analysis.actionItems.findIndex((item) => item.id === actionId);
      if (index < 0) throw new HttpError('Action item not found', 404);
      const updated = [...meeting.analysis.actionItems];
      updated[index] = actionItemSchema.parse({ ...updated[index], status: input.status });
      const next = { ...meeting, analysis: { ...meeting.analysis, actionItems: updated }, updatedAt: new Date().toISOString() };
      await db.send(new PutCommand({ TableName: tableName, Item: next, ConditionExpression: 'attribute_exists(pk)' }));
      return response(200, publicMeeting(next));
    }
    throw new HttpError('Route not found', 404);
  } catch (error) { return handleError(error); }
};

function publicMeeting(item: Meeting & Record<string, unknown>): Omit<typeof item, 'pk' | 'sk' | 'ownerId' | 'sourceKey' | 'transcriptKey'> {
  const { pk: _pk, sk: _sk, ownerId: _ownerId, sourceKey: _sourceKey, transcriptKey: _transcriptKey, ...safe } = item;
  return safe;
}
