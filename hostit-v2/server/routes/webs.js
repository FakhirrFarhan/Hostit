const express = require("express");
const path = require("path");
const fs = require("fs");
const http = require("http");
const multer = require("multer");
const AdmZip = require("adm-zip");
const { upsertProject, deleteProject, isValidName, getProject } = require("../store");
const { flattenSingleWrapper, detectType, findBundledDatabase } = require("../lib/detect");
const { importDatabaseFile } = require("../lib/db");
const pm = require("../processManager");

const ROOT = path.join(__dirname, "..", "..");
const WEBS_DIR = path.join(ROOT, "webs");
const DB_DIR = path.join(ROOT, "databases");
const TMP_DIR = path.join(ROOT, "uploads_tmp");
const upload = multer({ dest: TMP_DIR });

const router = express.Router();

function cleanupTemp(files) {
  for (const f of files) {
    try {
      fs.rmSync(f, { force: true });
    } catch {
      /* ignore */
    }
  }
}

// Accepts EITHER a single zipped bundle ("file") OR a whole folder picked in
// the browser, sent as many individual files ("files") with a matching
// "paths" JSON array of their relative paths (from File.webkitRelativePath).
router.post(
  "/upload",
  upload.fields([
    { name: "file", maxCount: 1 },
    { name: "files", maxCount: 5000 },
  ]),
  async (req, res) => {
    const tempFiles = [];
    let targetDir = null;
    try {
      const name = (req.body.name || "").trim().toLowerCase();
      if (!isValidName(name)) {
        return res.status(400).json({
          error: "Invalid project name. Use lowercase letters, numbers, and hyphens, 2-40 chars.",
        });
      }

      const zipFile = req.files?.file?.[0];
      const folderFiles = req.files?.files || [];
      if (!zipFile && folderFiles.length === 0) {
        return res.status(400).json({ error: "No file or folder uploaded." });
      }

      targetDir = path.join(WEBS_DIR, name);
      fs.rmSync(targetDir, { recursive: true, force: true });
      fs.mkdirSync(targetDir, { recursive: true });

      if (zipFile) {
        tempFiles.push(zipFile.path);
        if (!zipFile.originalname.toLowerCase().endsWith(".zip")) {
          throw new Error("That's not a .zip file. Upload a .zip, or switch to folder upload.");
        }
        const zip = new AdmZip(zipFile.path);
        zip.extractAllTo(targetDir, true);
      } else {
        let relPaths = [];
        try {
          relPaths = JSON.parse(req.body.paths || "[]");
        } catch {
          relPaths = [];
        }
        folderFiles.forEach((f, i) => {
          tempFiles.push(f.path);
          const rawRel = relPaths[i] || f.originalname;
          // Sanitize: strip leading slashes and any ".." segments to prevent path traversal.
          const safeRel = rawRel
            .split(/[\\/]/)
            .filter((seg) => seg && seg !== "..")
            .join(path.sep);
          if (!safeRel) return;
          const dest = path.join(targetDir, safeRel);
          fs.mkdirSync(path.dirname(dest), { recursive: true });
          fs.copyFileSync(f.path, dest);
        });
      }

      cleanupTemp(tempFiles);
      flattenSingleWrapper(targetDir);

      // If a .sql/.db/.sqlite file is bundled in, import it as this project's
      // database and pull the raw file out of the publicly served folder.
      const bundledDb = findBundledDatabase(targetDir);
      let databaseName = null;
      if (bundledDb) {
        const destDb = path.join(DB_DIR, `${name}.db`);
        try {
          importDatabaseFile(bundledDb, destDb, path.basename(bundledDb).toLowerCase());
          databaseName = name;
          upsertProject(name, {
            type: "database",
            createdAt: getProject(name)?.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
            linkedWeb: name,
          });
        } catch (dbErr) {
          console.error("Bundled database import failed:", dbErr.message);
        }
        fs.rmSync(bundledDb, { force: true });
      }

      const type = detectType(targetDir);
      if (!type) {
        fs.rmSync(targetDir, { recursive: true, force: true });
        return res.status(400).json({
          error:
            "Couldn't tell how to host this. Include an index.html for a static site, or a package.json with a start script (plus an entry file like index.js) for an app.",
        });
      }

      const project = upsertProject(name, {
        type,
        createdAt: getProject(name)?.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        url: type === "site" ? `/live/${name}/` : `/app/${name}/`,
        database: databaseName,
      });

      res.json({ ok: true, project });
    } catch (err) {
      console.error(err);
      cleanupTemp(tempFiles);
      if (targetDir) fs.rmSync(targetDir, { recursive: true, force: true });
      res.status(500).json({ error: "Failed to deploy: " + err.message });
    }
  }
);

router.post("/:name/start", async (req, res) => {
  try {
    const project = getProject(req.params.name);
    if (!project || project.type !== "app") {
      return res
        .status(400)
        .json({ error: "Only apps can be started or stopped — static sites are always live." });
    }
    const appDir = path.join(WEBS_DIR, req.params.name);
    if (!fs.existsSync(appDir)) return res.status(404).json({ error: "Project not found." });

    const extraEnv = {};
    if (project.database) {
      const dbFile = path.join(DB_DIR, `${project.database}.db`);
      if (fs.existsSync(dbFile)) {
        extraEnv.DATABASE_PATH = dbFile;
        extraEnv.DATABASE_URL = `file:${dbFile}`;
      }
    }

    await pm.startApp(req.params.name, appDir, extraEnv);
    res.json({ ok: true, status: pm.getStatus(req.params.name) });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.post("/:name/stop", async (req, res) => {
  await pm.stopApp(req.params.name);
  res.json({ ok: true });
});

router.get("/:name/status", (req, res) => {
  res.json(pm.getStatus(req.params.name));
});

router.get("/:name/logs", (req, res) => {
  res.type("text/plain").send(pm.getLogs(req.params.name) || "(no logs yet)");
});

router.delete("/:name", async (req, res) => {
  const project = getProject(req.params.name);
  await pm.stopApp(req.params.name);
  fs.rmSync(path.join(WEBS_DIR, req.params.name), { recursive: true, force: true });
  deleteProject(req.params.name);
  if (project?.database) {
    fs.rmSync(path.join(DB_DIR, `${project.database}.db`), { force: true });
    deleteProject(project.database);
  }
  res.json({ ok: true });
});

// Reverse proxy: /app/:name/* -> http://localhost:<port>/*
function proxyMiddleware(req, res) {
  const match = req.path.match(/^\/app\/([a-z0-9-]+)(\/.*)?$/);
  if (!match) return res.status(404).end();
  const [, name, rest] = match;
  const port = pm.getPortFor(name);
  if (!port) {
    return res
      .status(503)
      .send(`App "${name}" is not running. Start it from the dashboard first.`);
  }
  const proxyReq = http.request(
    {
      host: "127.0.0.1",
      port,
      path: rest || "/",
      method: req.method,
      headers: req.headers,
    },
    (proxyRes) => {
      res.writeHead(proxyRes.statusCode, proxyRes.headers);
      proxyRes.pipe(res);
    }
  );
  proxyReq.on("error", (err) => {
    res.status(502).send("App is not responding: " + err.message);
  });
  req.pipe(proxyReq);
}

module.exports = { router, proxyMiddleware };
