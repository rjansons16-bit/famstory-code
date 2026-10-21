# Installs (or removes) the scheduled tasks that keep FamStory up for other
# computers on the local network, and back it up every night.
#
#   powershell -ExecutionPolicy Bypass -File tools\lan-host\install.ps1
#   powershell -ExecutionPolicy Bypass -File tools\lan-host\install.ps1 -SkipBuild
#   powershell -ExecutionPolicy Bypass -File tools\lan-host\install.ps1 -Uninstall
#
# Run it again after pulling new code: it rebuilds the api and the web export,
# which is what the supervisor actually serves.
#
# No elevation needed. The task runs as you, at logon, because WSL distros
# belong to a user -- a task running as SYSTEM would not even see Ubuntu.

param(
  [switch]$SkipBuild,
  [switch]$Uninstall
)

$ErrorActionPreference = 'Stop'
$TaskName = 'FamStory LAN host'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path (Join-Path $here '..\..')).Path

if ($Uninstall) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false -ErrorAction SilentlyContinue
  Unregister-ScheduledTask -TaskName 'FamStory backup' -Confirm:$false -ErrorAction SilentlyContinue
  Write-Host "Removed '$TaskName'. Processes it already started keep running until you log out."
  return
}

# Exports the web app into apps\mobile\<Name> without taking the running copy
# down. Exporting straight into the served folder with --clear left it empty for
# the minutes an export takes, so: export to a staging folder, add the hashed
# bundles and assets first (new names, nothing overwritten), then mirror the
# pages that point at them, and only then remove what the new build dropped.
#
# robocopy, not Move-Item: the font paths under assets\ run past MAX_PATH, and
# Move-Item gives up halfway through such a folder -- which once left the live
# copy half moved and answering 503. /R and /W keep a locked file from stalling
# it for the default million retries.
function Publish-WebExport([string]$Name, [switch]$SampleData) {
  $mobile  = Join-Path $repo 'apps\mobile'
  $target  = Join-Path $mobile $Name
  $staging = Join-Path $mobile "$Name.next"
  $quiet   = @('/NFL', '/NDL', '/NJH', '/NJS', '/NP', '/R:2', '/W:1')

  $previous = $env:EXPO_PUBLIC_API_URL
  # Blank but set: that wins over apps\mobile\.env ("/v1"), and the app reads it
  # as "no server" -- the sample family from src\data\mock.ts.
  if ($SampleData) { $env:EXPO_PUBLIC_API_URL = ' ' }

  # The export takes every core for minutes, and the servers it is replacing
  # still have people on them. On 2026-09-15 it starved both web servers until
  # their health probes failed and the supervisor restarted two healthy servers.
  # Lowering this script's own priority is inherited by the export and all its
  # workers, and unlike `start /belownormal` it keeps the exit code.
  $self = Get-Process -Id $PID
  $priority = $self.PriorityClass
  $self.PriorityClass = 'BelowNormal'
  Push-Location $mobile
  try {
    & npx.cmd expo export --platform web --output-dir $staging --clear
    if ($LASTEXITCODE -ne 0) { throw "The web export for $Name failed." }

    # Brotli and gzip copies beside the bundle, the pages and the fonts, which
    # static-server.mjs sends to any browser that asks: the 4 MB bundle leaves
    # as about 700 KB. Done here, at the lowered priority, because the best
    # setting takes seconds per megabyte.
    & node.exe (Join-Path $here 'precompress.mjs') $staging
    if ($LASTEXITCODE -ne 0) { throw "Compressing the $Name export failed." }
  } finally {
    Pop-Location
    $self.PriorityClass = $priority
    if ($SampleData) {
      if ($null -eq $previous) { Remove-Item Env:EXPO_PUBLIC_API_URL -ErrorAction SilentlyContinue }
      else { $env:EXPO_PUBLIC_API_URL = $previous }
    }
  }

  foreach ($part in @('_expo', 'assets')) {
    if (Test-Path (Join-Path $staging $part)) {
      & robocopy.exe (Join-Path $staging $part) (Join-Path $target $part) /E @quiet | Out-Null
      if ($LASTEXITCODE -ge 8) { throw "Copying $part into $Name failed (robocopy $LASTEXITCODE)." }
    }
  }
  & robocopy.exe $staging $target /MIR @quiet | Out-Null
  if ($LASTEXITCODE -ge 8) { throw "Publishing $Name failed (robocopy $LASTEXITCODE)." }

  $empty = Join-Path $mobile "$Name.empty"
  New-Item -ItemType Directory -Force -Path $empty | Out-Null
  & robocopy.exe $empty $staging /MIR @quiet | Out-Null
  Remove-Item -LiteralPath $staging, $empty -Recurse -Force -ErrorAction SilentlyContinue
  $global:LASTEXITCODE = 0
}

