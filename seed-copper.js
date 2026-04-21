// seed-copper.js
// Populates Supabase with the Fivetran Copper connector data.
// Sources:
//   https://fivetran.com/docs/connectors/applications/copper
//
// Idempotent: upserts the connector row, deletes existing copper
// child rows, then inserts fresh data. Re-running does not create duplicates.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_ID = 'copper';

// ─── CONNECTOR RECORD ────────────────────────────────────────────────────────

const connector = {
  id: CONNECTOR_ID,
  name: 'Copper',
  category: 'crm',
  description: "Fivetran's Copper connector replicates data from Copper CRM (formerly ProsperWorks) into your destination warehouse. Copper is a Google Workspace-native CRM that automatically captures contacts and activities from Gmail and Google Calendar, making it popular with teams that live in Google Workspace.",
  what_it_does: 'Syncs core CRM entities from Copper via the Copper REST API — leads, people, companies, opportunities, and activities. Captures custom field values and relationship data. Handles incremental syncs based on record modification timestamps. Replicates pipeline stages and opportunity progression.',
  useful_for: 'Sales analytics for Google Workspace-centric teams, pipeline and revenue reporting, relationship mapping, activity tracking, and understanding how Gmail/Calendar interactions translate into deal progression for mid-market sales organizations.'
};

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'LEAD',
    what_it_contains: 'Unqualified prospect records — name, email, phone, status, source, owner, company name, and custom fields. Leads are separate from People in Copper and represent top-of-funnel prospects.',
    why_it_matters: 'Top-of-funnel analytics. Tracks lead sources, conversion rates, and time-to-qualify. Leads that convert become People and/or Opportunities.',
    key_callouts: 'Copper treats Leads and People as distinct entities — unlike some CRMs that merge them. When a Lead is converted, the original Lead record remains with a converted status but the data is duplicated into a Person record. Join on email to link pre- and post-conversion records.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PERSON',
    what_it_contains: 'Contact/person records — name, emails (multiple), phone numbers, title, company reference, owner, tags, and custom fields. Automatically created from Gmail interactions when auto-enrichment is enabled.',
    why_it_matters: 'The primary person entity in Copper. Used for contact-level reporting, engagement analysis, and as the link between companies and opportunities.',
    key_callouts: 'A Person can have multiple email addresses stored as a JSON array. The primary email is typically the first in the array, but this is not guaranteed. Google Workspace auto-created contacts may lack complete data — filter on source or data completeness for accurate reporting.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'COMPANY',
    what_it_contains: 'Organization records — name, domain, industry, address, phone, owner, tags, and custom fields. Can be auto-created from email domain when a Person is added.',
    why_it_matters: 'Account-level entity for territory analysis, company-based reporting, and aggregating person/opportunity data by organization.',
    key_callouts: 'Companies auto-created from email domains may have minimal data (just domain and name). Manual enrichment in Copper adds fields over time, which appear as column updates in the warehouse. The interaction_count field reflects Gmail/Calendar touches when Google integration is active.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'OPPORTUNITY',
    what_it_contains: 'Sales deals — name, monetary value, pipeline, stage, status (open/won/lost/abandoned), close date, priority, owner, associated company and person references.',
    why_it_matters: 'Core revenue and pipeline table. Drives win/loss analysis, pipeline velocity, forecast reporting, and stage conversion metrics.',
    key_callouts: 'Each opportunity belongs to one pipeline. Copper supports multiple pipelines with independent stage definitions. The monetary_value field stores the deal amount but currency is set at the account level, not per-deal. Won/lost reasons are stored as free-text fields when configured in Copper.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ACTIVITY',
    what_it_contains: 'Interaction records — type (email, call, meeting, note, task), timestamp, owner, associated record references, and details. Includes both manually logged and auto-captured Gmail/Calendar activities.',
    why_it_matters: 'Activity-level analytics, rep engagement metrics, and understanding the relationship between interaction frequency and deal outcomes.',
    key_callouts: 'Auto-captured activities from Google Workspace only include metadata (subject, participants, timestamps) — full email bodies are not synced. Activity types are a mix of system-defined (email, meeting) and custom types defined in Copper. The parent_type and parent_id fields indicate which record (Person, Company, Opportunity) the activity is associated with.'
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Google Workspace Auto-Captured Data Not Fully Synced',
    issue_preview: 'Gmail and Calendar data visible in Copper UI does not appear in the warehouse',
    root_cause: 'Copper\'s deep Google Workspace integration surfaces Gmail threads, Calendar events, and Google Drive files directly in the Copper UI. However, the Copper API does not expose the full content of these Google-sourced interactions. The API returns activity metadata (timestamps, participants, subject lines) but not email bodies, calendar event details, or file contents. What users see in the Copper sidebar is rendered by a live Google API call, not stored Copper data.',
    impact: 'Customers expect to analyze email content or calendar details that appear in the Copper UI but find only metadata in the warehouse. This is the most common surprise during Copper onboarding — the UI shows far more Google data than the API provides.',
    resolution: 'Set expectations during pre-sales that Google Workspace content visible in the Copper UI is not available through the API. Activity metadata (who, when, what type) is sufficient for engagement frequency analysis. For full email content analysis, recommend supplementing with a Gmail connector or Google Workspace export.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Custom Field Schema Varies Per Account — Dropdowns Stored as IDs',
    issue_preview: 'Custom dropdown fields show numeric IDs instead of display labels',
    root_cause: 'Copper stores custom dropdown field selections as internal option IDs rather than the human-readable labels. The mapping between option IDs and display labels is available through a separate API endpoint (custom field definitions), but the synced records only contain the IDs. Additionally, each Copper account has a unique set of custom fields, making the schema different across deployments.',
    impact: 'Reports show meaningless numeric IDs for dropdown custom fields. Customers must build a lookup join to resolve labels. The varying schema also means dbt models or dashboards built for one Copper account do not work for another without modification.',
    resolution: 'Ensure the custom field definitions table is included in the sync — it contains the ID-to-label mapping. Provide a sample SQL join during onboarding to resolve dropdown IDs to display values. Warn customers that their schema will be unique and downstream models should be parameterized for custom field names.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Relationship Types Stored as IDs Requiring Lookup',
    issue_preview: 'Relationship fields between records show numeric type IDs instead of labels like "Partner" or "Vendor"',
    root_cause: 'Copper supports configurable relationship types between People, Companies, and Opportunities (e.g. "Partner", "Vendor", "Subsidiary"). These relationships are stored using numeric type IDs. The type definitions are in a separate relation_types metadata endpoint. Without joining to this metadata, relationship data is not human-readable.',
    impact: 'Customers building account hierarchy or partner relationship reports see raw IDs. Relationship-based analytics (e.g. "show all partner accounts") require an additional join that is not obvious from the table schema alone.',
    resolution: 'Include the relationship type definitions table in the sync configuration. Provide documentation or a dbt staging model that joins relationship records to their type labels. Call this out proactively during onboarding — relationship mapping is a common use case for Copper customers.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Pipeline Stage History Not Tracked — Only Current Stage Available',
    issue_preview: 'Cannot analyze how long deals spent in each stage or track stage-over-time progression',
    root_cause: 'Copper does not maintain a stage history log accessible through its API. The opportunity record only contains the current pipeline stage. Unlike Salesforce (which has OpportunityHistory), Copper does not provide a built-in mechanism to retrieve historical stage transitions. Fivetran syncs what the API provides — and the API only returns current state.',
    impact: 'Customers wanting deal velocity analysis (time-in-stage), stage conversion funnels, or historical pipeline snapshots cannot build these reports from Copper data alone. This is a significant limitation for sales operations teams accustomed to Salesforce-style stage history.',
    resolution: 'Recommend building a snapshot table in the warehouse that captures opportunity stage daily (e.g. using dbt snapshots). This creates a synthetic stage history going forward from the date the snapshot is first run. For historical analysis predating the snapshot, the data is not recoverable from Copper. Set this expectation early — it frequently comes up in mid-market deals where the buyer is migrating from Salesforce.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Copper connector data...\n');

  // 1. Upsert connector row
  const { error: ce } = await supabase
    .from('connectors')
    .upsert(
      {
        ...connector,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString()
      },
      { onConflict: 'id' }
    );

  if (ce) {
    console.error('Error upserting connector:', ce);
    process.exit(1);
  }
  console.log(`Upserted connector: ${connector.name}`);

  // 2. Clear existing child rows so re-runs are idempotent
  await supabase.from('connector_tables').delete().eq('connector_id', CONNECTOR_ID);
  await supabase.from('connector_known_issues').delete().eq('connector_id', CONNECTOR_ID);

  // 3. Insert connector tables
  console.log('Inserting connector tables...');
  for (const t of connectorTables) {
    const { error } = await supabase.from('connector_tables').insert({
      ...t,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (error) console.error(`Error: ${t.table_name}`, error);
    else console.log(`  Table: ${t.table_name}`);
  }

  // 4. Insert known issues
  console.log('Inserting known issues...');
  for (const i of knownIssues) {
    const { error } = await supabase.from('connector_known_issues').insert({
      ...i,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    });
    if (error) console.error(`Error: ${i.issue_title}`, error);
    else console.log(`  Issue: ${i.issue_title}`);
  }

  console.log(`\nDone — Copper: ${connectorTables.length} tables, ${knownIssues.length} issues`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
