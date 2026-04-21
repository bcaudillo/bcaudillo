// seed-recurly.js
// Populates Supabase with Fivetran Recurly connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'recurly';

const connector = {
  id: CONNECTOR_ID,
  name: 'Recurly',
  category: 'billing',
  description: "Fivetran's Recurly connector syncs subscription billing data from Recurly's API, providing accounts, subscriptions, invoices, transactions, and plan data for revenue and churn analytics.",
  what_it_does: 'Syncs accounts, subscriptions, invoices, transactions, plans, add-ons, coupons, and credit payments. Uses incremental sync based on updated_at timestamps.',
  useful_for: 'MRR/ARR reporting, churn and retention analysis, dunning performance tracking, revenue recognition, and blending billing data with product usage and CRM systems.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'SUBSCRIPTION',
    what_it_contains: 'Subscription records — state, plan code, quantity, MRR, currency, trial dates, current period start/end, canceled_at.',
    why_it_matters: 'Core table for MRR, churn rate, trial conversion, and subscription lifecycle analysis.',
    key_callouts: 'state field values: active, canceled, expired, future, paused. unit_amount is per-unit price; multiply by quantity for total recurring amount. Currency is per-subscription — normalize before aggregating.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ACCOUNT',
    what_it_contains: 'Customer account records — email, company, billing info reference, account code, state, first/last name.',
    why_it_matters: 'Customer dimension for joining subscriptions, invoices, and transactions. One account can have multiple subscriptions.',
    key_callouts: 'account_code is the merchant-assigned external ID — use it to join to CRM or product data. state can be active or closed.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'INVOICE',
    what_it_contains: 'Invoice records — total, subtotal, tax, discount, state (pending/paid/failed/past_due), due date, line items.',
    why_it_matters: 'Revenue recognition, accounts receivable, and cash collection reporting.',
    key_callouts: 'Recurly separates charge invoices from credit invoices (type field). Join to LINE_ITEM for itemized breakdown. state=past_due is key for dunning analysis.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TRANSACTION',
    what_it_contains: 'Payment transactions — amount, currency, status (success/declined/error/void), payment method, gateway reference.',
    why_it_matters: 'Payment success rate, decline analysis, and reconciliation with payment gateways.',
    key_callouts: 'A single invoice can have multiple transactions (e.g., initial decline then retry success). payment_method.card_type and gateway fields are useful for decline-rate-by-gateway analysis.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PLAN',
    what_it_contains: 'Plan/pricing catalog — name, code, interval (monthly/yearly), unit_amount, currency, state.',
    why_it_matters: 'Dimension table for subscription segmentation by plan tier and pricing.',
    key_callouts: 'Plans can have multiple currencies via PLAN_PRICING. Add-ons are separate in the ADD_ON table and must be joined for full recurring revenue per subscription.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'MRR Calculation Breaks Across Multiple Currencies',
    issue_preview: 'Aggregating MRR without currency normalization produces wrong totals',
    root_cause: 'Recurly supports multi-currency pricing. Each subscription stores unit_amount in its own currency. There is no base-currency MRR field provided by Recurly.',
    impact: 'Finance teams summing unit_amount * quantity across all subscriptions get inflated or nonsensical MRR when mixing USD, EUR, GBP, etc.',
    resolution: 'Build a currency normalization layer in dbt using an exchange rate table. Filter aggregations by currency_code or convert to a single reporting currency before summing.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Dunning Retry Logic Creates Complex Transaction Chains',
    issue_preview: 'Multiple failed transactions per invoice make payment analytics unintuitive',
    root_cause: "Recurly's dunning management retries failed payments on a configurable schedule. Each retry creates a new TRANSACTION row linked to the same invoice. The retry count, timing, and outcome are spread across multiple rows rather than a single dunning record.",
    impact: 'Counting transactions naively inflates payment volume. Identifying "final outcome" for an invoice requires finding the last transaction by created_at, not just filtering by status=success.',
    resolution: 'Use a window function (ROW_NUMBER partitioned by invoice_id, ordered by created_at DESC) to isolate the final transaction per invoice. Build a dunning summary model that tracks attempts per invoice and final resolution.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Revenue Recognition Requires Manual Period Allocation',
    issue_preview: 'Invoice totals do not map cleanly to accounting periods',
    root_cause: 'Recurly invoices can cover multi-month periods (e.g., annual plans billed upfront). The invoice total reflects the full charge, but revenue recognition requires spreading it across the service period. Recurly does not provide a pre-built deferred revenue schedule in the API.',
    impact: 'Using invoice.total as recognized revenue overstates the current period and understates future periods. This is a common audit finding.',
    resolution: 'Use subscription current_period_start and current_period_end with invoice line items to build a revenue recognition schedule in dbt. For ASC 606 compliance, allocate invoice amounts evenly across the service period.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Webhook-Driven Events May Differ from API-Synced State',
    issue_preview: 'Real-time webhook data and batch API sync can show different subscription states',
    root_cause: "Fivetran syncs Recurly data via the REST API on a schedule, capturing the current state at sync time. Customers who also consume Recurly webhooks for real-time events may see timing discrepancies — a webhook fires immediately on state change, but the Fivetran sync won't reflect it until the next sync cycle.",
    impact: 'Dashboards combining webhook event streams with Fivetran-synced dimension tables can show contradictory states (e.g., webhook says canceled but Fivetran still shows active until next sync).',
    resolution: 'Use Fivetran-synced data as the source of truth for reporting and webhooks only for real-time alerting. Avoid joining webhook event logs directly to Fivetran tables without accounting for sync lag. Reduce sync frequency if near-real-time accuracy is required.'
  }
];

async function main() {
  console.log('Seeding Recurly connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Recurly');

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

  console.log('\nDone — Recurly: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
