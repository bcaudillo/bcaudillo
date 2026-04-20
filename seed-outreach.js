// seed-outreach.js
// Populates Supabase with Fivetran Outreach connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'outreach';

const connector = {
  id: CONNECTOR_ID,
  name: 'Outreach',
  category: 'sales',
  description: "Fivetran's Outreach connector syncs sales engagement data via the Outreach API. It provides prospect, sequence, email, and call activity data for sales team performance analytics.",
  what_it_does: 'Syncs prospects, accounts, sequences, sequence steps, mailings, calls, tasks, and opportunities. Incremental sync using updated_at timestamps.',
  useful_for: 'Sales rep activity tracking, sequence performance analysis, email reply rate reporting, pipeline influence from outreach sequences, and blending engagement data with CRM opportunity data.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PROSPECT',
    what_it_contains: 'Prospect records — name, email, title, account, stage, owner, custom fields.',
    why_it_matters: 'Core contact dimension for all outreach activity.',
    key_callouts: 'Links to ACCOUNT for company context. stage tracks where prospect is in the sales process.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'MAILING',
    what_it_contains: 'Email activity — sent, opened, clicked, replied, bounced timestamps, subject, sequence step.',
    why_it_matters: 'Email engagement metrics for sequence and rep performance.',
    key_callouts: 'Join to SEQUENCE_STEP for context on which step drove engagement. replied_at is the key conversion metric.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CALL',
    what_it_contains: 'Call logs — prospect, rep, duration, outcome, direction (inbound/outbound), recording URL.',
    why_it_matters: 'Call activity tracking and connect rate analysis.',
    key_callouts: 'outcome field: answered, left_voicemail, no_answer, busy, etc. Use for connect rate calculations.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'SEQUENCE',
    what_it_contains: 'Sequence definitions — name, step count, owner, status, created date.',
    why_it_matters: 'Sequence dimension for comparing performance across playbooks.',
    key_callouts: 'Join to MAILING and SEQUENCE_STEP to analyze which sequences drive replies and meetings.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'OPPORTUNITY',
    what_it_contains: 'Opportunities linked to prospects — amount, stage, close date, CRM opportunity ID.',
    why_it_matters: 'Pipeline attribution from Outreach sequences to revenue.',
    key_callouts: 'crm_opportunity_id links to Salesforce or HubSpot for cross-source pipeline analysis.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Custom Fields Require Schema Configuration',
    issue_preview: 'Custom prospect or account fields not appearing in destination',
    root_cause: 'Outreach custom fields are account-specific and must be enabled in the Fivetran schema configuration. They do not auto-appear.',
    impact: 'Custom data (e.g., custom prospect stages, custom account fields) missing from warehouse.',
    resolution: 'Go to Fivetran connector Schema tab and enable custom field columns. Custom fields appear with a custom_ prefix.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Sequence Enrollment History Not Fully Captured',
    issue_preview: 'Cannot track full history of which sequences a prospect was enrolled in',
    root_cause: 'Outreach API returns current sequence state, not full enrollment history. If a prospect is removed from a sequence and added to another, the previous enrollment is not accessible.',
    impact: 'Sequence attribution analysis incomplete — only current/latest enrollment visible.',
    resolution: 'Build snapshot logic in your warehouse to capture sequence enrollment state over time. Fivetran cannot backfill historical enrollment records.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'API Rate Limits Throttle Large Team Syncs',
    issue_preview: 'Syncs slow for orgs with many reps and high activity volume',
    root_cause: 'Outreach API enforces rate limits that scale with org size. High-volume orgs with many active sequences generate large numbers of mailing and call records requiring many paginated requests.',
    impact: 'Sync duration increases. Data freshness may lag 2–4 hours for very large teams.',
    resolution: 'Expected behavior. Increase sync interval if freshness is not critical. Archive completed sequences to reduce active record volume.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Opportunity Data Requires Salesforce/HubSpot Integration',
    issue_preview: 'OPPORTUNITY table empty without CRM connection',
    root_cause: 'Outreach syncs opportunity data from a connected CRM (Salesforce or HubSpot). Without that integration configured in Outreach, the OPPORTUNITY table will be empty.',
    impact: 'Cannot do pipeline attribution from sequences to revenue without the CRM integration.',
    resolution: 'Ensure Outreach is connected to Salesforce or HubSpot in Outreach Settings → Integrations. Once connected, opportunities sync bidirectionally and appear in the Fivetran connector.'
  }
];

async function main() {
  console.log('Seeding Outreach connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Outreach');

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

  console.log('\nDone — Outreach: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
