/**
 * Serves the web build to the local network, and passes /v1 through to the API.
 *
 * WHY ONE ORIGIN. Other computers on the network open this machine's address
 * and get the app. If the app then called the API at a fixed IP, that IP would
 * be baked into the bundle — a working setup right up until the router hands
 * this machine a new lease, after which every other device loses the app at
 * once with nothing on screen to explain it. Serving the page and proxying /v1
 * from the same place means the bundle asks for `/v1`, and `/v1` is wherever
 * the page came from. No IP anywhere, no CORS, and only one port to reach.
 *
 * WHY NOT `npx serve`. It resolves over the network at startup, and this starts
 * at logon — possibly before the laptop has joined a network at all. This file
 * has no dependencies but Node itself.
 *
 * Not an open proxy: it forwards `/v1` to one fixed upstream and nothing else.
 *
 * `/phone` is a page of its own: the app inside a phone-sized frame, for seeing
 * on a computer what it looks like on a phone (phone.html, next to this file).
 * `/phone/addresses` tells that page where a real phone can open this server -
 * on the local network, and from anywhere through Tailscale -
 * and `/phone/copies` where the other copy is - the demo, or the real app.
 * `/real` is the demo's way out, to the real copy (THE TWO COPIES, below).
 *
 *   node tools/lan-host/static-server.mjs
 *   node tools/lan-host/static-server.mjs --root apps/mobile/dist-web-demo --port 8090 --api none
 *
 * Options, flag or environment (all optional; a flag wins):
 *   --root  FAMSTORY_WEB_ROOT   the export to serve        default apps/mobile/dist-web
 *   --port  FAMSTORY_WEB_PORT   port to listen on          default 8081
 *   --api   FAMSTORY_API        where /v1 goes, or "none"  default http://127.0.0.1:3000
 *   --pair  FAMSTORY_PAIR       the real and demo ports    default 8081=8090,443=8443
 *
 * The demo copy runs with `--api none`. It is the app on sample data, and it has
 * no business reaching the family's real server.
 */

import { execFile } from 'node:child_process';
import { createReadStream, existsSync, statSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { pipeline } from 'node:stream';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';

function flag(name) {
  const at = process.argv.indexOf(`--${name}`);
  return at > 1 ? process.argv[at + 1] : undefined;
}

const here = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(
  flag('root') ?? process.env.FAMSTORY_WEB_ROOT ?? path.join(here, '..', '..', 'apps', 'mobile', 'dist-web'),
);
const PORT = Number(flag('port') ?? process.env.FAMSTORY_WEB_PORT ?? 8081);
const API_SETTING = flag('api') ?? process.env.FAMSTORY_API ?? 'http://127.0.0.1:3000';
const API = API_SETTING === 'none' ? null : new URL(API_SETTING);
const PHONE_PAGE = path.join(here, 'phone.html');
const NOT_PUBLIC_PAGE = path.join(here, 'not-public.html');

/**
 * THE TWO COPIES: the real app, and the demo on sample data, served side by
 * side on this machine (supervisor.ps1) - on the local network on 8081 and
 * 8090, through Tailscale on 443 and 8443 (README.md). Each pair is the real
 * copy's port and the demo's as a browser sees them: a request that came in
 * on one finds the other on the same host name, at the other port of its
 * pair. It is how the demo's "Start your own family" reaches the real app
 * (/real) and how the phone view goes between the two (/phone/copies) - with
 * no address written into either, as with /v1. Tailscale passes the host the
 * browser asked for, port and all, and says it was https.
 */
const COPY = API ? 'real' : 'demo';
const PAIRS = String(flag('pair') ?? process.env.FAMSTORY_PAIR ?? '8081=8090,443=8443')
  .split(',')
  .map((part) => part.split('=').map((port) => port.trim()))
  .filter((pair) => pair.length === 2 && pair.every((port) => /^\d+$/.test(port)))
  .map(([real, demo]) => ({ real, demo }));

/**
 * The other copy's origin for this request, or null when it came in on a port
 * no pair names - or from the internet through Tailscale Funnel, which opens
 * the demo alone: the real copy stays in the tailnet, where this visitor
 * cannot follow (README.md, "Anybody with the link"). Tailscale marks those
 * requests itself and removes the header from any that bring their own.
 */
function otherCopy(req) {
  if (req.headers['tailscale-funnel-request']) return null;
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() === 'https' ? 'https' : 'http';
  const host = /^(\[[0-9a-f:.]+\]|[a-z0-9.-]+)(?::(\d+))?$/i.exec(String(req.headers.host ?? ''));
  if (!host) return null;
  const [, name, port = proto === 'https' ? '443' : '80'] = host;
  const pair = PAIRS.find((p) => p[COPY] === port);
  if (!pair) return null;
  const other = pair[COPY === 'real' ? 'demo' : 'real'];
  const usual = other === (proto === 'https' ? '443' : '80');
  return `${proto}://${name}${usual ? '' : `:${other}`}`;
}

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.ttf': 'font/ttf',
  '.otf': 'font/otf',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
  // What makes the web app installable (public/manifest.webmanifest).
  '.webmanifest': 'application/manifest+json; charset=utf-8',
  '.wav': 'audio/wav',
};

