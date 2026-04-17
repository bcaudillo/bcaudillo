// seed-azure-blob.js
// Populates Supabase with Fivetran Azure Blob Storage connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'azure_blob_storage';

const connector = {
  id: CONNECTOR_ID,
  name: 'Azure Blob Storage',
  category: 'cloud-storage',
  description: "Fivetran's Azure Blob Storage connector syncs delimited files (CSV, TSV, JSON, Avro, Parquet) from an Azure Blob container into your destination warehouse. It monitors a configured container and prefix for new or modified files and loads them as structured tables.",
  what_it_does: 'Connects to an Azure Blob Storage container using a connection string or SAS token. Monitors a specified container/prefix for files matching a regex pattern. Parses files into destination tables with automatic schema inference. Supports upsert and append primary key strategies.',
  useful_for: 'Syncing Azure-native file exports, data lake files from Azure Data Lake Storage Gen2, vendor data drops, ETL pipeline outputs stored in Blob Storage, and any Azure-based file integration.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: '<file_pattern_table>',
    what_it_contains: 'One table per file pattern — columns inferred from file contents. Includes _file, _line, _modified system columns.',
    why_it_matters: 'Each file pattern creates a destination table with auto-detected schema.',
    key_callouts: 'Same behavior as S3 and GCS connectors. _file + _line are default surrogate keys. Column types only widen.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'SAS Token Expiration Breaks Connection',
    issue_preview: 'Sync fails when SAS token expires',
    root_cause: 'SAS (Shared Access Signature) tokens have a fixed expiration date. When the token expires, Azure rejects all requests from Fivetran. Unlike connection strings, SAS tokens must be manually renewed.',
    impact: 'All syncs stop at the moment of expiration. No automatic renewal — requires manual intervention to update the token in Fivetran.',
    resolution: 'Set a long expiration when generating the SAS token. Create a calendar reminder to renew before expiry. Update the token in Fivetran connector settings before the old one expires. Consider using a connection string instead for persistent access.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Container Access Level Must Be Private',
    issue_preview: 'Public containers may cause unexpected behavior',
    root_cause: 'Fivetran expects private containers with explicit authentication. Public or anonymous-access containers may not return proper metadata (modified dates, file listings) needed for incremental sync.',
    impact: 'Files may be re-processed on every sync or changes may not be detected. Unpredictable sync behavior.',
    resolution: 'Set the container access level to Private. Use a connection string or SAS token with List and Read permissions. Avoid anonymous/public access for containers synced by Fivetran.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Column Types Only Widen, Never Narrow',
    issue_preview: 'Stray values permanently change column types',
    root_cause: 'Same as S3/GCS/SFTP — type inference promotes columns to wider types permanently when incompatible values are encountered.',
    impact: 'Numeric columns become TEXT. Aggregation queries break without casting.',
    resolution: 'Clean source data and trigger a historical re-sync. Validate file contents before uploading to Blob Storage.'
  }
];

async function main() {
  console.log('Seeding Azure Blob Storage connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Azure Blob Storage');

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

  console.log('\nDone — Azure Blob Storage: 1 table, 3 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
