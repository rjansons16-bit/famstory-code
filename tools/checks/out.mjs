// Where the checks write their pictures: FAMSTORY_CHECKS_OUT when it is set,
// otherwise famstory-checks in the system's temp folder. outDir() makes the
// folder (or one inside it) and returns its path.
import { mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const ROOT = process.env.FAMSTORY_CHECKS_OUT ?? path.join(tmpdir(), 'famstory-checks');

export function outDir(name = '') {
  const dir = path.join(ROOT, name);
  mkdirSync(dir, { recursive: true });
  return dir;
}