/**
 * THE FRONT DOOR is the only thing a search engine may index: the welcome
 * page, where somebody who typed "FamStory" into a search box should land.
 * Everything else stays out of every index - above all a guest link pasted
 * somewhere public, one crawl away from a child's photographs otherwise.
 * The same rule is in tools/deploy/Caddyfile for the server.
 */
const INDEXABLE = new Set(['/', '/welcome']);

/**
 * Where the site is, for robots.txt and the sitemap: FAMSTORY_PUBLIC_ORIGIN
 * when it is set (a domain), else the address the request came in on.
 */
function originOf(req) {
  if (process.env.FAMSTORY_PUBLIC_ORIGIN) return process.env.FAMSTORY_PUBLIC_ORIGIN.replace(/\/$/, '');
  const proto = String(req.headers['x-forwarded-proto'] ?? '').split(',')[0].trim() || 'http';
  return `${proto}://${req.headers.host ?? 'localhost'}`;
}

function robots(origin) {
  // Pages are closed; the welcome page and what it needs to draw are open -
  // a crawler that may not fetch the scripts cannot see the page.
  return [
    'User-agent: *',
    'Allow: /$',
    'Allow: /welcome$',
    'Allow: /_expo/',
    'Allow: /assets/',
    'Allow: /favicon.ico',
    'Allow: /og-image.png',
    'Allow: /icon-',
    'Allow: /apple-touch-icon.png',
    'Allow: /manifest.webmanifest',
    'Disallow: /',
    '',
    `Sitemap: ${origin}/sitemap.xml`,
    '',
  ].join('\n');
}

function sitemap(origin) {
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    `  <url><loc>${origin}/welcome</loc><changefreq>weekly</changefreq><priority>1.0</priority></url>`,
    '</urlset>',
    '',
  ].join('\n');
}

function isFile(p) {
  try {
    return statSync(p).isFile();
  } catch {
    return false;
  }
}

/**
 * Map a URL path to a file inside ROOT, or null.
 *
 * The containment check is the whole security of this server: without it,
 * `/..%2F..%2Fapps/api/.env` would hand the JWT secret to anyone on the network.
 */
function resolveFile(urlPath) {
  let decoded;
  try {
    decoded = decodeURIComponent(urlPath);
  } catch {
    return null;
  }
  const candidate = path.resolve(ROOT, '.' + path.posix.normalize('/' + decoded));
  if (candidate !== ROOT && !candidate.startsWith(ROOT + path.sep)) return null;

  if (isFile(candidate)) return candidate;
  // Expo's static export writes one .html per route: /calendar -> calendar.html
  if (isFile(candidate + '.html')) return candidate + '.html';
  if (isFile(path.join(candidate, 'index.html'))) return path.join(candidate, 'index.html');
  return null;
}

