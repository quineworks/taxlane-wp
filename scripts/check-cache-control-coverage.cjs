'use strict';

// platform#4552: site/worker.js's CACHE_CONTROL_OVERRIDES map gives
// select static assets (site/public/brand/, site/public/icons/, and the
// three root-level favicon/apple-touch-icon files) a 7-day Cache-Control
// header, but a PR adding a new file to one of those locations has twice
// shipped without a matching map entry (blinkblocks-icon.png, then
// tethra-icon.svg) and silently served it uncached instead. This module
// is the pure diffing logic a PR-time CI guard uses to catch a third
// recurrence: parses CACHE_CONTROL_OVERRIDES out of worker.js's source
// text (it's a Cloudflare Worker module, not a plain Node module, so it
// can't be `require`d directly — same reason calc-homepage-drift-check.cjs
// regex-parses its own source files instead of requiring them), lists the
// covered locations on disk, and returns any file present but unlisted.

const fs = require('fs');
const path = require('path');

// Matches each `"<path>": "<value>",` entry inside CACHE_CONTROL_OVERRIDES.
// Scoped to double-quoted string keys/values, matching every existing
// entry's style.
const OVERRIDE_ENTRY_RE = /"([^"]+)":\s*"[^"]*"/g;

function extractCoveredPaths(workerSource) {
  const mapStart = workerSource.indexOf('CACHE_CONTROL_OVERRIDES = {');
  if (mapStart === -1) return new Set();
  const mapEnd = workerSource.indexOf('};', mapStart);
  const mapBody = workerSource.slice(mapStart, mapEnd === -1 ? undefined : mapEnd);

  const covered = new Set();
  let match;
  while ((match = OVERRIDE_ENTRY_RE.exec(mapBody)) !== null) {
    covered.add(match[1]);
  }
  return covered;
}

// Locations whose files must each have a CACHE_CONTROL_OVERRIDES entry.
// Root-level favicon/apple-touch-icon files are listed explicitly (not
// directory-scanned) since site/public/ as a whole is not in scope — only
// these three filenames.
const ROOT_FILES = ['/favicon.ico', '/favicon.svg', '/apple-touch-icon.png'];
const SCAN_DIRS = ['site/public/brand', 'site/public/icons'];

function listDirAssetPaths(repoRoot, dir) {
  const absDir = path.join(repoRoot, dir);
  if (!fs.existsSync(absDir)) return [];
  const prefix = '/' + dir.replace(/^site\/public\//, '');
  return fs.readdirSync(absDir).map((file) => `${prefix}/${file}`);
}

function findUncoveredAssets(covered, assetPaths) {
  return assetPaths.filter((assetPath) => !covered.has(assetPath));
}

function run(repoRoot) {
  const workerSource = fs.readFileSync(path.join(repoRoot, 'site/worker.js'), 'utf8');
  const covered = extractCoveredPaths(workerSource);

  const assetPaths = [
    ...ROOT_FILES,
    ...SCAN_DIRS.flatMap((dir) => listDirAssetPaths(repoRoot, dir)),
  ];

  return findUncoveredAssets(covered, assetPaths);
}

module.exports = { extractCoveredPaths, findUncoveredAssets, run, ROOT_FILES, SCAN_DIRS };

if (require.main === module) {
  const repoRoot = path.join(__dirname, '..');
  const uncovered = run(repoRoot);

  if (uncovered.length > 0) {
    for (const assetPath of uncovered) {
      console.log(
        `::error file=site/worker.js::${assetPath} is missing a CACHE_CONTROL_OVERRIDES entry in site/worker.js (platform#4552).`
      );
    }
    console.log(
      `\n${uncovered.length} asset(s) missing from CACHE_CONTROL_OVERRIDES. Add a matching "public, max-age=604800" entry in site/worker.js, or add the path to this script's exclusion list if it's intentionally uncached.`
    );
    process.exit(1);
  }

  console.log('All brand/icon/favicon assets are covered by CACHE_CONTROL_OVERRIDES.');
}
