// seed-redshift.js
// Populates Supabase with Fivetran Redshift (source) connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'redshift_db';

const connector = {
  id: CONNECTOR_ID,
  name: 'Redshift',
  category: 'databases',
  description: "Fivetran's Redshift database connector syncs data FROM an Amazon Redshift cluster as a source into another destination warehouse. This is for cross-warehouse replication, migrating off Redshift, or consolidating multiple Redshift clusters.",
  what_it_does: 'Connects to an Amazon Redshift cluster using standard PostgreSQL-compatible credentials. Replicates selected schemas and tables to the destination. Uses query-based incremental sync with xmin or timestamp columns. Supports Redshift Spectrum external tables.',
  useful_for: 'Cross-cloud warehouse migration, consolidating multiple Redshift clusters, replicating Redshift data to Snowflake or BigQuery, and multi-warehouse analytics setups.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: '<selected_tables>',
    what_it_contains: 'Any tables selected from the source Redshift cluster — schema mirrors the source.',
    why_it_matters: 'Full-fidelity replication from Redshift to the destination.',
    key_callouts: 'Redshift-specific types (SUPER, GEOMETRY) are mapped to destination equivalents. Sort keys and dist keys are not preserved.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'No CDC Available — Query-Based Only',
    issue_preview: 'Cannot track deletes without soft-delete column',
    root_cause: 'Redshift does not expose a change stream or WAL for CDC. Fivetran uses query-based incremental sync, which polls tables using a timestamp or xmin column. Deletes cannot be detected without a soft-delete pattern.',
    impact: 'Deleted rows persist in the destination indefinitely. Full table scans required for tables without incremental columns.',
    resolution: 'Implement soft-delete columns in source tables. Use a reliable updated_at column for incremental sync. For tables without incremental columns, accept full-refresh behavior.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Concurrent Query Slots May Be Exhausted',
    issue_preview: 'Fivetran queries compete with production workloads',
    root_cause: 'Redshift has a limited number of concurrent query slots (varies by WLM configuration). Fivetran sync queries consume slots, potentially crowding out production queries during busy periods.',
    impact: 'Production queries queue behind Fivetran sync queries, or Fivetran queries queue behind production, slowing syncs.',
    resolution: 'Create a dedicated WLM queue for Fivetran with reserved slots. Use a separate Redshift user for Fivetran and assign it to the dedicated queue. Schedule syncs during off-peak hours.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'VPC Security Group Must Allow Fivetran IPs',
    issue_preview: 'Connection fails due to network restrictions',
    root_cause: 'Redshift clusters in a VPC require security group rules allowing inbound connections from Fivetran IP addresses on port 5439. Publicly accessible clusters also need the correct VPC routing.',
    impact: 'Connector setup fails. No syncs until network access is granted.',
    resolution: 'Add Fivetran IP addresses to the Redshift cluster security group inbound rules on port 5439. For private clusters, use an SSH tunnel, AWS PrivateLink, or Fivetran Proxy Agent.'
  }
];

async function main() {
  console.log('Seeding Redshift connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Redshift');

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

  console.log('\nDone — Redshift: 1 table, 3 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
