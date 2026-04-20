// seed-klaviyo.js
// Populates Supabase with Fivetran Klaviyo connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'klaviyo';

const connector = {
  id: CONNECTOR_ID,
  name: 'Klaviyo',
  category: 'marketing',
  description: "Fivetran's Klaviyo connector syncs email and SMS marketing data via the Klaviyo API. It provides event-level engagement data, campaign performance, flow analytics, and profile data for e-commerce marketing analytics.",
  what_it_does: 'Syncs profiles, lists, segments, campaigns, flows, events (opens, clicks, bounces, conversions), and metrics. Incremental sync using Klaviyo\'s metrics export API.',
  useful_for: 'E-commerce email analytics, campaign performance reporting, customer lifecycle analysis, revenue attribution from email, flow optimization, and churn prediction.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'EVENT',
    what_it_contains: 'All Klaviyo metric events — email opens, clicks, bounces, conversions, purchases, with person_id, timestamp, and event properties.',
    why_it_matters: 'Complete behavioral record for every tracked action. Foundation for attribution and lifecycle analysis.',
    key_callouts: 'event_properties is JSON — parse for revenue, product details, or custom attributes. High volume for active senders.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN',
    what_it_contains: 'Campaign records — name, subject, send time, status, list/segment targeting.',
    why_it_matters: 'Campaign dimension for send-level performance reporting.',
    key_callouts: 'Join to EVENT via campaign_id to get per-campaign open/click/revenue metrics.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PERSON',
    what_it_contains: 'Profile records — email, phone, custom properties, list memberships, consent status.',
    why_it_matters: 'Customer dimension for segmentation and lifecycle analysis.',
    key_callouts: 'Custom profile properties stored as JSON or flattened columns depending on connector version. Consent/suppression status important for compliance reporting.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'FLOW',
    what_it_contains: 'Automated flow records — name, trigger, status, created/updated timestamps.',
    why_it_matters: 'Flow automation dimension for analyzing automated sequence performance.',
    key_callouts: 'Join to EVENT on flow_id to analyze which flows drive conversions or revenue.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'METRIC',
    what_it_contains: 'Metric definitions — name, integration, created date.',
    why_it_matters: 'Lookup table mapping metric IDs to human-readable names (Opened Email, Placed Order, etc.).',
    key_callouts: 'Join to EVENT via metric_id to filter events by type.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Event Volume Drives High MAR for Active Senders',
    issue_preview: 'Email opens/clicks create large row counts',
    root_cause: 'Klaviyo tracks every email open, click, bounce, and conversion as an individual event row. Large lists (100k+ subscribers) sending weekly campaigns generate millions of event rows per month.',
    impact: 'MAR can be very high. Estimate: list size × sends per month × avg events per send (opens + clicks + bounces).',
    resolution: 'Estimate MAR before connecting. Consider syncing only specific metrics (revenue events, conversions) rather than all events. Disable tracking for low-value metrics like email opens if privacy-friendly open tracking inflates counts.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Revenue Attribution Requires Correct Metric Setup',
    issue_preview: 'Placed Order events missing or inconsistent',
    root_cause: 'Revenue attribution in Klaviyo depends on the "Placed Order" metric being properly configured with the customer\'s e-commerce platform (Shopify, WooCommerce, etc.).',
    impact: 'Revenue columns in EVENT table are null or missing if the integration is not set up correctly.',
    resolution: 'Verify Klaviyo is integrated with the e-commerce platform and "Placed Order" metric is firing. Check Klaviyo Integrations settings. Revenue is in the event_properties JSON under the "Revenue" key.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'API v1/v2 Deprecation — Connector Must Use v3',
    issue_preview: 'Older connector versions may fail after API deprecation',
    root_cause: 'Klaviyo deprecated their v1 and v2 APIs. Fivetran\'s Klaviyo connector has been updated to use the v3 API, but older connector instances may not have migrated automatically.',
    impact: 'Syncs fail or return incomplete data on legacy connector versions.',
    resolution: 'Check connector version in Fivetran. If using an older version, re-create the connector to get the v3-based version. Re-authentication required.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Profile Properties Are Dynamic and Schema Can Vary',
    issue_preview: 'Custom profile properties differ between accounts',
    root_cause: 'Klaviyo allows arbitrary custom properties on profiles. The connector schema reflects whatever properties exist in the account — two accounts will have different PERSON table columns.',
    impact: 'dbt models or SQL built for one account may break when applied to another.',
    resolution: 'Build account-specific models for custom properties. Document key custom properties per account. Use the PERSON table\'s JSON properties column if available for more portable queries.'
  }
];

async function main() {
  console.log('Seeding Klaviyo connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Klaviyo');

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

  console.log('\nDone — Klaviyo: 5 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
