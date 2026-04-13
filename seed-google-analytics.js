// seed-google-analytics.js
// Populates Supabase with the Fivetran Google Analytics 4 connector data.
// Sources:
//   https://fivetran.com/docs/connectors/applications/google-analytics-4
//   https://fivetran.com/docs/connectors/applications/google-analytics-4/setup-guide
//   https://fivetran.com/docs/connectors/applications/google-analytics-4/prebuilt-reports
//   https://fivetran.com/docs/connectors/applications/google-analytics-4/custom-reports
//   https://fivetran.com/docs/connectors/applications/google-analytics-4/troubleshooting
//   https://fivetran.com/docs/connectors/applications/google-analytics-4/troubleshooting/ga4-data-discrepancies
//   https://fivetran.com/docs/connectors/applications/google-analytics-4/troubleshooting/difference-between-google-analytics-4-and-google-analytics-4-export
//
// Idempotent: upserts the connector row, deletes existing google_analytics
// child rows, then inserts fresh data. Re-running does not create duplicates.
//
// Note: Universal Analytics (UA / legacy Google Analytics) was deprecated by
// Google in July 2023. This seed targets the current Google Analytics 4 (GA4)
// connector under id='google_analytics' as requested.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_ID = 'google_analytics';

// ─── CONNECTOR RECORD ────────────────────────────────────────────────────────

