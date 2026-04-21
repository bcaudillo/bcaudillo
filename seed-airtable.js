// seed-airtable.js
// Populates Supabase with Fivetran Airtable connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'airtable';

const connector = {
  id: CONNECTOR_ID,
  name: 'Airtable',
  category: 'productivity',
  description: "Fivetran's Airtable connector syncs no-code database data via the Airtable API. Each Airtable table syncs as its own destination table, preserving the user-defined schema including custom fields, linked records, and attachments.",
  what_it_does: 'Syncs all tables from selected Airtable bases. Each Airtable table becomes a destination table with columns matching user-defined fields. Supports text, number, date, single/multi-select, linked records, and attachment field types. Incremental sync.',
  useful_for: 'Centralizing operational data from Airtable bases, reporting on project trackers, inventory systems, CRM-lite setups, and any structured data managed in Airtable by business teams.'
};

const connectorTables = [
  { connector_id: CONNECTOR_ID, table_name: '(Dynamic — user-defined tables)', what_it_contains: 'Each Airtable table syncs as its own destination table. Columns match the fields defined in Airtable: text, numbers, dates, selects, linked records, attachments.', why_it_matters: 'Preserves the business team\'s data structure in the warehouse for analytics.', key_callouts: 'Table and column names come from Airtable — they may contain spaces and special characters. Linked record fields contain arrays of record IDs.' },
  { connector_id: CONNECTOR_ID, table_name: 'AIRTABLE_METADATA', what_it_contains: 'Base and table metadata — base ID, table ID, field definitions, field types.', why_it_matters: 'Schema documentation for understanding the Airtable data model.', key_callouts: 'Use to map field IDs to human-readable names and understand data types.' }
];

const knownIssues = [
  { connector_id: CONNECTOR_ID, issue_title: 'Schema Is Entirely User-Defined and Varies Per Base', issue_preview: 'No standard table names or column names', root_cause: 'Airtable bases are user-created. Table names, column names, and data types are whatever the user defined. Two customers using Airtable will have completely different schemas.', impact: 'Cannot build reusable dbt models across accounts. Every Airtable connector requires custom transformation logic.', resolution: 'Document the customer\'s Airtable schema during setup. Build customer-specific dbt models. Use the metadata table to understand field types programmatically.' },
  { connector_id: CONNECTOR_ID, issue_title: 'Linked Records Stored as Record ID Arrays', issue_preview: 'Foreign key relationships require self-joins on record IDs', root_cause: 'Airtable linked record fields contain arrays of Airtable record IDs (rec...) rather than human-readable values. Resolving linked records requires joining to the linked table on record ID.', impact: 'Queries are more complex than expected — linked fields show IDs instead of names without proper joins.', resolution: 'Join linked record fields to the target table using the Airtable record ID as the key. For multi-select linked records, use UNNEST/LATERAL FLATTEN to explode the array before joining.' },
  { connector_id: CONNECTOR_ID, issue_title: 'Formula, Rollup, and Lookup Fields Not Synced', issue_preview: 'Computed fields return empty or are missing', root_cause: 'Airtable formula, rollup, and lookup fields are computed server-side. The API may return current computed values but they are not reliably synced as they can change without a record update event.', impact: 'Derived fields analysts expect to see are missing or stale in the warehouse.', resolution: 'Recreate formula logic in SQL/dbt in the warehouse. Use the source fields that feed into formulas rather than depending on the computed values.' },
  { connector_id: CONNECTOR_ID, issue_title: 'API Rate Limits — 5 Requests Per Second', issue_preview: 'Strict rate limits cause slow syncs for large bases', root_cause: 'Airtable enforces a 5 requests/second rate limit per base. Large bases with many tables and thousands of records require many paginated API calls.', impact: 'Syncs are slow. Large bases (10k+ records across many tables) can take 30+ minutes per sync.', resolution: 'Expected behavior given Airtable API limits. Reduce sync frequency if freshness is not critical. Consider migrating high-volume data out of Airtable if sync speed is a problem.' }
];

async function main() {
  console.log('Seeding Airtable connector data...\n');
  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Airtable');
  await supabase.from('connector_tables').delete().eq('connector_id', CONNECTOR_ID);
  await supabase.from('connector_known_issues').delete().eq('connector_id', CONNECTOR_ID);
  for (const t of connectorTables) { const { error } = await supabase.from('connector_tables').insert({ ...t, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); if (error) console.error(`Error: ${t.table_name}`, error); else console.log(`  Table: ${t.table_name}`); }
  for (const i of knownIssues) { const { error } = await supabase.from('connector_known_issues').insert({ ...i, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }); if (error) console.error(`Error: ${i.issue_title}`, error); else console.log(`  Issue: ${i.issue_title}`); }
  console.log('\nDone — Airtable: 2 tables, 4 issues');
}
main().catch(e => { console.error(e); process.exit(1); });
