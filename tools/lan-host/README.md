# LAN host

Keeps FamStory open to other computers and phones on the **same network** as
this machine. Not a production deployment: no HTTPS, no backups, and it is only
as awake as the laptop it runs on.

## Install

```powershell
powershell -ExecutionPolicy Bypass -File tools\lan-host\install.ps1
```

It builds the api and two web exports — the app, and the demo on sample data —
registers a scheduled task called **FamStory LAN host**, and starts it. From
then on it starts at logon.

Run it again after pulling new code — the supervisor serves the build, not the
source. The exports are published without taking the running copy down: each
goes to a staging folder first, and its bundles are in place before the pages
that load them. `-SkipBuild` registers without rebuilding; `-Uninstall` removes
the task.

The running api keeps the code it started with. After a rebuild, stop its
`node dist\main.js` process and the supervisor starts the new one within
fifteen seconds; the web servers read files from disk and need nothing.

## Open it from another device

```
http://<this machine's address>:8081
```

The easy way to the address is **Open on a phone** on the phone view (below):
it asks this machine for the address it has right now and shows it as a QR
code for the phone's camera. By hand: `ipconfig`, the IPv4 of the adapter that
is actually connected - Windows goes on listing an old address for a Wi-Fi
that has been switched off, and on 2026-09-28 a link built from that one led
a phone nowhere. The **computer name** may work too — `http://LAPTOP-NAME:8081`
— but not every device resolves names on a home network, and Android phones
often do not.

The address can change when the router hands out a new lease. The app does not
care: it asks for `/v1` wherever the page came from, so nothing needs rebuilding.
Only the address you type changes. A **DHCP reservation** on the router stops it
changing at all.

## The demo: a family that already has a year in it

```
http://<this machine's address>:8090
```

The same app, built with no server behind it, so it runs on the sample family
from `apps/mobile/src/data/mock.ts` — the Bergs, with photographs, reminders,
children and "On this day". Opened as an app (installed, or the phone view's
app) it opens as apps do, on its sign-in under the mark, with the sample
family's address filled in and no password asked for: **Sign in**, and the
Bergs are there. In a browser it opens on the welcome page, what somebody
from a search sees - what FamStory is, and how to have it on a computer or a
phone - as the real app does (2026-09-30; from 2026-09-28 until then the demo
went straight into the family). Onboarding is behind **Get started**. Nothing
done there reaches the real server (its `/v1` answers 404), and what you add
lives only in that browser.

The way out is **Start your own family**, under the demo's notice on the
welcome page, on its sign-in and in Profile: it goes to `/real`, which this server sends on to
the real copy on the same host (`/real/<path>` to that path there), so the
demo holds no address. Inside the phone view it is the phone that goes over:
the page switches to the real copy and opens FamStory on its home screen.

It exists because a new real account is empty, and an empty timeline cannot
show anybody what the product looks like once a family has used it.

## Seeing it as a phone shows it

```
http://localhost:8090/phone                the demo, on a phone's home screen
http://localhost:8081/phone?view=browser   the real site, as found on Google
http://localhost:8090/phone?view=app       the demo family, as the app
```

The app inside a phone-sized frame — iPhone 15, iPhone SE or a large Android.
It is the real app at the width a phone gives a page, so it lays itself out
exactly as on a phone; the bezel, the clock and the home bar are decoration.
Clicks are taps, the mouse wheel scrolls. The page speaks the app's language
(EN/LV at the top).

**Demo** and **Real**, the first two buttons, go between the two copies this
machine serves: the whole page goes over to the other one's phone view (they
are two origins, each with its own storage and sign-in), and takes the view,
the phone, the size, the colours, the language and the screen's measurement
along. Where the other copy is, the server answers (`/phone/copies`): the same
host at the other port of its pair - 8081 and 8090 on the local network, 443
and 8443 through Tailscale (`--pair` in static-server.mjs). On the real copy
the app is the family's own: signing in or making an account there is real.

Three ways to look (`?view=`, or the first three buttons):

