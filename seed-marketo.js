// seed-marketo.js
// Populates Supabase with Fivetran Marketo connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'marketo';

const connector = {
  id: CONNECTOR_ID,
  name: 'Marketo',
  category: 'marketing',
  description: "Fivetran's Marketo connector syncs marketing automation data including leads, activities, campaigns, programs, email performance, and custom objects. It provides a comprehensive view of marketing engagement and pipeline attribution.",
  what_it_does: 'Syncs leads, activities (email opens/clicks/bounces, form fills, web visits, scoring changes), campaigns, programs, lists, custom objects, and lead partitions via the Marketo REST API. Uses bulk extract API for historical data and activity stream for incremental sync.',
  useful_for: 'Marketing attribution modeling, lead scoring analysis, campaign performance reporting, email engagement metrics, marketing-to-sales pipeline handoff analysis, and marketing ROI calculation.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'LEAD',
    what_it_contains: 'All leads/contacts — email, name, company, score, source, status, custom fields, created/updated dates.',
    why_it_matters: 'Core marketing database. Every engagement and campaign ties back to a lead.',
    key_callouts: 'Custom fields appear as columns. Lead partitions create separate pools. Merged leads tracked via merged_in_lead_id.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ACTIVITY',
    what_it_contains: 'All lead activities — activity type, lead reference, attributes, timestamp. Includes email sends/opens/clicks, form fills, web visits, score changes.',
    why_it_matters: 'The engagement timeline. Powers attribution modeling and engagement scoring.',
    key_callouts: 'VERY high-volume table — millions of rows per month. Activity types are numeric IDs — join to ACTIVITY_TYPE for names. Primary activity attributes stored as JSON.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN',
    what_it_contains: 'Smart campaigns and batch campaigns — name, type, status, program reference, flow steps.',
    why_it_matters: 'Campaign inventory for performance analysis and automation tracking.',
    key_callouts: 'Types: batch, trigger, smart. Active campaigns run continuously.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PROGRAM',
    what_it_contains: 'Marketing programs — name, channel, status, costs, tags, membership counts.',
    why_it_matters: 'Top-level container for campaigns. Essential for marketing spend attribution.',
    key_callouts: 'Programs contain campaigns, local assets, and members. Channel determines program type (webinar, email, event, etc.).'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'ACTIVITY Table Is Extremely Large',
    issue_preview: 'Activity data drives massive MAR consumption',
    root_cause: 'Marketo records every lead interaction as an activity — email sends, opens, clicks, web visits, score changes, field changes. Enterprise Marketo instances generate millions of activities per month.',
    impact: 'MAR spikes dramatically. Storage costs increase. Queries without date/type filters are very slow. This is the #1 cost driver for Marketo connectors.',
    resolution: 'Filter activity types to only those needed. Common high-value types: email sent, email opened, clicked link, form filled out, score changed. Exclude low-value types like web page visit if not needed.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'API Rate Limits — Daily Quota and Concurrent Calls',
    issue_preview: 'Marketo API quota exhausted before sync completes',
    root_cause: 'Marketo enforces a daily API call quota (typically 10,000-50,000 calls/day depending on license) and a limit of 10 concurrent API calls. The bulk extract API has separate quotas. Sharing API credentials with other integrations compounds the issue.',
    impact: 'Syncs fail or are incomplete when the daily quota is exhausted. Subsequent syncs also fail until the quota resets at midnight.',
    resolution: 'Use a dedicated API-only user for Fivetran. Monitor API usage in Marketo Admin → Integration → Web Services. Request a quota increase from Marketo support if needed. Reduce sync frequency for non-critical tables.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Custom Objects Require Explicit API Access',
    issue_preview: 'Custom objects not appearing in connector schema',
    root_cause: 'Marketo custom objects must have their API name explicitly configured in the connector setup. They are not auto-discovered. Additionally, the custom object must be approved (not in draft state) in Marketo.',
    impact: 'Custom object data missing from warehouse. Commonly missed during initial setup.',
    resolution: 'Add custom object API names in the Fivetran connector settings. Ensure each custom object is approved in Marketo Admin → Database Management → Custom Objects. Re-sync after adding.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Bulk Extract Jobs Can Be Slow for Large Date Ranges',
    issue_preview: 'Historical sync takes days for large Marketo instances',
    root_cause: 'Fivetran uses the Marketo Bulk Extract API for historical data. Large Marketo instances with millions of leads and years of activities require many bulk extract jobs, each with processing time on the Marketo side.',
    impact: 'Initial historical sync can take several days. During this time, incremental data also queues behind the bulk load.',
    resolution: 'Set a shorter historical sync time frame if full history is not needed. Be patient with the initial load — it only happens once. After the historical load completes, incremental syncs are fast.'
  }
];

async function main() {
  console.log('Seeding Marketo connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Marketo');

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

  console.log('\nDone — Marketo: 4 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
