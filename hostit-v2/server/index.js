const express = require("express");
const cors = require("cors");
const path = require("path");
const fs = require("fs");
const jwt = require("jsonwebtoken");
const cookieParser = require("cookie-parser");

const { listProjects } = require("./store");
const databasesRouter = require("./routes/databases");
const { router: websRouter, proxyMiddleware } = require("./routes/webs");

const ROOT = path.join(__dirname, "..");
const WEBS_DIR = path.join(ROOT, "webs");
const PORT = process.env.PORT || 4000;

const JWT_SECRET = process.env.JWT_SECRET || "hostit-secret-change-in-production";
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || "Fakhir.1080..";

for (const dir of ["webs", "databases", "uploads_tmp", "data"]) {
  fs.mkdirSync(path.join(ROOT, dir), { recursive: true });
}

const app = express();
app.use(cors());
app.use(express.json());
app.use(cookieParser());

// ---------- AUTH ----------

app.post("/api/auth/login", (req, res) => {
  const { password } = req.body || {};
  if (password !== ADMIN_PASSWORD) {
    return res.status(401).json({ error: "Incorrect password" });
  }
  const token = jwt.sign({ admin: true }, JWT_SECRET, { expiresIn: "12h" });
  res.cookie("hostit_token", token, {
    httpOnly: true,
    maxAge: 12 * 60 * 60 * 1000,
    sameSite: "lax",
  });
  res.json({ ok: true });
});

app.post("/api/auth/logout", (req, res) => {
  res.clearCookie("hostit_token");
  res.json({ ok: true });
});

app.get("/api/auth/check", (req, res) => {
  const token = req.cookies.hostit_token;
  if (!token) return res.status(401).json({ ok: false });
  try {
    jwt.verify(token, JWT_SECRET);
    res.json({ ok: true });
  } catch {
    res.status(401).json({ ok: false });
  }
});

function requireAuth(req, res, next) {
  const token = req.cookies.hostit_token;
  if (!token) return res.status(401).json({ error: "Not authenticated" });
  try {
    jwt.verify(token, JWT_SECRET);
    next();
  } catch {
    res.status(401).json({ error: "Session expired" });
  }
}

// ---------- STATIC (login page served without auth) ----------
app.use(express.static(path.join(ROOT, "public")));

// ---------- PROTECTED API ROUTES ----------
app.use("/api/webs", requireAuth, websRouter);
app.use("/api/databases", requireAuth, databasesRouter);

app.get("/api/projects", requireAuth, (req, res) => {
  res.json({ projects: listProjects() });
});

// Reverse proxy for running Node apps
app.use("/app/:name", requireAuth, (req, res) => proxyMiddleware(req, res));

// Serve uploaded static sites at /live/<name>/  (also protected)
app.use("/live", requireAuth, express.static(WEBS_DIR, { extensions: ["html"] }));

app.listen(PORT, () => {
  console.log(`Hostit running at http://localhost:${PORT}`);
});
