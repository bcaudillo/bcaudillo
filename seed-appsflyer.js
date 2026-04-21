// seed-appsflyer.js
// Populates Supabase with Fivetran AppsFlyer connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'appsflyer';

const connector = {
  id: CONNECTOR_ID,
  name: 'AppsFlyer',
  category: 'attribution',
  description: "Fivetran's AppsFlyer connector syncs mobile attribution and marketing analytics data via the AppsFlyer Pull API. It provides install attribution, in-app event tracking, cost data, and uninstall metrics for mobile app marketing analysis.",
  what_it_does: 'Syncs app installs with attribution source, in-app events (purchases, registrations, etc.), uninstall events, and aggregated cost data per media source. Incremental sync by day with lookback for attribution restatements.',
  useful_for: 'Mobile user acquisition analysis, install attribution by ad network, in-app event funnel reporting, mobile ad spend ROI, LTV calculation by acquisition channel, and iOS/Android marketing performance comparison.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'INSTALLS',
    what_it_contains: 'Install-level attribution records — device_id, media_source, campaign, ad_set, ad, install_time, attributed_touch_type (click/view), platform (ios/android), country, city.',
    why_it_matters: 'Core attribution table linking every app install to its marketing source for user acquisition analysis.',
    key_callouts: 'media_source identifies the ad network (Facebook Ads, Google Ads, TikTok, organic, etc.). attributed_touch_type distinguishes click-through vs view-through installs. Raw data access requires AppsFlyer Premium/Enterprise plan — aggregate-only plans get summary data.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'IN_APP_EVENTS',
    what_it_contains: 'Post-install event records — event_name, event_value, event_time, media_source, campaign, device_id, revenue, currency.',
    why_it_matters: 'Connects downstream user actions (purchases, sign-ups, level completions) back to the original acquisition source for LTV and ROI analysis.',
    key_callouts: 'event_name is defined by the app developer (af_purchase, af_complete_registration, custom events). event_value contains event-specific JSON data. Revenue events populate the revenue and currency fields for ROAS calculations.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'UNINSTALLS',
    what_it_contains: 'Uninstall event records — device_id, media_source, campaign, uninstall_time, days_since_install.',
    why_it_matters: 'Measures retention and churn by acquisition source — critical for identifying which channels bring users who stay vs. leave.',
    key_callouts: 'Uninstall detection has a delay (24-48 hours for Android via silent push, varies for iOS). Not all uninstalls are detected — accuracy is ~95% for Android, lower for iOS. days_since_install helps calculate retention curves.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'COST',
    what_it_contains: 'Aggregated cost data per media source — date, media_source, campaign, ad_set, impressions, clicks, installs, cost.',
    why_it_matters: 'Enables CPI (cost per install) and ROAS calculations by joining cost data to install and revenue attribution.',
    key_callouts: 'Cost data requires a separate API integration per ad network configured in AppsFlyer\'s cost dashboard. Not all networks support cost ingestion. Granularity varies by network — some provide campaign-level only, others go to ad-level.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Raw Data Export Requires Premium Plan',
    issue_preview: 'Install and event-level data unavailable on standard AppsFlyer plans',
    root_cause: 'AppsFlyer\'s Pull API for raw (device-level) data export is only available on Premium and Enterprise plans. Standard plans only provide aggregate reports, which means the Fivetran connector cannot pull individual install or event records.',
    impact: 'Customers on standard AppsFlyer plans discover during onboarding that INSTALLS, IN_APP_EVENTS, and UNINSTALLS tables are empty or return API permission errors. They expected user-level data but only have access to aggregated summaries.',
    resolution: 'Confirm the customer\'s AppsFlyer plan tier before positioning the Fivetran connector. If they are on a standard plan, set expectations that only aggregate data is available. Recommend upgrading to Premium for raw data access, or use AppsFlyer\'s aggregate Pull API endpoints for summary reporting.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Attribution Lookback Window Causes Retroactive Changes',
    issue_preview: 'Install attribution can change days after the event as AppsFlyer re-evaluates touchpoints',
    root_cause: 'AppsFlyer uses configurable lookback windows (default 7 days for click-through, 24 hours for view-through). During this window, an install\'s attribution can be reassigned if a higher-priority touchpoint is identified (e.g., a click overrides an earlier view). Retargeting re-engagement windows add further complexity.',
    impact: 'INSTALLS rows for recent dates may change media_source or campaign on subsequent syncs. CPI and channel performance metrics shift retroactively. Dashboards built on point-in-time snapshots become inaccurate.',
    resolution: 'Always use the latest synced version of attribution data. Exclude data within the active lookback window from finalized reporting. Build dbt models that handle attribution updates gracefully using updated_at timestamps rather than install_time alone.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Privacy Restrictions (GDPR/ATT) Reduce Attribution Match Rates',
    issue_preview: 'iOS ATT opt-out and GDPR consent gaps cause unattributed installs to spike',
    root_cause: 'Apple\'s App Tracking Transparency (ATT) framework requires user opt-in for IDFA access on iOS 14.5+. Users who decline tracking cannot be deterministically attributed. GDPR/CCPA consent requirements similarly restrict data collection in applicable regions. SKAdNetwork provides limited aggregate attribution as a fallback.',
    impact: 'A growing percentage of iOS installs appear as "organic" or "unattributed" even when driven by paid campaigns. Media source accuracy degrades — paid channel ROI appears worse than reality. Android attribution remains largely unaffected.',
    resolution: 'Educate the customer that 30-60% iOS opt-out rates are normal post-ATT. Recommend implementing AppsFlyer\'s probabilistic modeling and SKAdNetwork integration for partial iOS attribution. Build reporting that accounts for a "modeled conversions" adjustment factor. Focus iOS measurement on incrementality testing rather than last-touch attribution.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Cost Data Requires Separate API Integration Per Ad Network',
    issue_preview: 'COST table missing data for some ad networks despite active campaigns',
    root_cause: 'AppsFlyer\'s cost data is not sourced from a single API — each ad network (Meta, Google, TikTok, Unity, ironSource, etc.) requires a separate cost integration configured in AppsFlyer\'s dashboard. Each integration has its own authentication (API keys, OAuth) and may have different data availability delays.',
    impact: 'COST table has gaps for networks where cost integration is not configured. CPI and ROAS calculations are incomplete. The customer blames Fivetran when the issue is upstream in AppsFlyer configuration.',
    resolution: 'During onboarding, walk through AppsFlyer\'s Configuration → Integrated Partners page and verify cost integration status for each active ad network. Common gaps: TikTok and Snap require separate API tokens, some smaller networks do not support cost ingestion at all. Document which networks have cost data and which require manual upload.'
  }
];

async function main() {
  console.log('Seeding AppsFlyer connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: AppsFlyer');

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

  console.log('\nDone — AppsFlyer: 4 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