if (-not $SkipBuild) {
  # The database before the code. A new api can read tables the old one did
  # not have -- since 2026-10-07 every timeline query asks the block list --
  # and built against a database without them it would answer every family's
  # timeline with an error. `migrate deploy` applies only what is not in yet,
  # and a backup comes first: a migration is the one step here that changes
  # the family's data rather than the code. The running api is untouched by
  # both, and a failure stops here, before anything is rebuilt.
  Write-Host 'Backing up before the database is changed...'
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here 'backup.ps1') -Force
  if ($LASTEXITCODE -ne 0) { throw 'The backup failed, so the database was left as it was.' }

  Write-Host 'Bringing the database up to date...'
  Push-Location (Join-Path $repo 'apps\api')
  try {
    & npx.cmd prisma migrate deploy
    if ($LASTEXITCODE -ne 0) { throw 'The database migration failed. The running api was left as it was.' }
  } finally {
    Pop-Location
  }

  Write-Host 'Building the api...'
  & npm.cmd --prefix (Join-Path $repo 'apps\api') run build
  if ($LASTEXITCODE -ne 0) { throw 'The api build failed.' }

  Write-Host 'Exporting the web build (a few minutes)...'
  Publish-WebExport 'dist-web'

  Write-Host 'Exporting the demo on sample data (a few minutes more)...'
  Publish-WebExport 'dist-web-demo' -SampleData
}

$action = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument ('"' + (Join-Path $here 'supervisor.vbs') + '"')

$trigger = New-ScheduledTaskTrigger -AtLogOn -User "$env:USERDOMAIN\$env:USERNAME"

# This is a laptop. The defaults stop a task the moment it goes onto battery,
# which would take the app away from the other computer when the charger is
# pulled -- and give it no reason why.
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit ([TimeSpan]::Zero)

$principal = New-ScheduledTaskPrincipal -UserId "$env:USERDOMAIN\$env:USERNAME" `
  -LogonType Interactive -RunLevel Limited

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger `
  -Settings $settings -Principal $principal -Force | Out-Null

# The nightly backup (backup.ps1): the database, the photographs, and a
# restore of the dump it just made, every time. Its own task rather than part
# of the supervisor, because a backup that only runs while the web server is
# up stops exactly when the thing it protects stops. StartWhenAvailable: a
# laptop asleep at three in the morning runs it when it wakes instead of
# skipping the night.
$backupAction = New-ScheduledTaskAction -Execute 'wscript.exe' `
  -Argument ('"' + (Join-Path $here 'backup.vbs') + '"')

# 03:00, and ten minutes after a logon, an unlock or a wake from sleep: a
# laptop is asleep at 03:00 more often than not, and StartWhenAvailable's
# catch-up for the missed run skipped 2026-09-27 and 2026-09-28 in a row.
# backup.ps1 does nothing within 20 hours of the last complete backup, so all
# of these together are still one backup a day.
$me = "$env:USERDOMAIN\$env:USERNAME"
$taskNamespace = 'ROOT\Microsoft\Windows\TaskScheduler'

$nightly = New-ScheduledTaskTrigger -Daily -At '03:00'

$afterLogon = New-ScheduledTaskTrigger -AtLogOn -User $me
$afterLogon.Delay = 'PT10M'

# StateChange 8 is TASK_SESSION_UNLOCK.
$afterUnlock = New-CimInstance -ClientOnly `
  -CimClass (Get-CimClass -Namespace $taskNamespace -ClassName 'MSFT_TaskSessionStateChangeTrigger') `
  -Property @{ StateChange = 8; UserId = $me; Delay = 'PT10M'; Enabled = $true }

# "The system has returned from a low power state."
$wakeQuery = '<QueryList><Query Id="0" Path="System"><Select Path="System">' +
  "*[System[Provider[@Name='Microsoft-Windows-Power-Troubleshooter'] and EventID=1]]" +
  '</Select></Query></QueryList>'
$afterWake = New-CimInstance -ClientOnly `
  -CimClass (Get-CimClass -Namespace $taskNamespace -ClassName 'MSFT_TaskEventTrigger') `
  -Property @{ Subscription = $wakeQuery; Delay = 'PT10M'; Enabled = $true }

$backupTrigger = @($nightly, $afterLogon, $afterUnlock, $afterWake)

$backupSettings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Minutes 30)

Register-ScheduledTask -TaskName 'FamStory backup' -Action $backupAction -Trigger $backupTrigger `
  -Settings $backupSettings -Principal $principal -Force | Out-Null

Write-Host "Installed 'FamStory backup' (daily: at 03:00, or after a logon, unlock or wake; into $env:USERPROFILE\FamStory backups)."

Write-Host "Installed '$TaskName'. It starts at your next logon; starting it now as well."
Start-ScheduledTask -TaskName $TaskName
