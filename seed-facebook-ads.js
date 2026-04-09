// seed-facebook-ads.js
// Populates Supabase with the Fivetran Facebook Ads connector data.
// Sources:
//   https://fivetran.com/docs/connectors/applications/facebook-ads
//   https://fivetran.com/docs/connectors/applications/facebook-ads/troubleshooting
//   https://fivetran.com/docs/connectors/applications/facebook-ads/troubleshooting/rate-limit
//   https://fivetran.com/docs/connectors/applications/facebook-ads/troubleshooting/data-discrepancies
//   https://fivetran.com/docs/connectors/applications/facebook-ads/troubleshooting/metadata-sync-disabled-warning
//
// Idempotent: upserts the connector row, deletes existing facebook_ads
// child rows, then inserts fresh data. Re-running does not create duplicates.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_ID = 'facebook_ads';

// ─── CONNECTOR RECORD ────────────────────────────────────────────────────────

const connector = {
  id: CONNECTOR_ID,
  name: 'Facebook Ads',
  category: 'advertising',
  description: "Fivetran's Facebook Ads connector is a fully managed integration that pulls deep-level advertising data from Meta's Marketing API and replicates it to your destination warehouse. It supports account structure, creative metadata, performance reports, and object change history.",
  what_it_does: 'Syncs prebuilt performance reports (BASIC_AD, BASIC_AD_ACTIONS, BASIC_AD_ACTION_VALUES, MARKETING_MIX_MODELING), object metadata for accounts/campaigns/ad sets/ads/creatives, and *_HISTORY tables that capture object changes over time. All bid and budget values are stored in the currency minimum denomination (e.g. US dollar amounts are stored as cents).',
  useful_for: 'Paid-social analytics, cross-channel ROAS blending, creative performance A/B testing, attribution modeling, and marketing mix modeling when paired with warehouse-level spend aggregation.'
};

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'BASIC_AD',
    what_it_contains: 'Ad-level performance metrics — impressions, reach, spend, clicks, CPM, CPC, frequency, broken down by date.',
    why_it_matters: 'Primary prebuilt report and the default entry point for nearly all Facebook Ads analytics.',
    key_callouts: 'Enabled by default. Spend values are in the minimum currency denomination (cents for USD). Child tables BASIC_AD_ACTIONS and BASIC_AD_ACTION_VALUES must also be enabled for complete conversion reporting.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'BASIC_AD_ACTIONS',
    what_it_contains: 'Action counts from the BASIC_AD report — link clicks, page engagements, video views, conversion events, grouped by action_type.',
    why_it_matters: 'Event/action volume per ad. Required to analyze anything beyond impressions and clicks.',
    key_callouts: 'Child of BASIC_AD. Join on ad_id + date. Must be enabled alongside BASIC_AD.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'BASIC_AD_ACTION_VALUES',
    what_it_contains: 'Monetary value of actions (e.g. purchase value, add-to-cart value) from the BASIC_AD report.',
    why_it_matters: 'Required to calculate ROAS and revenue attribution per ad.',
    key_callouts: 'Child of BASIC_AD. Values are in the minimum currency denomination.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'MARKETING_MIX_MODELING',
    what_it_contains: 'Ad-set-level spend and impressions, curated for marketing mix modeling workflows.',
    why_it_matters: 'Lightweight, MMM-ready prebuilt report that sidesteps the complexity of full report tables.',
    key_callouts: 'Newer prebuilt report. Operates at the ad set level with just spend + impressions — not a replacement for BASIC_AD for general performance reporting.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN_HISTORY',
    what_it_contains: 'Campaign object state over time — name, objective, status, budgets, updated_time.',
    why_it_matters: 'Tracks how campaigns change over the life of a connection. Joins to report tables via campaign_id.',
    key_callouts: 'Incrementally updates based on the updated_time field. IMPORTANT: when spend_cap, daily_budget, or lifetime_budget change, updated_time is NOT refreshed — so budget changes may not sync until another field triggers an update.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD_SET_HISTORY',
    what_it_contains: 'Ad set object state over time — name, targeting, bid strategy, optimization goal, budgets.',
    why_it_matters: 'Ad-set-level metadata and change tracking for performance analysis.',
    key_callouts: 'Only contains records from the connection creation date forward — Facebook does not retain change history, so there is no backfill.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'AD_HISTORY',
    what_it_contains: 'Ad object state over time — name, status, creative reference, tracking specs.',
    why_it_matters: 'Ad-level metadata for creative performance and status tracking.',
    key_callouts: 'Snapshots are captured between syncs — this is a delta-based record, not a per-event audit log. Requires the "Sync all metadata" toggle to be ON in the setup form.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ACCOUNT_HISTORY',
    what_it_contains: 'Account-level metadata over time — currency, timezone, account status, spend cap.',
    why_it_matters: 'Useful when reporting across multiple ad accounts with different currencies or timezones.',
    key_callouts: 'Only populated from connection creation onward.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CREATIVE_HISTORY',
    what_it_contains: 'Creative object metadata — image/video refs, body copy, link URLs, call-to-action type.',
    why_it_matters: 'Required for creative-level performance analysis and asset reporting.',
    key_callouts: 'A dedicated dbt package exists for creative history modeling.'
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Bid and Budget Values Are Stored in Cents',
    issue_preview: 'Spend values appear 100× larger than expected',
    root_cause: 'Facebook returns all bid and budget values in the currency minimum denomination — cents for USD, pence for GBP, etc. Fivetran stores them exactly as the API returns them.',
    impact: "Spend, CPM, CPC, and budget columns look 100× the true value. Untrained users report that the customer's ad spend is 'way higher than their books.'",
    resolution: 'Divide money columns by 100 in downstream transformations (dbt, warehouse view, or BI tool). Document the conversion in the data dictionary.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Rate Limit Errors from Shared Tokens and Peak-Hour Syncs',
    issue_preview: 'Connector hits Facebook API rate limits during sync',
    root_cause: 'Multiple Fivetran connections or external tools sharing the same Facebook access token exhaust the shared quota quickly. Additionally, Fivetran sends most Facebook Ads API requests between 3–7 AM UTC, compounding contention during that window. Metadata tables also contribute heavily to rate-limit usage.',
    impact: 'Sync failures, partial syncs, or elongated sync cycles as Fivetran backs off and retries.',
    resolution: 'Enable "Grant User Access" in the setup form so rate limits are calculated against the Fivetran app (higher ceiling) instead of the ad account. Confirm the Meta app is in Live mode. Schedule syncs to start outside the 3–7 AM UTC window. Disable metadata tables you do not need. Avoid sharing access tokens across connections.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'CAMPAIGN_HISTORY Misses Budget-Only Updates',
    issue_preview: 'Changes to spend_cap, daily_budget, or lifetime_budget may not sync',
    root_cause: 'CAMPAIGN_HISTORY is synced incrementally based on the campaign object\'s updated_time field. When ONLY the spend_cap, daily_budget, or lifetime_budget fields change, Facebook does not bump updated_time — so Fivetran does not detect the change until some other field triggers an update.',
    impact: 'Budget changes appear to "stick" on old values in the destination until an unrelated campaign edit refreshes the row.',
    resolution: 'Trigger a historical re-sync of CAMPAIGN_HISTORY if budget accuracy matters at a point in time. For ongoing reporting, accept the caveat and cross-check against BASIC_AD spend (which is accurate from the report side).'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'iOS 14 Breakdown Incompatibility',
    issue_preview: 'Offsite conversion events disappear when demographic breakdowns are applied',
    root_cause: "When Apple's iOS 14 privacy changes rolled out, Facebook made offsite conversion events unavailable with certain delivery and action breakdowns — including demographic breakdowns like age, gender, and region.",
    impact: 'Custom reports that combine offsite conversions with demographic breakdowns return no rows, or row counts well below UI-reported volumes.',
    resolution: 'Remove the incompatible breakdowns from the report configuration, or split the report into two: one for demographics without conversions, one for conversions without demographics. Document the limitation for stakeholders.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'inline_link_clicks vs link_clicks Attribution Window Mismatch',
    issue_preview: 'Two similar metrics report different totals',
    root_cause: 'Both metrics measure link clicks, but the attribution windows differ: inline_link_clicks uses a fixed 1-day attribution window, while link_clicks uses the attribution window configured on the report (defaults to 28 days).',
    impact: 'Reports that show both columns produce "why are these numbers different?" questions. Numbers look wrong when users expect them to match.',
    resolution: 'Pick one metric and stick with it throughout a dashboard. If both are needed, clearly label the attribution window on each. Note: link_clicks is the more flexible choice when you need to match the broader report attribution window.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'HISTORY Tables Only Contain Data from Connection Creation Forward',
    issue_preview: 'No backfill of campaign/ad set/ad history prior to setup',
    root_cause: 'Facebook does not retain change history for campaigns, ad sets, ads, or creatives at the API level. Fivetran can only capture state changes that occur after the connection is created.',
    impact: 'Customers who set up the connector today cannot retroactively see how a campaign was configured 6 months ago.',
    resolution: 'Set expectations during setup. Enable the "Sync all metadata" toggle from day one so *_HISTORY tables start populating immediately. For true historical state, the customer needs to export from Meta Ads Manager directly.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Facebook Ads connector data...\n');

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
  console.log('Clearing existing facebook_ads rows in child tables...');
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

  console.log(`✅ Task 4 Complete - Facebook Ads: ${tablesCount} tables, ${issuesCount} issues`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
