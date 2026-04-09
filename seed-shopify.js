// seed-shopify.js
// Populates Supabase with the Fivetran Shopify connector data.
// Source: https://fivetran.com/docs/connectors/applications/shopify
//         https://fivetran.com/docs/connectors/applications/shopify/troubleshooting
//
// Idempotent: upserts the connector row, deletes existing shopify child rows,
// then inserts fresh data. Re-running does not create duplicates.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_ID = 'shopify';

// ─── CONNECTOR RECORD ────────────────────────────────────────────────────────

const connector = {
  id: CONNECTOR_ID,
  name: 'Shopify',
  category: 'ecommerce',
  description: "Fivetran's Shopify connector is a fully managed integration that extracts a deep level of ecommerce data from Shopify and replicates it into your destination warehouse or data lake in an easy-to-navigate schema.",
  what_it_does: 'Syncs the full Shopify data model including orders, customers, products, checkouts, fulfillments, returns, payouts, metafields, and web pixels events. Supports Shopify Plus features like gift cards and users.',
  useful_for: 'Ecommerce analytics, revenue reporting, customer LTV analysis, inventory and fulfillment tracking, and building unified commerce dashboards across Shopify stores.'
};

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────
// Shopify's schema is large. These are the tables explicitly called out in
// Fivetran's docs as notable / high-signal for sales conversations.

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ORDER',
    what_it_contains: 'All Shopify orders — totals, currency, status, customer reference, financial/fulfillment state, timestamps.',
    why_it_matters: 'Core revenue table. Drives GMV, AOV, refund rate, and almost every ecommerce KPI.',
    key_callouts: 'Child tables: ORDER_LINE_ITEM, ORDER_SHIPPING_LINE, ORDER_REFUND. Join through order_id.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ORDER_SHIPPING_LINE',
    what_it_contains: 'Per-order shipping line items — shipping method, carrier, price, tax.',
    why_it_matters: 'Required to calculate true net revenue and shipping margins.',
    key_callouts: 'One row per shipping line per order. Join to ORDER via order_id.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PRODUCT',
    what_it_contains: 'Product catalog — title, vendor, product_type, tags, status, timestamps.',
    why_it_matters: 'Foundation for merchandising analytics and inventory reporting.',
    key_callouts: 'Variants live in PRODUCT_VARIANT. Inventory details in INVENTORY_LEVEL / INVENTORY_ITEM.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CUSTOMER',
    what_it_contains: 'Customer records — email, name, total_spent, orders_count, marketing opt-in, timestamps.',
    why_it_matters: 'LTV, repeat-purchase rate, and segmentation analytics.',
    key_callouts: 'CUSTOMER_VISIT tracks individual visit sessions for attribution.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CHECKOUT_EVENT',
    what_it_contains: 'Standard Shopify web pixels checkout events — event_name, timestamp, checkout_id, client details.',
    why_it_matters: 'Funnel analysis (cart → checkout → purchase). Enables conversion rate and abandonment reporting.',
    key_callouts: 'Requires web pixels to be enabled. Has child tables for line items, shipping, and client data.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'METAFIELD',
    what_it_contains: "Custom metadata attached to Shopify resources (products, customers, orders, collections, etc.).",
    why_it_matters: 'Stores merchant-specific fields not in the standard schema — critical for custom attributes, localization, or B2B pricing.',
    key_callouts: 'You must explicitly enable the METAFIELD table to sync it. Resource-specific variants like CUSTOMER_METAFIELD and COLLECTION_METAFIELD also exist.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'RETURN',
    what_it_contains: 'Return requests — status, order reference, reason, timestamps.',
    why_it_matters: 'Refund rate, reverse-logistics analytics, and net revenue calculations.',
    key_callouts: 'Child tables: RETURN_LINE_ITEM (items returned) and RETURN_SHIPPING_FEE (return shipping charges).'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PAYOUT',
    what_it_contains: 'Shopify Payments payouts to the merchant bank account — amount, currency, status, transaction references.',
    why_it_matters: 'Finance reconciliation and cash-flow reporting. Joins to ORDER and TRANSACTION.',
    key_callouts: 'Only populated if the merchant uses Shopify Payments. Third-party gateways (Stripe, PayPal) do not populate this table.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'FULFILLMENT_ORDER',
    what_it_contains: 'Fulfillment workflow state — status, assigned location, tracking numbers, line items to fulfill.',
    why_it_matters: 'Operations analytics: ship time, fulfillment SLA, multi-location inventory.',
    key_callouts: 'Separate from FULFILLMENT (which tracks completed fulfillments). FULFILLMENT_ORDER tracks the workflow.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'GIFT_CARD',
    what_it_contains: 'Gift card records — code, balance, currency, expiry, status.',
    why_it_matters: 'Gift card liability tracking and redemption analytics.',
    key_callouts: 'Shopify Plus only. Will not sync on standard Shopify plans.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'USER',
    what_it_contains: 'Shopify admin users with access to the store — name, email, role.',
    why_it_matters: 'Audit and access reporting.',
    key_callouts: 'Shopify Plus only. Will not sync on standard Shopify plans.'
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Slow or Delayed Sync from Nested API Calls',
    issue_preview: 'Certain tables require nested calls that slow the whole sync',
    root_cause: "Several Shopify tables require nested API calls to fully hydrate (e.g. tables that must fetch child resources per row). When included in the schema, these tables materially slow down the whole connector's sync cycle.",
    impact: 'Historical syncs take much longer than expected. Incremental syncs can exceed the scheduled interval, causing data to appear stale.',
    resolution: "Exclude the nested-call tables listed in Fivetran's Shopify troubleshooting docs from the connector schema if you don't need them. Alternatively, increase the sync frequency window or reduce the historical sync range."
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Exceeded Rate Limit / API Throttling',
    issue_preview: 'Shopify API returns rate-limit errors during sync',
    root_cause: "Shopify enforces per-shop API rate limits. Fivetran can hit them when the connection's sync frequency is high, the schema is wide, or multiple connections share the same Shopify credentials.",
    impact: 'Sync failures, partial syncs, or extended sync times as Fivetran backs off and retries.',
    resolution: 'Exclude unnecessary tables from the schema, reduce sync frequency, request a higher API quota from Shopify (Shopify Plus offers higher limits), and avoid sharing credentials across multiple Fivetran connections.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Some Tables Cannot Sync Incrementally',
    issue_preview: 'Certain tables are re-imported in full on each sync',
    root_cause: "Shopify's API does not expose the parameters Fivetran needs to detect incremental changes for every table. For those tables, Fivetran must re-import the entire table each cycle.",
    impact: 'Higher MAR consumption on affected tables and longer sync cycles compared to fully incremental connectors.',
    resolution: 'Accept the behavior for tables you need, or exclude tables that are re-imported in full if they are not critical. Review the Fivetran Shopify schema page to see which tables sync incrementally vs. full refresh.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Daily-vs-Weekly Sync Schedule for Heavy Tables',
    issue_preview: 'Some tables switch to a weekly schedule if daily syncs run long',
    root_cause: 'For certain heavy tables, Fivetran syncs them daily only if the sync completes in under 30 minutes. If it takes longer, the schedule drops to weekly (Saturdays).',
    impact: 'Data freshness for those tables can lag by up to a week, which may surprise customers expecting daily data.',
    resolution: 'Trim the schema to reduce sync duration below the 30-minute threshold, or trigger manual syncs when fresher data is needed.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Shopify connector data...\n');

  // 1. Upsert connector row
  console.log('Upserting connector record...');
  const { error: connectorError } = await supabase
    .from('connectors')
    .upsert(
      {
        ...connector,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    );

  if (connectorError) {
    console.error('Error upserting connector:', connectorError);
    process.exit(1);
  }
  console.log(`Upserted connector: ${connector.name}\n`);

  // 2. Clear existing child rows so re-runs are idempotent
  console.log('Clearing existing shopify rows in child tables...');
  const { error: delTablesErr } = await supabase
    .from('connector_tables')
    .delete()
    .eq('connector_id', CONNECTOR_ID);
  if (delTablesErr) console.error('Warning clearing connector_tables:', delTablesErr);

  const { error: delIssuesErr } = await supabase
    .from('connector_known_issues')
    .delete()
    .eq('connector_id', CONNECTOR_ID);
  if (delIssuesErr) console.error('Warning clearing connector_known_issues:', delIssuesErr);
  console.log('Cleared.\n');

  // 3. Insert connector tables
  console.log('Inserting connector tables...');
  for (const table of connectorTables) {
    const { error } = await supabase.from('connector_tables').insert({
      ...table,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (error) {
      console.error(`Error inserting table ${table.table_name}:`, error);
    } else {
      console.log(`  Inserted table: ${table.table_name}`);
    }
  }
  console.log('');

  // 4. Insert known issues
  console.log('Inserting known issues...');
  for (const issue of knownIssues) {
    const { error } = await supabase.from('connector_known_issues').insert({
      ...issue,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (error) {
      console.error(`Error inserting issue "${issue.issue_title}":`, error);
    } else {
      console.log(`  Inserted issue: ${issue.issue_title}`);
    }
  }
  console.log('');

  // 5. Verify counts
  console.log('Verifying inserted rows...');
  const { count: connectorCount } = await supabase
    .from('connectors')
    .select('*', { count: 'exact', head: true })
    .eq('id', CONNECTOR_ID);
  const { count: tablesCount } = await supabase
    .from('connector_tables')
    .select('*', { count: 'exact', head: true })
    .eq('connector_id', CONNECTOR_ID);
  const { count: issuesCount } = await supabase
    .from('connector_known_issues')
    .select('*', { count: 'exact', head: true })
    .eq('connector_id', CONNECTOR_ID);

  console.log(`  connectors              (id='${CONNECTOR_ID}'): ${connectorCount}`);
  console.log(`  connector_tables        (connector_id='${CONNECTOR_ID}'): ${tablesCount}`);
  console.log(`  connector_known_issues  (connector_id='${CONNECTOR_ID}'): ${issuesCount}\n`);

  console.log(`✅ Task 2 Complete - Shopify: ${tablesCount} tables, ${issuesCount} issues`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
