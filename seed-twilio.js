// seed-twilio.js
// Populates Supabase with Fivetran Twilio connector data.

const { createClient } = require('@supabase/supabase-js');

const SUPABASE_URL = 'https://hmqdocjjejwdrpkqgdbd.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImhtcWRvY2pqZWp3ZHJwa3FnZGJkIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzU1MTQwMDQsImV4cCI6MjA5MTA5MDAwNH0.7t4wp7mLDDqbRy8yX757YTSPZDp2aCXOzj7QmuQ8z58';

const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);
const CONNECTOR_ID = 'twilio';

const connector = {
  id: CONNECTOR_ID,
  name: 'Twilio',
  category: 'communications',
  description: "Fivetran's Twilio connector syncs cloud communications data — SMS/MMS messages, voice calls, account metadata, and phone number inventory — via the Twilio REST API. Provides a complete record of messaging and calling activity for analytics and compliance.",
  what_it_does: 'Replicates message logs, call logs, account details, and phone number resources. Incremental sync based on date_created/date_updated fields. Supports both primary accounts and sub-accounts when parent account credentials are used.',
  useful_for: 'Communications analytics, message delivery rate monitoring, call volume and duration reporting, cost analysis by channel, compliance and audit trails for regulated industries (healthcare, finance), and operational dashboards for contact centers and notification systems.'
};

const connectorTables = [
  {
    connector_id: CONNECTOR_ID,
    table_name: 'MESSAGE',
    what_it_contains: 'SMS/MMS message records — SID, from/to phone numbers, body, status (queued/sent/delivered/failed/undelivered), direction (inbound/outbound), date_sent, price, error_code, num_segments.',
    why_it_matters: 'Primary table for messaging analytics — delivery rates, failure analysis, volume trends, and cost tracking. Most Twilio customers care about this table above all others.',
    key_callouts: 'Body field contains the actual message text — may include PII. Use Fivetran column blocking to exclude it if the customer has privacy requirements. Status field is the final status at time of sync — transient statuses (queued, sending) are overwritten. price is per-message cost in the account currency. num_segments > 1 for long messages split across multiple SMS segments.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'CALL',
    what_it_contains: 'Voice call records — SID, from/to phone numbers, status (completed/busy/no-answer/failed/canceled), direction, duration, start_time, end_time, price, forwarded_from.',
    why_it_matters: 'Call volume, duration, and outcome analytics. Essential for contact centers and sales teams using Twilio for voice.',
    key_callouts: 'duration is in seconds. price is the total call cost. direction values: inbound, outbound-api, outbound-dial. status = completed means the call connected — check duration to determine if it was meaningful.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'ACCOUNT',
    what_it_contains: 'Twilio account and sub-account records — SID, friendly name, status (active/suspended/closed), type (Full/Trial), date_created, owner_account_sid.',
    why_it_matters: 'Dimension table for multi-account Twilio setups. Large enterprises use sub-accounts to separate environments, departments, or clients.',
    key_callouts: 'owner_account_sid links sub-accounts to the parent. All message and call data references an account_sid — join here for account-level grouping and cost allocation.'
  },
  {
    connector_id: CONNECTOR_ID,
    table_name: 'PHONE_NUMBER',
    what_it_contains: 'Phone numbers owned by the account — phone number, friendly name, capabilities (SMS, MMS, voice, fax), address requirements, origin (twilio/hosted/ported).',
    why_it_matters: 'Inventory of Twilio phone numbers for capacity planning and number management. Useful for understanding which numbers are active and what capabilities they have.',
    key_callouts: 'capabilities object indicates which channels the number supports (sms, mms, voice, fax). Numbers with address_requirements = any or local need verified address info — important for compliance.'
  }
];

