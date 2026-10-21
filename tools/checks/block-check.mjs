// Blocking, pressed through on the web dev server (sample family, Latvian):
// from an entry's menu, on a profile, the bell, comments - and unblocking.
import { outDir } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = outDir('block');
mkdirSync(OUT, { recursive: true });
const APP = 'http://localhost:8084';
const port = 9377;
const profile = mkdtempSync(path.join(tmpdir(), 'famstory-block-'));
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
const events = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Page.javascriptDialogOpening') {
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
const find = (text, { label = false, nth = 0 } = {}) =>
  evaluate(`(() => {
    const match = (n) => ${label ? `n.getAttribute && n.getAttribute('aria-label') === ${JSON.stringify(text)}` : `n.textContent.trim() === ${JSON.stringify(text)}`};
    const all = [...document.querySelectorAll('*')].filter((n) => match(n) && n.getBoundingClientRect().width > 0);
    const el = all.filter((n) => ![...n.children].some((c) => all.includes(c))).at(${nth});
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
  })()`);
async function press(text, options = {}) {
  for (let t = 0; t < (options.wait ?? 10000); t += 250) {
    const at = await find(text, options);
    if (at) {
      await click(at);
      return true;
    }
    await sleep(250);
  }
  return false;
}
const shown = () =>
  evaluate(`({ at: location.pathname + location.search, all: document.body.innerText })`);
async function until(pattern, ms = 20000) {
  const end = Date.now() + ms;
  let s = {};
  while (Date.now() < end) {
    s = (await shown()) ?? {};
    if (pattern.test(s.all ?? '')) return s;
    await sleep(300);
  }
  return s;
}
const dialogs = () => events.filter((e) => e.method === 'Page.javascriptDialogOpening').map((e) => e.params.message);
const count = (text) =>
  evaluate(`[...document.querySelectorAll('*')].filter((n) => n.children.length === 0 && n.textContent.trim() === ${JSON.stringify(text)} && n.getBoundingClientRect().width > 0).length`);
