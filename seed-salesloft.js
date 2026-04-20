// seed-salesloft.js
// Populates Supabase with Fivetran SalesLoft connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'salesloft';

const connector = {
  id: CONNECTOR_ID,
  name: 'SalesLoft',
  category: 'sales',
  description: "Fivetran's SalesLoft connector syncs sales engagement data via the SalesLoft API. It provides cadence, email, call, and people activity data for rep performance and pipeline analytics.",
  what_it_does: 'Syncs people (prospects), accounts, cadences, cadence memberships, emails, calls, and activity feeds. Incremental sync using updated_at timestamps.',
  useful_for: 'Sales rep activity analytics, cadence performance reporting, email and call connect rates, pipeline influence from cadences, and blending engagement data with CRM opportunities.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PERSON',
    what_it_contains: 'Prospect/contact records — name, email, title, account, stage, owner, cadence membership.',
    why_it_matters: 'Core contact dimension for all SalesLoft activity.',
    key_callouts: 'stage field tracks sales stage. do_not_contact and email_opt_out flags critical for compliance.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'EMAIL',
    what_it_contains: 'Email activity — sent_at, opened_at, clicked_at, replied_at, bounced_at, subject, cadence step.',
    why_it_matters: 'Email engagement metrics — foundation for reply rate and cadence performance.',
    key_callouts: 'replied_at is the key conversion metric. Join to CADENCE_MEMBERSHIP for cadence context.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CALL',
    what_it_contains: 'Call records — person, user, duration, disposition, sentiment, direction.',
    why_it_matters: 'Call activity and connect rate tracking.',
    key_callouts: 'disposition (answered, voicemail, no answer) and sentiment (positive, neutral, negative) are key fields for call quality analysis.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CADENCE',
    what_it_contains: 'Cadence definitions — name, step count, owner, status, created date, tags.',
    why_it_matters: 'Cadence dimension for comparing playbook performance.',
    key_callouts: 'tags field useful for grouping cadences by segment or use case (e.g., "enterprise", "inbound").'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CADENCE_MEMBERSHIP',
    what_it_contains: 'Enrollment records linking people to cadences — added_at, removed_at, current step, paused status.',
    why_it_matters: 'Tracks which prospects are in which cadences and at what step.',
    key_callouts: 'Combine with EMAIL and CALL tables on person_id for full per-cadence activity picture.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Email Open Tracking Inflated by Machine Opens',
    issue_preview: 'Apple MPP and email security scanners inflate open counts',
    root_cause: 'Like all email tools, SalesLoft open tracking is affected by Apple Mail Privacy Protection and corporate email security scanners that pre-fetch email content.',
    impact: 'Open rates appear higher than actual human engagement. Open-based cadence triggers may fire prematurely.',
    resolution: 'Prioritize reply rate and click rate over open rate for engagement measurement. Advise customers to use multi-touch signals rather than opens alone for cadence advancement.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Historical Cadence Activity Limited by API',
    issue_preview: 'Activity data before connector setup may be incomplete',
    root_cause: 'SalesLoft API rate limits and pagination constraints mean very old historical activity (emails, calls) may not fully backfill during initial sync for large orgs.',
    impact: 'Historical performance analysis may be incomplete for the period before connector setup.',
    resolution: 'Set expectations that initial sync captures recent history most reliably. For deep historical analysis, supplement with SalesLoft\'s built-in reporting exports.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Account Data Requires CRM Sync',
    issue_preview: 'ACCOUNT table thin without Salesforce/HubSpot integration',
    root_cause: 'SalesLoft pulls account data from a connected CRM. Without CRM integration, account records have minimal data (just name and domain).',
    impact: 'Cannot enrich cadence performance with account attributes (industry, size, ARR) without CRM connection.',
    resolution: 'Ensure SalesLoft is integrated with Salesforce or HubSpot. Join SalesLoft data to the CRM connector data in the warehouse for enriched account-level analytics.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Custom Fields Need Schema Enablement',
    issue_preview: 'Custom person or account fields missing from destination',
    root_cause: 'SalesLoft custom fields are account-specific and do not auto-appear in the Fivetran schema.',
    impact: 'Custom segmentation or persona fields missing from warehouse.',
    resolution: 'Go to Fivetran connector Schema tab → enable custom field columns. They appear prefixed with custom_.'
  }
];

async function main() {
  console.log('Seeding SalesLoft connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: SalesLoft');

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

  console.log('\nDone — SalesLoft: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
