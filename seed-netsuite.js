// seed-netsuite.js
// Populates Supabase with Fivetran NetSuite connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'netsuite';

const connector = {
  id: CONNECTOR_ID,
  name: 'NetSuite',
  category: 'erp',
  description: "Fivetran's NetSuite SuiteAnalytics connector syncs ERP data via SuiteAnalytics Connect. It provides financial, customer, inventory, and order data for enterprise analytics.",
  what_it_does: 'Syncs transactions, transaction lines, customers, vendors, items, accounts, journal entries, and custom records. Uses SuiteAnalytics Connect with Token-Based Authentication (TBA). Incremental sync using system timestamps.',
  useful_for: 'Enterprise financial reporting, order-to-cash analytics, inventory management, revenue recognition, consolidated reporting across subsidiaries, and blending ERP data with CRM.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TRANSACTION',
    what_it_contains: 'All NetSuite transactions — invoices, sales orders, purchase orders, journal entries, vendor bills, payments. Type field distinguishes.',
    why_it_matters: 'Unified table for all financial activity — foundation for every financial report.',
    key_callouts: 'type field: Invoice, SalesOrd, PurchOrd, Journal, VendBill, CashSale, etc. Join to TRANSACTION_LINE for line-item detail.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TRANSACTION_LINE',
    what_it_contains: 'Transaction line items — item, quantity, amount, account, department, class, location.',
    why_it_matters: 'Line-level detail for P&L reporting, cost of goods analysis, and dimensional reporting.',
    key_callouts: 'Join to TRANSACTION on transaction_id. department, class, and location are key segmentation dimensions in NetSuite.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CUSTOMER',
    what_it_contains: 'Customer records — name, email, subsidiary, category, currency, credit limit, balance.',
    why_it_matters: 'Customer dimension for revenue and AR analysis.',
    key_callouts: 'subsidiary field critical for multi-entity reporting. parent field enables customer hierarchy navigation.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ITEM',
    what_it_contains: 'Item/product records — name, type (inventory/service/kit), base price, cost, vendor.',
    why_it_matters: 'Product dimension for revenue by product and COGS analysis.',
    key_callouts: 'type field: InvtPart, NonInvtPart, Service, Kit, Assembly. Pricing tiers may be in separate PRICING table.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ACCOUNT',
    what_it_contains: 'Chart of accounts — number, name, type, parent account, subsidiary.',
    why_it_matters: 'GL account dimension for all financial reporting.',
    key_callouts: 'type field maps to financial statement section: Income, COGS, Expense, Asset, Liability, Equity.'
  }
];

