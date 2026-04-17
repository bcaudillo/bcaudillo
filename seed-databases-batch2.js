// seed-databases-batch2.js
// Populates Supabase with 5 Fivetran database connectors (batch 2):
//   azure_sql_db, mariadb, aurora, aurora_postgres, heroku_postgres
// Sources:
//   https://fivetran.com/docs/connectors/databases/sql-server/azure-setup-guide
//   https://fivetran.com/docs/connectors/databases/mariadb
//   https://fivetran.com/docs/connectors/databases/mariadb/setup-guide
//   https://fivetran.com/docs/connectors/databases/mysql/aurora-setup-guide
//   https://fivetran.com/docs/connectors/databases/postgresql/aurora-configuration
//   https://fivetran.com/docs/connectors/databases/postgresql/heroku-setup-guide
//
// Idempotent: upserts connector rows, deletes existing child rows for
// these connector_ids, then inserts fresh data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_IDS = ['azure_sql_db', 'mariadb', 'aurora', 'aurora_postgres', 'heroku_postgres'];

// ─── CONNECTORS ──────────────────────────────────────────────────────────────

const connectors = [
  {
    id: 'azure_sql_db',
    name: 'Azure SQL Database',
    category: 'databases',
    description: "Fivetran's Azure SQL Database connector is a variant of the SQL Server connector tailored for Microsoft Azure SQL Database. Authenticates via Entra ID (formerly Azure AD) and supports multiple Azure-native auth methods.",
    what_it_does: 'Replicates selected databases, schemas, and tables from Azure SQL Database using Change Tracking, Change Data Capture, Binary Log Reader, or Fivetran Teleport Sync. Supports Service Principal + client secret, Managed Identity (system- or user-assigned), and certificate-based authentication. Can connect via direct, SSH tunnel, or Azure Private Link.',
    useful_for: 'Replicating Azure-hosted SQL Server workloads into a cloud warehouse, Entra-authenticated enterprise analytics pipelines, and migrating Azure SQL data to destinations like Snowflake, BigQuery, or Databricks.'
  },
  {
    id: 'mariadb',
    name: 'MariaDB',
    category: 'databases',
    description: "Fivetran's MariaDB connector replicates data from a self-managed or cloud-hosted MariaDB instance into your destination warehouse using row-based binary log replication.",
    what_it_does: 'Pulls a full initial dump, then streams changes from the MariaDB binary log (ROW format required). Requires SELECT, REPLICATION CLIENT, and REPLICATION SLAVE grants (plus BINLOG MONITOR on MariaDB 10.6+). Version 11.4+ requires binlog_legacy_event_pos=ON. Versions before 10.1.2 have known fractional-second issues.',
    useful_for: 'Replicating MariaDB-backed OLTP databases for analytics, open-source MySQL-fork workloads, and customers on MariaDB who want the same pipeline as MySQL users.'
  },
  {
    id: 'aurora',
    name: 'Amazon Aurora MySQL',
    category: 'databases',
    description: "Fivetran's Amazon Aurora MySQL connector replicates data from an Aurora MySQL-compatible cluster into your destination warehouse using binary log replication from the primary node.",
    what_it_does: 'Connects as a replica to the primary Aurora node and streams row-based binlog events for CDC. Requires TLS, a unique replica ID, and access to mysql.rds_heartbeat2 and mysql.rds_configuration. Supports direct, SSH tunnel, AWS PrivateLink, and Proxy Agent connection methods.',
    useful_for: 'Aurora-to-cloud-warehouse replication, analytics off Aurora-backed apps, and enterprise MySQL-compatible workloads needing CDC without loading the primary.'
  },
  {
    id: 'aurora_postgres',
    name: 'Amazon Aurora PostgreSQL',
    category: 'databases',
    description: "Fivetran's Amazon Aurora PostgreSQL connector replicates data from an Aurora PostgreSQL-compatible cluster into your destination using WAL-based logical replication (pgoutput plugin) or query-based sync.",
    what_it_does: 'Supports Logical Replication (Aurora PG 10+ only, primary-node only, via pgoutput), Query-Based sync (reads xmin/ctid), and Fivetran Teleport Sync. Replication slots retain WAL files when the sync is interrupted — monitor for buildup. Does NOT replicate data from generated columns. ALTER TABLE ADD COLUMN SET DEFAULT requires a full table re-sync.',
    useful_for: 'Aurora PG-to-cloud-warehouse pipelines, WAL-based CDC for production workloads, and blending Aurora data with other operational sources in the warehouse.'
  },
  {
    id: 'heroku_postgres',
    name: 'Heroku Postgres',
    category: 'databases',
    description: "Fivetran's Heroku Postgres connector replicates data from a Heroku-managed PostgreSQL database into your destination warehouse. Heroku Postgres is built on standard PostgreSQL but has some platform-specific limitations.",
    what_it_does: 'Uses Query-Based incremental sync (xmin polling) — Heroku Postgres does NOT support logical replication. Supports client certificate authentication for Private and Shield tiers. Follows the same general configuration as the generic PostgreSQL connector but cannot leverage WAL-based CDC.',
    useful_for: 'Replicating Heroku-hosted application databases for analytics, Heroku-to-warehouse pipelines for SaaS products built on Heroku, and migrating Heroku Postgres data to cloud warehouses.'
  }
];

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────

