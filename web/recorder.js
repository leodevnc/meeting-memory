export const MAX_RECORDING_BYTES = 500 * 1024 * 1024;
export const RECORDING_TYPES = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'];

export function preferredMime(supported) { return RECORDING_TYPES.find(supported) || ''; }
export function extensionFor(mime) { return mime.includes('mp4') ? 'm4a' : 'webm'; }

export class Recorder {
  constructor(onReady, onTick) { this.onReady = onReady; this.onTick = onTick; this.parts = []; this.startedAt = 0; this.timer = null; }
  async start() {
    if (!navigator.mediaDevices?.getUserMedia || !globalThis.MediaRecorder) throw new Error('이 브라우저에서는 녹음을 사용할 수 없습니다.');
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
    const mime = preferredMime((type) => MediaRecorder.isTypeSupported(type));
    this.media = mime ? new MediaRecorder(this.stream, { mimeType: mime }) : new MediaRecorder(this.stream);
    this.parts = []; this.startedAt = Date.now();
    this.media.ondataavailable = (event) => { if (event.data.size) this.parts.push(event.data); };
    this.media.onstop = () => { const blob = new Blob(this.parts, { type: this.media.mimeType }); this.cleanup(); this.onReady(blob, extensionFor(blob.type)); };
    this.media.start(1000); this.timer = setInterval(() => this.onTick(Math.floor((Date.now() - this.startedAt) / 1000)), 250);
  }
  stop() { if (this.media?.state !== 'inactive') this.media.stop(); }
  cleanup() { clearInterval(this.timer); this.stream?.getTracks().forEach((track) => track.stop()); }
}
