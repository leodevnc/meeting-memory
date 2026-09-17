import { createServer, type IncomingMessage, type ServerResponse } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { mockAnalysis } from '../src/core/analysis.js';
import type { Meeting } from '../src/core/model.js';

const port = Number(process.env.PORT ?? 4173);
const root = new URL('../web/', import.meta.url).pathname;
const meetings = new Map<string, Meeting>();
const sample = `[00:00] speaker_0: 오늘은 회의 기록 자동화의 첫 범위를 결정하겠습니다.
[00:07] speaker_1: 우선 녹음, 전사, 요약, 결정사항과 액션아이템 관리까지 구현하기로 합의했습니다.
[00:18] speaker_0: 다음 주 금요일까지 민수가 검색 설계를 검토해야 합니다.
[00:27] speaker_1: 캘린더 연동은 다음 단계에서 다루면 어떨까요?`;

export function createLocalServer() {
  return createServer(async (request, response) => {
    try {
      const url = new URL(request.url ?? '/', `http://${request.headers.host}`);
      if (url.pathname === '/config.json') return json(response, 200, { mode: 'local', apiUrl: '/api' });
      if (url.pathname.startsWith('/api/')) return await routeApi(request, response, url);
      return await serveStatic(response, url.pathname);
    } catch (error) { return json(response, 500, { error: error instanceof Error ? error.message : 'Unknown error' }); }
  });
}

async function routeApi(request: IncomingMessage, response: ServerResponse, url: URL) {
  if (request.method === 'POST' && url.pathname.startsWith('/api/local-upload/')) { await consume(request); response.writeHead(204); return response.end(); }
  if (request.method === 'POST' && url.pathname === '/api/meetings') {
    const input = JSON.parse((await consume(request)).toString()) as { fileName: string; contentType: string; languageCode: Meeting['languageCode']; speakerCount: number };
    const meetingId = randomUUID(); const now = new Date().toISOString();
    meetings.set(meetingId, { ownerId: 'local-user', meetingId, createdAt: now, updatedAt: now, status: 'UPLOAD_PENDING', sourceKey: `local/${meetingId}`, fileName: input.fileName, mediaFormat: input.contentType, languageCode: input.languageCode, speakerCount: input.speakerCount });
    return json(response, 201, { meetingId, status: 'UPLOAD_PENDING', upload: { url: `/api/local-upload/${meetingId}`, fields: {} } });
  }
  const start = url.pathname.match(/^\/api\/meetings\/([^/]+)\/start$/);
  if (request.method === 'POST' && start) {
    const meeting = meetings.get(start[1] ?? ''); if (!meeting) return json(response, 404, { error: 'Meeting not found' });
    meetings.set(meeting.meetingId, { ...meeting, status: 'TRANSCRIBING', updatedAt: new Date().toISOString() });
    setTimeout(() => { const current = meetings.get(meeting.meetingId); if (current) meetings.set(meeting.meetingId, { ...current, status: 'READY', updatedAt: new Date().toISOString(), transcript: sample, analysis: mockAnalysis(sample) }); }, 120);
    return json(response, 202, { meetingId: meeting.meetingId, status: 'TRANSCRIBING' });
  }
  if (request.method === 'GET' && url.pathname === '/api/meetings') return json(response, 200, { meetings: [...meetings.values()].sort((a,b)=>b.createdAt.localeCompare(a.createdAt)) });
  const action = url.pathname.match(/^\/api\/meetings\/([^/]+)\/actions\/([^/]+)$/);
  if (request.method === 'PATCH' && action) {
    const meeting = meetings.get(action[1] ?? ''); const input = JSON.parse((await consume(request)).toString()) as { status: 'OPEN'|'DONE' };
    if (!meeting?.analysis) return json(response, 409, { error: 'Analysis not ready' });
    const analysis = { ...meeting.analysis, actionItems: meeting.analysis.actionItems.map((item) => item.id === action[2] ? { ...item, status: input.status } : item) };
    const next = { ...meeting, analysis, updatedAt: new Date().toISOString() }; meetings.set(meeting.meetingId, next); return json(response, 200, next);
  }
  const detail = url.pathname.match(/^\/api\/meetings\/([^/]+)$/);
  if (request.method === 'GET' && detail) { const meeting=meetings.get(detail[1]??''); return meeting?json(response,200,meeting):json(response,404,{error:'Meeting not found'}); }
  return json(response, 404, { error: 'Route not found' });
}

async function serveStatic(response: ServerResponse, pathName: string) {
  const safe = pathName === '/' ? 'index.html' : pathName.replace(/^\//, ''); if (safe.includes('..')) return json(response, 400, { error: 'Bad path' });
  try { const body = await readFile(join(root, safe)); const types: Record<string,string>={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8'}; response.writeHead(200,{'content-type':types[extname(safe)]??'application/octet-stream','permissions-policy':'microphone=(self)'}); response.end(body); } catch { json(response,404,{error:'Not found'}); }
}
async function consume(request: IncomingMessage): Promise<Buffer> { const parts: Buffer[]=[]; for await(const part of request) parts.push(Buffer.from(part)); return Buffer.concat(parts); }
function json(response: ServerResponse,status:number,body:unknown){response.writeHead(status,{'content-type':'application/json; charset=utf-8','cache-control':'no-store'});response.end(JSON.stringify(body));}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) createLocalServer().listen(port, '127.0.0.1', () => console.log(`Meeting Memory: http://127.0.0.1:${port}`));
