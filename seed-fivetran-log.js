// seed-fivetran-log.js
// Populates Supabase with Fivetran Log connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'fivetran_log';

const connector = {
  id: CONNECTOR_ID,
  name: 'Fivetran Log',
  category: 'applications',
  description: "Fivetran Log is a built-in connector that syncs Fivetran's own operational metadata into your destination warehouse. It provides visibility into connector status, sync history, MAR usage, transformation runs, and account-level activity — essentially Fivetran's internal telemetry made queryable.",
  what_it_does: 'Syncs Fivetran platform metadata: connector configurations, sync history with row counts and durations, MAR consumption, transformation run logs, user activity, and account settings. Updates every 15 minutes. Free — does not count toward MAR.',
  useful_for: 'Monitoring sync health, building operational dashboards, tracking MAR consumption trends, auditing connector changes, SLA reporting, and alerting on sync failures across all connectors in the account.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CONNECTOR',
    what_it_contains: 'One row per connector — ID, name, schema, service type, status, sync frequency, paused flag, setup state.',
    why_it_matters: 'Inventory of all connectors in the account. Base table for joining to sync history.',
    key_callouts: 'Includes connectors in all states (active, paused, broken). Join to DESTINATION via destination_id.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'SYNC_LOG',
    what_it_contains: 'One row per sync attempt — connector_id, sync_start, sync_end, status, rows_synced, bytes_synced.',
    why_it_matters: 'Core table for sync health monitoring. Track failures, durations, and throughput.',
    key_callouts: 'Status values: SUCCESSFUL, FAILURE, CANCELED. Use sync_end - sync_start for duration. High-frequency table — grows fast.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ACTIVE_VOLUME',
    what_it_contains: 'Monthly MAR consumption per connector — schema, table, monthly_active_rows, measured_month.',
    why_it_matters: 'The definitive source for MAR billing data. Essential for cost monitoring and forecasting.',
    key_callouts: 'Breaks down MAR by connector and table. Use this to identify which tables are driving costs.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TRANSFORMATION_LOG',
    what_it_contains: 'Transformation/dbt run history — model name, status, duration, error messages.',
    why_it_matters: 'Monitor dbt model runs orchestrated by Fivetran. Track failures and performance.',
    key_callouts: 'Only populated if using Fivetran-managed transformations. Includes model run counts for billing.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ACCOUNT_MEMBERSHIP',
    what_it_contains: 'Users in the Fivetran account — email, role, invited_by, created date.',
    why_it_matters: 'Audit trail for account access and user management.',
    key_callouts: 'Useful for compliance reporting — who has access to what.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Fivetran Log Data Is Delayed by Up to 15 Minutes',
    issue_preview: 'Sync status appears stale compared to Fivetran dashboard',
    root_cause: 'The Fivetran Log connector syncs on a fixed 15-minute interval. Real-time sync events in the Fivetran dashboard will not appear in the warehouse until the next Log sync completes.',
    impact: 'Operational dashboards built on Fivetran Log data may show sync failures or completions 15 minutes after they actually occurred. Not suitable for real-time alerting.',
    resolution: 'Accept the 15-minute delay for warehouse-based monitoring. For real-time alerts, use Fivetran webhooks or the Fivetran REST API instead of the Log connector.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'ACTIVE_VOLUME Table Shows Different Numbers Than Invoice',
    issue_preview: 'MAR counts in ACTIVE_VOLUME do not match the billing invoice',
    root_cause: 'ACTIVE_VOLUME captures MAR snapshots at sync time. The billing invoice uses end-of-month finalized counts. Timing differences, free MAR exclusions, and re-sync adjustments can cause discrepancies.',
    impact: 'Finance teams comparing warehouse MAR data to invoices see mismatches. Can erode trust in the data.',
    resolution: 'Use ACTIVE_VOLUME for trend analysis and cost attribution, not invoice reconciliation. For exact billing numbers, use the Fivetran billing dashboard or API. The measured_month column indicates which billing period the row belongs to.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'SYNC_LOG Grows Very Large Over Time',
    issue_preview: 'Fivetran Log tables consuming significant warehouse storage',
    root_cause: 'Every sync attempt for every connector creates a row in SYNC_LOG. Accounts with 50+ connectors syncing every 15 minutes generate 200k+ rows per month in SYNC_LOG alone.',
    impact: 'Warehouse storage costs increase. Queries against SYNC_LOG without date filters become slow.',
    resolution: 'Add date filters to all SYNC_LOG queries. Consider creating a materialized view with only the last 90 days. The raw table retains full history for compliance but daily queries should be scoped.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Fivetran Log Connector Cannot Be Deleted',
    issue_preview: 'No delete option available for the Log connector',
    root_cause: 'The Fivetran Log connector is a system connector that is automatically created when a destination is configured. It cannot be deleted through the UI or API.',
    impact: 'Customers who do not want the Log data in their warehouse cannot remove it. The connector continues to sync.',
    resolution: 'The connector can be paused but not deleted. If the tables are unwanted, pause the connector and drop the schema in the destination warehouse manually.'
  }
];

async function main() {
  console.log('Seeding Fivetran Log connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Fivetran Log');

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

  console.log('\nDone — Fivetran Log: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
