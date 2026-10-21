#!/usr/bin/env node
/**
 * THE STORE SCREENSHOTS, from the demo on the sample family.
 *
 *     node tools/store/screenshots.mjs [--demo http://localhost:8090]
 *
 * For the store sizes (docs/store/listing.md, Screenshots):
 *   - iPhone 6.9" (1320 x 2868)
 *   - an Android phone (1080 x 2340)
 * in Latvian and English, plus Google's feature graphic (1024 x 500). Drawn
 * by a headless Edge on the web build, which is the same components the
 * phones run. The final set should come from the native app once it runs.
 *
 * Writes tools/store/out/ (ignored by git). Edge is driven over the DevTools
 * protocol with a profile of its own, removed afterwards, and closed with
 * Browser.close: on Windows the process that was started is not the one
 * that keeps running, so killing it closes nothing.
 */
import { spawn } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(here, 'out');
const flag = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 1 ? process.argv[at + 1] : undefined;
};
const DEMO = flag('demo') ?? 'http://localhost:8090';
const EDGE = 'C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe';
const PORT = 9374;

/** CSS size and pixel ratio for each store's frame. */
const DEVICES = {
  iphone: { width: 440, height: 956, scale: 3 }, // 1320 x 2868
  android: { width: 360, height: 780, scale: 3 }, // 1080 x 2340
};

