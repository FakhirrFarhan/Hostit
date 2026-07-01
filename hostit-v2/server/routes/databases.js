const express = require("express");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { DatabaseSync } = require("node:sqlite");
const { upsertProject, deleteProject, isValidName, getProject, listProjects } = require("../store");
const { importDatabaseFile } = require("../lib/db");

const DB_DIR = path.join(__dirname, "..", "..", "databases");
const upload = multer({ dest: path.join(__dirname, "..", "..", "uploads_tmp") });

const router = express.Router();

function dbPath(name) {
  return path.join(DB_DIR, `${name}.db`);
}

// Import route — frontend calls /api/databases/import
router.post("/import", upload.single("file"), (req, res) => {
  try {
    const name = (req.body.name || "").trim().toLowerCase();
    if (!isValidName(name)) {
      return res.status(400).json({ error: "Invalid name. Use lowercase letters, numbers, hyphens (2-40 chars)." });
    }
    if (!req.file) return res.status(400).json({ error: "No file uploaded." });

    const lowerOriginal = req.file.originalname.toLowerCase();
    const isSupported =
      lowerOriginal.endsWith(".sql") ||
      lowerOriginal.endsWith(".db") ||
      lowerOriginal.endsWith(".sqlite") ||
      lowerOriginal.endsWith(".sqlite3");
    if (!isSupported) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: "Upload a .sql script or .db/.sqlite file." });
    }

    importDatabaseFile(req.file.path, dbPath(name), lowerOriginal);
    fs.unlinkSync(req.file.path);

    const project = upsertProject(name, {
      type: "database",
      createdAt: getProject(name)?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    });

    res.json({ ok: true, project });
  } catch (err) {
    console.error(err);
    if (req.file) fs.rmSync(req.file.path, { force: true });
    res.status(500).json({ error: "Failed to import: " + err.message });
  }
});

// Also keep /upload as alias for backwards compat
router.post("/upload", upload.single("file"), (req, res) => {
  req.url = "/import";
  router.handle(req, res);
});

router.get("/:name/tables", (req, res) => {
  try {
    const target = dbPath(req.params.name);
    if (!fs.existsSync(target)) return res.status(404).json({ error: "Database not found." });
    const db = new DatabaseSync(target, { readOnly: true });
    const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%'").all();
    db.close();
    res.json({ tables: rows.map(r => r.name) });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post("/:name/query", (req, res) => {
  try {
    const target = dbPath(req.params.name);
    if (!fs.existsSync(target)) return res.status(404).json({ error: "Database not found." });
    const sql = (req.body.sql || "").trim();
    if (!sql) return res.status(400).json({ error: "No SQL provided." });

    const db = new DatabaseSync(target);
    const isSelect = /^select|^pragma|^explain/i.test(sql);
    let result;
    if (isSelect) {
      result = { rows: db.prepare(sql).all() };
    } else {
      const info = db.prepare(sql).run();
      result = { changes: info.changes, lastInsertRowid: info.lastInsertRowid };
    }
    db.close();
    res.json({ ok: true, ...result });
  } catch (err) {
    res.status(400).json({ error: err.message });
  }
});

router.delete("/:name", (req, res) => {
  const project = getProject(req.params.name);
  fs.rmSync(dbPath(req.params.name), { force: true });
  deleteProject(req.params.name);
  if (!project?.linkedWeb) {
    for (const p of listProjects()) {
      if (p.database === req.params.name) {
        upsertProject(p.name, { ...p, database: null });
      }
    }
  }
  res.json({ ok: true });
});

module.exports = router;
