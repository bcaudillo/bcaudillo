// seed-postgres-rds.js
// Populates Supabase with the Fivetran Postgres RDS connector data.
// Sources:
//   https://fivetran.com/docs/connectors/databases/postgresql
//   https://fivetran.com/docs/connectors/databases/postgresql/rds-setup-guide
//   https://fivetran.com/docs/connectors/databases/postgresql/setup-guide
//   https://fivetran.com/docs/connectors/databases/postgresql/troubleshooting
//   https://fivetran.com/docs/connectors/databases/postgresql/troubleshooting/not-releasing-wal
//   https://fivetran.com/docs/connectors/databases/postgresql/troubleshooting/fix-replication-slot-errors
//   https://fivetran.com/docs/connectors/databases/postgresql/troubleshooting/logical-replication-connector-timed-out
//   https://fivetran.com/docs/connectors/databases/postgresql/troubleshooting/replication-slot-not-found
//   https://fivetran.com/docs/connectors/databases/postgresql/troubleshooting/switch-query-based-logical-replication
//
// Idempotent: upserts the connector row, deletes existing postgres_rds
// child rows, then inserts fresh data. Re-running does not create duplicates.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_ID = 'postgres_rds';

// ─── CONNECTOR RECORD ────────────────────────────────────────────────────────

