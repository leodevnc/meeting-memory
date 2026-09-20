import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { evaluateExtractionDataset } from '../src/evals/extraction.js';

const datasetPath = resolve(process.argv[2] ?? 'evals/extraction-golden.json');
const dataset = JSON.parse(await readFile(datasetPath, 'utf8')) as unknown;
const report = evaluateExtractionDataset(dataset);

console.log(`Dataset: ${datasetPath}`);
console.log(`Cases: ${report.cases}`);
printMetrics('Overall', report.overall);
printMetrics('Decisions', report.decisions);
printMetrics('Action items', report.actionItems);
console.log(`Grounded predictions: ${report.overall.groundedPredictions}/${report.overall.predictions} (${percent(report.overall.groundedRate)})`);
for (const language of ['en', 'ko', 'ja'] as const) {
  const metrics = report.byLanguage[language];
  console.log(`${language}: precision=${percent(metrics.precision)} recall=${percent(metrics.recall)} grounded=${percent(metrics.groundedRate)}`);
}

const thresholds = { precision: 0.8, recall: 0.8, groundedRate: 0.8 };
const failures = [
  ['precision', report.overall.precision, thresholds.precision],
  ['recall', report.overall.recall, thresholds.recall],
  ['groundedRate', report.overall.groundedRate, thresholds.groundedRate],
] as const;
const missed = failures.filter(([, actual, minimum]) => actual < minimum);
if (missed.length) {
  for (const [metric, actual, minimum] of missed) console.error(`Threshold failed: ${metric}=${percent(actual)} minimum=${percent(minimum)}`);
  process.exitCode = 1;
}

function printMetrics(label: string, metrics: { truePositives: number; falsePositives: number; falseNegatives: number; precision: number; recall: number; f1: number }): void {
  console.log(`${label}: TP=${metrics.truePositives} FP=${metrics.falsePositives} FN=${metrics.falseNegatives} precision=${percent(metrics.precision)} recall=${percent(metrics.recall)} F1=${percent(metrics.f1)}`);
}

function percent(value: number): string {
  return `${(value * 100).toFixed(1)}%`;
}
