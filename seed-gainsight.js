// seed-gainsight.js
// Populates Supabase with the Fivetran Gainsight connector data.
// Sources:
//   https://fivetran.com/docs/connectors/applications/gainsight
//
// Idempotent: upserts the connector row, deletes existing gainsight
// child rows, then inserts fresh data. Re-running does not create duplicates.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_ID = 'gainsight';

// ─── CONNECTOR RECORD ────────────────────────────────────────────────────────

const connector = {
  id: CONNECTOR_ID,
  name: 'Gainsight',
  category: 'customer_success',
  description: "Fivetran's Gainsight connector replicates data from Gainsight CS (Customer Success) into your destination warehouse. Gainsight is the leading customer success platform, used by CS teams to manage health scores, track customer lifecycle, automate calls-to-action, and drive retention and expansion revenue.",
  what_it_does: 'Syncs core customer success objects from Gainsight via the Gainsight API — companies, relationships, CTAs (Calls to Action), timeline entries, and scorecards. Captures the complex cross-referencing between these objects. Handles incremental syncs based on modification timestamps. Replicates health score snapshots and CTA lifecycle data.',
  useful_for: 'Customer success analytics, health score trending, churn risk identification, CTA effectiveness analysis, CSM workload balancing, renewal forecasting, and building a unified customer 360 view by combining Gainsight CS data with CRM and product usage data in the warehouse.'
};

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'COMPANY',
    what_it_contains: 'Customer account records in Gainsight — company name, ARR, renewal date, CSM owner, lifecycle stage, industry, segment, and custom fields. This is Gainsight\'s primary account entity, typically synced from or linked to a CRM (usually Salesforce).',
    why_it_matters: 'The central entity in Gainsight. Every relationship, CTA, timeline entry, and scorecard ties back to a Company. Required for account-level CS reporting, segmentation analysis, and renewal forecasting.',
    key_callouts: 'Company records often originate from Salesforce and are synced into Gainsight via Gainsight\'s built-in Salesforce connector. The Gainsight Company ID is different from the Salesforce Account ID — use the external CRM ID field (often named salesforce_account_id or gsid) to join back to CRM data. ARR and renewal date fields are only populated if the customer uses Gainsight\'s renewal management features.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'RELATIONSHIP',
    what_it_contains: 'Sub-account or relationship records — relationship name, type (e.g. department, product line, business unit), associated company, owner, health score, and custom fields. Used when a single Company has multiple distinct customer relationships.',
    why_it_matters: 'Enables granular CS management below the account level. Critical for enterprise customers where one company may have multiple product deployments, departments, or business units each with their own CSM and health trajectory.',
    key_callouts: 'Not all Gainsight deployments use Relationships — it depends on the customer\'s data model. When Relationships are not used, this table may be empty. Relationship-level health scores are separate from Company-level health scores. The relationship_type field is configurable per Gainsight instance.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CTA',
    what_it_contains: 'Calls to Action — type (risk, expansion, renewal, lifecycle, activity), status (open, closed-success, closed-failure), priority, reason, owner, associated company, due date, close date, and tasks within the CTA.',
    why_it_matters: 'The actionable work items that drive CS team execution. CTA analysis reveals churn risk patterns, expansion opportunities, CSM response times, and the effectiveness of proactive outreach programs.',
    key_callouts: 'CTA types and reasons are configurable per Gainsight instance — the set of possible values varies. A CTA can have child tasks (sub-items) that are tracked separately. CTA lifecycle analysis (time from open to close, success rate by type) requires joining CTA records with their status change history, which lives in the Timeline or audit tables. Playbook-triggered CTAs include a playbook reference field.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TIMELINE_ENTRY',
    what_it_contains: 'Activity log entries — type (call, meeting, email, update, milestone), date, author, associated company/relationship, subject, body text, and linked CTAs or success plans.',
    why_it_matters: 'The chronological record of all CSM interactions and system events for each customer. Powers engagement frequency analysis, CSM activity reporting, and provides context for health score changes.',
    key_callouts: 'Timeline entries can be manually created by CSMs or auto-generated by Gainsight rules and integrations. The body field may contain rich text/HTML. Entries can reference multiple associated objects (company, relationship, CTA, success plan) — these associations are stored as arrays or junction records depending on the Gainsight configuration. High-volume table for active Gainsight deployments.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'SCORECARD',
    what_it_contains: 'Health score records — score name, measure name, current score value, score color (green/yellow/red), scoring scheme, associated company or relationship, last updated timestamp.',
    why_it_matters: 'Health scores are the cornerstone of proactive customer success. Scorecard data enables health trending over time, early churn detection, segment-level health comparisons, and correlation analysis between health indicators and outcomes (renewal, expansion, churn).',
    key_callouts: 'Gainsight health scores are computed by rules configured in the Gainsight Rules Engine — the scoring logic itself is not exposed through the API. The synced data contains the resulting scores but not the calculation methodology. Scores can be set at the Company or Relationship level. Historical score snapshots depend on whether Gainsight\'s score history feature is enabled; without it, only the current score is available and trending requires warehouse-side snapshots (e.g. dbt snapshots).'
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Complex Data Model with Many Cross-References',
    issue_preview: 'Queries require multiple joins across Company, Relationship, CTA, Timeline, and Scorecard tables',
    root_cause: 'Gainsight\'s data model is inherently relational and deeply interconnected. A single customer insight (e.g. "show me the health trend, open CTAs, and recent interactions for this account") requires joining Company, Scorecard, CTA, and Timeline tables. Many fields use Gainsight-internal IDs (GUIDs) rather than human-readable values. Lookup tables for configurable picklists (CTA types, reasons, relationship types) add further join complexity.',
    impact: 'Customers underestimate the complexity of querying Gainsight data. Simple-sounding questions require 4-5 table joins. Analysts unfamiliar with the Gainsight data model spend significant time understanding relationships between tables. This often surfaces as dissatisfaction during the first weeks after go-live.',
    resolution: 'Provide a data model diagram during onboarding that shows the key relationships (Company -> Relationship, Company -> CTA, Company -> Timeline, Company -> Scorecard). Recommend a dbt staging layer that pre-joins common entities and resolves ID lookups. Set expectations that Gainsight data requires more modeling effort than a typical CRM connector. Offer to walk through sample queries for the customer\'s top 3 reporting use cases.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Health Score Calculation Opaque Without Rule Definitions',
    issue_preview: 'Health scores appear in the data but the underlying scoring logic is not synced',
    root_cause: 'Gainsight health scores are computed by the Rules Engine using customer-configured formulas, thresholds, and weightings. The API exposes the resulting score values and colors but does not expose the rule definitions that produce them. When a health score changes, the warehouse shows the new value but not why it changed — the "why" lives in the Gainsight Rules Engine configuration, which is not API-accessible.',
    impact: 'Customers want to understand and validate health score changes in the warehouse — "why did this account go from green to red?" — but the scoring logic is a black box from the data perspective. This limits the usefulness of health score data for root cause analysis and forces users back to the Gainsight UI.',
    resolution: 'Explain during onboarding that health scores in the warehouse are output values only — the calculation rules are managed in Gainsight\'s UI and not synced. Recommend that CS ops teams maintain documentation of their scoring rules outside of Gainsight. For trending analysis, suggest using dbt snapshots to capture daily score values and correlate changes with timeline entries or CTA activity on the same date to infer what drove the change.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'CTA Lifecycle Tracking Requires Timeline Joins',
    issue_preview: 'CTA status changes and resolution history are not in the CTA table itself',
    root_cause: 'The CTA table contains the current state of each Call to Action (status, close date, reason) but does not contain a history of status transitions. When a CTA moves from Open to Snoozed to Closed-Success, the intermediate states are not retained in the CTA record. Status change events are logged as Timeline entries or audit records, requiring a join to reconstruct the full CTA lifecycle.',
    impact: 'Customers building CTA effectiveness dashboards (e.g. "average time to resolve risk CTAs", "snooze rate by CTA type") cannot get these metrics from the CTA table alone. They assume status history is on the CTA record and are surprised when only the final state is available.',
    resolution: 'Guide customers to join CTA records with Timeline entries filtered to CTA-related activity types. The timeline entry will show when status changes occurred. For accurate lifecycle metrics, build a dbt model that reconstructs status transitions from timeline data. Alternatively, recommend dbt snapshots on the CTA table to capture daily state changes going forward. Call this out proactively — CTA lifecycle analysis is one of the top 3 Gainsight reporting use cases.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Salesforce Integration Dependency for Account Data',
    issue_preview: 'Company records are incomplete or stale because they originate from Salesforce',
    root_cause: 'Most Gainsight deployments use Salesforce as the system of record for account data. Gainsight\'s built-in Salesforce connector syncs Account records into Gainsight\'s Company object. When the Fivetran Gainsight connector then syncs Company data to the warehouse, the data is a copy-of-a-copy — Salesforce -> Gainsight -> Warehouse. If the Gainsight-Salesforce sync is delayed, paused, or misconfigured, the Company data in the warehouse may be stale or missing fields that exist in Salesforce.',
    impact: 'Customers see discrepancies between Gainsight Company data in the warehouse and the source Salesforce Account data. Fields that were recently updated in Salesforce may not yet reflect in the Gainsight-sourced warehouse table. In some cases, new Salesforce Accounts have not yet been created as Gainsight Companies, causing gaps in reporting.',
    resolution: 'Recommend running both a Fivetran Salesforce connector and a Fivetran Gainsight connector, then joining them in the warehouse on the external CRM ID field. This gives the customer authoritative CRM data from Salesforce directly, supplemented by CS-specific data (health scores, CTAs, timeline) from Gainsight. Advise customers to verify their Gainsight-Salesforce sync is healthy before troubleshooting data freshness issues in the warehouse. The Gainsight admin can check sync status in Gainsight\'s Connectors 2.0 settings.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Gainsight connector data...\n');

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

  console.log(`\nDone — Gainsight: ${connectorTables.length} tables, ${knownIssues.length} issues`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
