// seed-snapchat-ads.js
// Populates Supabase with Fivetran Snapchat Ads connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'snapchat_ads';

const connector = {
  id: CONNECTOR_ID,
  name: 'Snapchat Ads',
  category: 'marketing',
  description: "Fivetran's Snapchat Ads connector syncs campaign performance data via the Snapchat Marketing API. It provides impression, swipe-up, spend, and conversion data for Snapchat advertising analytics.",
  what_it_does: 'Syncs ad accounts, campaigns, ad squads (ad groups), ads, creatives, and daily performance stats. Pulls spend, impressions, swipe-ups, video views, and conversion events. Incremental sync by day.',
  useful_for: 'Paid social analytics, Snapchat campaign ROI, creative performance analysis, cross-channel ad spend reporting, and DTC/Gen-Z audience advertising measurement.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD_SQUAD_STATS_DAILY',
    what_it_contains: 'Daily ad squad performance — spend, impressions, swipe_ups, video_views, conversions by ad squad.',
    why_it_matters: 'Ad squad (targeting) level performance reporting.',
    key_callouts: 'Snapchat calls ad groups "ad squads." swipe_ups is the Snap equivalent of clicks. Join to AD_SQUAD for targeting details.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN',
    what_it_contains: 'Campaign records — name, objective, status, daily/lifetime budget, start/end date.',
    why_it_matters: 'Campaign dimension for grouping performance data.',
    key_callouts: 'objective: AWARENESS, APP_INSTALLS, WEB_CONVERSIONS, etc. Drives which metrics are relevant.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD_SQUAD',
    what_it_contains: 'Ad squad (targeting group) — name, campaign, targeting spec, optimization goal, bid.',
    why_it_matters: 'Targeting dimension — audience definition for each ad squad.',
    key_callouts: 'targeting field contains audience specifications as JSON (age, gender, interests, custom audiences).'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD',
    what_it_contains: 'Ad records — name, status, creative_id, ad_squad, type.',
    why_it_matters: 'Creative dimension linking to performance data.',
    key_callouts: 'Join to CREATIVE for actual creative assets. type: SNAP_AD, STORY_AD, COLLECTION_AD, etc.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Conversion Attribution Window Causes Retroactive Updates',
    issue_preview: 'Historical data changes as conversions are attributed retroactively',
    root_cause: 'Snapchat uses a configurable attribution window (default 28 days for swipe-ups, 1 day for views). Conversions attributed within this window update historical daily stats.',
    impact: 'Rows updated retroactively — spend and conversion data for past days may change. Point-in-time reporting unreliable.',
    resolution: 'Design reporting to use the latest synced values. Account for the attribution window when comparing time periods. Build dbt models that use the most recent version of each day\'s data.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Snap Pixel Required for Conversion Tracking',
    issue_preview: 'Conversion columns null without Snap Pixel',
    root_cause: 'Snapchat conversion events (purchases, sign-ups, app installs) require the Snap Pixel installed on the website or CAPI (Conversion API) configured.',
    impact: 'All conversion metrics empty without pixel/CAPI setup. Cannot measure ROI.',
    resolution: 'Verify Snap Pixel is installed or CAPI is configured in Snapchat Ads Manager → Events Manager. Test with Snap Pixel Helper browser extension.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Unique Terminology Confuses Cross-Channel Reporting',
    issue_preview: 'Snapchat uses "swipe-ups" and "ad squads" instead of standard terms',
    root_cause: 'Snapchat uses platform-specific terminology: "swipe-ups" instead of clicks, "ad squads" instead of ad groups, "squads" instead of targeting groups.',
    impact: 'Cross-channel reporting requires mapping Snap terminology to standard advertising terms (clicks, ad groups, etc.).',
    resolution: 'Build a normalization layer in dbt that renames Snap columns to match your cross-channel schema: swipe_ups → clicks, ad_squad → ad_group, etc.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Video View Metrics Have Multiple Definitions',
    issue_preview: 'video_views vs video_views_15s vs quartile metrics cause confusion',
    root_cause: 'Snapchat tracks multiple video view thresholds: 2-second views, 15-second views, quartile completions (25%, 50%, 75%, 100%). Each is a separate metric.',
    impact: 'Using the wrong view metric overstates or understates video engagement. "Video views" alone is ambiguous.',
    resolution: 'Define which video view metric your team considers a "view" and standardize on it. Typically video_views_15s or video_completions is most meaningful. Document the definition in your data dictionary.'
  }
];

async function main() {
  console.log('Seeding Snapchat Ads connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Snapchat Ads');

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

  console.log('\nDone — Snapchat Ads: 4 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
