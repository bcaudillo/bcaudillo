# Fivetran Connector Scout — Chrome Extension

## Project Overview
A Chrome extension (MV3) for Fivetran Account Executives that provides instant connector intelligence, troubleshooting, competitive positioning, and account prep — all from the browser toolbar.

**Owner:** btcaudillo@gmail.com
**Branch:** `claude/fivetran-sales-buddy-cfAZS`
**Version:** 0.4.0
**Directory:** `extension/fivetran-sales-buddy/`

## Architecture

```
extension/fivetran-sales-buddy/
├── manifest.json          # MV3 manifest (activeTab, scripting, host_permissions)
├── popup.html             # Extension popup UI (5 tabs)
├── popup.css              # All styles including dark mode
├── popup.js               # Main logic (~1500 lines, event delegation)
├── supabase-client.js     # Supabase REST client + connectorMeta map
├── dom-scanner.js         # Content script for fivetran.com dashboard scraping
└── prototype-v040.html    # Self-contained demo/prototype
```

### Key Patterns
- **Event delegation** via `data-action` attributes (MV3 CSP blocks inline handlers)
- **Detail overlay**: `.content.showing-details > .section { display: none !important; }`
- **localStorage** for favorites, recents, dark mode preference
- **Supabase REST API** for connector knowledge base (hardcoded fallback in popup.js)
- **connectorMeta** in supabase-client.js maps connector IDs to display metadata

### Tabs (5 active)
1. **Scan** — Scans Fivetran dashboard for active connectors, shows recommendations
2. **Search** — Universal search across connectors, issues, glossary, error codes, competitors
3. **Troubleshoot** — Error code analysis + known issues browser (per connector)
4. **Compete** — Battle cards for competitors (Airbyte, Stitch, Informatica, Matillion, Hevo, DIY, Talend)
5. **Glossary** — Searchable glossary of Fivetran terms, pricing, and technical concepts

## Important Business Context

- **Census is NOT a competitor** — Fivetran acquired Census. It powers Fivetran's "Activations" (Reverse ETL) feature.
- **No MAR estimator** — The team uses an internal pricing calculator. MAR tab was removed.
- **No objection handler search** — Not needed as a standalone feature.
- **No connector comparison** (side-by-side) — Not needed.

## Features Implemented
- Dark mode (toggle in header, persists via localStorage)
- Connector recommendations with "Why add this?" business case pitches
- Export/share briefings (formatted for Slack/email, copies to clipboard)
- Universal search with grouped results (max 3 per section)
- Favorites system (star icon, persists via localStorage)
- Recent items tracking
- Quick stats dashboard (4-card grid)
- Keyboard shortcuts (Cmd/Ctrl+K = search focus, Escape = close details)
- Error code analysis with connector-specific context
- Known issues browser with category filtering

## Data Sources in popup.js
- `connectorData` — Full connector profiles with tables, known issues (HubSpot, Salesforce, Stripe have deep data)
- `glossaryData` — 30+ terms across Pricing, Core, Technical, Deployment, Data Ecosystem categories
- `battleCardData` — 7 competitor battle cards with strengths, weaknesses, positioning, objection handling
- `connectorRecommendations` — Graph-based recommendation engine (which connectors pair well and why)

## Prioritized Backlog (next work)

### High Priority
1. **Enrich more connectors** — Only HubSpot, Salesforce, Stripe have full deep data (tables, known issues, troubleshooting). Add: Shopify, Google Ads, Facebook Ads, NetSuite, PostgreSQL, MySQL, Snowflake
2. **Add more battle cards** — Rivery, Portable, Segment, dbt (positioning as complement not competitor)
3. **Split popup.js into modules** — It's ~1500 lines. Consider: data.js, ui.js, search.js, recommendations.js

### Medium Priority
4. **Meeting prep mode** — "I have a call with [company], prep me" — generates a briefing based on likely tech stack
5. **Service worker caching** — Cache Supabase responses for offline/faster access
6. **More connector recommendations** — Add recommendation maps for PostgreSQL, MySQL, Snowflake, Google Analytics, LinkedIn Ads

### Low Priority
7. **Deal sizing assistant** — Based on scanned connectors, estimate deal size range
8. **Keyboard navigation** — Arrow keys to navigate search results
9. **Supabase data expansion** — Move all hardcoded data to Supabase for easier updates without extension re-deploy

## Development Notes
- Test locally by loading as unpacked extension in Chrome (chrome://extensions > Developer mode > Load unpacked)
- Supabase URL: https://hmqdocjjejwdrpkqgdbd.supabase.co
- No build step required — plain HTML/CSS/JS
- All DOM event handlers use delegation via the single `document.addEventListener('click', ...)` block
- When adding new actions: add `data-action="actionName"` to HTML, add case to the switch statement in popup.js
