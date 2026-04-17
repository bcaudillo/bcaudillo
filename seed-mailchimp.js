// seed-mailchimp.js
// Populates Supabase with Fivetran Mailchimp connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'mailchimp';

const connector = {
  id: CONNECTOR_ID,
  name: 'Mailchimp',
  category: 'marketing',
  description: "Fivetran's Mailchimp connector syncs email marketing data including campaigns, lists (audiences), members, email activity, automations, and templates. It provides a complete view of email marketing performance and subscriber engagement.",
  what_it_does: 'Syncs all core Mailchimp objects via the Mailchimp Marketing API: audiences (lists), members (subscribers), campaigns, email activity (opens, clicks, bounces), automations, templates, segments, and tags. Uses incremental sync based on last-modified timestamps.',
  useful_for: 'Email marketing analytics, subscriber engagement tracking, campaign performance reporting, audience growth analysis, marketing attribution when combined with CRM data, and churn analysis based on email engagement patterns.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'LIST',
    what_it_contains: 'Mailchimp audiences (formerly "lists") — name, member count, subscribe/unsubscribe defaults, campaign defaults.',
    why_it_matters: 'Top-level entity for audience segmentation and subscriber management.',
    key_callouts: 'Mailchimp renamed "lists" to "audiences" in the UI, but the API and Fivetran table still use LIST.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'MEMBER',
    what_it_contains: 'Subscribers — email, status (subscribed/unsubscribed/cleaned/pending), merge fields, signup date, last activity.',
    why_it_matters: 'Core subscriber data for audience analytics and engagement tracking.',
    key_callouts: 'Status values: subscribed, unsubscribed, cleaned, pending, transactional. Merge fields contain custom subscriber attributes.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN',
    what_it_contains: 'Email campaigns — title, type, status, send time, subject line, list/audience reference.',
    why_it_matters: 'Campaign inventory for performance reporting and A/B test analysis.',
    key_callouts: 'Types: regular, plaintext, absplit, rss, variate. Status: save, paused, schedule, sending, sent.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'EMAIL_ACTIVITY',
    what_it_contains: 'Per-subscriber email events — opens, clicks, bounces, unsubscribes, per campaign.',
    why_it_matters: 'Engagement analytics at the subscriber × campaign level. Powers click-through and open rate calculations.',
    key_callouts: 'High-volume table. Action values: open, click, bounce, unsub, sent. IP and user agent captured for opens/clicks.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AUTOMATION',
    what_it_contains: 'Automated email workflows — name, status, trigger settings, email count.',
    why_it_matters: 'Drip campaign performance and automation effectiveness tracking.',
    key_callouts: 'Each automation contains multiple emails — details in AUTOMATION_EMAIL child table.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'EMAIL_ACTIVITY Table Is Extremely Large',
    issue_preview: 'High MAR from email activity data',
    root_cause: 'EMAIL_ACTIVITY records every open, click, bounce, and unsubscribe for every subscriber for every campaign. A single campaign to 100k subscribers can generate 300k+ activity rows (sent + opens + clicks). This compounds across all campaigns.',
    impact: 'MAR spikes dramatically. Storage costs increase. Queries without date filters are slow. This is the #1 MAR driver for Mailchimp connectors.',
    resolution: 'Consider excluding EMAIL_ACTIVITY if detailed per-subscriber engagement is not needed. Use CAMPAIGN_REPORT for aggregate campaign metrics instead. If EMAIL_ACTIVITY is needed, filter downstream queries by date.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'API Key Requires Full Account Access',
    issue_preview: 'Restricted API keys may not sync all data',
    root_cause: 'Mailchimp API keys are either full-access or restricted. Restricted keys may not have permissions for all endpoints Fivetran needs (reports, automations, email activity). The connector requires a full-access API key.',
    impact: 'Some tables fail to sync or return empty results. No clear error in Fivetran — tables are just empty.',
    resolution: 'Generate a full-access API key in Mailchimp under Account → Extras → API Keys. Do not use restricted API keys with Fivetran.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Audience/List Rename Not Reflected Immediately',
    issue_preview: 'Renamed audiences still show old name in destination',
    root_cause: 'Renaming an audience in the Mailchimp UI does not always bump the modified timestamp that Fivetran uses for incremental sync detection. The rename may not be picked up until another change triggers an update.',
    impact: 'LIST table shows stale audience names. Reports referencing audience names are inaccurate.',
    resolution: 'Trigger a table re-sync on the LIST table after renaming an audience. The re-sync will pick up the current name.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Archived Campaigns Not Synced by Default',
    issue_preview: 'Archived campaigns disappear from destination',
    root_cause: 'The Mailchimp API treats archived campaigns differently from active/sent campaigns. Depending on connector version, archived campaigns may be excluded from the sync or marked as deleted.',
    impact: 'Historical campaign data may be missing from the warehouse. Year-over-year comparisons lose older campaigns.',
    resolution: 'Check if archived campaigns are included in your connector version. If not, unarchive campaigns you need to retain, or export archived campaign data separately before archiving.'
  }
];

async function main() {
  console.log('Seeding Mailchimp connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Mailchimp');

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

  console.log('\nDone — Mailchimp: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
