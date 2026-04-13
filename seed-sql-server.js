// seed-sql-server.js
// Populates Supabase with the Fivetran SQL Server connector data.
// Sources:
//   https://fivetran.com/docs/connectors/databases/sql-server
//   https://fivetran.com/docs/connectors/databases/sql-server/setup-guide
//   https://fivetran.com/docs/connectors/databases/sql-server/troubleshooting
//   https://fivetran.com/docs/connectors/databases/sql-server/troubleshooting/ct-cdc-must-be-enabled
//   https://fivetran.com/docs/connectors/databases/sql-server/troubleshooting/table-ct-and-cdc-alteration
//   https://fivetran.com/docs/connectors/databases/sql-server/troubleshooting/add-column-with-cdc
//   https://fivetran.com/docs/connectors/databases/sql-server/troubleshooting/logical-replication-connector-timed-out
//
// Idempotent: upserts the connector row, deletes existing sql_server
// child rows, then inserts fresh data. Re-running does not create duplicates.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_ID = 'sql_server';

// ─── CONNECTOR RECORD ────────────────────────────────────────────────────────

const connector = {
  id: CONNECTOR_ID,
  name: 'SQL Server',
  category: 'databases',
  description: "Fivetran's SQL Server connector is a fully managed database replication connector that extracts data from Microsoft SQL Server (on-prem, Azure SQL, RDS, Google Cloud SQL, or Azure Managed Instance) and replicates it into your destination warehouse or data lake. It mirrors source schemas and tables, syncing views as well as base tables.",
  what_it_does: 'Replicates all selected schemas, tables, and views from a SQL Server instance to the destination. Supports four incremental sync methods: Change Tracking (CT — detects changed rows via SQL Server built-in tracking), Change Data Capture (CDC — reads detailed change records from system capture tables), Binary Log Reader (reads committed transactions directly from the SQL Server transaction log via a Fivetran DLL), and Fivetran Teleport Sync (hash-based row comparison with no dependency on SQL Server change features). Also offers a High-Volume Agent (HVA) variant for very large databases.',
  useful_for: 'Replicating ERP, CRM, or line-of-business SQL Server databases into a cloud warehouse, building read replicas for BI without loading production, CDC-based near-real-time pipelines, cross-database analytics when SQL Server is one of several operational sources, and migrating on-prem SQL Server data to the cloud.'
};

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────
// SQL Server is a database connector — it mirrors the customer's own schemas
// and tables. We document the replication patterns and system columns.

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: '<source_schema>.<source_table>',
    what_it_contains: 'Exact replica of the source table — all columns, rows, and data types are mirrored from the SQL Server instance to the destination. Fivetran adds system columns: _fivetran_synced (timestamp of last sync) and _fivetran_deleted (soft-delete flag when using CT, CDC, or Binary Log Reader).',
    why_it_matters: 'Every table the customer selects in the Schema tab is replicated. The destination schema name matches the source schema name for intuitive querying.',
    key_callouts: 'Views are also replicated (treated as tables in the destination). Computed columns are NOT synced when using CDC — CDC does not support them. Column renames are treated as a new column + deleted column (old column values set to NULL). TCP/IP must be enabled on the SQL Server instance.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: '<source_schema>.<source_view>',
    what_it_contains: 'Materialized copy of a SQL Server view — Fivetran queries the view and lands the result set as a table in the destination.',
    why_it_matters: 'Allows syncing pre-joined or pre-filtered data without requiring changes to the source schema.',
    key_callouts: 'Views sync as full refreshes (no incremental). Large views can be expensive to sync repeatedly. Consider materializing them as tables at the source if incremental sync is needed.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: '_fivetran_log',
    what_it_contains: 'Fivetran system log table — sync start/end timestamps, rows synced, sync status, and error messages for each sync cycle.',
    why_it_matters: 'Operational monitoring and debugging. Answers "when did the last sync run?" and "did it succeed?"',
    key_callouts: 'Automatically created in the destination schema. Not configurable — always present.'
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'CDC Does Not Propagate Schema Changes (New Columns, Renames, New Tables)',
    issue_preview: 'New columns and renamed columns do not appear in the destination automatically',
    root_cause: 'Due to SQL Server limitations, a CDC-enabled connection automatically propagates column type changes but does NOT propagate other schema changes — renamed columns, new tables, and new columns are not picked up. CDC instances are tied to a fixed column set at creation time.',
    impact: 'Customers add a column or rename one in the source, expect it to appear in the destination, and are confused when it does not. Renamed columns appear as a new NULL column plus the old column with all values set to NULL.',
    resolution: 'For new columns: create a new CDC instance to replace the existing one — Fivetran will then see the new columns. For renamed columns: accept the new-column + deleted-column behavior, or recreate the CDC instance. For new tables: enable CDC on the new table and add it in the Fivetran Schema tab.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'CDC Does Not Sync Computed Columns',
    issue_preview: 'Computed columns are silently excluded from CDC-based syncs',
    root_cause: 'SQL Server CDC does not support computed columns. Since CDC reads from system capture tables that exclude computed columns, Fivetran never sees them.',
    impact: 'Columns that are computed at the source (e.g. calculated fields, PERSISTED computed columns) do not appear in the destination. Downstream reports that expect these columns fail.',
    resolution: 'Materialize the computed column as a regular column in a view or staging table, then sync that instead. Alternatively, recreate the computation in the destination via a dbt model or warehouse view.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Change Tracking / CDC Must Be Enabled Before Table Selection',
    issue_preview: 'Tables appear unselectable in the Schema tab without CT or CDC enabled',
    root_cause: 'When the connector is configured for Change Tracking or CDC incremental sync, each source table must have CT or CDC explicitly enabled at the database and table level in SQL Server. Tables without it enabled cannot be selected for sync in Fivetran.',
    impact: 'Customers see tables grayed out or missing from the Schema tab and think Fivetran is broken. The real issue is a missing server-side configuration.',
    resolution: 'Enable Change Tracking at the database level (ALTER DATABASE ... SET CHANGE_TRACKING = ON) and at each table level (ALTER TABLE ... ENABLE CHANGE_TRACKING). For CDC: EXEC sys.sp_cdc_enable_db and EXEC sys.sp_cdc_enable_table for each table. Alternatively, switch to Teleport Sync or Binary Log Reader which do not require per-table enablement.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Connection Attempt Failed — Firewall, TCP/IP, or Named Instance',
    issue_preview: 'Fivetran cannot reach the SQL Server instance',
    root_cause: 'SQL Server requires TCP/IP to be explicitly enabled (it is often disabled by default on named instances). Additionally, firewalls may block Fivetran IPs, or the instance may be on a private network. Named instances can only be used with direct or private link connection methods.',
    impact: 'Connector setup fails at the connection test step. No data syncs.',
    resolution: 'Enable TCP/IP protocol in SQL Server Configuration Manager for both the instance and the SQL Server Native Client. Add Fivetran IP addresses to firewall rules on port 1433 (or custom port). For named instances, use direct connection or AWS PrivateLink. For private networks, use an SSH tunnel or Fivetran Proxy Agent.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Timeout Settings Kill Long-Running Syncs',
    issue_preview: 'SQL Server terminates Fivetran queries before they complete',
    root_cause: 'SQL Server has multiple timeout settings — remote login timeout, remote query timeout, and query wait — that can terminate long-running queries. If these are set too low, Fivetran\'s initial table snapshots or large incremental syncs are killed before they finish.',
    impact: 'Sync failures on large tables. Initial historical syncs are especially vulnerable since they scan entire tables.',
    resolution: 'Update remote login timeout, remote query timeout, and query wait values to accommodate the expected sync duration. Set query wait to at least 5 minutes. For very large initial syncs, consider increasing these temporarily and reducing after the historical sync completes.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Change Tracking Retention Period Too Short',
    issue_preview: 'CT data expires before Fivetran syncs it, causing a full re-sync',
    root_cause: 'SQL Server Change Tracking has a configurable retention period (default: 2 days). If Fivetran does not sync within the retention window — due to a paused connector, long sync cycle, or outage — the CT data expires and Fivetran must perform a full table re-sync to re-establish the baseline.',
    impact: 'Unexpected full re-syncs increase MAR consumption and sync duration. The connector may appear to "reset" without warning.',
    resolution: 'Increase the CT retention period: ALTER DATABASE ... SET CHANGE_TRACKING (CHANGE_RETENTION = 7 DAYS). Match it to your worst-case sync gap (maintenance windows, holidays, outages). Monitor the Fivetran dashboard for re-sync warnings.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'History Mode Delays with Change Tracking on Linux',
    issue_preview: 'Syncs with history mode enabled run significantly slower on SQL Server for Linux',
    root_cause: 'When using Change Tracking with history mode enabled on SQL Server running on Linux, syncs experience significant performance degradation compared to the same configuration on Windows.',
    impact: 'Sync durations are much longer than expected. Data freshness degrades, and the connector may fall behind its scheduled sync interval.',
    resolution: 'Disable history mode if it is not required. If history mode is necessary, consider running the SQL Server instance on Windows instead of Linux, or switch to CDC which does not have the same Linux performance issue.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'CDC Schema Tables Not Visible in Schema Tab',
    issue_preview: 'CDC system tables do not appear in the Fivetran Schema tab',
    root_cause: 'SQL Server CDC creates system capture tables (cdc.* schema) to track changes. These system tables are internal to the CDC mechanism and are not intended to be synced directly — Fivetran reads them behind the scenes but does not expose them in the Schema tab.',
    impact: 'Customers look for cdc.* tables in Fivetran and think CDC is not working because they cannot see the capture tables. This is expected behavior.',
    resolution: 'Explain that CDC capture tables are internal plumbing. Fivetran reads them automatically and applies the changes to the main destination tables. The customer should look at their regular tables in the Schema tab, not cdc.* system tables.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding SQL Server connector data...\n');

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
  console.log('Clearing existing sql_server rows in child tables...');
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

  console.log(`✅ Task 8 Complete - SQL Server: ${tablesCount} tables, ${issuesCount} issues`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
