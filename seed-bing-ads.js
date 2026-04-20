// seed-bing-ads.js
// Populates Supabase with Fivetran Bing Ads (Microsoft Advertising) connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'bing_ads';

const connector = {
  id: CONNECTOR_ID,
  name: 'Bing Ads (Microsoft Advertising)',
  category: 'marketing',
  description: "Fivetran's Bing Ads connector syncs Microsoft Advertising campaign performance data via the Bing Ads Reporting API. It provides impression, click, spend, and conversion data for paid search analytics.",
  what_it_does: 'Syncs accounts, campaigns, ad groups, ads, keywords, and daily performance reports. Pulls spend, impressions, clicks, conversions, and quality score. Incremental sync by day.',
  useful_for: 'Paid search analytics, cross-channel ad spend reporting (combined with Google Ads), keyword performance tracking, and B2B advertising ROI measurement.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD_PERFORMANCE_REPORT',
    what_it_contains: 'Daily ad-level metrics — impressions, clicks, spend, conversions, CTR, CPC, average position.',
    why_it_matters: 'Most granular performance table for ad-level analysis.',
    key_callouts: 'Join to AD, AD_GROUP, and CAMPAIGN for hierarchy context. average_position deprecated by Microsoft but may still appear.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'KEYWORD_PERFORMANCE_REPORT',
    what_it_contains: 'Daily keyword-level metrics — impressions, clicks, spend, quality score, bid, match type.',
    why_it_matters: 'Keyword optimization and quality score tracking.',
    key_callouts: 'quality_score updates infrequently. match_type: Exact, Phrase, Broad. search_query in SEARCH_QUERY_REPORT for actual search terms.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN',
    what_it_contains: 'Campaign records — name, status, budget, bid strategy, network, time zone.',
    why_it_matters: 'Campaign dimension for grouping and filtering performance data.',
    key_callouts: 'campaign_type: Search, Shopping, Audience, DynamicSearchAds. budget_type: DailyBudgetStandard or DailyBudgetAccelerated.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD_GROUP',
    what_it_contains: 'Ad group records — name, status, default bid, campaign, network.',
    why_it_matters: 'Ad group dimension for mid-level performance analysis.',
    key_callouts: 'cpc_bid is the default bid. Individual keyword bids override this.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Data Finalization Delay of 3+ Days',
    issue_preview: 'Recent performance data subject to revision for up to 3 days',
    root_cause: 'Microsoft Advertising finalizes conversion attribution and click metrics up to 3 days after the event. Fivetran re-syncs a rolling window to capture updates.',
    impact: 'Trailing 3 days of data may change on subsequent syncs. Dashboards showing yesterday\'s data may be preliminary.',
    resolution: 'Exclude the trailing 3 days from finalized reporting. Flag recent data as "preliminary" in dashboards.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Report Column Selection Affects Available Metrics',
    issue_preview: 'Some metric combinations are not available in the same report',
    root_cause: 'Microsoft Advertising Reporting API restricts certain column combinations. Requesting incompatible columns together causes the report to fail.',
    impact: 'Fivetran pre-selects compatible column sets. Some metrics may be in separate report tables rather than combined.',
    resolution: 'Check which report table contains the metric you need. Join tables on date + entity ID for combined analysis. Review Fivetran docs for the column set per report type.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Multi-Account Hierarchy Requires Manager Account',
    issue_preview: 'Sub-accounts not syncing without proper manager account access',
    root_cause: 'Microsoft Advertising uses a hierarchy: Manager Account → Customer → Account. The connector authenticates at a level that determines which accounts are accessible.',
    impact: 'Accounts under a different manager or customer may not be visible to the connector.',
    resolution: 'Authenticate with credentials that have access to all desired accounts. Use a manager account (MCC-equivalent) for multi-account setups. Verify account access in Microsoft Advertising UI before connector setup.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'UET Tag Required for Conversion Tracking',
    issue_preview: 'Conversion columns empty without UET tag installation',
    root_cause: 'Microsoft Advertising conversion tracking requires the Universal Event Tracking (UET) tag installed on the advertiser\'s website and conversion goals configured in the platform.',
    impact: 'All conversion metrics (conversions, conversion_value, cost_per_conversion) are zero or null without UET.',
    resolution: 'Verify UET tag is installed and conversion goals are configured in Microsoft Advertising → Conversion Tracking. Test tag firing with the UET Tag Helper browser extension.'
  }
];

async function main() {
  console.log('Seeding Bing Ads connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Bing Ads');

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

  console.log('\nDone — Bing Ads: 4 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
