// seed-criteo.js
// Populates Supabase with Fivetran Criteo connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'criteo';

const connector = {
  id: CONNECTOR_ID,
  name: 'Criteo',
  category: 'marketing',
  description: "Fivetran's Criteo connector syncs retargeting and performance display campaign data via the Criteo Marketing API. It provides impression, click, spend, and conversion data for Criteo's programmatic advertising platform.",
  what_it_does: 'Syncs campaigns, categories, product-level performance, and daily campaign statistics. Pulls spend, impressions, clicks, displays, conversions, and sales attribution. Incremental sync by day.',
  useful_for: 'Retargeting performance analysis, product-level ad ROI, cross-channel display spend reporting, e-commerce advertising measurement, and multi-marketplace ad optimization.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN_PERFORMANCE',
    what_it_contains: 'Daily campaign-level metrics — impressions, clicks, displays, spend, conversions, sales, cost_of_sale, overall_competition_win_rate.',
    why_it_matters: 'Primary performance table for measuring Criteo retargeting campaign effectiveness and spend.',
    key_callouts: 'Criteo distinguishes "displays" (ad impressions served) from "impressions" (viewable impressions). cost_of_sale (CoS) is Criteo\'s key efficiency metric — spend / attributed_revenue. View-through conversions heavily weighted in Criteo attribution.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN',
    what_it_contains: 'Campaign records — name, status, bid_type, budget, category_bids, campaign_type.',
    why_it_matters: 'Campaign dimension for grouping performance data and understanding bid strategies.',
    key_callouts: 'bid_type: CPC (cost per click) is standard for Criteo. campaign_type varies by product — retargeting, acquisition, audience targeting. Budget can be daily or monthly.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CATEGORY',
    what_it_contains: 'Product categories defined in the advertiser\'s catalog — category_id, name, parent_category, product_count.',
    why_it_matters: 'Category dimension for analyzing which product categories drive the best retargeting performance.',
    key_callouts: 'Categories come from the advertiser\'s product feed, not from Criteo itself. Hierarchical structure with parent/child relationships. Empty categories may indicate catalog feed issues.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PRODUCT',
    what_it_contains: 'Product records from the advertiser\'s catalog — product_id, name, category, price, availability, image_url.',
    why_it_matters: 'Product dimension for understanding which products are being promoted in dynamic retargeting ads.',
    key_callouts: 'Product data mirrors the catalog feed. Stale or unavailable products showing as active indicate feed sync issues. Price discrepancies between feed and site affect ad relevance.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Product Feed Data Dependent on Catalog Integration',
    issue_preview: 'Product and category tables empty or stale without a healthy catalog feed',
    root_cause: 'Criteo\'s product catalog is populated from the advertiser\'s product feed (XML, CSV, or API). If the feed integration breaks, is delayed, or contains errors, the PRODUCT and CATEGORY tables in the warehouse reflect stale or incomplete data.',
    impact: 'Product-level performance analysis is unreliable. Dynamic ads may show out-of-stock or mispriced items. Categories appear empty, making category-level reporting impossible.',
    resolution: 'Check the catalog feed status in Criteo Management Center → Product Feeds. Common issues: feed URL changed, authentication expired, XML formatting errors. Recommend the customer set up feed health monitoring alerts in Criteo.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Attribution Model Differs Significantly from Other Ad Platforms',
    issue_preview: 'Criteo conversion numbers appear inflated compared to Google/Facebook due to view-through attribution',
    root_cause: 'Criteo\'s default attribution model heavily weights view-through conversions (typically 30-day post-view window) alongside click-through conversions. This counts users who saw a Criteo ad but converted later without clicking, which other platforms often exclude or de-emphasize.',
    impact: 'Side-by-side comparison with Google Ads or Meta shows Criteo "claiming" more conversions. Total attributed conversions across all platforms exceed actual conversions (double-counting). Customers question Criteo ROI accuracy.',
    resolution: 'Educate the customer that Criteo attribution is intentionally view-through heavy as a retargeting platform. Recommend building a normalized attribution view in dbt that applies consistent windows across platforms. Suggest comparing Criteo\'s post-click-only metrics for apples-to-apples comparison.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Multi-Marketplace Reporting Complexity',
    issue_preview: 'Campaigns spanning multiple marketplaces or regions produce duplicated or fragmented data',
    root_cause: 'E-commerce advertisers running Criteo across multiple marketplaces (Amazon, Walmart, Target, retailer media networks) may have separate Criteo accounts or campaigns per marketplace. Each marketplace has its own reporting dimensions and attribution rules.',
    impact: 'Consolidating performance across marketplaces requires mapping different account structures. Currency conversion needed for international marketplaces. Category taxonomies differ per marketplace.',
    resolution: 'Set up one Fivetran connector per Criteo account/marketplace. Build a unification layer in dbt that maps campaigns to a standard marketplace dimension. Handle currency conversion using a rates table. Establish naming conventions for campaigns that encode marketplace.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'API Version Deprecation Cycles Cause Sync Interruptions',
    issue_preview: 'Connector errors after Criteo retires an older API version',
    root_cause: 'Criteo regularly deprecates older Marketing API versions (typically 6-12 month lifecycle). When an API version is retired, connectors using that version begin returning errors until updated to the new version.',
    impact: 'Sync failures and data gaps during the transition period. Historical data format may change between API versions. New metrics or dimensions may appear while deprecated ones are removed.',
    resolution: 'Monitor Fivetran release notes for Criteo connector updates. When Criteo announces API deprecation, verify the Fivetran connector version supports the new API. If sync errors occur, check the Fivetran status page and open a support ticket — the connector may need a backend update.'
  }
];

async function main() {
  console.log('Seeding Criteo connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Criteo');

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

  console.log('\nDone — Criteo: 4 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
