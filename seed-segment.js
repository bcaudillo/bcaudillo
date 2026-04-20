// seed-segment.js
// Populates Supabase with Fivetran Segment connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'segment';

const connector = {
  id: CONNECTOR_ID,
  name: 'Segment',
  category: 'cdp',
  description: "Fivetran's Segment connector syncs customer data platform event data. Segment is commonly used as a warehouse destination directly, but Fivetran can also sync Segment data from S3/GCS event archives or via webhook for secondary warehouse loads.",
  what_it_does: 'Syncs identify calls (user traits), track calls (events), page/screen calls, and group calls from Segment\'s data archive or direct integration. Event-level data with full context (properties, traits, anonymousId, userId).',
  useful_for: 'Unified customer event tracking, identity resolution, cross-platform behavioral analytics, marketing attribution, and centralizing Segment data in a warehouse different from the primary destination.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TRACKS',
    what_it_contains: 'Track events — event name, user_id, anonymous_id, timestamp, context (device, location, referrer), properties (JSON).',
    why_it_matters: 'Complete user behavior dataset — every tracked action in the product.',
    key_callouts: 'properties is JSON — contains event-specific data. Each distinct event name also creates its own table (e.g., ORDER_COMPLETED, SIGNUP_COMPLETED).'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'IDENTIFIES',
    what_it_contains: 'Identify calls — user_id, anonymous_id, traits (email, name, plan, custom attributes).',
    why_it_matters: 'User identity and trait data — links anonymous sessions to known users.',
    key_callouts: 'traits is JSON. Each identify call creates/updates the user profile. Latest identify call has the most current traits.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PAGES',
    what_it_contains: 'Page view events — user_id, anonymous_id, url, path, title, referrer, timestamp.',
    why_it_matters: 'Web pageview tracking for funnel analysis and content engagement.',
    key_callouts: 'High volume — every page load is a row. context.page contains full URL details.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'GROUPS',
    what_it_contains: 'Group (account/company) calls — group_id, user_id, traits (company name, plan, industry).',
    why_it_matters: 'Account-level data for B2B product analytics.',
    key_callouts: 'Only populated if the customer uses Segment\'s group() call. Traits are JSON — company-specific attributes.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Segment Usually Writes Directly to Warehouse — Fivetran May Be Redundant',
    issue_preview: 'Customer may already have Segment → Snowflake/BigQuery configured',
    root_cause: 'Segment has its own warehouse destination feature that writes directly to Snowflake, BigQuery, or Redshift. Using Fivetran to also sync Segment data creates duplicate pipelines.',
    impact: 'Duplicate data in the warehouse, double MAR costs, potential confusion about which is the source of truth.',
    resolution: 'Ask the customer if they already have a Segment warehouse destination configured. If yes, Fivetran Segment connector is typically unnecessary. Use Fivetran only if sending to a different warehouse than Segment\'s primary destination.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Event-Per-Table Schema Creates Many Tables',
    issue_preview: 'Each distinct event name creates its own table',
    root_cause: 'Segment\'s warehouse schema creates a separate table for each tracked event name (e.g., order_completed, button_clicked, signup_started). Products with many event types generate dozens of tables.',
    impact: 'Schema has 50–200+ event-specific tables. Querying across events requires UNION ALL. Schema exploration is overwhelming.',
    resolution: 'Use the TRACKS table for cross-event analysis (it has all events). Use event-specific tables only when you need strongly-typed properties columns. Build a unified events model in dbt.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Anonymous to Known User Stitching Is Complex',
    issue_preview: 'Connecting pre-login anonymous activity to identified users',
    root_cause: 'Segment assigns anonymous_id to unauthenticated users. When a user logs in, an identify call links anonymous_id to user_id. Stitching all pre-login activity to the known user requires joining on anonymous_id.',
    impact: 'User journey analysis is incomplete without identity stitching. Attribution models break without connecting anonymous sessions to conversions.',
    resolution: 'Build an identity graph model: map anonymous_id → user_id using the IDENTIFIES table. Join TRACKS and PAGES to the identity graph to attribute all activity to known users.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Properties Schema Drift Creates Sparse Columns',
    issue_preview: 'New event properties auto-create new columns — many are sparse',
    root_cause: 'Segment auto-creates destination columns for each new property key sent in track/identify calls. Developers adding new properties or typos create new columns automatically.',
    impact: 'Tables accumulate hundreds of sparse columns over time. Many columns are null for 99%+ of rows.',
    resolution: 'Implement a Segment tracking plan to control which properties are sent. Use the JSON properties column for ad-hoc analysis. Build dbt models that select only the columns you need.'
  }
];

async function main() {
  console.log('Seeding Segment connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Segment');

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

  console.log('\nDone — Segment: 4 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