- **Home screen** (`home`, the default) — the phone as it is met: FamStory's
  icon among the phone's own. A tap opens it - its splash while it loads,
  then the app - and the bar at the bottom (the round button on an iPhone
  SE) goes back home. The app stays where it was left, and opening it again
  is instant, as on a phone; **Reload** on the home screen closes both apps,
  so the next open starts cold. The browser's icon in the dock opens the
  site as **From Google** below; the other icons are pictures and say so.
  The first open brings the splash up out of the icon, and on it the mark
  comes together - the halves swing in and meet, the child lands on top, the
  heart beats - before the app appears; opened again, the app grows out of
  its icon, and going home it shrinks back into it, which bounces. Only
  transform and opacity move, and FamStory loads behind the home screen as
  the page opens, so nothing stutters. `?slow=4` plays every move four times
  slower, like the iOS Simulator's Slow Animations.
  **Closing an app the way a phone does**: the bar at the bottom, dragged up
  and held (on an iPhone SE the round button pressed twice), opens the app
  switcher - every open app a card of itself, the most recent on top. A card
  swiped up closes its app, and its next open is a cold start again, splash
  and all; a card tapped opens it where it was; the empty space or the bar go
  home. Flicked up rather than held, the bar goes straight home. With a mouse:
  take the bar, drag it to the middle of the screen, stop, and let go.
  This is the nearest a Windows machine gets to a Mac's iPhone Mirroring or
  iOS Simulator without an emulator: an iPhone cannot be shown this way from
  Windows at all, and Android Studio's emulator needs its own download and
  the Windows Hypervisor Platform switched on.
- **As the app** (`app`) — full screen, as it opens from the home screen, at
  the installed app's own address (`/?source=installed`): its sign-in, or the
  family for somebody signed in. On the demo every cold start begins signed
  out, so it is the sign-in with the sample family's address in it - one
  press to the Bergs.
- **From Google** (`browser`) — the welcome page in a phone's browser, under
  Safari's bar on an iPhone and Chrome's on Android: what somebody sees who
  typed FamStory into a search box and opened the link.

Three sizes (`?size=`):

- **Real size** (`real`, the default) — as big as the phone itself. A page
  cannot know how large a screen's pixels are, so it is measured once: a bank
  card held against the screen and a slider moved until the outline matches;
  that is kept per screen and zoom level, and pressing Real size again
  measures anew. Until then - and in a window shorter than the phone - the
  whole phone is shown fitted, with a line saying why and a **Measure** button.
  The measuring never opens by itself.
- **Pixels 1:1** (`actual`) — one CSS pixel per phone pixel, which on a large
  monitor is more than twice the phone.
- **Fit** (`fit`) — whatever fits the window.

**Light** and **Dark** at the top are the app's own Dark mode setting, stored
under the same key: the app inside switches with them, and a change made inside
the app (Profile → Dark mode) turns the frame too.

If the phone stays empty, the page says so on the phone's screen: some built-in
browsers load the page but refuse the app's files from the same address.

**Open on a phone** at the top shows the same server on a real phone, two
ways, each as a QR code (`/phone/addresses` in static-server.mjs, asked when
the button is pressed, so neither goes stale): the address this machine has
on the local network right now - the phone has to be on the same network,
and that address is plain `http`, so voice notes and installing the app do
not work there - and this copy's Tailscale address, from any network, asked
of `tailscale status` itself. That one needs the Tailscale app on the phone,
signed in to the same account - or, for somebody else, the machine shared
with them from the Tailscale admin page - and has both.

**Full page** opens the site in the browser, never the installed app's own
address; the manifest tells the browser the installed app would rather not
take links over (`handle_links`).

Chrome and Edge can do the same for any page without it: **F12**, then
**Ctrl+Shift+M**, then pick a device at the top. A work computer may have the
developer tools switched off, which is one reason the page exists.

## Without the browser warning: Tailscale

Plain `http` on the local network works, but every browser warns about it, and a
work computer may refuse to continue at all. Browsers only trust certificates
from public authorities, and those are not issued for a home address such as
`192.168.x.x` — so a warning-free `https` link needs a real name with a real
certificate.

Tailscale provides both without opening anything on the router. On this machine:

```powershell
tailscale serve --bg 8081
```

That publishes `https://<machine>.<tailnet>.ts.net/` with a Let's Encrypt
certificate that Tailscale renews itself, proxied to the web server on `:8081`.
The first run asks the tailnet owner to enable Serve and HTTPS certificates once
in the admin console. The setting survives restarts.

