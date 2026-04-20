// seed-braze.js
// Populates Supabase with Fivetran Braze connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'braze';

const connector = {
  id: CONNECTOR_ID,
  name: 'Braze',
  category: 'marketing',
  description: "Fivetran's Braze connector syncs customer engagement data via Braze Currents (event streaming) or the Braze Export API. It provides message send, delivery, open, click, and conversion events across email, push, SMS, and in-app channels.",
  what_it_does: 'Syncs engagement events (sends, deliveries, opens, clicks, conversions) across all Braze channels. Also syncs campaign and canvas metadata, user attributes, and segment membership. Requires Braze Currents for event-level data.',
  useful_for: 'Cross-channel engagement analytics, campaign performance reporting, push notification optimization, customer lifecycle analysis, and blending Braze engagement with revenue and CRM data.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'USERS_MESSAGES_EMAIL_SEND',
    what_it_contains: 'Email send events — user_id, campaign_id, canvas_id, send time, dispatch_id.',
    why_it_matters: 'Foundation for email deliverability and reach analysis.',
    key_callouts: 'One row per send. Join to OPEN, CLICK, BOUNCE tables on dispatch_id for full funnel.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'USERS_MESSAGES_EMAIL_OPEN',
    what_it_contains: 'Email open events — user_id, campaign_id, dispatch_id, device, timestamp.',
    why_it_matters: 'Open rate calculation and engagement tracking.',
    key_callouts: 'Machine opens (Apple MPP) inflate open counts — filter by is_amp or user_agent if available.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'USERS_MESSAGES_PUSHNOTIFICATION_SEND',
    what_it_contains: 'Push notification send events — user_id, app_id, platform, campaign_id, send time.',
    why_it_matters: 'Push delivery and engagement baseline.',
    key_callouts: 'Separate tables for iOS and Android opens. Join on dispatch_id.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'USERS_BEHAVIORS_PURCHASE',
    what_it_contains: 'Purchase events — user_id, product_id, price, currency, properties.',
    why_it_matters: 'Revenue attribution from Braze campaigns and canvases.',
    key_callouts: 'properties is JSON. Attribution window for connecting purchase to campaign varies by Braze configuration.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Braze Currents Required for Event-Level Data',
    issue_preview: 'Event tables only available with Currents add-on',
    root_cause: 'Braze Currents is a paid add-on that streams event data to S3 or cloud storage, which Fivetran then picks up. Without Currents, only campaign-level aggregate data is available via the Export API.',
    impact: 'Without Currents, no event-level tables (sends, opens, clicks). Only summary-level campaign data available.',
    resolution: 'Confirm the customer has Braze Currents enabled. Currents must be configured to export to a supported destination (S3, GCS, Azure Blob). Fivetran connects to that destination, not Braze directly.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Very High Event Volume Across All Channels',
    issue_preview: 'Every message interaction is a row — MAR spikes fast',
    root_cause: 'Braze tracks sends, deliveries, opens, clicks, bounces, and conversions as separate events for every message across every channel. Large customer bases generate hundreds of millions of events per month.',
    impact: 'MAR is typically very high for Braze customers with large user bases and multi-channel messaging.',
    resolution: 'Estimate MAR: users × channels active × avg messages/user/month × avg events per message. Consider syncing only key event types (conversions, clicks) and excluding low-value events (deliveries, generic opens).'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Machine Opens Inflate Email Open Metrics',
    issue_preview: 'Apple MPP causes artificially high open rates',
    root_cause: 'Apple Mail Privacy Protection (MPP) pre-loads email content, triggering open tracking pixels even when users don\'t read the email. Braze logs these as opens.',
    impact: 'Email open rates appear inflated. Click-to-open rates drop. Open-based segments and automations become unreliable.',
    resolution: 'Filter opens by machine_open = FALSE if the column is available. Shift engagement measurement to clicks and conversions instead of opens for accurate performance analysis.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Canvas vs Campaign Attribution Requires Different Joins',
    issue_preview: 'Events from canvases have different ID fields than campaigns',
    root_cause: 'Braze has two message types: Campaigns (one-time or recurring) and Canvases (multi-step journeys). Events from each have different ID columns (campaign_id vs canvas_id, canvas_step_id).',
    impact: 'Combining campaign and canvas performance in one query requires UNION or COALESCE logic — easy to miss canvas data.',
    resolution: 'Always check both campaign_id and canvas_id columns when building attribution queries. Build separate models for campaign vs canvas performance, then UNION for combined reporting.'
  }
];

async function main() {
  console.log('Seeding Braze connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Braze');

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

  console.log('\nDone — Braze: 4 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