let step = 0;
let failed = 0;
async function check(label, ok, extra = '') {
  step += 1;
  if (!ok) failed += 1;
  const pic = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/block-${String(step).padStart(2, '0')}.png`, Buffer.from(pic.result.data, 'base64'));
  console.log(`${String(step).padStart(2)}. ${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ' - ' + extra : ''}`);
}
const ENTRY = 'Roberts pateica "traktors"';
// Inside the app, the way a tap would: a page load would start the sample
// family afresh, and a block lives only in memory, as it should.
const go = async (to) => {
  await evaluate(`(() => { history.pushState(null, '', ${JSON.stringify(to)}); dispatchEvent(new PopStateEvent('popstate', { state: null })); return location.pathname; })()`);
  await sleep(600);
};

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
// The dev server bundles on the first request: minutes.
await send('Page.navigate', { url: `${APP}/?source=installed` });
await until(/Pieteikties|Sign in/, 480000);
await evaluate(`localStorage.setItem('famstory.locale', JSON.stringify({ locale: 'lv' })); localStorage.setItem('famstory.appearance', JSON.stringify({ preference: 'light' })); localStorage.removeItem('famstory.session'); 'ok'`);
await send('Page.navigate', { url: `${APP}/?source=installed` });
await until(/Pieteikties/, 120000);
await press('Pieteikties', { nth: -1 });
let s = await until(/Bergu ģimene/, 120000);
s = await until(/traktors/, 30000);
await check('signed in to the sample family; Mārtiņš\'s entry is on the timeline', (s.all ?? '').includes(ENTRY));

// Comments by others on Emīlija's school day, before anything is blocked.
await go('/event/evt_school');
await until(/Emīlijas pirmā skolas diena/, 120000);
await sleep(800);
const commentsBefore = await count('Ziņot');

// 1. From the entry's menu.
await go('/event/evt_word');
await until(/traktors/, 120000);
await press('Vēl', { label: true });
await sleep(1200);
s = await shown();
await check("somebody else's entry: 'Bloķēt autoru' in its menu, with the name", /Bloķēt autoru/.test(s.all ?? '') && /Mārtiņš/.test(s.all ?? ''));
let seen = dialogs().length;
await press('Bloķēt autoru');
await sleep(2500);
const asked = dialogs().slice(seen)[0] ?? '';
await check('asked first, saying what it does and that nobody is told', asked.includes('Tu vairs neredzēsi') && asked.includes('Mārtiņš') && asked.includes('Neviens par to neuzzinās'), JSON.stringify(asked.slice(0, 90)));

// 2. Gone from the timeline, and from the entry itself.
await go('/');
s = await until(/Bergu ģimene/, 60000);
await sleep(2500);
s = await shown();
await check('the entry has left the timeline, the others are there', !(s.all ?? '').includes(ENTRY) && /Emīlijas pirmā skolas diena/.test(s.all ?? ''));
await go('/event/evt_word');
s = await until(/bloķēts/, 30000);
await check('opened directly, it says why it is not shown', /Šo ierakstu pievienoja cilvēks, kas tev ir bloķēts/.test(s.all ?? ''));

// 3. His comments leave the entries that are still shown.
await go('/event/evt_school');
await until(/Emīlijas pirmā skolas diena/, 60000);
await sleep(800);
const commentsAfter = await count('Ziņot');
await check('his comment is gone from somebody else\'s entry', commentsAfter < commentsBefore, `${commentsBefore} -> ${commentsAfter}`);

// 4. The profile says so, and unblocks.
await go('/family/member/mem_martin');
s = await until(/Mārtiņš/, 60000);
await sleep(800);
s = await shown();
await check('his profile: the note, and Atbloķēt', /Šis cilvēks tev ir bloķēts: tu neredzi, ko Mārtiņš pievieno/.test(s.all ?? '') && /Atbloķēt/.test(s.all ?? ''));
await press('Atbloķēt');
await sleep(1200);
s = await shown();
await check('unblocked: the note is gone and Bloķēt is back', !/tev ir bloķēts/.test(s.all ?? '') && /Bloķēt/.test(s.all ?? ''));
await go('/');
s = await until(/traktors/, 60000);
await check('...and the entry is on the timeline again', (s.all ?? '').includes(ENTRY));

// 5. The bell: Vera's comment notification goes with a block of Vera.
await go('/notifications');
s = await until(/Vera komentēja/, 60000);
const bellBefore = /Vera komentēja/.test(s.all ?? '');
await go('/family/member/mem_vera');
await until(/Vera/, 60000);
seen = dialogs().length;
await press('Bloķēt');
await sleep(2000);
await go('/notifications');
await until(/Paziņojumi/, 60000);
await sleep(800);
s = await shown();
await check("the bell drops what Vera did, and keeps the reminder", bellBefore && !/Vera komentēja/.test(s.all ?? '') && dialogs().length > seen, s.at);
await go('/family/member/mem_vera');
await until(/Atbloķēt/, 60000);
await press('Atbloķēt');
await sleep(800);

// 6. Not yourself, not a child.
await go('/family/member/mem_anna');
await until(/Anna/, 60000);
await sleep(800);
const own = await count('Bloķēt');
await go('/family/member/mem_emily');
await until(/Emīlija/, 60000);
await sleep(800);
const child = await count('Bloķēt');
await check('no Bloķēt on your own profile or a child profile', own === 0 && child === 0, `own ${own}, child ${child}`);

const thrown = events.filter((e) => e.method === 'Runtime.exceptionThrown');
console.log(`\n${step} steps, ${failed} failed, ${thrown.length} errors thrown`);
for (const e of thrown.slice(0, 5)) console.log('  thrown:', e.params.exceptionDetails.exception?.description?.split('\n')[0].slice(0, 160));
try {
  const version = await (await fetch(`http://127.0.0.1:${port}/json/version`)).json();
  const browser = new WebSocket(version.webSocketDebuggerUrl);
  await new Promise((r) => browser.addEventListener('open', r));
  browser.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
  await sleep(2000);
} catch {}
ws.close();
try {
  rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
} catch {}
