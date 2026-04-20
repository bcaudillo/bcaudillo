// seed-asana.js
// Populates Supabase with Fivetran Asana connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'asana';

const connector = {
  id: CONNECTOR_ID,
  name: 'Asana',
  category: 'project_management',
  description: "Fivetran's Asana connector syncs project and task management data via the Asana API. It provides project, task, user, and activity data for team productivity and project delivery analytics.",
  what_it_does: 'Syncs workspaces, projects, tasks, sections, tags, users, teams, and task stories (activity). Incremental sync using modified_at timestamps.',
  useful_for: 'Project delivery tracking, team workload analysis, task completion trends, cross-team productivity reporting, and connecting project data to business outcomes.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TASK',
    what_it_contains: 'Task records — name, assignee, project, section, due date, completed, completed_at, custom fields, tags.',
    why_it_matters: 'Core table for task completion, workload, and delivery analytics.',
    key_callouts: 'completed boolean + completed_at timestamp for completion metrics. Tasks can belong to multiple projects — use PROJECT_TASK join table.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PROJECT',
    what_it_contains: 'Project records — name, owner, team, status, due date, color, archived.',
    why_it_matters: 'Project dimension for grouping tasks and tracking delivery.',
    key_callouts: 'archived = true for completed/inactive projects. custom_field_settings defines which custom fields appear on the project.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'USER',
    what_it_contains: 'User records — name, email, workspace memberships.',
    why_it_matters: 'User dimension for assignee-based workload and productivity analysis.',
    key_callouts: 'Includes both active users and guests. Filter by workspace membership for relevant scope.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'STORY',
    what_it_contains: 'Task activity feed — comments, status changes, assignee changes, field updates, timestamps.',
    why_it_matters: 'Activity audit trail for process analysis and cycle time measurement.',
    key_callouts: 'type field: comment, system. System stories track field changes. High volume — every task change creates a story.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'SECTION',
    what_it_contains: 'Project sections (columns in board view) — name, project, created_at.',
    why_it_matters: 'Section dimension for kanban-style workflow analysis.',
    key_callouts: 'Tasks move through sections like pipeline stages. Track section changes via STORY table.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Tasks Can Belong to Multiple Projects',
    issue_preview: 'One task appearing in multiple project contexts complicates reporting',
    root_cause: 'Asana allows multi-homing — a single task can be added to multiple projects. The TASK table has one row per task, but the PROJECT_TASK join table has one row per project-task association.',
    impact: 'Counting tasks per project using the TASK table directly may undercount. Using PROJECT_TASK may double-count tasks that are multi-homed.',
    resolution: 'Use PROJECT_TASK for per-project task counts (tasks will appear in each project they belong to). Use TASK for unique task counts. Document the counting methodology for analysts.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Custom Fields Are Workspace-Specific',
    issue_preview: 'Custom field schema varies between workspaces and projects',
    root_cause: 'Asana custom fields are defined per workspace and can be applied to individual projects. Different projects may use different custom fields.',
    impact: 'No universal custom field schema — custom field columns vary by project and workspace.',
    resolution: 'Custom field values are in the TASK_CUSTOM_FIELD_VALUE table as a key-value structure. Build project-specific models that pivot relevant custom fields into named columns.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Story Volume Creates High MAR',
    issue_preview: 'Activity feed (stories) generates many rows per task',
    root_cause: 'Every task action (create, assign, complete, comment, field change) generates a Story record. Active teams with many task updates create thousands of stories per day.',
    impact: 'STORY table can be the highest-MAR table. A task with 20 updates = 20 story rows.',
    resolution: 'Estimate MAR impact from stories: tasks updated per month × avg actions per task. Disable STORY table sync if activity-level detail is not needed — task completion data is on the TASK table directly.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Subtasks Not Always Linked to Parent Project',
    issue_preview: 'Subtasks may lack project association in the data',
    root_cause: 'Asana subtasks inherit the parent task\'s project, but this association is not always explicit in the API response. Subtasks may appear without a project_id.',
    impact: 'Subtasks may be missing from project-level task counts and delivery metrics.',
    resolution: 'Join subtasks to parent tasks via parent_id to inherit project association. Build a recursive CTE or dbt model to walk the task hierarchy for complete project-level counts.'
  }
];

async function main() {
  console.log('Seeding Asana connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Asana');

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

  console.log('\nDone — Asana: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
