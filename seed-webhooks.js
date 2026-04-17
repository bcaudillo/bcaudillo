// seed-webhooks.js
// Populates Supabase with Fivetran Webhooks connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'webhooks';

const connector = {
  id: CONNECTOR_ID,
  name: 'Webhooks',
  category: 'applications',
  description: "Fivetran's Webhooks connector provides a unique HTTPS endpoint that accepts JSON payloads from any source. It is a push-based connector — instead of Fivetran pulling data, external systems push events to the Fivetran endpoint. Payloads are parsed, flattened, and loaded into the destination warehouse.",
  what_it_does: 'Provides a unique HTTPS URL endpoint. Accepts POST requests with JSON payloads. Automatically flattens nested JSON into relational columns. Handles schema evolution as new fields appear. Supports authentication via shared secret or API key header validation.',
  useful_for: 'Real-time event ingestion from any system with webhook support, custom application event streams, IoT data ingestion, payment processor notifications, and any push-based integration where Fivetran does not have a dedicated connector.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'EVENT',
    what_it_contains: 'One row per webhook payload received — flattened JSON fields as columns, plus _fivetran_synced timestamp.',
    why_it_matters: 'The main table containing all received webhook events. Schema expands as new JSON fields arrive.',
    key_callouts: 'Nested JSON objects are flattened with underscore separators (e.g. data.user.email becomes data_user_email). Arrays create child tables.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: '<nested_array_tables>',
    what_it_contains: 'Child tables created for any JSON array fields — one row per array element linked to parent event.',
    why_it_matters: 'Arrays cannot be stored in a single relational column, so Fivetran normalizes them into separate tables.',
    key_callouts: 'Join back to EVENT via the auto-generated foreign key. Table name follows the JSON path.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Schema Expands Uncontrollably With Dynamic JSON',
    issue_preview: 'Destination table grows hundreds of columns from varied payloads',
    root_cause: 'Every unique JSON key path in any received payload becomes a permanent column in the destination. If the source system sends dynamic or inconsistent JSON structures (e.g. custom fields, variable metadata), the destination table schema grows unbounded.',
    impact: 'Destination tables with hundreds or thousands of columns. Query performance degrades. Warehouse storage costs increase. Most columns are sparse (NULL for most rows).',
    resolution: 'Standardize the JSON payload format at the source before sending to the webhook. Use a consistent schema. If schema has already exploded, consider creating a new connector with a new endpoint and dropping the old schema.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Webhook Endpoint URL Must Be Kept Secret',
    issue_preview: 'Anyone with the URL can push data into your warehouse',
    root_cause: 'The webhook endpoint URL is the only barrier to entry. While Fivetran supports shared secret validation, if the URL is leaked without proper authentication configured, anyone can POST data to it.',
    impact: 'Unauthorized or malicious data injected into the warehouse. No sender verification without authentication configured.',
    resolution: 'Always configure shared secret or API key authentication on the webhook. Treat the endpoint URL as a secret. Monitor incoming events for unexpected sources. Rotate the endpoint if compromised.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Payload Size Limit and Rate Limits',
    issue_preview: 'Large payloads or high-frequency events are rejected',
    root_cause: 'Fivetran enforces a maximum payload size per webhook request and rate limits on the number of requests per second. Exceeding either causes the request to be rejected with a 429 or 413 HTTP response.',
    impact: 'Events are lost if the source system does not retry on failure. High-volume event streams may drop data during bursts.',
    resolution: 'Keep payloads under the size limit (check Fivetran docs for current limits). Implement retry logic with exponential backoff in the sending system. For very high-volume streams, consider batching events or using a dedicated connector instead.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'No Historical Backfill — Push-Only',
    issue_preview: 'Cannot retroactively load historical events',
    root_cause: 'Webhooks are push-based and real-time only. There is no mechanism for Fivetran to pull historical data — only events received after the connector is created are captured.',
    impact: 'No historical data in the warehouse. Cannot backfill events that occurred before the connector was set up.',
    resolution: 'Set up the webhook connector before going live with the integration. For historical data, use a separate bulk load (CSV upload, SFTP, or API-based connector) to backfill, then switch to webhooks for ongoing events.'
  }
];

async function main() {
  console.log('Seeding Webhooks connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Webhooks');

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

  console.log('\nDone — Webhooks: 2 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
