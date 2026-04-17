// seed-sftp.js
// Populates Supabase with Fivetran SFTP connector data.
// Idempotent: upserts connector, deletes existing child rows, then inserts fresh.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'sftp';

const connector = {
  id: CONNECTOR_ID,
  name: 'SFTP',
  category: 'files',
  description: "Fivetran's SFTP connector syncs delimited files (CSV, TSV, JSON) from any SFTP server into your destination warehouse. It monitors a configured directory for new or modified files and loads them as structured tables. Supports pattern-based file matching, custom delimiters, and multiple archive strategies.",
  what_it_does: 'Connects to an SFTP server using SSH key or password authentication. Monitors a specified folder path for files matching a regex pattern. Parses CSV, TSV, or JSON files into structured destination tables. Handles schema inference, type widening, and new column detection automatically. Supports archive-after-sync to move processed files.',
  useful_for: 'Syncing flat-file exports from legacy systems, vendor data drops, partner data feeds, daily report exports, and any system that outputs data as files to an SFTP server.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: '<file_pattern_table>',
    what_it_contains: 'One table per file pattern — columns are inferred from file headers. Includes _file, _line, _modified system columns.',
    why_it_matters: 'Each matched file pattern creates a separate destination table with auto-detected schema.',
    key_callouts: '_file and _line are surrogate primary keys. _modified tracks file timestamp. Column types are inferred and can only widen, never narrow.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: '_FIVETRAN_AUDIT',
    what_it_contains: 'Audit log of every file processed — file name, row count, sync timestamp, status.',
    why_it_matters: 'Track which files have been processed and verify completeness.',
    key_callouts: 'Useful for debugging missing data — check if the file was picked up and how many rows were loaded.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Column Types Only Widen, Never Narrow',
    issue_preview: 'A stray value permanently changes column type to TEXT',
    root_cause: 'When Fivetran encounters a value that does not fit the current column type (e.g. a string in a numeric column), it promotes the column to a wider type. This promotion is permanent — even if the offending value is removed, the column stays widened.',
    impact: 'Numeric columns silently become TEXT. Aggregation queries (SUM, AVG) break without explicit casting. Downstream models may fail.',
    resolution: 'Clean the source data, then trigger a historical re-sync to re-detect column types from scratch. Prevention: validate file contents before dropping on SFTP.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'File Pattern Regex Must Match or Nothing Syncs',
    issue_preview: 'Typo in file pattern means Fivetran sees zero files',
    root_cause: 'The file pattern is a regex applied against filenames in the configured directory. An incorrect regex (wrong escaping, too strict anchoring) matches zero files and nothing syncs. Fivetran reports success with zero rows.',
    impact: 'Connection appears healthy but no data flows. Users think Fivetran is broken when it is actually matching nothing.',
    resolution: 'Leave file pattern blank to sync all files in the directory, then tighten once confirmed. Test regex against sample filenames. Remember to escape dots as \\.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Connection Fails — SSH Key or Firewall Issues',
    issue_preview: 'Cannot connect to SFTP server during setup',
    root_cause: 'SFTP requires either password or SSH key authentication. Common failures: wrong key format (must be RSA PEM), firewall blocking Fivetran IPs on port 22, server requiring specific key exchange algorithms not supported by Fivetran.',
    impact: 'Connector cannot be created. No data syncs until connectivity is resolved.',
    resolution: 'Add Fivetran IP addresses to firewall allowlist on port 22. Use RSA PEM format for SSH keys. Test connectivity with ssh -T from a machine with the same network path. For private servers, use Fivetran Proxy Agent or SSH tunnel.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Archived Files Are Re-Synced After Re-Sync Trigger',
    issue_preview: 'Historical re-sync picks up already-processed files from archive',
    root_cause: 'When archive mode moves files to a subfolder after processing, a historical re-sync may scan the archive directory and re-process old files if the folder path or pattern is too broad.',
    impact: 'Duplicate rows in destination. MAR spike from re-processing old files.',
    resolution: 'Ensure the archive directory is outside the configured folder path. Use a precise file pattern that excludes the archive subfolder.'
  }
];

async function main() {
  console.log('Seeding SFTP connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: SFTP');

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

  console.log('\nDone — SFTP: 2 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
