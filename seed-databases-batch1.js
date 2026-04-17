// seed-databases-batch1.js
// Populates Supabase with 5 Fivetran database connectors (batch 1):
//   mysql_rds, mysql, oracle, mongo, dynamodb
// Sources:
//   https://fivetran.com/docs/connectors/databases/mysql
//   https://fivetran.com/docs/connectors/databases/mysql/rds-setup-guide
//   https://fivetran.com/docs/connectors/databases/oracle/oracle-connector
//   https://fivetran.com/docs/connectors/databases/mongodb
//   https://fivetran.com/docs/connectors/databases/dynamodb
//
// Idempotent: upserts the connector rows, deletes existing child rows
// for each of these connector_ids, then inserts fresh data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_IDS = ['mysql_rds', 'mysql', 'oracle', 'mongo', 'dynamodb'];

// ─── CONNECTORS ──────────────────────────────────────────────────────────────

const connectors = [
  {
    id: 'mysql_rds',
    name: 'MySQL RDS',
    category: 'databases',
    description: "Fivetran's MySQL connector (Amazon RDS variant) replicates data from an Amazon RDS for MySQL instance into your destination warehouse via row-based binary log replication (binlog).",
    what_it_does: 'Streams changes from the MySQL binary log in ROW format for incremental updates. Also supports Fivetran Teleport Sync as an agentless alternative. Mirrors source schemas and tables 1-to-1. Supports GTID-based streaming. Requires row-based binlog with at least 1 day of retention.',
    useful_for: 'Replicating RDS MySQL production databases for analytics, BI read replicas, cross-database warehouse reporting, and migrations from RDS to cloud warehouses.'
  },
  {
    id: 'mysql',
    name: 'MySQL',
    category: 'databases',
    description: "Fivetran's generic MySQL connector replicates data from a self-managed or cloud-hosted MySQL instance (outside of RDS/Aurora/Google Cloud SQL, which have their own variants) into your destination warehouse.",
    what_it_does: 'Offers two incremental sync methods: Binary Log streaming (requires ROW format) and Fivetran Teleport Sync (hash-based comparison, no binlog required). Mirrors source schemas and tables. Streams delete events from the binlog. Handles schema changes (column add/drop) automatically, with auto re-sync for incompatible changes.',
    useful_for: 'Self-hosted MySQL replication, on-prem database analytics, and customer-managed MySQL instances that do not fit the RDS/Aurora/Google Cloud SQL variants.'
  },
  {
    id: 'oracle',
    name: 'Oracle',
    category: 'databases',
    description: "Fivetran's Oracle connector replicates tables and materialized views from an Oracle database into your destination warehouse. Supports the standard Oracle connector and the separate High-Volume Agent (HVA) variant for very large instances.",
    what_it_does: 'Offers three incremental sync methods: Binary Log Reader (new proprietary method that reads Oracle redo log files directly, agentless), Fivetran Teleport Sync (hash-based snapshot comparison), and LogMiner (sunset — end of support April 15, 2026; syncs stop May 15, 2026). Replicates tables and materialized views.',
    useful_for: 'Oracle-to-cloud-warehouse replication, legacy enterprise data movement, migrations off Oracle, and analytics pipelines where Oracle is a system of record.'
  },
  {
    id: 'mongo',
    name: 'MongoDB',
    category: 'databases',
    description: "Fivetran's MongoDB connector replicates collections from a MongoDB Replica Set or sharded cluster (including MongoDB Atlas) into your destination warehouse, flattening documents into relational tables.",
    what_it_does: 'Pulls an initial full dump, then uses MongoDB Change Streams (preferred) or oplog tailing for incremental updates. Change streams are faster and support multi-document transactions. Adds _fivetran_deleted and _fivetran_synced columns to every destination table. Supports collection-level granular access.',
    useful_for: 'Replicating MongoDB-backed application data into a relational warehouse for SQL analytics, joining NoSQL product data with SQL CRM/marketing data, and migrating document-store data to cloud warehouses.'
  },
  {
    id: 'dynamodb',
    name: 'Amazon DynamoDB',
    category: 'databases',
    description: "Fivetran's Amazon DynamoDB connector replicates items from DynamoDB tables into your destination warehouse using DynamoDB Streams for change data capture.",
    what_it_does: 'Pulls a full initial dump, then uses DynamoDB Streams (24-hour retention) for incremental updates. Offers "packed" and "unpacked" pack modes — packed stores each item as a JSON blob, unpacked expands top-level attributes into columns. Switching pack modes triggers a full re-sync. Auto-triggers re-sync if streams expire.',
    useful_for: 'Replicating DynamoDB-backed serverless application data into a relational warehouse, blending NoSQL workloads with SQL reporting, and powering analytics off of high-throughput AWS-native apps.'
  }
];

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────

