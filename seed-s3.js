// seed-s3.js
// Populates Supabase with the Fivetran Amazon S3 connector data.
// Sources:
//   https://fivetran.com/docs/connectors/files/amazon-s3
//   https://fivetran.com/docs/connectors/files/amazon-s3/setup-guide
//   https://fivetran.com/docs/connectors/files/amazon-s3/troubleshooting
//   https://fivetran.com/docs/connectors/files/troubleshooting
//
// Idempotent: upserts the connector row, deletes existing s3 child rows,
// then inserts fresh data. Re-running does not create duplicates.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_ID = 's3';

// ─── CONNECTOR RECORD ────────────────────────────────────────────────────────

const connector = {
  id: CONNECTOR_ID,
  name: 'Amazon S3',
  category: 'cloud-storage',
  description: "Fivetran's Amazon S3 connector is a file-sync pull connector that periodically scans a configured S3 bucket (or prefix) for new or changed files, parses them, and loads them into user-defined destination tables in your warehouse.",
  what_it_does: 'Syncs files from S3 in a wide range of formats — CSV, TSV, JSON, JSONL, XML, Avro, Parquet, Excel/spreadsheets, and PGP-signed/encrypted files. Mapping is configured by file pattern (regex): each pattern maps to one destination table. Supports IAM Role and Access Key authentication.',
  useful_for: "Landing vendor data drops, partner file exchanges, exporting data from systems that only publish to S3, ingesting warehouse backups or ETL staging files, and migrating historical data that lives as files rather than behind an API. Also the bridge for customers whose source-of-truth is their own data lake."
};

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────
// S3 has no fixed schema — destination tables are user-defined via File Mapping.
// Each "table" is one file pattern mapped to one destination table name.
// We capture the pattern plus the surrogate columns Fivetran always adds.

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: '<user_defined>',
    what_it_contains: 'One destination row per row in matched files. Columns are inferred from the file — CSV headers, JSON keys, Parquet schema, etc. Fivetran also adds surrogate columns for lineage and primary-key purposes.',
    why_it_matters: 'There is no canonical S3 schema — customers define each table by mapping a file-pattern regex to a destination table name. Every S3 connection can produce N tables, one per file pattern.',
    key_callouts: "Fivetran always adds the following surrogate columns: _file (source file name), _line (row number in the file), and in append mode _modified (file modified timestamp). These are part of the default primary key unless a custom primary key is configured. Empty-valued columns in the source are NOT created in the destination — Fivetran only materializes columns that have at least one non-empty value."
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Empty or All-NULL Columns Are Not Created in the Destination',
    issue_preview: 'Columns from the source file silently disappear if they contain no data',
    root_cause: "The S3 connector only materializes a column in the destination table if that column in the source file has at least one non-empty value. When a column header exists but every value below it is NULL or blank, Fivetran cannot infer a type and skips the column entirely.",
    impact: "Destination tables appear to be missing columns. Dashboards and downstream queries that reference those columns fail with 'column does not exist' errors — even though the column is visibly present in the source CSV header.",
    resolution: 'Ensure every column has at least one non-empty row, or add placeholder data to force the column into the schema. Once a non-empty value lands for that column, Fivetran will create it on the next sync. For persistently empty columns, document them as intentionally not synced.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'CSV Delimiter Limited to 15 Characters',
    issue_preview: 'Multi-character delimiters fail if longer than 15 characters',
    root_cause: 'The connector supports multi-character delimiters for CSV files, but the maximum length is capped at 15 characters. Anything longer is rejected during configuration or causes the sync to fail.',
    impact: 'Files using unusual long delimiters (e.g. custom markers like `|||DELIM|||||`) cannot be synced without changing the source file format.',
    resolution: 'Shorten the delimiter at the source, preprocess the file to use a shorter one before dropping it in S3, or switch to a standard single-character delimiter like `,`, `\\t`, or `|`.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Primary Key Mode Affects Duplicates and History',
    issue_preview: 'Choosing the wrong primary key strategy produces unexpected duplicates or lost history',
    root_cause: 'The connector offers three primary key strategies: (1) Upsert using file name + line number (surrogate keys _file + _line), (2) Append using file modified time (surrogate keys _file + _line + _modified), and (3) Upsert using a custom primary key from the file itself. Each produces different destination-table behavior.',
    impact: 'Picking Append when you meant Upsert leads to duplicate rows as files are re-dropped. Picking Upsert with surrogate keys when you have a real natural key in the file means edits to existing records do not apply cleanly — the old row stays alongside the new one.',
    resolution: 'For immutable file drops (daily exports), use Upsert with _file + _line. For files where the same logical record may be updated across files, use Upsert with a custom primary key (the natural key from the file). For audit/event logs where every file version should be kept, use Append with _modified.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'New Columns Blocked by Schema Change Handling',
    issue_preview: "Adding a new column to a file doesn't make it appear in the destination",
    root_cause: "Schema Change Handling settings control whether new columns/tables are automatically added. If the connection is set to 'Block all new data', new columns in incoming files are not synced to the destination — even though Fivetran sees them.",
    impact: 'Customers add a column to their CSV, expect it to show up in the warehouse, and are confused when it does not appear. No error is raised — the column is silently blocked.',
    resolution: "Change Schema Change Handling to 'Allow all new data' (or 'Allow new columns only') in the connection's Schema tab. Then trigger a manual sync. The new column appears on the next run."
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'File Pattern Regex Must Match Exactly or Nothing Syncs',
    issue_preview: "A typo in the file pattern regex means Fivetran sees an empty bucket",
    root_cause: 'The file pattern is a regular expression applied against file names under the configured prefix. If the regex is wrong — missing escape characters, anchored incorrectly, or too strict — it matches zero files and nothing syncs.',
    impact: "The connection reports successful syncs with zero rows processed. Customers think Fivetran 'is not working' when it is actually configured to match nothing.",
    resolution: "Leave the file pattern blank to sync everything under the prefix, then tighten once you confirm the pipeline works. When using a regex, test it against sample file names first. Remember that `.` must be escaped as `\\.` to match a literal dot."
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Amazon S3 connector data...\n');

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
  console.log('Clearing existing s3 rows in child tables...');
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

  console.log(`✅ Task 5 Complete - S3: ${tablesCount} tables, ${issuesCount} issues`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
