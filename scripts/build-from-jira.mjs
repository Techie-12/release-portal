// scripts/build-from-jira.mjs
// Node 18+/20+ (native fetch). Renders 4 columns: Version | Release Type | Status | Release Date.
// - Release Type is always "Differential" (per requirement)
// - Release Date mapping: 10.11.003 -> "06th March", 10.11.004 -> "TBC"; others default to "TBC".
// - Removes Platform/Action columns entirely.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// --- paths ---
const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);
const configPath = path.resolve(__dirname, '../config/jql.json');
const indexPath  = path.resolve(__dirname, '../index.html');

// --- secrets ---
const JIRA_EMAIL     = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

function bail(msg) {
  console.error('FATAL:', msg);
  process.exit(1);
}

if (!JIRA_EMAIL || !JIRA_API_TOKEN) {
  bail('Missing JIRA_EMAIL or JIRA_API_TOKEN. Add repo secrets and re-run.');
}

// --- read config safely ---
let cfg;
try {
  const text = fs.readFileSync(configPath, 'utf-8');
  cfg = JSON.parse(text);
} catch (e) {
  bail(`Cannot read/parse ${configPath}: ${e.message}`);
}

if (!cfg.baseUrl) bail('config/jql.json missing "baseUrl".');
if (!Array.isArray(cfg.products) || cfg.products.length === 0) {
  bail('config/jql.json must have a non-empty "products" array.');
}
const baseUrl = String(cfg.baseUrl).replace(/\/$/, '');
const maxResults = Number(cfg.maxResults || 100);

// --- helpers ---
const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');

function urlEncodeJql(jql) { return encodeURIComponent(jql); }

// If someone uses quoted project name in JQL, auto-convert to project key to avoid quoting issues
function normalizeJql(jql, product) {
  if (product?.key) {
    jql = String(jql).replace(/project\s*=\s*"(?:[^"]+)"/i, `project = ${product.key}`);
  }
  return jql;
}

async function fetchIssues(jql) {
  const endpoint = `${baseUrl}/rest/api/3/search/jql?maxResults=${maxResults}&jql=${urlEncodeJql(jql)}`;
  console.log('Calling Jira with JQL:', jql);
  const res = await fetch(endpoint, {
    headers: { 'Accept': 'application/json', 'Authorization': `Basic ${auth}` }
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Jira API error ${res.status}: ${t}`);
  }
  return res.json();
}

function esc(s){ return String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }

function statusBadge(statusCategoryName) {
  const map = { 'Done': 'released', 'To Do': 'planned', 'In Progress': 'upcoming' };
  const cls = map[statusCategoryName] || 'planned';
  const label = statusCategoryName === 'Done' ? 'Released'
              : statusCategoryName === 'In Progress' ? 'Upcoming' : 'Planned';
  return `<span class="badge ${cls}">${label}</span>`;
}

// --- requirement-specific date mapping ---
const releaseDates = new Map([
  ['10.11.003', '06th March'],
  ['V10.11.003', '06th March'],
  ['10.11.004', 'TBC'],
  ['V10.11.004', 'TBC']
]);

function buildRows(issues){
  return issues.map(it => {
    const f = it.fields || {};
    const versionName =
      (f.fixVersions && f.fixVersions[0] && (f.fixVersions[0].name || f.fixVersions[0].id)) || '—';

    const releaseType = 'Differential'; // per requirement

    const statusCat = (f.status && f.status.statusCategory && f.status.statusCategory.name) || 'To Do';
    const badgeHtml = statusBadge(statusCat);

    const releaseDate = releaseDates.get(String(versionName)) || 'TBC';

    // 4 columns: Version | Release Type | Status | Release Date
    return `<tr>
      <td>${esc(versionName)}</td>
      <td>${esc(releaseType)}</td>
      <td>${badgeHtml}</td>
      <td>${esc(releaseDate)}</td>
    </tr>`;
  }).join('\n');
}

function replaceBetween(content, startMarker, endMarker, replacement){
  const start = content.indexOf(startMarker);
  const end   = content.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) {
    bail(`Markers not found: ${startMarker} ... ${endMarker}`);
  }
  return content.slice(0, start + startMarker.length) + "\n" + replacement + "\n" + content.slice(end);
}

function stampLastUpdated(content) {
  const nowIST = new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  const start = '<!--LAST_UPDATED-->';
  const end   = '<!--/LAST_UPDATED-->';
  if (content.includes(start) && content.includes(end)) {
    return replaceBetween(content, start, end, nowIST);
  }
  return content;
}

// --- main ---
(async () => {
  const html = fs.readFileSync(indexPath, 'utf-8');
  let out = html;

  for (const p of cfg.products) {
    if (!p.tbodyMarker || !p.jql) {
      bail(`Product entry missing "tbodyMarker" or "jql": ${JSON.stringify(p)}`);
    }
    const jql = normalizeJql(String(p.jql), p);
    let data;
    try {
      data = await fetchIssues(jql);
    } catch (e) {
      bail(e.message);
    }
    const issues = Array.isArray(data.issues) ? data.issues : [];
    const rows = issues.length ? buildRows(issues)
                               : `<tr><td colspan="4">No matching issues.</td></tr>`;
    const start = `<!--${p.tbodyMarker}-->`;
    const end   = `<!--/${p.tbodyMarker}-->`;
    out = replaceBetween(out, start, end, rows);
    console.log(`Rendered ${issues.length} rows for ${p.name || p.key}`);
  }

  // Stamp last-updated
  out = stampLastUpdated(out);

  if (out != html) {
    fs.writeFileSync(indexPath, out, 'utf-8');
    console.log('index.html updated from Jira');
  } else {
    console.log('No changes to index.html');
  }
})();
