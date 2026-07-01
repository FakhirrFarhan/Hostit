const fs = require("fs");
const path = require("path");

const SKIP_DIRS = new Set(["node_modules", ".git", "__MACOSX"]);
const ENTRY_CANDIDATES = ["index.js", "server.js", "app.js", "main.js"];
const STATIC_OUTPUT_DIRS = ["dist", "build", "public", "out"];

/**
 * If a directory contains exactly one item and it's a folder, hoist its
 * contents up a level and remove it. Repeats, so zip-of-a-folder and
 * folder-picker uploads (which both add one wrapper level) both land flat.
 */
function flattenSingleWrapper(dir) {
  for (let i = 0; i < 6; i++) {
    const entries = fs.readdirSync(dir).filter((e) => !SKIP_DIRS.has(e));
    if (entries.length !== 1) break;
    const only = path.join(dir, entries[0]);
    if (!fs.statSync(only).isDirectory()) break;
    for (const item of fs.readdirSync(only)) {
      fs.renameSync(path.join(only, item), path.join(dir, item));
    }
    fs.rmSync(only, { recursive: true, force: true });
  }
}

function hasServerEntry(dir) {
  const pkgPath = path.join(dir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.main && fs.existsSync(path.join(dir, pkg.main))) return true;
      if (pkg.scripts && pkg.scripts.start) return true;
    } catch {
      // unreadable/invalid package.json — fall through to file-based checks
    }
  }
  return ENTRY_CANDIDATES.some((f) => fs.existsSync(path.join(dir, f)));
}

function hasPackageJson(dir) {
  return fs.existsSync(path.join(dir, "package.json"));
}

/** Returns the subfolder (relative to dir) holding index.html, or "." for the root, or null. */
function findIndexHtml(dir) {
  if (fs.existsSync(path.join(dir, "index.html"))) return ".";
  for (const sub of STATIC_OUTPUT_DIRS) {
    if (fs.existsSync(path.join(dir, sub, "index.html"))) return sub;
  }
  return null;
}

/**
 * Decide how to host an uploaded bundle:
 * - "app"  — has a package.json plus a runnable server entry (Node process, proxied)
 * - "site" — has an index.html somewhere obvious (served as static files)
 * - null   — couldn't tell
 */
function detectType(dir) {
  if (hasPackageJson(dir) && hasServerEntry(dir)) return "app";
  if (findIndexHtml(dir)) return "site";
  if (hasPackageJson(dir)) return "app"; // has package.json but no obvious entry; let start surface a clear error
  return null;
}

/**
 * Look (shallowly) for a bundled .sql/.db/.sqlite file so a project that
 * ships its own database gets it wired up automatically.
 */
function findBundledDatabase(dir) {
  const candidates = [];
  function scan(d, depth) {
    if (depth > 2) return;
    let entries;
    try {
      entries = fs.readdirSync(d, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      if (SKIP_DIRS.has(e.name)) continue;
      const full = path.join(d, e.name);
      if (e.isDirectory()) {
        scan(full, depth + 1);
      } else {
        const lower = e.name.toLowerCase();
        if (
          lower.endsWith(".sql") ||
          lower.endsWith(".db") ||
          lower.endsWith(".sqlite") ||
          lower.endsWith(".sqlite3")
        ) {
          candidates.push(full);
        }
      }
    }
  }
  scan(dir, 0);
  return candidates[0] || null;
}

module.exports = {
  flattenSingleWrapper,
  detectType,
  findIndexHtml,
  findBundledDatabase,
};
