// seed-quickbooks.js
// Populates Supabase with Fivetran QuickBooks Online connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'quickbooks';

const connector = {
  id: CONNECTOR_ID,
  name: 'QuickBooks Online',
  category: 'finance',
  description: "Fivetran's QuickBooks Online connector syncs accounting and financial data via the Intuit QuickBooks API. It provides customer, invoice, payment, expense, and general ledger data for financial reporting and ERP analytics.",
  what_it_does: 'Syncs customers, invoices, payments, bills, vendors, items, accounts (chart of accounts), journal entries, and purchase orders. Incremental sync using QuickBooks metadata timestamps.',
  useful_for: 'Financial reporting, revenue recognition, accounts receivable/payable analysis, cash flow tracking, and blending accounting data with CRM and billing platforms.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'INVOICE',
    what_it_contains: 'Invoice records — customer, amount, due date, balance, status, line items, terms.',
    why_it_matters: 'Core accounts receivable table — revenue recognition and outstanding balance tracking.',
    key_callouts: 'balance field shows remaining unpaid amount. Join to INVOICE_LINE for line-item detail.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PAYMENT',
    what_it_contains: 'Payment records — customer, amount, date, payment method, linked invoice.',
    why_it_matters: 'Cash collection tracking and payment reconciliation.',
    key_callouts: 'unapplied_amount tracks payments not yet matched to invoices.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CUSTOMER',
    what_it_contains: 'Customer records — name, email, phone, billing address, balance, active status.',
    why_it_matters: 'Customer dimension for AR aging and revenue analysis.',
    key_callouts: 'balance field is total outstanding across all invoices. sub_customer field indicates parent-child customer hierarchies.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'BILL',
    what_it_contains: 'Vendor bills — vendor, amount, due date, balance, terms, line items.',
    why_it_matters: 'Accounts payable tracking and vendor spend analysis.',
    key_callouts: 'Join to BILL_LINE for itemized expenses. balance field shows unpaid amount.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ACCOUNT',
    what_it_contains: 'Chart of accounts — name, type (Asset/Liability/Revenue/Expense), sub-type, balance.',
    why_it_matters: 'General ledger dimension for all financial transactions.',
    key_callouts: 'account_type and account_sub_type drive financial statement categorization (P&L vs Balance Sheet).'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'OAuth Token Expires and Requires Re-Authorization',
    issue_preview: 'Sync fails with auth error after token expiration',
    root_cause: 'QuickBooks OAuth 2.0 refresh tokens expire after 100 days of inactivity. If the connector is paused longer than 100 days, re-authorization is required.',
    impact: 'Sync stops completely. Data goes stale until re-auth.',
    resolution: 'Re-authorize the connection in Fivetran: Setup tab → Edit connection → Re-authorize. Avoid pausing the connector for extended periods. Keep sync active even at low frequency to keep tokens alive.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Multi-Company Requires Separate Connectors',
    issue_preview: 'Each QuickBooks company needs its own Fivetran connector',
    root_cause: 'QuickBooks Online treats each "company" as a separate entity with its own API access. Fivetran connects to one company per connector.',
    impact: 'Consolidated financial reporting across companies requires multiple connectors and UNION logic.',
    resolution: 'Create one Fivetran connector per QuickBooks company. Build dbt models that UNION ALL across company schemas with a company identifier column.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Deleted Transactions Not Always Captured',
    issue_preview: 'Voided or deleted invoices/payments may persist in warehouse',
    root_cause: 'QuickBooks soft-deletes some transaction types but hard-deletes others. The API does not consistently expose deletion events for all record types.',
    impact: 'Deleted or voided transactions may remain in the warehouse without _fivetran_deleted being set, inflating revenue or payment totals.',
    resolution: 'Filter on status fields (e.g., balance = 0 for paid invoices). Periodically compare warehouse record counts to QuickBooks reports for reconciliation.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Journal Entry Details Require Line-Item Join',
    issue_preview: 'JOURNAL_ENTRY table only has header info — debits and credits in line items',
    root_cause: 'QuickBooks stores journal entries as headers with line items containing the actual debit/credit entries. The main JOURNAL_ENTRY table has metadata only.',
    impact: 'GL-level reporting requires joining JOURNAL_ENTRY to JOURNAL_ENTRY_LINE for actual amounts and accounts.',
    resolution: 'Always join to the _LINE table for transaction details. Build a consolidated journal view that flattens header + lines for easier reporting.'
  }
];

async function main() {
  console.log('Seeding QuickBooks Online connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: QuickBooks Online');

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

  console.log('\nDone — QuickBooks Online: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
