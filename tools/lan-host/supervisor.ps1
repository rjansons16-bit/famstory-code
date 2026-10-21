# Keeps FamStory reachable from other computers on the local network.
#
# The first three have to be up, in this order, and each one fails in its own way:
#
#   wsl   PostgreSQL lives in WSL, and WSL shuts the distro down about a minute
#         after nothing holds it open. Postgres goes with it, silently. A
#         `sleep infinity` inside the distro is what holds it.
#   api   `node dist/main.js`. Dies on boot with Prisma P1001 if the database is
#         not accepting connections yet, so it waits for port 5432 first.
#   web   tools/lan-host/static-server.mjs on :8081 -- the page, and /v1 passed
#         through to the api. The only port other devices need for the app.
#   demo  the same server on :8090 serving apps/mobile/dist-web-demo: the app on
#         the sample family from src/data/mock.ts, with no api behind it. For
#         showing what a family with a year of events looks like, which a new
#         real account cannot.
#
# The Task Scheduler starts this at logon (see install.ps1), and this loop keeps
# them alive between crashes. It is NOT started as a Claude background task:
# those die with the session, and a server that dies quietly looks exactly like
# one that is working until somebody on the other computer tries to open it.

$ErrorActionPreference = 'Continue'

$here    = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo    = (Resolve-Path (Join-Path $here '..\..')).Path
$apiDir  = Join-Path $repo 'apps\api'
$logs    = Join-Path $here 'logs'
New-Item -ItemType Directory -Force -Path $logs | Out-Null

# The supervisor's own notes, kept apart from the children's output. A child's
# redirected stdout holds its file open with deny-write for the child's whole
# life, so a shared file would swallow exactly the lines that explain a crash.
$log = Join-Path $logs 'supervisor.log'
if ((Test-Path $log) -and (Get-Item $log).Length -gt 1MB) { Remove-Item $log -Force }

$DISTRO     = 'Ubuntu'
$FAST_SEC   = 60   # a child that dies sooner than this is a crash, not an exit
$MAX_FAST   = 5    # this many crashes in a row, and that child is given up on
$PAUSE_SEC  = 10   # breathing room before bringing a child back
$TICK_SEC   = 15   # how often the loop looks
$GRACE_SEC  = 120  # a child this young is still allowed to be starting up
# This many unanswered probes in a row, and it is restarted. Four, at ten seconds
# each: with two at five, a rebuild that took every core for a few minutes was
# enough to restart both web servers while they were fine, just slow. A server
# that is truly hung is still caught in about a minute.
$SICK_TICKS = 4
$PROBE_SEC  = 10

function Note([string]$text) {
  $stamp = Get-Date -Format 'yyyy-MM-dd HH:mm:ss'
  Add-Content -Path $log -Value "[$stamp] $text" -Encoding utf8 -ErrorAction SilentlyContinue
}

# Does anything ANSWER on this port? Any HTTP status counts -- a 401 from the
# api is a healthy api. Only no answer at all is a failure.
function Answers([int]$port, [string]$path) {
  try {
    Invoke-WebRequest -Uri "http://127.0.0.1:$port$path" -UseBasicParsing -TimeoutSec $PROBE_SEC | Out-Null
    return $true
  } catch [System.Net.WebException] {
    return [bool]$_.Exception.Response
  } catch {
    return $false
  }
}

function PortOpen([int]$port) {
  $client = New-Object System.Net.Sockets.TcpClient
  try {
    $wait = $client.BeginConnect('127.0.0.1', $port, $null, $null)
    return ($wait.AsyncWaitHandle.WaitOne(800) -and $client.Connected)
  } catch {
    return $false
  } finally {
    $client.Close()
  }
}

$node = (Get-Command node.exe -ErrorAction SilentlyContinue).Source
if (-not $node) {
  Note 'node.exe is not on PATH. Nothing can start. Install Node.js and log in again.'
  exit 1
}