/** Whether the request's Accept-Encoding allows `coding` (and does not say q=0). */
function accepts(req, coding) {
  const header = String(req.headers['accept-encoding'] ?? '').toLowerCase();
  return header.split(',').some((part) => {
    const [name, ...params] = part.trim().split(';');
    if (name.trim() !== coding) return false;
    const q = params.map((p) => p.trim()).find((p) => p.startsWith('q='));
    return !q || Number(q.slice(2)) > 0;
  });
}

/**
 * The precompressed copy of `file` this browser can take, if there is one
 * (precompress.mjs writes them at publish).
 *
 * Only a copy at least as new as the file itself: a publish replaces the page
 * and its .br a moment apart, and in that moment an old .br next to a new page
 * would serve yesterday's app under today's name.
 */
function compressedCopy(req, file) {
  const original = statSync(file, { throwIfNoEntry: false });
  if (!original) return null;
  for (const [coding, suffix] of [
    ['br', '.br'],
    ['gzip', '.gz'],
  ]) {
    if (!accepts(req, coding)) continue;
    const copy = statSync(file + suffix, { throwIfNoEntry: false });
    if (copy?.isFile() && copy.mtimeMs >= original.mtimeMs) return { coding, path: file + suffix };
  }
  return null;
}

function serveFile(req, res, file, status = 200, indexable = false) {
  const ext = path.extname(file).toLowerCase();
  const headers = { 'Content-Type': TYPES[ext] ?? 'application/octet-stream' };

  // Hashed bundles and assets never change under the same name; pages always
  // might. (Expo writes the content hash into every asset's file name.)
  const hashed =
    file.includes(`${path.sep}_expo${path.sep}static${path.sep}`) ||
    file.startsWith(path.join(ROOT, 'assets') + path.sep);
  headers['Cache-Control'] = hashed ? 'public, max-age=31536000, immutable' : 'no-cache';

  // A 4 MB bundle is about 700 KB as brotli - the difference between the app
  // opening and a phone on mobile data giving up on it.
  const compressed = compressedCopy(req, file);
  headers.Vary = 'Accept-Encoding';
  if (compressed) headers['Content-Encoding'] = compressed.coding;

  // Nothing but the front door is for a search engine (INDEXABLE, above).
  if (!indexable) headers['X-Robots-Tag'] = 'noindex, nofollow';

  res.writeHead(status, headers);
  // pipeline, not pipe: when the browser gives up on a request halfway (a page
  // left before its fonts arrived), .pipe() stops writing but never closes the
  // file. Each one leaked a handle, and on Windows an open handle keeps the file
  // from being replaced or deleted — found when an old build refused to go away.
  pipeline(createReadStream(compressed?.path ?? file), res, () => {});
}

