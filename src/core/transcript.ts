interface TranscriptItem {
  readonly start_time?: string;
  readonly alternatives?: ReadonlyArray<{ readonly content?: string }>;
  readonly type?: string;
  readonly speaker_label?: string;
}

interface TranscriptDocument {
  readonly results?: {
    readonly transcripts?: ReadonlyArray<{ readonly transcript?: string }>;
    readonly items?: ReadonlyArray<TranscriptItem>;
  };
}

export interface SpeakerTurn {
  readonly speaker: string;
  readonly startSeconds: number;
  readonly text: string;
}

export function parseTranscript(document: TranscriptDocument): { text: string; turns: SpeakerTurn[] } {
  const items = document.results?.items ?? [];
  const turns: Array<{ speaker: string; startSeconds: number; tokens: string[] }> = [];
  for (const item of items) {
    const content = item.alternatives?.[0]?.content;
    if (!content) continue;
    const speaker = item.speaker_label ?? turns.at(-1)?.speaker ?? 'speaker_unknown';
    const current = turns.at(-1);
    if (!current || (item.type !== 'punctuation' && current.speaker !== speaker)) {
      turns.push({ speaker, startSeconds: Number(item.start_time ?? current?.startSeconds ?? 0), tokens: [content] });
    } else {
      current.tokens.push(content);
    }
  }
  const normalized = turns.map((turn) => ({
    speaker: turn.speaker,
    startSeconds: turn.startSeconds,
    text: turn.tokens.join(' ').replace(/\s+([,.!?])/g, '$1'),
  }));
  const fallback = document.results?.transcripts?.[0]?.transcript?.trim() ?? '';
  return {
    text: normalized.length ? normalized.map((turn) => `[${formatTime(turn.startSeconds)}] ${turn.speaker}: ${turn.text}`).join('\n') : fallback,
    turns: normalized,
  };
}

function formatTime(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  return `${String(minutes).padStart(2, '0')}:${String(Math.floor(seconds % 60)).padStart(2, '0')}`;
}
