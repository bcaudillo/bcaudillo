// seed-workday.js
// Populates Supabase with the Fivetran Workday connector data.
// Sources:
//   https://fivetran.com/docs/connectors/applications/workday
//   https://fivetran.com/docs/connectors/applications/workday/setup-guide
//   https://fivetran.com/docs/connectors/applications/workday/troubleshooting
//
// Idempotent: upserts the connector row, deletes existing workday
// child rows, then inserts fresh data. Re-running does not create duplicates.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_ID = 'workday';

// ─── CONNECTOR RECORD ────────────────────────────────────────────────────────

const connector = {
  id: CONNECTOR_ID,
  name: 'Workday',
  category: 'hr',
  description: "Fivetran's Workday connector replicates HR and financial data from Workday into your destination warehouse using Workday's Report-as-a-Service (RaaS) framework. Unlike most connectors, Workday requires the customer to build custom reports in Workday first — Fivetran then syncs those reports as tables. This makes setup more involved but gives precise control over which data lands in the warehouse.",
  what_it_does: 'Connects to Workday via RaaS (Report-as-a-Service) custom reports exposed as web service endpoints. Each custom report becomes a table in the destination. Supports worker demographics, compensation, organizational hierarchy, job profiles, positions, and any other data the customer exposes through a RaaS report. Handles incremental syncs based on the report configuration and supports multiple Workday tenants.',
  useful_for: 'Enterprise workforce analytics, headcount planning, compensation benchmarking, organizational hierarchy reporting, employee lifecycle analysis, DEI metrics, talent management dashboards, and compliance reporting across global HR operations.'
};

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'WORKER',
    what_it_contains: 'Core employee/contingent worker records — worker ID, name, email, hire date, termination date, worker type (employee vs contingent), active status, manager reference.',
    why_it_matters: 'The primary person entity in Workday. Every other HR table joins back to WORKER. Required for headcount reporting, turnover analysis, and org chart construction.',
    key_callouts: 'Workday distinguishes between employees and contingent workers — both appear in WORKER with a worker_type field. Terminated workers remain in the table with termination dates populated. The worker ID is Workday-internal and may differ from the employee ID customers use day-to-day.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'POSITION',
    what_it_contains: 'Position records — position ID, title, job posting title, time type (full-time/part-time), worker reference, supervisory org, availability date, filled/vacant status.',
    why_it_matters: 'Positions are the structural backbone of Workday staffing. Headcount planning, requisition tracking, and vacancy analysis all depend on position data.',
    key_callouts: 'A position can exist without an assigned worker (vacancy). One worker can hold multiple positions (dual roles). The position-to-worker relationship is many-to-many over time — use effective dates to determine current assignments.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ORGANIZATION',
    what_it_contains: 'Organizational units — org ID, name, type (supervisory, cost center, company, region, custom), parent org reference, manager reference, active status.',
    why_it_matters: 'Drives all hierarchical reporting — department rollups, cost center allocation, management span-of-control analysis, and regional headcount distribution.',
    key_callouts: 'Workday supports multiple parallel org hierarchies (supervisory, cost center, matrix). Recursive self-joins are needed to traverse the hierarchy. The RaaS report must explicitly include the parent org reference field for hierarchy traversal to work in the warehouse.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'COMPENSATION',
    what_it_contains: 'Worker compensation details — base pay, currency, frequency (annual/hourly), compensation plan, grade, step, effective date, total compensation amount.',
    why_it_matters: 'Core table for compensation analytics, pay equity analysis, budget planning, and benchmarking against market data.',
    key_callouts: 'Compensation data is highly sensitive — ensure the RaaS report only includes fields approved by HR/Legal. Multiple compensation components (base, bonus, equity) may appear as separate rows per worker. Currency conversion is not handled by Fivetran — normalize in the warehouse if the org operates in multiple currencies.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'JOB_PROFILE',
    what_it_contains: 'Job profile definitions — profile ID, title, job family, job family group, management level, exempt/non-exempt classification, pay rate type.',
    why_it_matters: 'The job taxonomy dimension. Required for role-based analytics, career pathing analysis, and mapping workers to standardized job families for benchmarking.',
    key_callouts: 'Job profiles are templates — they define the role, not the person. Workers are assigned to job profiles via their position. Job family and job family group provide rollup dimensions for aggregating across similar roles.'
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'RaaS Report Setup Required Before Connector Works',
    issue_preview: 'Connector cannot sync until custom reports are created in Workday',
    root_cause: 'Unlike most Fivetran connectors that auto-discover schema, the Workday connector relies entirely on Workday Report-as-a-Service (RaaS) custom reports. The customer must create these reports in Workday, expose them as web services, and provide the report URLs to Fivetran during setup. Without this, there is nothing to sync.',
    impact: 'Setup takes significantly longer than typical connectors — often 1-3 weeks depending on the customer\'s Workday admin availability and internal approval processes. Customers expecting a plug-and-play experience are frequently surprised.',
    resolution: 'Set expectations early in the sales cycle that Workday requires customer-side report creation. Provide Fivetran\'s recommended RaaS report templates to the Workday admin. Offer to schedule a joint setup call with Fivetran support and the customer\'s Workday team. The setup guide includes step-by-step instructions for creating RaaS reports with the correct output format.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'PII and Sensitive Data Exposure in RaaS Reports',
    issue_preview: 'Compensation, SSN, or other restricted fields accidentally included in synced reports',
    root_cause: 'Because the customer controls which fields appear in RaaS reports, there is no automatic PII filtering. If the Workday admin includes sensitive fields (SSN, date of birth, salary, performance ratings) in the report, those fields flow directly into the destination warehouse. Fivetran syncs exactly what the report returns.',
    impact: 'Sensitive HR data lands in the warehouse without the customer realizing it, potentially violating internal data governance policies, SOC 2 controls, or regulatory requirements (GDPR, CCPA). Discovered during security audits or when downstream users notice the data.',
    resolution: 'Review every RaaS report field list with the customer\'s HR team and security/compliance team before the connector goes live. Recommend using Fivetran\'s column blocking feature to exclude sensitive columns even if they appear in the report. Suggest creating separate reports for sensitive vs non-sensitive data with different warehouse landing zones and access controls.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Organizational Hierarchy Requires Recursive Joins',
    issue_preview: 'Flat org table cannot be queried for full reporting chain without recursive SQL',
    root_cause: 'Workday stores organizations as a flat table with parent references (adjacency list). To build a full hierarchy — e.g., "show me all workers under VP of Engineering including nested sub-orgs" — requires recursive CTEs or iterative joins in the warehouse. The RaaS report outputs a flat structure, not a pre-flattened hierarchy.',
    impact: 'Customers expect a ready-to-query org chart and are frustrated when simple rollup queries require recursive SQL. BI tools that do not support recursive CTEs (some versions of Looker, Tableau) cannot natively traverse the hierarchy.',
    resolution: 'Recommend using dbt to build a flattened hierarchy model (bridge table) as a post-sync transformation. Fivetran\'s dbt Workday package includes hierarchy flattening logic. Alternatively, have the Workday admin create a RaaS report that pre-flattens the hierarchy to a fixed depth (e.g., Level 1 through Level 8), though this is brittle if org depth changes.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Worker vs Employee vs Contingent Worker Confusion',
    issue_preview: 'Headcount reports double-count or miss workers due to worker type distinctions',
    root_cause: 'Workday has three distinct concepts: Worker (umbrella), Employee (W-2/permanent), and Contingent Worker (contractor/temp). RaaS reports may return all three under the WORKER entity, or the customer may have separate reports for each. If the distinction is not clearly modeled, downstream reports either double-count (summing across overlapping reports) or undercount (filtering to only employees and missing contractors).',
    impact: 'Headcount numbers in the warehouse do not match Workday dashboards. Finance and HR lose trust in the data. Reconciliation becomes a recurring pain point.',
    resolution: 'Ensure the RaaS report includes the worker_type field and document the expected values (Employee, Contingent Worker). Build downstream models that explicitly filter or group by worker type. Validate headcount totals against Workday\'s native headcount report during initial setup to catch discrepancies early.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Workday connector data...\n');

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
  console.log('Clearing existing workday rows in child tables...');
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

  console.log(`Done — Workday: ${tablesCount} tables, ${issuesCount} issues`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
