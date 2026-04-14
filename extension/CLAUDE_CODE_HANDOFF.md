# Fivetran Connector Scout — Claude Code Handoff

## What This Is
A Chrome extension for non-technical Fivetran expansion AEs to quickly reference connector/table knowledge during customer calls. It scans the Fivetran dashboard, searches connectors, troubleshoots issues, and references a curated knowledge base.

## Current State
The extension is fully built as a working prototype. All files are in a zip at the download location (or in the local repo if already unzipped). The repo needs to be pushed to GitHub.

## GitHub Repo
- **Repo name**: `fivetran-sales-buddy`
- **Status**: 1 commit staged locally, needs `git push -u origin main`
- **If repo already exists with old commits**: Replace contents and force push, or create fresh

## File Structure

```
fivetran-sales-buddy/
├── manifest.json          # Chrome Manifest V3 config
├── popup.html             # Extension popup shell (references popup.css + popup.js)
├── popup.css              # All styles (204 lines)
├── popup.js               # All logic + hardcoded data (617 lines)
├── dom-scanner.js         # Content script injected on fivetran.com pages (310 lines)
├── images/                # Need icon PNGs: icon16.png, icon48.png, icon128.png
│   └── .gitkeep
├── README.md
└── .gitignore
```

## What Each File Does

### manifest.json
- Manifest V3 Chrome extension config
- Injects `dom-scanner.js` on `fivetran.com/*` pages
- Opens `popup.html` when extension icon is clicked
- Permissions: `activeTab`, `scripting`
- Host permissions: `https://fivetran.com/*`, `https://*.fivetran.com/*`

