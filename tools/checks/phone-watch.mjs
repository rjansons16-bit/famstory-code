// One line when a device other than this laptop opens a connection to Metro
// (8082), and one when its last connection closes. Expo Go keeps a websocket
// open while the app runs, so "connected" with no "closed" means it is open.
import { execFile } from 'node:child_process';
import os from 'node:os';

// This laptop's own addresses, whichever network it is on today.
const SELF = new Set(['0.0.0.0', '::', ...Object.values(os.networkInterfaces()).flat().map((a) => a.address)]);
let seen = new Set();

function tick() {
  execFile('netstat', ['-an'], { windowsHide: true }, (error, out) => {
    if (error) return;
    const now = new Set();
    for (const line of out.split('\n')) {
      const [proto, local, foreign, state] = line.trim().split(/\s+/);
      if (proto !== 'TCP' || state !== 'ESTABLISHED' || !local?.endsWith(':8082')) continue;
      const host = foreign.replace(/:\d+$/, '').replace(/^\[|\]$/g, '').replace(/^::ffff:/i, '');
      if (!SELF.has(host)) now.add(host);
    }
    for (const h of now) if (!seen.has(h)) console.log(`${new Date().toTimeString().slice(0, 8)} ${h} connected to Metro`);
    for (const h of seen) if (!now.has(h)) console.log(`${new Date().toTimeString().slice(0, 8)} ${h}: no open connection to Metro any more`);
    seen = now;
  });
}
setInterval(tick, 1000);
tick();
