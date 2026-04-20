// seed-chargebee.js
// Populates Supabase with Fivetran Chargebee connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'chargebee';

const connector = {
  id: CONNECTOR_ID,
  name: 'Chargebee',
  category: 'billing',
  description: "Fivetran's Chargebee connector syncs subscription billing and revenue data via the Chargebee API. It provides customer, subscription, invoice, and payment data for SaaS revenue analytics.",
  what_it_does: 'Syncs customers, subscriptions, invoices, payments, credit notes, plans, addons, and coupons. Incremental sync using updated_at timestamps.',
  useful_for: 'MRR/ARR tracking, churn analysis, subscription lifecycle reporting, revenue recognition, dunning analytics, and blending billing data with CRM and product usage.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'SUBSCRIPTION',
    what_it_contains: 'Subscription records — status, plan, MRR, trial dates, billing cycle, cancel date, customer ID.',
    why_it_matters: 'Core table for MRR, ARR, churn, and subscription lifecycle analytics.',
    key_callouts: 'status field: active, cancelled, in_trial, paused, non_renewing. mrr field pre-calculated by Chargebee — verify currency normalization.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'INVOICE',
    what_it_contains: 'Invoice records — amount, status (paid/unpaid/voided), due date, line items, customer.',
    why_it_matters: 'Revenue recognition and accounts receivable reporting.',
    key_callouts: 'amount_due vs amount_paid tracks partial payments. Join to INVOICE_LINE_ITEM for itemized breakdown.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CUSTOMER',
    what_it_contains: 'Customer records — email, company, billing address, VAT number, auto-collection status.',
    why_it_matters: 'Customer dimension linking subscriptions, invoices, and payments.',
    key_callouts: 'auto_collection = OFF means manual invoicing — relevant for dunning analysis.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PAYMENT_TRANSACTION',
    what_it_contains: 'Payment records — amount, currency, status (success/failure/voided), payment method, gateway.',
    why_it_matters: 'Payment success rates, failed payment analysis, and cash collection tracking.',
    key_callouts: 'error_code and error_text on failed transactions useful for dunning root cause analysis.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CREDIT_NOTE',
    what_it_contains: 'Credit notes — amount, reason, linked invoice, status.',
    why_it_matters: 'Refund and credit tracking for accurate net revenue calculations.',
    key_callouts: 'Deduct credit note amounts from invoice totals for net revenue. reason_code indicates why credit was issued.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'MRR Calculations Require Currency Normalization',
    issue_preview: 'Multi-currency subscriptions inflate or distort MRR totals',
    root_cause: 'Chargebee supports multi-currency subscriptions. The mrr field on SUBSCRIPTION is in the subscription\'s currency, not a normalized base currency.',
    impact: 'Summing MRR across all subscriptions without currency conversion produces incorrect totals for multi-currency accounts.',
    resolution: 'Always filter by currency_code or apply exchange rate conversion before aggregating MRR. Build a currency normalization model in dbt for cross-currency reporting.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Subscription Events Table Not Available in All Plans',
    issue_preview: 'Cannot track subscription change history without Events',
    root_cause: 'The SUBSCRIPTION_ENTITLEMENT and event history tables require specific Chargebee plan tiers. Lower-tier accounts may not have event streaming enabled.',
    impact: 'Cannot analyze what caused subscription changes (upgrade, downgrade, cancellation) without event data.',
    resolution: 'Enable Chargebee Events in account settings if on a supported plan. For lower tiers, use subscription updated_at timestamps and current state to infer changes.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Addons and Coupons Complicate MRR Calculation',
    issue_preview: 'Simple subscription MRR understates or overstates revenue',
    root_cause: 'Chargebee subscriptions can have addons (additional charges) and coupons (discounts) that modify the base plan price. The mrr field may or may not include these depending on configuration.',
    impact: 'MRR calculations from SUBSCRIPTION.mrr alone may be inaccurate. True MRR requires accounting for addons and discounts.',
    resolution: 'Use SUBSCRIPTION_ADDON and COUPON tables to adjust base MRR. Alternatively, calculate MRR from INVOICE line items for the most accurate revenue picture.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Site (Multi-Instance) Data Requires Separate Connectors',
    issue_preview: 'Multiple Chargebee sites need multiple Fivetran connectors',
    root_cause: 'Chargebee uses "sites" as separate instances (e.g., one per region or product line). Each site has its own API key and data — Fivetran cannot aggregate across sites in one connector.',
    impact: 'Global revenue reporting requires unioning data from multiple connector schemas.',
    resolution: 'Create one Fivetran connector per Chargebee site. Build a UNION ALL model in dbt to combine data across sites, adding a site identifier column for filtering.'
  }
];

async function main() {
  console.log('Seeding Chargebee connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Chargebee');

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

  console.log('\nDone — Chargebee: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
