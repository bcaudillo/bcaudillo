// seed-sendgrid.js
// Populates Supabase with Fivetran SendGrid connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'sendgrid';

const connector = {
  id: CONNECTOR_ID,
  name: 'SendGrid',
  category: 'marketing',
  description: "Fivetran's SendGrid connector syncs email delivery and engagement data via the SendGrid API. It provides send, delivery, open, click, bounce, and unsubscribe event data for transactional and marketing email analytics.",
  what_it_does: 'Syncs email activity events (processed, delivered, opened, clicked, bounced, deferred, dropped, spam reports, unsubscribes), contacts, lists, segments, and campaign metadata. Incremental sync by event timestamp.',
  useful_for: 'Email deliverability monitoring, engagement analytics, bounce/spam management, transactional email performance, and blending email metrics with CRM and product data.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'EVENT',
    what_it_contains: 'Email activity events — event type (delivered/opened/clicked/bounced/etc.), email, timestamp, category, campaign.',
    why_it_matters: 'Complete email engagement funnel — send through conversion.',
    key_callouts: 'event field: processed, delivered, open, click, bounce, deferred, dropped, spamreport, unsubscribe. High-volume table — one row per event per email.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CONTACT',
    what_it_contains: 'Contact/recipient records — email, first name, last name, custom fields, list memberships.',
    why_it_matters: 'Recipient dimension for engagement analysis and suppression management.',
    key_callouts: 'Custom fields stored as separate columns. Unsubscribed and bounced contacts remain in the table — filter by suppression status.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'SUPPRESSION',
    what_it_contains: 'Suppression records — email, type (bounce/block/spam_report/invalid), created_at.',
    why_it_matters: 'Deliverability management — identifies emails that should not be sent to.',
    key_callouts: 'type field distinguishes suppression reason. Critical for maintaining sender reputation.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN',
    what_it_contains: 'Marketing campaign records — title, subject, send_at, status, list/segment targeting.',
    why_it_matters: 'Campaign dimension for marketing email performance reporting.',
    key_callouts: 'Join to EVENT on sg_message_id or category for campaign-level metrics. status: draft, scheduled, sent.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Event Volume Is Extremely High for Transactional Senders',
    issue_preview: 'Every email interaction creates a separate event row',
    root_cause: 'SendGrid logs every delivery event (processed, delivered, opened, clicked) as a separate row. High-volume transactional senders (password resets, order confirmations) generate millions of events per month.',
    impact: 'MAR can spike dramatically. Estimate: emails sent per month × avg 3–5 events per email.',
    resolution: 'Estimate MAR before connecting. Consider filtering to only marketing campaigns if transactional email analytics are not needed. Use SendGrid\'s Event Webhook to a file connector for lower MAR impact.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Open Tracking Inflated by Machine Opens',
    issue_preview: 'Apple MPP and security scanners inflate open events',
    root_cause: 'Apple Mail Privacy Protection and corporate email security tools pre-fetch email content, triggering open tracking pixels even when recipients don\'t read the email.',
    impact: 'Open rates appear artificially high. Open-based automations and engagement scoring become unreliable.',
    resolution: 'Shift primary engagement metric from opens to clicks. SendGrid does not currently provide a machine_open flag — filter by user_agent if available, or accept inflated open metrics as a known limitation.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Event Data Retention Limited to 3 Days via API',
    issue_preview: 'Only 3 days of event history available for backfill',
    root_cause: 'SendGrid\'s Event API only retains events for 3 days. For longer history, SendGrid\'s Event Webhook must stream events to storage. Fivetran uses the API, so historical backfill is limited.',
    impact: 'Initial sync only captures 3 days of event history. Historical email performance data before connector setup is lost.',
    resolution: 'Set up the connector as early as possible to start accumulating history. For historical data, configure SendGrid Event Webhook to S3/GCS and use a file connector for older events.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Category Tags Required for Campaign Attribution',
    issue_preview: 'Events lack campaign context without categories',
    root_cause: 'SendGrid events link to campaigns via the category field, which must be set by the sender when sending emails. If categories are not used, events cannot be attributed to specific campaigns or message types.',
    impact: 'Cannot break down deliverability or engagement metrics by campaign or message type.',
    resolution: 'Ensure the engineering team sets category tags when sending via the SendGrid API. Use consistent naming conventions. For Marketing Campaigns (UI-based), categories are set automatically.'
  }
];

async function main() {
  console.log('Seeding SendGrid connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: SendGrid');

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

  console.log('\nDone — SendGrid: 4 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