const knownIssues = [
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Message Volume Creates Very High MAR for High-Volume Senders',
    issue_preview: 'Customers sending millions of messages see unexpectedly large MAR bills',
    root_cause: 'Every SMS/MMS message Twilio sends or receives becomes a row in the MESSAGE table. High-volume senders (marketing platforms, notification systems, two-factor auth providers) can generate millions of messages per month. Each message is a Monthly Active Row, and the MESSAGE table often dominates total MAR.',
    impact: 'MAR costs can be 5-10x what the customer expected. A customer sending 2 million messages/month has at minimum 2 million MAR just from the MESSAGE table, before counting calls, accounts, or other tables.',
    resolution: 'During the sales cycle, always ask about monthly message volume. Calculate expected MAR before the customer connects: MESSAGE rows/month + CALL rows/month = baseline MAR. If volume is very high, discuss whether they need full message history or just recent data. Consider excluding historical messages beyond a certain date during initial sync.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Message Body Content May Contain PII Requiring Careful Schema Selection',
    issue_preview: 'The body column in MESSAGE syncs actual message text, which often contains personal data',
    root_cause: 'The Twilio API returns the full message body for every SMS/MMS. This frequently contains personally identifiable information — names, phone numbers, appointment details, account numbers, one-time passwords, and in healthcare contexts, protected health information (PHI).',
    impact: 'Syncing PII into the data warehouse creates compliance exposure under GDPR, HIPAA, CCPA, and other regulations. The customer may not realize Fivetran is replicating message content until after it is in their warehouse.',
    resolution: 'Proactively raise this during onboarding. Use Fivetran\'s column blocking feature to exclude the body column from the MESSAGE table if the customer does not need message content in their warehouse. For customers who need the content, ensure their warehouse has appropriate access controls and that their compliance team has approved the data flow.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Sub-Account Data Requires Parent Account Access',
    issue_preview: 'Connector only syncs the primary account unless parent credentials are used',
    root_cause: 'Twilio sub-accounts have their own API credentials, but those credentials only access that sub-account\'s data. To sync all sub-accounts in a single Fivetran connector, the parent (master) account credentials must be used. The connector then discovers and syncs all sub-accounts automatically.',
    impact: 'Customers who connect with sub-account credentials see only that sub-account\'s messages and calls, then wonder where the rest of their data is. They may create multiple connectors (one per sub-account) unnecessarily, increasing cost and management overhead.',
    resolution: 'During setup, ask if the customer uses Twilio sub-accounts. If yes, ensure they provide the parent account SID and auth token. One connector with parent credentials covers all sub-accounts. If they need to sync only specific sub-accounts, they can use individual sub-account credentials — but one connector per sub-account is required.'
  },
  {
    connector_id: CONNECTOR_ID,
    issue_title: 'Pricing and Cost Data Not Available via Standard Connector',
    issue_preview: 'Customers want cost analytics but per-message/call price fields may not be sufficient',
    root_cause: 'While the MESSAGE and CALL tables include a price field showing per-record cost, Twilio does not expose detailed pricing tiers, volume discounts, or aggregated billing data through the same API endpoints the connector uses. The price field reflects the list rate at the time of the transaction, not negotiated or committed pricing.',
    impact: 'Customers building cost analytics find that the per-record price field does not match their Twilio invoice due to volume discounts, committed-use pricing, or bundled plans. Total cost calculated from synced data may differ from the actual bill.',
    resolution: 'Explain that the price field is the per-transaction list rate and may not reflect negotiated discounts. For accurate cost reconciliation, the customer should export billing data directly from the Twilio console or use the Twilio Usage API separately. The synced price field is still useful for relative cost analysis and trend tracking.'
  }
];

async function main() {
  console.log('Seeding Twilio connector data...\n');

  const { error: ce } = await supabase.from('connectors').upsert({ ...connector, created_at: new Date().toISOString(), updated_at: new Date().toISOString() }, { onConflict: 'id' });
  if (ce) { console.error('Error:', ce); process.exit(1); }
  console.log('Upserted connector: Twilio');

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

  console.log('\nDone — Twilio: 4 tables, 4 issues');
}

main().catch(e => { console.error(e); process.exit(1); });
