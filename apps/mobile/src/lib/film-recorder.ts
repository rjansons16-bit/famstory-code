import { SLIDE_SECONDS, type Slide } from '@/domain/film';
import { colors, fontFamilies } from '@/theme/tokens';

/**
 * THE YEAR'S FILM AS A VIDEO FILE, made in the browser (domain/film.ts).
 *
 * Every slide is drawn on a canvas - the photograph filling a phone's upright
 * frame with a slow push in, its title over a dark band at the foot - and the
 * voices are mixed in underneath with the page's own audio. MediaRecorder
 * turns that into a file on this machine; nothing is uploaded to make it. It
 * ends on a card with the app's mark and name: a film that gets sent to the
 * grandparents or posted is also how other families hear of FamStory.
 *
 * film-recorder.native.ts answers "not here" on a phone for now: the same film
 * needs a native encoder, and the in-app player works there already.
 */

const WIDTH = 1080;
const HEIGHT = 1920;
const FPS = 30;
const END_CARD_SECONDS = 2.5;
/** How far a slide pushes in over its seconds. */
const PUSH_IN = 0.08;

export interface FilmLabels {
  title: string;
  tagline: string;
}

export function canRecordFilm(): boolean {
  return (
    typeof window !== 'undefined' &&
    typeof MediaRecorder !== 'undefined' &&
    typeof HTMLCanvasElement !== 'undefined' &&
    typeof HTMLCanvasElement.prototype.captureStream === 'function'
  );
}

/** The best container this browser records in: MP4 where it can, for the phones it goes to. */
function pickType(): { mimeType: string; extension: 'mp4' | 'webm' } {
  const candidates: [string, 'mp4' | 'webm'][] = [
    ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'mp4'],
    ['video/mp4', 'mp4'],
    ['video/webm;codecs=vp9,opus', 'webm'],
    ['video/webm;codecs=vp8,opus', 'webm'],
    ['video/webm', 'webm'],
  ];
  for (const [mimeType, extension] of candidates) {
    if (MediaRecorder.isTypeSupported(mimeType)) return { mimeType, extension };
  }
  return { mimeType: '', extension: 'webm' };
}

function loadImage(url: string): Promise<HTMLImageElement | null> {
  return new Promise((resolve) => {
    const image = new Image();
    // Without this a photograph from another origin taints the canvas, and a
    // tainted canvas cannot be recorded at all.
    image.crossOrigin = 'anonymous';
    image.onload = () => resolve(image);
    image.onerror = () => resolve(null);
    image.src = url;
  });
}

async function loadVoice(context: AudioContext, url: string): Promise<AudioBuffer | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    return await context.decodeAudioData(await response.arrayBuffer());
  } catch {
    return null;
  }
}

/** A photograph drawn to fill the frame, pushed in by `zoom`, cropped from the middle. */
function drawCover(ctx: CanvasRenderingContext2D, image: HTMLImageElement, zoom: number) {
  const scale = Math.max(WIDTH / image.width, HEIGHT / image.height) * zoom;
  const w = image.width * scale;
  const h = image.height * scale;
  ctx.drawImage(image, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);
}

function wrap(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const word of text.split(/\s+/)) {
    const next = line ? `${line} ${word}` : word;
    if (ctx.measureText(next).width > maxWidth && line) {
      lines.push(line);
      line = word;
    } else line = next;
  }
  if (line) lines.push(line);
  return lines.slice(0, 3);
}

/**
 * The mark on the end card: the heart of two halves and the child above it -
 * tools/brand/make-icons.mjs's own paths on its 1024 grid, drawn as they are
 * (Path2D reads SVG path data) and scaled to `width`, centred on (cx, cy).
 */
const MARK = {
  left: 'M 502 884.53 L 243.3 625.82 A 190 190 0 0 1 502 347.82 Z',
  right: 'M 522 884.53 L 780.7 625.82 A 190 190 0 0 0 522 347.82 Z',
  child: { cx: 512, cy: 193.47, r: 64 },
  box: { x: 187.65, y: 129.47, w: 648.7, h: 765.06 },
} as const;

