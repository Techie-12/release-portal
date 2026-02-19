// scripts/build-from-jira.mjs
// Node 18+ / 20+ (native fetch). Reads config/jql.json, calls Jira JQL API,
// writes HTML rows between markers in index.html for each product.

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const configPath = path.resolve(__dirname, '../config/jql.json');
const indexPath  = path.resolve(__dirname, '../index.html');

const JIRA_EMAIL     = process.env.JIRA_EMAIL;
const JIRA_API_TOKEN = process.env.JIRA_API_TOKEN;

if (!JIRA_EMAIL || !JIRA_API_TOKEN) {
  console.error('Missing JIRA_EMAIL or JIRA_API_TOKEN env vars');
  process.exit(1);
}

// ---- helpers ----
function urlEncodeJql(jql) { return encodeURIComponent(jql); }
function esc(s){ return String(s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])); }
function badge(statusCategoryName) {
  const map = { 'Done': 'released', 'To Do': 'planned', 'In Progress': 'upcoming' };
  const cls = map[statusCategoryName] || 'planned';
  const label = statusCategoryName === 'Done' ? 'Released'
               : statusCategoryName === 'In Progress' ? 'Upcoming'
               : 'Planned';
  return `<span class="badge ${cls}">${label}</span>`;
}
function replaceBetween(content, startMarker, endMarker, replacement){
  const start = content.indexOf(startMarker);
  const end   = content.indexOf(endMarker);
  if (start === -1 || end === -1 || end < start) throw new Error(`Markers not found: ${startMarker}`);
  return content.slice(0, start + startMarker.length) + "\n" + replacement + "\n" + content.slice(end);
}

// ---- load config ----
if (!fs.existsSync(configPath)) {
  console.error(`Missing config file: ${configPath}`);
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
const baseUrl = (cfg.baseUrl || '').replace(/\/$/, '');
if (!baseUrl) {
  console.error('config/jql.json missing "baseUrl"');
  process.exit(1);
}

const auth = Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64');

// ---- Jira fetch ----
async function fetchIssues(jql, maxResults) {
  const max = cfg.maxResults || maxResults || 100;
  const url = `${baseUrl}/rest/api/3/search/jql?maxResults=${max}&jql=${urlEncodeJql(jql)}`;
  const res = await fetch(url, { headers: { 'Accept': 'application/json', 'Authorization': `Basic ${auth}` } });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Jira API error ${res.status}: ${t}`);
  }
  return res.json();
}

// ---- row renderer ----
function buildRows(issues){
  return issues.map(it => {
    const f = it.fields || {};
    const version = (f.fixVersions && f.fixVersions[0] && (f.fixVersions[0].name || f.fixVersions[0].id)) || '—';
    const relType = (f.issuetype && f.issuetype.name) || 'Release';
    const statusCat = (f.status && f.status.statusCategory && f.status.statusCategory.name) || 'To Do';
    const date = f.duedate || f.updated || 'TBD';
    const actionUrl = `${baseUrl}/browse/${it.key}`;
    return `<tr>
      <td>${esc(version)}</td>
      <td>${esc(relType)}</td>
      <td>${badge(statusCat)}</td>
      <td>${esc(date)}</td>
      <td>—</td>
      <td>${esc(actionUrl)}View</a></td>
    </tr>`;
  }).join('\n');
}

// ---- main ----
(async () => {
  const html = fs.readFileSync(indexPath, 'utf-8');
  let out = html;

  for (const p of (cfg.products || [])) {
    const data = await fetchIssues(p.jql, cfg.maxResults);
    const issues = data.issues || [];
    const rows = issues.length ? buildRows(issues) : `<tr><td colspan="6">No matching issues.</td></tr>`;
    const start = `<!--${p.tbodyMarker}-->`;
    const end   = `<!--/${p.tbodyMarker}-->`;
    out = replaceBetween(out, start, end, rows);
    console.log(`Rendered ${issues.length} rows for ${p.name}`);
  }

  if (out !== html) {
    fs.writeFileSync(indexPath, out, 'utf-8');
    console.log('index.html updated from Jira');
  } else {
    console.log('No changes to index.html');
  }
})();
