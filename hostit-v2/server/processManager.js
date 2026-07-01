const { spawn } = require("child_process");
const path = require("path");
const fs = require("fs");
const getPort = require("get-port");

// In-memory registry of running app processes: name -> { proc, port, status, logs }
const running = new Map();

const MAX_LOG_LINES = 200;

function pushLog(entry, line) {
  entry.logs.push(line);
  if (entry.logs.length > MAX_LOG_LINES) entry.logs.shift();
}

function findEntryFile(appDir) {
  const pkgPath = path.join(appDir, "package.json");
  if (fs.existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, "utf-8"));
      if (pkg.main && fs.existsSync(path.join(appDir, pkg.main))) {
        return pkg.main;
      }
    } catch {
      // fall through to defaults
    }
  }
  for (const candidate of ["index.js", "server.js", "app.js", "main.js"]) {
    if (fs.existsSync(path.join(appDir, candidate))) return candidate;
  }
  return null;
}

async function startApp(name, appDir, extraEnv = {}) {
  await stopApp(name);

  const entry = findEntryFile(appDir);
  if (!entry) {
    throw new Error(
      "No entry file found. Include index.js, server.js, app.js, or a package.json with a 'main' field."
    );
  }
  if (!fs.existsSync(path.join(appDir, "node_modules"))) {
    throw new Error(
      "No node_modules folder found in the upload. This host does not run npm install for you (no network access) — zip or include your app together with its node_modules folder before uploading."
    );
  }

  const port = await getPort();
  const proc = spawn("node", [entry], {
    cwd: appDir,
    env: { ...process.env, ...extraEnv, PORT: String(port) },
  });

  const entryRecord = { proc, port, status: "starting", logs: [], entry };
  running.set(name, entryRecord);

  proc.stdout.on("data", (d) => pushLog(entryRecord, d.toString()));
  proc.stderr.on("data", (d) => pushLog(entryRecord, d.toString()));

  proc.on("spawn", () => {
    entryRecord.status = "running";
  });
  proc.on("exit", (code) => {
    entryRecord.status = "stopped";
    pushLog(entryRecord, `[process exited with code ${code}]`);
  });
  proc.on("error", (err) => {
    entryRecord.status = "errored";
    pushLog(entryRecord, `[error: ${err.message}]`);
  });

  return entryRecord;
}

function stopApp(name) {
  return new Promise((resolve) => {
    const entry = running.get(name);
    if (!entry || !entry.proc || entry.proc.killed) {
      running.delete(name);
      return resolve();
    }
    entry.proc.once("exit", () => resolve());
    entry.proc.kill();
    running.delete(name);
    setTimeout(resolve, 500); // safety net
  });
}

function getStatus(name) {
  const entry = running.get(name);
  if (!entry) return { status: "stopped" };
  return { status: entry.status, port: entry.port, entry: entry.entry };
}

function getLogs(name) {
  const entry = running.get(name);
  return entry ? entry.logs.join("") : "";
}

function getPortFor(name) {
  const entry = running.get(name);
  return entry && entry.status === "running" ? entry.port : null;
}

module.exports = { startApp, stopApp, getStatus, getLogs, getPortFor };