# One record per child. `port` is how we notice something ELSE already serving
# it -- a copy started by hand -- so we do not start a second one on top.
$children = [ordered]@{
  wsl = @{ proc = $null; started = $null; fast = 0; gaveUp = $false; port = 0
           file = 'wsl.exe'; args = @('-d', $DISTRO, '--', 'sleep', 'infinity'); dir = $repo }
  api = @{ proc = $null; started = $null; fast = 0; gaveUp = $false; port = 3000; sick = 0
           probe = '/v1/users/me'
           file = $node; args = @('dist\main.js'); dir = $apiDir }
  web = @{ proc = $null; started = $null; fast = 0; gaveUp = $false; port = 8081; sick = 0
           probe = '/'
           file = $node; args = @("`"$(Join-Path $here 'static-server.mjs')`""); dir = $repo }
  # Until install.ps1 has built dist-web-demo this answers 503 with the command
  # to run, which is still an answer -- it is not restarted for it.
  demo = @{ proc = $null; started = $null; fast = 0; gaveUp = $false; port = 8090; sick = 0
            probe = '/'
            file = $node; dir = $repo
            args = @("`"$(Join-Path $here 'static-server.mjs')`"",
                     '--root', "`"$(Join-Path $repo 'apps\mobile\dist-web-demo')`"",
                     '--port', '8090', '--api', 'none') }
}

function Start-Child([string]$name) {
  $c = $children[$name]
  try {
    $c.proc = Start-Process -FilePath $c.file -ArgumentList $c.args -WorkingDirectory $c.dir `
      -WindowStyle Hidden -PassThru `
      -RedirectStandardOutput (Join-Path $logs "$name.out.log") `
      -RedirectStandardError  (Join-Path $logs "$name.err.log")
    $c.started = Get-Date
    Note "$name started (pid $($c.proc.Id))."
  } catch {
    $c.proc = $null
    Note "$name could not start: $($_.Exception.Message)"
  }
}

Note "Supervisor starting. repo=$repo node=$node"

if (-not (Test-Path (Join-Path $apiDir 'dist\main.js'))) {
  Note 'apps\api\dist\main.js is missing -- run tools\lan-host\install.ps1 to build. The api will not start.'
  $children.api.gaveUp = $true
}

while ($true) {
  foreach ($name in @($children.Keys)) {
    $c = $children[$name]
    if ($c.gaveUp) { continue }

    $alive = $c.proc -and -not $c.proc.HasExited

    # Alive is not the same as working. On 2026-09-14 an api started just as the
    # laptop went to sleep and came back a process that never finished booting:
    # alive, silent, not listening, for six hours. Every other device got the
    # proxy's 502 the whole time, and this loop saw nothing wrong -- it only ever
    # asked whether the process existed.
    if ($alive -and $c.probe -and ((Get-Date) - $c.started).TotalSeconds -gt $GRACE_SEC) {
      if (Answers $c.port $c.probe) {
        $c.sick = 0
      } else {
        $c.sick++
        if ($c.sick -ge $SICK_TICKS) {
          Note "$name is running but has not answered on :$($c.port) for $SICK_TICKS checks. Restarting it."
          Stop-Process -Id $c.proc.Id -Force -ErrorAction SilentlyContinue
          $c.sick = 0
          # Fall through on the next tick, where it counts as stopped.
        }
      }
    }

    if ($alive) { continue }

    # It was running and it stopped.
    if ($c.proc) {
      $lived = [int]((Get-Date) - $c.started).TotalSeconds
      Note "$name stopped after $lived s (exit $($c.proc.ExitCode))."
      if ($lived -lt $FAST_SEC) {
        $c.fast++
        if ($c.fast -ge $MAX_FAST) {
          Note "$name crashed $MAX_FAST times in a row. That is a bug, not bad luck -- giving up on it. See logs\$name.err.log."
          $c.gaveUp = $true
          continue
        }
      } else {
        $c.fast = 0
      }
      $c.proc = $null
      Start-Sleep -Seconds $PAUSE_SEC
    }

    # Somebody else is already serving this port: leave it alone, look again later.
    if ($c.port -gt 0 -and (PortOpen $c.port)) {
      continue
    }

    if ($name -eq 'api') {
      # Without the database the api dies on boot, and five of those in a row
      # would make us give up on a problem that only needed patience.
      if (-not (PortOpen 5432)) { continue }
    }

    Start-Child $name
  }

  Start-Sleep -Seconds $TICK_SEC
}
