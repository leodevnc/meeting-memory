import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { GetObjectCommand, S3Client } from '@aws-sdk/client-s3';
import { DynamoDBDocumentClient, QueryCommand, UpdateCommand } from '@aws-sdk/lib-dynamodb';
import type { EventBridgeHandler } from 'aws-lambda';
import { analyzeWithBedrock } from '../adapters/bedrock-analyzer.js';
import type { Meeting } from '../core/model.js';
import { parseTranscript } from '../core/transcript.js';

interface TranscribeDetail { readonly TranscriptionJobName: string; readonly TranscriptionJobStatus: 'COMPLETED' | 'FAILED'; }
const s3 = new S3Client({});
const db = DynamoDBDocumentClient.from(new DynamoDBClient({}));
const bucketName = process.env.BUCKET_NAME ?? '';
const tableName = process.env.TABLE_NAME ?? '';

export const handler: EventBridgeHandler<'Transcribe Job State Change', TranscribeDetail, void> = async (event) => {
  const jobName = event.detail.TranscriptionJobName;
  const result = await db.send(new QueryCommand({
    TableName: tableName, IndexName: 'job-name-index', KeyConditionExpression: 'transcriptionJobName = :job', ExpressionAttributeValues: { ':job': jobName }, Limit: 1,
  }));
  const meeting = result.Items?.[0] as (Meeting & { pk: string; sk: string }) | undefined;
  if (!meeting || meeting.status === 'READY') return;
  if (event.detail.TranscriptionJobStatus === 'FAILED') {
    await fail(meeting, 'TRANSCRIPTION_FAILED');
    return;
  }
  try {
    await db.send(new UpdateCommand({ TableName: tableName, Key: { pk: meeting.pk, sk: meeting.sk }, UpdateExpression: 'SET #status = :next, updatedAt = :now', ConditionExpression: '#status = :expected', ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':next': 'ANALYZING', ':expected': 'TRANSCRIBING', ':now': new Date().toISOString() } }));
    const object = await s3.send(new GetObjectCommand({ Bucket: bucketName, Key: meeting.transcriptKey }));
    const body = await object.Body?.transformToString();
    if (!body) throw new Error('Transcript object was empty');
    const transcript = parseTranscript(JSON.parse(body) as object).text;
    const analysis = await analyzeWithBedrock(transcript);
    await db.send(new UpdateCommand({
      TableName: tableName, Key: { pk: meeting.pk, sk: meeting.sk },
      UpdateExpression: 'SET #status = :ready, updatedAt = :now, transcript = :transcript, analysis = :analysis REMOVE errorCode',
      ConditionExpression: '#status = :analyzing', ExpressionAttributeNames: { '#status': 'status' },
      ExpressionAttributeValues: { ':ready': 'READY', ':analyzing': 'ANALYZING', ':now': new Date().toISOString(), ':transcript': transcript, ':analysis': analysis },
    }));
    console.info(JSON.stringify({ level: 'INFO', event: 'meeting_ready', meetingId: meeting.meetingId }));
  } catch (error) {
    console.error(JSON.stringify({ level: 'ERROR', event: 'meeting_processing_failed', meetingId: meeting.meetingId, code: error instanceof Error ? error.name : 'UnknownError' }));
    await fail(meeting, 'ANALYSIS_FAILED');
  }
};

async function fail(meeting: Meeting & { pk: string; sk: string }, code: string): Promise<void> {
  await db.send(new UpdateCommand({ TableName: tableName, Key: { pk: meeting.pk, sk: meeting.sk }, UpdateExpression: 'SET #status = :failed, errorCode = :code, updatedAt = :now', ExpressionAttributeNames: { '#status': 'status' }, ExpressionAttributeValues: { ':failed': 'FAILED', ':code': code, ':now': new Date().toISOString() } }));
}
