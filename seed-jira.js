// seed-jira.js
// Populates Supabase with Fivetran Jira connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'jira';

const connector = {
  id: CONNECTOR_ID,
  name: 'Jira',
  category: 'applications',
  description: "Fivetran's Jira connector syncs project management and issue tracking data from Jira Cloud. It replicates projects, issues, sprints, boards, users, comments, changelogs, and custom fields into your destination warehouse for engineering analytics and delivery metrics.",
  what_it_does: 'Syncs all core Jira Cloud objects via the Jira REST API: projects, issues (with all standard and custom fields), sprints, boards, users, comments, changelogs (field change history), components, versions, and issue links. Uses incremental sync based on updated timestamps.',
  useful_for: 'Engineering velocity metrics, sprint analytics, cycle time and lead time reporting, bug tracking dashboards, project health monitoring, capacity planning, and cross-team delivery analysis.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ISSUE',
    what_it_contains: 'All Jira issues — key, summary, status, type, priority, assignee, reporter, created/updated dates, story points, custom fields.',
    why_it_matters: 'Core table for all project management analytics. Every metric starts here.',
    key_callouts: 'Custom fields appear as columns. Status and type are IDs — join to STATUS and ISSUE_TYPE for names. Subtasks are issues with a parent reference.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CHANGELOG',
    what_it_contains: 'Every field change on every issue — field name, old value, new value, author, timestamp.',
    why_it_matters: 'Powers cycle time, lead time, and status transition analysis. Essential for flow metrics.',
    key_callouts: 'One row per field change. High-volume table. Filter by field name (e.g. status) for transition analysis.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'SPRINT',
    what_it_contains: 'Sprint definitions — name, state, start/end dates, board reference, goal.',
    why_it_matters: 'Sprint-level analytics, velocity tracking, and sprint scope change analysis.',
    key_callouts: 'State: future, active, closed. Issues link to sprints via ISSUE_SPRINT junction table.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PROJECT',
    what_it_contains: 'Jira projects — key, name, lead, category, project type.',
    why_it_matters: 'Project dimension for filtering and grouping issues.',
    key_callouts: 'Project key is the prefix on issue keys (e.g. PROJ-123).'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'COMMENT',
    what_it_contains: 'Issue comments — body, author, created/updated dates.',
    why_it_matters: 'Communication tracking and response time analysis on issues.',
    key_callouts: 'Body contains rendered HTML or Atlassian Document Format (ADF) markup.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Custom Fields Appear as Numeric IDs',
    issue_preview: 'Custom field columns named customfield_10001 instead of display name',
    root_cause: 'Jira API returns custom fields by numeric ID, not display name. Fivetran stores them as customfield_<id> columns. The FIELD table maps IDs to names.',
    impact: 'Columns are unreadable without cross-referencing. Analysts waste time looking up field IDs.',
    resolution: 'Join to the FIELD table to get display names. Build dbt models or views that rename custom fields. The dbt_jira package handles this automatically.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'CHANGELOG Table Is Very Large',
    issue_preview: 'Field change history drives high MAR',
    root_cause: 'Every field change on every issue creates a changelog row. Active projects with frequent status transitions, reassignments, and field edits generate massive volumes. A single issue can have hundreds of changelog entries.',
    impact: 'MAR spikes from changelog volume. Queries without issue/date filters are slow. This is the #1 MAR driver for Jira connectors.',
    resolution: 'If full changelog is not needed, exclude it from the schema. For cycle time analysis, consider syncing only and filtering for status field changes in downstream models.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Jira Server/Data Center Not Supported',
    issue_preview: 'Connector only works with Jira Cloud',
    root_cause: 'The Fivetran Jira connector exclusively supports Jira Cloud (atlassian.net). Jira Server and Jira Data Center instances are not supported and cannot be connected.',
    impact: 'Customers on Jira Server/DC cannot use this connector. They need an alternative approach.',
    resolution: 'For Jira Server/DC, use the Fivetran AWS Lambda or Azure Functions connector to build a custom integration. Alternatively, migrate to Jira Cloud. Atlassian is sunsetting Server in February 2024.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'API Token Requires Atlassian Account Admin',
    issue_preview: 'Setup fails without proper Atlassian account permissions',
    root_cause: 'The API token used for authentication must belong to a user with admin access to the Jira Cloud instance. Non-admin tokens cannot read all projects, issues, and fields.',
    impact: 'Partial data sync — some projects or issue types may be missing. No error message, just incomplete data.',
    resolution: 'Generate the API token from an Atlassian account with Jira Administrator or Site Administrator role. Verify the user can see all projects in the Jira UI before using their token.'
  }
];

async function main() {
  console.log('Seeding Jira connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Jira');

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

  console.log('\nDone — Jira: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
