import { z } from 'zod';
import { normalizeForGrounding } from '../core/analysis.js';

const goldClaimSchema = z.object({
  id: z.string().min(1),
  acceptedEvidence: z.array(z.string().trim().min(1)).min(1),
});

const predictedClaimSchema = z.object({
  text: z.string().min(1),
  evidence: z.string().trim().min(1),
});

export const extractionEvalCaseSchema = z.object({
  id: z.string().min(1),
  language: z.enum(['en', 'ko', 'ja']),
  transcript: z.string().min(1),
  expected: z.object({ decisions: z.array(goldClaimSchema), actionItems: z.array(goldClaimSchema) }),
  predicted: z.object({ decisions: z.array(predictedClaimSchema), actionItems: z.array(predictedClaimSchema) }),
});

export const extractionEvalDatasetSchema = z.object({ version: z.literal(1), cases: z.array(extractionEvalCaseSchema).min(1) });
export type ExtractionEvalCase = z.infer<typeof extractionEvalCaseSchema>;
export type ExtractionEvalDataset = z.infer<typeof extractionEvalDatasetSchema>;

export interface ClaimMetrics {
  readonly truePositives: number;
  readonly falsePositives: number;
  readonly falseNegatives: number;
  readonly precision: number;
  readonly recall: number;
  readonly f1: number;
}

export interface EvaluationMetrics extends ClaimMetrics {
  readonly predictions: number;
  readonly groundedPredictions: number;
  readonly ungroundedPredictions: number;
  readonly groundedRate: number;
}

export interface EvaluationReport {
  readonly cases: number;
  readonly overall: EvaluationMetrics;
  readonly decisions: ClaimMetrics;
  readonly actionItems: ClaimMetrics;
  readonly byLanguage: Readonly<Record<'en' | 'ko' | 'ja', EvaluationMetrics>>;
}

interface Counts {
  truePositives: number;
  falsePositives: number;
  falseNegatives: number;
  predictions: number;
  groundedPredictions: number;
}

export function evaluateExtractionDataset(input: unknown): EvaluationReport {
  const dataset = extractionEvalDatasetSchema.parse(input);
  validateGoldDataset(dataset);
  const decisionCounts = emptyCounts();
  const actionCounts = emptyCounts();
  const languageCounts = { en: emptyCounts(), ko: emptyCounts(), ja: emptyCounts() };

  for (const evalCase of dataset.cases) {
    const decisions = scoreClaims(evalCase.expected.decisions, evalCase.predicted.decisions, evalCase.transcript);
    const actions = scoreClaims(evalCase.expected.actionItems, evalCase.predicted.actionItems, evalCase.transcript);
    addCounts(decisionCounts, decisions);
    addCounts(actionCounts, actions);
    addCounts(languageCounts[evalCase.language], decisions);
    addCounts(languageCounts[evalCase.language], actions);
  }

  const overallCounts = emptyCounts();
  addCounts(overallCounts, decisionCounts);
  addCounts(overallCounts, actionCounts);
  return {
    cases: dataset.cases.length,
    overall: toEvaluationMetrics(overallCounts),
    decisions: toClaimMetrics(decisionCounts),
    actionItems: toClaimMetrics(actionCounts),
    byLanguage: { en: toEvaluationMetrics(languageCounts.en), ko: toEvaluationMetrics(languageCounts.ko), ja: toEvaluationMetrics(languageCounts.ja) },
  };
}

function validateGoldDataset(dataset: ExtractionEvalDataset): void {
  const caseIds = new Set<string>();
  dataset.cases.forEach((evalCase, caseIndex) => {
    if (caseIds.has(evalCase.id)) throw new Error(`Duplicate evaluation case id at cases.${caseIndex}.id`);
    caseIds.add(evalCase.id);
    validateGoldClaims(evalCase.expected.decisions, evalCase.transcript, `cases.${caseIndex}.expected.decisions`);
    validateGoldClaims(evalCase.expected.actionItems, evalCase.transcript, `cases.${caseIndex}.expected.actionItems`);
  });
}

function validateGoldClaims(claims: ExtractionEvalCase['expected']['decisions'], transcript: string, path: string): void {
  const normalizedTranscript = normalizeForGrounding(transcript);
  const ids = new Set<string>();
  const evidenceOwners = new Map<string, string>();
  claims.forEach((claim, claimIndex) => {
    if (ids.has(claim.id)) throw new Error(`Duplicate gold claim id at ${path}.${claimIndex}.id`);
    ids.add(claim.id);
    claim.acceptedEvidence.forEach((evidence, evidenceIndex) => {
      const normalizedEvidence = normalizeForGrounding(evidence);
      if (!normalizedTranscript.includes(normalizedEvidence)) {
        throw new Error(`Gold evidence is not grounded at ${path}.${claimIndex}.acceptedEvidence.${evidenceIndex}`);
      }
      const owner = evidenceOwners.get(normalizedEvidence);
      if (owner && owner !== claim.id) throw new Error(`Ambiguous gold evidence at ${path}.${claimIndex}.acceptedEvidence.${evidenceIndex}`);
      evidenceOwners.set(normalizedEvidence, claim.id);
    });
  });
}

function scoreClaims(goldClaims: ExtractionEvalCase['expected']['decisions'], predictions: ExtractionEvalCase['predicted']['decisions'], transcript: string): Counts {
  const normalizedTranscript = normalizeForGrounding(transcript);
  const unmatchedGold = new Set(goldClaims.map((_, index) => index));
  let truePositives = 0;
  let groundedPredictions = 0;
  for (const prediction of predictions) {
    const evidence = normalizeForGrounding(prediction.evidence);
    const grounded = normalizedTranscript.includes(evidence);
    if (grounded) groundedPredictions += 1;
    if (!grounded) continue;
    const match = [...unmatchedGold].find((goldIndex) => goldClaims[goldIndex]?.acceptedEvidence.some((accepted) => normalizeForGrounding(accepted) === evidence));
    if (match !== undefined) {
      unmatchedGold.delete(match);
      truePositives += 1;
    }
  }
  return { truePositives, falsePositives: predictions.length - truePositives, falseNegatives: goldClaims.length - truePositives, predictions: predictions.length, groundedPredictions };
}

function emptyCounts(): Counts {
  return { truePositives: 0, falsePositives: 0, falseNegatives: 0, predictions: 0, groundedPredictions: 0 };
}

function addCounts(target: Counts, source: Counts): void {
  target.truePositives += source.truePositives;
  target.falsePositives += source.falsePositives;
  target.falseNegatives += source.falseNegatives;
  target.predictions += source.predictions;
  target.groundedPredictions += source.groundedPredictions;
}

function toClaimMetrics(counts: Counts): ClaimMetrics {
  const precision = divide(counts.truePositives, counts.truePositives + counts.falsePositives);
  const recall = divide(counts.truePositives, counts.truePositives + counts.falseNegatives);
  return { truePositives: counts.truePositives, falsePositives: counts.falsePositives, falseNegatives: counts.falseNegatives, precision, recall, f1: precision + recall === 0 ? 0 : (2 * precision * recall) / (precision + recall) };
}

function toEvaluationMetrics(counts: Counts): EvaluationMetrics {
  return { ...toClaimMetrics(counts), predictions: counts.predictions, groundedPredictions: counts.groundedPredictions, ungroundedPredictions: counts.predictions - counts.groundedPredictions, groundedRate: divide(counts.groundedPredictions, counts.predictions) };
}

function divide(numerator: number, denominator: number): number {
  return denominator === 0 ? 0 : numerator / denominator;
}