const connectorTables = [
  // mysql_rds
  {
    connector_id: 'mysql_rds',
    table_name: '<source_schema>.<source_table>',
    what_it_contains: 'Exact 1-to-1 mirror of each selected source MySQL table. Fivetran adds _fivetran_synced and _fivetran_deleted columns. Requires binlog_format=ROW for incremental sync.'
  },
  {
    connector_id: 'mysql_rds',
    table_name: '_fivetran_log',
    what_it_contains: 'Sync start/end timestamps, row counts, and error messages for each sync cycle.'
  },
  // mysql
  {
    connector_id: 'mysql',
    table_name: '<source_schema>.<source_table>',
    what_it_contains: 'Exact 1-to-1 mirror of each selected source MySQL table. Fivetran streams binlog events (inserts, updates, deletes) into the destination. Schema name maps directly to the source MySQL schema name.'
  },
  {
    connector_id: 'mysql',
    table_name: '_fivetran_log',
    what_it_contains: 'Sync start/end timestamps, row counts, and error messages for each sync cycle.'
  },
  // oracle
  {
    connector_id: 'oracle',
    table_name: '<source_schema>.<source_table>',
    what_it_contains: 'Exact 1-to-1 mirror of each selected Oracle table. Fivetran adds _fivetran_synced and _fivetran_deleted columns. Sync method (Binary Log Reader, Teleport, or legacy LogMiner) determines how deletes are captured.'
  },
  {
    connector_id: 'oracle',
    table_name: '<source_schema>.<materialized_view>',
    what_it_contains: 'Replica of Oracle materialized views (explicitly supported by the Oracle connector, unlike most other database connectors).'
  },
  // mongo
  {
    connector_id: 'mongo',
    table_name: '<database>.<collection>',
    what_it_contains: 'Flattened relational representation of each MongoDB collection. Top-level document fields become columns. Nested documents and arrays may be unpacked into child tables or stored as JSON strings. Fivetran adds _fivetran_deleted (BOOLEAN) and _fivetran_synced (TIMESTAMP) to every table.'
  },
  // dynamodb
  {
    connector_id: 'dynamodb',
    table_name: '<dynamodb_table>',
    what_it_contains: 'Replica of each selected DynamoDB table. In "unpacked" mode, top-level attributes become columns. In "packed" mode, the entire item is stored as a single JSON column. Uses DynamoDB Streams for CDC.'
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  // mysql_rds
  {
    connector_id: 'mysql_rds',
    issue_title: 'Binlog Must Be Row-Based With ≥1 Day Retention',
    issue_preview: 'Incremental sync fails if binlog_format is not ROW or retention is too short',
    root_cause: 'Fivetran requires binlog_format=ROW to capture full row images for CDC. MySQL also requires the binary log to retain at least 1 day of changes so Fivetran can resume after brief outages.',
    impact: 'Initial connection fails at Fivetran validation, or — worse — passes validation but silently drops events after the first sync pause longer than the retention window. Destination rows diverge from source with no loud error in the dashboard, and the gap is usually only discovered during a downstream data audit.',
    resolution: 'In the RDS parameter group, set binlog_format=ROW and binlog retention hours ≥ 24. Restart the instance if required. For replicas, set slave_parallel_type=LOGICAL_CLOCK to keep events sequential.'
  },
  {
    connector_id: 'mysql_rds',
    issue_title: 'Unsupported DML Commands Cause Replication Gaps',
    issue_preview: 'Non-standard updates or deletes do not replicate',
    root_cause: 'If a DDL/DML command does not emit a standard binlog ROW event (e.g. certain ALTER TABLE operations, non-transactional DML), Fivetran cannot capture the change and destination rows diverge from source.',
    impact: 'Destination rows drift from source without any error in the Fivetran dashboard. Downstream reports, joins, and aggregates become subtly wrong and are typically only caught when analysts spot-check a value against the source system.',
    resolution: 'Avoid non-transactional or schema-destructive commands on synced tables. Use standard INSERT/UPDATE/DELETE. If a gap is suspected, trigger a historical re-sync of the affected table.'
  },
  // mysql
  {
    connector_id: 'mysql',
    issue_title: 'Schema Changes May Trigger Automatic Re-Sync',
    issue_preview: 'Some column changes cause Fivetran to re-sync the whole table',
    root_cause: 'When Fivetran cannot cleanly migrate a destination schema to match a new source column layout (e.g. incompatible type changes, renames), it falls back to a full re-sync of the affected table.',
    impact: 'An unannounced re-sync on a large OLTP table can spike MAR for the month, saturate source IOPS during business hours, and delay downstream dashboards until the re-sync completes. Customers on tight MAR budgets can hit overages without warning.',
    resolution: 'Coordinate schema changes with the Fivetran team. For large tables, avoid mid-sync column type changes. Monitor the Fivetran dashboard for re-sync warnings and plan MAR impact accordingly.'
  },
  // oracle
  {
    connector_id: 'oracle',
    issue_title: 'LogMiner Sync Method Is Sunset',
    issue_preview: 'LogMiner connections stop syncing after May 15, 2026',
    root_cause: 'Oracle LogMiner has operational limitations (30-character name limit, heavy CPU cost on the source) and Fivetran has sunsetted it. Support ends April 15, 2026; syncs stop May 15, 2026.',
    impact: 'On the cutover date, LogMiner-based Oracle connections stop syncing entirely. Reports and pipelines built on that Oracle data go stale the next day with no automatic fallback — customers must migrate to Binary Log Reader or Teleport Sync, or they lose the pipeline.',
    resolution: 'Migrate existing LogMiner connections to Binary Log Reader (recommended) or Fivetran Teleport Sync before April 15, 2026. New Oracle connections cannot select LogMiner.'
  },
  {
    connector_id: 'oracle',
    issue_title: 'LogMiner Cannot Sync Tables or Columns With Names >30 Characters',
    issue_preview: 'Tables with long names are silently skipped on LogMiner',
    root_cause: 'Oracle LogMiner does not support object names longer than 30 characters. Tables or columns with longer names cannot be captured.',
    impact: 'Affected tables and columns never land in the destination. Fivetran does not raise a hard error, so customers usually only notice when an expected table is missing from the warehouse schema or a column returns no data in a report.',
    resolution: 'Switch to Binary Log Reader or Teleport Sync — both support the full Oracle 128-character object name limit. If staying on LogMiner, rename affected objects to fit the 30-character cap.'
  },
  // mongo
  {
    connector_id: 'mongo',
    issue_title: 'Documents Larger Than 16 MB Are Skipped',
    issue_preview: 'Large documents never land in the destination',
    root_cause: 'Fivetran only syncs MongoDB documents smaller than 16 MB. Documents at or above that size are skipped with a warning.',
    impact: 'The specific large documents are silently missing from the destination — only the size warning in the Fivetran log reveals the gap. Downstream counts and aggregates are under-reported for collections that mix small and large documents, often without the data team noticing.',
    resolution: 'Restructure large documents into smaller nested collections at the source. Alternatively, extract the specific fields needed into a separate collection that stays under 16 MB per document.'
  },
  {
    connector_id: 'mongo',
    issue_title: 'Atlas Free/Low-Tier Instances Not Supported',
    issue_preview: 'Sync fails on M0, M2, and M5 MongoDB Atlas clusters',
    root_cause: 'MongoDB Atlas tiers M0, M2, and M5 do not provide oplog access, which Fivetran requires as a fallback when change streams are unavailable.',
    impact: 'PoCs and trials built on free/low-tier Atlas clusters cannot connect at all. The customer has to upgrade Atlas to M10+ (a real cost jump) before they can even validate the Fivetran integration, which stalls evaluations.',
    resolution: 'Upgrade the Atlas cluster to M10 or higher. Alternatively, use a self-managed MongoDB Replica Set that exposes the oplog.'
  },
  // dynamodb
  {
    connector_id: 'dynamodb',
    issue_title: 'Stream Retention Is Only 24 Hours',
    issue_preview: 'Long sync gaps cause stream cursor expiry and force a full re-sync',
    root_cause: 'DynamoDB Streams retain change events for only 24 hours. If Fivetran cannot read the stream within that window (outage, paused connector), the cursor expires and captured changes are lost.',
    impact: 'Any Fivetran outage or paused connector longer than 24 hours forces a full re-sync of every DynamoDB table, driving a large one-time MAR spike and blocking downstream freshness SLAs until the re-sync finishes. Large tables can take hours.',
    resolution: 'Keep sync cadence well under 24 hours. Monitor for paused connectors. When a stream expires, Fivetran automatically triggers a full source re-sync to restore consistency — plan MAR impact accordingly.'
  },
  {
    connector_id: 'dynamodb',
    issue_title: 'Changing Pack Mode Forces a Full Re-Sync',
    issue_preview: 'Switching between packed and unpacked triggers full re-import',
    root_cause: 'Packed mode stores each DynamoDB item as a single JSON column; unpacked mode expands attributes into columns. The destination schemas are incompatible, so switching modes requires a full re-sync.',
    impact: 'Switching modes mid-pipeline triggers a full re-import of every configured DynamoDB table, doubling MAR for that sync cycle and temporarily breaking downstream queries that depend on the old column layout until models are updated.',
    resolution: 'Pick the right pack mode at setup and stick with it. If switching is required, schedule the re-sync during a low-activity window and expect elevated MAR. Unpacked is preferred for SQL-style analytics; packed is better for irregular or deeply nested items.'
  },
  // ─── NEW: additional issues to reach RICH tier ─────────────
  // mysql_rds (+1)
  {
    connector_id: 'mysql_rds',
    issue_title: 'GTID Mode Required for Reliable Multi-AZ Failover Recovery',
    issue_preview: 'Connector loses binlog position after an RDS failover without GTID',
    root_cause: 'Without Global Transaction Identifiers (GTID), Fivetran tracks its position using binlog file + offset. During a Multi-AZ failover, the new primary starts a fresh binlog file, and the old offset becomes meaningless.',
    impact: 'After a failover, the connector cannot resume incremental sync and triggers a full re-sync of all tables. For large databases this means hours of downtime and a massive MAR spike — and failovers can happen without warning during AWS maintenance windows.',
    resolution: 'Enable GTID in the RDS parameter group (gtid_mode=ON, enforce_gtid_consistency=ON). This lets Fivetran resume from the exact transaction ID regardless of which binlog file is active. Requires a brief reboot of the RDS instance.'
  },
  // mysql (+2)
  {
    connector_id: 'mysql',
    issue_title: 'Binary Log Expiration Too Short Causes Unexpected Re-Sync',
    issue_preview: 'Binlog files expire before Fivetran reads them',
    root_cause: 'MySQL 8.0+ uses binlog_expire_logs_seconds (default 2592000 = 30 days), but some DBAs set it aggressively low to save disk space. If logs expire before Fivetran processes them, the connector loses its read position.',
    impact: 'The connector silently falls behind, then triggers a full historical re-sync when it detects the gap. For multi-terabyte databases this can take days and spike MAR well beyond budget. No warning is surfaced until the re-sync begins.',
    resolution: 'Set binlog_expire_logs_seconds to at least 86400 (24 hours) — ideally 7 days for connectors with infrequent sync schedules. Monitor Fivetran dashboard for "re-sync" warnings that may indicate binlog loss.'
  },
  {
    connector_id: 'mysql',
    issue_title: 'Teleport Sync Requires a Primary Key on Every Table',
    issue_preview: 'Tables without primary keys fall back to full refresh every cycle',
    root_cause: 'Fivetran Teleport Sync uses hash-based row comparison to detect changes. Without a primary key, it cannot identify which rows changed and must re-read the entire table on every sync cycle.',
    impact: 'PK-less tables are effectively full-refresh, which scales poorly as the table grows. A 10M-row table without a PK consumes 10M MAR on every sync rather than just the changed rows — often a surprise on the monthly invoice.',
    resolution: 'Add primary keys to all synced tables. If the source schema cannot be modified, switch those tables to binlog-based sync (which tracks changes by log position, not row identity) or accept the full-refresh MAR cost.'
  },
  // oracle (+1)
  {
    connector_id: 'oracle',
    issue_title: 'Binary Log Reader Requires ARCHIVELOG Mode',
    issue_preview: 'Redo logs are overwritten before Fivetran can read them in NOARCHIVELOG',
    root_cause: 'Oracle Binary Log Reader reads redo log files for CDC. In NOARCHIVELOG mode, Oracle overwrites redo logs as soon as they are full, so Fivetran cannot read historical changes.',
    impact: 'The connector fails to capture any incremental changes — every sync becomes a full refresh. On large Oracle databases (common in enterprise), this makes the pipeline unusable due to extreme MAR costs and sync durations.',
    resolution: 'Switch the Oracle database to ARCHIVELOG mode (ALTER DATABASE ARCHIVELOG). This preserves redo logs until Fivetran reads them. Ensure sufficient disk space for archived logs and configure an appropriate retention policy.'
  },
  // mongo (+1)
  {
    connector_id: 'mongo',
    issue_title: 'Deeply Nested Documents Create Extremely Wide Destination Tables',
    issue_preview: 'Flattened collections produce hundreds of sparse columns',
    root_cause: 'Fivetran flattens nested MongoDB documents into relational columns (e.g., address.city → address_city). Deeply nested or polymorphic documents create a new column for every unique key path across all documents in the collection.',
    impact: 'Destination tables accumulate hundreds of mostly-NULL columns over time. Query performance degrades, warehouse storage costs increase, and BI tools struggle to display or filter on wide, sparse schemas.',
    resolution: 'Limit unpacking depth at the collection level in Fivetran settings. For collections with highly variable schemas, consider restructuring documents at the source or syncing only the top-level fields needed for analytics.'
  },
  // dynamodb (+1)
  {
    connector_id: 'dynamodb',
    issue_title: 'Unpacked Mode Accumulates Columns From Schema-Less Items',
    issue_preview: 'Destination tables grow wider over time as new attributes appear',
    root_cause: 'In unpacked mode, Fivetran maps each top-level DynamoDB attribute to a destination column. When different items have different attributes (common in schema-less DynamoDB patterns), every new attribute ever seen creates a permanent column.',
    impact: 'The destination table grows wider over time with many NULL columns. Schema drift warnings fire under strict schema-change-handling settings, potentially blocking new attributes from syncing. Wide tables also degrade warehouse query performance.',
    resolution: 'Use packed mode for schema-less workloads (stores items as a single JSON column, queryable via warehouse JSON functions). For unpacked mode, standardize item attributes at the application layer and use schema-change-handling set to "Allow all" to avoid blocked columns.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Seeding database connectors batch 1 (${CONNECTOR_IDS.join(', ')})...\n`);

  // 1. Upsert connector rows
  console.log('Upserting connector records...');
  for (const c of connectors) {
    const { error } = await supabase
      .from('connectors')
      .upsert(
        {
          ...c,
          created_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        },
        { onConflict: 'id' }
      );
    if (error) {
      console.error(`Error upserting connector ${c.id}:`, error);
    } else {
      console.log(`  Upserted: ${c.name}`);
    }
  }
  console.log('');

  // 2. Clear existing child rows for all 5 connectors
  console.log('Clearing existing child rows...');
  const { error: delTablesErr } = await supabase
    .from('connector_tables')
    .delete()
    .in('connector_id', CONNECTOR_IDS);
  if (delTablesErr) console.error('Warning clearing connector_tables:', delTablesErr);

  const { error: delIssuesErr } = await supabase
    .from('connector_known_issues')
    .delete()
    .in('connector_id', CONNECTOR_IDS);
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
      console.error(`Error inserting table ${table.connector_id}/${table.table_name}:`, error);
    } else {
      console.log(`  ${table.connector_id}: ${table.table_name}`);
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
      console.error(`Error inserting issue ${issue.connector_id}/"${issue.issue_title}":`, error);
    } else {
      console.log(`  ${issue.connector_id}: ${issue.issue_title}`);
    }
  }
  console.log('');

  // 5. Verify counts
  console.log('Verifying inserted rows...');
  const { count: connectorsCount } = await supabase
    .from('connectors')
    .select('*', { count: 'exact', head: true })
    .in('id', CONNECTOR_IDS);
  const { count: tablesCount } = await supabase
    .from('connector_tables')
    .select('*', { count: 'exact', head: true })
    .in('connector_id', CONNECTOR_IDS);
  const { count: issuesCount } = await supabase
    .from('connector_known_issues')
    .select('*', { count: 'exact', head: true })
    .in('connector_id', CONNECTOR_IDS);

  console.log(`  connectors              (in ${CONNECTOR_IDS.length} ids): ${connectorsCount}`);
  console.log(`  connector_tables        (in ${CONNECTOR_IDS.length} ids): ${tablesCount}`);
  console.log(`  connector_known_issues  (in ${CONNECTOR_IDS.length} ids): ${issuesCount}\n`);

  console.log(`✅ Task 11 Complete - Databases Batch 1: ${connectorsCount} connectors, ${tablesCount} tables, ${issuesCount} issues`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
