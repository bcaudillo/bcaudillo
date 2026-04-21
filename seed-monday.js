// seed-monday.js
// Populates Supabase with the Fivetran Monday.com connector data.
// Sources:
//   https://fivetran.com/docs/connectors/applications/monday
//   https://fivetran.com/docs/connectors/applications/monday/setup-guide
//   https://fivetran.com/docs/connectors/applications/monday/troubleshooting
//
// Idempotent: upserts the connector row, deletes existing monday
// child rows, then inserts fresh data. Re-running does not create duplicates.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_ID = 'monday';

// ─── CONNECTOR RECORD ────────────────────────────────────────────────────────

const connector = {
  id: CONNECTOR_ID,
  name: 'Monday.com',
  category: 'project_management',
  description: "Fivetran's Monday.com connector replicates boards, items, column values, updates, and groups from Monday.com into your destination warehouse via the Monday.com GraphQL API. It captures the flexible, spreadsheet-like structure of Monday.com boards as relational tables, enabling cross-board analytics and blending project data with other business systems.",
  what_it_does: 'Syncs board definitions, items (rows), column values (cells), updates (comments/activity log), and groups (sections within boards) via the Monday.com API v2 (GraphQL). Handles Monday.com\'s dynamic schema where each board can have completely different columns. Column values are stored as structured data that preserves the original Monday.com column types (status, date, person, dropdown, etc.).',
  useful_for: 'Cross-board project analytics, resource utilization reporting, workflow bottleneck identification, team velocity tracking, project status rollups across departments, blending work management data with CRM/finance/engineering data for holistic operational dashboards.'
};

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'BOARD',
    what_it_contains: 'Board definitions — board ID, name, description, board kind (main, shareable, private), workspace reference, owner, created/updated timestamps, state (active, archived, deleted).',
    why_it_matters: 'The top-level organizational entity. Every item, column, and group belongs to a board. Required for filtering and grouping cross-board analytics.',
    key_callouts: 'Board kind determines visibility scope — main boards are visible to all workspace members, private boards only to invited members. Archived boards are included with state = archived. Board permissions are not synced — access control must be managed in Monday.com.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ITEM',
    what_it_contains: 'Items (rows) on boards — item ID, name, board reference, group reference, creator, created/updated timestamps, state (active, archived, deleted), parent item reference for subitems.',
    why_it_matters: 'The core work unit in Monday.com. Items represent tasks, projects, deals, bugs, or any other entity the team tracks. All column values and updates attach to items.',
    key_callouts: 'Subitems are items with a non-null parent_item_id — they live on a separate hidden board internally. The item name is just the first column (title) — all other data lives in COLUMN_VALUE. Item state includes deleted items for audit trail purposes.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'COLUMN_VALUE',
    what_it_contains: 'Individual cell values — item reference, column reference, column type (status, date, person, number, text, dropdown, timeline, etc.), value (JSON string), display text.',
    why_it_matters: 'Contains the actual data for every cell on every board. Without COLUMN_VALUE, items are just titles with no detail. This is where status, dates, assignees, and all custom column data lives.',
    key_callouts: 'Values are stored as JSON strings that vary by column type — a status column stores {\"index\": 1, \"label\": \"Done\"}, a person column stores {\"personsAndTeams\": [{\"id\": 123}]}, etc. Parsing logic must handle each column type differently. Empty cells may not have a COLUMN_VALUE row at all (sparse storage).'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'UPDATE',
    what_it_contains: 'Activity log entries and comments on items — update ID, item reference, creator, body (HTML), created/updated timestamps, replies.',
    why_it_matters: 'Communication history on work items. Required for collaboration analytics, response time tracking, and audit trails of decisions made on project items.',
    key_callouts: 'Update body is HTML-formatted text — strip tags for plain text analysis. Replies to updates are nested and reference a parent update ID. High-volume table for active boards — consider date-range filtering if the account has years of history.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'GROUP',
    what_it_contains: 'Groups (sections) within boards — group ID, board reference, title, color, position, archived/deleted status.',
    why_it_matters: 'Groups organize items within a board (e.g., "Sprint 1", "Backlog", "Q2 Projects"). Required for segmenting items by their board section in analytics.',
    key_callouts: 'Group IDs are board-scoped, not globally unique — always join with board_id. The default group ("new_group") is auto-created by Monday.com and may contain uncategorized items. Group position determines display order on the board.'
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Column Values Stored as JSON Requiring Custom Parsing',
    issue_preview: 'COLUMN_VALUE data is raw JSON that cannot be queried without transformation',
    root_cause: 'Monday.com stores column values as JSON objects whose structure varies by column type. A status column returns {\"index\": 1, \"label\": \"Working on it\"}, a date column returns {\"date\": \"2024-03-15\"}, a people column returns {\"personsAndTeams\": [{\"id\": 12345, \"kind\": \"person\"}]}. Fivetran syncs this raw JSON faithfully, but it is not queryable with standard SQL without JSON parsing functions.',
    impact: 'Customers cannot write simple WHERE clauses like "status = Done" without first extracting values from JSON. Every downstream model or dashboard needs a JSON parsing layer. Non-technical users are completely blocked from querying the data directly.',
    resolution: 'Build a dbt staging model that parses each column type into typed columns (e.g., status_label, date_value, person_id). Provide example JSON parsing SQL for the customer\'s specific warehouse (Snowflake JSON_EXTRACT_PATH_TEXT, BigQuery JSON_EXTRACT_SCALAR, Redshift JSON_EXTRACT_PATH_TEXT differ in syntax). Set expectations during setup that a transformation layer is required for Monday.com data to be analyst-friendly.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Board Structure Varies Dramatically Between Teams',
    issue_preview: 'No two boards have the same columns, making cross-board reporting difficult',
    root_cause: 'Monday.com is intentionally flexible — each team creates boards with whatever columns they need. A marketing board might have columns for Campaign, Budget, and Launch Date, while an engineering board has Sprint, Story Points, and Priority. There is no enforced schema across boards. Column names can be duplicated with different meanings across boards.',
    impact: 'Cross-board analytics are extremely difficult. A customer asking "show me all items with status Done across all boards" must first map which column on each board represents "status" and what label value means "Done" on each board. Automated rollup dashboards break when teams rename or restructure their boards.',
    resolution: 'Identify a standard set of boards and column naming conventions with the customer during onboarding. Build board-specific staging models rather than trying to force a universal schema. Use Monday.com board templates to encourage column name consistency across teams. For cross-board reporting, create a mapping table that translates board-specific column IDs to canonical field names.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Subitems Require Separate API Calls and Live on Hidden Boards',
    issue_preview: 'Subitems appear disconnected from their parent items in the warehouse',
    root_cause: 'Monday.com implements subitems as items on a separate, auto-generated hidden board linked to the parent item. The Monday.com API requires separate queries to retrieve subitems, and the parent-child relationship is maintained through the parent_item_id field. The hidden subitem board has its own column definitions that differ from the parent board.',
    impact: 'Subitems and parent items have different column schemas, making it impossible to union them directly. The hidden subitem board appears in the BOARD table with no obvious link to the parent board. Customers expecting a simple parent-child hierarchy find a disjointed data model.',
    resolution: 'Build a parent-child relationship model using the parent_item_id field on ITEM. Document that subitem boards are auto-generated and should be filtered out of board-level reporting. Create a combined view that joins parent items with their subitems for task breakdown analysis. Warn customers that subitem column values must be parsed separately since the column definitions differ from the parent board.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Formula and Mirror Columns Not Synced',
    issue_preview: 'Formula and mirror column values are empty or missing in the warehouse',
    root_cause: 'Monday.com formula columns and mirror columns (which reflect data from connected boards) are computed server-side and are not returned by the API. The column definition exists, but the value field is null or empty. This is a Monday.com API limitation, not a Fivetran limitation.',
    impact: 'Customers who rely on formula columns for calculated fields (e.g., days until deadline, total cost) or mirror columns for cross-board lookups find those values missing. Dashboards that depend on formula outputs are blank.',
    resolution: 'Recreate formula logic in the warehouse using dbt or SQL views based on the underlying source columns. For mirror columns, replicate the cross-board join logic in the warehouse by joining the source board\'s column values directly. Document which columns are formulas/mirrors during setup so the customer knows to expect them empty and can plan warehouse-side calculations.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Monday.com connector data...\n');

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
  console.log('Clearing existing monday rows in child tables...');
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

  console.log(`Done — Monday.com: ${tablesCount} tables, ${issuesCount} issues`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