The demo gets its own HTTPS port on the same name — a path such as `/demo` would
not work, because the export loads its bundles from the root:

```powershell
tailscale serve --bg --https=8443 http://127.0.0.1:8090
```

which is `https://<machine>.<tailnet>.ts.net:8443/`, and `/phone` works on both.

It is **tailnet only**: a device can open the link only if it is in the same
Tailscale network. For each other computer or phone:

- **your own devices** — install Tailscale and sign in with the same account;
- **somebody else's device** (a parent's, for example) — share just this machine
  with their own Tailscale account from the admin console, instead of handing
  them your login. They get this laptop and nothing else in your network.

A work computer may not allow installing Tailscale. That is the employer's rule,
and on that computer the `http` link with its warning is what remains.

Enabling HTTPS publishes the machine's name (`<machine>.<tailnet>.ts.net`) in the
public Certificate Transparency logs. The name, not access: the link still opens
only for devices inside the tailnet.

## Anybody with the link: the demo through Funnel

*Off since 2026-10-13: the owner wants nothing public (docs/07-IMPROVEMENTS.md item 101).*

To let anybody open the **demo**, Tailscale Funnel opens its port to the internet. That covers a phone on mobile data, or somebody the app is being shown to with no Tailscale on their device:

```powershell
tailscale funnel --bg --https=8443 http://127.0.0.1:8090
```

The first run asks the tailnet owner to allow Funnel once in the admin console.
After that, `https://<machine>.<tailnet>.ts.net:8443/` opens for anybody who has the link, as long as this computer is on and awake. To turn it off again:

```powershell
tailscale funnel --https=8443 off
tailscale serve --bg --https=8443 http://127.0.0.1:8090
```

The second line puts the tailnet-only demo back if the first took it away too.

**Only the demo, never the real copy.** The real copy holds the families and the API in front of them. Funnel on 443 would put that sign-in in front of the whole internet, on a laptop.

Tailscale marks a request that came through Funnel with the `Tailscale-Funnel-Request` header. For that visitor `static-server.mjs` has no other copy:

- the phone view hides Demo | Real;
- the demo's "Start your own family" shows `not-public.html` ("not open to everyone yet", with the way back). Without that page it would link into the tailnet, where the visitor cannot follow.

While Funnel is on, the phone panel labels its Tailscale code as a public link (`tailscale serve status --json`, `AllowFunnel`).

Besides the app, a visitor can reach `/phone`, whose panel shows this machine's local-network address. That address is private and opens nothing from outside. `/v1` answers 404 on the demo, because the demo has no server.

The first time, the public name took about 15 minutes to appear in DNS. Until then the link does not resolve outside the tailnet.

## A link that stays up: the demo on GitHub Pages

*Down since 2026-10-13: the repository is private, and on the free plan Pages serves public ones only.*

Funnel works only while this laptop is on and awake. The same demo export can also go on GitHub Pages:

```powershell
node tools/publish/publish-demo.mjs
```

This puts `apps/mobile/dist-web-demo` at the account's own site, `https://<user>.github.io/`. That site is served at the root, so the export works there unchanged. It goes into a public repository with only the built demo in it: on the free plan, Pages serves public repositories only, and the code stays private. Each run replaces the site.

Run it again after `install.ps1` has built a new demo.

## Installing it as an app

On the Tailscale `https` address, and on the laptop itself (`localhost`),
Chrome and Edge offer to install FamStory as an app of its own - an icon, its
own window, no browser bar - and so do the welcome page and the profile
(docs/07-IMPROVEMENTS.md item 83). On an iPhone or iPad it is Safari's
*Share*, *Add to Home Screen*. The plain `http` LAN address cannot: a browser
installs only a secure page, the same rule as the microphone.

`/robots.txt` and `/sitemap.xml` are answered here too, with the address the
request came in on, or `FAMSTORY_PUBLIC_ORIGIN` when it is set. Nothing on
the tailnet is reachable by a search engine; that waits for the domain
(tools/deploy/README.md, "Being found").

## What runs