function proxy(req, res) {
  const upstream = http.request(
    {
      protocol: API.protocol,
      hostname: API.hostname,
      port: API.port,
      method: req.method,
      path: req.url,
      headers: {
        ...req.headers,
        host: API.host,
        // Who actually asked. The API sees every request coming from this
        // machine, so without this its rate limiter would count the whole
        // house as one caller and its audit log would record one address for
        // everybody. Overwritten rather than appended on purpose: this server
        // is the edge, so a header the caller sent themselves is a claim about
        // their own identity and worth nothing.
        'x-forwarded-for': req.socket.remoteAddress ?? '',
        'x-forwarded-proto': 'http',
      },
    },
    (up) => {
      res.writeHead(up.statusCode ?? 502, up.headers);
      // Same reason as serveFile: a reader who leaves must release the upstream.
      pipeline(up, res, () => {});
    },
  );

  upstream.on('error', () => {
    if (res.headersSent) {
      res.destroy();
      return;
    }
    // Shaped like the API's own errors, so the app's HttpClient turns it into
    // a readable message rather than "Unexpected token < in JSON".
    res.writeHead(502, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(
      JSON.stringify({
        error: {
          code: 'api_unreachable',
          message: 'The FamStory server on this computer is not running.',
        },
      }),
    );
  });

  // Plain pipe on this side, deliberately: pipeline would destroy the browser's
  // connection along with a failed upstream, and the 502 above would never
  // arrive to say that the server is down.
  req.pipe(upstream);
}

/**
 * WHERE A PHONE ON THIS NETWORK CAN OPEN THIS SERVER, for the phone view's
 * "Open on a phone" panel: this machine's addresses on the local networks it
 * is connected to right now, each as a link and a QR code.
 *
 * Asked at the moment, never written down: the laptop moves between the cable
 * and the Wi-Fi and the router hands out new leases. On 2026-09-28 the Wi-Fi
 * was off, Windows still listed its old address, and a link given out from
 * that list led a phone to an address nobody answered. Node lists only the
 * adapters that are up.
 *
 * Private IPv4 only: not loopback, not Tailscale's 100.64/10 (those links are
 * in README.md), not the virtual switches WSL and Hyper-V make.
 */
function lanAddresses() {
  const found = [];
  for (const [name, entries] of Object.entries(os.networkInterfaces())) {
    if (/vEthernet|WSL|Hyper-V|VirtualBox|VMware|Loopback/i.test(name)) continue;
    for (const entry of entries ?? []) {
      if (entry.family !== 'IPv4' || entry.internal) continue;
      if (!/^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/.test(entry.address)) continue;
      found.push({ name, url: `http://${entry.address}:${PORT}/` });
    }
  }
  return found;
}

// The codes come from the app's own qrcode package, loaded the first time
// they are asked for: this server still starts on Node alone, and without
// the package the panel shows the links alone.
let qrcode;
async function qrSvg(text) {
  if (qrcode === undefined) {
    try {
      qrcode = createRequire(path.join(here, '..', '..', 'apps', 'mobile', 'package.json'))('qrcode');
    } catch {
      qrcode = null;
    }
  }
  if (!qrcode) return null;
  try {
    return await qrcode.toString(text, {
      type: 'svg',
      margin: 2,
      errorCorrectionLevel: 'M',
      color: { dark: '#16150E', light: '#FFFFFF' },
    });
  } catch {
    return null;
  }
}

/**
 * WHERE ANY PHONE CAN OPEN THIS SERVER, from any network: this copy's
 * Tailscale address (THE TWO COPIES: https on 443 for the real app, on 8443
 * for the demo), while Tailscale runs on this machine. Asked of Tailscale
 * itself when the panel opens, like the local addresses - the machine's name
 * in the tailnet can change. The phone has to be in the tailnet: the
 * Tailscale app signed in to the same account, or the machine shared with
 * whoever holds it - unless Funnel opens the address to everybody (funneled,
 * below).
 */
const execFileP = promisify(execFile);
const TAILSCALE = ['C:\\Program Files\\Tailscale\\tailscale.exe', '/usr/bin/tailscale', '/usr/local/bin/tailscale'].find(
  (candidate) => existsSync(candidate),
) ?? 'tailscale';
let tailscaleAsked = { at: 0, address: null };

async function tailscaleAddress() {
  if (Date.now() - tailscaleAsked.at < 30_000) return tailscaleAsked.address;
  let address = null;
  try {
    const { stdout } = await execFileP(TAILSCALE, ['status', '--json'], { timeout: 4000, windowsHide: true });
    const self = JSON.parse(stdout)?.Self;
    const name = String(self?.DNSName ?? '').replace(/\.$/, '');
    // The pair that is not this server's own port is the one Tailscale serves.
    const port = PAIRS.find((pair) => pair[COPY] !== String(PORT))?.[COPY];
    if (name && self?.Online !== false && port) {
      address = {
        url: `https://${name}${port === '443' ? '' : `:${port}`}/`,
        public: await funneled(`${name}:${port}`),
      };
    }
  } catch {
    // Not installed, not running, not signed in: the panel shows the local addresses alone.
  }
  tailscaleAsked = { at: Date.now(), address };
  return address;
}

/**
 * Whether Tailscale Funnel opens this name and port to the internet: then the
 * link is for anybody, with no Tailscale on the phone (README.md, "Anybody
 * with the link"). Only ever the demo's.
 */
async function funneled(hostPort) {
  try {
    const { stdout } = await execFileP(TAILSCALE, ['serve', 'status', '--json'], { timeout: 4000, windowsHide: true });
    return JSON.parse(stdout)?.AllowFunnel?.[hostPort] === true;
  } catch {
    return false;
  }
}

async function answerAddresses(req, res) {
  const addresses = await Promise.all(lanAddresses().map(async (a) => ({ ...a, qr: await qrSvg(a.url) })));
  const anywhere = await tailscaleAddress();
  const tailscale = anywhere ? { ...anywhere, qr: await qrSvg(anywhere.url) } : null;
  res.writeHead(200, {
    'Content-Type': TYPES['.json'],
    'Cache-Control': 'no-store',
    'X-Robots-Tag': 'noindex, nofollow',
  });
  res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ addresses, tailscale }));
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url ?? '/', 'http://local');

  if (url.pathname === '/v1' || url.pathname.startsWith('/v1/')) {
    if (API) {
      proxy(req, res);
    } else {
      res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
      res.end(
        JSON.stringify({
          error: { code: 'not_found', message: 'This copy of FamStory runs on sample data and has no server.' },
        }),
      );
    }
    return;
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.writeHead(405, { Allow: 'GET, HEAD' });
    res.end();
    return;
  }

  // Ahead of the export's own files: the app has no /phone route, so the
  // fallback below would otherwise answer this path with the app itself.
  if (url.pathname === '/phone' || url.pathname === '/phone/') {
    serveFile(req, res, PHONE_PAGE);
    return;
  }
  if (url.pathname === '/phone/addresses') {
    answerAddresses(req, res).catch(() => {
      if (!res.headersSent) res.writeHead(500);
      res.end();
    });
    return;
  }
  // Which copy this is, and where the other one is (THE TWO COPIES, above).
  if (url.pathname === '/phone/copies') {
    res.writeHead(200, {
      'Content-Type': TYPES['.json'],
      'Cache-Control': 'no-store',
      'X-Robots-Tag': 'noindex, nofollow',
    });
    res.end(req.method === 'HEAD' ? undefined : JSON.stringify({ copy: COPY, other: otherCopy(req) }));
    return;
  }
  // The demo's way out: /real and the path after it, on the real copy. On the
  // real copy itself it is only its own page - a link never leads nowhere.
  if (url.pathname === '/real' || url.pathname.startsWith('/real/')) {
    const rest = '/' + url.pathname.slice('/real'.length).replace(/^\/+/, '');
    const origin = COPY === 'real' ? '' : otherCopy(req);
    if (origin === null) {
      // No real copy this visitor can reach: a page that says so, and the way back.
      serveFile(req, res, NOT_PUBLIC_PAGE);
      return;
    }
    res.writeHead(302, { Location: origin + rest + url.search, 'Cache-Control': 'no-store', 'X-Robots-Tag': 'noindex, nofollow' });
    res.end();
    return;
  }

  // For search engines: what they may read, and where the front door is.
  if (url.pathname === '/robots.txt' || url.pathname === '/sitemap.xml') {
    const robotsFile = url.pathname === '/robots.txt';
    res.writeHead(200, {
      'Content-Type': robotsFile ? TYPES['.txt'] : TYPES['.xml'],
      'Cache-Control': 'no-cache',
    });
    res.end(req.method === 'HEAD' ? undefined : (robotsFile ? robots : sitemap)(originOf(req)));
    return;
  }

  const indexable = INDEXABLE.has(url.pathname);
  const file = resolveFile(url.pathname);
  if (file) {
    serveFile(req, res, file, 200, indexable);
    return;
  }

  // Anything else is a route the client-side router owns — hand it the app.
  const index = path.join(ROOT, 'index.html');
  if (isFile(index)) {
    serveFile(req, res, index, 200, indexable);
    return;
  }

  res.writeHead(503, { 'Content-Type': 'text/plain; charset=utf-8' });
  res.end(`No web build at ${ROOT}. Run: npx expo export --platform web --output-dir dist-web`);
});

server.listen(PORT, '0.0.0.0', () => {
  const upstream = API ? API.origin : 'none (sample data)';
  console.log(`[${new Date().toISOString()}] serving ${ROOT} on :${PORT}, /v1 -> ${upstream}`);
});
