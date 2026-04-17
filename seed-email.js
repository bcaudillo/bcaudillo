// seed-email.js
// Populates Supabase with Fivetran Email connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'email';

const connector = {
  id: CONNECTOR_ID,
  name: 'Email',
  category: 'applications',
  description: "Fivetran's Email connector allows users to send CSV or other delimited files as email attachments to a Fivetran-assigned email address. The files are automatically parsed and loaded into the destination warehouse. Useful for vendors or partners who can only export data via email.",
  what_it_does: 'Provides a unique Fivetran-assigned email address. Any CSV, TSV, or other delimited file sent as an attachment to that address is automatically parsed and loaded into the destination. Supports multiple file formats and handles schema inference. Each unique file pattern becomes a separate destination table.',
  useful_for: 'Receiving vendor reports via email, partner data exchanges where API access is unavailable, manual data uploads from non-technical users, and bridging data from systems that only support email export.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: '<attachment_table>',
    what_it_contains: 'One table per unique attachment filename pattern — columns inferred from file headers.',
    why_it_matters: 'Each email attachment becomes a queryable table in your warehouse.',
    key_callouts: 'Schema inferred from first file. Subsequent files must match the schema or columns will widen. _file and _line are surrogate keys.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Attachments Must Be Delimited Files',
    issue_preview: 'Excel (.xlsx) and other binary formats are not supported',
    root_cause: 'The Email connector only parses plain-text delimited files (CSV, TSV, pipe-delimited). Binary formats like Excel (.xlsx, .xls), PDF, or compressed archives (.zip, .gz) are not supported and are silently ignored.',
    impact: 'Users send Excel files expecting them to load and nothing happens. No error notification is sent back to the sender.',
    resolution: 'Convert files to CSV before sending. Instruct senders to use "Save As CSV" in Excel. If Excel is the only option, use a different connector (Google Sheets, SFTP with preprocessing).'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Email Address Must Be Kept Confidential',
    issue_preview: 'Anyone with the address can send data to your warehouse',
    root_cause: 'The Fivetran-assigned email address has no authentication — any email sent to it with a valid attachment will be processed and loaded into the destination warehouse.',
    impact: 'If the address is shared publicly or leaked, unauthorized data can be injected into the warehouse. There is no sender verification or allowlist.',
    resolution: 'Treat the Fivetran email address as a secret. Only share it with trusted senders. If compromised, delete the connector and create a new one to get a new address. Monitor the _FIVETRAN_AUDIT table for unexpected files.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Schema Changes From Inconsistent File Formats',
    issue_preview: 'Column count or headers change between emails causing schema drift',
    root_cause: 'If different senders or reports use slightly different column layouts (extra columns, renamed headers, different order), Fivetran treats each variation as a schema change. Columns only widen, never narrow.',
    impact: 'Destination table accumulates extra columns over time. Some rows have NULLs in columns that did not exist in their source file.',
    resolution: 'Standardize the file format across all senders. Provide a template. If schema drift has occurred, trigger a historical re-sync after cleaning up the source files.'
  }
];

async function main() {
  console.log('Seeding Email connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Email');

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

  console.log('\nDone — Email: 1 table, 3 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
