# Restores a FamStory database dump into a scratch database and checks that
# it holds what the live database holds. Run by backup.ps1 after every dump;
# can be run on its own against any dump.
#
#   powershell -ExecutionPolicy Bypass -File tools\lan-host\restore-check.ps1 -Dump "<path>.dump"
#
# A backup nobody has restored is a belief, not a backup. This is the step
# everybody skips, so it is not a step: it runs every time.
#
# The comparison is row counts for the tables a family would miss. It does not
# prove every byte, but it proves the dump is readable, complete in shape, and
# from the same database - which catches the failures that actually happen:
# an empty file, a truncated one, the wrong database, a dump of a schema with
# no rows in it.
#
# ASCII only (see backup.ps1).

param(
  [Parameter(Mandatory = $true)][string]$Dump,
  [string]$Target = (Join-Path $env:USERPROFILE 'FamStory backups')
)

$ErrorActionPreference = 'Stop'

$distro = 'Ubuntu'
$live = 'famstory'
$scratch = 'famstory_restore_check'
$report = Join-Path $Target 'last-restore-check.txt'

# The tables whose rows are the family's own. Quoted: Prisma creates them with
# capitalised names, which PostgreSQL otherwise folds to lower case.
$tables = @('User', 'Family', 'Member', 'Event', 'Attachment', 'Comment', 'Reaction', 'Notification')

function Invoke-Wsl([string[]]$arguments) {
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

function Get-Count([string]$database, [string]$table) {
  # The quotes are written \" on purpose. Windows PowerShell 5.1 does not
  # escape a double quote inside an argument it hands to a native program, so
  # a plain "User" arrives as User - which PostgreSQL reads as the function
  # current_user and happily counts as one row. That is how this check once
  # reported a family database with exactly one user in it.
  $value = Invoke-Wsl @('psql', '-d', $database, '-tAc', ('SELECT count(*) FROM \"{0}\"' -f $table))
  return [int](($value | Select-Object -Last 1).ToString().Trim())
}

$lines = New-Object System.Collections.Generic.List[string]
$lines.Add(('Restore check {0}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss')))
$lines.Add(('Dump: {0}' -f $Dump))

$ok = $true

try {
  if (-not (Test-Path $Dump)) { throw "No such dump: $Dump" }

  $dumpInWsl = (& wsl.exe -d $distro -- wslpath -a ($Dump -replace '\\', '/') | Select-Object -First 1).Trim()

  # A scratch database from nothing, every time: a leftover from a failed run
  # must not make a bad dump look good.
  Invoke-Wsl @('dropdb', '--if-exists', $scratch) | Out-Null
  Invoke-Wsl @('createdb', $scratch) | Out-Null
  Invoke-Wsl @('pg_restore', '--no-owner', '--exit-on-error', '-d', $scratch, $dumpInWsl) | Out-Null

  foreach ($table in $tables) {
    $liveCount = Get-Count $live $table
    $restoredCount = Get-Count $scratch $table

    # The live database may have moved on since the dump was taken - a new
    # event a minute later - so the restored copy may be BEHIND, never ahead.
    # Zero restored rows where the live table has some is the real failure.
    $fine = ($restoredCount -le $liveCount) -and -not ($liveCount -gt 0 -and $restoredCount -eq 0)
    if (-not $fine) { $ok = $false }

    $lines.Add(('  {0,-13} live {1,6}   restored {2,6}   {3}' -f $table, $liveCount, $restoredCount, $(if ($fine) { 'ok' } else { 'MISMATCH' })))
  }
} catch {
  $ok = $false
  $lines.Add(('ERROR: {0}' -f $_.Exception.Message))
} finally {
  try { Invoke-Wsl @('dropdb', '--if-exists', $scratch) | Out-Null } catch { }
}

$lines.Add($(if ($ok) { 'RESULT: the dump restores.' } else { 'RESULT: FAILED - this backup cannot be trusted.' }))

New-Item -ItemType Directory -Force -Path $Target | Out-Null
Set-Content -Path $report -Value $lines -Encoding UTF8
$lines | ForEach-Object { Write-Host $_ }

if ($ok) { exit 0 } else { exit 1 }
