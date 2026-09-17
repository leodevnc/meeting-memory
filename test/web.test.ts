import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

test('web application escapes meeting content before rendering',async()=>{const code=await readFile(new URL('../web/app.js',import.meta.url),'utf8');assert.match(code,/escapeHtml/);assert.doesNotMatch(code,/innerHTML\s*=\s*m\.transcript/)});
