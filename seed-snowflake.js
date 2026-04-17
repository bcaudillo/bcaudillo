// seed-snowflake.js
// Populates Supabase with Fivetran Snowflake (source) connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'snowflake_db';

const connector = {
  id: CONNECTOR_ID,
  name: 'Snowflake',
  category: 'databases',
  description: "Fivetran's Snowflake database connector syncs data FROM a Snowflake instance as a source into another destination warehouse. This is for customers who need to replicate Snowflake data to a different warehouse or consolidate multiple Snowflake accounts. Not to be confused with Snowflake as a destination.",
  what_it_does: 'Connects to a Snowflake account as a source database and replicates selected schemas and tables to a destination. Uses query-based incremental sync. Supports views, secure views, and materialized views as source tables.',
  useful_for: 'Cross-account Snowflake replication, consolidating data from multiple Snowflake instances, migrating between cloud regions, and syncing shared Snowflake data to a different warehouse platform.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: '<selected_tables>',
    what_it_contains: 'Any tables selected from the source Snowflake instance — schema mirrors the source exactly.',
    why_it_matters: 'Tables are replicated with full fidelity to the source schema.',
    key_callouts: 'Views and materialized views can also be synced. Column types are mapped to the destination equivalent.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Query-Based Sync Only — No CDC',
    issue_preview: 'No change data capture available for Snowflake sources',
    root_cause: 'Snowflake does not expose a change stream or WAL equivalent that Fivetran can consume for CDC. The connector uses query-based incremental sync, which relies on a timestamp or incrementing column to detect changes.',
    impact: 'Deletes in the source are not detected unless a soft-delete column exists. Full table scans occur for tables without a suitable incremental column. Higher source compute costs from repeated queries.',
    resolution: 'Ensure source tables have a reliable updated_at or modified_date column. For delete detection, use a soft-delete pattern. For tables without incremental columns, accept full-table refresh behavior and schedule syncs during off-peak hours.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Warehouse Must Be Running During Sync',
    issue_preview: 'Sync fails if Snowflake warehouse is suspended',
    root_cause: 'Fivetran queries the Snowflake source using a virtual warehouse. If the warehouse is configured to auto-suspend and is not running when Fivetran connects, the query may time out before the warehouse resumes.',
    impact: 'Sync failures when the warehouse is cold. Initial resume can take 30+ seconds on larger warehouses.',
    resolution: 'Use a dedicated X-Small warehouse for Fivetran with auto-resume enabled and a longer auto-suspend timeout (e.g. 10 minutes). This keeps costs low while ensuring availability.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Network Policy Must Allow Fivetran IPs',
    issue_preview: 'Connection fails due to Snowflake network policy restrictions',
    root_cause: 'Snowflake network policies restrict connections to allowed IP addresses. If Fivetran IPs are not in the allowlist, connections are rejected at the network level.',
    impact: 'Connector setup fails. No syncs until network policy is updated.',
    resolution: 'Add Fivetran IP addresses to the Snowflake network policy allowlist. Use ALTER NETWORK POLICY to add the IPs. For private connectivity, use AWS PrivateLink or Azure Private Link.'
  }
];

async function main() {
  console.log('Seeding Snowflake connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Snowflake');

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

  console.log('\nDone — Snowflake: 1 table, 3 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
