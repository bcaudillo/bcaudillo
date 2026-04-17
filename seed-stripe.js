// seed-stripe.js
// Populates Supabase with Fivetran Stripe connector data.
// Idempotent: upserts connector, deletes existing child rows, then inserts fresh.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'stripe';

const connector = {
  id: CONNECTOR_ID,
  name: 'Stripe',
  category: 'payments',
  description: "Fivetran's Stripe connector replicates payment, subscription, and billing data from the Stripe API into your destination warehouse. It syncs customers, charges, invoices, subscriptions, balance transactions, refunds, and 40+ related objects. A separate 'Stripe Test Mode' connector exists for sandbox/test environments.",
  what_it_does: 'Syncs all core Stripe objects via the Events API for incremental updates. Handles customers, subscriptions, invoices, charges, refunds, payouts, balance transactions, products, prices, plans, coupons, disputes, and payment methods. Automatically manages parent-child table dependencies — PAYMENT_METHOD requires CHARGE, CUSTOMER, PAYMENT_INTENT, SETUP_INTENT, and SETUP_ATTEMPT to be selected. Uses hard deletes on certain tables and soft deletes (_fivetran_deleted) on others.',
  useful_for: 'SaaS billing analytics, MRR/ARR tracking, churn analysis, revenue recognition, payment failure diagnostics, financial reconciliation, subscription lifecycle reporting, and multi-currency revenue rollups.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CUSTOMER',
    what_it_contains: 'All Stripe customers — name, email, metadata, default payment method, account balance, currency, created date.',
    why_it_matters: 'Core entity linking subscriptions, charges, invoices, and payment methods to payers. Every revenue query starts here.',
    key_callouts: 'Metadata field contains JSON key-value pairs — parse for custom attributes. Deleted customers are soft-deleted with _fivetran_deleted.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'SUBSCRIPTION',
    what_it_contains: 'Active and inactive subscriptions — plan, status, current_period_start/end, cancel_at_period_end, trial dates, quantity.',
    why_it_matters: 'Essential for MRR/ARR calculations, churn analysis, and subscription lifecycle reporting.',
    key_callouts: 'Status values: active, past_due, canceled, trialing, incomplete, incomplete_expired, unpaid, paused. SUBSCRIPTION_HISTORY cannot be re-synced — by design to protect historical data.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'INVOICE',
    what_it_contains: 'Payment invoices — amount_due, amount_paid, amount_remaining, status, billing_reason, subscription reference, hosted_invoice_url.',
    why_it_matters: 'Revenue recognition, billing reconciliation, and accounts receivable tracking.',
    key_callouts: 'amount_paid vs amount_due for partial payments. Line items in INVOICE_LINE_ITEM. UPCOMING_INVOICE may be empty for subscriptions with automatic tax + discountable negative line items (Stripe API limitation).'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CHARGE',
    what_it_contains: 'Individual payment attempts — amount, status, currency, failure_code, failure_message, card brand/last4, receipt_url.',
    why_it_matters: 'Transaction-level payment tracking, failure analysis, and dispute monitoring.',
    key_callouts: 'Refunds are separate records in REFUND table — join via charge_id. Links to INVOICE via invoice_id. Parent table for PAYMENT_METHOD.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'BALANCE_TRANSACTION',
    what_it_contains: 'All money movements — charges, refunds, payouts, adjustments, fees. Includes gross amount, fee, net, exchange_rate.',
    why_it_matters: 'True financial reconciliation including Stripe processing fees. The only table that shows actual money flow.',
    key_callouts: 'Net = gross - fee. reporting_category column classifies transaction type. Pending transactions are re-synced weekly to capture settlement.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'REFUND',
    what_it_contains: 'Refund records — amount, status, reason, charge reference, balance_transaction reference.',
    why_it_matters: 'Revenue adjustment tracking, refund rate analysis, and financial reconciliation.',
    key_callouts: 'Join to CHARGE via charge_id. Partial refunds create separate records. Status: succeeded, pending, failed, canceled.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PAYOUT',
    what_it_contains: 'Bank transfers from Stripe balance — amount, arrival_date, status, method, type.',
    why_it_matters: 'Cash flow tracking and bank reconciliation.',
    key_callouts: 'Links to BALANCE_TRANSACTION for individual items in a payout. automatic vs manual payout types.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PRODUCT',
    what_it_contains: 'Product catalog — name, description, active flag, metadata, statement_descriptor.',
    why_it_matters: 'Product dimension for revenue segmentation and catalog management.',
    key_callouts: 'Links to PRICE (current) and PLAN (legacy). Products can be goods or services.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PRICE',
    what_it_contains: 'Pricing definitions — unit_amount, currency, recurring interval, billing_scheme, tiers.',
    why_it_matters: 'Modern pricing model used for subscriptions and one-time purchases.',
    key_callouts: 'Replaces the legacy PLAN table. Links to PRODUCT via product_id. Supports flat-rate, tiered, and per-unit pricing.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PLAN',
    what_it_contains: 'Legacy pricing plans — amount, interval, currency, trial_period_days, product reference.',
    why_it_matters: 'Still used by many existing subscriptions. Required for historical MRR analysis.',
    key_callouts: 'Entire table is re-imported every sync (hard refresh). Superseded by PRICE for new integrations but still widely referenced.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'DISPUTE',
    what_it_contains: 'Chargebacks and disputes — amount, status, reason, evidence_due_by, charge reference.',
    why_it_matters: 'Chargeback monitoring, dispute resolution tracking, and risk management.',
    key_callouts: 'Status: warning_needs_response, needs_response, under_review, won, lost. Links to CHARGE.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PAYMENT_METHOD',
    what_it_contains: 'Saved payment instruments — type, card brand/last4/exp, billing_details.',
    why_it_matters: 'Payment method analytics, card expiration alerts, and payment failure prevention.',
    key_callouts: 'Requires parent tables to be selected: CHARGE, CUSTOMER, PAYMENT_INTENT, SETUP_INTENT, SETUP_ATTEMPT. Child tables: PAYMENT_METHOD_CARD, AU_BECS_DEBIT, FPX, IDEAL, SEPA_DEBIT.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Refunds Appear as Separate Records From Original Charges',
    issue_preview: 'Revenue calculations double-count without proper reconciliation',
    root_cause: 'Stripe records refunds as distinct objects linked to the original charge via charge_id. The REFUND table is separate from CHARGE. Partial refunds create additional refund records, each with their own amount. The original charge amount is not reduced — the refund is a separate financial event.',
    impact: 'Revenue calculations can be inflated if refunds are not subtracted. Partial refunds make reconciliation more complex. Financial reports may not match Stripe dashboard totals without proper joins.',
    resolution: 'JOIN refunds to charges using charge_id. Calculate net revenue as charge.amount minus SUM(refund.amount). Use BALANCE_TRANSACTION for the definitive net amount including fees. Build a materialized view that pre-joins charges and refunds for common queries.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Test Mode Data Mixed With Live Data',
    issue_preview: 'Test transactions appearing in production analytics',
    root_cause: 'Stripe maintains completely separate test and live mode environments. Fivetran offers two separate connectors: "Stripe" (live) and "Stripe Test Mode". If a customer accidentally uses test API keys with the live connector, or vice versa, data environments get crossed.',
    impact: 'Non-production test transactions can corrupt revenue analytics, inflate customer counts, and skew financial reports. May cause compliance issues if test data is treated as real.',
    resolution: 'Verify the correct connector type is being used. Filter records WHERE livemode = TRUE as a safety measure in all queries. Use the "Stripe Test Mode" connector for development/staging environments with test API keys (sk_test_*).'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Timestamps Use Stripe Account Timezone, Not UTC',
    issue_preview: 'Time-based analytics off when joining with other sources',
    root_cause: 'Fivetran does not convert Stripe timestamps to UTC — it preserves the timezone configured in the Stripe account settings. Different Stripe accounts may use different timezones, and the timezone setting is account-level, not per-object.',
    impact: 'Time-based analytics can be off by hours if analysts assume UTC. Cross-source joins on timestamp columns produce mismatches. Daily revenue aggregations may split differently than expected.',
    resolution: 'Check the Stripe account timezone in Dashboard → Settings → Account details. Convert timestamps in your warehouse using the known offset. Document the timezone assumption in your data dictionary.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'UPCOMING_INVOICE Table Empty for Certain Subscriptions',
    issue_preview: 'Upcoming invoice data missing for some subscriptions',
    root_cause: 'Fivetran cannot sync records to UPCOMING_INVOICE for subscriptions that have both automatic tax enabled AND discountable negative line items. The Stripe API returns an error for this specific configuration, and Fivetran skips the affected records.',
    impact: 'Missing upcoming invoice data for affected subscriptions. Revenue forecasting models that rely on upcoming invoices will have gaps. Cannot predict next billing amounts for these customers.',
    resolution: 'This is a known Stripe API limitation — Fivetran cannot work around it. Check if affected subscriptions have the automatic tax + discountable negative line items combination. For forecasting, use SUBSCRIPTION current_period_end and PRICE amount as an alternative estimate.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Hard Deletes on Certain Tables Remove Records Permanently',
    issue_preview: 'Some deleted records disappear entirely with no audit trail',
    root_cause: 'Fivetran uses hard deletes (permanent row removal) instead of soft deletes (_fivetran_deleted flag) for specific Stripe tables. When a record is deleted in Stripe, the corresponding warehouse row is permanently removed on the next sync.',
    impact: 'Deleted records disappear from the warehouse entirely — no audit trail, no historical analysis possible. Downstream models that reference these records will break or produce nulls on joins.',
    resolution: 'Check the Fivetran Stripe docs for the list of hard-delete tables. If you need deletion history, capture snapshots or implement SCD Type 2 tracking in your warehouse before syncs. Consider using dbt snapshots on critical tables.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'PLAN Table Re-Imported Every Sync Cycle',
    issue_preview: 'All plan rows are touched on every sync, increasing MAR',
    root_cause: 'Fivetran re-imports the entire PLAN table on every sync to capture changes and deletions accurately. Unlike most tables that use incremental sync via the Events API, PLAN uses a full-table refresh strategy.',
    impact: 'Every plan row counts as MAR on every sync, even if nothing changed. Accounts with thousands of plans see inflated MAR counts. This is the biggest MAR surprise for Stripe connectors.',
    resolution: 'This is expected behavior and cannot be changed. Factor the total PLAN row count into MAR estimates when scoping the connector. If plan data is static, consider migrating to the PRICE table (which syncs incrementally) and archiving old plans.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'PAYMENT_METHOD Table Not Syncing Despite Being Selected',
    issue_preview: 'Payment method data empty even though table is checked in schema',
    root_cause: 'PAYMENT_METHOD is a child table that depends on five parent tables: SETUP_INTENT, SETUP_ATTEMPT, PAYMENT_INTENT, CUSTOMER, and CHARGE. If any parent table is not selected in the schema configuration, PAYMENT_METHOD and its own child tables will not sync.',
    impact: 'Payment method data missing from warehouse. Child tables PAYMENT_METHOD_CARD, AU_BECS_DEBIT, FPX, IDEAL, and SEPA_DEBIT will also be empty. Payment analytics and card expiration monitoring unavailable.',
    resolution: 'In Fivetran Schema tab, select ALL five parent tables: SETUP_INTENT, SETUP_ATTEMPT, PAYMENT_INTENT, CUSTOMER, and CHARGE. Save the schema configuration and trigger a re-sync. All parent tables must remain selected for ongoing syncs.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'API Key Permissions Insufficient — Tables Not Syncing',
    issue_preview: 'Restricted API key missing required read permissions for some resources',
    root_cause: 'Restricted API keys in Stripe limit permissions per resource type. If a resource is not enabled with read access on the key, its corresponding table will not sync. Standard (secret) keys starting with sk_live_ have full access to all resources.',
    impact: 'Some tables silently fail to sync — no error in Fivetran, just empty tables. Data gaps appear in warehouse without clear indication of the cause.',
    resolution: 'Use a Standard (secret) API key (starts with sk_live_) for full access to all resources. If a restricted key is required for security, ensure every needed resource has Read permission enabled in Stripe Dashboard → Developers → API keys → Edit restricted key.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Connected Account Data Not Appearing in Destination',
    issue_preview: 'Stripe Connect platform accounts missing from warehouse',
    root_cause: 'Syncing data from Stripe Connect sub-accounts requires TWO settings to be enabled: the ACCOUNT table must be checked in the Schema tab, AND the "Sync Connected Accounts" toggle must be turned ON in the connector Setup tab. Missing either setting blocks connected account data.',
    impact: 'Platform/marketplace businesses using Stripe Connect will have no visibility into connected account data — cannot analyze sub-merchant performance, payouts, or aggregate platform metrics.',
    resolution: 'In Fivetran: 1) Schema tab → check the ACCOUNT table → Save. 2) Setup tab → Edit connection → toggle "Sync Connected Accounts" ON → Save & Test. Both steps are required. Re-sync after enabling.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'SUBSCRIPTION_HISTORY Cannot Be Re-Synced',
    issue_preview: 'Re-sync button has no effect on subscription history table',
    root_cause: 'Fivetran intentionally disables re-sync for the SUBSCRIPTION_HISTORY table because a re-sync could result in loss of historical subscription state data. The table is append-only and tracks subscription changes over time.',
    impact: 'Cannot force a refresh of subscription history data if it appears incorrect or incomplete. Historical gaps cannot be backfilled through the standard re-sync mechanism.',
    resolution: 'This is by design to protect historical data integrity. If subscription history data appears incorrect, contact Fivetran support directly — they can investigate and potentially repair the data without the risk of a full re-import.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Stripe connector data...\n');

  console.log('Upserting connector record...');
  const { error: connectorError } = await supabase
    .from('connectors')
    .upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (connectorError) { console.error('Error upserting connector:', connectorError); process.exit(1); }
  console.log(`Upserted connector: ${connector.name}\n`);

  console.log('Clearing existing stripe rows in child tables...');
  await supabase.from('connector_tables').delete().eq('connector_id', CONNECTOR_ID);
  await supabase.from('connector_known_issues').delete().eq('connector_id', CONNECTOR_ID);
  console.log('Cleared.\n');

  console.log('Inserting connector tables...');
  for (const table of connectorTables) {
    const { error } = await supabase.from('connector_tables').insert({ ...table, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (error) console.error(`Error inserting table ${table.table_name}:`, error);
    else console.log(`  Inserted table: ${table.table_name}`);
  }
  console.log('');

  console.log('Inserting known issues...');
  for (const issue of knownIssues) {
    const { error } = await supabase.from('connector_known_issues').insert({ ...issue, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (error) console.error(`Error inserting issue "${issue.issue_title}":`, error);
    else console.log(`  Inserted issue: ${issue.issue_title}`);
  }
  console.log('');

  console.log('Verifying...');
  const { count: tablesCount } = await supabase.from('connector_tables').select('*', { count: 'exact', head: true }).eq('connector_id', CONNECTOR_ID);
  const { count: issuesCount } = await supabase.from('connector_known_issues').select('*', { count: 'exact', head: true }).eq('connector_id', CONNECTOR_ID);
  console.log(`  connector_tables: ${tablesCount}`);
  console.log(`  connector_known_issues: ${issuesCount}\n`);
  console.log(`Done — Stripe: ${tablesCount} tables, ${issuesCount} issues`);
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
