import { BedrockRuntimeClient, ConverseCommand } from '@aws-sdk/client-bedrock-runtime';
import { ANALYSIS_SYSTEM_PROMPT, buildAnalysisPrompt, parseAnalysis } from '../core/analysis.js';
import type { MeetingAnalysis } from '../core/model.js';

const client = new BedrockRuntimeClient({ maxAttempts: 5, retryMode: 'adaptive' });

export async function analyzeWithBedrock(transcript: string): Promise<MeetingAnalysis> {
  const modelId = process.env.BEDROCK_MODEL_ID;
  if (!modelId) throw new Error('BEDROCK_MODEL_ID is required');
  const response = await client.send(new ConverseCommand({
    modelId,
    system: [{ text: ANALYSIS_SYSTEM_PROMPT }],
    messages: [{ role: 'user', content: [{ text: buildAnalysisPrompt(transcript) }] }],
    inferenceConfig: { maxTokens: 2400, temperature: 0 },
    requestMetadata: { workload: 'meeting-analysis', schema: 'v1' },
  }));
  const text = response.output?.message?.content?.find((block) => block.text)?.text;
  if (!text) throw new Error(`Bedrock returned no text output: ${response.stopReason ?? 'unknown'}`);
  return parseAnalysis(text, transcript);
}
