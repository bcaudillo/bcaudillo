// seed-google-sheets.js
// Populates Supabase with the Fivetran Google Sheets connector data.
// Source: https://fivetran.com/docs/connectors/files/google-sheets
//
// This script is idempotent: it upserts the connector row and deletes any
// existing google_sheets rows in child tables before inserting fresh data.
// Re-running will not create duplicates.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

const CONNECTOR_ID = 'google_sheets';

// ─── CONNECTOR RECORD ────────────────────────────────────────────────────────

const connector = {
  id: CONNECTOR_ID,
  name: 'Google Sheets',
  category: 'Spreadsheets',
  description: "Fivetran's Google Sheets connector is a fully managed integration that extracts data from a named range in a Google Sheets workbook and replicates it to a single table in your destination warehouse or data lake.",
  what_it_does: 'Each connection maps one named range to one destination table. The first row of the range becomes column headers, and Fivetran auto-detects column types on initial load, then widens (but never narrows) them on subsequent syncs.',
  useful_for: 'Great for manually maintained reference data, lookup tables, ops spreadsheets, and small business-user-owned datasets that need to land in the warehouse alongside system-of-record data.'
};

// ─── CONNECTOR TABLES ────────────────────────────────────────────────────────
// Google Sheets is unusual: each connection syncs ONE named range to ONE
// user-named destination table. There's no fixed schema to enumerate — the
// "table" is whatever the customer points it at. We capture the pattern.

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: '<named_range>',
    what_it_contains: 'One destination row per row in the Google Sheets named range. The first row of the range becomes the column headers in the destination table. Columns whose header cell is empty or whitespace-only are ignored.',
    why_it_matters: 'This is the only table each connection produces — a separate Fivetran connection is required for every named range you want to sync.',
    key_callouts: 'Column types are auto-detected on initial load. On subsequent syncs, types can only widen (e.g. INTEGER → TEXT), never narrow. A stray string in a numeric column will permanently widen the destination column to TEXT until a historical re-sync.'
  }
];

// ─── KNOWN ISSUES ────────────────────────────────────────────────────────────

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'HTTP 429 Too Many Requests',
    issue_preview: "Google's API is throttling the connector",
    root_cause: "The Google Sheets API has received too many requests in a given time window. This is unique to Google Sheets connectors and is triggered by Google's side, not Fivetran's.",
    impact: 'Sync fails or stalls temporarily. Data is not lost, but the sync cycle is delayed.',
    resolution: 'The issue usually resolves itself after a few minutes as the rate limit window rolls over. If it persists, reduce sync frequency or split large workbooks across multiple connections.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Column Types Only Widen, Never Narrow',
    issue_preview: 'A stray value permanently widens a column type',
    root_cause: 'On updates, Fivetran rescans the sheet and widens a column type if a wider value is found (e.g. a string in a numeric column promotes the column to TEXT). Fivetran never narrows a column type back to a stricter one, even after the offending value is removed.',
    impact: 'Downstream analytics break when a numeric column silently becomes TEXT. Casting and aggregation queries start failing.',
    resolution: 'Clean up the source data in Google Sheets, then trigger a historical re-sync in Fivetran to re-detect the column type from scratch.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'IMPORTRANGE Worksheets Do Not Sync Incrementally',
    issue_preview: 'Sheets built with IMPORTRANGE do not update on schedule',
    root_cause: "IMPORTRANGE does not update the target sheet's last-modified timestamp. Fivetran uses that timestamp to detect changes, so it never sees new data arriving via IMPORTRANGE.",
    impact: 'Data appears stale in the destination even though the source sheet shows current values.',
    resolution: 'Avoid IMPORTRANGE for sheets synced by Fivetran. If unavoidable, trigger manual syncs or restructure the workbook so the data lands directly in the synced named range.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Google Forms Submissions May Not Sync',
    issue_preview: 'Rows added via Google Forms can be missed',
    root_cause: "When a Google Sheet is updated by a linked Google Form submission, the file's last-modified timestamp is not always updated. Fivetran relies on that timestamp to decide whether to sync.",
    impact: 'New form responses may not appear in the destination until another (unrelated) edit triggers a timestamp update.',
    resolution: 'Trigger a manual sync after form submissions, or make a trivial edit to the sheet to refresh the last-modified timestamp.'
  }
];

// ─── MAIN ────────────────────────────────────────────────────────────────────

async function main() {
  console.log('Seeding Google Sheets connector data...\n');

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
  console.log('Clearing existing google_sheets rows in child tables...');
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

  console.log(`✅ Google Sheets: ${tablesCount} tables, ${issuesCount} issues`);
}

main().catch((err) => {
  console.error('Fatal error:', err);
  process.exit(1);
});
