# Architecture

## Boundaries and invariants

1. A user can read and modify only meetings stored in that user's Cognito `sub` partition.
2. Source uploads do not pass through API Gateway. The API issues a constrained presigned POST instead.
3. Transcription and LLM analysis are asynchronous. The HTTP request is responsible only for starting the work.
4. A meeting reaches `READY` only after a valid structured analysis has been stored.
5. Both transcripts and model outputs are untrusted data. They cross validation boundaries before entering logs, HTML, or application state.

## State model

```text
UPLOAD_PENDING -> TRANSCRIBING -> ANALYZING -> READY
       |               |              |
       +---------------+--------------+-> FAILED

FAILED -> TRANSCRIBING (explicit retry, planned for a later milestone)
```

EventBridge and Lambda provide at-least-once delivery, so the same event may arrive more than once. The processor ignores a meeting that is already `READY`. Only an invocation that acquires the DynamoDB conditional transition from `TRANSCRIBING` to `ANALYZING` performs the analysis.

## Data model

The design uses one DynamoDB table.

```text
pk = OWNER#{cognito_sub}
sk = MEETING#{meeting_id}
```

Meeting lists are read with an owner-partition query. When Transcribe reports completion, the processor finds the meeting by querying the `job-name-index` GSI with `transcriptionJobName`. This GSI is a workflow correlation index, not an authorization boundary for user-facing APIs.

LLM analysis follows this version 1 contract:

```text
title
summary
topics[]
decisions[] { text, evidence }
actionItems[] { id, task, owner?, dueDate?, status, evidence }
openQuestions[]
```

## Failure handling

| Failure | Handling | User-visible state |
|---|---|---|
| Upload is incomplete | Reject during S3 `HeadObject` | `UPLOAD_PENDING` |
| Transcribe emits a failure event | Store only an error code | `FAILED` |
| Transcript JSON is missing or invalid | Log the code without the transcript body | `FAILED` |
| Bedrock throttles or has a transient failure | SDK adaptive retry followed by EventBridge retry | `ANALYZING` or `FAILED` |
| Model output fails schema validation | Do not store it as application state | `FAILED` |
| Processor repeatedly fails | Send the EventBridge target event to the DLQ | Operator review |

The current implementation changes the meeting to `FAILED` if processing fails after analysis starts, and automatic retries are deliberately limited. A manual retry API remains on the roadmap.

## Privacy and logging

Meeting content is never written to `console`. Logs contain only meeting IDs, state transitions, and error names. Bedrock model invocation logging is configured at the AWS account level, so any deployment experiment must verify whether source text is retained and define log encryption and retention before it runs.
