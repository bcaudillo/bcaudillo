// seed-github.js
// Populates Supabase with Fivetran GitHub connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'github';

const connector = {
  id: CONNECTOR_ID,
  name: 'GitHub',
  category: 'engineering',
  description: "Fivetran's GitHub connector syncs repository activity data via the GitHub API. It provides issue, pull request, commit, and team data for engineering analytics and developer productivity reporting.",
  what_it_does: 'Syncs repositories, issues, pull requests, commits, reviews, comments, releases, and team memberships. Incremental sync using GitHub\'s updated_at timestamps and event API.',
  useful_for: 'Engineering team productivity, PR cycle time analysis, issue resolution tracking, release cadence reporting, and connecting dev activity to business outcomes.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PULL_REQUEST',
    what_it_contains: 'PR records — title, state, author, created_at, merged_at, closed_at, base branch, head branch, review count.',
    why_it_matters: 'Primary table for cycle time, merge rate, and PR throughput analytics.',
    key_callouts: 'merged_at - created_at = cycle time. state: open, closed, merged. draft PRs included — filter if needed.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ISSUE',
    what_it_contains: 'Issue records — title, state, labels, assignees, milestone, created_at, closed_at.',
    why_it_matters: 'Bug tracking, feature request volume, and issue resolution time.',
    key_callouts: 'Labels stored as array. Issues and PRs share the same number sequence in GitHub — use pull_request field to distinguish.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'COMMIT',
    what_it_contains: 'Commit records — sha, author, committer, message, timestamp, additions, deletions.',
    why_it_matters: 'Developer activity and code contribution tracking.',
    key_callouts: 'Commit volume alone is a poor productivity metric. Use in combination with PR data. author vs committer differ when commits are amended or cherry-picked.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PULL_REQUEST_REVIEW',
    what_it_contains: 'Code review records — reviewer, state (approved/changes_requested/commented), submitted_at.',
    why_it_matters: 'Code review process analytics — review turnaround time and approval patterns.',
    key_callouts: 'Join to PULL_REQUEST on pull_request_id. time from PR creation to first review = review response time.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'REPOSITORY',
    what_it_contains: 'Repository metadata — name, owner, language, stars, forks, visibility, created_at.',
    why_it_matters: 'Repository dimension for filtering and grouping all other tables.',
    key_callouts: 'visibility field: public vs private. Use to exclude forks or archived repos from analytics.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Large Repos With Long History Take Days to Initial Sync',
    issue_preview: 'Initial sync of repos with thousands of PRs and commits is slow',
    root_cause: 'GitHub API rate limits (5,000 requests/hour for authenticated apps) combined with deep pagination for large repos makes initial historical loads very slow.',
    impact: 'Initial sync for repos with 10+ years of history or thousands of issues/PRs can take 24–72 hours.',
    resolution: 'Set expectations for long initial syncs. Consider limiting the repos connected if historical depth is not needed. Incremental syncs after initial load are fast.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Commit Data Only Available for Connected Repos',
    issue_preview: 'Cannot sync commits from repos not explicitly added to connector',
    root_cause: 'The GitHub connector syncs only repositories explicitly selected during setup. Commits, PRs, and issues from unselected repos are not captured.',
    impact: 'Engineering analytics incomplete if key repos are missing. New repos created after setup are not automatically added.',
    resolution: 'Review repo list in Fivetran connector settings periodically and add new repos. Consider connecting at the org level if all repos in an org should be tracked.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'GitHub Actions and CI Data Not Included',
    issue_preview: 'Workflow runs and CI metrics not available via this connector',
    root_cause: 'The Fivetran GitHub connector focuses on repository collaboration data (issues, PRs, commits). GitHub Actions workflow runs and CI metrics are not included in the standard connector.',
    impact: 'Build time, deployment frequency, and CI success rate metrics not available.',
    resolution: 'Use GitHub\'s webhook connector or a custom integration to capture Actions data. Alternatively, use DORA metrics derived from PR merge times and deployment tags as a proxy.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Rate Limits Cause Incomplete Syncs During High Activity',
    issue_preview: 'Sync falls behind during high-PR-volume periods',
    root_cause: 'GitHub enforces secondary rate limits on API calls beyond the primary 5,000/hour limit. During periods of high activity (large releases, sprints), the connector may hit these limits.',
    impact: 'Sync may be delayed 1–2 hours during peak activity. Some events may be temporarily missed and caught on the next sync.',
    resolution: 'Expected behavior. Fivetran retries on rate limit errors. Increase sync interval slightly if delays are problematic. Data is eventually consistent.'
  }
];

async function main() {
  console.log('Seeding GitHub connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: GitHub');

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

  console.log('\nDone — GitHub: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
