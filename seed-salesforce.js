// seed-salesforce.js
// Populates Supabase with the Fivetran Salesforce connector data.
// Sources:
//   https://fivetran.com/docs/connectors/applications/salesforce
//   https://fivetran.com/docs/connectors/applications/salesforce/setup-guide
//   https://fivetran.com/docs/connectors/applications/salesforce/faq
//   https://fivetran.com/docs/connectors/applications/salesforce/formula
//   https://fivetran.com/docs/connectors/applications/salesforce/troubleshooting
//   https://fivetran.com/docs/connectors/applications/salesforce/troubleshooting/90-percent-api-limit-error
//   https://fivetran.com/docs/connectors/applications/salesforce/troubleshooting/sandbox-issue
//   https://fivetran.com/docs/connectors/applications/salesforce/troubleshooting/capturing-deletes
//   https://fivetran.com/docs/connectors/applications/salesforce/troubleshooting/paused-15-days
//   https://fivetran.com/docs/connectors/applications/salesforce/troubleshooting/rest-api-not-enabled
//   https://fivetran.com/docs/connectors/applications/salesforce/troubleshooting/reauthorization-failure
//
// Idempotent: upserts the connector row, deletes existing salesforce
// child rows, then inserts fresh data. Re-running does not create duplicates.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_ID = 'salesforce';

// ─── CONNECTOR RECORD ────────────────────────────────────────────────────────

