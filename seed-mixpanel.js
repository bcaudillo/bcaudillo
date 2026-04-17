// seed-mixpanel.js
// Populates Supabase with Fivetran Mixpanel connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'mixpanel';

const connector = {
  id: CONNECTOR_ID,
  name: 'Mixpanel',
  category: 'analytics',
  description: "Fivetran's Mixpanel connector syncs product analytics data including events, user profiles, funnels, and revenue data via the Mixpanel Export API. It provides raw event-level data and user profiles for warehouse-based product analytics.",
  what_it_does: 'Exports raw event data and user profile data from Mixpanel projects. Events include event name, distinct_id, properties (JSON), and timestamp. User profiles include all profile properties. Syncs incrementally by day.',
  useful_for: 'Product analytics in the warehouse, user behavior analysis, funnel optimization, A/B test analysis, feature adoption metrics, and combining product usage with revenue and CRM data.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'EVENT',
    what_it_contains: 'Raw events — event name, distinct_id, time, properties (JSON), insert_id.',
    why_it_matters: 'Complete user interaction dataset for product analytics.',
    key_callouts: 'Properties column is JSON — parse for specific event attributes. insert_id is the dedupe key.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PEOPLE',
    what_it_contains: 'User profiles — distinct_id, all profile properties as JSON or flattened columns.',
    why_it_matters: 'User dimension for segmentation and cohort analysis.',
    key_callouts: 'Profile properties can be dynamic. Join to EVENT via distinct_id.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'REVENUE',
    what_it_contains: 'Revenue events — amount, distinct_id, timestamp, associated properties.',
    why_it_matters: 'Product revenue tracking tied to user behavior.',
    key_callouts: 'Only populated if revenue tracking is enabled in Mixpanel.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Event Volume Creates High MAR',
    issue_preview: 'Product analytics events generate massive row counts',
    root_cause: 'Like Amplitude, Mixpanel captures every user interaction as an event. High-traffic products generate millions of events per day, each counting as MAR.',
    impact: 'MAR can be very high. Estimate before connecting: DAU × events/user/day × 30.',
    resolution: 'Estimate MAR impact before setup. Consider exporting from Mixpanel to S3/GCS and using a file connector if MAR costs are too high. Filter event types in downstream models to focus analysis.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Event Properties Are JSON — Require Parsing',
    issue_preview: 'Dynamic properties stored as JSON strings',
    root_cause: 'Mixpanel event properties vary per event type and can include arbitrary custom properties. Flattening all possible properties into columns would create thousands of sparse columns.',
    impact: 'Analysts must use JSON parsing functions to access event properties. Query complexity increases.',
    resolution: 'Build dbt models that extract key properties into named columns for common event types. Document the JSON structure for high-value events.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Data Export API Has Processing Delay',
    issue_preview: 'Most recent events delayed by several hours',
    root_cause: 'Mixpanel processes and makes data available for export with a delay (typically 24 hours for the raw data export). This is a Mixpanel platform constraint.',
    impact: 'The most recent day of events may not be available in the warehouse. Near-real-time analytics not possible via this connector.',
    resolution: 'Accept the delay for warehouse-based analytics. For real-time product data, use the Mixpanel UI or Mixpanel webhooks. Design dashboards to exclude the trailing day.'
  }
];

async function main() {
  console.log('Seeding Mixpanel connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Mixpanel');

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

  console.log('\nDone — Mixpanel: 3 tables, 3 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
