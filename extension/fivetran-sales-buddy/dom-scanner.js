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
  // Detects connector types from the Fivetran dashboard table by finding
  // the "Source type" column structurally (by header position), so it works
  // regardless of CSS class names or connector catalog changes.

  const NON_CONNECTOR_VALUES = new Set([
    '', 'Connection name', 'Source type', 'Destination', 'Status',
    'Last synced', 'Sync frequency', 'Schema', 'Setup state',
    'Data source', 'Usage', 'Tables', 'Sync', 'Name', 'Type',
    'Connection', 'Connector', 'Actions', 'Schedule', 'Frequency',
    'Active', 'Paused', 'Broken', 'Incomplete', 'Setup', 'Historical Sync',
    'Syncing', 'Rescheduled', 'true', 'false', 'N/A', '—', '-',
    'Edit', 'Delete', 'Pause', 'Resume', 'View', 'Details'
  ]);

  // Matches timestamps, durations, pure numbers, UUIDs
  const NOISE_PATTERN = /^(\d{1,4}[\/\-]\d|[\d:]+\s*(am|pm|hrs|min|sec|ago)|[\d,]+$|\d+\.\d+|\w{8}-\w{4}-)/i;

  function isLikelyConnectorName(text) {
    if (!text || text.length < 2 || text.length > 60) return false;
    if (NON_CONNECTOR_VALUES.has(text)) return false;
    if (NOISE_PATTERN.test(text)) return false;
    // Reject if it looks like a raw schema name (raw_something_v2)
    if (/^raw_/.test(text)) return false;
    // Reject URLs
    if (/^https?:\/\//.test(text)) return false;
    return true;
  }

  // Find which column index holds "Source type" by scanning headers
  function findSourceTypeColumnIndex() {
    // Try <th> elements
    const ths = document.querySelectorAll('th');
    for (let i = 0; i < ths.length; i++) {
      const t = (ths[i].textContent || '').trim();
      if (/^source\s*type$/i.test(t) || /^connector$/i.test(t) || /^type$/i.test(t)) {
        return { index: i, method: 'th' };
      }
    }

    // Try role="columnheader"
    const colHeaders = document.querySelectorAll('[role="columnheader"]');
    for (let i = 0; i < colHeaders.length; i++) {
      const t = (colHeaders[i].textContent || '').trim();
      if (/^source\s*type$/i.test(t) || /^connector$/i.test(t) || /^type$/i.test(t)) {
        return { index: i, method: 'role' };
      }
    }

    // Try first row of a grid/table as header
    const firstRow = document.querySelector('[role="row"]:first-child, tr:first-child');
    if (firstRow) {
      const cells = firstRow.querySelectorAll('[role="cell"], [role="gridcell"], [role="columnheader"], td, th');
      for (let i = 0; i < cells.length; i++) {
        const t = (cells[i].textContent || '').trim();
        if (/^source\s*type$/i.test(t) || /^connector$/i.test(t) || /^type$/i.test(t)) {
          return { index: i, method: 'first-row' };
        }
      }
    }

    return null;
  }

  function collectVisibleSourceTypes(typeCounts, colInfo) {
    let found = false;

    // Strategy 1: Column-position extraction (most reliable)
    if (colInfo) {
      const rows = document.querySelectorAll('tr, [role="row"]');
      for (const row of rows) {
        const cells = row.querySelectorAll('td, [role="cell"], [role="gridcell"]');
        if (cells.length > colInfo.index) {
          const t = (cells[colInfo.index].textContent || '').trim();
          if (isLikelyConnectorName(t)) {
            typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
            found = true;
          }
        }
      }
    }

    // Strategy 2: Try the known CSS class (fast path if it still works)
    if (!found) {
      const byClass = document.querySelectorAll('span.ndnOq');
      if (byClass.length > 0) {
        for (const span of byClass) {
          const t = (span.textContent || '').trim();
          if (!isLikelyConnectorName(t)) continue;
          if (span.closest('a')) continue;
          typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
          found = true;
        }
      }
    }

    // Strategy 3: Look for connector icons — img[alt] or svg near text
    if (!found) {
      const icons = document.querySelectorAll('img[alt][src*="connector"], img[alt][src*="icon"], img[alt][src*="logo"]');
      for (const img of icons) {
        const row = img.closest('tr, [role="row"], [class*="Row"], [class*="row"]');
        if (!row) continue;
        // The source type text is usually a sibling span near the icon
        const spans = row.querySelectorAll('span, p');
        for (const span of spans) {
          if (span.children.length > 0) continue;
          const t = (span.textContent || '').trim();
          if (isLikelyConnectorName(t) && t !== img.alt) {
            typeCounts.set(t, (typeCounts.get(t) || 0) + 1);
            found = true;
            break;
          }
        }
      }
    }

    // Strategy 4: Scan all visible rows for elements that look like connector type cells
    // (second column position heuristic — "Source type" is typically column 2)
    if (!found) {
      const rows = document.querySelectorAll('[class*="Row"], [class*="row"], [class*="Item"], [class*="item"]');
      for (const row of rows) {
        const leafSpans = [];
        row.querySelectorAll('span, p, div').forEach(el => {
          if (el.children.length === 0) {
            const t = (el.textContent || '').trim();
            if (isLikelyConnectorName(t)) leafSpans.push(t);
          }
        });
        // Heuristic: in a connector row, the second distinct text is usually source type
        if (leafSpans.length >= 2) {
          typeCounts.set(leafSpans[1], (typeCounts.get(leafSpans[1]) || 0) + 1);
          found = true;
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
    const colInfo = findSourceTypeColumnIndex();
    collectVisibleSourceTypes(typeCounts, colInfo);
    return buildConnectionsResult(typeCounts);
  }

  function findScrollContainer() {
    const candidates = [
      document.querySelector('[class*="ScrollContainer"]'),
      document.querySelector('[class*="scrollable"]'),
      document.querySelector('[class*="VirtualList"]'),
      document.querySelector('[class*="virtualList"]'),
      document.querySelector('[data-testid*="connector"], [data-testid*="connection"]')?.closest('[style*="overflow"]'),
      document.querySelector('main')
    ].filter(Boolean);

    for (const el of candidates) {
      if (el.scrollHeight > el.clientHeight + 100) return el;
    }

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

    // Last resort: find deepest scrollable element with large content
    let best = document.documentElement;
    let bestDepth = 0;
    document.querySelectorAll('*').forEach(el => {
      if (el.scrollHeight > el.clientHeight + 200) {
        let depth = 0;
        let p = el;
        while (p) { depth++; p = p.parentElement; }
        if (depth > bestDepth) {
          const style = window.getComputedStyle(el);
          if (style.overflow !== 'visible' || style.overflowY !== 'visible') {
            best = el;
            bestDepth = depth;
          }
        }
      }
    });
    return best;
  }

  async function scanConnectionsListFull() {
    const typeCounts = new Map();
    const colInfo = findSourceTypeColumnIndex();
    const scrollEl = findScrollContainer();

    collectVisibleSourceTypes(typeCounts, colInfo);
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
    let lastTotalCount = Array.from(typeCounts.values()).reduce((a, b) => a + b, 0);
    let noNewCount = 0;
    const MAX_ITERATIONS = 600;
    const SCROLL_WAIT_MS = 250;

    for (let i = 0; i < MAX_ITERATIONS; i++) {
      const currentHeight = getScrollHeight();
      const currentTop = getScrollTop();
      const viewportHeight = scrollEl === document.documentElement
        ? window.innerHeight
        : scrollEl.clientHeight;

      if (currentTop + viewportHeight >= currentHeight - 50) {
        collectVisibleSourceTypes(typeCounts, colInfo);

        if (currentHeight === lastScrollHeight) {
          stableCount++;
          if (stableCount >= 5) break;
        } else {
          stableCount = 0;
        }
        lastScrollHeight = currentHeight;
      }

      // Scroll by 60% of viewport (smaller steps = more overlap = fewer missed rows)
      setScroll(getScrollTop() + Math.floor(viewportHeight * 0.6));
      await new Promise(r => setTimeout(r, SCROLL_WAIT_MS));
      collectVisibleSourceTypes(typeCounts, colInfo);

      const currentTotal = Array.from(typeCounts.values()).reduce((a, b) => a + b, 0);
      if (currentTotal === lastTotalCount) {
        noNewCount++;
      } else {
        noNewCount = 0;
        lastTotalCount = currentTotal;
      }
      // Only stop if we've had 40 scrolls with no new connections at all
      if (noNewCount >= 40 && typeCounts.size > 0) break;
    }

    setScroll(0);

    const totalConns = Array.from(typeCounts.values()).reduce((a, b) => a + b, 0);
    const result = buildConnectionsResult(typeCounts);
    result.method = totalConns > initialCount ? 'scroll-scan' : 'single-pass';
    result.note = totalConns > initialCount
      ? `Scrolled to capture all connectors (${initialCount} visible initially, ${typeCounts.size} types / ${totalConns} total found)`
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
    const COMMON_CONNECTORS = [
      'HubSpot', 'Salesforce', 'Stripe', 'Slack', 'GitHub', 'Jira',
      'PagerDuty', 'Datadog', 'Marketo', 'Zendesk', 'Intercom', 'Asana',
      'Shopify', 'Google Analytics', 'Google Analytics 4', 'Google Ads',
      'Facebook Ads', 'LinkedIn Ads', 'Snowflake', 'BigQuery', 'Redshift',
      'PostgreSQL', 'MySQL', 'MongoDB', 'NetSuite', 'QuickBooks', 'Xero',
      'Braze', 'Segment', 'Amplitude', 'Mixpanel', 'Twilio', 'SendGrid',
      'Zuora', 'Chargebee', 'Workday', 'ServiceNow', 'Confluence',
      'Greenhouse', 'Lever', 'Google Sheets', 'Airtable', 'Oracle', 'SAP',
      'Dynamics 365', 'Freshdesk', 'Pipedrive', 'Outreach', 'SalesLoft',
      'Gong', 'ZoomInfo', 'Klaviyo', 'Mailchimp', 'ActiveCampaign',
      'SQL Server', 'MariaDB', 'DynamoDB', 'Firebase', 'Amazon S3',
      'TikTok Ads', 'Snapchat Ads', 'Pinterest Ads', 'AppsFlyer',
      'Okta', 'Databricks', 'Fivetran Log', 'Notion', 'Linear',
      'Zoom', 'DocuSign', 'Box', 'Dropbox', 'Kafka', 'Elasticsearch'
    ];

    const pageText = document.body.innerText;
    const found = [];

    for (const connector of COMMON_CONNECTORS) {
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
