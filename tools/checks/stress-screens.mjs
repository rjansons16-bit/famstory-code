// Every screen of the demo, signed in as the sample family's Anna, at a
// phone's size and a computer's, in Latvian, light and dark - and the pages
// that open without an account, on the demo and on the real copy. For each:
// errors thrown, errors logged, the error screen, a page wider than the
// window, and a picture to look at.
import { outDir } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = outDir('stress');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const port = 9369;
const profile = mkdtempSync(path.join(tmpdir(), 'famstory-stress-'));
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
let events = [];
ws.addEventListener('message', (m) => {
  const msg = JSON.parse(m.data);
  if (msg.id && pending.has(msg.id)) {
    pending.get(msg.id)(msg);
    pending.delete(msg.id);
    return;
  }
  if (msg.method === 'Page.javascriptDialogOpening') {
    ws.send(JSON.stringify({ id: ++seq, method: 'Page.handleJavaScriptDialog', params: { accept: false } }));
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
const textAt = (text) =>
  evaluate(`(() => { const all = [...document.querySelectorAll('*')].filter((n) => n.textContent.trim() === ${JSON.stringify(text)} && n.getBoundingClientRect().width > 0); const el = all.filter((n) => ![...n.children].some((c) => all.includes(c)))[0]; if (!el) return null; const r = el.getBoundingClientRect(); return { x: r.x + r.width / 2, y: r.y + r.height / 2 }; })()`);
async function press(text) {
  for (let t = 0; t < 10000; t += 250) {
    const at = await textAt(text);
    if (at) {
      await click(at);
      return true;
    }
    await sleep(250);
  }
  return false;
}

const report = [];
async function visit(base, route, name, settle = 2600) {
  events = [];
  await send('Page.navigate', { url: base + route });
  await sleep(settle);
  const facts = await evaluate(`(() => {
    const text = document.body.innerText;
    return {
      at: location.pathname + location.search,
      wide: document.scrollingElement.scrollWidth > innerWidth + 1 ? document.scrollingElement.scrollWidth : 0,
      broken: /Something went wrong|Kaut kas nogāja greizi|Unmatched Route|This screen doesn't exist/i.test(text),
      words: text.replace(/\\s+/g, ' ').trim().slice(0, 70),
    };
  })()`);
  const thrown = events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception?.description?.split('\n')[0].slice(0, 120));
  const logged = events
    .filter((e) => e.method === 'Runtime.consoleAPICalled' && e.params.type === 'error')
    .map((e) => e.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 120));
  const shot = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(shot.result.data, 'base64'));
  const line = { name, ...facts, thrown, logged };
  report.push(line);
  const flags = [facts.broken ? 'ERROR SCREEN' : '', facts.wide ? `WIDE ${facts.wide}` : '', thrown.length ? `THROWN ${thrown.length}` : '', logged.length ? `LOGGED ${logged.length}` : ''].filter(Boolean).join(' ');
  console.log(name.padEnd(30), (facts.at ?? '').padEnd(30), flags || 'ok', flags ? JSON.stringify([...thrown, ...logged]).slice(0, 300) : '');
}

const DEMO = 'http://localhost:8090';
const REAL = 'http://localhost:8081';
const SIGNED_IN = [
  ['/', 'timeline'],
  ['/calendar', 'calendar'],
  ['/family', 'family'],
  ['/profile', 'profile'],
  ['/notifications', 'notifications'],
  ['/search', 'search'],
  ['/event/new', 'composer'],
  ['/event/evt_school', 'event-school'],
  ['/event/evt_beach', 'event-beach'],
  ['/family/member/mem_vera', 'member-vera'],
  ['/family/member/mem_robert', 'member-robert'],
  ['/family/groups', 'groups'],
  ['/family/invite', 'invite'],
  ['/settings', 'settings'],
  ['/premium', 'premium'],
  ['/recap', 'recap'],
  ['/traditions', 'traditions'],
  ['/growth/mem_vera', 'growth-vera'],
  ['/story/mem_robert', 'story-robert'],
  ['/surprise/mem_vera', 'surprise-vera'],
  ['/special-day/mothers-day', 'special-mothers'],
  ['/film', 'film'],
  ['/sticker/evt_school', 'sticker'],
  ['/profile/edit', 'profile-edit'],
  ['/shelf', 'shelf-removed'],
];

async function setUp(base, { locale = 'lv', appearance = 'light', session = null } = {}) {
  await send('Page.navigate', { url: `${base}/robots.txt` });
  await sleep(300);
  await evaluate(`localStorage.setItem('famstory.locale', JSON.stringify({ locale: '${locale}' })); localStorage.setItem('famstory.appearance', JSON.stringify({ preference: '${appearance}' })); ${session ? `localStorage.setItem('famstory.session', JSON.stringify(${JSON.stringify(session)}));` : "localStorage.removeItem('famstory.session');"} 'ok'`);
}

await send('Page.enable');
await send('Runtime.enable');

// The phone, light.
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
await setUp(DEMO);
await visit(DEMO, '/welcome', 'p-demo-welcome');
await visit(DEMO, '/?source=installed', 'p-demo-signin');
await press('Pieteikties');
await sleep(2500);
for (const [route, name] of SIGNED_IN) await visit(DEMO, route, `p-${name}`);

// The phone, dark - the main screens.
await setUp(DEMO, { appearance: 'dark', session: { kind: 'existing', onboardingComplete: true } });
for (const [route, name] of SIGNED_IN.slice(0, 10)) await visit(DEMO, route, `d-${name}`);
await setUp(DEMO, { appearance: 'dark' });
await visit(DEMO, '/welcome', 'd-demo-welcome');
await visit(DEMO, '/?source=installed', 'd-demo-signin');

// English, the phone - the front doors and a few screens.
await setUp(DEMO, { locale: 'en' });
await visit(DEMO, '/welcome', 'e-demo-welcome');
await visit(DEMO, '/?source=installed', 'e-demo-signin');
await setUp(DEMO, { locale: 'en', session: { kind: 'existing', onboardingComplete: true } });
for (const [route, name] of SIGNED_IN.slice(0, 4)) await visit(DEMO, route, `e-${name}`);

// A computer.
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await setUp(DEMO, { session: { kind: 'existing', onboardingComplete: true } });
for (const [route, name] of SIGNED_IN.slice(0, 8)) await visit(DEMO, route, `c-${name}`);
await setUp(DEMO);
await visit(DEMO, '/welcome', 'c-demo-welcome');
await visit(DEMO, '/?source=installed', 'c-demo-signin');

// The real copy, signed out: its front doors and the links that open without an account.
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
await setUp(REAL);
await visit(REAL, '/welcome', 'r-welcome');
await visit(REAL, '/?source=installed', 'r-signin');
await visit(REAL, '/', 'r-root');
await visit(REAL, '/join/NOSUCH', 'r-join-bogus');
await visit(REAL, '/guest/nosuchtoken', 'r-guest-bogus');
await visit(REAL, '/reset/nosuchtoken', 'r-reset-bogus');
await visit(REAL, '/profile', 'r-profile-signed-out');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
await visit(REAL, '/welcome', 'rc-welcome');

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
const bad = report.filter((r) => r.broken || r.wide || r.thrown.length || r.logged.length);
console.log(`\n${report.length} pages, ${bad.length} with something to look at`);
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
