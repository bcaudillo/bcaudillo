// seed-hubspot.js
// Populates Supabase with Fivetran HubSpot connector data.
// Idempotent: upserts connector, deletes existing child rows, then inserts fresh.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'hubspot';

const connector = {
  id: CONNECTOR_ID,
  name: 'HubSpot',
  category: 'crm',
  description: "Fivetran's HubSpot connector replicates CRM, marketing, sales, and service data from the HubSpot API into your destination warehouse. It syncs contacts, companies, deals, tickets, engagements, email events, forms, workflows, and association tables. Supports both OAuth and Private App authentication with Super Admin access required for full data coverage.",
  what_it_does: 'Syncs all core HubSpot CRM objects (contacts, companies, deals, tickets) plus engagement data (emails, calls, meetings, notes, tasks), marketing objects (campaigns, forms, email events), and association tables linking objects together. Uses webhooks to capture deletes for supported tables. Automatically detects schema changes. CONTACT_PROPERTY_HISTORY tracks every field change and is the #1 MAR driver.',
  useful_for: 'Sales pipeline analytics, marketing attribution, customer lifecycle tracking, support ticket analysis, engagement scoring, lead source reporting, deal velocity metrics, and cross-functional CRM reporting.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CONTACT',
    what_it_contains: 'All contacts/leads — email, name, lifecycle stage, lead status, create date, custom properties, association IDs.',
    why_it_matters: 'Core table for customer base and lead pipeline. Every marketing and sales query starts here.',
    key_callouts: 'CONTACT_PROPERTY_HISTORY tracks every field change — #1 MAR driver. Custom properties appear as property_* columns. Soft deletes via _fivetran_deleted.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'COMPANY',
    what_it_contains: 'Company/account records — name, domain, industry, size, revenue, owner, lifecycle stage, custom properties.',
    why_it_matters: 'Account-level analytics, org mapping, and ABM targeting.',
    key_callouts: 'Linked to contacts via COMPANY_CONTACT association table. Custom properties as property_* columns.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'DEAL',
    what_it_contains: 'Sales opportunities — pipeline, stage, amount, close date, owner, create date, custom deal properties.',
    why_it_matters: 'Pipeline reporting, revenue forecasting, and deal velocity analysis.',
    key_callouts: 'Stage history in DEAL_STAGE table. Merged deals tracked in MERGED_DEAL but may not be flagged as _fivetran_deleted. Custom properties can return null if no deals have values set.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TICKET',
    what_it_contains: 'Support tickets — status, priority, category, pipeline, create/close dates, owner.',
    why_it_matters: 'Customer success and support analytics, SLA tracking, case volume trending.',
    key_callouts: 'Requires Service Hub subscription. Table will not appear if Service Hub is inactive or no tickets exist in HubSpot.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ENGAGEMENT',
    what_it_contains: 'Parent table for all engagement types — email, call, meeting, note, task. Contains shared metadata.',
    why_it_matters: 'Tracks all sales and service touchpoints across contacts and deals.',
    key_callouts: 'Child tables: ENGAGEMENT_EMAIL, ENGAGEMENT_CALL, ENGAGEMENT_MEETING, ENGAGEMENT_NOTE, ENGAGEMENT_TASK. Properties sync with property_hs_* naming convention.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CONTACT_PROPERTY_HISTORY',
    what_it_contains: 'Every property change for every contact — property name, old value, new value, timestamp, source.',
    why_it_matters: 'Audit trail for contact data changes. Powers lifecycle stage analysis and attribution modeling.',
    key_callouts: 'BIGGEST MAR DRIVER. A single field update across 100k contacts = 100k MAR. Consider disabling if not needed.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'DEAL_STAGE',
    what_it_contains: 'Deal stage transitions — stage name, timestamp, pipeline, source of change.',
    why_it_matters: 'Deal velocity analysis, stage conversion rates, and pipeline aging metrics.',
    key_callouts: 'One row per stage transition. Essential for understanding how deals move through the pipeline over time.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'EMAIL_EVENT',
    what_it_contains: 'Email engagement events — opens, clicks, bounces, unsubscribes, delivered, per recipient.',
    why_it_matters: 'Email campaign performance, deliverability tracking, and engagement scoring.',
    key_callouts: 'High-volume table. Requires Marketing Hub. Links to MARKETING_EMAIL for campaign context.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Cannot Select – Not Available in Your HubSpot Subscription',
    issue_preview: 'Tables/objects greyed out in connector schema',
    root_cause: "The authenticating user doesn't have Super Admin access to the HubSpot account. Fivetran receives a permissions error querying the table endpoint and logs: 'Do not have enough permissions to sync deal table.' Tables are automatically unchecked in the schema.",
    impact: 'Affected tables like Deal properties or Marketing objects cannot sync. Connector appears to work but delivers incomplete data. Sales teams may not notice the gap until pipeline reports are wrong.',
    resolution: 'Ensure the authenticating user has Super Admin access in HubSpot. Re-authorize: Fivetran → HubSpot connection → Connection Details → Re-authorize as a Super Admin user. See HubSpot User permissions guide.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Hub Is Unknown to This Hublet (EU Migration)',
    issue_preview: 'Authorization fails after migrating HubSpot to EU data center',
    root_cause: 'When migrating between data centers (US → EU), the authorization URL and Hub ID change. The existing OAuth credentials point to the old data center endpoint, which no longer recognizes the Hub ID.',
    impact: 'Sync fails completely with "Hub is unknown to this Hublet" error. All data stops flowing. Cannot re-authorize with existing credentials.',
    resolution: 'After migration completes: 1) Create a new OAuth app in the EU portal. 2) Delete the existing Fivetran connector. 3) Create a new connector with EU credentials. Historical data will need a full re-sync.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Missing Columns, Tables, or Values in Destination',
    issue_preview: 'Expected data not appearing in warehouse tables',
    root_cause: "HubSpot connector doesn't create empty tables or columns if no data exists in the source. Custom properties with no values in any record won't generate columns. Engagement columns sync to child tables with property_hs_* naming convention.",
    impact: 'Data gaps in warehouse — analysts may think data is broken when it simply hasn\'t been populated yet. Discontinued columns return null values. Missing association tables when FROM object has no data.',
    resolution: 'Check the Schema tab to confirm tables/columns are enabled. Review HubSpot subscription level for feature access. For engagement columns, check child tables (ENGAGEMENT_EMAIL, etc.) with property_hs_* prefix. Re-sync association tables by re-syncing the FROM table.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'High MAR from CONTACT_PROPERTY_HISTORY',
    issue_preview: 'Unexpectedly high MAR consumption spiking costs',
    root_cause: 'CONTACT_PROPERTY_HISTORY records every property change for every contact. A single field update across 100k contacts generates 100k new rows, each counting as 1 MAR. Bulk imports, workflow automations, and lifecycle stage changes are common triggers.',
    impact: 'Monthly costs can spike dramatically and unpredictably. This is the #1 MAR driver for HubSpot connectors. Customers are often shocked by the bill.',
    resolution: 'Review if CONTACT_PROPERTY_HISTORY is truly needed. If only tracking a few properties, consider excluding this table and building change tracking in your warehouse instead. Warn customers proactively about this table during setup.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Merged Deals Not Marked as _fivetran_deleted = TRUE',
    issue_preview: 'Merged deals remain as active records in destination tables',
    root_cause: "HubSpot's merge behavior doesn't always trigger a delete event for the 'losing' deal. The merged-away deal may persist in the destination without being flagged as deleted, since Fivetran relies on webhooks to capture deletes.",
    impact: 'Duplicate deal records in warehouse inflate pipeline numbers, deal counts, and revenue totals. Reports show deals that no longer exist as separate entities in HubSpot.',
    resolution: "Use HubSpot's merge audit log or the MERGED_DEAL table to identify merged records. Filter them out in queries. Build a dbt model that cross-references DEAL with MERGED_DEAL to exclude losing deals."
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Source Fields With Similar Names Appear Merged',
    issue_preview: 'Two distinct HubSpot fields mapping to the same destination column',
    root_cause: "Fivetran normalizes column names by converting to lowercase and replacing special characters with underscores. Fields like 'Company Name' and 'company_name' resolve to the same normalized column name, causing a collision.",
    impact: 'Data from two source fields can overwrite each other in the destination. One field\'s values silently replace the other\'s.',
    resolution: 'Rename one of the conflicting fields in HubSpot to create a distinct normalized name. Check the internal API name (not display label) to confirm uniqueness before creating new properties.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Phantom Records in COMPANY, CONTACT, and DEAL Tables',
    issue_preview: "Records in destination that can't be found in HubSpot",
    root_cause: 'Records may have been merged or deleted in HubSpot after syncing. Soft-deleted records persist with _fivetran_deleted flag. Webhook timeouts can delay delete propagation by up to 30 minutes. Some deletes may be missed entirely if webhooks fail.',
    impact: 'Inflated record counts if not filtering on _fivetran_deleted. Reports show contacts, companies, or deals that no longer exist in HubSpot.',
    resolution: 'Always filter WHERE _fivetran_deleted = FALSE in queries. Check merge audit logs for consolidated records. If phantom records persist after 24 hours, trigger a table re-sync.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'TICKETS Table Not Syncing',
    issue_preview: 'Ticket data not appearing in destination despite being enabled',
    root_cause: 'The TICKET table requires an active Service Hub subscription in HubSpot. If Service Hub is not active, or if no tickets exist in the HubSpot account, the table will not be created by Fivetran.',
    impact: 'Support analytics completely unavailable. Customer success teams cannot track ticket volumes, resolution times, or SLA compliance.',
    resolution: 'Confirm Service Hub is active in HubSpot Settings → Account & Billing. Verify at least one ticket exists. Re-check the connector schema tab to ensure TICKET is enabled.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: "Couldn't Complete the Connection Error During Setup",
    issue_preview: 'Initial connector setup fails with connection error',
    root_cause: 'OAuth token is invalid, expired, or the authenticating user lacks required scopes. For Private Apps, the access token may have been regenerated or the app may not have all required scopes selected.',
    impact: 'Connector cannot be set up — no data syncs at all. Blocks the entire implementation.',
    resolution: 'Re-authenticate with a Super Admin user. Ensure all required OAuth scopes are granted (crm.objects.contacts.read, crm.objects.companies.read, crm.objects.deals.read, etc.). For Private Apps, regenerate the access token with all required scopes.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Long-Running Syncs Reducing Data Freshness',
    issue_preview: 'Syncs taking much longer than expected',
    root_cause: 'Large data volumes from CONTACT_PROPERTY_HISTORY, ENGAGEMENT tables, or initial historical syncs cause extended sync durations. Schema changes can also trigger unexpected re-syncs of large tables.',
    impact: 'Data freshness is reduced — warehouse data may be hours or even a full day behind HubSpot. High MAR consumption during long sync windows.',
    resolution: 'Review which tables are enabled — disable CONTACT_PROPERTY_HISTORY if not needed. Consider filtering historical data using the historical sync time frame setting. Check if recent schema changes triggered a re-sync.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding HubSpot connector data...\n');

  console.log('Upserting connector record...');
  const { error: connectorError } = await supabase
    .from('connectors')
    .upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (connectorError) { console.error('Error upserting connector:', connectorError); process.exit(1); }
  console.log(`Upserted connector: ${connector.name}\n`);

  console.log('Clearing existing hubspot rows in child tables...');
  await supabase.from('connector_tables').delete().eq('connector_id', CONNECTOR_ID);
  await supabase.from('connector_known_issues').delete().eq('connector_id', CONNECTOR_ID);
  console.log('Cleared.\n');

  console.log('Inserting connector tables...');
  for (const table of connectorTables) {
    const { error } = await supabase.from('connector_tables').insert({ ...table, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (error) console.error(`Error inserting table ${table.table_name}:`, error);
    else console.log(`  Inserted table: ${table.table_name}`);
  }
  console.log('');

  console.log('Inserting known issues...');
  for (const issue of knownIssues) {
    const { error } = await supabase.from('connector_known_issues').insert({ ...issue, created_at: new Date().toISOString(), updated_at: new Date().toISOString() });
    if (error) console.error(`Error inserting issue "${issue.issue_title}":`, error);
    else console.log(`  Inserted issue: ${issue.issue_title}`);
  }
  console.log('');

  console.log('Verifying...');
  const { count: tablesCount } = await supabase.from('connector_tables').select('*', { count: 'exact', head: true }).eq('connector_id', CONNECTOR_ID);
  const { count: issuesCount } = await supabase.from('connector_known_issues').select('*', { count: 'exact', head: true }).eq('connector_id', CONNECTOR_ID);
  console.log(`  connector_tables: ${tablesCount}`);
  console.log(`  connector_known_issues: ${issuesCount}\n`);
  console.log(`Done — HubSpot: ${tablesCount} tables, ${issuesCount} issues`);
}

main().catch((err) => { console.error('Fatal error:', err); process.exit(1); });
