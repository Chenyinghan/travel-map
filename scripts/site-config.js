// Personal settings live next to your data (data/site.json), never in the code repo:
//   { "title": "My Travel Map", "repo": "git@github.com:you/my-travels.git", "domain": "travel.example.com" }
import fs from 'node:fs';
import path from 'node:path';

export const DEFAULT_TITLE = 'My Travel Map';

export const dataDir = () => path.resolve(process.env.TRAVEL_DATA_DIR || 'data');
const configFile = () => path.join(dataDir(), 'site.json');

export function readSiteConfig() {
  let cfg = {};
  try {
    cfg = JSON.parse(fs.readFileSync(configFile(), 'utf8'));
  } catch (e) {
    if (e.code !== 'ENOENT') console.warn(`  [site] Couldn't read ${configFile()}: ${e.message}`);
  }
  return {
    title: typeof cfg.title === 'string' && cfg.title.trim() ? cfg.title.trim() : DEFAULT_TITLE,
    repo: cfg.repo || '',
    branch: cfg.branch || 'main',
    domain: cfg.domain || '',
  };
}

export function writeSiteConfig(cfg) {
  fs.mkdirSync(dataDir(), { recursive: true });
  const out = {};
  for (const k of ['title', 'repo', 'branch', 'domain']) if (cfg[k]) out[k] = cfg[k];
  if (out.title === DEFAULT_TITLE) delete out.title;
  if (out.branch === 'main') delete out.branch;
  fs.writeFileSync(configFile(), JSON.stringify(out, null, 2) + '\n');
}
