# Backs up FamStory: the database and the photographs. Then proves the
# database backup can be restored.
#
#   powershell -ExecutionPolicy Bypass -File tools\lan-host\backup.ps1
#   powershell -ExecutionPolicy Bypass -File tools\lan-host\backup.ps1 -Target "D:\FamStory backups"
#
# Why this exists: until it did, nothing backed up anything. One disk failure
# would have been the end of every family's archive on this machine, and a
# family memory product that loses the memories does not get a second chance.
#
# WHAT IT KEEPS
#   database\famstory-<date>.dump   pg_dump custom format. The newest 7, plus
#                                   the newest of each of the last 4 weeks.
#   media\                          a mirror of the photographs (robocopy /MIR).
#   backup.log                      one line per run.
#   last-restore-check.txt          when a dump was last restored, and whether
#                                   the rows matched.
#
# THE RESTORE CHECK is the point. A backup nobody has restored is a belief,
# not a backup: every run restores the dump it just made into a scratch
# database, counts the rows of the tables that matter, compares them with the
# live database, and drops the scratch copy.
#
# THE TARGET is a folder on this machine by default, which protects against a
# bad migration or an accidental delete but NOT against this disk dying. Point
# -Target at another drive, or at a folder inside OneDrive, to get a copy off
# the machine. That is a decision about where the family's photographs go, so
# it is not made here.
#
# ASCII only: Windows PowerShell 5.1 reads a BOM-less file as the system code
# page, and one typographic dash is enough to break the parse.

#
# HOW OFTEN: once a day, whatever wakes it. The task starts this at 03:00 and
# also after a logon, an unlock and a wake from sleep (install.ps1), because a
# laptop asleep at 03:00 is the normal case, and Windows' own catch-up for a
# missed run proved not to be dependable: it ran on 2026-09-26 and skipped
# the next two mornings. So a run within -MinHours of the last complete
# backup does nothing - otherwise four starts a day would push a week of
# daily dumps out in two days. -Force runs regardless.

param(
  [string]$Target = (Join-Path $env:USERPROFILE 'FamStory backups'),
  [int]$KeepDaily = 7,
  [int]$KeepWeekly = 4,
  [int]$MinHours = 20,
  [switch]$Force
)

$ErrorActionPreference = 'Stop'

$here = Split-Path -Parent $MyInvocation.MyCommand.Path
$repo = (Resolve-Path (Join-Path $here '..\..')).Path
$media = Join-Path $repo 'apps\api\var\media'
$distro = 'Ubuntu'
$database = 'famstory'

$dbFolder = Join-Path $Target 'database'
$mediaFolder = Join-Path $Target 'media'
$log = Join-Path $Target 'backup.log'
New-Item -ItemType Directory -Force -Path $dbFolder, $mediaFolder | Out-Null

function Write-Log([string]$message) {
  $line = '[{0}] {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $message
  Add-Content -Path $log -Value $line -Encoding UTF8
  Write-Host $line
}

function Invoke-Wsl([string[]]$arguments) {
  # stdout is text here, never the dump itself: pg_dump writes its file
  # directly, because a binary stream through a PowerShell 5.1 pipeline is
  # re-encoded as text and corrupted.
  # Judged by the exit code alone. PostgreSQL's tools print NOTICEs on stderr
  # ("database does not exist, skipping"), and Windows PowerShell 5.1 turns
  # every stderr line of a native command into an error record - which under
  # ErrorActionPreference Stop ends the script on a message that means fine.
  $previous = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'
  try {
    $output = & wsl.exe -d $distro -u postgres -- @arguments 2>&1
    $code = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previous
  }
  if ($code -ne 0) { throw ("wsl {0} failed: {1}" -f ($arguments -join ' '), ($output -join ' ')) }
  return $output | Where-Object { $_ -isnot [System.Management.Automation.ErrorRecord] }
}

# When the last run that finished said "Backup complete.", or $null. A run that
# failed half way does not count, so the next start tries again.
function Get-LastCompleteBackup {
  if (-not (Test-Path $log)) { return $null }
  $last = Get-Content -Path $log -Tail 200 -Encoding UTF8 |
    Where-Object { $_ -match '^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\] Backup complete\.$' } |
    Select-Object -Last 1
  if (-not $last) { return $null }
  $null = $last -match '^\[(\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2})\]'
  return [datetime]::ParseExact($Matches[1], 'yyyy-MM-dd HH:mm:ss', [System.Globalization.CultureInfo]::InvariantCulture)
}

