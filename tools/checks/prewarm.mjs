// Asks Metro for what Expo Go on an iPhone asks for - the manifest, then the
// bundle it names - so the build happens now, not while the phone waits.
// node:http rather than fetch: a cold build can take longer than fetch's
// five minutes of waiting for headers.
import http from 'node:http';
import os from 'node:os';

// The same address tools/expo-go/start.mjs gives Metro: Ethernet first, then Wi-Fi.
const lan = Object.entries(os.networkInterfaces())
  .flatMap(([name, list]) => (list ?? []).map((a) => ({ name, ...a })))
  .filter((a) => a.family === 'IPv4' && !a.internal && /^(192\.168|10)\./.test(a.address) && !/vEthernet|WSL|Hyper-V/i.test(a.name))
  .sort((a, b) => Number(/^Ethernet/i.test(b.name)) - Number(/^Ethernet/i.test(a.name)))[0];
const HOST = `http://${lan.address}:8082`;
const t0 = Date.now();
const res = await fetch(`${HOST}/`, {
  headers: { 'expo-platform': 'ios', accept: 'application/expo+json,application/json' },
});
const manifest = await res.json();
console.log(`manifest ${res.status} in ${Date.now() - t0} ms, sdk ${manifest.extra?.expoClient?.sdkVersion ?? manifest.runtimeVersion}`);
const url = manifest.launchAsset?.url ?? manifest.bundleUrl;
const t1 = Date.now();
const { status, bytes, head } = await new Promise((resolve, reject) => {
  http
    .get(url, (answer) => {
      let size = 0;
      let first = '';
      answer.on('data', (chunk) => {
        size += chunk.length;
        if (first.length < 1500) first += chunk.toString('utf8');
      });
      answer.on('end', () => resolve({ status: answer.statusCode, bytes: size, head: first }));
    })
    .on('error', reject);
});
console.log(`bundle ${status} ${(bytes / 1e6).toFixed(1)} MB in ${((Date.now() - t1) / 1000).toFixed(0)} s`);
if (status !== 200) console.log(head.slice(0, 1500));
