// seed-bamboohr.js
// Populates Supabase with the Fivetran BambooHR connector data.
// Sources:
//   https://fivetran.com/docs/connectors/applications/bamboohr
//   https://fivetran.com/docs/connectors/applications/bamboohr/setup-guide
//   https://fivetran.com/docs/connectors/applications/bamboohr/troubleshooting
//
// Idempotent: upserts the connector row, deletes existing bamboohr
// child rows, then inserts fresh data. Re-running does not create duplicates.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_ID = 'bamboohr';

// ─── CONNECTOR RECORD ────────────────────────────────────────────────────────

const connector = {
  id: CONNECTOR_ID,
  name: 'BambooHR',
  category: 'hr',
  description: "Fivetran's BambooHR connector replicates employee data, time-off records, job history, and custom tables from BambooHR into your destination warehouse via the BambooHR REST API. Designed for mid-market companies, it provides a straightforward setup with API key authentication and automatic schema discovery of both standard and custom fields.",
  what_it_does: 'Syncs employee directory data, job information history, employment status changes, time-off requests and balances, and customer-defined custom tables via the BambooHR API. Handles standard fields (name, department, location, hire date) and custom fields defined in the BambooHR account. Supports incremental syncs using last-modified timestamps for efficient data transfer.',
  useful_for: 'Mid-market people analytics, headcount and turnover reporting, time-off utilization dashboards, employee lifecycle tracking, compensation analysis, department-level workforce planning, and blending HR data with finance or product usage data in a central warehouse.'
};

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'EMPLOYEE',
    what_it_contains: 'Core employee records — employee ID, name, email, department, division, location, job title, hire date, termination date, status (active/inactive), manager, pay rate, pay type.',
    why_it_matters: 'The primary person entity. All other BambooHR tables join back to EMPLOYEE via employee_id. Drives headcount, turnover, and demographic reporting.',
    key_callouts: 'Terminated employees remain in the table with status set to inactive and termination date populated. Custom fields defined in BambooHR appear as additional columns — the schema varies per account. Sensitive fields (SSN, date of birth) are only included if the API key has the appropriate access level.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'TIME_OFF',
    what_it_contains: 'Time-off requests — employee reference, request date, start/end dates, type (vacation, sick, personal), status (approved, denied, pending, cancelled), amount (hours or days), notes.',
    why_it_matters: 'Time-off utilization reporting, absence trend analysis, and capacity planning. Required for understanding PTO patterns by department, season, or tenure.',
    key_callouts: 'Only includes requests, not real-time balances. Balance calculations require joining with the time-off policy configuration, which may not be fully exposed via the API. Cancelled and denied requests are included — filter on status for accurate utilization metrics.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'JOB_INFO',
    what_it_contains: 'Job information history — employee reference, effective date, department, division, location, job title, reporting structure changes, pay group.',
    why_it_matters: 'Historical record of role changes. Required for promotion tracking, internal mobility analysis, department transfer reporting, and point-in-time headcount snapshots.',
    key_callouts: 'Each row represents a job info change event with an effective date. To get the current state, select the most recent record per employee. Multiple changes on the same effective date can occur (e.g., title change and department transfer together).'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'EMPLOYMENT_STATUS',
    what_it_contains: 'Employment status history — employee reference, effective date, status (active, inactive, terminated), termination type (voluntary, involuntary), termination reason.',
    why_it_matters: 'Turnover analysis, attrition rate calculations, and exit reason categorization. Distinguishing voluntary vs involuntary terminations is critical for retention strategy reporting.',
    key_callouts: 'Termination reason and type are only populated for terminated employees. Reason values are customer-configurable in BambooHR — expect inconsistent or missing values across orgs. Rehired employees will have multiple status rows showing the full employment lifecycle.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CUSTOM_TABLE',
    what_it_contains: 'Customer-defined tabular data — varies completely per BambooHR account. Common examples include equipment assignments, training records, emergency contacts, performance review scores, and stock option grants.',
    why_it_matters: 'Many BambooHR customers store business-critical data in custom tables that does not exist in any standard table. Ignoring custom tables can mean missing half the useful HR data.',
    key_callouts: 'Schema varies per account — column names and types are defined by the BambooHR admin. Fivetran auto-discovers custom tables but they must be enabled in the connector schema tab to sync. New custom tables added after initial setup require a schema reload to appear.'
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Custom Tables Vary Per Account — Schema Unpredictable',
    issue_preview: 'Custom table columns differ between BambooHR accounts, breaking shared dbt models',
    root_cause: 'BambooHR allows admins to create arbitrary custom tables with any column names and types. Two customers using BambooHR will have completely different custom table schemas. There is no standard schema for custom tables — each account defines its own.',
    impact: 'Shared dbt models or downstream analytics built for one customer\'s custom tables will fail when applied to another customer. Schema drift occurs when the BambooHR admin adds or renames custom table columns, causing sync errors or NULL columns in the warehouse.',
    resolution: 'Treat custom tables as account-specific and do not assume schema portability. Use Fivetran\'s schema change handling settings (allow_all, allow_columns, block_all) to control how new columns are handled. Recommend customers document their custom table schemas and notify their data team before making changes in BambooHR.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Terminated Employee Data Retention Policies',
    issue_preview: 'Terminated employee records disappear from syncs after BambooHR purges them',
    root_cause: 'BambooHR allows account admins to configure data retention policies that automatically purge terminated employee records after a defined period (e.g., 90 days, 1 year). Once purged from BambooHR, Fivetran can no longer see those records. If the destination uses hard deletes (rather than soft deletes), the rows are removed from the warehouse too.',
    impact: 'Historical headcount and turnover reports become inaccurate because terminated employees vanish from the dataset. Year-over-year comparisons break. Compliance teams that need termination records for audit trails lose access to the data.',
    resolution: 'Enable Fivetran\'s soft delete mode so purged records are marked as _fivetran_deleted = true rather than removed. Advise customers to set BambooHR retention periods longer than their historical reporting window. Build warehouse models that preserve terminated employee snapshots independently of the source retention policy.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Sensitive Field Access Requires Specific API Key Permissions',
    issue_preview: 'Salary, SSN, and other restricted fields return NULL despite existing in BambooHR',
    root_cause: 'BambooHR API keys inherit the access level of the user who created them. If the API key was created by a user without access to sensitive fields (compensation, SSN, date of birth, custom sensitive fields), those fields return NULL in the API response. Fivetran syncs the NULL values without error — there is no indication that the data was permission-blocked rather than genuinely empty.',
    impact: 'Compensation and sensitive demographic data appears to be missing. Customers troubleshoot for days before realizing it is a permissions issue. Reports built on these fields show incomplete data without any warning.',
    resolution: 'Create the API key using a BambooHR admin account with full access to all fields, or a dedicated integration user with explicitly granted access to every field the customer wants to sync. Test by calling the BambooHR API directly with the key and verifying sensitive fields return values. Document which access level the API key user has during setup.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Time-Off Balance Calculations Require Policy Context',
    issue_preview: 'PTO balances cannot be accurately calculated from the TIME_OFF table alone',
    root_cause: 'The TIME_OFF table contains requests (approved, denied, pending) but not the accrual rules, carryover policies, or starting balances defined in BambooHR time-off policies. Calculating a current PTO balance requires knowing the accrual rate, accrual frequency, cap, carryover limit, and policy effective dates — none of which are exposed via the standard API endpoints that Fivetran syncs.',
    impact: 'Customers expect to build PTO balance dashboards from the synced data and discover they can only see usage, not remaining balances. Attempting to calculate balances from requests alone produces incorrect numbers.',
    resolution: 'Set expectations that TIME_OFF provides utilization data, not balance data. For balance reporting, recommend using BambooHR\'s native time-off balance report or exporting balances via a separate scheduled report. If the customer has BambooHR API access to the time-off balance endpoint, a custom Fivetran function connector or webhook can supplement the standard connector.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding BambooHR connector data...\n');

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
  console.log('Clearing existing bamboohr rows in child tables...');
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

  console.log(`Done — BambooHR: ${tablesCount} tables, ${issuesCount} issues`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
