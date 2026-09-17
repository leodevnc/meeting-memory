import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createLocalServer } from '../scripts/local-server.js';

test('local flow creates, uploads, processes and updates an action item', async (t) => {
  const server=createLocalServer().listen(0,'127.0.0.1'); await once(server,'listening'); t.after(()=>server.close());
  const address=server.address(); if(!address||typeof address==='string') throw new Error('No server address'); const base=`http://127.0.0.1:${address.port}/api`;
  const created=await fetch(`${base}/meetings`,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({fileName:'sample.webm',contentType:'audio/webm',fileSize:10,languageCode:'ko-KR',speakerCount:2})}).then(r=>r.json());
  assert.equal(created.status,'UPLOAD_PENDING');
  assert.equal((await fetch(`http://127.0.0.1:${address.port}${created.upload.url}`,{method:'POST',body:'audio'})).status,204);
  await fetch(`${base}/meetings/${created.meetingId}/start`,{method:'POST'}); await new Promise(resolve=>setTimeout(resolve,180));
  const meeting=await fetch(`${base}/meetings/${created.meetingId}`).then(r=>r.json()); assert.equal(meeting.status,'READY'); assert.ok(meeting.analysis.actionItems.length>0);
  const action=meeting.analysis.actionItems[0]; const updated=await fetch(`${base}/meetings/${created.meetingId}/actions/${action.id}`,{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({status:'DONE'})}).then(r=>r.json());
  assert.equal(updated.analysis.actionItems[0].status,'DONE');
});