const connectorTables = [
  // azure_sql_db
  {
    connector_id: 'azure_sql_db',
    table_name: '<source_schema>.<source_table>',
    what_it_contains: 'Exact 1-to-1 mirror of each selected Azure SQL Database table. Fivetran adds _fivetran_synced and _fivetran_deleted columns.'
  },
  {
    connector_id: 'azure_sql_db',
    table_name: '<source_schema>.<source_view>',
    what_it_contains: 'Materialized copy of Azure SQL views (synced as full refreshes — no incremental).'
  },
  // mariadb
  {
    connector_id: 'mariadb',
    table_name: '<source_schema>.<source_table>',
    what_it_contains: 'Exact 1-to-1 mirror of each selected MariaDB table. Fivetran adds _fivetran_synced and _fivetran_deleted columns. Streams row-based binlog events for inserts, updates, and deletes.'
  },
  // aurora
  {
    connector_id: 'aurora',
    table_name: '<source_schema>.<source_table>',
    what_it_contains: 'Exact 1-to-1 mirror of each selected Aurora MySQL table. Fivetran adds _fivetran_synced and _fivetran_deleted columns.'
  },
  // aurora_postgres
  {
    connector_id: 'aurora_postgres',
    table_name: '<source_schema>.<source_table>',
    what_it_contains: 'Exact 1-to-1 mirror of each selected Aurora PostgreSQL table. Fivetran adds _fivetran_synced and _fivetran_deleted columns. Generated columns are NOT replicated under logical replication.'
  },
  // heroku_postgres
  {
    connector_id: 'heroku_postgres',
    table_name: '<source_schema>.<source_table>',
    what_it_contains: 'Exact 1-to-1 mirror of each selected Heroku Postgres table. Uses xmin-based query polling for incremental sync (no WAL/CDC available).'
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  // azure_sql_db
  {
    connector_id: 'azure_sql_db',
    issue_title: 'Change Tracking Not Supported on AlwaysOn Availability Groups',
    issue_preview: 'CT method fails on AlwaysOn-backed Azure SQL',
    root_cause: 'Azure SQL Database with AlwaysOn Availability Groups does not support the Change Tracking incremental sync method. The underlying CT mechanism is incompatible with the failover replication model.',
    impact: 'Connector setup fails validation on AlwaysOn-backed Azure SQL. Customers expecting the lightweight CT method must switch to CDC (heavier source load) or Teleport Sync (slower cadence) before they can onboard, which can delay go-live.',
    resolution: 'Use Change Data Capture, Binary Log Reader, or Fivetran Teleport Sync instead. Ensure the database is in Full Recovery mode and has a full backup on the primary node before enabling CDC.'
  },
  {
    connector_id: 'azure_sql_db',
    issue_title: 'Expired SAS Token Breaks the Connection String',
    issue_preview: 'Sync fails when the Azure SAS token expires',
    root_cause: 'If you use SAS-token-based authentication, the token has a fixed expiry. Once it expires, Azure rejects the connection and Fivetran cannot sync.',
    impact: 'The connector stops syncing at the moment of token expiry, usually silently until an operator notices stale data in the warehouse. Every re-auth requires a human to regenerate the token and manually update the connection string in the Fivetran UI.',
    resolution: 'Renew the SAS token before expiry and update the connection string in the Fivetran connector settings. Consider Managed Identity or Service Principal auth to avoid token-renewal overhead.'
  },
  // mariadb
  {
    connector_id: 'mariadb',
    issue_title: 'ON DELETE / ON UPDATE CASCADE Changes Not Replicated',
    issue_preview: 'Cascading deletes and updates are lost in the destination',
    root_cause: 'A known connector bug: changes triggered by ON DELETE CASCADE or ON UPDATE CASCADE constraints do not emit the binlog events Fivetran expects, so they are not replicated.',
    impact: 'The destination drifts from source whenever cascading constraints fire. Orphaned parent rows or stale child rows accumulate in the warehouse, silently breaking referential integrity for downstream dbt models and joins.',
    resolution: 'Avoid relying on cascade constraints for data that must reach the destination. Handle cascading logic in application code with explicit DELETE/UPDATE statements, or perform periodic full re-syncs on affected tables.'
  },
  {
    connector_id: 'mariadb',
    issue_title: 'MariaDB 11.4+ Requires binlog_legacy_event_pos=ON',
    issue_preview: 'Connector fails to parse binlog events on MariaDB 11.4+',
    root_cause: 'MariaDB 11.4 changed the default binlog event position format. Fivetran requires the legacy format to correctly parse events.',
    impact: 'Fresh MariaDB 11.4+ sources fail immediately on the first binlog read. The connector never produces a successful sync until the legacy flag is set and the MariaDB server is restarted, which can require a disruptive maintenance window for production instances.',
    resolution: 'Set binlog_legacy_event_pos=ON in the MariaDB configuration file and restart the server. Required for all MariaDB 11.4 and later instances.'
  },
  // aurora
  {
    connector_id: 'aurora',
    issue_title: 'Intermittent Connection Loss on Aurora MySQL <1.22.5',
    issue_preview: 'Older Aurora MySQL versions drop the binlog connection randomly',
    root_cause: 'A known Aurora MySQL bug in versions prior to 1.22.5 causes intermittent connection loss that disrupts Fivetran\'s binlog streaming.',
    impact: 'The connector appears unreliable — random disconnections cause sync delays, false alerts, and repeated "connector stuck" support tickets. The only true fix is an Aurora cluster upgrade, which many customers defer, leaving the pipeline flaky in the meantime.',
    resolution: 'Upgrade the Aurora MySQL cluster to 1.22.5 or later. Ensure the upgrade is applied during a maintenance window as it requires a cluster reboot.'
  },
  // aurora_postgres
  {
    connector_id: 'aurora_postgres',
    issue_title: 'Logical Replication Requires Aurora PG 10+ on the Primary Node',
    issue_preview: 'Cannot enable logical replication on Aurora PG <10 or on a read replica',
    root_cause: 'Aurora PostgreSQL only supports logical replication (pgoutput plugin) on version 10 or later, and only from the primary node. Read replicas cannot host the replication slot.',
    impact: 'Customers on Aurora PG 9.x or who default to the reader endpoint cannot use the preferred CDC method. They either upgrade (cluster reboot required) or fall back to Query-Based sync, which scales poorly on large tables and puts more read load on the primary.',
    resolution: 'Upgrade to Aurora PostgreSQL 10+ and connect Fivetran to the cluster writer endpoint (primary). Enable rds.logical_replication in the parameter group and reboot. If upgrading is not possible, fall back to Query-Based sync or Teleport Sync.'
  },
  {
    connector_id: 'aurora_postgres',
    issue_title: 'ALTER TABLE ADD COLUMN SET DEFAULT Not Captured',
    issue_preview: 'Existing rows do not get the new default value in the destination',
    root_cause: 'When you add a column with a default value, logical replication does not emit UPDATE events for the existing rows — only the schema change is captured. Existing-row values remain NULL in the destination.',
    impact: 'After adding a defaulted column, existing rows appear as NULL in the destination. Dashboards and downstream models that rely on the new column show blank or miscounted data for the historical backfill window until a manual re-sync is triggered.',
    resolution: 'Trigger a full table re-sync after the ALTER TABLE to populate the new column for existing rows. For large tables, schedule the re-sync during a low-activity window.'
  },
  // heroku_postgres
  {
    connector_id: 'heroku_postgres',
    issue_title: 'No Logical Replication Support on Heroku Postgres',
    issue_preview: 'WAL-based CDC is not available — must use Query-Based sync',
    root_cause: 'Heroku Postgres does not expose the logical replication features that pgoutput requires. Heroku customers have no way to enable it.',
    impact: 'Customers on Heroku cannot get true CDC — delete tracking without a primary key is impossible, and Query-Based polling puts steady read load on the primary database. For high-write OLTP apps, freshness and source performance both suffer noticeably vs. WAL-based CDC.',
    resolution: 'Use Query-Based incremental sync (xmin polling) instead. Accept the trade-off: slightly higher source load and no delete tracking without a primary key. If WAL-based CDC is critical, migrate to RDS PostgreSQL or Aurora PostgreSQL. You can also request logical replication support from Heroku.'
  },
  // ─── NEW: additional issues to reach RICH tier ─────────────
  // azure_sql_db (+1)
  {
    connector_id: 'azure_sql_db',
    issue_title: 'CDC Cleanup Agent Must Be Running to Prevent Storage Bloat',
    issue_preview: 'Change tables grow unbounded if CDC cleanup is misconfigured',
    root_cause: 'Azure SQL Database CDC stores change records in internal change tables. The cleanup agent must be running to purge old records. If it is disabled or misconfigured, change tables grow indefinitely.',
    impact: 'Without cleanup, CDC change tables consume increasing storage on the Azure SQL instance, slowing queries on the source database and eventually causing storage alerts or throttling. Fivetran CDC reads also slow down as they scan larger change tables.',
    resolution: 'Verify CDC is enabled via sys.sp_cdc_enable_db and that the cleanup job is active with a reasonable retention (typically 3 days). Monitor change table sizes in sys.dm_cdc_log_scan_sessions. If cleanup stopped, re-enable it and manually purge accumulated records.'
  },
  // mariadb (+1)
  {
    connector_id: 'mariadb',
    issue_title: 'Fractional Seconds Lost on MariaDB Before 10.1.2',
    issue_preview: 'Sub-second timestamp precision is truncated in the destination',
    root_cause: 'MariaDB versions before 10.1.2 have a known bug where fractional seconds in DATETIME and TIMESTAMP columns are truncated or rounded in binlog events. Fivetran receives the truncated values and writes them to the destination.',
    impact: 'Destination timestamps lose sub-second precision. Time-series analytics, event ordering, and deduplication logic that depend on fractional seconds produce incorrect results. This is especially problematic for high-throughput event tables where multiple rows share the same truncated second.',
    resolution: 'Upgrade MariaDB to 10.1.2 or later where the bug is fixed. If upgrading is not feasible, avoid relying on fractional-second precision for downstream deduplication or ordering — use an auto-increment ID or UUID as the primary ordering key instead.'
  },
  // aurora (+2)
  {
    connector_id: 'aurora',
    issue_title: 'Default Binlog Retention Is Too Short for Sync Gaps',
    issue_preview: 'Aurora purges binlog before Fivetran catches up after a pause',
    root_cause: 'Aurora MySQL binlog retention defaults to a short window. If a Fivetran connector is paused, delayed, or experiences a sync error that lasts longer than the retention window, the binlog cursor expires.',
    impact: 'After any gap longer than the retention window, the connector loses its binlog position and triggers a full historical re-sync of all tables. For large Aurora databases this means elevated MAR, extended sync times, and stale dashboards during the re-sync.',
    resolution: 'Maximize binlog retention: CALL mysql.rds_set_configuration(\'binlog retention hours\', 168) for 7 days. Monitor for paused or erroring connectors and resolve them quickly. Set up Fivetran alerts for connectors that have not synced in >12 hours.'
  },
  {
    connector_id: 'aurora',
    issue_title: 'TLS Required for All External Connections to Aurora',
    issue_preview: 'Connector fails with SSL handshake error if TLS not enabled',
    root_cause: 'Aurora MySQL enforces TLS for all external connections by default. If the Fivetran connector is configured without SSL/TLS, the connection is rejected during the handshake before any data flows.',
    impact: 'Connector setup fails immediately with a cryptic SSL handshake error. First-time users often assume it is a network/firewall issue and spend time debugging security groups and VPC settings before realizing it is a TLS configuration problem.',
    resolution: 'Enable TLS in the Fivetran connector setup form. Aurora handles server-side certificates automatically via the AWS RDS CA bundle — no client certificate is needed. If connecting via SSH tunnel or AWS PrivateLink, TLS is still required on the database leg.'
  },
  // aurora_postgres (+1)
  {
    connector_id: 'aurora_postgres',
    issue_title: 'WAL Replication Slot Buildup During Extended Pauses',
    issue_preview: 'Paused connector causes WAL files to accumulate and fill disk',
    root_cause: 'When a Fivetran connector is paused, the logical replication slot retains all WAL files produced since the pause began. Aurora PostgreSQL does not automatically drop idle replication slots.',
    impact: 'WAL files accumulate on the primary node, consuming storage progressively. If left unchecked, the Aurora volume can fill up, causing the cluster to become read-only or fail entirely — a production-down scenario triggered by a paused analytics pipeline.',
    resolution: 'Monitor replication slot lag via pg_replication_slots (check restart_lsn vs. current WAL position). If pausing a connector for more than a few hours, consider dropping the replication slot and re-creating it when unpausing — this triggers a re-sync but prevents storage exhaustion.'
  },
  // heroku_postgres (+2)
  {
    connector_id: 'heroku_postgres',
    issue_title: 'Low Connection Limits on Hobby and Basic Plans',
    issue_preview: 'Fivetran connection competes with application for limited slots',
    root_cause: 'Heroku Postgres Hobby plans allow only 20 connections and Basic plans allow 500. Fivetran maintains a persistent connection for polling, consuming one of these limited slots at all times.',
    impact: 'On Hobby plans, Fivetran\'s persistent connection can crowd out application connections, causing intermittent "too many connections" errors in the production app. The Fivetran sync itself may also fail intermittently if it cannot obtain a connection.',
    resolution: 'Upgrade to Standard or Premium plans for higher connection limits. Alternatively, use a connection pooler like PgBouncer on the Heroku side to multiplex connections. Monitor active connections via pg_stat_activity to ensure headroom.'
  },
  {
    connector_id: 'heroku_postgres',
    issue_title: 'Credential Rotation Silently Breaks Fivetran Connection',
    issue_preview: 'Sync stops after Heroku rotates database credentials',
    root_cause: 'Heroku periodically rotates database credentials during maintenance, plan changes, or manual credential resets. The new credentials are reflected in the DATABASE_URL config var, but Fivetran stores the original credentials and has no automatic refresh mechanism.',
    impact: 'After a credential rotation, Fivetran silently fails to connect. The sync stops with an auth error, but the AE or customer may not notice for days until downstream reports go stale — especially if Fivetran email alerts are not configured.',
    resolution: 'After any Heroku credential rotation event, immediately update the Fivetran connector settings with the new host, username, and password from the Heroku dashboard (Settings → Database Credentials). Set up Fivetran connector alerts to catch auth failures early.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`Seeding database connectors batch 2 (${CONNECTOR_IDS.join(', ')})...\n`);

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

  console.log(`✅ Task 12 Complete - Databases Batch 2: ${connectorsCount} connectors, ${tablesCount} tables, ${issuesCount} issues`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
