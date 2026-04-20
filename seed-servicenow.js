// seed-servicenow.js
// Populates Supabase with Fivetran ServiceNow connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'servicenow';

const connector = {
  id: CONNECTOR_ID,
  name: 'ServiceNow',
  category: 'itsm',
  description: "Fivetran's ServiceNow connector syncs IT service management data via the ServiceNow Table API. It provides incident, change request, CMDB, and user data for ITSM analytics and operational reporting.",
  what_it_does: 'Syncs any ServiceNow table — commonly incidents, changes, problems, requests, CMDB configuration items, users, and groups. Incremental sync using sys_updated_on timestamps.',
  useful_for: 'IT operations analytics, incident volume and resolution tracking, change management reporting, SLA compliance, CMDB asset analytics, and blending ITSM data with business systems.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'INCIDENT',
    what_it_contains: 'Incident records — number, short_description, state, priority, severity, assigned_to, assignment_group, opened_at, resolved_at, closed_at.',
    why_it_matters: 'Core ITSM table — incident volume, MTTR, SLA compliance.',
    key_callouts: 'state is numeric: 1=New, 2=In Progress, 3=On Hold, 6=Resolved, 7=Closed. priority: 1=Critical through 5=Planning.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CHANGE_REQUEST',
    what_it_contains: 'Change records — number, type, risk, state, approval, planned start/end, assigned_to.',
    why_it_matters: 'Change management reporting — deployment frequency, change success rate.',
    key_callouts: 'type: Standard, Normal, Emergency. Risk and impact fields drive change approval workflows.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CMDB_CI',
    what_it_contains: 'Configuration items — name, class, operational_status, environment, owner, managed_by.',
    why_it_matters: 'Asset inventory and infrastructure dependency mapping.',
    key_callouts: 'cmdb_ci is the base table — specific CI types (cmdb_ci_server, cmdb_ci_service) extend it. Use sys_class_name to filter by CI type.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'SYS_USER',
    what_it_contains: 'User records — name, email, department, manager, active status, roles.',
    why_it_matters: 'User/agent dimension for all ITSM tables.',
    key_callouts: 'active field filters current employees. department and manager enable org hierarchy analysis.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'SYS_USER_GROUP',
    what_it_contains: 'Group/team records — name, manager, type, active status.',
    why_it_matters: 'Assignment group dimension for team-level incident and change metrics.',
    key_callouts: 'Join to INCIDENT.assignment_group and CHANGE_REQUEST.assignment_group for team-based analytics.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Table Selection Requires ServiceNow Admin Knowledge',
    issue_preview: 'Must know which ServiceNow tables to sync',
    root_cause: 'ServiceNow has thousands of tables. The connector syncs any table you specify, but you must know the table names (incident, change_request, cmdb_ci, etc.) to configure it correctly.',
    impact: 'Without proper table selection, critical ITSM data may be missing or unnecessary tables may be synced (wasting MAR).',
    resolution: 'Work with the customer\'s ServiceNow admin to identify key tables. Common starting set: incident, change_request, problem, sc_request, cmdb_ci, sys_user, sys_user_group. Add CMDB-specific tables (cmdb_ci_server, cmdb_ci_service) as needed.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Reference Fields Return sys_id Instead of Display Values',
    issue_preview: 'Foreign key columns show sys_ids instead of names',
    root_cause: 'ServiceNow uses sys_id (32-character GUID) as primary keys and foreign keys. Fields like assigned_to, assignment_group, and category contain sys_ids by default.',
    impact: 'Reports show GUIDs instead of readable names. Every reference field requires a JOIN to resolve.',
    resolution: 'Enable "display values" in connector settings if available. Otherwise, build lookup JOINs: e.g., JOIN sys_user ON incident.assigned_to = sys_user.sys_id. Create a reference resolution dbt model.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'State and Priority Fields Are Numeric Codes',
    issue_preview: 'State, priority, and impact fields show numbers instead of labels',
    root_cause: 'ServiceNow stores state, priority, impact, and urgency as integer codes. The display labels are stored in sys_choice tables.',
    impact: 'Reports show "1", "2", "3" instead of "New", "In Progress", "Resolved".',
    resolution: 'Build a choice mapping table from sys_choice or hardcode standard mappings: Incident state 1=New, 2=In Progress, 3=On Hold, 6=Resolved, 7=Closed. Priority 1=Critical, 2=High, 3=Moderate, 4=Low, 5=Planning.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'ACL Restrictions May Hide Records',
    issue_preview: 'Some records not syncing due to ServiceNow access controls',
    root_cause: 'ServiceNow\'s Access Control Lists (ACLs) restrict which records are visible to the API user. If the integration user lacks sufficient roles, certain records or fields are filtered out.',
    impact: 'Incomplete data — records visible in ServiceNow UI may be missing from the warehouse.',
    resolution: 'The integration user needs the snc_read_only role at minimum. For CMDB data, also grant itil or specific CMDB roles. Work with ServiceNow admin to verify ACL access for the integration user.'
  }
];

async function main() {
  console.log('Seeding ServiceNow connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: ServiceNow');

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

  console.log('\nDone — ServiceNow: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
