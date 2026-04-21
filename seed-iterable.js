// seed-iterable.js
// Populates Supabase with Fivetran Iterable connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'iterable';

const connector = {
  id: CONNECTOR_ID,
  name: 'Iterable',
  category: 'marketing',
  description: "Fivetran's Iterable connector syncs cross-channel marketing data via the Iterable API. It provides email, push, SMS, and in-app engagement events, user profiles, campaigns, and list data for lifecycle marketing analytics.",
  what_it_does: 'Syncs email send/open/click/bounce events, push send/open events, SMS events, campaigns, templates, lists, user profiles, and custom events. Incremental sync by event timestamp.',
  useful_for: 'Cross-channel lifecycle marketing analytics, campaign performance reporting, email deliverability monitoring, user engagement scoring, and blending marketing engagement with revenue and product data.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'EMAIL_SEND',
    what_it_contains: 'Email send events — email, campaign_id, template_id, message_id, created_at.',
    why_it_matters: 'Baseline for email funnel — total sends per campaign.',
    key_callouts: 'Join to EMAIL_OPEN, EMAIL_CLICK, EMAIL_BOUNCE on message_id for full funnel. One row per send per recipient.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'EMAIL_OPEN',
    what_it_contains: 'Email open events — email, campaign_id, created_at, device, user_agent.',
    why_it_matters: 'Open rate calculation and device-level engagement analysis.',
    key_callouts: 'Machine opens (Apple MPP) inflate counts. Filter by proxy_source if column available. Multiple opens per email possible.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'USER',
    what_it_contains: 'User profile records — email, user_id, signup_date, data_fields (JSON), list memberships.',
    why_it_matters: 'User dimension for segmentation and lifecycle analysis.',
    key_callouts: 'data_fields is JSON containing all custom profile attributes. Schema varies per account.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN',
    what_it_contains: 'Campaign records — name, type (blast/triggered/workflow), state, channel, created_at.',
    why_it_matters: 'Campaign dimension for performance reporting.',
    key_callouts: 'type distinguishes one-time blasts from triggered/workflow campaigns. Join to event tables on campaign_id.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CUSTOM_EVENT',
    what_it_contains: 'Custom tracked events — event_name, email, user_id, data_fields (JSON), created_at.',
    why_it_matters: 'Product-level events tracked through Iterable (purchases, feature usage).',
    key_callouts: 'data_fields is JSON with event-specific attributes. Only populated if customer sends custom events to Iterable.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Event Volume Across Channels Creates High MAR',
    issue_preview: 'Every message interaction across email, push, SMS is a separate row',
    root_cause: 'Iterable tracks send, delivery, open, click, bounce, unsubscribe, and complaint events per channel. Multi-channel campaigns multiply the event volume.',
    impact: 'MAR scales with: subscriber count × channels × campaigns per month × events per message. Large senders easily hit millions of MAR.',
    resolution: 'Estimate MAR before connecting. Consider syncing only key event types (sends, clicks, conversions) and excluding high-volume low-value events (deliveries, generic opens).'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'User Data Fields Are Dynamic JSON',
    issue_preview: 'Custom user attributes stored as JSON — schema varies per account',
    root_cause: 'Iterable stores user profile attributes in a flexible data_fields JSON column. Different accounts track different attributes.',
    impact: 'Cannot build universal dbt models across accounts. JSON parsing required for every custom attribute.',
    resolution: 'Document key data_fields per account. Build account-specific dbt models that extract frequently used fields into named columns using JSON parsing functions.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Workflow (Journey) Level Attribution Is Complex',
    issue_preview: 'Attributing conversions to specific workflow steps requires joins',
    root_cause: 'Iterable workflows (multi-step journeys) send messages from individual campaigns within the workflow. Event data references the campaign_id, not the workflow_id directly.',
    impact: 'Workflow-level performance requires mapping campaigns to workflows — not available in a single table.',
    resolution: 'Use the campaign metadata to identify which campaigns belong to which workflow. Build a campaign-to-workflow mapping table for workflow-level reporting.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Historical Data Export Delay on Initial Sync',
    issue_preview: 'Initial sync limited by Iterable export API throughput',
    root_cause: 'Iterable\'s data export API processes historical data in batches. Large accounts with years of event data take significant time to fully export.',
    impact: 'Initial sync can take 24–72 hours for accounts with millions of users and years of event history.',
    resolution: 'Set expectations for long initial syncs. Incremental syncs after initial load are fast. Consider using Iterable\'s S3 data export for historical backfill if faster initial load is needed.'
  }
];

async function main() {
  console.log('Seeding Iterable connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Iterable');

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

  console.log('\nDone — Iterable: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
