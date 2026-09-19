import { z } from 'zod';

export const actionItemSchema = z.object({
  id: z.string().min(1),
  task: z.string().min(1).max(500),
  owner: z.string().max(120).nullable(),
  dueDate: z.string().date().nullable(),
  status: z.enum(['OPEN', 'DONE']),
  evidence: z.string().min(1).max(500),
});

export const meetingAnalysisSchema = z.object({
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(4000),
  topics: z.array(z.string().min(1).max(120)).max(12),
  decisions: z.array(z.object({ text: z.string().min(1).max(500), evidence: z.string().min(1).max(500) })).max(30),
  actionItems: z.array(actionItemSchema).max(50),
  openQuestions: z.array(z.string().min(1).max(500)).max(30),
});

export type MeetingAnalysis = z.infer<typeof meetingAnalysisSchema>;
export type ActionItem = z.infer<typeof actionItemSchema>;
export type MeetingStatus = 'UPLOAD_PENDING' | 'TRANSCRIBING' | 'ANALYZING' | 'READY' | 'FAILED';

export interface Meeting {
  readonly ownerId: string;
  readonly meetingId: string;
  readonly createdAt: string;
  readonly updatedAt: string;
  readonly status: MeetingStatus;
  readonly sourceKey: string;
  readonly fileName: string;
  readonly mediaFormat: string;
  readonly languageCode: 'auto' | 'ko-KR' | 'en-US' | 'ja-JP';
  readonly speakerCount: number;
  readonly transcriptionJobName?: string;
  readonly transcriptKey?: string;
  readonly transcript?: string;
  readonly analysis?: MeetingAnalysis;
  readonly errorCode?: string;
}

export const createMeetingSchema = z.object({
  fileName: z.string().min(1).max(240).regex(/^[^/\\]+$/),
  contentType: z.enum(['audio/webm', 'audio/mp4', 'audio/mpeg', 'audio/wav', 'audio/x-m4a']),
  fileSize: z.number().int().positive().max(500 * 1024 * 1024),
  languageCode: z.enum(['auto', 'ko-KR', 'en-US', 'ja-JP']).default('auto'),
  speakerCount: z.number().int().min(2).max(10).default(4),
});

export type CreateMeetingInput = z.infer<typeof createMeetingSchema>;
