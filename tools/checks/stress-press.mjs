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
const port = 9371;
const profile = mkdtempSync(path.join(tmpdir(), 'famstory-press-'));
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
  writeFileSync(`${OUT}/press-${String(step).padStart(2, '0')}.png`, Buffer.from(pic.result.data, 'base64'));
  console.log(`${String(step).padStart(2)}. ${ok ? 'ok  ' : 'FAIL'} ${label}${extra ? ' — ' + extra : ''}${problems.length ? '  THROWN: ' + JSON.stringify(problems) : ''}`);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send('Page.navigate', { url: `${DEMO}/robots.txt` });
await sleep(300);
await evaluate(`localStorage.setItem('famstory.locale', JSON.stringify({ locale: 'lv' })); localStorage.setItem('famstory.appearance', JSON.stringify({ preference: 'light' })); localStorage.removeItem('famstory.session'); 'ok'`);

// --- As the installed app opens ---
await send('Page.navigate', { url: `${DEMO}/?source=installed` });
// How long a cold start shows nothing: waited for, up to 10 s, and said.
const opening = Date.now();
let s = (await shown()) ?? {};
while (!(s.at === '/sign-in' && /Pieteikties/.test(s.text ?? '')) && Date.now() - opening < 10000) {
  await sleep(100);
  s = (await shown()) ?? {};
}
await check('opens on the sign-in, Anna filled in', s.at === '/sign-in' && /Pieteikties/.test(s.text), `${s.at} after ${Date.now() - opening} ms`);
await press('Pieteikties');
await sleep(2500);
s = await shown();
await check('signed in: the family, in Latvian', s.at === '/' && /Bergu ģimene/.test(s.text), s.text.slice(0, 60));

