# Roadmap

## Milestone 1 - meeting record lifecycle

- [x] browser recording and file upload
- [x] asynchronous Transcribe to Bedrock pipeline
- [x] structured summary, decisions, actions, questions
- [x] meeting list/detail and action completion
- [x] local deterministic flow
- [x] ownership partition and lifecycle policy
- [x] unit and local integration tests

## Milestone 2 - trustworthy extraction

- [x] verify every evidence fragment against normalized transcript
- [x] multilingual evidence-grounding fixtures for Korean, English, and Japanese
- [x] seed evaluation dataset for Korean, English, and Japanese meetings
- [x] precision/recall/F1 and grounded-rate measures for decisions and actions
- [ ] versioned model-output artifacts and larger reviewed evaluation dataset
- [ ] explicit retry endpoint and optimistic concurrency version
- [ ] CloudWatch metrics and alarms for latency, failures, DLQ depth

## Milestone 3 - retrieval across meetings

- [ ] full-text and metadata search
- [ ] participant and project tags
- [ ] question answering with meeting-level citations
- [ ] retention and deletion controls exposed to the user

## Milestone 4 - collaboration

- [ ] calendar metadata import
- [ ] shareable records with scoped access
- [ ] action owner notifications
- [ ] export to Markdown and task systems
