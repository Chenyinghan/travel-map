// npm run deploy — build the read-only site from your data/ and push it to YOUR site repository.
//
// The code repository never contains your data. Your site repository only contains the built site
// (HTML/JS, travel.json without file names or timestamps, thumbnails and display-size photos).
// Each deploy replaces the site branch with a single fresh commit, so photos you delete don't
// stay in that repository's history.
//
//   npm run deploy -- --repo git@github.com:you/my-travels.git   first time (saved to data/site.json)
//   npm run deploy                                               every time after that
//
// Options (saved for next time): --repo <git url>  --domain <travel.example.com | none>
//                                --title "<site title>"  --branch <name, default main>
// One-off flags: --dry-run (build and prepare, don't push), --force (skip the safety check)
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dataDir, readSiteConfig, writeSiteConfig } from './site-config.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
process.chdir(root);

const SITE_DIR = path.join(root, 'site');
const WORK = path.join(root, '.deploy'); // local cache of the site repo (git-ignored, safe to delete)
const MARKER = '.travel-map-site';
// Files GitHub may create in a brand-new repo; a branch with only these is fine to replace
const STARTER_FILES = new Set(['README.md', 'LICENSE', '.gitignore', 'CNAME', '.nojekyll']);
// Site commits use a neutral identity, not your git name/email
const BOT = {
  GIT_AUTHOR_NAME: 'travel-map',
  GIT_AUTHOR_EMAIL: 'deploy@travel-map.invalid',
  GIT_COMMITTER_NAME: 'travel-map',
  GIT_COMMITTER_EMAIL: 'deploy@travel-map.invalid',
};

const fail = (msg) => {
  console.error('\n✗ ' + msg + '\n');
  process.exit(1);
};
const git = (args, { network = false } = {}) =>
  execFileSync('git', args, {
    cwd: WORK,
    encoding: 'utf8',
    env: { ...process.env, ...BOT },
    stdio: ['inherit', 'pipe', network ? 'inherit' : 'pipe'],
  }).trim();

// ---------- options ----------
const argv = process.argv.slice(2);
const flags = {};
for (let i = 0; i < argv.length; i++) {
  const a = argv[i];
  if (a === '--help' || a === '-h') flags.help = true;
  else if (a === '--dry-run') flags.dryRun = true;
  else if (a === '--force') flags.force = true;
  else if (/^--(repo|domain|title|branch)$/.test(a)) {
    if (argv[i + 1] === undefined) fail(`${a} needs a value`);
    flags[a.slice(2)] = argv[++i];
  } else if (/^--(repo|domain|title|branch)=/.test(a)) {
    const [k, ...v] = a.slice(2).split('=');
    flags[k] = v.join('=');
  } else fail(`Unknown option: ${a}   (see npm run deploy -- --help)`);
}
if (flags.help) {
  const src = fs.readFileSync(fileURLToPath(import.meta.url), 'utf8');
  console.log(src.split('\nimport ')[0].replace(/^\/\/ ?/gm, ''));
  process.exit(0);
}

const cfg = readSiteConfig();
const before = JSON.stringify(cfg);
if (flags.repo !== undefined) cfg.repo = flags.repo.trim();
if (flags.title !== undefined) cfg.title = flags.title.trim();
if (flags.branch !== undefined) cfg.branch = flags.branch.trim() || 'main';
if (flags.domain !== undefined) {
  const d = flags.domain.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (d === '' || d === 'none') cfg.domain = '';
  else if (!/^([a-z0-9-]+\.)+[a-z]{2,}$/.test(d)) fail(`"${flags.domain}" doesn't look like a domain name (e.g. travel.example.com)`);
  else cfg.domain = d;
}
if (!cfg.repo)
  fail(
    'No site repository set up yet.\n\n' +
      '  1. Create a new, empty PUBLIC repository for your site on GitHub (e.g. my-travels):\n' +
      '     https://github.com/new\n' +
      '     Use a different repository from the one with this code.\n' +
      '  2. Then run:\n' +
      '     npm run deploy -- --repo git@github.com:<you>/my-travels.git\n' +
      '     (optional)  --domain travel.example.com   --title "My Travels"'
  );

