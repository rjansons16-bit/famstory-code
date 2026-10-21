// Domain availability: RDAP where the registry has it (IANA bootstrap),
// otherwise the registry's WHOIS on port 43. Prints status lines only.
import net from 'node:net';

const WHOIS = { lv: 'whois.nic.lv', eu: 'whois.eu' };
const names = process.argv.slice(2);

function whois(server, query) {
  return new Promise((resolve, reject) => {
    const s = net.createConnection({ host: server, port: 43 }, () => s.write(query + '\r\n'));
    let data = '';
    s.setEncoding('utf8');
    s.setTimeout(15000, () => s.destroy(new Error('timeout')));
    s.on('data', (d) => (data += d));
    s.on('end', () => resolve(data));
    s.on('error', reject);
  });
}

const boot = await (await fetch('https://data.iana.org/rdap/dns.json')).json();
const rdapBase = (tld) => boot.services.find(([tlds]) => tlds.includes(tld))?.[1][0];

for (const name of names) {
  const tld = name.split('.').pop();
  try {
    if (WHOIS[tld]) {
      const out = await whois(WHOIS[tld], name);
      const lines = out
        .split(/\r?\n/)
        .filter((l) => /^\s*(status|domain|registered|created|changed)\s*:/i.test(l) || /available|not found|free/i.test(l))
        .map((l) => l.trim());
      console.log(`${name.padEnd(24)} whois  ${lines.join(' | ') || out.slice(0, 200).replace(/\s+/g, ' ')}`);
      continue;
    }
    const base = rdapBase(tld);
    if (!base) {
      console.log(`${name.padEnd(24)} no RDAP or WHOIS server known`);
      continue;
    }
    const url = `${base.replace(/\/?$/, '/')}domain/${name}`;
    const res = await fetch(url, { headers: { accept: 'application/rdap+json' } });
    if (res.status === 404) {
      console.log(`${name.padEnd(24)} rdap   404: not registered`);
      continue;
    }
    const j = await res.json().catch(() => ({}));
    const reg = j.events?.find((e) => e.eventAction === 'registration')?.eventDate ?? '';
    const exp = j.events?.find((e) => e.eventAction === 'expiration')?.eventDate ?? '';
    console.log(`${name.padEnd(24)} rdap   ${res.status}: registered ${reg.slice(0, 10)} expires ${exp.slice(0, 10)} [${(j.status ?? []).join(', ')}]`);
  } catch (e) {
    console.log(`${name.padEnd(24)} error  ${e.message}`);
  }
}