const connector = {
  id: CONNECTOR_ID,
  name: 'Postgres RDS',
  category: 'databases',
  description: "Fivetran's PostgreSQL connector (Amazon RDS variant) is a fully managed database replication connector that extracts data from Amazon RDS for PostgreSQL and replicates it into your destination warehouse or data lake. It mirrors your source schemas and tables 1-to-1 — every schema in the source becomes a schema in the destination.",
  what_it_does: 'Replicates all selected schemas and tables from an Amazon RDS PostgreSQL instance to the destination. Supports three incremental sync methods: Logical Replication (WAL-based CDC via the pgoutput plugin — recommended), Fivetran Teleport Sync (proprietary XMIN-based with delete capture), and Query-Based sync (reads xmin/ctid system columns). Syncs empty tables and columns. Automatically detects schema changes (new tables, column additions, type changes). Does NOT sync foreign tables, views, or materialized views.',
  useful_for: 'Replicating production or analytics PostgreSQL databases into a warehouse for reporting, building a read replica for BI tools without loading the production instance, CDC-based real-time pipelines, migrating RDS data into a cloud warehouse, and cross-database joins when PostgreSQL is one of several operational sources.'
};

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────
// PostgreSQL is a database connector — it mirrors the customer's own schemas
// and tables rather than producing a fixed set of destination tables. We
// document the replication patterns, system columns, and key behaviors.

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: '<source_schema>.<source_table>',
    what_it_contains: 'Exact replica of the source table — all columns, rows, and data types are mirrored 1-to-1 from the RDS PostgreSQL instance to the destination. Fivetran adds system columns: _fivetran_synced (timestamp of last sync), _fivetran_deleted (soft-delete flag for CDC/logical replication).',
    why_it_matters: 'Every table the customer selects in the Schema tab is replicated. The destination schema name matches the source schema name, making joins and queries intuitive.',
    key_callouts: 'Tables require a primary key for logical replication delete tracking. Tables without a primary key can still sync but deletions will not be captured. Fivetran does NOT sync foreign tables, views, or materialized views. Composite types are not supported.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: '_fivetran_log',
    what_it_contains: 'Fivetran system log table — sync start/end timestamps, rows synced, sync status, and error messages for each sync cycle.',
    why_it_matters: 'Operational monitoring and debugging. Answers "when did the last sync run?" and "did it succeed?"',
    key_callouts: 'Automatically created in the destination schema. Not configurable — always present. Useful for building sync-health dashboards and alerting on failed syncs.'
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Excessive WAL Buildup Consumes Disk Space',
    issue_preview: 'Replication slot retains WAL files and disk usage grows unbounded',
    root_cause: 'When a Fivetran sync is interrupted (lost access, paused connector, network issues), the replication slot continues to retain WAL files on the RDS instance. The amount of additional disk space consumed is proportional to the number of changes committed on the server while the slot is inactive. Slots can grow to hundreds of GB or approach 1 TB.',
    impact: 'RDS instance runs out of storage, which can cause the database to enter read-only mode or crash. Production workloads are affected even though the issue originates from the replication pipeline.',
    resolution: 'Set max_slot_wal_keep_size to a value large enough to handle bulk updates but small enough to prevent disk bloat (Fivetran recommends at least two days of retention). Monitor replication slot size via pg_replication_slots. If the slot is stuck: pause the connector, drop the replication slot, wait for a checkpoint, recreate the slot, and resume the connector.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Logical Replication Connector Timeout (24-Hour Limit)',
    issue_preview: 'WAL-based sync times out after 24 hours with no progress',
    root_cause: 'Fivetran imposes a 24-hour timeout on logical replication syncs. If the replication slot returns no items within that window — caused by a very large transaction being injected or too many records accumulating in the WAL slot — the sync is terminated.',
    impact: 'Sync fails and must be retried. If the underlying cause is not addressed (e.g. a multi-million-row transaction), subsequent syncs will also time out, creating a cycle of failures.',
    resolution: 'Break very large transactions into smaller batches at the source. Periodically tune checkpoint_timeout and max_wal_size based on database activity. Increase wal_buffers to at least 16 MB (up to 128 MB on high-core machines). If stuck, drop and recreate the replication slot.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Replication Slot Not Found',
    issue_preview: 'Connector fails with "replication slot not found" error',
    root_cause: 'The replication slot that Fivetran created during setup has been dropped — either manually by a DBA, by an automated maintenance script, or by an RDS failover event that did not preserve the slot.',
    impact: 'All syncs fail until the slot is recreated. No data is lost in the destination, but new changes in the source are not captured.',
    resolution: 'Recreate the replication slot with the same name and pgoutput plugin. If the slot was lost due to an RDS failover, ensure the new primary has logical replication enabled (rds.logical_replication = 1) and recreate the slot. A historical re-sync may be needed to catch changes that occurred while the slot was missing.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Connection Attempt Failed — Firewall or Security Group',
    issue_preview: 'Fivetran cannot reach the RDS instance',
    root_cause: "The RDS instance's security group does not allow inbound connections from Fivetran's IP addresses, or the instance is in a private subnet with no path to Fivetran. TLS must also be enabled on the RDS instance.",
    impact: 'Connector setup fails at the connection test step. No data syncs.',
    resolution: 'Add Fivetran IP addresses to the RDS security group inbound rules on port 5432 (or your custom port). Alternatively, use an SSH tunnel, AWS PrivateLink, or Fivetran Proxy Agent to connect to private instances. Ensure TLS is enabled — Fivetran requires it for RDS connections.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Replication Slot Concurrency Error',
    issue_preview: 'Two processes try to use the same replication slot simultaneously',
    root_cause: 'A replication slot can only be consumed by one connection at a time. If another process (a second Fivetran connector, a manual pg_recvlogical session, or another CDC tool) is already reading from the same slot, subsequent connections are rejected.',
    impact: 'Sync fails with a concurrency error. The connector retries but will keep failing as long as the other consumer holds the slot.',
    resolution: 'Ensure each Fivetran connector has its own dedicated replication slot. Terminate any other sessions consuming the slot (check pg_stat_replication). Never share a replication slot between multiple connectors or tools.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Switching from Query-Based to Logical Replication Requires Re-Sync',
    issue_preview: 'Changing sync mode mid-stream triggers a full table re-sync',
    root_cause: 'Query-based and logical replication use fundamentally different change-tracking mechanisms (xmin polling vs WAL decoding). When switching from query-based to logical replication, Fivetran cannot seamlessly continue from the query-based checkpoint — a historical re-sync of all tables is required.',
    impact: 'The re-sync increases MAR consumption and sync time. During the re-sync window, the destination data may be stale for tables not yet re-processed.',
    resolution: 'Plan the switch during a low-activity window. Expect elevated MAR for the re-sync cycle. Do not switch back and forth — pick logical replication from the start if your RDS instance supports it (rds.logical_replication = 1 in the parameter group).'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Tables Without Primary Keys Cannot Track Deletes',
    issue_preview: 'Deleted rows in keyless tables persist in the destination',
    root_cause: 'Logical replication requires a primary key (or REPLICA IDENTITY FULL) to identify which row was deleted. For tables without a primary key, Fivetran syncs inserts and updates but cannot capture deletes — the deleted row remains in the destination indefinitely.',
    impact: 'Destination tables grow monotonically and include rows that no longer exist in the source. Counts and aggregations diverge from the source over time.',
    resolution: 'Add a primary key to the source table if possible. Alternatively, set REPLICA IDENTITY FULL on the table (higher WAL volume). For tables where deletes do not matter, accept the behavior and document it. Consider periodic full refreshes for keyless tables where accuracy is critical.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'statement_timeout Kills Long-Running Fivetran Queries',
    issue_preview: 'Sync fails because server-side query timeout is too aggressive',
    root_cause: 'If the PostgreSQL server has statement_timeout set to a value less than 5 minutes, Fivetran\'s initial table snapshots or large query-based syncs may be terminated by the server before they complete.',
    impact: 'Sync fails with a timeout error. Affected tables never complete their initial sync.',
    resolution: 'Set statement_timeout to 0 (disabled) or greater than 5 minutes for the Fivetran database user. This can be set per-user: ALTER ROLE fivetran_user SET statement_timeout = 0;'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Postgres RDS connector data...\n');

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
  console.log('Clearing existing postgres_rds rows in child tables...');
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

  console.log(`✅ Task 7 Complete - Postgres RDS: ${tablesCount} tables, ${issuesCount} issues`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