const knownIssues = [
  // Billing and MAR
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'MAR Spikes on Composite Primary Key Tables',
    issue_preview: 'Unexpected MAR spikes when composite PK tables re-sync',
    root_cause: 'Tables with composite primary keys (e.g., TRANSACTION_LINES) can cause MAR spikes. When any row in a composite-key table changes, NetSuite may force a broader re-sync of related rows, inflating MAR counts beyond the actual number of changed records.',
    impact: 'Unexpected billing increases. Customer sees MAR spike and questions Fivetran usage.',
    resolution: 'Explain that composite PK tables (like TRANSACTION_LINES) can cause wider re-syncs than expected. Check the fivetran_index column to understand which rows were re-synced. If MAR is a concern, review sync frequency and which tables are enabled.'
  },
  // Data Integrity
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Records Missing From TRANSACTION_LINES Table',
    issue_preview: 'Transaction line items not appearing in the destination',
    root_cause: 'TRANSACTION_LINES can have missing records if the SuiteAnalytics user lacks permissions on certain transaction types, or if the records were created during a sync window gap. Also, some transaction types may not expose line items through SuiteAnalytics Connect.',
    impact: 'Financial reports show incomplete line-level data. Revenue and COGS calculations may be off.',
    resolution: 'Verify the integration role has access to all transaction types. Check if missing records belong to restricted subsidiaries or transaction types. A re-sync of the TRANSACTION_LINES table may recover missing records. See Fivetran troubleshooting docs for specifics.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Tables, Columns, or Records Missing From Destination',
    issue_preview: 'Expected NetSuite data not appearing in the warehouse',
    root_cause: 'Multiple causes: (1) The table is not enabled in Fivetran Schema tab. (2) The SuiteAnalytics role doesn\'t have permission to access that table. (3) Custom records/fields need explicit selection. (4) Some tables are only available with NetSuite Analytics Warehouse add-on.',
    impact: 'Critical business data missing from warehouse. Reports and dashboards incomplete.',
    resolution: 'Check Fivetran Schema tab — is the table checked? Verify the SuiteAnalytics role permissions in NetSuite. For custom records, ensure they\'re exposed via SuiteAnalytics. Some tables require the NetSuite Analytics Warehouse module — confirm with customer\'s NetSuite admin.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Unmodified Records Re-Syncing Unexpectedly',
    issue_preview: 'Records that haven\'t changed are syncing again',
    root_cause: 'NetSuite\'s system-modified timestamp can update even when no user-visible data changes — for example, when background processes, workflows, or scheduled scripts touch records. This causes Fivetran to detect them as "changed" and re-sync.',
    impact: 'Higher MAR than expected. Syncs take longer than necessary.',
    resolution: 'This is expected NetSuite behavior — background processes update system timestamps. Monitor MAR trends. If specific tables are problematic, check if NetSuite workflows or scheduled scripts are touching records unnecessarily.'
  },
  // Errors
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Error: Cannot Retrieve Metadata',
    issue_preview: 'Connector fails to read table/column definitions from NetSuite',
    root_cause: 'The SuiteAnalytics Connect user doesn\'t have sufficient permissions to read metadata for the requested tables, or SuiteAnalytics Connect is not enabled on the NetSuite account.',
    impact: 'Sync cannot start — Fivetran cannot discover the schema.',
    resolution: 'Verify SuiteAnalytics Connect is enabled (Setup → Company → Enable Features → SuiteCloud → SuiteAnalytics Connect). Ensure the integration role has the "Connect Using SuiteAnalytics Connect" permission. Re-authorize the connection after fixing permissions.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Error: Failed to Log In Using TBA',
    issue_preview: 'Token-Based Authentication login fails during sync',
    root_cause: 'Token-Based Authentication (TBA) credentials are invalid, expired, or the integration record/role was modified in NetSuite. Common causes: token was revoked, role permissions changed, or the integration record was disabled.',
    impact: 'All syncs stop until authentication is restored.',
    resolution: 'In NetSuite: verify the Integration Record is enabled (Setup → Integration → Manage Integrations). Check that the token hasn\'t been revoked (Setup → Users/Roles → Access Tokens). Generate a new token if needed and update it in Fivetran connection settings.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Error: You Do Not Have Permission to Use SuiteAnalytics',
    issue_preview: 'Permission error blocks the connector entirely',
    root_cause: 'The NetSuite role assigned to the Fivetran integration user does not have the "SuiteAnalytics Connect" permission, or the SuiteAnalytics Connect feature is not enabled on the account.',
    impact: 'Connector cannot authenticate at all — zero data flows.',
    resolution: 'NetSuite admin must: (1) Enable SuiteAnalytics Connect feature at Setup → Company → Enable Features → SuiteCloud tab. (2) Add the "SuiteAnalytics Connect" permission to the integration role at Setup → Users/Roles → Manage Roles → edit the role → Permissions → Setup tab.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Error: Disk Cache Error — Field Length Exceeds Maximum Limit',
    issue_preview: 'Sync fails on tables with very large text fields (4M+ characters)',
    root_cause: 'A NetSuite field contains data that exceeds the 65,535 character limit that SuiteAnalytics Connect can handle. This typically happens with large memo fields, HTML content fields, or custom fields storing very long text.',
    impact: 'The affected table fails to sync entirely.',
    resolution: 'Identify which field is causing the issue (Fivetran logs will show the field). If the data isn\'t needed, exclude the column in Fivetran Schema tab (column hashing/blocking). If needed, the customer must truncate or clean the data in NetSuite. Contact Fivetran support for help identifying the specific field.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Warning: Table Is Not Incremental and Syncs Slowly',
    issue_preview: 'Non-incremental tables cause full re-sync every cycle',
    root_cause: 'Some NetSuite tables don\'t have a reliable timestamp column for incremental syncing. Fivetran must do a full table scan on each sync. Common with lookup/reference tables and some custom record types.',
    impact: 'Slow syncs and higher MAR for affected tables. Large non-incremental tables can significantly delay overall sync completion.',
    resolution: 'This is expected for certain table types. If the table is small, the impact is minimal. For large non-incremental tables, consider reducing sync frequency. Check if enabling a system notes or timestamp field on the custom record in NetSuite can enable incremental syncing.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Tables Missing From Schema Config',
    issue_preview: 'Expected NetSuite tables don\'t appear in Fivetran schema picker',
    root_cause: 'Tables only appear in Fivetran\'s schema config if the integration role has permission to access them via SuiteAnalytics Connect. Custom record types must also be configured to be accessible through SuiteAnalytics.',
    impact: 'Cannot enable or sync data that should be available.',
    resolution: 'Verify the role permissions in NetSuite cover the missing tables. For custom records: go to Customization → Lists, Records & Fields → Record Types → edit → check "Allow SuiteAnalytics Connect Access." Re-sync the schema in Fivetran after permission changes.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Sync Is Slow or Delayed',
    issue_preview: 'NetSuite syncs taking much longer than expected',
    root_cause: 'Multiple factors: (1) Large non-incremental tables requiring full scans. (2) SuiteAnalytics Connect concurrency limits. (3) Too many tables enabled. (4) NetSuite server performance during peak hours.',
    impact: 'Data freshness degrades. Syncs may overlap or queue up.',
    resolution: 'Disable tables that aren\'t needed. Schedule syncs during NetSuite off-peak hours. Check which tables are non-incremental (shown with warning icon) — those are the biggest bottleneck. Reduce sync frequency for non-critical tables. Contact Fivetran support if syncs consistently exceed expectations.'
  },
  // FAQ
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Formula Fields Not Supported',
    issue_preview: 'NetSuite formula/calculated fields don\'t sync',
    root_cause: 'NetSuite formula fields (calculated fields in Saved Searches) are computed server-side and not exposed through SuiteAnalytics Connect. Only stored field values are available for syncing.',
    impact: 'Analysts expecting formula field values in the warehouse will find them missing.',
    resolution: 'Recreate formula logic in SQL/dbt in the warehouse using the underlying source fields. Build dbt models that replicate the NetSuite formula calculations.'
  }
];

async function main() {
  console.log('Seeding NetSuite connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: NetSuite');

  await supabase.from('connector_tables').delete().eq('connector_id', CONNECTOR_ID);
  await supabase.from('connector_known_issues').delete().eq('connector_id', CONNECTOR_ID);

  for (const t of connectorTables) {
    const { error } = await supabase.from('connector_tables').insert({ ...t, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (error) console.error(`Error: ${t.table_name}`, error);
    else console.log(`  Table: ${t.table_name}`);
  }

  for (const i of knownIssues) {
    const { error } = await supabase.from('connector_known_issues').insert({ ...i, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (error) console.error(`Error: ${i.issue_title}`, error);
    else console.log(`  Issue: ${i.issue_title}`);
  }

  console.log('\nDone — NetSuite: 5 tables, 12 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