const connector = {
  id: CONNECTOR_ID,
  name: 'Salesforce',
  category: 'crm',
  description: "Fivetran's Salesforce connector is a fully managed integration that replicates every accessible standard and custom object from a Salesforce org into your destination warehouse, preserving the native Salesforce schema so queries feel familiar. A separate 'Salesforce Sandbox' connector exists for sandbox environments — they cannot be mixed.",
  what_it_does: 'Discovers and syncs all accessible standard objects (ACCOUNT, CONTACT, OPPORTUNITY, LEAD, CASE, USER, etc.) and custom objects (*__c) via the Salesforce REST API and Bulk API. Automatically falls back between the two APIs based on volume and quota. Handles compound fields by exploding subfields (e.g. BillingAddress becomes billing_street, billing_city, billing_latitude, billing_postal_code). Excludes formula fields by default to avoid data integrity issues, but provides FIVETRAN_FORMULA and FIVETRAN_FORMULA_MODEL helper tables for rebuilding them downstream. Captures soft deletes via the SObject Get Deleted endpoint.',
  useful_for: 'CRM analytics, pipeline and revenue reporting, sales operations dashboards, lead-to-cash analysis, customer 360 views when blended with marketing and product data, and compliance/audit reporting across sales activity.'
};

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ACCOUNT',
    what_it_contains: 'Company/customer records — name, industry, billing/shipping addresses, parent account, owner, lifecycle fields.',
    why_it_matters: 'The top-level customer entity. Every opportunity, contact, and case joins back to ACCOUNT.',
    key_callouts: "Compound fields like BillingAddress are exploded into subfields with a prefix (billing_street, billing_city, billing_latitude, billing_postal_code). Formula fields are excluded by default — use FIVETRAN_FORMULA tables to rebuild them."
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CONTACT',
    what_it_contains: 'Individual person records — name, email, phone, account reference, owner, mailing address.',
    why_it_matters: 'Person-level CRM data. Joins to ACCOUNT and powers contact-based reporting.',
    key_callouts: 'Compound MailingAddress fields are exploded (mailing_street, mailing_city, etc.). Soft deletes captured via the is_deleted column — use _fivetran_active for active-record filtering.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'OPPORTUNITY',
    what_it_contains: 'Sales deals — name, stage, amount, close date, probability, account reference, owner, forecast category.',
    why_it_matters: 'Core revenue table. Drives pipeline reports, forecast analysis, win/loss metrics, and the majority of sales analytics.',
    key_callouts: 'Stage history lives in OPPORTUNITY_HISTORY. Line items in OPPORTUNITY_LINE_ITEM. Split credit in OPPORTUNITY_SPLIT.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'LEAD',
    what_it_contains: 'Unqualified prospects — name, company, email, status, source, owner, conversion fields.',
    why_it_matters: 'Top-of-funnel data. Lead source and conversion analysis feed marketing attribution models.',
    key_callouts: 'Converted leads populate converted_account_id, converted_contact_id, and converted_opportunity_id — join back to the converted records for full lifecycle analysis.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CASE',
    what_it_contains: 'Customer service cases — subject, status, priority, contact, account, owner, resolution details.',
    why_it_matters: 'Customer support analytics, SLA reporting, case volume trending, and tying service events to revenue accounts.',
    key_callouts: "CASE is a reserved word in some warehouses — Fivetran quotes the table name appropriately. Child comments in CASE_COMMENT."
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'USER',
    what_it_contains: 'Salesforce users — name, email, role, profile, manager, active/inactive status.',
    why_it_matters: 'Owner lookups for every other object. Needed for rep-level performance reporting.',
    key_callouts: 'USER is a reserved word in many warehouses — Fivetran quotes it. Includes inactive users by default for historical attribution.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'OPPORTUNITY_LINE_ITEM',
    what_it_contains: 'Products/line items on an opportunity — product reference, quantity, unit price, total price.',
    why_it_matters: 'Product-level revenue analysis. Required for product mix, unit economics, and per-SKU forecasting.',
    key_callouts: 'Joins to OPPORTUNITY via opportunity_id and to PRODUCT2 via product_2_id.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'OPPORTUNITY_HISTORY',
    what_it_contains: 'Stage transitions on opportunities — old/new stage, timestamp, who made the change.',
    why_it_matters: 'Stage velocity, pipeline aging, and conversion-rate-by-stage analysis. Salesforce does not retain this in OPPORTUNITY itself.',
    key_callouts: 'One row per stage change. Requires "Field History Tracking" to be enabled in Salesforce for stage changes to populate.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'OPPORTUNITY_SPLIT',
    what_it_contains: 'Credit splits when multiple reps share an opportunity — rep, split percentage, split type.',
    why_it_matters: 'Accurate rep-level attribution when deals are team-sold.',
    key_callouts: 'Only populated if Opportunity Splits are enabled in the Salesforce org.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CAMPAIGN',
    what_it_contains: 'Marketing campaigns — name, type, status, budgeted/actual cost, start/end dates, response counts.',
    why_it_matters: 'Campaign ROI reporting and multi-touch attribution when combined with lead source and opportunity campaign influence.',
    key_callouts: 'Members are in CAMPAIGN_MEMBER — junction table between CAMPAIGN and LEAD/CONTACT.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TASK',
    what_it_contains: 'Activity records — calls, emails, to-dos, associated record, owner, status, due date.',
    why_it_matters: 'Activity-based reporting, SDR productivity metrics, engagement analysis.',
    key_callouts: 'TASK and EVENT together represent the Activity timeline. High-volume table — consider filtering by date if your org has millions of activities.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'EVENT',
    what_it_contains: 'Calendar events — meetings, demos, associated record, attendees, start/end times.',
    why_it_matters: 'Meeting-based analytics, especially for demo-to-close and customer interaction tracking.',
    key_callouts: 'Pairs with TASK for full activity timeline.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PRODUCT2',
    what_it_contains: 'Product catalog — name, code, family, description, active flag.',
    why_it_matters: 'Product dimension for revenue reporting.',
    key_callouts: 'Named PRODUCT2 historically because "Product" was reserved. Joins to OPPORTUNITY_LINE_ITEM.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: '<object_name>__C',
    what_it_contains: 'Custom objects created in the Salesforce org — any columns the admin defined, plus system audit fields.',
    why_it_matters: 'Most enterprise Salesforce orgs have 10–100+ custom objects that contain business-critical data not in standard objects.',
    key_callouts: 'Custom objects are auto-discovered. Custom fields on standard objects also follow the __c suffix convention. Must be enabled in the Schema tab to sync.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'FIVETRAN_FORMULA',
    what_it_contains: 'Metadata describing every formula field in the Salesforce org — object, field name, formula expression, data type.',
    why_it_matters: 'Since Fivetran excludes formula values, this table plus FIVETRAN_FORMULA_MODEL lets you reconstruct formula fields in the destination via dbt or SQL views.',
    key_callouts: 'Companion dbt package "dbt_salesforce_formula_utils" automates formula field reconstruction.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'FIVETRAN_FORMULA_MODEL',
    what_it_contains: 'Pre-built model definitions generated by Fivetran for rebuilding formula fields from their underlying inputs.',
    why_it_matters: 'Shortcut for formula field reconstruction without writing the expressions by hand.',
    key_callouts: 'Paired with FIVETRAN_FORMULA.'
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: '90% API Limit Reached — Sync Auto-Paused',
    issue_preview: 'Sync fails when the Salesforce org hits 90% of its daily API quota',
    root_cause: 'Salesforce enforces a per-org daily API call limit (varies by edition and licensed user count). When total inbound API usage — including Fivetran, custom apps, and any other integrations sharing the org — reaches 90% of the limit, Fivetran stops syncing to avoid pushing the org over the limit and breaking other integrations.',
    impact: 'Sync pauses and the connector dashboard shows an API limit warning. If usage stays above the threshold, syncs cannot resume until the quota resets at midnight org-local time.',
    resolution: 'Lower the connector\'s configurable API usage threshold in setup. Increase the Salesforce org API quota (upgrade edition or add user licenses). Spread connectors across multiple orgs. Exclude unneeded tables (especially high-volume ones like TASK, EVENT, or change-tracked custom objects). Reduce sync frequency. Avoid sharing OAuth credentials across multiple Fivetran connectors — each connection counts separately.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Formula Fields Are Not Synced',
    issue_preview: 'Formula field columns are missing from the destination',
    root_cause: 'Formula fields are calculated at query time in Salesforce and can change values without updating the underlying record timestamp. Since Fivetran syncs incrementally using modified_date, a formula value can be stale in the destination while correct in Salesforce — a data integrity problem. Fivetran automatically detects and excludes formula fields.',
    impact: 'Customers expect formula field columns and are confused when they are missing.',
    resolution: 'Use FIVETRAN_FORMULA and FIVETRAN_FORMULA_MODEL to rebuild the formula fields in the destination via dbt models or warehouse views. For common cases, use the dbt_salesforce_formula_utils package. Do NOT try to force-sync formula fields — stale data will be inevitable.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Soft Deletes Lost If Connection Paused > 15 Days',
    issue_preview: 'Records deleted while the connector was paused are not detected',
    root_cause: 'Fivetran detects deletes using the Salesforce SObject Get Deleted endpoint, which only returns records deleted in the last 15 days (Salesforce Recycle Bin retention window). After 15 days, deleted records are hard-purged and the endpoint cannot return them.',
    impact: 'If a connector is paused for more than 15 days, any records deleted during the pause will appear as active in the destination forever — creating phantom rows that no longer exist in Salesforce.',
    resolution: 'Re-sync every affected table before unpausing if the pause exceeded 15 days. Use _fivetran_active (not is_deleted) for active-record filtering in downstream queries. Monitor connector pause duration via the Fivetran platform logs.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Sandbox Connected to Production Connector (or Vice Versa)',
    issue_preview: 'Authentication succeeds but no data syncs, or the wrong org connects',
    root_cause: 'Salesforce Sandbox and Production orgs have different OAuth endpoints (test.salesforce.com vs login.salesforce.com). Fivetran offers two separate connectors: "Salesforce" (production) and "Salesforce Sandbox". Using the wrong one routes authentication to the wrong endpoint.',
    impact: 'Connector setup appears to succeed (since any valid Salesforce user can authenticate on either endpoint for some org configurations) but the wrong org is connected, or authentication fails outright.',
    resolution: 'Use the "Salesforce Sandbox" connector for sandbox environments and the "Salesforce" connector for production. If the wrong connector was used, delete it and create a new one with the correct type. Each uses a separate set of OAuth credentials.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'OAuth Connection Limit — 4 Per Set of Credentials',
    issue_preview: 'Creating a 5th connection with the same Salesforce login silently kills the 1st',
    root_cause: 'Salesforce limits OAuth2 connections to 4 per account per application. When a 5th Fivetran connection is created using the same Salesforce user credentials, the earliest-authenticated connection loses its authentication and stops syncing.',
    impact: 'An older, previously working Fivetran connection starts failing authentication unexpectedly. The customer did not touch it — the new connection bumped it.',
    resolution: 'Plan Salesforce credential usage carefully. If more than 4 connections are needed, use additional Salesforce users (e.g. dedicated integration users) to authorize the extras. Document which user authorized which connection to avoid surprise outages when rotating.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'REST API Not Enabled for the Organization',
    issue_preview: 'Connection test fails with "REST API is not enabled"',
    root_cause: 'Salesforce editions below Enterprise do not include REST API access by default. Fivetran requires REST API access (or purchased API add-on). Professional Edition users must buy the API add-on package.',
    impact: 'Connector cannot be created. Setup fails at the authentication step with a clear error.',
    resolution: 'Upgrade the Salesforce edition to Enterprise or higher, OR purchase the API add-on for Professional Edition. This is a hard Salesforce licensing requirement — Fivetran cannot work around it.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Permission Removal Does Not Re-Sync Historical Rows',
    issue_preview: 'Granting access to a previously-blocked column only syncs new rows',
    root_cause: "When the authorizing Salesforce user's column-level permissions change, Fivetran only sees data it has permission to read going forward. Granting access to a previously-blocked column does NOT retroactively fetch values for existing rows — only new/updated rows will include the column data.",
    impact: 'Customers grant permissions expecting historical data to appear, then find that only new edits have the column populated. Old rows show NULL for the newly-permitted column.',
    resolution: 'Trigger a table re-sync after granting new permissions. The re-sync pulls every row with the updated permission set, backfilling the previously-blocked column.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Re-Authorization Fails While Logged Into Salesforce',
    issue_preview: 'The re-authorize flow fails when the user is already logged into Salesforce in the same browser',
    root_cause: 'The Salesforce OAuth re-authorization flow does not reliably return the required credential tokens when the user is already logged into Salesforce in the browser session used to re-authorize Fivetran.',
    impact: "Re-authorization cycles fail with no clear error. The connector remains in an expired-credential state even after the user thinks they fixed it.",
    resolution: 'Log out of Salesforce (or use an incognito/private browser window) before starting the re-authorize flow in Fivetran. Complete the OAuth flow fresh, then log back into Salesforce normally.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Bulk API 24-Hour Quota Exhaustion',
    issue_preview: 'Large syncs fall back to the slower REST API after Bulk API quota is consumed',
    root_cause: 'Salesforce enforces a rolling 24-hour Bulk API job quota separate from the general API limit. When 90% of the bulk jobs quota is consumed, Fivetran falls back to the REST API to continue syncing — this is slower and consumes more general API calls per row.',
    impact: 'Sync duration increases significantly after Bulk API quota is hit. May cascade into hitting the general 90% API limit next.',
    resolution: 'Upgrade Salesforce edition for higher Bulk API quotas. Reduce historical sync scope or schedule large backfills during off-hours. Split workloads across multiple Salesforce orgs. Monitor Bulk API consumption via Salesforce Setup > System Overview.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Compound and Formula Fields Cannot Be Used in Row Filtering',
    issue_preview: 'Row filters on compound addresses or formula fields are rejected',
    root_cause: "Fivetran's row filtering feature operates on individual scalar columns. Compound fields (e.g. BillingAddress) are not atomic in Salesforce — they are composites. Formula fields are computed at query time and not usable as filter predicates. Neither can be referenced in a row filter.",
    impact: "Customers try to filter out test accounts or specific geographies using compound/formula fields and the filter fails or is silently ignored.",
    resolution: 'Filter on the exploded subfields instead (e.g. billing_country = \'US\' rather than BillingAddress). For formula-field filtering, rebuild the formula in the warehouse using FIVETRAN_FORMULA and filter on the reconstructed column downstream.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Salesforce connector data...\n');

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
  console.log('Clearing existing salesforce rows in child tables...');
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

  console.log(`✅ Task 9 Complete - Salesforce: ${tablesCount} tables, ${issuesCount} issues`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
