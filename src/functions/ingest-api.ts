import { randomUUID } from 'node:crypto';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { HeadObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { StartTranscriptionJobCommand, TranscribeClient, type MediaFormat } from '@aws-sdk/client-transcribe';
import { DynamoDBDocumentClient, GetCommand, PutCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import { createPresignedPost } from '@aws-sdk/s3-presigned-post';
import type { APIGatewayProxyHandlerV2WithJWTAuthorizer } from 'aws-lambda';
import { createMeetingSchema, type Meeting } from '../core/model.js';
import { handleError, HttpError, ownerId, response } from './shared.js';

const s3 = new S3Client({});
const transcribe = new TranscribeClient({});
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}), { marshallOptions: { removeUndefinedValues: true } });
const bucketName = process.env.BUCKET_NAME ?? '';
const tableName = process.env.TABLE_NAME ?? '';

export const handler: APIGatewayProxyHandlerV2WithJWTAuthorizer = async (event) => {
  try {
    const owner = ownerId(event);
    const meetingId = event.pathParameters?.meetingId;
    if (!meetingId) return await create(owner, event.body);
    return await start(owner, meetingId);
  } catch (error) { return handleError(error); }
};

async function create(owner: string, body: string | undefined) {
  const input = createMeetingSchema.parse(JSON.parse(body ?? '{}'));
  const meetingId = randomUUID();
  const now = new Date().toISOString();
  const extension = input.fileName.split('.').at(-1)?.toLowerCase() || 'bin';
  const sourceKey = `uploads/${owner}/${meetingId}.${extension}`;
  const meeting: Meeting & { pk: string; sk: string } = {
    pk: `OWNER#${owner}`, sk: `MEETING#${meetingId}`, ownerId: owner, meetingId, createdAt: now, updatedAt: now,
    status: 'UPLOAD_PENDING', sourceKey, fileName: input.fileName, mediaFormat: mediaFormat(input.contentType),
    languageCode: input.languageCode, speakerCount: input.speakerCount,
  };
  await db.send(new PutCommand({ TableName: tableName, Item: meeting, ConditionExpression: 'attribute_not_exists(pk)' }));
  const upload = await createPresignedPost(s3, {
    Bucket: bucketName, Key: sourceKey, Expires: 600,
    Fields: { 'Content-Type': input.contentType },
    Conditions: [['content-length-range', 1, 500 * 1024 * 1024], ['eq', '$Content-Type', input.contentType]],
  });
  return response(201, { meetingId, status: meeting.status, upload });
}

async function start(owner: string, meetingId: string) {
  const dbKey = { pk: `OWNER#${owner}`, sk: `MEETING#${meetingId}` };
  const result = await db.send(new GetCommand({ TableName: tableName, Key: dbKey, ConsistentRead: true }));
  const meeting = result.Item as (Meeting & Record<string, unknown>) | undefined;
  if (!meeting) throw new HttpError('Meeting not found', 404);
  if (meeting.status !== 'UPLOAD_PENDING') return response(202, { meetingId, status: meeting.status });
  await s3.send(new HeadObjectCommand({ Bucket: bucketName, Key: meeting.sourceKey }));
  const jobName = `meeting-${meetingId}`;
  const transcriptKey = `transcripts/${owner}/${meetingId}.json`;
  try {
    await transcribe.send(new StartTranscriptionJobCommand({
      TranscriptionJobName: jobName,
      Media: { MediaFileUri: `s3://${bucketName}/${meeting.sourceKey}` },
      MediaFormat: meeting.mediaFormat as MediaFormat,
      ...(meeting.languageCode === 'auto' ? { IdentifyLanguage: true, LanguageOptions: ['ko-KR', 'en-US', 'ja-JP'] } : { LanguageCode: meeting.languageCode }),
      Settings: { ShowSpeakerLabels: true, MaxSpeakerLabels: meeting.speakerCount },
      OutputBucketName: bucketName, OutputKey: transcriptKey,
    }));
  } catch (error) { if (!(error instanceof Error) || error.name !== 'ConflictException') throw error; }
  await db.send(new UpdateCommand({
    TableName: tableName, Key: dbKey,
    UpdateExpression: 'SET #status = :next, updatedAt = :now, transcriptionJobName = :job, transcriptKey = :transcript',
    ConditionExpression: '#status = :expected',
    ExpressionAttributeNames: { '#status': 'status' },
    ExpressionAttributeValues: { ':next': 'TRANSCRIBING', ':expected': 'UPLOAD_PENDING', ':now': new Date().toISOString(), ':job': jobName, ':transcript': transcriptKey },
  }));
  return response(202, { meetingId, status: 'TRANSCRIBING' });
}

function mediaFormat(contentType: string): string {
  return ({ 'audio/webm': 'webm', 'audio/mp4': 'mp4', 'audio/mpeg': 'mp3', 'audio/wav': 'wav', 'audio/x-m4a': 'mp4' } as Record<string, string>)[contentType] ?? 'webm';
}
