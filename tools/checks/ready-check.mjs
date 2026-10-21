// Pressing everything on the demo, the way somebody showing it would - and
// faster: sign in, add an entry, comment, react, the language both ways, dark,
// sign out from two places and in again, the tabs hammered; then the same as
// a browser; then the phone view's own buttons. Every step says what it saw.
import { outDir } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = outDir('stress');
const DEMO = 'http://localhost:8090';
const port = 9375;
const profile = mkdtempSync(path.join(tmpdir(), 'famstory-ready-'));
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
    // confirm() on the web: yes, as somebody pressing on would answer.
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
async function drag(from, dx, dy, steps, ms, hold = 0) {
  await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x, y: from.y });
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: from.x, y: from.y, button: 'left', buttons: 1, clickCount: 1 });
  for (let i = 1; i <= steps; i++) {
    await sleep(ms / steps);
    await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: from.x + (dx * i) / steps, y: from.y + (dy * i) / steps, button: 'left', buttons: 1 });
  }
  if (hold) await sleep(hold);
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: from.x + dx, y: from.y + dy, button: 'left', buttons: 0, clickCount: 1 });
}
// Where a text is, on the page or inside one of the phone view's frames (scaled with the phone).
const find = (text, { frame = null, label = false, nth = 0 } = {}) =>
  evaluate(`(() => {
    const f = ${frame ? `document.getElementById('${frame}')` : 'null'};
    const doc = f ? f.contentDocument : document;
    const match = (n) => ${label ? `n.getAttribute && n.getAttribute('aria-label') === ${JSON.stringify(text)}` : `n.textContent.trim() === ${JSON.stringify(text)}`};
    const all = [...doc.querySelectorAll('*')].filter((n) => match(n) && n.getBoundingClientRect().width > 0);
    const el = all.filter((n) => ![...n.children].some((c) => all.includes(c))).at(${nth});
    if (!el) return null;
    el.scrollIntoView({ block: 'center' });
    const r = el.getBoundingClientRect();
    if (!f) return { x: r.x + r.width / 2, y: r.y + r.height / 2 };
    const fr = f.getBoundingClientRect();
    const scale = fr.width / f.offsetWidth;
    return { x: fr.left + (r.left + r.width / 2) * scale, y: fr.top + (r.top + r.height / 2) * scale };
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
async function type(text) {
  await send('Input.insertText', { text });
}
const shown = (frame = null) =>
  evaluate(`(() => { const f = ${frame ? `document.getElementById('${frame}')` : 'null'}; const d = f ? f.contentDocument : document; const w = f ? f.contentWindow : window; return { at: w.location.pathname + w.location.search, text: d.body.innerText.replace(/[ \\n\\t]+/g, ' ').slice(0, 150), all: d.body.innerText }; })()`);
let step = 0;
async function check(label, ok, extra = '') {
  step += 1;
  const thrown = events.filter((e) => e.method === 'Runtime.exceptionThrown');
  const fresh = thrown.slice(check.seen ?? 0);
  check.seen = thrown.length;
  const problems = fresh.map((e) => e.params.exceptionDetails.exception?.description?.split('\n')[0].slice(0, 120));
  const pic = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/ready-${String(step).padStart(2, '0')}.png`, Buffer.from(pic.result.data, 'base64'));
  console.log(`${String(step).padStart(2)}. ${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}${problems.length ? '  THROWN: ' + JSON.stringify(problems) : ''}`);
}

// --- What the stores ask of the app, pressed through on the dev server (sample family) ---
const APP = 'http://localhost:8082';
const dialogs = () => events.filter((e) => e.method === 'Page.javascriptDialogOpening').map((e) => e.params.message);
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

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
// The dev server bundles on the first request: minutes, at a low priority.
await send('Page.navigate', { url: `${APP}/legal/privacy` });
await until(/Privacy policy|Privātuma politika/, 480000);
await evaluate(`localStorage.setItem('famstory.locale', JSON.stringify({ locale: 'lv' })); localStorage.setItem('famstory.appearance', JSON.stringify({ preference: 'light' })); localStorage.removeItem('famstory.session'); 'ok'`);

// 1. The privacy policy: no account needed, Latvian, no notes for the lawyer.
await send('Page.navigate', { url: `${APP}/legal/privacy` });
let s = await until(/Privātuma politika/, 120000);
await check('privacy policy opens without an account, in Latvian, marked a draft', s.at === '/legal/privacy' && /Melnraksts: vēl nav spēkā/.test(s.all ?? ''), s.at);
await check('no note for the lawyer, no draft notice; the new Reports paragraph is there', !/Piezīme juristam|Piezīme:|MELNRAKSTS juridiskai/.test(s.all ?? '') && /Ziņojumi\./.test(s.all ?? ''), `${(s.all ?? '').length} chars`);

// 2. The terms, in English.
await evaluate(`localStorage.setItem('famstory.locale', JSON.stringify({ locale: 'en' })); 'ok'`);
await send('Page.navigate', { url: `${APP}/legal/terms` });
s = await until(/Terms of use/, 120000);
await check('terms in English, with reporting and Premium bought in the app', /Reporting\./.test(s.all ?? '') && /Premium bought in the app/.test(s.all ?? ''), s.at);
await evaluate(`localStorage.setItem('famstory.locale', JSON.stringify({ locale: 'lv' })); 'ok'`);

