# Checks that look at the running app

Written while building, kept here so they outlive the session that wrote them.
The unit tests and `apps/api/test/smoke.ts` check the code and the API; these
check what a person sees and presses, and the SQL that Prisma really makes.

All of them are for this Windows laptop: the browser ones drive Microsoft Edge
headless through the DevTools protocol, and the SQL ones use the PostgreSQL in
WSL. Pictures go to `%TEMP%\famstory-checks` (or `FAMSTORY_CHECKS_OUT`), one
folder per check. Each prints a line per step, `ok` or `FAIL`, and what it saw.

Run them one at a time. Two at once, or one next to a build, starve the CPU,
and the LAN host's supervisor starts restarting servers (tools/lan-host/README.md).

## In the browser

| Check | What it presses or looks at | Needs |
|---|---|---|
| `review-screens.mjs [all\|phone\|dark\|english\|computer\|real]` | Every screen, about 120, photographed; marks cut text (CUT), small text (SMALL, TINY) and English left in Latvian (EN) | demo 8090, real copy 8081 |
| `stress-screens.mjs` | 63 pages of the demo and the real copy's open pages, phone and computer size, light and dark: errors, the error screen, pages wider than the window | 8090, 8081 |
| `stress-press.mjs` | The demo pressed through like somebody showing it: sign in, an entry, a comment, the language both ways, dark, sign out twice, the phone view's buttons | 8090 |
| `ready-check.mjs` | The same, then what the stores ask: the privacy policy, the terms, the paywall's promises, reporting | 8090, and a web dev server on 8082 |
| `block-check.mjs` | Blocking and unblocking from an entry, a profile, the bell and comments | a web dev server on mock data, address at the top |
| `flow-check.mjs` | The 2026-10-10 review's flows: renaming the family, an invitation by email, the first paint in dark mode, "Forgot your password?" on the real copy | 8090, 8081 |
| `forgot-email-check.mjs` | "Forgot your password?" as on a server that can send email (its two answers are faked in the browser) | 8081 |
| `voice-check.mjs [base] [headed]` | A voice note recorded and played, and a title dictated, with a recorded sentence as the microphone | 8090, and the recording (below) |

The recording for `voice-check.mjs`, made once with Windows' own voice:

```powershell
New-Item -ItemType Directory -Force "$env:TEMP\famstory-checks" | Out-Null
Add-Type -AssemblyName System.Speech
$voice = New-Object System.Speech.Synthesis.SpeechSynthesizer
$voice.SetOutputToWaveFile("$env:TEMP\famstory-checks\voice-sample.wav")
$voice.Speak("Today the whole family went to the seaside.")
$voice.Dispose()
```

Dictation cannot be checked this way: the browser's recogniser listens to the
real microphone, not to the recording. The voice note can.

## Against a real PostgreSQL

```bash
bash tools/checks/launch-check.sh                    # launch-check.ts
bash tools/checks/launch-check.sh blockdb-check.ts   # blocks, through eventFilter's SQL
```

Each run makes a scratch database in WSL, applies every migration, compares the
schema with them, runs the App Review account script three ways, then the
check, and drops the database at the end. The family's database is never
touched.

## For a phone with Expo Go

| Script | What it does |
|---|---|
| `prewarm.mjs` | Asks Metro (8082) for what an iPhone asks for, so the bundle is built before the phone waits for it |
| `phone-watch.mjs` | A line when another device connects to Metro and one when it lets go: whether the phone really opened the app |

Metro itself: `tools/expo-go/start.mjs`, through `.claude/launch.json` (`famstory-expo-go`).

## Other

`domains.mjs famstory.lv famstory.eu ...` - whether a domain is free: RDAP
where the registry has it, the registry's WHOIS otherwise.
