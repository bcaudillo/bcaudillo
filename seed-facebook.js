// seed-facebook.js
// Populates Supabase with the Fivetran Facebook Pages connector data.
// (Distinct from the Facebook Ads connector — this is for organic Page
// content and insights, not paid advertising.)
// Sources:
//   https://fivetran.com/docs/connectors/applications/facebook-pages
//   https://fivetran.com/docs/connectors/applications/facebook-pages/setup-guide
//   https://fivetran.com/docs/connectors/applications/facebook-pages/troubleshooting
//   https://fivetran.com/docs/connectors/applications/facebook-pages/changelog
//   https://fivetran.com/docs/connectors/applications/facebook-pages/api-configuration
//
// Idempotent: upserts the connector row, deletes existing facebook
// child rows, then inserts fresh data. Re-running does not create duplicates.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_ID = 'facebook';

// ─── CONNECTOR RECORD ────────────────────────────────────────────────────────

const connector = {
  id: CONNECTOR_ID,
  name: 'Facebook',
  category: 'advertising',
  description: "Fivetran's Facebook Pages connector syncs organic Facebook Page data — posts, page metadata, and insights metrics — via the Meta Graph API (currently v22.0). This is distinct from the Facebook Ads connector, which pulls paid advertising data. Use Pages for organic social analytics and Ads for paid media performance.",
  what_it_does: 'Syncs pages the authenticating user manages, all posts published to those pages, and a comprehensive set of Page Insights metrics — daily page-level metrics, lifetime post-level metrics, and breakdowns by type/follower/paid-organic. Captures engagement (reactions, comments, shares), reach, impressions, and video metrics. Uses the SaaS Deployment model.',
  useful_for: 'Organic social media analytics, content performance reporting, engagement trend analysis, cross-platform social reporting (when blended with Instagram, LinkedIn, X), and measuring the non-paid contribution to audience growth and brand awareness.'
};

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PAGE',
    what_it_contains: 'Current Facebook Page metadata — name, category, about, website, fan count, followers, verified status.',
    why_it_matters: 'Core dimension for every other table. Joins on page_id.',
    key_callouts: "Current-state snapshot. Historical Page attribute changes live in PAGE_HISTORY if enabled."
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PAGE_HISTORY',
    what_it_contains: 'Historical snapshots of Page metadata changes over time — name, about, category changes.',
    why_it_matters: 'Tracks brand evolution. Useful for audit and for explaining changes in metric baselines.',
    key_callouts: 'Not retroactive — only captures changes from connection creation forward.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'POST_HISTORY',
    what_it_contains: 'All posts published on the connected pages — message, type, permalink, full_picture, created_time, updated_time.',
    why_it_matters: 'Post-level foundation for content performance analysis. Joins to lifetime post metrics tables.',
    key_callouts: 'Includes the full_picture column for image posts. Video posts pair with lifetime metrics that include video-specific fields.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'DAILY_PAGE_METRICS_TOTAL',
    what_it_contains: 'Daily page-level metrics — page views, page impressions, page engaged users, fans, reach, video views.',
    why_it_matters: 'Primary table for daily page trending and top-of-funnel audience metrics.',
    key_callouts: 'Includes the page_media_view column. Insights data is limited to the last two years.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'DAILY_PAGE_METRICS_BY_PAID_ORGANIC',
    what_it_contains: 'Daily page metrics broken down by paid vs organic source — impressions, reach, engagement attributed to each.',
    why_it_matters: 'Separates organic performance from paid-boosted performance for true organic reporting.',
    key_callouts: 'Added November 15, 2025 as an alternative for deprecated impression metrics from the Graph API.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'DAILY_PAGE_METRICS_BY_TYPE',
    what_it_contains: 'Daily page-level metrics broken down by content type (photo, video, link, status).',
    why_it_matters: 'Identifies which content formats drive engagement on each page.',
    key_callouts: 'Join to DAILY_PAGE_METRICS_TOTAL on page_id + date for context.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'LIFETIME_POST_METRICS_TOTAL',
    what_it_contains: 'Cumulative post-level metrics — total impressions, total reach, total engaged users, total video views.',
    why_it_matters: 'Lifetime performance per post — the canonical table for post-level ROI and content winners/losers.',
    key_callouts: 'Includes post_media_view, post_video_length, and post_video_views_15s columns. Data fetched up to current date but NOT for current date — yesterday is the freshest.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'LIFETIME_POST_METRICS_BY_TYPE',
    what_it_contains: 'Lifetime post metrics broken down by reaction type (like, love, haha, wow, sorry, anger) and engagement type.',
    why_it_matters: 'Sentiment and reaction analysis per post — understanding HOW audiences engaged.',
    key_callouts: 'Includes post_reactions_by_type_total. Joins to LIFETIME_POST_METRICS_TOTAL via post_id.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'LIFETIME_POST_METRICS_BY_FOLLOWERS',
    what_it_contains: 'Lifetime post metrics broken down by follower vs non-follower reach.',
    why_it_matters: 'Measures how well posts reach beyond the existing fan base — a key indicator of organic virality.',
    key_callouts: 'Added November 15, 2025. Alternative for deprecated impression metrics.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'LIFETIME_POST_METRICS_BY_PAID_ORGANIC',
    what_it_contains: 'Lifetime post metrics split by paid vs organic source.',
    why_it_matters: 'Distinguishes boosted-post performance from purely organic performance for the same post.',
    key_callouts: 'Added November 15, 2025. Alternative for deprecated impression metrics.'
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Page Insights Data Limited to Last 2 Years',
    issue_preview: 'Historical metrics beyond 24 months cannot be backfilled',
    root_cause: 'The Meta Graph API only returns Page Insights data for the most recent 24 months. Fivetran cannot pull anything older — this is a hard API limitation, not a connector choice.',
    impact: 'Customers expect to backfill several years of historical metrics and are disappointed when only 2 years arrive. Year-over-year comparisons are limited to a 24-month rolling window.',
    resolution: 'Set expectations during setup. For longer historical reporting, export historical data from Meta Business Suite before 24 months elapses, or consider starting the Fivetran sync early so the 2-year window covers future analysis needs. Historical Lifetime metrics are especially affected.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Permission Denied — pages_manage_metadata and Related Scopes Missing',
    issue_preview: 'Connector fails to sync posts or page metadata',
    root_cause: 'The Meta Graph API requires specific permissions (pages_manage_metadata, pages_read_engagement, pages_show_list, read_insights) to read Page content and insights. If the authorizing user did not grant all required permissions during OAuth, or those permissions were later revoked, the connector cannot access the data.',
    impact: 'Sync fails with "Requires pages_manage_metadata permission to manage the object" or similar. Some tables may partially sync while others fail.',
    resolution: 'Re-authorize the connector and grant ALL requested permissions in the Meta OAuth prompt. Verify the authorizing user has admin or editor role on the Facebook Pages being synced. Check Meta Business Manager to confirm no permissions were revoked.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Monetization Metrics Only Visible to Page Admins',
    issue_preview: 'Revenue and monetization columns come back empty or missing',
    root_cause: 'Facebook restricts access to monetization metrics (ad revenue, in-stream ad earnings, Stars revenue) to users with Page Admin role. Users with lower-privilege roles (Editor, Moderator) cannot read these fields even with the standard insights permissions.',
    impact: 'Monetization columns appear NULL or the fields do not sync, even though they are visible in Meta Business Suite to the page admin.',
    resolution: 'Re-authorize with a user who has Page Admin role (not just Editor). Verify the role in Meta Business Manager > Page Settings > Page Roles. Monetization reporting from the connector is a Page-Admin-only capability.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Historical Lifetime Metrics Missing After Graph API Deprecations',
    issue_preview: 'Some lifetime metrics stopped populating in late 2025',
    root_cause: 'Meta deprecated several Page Insights impression metrics in the Graph API on November 15, 2025. Tables using the deprecated metrics lost those columns; Fivetran added replacement tables (DAILY_PAGE_METRICS_BY_PAID_ORGANIC, LIFETIME_POST_METRICS_BY_FOLLOWERS, LIFETIME_POST_METRICS_BY_PAID_ORGANIC) that provide equivalent or alternative measurements.',
    impact: "Dashboards that depend on the deprecated columns show NULL for post-deprecation dates. Historical values for dates before the cutover are retained.",
    resolution: 'Update downstream models to use the new tables. Decide whether to continue reporting on the pre-deprecation columns (historical only) or switch fully to the replacements. Document the cutover date so analysts can explain the transition in reporting.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Lifetime Tables Do Not Include Current Date',
    issue_preview: "Today's data is missing from _lifetime tables until tomorrow",
    root_cause: 'For tables with the _lifetime keyword, Fivetran fetches data up to the current date but NOT for the current date itself. This is because Meta finalizes lifetime metrics at the end of the day.',
    impact: 'Same-day reporting shows a gap — posts from today will not have lifetime metrics until at least the next sync after midnight.',
    resolution: 'Set dashboard defaults to "yesterday" or earlier for lifetime-metric-based reports. Communicate the 1-day lag to stakeholders as an inherent property of lifetime metrics.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'User Access Token Expiry Breaks Sync',
    issue_preview: 'Connector stops syncing when the authorizing user\'s token expires',
    root_cause: 'Meta access tokens have expiry windows (typically 60 days for long-lived tokens). If the authorizing user\'s password changes, they log out of all sessions, or the token reaches its natural expiry, the connector cannot refresh and stops syncing.',
    impact: 'Sync fails with an authentication error. No new data lands until re-authorized.',
    resolution: 'Re-authorize the connector with an active Meta session. Consider using a dedicated "system user" for Fivetran authorization (for Business accounts) — system user tokens do not expire. Document which user authorized the connector so you know who to go to for re-auth.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Facebook (Pages) connector data...\n');

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
  console.log('Clearing existing facebook rows in child tables...');
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

  console.log(`✅ Task 10 Complete - Facebook: ${tablesCount} tables, ${issuesCount} issues`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
