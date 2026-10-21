// The flows the 2026-10-10 review changed, pressed through on the demo in
// headless Edge: renaming the family, an invitation "by email", the first
// paint in dark mode, and the screens whose layout moved. Pictures go to
// flows/ in the checks' folder (out.mjs).
import { outDir } from './out.mjs';
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const OUT = outDir('flows');
rmSync(OUT, { recursive: true, force: true });
mkdirSync(OUT, { recursive: true });
const DEMO = 'http://localhost:8090';
const port = 9373;
const profile = mkdtempSync(path.join(tmpdir(), 'famstory-flows-'));
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
const where = (selector) =>
  evaluate(`(() => { const el = ${selector}; if (!el) return null; const r = el.getBoundingClientRect(); return r.width ? { x: r.x + r.width / 2, y: r.y + r.height / 2 } : null; })()`);
const byText = (text) =>
  `(() => { const all = [...document.querySelectorAll('*')].filter((n) => n.textContent.trim() === ${JSON.stringify(text)} && n.getBoundingClientRect().width > 0); return all.filter((n) => ![...n.children].some((c) => all.includes(c)))[0]; })()`;
const byLabel = (label) => `document.querySelector('[aria-label=${JSON.stringify(label)}]')`;
async function press(selector) {
  for (let t = 0; t < 8000; t += 250) {
    const at = await where(selector);
    if (at) {
      await click(at);
      return true;
    }
    await sleep(250);
  }
  return false;
}
const shot = async (name) => {
  const s = await send('Page.captureScreenshot', { format: 'png' });
  writeFileSync(`${OUT}/${name}.png`, Buffer.from(s.result.data, 'base64'));
};
const results = [];
const check = (name, ok, detail = '') => {
  results.push({ name, ok });
  console.log(`${ok ? 'ok  ' : 'FAIL'}  ${name}${detail && !ok ? `  (${detail})` : ''}`);
};
async function setUp({ locale = 'lv', appearance = 'light', session = { kind: 'existing', onboardingComplete: true } } = {}) {
  await send('Page.navigate', { url: `${DEMO}/robots.txt` });
  await sleep(300);
  await evaluate(`localStorage.clear(); localStorage.setItem('famstory.locale', JSON.stringify({ locale: '${locale}' })); localStorage.setItem('famstory.appearance', JSON.stringify({ preference: '${appearance}' })); ${session ? `localStorage.setItem('famstory.session', JSON.stringify(${JSON.stringify(session)}));` : ''} 'ok'`);
}
const go = async (route, settle = 2500) => {
  events = [];
  await send('Page.navigate', { url: DEMO + route });
  await sleep(settle);
};
const thrown = () => events.filter((e) => e.method === 'Runtime.exceptionThrown').map((e) => e.params.exceptionDetails.exception?.description?.split('\n')[0]);

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });

// 1. The first paint in dark mode: the page's own ground, before the app draws.
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'dark' }] });
await setUp({ appearance: 'dark' });
await send('Page.navigate', { url: `${DEMO}/` });
await sleep(150);
const ground = await evaluate(`getComputedStyle(document.body).backgroundColor`);
check('dark mode: the page is dark before the app draws', ground === 'rgb(22, 21, 14)', ground);
await sleep(2500);
await send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-color-scheme', value: 'light' }] });
// The choice in the app wins over the device: dark chosen on a light device.
await setUp({ appearance: 'dark' });
await send('Page.navigate', { url: `${DEMO}/` });
await sleep(150);
const chosen = await evaluate(`getComputedStyle(document.body).backgroundColor`);
check('a dark choice on a light device: dark from the first paint', chosen === 'rgb(22, 21, 14)', chosen);
await sleep(2000);

