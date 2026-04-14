/**
 * dom-scanner.js — Fivetran Dashboard DOM Scanner
 * Content script that runs on fivetran.com pages.
 * Extracts connector names, table names, MAR data, and schema info.
 * 
 * Communicates with popup.js via chrome.runtime messages.
 */

(function() {
  'use strict';

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
  // Scans the main connections/connectors list page
  function scanConnectionsList() {
    const connections = [];

    // Strategy 1: Find rows by looking for "Source type" header, then walking sibling rows
    // Since classes are obfuscated, we scan by content patterns

    // Look for all text nodes that match known connector names
    // The source type column contains the canonical connector name
    const allText = document.body.innerText;

    // Find the table-like structure by looking for the header row
    // Headers: "Connection name", "Source type", "Destination", "Status"
    const allElements = document.querySelectorAll('div, span, td, tr, a');

    // Strategy: Find elements that contain "Source type" header
    let sourceTypeHeader = null;
    for (const el of allElements) {
      if (el.textContent.trim() === 'Source type' && el.offsetParent !== null) {
        sourceTypeHeader = el;
        break;
      }
    }

    if (!sourceTypeHeader) {
      // Fallback: scan entire page for known connector name patterns
      return scanByTextMatching();
    }

    // Find the table container (walk up from header to find the repeating row structure)
    const tableContainer = findTableContainer(sourceTypeHeader);
    if (!tableContainer) {
      return scanByTextMatching();
    }

    // Get all rows — they're divs with consistent structure
    // Each row contains: chevron, checkbox, connection name (link), source type (icon + text), destination, status
    const rows = tableContainer.querySelectorAll(':scope > div');

    for (const row of rows) {
      // Skip header row
      if (row.textContent.includes('Connection name') && row.textContent.includes('Source type')) continue;

      const text = row.textContent.trim();
      if (!text) continue;

      // Extract connection name — it's usually a link (anchor) with the raw_ prefix
      const links = row.querySelectorAll('a');
      let connectionName = '';
      for (const link of links) {
        const linkText = link.textContent.trim();
        if (linkText.startsWith('raw_') || linkText.includes('_')) {
          connectionName = linkText;
          break;
        }
      }

      // Extract source type — find span elements with short, capitalized connector names
      let sourceType = '';
      const spans = row.querySelectorAll('span');
      for (const span of spans) {
        const spanText = span.textContent.trim();
        // Source type names are typically 1-3 words, capitalized, no underscores
        if (spanText && !spanText.includes('_') && !spanText.includes('warehouse') &&
            spanText.length > 1 && spanText.length < 30 &&
            spanText !== 'Active' && spanText !== 'Paused' && spanText !== 'Delayed' &&
            spanText !== 'Broken' && spanText !== 'Re-sync' &&
            /^[A-Z]/.test(spanText)) {
          sourceType = spanText;
          break;
        }
      }

      // Extract status
      let status = '';
      const statusKeywords = ['Active', 'Paused', 'Delayed', 'Broken', 'Syncing'];
      for (const keyword of statusKeywords) {
        if (text.includes(keyword)) {
          status = keyword;
          break;
        }
      }

      // Extract destination
      let destination = '';
      for (const span of spans) {
        const spanText = span.textContent.trim();
        if (spanText.includes('warehouse') || spanText.includes('bigquery') ||
            spanText.includes('snowflake') || spanText.includes('redshift') ||
            spanText.includes('databricks') || spanText.includes('terraform')) {
          destination = spanText;
          break;
        }
      }

      if (sourceType || connectionName) {
        connections.push({
          connectionName: connectionName || '',
          sourceType: sourceType || connectionName.replace('raw_', ''),
          destination: destination || '',
          status: status || 'Unknown'
        });
      }
    }

    return {
      page: 'connections-list',
      count: connections.length,
      connections
    };
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
    const knownConnectors = [
      'HubSpot', 'Salesforce', 'Stripe', 'Slack', 'GitHub', 'Jira',
      'PagerDuty', 'Tempo', 'incident.io', 'Recurly', 'LaunchDarkly',
      'Datadog', 'Marketo', 'Zendesk', 'Intercom', 'Asana', 'Shopify',
      'Google Analytics', 'Google Ads', 'Facebook Ads', 'LinkedIn Ads',
      'Snowflake', 'BigQuery', 'Redshift', 'PostgreSQL', 'MySQL',
      'MongoDB', 'NetSuite', 'QuickBooks', 'Xero', 'Braze',
      'Segment', 'Amplitude', 'Mixpanel', 'Twilio', 'SendGrid',
      'Zuora', 'Chargebee', 'Workday', 'ServiceNow', 'Confluence',
      'Bamboo HR', 'Greenhouse', 'Lever', 'Fivetran Platform',
      'Connector SDK', 'Google Sheets', 'Airtable', 'Monday.com',
      'Oracle', 'SAP', 'Dynamics 365', 'Freshdesk', 'Freshsales',
      'Pipedrive', 'Close', 'Outreach', 'SalesLoft', 'Gong',
      'Apollo', 'ZoomInfo', 'Clearbit', 'FullStory', 'Heap',
      'Adobe Analytics', 'Marketo', 'Pardot', 'Mailchimp',
      'Klaviyo', 'Brevo', 'ActiveCampaign', 'Customer.io'
    ];

    const pageText = document.body.innerText;
    const found = [];

    for (const connector of knownConnectors) {
      // Check if the connector name appears in the page text
      // Use word boundary-ish matching to avoid false positives
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
    }
    return true; // Keep message channel open for async response
  });

  // Also expose scan function globally for debugging
  window.__fivetranScanner = { scan, detectPage };

})();
