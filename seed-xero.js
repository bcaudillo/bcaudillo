// seed-xero.js
// Populates Supabase with Fivetran Xero connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'xero';

const connector = {
  id: CONNECTOR_ID,
  name: 'Xero',
  category: 'finance',
  description: "Fivetran's Xero connector syncs accounting data via the Xero API. It provides invoice, payment, contact, and general ledger data for financial reporting and bookkeeping analytics.",
  what_it_does: 'Syncs invoices, payments, contacts, accounts (chart of accounts), bank transactions, journal entries, and manual journals. Incremental sync using Xero\'s modified_since parameter.',
  useful_for: 'SMB financial reporting, accounts receivable/payable analysis, cash flow tracking, bank reconciliation analytics, and blending accounting data with CRM and billing platforms.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'INVOICE',
    what_it_contains: 'Invoice and bill records — contact, amount, due date, status (DRAFT/SUBMITTED/AUTHORISED/PAID), line items.',
    why_it_matters: 'Core table for AR and AP reporting. Type field distinguishes sales invoices (ACCREC) from vendor bills (ACCPAY).',
    key_callouts: 'type = ACCREC is sales invoice, ACCPAY is vendor bill. amount_due vs amount_paid tracks partial payments.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PAYMENT',
    what_it_contains: 'Payment records — amount, date, account, linked invoice, payment type.',
    why_it_matters: 'Cash collection and disbursement tracking.',
    key_callouts: 'Join to INVOICE via invoice_id. is_reconciled field indicates bank reconciliation status.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CONTACT',
    what_it_contains: 'Customer and vendor records — name, email, phone, addresses, tax number, outstanding balance.',
    why_it_matters: 'Contact dimension for all invoices and payments.',
    key_callouts: 'is_customer and is_supplier booleans indicate contact type. balances field contains outstanding AR/AP amounts.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'BANK_TRANSACTION',
    what_it_contains: 'Bank feed transactions — amount, date, account, contact, line items, reconciliation status.',
    why_it_matters: 'Bank reconciliation and cash flow analysis.',
    key_callouts: 'type field: RECEIVE (money in) vs SPEND (money out). is_reconciled tracks reconciliation status.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ACCOUNT',
    what_it_contains: 'Chart of accounts — code, name, type (REVENUE/EXPENSE/ASSET/LIABILITY/EQUITY), tax type.',
    why_it_matters: 'GL account dimension for all financial reporting.',
    key_callouts: 'type field maps to financial statement sections. enable_payments_to_account indicates bank accounts.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'API Rate Limits — 60 Calls Per Minute',
    issue_preview: 'Strict rate limits slow syncs for accounts with many transactions',
    root_cause: 'Xero enforces a strict 60-call-per-minute rate limit per OAuth connection. Each table requires multiple paginated API calls.',
    impact: 'Syncs are slow compared to other accounting connectors. Large accounts with deep history may take hours per sync.',
    resolution: 'Expected behavior given Xero API constraints. Reduce sync frequency if data freshness is not critical. Initial historical sync can take 24+ hours for large accounts.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Multi-Org Requires Separate Connectors',
    issue_preview: 'Each Xero organization needs its own Fivetran connector',
    root_cause: 'Xero treats each organization as a separate entity. OAuth tokens are scoped to a single org.',
    impact: 'Businesses with multiple Xero orgs (e.g., per country or entity) need multiple connectors and consolidated reporting logic.',
    resolution: 'Create one connector per Xero organization. Build UNION ALL models in dbt with an organization identifier column for consolidated reporting.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'OAuth Token Disconnects After 60 Days',
    issue_preview: 'Connection drops if not refreshed within 60 days',
    root_cause: 'Xero OAuth 2.0 tokens must be refreshed within 60 days. If the connector is paused or disconnected for longer, re-authorization is required.',
    impact: 'Sync stops. All data goes stale until re-auth.',
    resolution: 'Keep the connector active. If pausing, do so for less than 60 days. Re-authorize in Fivetran: Setup tab → Edit connection → Re-authorize.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Archived Contacts and Invoices Still Synced',
    issue_preview: 'Archived records appear in warehouse alongside active ones',
    root_cause: 'Xero\'s API returns archived contacts and voided invoices. Fivetran syncs all records regardless of archive status.',
    impact: 'Reports may include stale or voided records unless filtered.',
    resolution: 'Filter on status fields: INVOICE.status != VOIDED, CONTACT.contact_status = ACTIVE. Build filtered views for clean reporting.'
  }
];

async function main() {
  console.log('Seeding Xero connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Xero');

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

  console.log('\nDone — Xero: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
