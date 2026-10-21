// The "Forgot your password?" screen as it will be on a server WITH a mail
// provider: the two answers are faked in the browser (CDP Fetch), the LAN
// server is never asked. Pictures: flows/forgot-email-*.png.
import { outDir } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = outDir('flows');
const REAL = 'http://localhost:8081';
const port = 9375;
const profile = mkdtempSync(path.join(tmpdir(), 'famstory-forgot-'));
spawn(EDGE, ['--headless=new', `--remote-debugging-port=${port}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank']);
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
const asked = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Fetch.requestPaused') {
    const { requestId, request } = msg.params;
    asked.push(`${request.method} ${new URL(request.url).pathname} ${request.postData ?? ''}`);
    const body = request.method === 'GET' ? { byEmail: true } : { sent: true };
    ws.send(
      JSON.stringify({
        id: ++seq,
        method: 'Fetch.fulfillRequest',
        params: {
          requestId,
          responseCode: request.method === 'GET' ? 200 : 202,
          responseHeaders: [{ name: 'Content-Type', value: 'application/json' }],
          body: Buffer.from(JSON.stringify(body)).toString('base64'),
        },
      }),
    );
  }
});
const send = (method, params = {}) =>
  new Promise((r) => {
    const id = ++seq;
    pending.set(id, r);
    ws.send(JSON.stringify({ id, method, params }));
  });
const evaluate = async (expression) => (await send('Runtime.evaluate', { expression, returnByValue: true })).result?.result?.value;
async function click(point) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: point.x, y: point.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: point.x, y: point.y, button: 'left', buttons: 1, clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: point.x, y: point.y, button: 'left', buttons: 0, clickCount: 1 });
}
const where = (selector) =>
  evaluate(`(() => { const el = ${selector}; if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
const byText = (text) =>
  `(() => { const all = [...document.querySelectorAll('*')].filter((n) => n.textContent.trim() === ${JSON.stringify(text)} && n.getBoundingClientRect().width > 0); return all.filter((n) => ![...n.children].some((c) => all.includes(c)))[0]; })()`;
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.result.data, 'base64'));
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: `${REAL}/robots.txt` });
await sleep(300);
await evaluate(`localStorage.clear(); localStorage.setItem('famstory.locale', JSON.stringify({ locale: 'lv' })); 'ok'`);
// Only the two password-reset answers are faked; everything else is the real copy.
await send('Fetch.enable', {
  patterns: [{ urlPattern: '*/v1/auth/password-reset' }, { urlPattern: '*/v1/auth/password-reset/request' }],
});
// Waits for the words rather than a fixed time: a cold server, or a busy
// laptop, can take longer than three seconds to draw the first screen.
async function until(pattern, ms) {
  for (let waited = 0; waited < ms; waited += 250) {
    if (pattern.test((await evaluate('document.body.innerText')) ?? '')) return;
    await sleep(250);
  }
}
await send('Page.navigate', { url: `${REAL}/forgot?email=anna%40example.com` });
await until(/Sūtīt saiti/, 20000);
await shot('forgot-email-form');
const form = await evaluate('document.body.innerText');
console.log('form shows the email field, prefilled:', /Sūtīt saiti/.test(form), await evaluate(`document.querySelector('input')?.value`));
const sendButton = await where(byText('Sūtīt saiti'));
if (sendButton) await click(sendButton);
await until(/saite ir ceļā/, 10000);
await shot('forgot-email-sent');
const after = await evaluate('document.body.innerText');
console.log('after sending, it says the link is on its way:', /saite ir ceļā/.test(after));
console.log('requests the page made:', JSON.stringify(asked));

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
