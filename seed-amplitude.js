// seed-amplitude.js
// Populates Supabase with Fivetran Amplitude connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'amplitude';

const connector = {
  id: CONNECTOR_ID,
  name: 'Amplitude',
  category: 'analytics',
  description: "Fivetran's Amplitude connector syncs product analytics event data via the Amplitude Export API. It provides raw event-level data for deep product analytics, funnel analysis, and user behavior modeling in your destination warehouse.",
  what_it_does: 'Exports raw event data from Amplitude projects using the Export API. Events include event type, user/device properties, event properties, timestamp, session ID, and platform. Syncs incrementally by hour. One table per Amplitude project.',
  useful_for: 'Product analytics in the warehouse, custom funnel analysis, user segmentation, feature adoption tracking, retention modeling, and blending product usage data with revenue/CRM data.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'EVENT',
    what_it_contains: 'Raw events — event_type, user_id, device_id, event_properties (JSON), user_properties (JSON), timestamp, session_id, platform, country, city.',
    why_it_matters: 'Complete product analytics dataset. Every user action captured as an event.',
    key_callouts: 'Event properties and user properties are JSON columns — parse for specific attributes. High-volume: active products generate millions of events per day.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Event Volume Drives Very High MAR',
    issue_preview: 'Product analytics events create massive row counts',
    root_cause: 'Amplitude captures every user interaction as an event. Active products with thousands of DAU generate millions of events per day. Each event is a row, and each row counts as MAR.',
    impact: 'MAR can be extremely high — often the most expensive connector in the account. A product with 10k DAU averaging 20 events/day generates 6M rows/month.',
    resolution: 'Estimate MAR before connecting: DAU × events/user/day × 30. If too expensive, use Amplitude data export to S3 (free tier) and connect via S3 connector instead. Filter event types in downstream models.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Event and User Properties Are JSON Columns',
    issue_preview: 'Properties require JSON parsing in queries',
    root_cause: 'Amplitude events have dynamic event_properties and user_properties that vary per event type. Fivetran stores them as JSON strings rather than flattening into columns (which would create thousands of columns).',
    impact: 'Queries require JSON parsing functions (JSON_EXTRACT, PARSE_JSON, etc.) which vary by warehouse. Analysts unfamiliar with JSON functions struggle to access the data.',
    resolution: 'Build dbt models or views that extract commonly used properties into named columns. Document the JSON structure for each key event type. Use warehouse-specific JSON functions.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Export API Has 2-Hour Latency',
    issue_preview: 'Events are delayed by ~2 hours in the destination',
    root_cause: 'The Amplitude Export API makes event data available for export approximately 2 hours after the event occurs. This is an Amplitude platform delay, not a Fivetran issue.',
    impact: 'Real-time or near-real-time product analytics are not possible via this connector. The most recent 2 hours of events are always missing.',
    resolution: 'Accept the 2-hour delay for warehouse-based analytics. For real-time needs, use the Amplitude UI directly or Amplitude webhooks to a separate pipeline.'
  }
];

async function main() {
  console.log('Seeding Amplitude connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Amplitude');

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

  console.log('\nDone — Amplitude: 1 table, 3 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
