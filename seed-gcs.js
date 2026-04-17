// seed-gcs.js
// Populates Supabase with Fivetran Google Cloud Storage connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'google_cloud_storage';

const connector = {
  id: CONNECTOR_ID,
  name: 'Google Cloud Storage',
  category: 'cloud-storage',
  description: "Fivetran's Google Cloud Storage (GCS) connector syncs delimited files (CSV, TSV, JSON, Avro, Parquet) from a GCS bucket into your destination warehouse. It monitors a configured bucket and prefix for new or modified files and loads them as structured tables.",
  what_it_does: 'Connects to a GCS bucket using a service account key. Monitors a specified bucket/prefix for files matching a pattern. Parses CSV, TSV, JSON, Avro, and Parquet files into destination tables. Handles schema inference, type widening, and supports multiple primary key strategies (upsert vs append).',
  useful_for: 'Syncing data lake files, cloud-native file exports, BigQuery staging data, partner data drops to GCS, machine learning pipeline outputs, and any system that writes structured files to Google Cloud Storage.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: '<file_pattern_table>',
    what_it_contains: 'One table per file pattern — columns inferred from file contents. Includes _file, _line, _modified system columns.',
    why_it_matters: 'Each file pattern creates a destination table with auto-detected schema.',
    key_callouts: 'Primary key strategy (upsert vs append) determines how duplicate files are handled. _file + _line are default surrogate keys.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Service Account Permissions Insufficient',
    issue_preview: 'Connector cannot read files from the GCS bucket',
    root_cause: 'The service account JSON key provided during setup does not have Storage Object Viewer (roles/storage.objectViewer) permission on the target bucket. Or the bucket has uniform bucket-level access enabled and fine-grained ACLs are not supported.',
    impact: 'Connector setup fails or syncs return zero files. No data flows.',
    resolution: 'Grant the service account the Storage Object Viewer role on the bucket. If using uniform bucket-level access, set permissions at the bucket level via IAM, not ACLs.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Column Types Only Widen, Never Narrow',
    issue_preview: 'A stray value permanently changes column type to TEXT',
    root_cause: 'Same behavior as S3 and SFTP connectors — when a value does not fit the inferred type, the column is promoted to a wider type permanently.',
    impact: 'Numeric columns become TEXT. Aggregation queries break. Downstream models need explicit casting.',
    resolution: 'Clean source data, then trigger a historical re-sync. Validate files before uploading to GCS.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'File Pattern Regex Matches Nothing',
    issue_preview: 'Connector syncs successfully but processes zero files',
    root_cause: 'The file pattern regex does not match any files in the configured bucket/prefix. Common issues: wrong prefix, unescaped dots, overly strict anchoring.',
    impact: 'Connection reports success with zero rows. Users think the connector is broken.',
    resolution: 'Leave file pattern blank initially to sync everything under the prefix. Tighten after confirming data flows. Test regex against actual filenames in the bucket.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Empty Columns Are Not Created in Destination',
    issue_preview: 'Columns with all NULL values are skipped',
    root_cause: 'If every value in a column is NULL or empty across all files, Fivetran cannot infer a type and skips the column entirely.',
    impact: 'Expected columns missing from destination. Downstream queries fail with column-not-found errors.',
    resolution: 'Ensure every column has at least one non-empty value in at least one file. Add a placeholder row if needed to force column creation.'
  }
];

async function main() {
  console.log('Seeding Google Cloud Storage connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Google Cloud Storage');

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

  console.log('\nDone — Google Cloud Storage: 1 table, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
