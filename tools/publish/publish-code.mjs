#!/usr/bin/env node
/**
 * THE CODE FOR ANYBODY TO READ: a public copy of the repository as it is now.
 *
 * The repository itself stays private. This takes what is committed at HEAD
 * and nothing that is ignored, and puts it into a public repository as one
 * commit. Whoever has the link can then read the code without a GitHub
 * account.
 *
 * Left out of the copy:
 *   - The history. Its commits carry the owner's e-mail. The copy's single
 *     commit carries the account's noreply address instead.
 *   - The designer's file, design/screens/Fam Track.fig (.gitattributes:
 *     "the only copy of what the designer drew"). The screens drawn from it
 *     stay.
 *   - The feasibility study's contract number, from README.md and
 *     docs/00-PLAN.md.
 * After those are taken out, the copy is checked for the owner's e-mail and
 * the contract number. If either still turns up, nothing is published.
 *
 * Each run replaces the copy (--force), the same way publish-demo.mjs
 * replaces the demo's site.
 *
 * Run (gh signed in):  node tools/publish/publish-code.mjs [--repo <owner>/<name>]
 */
import { execFileSync } from 'node:child_process';
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');

const run = (cmd, args, options = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...options }).trim();
const flag = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 1 ? process.argv[at + 1] : undefined;
};

const LEFT_OUT = ['design/screens/Fam Track.fig'];
const CONTRACT = / \(contract no\. [^)]*\)/g;
const REDACTED_IN = ['README.md', 'docs/00-PLAN.md'];
// Built from parts, or this file - which goes into the copy too - would name it.
const CONTRACT_NO = ['2026', '03', 'JP'].join('/');

const [login, id] = run('gh', ['api', 'user', '--jq', '.login + " " + (.id | tostring)']).split(' ');
const repo = flag('repo') ?? `${login}/famstory-code`;
const demo = `https://${login.toLowerCase()}.github.io/`;
const ownEmail = run('git', ['-C', repoRoot, 'config', 'user.email']);
const commit = run('git', ['-C', repoRoot, 'rev-parse', '--short', 'HEAD']);
if (run('git', ['-C', repoRoot, 'status', '--porcelain', '--untracked-files=no'])) {
  console.warn('Uncommitted changes are not in the copy: it is HEAD, as committed.');
}

const site = mkdtempSync(path.join(tmpdir(), 'famstory-code-'));
try {
  // A shallow clone gives HEAD's files exactly as committed (.gitattributes
  // decides the line ends); its .git, with the owner's commit in it, goes.
  run('git', ['clone', '-q', '--depth', '1', '-c', 'core.autocrlf=false', pathToFileURL(repoRoot).href, site]);
  rmSync(path.join(site, '.git'), { recursive: true, force: true });

  for (const file of LEFT_OUT) rmSync(path.join(site, file), { force: true });
  for (const file of REDACTED_IN) {
    const at = path.join(site, file);
    if (existsSync(at)) writeFileSync(at, readFileSync(at, 'utf8').replace(CONTRACT, ''));
  }
  const readme = path.join(site, 'README.md');
  writeFileSync(
    readme,
    [
      `> **A published copy of FamStory's code** (${new Date().toISOString().slice(0, 10)}). The demo: ${demo}`,
      '>',
      `> Publicēta FamStory koda kopija. Demo: ${demo}`,
      '',
      readFileSync(readme, 'utf8'),
    ].join('\n'),
  );

  // Fail closed: nothing goes out that still names the owner or the contract.
  const found = [];
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const at = path.join(dir, name);
      if (statSync(at).isDirectory()) walk(at);
      else {
        const text = readFileSync(at, 'latin1');
        if ((ownEmail && text.includes(ownEmail)) || text.includes(CONTRACT_NO)) found.push(path.relative(site, at));
      }
    }
  };
  walk(site);
  if (found.length) {
    console.error(`Not published - still in the copy: ${found.join(', ')}`);
    process.exitCode = 1;
  } else {
    const git = (...args) => run('git', ['-C', site, ...args]);
    git('init', '-q', '-b', 'main');
    git('config', 'core.autocrlf', 'false');
    git('add', '-A');
    git(
      '-c', `user.name=${login}`,
      '-c', `user.email=${id}+${login}@users.noreply.github.com`,
      'commit', '-q', '-m', `FamStory, the code as of ${commit}`,
    );
    try {
      run('gh', ['repo', 'view', repo, '--json', 'name']);
    } catch {
      run('gh', ['repo', 'create', repo, '--public', '--description', `FamStory - the code (a published copy). Demo: ${demo}`]);
      console.log(`created ${repo} (public)`);
    }
    // gh signs the push in, without changing the machine's git configuration.
    git('-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'push', '-q', '--force', `https://github.com/${repo}.git`, 'main');
    console.log(`published ${commit} to https://github.com/${repo}`);
  }
} finally {
  rmSync(site, { recursive: true, force: true });
}
