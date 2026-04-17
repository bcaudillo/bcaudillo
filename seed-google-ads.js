// seed-google-ads.js
// Populates Supabase with the Fivetran Google Ads connector data.
// Sources:
//   https://fivetran.com/docs/connectors/applications/google-ads
//   https://fivetran.com/docs/connectors/applications/google-ads/prebuilt-reports
//   https://fivetran.com/docs/connectors/applications/google-ads/troubleshooting
//   https://fivetran.com/docs/connectors/applications/google-ads/troubleshooting/data-discrepancies
//
// Idempotent: upserts the connector row, deletes existing google_ads child
// rows, then inserts fresh data. Re-running does not create duplicates.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_ID = 'google_ads';

// ─── CONNECTOR RECORD ────────────────────────────────────────────────────────

const connector = {
  id: CONNECTOR_ID,
  name: 'Google Ads',
  category: 'advertising',
  description: "Fivetran's Google Ads connector pulls data from one or many Google Ads accounts and combines them into a single table per report in your destination. Prebuilt reports, custom reports, and metadata tables can all be enabled or disabled on the Schema tab.",
  what_it_does: 'Syncs account structure (accounts, campaigns, ad groups, ads, keywords), prebuilt performance reports at account/campaign/ad group/ad/keyword levels, and customer-defined custom reports. All money fields are stored in micros (1,000,000 micros = 1 unit of local currency).',
  useful_for: 'Marketing analytics, campaign ROAS, attribution modeling, cross-account MCC reporting, paid-search performance dashboards, and blending ad spend with downstream conversion data from CRM or ecommerce connectors.'
};

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────
// Mix of metadata tables (account structure) and notable prebuilt reports.

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN',
    what_it_contains: 'Campaign-level metadata — name, status, budget, type, start/end dates, targeting settings.',
    why_it_matters: 'Foundation for every campaign-level rollup and filter.',
    key_callouts: 'Metadata tables are refreshed at most once every 12 hours per account to stay within Google Ads API rate limits. Does not contain full change history — only current-state snapshots.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD_GROUP',
    what_it_contains: 'Ad group metadata — name, status, campaign reference, bids, targeting settings.',
    why_it_matters: 'Granularity layer between campaigns and ads for performance breakdowns.',
    key_callouts: 'Refreshed at most every 12 hours. Snapshot-only, no change history.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD',
    what_it_contains: 'Individual ad creative metadata — headlines, descriptions, final URLs, status, ad type.',
    why_it_matters: 'Creative-level performance analysis and compliance reporting.',
    key_callouts: 'Refreshed at most every 12 hours. Snapshot-only.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'KEYWORD',
    what_it_contains: 'Keyword criteria — text, match type, bid, status, ad group reference.',
    why_it_matters: 'Keyword-level bidding analysis and search query audits.',
    key_callouts: 'Refreshed at most every 12 hours.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ACCOUNT_HOURLY_STATS',
    what_it_contains: 'Account-level performance metrics segmented by hour — impressions, clicks, cost, conversions.',
    why_it_matters: 'Intraday pacing and dayparting analysis at the account level.',
    key_callouts: 'Prebuilt report. Cost is in micros — divide by 1,000,000. Hourly segmentation means row counts grow fast; consider excluding if not needed.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN_HOURLY_STATS',
    what_it_contains: 'Campaign-level performance by hour — impressions, clicks, cost, conversions.',
    why_it_matters: 'Intraday campaign pacing, bid adjustments by hour.',
    key_callouts: 'Prebuilt report. Impressions are segmented — totaling them across rows will inflate the total. Use CAMPAIGN_STATS for accurate totals.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD_GROUP_HOURLY_STATS',
    what_it_contains: 'Ad group performance by hour — impressions, clicks, cost, conversions.',
    why_it_matters: 'Ad group pacing and hourly performance tuning.',
    key_callouts: 'Prebuilt report. Same segmentation caveat as CAMPAIGN_HOURLY_STATS.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD_GROUP_STATS',
    what_it_contains: 'Ad group performance aggregated by day — impressions, clicks, cost, conversions, conversion value.',
    why_it_matters: 'Most common grain for ad group reporting and ROAS calculation.',
    key_callouts: 'Provides total impressions irrespective of segments — prefer this over AD_GROUP_HOURLY_STATS when you need accurate totals.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD_STATS',
    what_it_contains: 'Ad-level performance aggregated by day — impressions, clicks, cost, conversions.',
    why_it_matters: 'Creative-level ROAS and A/B analysis.',
    key_callouts: 'Prebuilt report. Join to AD on ad_id.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'SEARCH_TERM_KEYWORD_STATS',
    what_it_contains: 'Actual search queries users typed, mapped to the keyword that matched — impressions, clicks, cost.',
    why_it_matters: 'Identifying negative-keyword candidates and discovering new keyword opportunities.',
    key_callouts: 'Prebuilt report. Including segments.keyword fields may return only rows with keyword criterion — review field config if rows seem missing.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN_SEARCH_TERM_INSIGHT',
    what_it_contains: 'Campaign-level search term insights with category classification.',
    why_it_matters: 'Search intent categorization and competitive analysis.',
    key_callouts: "Google Ads API limits the sync speed of this report — expect this table to be a common bottleneck during historical syncs. Consider excluding it if you don't need it."
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Money Values Are Stored in Micros',
    issue_preview: 'Cost columns show numbers a million times larger than expected',
    root_cause: 'Google Ads returns all monetary fields in micros — a unit where 1,000,000 micros equals 1 unit of the local currency. Fivetran stores them exactly as the API returns them.',
    impact: 'Cost, CPC, conversion value, and other money columns appear 1,000,000× larger than expected. Untrained users misread spend by six orders of magnitude.',
    resolution: 'Divide any micros column by 1,000,000 to get local currency. Bake this into your warehouse transformations (dbt model, view, or downstream query).'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Account Structure Tables Only Refresh Every 12 Hours',
    issue_preview: 'Campaigns, ad groups, ads, and keywords lag real-time edits by up to 12 hours',
    root_cause: 'To stay within Google Ads API rate limits, Fivetran refreshes account structure / metadata tables (CAMPAIGN, AD_GROUP, AD, KEYWORD, etc.) at most once every 12 hours per account.',
    impact: "Edits to campaign settings, new ad groups, paused keywords, etc. don't appear in the destination immediately. Reporting on 'just-changed' state is not possible.",
    resolution: 'Accept the cadence — it is a hard constraint of the connector. For near-real-time ad-management workflows, use the Google Ads UI or API directly, not the warehouse.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Impression Totals Differ Between Hourly and Non-Hourly Stats Tables',
    issue_preview: "Summing impressions from HOURLY_STATS doesn't match STATS totals",
    root_cause: 'HOURLY_STATS tables (CAMPAIGN_HOURLY_STATS, AD_GROUP_HOURLY_STATS, etc.) provide impressions per segment, so summing them can inflate the total. The non-hourly STATS tables provide the correct total impressions irrespective of segments.',
    impact: 'Impression counts differ between dashboards and the Google Ads UI depending on which table was queried. Reps get "why are the numbers wrong?" questions from customers.',
    resolution: 'Use AD_GROUP_STATS / CAMPAIGN_STATS (non-hourly) when totaling impressions. Use the hourly tables only when you need hourly segmentation and understand the segmentation caveat.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Incompatible Fields Return Fewer or Zero Rows',
    issue_preview: 'Custom reports come back empty or with surprisingly few rows',
    root_cause: "Certain Google Ads fields are mutually incompatible or filter the result set heavily. Known culprits: bidding_strategy and accessible_bidding_strategy may return no rows; segments.keyword may return only rows with a keyword criterion; segments.geo_target_* may filter out rows that can't be segmented by that geo type.",
    impact: 'Custom reports return unexpected empty or near-empty result sets, and the cause is not obvious from the connector UI.',
    resolution: 'Remove the problematic fields from the custom report definition, re-validate against the Google Ads Query Builder, and re-sync.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'segments.date Is Required for Report Tables',
    issue_preview: "Reports without segments.date don't sync",
    root_cause: "Fivetran syncs Google Ads reports incrementally by day, which requires the segments.date field. Connections created before June 7, 2024 may have reports that don't include it.",
    impact: "Reports without segments.date aren't supported and won't sync, surfacing as a schema error or empty table.",
    resolution: 'Edit the custom report definition to include segments.date, save the configuration, and re-sync.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'CAMPAIGN_SEARCH_TERM_INSIGHT Sync Is API-Speed-Limited',
    issue_preview: 'This specific report is the slowest table in the connector',
    root_cause: 'The Google Ads API enforces a slower sync speed for the CAMPAIGN_SEARCH_TERM_INSIGHT report than for other reports. Fivetran cannot work around this.',
    impact: 'Historical syncs that include this table take significantly longer, and incremental syncs may fall behind schedule when this table is enabled alongside other heavy tables.',
    resolution: 'Disable CAMPAIGN_SEARCH_TERM_INSIGHT in the Schema tab if you do not actively need it. If you do need it, run it on a less-frequent schedule or dedicated connection.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Removed Ads and Keywords Still Appear in Destination',
    issue_preview: 'Deleted Google Ads entities persist in warehouse tables without clear status',
    root_cause: 'When an ad, keyword, or ad group is removed in Google Ads, the Google Ads API marks it with a status of REMOVED but does not delete the record. Fivetran mirrors this behavior — the row remains in the destination with its status updated to REMOVED, but it is never hard-deleted.',
    impact: 'Reports that do not filter on entity status overcount active ads, keywords, and ad groups. Performance dashboards show inflated totals for active campaigns. Over time, the ratio of removed-to-active entities grows, making the tables increasingly noisy and queries slower if no status filter is applied.',
    resolution: 'Add WHERE ad_status != "REMOVED" (or equivalent for keywords, ad groups) to all downstream queries and dbt models. Consider creating a filtered view or intermediate dbt model that excludes removed entities by default so analysts do not need to remember the filter.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Google Ads connector data...\n');

  // 1. Upsert connector row
  console.log('Upserting connector record...');
  const { error: connectorError } = await supabase
    .from('connectors')
    .upsert(
      {
        ...connector,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    );

  if (connectorError) {
    console.error('Error upserting connector:', connectorError);
    process.exit(1);
  }
  console.log(`Upserted connector: ${connector.name}\n`);

  // 2. Clear existing child rows so re-runs are idempotent
  console.log('Clearing existing google_ads rows in child tables...');
  const { error: delTablesErr } = await supabase
    .from('connector_tables')
    .delete()
    .eq('connector_id', CONNECTOR_ID);
  if (delTablesErr) console.error('Warning clearing connector_tables:', delTablesErr);

  const { error: delIssuesErr } = await supabase
    .from('connector_known_issues')
    .delete()
    .eq('connector_id', CONNECTOR_ID);
  if (delIssuesErr) console.error('Warning clearing connector_known_issues:', delIssuesErr);
  console.log('Cleared.\n');

  // 3. Insert connector tables
  console.log('Inserting connector tables...');
  for (const table of connectorTables) {
    const { error } = await supabase.from('connector_tables').insert({
      ...table,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (error) {
      console.error(`Error inserting table ${table.table_name}:`, error);
    } else {
      console.log(`  Inserted table: ${table.table_name}`);
    }
  }
  console.log('');

  // 4. Insert known issues
  console.log('Inserting known issues...');
  for (const issue of knownIssues) {
    const { error } = await supabase.from('connector_known_issues').insert({
      ...issue,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (error) {
      console.error(`Error inserting issue "${issue.issue_title}":`, error);
    } else {
      console.log(`  Inserted issue: ${issue.issue_title}`);
    }
  }
  console.log('');

  // 5. Verify counts
  console.log('Verifying inserted rows...');
  const { count: connectorCount } = await supabase
    .from('connectors')
    .select('*', { count: 'exact', head: true })
    .eq('id', CONNECTOR_ID);
  const { count: tablesCount } = await supabase
    .from('connector_tables')
    .select('*', { count: 'exact', head: true })
    .eq('connector_id', CONNECTOR_ID);
  const { count: issuesCount } = await supabase
    .from('connector_known_issues')
    .select('*', { count: 'exact', head: true })
    .eq('connector_id', CONNECTOR_ID);

  console.log(`  connectors              (id='${CONNECTOR_ID}'): ${connectorCount}`);
  console.log(`  connector_tables        (connector_id='${CONNECTOR_ID}'): ${tablesCount}`);
  console.log(`  connector_known_issues  (connector_id='${CONNECTOR_ID}'): ${issuesCount}\n`);

  console.log(`✅ Task 3 Complete - Google Ads: ${tablesCount} tables, ${issuesCount} issues`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
