/* ══════════════════════════════════════
   Hostit — app.js
   ══════════════════════════════════════ */

// ─── Auth ───────────────────────────────────────────────────────────────────

async function checkAuth() {
  const res = await fetch('/api/auth/check');
  if (res.ok) { showDashboard(); } else { showLogin(); }
}

function showLogin() {
  document.getElementById('loginPage').classList.remove('hidden');
  document.getElementById('dashboard').classList.add('hidden');
}

function showDashboard() {
  document.getElementById('loginPage').classList.add('hidden');
  document.getElementById('dashboard').classList.remove('hidden');
  loadProjects();
  checkServerStatus();
  setInterval(checkServerStatus, 15000);
}

document.getElementById('loginBtn').addEventListener('click', async () => {
  const pw = document.getElementById('loginPassword').value;
  const errEl = document.getElementById('loginError');
  errEl.textContent = '';
  if (!pw) { errEl.textContent = 'Enter your password.'; return; }
  const btn = document.getElementById('loginBtn');
  btn.disabled = true; btn.textContent = 'Signing in…';
  const res = await fetch('/api/auth/login', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ password: pw })
  });
  btn.disabled = false; btn.textContent = 'Sign in';
  if (res.ok) { showDashboard(); }
  else { errEl.textContent = 'Incorrect password.'; document.getElementById('loginPassword').focus(); }
});

document.getElementById('loginPassword').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') document.getElementById('loginBtn').click();
});

document.getElementById('logoutBtn').addEventListener('click', async () => {
  await fetch('/api/auth/logout', { method: 'POST' });
  showLogin();
});

// ─── Server status ───────────────────────────────────────────────────────────

async function checkServerStatus() {
  const dot = document.getElementById('statusDot');
  const txt = document.getElementById('statusText');
  try {
    const res = await fetch('/api/projects');
    if (res.ok) { dot.className = 'status-dot online'; txt.textContent = 'Server online'; }
    else if (res.status === 401) { showLogin(); }
    else { dot.className = 'status-dot offline'; txt.textContent = 'Server error'; }
  } catch { dot.className = 'status-dot offline'; txt.textContent = 'Offline'; }
}

// ─── Tab navigation ─────────────────────────────────────────────────────────

document.querySelectorAll('.nav-item').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-item').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    document.getElementById('panel-' + btn.dataset.tab).classList.add('active');
    if (btn.dataset.tab === 'databases') loadDatabases();
  });
});

// ─── Toast ───────────────────────────────────────────────────────────────────

let toastTimer;
function toast(msg, type = 'success') {
  const el = document.getElementById('toast');
  el.textContent = msg;
  el.className = 'toast ' + type;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.add('hidden'), 3500);
}

// ─── Load projects ───────────────────────────────────────────────────────────

async function loadProjects() {
  const res = await fetch('/api/projects');
  if (res.status === 401) { showLogin(); return; }
  const { projects } = await res.json();
  const webs = projects.filter(p => p.type === 'site' || p.type === 'app');
  const grid = document.getElementById('projectsGrid');
  const empty = document.getElementById('projectsEmpty');
  if (!webs.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  grid.innerHTML = webs.map(p => projectCard(p)).join('');
  attachProjectActions();
}

function projectCard(p) {
  const isApp = p.type === 'app';
  const icon = isApp ? '⚡' : '🌐';
  const badge = isApp ? '<span class="project-badge badge-app">App</span>' : '<span class="project-badge badge-site">Static</span>';
  const date = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '—';
  const url = p.url ? `<a href="${p.url}" target="_blank">${p.url}</a>` : '—';
  const appActions = isApp ? `
    <button class="btn-card green" data-action="start" data-name="${p.name}">▶ Start</button>
    <button class="btn-card" data-action="stop" data-name="${p.name}">■ Stop</button>
    <button class="btn-card" data-action="logs" data-name="${p.name}">Logs</button>
  ` : '';
  return `
    <div class="project-card" data-name="${p.name}">
      <div class="project-card-top"><span class="project-icon">${icon}</span>${badge}</div>
      <div class="project-name">${p.name}</div>
      <div class="project-url">${url}</div>
      <div class="project-meta">Updated ${date}</div>
      <div class="project-actions">
        ${appActions}
        <button class="btn-card" data-action="copy" data-url="${p.url || ''}">Copy URL</button>
        <button class="btn-card danger" data-action="delete" data-name="${p.name}">Delete</button>
      </div>
    </div>`;
}

function attachProjectActions() {
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { action, name, url } = btn.dataset;
      if (action === 'copy') {
        if (!url) return toast('No URL available', 'error');
        navigator.clipboard.writeText(location.origin + url);
        toast('URL copied!');
      }
      if (action === 'delete') {
        if (!confirm(`Delete "${name}"? This cannot be undone.`)) return;
        const res = await fetch('/api/webs/' + name, { method: 'DELETE' });
        if (res.ok) { toast(`"${name}" deleted`); loadProjects(); }
        else toast('Delete failed', 'error');
      }
      if (action === 'start') {
        btn.disabled = true;
        const res = await fetch('/api/webs/' + name + '/start', { method: 'POST' });
        btn.disabled = false;
        if (res.ok) toast(`"${name}" started`); else toast('Start failed', 'error');
      }
      if (action === 'stop') {
        const res = await fetch('/api/webs/' + name + '/stop', { method: 'POST' });
        if (res.ok) toast(`"${name}" stopped`); else toast('Stop failed', 'error');
      }
      if (action === 'logs') {
        const panel = document.getElementById('appConsole');
        document.getElementById('appConsoleTitle').textContent = name + ' — logs';
        panel.classList.remove('hidden');
        const out = document.getElementById('appLogsOutput');
        out.textContent = 'Loading…';
        const r = await fetch('/api/webs/' + name + '/logs');
        out.textContent = r.ok ? (await r.text()) || '(no logs)' : 'Failed.';
        out.scrollTop = out.scrollHeight;
      }
    });
  });
}

