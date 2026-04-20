// seed-pipedrive.js
// Populates Supabase with Fivetran Pipedrive connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'pipedrive';

const connector = {
  id: CONNECTOR_ID,
  name: 'Pipedrive',
  category: 'crm',
  description: "Fivetran's Pipedrive connector syncs CRM data via the Pipedrive API. It provides deal, contact, organization, and activity data for pipeline analytics and sales reporting.",
  what_it_does: 'Syncs deals, persons, organizations, pipelines, stages, activities, notes, and products. Incremental sync using update_time timestamps.',
  useful_for: 'SMB pipeline reporting, deal velocity analysis, activity tracking, win/loss analysis, and revenue forecasting for sales teams using Pipedrive as their CRM.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'DEAL',
    what_it_contains: 'Deal records — title, value, currency, status (open/won/lost), stage, owner, close date, custom fields.',
    why_it_matters: 'Core pipeline table — foundation for all revenue and pipeline reporting.',
    key_callouts: 'status field: open, won, lost, deleted. lost_reason field valuable for win/loss analysis. Custom fields appear as custom columns.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PERSON',
    what_it_contains: 'Contact records — name, email, phone, organization, owner.',
    why_it_matters: 'Contact dimension linked to deals and activities.',
    key_callouts: 'email and phone stored as arrays (multiple values per contact). Parse accordingly.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ORGANIZATION',
    what_it_contains: 'Company/account records — name, address, owner, custom fields.',
    why_it_matters: 'Account dimension for B2B pipeline analysis.',
    key_callouts: 'Join to DEAL via org_id for account-level pipeline views.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ACTIVITY',
    what_it_contains: 'Activities — type (call, email, meeting, task), due date, done status, linked deal/person/org.',
    why_it_matters: 'Sales activity tracking and rep productivity analysis.',
    key_callouts: 'done field tracks completion. type field enables breakdown by activity category.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'DEAL_STAGE_CHANGE',
    what_it_contains: 'Stage change history for deals — from stage, to stage, timestamp, user.',
    why_it_matters: 'Deal velocity analysis — how long deals spend in each stage.',
    key_callouts: 'Use timestamps between consecutive stage changes to calculate time-in-stage metrics.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Custom Fields Are Account-Specific',
    issue_preview: 'Custom deal or contact fields vary between Pipedrive accounts',
    root_cause: 'Pipedrive supports unlimited custom fields per object. The connector syncs all custom fields, but their names and types are unique per account.',
    impact: 'dbt models built for one account may not work for another. Custom field column names can be verbose or system-generated.',
    resolution: 'Document key custom fields per account. Build account-specific transformation models. Custom fields appear with their API key name, which may differ from the UI label.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Multi-Value Fields Stored as Arrays',
    issue_preview: 'Email, phone, and some custom fields contain multiple values',
    root_cause: 'Pipedrive allows multiple email addresses and phone numbers per contact. These are stored as JSON arrays in the destination.',
    impact: 'Simple SELECT email FROM PERSON returns an array, not a string. Requires JSON parsing or UNNEST/LATERAL FLATTEN to access individual values.',
    resolution: 'Use JSON parsing functions (JSON_EXTRACT, PARSE_JSON) to access primary values. Build views that extract the primary email/phone for common use cases.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Deleted Records Use Hard Delete by Default',
    issue_preview: 'Deleted deals and contacts disappear from warehouse',
    root_cause: 'Pipedrive marks records as deleted in their API. Depending on connector version, deleted records may be hard-deleted from the warehouse rather than soft-deleted with _fivetran_deleted.',
    impact: 'Deleted deals and contacts cannot be analyzed after deletion. Win/loss analysis may be incomplete if lost deals are deleted.',
    resolution: 'Check connector documentation for delete behavior. Avoid deleting records in Pipedrive if historical analysis is needed — use lost/archived status instead.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Currency Conversion Not Handled by Connector',
    issue_preview: 'Deal values in multiple currencies sum incorrectly',
    root_cause: 'Pipedrive supports multi-currency deals. The connector syncs values in their original currency without converting to a base currency.',
    impact: 'Summing deal values across currencies produces incorrect totals without conversion logic.',
    resolution: 'Always filter by currency or group by currency when aggregating. Build currency conversion logic in dbt using exchange rates from a rates table or external source.'
  }
];

async function main() {
  console.log('Seeding Pipedrive connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Pipedrive');

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

  console.log('\nDone — Pipedrive: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
