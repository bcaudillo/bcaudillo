/**
 * dom-scanner.js — Fivetran Dashboard DOM Scanner
 * Content script that runs on fivetran.com pages.
 * Extracts connector names, table names, MAR data, and schema info.
 * 
 * Communicates with popup.js via chrome.runtime messages.
 */

(function() {
  'use strict';

  console.log('[fivetran-scout] content script loaded on', window.location.href);

  // ─── PAGE DETECTION ──────────────────────────────────────
  function detectPage() {
    const url = window.location.href;
    const path = window.location.pathname;

    if (!url.includes('fivetran.com')) {
      return { type: 'not-fivetran', url };
    }

    // Connector detail pages: /dashboard/connectors/<id>/...
    // Check for tabs: status, schema, usage, transformations, setup
    if (/\/connectors\/[^/]+\/(schema|usage|status|setup|transformations)/i.test(path)) {
      const tab = path.match(/\/(schema|usage|status|setup|transformations)/i)?.[1]?.toLowerCase();
      return { type: 'connector-detail', tab, url };
    }

    // Connector detail page (no specific tab — defaults to status)
    if (/\/connectors\/[^/]+\/?$/i.test(path)) {
      return { type: 'connector-detail', tab: 'status', url };
    }

    // Connections list page
    if (/\/dashboard\/?$/i.test(path) || /\/connectors\/?$/i.test(path) || path.includes('connections')) {
      return { type: 'connections-list', url };
    }

    return { type: 'fivetran-other', url };
  }

  // ─── CONNECTIONS LIST SCANNER ──────────────────────────────
  // Scans all source-type spans on the page (span.ndnOq), deduplicates by
  // connector name, and returns one entry per unique connector type. This
  // means 5 Google Sheets connections → 1 "Google Sheets" card.
  //
  // For large accounts (830+ connectors), the Fivetran dashboard uses
  // virtualized scrolling — only visible rows are in the DOM. We auto-scroll
  // the page to force all rows to render, collecting connector types as we go.

  const KNOWN_CONNECTOR_NAMES = new Set([
    'HubSpot', 'Salesforce', 'Stripe', 'Slack', 'GitHub', 'Jira',
    'PagerDuty', 'Tempo', 'incident.io', 'Recurly', 'LaunchDarkly',
    'Datadog', 'Marketo', 'Zendesk', 'Intercom', 'Asana', 'Shopify',
    'Google Analytics', 'Google Analytics 4', 'Google Ads', 'Facebook Ads',
    'LinkedIn Ads', 'Snowflake', 'BigQuery', 'Redshift', 'PostgreSQL',
    'MySQL', 'MongoDB', 'NetSuite', 'QuickBooks', 'Xero', 'Braze',
    'Segment', 'Amplitude', 'Mixpanel', 'Twilio', 'SendGrid', 'Zuora',
    'Chargebee', 'Workday', 'ServiceNow', 'Confluence', 'Bamboo HR',
    'Greenhouse', 'Lever', 'Fivetran Platform', 'Connector SDK',
    'Google Sheets', 'Airtable', 'Monday.com', 'Oracle', 'SAP',
    'Dynamics 365', 'Freshdesk', 'Freshsales', 'Pipedrive', 'Close',
    'Outreach', 'SalesLoft', 'Gong', 'Apollo', 'ZoomInfo', 'Clearbit',
    'FullStory', 'Heap', 'Adobe Analytics', 'Pardot', 'Mailchimp',
    'Klaviyo', 'Brevo', 'ActiveCampaign', 'Customer.io', 'SQL Server',
    'Aurora', 'MariaDB', 'Cosmos DB', 'DynamoDB', 'Firebase',
    'Google Cloud Storage', 'Amazon S3', 'Azure Blob Storage',
    'Webhooks', 'Iterable', 'AppsFlyer', 'Adjust', 'Branch',
    'Snapchat Ads', 'TikTok Ads', 'Pinterest Ads', 'Twitter Ads',
    'Google Search Console', 'Google Play', 'App Store Connect',
    'Coupa', 'Netsuite SuiteAnalytics', 'Workato', 'Gainsight',
    'ChurnZero', 'Totango', 'Pendo', 'WalkMe', 'Appcues',
    'Looker', 'Tableau', 'Power BI', 'Databricks', 'Census',
    'Fivetran Log', 'Notion', 'ClickUp', 'Linear', 'Shortcut',
    'Front', 'Drift', 'Qualified', 'Calendly', 'Zoom',
    'DocuSign', 'PandaDoc', 'Conga', 'Box', 'Dropbox',
    'OneDrive', 'SharePoint', 'Google Drive', 'Okta', 'Auth0',
    'OneLogin', 'CrowdStrike', 'SentinelOne', 'Carbon Black',
    'Wrike', 'Smartsheet', 'Teamwork', 'Harvest', 'Toggl',
    'QuickBooks Online', 'FreshBooks', 'Wave', 'Bill.com',
    'Expensify', 'Concur', 'Coupa', 'Anaplan', 'Adaptive Insights',
    'Planful', 'Sage Intacct', 'Navan', 'Ramp', 'Brex',
    'Sprinklr', 'Hootsuite', 'Sprout Social', 'HubSpot Marketing',
    'HubSpot Service', 'Salesforce Marketing Cloud', 'Eloqua',
    'Adobe Marketo', 'Act-On', 'Emma', 'Constant Contact',
    'Campaign Monitor', 'Drip', 'ConvertKit', 'AWeber',
    'Amazon Ads', 'Microsoft Ads', 'Yahoo DSP', 'The Trade Desk',
    'MediaMath', 'DoubleVerify', 'IAS', 'Moat', 'Kochava',
    'Singular', 'Lotame', 'LiveRamp', 'Snowplow',
    'Kinesis', 'Kafka', 'Event Hubs', 'Pub/Sub', 'RabbitMQ',
    'Elasticsearch', 'Splunk', 'Sumo Logic', 'New Relic',
    'AppDynamics', 'Dynatrace', 'CloudWatch', 'Azure Monitor',
    'StatusPage', 'OpsGenie', 'VictorOps', 'xMatters',
    'ConnectWise', 'Autotask', 'SolarWinds', 'Datto',
    'Google BigQuery', 'Amazon Redshift', 'Azure Synapse',
    'Teradata', 'Vertica', 'Greenplum', 'ClickHouse',
    'SingleStore', 'CockroachDB', 'YugabyteDB', 'TiDB',
    'Couchbase', 'Cassandra', 'Redis', 'Neo4j', 'FTP', 'SFTP',
    'Azure SQL Database', 'Google Cloud SQL',
    'Amazon RDS', 'Heroku Postgres'
  ]);

  const HEADER_LABELS = new Set([
    'Connection name', 'Source type', 'Destination', 'Status',
    'Last synced', 'Sync frequency', 'Schema', 'Setup state',
    'Data source', 'Usage', 'Tables', 'Sync', 'Name', 'Type',
    'Connection', 'Connector', 'Actions', 'Schedule', 'Frequency'
  ]);

  function collectVisibleSourceTypes(typeCounts) {
    let found = false;

    // Strategy 1: Try the known class name first (fast path)
    const byClass = document.querySelectorAll('span.ndnOq');
    if (byClass.length > 0) {
      for (const span of byClass) {
        const t = (span.textContent || '').trim();
        if (!t || HEADER_LABELS.has(t)) continue;
        if (span.closest('a')) continue;
        typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
        found = true;
      }
    }

    // Strategy 2: Find the "Source type" column header, then grab siblings
    if (!found) {
      const allCells = document.querySelectorAll('td, div[role="cell"], div[role="gridcell"]');
      for (const cell of allCells) {
        const t = (cell.textContent || '').trim();
        if (KNOWN_CONNECTOR_NAMES.has(t)) {
          typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
          found = true;
        }
      }
    }

    // Strategy 3: Walk table rows — look for rows with connector icons/images
    if (!found) {
      const rows = document.querySelectorAll('tr, div[role="row"], [class*="Row"], [class*="row"]');
      for (const row of rows) {
        const img = row.querySelector('img[alt], svg[aria-label]');
        if (img) {
          const alt = (img.getAttribute('alt') || img.getAttribute('aria-label') || '').trim();
          if (alt && KNOWN_CONNECTOR_NAMES.has(alt)) {
            typeCounts.set(alt, (typeCounts.get(alt) || 0) + 1);
            found = true;
            continue;
          }
        }
        const spans = row.querySelectorAll('span, p, div');
        for (const span of spans) {
          if (span.children.length > 0) continue;
          const t = (span.textContent || '').trim();
          if (t && KNOWN_CONNECTOR_NAMES.has(t) && !HEADER_LABELS.has(t)) {
            typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
            found = true;
            break;
          }
        }
      }
    }

    // Strategy 4: Broadest — scan all leaf-level text nodes for known names
    if (!found) {
      const walker = document.createTreeWalker(
        document.body, NodeFilter.SHOW_TEXT, null
      );
      let node;
      while ((node = walker.nextNode())) {
        const t = (node.textContent || '').trim();
        if (t && KNOWN_CONNECTOR_NAMES.has(t) && !HEADER_LABELS.has(t)) {
          typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
        }
      }
    }
  }

  function buildConnectionsResult(typeCounts) {
    const connections = [];
    for (const [sourceType, count] of typeCounts) {
      connections.push({
        connectionName: '',
        sourceType,
        destination: '',
        status: 'Detected',
        instanceCount: count
      });
    }
    if (connections.length === 0) {
      return scanByTextMatching();
    }
    return {
      page: 'connections-list',
      count: connections.length,
      totalConnections: Array.from(typeCounts.values()).reduce((a, b) => a + b, 0),
      connections
    };
  }

  function scanConnectionsList() {
    const typeCounts = new Map();
    collectVisibleSourceTypes(typeCounts);
    return buildConnectionsResult(typeCounts);
  }

  function findScrollContainer() {
    // Try known Fivetran selectors first
    const candidates = [
      document.querySelector('[class*="ScrollContainer"]'),
      document.querySelector('[class*="scrollable"]'),
      document.querySelector('[class*="VirtualList"]'),
      document.querySelector('[class*="virtualList"]'),
      document.querySelector('[data-testid*="connector"], [data-testid*="connection"]')?.closest('[style*="overflow"]'),
      document.querySelector('main')
    ].filter(Boolean);

    // Pick the one that actually scrolls (scrollHeight > clientHeight)
    for (const el of candidates) {
      if (el.scrollHeight > el.clientHeight + 100) return el;
    }

    // Walk up from the first table/grid looking for scrollable ancestor
    const table = document.querySelector('table, [role="grid"], [role="table"], [class*="Table"]');
    if (table) {
      let el = table.parentElement;
      for (let i = 0; i < 10 && el; i++) {
        const style = window.getComputedStyle(el);
        if ((style.overflow === 'auto' || style.overflow === 'scroll' ||
             style.overflowY === 'auto' || style.overflowY === 'scroll') &&
            el.scrollHeight > el.clientHeight + 100) {
          return el;
        }
        el = el.parentElement;
      }
    }

    return document.documentElement;
  }

  async function scanConnectionsListFull() {
    const typeCounts = new Map();
    const scrollEl = findScrollContainer();

    collectVisibleSourceTypes(typeCounts);
    const initialCount = typeCounts.size;

    const getScrollHeight = () => scrollEl.scrollHeight;
    const getScrollTop = () => scrollEl === document.documentElement ? window.scrollY : scrollEl.scrollTop;
    const setScroll = (y) => {
      if (scrollEl === document.documentElement) {
        window.scrollTo(0, y);
      } else {
        scrollEl.scrollTop = y;
      }
    };

    let lastScrollHeight = 0;
    let stableCount = 0;
    let lastTypeCount = typeCounts.size;
    let noNewTypesCount = 0;
    const MAX_ITERATIONS = 500;
    const SCROLL_WAIT_MS = 200;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const currentHeight = getScrollHeight();
      const currentTop = getScrollTop();
      const viewportHeight = scrollEl === document.documentElement
        ? window.innerHeight
        : scrollEl.clientHeight;

      if (currentTop + viewportHeight >= currentHeight - 50) {
        collectVisibleSourceTypes(typeCounts);

        if (currentHeight === lastScrollHeight) {
          stableCount++;
          if (stableCount >= 3) break;
        } else {
          stableCount = 0;
        }
        lastScrollHeight = currentHeight;
      }

      setScroll(getScrollTop() + Math.floor(viewportHeight * 0.8));
      await new Promise(r => setTimeout(r, SCROLL_WAIT_MS));
      collectVisibleSourceTypes(typeCounts);

      if (typeCounts.size === lastTypeCount) {
        noNewTypesCount++;
      } else {
        noNewTypesCount = 0;
        lastTypeCount = typeCounts.size;
      }
      // If we've scrolled 30 times with no new connector types, stop
      if (noNewTypesCount >= 30 && typeCounts.size > 0) break;
    }

    setScroll(0);

    const result = buildConnectionsResult(typeCounts);
    result.method = typeCounts.size > initialCount ? 'scroll-scan' : 'single-pass';
    result.note = typeCounts.size > initialCount
      ? `Scrolled to capture all connectors (${initialCount} visible initially, ${typeCounts.size} total found)`
      : undefined;
    return result;
  }

  // ─── CONNECTOR DETAIL SCANNER ──────────────────────────────
  function scanConnectorDetail() {
    const page = detectPage();
    const result = {
      page: 'connector-detail',
      tab: page.tab,
      connectorName: '',
      sourceType: '',
      destination: '',
      tables: []
    };

    // Extract connector name from the page header
    // The header shows: icon + "raw_salesforce" + "Salesforce → apollo_warehouse"
    const h1Elements = document.querySelectorAll('h1, h2, [class*="title"], [class*="header"]');
    for (const el of h1Elements) {
      const text = el.textContent.trim();
      if (text.startsWith('raw_') || (text.length < 50 && text.length > 3)) {
        result.connectorName = text;
        break;
      }
    }

    // Look for "Source → Destination" pattern
    const allText = document.body.innerText;
    const arrowMatch = allText.match(/(\w+)\s*→\s*(\w[\w_]*)/);
    if (arrowMatch) {
      result.sourceType = arrowMatch[1];
      result.destination = arrowMatch[2];
    }

    // Scan based on which tab we're on
    if (page.tab === 'usage') {
      result.tables = scanUsageTab();
    } else if (page.tab === 'schema') {
      result.tables = scanSchemaTab();
    }

    return result;
  }

  // ─── USAGE TAB SCANNER ──────────────────────────────────────
  function scanUsageTab() {
    const tables = [];

    // Look for "Usage breakdown by table" section
    // Table structure: Table name | Total MAR | Free MAR | Paid MAR
    const allElements = document.querySelectorAll('div, td, span');

    // Find the "Table" header to locate the usage table
    let tableHeader = null;
    for (const el of allElements) {
      const text = el.textContent.trim();
      if (text === 'Table' && el.offsetParent !== null) {
        // Check if siblings contain "Total MAR"
        const parent = el.parentElement;
        if (parent && parent.textContent.includes('Total MAR')) {
          tableHeader = parent;
          break;
        }
      }
    }

    if (!tableHeader) return tables;

    // Walk rows after the header
    const container = tableHeader.parentElement;
    if (!container) return tables;

    const rows = container.querySelectorAll(':scope > div');
    let pastHeader = false;

    for (const row of rows) {
      if (row === tableHeader) {
        pastHeader = true;
        continue;
      }
      if (!pastHeader) continue;

      const cells = row.querySelectorAll('div, td, span');
      if (cells.length < 2) continue;

      // First cell is table name, subsequent cells are MAR numbers
      let tableName = '';
      let totalMAR = '';
      let freeMAR = '';
      let paidMAR = '';

      const texts = [];
      for (const cell of cells) {
        const t = cell.textContent.trim();
        if (t && !cell.querySelector('div, span')) { // leaf nodes only
          texts.push(t);
        }
      }

      // Fallback: parse row text
      if (texts.length === 0) {
        const rowText = row.textContent.trim();
        const parts = rowText.split(/\s{2,}|\t/);
        texts.push(...parts);
      }

      if (texts.length >= 1) tableName = texts[0];
      if (texts.length >= 2) totalMAR = texts[1].replace(/,/g, '');
      if (texts.length >= 3) freeMAR = texts[2].replace(/,/g, '');
      if (texts.length >= 4) paidMAR = texts[3].replace(/,/g, '');

      if (tableName && !tableName.includes('Table') && !tableName.includes('Usage')) {
        tables.push({
          name: tableName,
          totalMAR: parseInt(totalMAR) || 0,
          freeMAR: parseInt(freeMAR) || 0,
          paidMAR: parseInt(paidMAR) || 0,
          source: 'usage'
        });
      }
    }

    return tables;
  }

  // ─── SCHEMA TAB SCANNER ──────────────────────────────────────
  function scanSchemaTab() {
    const tables = [];

    // Schema page structure:
    // - Schema name (collapsible): "salesforce"
    // - "622/1,625 tables selected"
    // - Each table row: checkbox + table name + Re-sync + Sync mode + Row filtering
    // Enabled tables have a filled/blue checkbox, disabled ones show "table off"

    const allElements = document.querySelectorAll('div, span, label');

    for (const el of allElements) {
      const text = el.textContent.trim();

      // Look for table names: they follow a checkbox pattern
      // Table names are typically PascalCase, snake_case, or have __c suffix
      // Skip if element contains too much text (it's a container, not a table name cell)
      if (text.length > 60 || text.length < 2) continue;
      if (text.includes('tables selected') || text === 'Schema' || text === 'Re-sync') continue;
      if (text.includes('Sync mode') || text.includes('Row filtering') || text.includes('Column hashing')) continue;
      if (text.includes('Filter') || text.includes('ERD') || text.includes('Search')) continue;

      // Check if this element is near a checkbox
      const parent = el.parentElement;
      if (!parent) continue;

      const hasCheckbox = parent.querySelector('input[type="checkbox"], [role="checkbox"], svg');
      const hasResync = parent.textContent.includes('Re-sync') || parent.textContent.includes('table off');

      if (hasCheckbox || hasResync) {
        // Determine if enabled or disabled
        const isEnabled = parent.textContent.includes('Re-sync') ||
                          parent.textContent.includes('Filter data') ||
                          parent.querySelector('input:checked, [aria-checked="true"]') !== null;

        const isDisabled = parent.textContent.includes('table off');

        // Extract just the table name (shortest meaningful text in the row)
        const candidateName = text.split(/\s+/)[0]; // First word before any whitespace

        if (candidateName && /^[A-Za-z]/.test(candidateName) &&
            candidateName !== 'Re-sync' && candidateName !== 'Soft' &&
            candidateName !== 'Filter' && candidateName !== 'table') {
          tables.push({
            name: candidateName,
            enabled: isEnabled && !isDisabled,
            syncMode: parent.textContent.includes('Soft delete') ? 'Soft delete' :
                      parent.textContent.includes('Hard delete') ? 'Hard delete' : 'Unknown',
            source: 'schema'
          });
        }
      }
    }

    // Deduplicate by name
    const seen = new Set();
    return tables.filter(t => {
      if (seen.has(t.name)) return false;
      seen.add(t.name);
      return true;
    });
  }

  // ─── FALLBACK: TEXT MATCHING ──────────────────────────────
  // When we can't find the table structure, scan the entire page for known connector names
  function scanByTextMatching() {
    const pageText = document.body.innerText;
    const found = [];

    for (const connector of KNOWN_CONNECTOR_NAMES) {
      const regex = new RegExp(`\\b${connector.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'gi');
      if (regex.test(pageText)) {
        found.push({
          connectionName: '',
          sourceType: connector,
          destination: '',
          status: 'Detected'
        });
      }
    }

    return {
      page: 'connections-list',
      count: found.length,
      connections: found,
      method: 'text-matching-fallback'
    };
  }

  // ─── HELPERS ──────────────────────────────────────
  function findTableContainer(headerElement) {
    // Walk up the DOM to find the container that holds all rows
    let current = headerElement;
    for (let i = 0; i < 10; i++) {
      current = current.parentElement;
      if (!current) return null;

      // The container should have multiple child divs (the rows)
      const children = current.querySelectorAll(':scope > div');
      if (children.length > 3) {
        return current;
      }
    }
    return null;
  }

  // ─── MAIN SCAN FUNCTION ──────────────────────────────────────
  function scan() {
    const page = detectPage();

    let result;
    switch (page.type) {
      case 'connections-list':
        result = scanConnectionsList();
        break;
      case 'connector-detail':
        result = scanConnectorDetail();
        break;
      case 'not-fivetran':
        result = { page: 'not-fivetran', message: 'Navigate to fivetran.com to scan' };
        break;
      default:
        result = { page: page.type, message: 'Navigate to Connections or a connector page to scan' };
    }

    result.timestamp = new Date().toISOString();
    result.url = window.location.href;

    return result;
  }

  // ─── MESSAGE HANDLER ──────────────────────────────────────
  // Listen for scan requests from the popup
  // action: 'scan' — quick scan (what's currently in the DOM)
  // action: 'scanFull' — scrolls the entire page to capture all virtualized rows
  chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
    if (request.action === 'scan') {
      try {
        const result = scan();
        sendResponse(result);
      } catch (error) {
        sendResponse({
          page: 'error',
          message: `Scan failed: ${error.message}`,
          url: window.location.href
        });
      }
    } else if (request.action === 'scanFull') {
      const page = detectPage();
      if (page.type === 'connections-list') {
        scanConnectionsListFull().then(result => {
          result.timestamp = new Date().toISOString();
          result.url = window.location.href;
          sendResponse(result);
        }).catch(error => {
          sendResponse({
            page: 'error',
            message: `Full scan failed: ${error.message}`,
            url: window.location.href
          });
        });
      } else {
        try {
          const result = scan();
          sendResponse(result);
        } catch (error) {
          sendResponse({
            page: 'error',
            message: `Scan failed: ${error.message}`,
            url: window.location.href
          });
        }
      }
    }
    return true; // Keep message channel open for async response
  });

  // Also expose scan function globally for debugging
  window.__fivetranScanner = { scan, scanConnectionsListFull, detectPage };

})();