// 2. Renaming the family.
await setUp();
await go('/family');
check('the Family tab offers the rename to an administrator', Boolean(await where(byLabel('Mainīt ģimenes nosaukumu'))));
await press(byLabel('Mainīt ģimenes nosaukumu'));
await sleep(1500);
check('the rename screen opens', (await evaluate('location.pathname')) === '/family/edit');
const field = await where(`document.querySelector('input')`);
if (field) await click(field);
await send('Input.dispatchKeyEvent', { type: 'keyDown', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
await send('Input.dispatchKeyEvent', { type: 'keyUp', modifiers: 2, key: 'a', code: 'KeyA', windowsVirtualKeyCode: 65 });
await send('Input.insertText', { text: 'Ozolu ģimene' });
await sleep(300);
await shot('rename-screen');
await press(byText('Saglabāt'));
await sleep(1500);
const header = await evaluate(`document.body.innerText.split('\\n').map((l) => l.trim()).filter(Boolean)[0]`);
check('the Family tab shows the new name', header === 'Ozolu ģimene', header);
await shot('family-renamed');
// A member who is not an administrator: no pencil, and the address sends them back.
const martin = await evaluate(`(() => { const s = JSON.parse(localStorage.getItem('famstory.session') || '{}'); return JSON.stringify(s); })()`);
check('no screen threw while renaming', thrown().length === 0, JSON.stringify(thrown()));

// 3. An invitation by email: the mail program is asked, the code is shown.
await go('/family/invite');
const email = await where(`document.querySelector('input[type=email], input[inputmode=email], input')`);
if (email) await click(email);
await send('Input.insertText', { text: 'janis@example.com' });
await sleep(300);
await evaluate(`window.__mailto = null; window.addEventListener('beforeunload', () => {}); 'ok'`);
// Record where the page was sent instead of letting a mail program open.
await send('Page.setInterceptFileChooserDialog', { enabled: false }).catch(() => {});
let mailto = null;
const navListener = (m) => {
  const msg = JSON.parse(m.data);
  if (msg.method === 'Page.frameRequestedNavigation' || msg.method === 'Page.navigatedWithinDocument') {
    if (String(msg.params?.url ?? '').startsWith('mailto:')) mailto = msg.params.url;
  }
};
ws.addEventListener('message', navListener);
await press(byText('Nosūtīt pa e-pastu'));
await sleep(2000);
ws.removeEventListener('message', navListener);
const code = await evaluate(`/FAM-[A-Z0-9]{4}/.test(document.body.innerText)`);
check('the invitation is made and its code shown', code === true);
check('the mail program is asked, addressed and written', Boolean(mailto) && mailto.includes('janis@example.com') && mailto.includes('subject='), mailto ?? 'no mailto navigation seen');
if (mailto) console.log('      ' + decodeURIComponent(mailto).slice(0, 220).replace(/\n/g, ' / '));
await shot('invite-after-email');

// 3b. "Forgot your password?" on the family's real copy: no mail provider
// on the LAN host, so the screen sends people to the family admin.
{
  const REAL = 'http://localhost:8081';
  await send('Page.navigate', { url: `${REAL}/robots.txt` });
  await sleep(300);
  await evaluate(`localStorage.clear(); localStorage.setItem('famstory.locale', JSON.stringify({ locale: 'lv' })); 'ok'`);
  events = [];
  await send('Page.navigate', { url: `${REAL}/sign-in` });
  await sleep(2500);
  check('sign-in offers "Aizmirsi paroli?"', Boolean(await where(byText('Aizmirsi paroli?'))));
  await press(byText('Aizmirsi paroli?'));
  await sleep(2500);
  check('it opens the forgot screen', (await evaluate('location.pathname')) === '/forgot');
  const said = await evaluate('document.body.innerText');
  check('without a mail provider it sends people to the family admin', /administrator/.test(said), said.slice(0, 160));
  check('the forgot screen threw nothing', thrown().length === 0, JSON.stringify(thrown()));
  await shot('forgot-lan');
  // The settings screen in a browser: no "On this phone" - a browser has no pushes.
  await setUp();
  await go('/settings');
  check('a browser shows no push switch', !/Šajā telefonā/.test(await evaluate('document.body.innerText')));
}

// 4. The screens whose layout moved.
for (const [route, name] of [
  ['/search', 'search'],
  ['/recap', 'recap'],
  ['/profile', 'profile'],
  ['/notifications', 'notifications'],
  ['/settings', 'settings'],
  ['/film', 'film'],
]) {
  await go(route);
  await shot(name);
  const strips = name === 'search'
    ? await evaluate(`[...document.querySelectorAll('[role=button]')].filter((b) => /Augšana|Anna|2026/.test(b.textContent)).map((b) => Math.round(b.getBoundingClientRect().height))`)
    : null;
  if (strips) check('search: every filter strip keeps its height', strips.length >= 3 && strips.every((h) => h >= 28), JSON.stringify(strips));
  check(`${name}: no error`, thrown().length === 0, JSON.stringify(thrown()));
}
const settingsText = await (async () => { await go('/settings'); return evaluate('document.body.innerText'); })();
check('settings no longer claims encryption at rest', !/glabāšanā/.test(settingsText) && /ceļā starp tavu telefonu un serveri/.test(settingsText));

console.log(`\n${results.filter((r) => r.ok).length}/${results.length} ok`);
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
