import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { evaluateExtractionDataset } from '../src/evals/extraction.js';

test('scores the multilingual golden dataset reproducibly', async () => {
  const dataset = JSON.parse(await readFile(new URL('../evals/extraction-golden.json', import.meta.url), 'utf8')) as unknown;
  const report = evaluateExtractionDataset(dataset);
  assert.equal(report.cases, 3);
  assert.deepEqual(
    { truePositives: report.overall.truePositives, falsePositives: report.overall.falsePositives, falseNegatives: report.overall.falseNegatives, groundedPredictions: report.overall.groundedPredictions, ungroundedPredictions: report.overall.ungroundedPredictions },
    { truePositives: 5, falsePositives: 1, falseNegatives: 1, groundedPredictions: 5, ungroundedPredictions: 1 },
  );
  assert.equal(report.overall.precision, 5 / 6);
  assert.equal(report.overall.recall, 5 / 6);
  assert.equal(report.overall.f1, 5 / 6);
  assert.equal(report.byLanguage.ja.f1, 1);
});

test('matches each gold claim at most once', () => {
  const report = evaluateExtractionDataset({ version: 1, cases: [{ id: 'duplicate-prediction', language: 'en', transcript: 'We will ship on Friday.', expected: { decisions: [{ id: 'ship', acceptedEvidence: ['We will ship on Friday.'] }], actionItems: [] }, predicted: { decisions: [{ text: 'Ship Friday', evidence: 'We will ship on Friday.' }, { text: 'Duplicate', evidence: 'We will ship on Friday.' }], actionItems: [] } }] });
  assert.equal(report.overall.truePositives, 1);
  assert.equal(report.overall.falsePositives, 1);
  assert.equal(report.overall.falseNegatives, 0);
});

test('rejects an invalid golden reference before scoring', () => {
  assert.throws(
    () => evaluateExtractionDataset({ version: 1, cases: [{ id: 'invalid-gold', language: 'en', transcript: 'Nothing was decided.', expected: { decisions: [{ id: 'invented', acceptedEvidence: ['Ship tomorrow.'] }], actionItems: [] }, predicted: { decisions: [], actionItems: [] } }] }),
    /Gold evidence is not grounded at cases\.0\.expected\.decisions\.0\.acceptedEvidence\.0/,
  );
});

test('rejects ambiguous evidence shared by two golden claims of one type', () => {
  assert.throws(
    () => evaluateExtractionDataset({ version: 1, cases: [{ id: 'ambiguous-gold', language: 'en', transcript: 'We agreed to ship.', expected: { decisions: [{ id: 'first', acceptedEvidence: ['We agreed to ship.'] }, { id: 'second', acceptedEvidence: ['We agreed to ship.'] }], actionItems: [] }, predicted: { decisions: [], actionItems: [] } }] }),
    /Ambiguous gold evidence at cases\.0\.expected\.decisions\.1\.acceptedEvidence\.0/,
  );
});

test('returns zero metrics for a language without claims', () => {
  const report = evaluateExtractionDataset({ version: 1, cases: [{ id: 'empty-ja', language: 'ja', transcript: '決定事項はありません。', expected: { decisions: [], actionItems: [] }, predicted: { decisions: [], actionItems: [] } }] });
  assert.equal(report.overall.precision, 0);
  assert.equal(report.overall.recall, 0);
  assert.equal(report.overall.f1, 0);
  assert.equal(report.overall.groundedRate, 0);
});
