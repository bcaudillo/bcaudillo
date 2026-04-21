// seed-recharge.js
// Populates Supabase with Fivetran Recharge connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'recharge';

const connector = {
  id: CONNECTOR_ID,
  name: 'Recharge',
  category: 'billing',
  description: "Fivetran's Recharge connector syncs subscription billing data from the Recharge API, focused on e-commerce subscription management with deep Shopify integration.",
  what_it_does: 'Syncs subscriptions, customers, orders, charges, products, discounts, and one-time purchases. Provides the subscription layer that sits on top of Shopify for recurring e-commerce revenue.',
  useful_for: 'Subscription box analytics, recurring revenue tracking for DTC brands, churn and retention analysis, Shopify-to-Recharge data unification, and LTV modeling for subscription e-commerce.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'SUBSCRIPTION',
    what_it_contains: 'Subscription records — status, product, quantity, frequency, next charge date, price, Shopify variant ID, customer ID.',
    why_it_matters: 'Core table for active subscriber counts, subscription frequency analysis, and MRR for e-commerce.',
    key_callouts: 'status values: ACTIVE, CANCELLED, EXPIRED. order_interval_unit (day/week/month) and order_interval_frequency define the billing cadence. shopify_variant_id links back to the Shopify product catalog.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CUSTOMER',
    what_it_contains: 'Customer records — email, Shopify customer ID, billing/shipping address, first charge date, subscription count.',
    why_it_matters: 'Customer dimension linking Recharge subscriptions to Shopify customer profiles. Essential for LTV analysis.',
    key_callouts: 'shopify_customer_id is the key join field to Shopify data. first_charge_processed_at is useful for cohort analysis.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ORDER',
    what_it_contains: 'Fulfilled subscription orders — total price, line items, Shopify order ID, status, processed date, shipping address.',
    why_it_matters: 'Links Recharge subscription charges to actual Shopify fulfillment orders. Revenue and fulfillment reporting.',
    key_callouts: 'shopify_order_id connects to the Shopify ORDER table. One Recharge order corresponds to one Shopify order. status tracks fulfillment state.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CHARGE',
    what_it_contains: 'Billing charge attempts — total price, status (SUCCESS/QUEUED/SKIPPED/ERROR/REFUNDED), payment processor, retry date.',
    why_it_matters: 'Payment analytics, failed charge tracking, and actual collected revenue vs. expected revenue.',
    key_callouts: 'A charge can fail and be retried (status=ERROR then status=QUEUED on retry). High-volume stores generate millions of charge rows — watch MAR consumption.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PRODUCT',
    what_it_contains: 'Recharge product configuration — Shopify product ID, subscription defaults, discount amount, charge interval.',
    why_it_matters: 'Maps which Shopify products have subscription options enabled and their default subscription terms.',
    key_callouts: 'shopify_product_id links to Shopify PRODUCT. discount_amount and discount_type show the subscribe-and-save discount compared to one-time purchase.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Shopify Order ID Linkage Can Break on Migrated Stores',
    issue_preview: 'shopify_order_id is null or mismatched after Shopify store migrations',
    root_cause: 'When merchants migrate between Shopify stores or re-platform, historical Recharge orders may retain shopify_order_id values that reference the old Shopify store. New orders get correct IDs, but historical data cannot be joined to the new Shopify instance.',
    impact: 'JOINs between Recharge ORDER and Shopify ORDER return nulls for historical data. Revenue reconciliation between the two systems shows discrepancies for pre-migration periods.',
    resolution: 'For migrated stores, use the Recharge ORDER table as the source of truth for historical subscription revenue. Only join to Shopify for post-migration orders. Add a migration_date filter to dashboards and document the cutover date.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Subscription Swaps vs. Cancellations Are Hard to Distinguish',
    issue_preview: 'Product swaps look like cancel-and-resubscribe in the data',
    root_cause: "When a customer swaps their subscription product (e.g., changes coffee flavor), Recharge can handle it as either an in-place update or a cancel-and-create. The approach depends on the merchant's Recharge configuration and API version. In the cancel-and-create case, the SUBSCRIPTION table shows a cancellation and a new subscription with no explicit link between them.",
    impact: 'Churn analysis overstates cancellations because product swaps are counted as churn events. Active subscriber counts may double-count during the swap window.',
    resolution: 'Look for subscriptions cancelled and created for the same customer_id within a short time window (e.g., same day) with different shopify_variant_id values. Build a dbt model that flags these as swaps rather than true churn. Check the cancelled_at and created_at timestamps on paired records.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'High Charge Volume Drives Up MAR for Large Stores',
    issue_preview: 'CHARGE table row counts consume disproportionate MAR',
    root_cause: 'The CHARGE table creates one row per billing attempt per subscription per cycle. For stores with tens of thousands of active subscriptions billing weekly or monthly, the CHARGE table grows rapidly. Failed charges that are retried add additional rows.',
    impact: 'MAR (Monthly Active Rows) costs can be significantly higher than expected. Customers get surprised by billing when the CHARGE table dominates their Fivetran usage.',
    resolution: 'Set expectations during the sales cycle by estimating CHARGE volume: active_subscriptions * billing_cycles_per_month * (1 + avg_retry_rate). Consider excluding historical charges beyond a rolling window if only recent data is needed. Use Fivetran usage alerts to monitor MAR.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'API v1 vs. v2021-11 Schema Differences',
    issue_preview: 'Field names and structures differ depending on which Recharge API version the connector uses',
    root_cause: 'Recharge released API v2021-11 with breaking changes from the legacy v1 API. Field names, nesting structures, and available endpoints differ between versions. The Fivetran connector version determines which API it calls, and customers upgrading mid-stream may see schema changes.',
    impact: 'dbt models and dashboards built on v1 field names break after a connector upgrade to the v2021-11 API. Column names like shopify_product_id may move or be renamed, breaking existing JOINs.',
    resolution: 'Check which API version the Fivetran connector is using before building models. If an upgrade is planned, audit existing SQL for deprecated field references. Fivetran docs list the schema for each API version — compare schemas side-by-side before upgrading.'
  }
];

async function main() {
  console.log('Seeding Recharge connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Recharge');

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

  console.log('\nDone — Recharge: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
