# Paused

On 2026-10-13 the owner put FamStory aside for a while, meaning to come back
to it. This page is where to start then: what was finished, what never was,
and what to check first because time will have moved.

## Where it stands

- **The app is finished for the stores as far as code goes.** What is ready
  is the table in `12-LAUNCH-RUNBOOK.md` §0. At the pause: API 565 tests, app
  492, the smoke test 156/156 against the laptop's server (2026-10-12).
- **What is left is not code:** the company (`10-COMPANY.md` §5), then the
  runbook from §1, step by step. Every step there is an account, a payment, a
  signature or a choice that is the owner's.
- **Never done, and worth doing before a launch:** a lawyer's reading of
  `docs/legal` (`12-LAUNCH-RUNBOOK.md` §6), and a security test by somebody
  who did not write the code.
- **Never seen for real:** the app on a real iPhone (Expo Go was set up but
  never confirmed), a push reaching a phone, a store purchase, a password
  link arriving by email. Each waits for an account (runbook §3-5, §1.4).
- **The decisions already taken** are written down, so they need not be
  asked again: `09-APP-STORES.md` (accounts on a company, Premium in the
  first version, iPhone first), `10-COMPANY.md`, `docs/legal/README.md`
  ("Decided for the launch").

## Where everything is

- **The code** is on this laptop and in the private GitHub repository
  `rjansons16-bit/famstory`, up to date at the pause (tag `v0.5.0`).
- **Nothing is public.** The public copy of the code and the demo on GitHub
  Pages are private repositories now, and Tailscale Funnel is off
  (`07-IMPROVEMENTS.md` item 101 says how to publish again).
- **The family's copy on this laptop is stopped for the pause**
  (`tools/lan-host`): the tasks "FamStory LAN host" and "FamStory backup" are
  disabled, and the servers and PostgreSQL are stopped. Nothing is lost: the
  database is in WSL as it was, and the last checked backup is from
  2026-10-12 22:47, every row restored. To start it again:

  ```powershell
  Enable-ScheduledTask -TaskName 'FamStory LAN host'
  Enable-ScheduledTask -TaskName 'FamStory backup'
  Start-ScheduledTask -TaskName 'FamStory LAN host'
  ```
- **The checks that look at the running app** - screens, presses, voice, the
  SQL against a scratch database, the phone helpers - are in `tools/checks`.

## Coming back

1. **Time first.** Expo Go on a phone runs only the newest Expo SDK, and the
   app is on SDK 57. If a newer one is out, upgrade before anything else
   (`npx expo install expo@latest --fix` in `apps/mobile`, then the release
   notes), or the phone will not open the app at all. Run `npm audit` in both
   apps too. Whatever changes a dependency, let Linux npm write the lock
   file: Windows npm leaves out entries that only Linux needs, and the
   server's build then refuses the lock (`tools/deploy/README.md`, "What has
   and has not been tried"). Put the committed lock back first
   (`git checkout HEAD -- apps/mobile/package-lock.json`), because a lock
   that Windows has already rewritten stays short of those entries; then,
   with Docker Desktop running:

   ```bash
   MSYS_NO_PATHCONV=1 docker run --rm -v "$(pwd -W)/apps/mobile:/app" -w /app node:24-bookworm-slim npm install --package-lock-only
   ```
2. **The tests,** one at a time: `npm --prefix apps/api test`,
   `npm --prefix apps/mobile test`, the two `typecheck`s, then
   `npm --prefix apps/api run smoke` against the laptop's server, once it is
   started again (above).
3. **The domain** - `node tools/checks/domains.mjs famstory.lv famstory.eu`.
   Both were free on 2026-10-13. The US trademark application FAMSTORY
   (no. 99744891, pending at the pause) is a question for the lawyer before
   any launch in the US.
4. **Then the company,** and the runbook.