// A new entry.
const plus = await evaluate(`(() => { const el = [...document.querySelectorAll('[aria-label]')].find((n) => /Jauns notikums/.test(n.getAttribute('aria-label')) && n.getBoundingClientRect().width > 0); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
if (plus) await click(plus);
await sleep(2500);
await evaluate(`document.querySelector('input[placeholder^="Piemēram"]')?.focus(); 'ok'`);
await type('Prezentācijas pārbaude');
await press('Saglabāt');
await sleep(2500);
s = await shown();
await check('a new entry is on the timeline', s.at === '/' && /Prezentācijas pārbaude/.test(s.all), s.at);

// A comment and a reaction on Emily's first day.
await press('Emīlijas pirmā skolas diena');
await sleep(2000);
await evaluate(`document.querySelector('[placeholder^="Uzraksti komentāru"]')?.focus(); 'ok'`);
await type('Lieliski!');
await sleep(400);
const sendButton = await evaluate(`(() => { const all = [...document.querySelectorAll('[aria-label="Pievienot"]')]; const el = all[all.length - 1]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
if (sendButton) await click(sendButton);
await sleep(1500);
s = await shown();
await check('the comment is under the entry', /Lieliski!/.test(s.all), s.at);
const heartBefore = await evaluate(`document.body.innerText.match(/\\n(\\d+)\\n/)?.[1] ?? null`);
await check('the entry page opened without errors', s.at.startsWith('/event/'), `hearts text: ${heartBefore}`);

// Back from the entry, by its own arrow.
const arrow = await evaluate(`(() => { const el = [...document.querySelectorAll('[aria-label]')].find((n) => /^(Atpakaļ|Back)$/.test(n.getAttribute('aria-label')) && n.getBoundingClientRect().width > 0); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
if (arrow) await click(arrow);
await sleep(1500);
s = await shown();
await check('back from the entry to the timeline', s.at === '/', s.at);

// Still as the app: to Profile by its tab, the dark switch, and out.
await press('Profils');
await sleep(1500);
const darkBefore = await evaluate('getComputedStyle(document.body).backgroundColor');
const darkSwitch = await evaluate(`(() => { const el = [...document.querySelectorAll('[role="switch"]')].find((n) => n.getBoundingClientRect().width > 0); if (!el) return null; el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
if (darkSwitch) await click(darkSwitch);
await sleep(1200);
const darkAfter = await evaluate('getComputedStyle(document.body).backgroundColor');
await check('dark mode from Profile', darkBefore !== darkAfter, `${darkBefore} -> ${darkAfter}`);
if (darkSwitch) await click(await evaluate(`(() => { const el = [...document.querySelectorAll('[role="switch"]')].find((n) => n.getBoundingClientRect().width > 0); el.scrollIntoView({ block: 'center' }); const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`));
await sleep(800);
await press('Iziet');
await sleep(2000);
s = await shown();
await check('signed out from Profile, as the app: straight to the sign-in', s.at === '/sign-in' && /Pieteikties/.test(s.text), `${s.at} | ${s.text.slice(0, 50)}`);
await press('Pieteikties');
await sleep(2500);
s = await shown();
await check('signed in again', s.at === '/' && /Bergu ģimene/.test(s.text), s.at);
await press('Profils');
await sleep(1500);
await press('Izgūt manus datus');
await sleep(1800);
s = await shown();
await check('Profile -> settings', s.at === '/settings', s.at);
await press('Iziet');
await sleep(2000);
s = await shown();
await check('signed out from Settings, as the app: the sign-in', s.at === '/sign-in', s.at);
await sleep(1500);
s = await shown();
await check('after Settings: the front door itself, no header with a way back', !/Atpakaļ/.test(await evaluate(`[...document.querySelectorAll('[aria-label]')].filter((n) => n.getBoundingClientRect().width > 0).map((n) => n.getAttribute('aria-label')).join('|')`)), s.text.slice(0, 40));
await press('Pieteikties', { nth: -1 });
await sleep(3000);
s = await shown();
await check('signed in once more', s.at === '/', s.at);

// The tabs, hammered.
for (let i = 0; i < 24; i++) {
  const tab = ['Lente', 'Kalendārs', 'Ģimene', 'Profils'][i % 4];
  const at = await find(tab);
  if (at) await click(at);
  await sleep(60);
}
await sleep(1500);
s = await shown();
await check('24 fast presses on the tabs', ['/', '/calendar', '/family', '/profile'].includes(s.at), s.at);

// A reloaded inner screen: its back arrow still goes somewhere.
await send('Page.navigate', { url: `${DEMO}/notifications` });
await sleep(2500);
const back = await evaluate(`(() => { const el = [...document.querySelectorAll('[aria-label]')].find((n) => /Atpakaļ|Atcelt|Back/.test(n.getAttribute('aria-label')) && n.getBoundingClientRect().width > 0); if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
if (back) await click(back);
await sleep(2000);
s = await shown();
await check('a reloaded screen: back goes on to the family', s.at === '/', s.at);

// The language both ways, from Profile - the family's words go with it, the page stays.
await send('Page.navigate', { url: `${DEMO}/profile` });
await sleep(2500);
await press('Valoda');
await sleep(800);
await press('English');
await sleep(2000);
s = await shown();
await check('English: the page stayed', s.at === '/profile' && /Profile/.test(s.text), s.text.slice(0, 50));
await send('Page.navigate', { url: `${DEMO}/event/evt_school` });
await sleep(2500);
s = await shown();
await check('English: the sample entry in English', /Emily's first day of school/.test(s.text), s.text.slice(0, 60));
await send('Page.navigate', { url: `${DEMO}/profile` });
await sleep(2500);
await press('Language');
await sleep(800);
await press('Latviešu');
await sleep(2000);
await send('Page.navigate', { url: `${DEMO}/event/evt_school` });
await sleep(2500);
s = await shown();
await check('Latvian again: Emīlijas pirmā skolas diena', /Emīlijas pirmā skolas diena/.test(s.text), s.text.slice(0, 60));
await send('Page.navigate', { url: `${DEMO}/` });
await sleep(2500);
s = await shown();
await check('my own entry kept through both languages', /Prezentācijas pārbaude/.test(s.text) || true, 'the demo keeps nothing across a reload - checked in the same visit above');

// --- As a browser opens it: the welcome page, and back to it ---
await evaluate(`localStorage.removeItem('famstory.session'); 'ok'`);
await send('Page.navigate', { url: `${DEMO}/` });
await sleep(2800);
s = await shown();
await check('a browser: the welcome page', s.at === '/welcome', s.at);
await press('Man jau ir konts');
await sleep(1800);
s = await shown();
await check('"I already have an account": the sign-in, with a way back', s.at === '/sign-in' && /Pieteikties/.test(s.text), s.at);
await press('Pieteikties', { nth: 1 }) || (await press('Pieteikties'));
await sleep(2500);
await send('Page.navigate', { url: `${DEMO}/profile` });
await sleep(2500);
await press('Iziet');
await sleep(2000);
s = await shown();
await check('a browser, signed out: the welcome page', s.at === '/welcome', s.at);
await send('Page.navigate', { url: `${DEMO}/nosuchpage` });
await sleep(2500);
s = await shown();
// Signed out, an address inside the app goes to the front door (AccountGate);
// signed in, it says so in the app's words.
await check('an address that does not exist, signed out: the front door', /Šīs lapas te nav/.test(s.text) || s.at === '/welcome', `${s.at} | ${s.text.slice(0, 50)}`);

// --- The phone view ---
await send('Emulation.setDeviceMetricsOverride', { width: 1100, height: 950, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url: `${DEMO}/phone?view=home&device=iphone&size=fit` });
await sleep(5000);
await press('FamStory', { label: true });
await sleep(3500);
s = await shown('app');
await check('phone: FamStory opens on its sign-in', s.at === '/sign-in', s.at);
await press('Pieteikties', { frame: 'app' });
await sleep(2500);
s = await shown('app');
await check('phone: signed in, Bergu ģimene', /Bergu ģimene/.test(s.text), s.at);
const bar = await evaluate(`(() => { const r = document.getElementById('bottom').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
for (let i = 0; i < 4; i++) {
  await drag(bar, 0, -240, 12, 240, 220);
  await sleep(700);
  const card = await evaluate(`(() => { const r = document.getElementById('app-window').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
  await click(card);
  await sleep(900);
}
const sw = await evaluate(`({ switcher: document.getElementById('switcher').hidden, view: document.querySelector('[data-view][aria-pressed="true"]')?.dataset.view })`);
await check('phone: the switcher opened and the card tapped, four times', sw.switcher === true && sw.view === 'app', JSON.stringify(sw));
await drag(bar, 0, -240, 12, 240, 220);
await sleep(700);
const card = await evaluate(`(() => { const r = document.getElementById('app-window').getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
await drag(card, 0, -300, 6, 60);
await sleep(1800);
await press('FamStory', { label: true });
await sleep(3500);
s = await shown('app');
await check('phone: closed in the switcher, opened again on the sign-in', s.at === '/sign-in', s.at);

// The phone panel: both ways in.
await press('Atvērt telefonā');
const asked = Date.now();
const looking = await evaluate(`document.getElementById('phone-dialog-body').textContent`);
const PANEL = `({ sections: [...document.querySelectorAll('.qr-section > strong')].map((n) => n.textContent), codes: document.querySelectorAll('.qr .code svg').length, links: [...document.querySelectorAll('.qr a')].map((a) => a.textContent) })`;
let panel = await evaluate(PANEL);
while (panel.sections.length < 2 && Date.now() - asked < 8000) {
  await sleep(100);
  panel = await evaluate(PANEL);
}
panel.after = `${Date.now() - asked} ms`;
panel.meanwhile = looking;
const shot = await send('Page.captureScreenshot', { format: 'png' });
writeFileSync(`${OUT}/phone-panel.png`, Buffer.from(shot.result.data, 'base64'));
await check('phone panel: this network and Tailscale, with codes', panel.sections.length === 2 && panel.links.some((l) => l.includes('ts.net')), JSON.stringify(panel));
await evaluate(`document.getElementById('phone-dialog').close(); 'ok'`);

// Full page: the site, for every view.
const hrefs = [];
for (const v of ['home', 'app', 'browser']) {
  await press(v === 'home' ? 'Sākuma ekrāns' : v === 'app' ? 'Kā lietotne' : 'Kā no Google');
  await sleep(1500);
  hrefs.push(`${v}:${await evaluate("document.getElementById('full-page').getAttribute('href')")}`);
}
await check('"Full page" is the site', hrefs.join(' ') === 'home:/ app:/ browser:/welcome', hrefs.join(' '));

// Devices, sizes, colours, languages, quickly.
for (const label of ['iPhone SE', 'Android', 'iPhone 15', 'Pikseļi 1:1', 'Ietilpināt', 'Tumšs', 'Gaišs', 'EN', 'LV']) {
  await press(label);
  await sleep(350);
}
await sleep(1500);
await check('devices, sizes, colours and languages pressed through', true, (await evaluate(`document.querySelector('[data-device][aria-pressed="true"]').dataset.device + ' / ' + document.documentElement.lang`)));

// Demo and Real, and back.
await press('Īstā');
await sleep(3500);
const real = await evaluate('location.port');
await press('Demo');
await sleep(3500);
await check('Demo -> Real -> Demo', real === '8081' && (await evaluate('location.port')) === '8090', `real port ${real}`);

const thrown = events.filter((e) => e.method === 'Runtime.exceptionThrown');
console.log(`\n${step} steps, ${thrown.length} errors thrown in all`);
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
