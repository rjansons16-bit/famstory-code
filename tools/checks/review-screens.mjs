// The review pass (2026-10-10): every screen of the demo signed in as Anna,
// at a phone's size and a computer's, Latvian and English, light and dark,
// plus the screens added for the stores (legal, terms, support, report). For
// each: errors thrown or logged, the error screen, a page wider than the
// window, text cut off with an ellipsis, text under 12px, touch targets under
// 32px, English words on a Latvian screen - and a picture to look at.
import { outDir } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const only = process.argv[2] ?? 'all';
const OUT = outDir(`review/${only}`);
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const port = 9371;
const profile = mkdtempSync(path.join(tmpdir(), 'famstory-review-'));
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

const ENGLISH = String.raw`\b(the|and|your|you|with|this|that|Add|Save|Cancel|Delete|Settings|Event|Photo|Edit|Share|Invite|Done|Back|Next|Close|Today|Tomorrow|Yesterday|Comment|Comments|Reply|Search|Notifications|Members|Member|Group|Groups|Everyone|Private|Only|Remove|Report|Block|Sign|Account|Password|Email|Welcome|Continue|Skip|Loading|Error|Retry|Upgrade|Free|Month|Year|Week|Family|Birthday|Reminder|Memories|Story|Restore|Manage|Subscription|Terms|Privacy|Policy|Support|Contact|Agree)\b`;

const report = [];
async function visit(base, route, name, { latvian = false, settle = 2600 } = {}) {
  events = [];
  await send('Page.navigate', { url: base + route });
  await sleep(settle);
  const facts = await evaluate(`(() => {
    const text = document.body.innerText;
    const shown = (el) => { const r = el.getBoundingClientRect(); return r.width > 0 && r.height > 0; };
    const leaves = [...document.querySelectorAll('div, span')].filter((el) => !el.childElementCount && el.textContent.trim() && shown(el));
    const cut = [];
    const small = new Set();
    for (const el of leaves) {
      const cs = getComputedStyle(el);
      const clamp = cs.webkitLineClamp && cs.webkitLineClamp !== 'none';
      if ((cs.textOverflow === 'ellipsis' || clamp) && (el.scrollWidth > el.clientWidth + 1 || el.scrollHeight > el.clientHeight + 1)) cut.push(el.textContent.trim().slice(0, 40));
      const fs = parseFloat(cs.fontSize);
      if (fs < 12) small.add(fs + 'px ' + el.textContent.trim().slice(0, 24));
    }
    const tiny = [];
    for (const el of document.querySelectorAll('[role=button],[role=link],[role=switch],[role=radio],[role=checkbox],[role=tab],a[href],button,input,textarea')) {
      const r = el.getBoundingClientRect();
      if (r.width > 0 && r.height > 0 && (r.width < 32 || r.height < 32)) tiny.push(Math.round(r.width) + 'x' + Math.round(r.height) + ' ' + (el.getAttribute('aria-label') || el.textContent || el.getAttribute('placeholder') || '').trim().slice(0, 24));
    }
    const english = ${latvian} ? [...new Set([...text.matchAll(new RegExp(${JSON.stringify(ENGLISH)}, 'g'))].map((m) => text.slice(Math.max(0, m.index - 18), m.index + m[0].length + 18).replace(/\\s+/g, ' ')))].slice(0, 8) : [];
    return {
      at: location.pathname + location.search,
      wide: document.scrollingElement.scrollWidth > innerWidth + 1 ? document.scrollingElement.scrollWidth : 0,
      broken: /Something went wrong|Kaut kas nogāja greizi|Unmatched Route|This screen doesn't exist/i.test(text),
      words: text.replace(/\\s+/g, ' ').trim().slice(0, 70),
      cut: cut.slice(0, 8),
      small: [...small].slice(0, 8),
      tiny: tiny.slice(0, 10),
      english,
    };
  })()`);
  const thrown = events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception?.description?.split('\n')[0].slice(0, 120));
  const logged = events
    .filter((e) => e.method === 'Runtime.consoleAPICalled' && (e.params.type === 'error' || e.params.type === 'warning'))
    .map((e) => e.params.type[0].toUpperCase() + ': ' + e.params.args.map((a) => a.value ?? a.description ?? '').join(' ').slice(0, 140));
  const shot = await send('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(shot.result.data, 'base64'));
  const line = { name, ...facts, thrown, logged };
  report.push(line);
  const flags = [
    facts.broken ? 'ERROR SCREEN' : '',
    facts.wide ? `WIDE ${facts.wide}` : '',
    thrown.length ? `THROWN ${thrown.length}` : '',
    logged.length ? `LOGGED ${logged.length}` : '',
    facts.cut?.length ? `CUT ${facts.cut.length}` : '',
    facts.small?.length ? `SMALL ${facts.small.length}` : '',
    facts.tiny?.length ? `TINY ${facts.tiny.length}` : '',
    facts.english?.length ? `EN ${facts.english.length}` : '',
  ].filter(Boolean).join(' ');
  console.log(name.padEnd(28), (facts.at ?? '').padEnd(34), flags || 'ok');
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
  ['/legal/privacy', 'legal-privacy'],
  ['/legal/terms', 'legal-terms'],
  ['/terms', 'terms-accept'],
  ['/support', 'support'],
  ['/report?target=event&id=evt_school', 'report-event'],
  ['/report?target=comment&id=c1', 'report-comment'],
];

