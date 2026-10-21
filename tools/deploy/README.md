# Moving FamStory off the laptop

Everything needed to run FamStory on a small server in the EU, with HTTPS on
its own domain: docs/08-LAUNCH-PLAN.md 2.1. Written before any server exists,
so read **What has and has not been tried** at the end first.

```
tools/deploy/
  docker-compose.yml   the database, migrations, the API, Caddy
  api.Dockerfile       the API (build stage + runtime)
  web.Dockerfile       the web export baked into Caddy
  Caddyfile            HTTPS, /v1 to the API, the app for everything else
  .env.example         the secrets, to copy to .env
  backup.sh            nightly: dump, photographs, rotation, restore check
```

## What you need first (the parts only you can do)

1. **A server.** Hetzner CX22 (2 vCPU, 4 GB, ~EUR 4/month) in Falkenstein,
   Nuremberg or Helsinki, Ubuntu 24.04, with your SSH key. 4 GB matters: the
   web export needs it for a few minutes (see *A small server* for 2 GB).
2. **A domain** (~EUR 12/year), and an `A` record for it pointing at the
   server's IPv4 address (plus `AAAA` for IPv6 if you like). Wait until
   `nslookup your.domain` answers with the server's address before step 4 -
   Caddy asks Let's Encrypt for a certificate on first start, and a name that
   does not resolve yet uses up an attempt.
3. **The firewall** on the provider's side: allow 22, 80 and 443 in; nothing
   else. Nothing else needs to be reachable - the database and the API are
   only visible to the containers.

## First start

On the server, as a user with sudo:

```bash
# Docker, from Docker's own repository (the Ubuntu package is old).
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker "$USER" && newgrp docker

# The code.
sudo mkdir -p /opt/famstory && sudo chown "$USER" /opt/famstory
git clone <your repository URL> /opt/famstory
cd /opt/famstory

# The secrets: fill every line. Each secret: openssl rand -base64 48
cp tools/deploy/.env.example tools/deploy/.env
nano tools/deploy/.env

# Build and start. The first build takes 5-10 minutes (the web export).
docker compose -f tools/deploy/docker-compose.yml up -d --build
docker compose -f tools/deploy/docker-compose.yml ps
curl -fsS https://your.domain/v1/health
```

`/v1/health` answering `{"status":"ok","database":"ok"}` over HTTPS is done.

## Bringing the laptop's family across

The data is two things: the database and the photographs folder. On the
laptop (PowerShell, in the repository):

```powershell
# 1. The database, from WSL.
wsl -d Ubuntu -u postgres -- pg_dump --format=custom --no-owner --file /tmp/famstory.dump famstory
wsl -d Ubuntu -- cp /tmp/famstory.dump /mnt/c/Users/$env:USERNAME/famstory.dump

# 2. Copy both to the server.
scp $env:USERPROFILE\famstory.dump you@server:/tmp/
scp -r apps\api\var\media you@server:/tmp/famstory-media
```

On the server:

```bash
cd /opt/famstory
c="docker compose -f tools/deploy/docker-compose.yml"
$c stop api
$c exec -T db pg_restore -U famstory -d famstory --clean --if-exists --no-owner < /tmp/famstory.dump
$c cp /tmp/famstory-media/. api:/data/media/
$c start api
```

Then **stop the laptop's copy**, so nobody keeps writing to the old one:
`powershell -ExecutionPolicy Bypass -File tools\lan-host\install.ps1 -Uninstall`
and restart the laptop (or end the `node` processes). Tell the family the new
address; everyone signs in again once, because the new server has its own
`JWT_SECRET`. Calendar subscriptions have to be added again for the same
reason (a new `MEDIA_SIGNING_SECRET`).

Delete `/tmp/famstory.dump` and `/tmp/famstory-media` afterwards; the dump is
the whole family.

## Updates

```bash
cd /opt/famstory && git pull
docker compose -f tools/deploy/docker-compose.yml up -d --build
```

The `migrate` service runs `prisma migrate deploy` before the new API starts,
so a release never meets a schema it does not know. The old containers keep
serving while the new images build.

## Backups

```bash
sudo mkdir -p /var/backups/famstory && sudo chown "$USER" /var/backups/famstory
chmod +x tools/deploy/backup.sh
tools/deploy/backup.sh          # once by hand, and read last-restore-check.txt
crontab -e                      # then add:
# 0 3 * * * /opt/famstory/tools/deploy/backup.sh >> /var/backups/famstory/backup.log 2>&1
```

