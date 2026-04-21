// seed-gitlab.js
// Populates Supabase with Fivetran GitLab connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'gitlab';

const connector = {
  id: CONNECTOR_ID,
  name: 'GitLab',
  category: 'engineering',
  description: "Fivetran's GitLab connector syncs DevOps platform data including merge requests, issues, commits, pipelines, and project metadata via the GitLab REST API. Supports both GitLab.com (SaaS) and self-hosted GitLab instances.",
  what_it_does: 'Replicates projects, merge requests, issues, commits, pipelines, and related metadata. Uses incremental sync based on updated_at timestamps. Supports personal access token and OAuth authentication for both cloud and self-managed GitLab deployments.',
  useful_for: 'Engineering productivity analytics, merge request cycle time, CI/CD pipeline success rates, issue resolution tracking, release velocity reporting, and connecting DevOps activity to business outcomes across the full software delivery lifecycle.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'MERGE_REQUEST',
    what_it_contains: 'Merge request records — title, state (opened/merged/closed), author, assignee, source/target branch, created_at, merged_at, approvals, merge commit SHA.',
    why_it_matters: 'Core table for code review cycle time, merge throughput, and developer collaboration metrics. Equivalent to GitHub pull requests.',
    key_callouts: 'merged_at - created_at = cycle time. State values: opened, merged, closed. Draft MRs included — filter on work_in_progress or draft field. Approval data (approvals_before_merge, approved_by) requires GitLab Premium or Ultimate tier.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ISSUE',
    what_it_contains: 'Issue records — title, state, labels, assignees, milestone, weight, due date, created_at, closed_at, time estimate, time spent.',
    why_it_matters: 'Project management and bug tracking analytics. GitLab issues have richer built-in fields than GitHub (weight, time tracking) making them useful for sprint planning analysis.',
    key_callouts: 'Labels stored as array. Weight field is unique to GitLab — enables story point analytics without external tools. Time tracking fields (time_estimate, total_time_spent) are natively supported.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'COMMIT',
    what_it_contains: 'Commit records — SHA, author name/email, committer name/email, message, timestamp, additions, deletions, parent SHAs.',
    why_it_matters: 'Developer activity tracking, code contribution volume, and commit history for audit and compliance.',
    key_callouts: 'High-volume table for repos with long history. author_email is the primary join key to identify developers — may not match GitLab username if git config differs. Initial sync fetches entire commit history by default.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PIPELINE',
    what_it_contains: 'CI/CD pipeline runs — status (success/failed/canceled/skipped), ref (branch/tag), SHA, duration, created_at, finished_at, source (push/merge_request/schedule).',
    why_it_matters: 'CI/CD health monitoring — build success rates, pipeline duration trends, and deployment frequency (a DORA metric).',
    key_callouts: 'Very high row volume for active repos — each push triggers a pipeline. Duration is in seconds. Filter on source to separate push-triggered pipelines from scheduled or merge-request-triggered ones.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PROJECT',
    what_it_contains: 'Project (repository) metadata — name, path, namespace, visibility, default branch, created_at, last activity, star count, fork count.',
    why_it_matters: 'Dimension table for filtering and grouping all other tables by project. Namespace maps to GitLab group hierarchy.',
    key_callouts: 'namespace_id links to the GitLab group. visibility: private, internal, or public. Archived projects are included — filter on archived field if needed.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Large Repos With Long History Take Days to Initial Sync',
    issue_preview: 'Initial sync of repos with years of commit and pipeline history is very slow',
    root_cause: 'GitLab API rate limits (authenticated: 2,000 requests per minute on GitLab.com, configurable for self-hosted) combined with deep pagination for large repos makes initial historical loads slow. Commit and pipeline tables are especially heavy because every push and every CI run generates rows.',
    impact: 'Initial sync for organizations with hundreds of projects and years of history can take 48–96+ hours. Customers may think the connector is broken when it is actually still syncing.',
    resolution: 'Set clear expectations during onboarding: initial sync duration scales with repo count and history depth. Consider connecting only the most critical projects initially and adding more later. Incremental syncs after initial load complete in minutes.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'CI/CD Pipeline Data Creates High Row Volume',
    issue_preview: 'Pipeline table row count grows rapidly, driving up MAR costs',
    root_cause: 'Active GitLab organizations generate a pipeline record for every CI trigger — pushes, merge requests, schedules, and manual triggers. A single active repo with 50 developers pushing multiple times daily can produce thousands of pipeline rows per week.',
    impact: 'MAR (Monthly Active Rows) costs increase faster than customers expect. Pipeline and pipeline_job tables often account for 60–80% of total connector row volume.',
    resolution: 'During the sales cycle, ask how many active repos and how frequently CI runs. Use that to estimate MAR before the customer is surprised by the bill. If pipeline analytics are not needed, recommend excluding pipeline tables from the schema to reduce MAR significantly.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Self-Hosted GitLab Requires Network Access Configuration',
    issue_preview: 'Connector cannot reach self-managed GitLab instance behind a firewall',
    root_cause: 'Self-hosted GitLab instances are typically deployed behind corporate firewalls or VPNs. Fivetran cloud connectors need to reach the GitLab API endpoint over HTTPS, which requires the customer to allow Fivetran IP addresses through their firewall or configure a private network connection.',
    impact: 'Connection test fails immediately with a timeout or connection refused error. The customer assumes the connector is broken but the issue is network access.',
    resolution: 'Provide the customer with Fivetran\'s static IP addresses to allowlist in their firewall rules. For stricter environments, recommend Fivetran\'s Private Networking (AWS PrivateLink, Azure Private Link, or GCP Private Service Connect) or the Fivetran Hybrid Deployment Agent, which runs inside the customer\'s network and tunnels data out.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Merge Request Approval Data Requires Premium Tier',
    issue_preview: 'Approval fields are empty or missing for GitLab Free/Community Edition users',
    root_cause: 'Merge request approval rules, required approvers, and approval status are GitLab Premium and Ultimate features. The GitLab API does not return approval data for projects on the Free tier or Community Edition self-hosted instances. Fivetran syncs what the API returns — if the API omits these fields, they will be NULL in the destination.',
    impact: 'Customers on GitLab Free see NULL approval columns and assume data is missing or the connector has a bug. This is especially common for self-hosted Community Edition users who may not realize the feature is tier-gated.',
    resolution: 'During discovery, confirm the customer\'s GitLab tier. If they are on Free or Community Edition, explain that approval data requires an upgrade to Premium. The rest of the connector (MRs, issues, commits, pipelines) works fully on all tiers.'
  }
];

async function main() {
  console.log('Seeding GitLab connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: GitLab');

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

  console.log('\nDone — GitLab: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