| Name | What | Why it is here |
|------|------|----------------|
| `wsl` | `sleep infinity` inside Ubuntu | WSL shuts the distro down about a minute after nothing holds it, and PostgreSQL goes with it |
| `api` | `node apps/api/dist/main.js` on `:3000` | Waits for PostgreSQL first; otherwise it dies on boot with Prisma `P1001` |
| `web` | `static-server.mjs` on `:8081` | The page, and `/v1` passed through to the api. The only port other devices need for the app |
| `demo` | `static-server.mjs --api none` on `:8090` | The app on sample data, from `apps/mobile/dist-web-demo` |

One origin for both is deliberate. A bundle with the server's IP baked into it
works until the lease changes, and then every other device loses the app at
once, with nothing on screen to say why.

The supervisor restarts whatever stops, and whatever stops *answering*: a child older than two minutes that fails four ten-second probes in a row is restarted too. That second rule exists because an api once started as the laptop fell asleep and came back alive, silent and not listening for six hours. It is four probes and not two because a rebuild that took every core once made two healthy web servers look dead; the export now also runs at below-normal priority. A child that crashes five times in a row
within a minute each time is given up on — that is a bug, not bad luck — and the
reason is in `logs/<name>.err.log`. Its own notes are in `logs/supervisor.log`.

## Stopping it for a while

*Stopped since 2026-10-13, for the pause (docs/13-PAUSED.md).*

Stopping the task ends only `wscript`; the supervisor and its children keep
running, so they are stopped by hand. PostgreSQL is shut down cleanly first
rather than taken away with the distro:

```powershell
Disable-ScheduledTask -TaskName 'FamStory LAN host'
Disable-ScheduledTask -TaskName 'FamStory backup'
Stop-ScheduledTask -TaskName 'FamStory LAN host'
$supervisor = Get-CimInstance Win32_Process | Where-Object { $_.Name -eq 'powershell.exe' -and $_.CommandLine -match '-File .*supervisor\.ps1' }
$children = Get-CimInstance Win32_Process | Where-Object { $_.ParentProcessId -in @($supervisor.ProcessId) }
@($supervisor) + @($children) | ForEach-Object { Stop-Process -Id $_.ProcessId -Force }
wsl -d Ubuntu -u root -- systemctl stop postgresql
```

Starting it again; PostgreSQL comes up with WSL, and the supervisor starts WSL:

```powershell
Enable-ScheduledTask -TaskName 'FamStory LAN host'
Enable-ScheduledTask -TaskName 'FamStory backup'
Start-ScheduledTask -TaskName 'FamStory LAN host'
```

## Limits worth knowing

- **Somebody has to log in.** The task runs as you, because a WSL distro belongs
  to a user; a task running without a login would not see Ubuntu. After a
  restart, the app comes back when you sign in to Windows.
- **Sleep takes it away.** A sleeping laptop answers nobody. Keep it plugged in
  and set to not sleep while others need it.
- **The firewall rule is for the Public profile.** Windows currently allows
  `node.exe` inbound on Public networks, and this network is categorised Public.
  If Windows re-categorises it as Private, other devices may be blocked until a
  Private rule exists too.

## Backups

`install.ps1` also registers **FamStory backup**, a scheduled task that runs
`backup.ps1` once a day: at 03:00, or ten minutes after a logon, an unlock or
a wake from sleep - whichever comes first. A laptop is usually asleep at
03:00, and Windows' own catch-up for a missed run skipped two mornings in a
row (2026-09-27 and 28), so the other three are what make it daily; a start
within 20 hours of the last complete backup does nothing (`-Force` runs
anyway). Each run:

1. dumps the database with `pg_dump` into `%USERPROFILE%\FamStory backups\database`,
2. mirrors the photographs (`apps\api\var\media`) into `...\media`,
3. keeps the newest 7 dumps and the newest of each of the last 4 weeks,
4. **restores the dump it just made** into a scratch database and compares the
   row counts with the live database (`restore-check.ps1`), writing the result
   to `last-restore-check.txt`.

Run it by hand any time:

```powershell
powershell -ExecutionPolicy Bypass -File tools\lan-host\backup.ps1
```

The default target is on the same disk as the database. For a copy that
survives the disk, point it elsewhere — for example a OneDrive folder:

```powershell
powershell -ExecutionPolicy Bypass -File tools\lan-host\backup.ps1 -Target "$env:OneDrive\FamStory backups"
```

To restore for real: `pg_restore --clean --no-owner -d famstory <dump>` inside
WSL, with the API stopped, and copy the `media` folder back.
