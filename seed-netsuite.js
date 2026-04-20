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
  description: "Fivetran's NetSuite connector syncs ERP data using NetSuite SuiteAnalytics Connect (ODBC) or the SuiteQL API. It provides financial, customer, inventory, and order data for enterprise analytics.",
  what_it_does: 'Syncs transactions, customers, vendors, items, accounts, journal entries, and custom records. Supports both SuiteAnalytics Connect and RESTlet-based approaches. Incremental sync using system timestamps.',
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
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Complex Setup — Requires SuiteAnalytics or RESTlet Configuration',
    issue_preview: 'NetSuite connector setup is more involved than most connectors',
    root_cause: 'NetSuite requires either SuiteAnalytics Connect (ODBC) credentials or a SuiteScript RESTlet deployment. Both require specific roles and permissions in NetSuite that only administrators can configure.',
    impact: 'Setup time is significantly longer than SaaS connectors. Requires NetSuite admin involvement.',
    resolution: 'Engage the customer\'s NetSuite administrator early. Follow Fivetran\'s NetSuite setup guide step-by-step. The Fivetran role bundle simplifies permission setup — install it from Fivetran\'s instructions.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Custom Records and Fields Require Explicit Selection',
    issue_preview: 'Custom record types not automatically synced',
    root_cause: 'NetSuite supports custom record types and custom fields that are unique per account. These must be explicitly enabled in the Fivetran schema configuration.',
    impact: 'Critical business data stored in custom records (e.g., custom project tracking tables) will be missing unless explicitly enabled.',
    resolution: 'Review the customer\'s custom record types with their NetSuite admin. Enable them in Fivetran Schema tab. Custom fields on standard records also need schema verification.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Multi-Subsidiary Data Requires Careful Filtering',
    issue_preview: 'Consolidated reports may double-count inter-company transactions',
    root_cause: 'Multi-subsidiary NetSuite accounts have inter-company transactions (elimination entries). If not filtered, consolidated P&L and balance sheet reports double-count.',
    impact: 'Financial reports show inflated revenue and expenses from inter-company activity.',
    resolution: 'Filter elimination journal entries by transaction type. Use subsidiary field on TRANSACTION_LINE for subsidiary-level reporting. Build consolidated models that exclude inter-company accounts.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Initial Sync Can Take Days for Large Accounts',
    issue_preview: 'Years of transaction history creates massive initial load',
    root_cause: 'Enterprise NetSuite accounts may have 10+ years of transaction history with millions of transaction lines. SuiteAnalytics Connect has query timeouts and concurrency limits.',
    impact: 'Initial sync can take 3–7 days for large accounts. Production NetSuite performance may degrade during initial sync if not managed.',
    resolution: 'Schedule initial sync during off-peak hours. Consider using the historical sync time frame setting to limit initial load depth. Inform customer that production impact is minimal but non-zero.'
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

  console.log('\nDone — NetSuite: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
