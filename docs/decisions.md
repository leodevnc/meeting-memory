# Engineering decisions

## ADR-001: Separate transcription and analysis asynchronously

Status: accepted

Audio duration can exceed an HTTP API response window, and Transcribe job completion time is unpredictable. The API is responsible only for the S3 upload and starting the job. A Transcribe state-change event wakes the analysis processor, while the browser polls the meeting state. Simple polling is easier to reason about than WebSocket connection state at this stage.

## ADR-002: Use Bedrock Converse with a strict output schema

Status: accepted

The adapter uses the Converse API instead of provider-specific payloads and sets `maxTokens` explicitly to 2400. The model ID is a CloudFormation parameter rather than a code constant. Responses must parse as JSON and pass a Zod schema. Any action-item state selected by the model is replaced with `OPEN` before storage.

To reduce transcript prompt injection, the system instruction defines the transcript as quoted data and wraps it in XML delimiters. This is not a complete defense, so decisions and action items also require an evidence field.

## ADR-003: Retain meeting metadata but expire source data after 30 days

Status: accepted

Source audio and transcript JSON expire through an S3 lifecycle rule after 30 days to reduce cost and the privacy exposure surface. The normalized transcript and analysis that users browse remain in DynamoDB. Retention requirements differ by organization, so a later version should make this a tenant-level policy.

## ADR-004: Local mode is not an AWS emulator

Status: accepted

The local server is a deterministic fake for quickly exercising the product flow and application contract. IAM, EventBridge retries, S3 CORS, and service quotas can only be verified with an AWS integration test. A successful local run must not be interpreted as a successful cloud integration.
