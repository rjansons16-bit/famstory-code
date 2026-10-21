#!/usr/bin/env bash
# A scratch database from nothing: every migration, the schema compared with
# them, the reviewer script three ways, then launch-check.ts - or the check
# named as the first argument (blockdb-check.ts). Dropped at the end.
set -u
HERE="$(cd "$(dirname "$0")" && pwd)"
API="$(cd "$HERE/../../apps/api" && pwd)"
CHECK="${1:-launch-check.ts}"
DB=famstory_launch_check
cd "$API"

wsl -d Ubuntu -u postgres -- dropdb --if-exists "$DB" >/dev/null 2>&1
wsl -d Ubuntu -u postgres -- createdb -O famstory "$DB" || exit 1
trap 'wsl -d Ubuntu -u postgres -- dropdb --if-exists "$DB" >/dev/null 2>&1; echo "scratch database dropped"' EXIT

URL=$(node -e "const fs=require('fs');const l=fs.readFileSync('.env','utf8').split(/\r?\n/).find(x=>x.startsWith('DATABASE_URL='));const u=new URL(l.slice(13).replace(/^\"|\"\$/g,''));u.pathname='/$DB';process.stdout.write(u.toString())")
export DATABASE_URL="$URL" CHECK_DATABASE_URL="$URL"

echo "== migrate deploy"
npx prisma migrate deploy 2>&1 | grep -E "migrations|applied|Error|error" | tail -4

echo "== schema against the migrations"
npx prisma migrate diff --from-url "$URL" --to-schema-datamodel prisma/schema.prisma --exit-code >/tmp/famstory-diff.txt 2>&1
code=$?
if [ "$code" = "0" ]; then echo "no difference"; else echo "DIFFERENCE ($code)"; cat /tmp/famstory-diff.txt; fi

echo "== reviewer: make"
npx ts-node scripts/reviewer.ts 2>&1 | grep -v "Password:" | grep -E "ready|Sign in|Error"
echo "== reviewer: again"
npx ts-node scripts/reviewer.ts 2>&1 | grep -v "Password:" | grep -E "ready|Error"
echo "== reviewer: --fresh"
npx ts-node scripts/reviewer.ts --fresh 2>&1 | grep -v "Password:" | grep -E "ready|Error"

echo "== $CHECK"
NODE_PATH="$API/node_modules" TS_NODE_PROJECT="$API/tsconfig.json" npx ts-node --transpile-only "$HERE/$CHECK" 2>&1 | grep -v "^\s*$" | tail -20
