// seed-freshsales.js
// Populates Supabase with the Fivetran Freshsales connector data.
// Sources:
//   https://fivetran.com/docs/connectors/applications/freshsales
//
// Idempotent: upserts the connector row, deletes existing freshsales
// child rows, then inserts fresh data. Re-running does not create duplicates.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_ID = 'freshsales';

// ─── CONNECTOR RECORD ────────────────────────────────────────────────────────

const connector = {
  id: CONNECTOR_ID,
  name: 'Freshsales',
  category: 'crm',
  description: "Fivetran's Freshsales connector replicates data from Freshsales (Freshworks CRM) into your destination warehouse, bringing over contacts, deals, accounts, activities, and sales sequence data. Freshsales is a popular mid-market CRM known for built-in phone/email, AI-powered lead scoring, and sales sequence automation.",
  what_it_does: 'Syncs core CRM objects from Freshsales via the Freshsales REST API — contacts, deals, accounts, activities, and sales sequences. Captures custom fields defined per object. Handles incremental syncs using updated_at timestamps to minimize API consumption. Replicates lifecycle stage assignments and deal stage progressions.',
  useful_for: 'Mid-market sales analytics, pipeline reporting, contact engagement tracking, sales sequence performance analysis, and lead-to-close reporting for teams using Freshworks CRM as their primary sales tool.'
};

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CONTACT',
    what_it_contains: 'Individual person records — name, email, phone, job title, lifecycle stage, lead score, owner, account reference, and custom fields.',
    why_it_matters: 'The primary person-level entity in Freshsales. Drives contact-based reporting, engagement analysis, and lifecycle stage funnels.',
    key_callouts: 'Custom fields are included as additional columns but their names and types vary per Freshsales account. Lifecycle stage is stored as a stage ID — join to lifecycle stage metadata for human-readable labels. Lead scores from Freddy AI are included when enabled.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'DEAL',
    what_it_contains: 'Sales opportunities — name, amount, expected close date, pipeline, stage, probability, owner, associated account and contact references.',
    why_it_matters: 'Core revenue and pipeline table. Powers deal velocity, win/loss analysis, forecast reporting, and pipeline health dashboards.',
    key_callouts: 'Each deal belongs to a single pipeline. Stage names are pipeline-specific — the same stage name in two pipelines represents different stages. Deal amount is stored in the account currency; multi-currency orgs should join to currency metadata for normalization.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ACCOUNT',
    what_it_contains: 'Company/organization records — name, industry, website, address, annual revenue, number of employees, owner, and custom fields.',
    why_it_matters: 'The top-level company entity. Contacts and deals roll up to accounts for account-based reporting and territory analysis.',
    key_callouts: 'Account hierarchy (parent-child) relationships are supported via the parent_account_id field. Custom fields vary per Freshsales instance and may include dropdowns stored as IDs rather than display values.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ACTIVITY',
    what_it_contains: 'Sales activities — calls, emails, tasks, meetings, notes, and custom activity types with timestamps, owners, and associated record references.',
    why_it_matters: 'Activity-based analytics, rep productivity metrics, and engagement scoring. Shows what reps are doing and how frequently they touch accounts and contacts.',
    key_callouts: 'Activity types are configurable per account — the set of possible types may differ from the Freshsales defaults. Email activities only include metadata (subject, timestamp, direction) when synced through the connector; full email bodies are not replicated.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'SALES_SEQUENCE',
    what_it_contains: 'Automated outreach sequence definitions and enrollment records — sequence name, steps, enrolled contacts, step completion status, and outcomes.',
    why_it_matters: 'Measures the effectiveness of automated outreach cadences. Answers which sequences generate the most replies, meetings, and pipeline.',
    key_callouts: 'Enrollment-level data shows per-contact progression through the sequence. Step-level metrics (open, click, reply) depend on email tracking being enabled in Freshsales. Sequences paused or archived in Freshsales still appear in the data with a status flag.'
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Custom Fields Vary Per Account — Schema Mismatches Across Environments',
    issue_preview: 'Custom field columns appear in one environment but are missing in another',
    root_cause: 'Freshsales allows each account to define its own custom fields on contacts, deals, and accounts. These custom fields become columns in the destination. Since every Freshsales instance has a different set of custom fields, the destination schema is unique per customer. When customers compare their schema to documentation or another deployment, they see unexpected differences.',
    impact: 'Customers report "missing columns" that are actually custom fields from a different Freshsales configuration. Downstream dbt models or BI dashboards that reference specific custom field columns break when pointed at a different Freshsales account.',
    resolution: 'Set expectations during onboarding that the schema is dynamic and account-specific. Use the Fivetran dashboard Schema tab to review which custom fields are syncing. Build downstream models that gracefully handle missing columns (e.g. dbt\'s adapter.get_columns_in_relation macro). Document each customer\'s custom field mapping during initial setup.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Lifecycle Stage Mapping Requires Metadata Join',
    issue_preview: 'Lifecycle stage columns show IDs instead of readable stage names',
    root_cause: 'Freshsales stores lifecycle stages as numeric IDs on the contact record. The human-readable stage names (e.g. "Lead", "Customer", "Evangelist") are defined in account-level configuration and synced as a separate metadata table. Without joining to this metadata, reports show meaningless integer values.',
    impact: 'Dashboards and reports display raw stage IDs, confusing end users. Customers assume the connector is broken when in fact the data is complete but requires a join.',
    resolution: 'Guide the customer to join the contact table to the lifecycle stage metadata table on stage_id. Provide a sample SQL join during onboarding. If using the Fivetran dbt package, the staging model handles this join automatically. Flag this proactively in kickoff calls — it comes up in nearly every Freshsales deployment.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Email Tracking Data Incomplete — Bodies and Attachments Not Synced',
    issue_preview: 'Email activities show metadata only; full message content is missing',
    root_cause: 'The Freshsales API exposes email activity metadata (subject, timestamp, sender, recipient, direction) but does not provide full email bodies or attachment content through the endpoints Fivetran uses. This is an API-level limitation, not a Fivetran filtering decision.',
    impact: 'Customers expecting to analyze email content, sentiment, or attachment types find that only metadata is available. Keyword-based email analysis is not possible from the synced data alone.',
    resolution: 'Clarify during the sales cycle that email body content is not available via the Freshsales API. If email content analysis is a hard requirement, recommend supplementing with a dedicated email analytics tool or the Freshsales UI export. Metadata (subject lines, timestamps, open/click tracking) is sufficient for most engagement scoring use cases.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'API Rate Limits Cause Slow Syncs for Large Accounts',
    issue_preview: 'Initial sync takes days or syncs fall behind for accounts with 500K+ records',
    root_cause: 'Freshsales enforces API rate limits that vary by plan tier (Growth, Pro, Enterprise). Accounts with large contact or activity volumes — particularly those on the Growth plan — can exhaust their API quota before a full sync completes. Fivetran respects rate limit headers and backs off, extending sync duration.',
    impact: 'Initial historical syncs for large accounts can take multiple days. Incremental syncs may fall behind if the volume of daily changes exceeds what the rate limit allows in a single sync window. Customers perceive the connector as slow.',
    resolution: 'Confirm the customer\'s Freshsales plan tier and API limits during pre-sales discovery. For large accounts on lower-tier plans, recommend upgrading to Enterprise for higher API limits. Reduce sync scope by excluding high-volume tables (e.g. ACTIVITY) that are not critical. Increase sync frequency to spread load across more, smaller incremental syncs rather than one large batch.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Freshsales connector data...\n');

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

  console.log(`\nDone — Freshsales: ${connectorTables.length} tables, ${knownIssues.length} issues`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