async function setUp(base, { locale = 'lv', appearance = 'light', session = null } = {}) {
  await send('Page.navigate', { url: `${base}/robots.txt` });
  await sleep(300);
  await evaluate(`localStorage.setItem('famstory.locale', JSON.stringify({ locale: '${locale}' })); localStorage.setItem('famstory.appearance', JSON.stringify({ preference: '${appearance}' })); ${session ? `localStorage.setItem('famstory.session', JSON.stringify(${JSON.stringify(session)}));` : "localStorage.removeItem('famstory.session');"} 'ok'`);
}

await send('Page.enable');
await send('Runtime.enable');

if (only === 'all' || only === 'phone') {
  // The phone, light, Latvian - every screen.
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
  await setUp(DEMO);
  await visit(DEMO, '/welcome', 'p-welcome', { latvian: true });
  await visit(DEMO, '/?source=installed', 'p-signin', { latvian: true });
  await press('Pieteikties');
  await sleep(2500);
  for (const [route, name] of SIGNED_IN) await visit(DEMO, route, `p-${name}`, { latvian: true });

  // The smallest phone still sold: an iPhone SE, 375x667.
  await send('Emulation.setDeviceMetricsOverride', { width: 375, height: 667, deviceScaleFactor: 1, mobile: true });
  for (const [route, name] of SIGNED_IN.slice(0, 9)) await visit(DEMO, route, `se-${name}`, { latvian: true });
}

if (only === 'all' || only === 'dark') {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
  await setUp(DEMO, { appearance: 'dark', session: { kind: 'existing', onboardingComplete: true } });
  for (const [route, name] of SIGNED_IN) await visit(DEMO, route, `d-${name}`, { latvian: true });
  await setUp(DEMO, { appearance: 'dark' });
  await visit(DEMO, '/welcome', 'd-welcome', { latvian: true });
  await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
}

if (only === 'all' || only === 'english') {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await setUp(DEMO, { locale: 'en', session: { kind: 'existing', onboardingComplete: true } });
  for (const [route, name] of SIGNED_IN) await visit(DEMO, route, `e-${name}`);
}

if (only === 'all' || only === 'computer') {
  await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await setUp(DEMO, { session: { kind: 'existing', onboardingComplete: true } });
  for (const [route, name] of SIGNED_IN.slice(0, 10)) await visit(DEMO, route, `c-${name}`, { latvian: true });
  await setUp(DEMO);
  await visit(DEMO, '/welcome', 'c-welcome', { latvian: true });
}

if (only === 'all' || only === 'real') {
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await setUp(REAL);
  await visit(REAL, '/welcome', 'r-welcome', { latvian: true });
  await visit(REAL, '/?source=installed', 'r-signin', { latvian: true });
  await visit(REAL, '/join/NOSUCH', 'r-join-bogus', { latvian: true });
  await visit(REAL, '/guest/nosuchtoken', 'r-guest-bogus', { latvian: true });
  await visit(REAL, '/reset/nosuchtoken', 'r-reset-bogus', { latvian: true });
  await visit(REAL, '/support', 'r-support', { latvian: true });
  await visit(REAL, '/legal/privacy', 'r-legal-privacy', { latvian: true });
}

writeFileSync(`${OUT}/report.json`, JSON.stringify(report, null, 1));
const bad = report.filter((r) => r.broken || r.wide || r.thrown.length || r.logged.length);
console.log(`\n${report.length} pages, ${bad.length} with errors or overflow`);
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