const ghKey = (url) => {
  const m = String(url).match(/github\.com[:/]+([^/]+)\/([^/]+?)(?:\.git)?\/*$/i);
  return m ? { owner: m[1], name: m[2], key: `${m[1]}/${m[2]}`.toLowerCase() } : null;
};
const target = ghKey(cfg.repo);

// Never push the site over the code repository itself
try {
  const codeRemote = execFileSync('git', ['-C', root, 'remote', 'get-url', 'origin'], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'ignore'],
  }).trim();
  const code = ghKey(codeRemote);
  if (codeRemote === cfg.repo || (code && target && code.key === target.key))
    fail(
      `${cfg.repo} is this code's own repository.\n` +
        '  Your site needs its own, separate repository. Set it with --repo <url>.'
    );
} catch (e) {
  if (e.status === undefined) throw e; // fail() exits; a non-zero git status just means "no remote"
}

// ---------- 1. photos ready? ----------
const dataFile = path.join(dataDir(), 'travel.json');
if (fs.existsSync(dataFile)) {
  const data = JSON.parse(fs.readFileSync(dataFile, 'utf8'));
  const missing = [];
  let total = 0;
  for (const place of Object.values(data.places || {}))
    for (const v of place.visits || [])
      for (const p of v.photos || []) {
        total++;
        for (const f of [`${p.id}_thumb.jpg`, `${p.id}_disp.jpg`])
          if (!fs.existsSync(path.join(dataDir(), 'photos', f))) missing.push(f);
      }
  if (missing.length)
    fail(
      `${missing.length} photo file(s) aren't ready yet (e.g. ${missing[0]}).\n` +
        '  Open the editor once with npm run dev — it creates them automatically — then deploy again.'
    );
  console.log(`✓ ${Object.keys(data.places || {}).length} places, ${total} photos`);
} else {
  console.log('(No data/travel.json yet — publishing an empty map)');
}

// ---------- 2. check the site repository ----------
fs.mkdirSync(WORK, { recursive: true });
if (!fs.existsSync(path.join(WORK, '.git'))) git(['init', '-q']);
const remotes = git(['remote']).split('\n');
git(remotes.includes('origin') ? ['remote', 'set-url', 'origin', cfg.repo] : ['remote', 'add', 'origin', cfg.repo]);

const branch = cfg.branch;
const remoteRef = `refs/remotes/origin/${branch}`;
console.log(`→ Checking ${cfg.repo}…`);
let remoteHead = '';
try {
  const line = git(['ls-remote', '--heads', 'origin', `refs/heads/${branch}`], { network: true });
  remoteHead = line.split(/\s+/)[0] || '';
} catch {
  fail(
    `Couldn't reach ${cfg.repo}.\n` +
      '  Check that the repository exists and that you can push to it\n' +
      '  (for an SSH address, `ssh -T git@github.com` should greet you by name).'
  );
}

let remoteTree = '';
if (remoteHead) {
  try {
    git(['fetch', '-q', '--no-tags', 'origin', `+refs/heads/${branch}:${remoteRef}`], { network: true });
  } catch {
    fail(`Couldn't download the current ${branch} branch of ${cfg.repo}.`);
  }
  remoteTree = git(['rev-parse', `${remoteRef}^{tree}`]);
  const files = git(['ls-tree', '-r', '--name-only', remoteRef]).split('\n').filter(Boolean);
  const isOurs = files.includes(MARKER);
  const isStarter = files.every((f) => STARTER_FILES.has(f));
  if (!isOurs && !isStarter && !flags.force)
    fail(
      `The ${branch} branch of ${cfg.repo} already has other files (e.g. ${files.find((f) => !STARTER_FILES.has(f))}).\n` +
        '  Deploying replaces everything there, so use a separate, empty repository for your site.\n' +
        "  If you're sure this is the right one, run again with --force."
    );
}

// Settings are saved only once the repository checks out
if (JSON.stringify(cfg) !== before) {
  writeSiteConfig(cfg);
  console.log(`✓ Saved settings to ${path.relative(root, path.join(dataDir(), 'site.json'))}`);
}

// ---------- 3. build ----------
console.log(`→ Building the site ("${cfg.title}")…`);
const b = spawnSync(process.execPath, [path.join(root, 'node_modules', 'vite', 'bin', 'vite.js'), 'build', '--mode', 'static', '--logLevel', 'warn'], {
  stdio: 'inherit',
});
if (b.status !== 0) fail('Build failed (see above).');

// ---------- 4. assemble the site ----------
for (const f of fs.readdirSync(WORK)) if (f !== '.git') fs.rmSync(path.join(WORK, f), { recursive: true, force: true });
fs.cpSync(SITE_DIR, WORK, { recursive: true });
fs.writeFileSync(path.join(WORK, '.nojekyll'), '');
fs.writeFileSync(
  path.join(WORK, MARKER),
  'This branch is generated by travel-map (npm run deploy) and is replaced on every deploy.\nDo not edit it by hand.\n'
);
if (cfg.domain) fs.writeFileSync(path.join(WORK, 'CNAME'), cfg.domain + '\n');

git(['add', '-A']);
const tree = git(['write-tree']);
const url = cfg.domain
  ? `https://${cfg.domain}/`
  : target
    ? target.name.toLowerCase() === `${target.owner.toLowerCase()}.github.io`
      ? `https://${target.owner.toLowerCase()}.github.io/`
      : `https://${target.owner.toLowerCase()}.github.io/${target.name}/`
    : null;

if (tree === remoteTree) {
  console.log('\n✓ Nothing changed — the site is already up to date.' + (url ? `\n  ${url}` : '') + '\n');
  process.exit(0);
}

const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
const commit = git(['commit-tree', tree, '-m', `Publish site (${stamp} UTC)`]);
git(['update-ref', `refs/heads/${branch}`, commit]);
git(['symbolic-ref', 'HEAD', `refs/heads/${branch}`]);

if (flags.dryRun) {
  console.log(`\n✓ Dry run: the site is ready in ${path.relative(root, WORK)}/ but was not pushed.\n`);
  process.exit(0);
}

// ---------- 5. push ----------
console.log('→ Publishing…');
const p = spawnSync(
  'git',
  ['push', '-q', `--force-with-lease=refs/heads/${branch}:${remoteHead}`, 'origin', `${commit}:refs/heads/${branch}`],
  { cwd: WORK, stdio: 'inherit', env: { ...process.env, ...BOT } }
);
if (p.status !== 0) fail('Push failed (see above).');
git(['update-ref', remoteRef, commit]);

console.log('\n✓ Published. GitHub Pages updates in about a minute.');
if (url) console.log(`  ${url}`);
if (!remoteHead && target) {
  console.log(
    '\n  First deploy — turn on GitHub Pages once:\n' +
      `    https://github.com/${target.owner}/${target.name}/settings/pages\n` +
      `    Source: "Deploy from a branch" → Branch: ${branch}, folder: / (root) → Save`
  );
  if (cfg.domain) {
    const labels = cfg.domain.split('.');
    const dns =
      labels.length > 2
        ? `      CNAME  ${labels.slice(0, -2).join('.')}  →  ${target.owner.toLowerCase()}.github.io`
        : '      A  @  →  185.199.108.153, 185.199.109.153, 185.199.110.153, 185.199.111.153';
    console.log(
      `    Custom domain: ${cfg.domain} is set by the CNAME file. At your DNS provider add\n` +
        dns +
        '\n    then tick "Enforce HTTPS" in the same Pages settings once it is available.'
    );
  }
}
console.log('');
