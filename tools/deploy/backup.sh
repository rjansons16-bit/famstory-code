#!/usr/bin/env bash
# Backs up FamStory on a server: the database and the photographs, then proves
# the database backup restores. The same job tools/lan-host/backup.ps1 does on
# the laptop, and for the same reason - a backup nobody has restored is a
# belief, not a backup.
#
#   tools/deploy/backup.sh                 # into /var/backups/famstory
#   BACKUP_DIR=/mnt/box tools/deploy/backup.sh
#
# Run nightly from cron (README.md, "Backups"):
#   0 3 * * *  /opt/famstory/tools/deploy/backup.sh >> /var/log/famstory-backup.log 2>&1
#
# KEEPS  database/famstory-<stamp>.dump   pg_dump custom format; the newest 7,
#                                         plus the newest of each of 4 weeks
#        media/                           a mirror of the photographs
#        last-restore-check.txt           when a dump was last restored, and
#                                         whether its rows matched the live ones
#
# THE TARGET is on this server by default, which protects against a bad
# migration or a mistaken delete, NOT against losing the server. A copy
# somewhere else (a Storage Box, another provider) is README.md's last step,
# and a decision about where families' photographs go - so it is not made here.

set -euo pipefail

here="$(cd "$(dirname "$0")" && pwd)"
compose=(docker compose -f "$here/docker-compose.yml")
target="${BACKUP_DIR:-/var/backups/famstory}"
keep_daily=7
keep_weekly=4

mkdir -p "$target/database" "$target/media"
log() { printf '[%s] %s\n' "$(date '+%F %T')" "$*"; }

# --- 1. The database --------------------------------------------------------
stamp="$(date +%Y%m%d-%H%M)"
dump="$target/database/famstory-$stamp.dump"
"${compose[@]}" exec -T db pg_dump -U famstory --format=custom --no-owner famstory > "$dump"
size=$(stat -c %s "$dump")
if [ "$size" -lt 1024 ]; then log "BACKUP FAILED: the dump is only $size bytes"; exit 1; fi
log "Database dumped: $(basename "$dump") ($((size / 1024)) KB)"

# --- 2. The photographs -----------------------------------------------------
# Straight out of the API container's volume; --delete so the copy matches.
api="$("${compose[@]}" ps -q api)"
if [ -n "$api" ]; then
  rm -rf "$target/media.next" && mkdir -p "$target/media.next"
  docker cp "$api:/data/media/." "$target/media.next/"
  rm -rf "$target/media" && mv "$target/media.next" "$target/media"
  log "Photographs copied: $(find "$target/media" -type f | wc -l) file(s)"
else
  log "BACKUP FAILED: the api container is not running, so the photographs were not copied"; exit 1
fi

# --- 3. Rotation --------------------------------------------------------------
mapfile -t dumps < <(ls -1 "$target/database"/famstory-*.dump | sort -r)
declare -A keep=()
for f in "${dumps[@]:0:$keep_daily}"; do keep["$f"]=1; done
declare -A weeks=()
for f in "${dumps[@]}"; do
  week="$(date -r "$f" +%G-%V)"
  if [ -z "${weeks[$week]:-}" ] && [ "${#weeks[@]}" -lt "$keep_weekly" ]; then
    weeks["$week"]=1; keep["$f"]=1
  fi
done
removed=0
for f in "${dumps[@]}"; do
  if [ -z "${keep[$f]:-}" ]; then rm -f "$f"; removed=$((removed + 1)); fi
done
[ "$removed" -gt 0 ] && log "Removed $removed old dump(s)."

# --- 4. Prove it restores -----------------------------------------------------
# Into a scratch database beside the live one, then the rows a family would
# miss are counted in both. Quoted: Prisma creates the tables with capitals.
scratch="famstory_restore_check"
psql_live() { "${compose[@]}" exec -T db psql -U famstory -d "$1" -tAc "$2"; }
"${compose[@]}" exec -T db dropdb -U famstory --if-exists "$scratch"
"${compose[@]}" exec -T db createdb -U famstory "$scratch"
"${compose[@]}" exec -T db pg_restore -U famstory --no-owner -d "$scratch" < "$dump"

result="ok"
report=""
for table in User Family Member Event Attachment Comment Reaction Notification; do
  live="$(psql_live famstory "SELECT count(*) FROM \"$table\"" | tr -d '[:space:]')"
  restored="$(psql_live "$scratch" "SELECT count(*) FROM \"$table\"" | tr -d '[:space:]')"
  report+="$table live=$live restored=$restored"$'\n'
  # A minute has passed since the dump, so the live count may have grown a
  # little - never shrunk below the copy, and never grown by more than a
  # minute's worth. An empty restore of a full table is the failure this is for.
  if ! [[ "$restored" =~ ^[0-9]+$ && "$live" =~ ^[0-9]+$ ]]; then result="MISMATCH"; continue; fi
  slack=$(( live / 20 > 10 ? live / 20 : 10 ))
  if [ "$restored" -gt "$live" ] || [ $(( live - restored )) -gt "$slack" ] \
     || { [ "$live" -gt 0 ] && [ "$restored" -eq 0 ]; }; then
    result="MISMATCH"
  fi
done
"${compose[@]}" exec -T db dropdb -U famstory "$scratch"

printf '%s\nrestored %s: %s\n%s' "$(date '+%F %T')" "$(basename "$dump")" "$result" "$report" \
  > "$target/last-restore-check.txt"
if [ "$result" != "ok" ]; then log "BACKUP FAILED: the restore check did not match; see last-restore-check.txt"; exit 1; fi

log "Backup complete; the dump restores."
