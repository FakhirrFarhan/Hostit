const fs = require("fs");
const path = require("path");

const DATA_DIR = path.join(__dirname, "..", "data");
const REGISTRY_FILE = path.join(DATA_DIR, "registry.json");

function ensureReady() {
  if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });
  if (!fs.existsSync(REGISTRY_FILE)) {
    fs.writeFileSync(REGISTRY_FILE, JSON.stringify({ projects: {} }, null, 2));
  }
}

function readRegistry() {
  ensureReady();
  return JSON.parse(fs.readFileSync(REGISTRY_FILE, "utf-8"));
}

function writeRegistry(data) {
  ensureReady();
  fs.writeFileSync(REGISTRY_FILE, JSON.stringify(data, null, 2));
}

function listProjects() {
  return Object.values(readRegistry().projects).sort(
    (a, b) => new Date(b.createdAt) - new Date(a.createdAt)
  );
}

function getProject(name) {
  return readRegistry().projects[name] || null;
}

function upsertProject(name, fields) {
  const reg = readRegistry();
  reg.projects[name] = {
    ...(reg.projects[name] || {}),
    ...fields,
    name,
  };
  writeRegistry(reg);
  return reg.projects[name];
}

function deleteProject(name) {
  const reg = readRegistry();
  delete reg.projects[name];
  writeRegistry(reg);
}

function isValidName(name) {
  return /^[a-z0-9][a-z0-9-]{1,40}$/.test(name);
}

module.exports = {
  listProjects,
  getProject,
  upsertProject,
  deleteProject,
  isValidName,
};