document.getElementById('appConsoleClose').addEventListener('click', () => {
  document.getElementById('appConsole').classList.add('hidden');
});

// ─── Load databases ──────────────────────────────────────────────────────────

let activeDb = null;

async function loadDatabases() {
  const res = await fetch('/api/projects');
  if (res.status === 401) { showLogin(); return; }
  const { projects } = await res.json();
  const dbs = projects.filter(p => p.type === 'database');
  const grid = document.getElementById('databasesGrid');
  const empty = document.getElementById('databasesEmpty');
  if (!dbs.length) { grid.innerHTML = ''; empty.classList.remove('hidden'); return; }
  empty.classList.add('hidden');
  grid.innerHTML = dbs.map(p => dbCard(p)).join('');
  attachDbActions();
}

function dbCard(p) {
  const date = p.updatedAt ? new Date(p.updatedAt).toLocaleDateString() : '—';
  return `
    <div class="project-card" data-name="${p.name}">
      <div class="project-card-top"><span class="project-icon">🗄️</span><span class="project-badge badge-db">Database</span></div>
      <div class="project-name">${p.name}</div>
      <div class="project-meta">Imported ${date}</div>
      <div class="project-actions">
        <button class="btn-card" data-action="query" data-name="${p.name}">Query</button>
        <button class="btn-card danger" data-action="delete-db" data-name="${p.name}">Delete</button>
      </div>
    </div>`;
}

function attachDbActions() {
  document.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', async () => {
      const { action, name } = btn.dataset;
      if (action === 'query') {
        activeDb = name;
        const panel = document.getElementById('dbConsole');
        document.getElementById('dbConsoleTitle').textContent = name + ' — query console';
        panel.classList.remove('hidden');
        document.getElementById('dbQueryOutput').textContent = 'Results will appear here.';
        const res = await fetch('/api/databases/' + name + '/tables');
        if (res.ok) {
          const { tables } = await res.json();
          document.getElementById('dbTables').innerHTML = tables.map(t =>
            `<span class="db-table-tag" data-table="${t}">${t}</span>`).join('');
          document.querySelectorAll('.db-table-tag').forEach(tag => {
            tag.addEventListener('click', () => {
              document.getElementById('dbQueryInput').value = `SELECT * FROM "${tag.dataset.table}" LIMIT 50;`;
            });
          });
        }
      }
      if (action === 'delete-db') {
        if (!confirm(`Delete database "${name}"?`)) return;
        const res = await fetch('/api/databases/' + name, { method: 'DELETE' });
        if (res.ok) { toast(`"${name}" deleted`); loadDatabases(); }
        else toast('Delete failed', 'error');
      }
    });
  });
}

document.getElementById('dbConsoleClose').addEventListener('click', () => {
  document.getElementById('dbConsole').classList.add('hidden');
  activeDb = null;
});