### popup.html
- Simple HTML shell, no inline styles or scripts
- References `popup.css` and `popup.js` externally
- Contains the 4-tab UI structure: Scan, Search, Troubleshoot, Glossary
- Header has Fivetran logo SVG (needs refinement — logo doesn't look right yet)
- Badge says "Connector Scout" (name TBD, user didn't love "Sales Buddy")

### popup.css
- All styling using CSS variables rooted in Fivetran blue (#306BEA)
- Variables defined in `:root` — `--ft-blue`, `--ft-navy`, `--ft-bg`, etc.
- Font: DM Sans (imported from Google Fonts)
- Responsive within the 520px Chrome extension popup width

### popup.js
- **connectorData** object: HubSpot (26 known issues, 5 tables), Salesforce (17 known issues, 5 tables), Stripe (16 known issues, 5 tables)
- **troubleshootingData** array: 9 error codes (400, 401, 403, 404, 405, 409, 422, 429, 5xx) mapped to the internal "Big 3" troubleshooting framework (Credentials, Address, Permissions)
- **glossaryData** array: 24 terms covering Pricing (MAR, Free MAR, Connection, Re-Sync, Plans), Core (Connector, Destination, ELT, Schema, Sync Frequency, Incremental Sync, Historical Sync, Transformations, Activations), Technical (CDC, Schema Drift, _fivetran_deleted, _fivetran_synced, History Mode, Primary Key, Type Inference), Deployment (SaaS, Hybrid, Self-Hosted/HVR, Data Plane vs Control Plane)
- **scanDashboard()**: Detects Chrome extension context vs prototype mode. In extension mode, sends message to dom-scanner.js content script. In prototype mode, simulates scan results.
- **handleScanResults()**: Processes scan response — matches detected connectors to knowledge base, shows matched vs unmatched connectors with status badges, connection names, destinations
- Each connector has a `docsUrl` field that links to the external Fivetran docs page
- Known issues are categorized: Data Integrity, Errors, FAQ, How To, Setup, Syncs
- Error code detail view shows Big 3 root cause badge and escalation guidance (green "try to resolve" or red "escalate")

### dom-scanner.js
- Content script injected on fivetran.com pages
- **detectPage()**: Determines if user is on connections list, connector detail (which tab), or other page
- **scanConnectionsList()**: Finds "Source type" header, walks rows to extract connector names, connection names, destinations, status. Falls back to text matching against 60+ known connector names if table structure isn't found.
- **scanConnectorDetail()**: Extracts connector name from header, delegates to usage or schema tab scanner
- **scanUsageTab()**: Finds "Usage breakdown by table" section, extracts table names + Total MAR + Free MAR + Paid MAR
- **scanSchemaTab()**: Extracts table names with enabled/disabled status and sync mode
- CSS classes on Fivetran dashboard are obfuscated/hashed (e.g., `span.ndnOq`, `div._1NJlt.Av7lu.P2WY7`), so scanner uses content-based detection, not class selectors
- Communicates with popup via `chrome.runtime.onMessage`

## Key Design Decisions

1. **CSS classes are obfuscated** on fivetran.com — the scanner can NOT rely on class names. It uses text content matching, DOM structure walking, and known-name fallback lists.

2. **All data is hardcoded in popup.js** for now. The plan is to eventually move to Supabase (project: `hmqdocjjejwdrpkqgdbd`) but Supabase free tier is more than enough and this can happen later.

3. **Error codes use the team's internal "Big 3" framework** from their Troubleshooting 101 doc — every error maps to Credentials (#1), Address/Endpoint (#2), or Permissions (#3), with clear escalation guidance.

4. **HubSpot is the most complete connector** — 26 known issues sourced from actual Fivetran docs across 6 categories. Salesforce (17) and Stripe (16) are also well-built. All were verified against Fivetran's documentation.

5. **Glossary terms sourced from** fivetran.com/docs/core-concepts, fivetran.com/docs/deployment-models, and fivetran.com/docs/usage-based-pricing.

## Fivetran Dashboard DOM Structure (from screenshots)

### Connections List Page (`/dashboard/connectors`)
- Table-like div structure (not actual `<table>` elements)
- Headers: "Connection name", "Source type", "Destination", "Status"
- Connection name column: links like `raw_salesforce`, `raw_stripe`
- Source type column: icon + `<span>` text like "Salesforce", "Stripe"
- Source type span has class like `span.ndnOq` (obfuscated)
- Status: "Active" (green), "Paused" (yellow), "Delayed" (red)
- Row element: `div` with obfuscated classes, 1390 x 48px, padding 0 24px 0 8px

### Connector Detail — Usage Tab (`/connectors/*/usage`)
- Header: connector icon + `raw_salesforce` + `Salesforce → apollo_warehouse`
- Tabs: Status, Schema, Usage, Transformations, Setup
- "Usage breakdown by table" section
- Table columns: Table name, Total MAR, Free MAR, Paid MAR
- Example rows: `account` (23,157 MAR), `task` (17,986), `lead` (9,350)

### Connector Detail — Schema Tab (`/connectors/*/schema`)
- Schema name collapsible: `salesforce`
- Count: `622/1,625 tables selected`
- Each row: blue checkbox (enabled) or empty (disabled) + table name + Re-sync link + Sync mode dropdown + Row filtering
- Enabled tables show "Re-sync" and "Filter data"
- Disabled tables show "table off"
- Custom objects visible with `__c` suffix

## What Needs to Happen Next

### Immediate
1. **Push to GitHub** — `git push -u origin main`
2. **Add icon images** — icon16.png, icon48.png, icon128.png in `images/`
3. **Test DOM scanner** — Load unpacked in Chrome, navigate to fivetran.com/dashboard, click extension, hit Scan. The scanner will likely need tuning based on real DOM output.

### Short Term
4. **Fix the Fivetran logo** in the header — current SVG doesn't match the actual logo (3 ascending diagonal bars). User provided a screenshot of the real logo.
5. **Test and refine scanner selectors** based on actual Fivetran dashboard DOM
6. **Add more connectors** as needed (same pattern as HubSpot/Salesforce/Stripe)

### Medium Term
7. **Populate Supabase** — Run CREATE TABLE SQL, insert all connector data
8. **Wire up supabase-client.js** — Replace hardcoded data with Supabase queries
9. **Add local caching** — Extension storage so it doesn't query Supabase every time
10. **Build admin panel** — Simple UI to edit known issues in Supabase

## Supabase Details (for when ready)
- **Project**: `hmqdocjjejwdrpkqgdbd`
- **URL**: `hmqdocjjejwdrpkqgdbd.supabase.co`
- **Anon Key**: `eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58`
- **Tables**: connectors, connector_tables, spike_patterns, glossary, connector_known_issues (sub_issues JSONB), troubleshooting (steps JSONB)

## Standalone Prototype
There's also a `fivetran-sales-buddy.html` file that's the all-in-one version (HTML+CSS+JS in one file) for JSFiddle testing. It works identically to the extension but uses simulated scan data.
