# Hostit — your own mini deploy platform

A self-hosted dashboard (like a tiny Netlify) that lets you upload — as a **zip or a plain folder** —
and instantly serve any kind of web project:

- **Static sites** — plain HTML/CSS/JS, or a built React/Vue/Svelte `dist` — served at `/live/<name>/`
- **Apps** — a Node project with a `package.json` and a start script — run as its own process, proxied at `/app/<name>/`
- **Database-backed webs** — either of the above, with a `.sql` script or a `.db`/`.sqlite` file bundled
  right in the upload — Hostit imports it automatically and wires it into the running app

You don't pick a category up front. Drop in the project and Hostit figures out what it is.

## Why this isn't deployed *on* Netlify

Netlify only runs static files and short-lived serverless functions — there's no persistent disk and no way to run a database engine or a long-running server process there. So **the dashboard itself needs a real host with a persistent Node process**: a VPS, Render, Railway, Fly.io, your own machine, etc. Netlify can't run this app's backend, but this app can do everything you were picturing Netlify doing.

## Run it locally

```bash
npm install
npm start
```

Then open `http://localhost:4000`.

> `better-sqlite3` has a native module — `npm install` needs internet access to fetch its prebuilt binary the first time. If your environment has no network, install from a machine that does and ship the `node_modules` folder along, or swap it for `sql.js` (pure WebAssembly, no native build).

## Deploying for real

1. Push this folder to a GitHub repo.
2. Create a new **Web Service** on Render or Railway (or any host that runs a long-lived Node process):
   - Build command: `npm install`
   - Start command: `npm start`
   - Make sure the host gives you **persistent disk** (Render's free tier disk is ephemeral and wipes on redeploy — pick a paid plan with a persistent volume, or attach a volume on Railway/Fly, if you want uploads to survive restarts).
3. Set the `PORT` environment variable if your host requires it (most inject it automatically — the app already reads `process.env.PORT`).
4. Visit your host's URL — same dashboard, now live on the internet.

## How it works

### Upload: zip or folder, your choice
On the **Deploy** tab, toggle between:
- **Zip file** — upload a `.zip` of your project, same as before.
- **Folder** — pick the project folder straight from your file system. Hostit reads every file's
  relative path (via the browser's folder picker) and reconstructs the same directory structure on
  the server — no zipping step needed.

Either way, if everything ends up wrapped in one extra top-level folder (common when zipping a folder
directly, or when a folder picker includes the folder name itself), Hostit flattens it automatically.

### Auto-detected hosting type
After unpacking, Hostit inspects the bundle:
- A `package.json` with a `start` script (or a `main` file / `index.js`/`server.js`/`app.js`/`main.js`)
  → hosted as an **app**: a Node child process, given a `PORT` env var to listen on, proxied at `/app/<name>/`.
- Otherwise, an `index.html` at the root (or inside `dist`/`build`/`public`/`out`) → hosted as a **static site**
  at `/live/<name>/`.
- If neither is found, the upload is rejected with an explanation of what's missing.

### Bundled databases
If the upload also contains a `.sql` file or a `.db`/`.sqlite`/`.sqlite3` file (at the root or one level
deep), Hostit:
1. Imports it into its own managed SQLite database (running `.sql` scripts into a fresh db, or copying
   `.db`/`.sqlite` files in directly).
2. Removes the raw file from the publicly served bundle.
3. If the project is an **app**, injects `DATABASE_PATH` (absolute file path) and `DATABASE_URL`
   (`file:<path>`) into its environment on start, so the app's own code can open it.
4. Lists it on the **Databases** tab too, tagged "bundled with `<name>`", with the same query console
   as a standalone database.

You can also import a database on its own from the **Databases** tab (no project attached) — useful for
just poking at data, or for wiring up a database an app will reach over the network instead of a local file.

### Apps — still simple, still unsandboxed
- Runs as a plain Node child process, reading `process.env.PORT`.
- **No `npm install` runs for you** — include `node_modules` in your upload.
- **No sandboxing.** Only upload apps you wrote or trust completely.
- Use **start** / **stop** / **logs** on each row to control it and watch stdout/stderr.

## Project structure

```
hostit/
├── server/
│   ├── index.js          # Express app, mounts routes + proxy
│   ├── store.js          # JSON-backed project registry
│   ├── processManager.js # spawns/tracks running Node apps
│   ├── lib/
│   │   ├── detect.js     # flatten/auto-detect site vs app, find bundled db
│   │   └── db.js         # shared SQLite import logic
│   └── routes/
│       ├── webs.js       # unified upload (zip or folder) + app lifecycle
│       └── databases.js  # standalone database import + query console
├── public/                # dashboard UI (vanilla HTML/CSS/JS)
├── webs/                  # uploaded sites and apps land here, one folder each
├── databases/              # uploaded/generated SQLite files
└── data/registry.json     # project metadata
```

## Known limitations / next steps if you want to harden this

- No authentication — anyone who can reach the dashboard can upload, run, and delete projects. Add a login before putting this on the public internet.
- Apps only run on Node — there's no runtime for Python/Ruby/etc. processes, only static-file serving or a `node` process.
- App hosting has no resource limits or isolation — a real multi-tenant version would run each app in its own container (Docker/Firecracker) with CPU/memory caps.
- Single SQLite file per database project — fine for small projects, not a drop-in replacement for managed Postgres/MySQL at scale.
- No custom domains/HTTPS — your host (Render/Railway/etc.) handles HTTPS for the platform's own URL; routing custom domains to individual `/live/<name>/` or `/app/<name>/` paths would need extra DNS + reverse-proxy work.
