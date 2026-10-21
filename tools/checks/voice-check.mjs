// Voice notes and dictation on the demo, with a microphone that speaks: Edge
// is given a recorded sentence as its microphone (Windows' own voice saying
// "Today the whole family went to the seaside..."). A voice note is recorded
// and played back; then the title is dictated, and what came back is shown.
import { outDir } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = outDir();
const WAV = process.env.FAMSTORY_VOICE_WAV ?? path.join(OUT, 'voice-sample.wav');
const BASE = process.argv[2] ?? 'http://localhost:8090';
const HEADLESS = process.argv[3] !== 'headed';
const port = 9367;
const profile = mkdtempSync(path.join(tmpdir(), 'famstory-voice-'));
const args = [
  `--remote-debugging-port=${port}`,
  `--user-data-dir=${profile}`,
  '--no-first-run',
  '--use-fake-ui-for-media-stream',
  '--use-fake-device-for-media-stream',
  `--use-file-for-fake-audio-capture=${WAV}`,
  '--autoplay-policy=no-user-gesture-required',
  'about:blank',
];
if (HEADLESS) args.unshift('--headless=new');
spawn(EDGE, args);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let targets = null;
for (let i = 0; i < 60 && !targets; i++) {
  try {
    targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  } catch {
    await sleep(250);
  }
}
const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
await new Promise((r) => ws.addEventListener('open', r));
let seq = 0;
const pending = new Map();
const events = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Page.javascriptDialogOpening') {
    console.log('   dialog:', msg.params.type, JSON.stringify(msg.params.message.slice(0, 120)));
    ws.send(JSON.stringify({ id: ++seq, method: 'Page.handleJavaScriptDialog', params: { accept: true } }));
  }
  events.push(msg);
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++seq;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => {
  const res = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (res.result?.exceptionDetails) return 'EVAL ERROR ' + JSON.stringify(res.result.exceptionDetails).slice(0, 200);
  return res.result?.result?.value;
};
async function click(point) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
}
const textAt = (text, nth = 0) =>
  evaluate(`(() => { const all = [...document.querySelectorAll('*')].filter((n) => n.textContent.trim() === ${JSON.stringify(text)} && n.getBoundingClientRect().width > 0); const el = all.filter((n) => ![...n.children].some((c) => all.includes(c)))[${nth}]; if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
async function press(text, nth = 0) {
  for (let t = 0; t < 12000; t += 250) {
    const at = await textAt(text, nth);
    if (at) {
      await sleep(150);
      await click(await textAt(text, nth));
      return true;
    }
    await sleep(250);
  }
  console.log(`   (no "${text}")`);
  return false;
}
const seen = (pattern) => evaluate(`(() => { const m = document.body.innerText.match(${pattern}); return m ? m[0] : null; })()`);

await send('Page.enable');
await send('Runtime.enable');
// Every event the browser's speech recognition gives, kept for the report.
await send('Page.addScriptToEvaluateOnNewDocument', { source: `(() => {
  const Original = window.webkitSpeechRecognition || window.SpeechRecognition;
  if (!Original) return;
  window.__speechLog = [];
  const Wrapped = function () {
    const r = new Original();
    for (const type of ['start', 'audiostart', 'soundstart', 'speechstart', 'speechend', 'soundend', 'audioend', 'result', 'nomatch', 'error', 'end']) {
      r.addEventListener(type, (e) => window.__speechLog.push(type + (e.error ? ':' + e.error : '') + (e.results ? ':' + Array.from(e.results).map((x) => (x.isFinal ? 'F' : 'i') + '[' + x[0].transcript + ']').join('|') : '') + ' @' + Math.round(performance.now() / 100) / 10));
    }
    return r;
  };
  Wrapped.prototype = Original.prototype;
  window.webkitSpeechRecognition = Wrapped;
  if (window.SpeechRecognition) window.SpeechRecognition = Wrapped;
})();` });
await send('Emulation.setDeviceMetricsOverride', { width: 420, height: 900, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${BASE}/robots.txt` });
await sleep(400);
await evaluate(`localStorage.setItem('famstory.locale', JSON.stringify({ locale: 'en' })); localStorage.removeItem('famstory.dictation.noticeSeen'); 'ok'`);
await send('Page.navigate', { url: `${BASE}/?source=installed` });
await sleep(3000);
await press('Sign in');
await sleep(2500);
await send('Page.navigate', { url: `${BASE}/event/new` });
await sleep(3500);
console.log('composer:', await seen('/New event|Title/'));
console.log('secure page:', await evaluate('window.isSecureContext'), ' speech recognition:', await evaluate("typeof (window.SpeechRecognition || window.webkitSpeechRecognition)"));

// A voice note: five seconds of the sentence, then played back.
await press('Record a voice note');
await sleep(1000);
console.log('recording:', await seen('/Recording[^\\n]*/'));
await sleep(5000);
await press('Stop');
await sleep(2000);
console.log('note:', await evaluate(`[...document.querySelectorAll('[aria-label]')].map((n) => n.getAttribute('aria-label')).filter((l) => /Voice note|Play|Pause|Remove this voice/.test(l))`), ' problems:', await seen('/could not|failed|Allow this page/i'));
const play = await evaluate(`(() => { const el = document.querySelector('[aria-label="Play"]'); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
if (play) await click(play);
await sleep(1500);
console.log('playing:', await evaluate(`[...document.querySelectorAll('[aria-label]')].map((n) => n.getAttribute('aria-label')).filter((l) => /^(Play|Pause)$/.test(l))`), ' problem:', await seen('/could not be played/'));
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${OUT}/voice-note.png`, Buffer.from(shot.result.data, 'base64'));

// Dictation into the title: the notice first, then the sentence.
await press('Dictate');
await sleep(1500);
console.log('notice:', await seen('/goes to|through your browser|sound/i'));
const ok = await seen('/Dictate/');
if (await textAt('Dictate', 1)) await press('Dictate', 1); // the notice's own button, when it is a sheet
await sleep(16000);
console.log('listening:', await seen('/Listening[^\\n]*|Stop dictating/'));
console.log('speech events:', JSON.stringify(await evaluate('window.__speechLog')));
console.log('title now:', JSON.stringify(await evaluate(`[...document.querySelectorAll('input:not([type=checkbox]), textarea')].map((i) => i.value).filter(Boolean)`)));
console.log('dictation problem:', await seen('/Dictation stopped[^\\n]*/'));
const shot2 = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${OUT}/voice-dictation.png`, Buffer.from(shot2.result.data, 'base64'));
void ok;

const problems = events.filter((e) => e.method === 'Runtime.exceptionThrown');
const errors = events.filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error').map((e) => e.params.args.map((a) => a.value ?? a.description).join(' ').slice(0, 160));
console.log('exceptions:', problems.length, ' console errors:', errors.slice(0, 5));
try {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const browser = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => browser.addEventListener('open', r));
  browser.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
  await sleep(1500);
} catch {}
ws.close();
try {
  rmSync(profile, { recursive: true, force: true });
} catch {}