Every run dumps the database, copies the photographs, keeps 7 daily and 4
weekly dumps, and **restores the new dump into a scratch database and compares
the rows** - the same check the laptop's backup makes.

It backs up onto the same server. That protects against a bad migration or a
mistaken delete, not against losing the server. **The copy elsewhere is a
decision about where families' photographs go**, so it is yours: a Hetzner
Storage Box in the same region (~EUR 4/month for 1 TB) with `rsync` or
`rclone` after `backup.sh`, or the provider's own snapshots (which are not a
tested restore, but are better than nothing).

## Knowing when it breaks

- `npm --prefix apps/api run kpis` works against the server's database too
  (`DATABASE_URL` pointing at it through an SSH tunnel) and prints the app
  errors of the last 30 days under the KPI table.
- An uptime check that tells somebody: Uptime Kuma (self-hosted, another
  container) or a hosted pinger on `https://your.domain/v1/health`. Either is
  an account or a service of its own, so it is not in this compose file.

## Being found

What makes a search for "FamStory" land on the welcome page and offer to
install the app (docs/07-IMPROVEMENTS.md item 83) is already in the build:

- `DOMAIN` from `.env` goes into the web build (web.Dockerfile, as
  `EXPO_PUBLIC_SITE_ORIGIN`), for the preview picture, the canonical address
  and the structured data (apps/mobile/src/app/+html.tsx). A new domain means
  a new build.
- Caddy answers `/robots.txt` and `/sitemap.xml` itself and sends
  `X-Robots-Tag: noindex` for every page but the welcome page and what it
  needs to draw - a guest link is never in an index.
- The manifest and the worker make it installable from Chrome, Edge and
  Safari; nothing to do for that.

Then, with your own Google account (the parts only you can do):

1. **Google Search Console** (search.google.com/search-console): *Add
   property*, *Domain*, your domain. It gives a `TXT` record; add it where the
   domain's DNS is kept and press *Verify*.
2. *Sitemaps*: submit `https://your.domain/sitemap.xml`.
3. *URL inspection*: `https://your.domain/welcome`, then *Request indexing*.
4. If you like, Bing Webmaster Tools imports the property from Search
   Console, which covers Bing and DuckDuckGo too.

Expect days to a few weeks. "fam story" as two words takes longer: the name
is shared with other products (docs/07-IMPROVEMENTS.md item 74), so the
domain's own name and links to it from elsewhere - a page, a post - decide
the rest.

Once it is up: `curl -I https://your.domain/welcome` has no `X-Robots-Tag`,
`curl -I https://your.domain/calendar` has `noindex`, and Chrome's DevTools,
*Application*, *Manifest*, reports no errors.

## A small server

On 2 GB of memory the web export can run out during the build. Either add
swap for the build (`sudo fallocate -l 2G /swapfile && sudo chmod 600 /swapfile
&& sudo mkswap /swapfile && sudo swapon /swapfile`), or build the web image on
the laptop and send it: `docker build -f tools/deploy/web.Dockerfile
--build-arg DOMAIN=your.domain -t famstory-web .` then
`docker save famstory-web | ssh you@server docker load`.

## What has and has not been tried

**Built and run on the laptop under Docker, 2026-10-09**, with `DOMAIN=localhost`
(Caddy's own certificate) and the ports moved off 80 and 443:

- all three images build. The first try did not: `npm ci` in the web image
  refused `apps/mobile/package-lock.json`, written by an older npm on Windows
  that had left two Linux-only entries out. The lock is now written by the
  image's own npm, and Windows' `npm ci` takes it too;
- the migrations run, the API turns healthy, and Caddy serves the web app,
  `/v1`, `robots.txt`, `noindex` on every page but the welcome page, HSTS,
  and both `.well-known` files once `APPLE_TEAM_ID` and
  `ANDROID_CERT_SHA256` are set;
- RevenueCat's webhook refuses a wrong secret and takes its test event;
  without `REVENUECAT_SECRET_KEY` a sync answers 503;
- the reviewer script runs in the `migrate` image, and that account signs in
  through Caddy;
- the smoke test passes through Caddy over HTTPS, 141 checks
  (`SMOKE_BASE_URL=https://localhost:18443/v1`).

**Not tried:** Let's Encrypt for a real domain, which needs the domain;
`backup.sh` on the server (`bash -n` only); a 2 GB machine. The first real
start should still be watched with
`docker compose -f tools/deploy/docker-compose.yml logs -f`, and anything it
finds fixed here, in the repository, not on the server.
