# ARCON Release Management Portal — Automated Website

This repo hosts a static website that **auto-updates from Jira every 2 hours** and **auto-deploys** to **Azure Static Web Apps** via **GitHub Actions**.

## How it works
1. `scripts/build-from-jira.mjs` calls Jira Cloud REST API (`/rest/api/3/search/jql`) using your **JQL** and writes rows into placeholders in `index.html`. (Ensure your JQL is **URL-encoded** in the request; the script handles encoding.)
2. A scheduled workflow updates the HTML and commits to `main`.
3. A deployment workflow uploads the site to Azure Static Web Apps on each push.

References:
- Jira API JQL endpoint and URL-encoding guidance: Atlassian docs.  
- Azure Static Web Apps deployment via GitHub Actions: GitHub Docs.  

## Prerequisites
- **Azure Static Web App** created in your Azure subscription. Get the **deployment token** and store it as `AZURE_STATIC_WEB_APPS_API_TOKEN` in GitHub Secrets.
- **Jira Cloud** account and **API token**. Store your Jira **email** as `JIRA_EMAIL` and **token** as `JIRA_API_TOKEN` in GitHub Secrets.
- Make sure your repo default branch is **main** (or update the YAML).

## Configure your products & JQL
Edit `config/jql.json`:
```json
{
  "baseUrl": "https://arcon-tech-solution.atlassian.net",
  "products": [
    { "key": "CI",  "name": "Converged Identity", "tbodyMarker": "CI_TBODY",    "jql": "project=CI ORDER BY fixVersion DESC" },
    { "key": "PAM", "name": "PAM",               "tbodyMarker": "PAM_TBODY",   "jql": "project=PAM ORDER BY fixVersion DESC" }
  ],
  "maxResults": 100
}
```
- You **control the JQL**; the script will URL-encode it automatically.
- `tbodyMarker` must match the marker name in `index.html` (e.g., `<!--CI_TBODY--> ... <!--/CI_TBODY-->`).

## Local test (optional)
```bash
# Node 18+ required
export JIRA_EMAIL="you@company.com"
export JIRA_API_TOKEN="<token>"
node scripts/build-from-jira.mjs
open index.html
```

## GitHub Secrets to set
- `AZURE_STATIC_WEB_APPS_API_TOKEN` — from your Azure Static Web App
- `JIRA_EMAIL` — your Jira login email
- `JIRA_API_TOKEN` — Jira API token

## Azure Static Web App
Create an SWA in Azure and link to this GitHub repo. The workflow `.github/workflows/azure-static-web-apps.yml` will deploy `index.html` from the root. You can configure a **custom domain** later.

## Schedule
`.github/workflows/update-content.yml` runs **every 2 hours** and can be triggered manually from the Actions tab.

## Notes
- The script infers status badge from the issue **status category** (Done → Released, In Progress → Upcoming, To Do → Planned). Adjust mapping inside `build-from-jira.mjs` if needed.
- Edit the row rendering to add real **Release Type**, **Platform**, or to point **Action** at release notes instead of the issue URL.

