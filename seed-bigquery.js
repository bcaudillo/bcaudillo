// seed-bigquery.js
// Populates Supabase with Fivetran BigQuery (source) connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'bigquery_db';

const connector = {
  id: CONNECTOR_ID,
  name: 'BigQuery',
  category: 'databases',
  description: "Fivetran's BigQuery database connector syncs data FROM a BigQuery dataset as a source into another destination warehouse. This is for replicating BigQuery data to a different platform, consolidating cross-cloud data, or creating cross-warehouse pipelines.",
  what_it_does: 'Connects to a Google BigQuery project using a service account. Replicates selected datasets and tables to the destination. Uses query-based incremental sync with configurable cursor columns. Supports views and partitioned tables.',
  useful_for: 'Cross-cloud data consolidation, migrating from BigQuery to another warehouse, replicating shared BigQuery datasets, and multi-cloud analytics architectures.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: '<selected_tables>',
    what_it_contains: 'Any tables selected from the source BigQuery dataset — schema mirrors the source.',
    why_it_matters: 'Full-fidelity replication of BigQuery tables to the destination.',
    key_callouts: 'Nested/repeated fields (STRUCT, ARRAY) are flattened into relational columns. Partitioned tables are synced as regular tables.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Nested and Repeated Fields Are Flattened',
    issue_preview: 'STRUCT and ARRAY columns lose their nested structure',
    root_cause: 'BigQuery supports nested (STRUCT) and repeated (ARRAY) fields natively. Most destination warehouses do not support these types, so Fivetran flattens them into relational columns or child tables.',
    impact: 'Queries that relied on BigQuery-specific UNNEST or dot-notation syntax will not work in the destination. Data structure changes require downstream model updates.',
    resolution: 'Review the flattened schema in the destination. Rebuild nested queries using JOINs to child tables. If the destination supports semi-structured types (e.g. Snowflake VARIANT), consider alternative approaches.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Service Account Requires BigQuery Data Viewer Role',
    issue_preview: 'Connector cannot read source tables',
    root_cause: 'The service account JSON key must have BigQuery Data Viewer (roles/bigquery.dataViewer) and BigQuery Job User (roles/bigquery.jobUser) roles on the source project. Missing either role blocks data access.',
    impact: 'Setup fails or tables are not accessible. No data syncs.',
    resolution: 'Grant the service account both roles: BigQuery Data Viewer on the dataset and BigQuery Job User on the project. The Job User role is needed to run queries.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Query Costs on Source BigQuery Project',
    issue_preview: 'Fivetran sync queries consume BigQuery compute credits',
    root_cause: 'Fivetran runs SELECT queries against the source BigQuery tables to extract data. These queries consume BigQuery compute resources (on-demand pricing or reserved slots) in the source project.',
    impact: 'Source project incurs query costs proportional to the data scanned. Large tables or frequent syncs increase costs.',
    resolution: 'Use partitioned tables and configure Fivetran to scan only recent partitions. Monitor BigQuery billing in the source project. Consider using flat-rate pricing or reservations for predictable costs.'
  }
];

async function main() {
  console.log('Seeding BigQuery connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: BigQuery');

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

  console.log('\nDone — BigQuery: 1 table, 3 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
