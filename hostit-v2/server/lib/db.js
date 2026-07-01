const fs = require("fs");
const { DatabaseSync } = require("node:sqlite");

function importDatabaseFile(srcPath, destPath, originalNameLower) {
  fs.rmSync(destPath, { force: true });

  if (originalNameLower.endsWith(".sql")) {
    const sql = fs.readFileSync(srcPath, "utf-8");
    const db = new DatabaseSync(destPath);
    db.exec(sql);
    db.close();
    return;
  }

  if (
    originalNameLower.endsWith(".db") ||
    originalNameLower.endsWith(".sqlite") ||
    originalNameLower.endsWith(".sqlite3")
  ) {
    fs.copyFileSync(srcPath, destPath);
    // sanity check it's a readable sqlite file
    const db = new DatabaseSync(destPath, { readOnly: true });
    db.close();
    return;
  }

  throw new Error("Unsupported database file type.");
}

module.exports = { importDatabaseFile };
