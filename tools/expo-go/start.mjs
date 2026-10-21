// Starts Metro for Expo Go on a phone on the same network as this machine.
//
//   node tools/expo-go/start.mjs            start it
//   node tools/expo-go/start.mjs --dry-run  only say which address it would use
//
// - On this machine's LAN address, found now: the router hands out a new one
//   now and then (.231, then .233, then .162 on Wi-Fi), and Expo left to choose
//   can pick an adapter the phone cannot reach. A fixed address in a launch
//   configuration went stale overnight.
// - For phones only (FAMSTORY_NATIVE_ONLY, app.config.js): with the web on,
//   one browser asking the port has Metro render the web app for minutes,
//   and the phone's request for its manifest waits behind it until Expo Go
//   gives up ("could not connect to the server").
// - On 8082, because the LAN host holds 8081.
import { spawn } from 'node:child_process';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const PORT = 8082;
const mobile = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', '..', 'apps', 'mobile');

// A private IPv4 a phone on the home network can reach. Ethernet first, then
// Wi-Fi; never a virtual adapter (WSL, Hyper-V) or the tailnet's 100.x.
const candidates = Object.entries(os.networkInterfaces())
  .flatMap(([name, list]) => (list ?? []).map((a) => ({ name, address: a.address, family: a.family, internal: a.internal })))
  .filter((a) => a.family === 'IPv4' && !a.internal && /^(192\.168|10)\./.test(a.address) && !/vEthernet|WSL|Hyper-V/i.test(a.name))
  .sort((a, b) => Number(/^Ethernet/i.test(b.name)) - Number(/^Ethernet/i.test(a.name)));

const lan = candidates[0];
if (!lan) {
  console.error('No home-network address on this machine: is it on the Wi-Fi?');
  process.exit(1);
}

console.log(`Expo Go: exp://${lan.address}:${PORT}  (${lan.name})`);
if (process.argv.includes('--dry-run')) process.exit(0);

const child = spawn('npm', ['--prefix', mobile, 'run', 'start', '--', '--port', String(PORT), '--lan'], {
  stdio: 'inherit',
  shell: true,
  env: { ...process.env, REACT_NATIVE_PACKAGER_HOSTNAME: lan.address, FAMSTORY_NATIVE_ONLY: '1' },
});
child.on('exit', (code) => process.exit(code ?? 0));
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => child.kill(signal));
