// seed-zendesk.js
// Populates Supabase with Fivetran Zendesk connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'zendesk';

const connector = {
  id: CONNECTOR_ID,
  name: 'Zendesk',
  category: 'support',
  description: "Fivetran's Zendesk Support connector syncs customer support data including tickets, users, organizations, comments, satisfaction ratings, and custom fields. It provides a complete view of support operations for SLA tracking, agent performance, and customer experience analytics.",
  what_it_does: 'Syncs all core Zendesk Support objects via the Zendesk API: tickets, users, organizations, groups, ticket comments, ticket metrics, satisfaction ratings, tags, custom fields, and ticket forms. Uses incremental sync based on updated_at timestamps. Supports both OAuth and API token authentication.',
  useful_for: 'Support ticket analytics, SLA compliance reporting, agent performance metrics, customer satisfaction tracking, ticket volume trending, first-response-time analysis, and support cost attribution.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TICKET',
    what_it_contains: 'Support tickets — subject, status, priority, type, assignee, requester, group, created/updated dates, custom fields.',
    why_it_matters: 'Core support table. Every SLA, performance, and volume metric starts here.',
    key_callouts: 'Status: new, open, pending, hold, solved, closed. Custom fields appear as columns. Deleted tickets are soft-deleted.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TICKET_COMMENT',
    what_it_contains: 'All comments on tickets — body, author, public/private flag, attachments, created date.',
    why_it_matters: 'Full conversation history. Powers response time analysis and communication quality metrics.',
    key_callouts: 'High-volume table. Public comments are customer-facing; private/internal notes are agent-only. HTML body available.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TICKET_METRIC',
    what_it_contains: 'Computed SLA metrics per ticket — first reply time, full resolution time, requester wait time, agent wait time.',
    why_it_matters: 'Pre-calculated SLA metrics from Zendesk. Saves building complex time calculations.',
    key_callouts: 'Times are in minutes. Includes business-hours and calendar-hours variants. Updated as ticket progresses.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'USER',
    what_it_contains: 'All Zendesk users — agents, admins, and end-users. Name, email, role, organization, active status.',
    why_it_matters: 'User dimension for ticket attribution. Needed for agent performance and requester analysis.',
    key_callouts: 'Role values: end-user, agent, admin. Suspended users included. Custom user fields available.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ORGANIZATION',
    what_it_contains: 'Customer organizations — name, domain, tags, custom fields, shared tickets flag.',
    why_it_matters: 'Account-level support analytics. Join to TICKET for per-organization metrics.',
    key_callouts: 'Links to USER via organization_id. Custom organization fields appear as columns.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'SATISFACTION_RATING',
    what_it_contains: 'CSAT survey responses — score (good/bad), comment, ticket reference, created date.',
    why_it_matters: 'Customer satisfaction tracking and agent quality scoring.',
    key_callouts: 'Only populated if CSAT surveys are enabled in Zendesk. Score is good or bad (not numeric).'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Custom Fields Appear as Generic Column Names',
    issue_preview: 'Custom ticket fields show as custom_field_12345 instead of display name',
    root_cause: 'Zendesk API returns custom fields by their numeric ID, not their display name. Fivetran maps these to columns named custom_field_<id>. The TICKET_FIELD table contains the mapping between IDs and display names.',
    impact: 'Columns are hard to identify without cross-referencing. Analysts must look up field IDs to understand what each custom_field column contains.',
    resolution: 'Join to the TICKET_FIELD table to get display names. Build a dbt model or warehouse view that renames custom_field columns to human-readable names. The dbt_zendesk package handles this automatically.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'API Rate Limits Cause Slow or Failed Syncs',
    issue_preview: 'Zendesk API throttling during sync',
    root_cause: 'Zendesk enforces per-minute API rate limits that vary by plan (Essential: 10 RPM, Team: 200 RPM, Professional: 400 RPM, Enterprise: 700 RPM). Fivetran can hit these limits during large syncs or initial historical loads.',
    impact: 'Syncs slow down significantly as Fivetran backs off and retries. In extreme cases, syncs may fail entirely.',
    resolution: 'Upgrade Zendesk plan for higher rate limits. Reduce sync frequency. Exclude unnecessary tables from the schema. Avoid sharing API credentials across multiple integrations.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Deleted Tickets Not Captured by Incremental Sync',
    issue_preview: 'Deleted tickets remain in destination as active records',
    root_cause: 'The Zendesk incremental export API does not reliably return deleted tickets. Fivetran captures soft-deletes (status=closed) but hard-deleted tickets (permanently removed) may not be detected.',
    impact: 'Destination retains tickets that no longer exist in Zendesk. Ticket counts and metrics may be inflated.',
    resolution: 'Use ticket status for filtering (solved/closed). For hard-delete detection, trigger periodic full re-syncs. The _fivetran_deleted column captures detected deletions.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'TICKET_COMMENT Table Extremely Large',
    issue_preview: 'Comment data drives high MAR and storage',
    root_cause: 'Every comment on every ticket creates a row. Active support operations with detailed ticket threads generate massive comment volumes. HTML body content can be very large per row.',
    impact: 'MAR spikes from comment volume. Storage costs from HTML body content. Queries against comments without ticket/date filters are slow.',
    resolution: 'Consider excluding TICKET_COMMENT if full conversation history is not needed. Use TICKET_METRIC for pre-calculated response times instead. Filter downstream queries by date.'
  }
];

async function main() {
  console.log('Seeding Zendesk connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Zendesk');

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

  console.log('\nDone — Zendesk: 6 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
