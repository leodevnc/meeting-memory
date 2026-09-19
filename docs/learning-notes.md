# Learning notes

## 2026-09-17 - from transcription to managed memory

The earlier transcription experiment proved that browser recording, S3 upload, speaker labels, and timestamp rendering could work together. The missing boundary was after transcription: a text file is still difficult to revisit and does not carry an explicit lifecycle.

The first design change was to make a meeting a durable domain object with status transitions. This made retries and duplicate events visible design concerns instead of implementation details. `READY` now means that the transcript was normalized and the model output passed an application schema.

The second change was to treat LLM analysis as an untrusted adapter. A fluent response is not enough for storage. The application asks for evidence, validates types and lengths, replaces model-selected workflow state, and avoids logging the content. Evidence is not yet verified against the transcript, which is the most important next experiment.

The local server is intentionally a fake rather than an AWS emulator. It gives fast feedback on the product flow, while CDK synth checks infrastructure structure. A deployed smoke test is still needed to validate IAM, CORS, EventBridge delivery, and the selected Bedrock inference profile.

## 2026-09-19 - evidence is a storage invariant

Requesting evidence in a prompt does not make an extraction grounded. The application now checks every decision and action-item evidence fragment before the analysis can become stored state. A mismatch rejects the complete analysis instead of silently keeping unsupported claims or returning a deceptively complete partial record.

The matcher is deliberately conservative. It normalizes Unicode compatibility characters, case, and whitespace, then requires an exact substring. This works consistently across the initial Korean, English, and Japanese fixtures without turning semantic similarity into proof. The tradeoff is availability: a model paraphrase can fail an otherwise useful analysis. Measuring that failure rate on a representative extraction dataset is the next step.

Grounding failures contain only field paths and reason codes. This keeps transcript content and rejected evidence out of logs while still making the failure diagnosable.
