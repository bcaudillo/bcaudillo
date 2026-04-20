// seed-linkedin-ads.js
// Populates Supabase with Fivetran LinkedIn Ads connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'linkedin_ads';

const connector = {
  id: CONNECTOR_ID,
  name: 'LinkedIn Ads',
  category: 'marketing',
  description: "Fivetran's LinkedIn Ads connector syncs campaign performance data via the LinkedIn Marketing API. It provides impression, click, spend, and conversion data for B2B advertising analytics.",
  what_it_does: 'Syncs LinkedIn campaign groups, campaigns, creatives, and performance analytics. Pulls account-level and campaign-level spend, impressions, clicks, and conversions. Incremental sync by day.',
  useful_for: 'B2B paid media analytics, LinkedIn campaign ROI, cost-per-lead tracking, account-based marketing performance, blending LinkedIn spend with CRM pipeline data.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD_ANALYTICS_BY_CAMPAIGN',
    what_it_contains: 'Daily spend, impressions, clicks, conversions, and cost-per-click by campaign.',
    why_it_matters: 'Primary table for campaign performance reporting and ROI analysis.',
    key_callouts: 'Granularity is daily. Join to CAMPAIGN for campaign metadata.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN',
    what_it_contains: 'Campaign records — name, status, objective, targeting, budget, bid type.',
    why_it_matters: 'Campaign dimension for filtering and grouping analytics.',
    key_callouts: 'Campaign objective (BRAND_AWARENESS, LEAD_GENERATION, etc.) drives which conversion metrics are meaningful.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN_GROUP',
    what_it_contains: 'Campaign group (account-level grouping) name, status, and budget.',
    why_it_matters: 'Roll-up reporting at the campaign group level.',
    key_callouts: 'Budget set at group level overrides campaign-level budgets.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CREATIVE',
    what_it_contains: 'Ad creative records — type, status, and associated campaign.',
    why_it_matters: 'Creative-level performance analysis (which ads drive results).',
    key_callouts: 'Join AD_ANALYTICS_BY_CREATIVE to CREATIVE for creative-level metrics.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Conversion Data Requires LinkedIn Insight Tag',
    issue_preview: 'Conversion metrics empty without proper setup',
    root_cause: 'LinkedIn conversion tracking requires the Insight Tag installed on the customer\'s website and conversion events configured in LinkedIn Campaign Manager.',
    impact: 'Conversion columns (conversions, conversionValueInLocalCurrency) are null or zero if tracking is not set up.',
    resolution: 'Verify the LinkedIn Insight Tag is installed site-wide. Confirm conversion events are configured and attributed to campaigns in LinkedIn Campaign Manager.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Data Available After 72-Hour Delay',
    issue_preview: 'Recent performance data incomplete due to LinkedIn processing delay',
    root_cause: 'LinkedIn finalizes ad metrics up to 72 hours after the event. Data for the trailing 3 days is subject to revision.',
    impact: 'Yesterday\'s spend and click data may increase after finalization. Dashboards showing recent data may undercount.',
    resolution: 'Exclude the trailing 3 days from fixed reporting. Design dashboards to flag recent data as "preliminary."'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'API Rate Limits Slow Large Account Syncs',
    issue_preview: 'Syncs take longer for accounts with many campaigns',
    root_cause: 'LinkedIn Marketing API enforces strict rate limits. Accounts with hundreds of campaigns require many API calls, each subject to throttling.',
    impact: 'Sync duration increases significantly. Data freshness may lag for large accounts.',
    resolution: 'This is expected behavior. Increase sync interval if freshness is not critical. Archive inactive campaigns in LinkedIn to reduce API call volume.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Audience Segment Data Not Available',
    issue_preview: 'Demographic breakdown (job title, industry, seniority) not in sync',
    root_cause: 'LinkedIn does not expose audience segment breakdowns via the Marketing API for privacy reasons. Only aggregate metrics are available.',
    impact: 'Cannot analyze performance by job title, seniority, or company size in the warehouse.',
    resolution: 'Use LinkedIn Campaign Manager UI for demographic breakdowns. Warehouse data is limited to campaign-level aggregates only.'
  }
];

async function main() {
  console.log('Seeding LinkedIn Ads connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: LinkedIn Ads');

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

  console.log('\nDone — LinkedIn Ads: 4 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
