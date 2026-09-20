# Offline extraction evaluations

## Purpose

The evaluation harness answers two separate questions:

1. Did the extraction recover the decisions and action items in the golden record?
2. Is each predicted claim grounded in the meeting transcript?

It runs entirely against checked-in JSON and does not invoke a model or a cloud service.

## Dataset contract

Each case contains a language, normalized transcript, golden decisions and action items, and a candidate prediction. A golden claim has a stable ID and one or more accepted verbatim evidence fragments. Candidate text may be paraphrased, but its evidence must exactly match one accepted fragment after the same Unicode, case, and whitespace normalization used by the application.

The loader rejects duplicate case IDs, duplicate claim IDs within one claim type, ambiguous evidence shared by two golden claims of the same type, and golden evidence absent from the source transcript. This prevents an invalid reference dataset from silently producing misleading metrics.

## Matching and metrics

Matching is performed independently for decisions and action items. A candidate can match at most one golden claim, and a golden claim can be consumed at most once.

- True positive: a grounded prediction whose evidence matches an unmatched accepted evidence fragment.
- False positive: an unsupported, duplicate, or otherwise unmatched prediction.
- False negative: a golden claim left unmatched.
- Grounded rate: grounded predictions divided by all predictions, independent of whether they match the golden record.

Precision, recall, and F1 use the standard claim-level formulas. An empty denominator returns zero rather than an undefined or perfect score.

## Seed baseline

The initial dataset contains one English, one Korean, and one Japanese meeting with six golden claims in total. Candidate predictions deliberately include one unsupported English decision and omit one Korean decision.

| Metric | Result |
|---|---:|
| True positives | 5 |
| False positives | 1 |
| False negatives | 1 |
| Precision | 83.3% |
| Recall | 83.3% |
| F1 | 83.3% |
| Grounded rate | 83.3% |

CI requires overall precision, recall, and grounded rate of at least 80%. The threshold is a regression guard for this seed dataset, not a production quality target.

## Limitations

- The dataset is intentionally small and synthetic.
- Checked-in predictions exercise evaluator behavior; they do not measure a live model.
- Evidence equality is conservative and can count a valid longer or shorter quotation as unmatched unless it is listed in `acceptedEvidence`.
- The harness measures decision and action extraction, not summary quality, speaker attribution, owner resolution, or due-date accuracy.
- Dataset review by more than one annotator and inter-annotator agreement are not yet implemented.

The next evaluation step is to separate golden records from model-produced candidate artifacts, add more varied meetings, and report results by language and failure category over multiple model and prompt versions.
