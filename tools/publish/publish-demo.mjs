#!/usr/bin/env node
/**
 * THE DEMO ON GITHUB PAGES: a link that stays up while this laptop sleeps.
 *
 * Publishes the demo export (apps/mobile/dist-web-demo, which
 * tools/lan-host/install.ps1 builds without a server) to a GitHub Pages site.
 * The default is the account's own site, <user>.github.io, because that one is
 * served at the root and the export loads everything from "/". A project site
 * (<user>.github.io/<repo>/) would need the app built with a base URL.
 *
 * Only the built demo goes there: sample data, no server, no source. That way
 * the code itself can stay private, since on GitHub's free plan Pages serves
 * public repositories only. The site is replaced each time with one commit,
 * pushed with --force. The commit carries the account's noreply address, not
 * the owner's e-mail.
 *
 * Added beside the export:
 *   .nojekyll        Pages runs Jekyll otherwise, and Jekyll drops _expo/
 *                    (the bundles).
 *   404.html         The app's shell. A link into the app (/event/...) then
 *                    opens the app, as the LAN server's fallback does.
 *   real/index.html  not-public.html. Here the demo's "Start your own family"
 *                    has no real app beside it.
 *
 * Run (gh signed in):  node tools/publish/publish-demo.mjs [--repo <owner>/<name>]
 */
import { execFileSync } from 'node:child_process';
import { cpSync, existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(here, '..', '..');
const EXPORT = path.join(repoRoot, 'apps', 'mobile', 'dist-web-demo');
const NOT_PUBLIC = path.join(repoRoot, 'tools', 'lan-host', 'not-public.html');

const run = (cmd, args, options = {}) => execFileSync(cmd, args, { encoding: 'utf8', ...options }).trim();
const flag = (name) => {
  const at = process.argv.indexOf(`--${name}`);
  return at > 1 ? process.argv[at + 1] : undefined;
};

if (!existsSync(path.join(EXPORT, 'index.html'))) {
  console.error(`No demo export at ${EXPORT} - run tools/lan-host/install.ps1 first.`);
  process.exit(1);
}

const [login, id] = run('gh', ['api', 'user', '--jq', '.login + " " + (.id | tostring)']).split(' ');
const repo = flag('repo') ?? `${login}/${login}.github.io`;
const userSite = repo.toLowerCase() === `${login}/${login}.github.io`.toLowerCase();
const url = userSite ? `https://${login.toLowerCase()}.github.io/` : `https://${login.toLowerCase()}.github.io/${repo.split('/')[1]}/`;
if (!userSite) console.warn(`${repo} is a project site, served under a path: the export must be built with that base URL.`);

const builtFrom = run('git', ['-C', repoRoot, 'rev-parse', '--short', 'HEAD']);
const site = mkdtempSync(path.join(tmpdir(), 'famstory-pages-'));
try {
  // Pages compresses on its own: the .br/.gz twins the LAN server sends are left out.
  cpSync(EXPORT, site, { recursive: true, filter: (from) => !/\.(br|gz)$/.test(from) });
  writeFileSync(path.join(site, '.nojekyll'), '');
  writeFileSync(path.join(site, '404.html'), readFileSync(path.join(EXPORT, 'index.html')));
  mkdirSync(path.join(site, 'real'), { recursive: true });
  writeFileSync(path.join(site, 'real', 'index.html'), readFileSync(NOT_PUBLIC));
  writeFileSync(
    path.join(site, 'README.md'),
    [
      '# FamStory - demo',
      '',
      `**${url}**`,
      '',
      "FamStory keeps a family's memories and calendar in one place. This is its demo: a sample family, and nothing you make in it is kept.",
      '',
      'Ģimenes atmiņas un kalendārs vienuviet. Šis ir demo ar parauga ģimeni: nekas, ko tajā izveido, netiek saglabāts.',
      '',
      'This repository holds the built web app only, no source code. Each new version of the demo replaces it.',
      '',
    ].join('\n'),
  );

  const git = (...args) => run('git', ['-C', site, ...args]);
  git('init', '-q', '-b', 'main');
  // Byte for byte: a machine with core.autocrlf on would rewrite line ends in the bundles.
  git('config', 'core.autocrlf', 'false');
  git('add', '-A');
  git(
    '-c', `user.name=${login}`,
    '-c', `user.email=${id}+${login}@users.noreply.github.com`,
    'commit', '-q', '-m', `FamStory demo, built from ${builtFrom}`,
  );

  try {
    run('gh', ['repo', 'view', repo, '--json', 'name']);
  } catch {
    run('gh', ['repo', 'create', repo, '--public', '--description', "FamStory demo - a family's memories and calendar (a sample family; nothing is kept)"]);
    console.log(`created ${repo} (public)`);
  }
  // gh signs the push in, without changing the machine's git configuration.
  git('-c', 'credential.helper=', '-c', 'credential.helper=!gh auth git-credential', 'push', '-q', '--force', `https://github.com/${repo}.git`, 'main');

  try {
    run('gh', ['api', `repos/${repo}/pages`, '--jq', '.html_url']);
  } catch {
    run('gh', ['api', '-X', 'POST', `repos/${repo}/pages`, '-f', 'source[branch]=main', '-f', 'source[path]=/']);
  }
  console.log(`published ${builtFrom} to ${repo} - ${url} (live in a minute or two)`);
} finally {
  rmSync(site, { recursive: true, force: true });
}