const connector = {
  id: CONNECTOR_ID,
  name: 'Google Analytics',
  category: 'analytics',
  description: "Fivetran's Google Analytics 4 (GA4) connector pulls aggregated report data from GA4 via the Google Analytics Data API and lands it in your destination warehouse. Universal Analytics was deprecated by Google in July 2023 — GA4 is the current product.",
  what_it_does: 'Syncs prebuilt GA4 reports (traffic acquisition, user acquisition, engagement, events, demographics, tech) and user-defined custom reports built from valid combinations of dimensions and metrics. Each report becomes one destination table with a date, property, and _fivetran_id field, plus the dimensions and metrics selected. A companion "GA4 Export" connector reads raw event data from BigQuery if you need unsampled event-level data.',
  useful_for: 'Web and mobile analytics, traffic source and channel attribution, conversion tracking, session analysis, engagement reporting, and blending GA4 performance with ad spend or CRM data in the warehouse.'
};

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────
// GA4 has no "raw" schema — all tables are reports. These are verified
// prebuilt reports plus the custom-report pattern.

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TRAFFIC_ACQUISITION_SESSION_SOURCE_MEDIUM_REPORT',
    what_it_contains: 'Session-scoped traffic acquisition broken down by source/medium — sessions, users, engaged sessions, bounce rate, conversions.',
    why_it_matters: 'The default view most marketers expect — "where did this session come from?" Pairs with UTM tagging and is the most-queried GA4 table.',
    key_callouts: 'Prebuilt report. Date dimension is always present. Enabled by default — disable in the Schema tab if you only want user-scoped acquisition.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TRAFFIC_ACQUISITION_SESSION_SOURCE_REPORT',
    what_it_contains: 'Sessions, users, and engagement metrics grouped only by session source (without medium).',
    why_it_matters: 'Simpler rollup for source-only analysis — cleaner for top-line source comparisons.',
    key_callouts: 'Prebuilt report. Use alongside _SOURCE_MEDIUM for different grains of the same question.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TRAFFIC_ACQUISITION_SESSION_CAMPAIGN_REPORT',
    what_it_contains: 'Session-scoped metrics grouped by campaign name (from UTM campaign parameter).',
    why_it_matters: 'Campaign-level performance reporting for paid and organic marketing campaigns.',
    key_callouts: 'Prebuilt report. Only includes sessions with a populated campaign tag — untagged traffic will not appear here.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TRAFFIC_ACQUISITION_SESSION_DEFAULT_CHANNEL_GROUPING_REPORT',
    what_it_contains: 'Session metrics grouped by the GA4 default channel groupings (Organic Search, Paid Social, Direct, Referral, etc.).',
    why_it_matters: 'The simplest top-line acquisition view that most execs understand. Drives the classic "channel mix" pie chart.',
    key_callouts: 'Prebuilt report. Uses the GA4 default channel definitions — changes in GA4\'s channel logic will flow through automatically.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TRAFFIC_ACQUISITION_SESSION_SOURCE_PLATFORM_REPORT',
    what_it_contains: 'Session metrics grouped by session source platform (Google Ads, Manual, etc.).',
    why_it_matters: 'Distinguishes auto-tagged paid platform traffic from manually-tagged campaigns.',
    key_callouts: 'Prebuilt report. Useful when debugging auto-tagging behavior.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'USER_ACQUISITION_FIRST_USER_SOURCE_REPORT',
    what_it_contains: "User-scoped acquisition — the FIRST source each user was acquired from, regardless of later sessions.",
    why_it_matters: 'Tracks acquisition channel attribution for the lifetime of a user, not just a single session. Better for LTV analysis by channel.',
    key_callouts: 'Prebuilt report. User-scoped dimensions cannot be combined with session-scoped metrics in a single custom report — GA4 enforces this at the API level.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'USER_ACQUISITION_FIRST_USER_MEDIUM_REPORT',
    what_it_contains: 'User-scoped acquisition grouped by the first medium each user was acquired from.',
    why_it_matters: 'Medium-level lifetime attribution for cohort and LTV analysis.',
    key_callouts: 'Prebuilt report. Same scope-compatibility caveats as other user-scoped reports.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: '<user_defined>_CUSTOM_REPORT',
    what_it_contains: 'User-defined report with up to 9 dimensions and 10 metrics selected from the GA4 Dimensions and Metrics catalog. Every custom report also carries date, property, and _fivetran_id columns.',
    why_it_matters: 'Lets you build the exact slice you need when no prebuilt report fits — e.g. event-level reports, custom-dimension reports, or reports combining engagement + ecommerce metrics.',
    key_callouts: 'date dimension is REQUIRED for any report with a non-empty metrics list. Not all dimension/metric combinations are compatible — validate with the GA4 Query Explorer before setting the report up in Fivetran.'
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Aggregated Data Only — No Raw Events',
    issue_preview: 'GA4 connector cannot sync raw event-level data',
    root_cause: 'The Google Analytics 4 Data API only exposes aggregated report data. Fivetran\'s standard GA4 connector uses this API, so raw events are not accessible — every table is a pre-aggregated report.',
    impact: 'Customers who want event-level granularity (e.g. sessionization, custom funnels, event sequencing) cannot build it from the standard GA4 connector.',
    resolution: "Use the separate 'Google Analytics 4 Export' connector, which reads unsampled raw event data from the BigQuery Export that GA4 natively supports. Requires the customer to have BigQuery Export configured in their GA4 property."
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Data Sampling Above 10 Million Events',
    issue_preview: 'Large queries return sampled data, not full population',
    root_cause: "Google applies sampling to GA4 Data API queries on standard properties when the query would process more than 10 million events. GA4 360 properties have higher limits but sampling can still occur. Sampled data is statistically estimated, not exact.",
    impact: 'Numbers in the destination may not match the GA4 UI exactly for large date ranges or high-traffic properties. Customers see "why are these numbers different?" discrepancies.',
    resolution: 'Verify discrepancies using the GA4 Query Explorer with the same dates, dimensions, metrics, and filters — it uses the same API and will show whether sampling is the cause. Shorten date ranges in custom reports, reduce high-cardinality dimensions, or upgrade to GA4 360 for higher sampling thresholds.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Filter Case-Sensitivity Differs Between GA4 UI and Fivetran',
    issue_preview: "Fivetran applies filters case-insensitively; GA4 UI does so case-sensitively",
    root_cause: 'When filter expressions include string matches, the GA4 UI applies them case-sensitively by default, while Fivetran applies them case-insensitively. The underlying API query differs.',
    impact: 'Destination row counts can be higher than what the GA4 UI shows for the same filter, because Fivetran matches more variants (e.g. `google` matches `Google`, `GOOGLE`, `google`).',
    resolution: 'When reconciling against the GA4 UI, use a case-insensitive regex pattern in the UI filter to match Fivetran\'s behavior. Document this for analysts comparing UI vs warehouse numbers.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'GA4 Processing Latency — Data Can Take 24+ Hours',
    issue_preview: 'Recently synced data appears incomplete for up to a day',
    root_cause: 'Google Analytics 4 processes event data asynchronously. Depending on property size, a report may take over 24 hours to finalize at the API level. Fivetran\'s sync only sees what Google has processed at the moment of the query. The connector rescans the last 2 days on every sync to catch late-arriving data.',
    impact: "The most recent 1–2 days in the destination are always subject to change. Dashboards that report 'yesterday' may show numbers that shift over the next 24–48 hours.",
    resolution: 'Treat the trailing 2 days as provisional in downstream reports. The default 30-day rollback sync captures most late-arriving adjustments; extend it if you need a longer reconciliation window. Build dashboards that default to "2+ days ago" for stable numbers.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Incompatible Dimension + Metric Combinations Return No Rows',
    issue_preview: 'Custom reports come back empty when fields are incompatible',
    root_cause: 'GA4 enforces compatibility rules between dimensions and metrics at the API level. Not every dimension can be combined with every metric — session-scoped metrics cannot be combined with user-scoped dimensions, some ecommerce metrics are not compatible with page-scoped dimensions, etc. Fivetran passes the query through and returns whatever the API returns.',
    impact: 'Custom reports show zero rows or missing data, with no clear error from the connector UI.',
    resolution: 'Validate every custom report in the GA4 Dimensions & Metrics Explorer (or the GA4 Query Explorer) BEFORE creating it in Fivetran. Each report can have up to 9 dimensions and 10 metrics — split larger reports into multiple smaller ones.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: "date Dimension Required for Reports with Metrics",
    issue_preview: "Reports without a date dimension fail or return unexpected shapes",
    root_cause: 'Fivetran syncs GA4 reports incrementally by date. The date dimension is required for any report that has a non-empty metrics list — without it, the connector cannot incrementally slice the report and the configuration is invalid.',
    impact: 'The connector setup may reject the report, or the resulting table may have no incremental key, causing full refreshes on every sync.',
    resolution: 'Always include the date dimension when building a custom report with metrics. It does not count against the 9-dimension limit in any practical way — just add it.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Google Analytics (GA4) connector data...\n');

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
  console.log('Clearing existing google_analytics rows in child tables...');
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

  console.log(`✅ Task 6 Complete - Google Analytics: ${tablesCount} tables, ${issuesCount} issues`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
