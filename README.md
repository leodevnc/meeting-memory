# Meeting Memory

Meeting Memory is an experiment in turning meeting audio into records that can be revisited and acted upon, rather than stopping at transcription. Record a meeting in the browser or upload an audio file to produce a speaker-aware, timestamped transcript. An LLM then structures the conversation into a summary, decisions, action items, and open questions. Action items remain manageable through completion.

![Status](https://img.shields.io/badge/status-study%20in%20progress-ef5b3f)

## Questions explored

- How can a long-running workflow continue safely without holding an HTTP request open?
- What validation boundary is needed when LLM output becomes application state rather than plain text?
- How can the system treat instructions inside a transcript as data and reduce unsupported decisions or action items?
- Which key structure and retention policy can isolate each user's meeting data and source audio?
- Can the full user flow be tested repeatedly without AWS?

## Current scope

- Browser recording and audio uploads up to 500 MB
- Korean, English, Japanese, or automatic language detection
- A complete local flow using mock transcription and deterministic analysis
- Non-deploying CDK and adapter examples that model Amazon Transcribe and Amazon Bedrock Converse integration
- Summaries, topics, decisions, supporting evidence, action items, and open questions
- Per-user meeting list and detail views, including action-item completion
- Cognito JWT authentication, direct S3 uploads, and DynamoDB ownership partitions in the architecture prototype
- A local mock transcription and analysis server with integration tests

Search, participant invitations, calendar synchronization, and questions across multiple meetings are intentionally out of scope for now.

## Run locally

Node.js 20 or newer is required.

```bash
npm install
npm run dev
```

Open `http://127.0.0.1:4173` in a browser. Local mode skips authentication and AWS calls, then analyzes a fixed transcript sample. It does not incur cloud costs.

```bash
npm run build
npm test
npm run synth
```

## AWS architecture prototype

The CDK code under `lib/` and `src/functions/` explores an expansion path built from CloudFront, private S3 buckets, Cognito, HTTP API, Lambda, DynamoDB, EventBridge, and an SQS dead-letter queue. The default workflow in this repository does not create or connect to real AWS resources. `synth` only checks the CloudFormation structure and whether the Lambda functions can be bundled.

```bash
npm run synth
```

The default `BedrockModelId` is deliberately a placeholder. A separate deployment experiment would need to verify a currently available model, review cost and privacy implications, define a cleanup plan, and then provide the model ID explicitly.

## Processing flow

```text
Browser
  ├─ Cognito login
  ├─ POST /meetings
  └─ presigned upload ───────────────> private S3
                                            │
Browser ── POST /meetings/{id}/start        │
                    │                       │
                    ▼                       ▼
              Amazon Transcribe ──> transcript JSON
                    │
              EventBridge event
                    │
                    ▼
             processor Lambda
              ├─ normalize speakers/timestamps
              ├─ Bedrock Converse
              ├─ validate JSON schema
              └─ conditional status update
                    │
                    ▼
                 DynamoDB
```

See [architecture.md](docs/architecture.md) for the detailed design and failure modes, [decisions.md](docs/decisions.md) for the reasoning behind key choices, and [roadmap.md](docs/roadmap.md) for planned experiments.

## Data and security boundaries

- Every API requires a Cognito JWT and includes its `sub` claim in the DynamoDB partition key.
- Uploads use presigned POST requests that expire after ten minutes and constrain file size and content type.
- S3 blocks public access and requires HTTPS.
- Source audio and transcript objects expire after 30 days.
- Transcript bodies and LLM responses are never written to application logs.
- The transcript is marked as untrusted input, and every LLM result is validated with a Zod schema.
- Asynchronous Lambda failures go to a dead-letter queue, while conditional status updates prevent duplicate events from reprocessing completed meetings.

Meetings may contain personal data or confidential company information. A real environment would need separate decisions about customer-managed KMS keys, Bedrock model invocation logging, Guardrails, and the organization's retention, access, and audit policies.

## Known limitations

- Correlating events through a job-name GSI is simple, but a dedicated job record or event store may be more suitable at larger scale.
- Updating the full action-item array does not yet provide conflict control for concurrent edits.
- The application does not yet verify mechanically that every evidence fragment returned by the LLM exists in the transcript.
- Browser uploads do not support resumable multipart uploads.

## License

MIT