document.getElementById('dbRunQuery').addEventListener('click', async () => {
  if (!activeDb) return;
  const sql = document.getElementById('dbQueryInput').value.trim();
  if (!sql) return;
  const out = document.getElementById('dbQueryOutput');
  out.textContent = 'Running…';
  const res = await fetch('/api/databases/' + activeDb + '/query', {
    method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sql })
  });
  const data = await res.json();
  out.textContent = res.ok ? JSON.stringify(data.rows, null, 2) : (data.error || 'Query failed');
});

// ─── Deploy Modal ────────────────────────────────────────────────────────────

function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) {
  document.getElementById(id).classList.add('hidden');
  // reset form state
  if (id === 'deployModal') {
    document.getElementById('deployName').value = '';
    document.getElementById('deployFile').value = '';
    document.getElementById('folderInput').value = '';
    document.getElementById('deployFileName').textContent = '';
    document.getElementById('folderSummary').textContent = '';
    document.getElementById('deployMsg').textContent = '';
    document.getElementById('deployProgress').classList.add('hidden');
    document.getElementById('deployProgressBar').style.width = '0%';
  }
  if (id === 'dbModal') {
    document.getElementById('dbName').value = '';
    document.getElementById('dbFile').value = '';
    document.getElementById('dbFileName').textContent = '';
    document.getElementById('dbMsg').textContent = '';
  }
}

document.getElementById('openDeployBtn').addEventListener('click', () => openModal('deployModal'));
document.getElementById('deployModalClose').addEventListener('click', () => closeModal('deployModal'));
document.getElementById('deployModalCancel').addEventListener('click', () => closeModal('deployModal'));

// ── Source toggle ──
let deploySource = 'zip';
document.querySelectorAll('.source-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.source-btn').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    deploySource = btn.dataset.source;
    document.getElementById('zipField').classList.toggle('hidden', deploySource !== 'zip');
    document.getElementById('folderField').classList.toggle('hidden', deploySource !== 'folder');
    document.getElementById('deployMsg').textContent = '';
  });
});

// ── Zip dropzone ──
const deployFile = document.getElementById('deployFile');
const deployDropzone = document.getElementById('deployDropzone');

deployFile.addEventListener('change', () => {
  document.getElementById('deployFileName').textContent = deployFile.files[0]?.name || '';
});

deployDropzone.addEventListener('dragover', e => { e.preventDefault(); deployDropzone.classList.add('over'); });
deployDropzone.addEventListener('dragleave', () => deployDropzone.classList.remove('over'));
deployDropzone.addEventListener('drop', e => {
  e.preventDefault(); deployDropzone.classList.remove('over');
  const file = e.dataTransfer.files[0];
  if (file && file.name.toLowerCase().endsWith('.zip')) {
    // Assign to the file input via DataTransfer
    const dt = new DataTransfer();
    dt.items.add(file);
    deployFile.files = dt.files;
    document.getElementById('deployFileName').textContent = file.name;
  } else {
    document.getElementById('deployFileName').textContent = '⚠ Drop a .zip file here';
  }
});

// ── Folder picker — click only, no drag (browsers don't support folder drag reliably) ──
const folderInput = document.getElementById('folderInput');
folderInput.addEventListener('change', () => {
  const count = folderInput.files.length;
  if (count > 0) {
    // Get folder name from first file's relative path
    const folderName = folderInput.files[0].webkitRelativePath.split('/')[0] || 'folder';
    document.getElementById('folderSummary').textContent = `📁 ${folderName} — ${count} file${count !== 1 ? 's' : ''} selected`;
  } else {
    document.getElementById('folderSummary').textContent = '';
  }
});

// Make the folder dropzone area trigger the folder input on click
document.getElementById('folderDropzone').addEventListener('click', () => folderInput.click());

