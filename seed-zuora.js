// seed-zuora.js
// Populates Supabase with Fivetran Zuora connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'zuora';

const connector = {
  id: CONNECTOR_ID,
  name: 'Zuora',
  category: 'billing',
  description: "Fivetran's Zuora connector syncs enterprise subscription management data via the Zuora API, covering accounts, subscriptions, rate plans, invoices, payments, and the full billing object hierarchy.",
  what_it_does: 'Syncs the Zuora object model including accounts, subscriptions, rate plans, rate plan charges, invoices, invoice items, payments, refunds, and amendments. Supports incremental sync via transaction changelog.',
  useful_for: 'Enterprise ARR/MRR reporting, complex pricing model analytics, revenue recognition (ASC 606), billing operations, and consolidating subscription data across multiple Zuora entities.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'SUBSCRIPTION',
    what_it_contains: 'Subscription records — status, term type (termed/evergreen), contract dates, auto-renew flag, version, account ID.',
    why_it_matters: 'Core table for subscription lifecycle, renewal tracking, and contract analysis.',
    key_callouts: 'status values: Draft, PendingActivation, Active, Cancelled, Suspended, Expired. Zuora versions subscriptions on each amendment — use version field to find the current state. term_type distinguishes termed contracts from evergreen.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ACCOUNT',
    what_it_contains: 'Customer accounts — name, currency, status, payment terms, billing cycle, parent account reference.',
    why_it_matters: 'Customer dimension for all billing data. Supports hierarchical account structures for enterprise customers.',
    key_callouts: 'parent_id enables parent-child account rollups. currency is the account default — all subscriptions under it bill in this currency unless overridden.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'INVOICE',
    what_it_contains: 'Invoice records — amount, balance, status (Draft/Posted/Canceled/Error), due date, target date, account reference.',
    why_it_matters: 'Accounts receivable, revenue reporting, and cash collection analytics.',
    key_callouts: 'Join to INVOICE_ITEM for line-level detail. balance field shows outstanding amount — useful for aging analysis. Posted invoices are the source of truth for recognized revenue.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PAYMENT',
    what_it_contains: 'Payment records — amount, status (Processed/Error/Voided), payment method, effective date, gateway response.',
    why_it_matters: 'Cash collection, payment failure analysis, and reconciliation with bank deposits.',
    key_callouts: 'A payment can be applied to multiple invoices via PAYMENT_APPLICATION. gateway_response_code on failures aids in decline analysis.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'RATE_PLAN',
    what_it_contains: 'Rate plans attached to subscriptions — product rate plan reference, amendment type, name.',
    why_it_matters: 'Links subscriptions to the product catalog and pricing structure. Essential for ARR decomposition by product.',
    key_callouts: 'Each RATE_PLAN has child RATE_PLAN_CHARGE rows, which in turn have RATE_PLAN_CHARGE_TIER rows. This three-level hierarchy (RatePlan > RatePlanCharge > RatePlanChargeTier) is the most common source of confusion in Zuora analytics.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Complex Object Model: RatePlan > RatePlanCharge > RatePlanChargeTier',
    issue_preview: 'Three-level pricing hierarchy confuses analysts building MRR models',
    root_cause: 'Zuora models pricing as a three-level hierarchy: a Subscription has RatePlans, each RatePlan has RatePlanCharges (the actual price), and each RatePlanCharge has RatePlanChargeTiers (volume/tiered pricing brackets). This is far more complex than flat billing platforms like Stripe or Chargebee.',
    impact: 'Analysts unfamiliar with Zuora build incorrect MRR queries by stopping at the RATE_PLAN level instead of drilling into RATE_PLAN_CHARGE. Tiered pricing is missed entirely if RATE_PLAN_CHARGE_TIER is not joined.',
    resolution: 'Educate the customer on the Zuora object model during onboarding. Recommend building a dbt staging model that flattens RatePlan > RatePlanCharge > RatePlanChargeTier into a single denormalized table with one row per charge component per subscription.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'ZOQL Query Limitations Affect Custom Report Migrations',
    issue_preview: 'Customers expect SQL-like flexibility but ZOQL has major restrictions',
    root_cause: "Zuora's query language (ZOQL) does not support JOINs, subqueries, or aggregations. Customers migrating from Zuora's built-in reporting to a warehouse often expect to replicate custom ZOQL reports but find the query patterns incompatible.",
    impact: 'During onboarding, customers ask why certain Zuora reports cannot be reproduced. The answer is that Fivetran syncs raw objects — the reporting logic must be rebuilt in SQL/dbt in the warehouse, which is actually more powerful but requires initial effort.',
    resolution: 'Position this as an advantage: Fivetran syncs the raw data and the warehouse supports full SQL with JOINs, aggregations, and window functions that ZOQL cannot do. Offer dbt model templates for common Zuora reporting patterns (MRR waterfall, ARR by product, aging).'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Amendment History Creates Multiple Subscription Versions',
    issue_preview: 'Subscription changes create new versions making point-in-time analysis tricky',
    root_cause: 'Every amendment (upgrade, downgrade, renewal, cancellation) in Zuora creates a new subscription version. The SUBSCRIPTION table contains all versions, not just the current one. The AMENDMENT table links versions together but requires careful joining.',
    impact: 'Counting subscriptions naively double- or triple-counts them. MRR queries that do not filter to the latest version per subscription overstate revenue.',
    resolution: 'Filter SUBSCRIPTION to version = (SELECT MAX(version) FROM subscription WHERE subscription_number = s.subscription_number) for current-state reporting. For change-over-time analysis, join AMENDMENT to track what changed between versions.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Multi-Entity Consolidation Requires Cross-Schema Unioning',
    issue_preview: 'Global enterprises with multiple Zuora entities need data from multiple connectors',
    root_cause: 'Zuora multi-entity deployments (e.g., separate legal entities per region) store data in isolated tenants. Each entity requires its own Fivetran connector and lands in a separate schema. There is no single-connector way to pull all entities.',
    impact: 'Global ARR reporting, consolidated financial statements, and cross-entity customer views require unioning data from multiple schemas — a non-trivial modeling effort.',
    resolution: 'Set up one Fivetran connector per Zuora entity. Build a dbt project that unions corresponding tables across entity schemas, adding an entity_id column. Use Zuora entity IDs to map to business units or legal entities in downstream reporting.'
  }
];

async function main() {
  console.log('Seeding Zuora connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Zuora');

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

  console.log('\nDone — Zuora: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
