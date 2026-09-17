import test from 'node:test';
import assert from 'node:assert/strict';
import { parseTranscript } from '../src/core/transcript.js';

test('groups AWS transcript tokens into timestamped speaker turns', () => {
  const result = parseTranscript({ results:{ items:[
    {start_time:'0.0',speaker_label:'spk_0',type:'pronunciation',alternatives:[{content:'Hello'}]},
    {speaker_label:'spk_0',type:'punctuation',alternatives:[{content:','}]},
    {start_time:'2.0',speaker_label:'spk_1',type:'pronunciation',alternatives:[{content:'world'}]},
  ]}});
  assert.equal(result.text, '[00:00] spk_0: Hello,\n[00:02] spk_1: world');
  assert.equal(result.turns.length, 2);
});

test('falls back to plain transcript when item timing is absent', () => {
  assert.equal(parseTranscript({results:{transcripts:[{transcript:'plain text'}]}}).text,'plain text');
});