if (-not $Force) {
  $lastComplete = Get-LastCompleteBackup
  if ($lastComplete -and ((Get-Date) - $lastComplete).TotalHours -lt $MinHours) {
    # Not logged: this is the common case on every unlock, and a line per
    # unlock would bury the lines that matter.
    Write-Host ("Skipped: the last backup finished at {0:yyyy-MM-dd HH:mm}." -f $lastComplete)
    exit 0
  }
}

function ConvertTo-WslPath([string]$windowsPath) {
  $converted = & wsl.exe -d $distro -- wslpath -a ($windowsPath -replace '\\', '/')
  if ($LASTEXITCODE -ne 0) { throw "wslpath failed for $windowsPath" }
  return ($converted | Select-Object -First 1).Trim()
}

try {
  # PostgreSQL lives in WSL, which stops the distro when nothing holds it.
  & wsl.exe -d $distro -u root -- service postgresql start | Out-Null

  # --- 1. The database -----------------------------------------------------
  $stamp = Get-Date -Format 'yyyyMMdd-HHmm'
  $dump = Join-Path $dbFolder "famstory-$stamp.dump"
  $dumpInWsl = ConvertTo-WslPath $dump

  Invoke-Wsl @('pg_dump', '--format=custom', '--no-owner', '--file', $dumpInWsl, $database) | Out-Null

  $size = (Get-Item $dump).Length
  if ($size -lt 1024) { throw "The dump is only $size bytes; something is wrong." }
  Write-Log ("Database dumped: {0} ({1:N0} KB)" -f (Split-Path $dump -Leaf), ($size / 1KB))

  # --- 2. The photographs --------------------------------------------------
  if (Test-Path $media) {
    # /MIR: the backup matches the live folder. /R /W: a locked file must not
    # stall the run for the default million retries.
    & robocopy.exe $media $mediaFolder /MIR /R:2 /W:2 /NFL /NDL /NJH /NJS /NP | Out-Null
    if ($LASTEXITCODE -ge 8) { throw "Copying the photographs failed (robocopy $LASTEXITCODE)." }
    $global:LASTEXITCODE = 0

    $files = (Get-ChildItem -Recurse -File $mediaFolder | Measure-Object).Count
    Write-Log "Photographs mirrored: $files file(s)"
  } else {
    Write-Log 'No photographs yet.'
  }

  # --- 3. Rotation ---------------------------------------------------------
  $dumps = Get-ChildItem -Path $dbFolder -Filter 'famstory-*.dump' | Sort-Object Name -Descending
  $keep = @{}
  $dumps | Select-Object -First $KeepDaily | ForEach-Object { $keep[$_.FullName] = $true }

  # The newest dump of each ISO week, for the last few weeks.
  $calendar = [System.Globalization.CultureInfo]::InvariantCulture.Calendar
  $weeks = @{}
  foreach ($file in $dumps) {
    $week = '{0}-{1}' -f $file.LastWriteTime.Year, $calendar.GetWeekOfYear($file.LastWriteTime, 'FirstFourDayWeek', 'Monday')
    if (-not $weeks.ContainsKey($week) -and $weeks.Count -lt $KeepWeekly) {
      $weeks[$week] = $true
      $keep[$file.FullName] = $true
    }
  }

  $removed = 0
  foreach ($file in $dumps) {
    if (-not $keep.ContainsKey($file.FullName)) {
      Remove-Item -LiteralPath $file.FullName -Force
      $removed++
    }
  }
  if ($removed -gt 0) { Write-Log "Removed $removed old dump(s)." }

  # --- 4. Prove it restores ------------------------------------------------
  & powershell.exe -NoProfile -ExecutionPolicy Bypass -File (Join-Path $here 'restore-check.ps1') -Dump $dump -Target $Target
  if ($LASTEXITCODE -ne 0) { throw 'The restore check failed; see last-restore-check.txt.' }

  Write-Log 'Backup complete.'
  exit 0
} catch {
  Write-Log ("BACKUP FAILED: {0}" -f $_.Exception.Message)
  exit 1
}