function drawMark(ctx: CanvasRenderingContext2D, cx: number, cy: number, width: number) {
  const s = width / MARK.box.w;
  const palette = colors.light;
  ctx.save();
  ctx.translate(cx - (MARK.box.x + MARK.box.w / 2) * s, cy - (MARK.box.y + MARK.box.h / 2) * s);
  ctx.scale(s, s);
  // On the green: one half in Paper, the other in Jade, the child in Paper.
  ctx.fillStyle = palette.background;
  ctx.fill(new Path2D(MARK.left));
  ctx.beginPath();
  ctx.arc(MARK.child.cx, MARK.child.cy, MARK.child.r, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = palette.accent;
  ctx.fill(new Path2D(MARK.right));
  ctx.restore();
}

export async function recordFilm(
  slides: Slide[],
  labels: FilmLabels,
  onProgress?: (fraction: number) => void,
): Promise<{ blob: Blob; extension: 'mp4' | 'webm'; mimeType: string }> {
  const images = await Promise.all(slides.map((s) => loadImage(s.photoUrl)));
  const frames = slides
    .map((slide, i) => ({ slide, image: images[i] }))
    .filter((f): f is { slide: Slide; image: HTMLImageElement } => f.image !== null);

  const canvas = document.createElement('canvas');
  canvas.width = WIDTH;
  canvas.height = HEIGHT;
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;

  const audio = new AudioContext();
  const mix = audio.createMediaStreamDestination();
  const voices = await Promise.all(
    frames.map((f) => (f.slide.voiceUrl ? loadVoice(audio, f.slide.voiceUrl) : Promise.resolve(null))),
  );

  const stream = canvas.captureStream(FPS);
  for (const track of mix.stream.getAudioTracks()) stream.addTrack(track);

  const type = pickType();
  const recorder = new MediaRecorder(stream, type.mimeType ? { mimeType: type.mimeType } : undefined);
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };
  const stopped = new Promise<void>((resolve) => {
    recorder.onstop = () => resolve();
  });

  const total = frames.length * SLIDE_SECONDS + END_CARD_SECONDS;
  const palette = colors.light;
  const serif = `${fontFamilies.displaySerif}, Georgia, serif`;
  const sans = `${fontFamilies.uiSemi}, Inter, system-ui, sans-serif`;

  recorder.start(250);
  await audio.resume();
  const began = audio.currentTime;
  // Each voice under its own slide, cut at the slide's end.
  voices.forEach((buffer, i) => {
    if (!buffer) return;
    const source = audio.createBufferSource();
    source.buffer = buffer;
    source.connect(mix);
    source.start(began + i * SLIDE_SECONDS, 0, SLIDE_SECONDS);
  });

  await new Promise<void>((resolve) => {
    const startedAt = performance.now();
    const frame = () => {
      const t = (performance.now() - startedAt) / 1000;
      onProgress?.(Math.min(1, t / total));
      const index = Math.floor(t / SLIDE_SECONDS);

      ctx.fillStyle = palette.text;
      ctx.fillRect(0, 0, WIDTH, HEIGHT);

      if (index < frames.length) {
        const within = (t - index * SLIDE_SECONDS) / SLIDE_SECONDS;
        const { slide, image } = frames[index];
        ctx.globalAlpha = Math.min(1, within * 6);
        drawCover(ctx, image, 1 + PUSH_IN * within);
        ctx.globalAlpha = 1;

        const band = ctx.createLinearGradient(0, HEIGHT * 0.6, 0, HEIGHT);
        band.addColorStop(0, 'rgba(0,0,0,0)');
        band.addColorStop(1, 'rgba(0,0,0,0.72)');
        ctx.fillStyle = band;
        ctx.fillRect(0, HEIGHT * 0.6, WIDTH, HEIGHT * 0.4);

        ctx.fillStyle = palette.background;
        ctx.font = `600 64px ${serif}`;
        const lines = wrap(ctx, slide.title, WIDTH - 160);
        lines.forEach((line, i) => ctx.fillText(line, 80, HEIGHT - 260 + i * 76 - (lines.length - 1) * 76));
        ctx.font = `500 36px ${sans}`;
        ctx.fillStyle = 'rgba(244,241,234,0.8)';
        ctx.fillText(new Date(slide.startsAt).toLocaleDateString(), 80, HEIGHT - 150);
      } else if (t < total) {
        // The end card, on the brand's green.
        ctx.fillStyle = palette.primary;
        ctx.fillRect(0, 0, WIDTH, HEIGHT);
        drawMark(ctx, WIDTH / 2, HEIGHT / 2 - 230, 240);
        ctx.fillStyle = palette.background;
        ctx.textAlign = 'center';
        ctx.font = `600 120px ${serif}`;
        ctx.fillText('FamStory', WIDTH / 2, HEIGHT / 2 + 80);
        ctx.font = `500 48px ${sans}`;
        ctx.fillText(labels.title, WIDTH / 2, HEIGHT / 2 + 180);
        ctx.font = `400 40px ${sans}`;
        ctx.fillStyle = 'rgba(244,241,234,0.8)';
        ctx.fillText(labels.tagline, WIDTH / 2, HEIGHT / 2 + 260);
        ctx.textAlign = 'start';
      }

      if (t >= total) {
        resolve();
        return;
      }
      requestAnimationFrame(frame);
    };
    requestAnimationFrame(frame);
  });

  recorder.stop();
  await stopped;
  await audio.close();

  const mimeType = recorder.mimeType || type.mimeType || 'video/webm';
  return { blob: new Blob(chunks, { type: mimeType }), extension: type.extension, mimeType };
}
