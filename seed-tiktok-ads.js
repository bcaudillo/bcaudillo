// seed-tiktok-ads.js
// Populates Supabase with Fivetran TikTok Ads connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'tiktok_ads';

const connector = {
  id: CONNECTOR_ID,
  name: 'TikTok Ads',
  category: 'marketing',
  description: "Fivetran's TikTok Ads connector syncs campaign, ad group, and ad-level performance data via the TikTok Marketing API. It provides spend, impression, click, and conversion metrics for paid social analytics.",
  what_it_does: 'Syncs advertiser account data, campaigns, ad groups, ads, and daily performance metrics. Pulls spend, impressions, clicks, conversions, and video engagement metrics. Incremental sync by day.',
  useful_for: 'Paid social analytics, TikTok campaign ROI, creative performance analysis, cross-channel spend reporting, DTC and e-commerce advertising measurement.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD_REPORT_DAILY',
    what_it_contains: 'Daily performance by ad — spend, impressions, clicks, conversions, CTR, CPC, CPM, video views.',
    why_it_matters: 'Most granular performance table — ad-level daily metrics for creative analysis.',
    key_callouts: 'Join to AD for creative metadata. Video metrics (video_play_actions, video_watched_2s) key for TikTok-specific analysis.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN',
    what_it_contains: 'Campaign records — name, objective, budget, status, advertiser_id.',
    why_it_matters: 'Campaign dimension for grouping and filtering performance data.',
    key_callouts: 'Campaign objective determines which conversion events are tracked (APP_INSTALL, CONVERSIONS, LEAD_GENERATION, etc.).'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD_GROUP',
    what_it_contains: 'Ad group (targeting) records — placement, audience, budget, schedule, optimization goal.',
    why_it_matters: 'Audience and targeting dimension for performance breakdown.',
    key_callouts: 'Targeting details (age, gender, interest) stored here but not available in report tables.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD',
    what_it_contains: 'Individual ad records — creative type, status, display name, video or image asset ID.',
    why_it_matters: 'Creative dimension for ad-level performance analysis.',
    key_callouts: 'Creative asset URLs not stored — reference TikTok Ads Manager for creative previews.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Data Lookback Window Causes Retroactive Updates',
    issue_preview: 'Historical data changes after initial sync',
    root_cause: 'TikTok finalizes conversion data with a lookback window (typically 7–28 days depending on optimization goal). Fivetran re-syncs a rolling window to capture attribution updates.',
    impact: 'Rows updated retroactively — daily spend or conversion counts may change days after the event. Point-in-time snapshots become unreliable.',
    resolution: 'Design reporting to use the latest synced values, not point-in-time. Build dbt models that use MAX(_fivetran_synced) to get the most recent values per day.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Pixel Conversion Data Requires TikTok Pixel Setup',
    issue_preview: 'Conversion columns null without pixel installation',
    root_cause: 'Conversion events (purchases, sign-ups, etc.) require the TikTok Pixel installed on the advertiser\'s website or app SDK integration.',
    impact: 'Conversion metrics empty for accounts without proper pixel setup. ROI and ROAS calculations not possible.',
    resolution: 'Verify TikTok Pixel is installed and firing correctly in TikTok Events Manager. Confirm conversion events are mapped to campaign optimization goals.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Report Metrics Not Available at All Granularities',
    issue_preview: 'Some metrics only available at campaign level, not ad level',
    root_cause: 'TikTok Marketing API restricts certain metrics to specific reporting levels. Reach and frequency metrics, for example, are only available at campaign level.',
    impact: 'Ad-level reports missing reach/frequency — cannot calculate true reach per creative.',
    resolution: 'Use campaign-level report tables for reach/frequency metrics. Join to ad-level tables on campaign_id for combined analysis.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Advertiser Account Requires Correct Permissions',
    issue_preview: 'Missing data when authenticated user lacks account access',
    root_cause: 'The OAuth user must have Analyst or higher role on the TikTok Ads account. Sub-accounts (under an agency) require explicit access grant.',
    impact: 'Sync succeeds but returns no data or incomplete data for restricted accounts.',
    resolution: 'Ensure the authenticating user has at least Analyst role on all advertiser accounts. For agency setups, grant access at the sub-account level in TikTok Business Center.'
  }
];

async function main() {
  console.log('Seeding TikTok Ads connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: TikTok Ads');

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

  console.log('\nDone — TikTok Ads: 4 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
