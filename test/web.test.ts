import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('interface templates and messages use English defaults', async () => {
  for (const file of ['index.html', 'callback.html', 'app.js', 'recorder.js']) {
    const source = await readFile(new URL('../web/' + file, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /[가-힣]/u, file);
    if (file.endsWith('.html')) assert.match(source, /lang="en"/, file);
  }
  const html = await readFile(new URL('../web/index.html', import.meta.url), 'utf8');
  assert.match(html, /value="auto">Auto-detect/);
  assert.match(html, /value="ko-KR">Korean/);
  assert.match(html, /value="ja-JP">Japanese/);
});

test('web application escapes meeting content before rendering',async()=>{const code=await readFile(new URL('../web/app.js',import.meta.url),'utf8');assert.match(code,/escapeHtml/);assert.doesNotMatch(code,/innerHTML\s*=\s*m\.transcript/)});