// 3. The welcome page links to both.
await send('Page.navigate', { url: `${APP}/welcome` });
await until(/Privātuma politika/, 120000);
const links = await evaluate(`[...document.querySelectorAll('a')].map((a) => a.getAttribute('href') || '').filter((h) => h.includes('legal'))`);
await check('welcome page: real links to the policy and the terms', JSON.stringify(links).includes('/legal/privacy') && JSON.stringify(links).includes('/legal/terms'), JSON.stringify(links));

// 4. The sign-in says what an account agrees to.
await send('Page.navigate', { url: `${APP}/?source=installed` });
s = await until(/Pieteikties/, 120000);
await check('sign-in: what creating an account agrees to', /Izveidojot kontu, tu piekrīti/.test(s.all ?? ''), s.at);
await press('Lietošanas noteikumi');
s = await until(/MELNRAKSTS|Melnraksts/, 60000);
await check('...and its link opens the terms', s.at === '/legal/terms', s.at);

// 5. Signed in, Settings has the legal section.
await send('Page.navigate', { url: `${APP}/?source=installed` });
await until(/Pieteikties/, 120000);
await press('Pieteikties', { nth: -1 });
s = await until(/Bergu ģimene/, 120000);
await check('signed in to the sample family', /Bergu ģimene/.test(s.all ?? ''), s.at);
await send('Page.navigate', { url: `${APP}/settings` });
s = await until(/Juridiskā informācija/, 120000);
await check('settings: the legal section; no "write to us" without an address', /Privātuma politika/.test(s.all ?? '') && /Lietošanas noteikumi/.test(s.all ?? '') && !/Rakstīt mums/.test(s.all ?? ''), s.at);
await press('Privātuma politika');
s = await until(/Melnraksts/, 60000);
await check('...whose row opens the policy', s.at === '/legal/privacy', s.at);

// 6. The paywall promises what there is.
await send('Page.navigate', { url: `${APP}/premium` });
s = await until(/FamStory Premium/, 120000);
await check('paywall: the three real limits and nothing else', /Neierobežots notikumu skaits/.test(s.all ?? '') && /Līdz 20 bildēm katram notikumam/.test(s.all ?? '') && /Līdz 10 balss ierakstiem/.test(s.all ?? '') && !/PDF|video/i.test(s.all ?? ''), '');
await check('paywall: renewal terms and both links', /atjaunojas automātiski/.test(s.all ?? '') && /Lietošanas noteikumi/.test(s.all ?? '') && /Privātuma politika/.test(s.all ?? ''), '');
let seen = dialogs().length;
await press('Atjaunot pirkumu');
await sleep(1500);
await check('"Atjaunot pirkumu" says there is nothing to restore yet', (dialogs().slice(seen)[0] ?? '').includes('nav pirkuma'), JSON.stringify(dialogs().slice(seen)));

// 7. Reporting somebody else's entry.
await send('Page.navigate', { url: `${APP}/event/evt_word` });
await until(/Komentāri|komentār/i, 120000);
await press('Vēl', { label: true });
await sleep(1500);
s = await shown();
await check("somebody else's entry: 'Ziņot par šo ierakstu' in its menu", /Ziņot par šo ierakstu/.test(s.all ?? ''), '');
await press('Ziņot par šo ierakstu');
s = await until(/Kas ar šo ierakstu nav kārtībā/, 60000);
await check('the report screen, for an entry, says who will see it', (s.at ?? '').startsWith('/report') && /administratori redzēs/.test(s.all ?? ''), s.at);
seen = dialogs().length;
await press('Surogātpasts vai krāpšana');
await sleep(600);
await press('Nosūtīt ziņojumu');
await sleep(3000);
await check('sent: thanked, and told the demo has nobody to send it to', (dialogs().slice(seen)[0] ?? '').includes('Demo versijā'), JSON.stringify(dialogs().slice(seen)));
s = await shown();
await check('...and back on the entry', s.at === '/event/evt_word', s.at);

// 8. A comment by somebody else can be reported; your own cannot.
await send('Page.navigate', { url: `${APP}/event/evt_school` });
await until(/Emīlijas pirmā skolas diena/, 120000);
const reportLinks = await evaluate(`[...document.querySelectorAll('*')].filter((n) => n.children.length === 0 && n.textContent.trim() === 'Ziņot' && n.getBoundingClientRect().width > 0).length`);
await check("the two comments by others carry 'Ziņot', Anna's own does not", reportLinks === 2, String(reportLinks));
await press('Ziņot');
s = await until(/Kas ar šo komentāru nav kārtībā/, 60000);
await check('the report screen, for a comment', /target=comment/.test(s.at ?? ''), s.at);

// 9. Your own entry: no report in its menu.
await send('Page.navigate', { url: `${APP}/event/evt_school` });
await until(/Emīlijas pirmā skolas diena/, 120000);
await press('Vēl', { label: true });
await sleep(1500);
s = await shown();
await check('your own entry: its menu has no report', !/Ziņot par šo ierakstu/.test(s.all ?? ''), '');

const thrown = events.filter((e) => e.method === 'Runtime.exceptionThrown');
console.log(`\n${step} steps, ${thrown.length} errors thrown in all`);
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