/** What a family app shows first, then what makes it this one. */
const SCREENS = [
  { name: 'timeline', path: '/' },
  { name: 'event', path: '/event/evt_school' },
  { name: 'calendar', path: '/calendar' },
  { name: 'family', path: '/family' },
  { name: 'compose', path: '/event/new' },
];

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  mkdirSync(OUT, { recursive: true });
  const profile = mkdtempSync(path.join(tmpdir(), 'famstory-store-'));
  spawn(EDGE, ['--headless=new', `--remote-debugging-port=${PORT}`, `--user-data-dir=${profile}`, '--no-first-run', 'about:blank']);

  let targets = null;
  for (let i = 0; i < 80 && !targets; i++) {
    try {
      targets = await (await fetch(`http://127.0.0.1:${PORT}/json/list`)).json();
    } catch {
      await sleep(250);
    }
  }
  const ws = new WebSocket(targets.find((t) => t.type === 'page').webSocketDebuggerUrl);
  await new Promise((resolve) => ws.addEventListener('open', resolve));
  let seq = 0;
  const pending = new Map();
  ws.addEventListener('message', (m) => {
    const msg = JSON.parse(m.data);
    if (msg.id && pending.has(msg.id)) {
      pending.get(msg.id)(msg);
      pending.delete(msg.id);
    }
  });
  const send = (method, params = {}) =>
    new Promise((resolve) => {
      const id = ++seq;
      pending.set(id, resolve);
      ws.send(JSON.stringify({ id, method, params }));
    });
  const evaluate = async (expression) =>
    (await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })).result?.result?.value;
  const shot = async (file) => {
    const pic = await send('Page.captureScreenshot', { format: 'png' });
    writeFileSync(path.join(OUT, file), Buffer.from(pic.result.data, 'base64'));
    console.log(`  ${file}`);
  };
  /** Waits until the page shows a text, or gives up quietly after a while. */
  const waitFor = async (pattern, ms = 15000) => {
    const until = Date.now() + ms;
    while (Date.now() < until) {
      const text = await evaluate('document.body ? document.body.innerText : ""');
      if (new RegExp(pattern).test(text ?? '')) return true;
      await sleep(250);
    }
    return false;
  };

  try {
    await send('Page.enable');
    await send('Runtime.enable');

    // --only graphic: just the feature graphic, without the minutes of screens.
    for (const [device, size] of flag('only') === 'graphic' ? [] : Object.entries(DEVICES)) {
      for (const locale of ['lv', 'en']) {
        await send('Emulation.setDeviceMetricsOverride', {
          width: size.width,
          height: size.height,
          deviceScaleFactor: size.scale,
          mobile: true,
        });
        // A fresh start in this language, light, on the sample family.
        await send('Page.navigate', { url: `${DEMO}/robots.txt` });
        await sleep(400);
        await evaluate(
          `localStorage.clear(); localStorage.setItem('famstory.locale', JSON.stringify({ locale: '${locale}' })); localStorage.setItem('famstory.appearance', JSON.stringify({ preference: 'light' })); 'ok'`,
        );
        await send('Page.navigate', { url: `${DEMO}/?source=installed` });
        await waitFor(locale === 'lv' ? 'Pieteikties' : 'Sign in');
        await evaluate(`(() => {
          const label = ${JSON.stringify(locale === 'lv' ? 'Pieteikties' : 'Sign in')};
          const all = [...document.querySelectorAll('*')].filter((n) => n.textContent.trim() === label && n.getBoundingClientRect().width > 0);
          const button = all.filter((n) => ![...n.children].some((c) => all.includes(c))).at(-1);
          button?.click();
          return Boolean(button);
        })()`);
        await waitFor('Bergu');

        for (const [at, screen] of SCREENS.entries()) {
          await send('Page.navigate', { url: `${DEMO}${screen.path}` });
          await waitFor('\\S', 15000);
          // Fonts, photographs and the entrance motion settle.
          await sleep(3500);
          await shot(`${device}-${locale}-${at + 1}-${screen.name}.png`);
        }
      }
    }

    // Google's feature graphic: the icon and the promise, on Paper - the
    // icon is Evergreen, and on Evergreen it would vanish. The icon goes in
    // as data: a page made from a data: address may not load from the server.
    await send('Emulation.setDeviceMetricsOverride', { width: 1024, height: 500, deviceScaleFactor: 1, mobile: false });
    const icon = Buffer.from(await (await fetch(`${DEMO}/icon-512.png`)).arrayBuffer()).toString('base64');
    for (const locale of ['lv', 'en']) {
      const line = locale === 'lv' ? 'Ģimenes stāsts un kalendārs' : "Your family's story and calendar";
      const html = `<!doctype html><html><head><meta charset="utf-8"><style>
        html,body{margin:0;width:1024px;height:500px;background:#F4F1EA;color:#17160F;font-family:Georgia,'Times New Roman',serif}
        main{display:flex;align-items:center;gap:56px;height:100%;padding:0 88px;box-sizing:border-box}
        img{width:200px;height:200px;border-radius:44px;box-shadow:0 12px 40px rgba(23,22,15,.18)}
        h1{margin:0 0 12px;font-size:84px;font-weight:600;letter-spacing:-1px}
        p{margin:0;font:400 34px/1.3 system-ui,'Segoe UI',sans-serif;color:#6E6A61}
      </style></head><body><main><img src="data:image/png;base64,${icon}" alt=""><div><h1>FamStory</h1><p>${line}</p></div></main></body></html>`;
      await send('Page.navigate', { url: `data:text/html;base64,${Buffer.from(html).toString('base64')}` });
      await sleep(1500);
      await shot(`feature-graphic-${locale}.png`);
    }
  } finally {
    try {
      const version = await (await fetch(`http://127.0.0.1:${PORT}/json/version`)).json();
      const browser = new WebSocket(version.webSocketDebuggerUrl);
      await new Promise((resolve) => browser.addEventListener('open', resolve));
      browser.send(JSON.stringify({ id: 1, method: 'Browser.close' }));
      await sleep(1500);
    } catch {
      // Already gone.
    }
    ws.close();
    // Edge lets go of its profile a moment after it closes.
    try {
      rmSync(profile, { recursive: true, force: true, maxRetries: 20, retryDelay: 500 });
    } catch {
      console.warn(`left behind: ${profile}`);
    }
  }
}

await main();