// ── Deploy submit ──
document.getElementById('deploySubmit').addEventListener('click', async () => {
  const name = document.getElementById('deployName').value.trim().toLowerCase();
  const msgEl = document.getElementById('deployMsg');
  const bar = document.getElementById('deployProgressBar');
  const progressWrap = document.getElementById('deployProgress');
  msgEl.className = 'modal-msg'; msgEl.textContent = '';

  if (!name || !/^[a-z0-9][a-z0-9-]{1,40}$/.test(name)) {
    msgEl.className = 'modal-msg error';
    msgEl.textContent = 'Enter a valid project name (lowercase letters, numbers, hyphens).';
    return;
  }

  const formData = new FormData();
  formData.append('name', name);

  if (deploySource === 'zip') {
    const file = deployFile.files[0];
    if (!file) { msgEl.className = 'modal-msg error'; msgEl.textContent = 'Choose a zip file.'; return; }
    if (!file.name.toLowerCase().endsWith('.zip')) {
      msgEl.className = 'modal-msg error'; msgEl.textContent = 'File must be a .zip'; return;
    }
    formData.append('file', file);
  } else {
    const files = folderInput.files;
    if (!files.length) { msgEl.className = 'modal-msg error'; msgEl.textContent = 'Pick a folder first.'; return; }
    const paths = [];
    for (const f of files) {
      formData.append('files', f);
      paths.push(f.webkitRelativePath || f.name);
    }
    formData.append('paths', JSON.stringify(paths));
  }

  const btn = document.getElementById('deploySubmit');
  btn.disabled = true; btn.textContent = 'Deploying…';
  progressWrap.classList.remove('hidden'); bar.style.width = '15%';

  const xhr = new XMLHttpRequest();
  xhr.open('POST', '/api/webs/upload');
  xhr.upload.onprogress = e => {
    if (e.lengthComputable) bar.style.width = Math.round((e.loaded / e.total) * 85) + '%';
  };
  xhr.onload = () => {
    bar.style.width = '100%';
    btn.disabled = false; btn.textContent = 'Deploy';
    let data;
    try { data = JSON.parse(xhr.responseText); } catch { data = {}; }
    if (xhr.status === 200) {
      msgEl.className = 'modal-msg success';
      msgEl.textContent = `✓ Live at ${data.project?.url || ''}`;
      loadProjects();
      setTimeout(() => closeModal('deployModal'), 2000);
    } else {
      msgEl.className = 'modal-msg error';
      msgEl.textContent = data.error || 'Deploy failed.';
      progressWrap.classList.add('hidden'); bar.style.width = '0%';
    }
  };
  xhr.onerror = () => {
    btn.disabled = false; btn.textContent = 'Deploy';
    msgEl.className = 'modal-msg error'; msgEl.textContent = 'Network error.';
    progressWrap.classList.add('hidden');
  };
  xhr.send(formData);
});

// ─── Database Import Modal ────────────────────────────────────────────────────

document.getElementById('openDbBtn').addEventListener('click', () => openModal('dbModal'));
document.getElementById('dbModalClose').addEventListener('click', () => closeModal('dbModal'));
document.getElementById('dbModalCancel').addEventListener('click', () => closeModal('dbModal'));

document.getElementById('dbFile').addEventListener('change', () => {
  document.getElementById('dbFileName').textContent = document.getElementById('dbFile').files[0]?.name || '';
});

document.getElementById('dbSubmit').addEventListener('click', async () => {
  const name = document.getElementById('dbName').value.trim().toLowerCase();
  const file = document.getElementById('dbFile').files[0];
  const msgEl = document.getElementById('dbMsg');
  msgEl.className = 'modal-msg'; msgEl.textContent = '';

  if (!name) { msgEl.className = 'modal-msg error'; msgEl.textContent = 'Enter a database name.'; return; }
  if (!file) { msgEl.className = 'modal-msg error'; msgEl.textContent = 'Choose a database file.'; return; }

  const formData = new FormData();
  formData.append('name', name);
  formData.append('file', file);

  const btn = document.getElementById('dbSubmit');
  btn.disabled = true; btn.textContent = 'Importing…';
  const res = await fetch('/api/databases/import', { method: 'POST', body: formData });
  const data = await res.json();
  btn.disabled = false; btn.textContent = 'Import';

  if (res.ok) {
    msgEl.className = 'modal-msg success'; msgEl.textContent = '✓ Imported!';
    loadDatabases();
    setTimeout(() => closeModal('dbModal'), 1500);
  } else {
    msgEl.className = 'modal-msg error'; msgEl.textContent = data.error || 'Import failed.';
  }
});

// ─── Close modals on overlay click ───────────────────────────────────────────
['deployModal', 'dbModal'].forEach(id => {
  document.getElementById(id).addEventListener('click', e => {
    if (e.target === document.getElementById(id)) closeModal(id);
  });
});

// ─── Init ────────────────────────────────────────────────────────────────────
checkAuth();
