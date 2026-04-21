// seed-pinterest-ads.js
// Populates Supabase with Fivetran Pinterest Ads connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'pinterest_ads';

const connector = {
  id: CONNECTOR_ID,
  name: 'Pinterest Ads',
  category: 'marketing',
  description: "Fivetran's Pinterest Ads connector syncs campaign performance data via the Pinterest Advertising API. It provides impression, click, spend, and conversion data for Pinterest advertising analytics.",
  what_it_does: 'Syncs ad accounts, campaigns, ad groups, pin promotions, and daily performance reports. Pulls spend, impressions, clicks, conversions, and engagement metrics. Incremental sync by day with lookback window for attribution updates.',
  useful_for: 'Paid social analytics, Pinterest campaign ROI, creative performance by pin, cross-channel ad spend reporting, and visual commerce / shopping ad measurement for retail and DTC brands.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD_REPORT_DAILY',
    what_it_contains: 'Daily ad-level performance — impressions, clicks, spend, conversions, engagement rate, CTR, CPM, CPC by pin promotion.',
    why_it_matters: 'Most granular performance table for daily ad-level reporting and optimization.',
    key_callouts: 'Rows can be updated retroactively based on conversion attribution window (7, 30, or 60 days). Join to PIN_PROMOTION and AD_GROUP for hierarchy. Engagement includes saves (formerly "repins"), closeups, and clicks.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN',
    what_it_contains: 'Campaign records — name, status, objective type, daily/lifetime budget, start/end date.',
    why_it_matters: 'Campaign dimension for grouping performance data and understanding budget allocation.',
    key_callouts: 'objective_type drives available optimization goals: AWARENESS, CONSIDERATION, VIDEO_VIEW, CONVERSIONS, CATALOG_SALES. Budget pacing affects daily spend distribution.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD_GROUP',
    what_it_contains: 'Ad group records — name, campaign, targeting spec, bid, optimization goal, placement type.',
    why_it_matters: 'Targeting and bid strategy dimension — defines who sees the ads and at what price.',
    key_callouts: 'Targeting includes interests, keywords, audiences, and actalike (Pinterest term for lookalike) audiences. placement_type: SEARCH, BROWSE, or ALL for where ads appear.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PIN_PROMOTION',
    what_it_contains: 'Promoted pin records — pin_id, ad_group, status, creative type, destination URL.',
    why_it_matters: 'Creative dimension linking promoted pins to performance data.',
    key_callouts: 'Pinterest calls ads "pin promotions." The pin_id links to the organic pin content. Creative type includes standard, video, carousel, shopping, and collections ads.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Conversion Attribution Window Causes Retroactive Data Updates',
    issue_preview: 'Historical performance data changes as conversions are attributed days or weeks later',
    root_cause: 'Pinterest supports configurable attribution windows of 7, 30, or 60 days for both click-through and view-through conversions. Conversions occurring within the window are attributed back to the original ad interaction, updating historical daily stats.',
    impact: 'AD_REPORT_DAILY rows for past dates are updated on subsequent syncs. Point-in-time snapshots become inaccurate. Revenue and ROAS metrics for recent periods are understated until the attribution window closes.',
    resolution: 'Design dashboards to always use the latest synced values rather than point-in-time snapshots. Exclude data within the active attribution window from finalized reporting. Build dbt models that treat each sync as the most current version of historical data.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Pinterest Tag Required for Conversion Tracking',
    issue_preview: 'Conversion and revenue columns are null without the Pinterest Tag installed',
    root_cause: 'Pinterest conversion events (checkout, add-to-cart, sign-up, lead, page visit) require the Pinterest Tag (JavaScript pixel) installed on the advertiser\'s website or the Conversions API configured server-side.',
    impact: 'All conversion metrics in AD_REPORT_DAILY (total_conversions, checkout_value, etc.) return null or zero. Cannot calculate ROAS or cost-per-acquisition, making it impossible to demonstrate ROI to the customer.',
    resolution: 'Verify the Pinterest Tag is installed in Pinterest Ads Manager → Conversions → Pinterest Tag. Recommend the Pinterest Tag Helper Chrome extension for testing. For server-side tracking, confirm the Conversions API is sending events with correct event_id deduplication.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Limited Audience Targeting Data Available via API',
    issue_preview: 'Interest and keyword targeting details not fully exposed in synced data',
    root_cause: 'The Pinterest API returns targeting specifications as nested objects, but detailed audience segment names (e.g., specific interest categories or customer list names) are not fully resolved. The API provides IDs rather than human-readable labels for many targeting dimensions.',
    impact: 'Customers expecting to analyze performance by audience segment or interest category in their warehouse find only opaque IDs. Requires manual mapping or supplementary data from the Pinterest UI.',
    resolution: 'Set expectations during onboarding that audience-level analysis is best done in the Pinterest Ads Manager UI. For warehouse reporting, focus on ad group-level performance since each ad group typically represents a distinct targeting strategy.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Creative Asset URLs and Pin Images Not Synced',
    issue_preview: 'Pin image URLs and creative assets not available in synced tables',
    root_cause: 'The Pinterest Ads API does not expose direct URLs to pin images or video assets in the ad reporting endpoints. The PIN_PROMOTION table contains metadata but not the actual creative media URLs.',
    impact: 'Customers wanting to build creative performance dashboards with visual previews cannot pull images directly from the warehouse data. Creative A/B testing analysis lacks visual context.',
    resolution: 'Use the pin_id from PIN_PROMOTION to construct Pinterest URLs (pinterest.com/pin/{pin_id}) for reference. For automated creative reporting, consider supplementing with the Pinterest Content API or storing creative assets separately during upload.'
  }
];

async function main() {
  console.log('Seeding Pinterest Ads connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Pinterest Ads');

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

  console.log('\nDone — Pinterest Ads: 4 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
